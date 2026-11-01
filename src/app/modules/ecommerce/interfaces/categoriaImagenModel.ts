import { ImagenProgramadaModel } from './imagenProgramadaModel';

/**
 * Lo propio de las imágenes DE UNA CATEGORÍA.
 *
 * La imagen en sí es la misma que la de una marca y vive en
 * [[imagenProgramadaModel]]; aquí sólo está el envoltorio que las trae y la
 * cuenta que pinta la chapita del árbol.
 */

/** Las imágenes de UNA categoría, como las devuelve el servidor. */
export interface ImagenesDeCategoria {
  categoria_id: number;
  en_papelera: number;
  imagenes: ImagenProgramadaModel[];
}

/** Cuántas tiene cada categoría: es la chapita del árbol. */
export interface CuentaImagenes {
  categoria_id: number;
  cuantas: number;
  sale_alguna: boolean;
}
