import { PaginaDeCategoria } from './categoriaWebModel';
import { ImagenProgramadaModel } from './imagenProgramadaModel';

/**
 * Una marca del catálogo, vista desde la tienda
 * (inventarios.marcas + ecommerce.marcas_web).
 *
 * El catálogo es de Inventarios. Lo único que vive en ecommerce es lo que la
 * tienda hace distinto: ocultarla, llamarla de otra forma y ponerla en su
 * sitio dentro de «Nuestras marcas».
 */
export interface MarcaWebModel {
  id: number;

  /** Con el que se enseña en la tienda: el de la web si lo tiene, si no el del catálogo */
  nombre: string;
  /** El de Inventarios, para poder compararlos */
  nombre_catalogo: string;
  /** El alternativo, o null si se usa el del catálogo */
  nombre_web?: string | null;

  /** El logo del catálogo: SÓLO EL NOMBRE del fichero (vive en img/marcas) */
  logo: string | null;
  /** Su dirección, armada por el servidor al leer */
  logo_url: string | null;

  /** Apagada a mano: deja de salir en la tienda */
  oculta: boolean;
  /** Activa en el catálogo de Inventarios */
  activo: boolean;

  /** Su sitio en «Nuestras marcas». Nulo = al final */
  orden_web?: number | null;

  /**
   * Marcada para las tarjetas de «Marcas en promoción» de la portada.
   *
   * ES OTRA SECCIÓN que «Nuestras marcas»: una marca puede estar en las dos,
   * en una o en ninguna. Funciona igual que la promoción de las categorías y
   * en la tienda se pinta con los mismos carteles.
   */
  promocion: boolean;

  /** En qué puesto sale entre las tarjetas. Nulo = al final. */
  promocion_orden?: number | null;

  /**
   * POR QUÉ sale o no sale. Más simple que el de las categorías: una marca
   * no cuelga de nadie.
   *
   *  visible   sale en la tienda
   *  oculta    la apagaste aquí
   *  inactiva  está inactiva en el catálogo
   */
  /** Su página en la tienda, si la tiene. Se administra en «Cuerpos de la tienda». */
  cuerpo?: PaginaDeCategoria | null;

  estado: 'visible' | 'oculta' | 'inactiva';
}

/** Lo que se lee en la etiqueta de estado y qué hay que hacer con ella. */
export const ESTADOS_MARCA: Record<string, { texto: string; ayuda: string; clase: string }> = {
  visible: {
    texto: 'Se ve',
    ayuda: 'Sale en «Nuestras marcas» y en los filtros de la tienda.',
    clase: 'chip-ok',
  },
  oculta: {
    texto: 'Oculta',
    ayuda: 'La apagaste aquí. Enciéndela para que vuelva a salir.',
    clase: 'chip-muted',
  },
  inactiva: {
    texto: 'Inactiva',
    ayuda: 'Está inactiva en el catálogo. Se arregla en Inventarios → Marcas.',
    clase: 'chip-aviso',
  },
};

/** Las imágenes de UNA marca, como las devuelve el servidor. */
export interface ImagenesDeMarca {
  marca_id: number;
  en_papelera: number;
  imagenes: ImagenProgramadaModel[];
}

/** Cuántas tiene cada marca: es la chapita de la lista. */
export interface CuentaImagenesMarca {
  marca_id: number;
  cuantas: number;
  sale_alguna: boolean;
}
