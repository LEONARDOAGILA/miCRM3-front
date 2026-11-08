/**
 * Las páginas de texto de la tienda (ecommerce.paginas_informativas).
 *
 * Son los términos y condiciones, las políticas de datos, las garantías y
 * «Conócenos»: texto que cambia dos veces al año pero que tiene que poder
 * cambiarse sin tocar código, porque lo escribe legal y lleva fecha.
 *
 * NO HAY CARPETAS: se quitaron el 07/11/2026. Es un CRUD de páginas, y en la
 * tienda salen todas juntas en /documentos, en el orden de `orden`.
 */

/** Un desplegable del final de la página (preguntas frecuentes y similares). */
export interface DesplegablePagina {
  titulo: string;
  /** HTML del editor */
  texto: string;
  /** Dirección completa del PDF, o null. La arma el servidor al leer. */
  pdf?: string | null;
  /** El texto del botón de descarga; sólo tiene sentido con pdf */
  boton?: string | null;
}

/** De qué lado de la página se pinta la imagen. */
export type LadoImagenPagina = 'izquierda' | 'derecha';

/**
 * El contenido de una página.
 *
 * OJO CON LAS DIRECCIONES. `imagen` y `pdf` llegan del servidor COMPLETAS
 * («http://…/ecommerce/publico/imagenes/x.png») y se mandan igual; en la base
 * se guarda sólo el nombre del fichero y es el servidor quien pone y quita el
 * resto. Aquí no hay que armar ninguna dirección a mano.
 */
export interface ContenidoPagina {
  /** HTML del editor */
  texto: string;
  imagen?: string | null;
  /** Qué se lee en voz alta si la imagen no carga; sólo con imagen */
  imagen_alt?: string | null;
  /**
   * A qué lado del texto va la imagen en la tienda; sólo con imagen.
   *
   * Sin decir nada, la base guarda «derecha»: se lee primero el texto, que es
   * a lo que se entra, y la foto acompaña.
   */
  imagen_lado?: LadoImagenPagina | null;
  /** Dirección completa del PDF de la página, o null. */
  pdf?: string | null;
  /**
   * Cómo se llamaba el fichero que subieron («Términos 2026.pdf»).
   *
   * El nombre del disco lleva la fecha y unos caracteres al azar, y no se le
   * puede enseñar a nadie. Sólo con pdf: sin fichero, la base lo descarta.
   */
  pdf_nombre?: string | null;
  /**
   * Lo que se lee al lado del icono del documento en la tienda:
   * «Para mayor información, ver el PDF».
   *
   * Vacío, la tienda saca el botón «Descargar PDF» de siempre. Sólo con pdf.
   */
  pdf_texto?: string | null;
  desplegables?: DesplegablePagina[];
}

export interface PaginaInformativaModel {
  id: number;
  /**
   * La dirección por la que la pide la tienda: /paginas/{clave}.
   *
   * SE FIJA AL CREAR Y NO SE CAMBIA. El menú del encabezado guarda esta misma
   * clave en sus enlaces, y fuera hay enlaces que no controlamos.
   */
  clave: string;
  titulo: string;
  /** No viene en el listado: son cientos de kB de HTML que ahí nadie mira */
  contenido?: ContenidoPagina;
  /** El orden en que salen en /documentos. Se cambia arrastrando en la lista. */
  orden: number;
  activo: boolean;
  /** Sólo en el listado: la dirección de la imagen, para la miniatura. */
  imagen?: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

/** Una fila de la papelera. */
export interface FilaPapeleraPagina {
  id: number;
  /** El título de la página */
  texto: string;
  /** Su clave */
  detalle?: string | null;
  deleted_at: string;
  deleted_by?: string | null;
}
