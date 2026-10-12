/**
 * La letra y el tamaño en un editor de ngx-editor.
 *
 * Su barra no los trae: ngx-editor no tiene ni familia ni tamaño, así que son
 * marcas nuestras del esquema (ver esquemaNotas.ts) y el desplegable que las
 * pone va a mano. Esto es lo que ese desplegable necesita saber hacer.
 *
 * Vivía dentro de saveNota. Está aquí desde que «Qué se habló» es un editor
 * igual: lo mismo escrito dos veces es lo mismo hasta que alguien arregla una
 * sola.
 */

import { Editor } from 'ngx-editor';

/** Las que ofrece el desplegable de letra. */
export const TIPOGRAFIAS: { valor: string; nombre: string }[] = [
  // Corto porque el desplegable mide 130 px y el grupo ya se llama «Fuente»
  { valor: '', nombre: 'Letra' },
  { valor: 'Arial, Helvetica, sans-serif', nombre: 'Arial' },
  { valor: 'Calibri, Candara, Segoe UI, sans-serif', nombre: 'Calibri' },
  { valor: 'Cambria, Georgia, serif', nombre: 'Cambria' },
  { valor: "'Courier New', Courier, monospace", nombre: 'Courier New' },
  { valor: "Georgia, 'Times New Roman', serif", nombre: 'Georgia' },
  { valor: "'Segoe UI', Roboto, sans-serif", nombre: 'Segoe UI' },
  { valor: 'Tahoma, Verdana, sans-serif', nombre: 'Tahoma' },
  { valor: "'Times New Roman', Times, serif", nombre: 'Times New Roman' },
  { valor: "'Trebuchet MS', Tahoma, sans-serif", nombre: 'Trebuchet MS' },
  { valor: 'Verdana, Geneva, sans-serif', nombre: 'Verdana' },
];

/**
 * Los tamaños, en puntos y con los números de Word.
 *
 * En puntos y no en píxeles porque son los que la gente tiene en la cabeza
 * («ponlo en 12») y porque son los que valen en el papel.
 */
export const TAMANOS: { valor: string; nombre: string }[] = [
  { valor: '', nombre: 'Tam.' },
  ...[8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72]
    .map(n => ({ valor: `${n}pt`, nombre: String(n) })),
];

/**
 * Lee el valor de una marca donde está el cursor.
 *
 * Con texto seleccionado se usa marksAcross, que devuelve sólo las marcas que
 * valen para TODO el trozo: si se eligen dos palabras de distinta letra, el
 * desplegable se queda en blanco en vez de mentir con la de la primera.
 *
 * Sin selección manda storedMarks —lo que se acaba de elegir y aún no se ha
 * escrito— y, si no hay, las marcas de lo que está justo detrás del cursor.
 */
export function valorDeMarca(editor: Editor | undefined, nombre: string, atributo: string): string {
  const vista = editor?.view;
  if (!vista) { return ''; }

  const tipo = vista.state.schema.marks[nombre];
  if (!tipo) { return ''; }

  const { empty, $from, $to } = vista.state.selection;
  const marcas = empty
    ? (vista.state.storedMarks ?? $from.marks())
    : ($from.marksAcross($to) ?? []);

  return marcas.find(m => m.type === tipo)?.attrs[atributo] ?? '';
}

/**
 * Pone o quita una marca con atributos.
 *
 * No sirve el toggleMark de ProseMirror: mira sólo el tipo de marca y no sus
 * atributos, así que pasar de 12 a 14 puntos lo entendería como «ya tiene
 * tamaño, quítalo» y dejaría el texto sin tamaño en vez de cambiarlo. Hay que
 * quitar la de antes y poner la nueva, en ese orden y en la misma transacción,
 * para que un solo Ctrl+Z lo deshaga entero.
 *
 * Con attrs en null sólo se quita, que es lo que hace la opción en blanco del
 * desplegable.
 */
export function aplicarMarca(
  editor: Editor | undefined,
  nombre: string,
  attrs: Record<string, unknown> | null,
): void {
  const vista = editor?.view;
  if (!vista) { return; }

  const tipo = vista.state.schema.marks[nombre];
  if (!tipo) { return; }

  const { from, to, empty, $from } = vista.state.selection;
  const tr = vista.state.tr;

  if (empty) {
    // Sin nada seleccionado se cambia lo que se vaya a escribir a partir de
    // aquí, igual que al pulsar la negrita antes de escribir la palabra
    const previas = (vista.state.storedMarks ?? $from.marks()).filter(m => m.type !== tipo);
    tr.setStoredMarks(attrs ? previas.concat(tipo.create(attrs)) : previas);
  } else {
    tr.removeMark(from, to, tipo);
    if (attrs) { tr.addMark(from, to, tipo.create(attrs)); }
  }

  vista.dispatch(tr);
  vista.focus();
}

/** Dos familias son la misma aunque cambien las comillas o los espacios. */
export function normalizarFamilia(familia: string): string {
  return familia.replace(/["']/g, '').replace(/\s*,\s*/g, ',').trim().toLowerCase();
}

/** De «Georgia, 'Times New Roman', serif» se lee «Georgia». */
export function nombreDeFamilia(familia: string): string {
  return familia.split(',')[0].replace(/["']/g, '').trim() || familia;
}
