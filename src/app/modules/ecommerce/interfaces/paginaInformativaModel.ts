/**
 * Las páginas de texto de la tienda (ecommerce.paginas_informativas).
 *
 * Son los términos y condiciones, las políticas de datos, las garantías y
 * «Conócenos»: texto que cambia dos veces al año pero que tiene que poder
 * cambiarse sin tocar código, porque lo escribe legal y lleva fecha.
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
  pdf?: string | null;
  desplegables?: DesplegablePagina[];
}

/** Una carpeta: agrupa las páginas que salen juntas en /documentos. */
export interface GrupoPaginaModel {
  id: number;
  nombre: string;
  orden: number;
  /** Cuántas páginas vivas cuelgan de ella */
  paginas: number;
  deleted_at?: string | null;
  deleted_by?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
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
  grupo_id?: number | null;
  grupo_nombre?: string | null;
  /** No viene en el listado: son cientos de kB de HTML que ahí nadie mira */
  contenido?: ContenidoPagina;
  /**
   * La tienda le tiene una dirección propia (/politicas-de-garantia).
   * No se borra ni se mete en carpeta: se oculta.
   */
  fija: boolean;
  orden: number;
  activo: boolean;
  deleted_at?: string | null;
  deleted_by?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

/** Lo que devuelve allPaginasInformativas: la pantalla necesita las dos cosas. */
export interface ListadoPaginasInformativas {
  paginas: PaginaInformativaModel[];
  grupos: GrupoPaginaModel[];
}

/**
 * Una fila de la papelera.
 *
 * ES UN SOLO CESTO para páginas y carpetas, a diferencia del resto de la casa:
 * en la pantalla se ve como una sola lista de dos niveles —la carpeta y
 * debajo las páginas que se fueron con ella— y partirla en dos obligaría a
 * pintar dos listas que el usuario ve como una.
 */
export interface FilaPapeleraPagina {
  tipo: 'carpeta' | 'pagina';
  id: number;
  /** El nombre de la carpeta o el título de la página */
  texto: string;
  /** La clave, en las páginas */
  detalle?: string | null;
  /** De qué carpeta venía, en las páginas */
  grupo_id?: number | null;
  deleted_at: string;
  deleted_by?: string | null;
}

/** Una carpeta con sus páginas dentro, que es como se pinta la lista. */
export interface CarpetaEnPantalla {
  grupo: GrupoPaginaModel | null;   // null = las fijas, que no tienen carpeta
  paginas: PaginaInformativaModel[];
}
