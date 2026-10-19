/** Categoría (inventarios.categorias): lo que devuelven inventarios.fn_categorias_* */
export interface CategoriaModel {
  id: number;
  /** null en las raíces */
  padre_id?: number | null;
  padre_nombre?: string | null;
  /** Posición entre sus hermanas */
  orden: number;
  /** Profundidad 0..3; es lo que la rejilla usa para la sangría */
  nivel: number;
  nombre: string;
  /** El camino completo: «Línea Blanca > Refrigeración». Lo que se enseña en los combos */
  ruta?: string;
  descripcion?: string | null;
  icono?: string | null;
  activo: boolean;
  /** Subcategorías directas (con hijas no se puede eliminar) */
  num_hijos?: number;

  /**
   * true = se le pueden asignar productos; false = sólo agrupa.
   *
   * Sin esto, al crear un producto se podía elegir cualquier nodo del
   * árbol, incluidos los que sólo agrupan: un producto colgado de
   * «Tecnología» no se encuentra donde se le busca.
   */
  es_transaccion?: boolean;
  /** Productos en esta categoría (con productos no se puede eliminar) */
  num_productos?: number;
  /**
   * Productos de TODA la rama: los suyos más los de sus descendientes.
   *
   * Lo calcula la pantalla del listado, no el servidor: así una rama
   * contraída sigue diciendo cuántos productos cuelgan de ella. Para la
   * regla de «con productos no se puede eliminar» vale `num_productos`.
   */
  productos_rama?: number;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
  updated_by?: string;
}

/** Lo más hondo que admite el árbol (nivel 0 a 3), igual que el menú. */
export const NIVEL_MAXIMO_CATEGORIA = 3;
