/**
 * España Motos: un micro-sitio dentro de la tienda, con su portada
 * (/espana-motos) y su catálogo (/espana-motos/catalogo).
 */

/** Una pestaña del catálogo: agrupa categorías del catálogo de verdad. */
export interface PestanaMotosModel {
  id: number;
  nombre: string;
  /** Los ids de las categorías que agrupa */
  categorias: number[];
  /** Sus nombres, para poder enseñarlas sin pedir el catálogo entero */
  categorias_nombres: { id: number; nombre: string }[];
  orden: number;
  activo: boolean;
}

/** Una marca que se vende ahí: sale de inventarios.marcas. */
export interface MarcaMotosModel {
  id: number;
  marca_id: number;
  nombre: string;
  orden: number;
  activo: boolean;
}

export interface EspanaMotosModel {
  /**
   * Apagada, la tienda responde 404 en /espana-motos. Sirve para montarla
   * entera antes de enseñarla.
   */
  publicada: boolean;

  banner_visible: boolean;
  /** La clave de la galería del banner, para saber dónde subir sus imágenes */
  galeria_banner?: string | null;

  fondo_visible: boolean;
  /** Sólo el nombre del fichero; la dirección viene en `fondo_imagen_url` */
  fondo_imagen?: string | null;
  fondo_imagen_url?: string | null;
  fondo_titulo?: string | null;
  fondo_subtitulo?: string | null;

  tarjetas_visible: boolean;
  galeria_tarjetas?: string | null;

  marcas_visible: boolean;

  pestanas: PestanaMotosModel[];
  marcas: MarcaMotosModel[];

  updated_at?: string;
  updated_by?: string | null;
}
