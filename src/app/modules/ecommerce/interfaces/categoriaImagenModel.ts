/**
 * Una imagen programada de una categoría (ecommerce.categorias_imagenes).
 *
 * Una categoría puede tener varias preparadas —la de siempre, la de navidad,
 * la del día de la madre— y cada una con sus fechas. La tienda enseña la que
 * toque hoy, sin que nadie se acuerde de cambiarla.
 */
export interface CategoriaImagenModel {
  id: number;
  /** SÓLO EL NOMBRE del fichero: es lo que se guarda. */
  imagen: string;
  /** La dirección, armada por el servidor al leer. No se guarda en ninguna parte. */
  imagen_url: string | null;
  /** Para reconocerla en la lista: «Navidad 2026». */
  nombre: string | null;
  /** 'YYYY-MM-DDTHH:mm' o null (ilimitada). */
  desde: string | null;
  hasta: string | null;
  orden: number;
  activo: boolean;
  /** LA que se ve hoy en la tienda. Sólo puede serlo una. */
  sale_ahora: boolean;
  /** Vigente, pero detrás de otra que manda por orden. */
  tapada: boolean;
  estado: EstadoImagenCategoria;
  updated_at: string | null;
  updated_by: string | null;
}

export type EstadoImagenCategoria = 'vigente' | 'apagada' | 'programada' | 'terminada';

export interface ImagenesDeCategoria {
  categoria_id: number;
  en_papelera: number;
  imagenes: CategoriaImagenModel[];
}

export interface ImagenCategoriaEnPapelera {
  id: number;
  imagen: string;
  imagen_url: string | null;
  nombre: string | null;
  deleted_at: string;
  deleted_by: string | null;
}

/** Cuántas tiene cada categoría: es la chapita del árbol. */
export interface CuentaImagenes {
  categoria_id: number;
  cuantas: number;
  sale_alguna: boolean;
}

/**
 * Cómo se enseña cada estado. En un sitio y no repartido por las plantillas,
 * que es como acaban diciendo cosas distintas.
 */
export const ESTADOS_IMAGEN_CATEGORIA:
    Record<EstadoImagenCategoria, { texto: string; clase: string; icono: string; ayuda: string }> = {
  vigente: {
    texto: 'En fecha',
    clase: 'chip-ok',
    icono: 'fa-calendar-check',
    ayuda: 'Sus fechas incluyen hoy.',
  },
  apagada: {
    texto: 'Apagada',
    clase: 'chip-muted',
    icono: 'fa-eye-slash',
    ayuda: 'No sale aunque esté en fecha.',
  },
  programada: {
    texto: 'Programada',
    clase: 'chip-info',
    icono: 'fa-clock',
    ayuda: 'Todavía no empieza: saldrá sola el día que toque.',
  },
  terminada: {
    texto: 'Terminada',
    clase: 'chip-warn',
    icono: 'fa-hourglass-end',
    ayuda: 'Ya pasó su fecha de fin.',
  },
};
