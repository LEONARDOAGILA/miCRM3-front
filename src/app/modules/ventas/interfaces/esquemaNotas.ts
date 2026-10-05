import { MarkSpec, Schema } from 'prosemirror-model';
import { marks, nodes } from 'ngx-editor/schema';
import { tableNodes } from 'prosemirror-tables';

/**
 * El esquema del editor de notas: el de ngx-editor más tablas y tipografía.
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

// ================================================================
// TIPOGRAFÍA Y TAMAÑO
// ================================================================

/**
 * Las dos cosas de Word que no tiene ngx-editor: elegir la letra y su tamaño.
 *
 * Van como marcas (lo que se aplica a un trozo de texto, igual que la negrita)
 * y no como atributos del párrafo, porque en Word se cambia la letra de una
 * palabra suelta, no de todo el renglón.
 *
 * Las dos viajan dentro del atributo `style` de un <span>, que es lo que
 * entiende cualquier sitio donde esta nota se vuelva a mostrar: el visor, la
 * tarjeta de la lista, la hoja de impresión y el correo. Por eso mismo el valor
 * se sanea aquí y otra vez en el servidor (ver limpiarHtml): un `style` que
 * entra tal cual es una rendija para colar css ajeno.
 */

/**
 * Deja un valor en condiciones de ir dentro de un `style`.
 *
 * Fuera el punto y coma —con el que se colarían más declaraciones de las
 * pedidas— y los paréntesis, que son la puerta de `url(...)`. Las comillas se
 * quedan: «'Times New Roman'» las necesita para ser una sola familia.
 */
const valorSeguro = (valor: unknown): string =>
  String(valor ?? '')
    .replace(/[;(){}<>\\]/g, '')
    .trim()
    .slice(0, 120);

/** Un tamaño es un número con unidad y nada más. */
const TAMANO_VALIDO = /^\d{1,3}(?:\.\d+)?(?:px|pt|em|rem|%)$/;

/**
 * La familia de letra.
 *
 * El parseDOM lee cualquier font-family, no sólo las de la lista del
 * desplegable: así se conserva la letra de lo que se pega de Word o de una
 * página —que es lo que hace Word al pegar «manteniendo el formato de
 * origen»— y, sobre todo, así vuelve a cargar bien la nota que ya se guardó.
 */
const tipografia: MarkSpec = {
  attrs: { familia: { default: null } },
  parseDOM: [{
    style: 'font-family',
    getAttrs: (valor) => {
      const familia = valorSeguro(valor);
      // false = esta regla no aplica, en vez de una marca vacía que ensucia
      return familia ? { familia } : false;
    },
  }],
  toDOM: (marca) => ['span', { style: `font-family: ${marca.attrs['familia']};` }, 0],
};

/** El tamaño de letra, en las mismas unidades que traiga el origen. */
const tamano: MarkSpec = {
  attrs: { tamano: { default: null } },
  parseDOM: [{
    style: 'font-size',
    getAttrs: (valor) => {
      const medida = valorSeguro(valor).replace(/\s+/g, '').toLowerCase();
      // Word pega «11.0pt» y una página «13px»; «larger» o «inherit» no sirven
      return TAMANO_VALIDO.test(medida) ? { tamano: medida } : false;
    },
  }],
  toDOM: (marca) => ['span', { style: `font-size: ${marca.attrs['tamano']};` }, 0],
};

export const ESQUEMA_NOTAS = new Schema({
  nodes: { ...nodes, ...nodosDeTabla } as any,
  marks: { ...marks, tipografia, tamano } as any,
});
