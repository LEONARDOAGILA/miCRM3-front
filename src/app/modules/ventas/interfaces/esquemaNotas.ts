import { Schema } from 'prosemirror-model';
import { marks, nodes } from 'ngx-editor/schema';
import { tableNodes } from 'prosemirror-tables';

/**
 * El esquema del editor de notas: el de ngx-editor más tablas.
 *
 * ngx-editor trae párrafos, títulos, listas, cita, código e imagen, pero no
 * tablas: su esquema no las contempla, y lo que no está en el esquema el editor
 * lo tira —ni siquiera sobrevive pegar una tabla de Word—. Las tablas se
 * añaden con prosemirror-tables, que es el paquete estándar del mismo motor
 * (ProseMirror) sobre el que está hecho ngx-editor, así que encajan sin pelear
 * con nada.
 *
 * Un esquema es lo que decide qué puede existir dentro de una nota. Al
 * ampliarlo hay que acordarse de las otras tres puertas por donde pasa ese
 * contenido:
 *
 *   · el saneado del servidor, que tira las etiquetas que no conoce,
 *   · los estilos del visor y de la tarjeta, que lo pintan, y
 *   · la hoja de impresión.
 *
 * Si se añade algo aquí y se olvida alguna de ésas, el usuario lo escribe y
 * desaparece al guardar o sale sin formato.
 */

/**
 * Las celdas admiten bloques enteros, no sólo texto suelto: así dentro de una
 * celda caben varios párrafos o una lista, que es lo que la gente espera de una
 * tabla de Word.
 */
const nodosDeTabla = tableNodes({
  tableGroup: 'block',
  cellContent: 'block+',
  cellAttributes: {
    /**
     * El color de fondo de la celda.
     *
     * Va como atributo propio y no como estilo suelto para que sobreviva al
     * guardar y al volver a abrir: ProseMirror sólo conserva lo que el esquema
     * declara.
     */
    fondo: {
      default: null,
      getFromDOM: (dom: HTMLElement) => dom.style.backgroundColor || null,
      setDOMAttr: (valor, atributos) => {
        if (valor) {
          atributos['style'] = `${atributos['style'] ?? ''}background-color: ${valor};`;
        }
      },
    },
  },
});

export const ESQUEMA_NOTAS = new Schema({
  nodes: { ...nodes, ...nodosDeTabla } as any,
  marks,
});
