/**
 * Pegar en un editor de ngx-editor sin dejar imágenes rotas ni base64.
 *
 * El portapapeles trae las imágenes de dos formas muy distintas:
 *
 *   · Una captura sola (recortar la pantalla, copiar un fichero de imagen)
 *     llega como FICHERO en clipboardData.files.
 *   · Texto con imágenes dentro (copiar de Word, de un correo, de una página
 *     web) llega como HTML en text/html, con cada imagen en base64 dentro del
 *     propio src o apuntando a otro servidor. Ahí no hay ningún fichero.
 *
 * Las dos acaban igual: la imagen se sube al servidor y el src se cambia por
 * el nuestro. Dejarlas como vienen sería guardar una fila enorme —una imagen
 * en base64 pesa más que toda la nota— o una que se rompe el día que ese
 * servidor la borre, y que de paso le dice a ese servidor cuándo se lee.
 *
 * Esto vivía dentro de saveNota. Está aquí porque «Qué se habló» pasó a ser
 * un editor igual y pega lo mismo: tenerlo dos veces era pedir que un día
 * dejaran de hacer lo mismo.
 */

import { Editor } from 'ngx-editor';

/** Lo que hace falta del servicio de notas, sin atarse a su clase. */
export interface AlmacenDeImagenes {
  /** Sube un fichero y devuelve la url ya nuestra, o null si no se pudo. */
  subir(fichero: File): Promise<string | null>;
  /**
   * Se la pide al servidor, que sí puede ir a buscarla: el navegador no
   * puede, se lo impide el CORS del sitio de origen.
   */
  traerDeFuera(url: string): Promise<string | null>;
}

export interface ResultadoPegado {
  /** Cuántas imágenes de fuera no se pudieron traer y se quitaron. */
  ajenas: number;
}

/**
 * ¿Hay que hacerse cargo de este pegado?
 *
 * Devuelve el fichero o el HTML cuando sí, y null cuando es texto a secas, que
 * lo pega el editor como siempre.
 */
export function queSePega(ev: ClipboardEvent): { fichero: File } | { html: string } | null {
  const datos = ev.clipboardData;
  if (!datos) { return null; }

  const fichero = Array.from(datos.files ?? []).find(f => f.type.startsWith('image/'));
  if (fichero) { return { fichero }; }

  const html = datos.getData('text/html');
  if (html && /<img\b/i.test(html)) { return { html }; }

  return null;
}

/**
 * Pega HTML subiendo antes sus imágenes.
 *
 * Las que apuntan a otro sitio se intentan traer por el servidor; las que no
 * se dejan, se quitan y se cuentan, para poder avisar de qué falta.
 */
export async function pegarHtmlConImagenes(
  editor: Editor,
  almacen: AlmacenDeImagenes,
  html: string,
): Promise<ResultadoPegado> {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const imagenes = Array.from(doc.querySelectorAll('img'));
  let ajenas = 0;

  for (const img of imagenes) {
    const src = img.getAttribute('src') ?? '';

    if (src.startsWith('data:image/')) {
      const f = await ficheroDesdeDataUri(src);
      const url = f ? await almacen.subir(f) : null;
      if (url) { img.setAttribute('src', url); } else { img.remove(); }
      continue;
    }

    // Las nuestras ya están donde tienen que estar
    if (src.includes('archivoCliente/ver/')) { continue; }

    if (/^https?:\/\//i.test(src)) {
      const url = await almacen.traerDeFuera(src);
      if (url) { img.setAttribute('src', url); } else { img.remove(); ajenas++; }
      continue;
    }

    img.remove();
    ajenas++;
  }

  editor.commands.insertHTML(doc.body.innerHTML).focus().exec();
  return { ajenas };
}

/** Una imagen en base64 convertida en fichero, para poder subirla. */
export async function ficheroDesdeDataUri(uri: string): Promise<File | null> {
  try {
    const blob = await (await fetch(uri)).blob();
    const ext = (blob.type.split('/')[1] || 'png').replace('+xml', '').split(';')[0];
    return new File([blob], `pegada-${Date.now()}.${ext}`, { type: blob.type });
  } catch {
    return null;
  }
}

/** El aviso de las que no se pudieron traer, para decirlo igual en todas partes. */
export function avisoDeAjenas(cuantas: number): string {
  return `Se pegó el contenido, pero ${cuantas} imagen(es) no se pudieron traer: `
       + 'puede que ese sitio no las deje descargar. Guárdalas y vuelve a insertarlas.';
}
