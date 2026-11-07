// Los cuerpos de la tienda: las páginas hechas de secciones.
//
// Uno es el PRINCIPAL y sale al abrir la tienda; los demás se llegan por su
// dirección. Si un cuerpo apunta a una categoría o a una marca, el clic en
// ella —en el menú, en las destacadas, en el mosaico— lleva a su página en vez
// de al catálogo filtrado.

/** A qué apunta. Lo resuelve el servidor, la pantalla no lo calcula. */
export type DestinoCuerpo = 'inicio' | 'categoria' | 'marca' | 'libre';

export interface CuerpoModel {
  id: number;
  nombre: string;
  /** Su dirección en la tienda: «movilidad» → /movilidad */
  ruta: string;
  principal: boolean;
  /** La dirección de verdad, armada por el servidor: '/' si es el principal. */
  url: string;
  destino: DestinoCuerpo;
  categoria_id: number | null;
  /** La ruta entera de la categoría («Vehículos > Movilidad»). */
  categoria: string | null;
  marca_id: number | null;
  marca: string | null;
  /** Lo que lee el visitante arriba de la página. Vacío, no se pinta nada. */
  titulo: string | null;
  descripcion: string | null;
  /**
   * EL FONDO DE ESA PÁGINA, «#rrggbb». null = blanco, que es lo de siempre.
   *
   * Es de la página, no de la tienda: el color de los botones y del encabezado
   * se elige una sola vez en «Encabezado» y vale para todas.
   */
  fondo: string | null;
  /** Debajo de las secciones, la rejilla de su categoría o su marca. */
  catalogo: boolean;
  activo: boolean;
  /** Cuántas secciones tiene, para decirlo en la tarjeta. */
  secciones: number;
  estado: 'principal' | 'visible' | 'oculto' | 'papelera';
  deleted_at: string | null;
  deleted_by: string | null;
  updated_at: string | null;
  updated_by: string | null;
}

/**
 * Lo que se elige en el formulario.
 *
 * El principal no sale en la lista: no se elige, se marca con su botón, y un
 * cuerpo amarrado a una categoría no puede ser la entrada de la tienda.
 */
export const DESTINOS: { valor: Exclude<DestinoCuerpo, 'inicio'>; texto: string; ayuda: string }[] = [
  { valor: 'categoria', texto: 'Una categoría',
    ayuda: 'El clic en esa categoría lleva aquí en vez de al catálogo filtrado.' },
  { valor: 'marca',     texto: 'Una marca',
    ayuda: 'El clic en esa marca —el logo, el menú— lleva aquí.' },
  { valor: 'libre',     texto: 'Nada: una página suelta',
    ayuda: 'Se llega sólo por su dirección, o por donde tú la enlaces.' },
];

/** De dónde saca una sección lo que enseña. */
export type AlcanceSeccion = 'tienda' | 'cuerpo';

export const ALCANCES: { valor: AlcanceSeccion; texto: string }[] = [
  { valor: 'tienda', texto: 'De toda la tienda' },
  { valor: 'cuerpo', texto: 'De esta página' },
];

/**
 * Qué secciones miran el alcance.
 *
 * Las de banner y las de productos enseñan lo que tienen dentro, así que el
 * campo no les dice nada y no se les pregunta.
 */
export function miraElAlcance(clave: string): boolean {
  return clave === 'categorias_destacadas' || clave === 'mosaico' || clave === 'marcas';
}
