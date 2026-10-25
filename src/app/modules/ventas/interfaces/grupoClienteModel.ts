import { FORMAS_PAGO } from './clienteModel';

/** Grupo de clientes (ventas.grupos_clientes): lo que devuelven ventas.fn_grupos_clientes_* */
export interface GrupoClienteModel {
  id: number;
  /** null en las raíces */
  padre_id?: number | null;
  padre_nombre?: string | null;
  /** Posición entre sus hermanos */
  orden: number;
  /** Profundidad 0..3; es lo que la rejilla usa para la sangría */
  nivel: number;
  nombre: string;
  /** El camino completo: «Línea Blanca > Refrigeración». Lo que se enseña en los combos */
  ruta?: string;
  descripcion?: string | null;
  icono?: string | null;
  activo: boolean;

  /**
   * El que la ficha de un cliente nuevo trae puesto.
   *
   * SÓLO HAY UNO en todo el árbol: marcarlo en uno lo quita del que lo
   * tuviera. Lo garantiza un índice único en la base, no la pantalla.
   */
  predeterminado?: boolean;
  /** Subgrupos directos (con hijas no se puede eliminar) */
  num_hijos?: number;

  /* ---- LAS CUATRO CONDICIONES, TAL COMO LAS TIENE ESTE GRUPO ----
     null (o ausente) NO es cero: es «lo que diga el grupo de arriba». Para
     saber qué se usaría de verdad está `condiciones`. */
  forma_pago?: FormaPago | null;
  limite_credito?: number | null;
  dias_credito?: number | null;
  descuento?: number | null;

  /** Las cuatro ya resueltas, con su procedencia. Viene del servidor. */
  condiciones?: Record<string, CondicionResuelta>;

  /** Clientes en este grupo (con clientes no se puede eliminar) */
  num_clientes?: number;
  /**
   * Clientes de TODA la rama: los suyos más los de sus descendientes.
   *
   * Lo calcula la pantalla del listado, no el servidor: así una rama
   * contraída sigue diciendo cuántos clientes cuelgan de ella. Para la
   * regla de «con clientes no se puede eliminar» vale `num_clientes`.
   */
  clientes_rama?: number;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
  updated_by?: string;
}

/** Lo más hondo que admite el árbol (nivel 0 a 3), igual que el menú. */
export const NIVEL_MAXIMO_GRUPO_CLIENTE = 3;

/** Las formas de pago de ck_grupos_clientes_forma_pago. */
export type FormaPago = 'EFECTIVO' | 'TRANSFERENCIA' | 'TARJETA' | 'CHEQUE' | 'CREDITO';

/**
 * Una condición ya resuelta, como la manda fn_grupos_clientes_condiciones.
 *
 *   propio          lo que tiene puesto ESTE grupo (null = hereda)
 *   efectivo        lo que de verdad se usaría (null = nadie lo puso)
 *   origen_id       de qué grupo sale
 *   origen_etiqueta «Propia» o «Heredada de Mayoristas», para el título
 */
export interface CondicionResuelta {
  propio?: string | number | null;
  efectivo?: string | number | null;
  origen_id?: number | null;
  origen_etiqueta?: string | null;
}

/**
 * Lo que ofrece el selector de forma de pago de la ficha del grupo.
 *
 * La primera opción es el hueco: deja el campo vacío, que es lo que
 * significa heredar. No se repiten las etiquetas de FORMAS_PAGO para que
 * grupo y cliente no acaben diciendo cosas distintas de lo mismo.
 */
export const FORMAS_PAGO_GRUPO: Array<{ id: string; name: string }> = [
  { id: '', name: '— Lo que diga el grupo de arriba —' },
  ...FORMAS_PAGO,
];
