/**
 * Una categoría del catálogo, vista desde la tienda
 * (inventarios.categorias + ecommerce.categorias_web).
 *
 * El árbol es de Inventarios. Lo único que vive en ecommerce es lo que la
 * tienda hace distinto: ocultarla y llamarla de otra forma.
 */
export interface CategoriaWebModel {
  id: number;
  padre_id?: number | null;
  nivel: number;
  orden: number;

  /** Con el que se enseña en la tienda: el de la web si lo tiene, si no el del catálogo */
  nombre: string;
  /** El de Inventarios, para poder compararlos */
  nombre_catalogo: string;
  /** El alternativo, o null si se usa el del catálogo */
  nombre_web?: string | null;

  /** Apagada a mano: ella y todo lo que cuelgue de ella dejan de salir */
  oculta: boolean;

  /**
   * Marcada a dedo para los círculos de «Categorías destacadas» de la
   * portada. El mosaico NO la mira: ése lo llena cualquiera con imagen.
   */
  destacada: boolean;

  /**
   * En qué puesto sale entre los círculos. Nulo = recién marcada, va al
   * final; así marcar una no mueve a las que ya estaban puestas.
   */
  destacada_orden?: number | null;
  /** Las de transacción son donde cuelgan los productos */
  es_transaccion: boolean;
  activo: boolean;

  /**
   * POR QUÉ sale o no sale. Es lo que hace útil la pantalla: cada motivo se
   * arregla en un sitio distinto.
   *
   *  visible                    sale en la tienda
   *  oculta                     la apagaste aquí
   *  oculta_por_padre           alguna de arriba está apagada
   *  inactiva                   está inactiva en el catálogo
   *  sin_categorias_de_producto no tiene ninguna de transacción debajo
   */
  estado: 'visible' | 'oculta' | 'oculta_por_padre' | 'inactiva' | 'sin_categorias_de_producto';
}

/** Lo que se lee en la etiqueta de estado y lo que hay que hacer con ella. */
export const ESTADOS_CATEGORIA: Record<string, { texto: string; ayuda: string; clase: string }> = {
  visible: {
    texto: 'Se ve',
    ayuda: 'Sale en el menú de la tienda y en los filtros.',
    clase: 'chip-ok',
  },
  oculta: {
    texto: 'Oculta',
    ayuda: 'La apagaste aquí. Enciéndela para que vuelva a salir.',
    clase: 'chip-muted',
  },
  oculta_por_padre: {
    texto: 'Oculta por su padre',
    ayuda: 'Alguna categoría de arriba está apagada; enciéndela a ella.',
    clase: 'chip-muted',
  },
  inactiva: {
    texto: 'Inactiva',
    ayuda: 'Está inactiva en el catálogo. Se arregla en Inventarios → Categorías.',
    clase: 'chip-aviso',
  },
  sin_categorias_de_producto: {
    texto: 'Sin productos debajo',
    ayuda: 'No tiene ninguna categoría de transacción visible: un menú que se abre y no lleva a ningún sitio. Se arregla en Inventarios → Categorías.',
    clase: 'chip-aviso',
  },
};
