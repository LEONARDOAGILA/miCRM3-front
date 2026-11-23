import { ImagenProgramadaModel } from './imagenProgramadaModel';

/**
 * Lo propio de las imágenes DE UNA CATEGORÍA.
 *
 * La imagen en sí es la misma que la de una marca y vive en
 * [[imagenProgramadaModel]]; aquí sólo está el envoltorio que las trae y la
 * cuenta que pinta la chapita del árbol.
 */

/**
 * CADA CATEGORÍA TIENE DOS LISTAS, y las dos son imágenes programadas con
 * sus fechas, su orden y su papelera:
 *
 *   «imagen»  la de siempre: el círculo de las dos secciones de la portada
 *   «banner»  la tira ancha que sale arriba de /shop en esa categoría
 *
 * Es el mismo dato con el mismo comportamiento —por eso comparten tabla,
 * pantalla y modal—; lo único que cambia es dónde lo pinta la tienda.
 */
export type ListaDeImagenes = 'imagen' | 'banner';

/** Las imágenes de UNA categoría y de UNA de sus dos listas. */
export interface ImagenesDeCategoria {
  categoria_id: number;
  /** De cuál de las dos listas habla esto. */
  tipo: ListaDeImagenes;
  en_papelera: number;
  imagenes: ImagenProgramadaModel[];
}

/** Cuántas tiene cada categoría: es la chapita del árbol. */
export interface CuentaImagenes {
  categoria_id: number;
  cuantas: number;
  sale_alguna: boolean;
  /** Y lo mismo de los banners, que se cuentan aparte. */
  banners?: number;
  sale_banner?: boolean;
}
