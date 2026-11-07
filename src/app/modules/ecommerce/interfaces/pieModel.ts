/**
 * El pie de la tienda (ecommerce.pie + pie_columnas + pie_enlaces).
 *
 * Se parece al encabezado pero no es lo mismo: allí el segundo nivel es un
 * desplegable que se abre al pasar por encima y un enlace principal puede no
 * llevar dirección. Aquí la COLUMNA es un título, nunca un enlace, y todos
 * los enlaces de dentro necesitan dirección.
 */

/** Una red social del pie. */
export interface RedSocial {
  /** 'facebook', 'instagram', 'x'… en minúsculas */
  tipo: string;
  enlace?: string | null;
  activo: boolean;
}

export interface ConfigPie {
  redes: RedSocial[];
}

export interface EnlacePieModel {
  id: number;
  texto: string;
  /** Siempre la tiene: en el pie no hay enlaces que sólo desplieguen */
  enlace: string;
  icono?: string | null;
  /** No se escribe a mano: lo decide el servidor por la dirección */
  nueva_pestana: boolean;
  orden: number;
  activo: boolean;
}

/**
 * LA IMAGEN DE UNA COLUMNA, la que se pone en vez de la lista de enlaces.
 *
 * Con fichero, la tienda enseña la imagen y NO los enlaces; sin él, la lista
 * de siempre. Los enlaces no se borran: quitar la imagen los devuelve, así que
 * probar no cuesta nada.
 *
 * Llega siempre, también vacía: el texto y el enlace se pueden escribir antes
 * de subir el fichero y se guardan igual.
 */
export interface ImagenColumnaPie {
  /** El nombre del fichero en la base; null si no hay ninguna. */
  archivo: string | null;
  /** La dirección para verla, armada por el servidor. */
  url?: string | null;
  /** Qué se ve en ella, para quien no ve la pantalla. */
  alt: string | null;
  /** A dónde lleva al pincharla; null = no lleva a ningún sitio. */
  enlace: string | null;
  /** No se escribe a mano: lo decide el servidor por la dirección. */
  nueva_pestana: boolean;
}

export interface ColumnaPieModel {
  id: number;
  titulo: string;
  orden: number;
  activo: boolean;
  imagen: ImagenColumnaPie;
  enlaces: EnlacePieModel[];
}

export interface PieModel {
  config: ConfigPie;
  columnas: ColumnaPieModel[];
  updated_at?: string;
  updated_by?: string | null;
}

/** Una fila de la papelera del pie: columnas y enlaces en el mismo cesto. */
export interface FilaPapeleraPie {
  tipo: 'columna' | 'enlace';
  id: number;
  texto: string;
  /** La dirección, en los enlaces */
  detalle?: string | null;
  /** De qué columna venía */
  columna_id?: number | null;
  deleted_at: string;
  deleted_by?: string | null;
}

/**
 * Las redes que la tienda sabe pintar.
 *
 * LISTA CERRADA, por lo mismo que los iconos del menú: la tienda tiene el
 * dibujo de cada una. Escribir aquí «mastodon» dejaría un hueco sin icono.
 */
export const REDES_TIENDA: { id: string; name: string }[] = [
  { id: 'facebook',  name: 'Facebook' },
  { id: 'x',         name: 'X (Twitter)' },
  { id: 'instagram', name: 'Instagram' },
  { id: 'linkedin',  name: 'LinkedIn' },
  { id: 'tiktok',    name: 'TikTok' },
  { id: 'youtube',   name: 'YouTube' },
  { id: 'whatsapp',  name: 'WhatsApp' },
];
