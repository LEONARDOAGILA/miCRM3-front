/**
 * Qué cuenta contable usa cada cosa (contabilidad.cuentas_config).
 *
 * Ahora se configuran las CATEGORÍAS de inventario, que es de donde salen las
 * cuentas de un producto. El mismo mecanismo vale para clientes, sucursales e
 * impuestos: lo único que cambia es el ámbito.
 */
/**
 * Lo que vale un concepto al guardarlo: el id de la cuenta, null para
 * heredar, o la marca de que aquí no aplica.
 */
export type ValorCuenta = number | null | 'NO_APLICA';

/** La opción de «no aplica» dentro del desplegable de cuentas. */
export const NO_APLICA = 'NO_APLICA';

export type AmbitoContable =
  'CATEGORIA' | 'PRODUCTO' | 'GRUPO_CLIENTE' | 'CLIENTE' | 'SUCURSAL' | 'PUNTO_VENTA'
  | 'IMPUESTO' | 'FORMA_PAGO' | 'GLOBAL';

/** Un concepto: qué cuenta se pide y de qué tipo puede ser. */
export interface ConceptoContable {
  codigo: string;
  nombre: string;
  descripcion?: string | null;
  ambito_natural: AmbitoContable;
  /** ACTIVO, INGRESO, COSTO… Lo que el servidor deja elegir para este concepto */
  tipos_permitidos: string[];
  naturaleza_tipica?: string | null;
  orden: number;
}

/** Una cuenta, tal como la devuelve la configuración. */
export interface CuentaElegida {
  /** null cuando el concepto no aplica, o cuando no hay nada configurado */
  cuenta_id: number | null;
  codigo?: string;
  nombre?: string;
  tipo?: string;
  /**
   * «Aquí este concepto no existe»: un servicio no mueve inventario.
   *
   * No es lo mismo que no tener cuenta: `no_aplica` es una respuesta, y
   * CORTA LA HERENCIA —no se sigue buscando hacia arriba—.
   */
  no_aplica?: boolean;
  /** De dónde sale: 'Propia', 'Heredada de Línea Blanca', 'Por omisión' */
  origen_etiqueta?: string | null;
  origen?: string | null;
  origen_id?: number | null;
}

/**
 * Un concepto en la ficha de algo, con las dos cosas que hay que distinguir:
 * lo que tiene puesto (`propia`, que es lo editable) y lo que se usaría de
 * verdad (`efectiva`, que puede venir heredada).
 */
export interface ConceptoConfigurado extends ConceptoContable {
  concepto: string;
  /** Lo que tiene puesto esta cosa; es lo único editable en su ficha */
  propia?: CuentaElegida | null;
  /** La que se usaría de verdad: la propia, o la que venga de arriba */
  efectiva?: CuentaElegida | null;
  /**
   * La que quedaría SI SE QUITARA la propia.
   *
   * No es lo mismo que `efectiva`: cuando hay una propia, la efectiva es esa
   * misma, y enseñarla al vaciar el campo diría que se hereda justo lo que se
   * acaba de quitar.
   */
  heredada?: CuentaElegida | null;
}

export interface CuentasConfig {
  ambito: AmbitoContable;
  ambito_id: number | null;
  donde?: { etiqueta?: string; ruta?: string; es_transaccion?: boolean; nivel?: number;
            num_clientes?: number } | null;
  conceptos: ConceptoConfigurado[];
}

/** Una fila del árbol de categorías con sus cuentas ya resueltas. */
export interface CategoriaCuentas {
  id: number;
  padre_id?: number | null;
  orden: number;
  nivel: number;
  nombre: string;
  activo: boolean;
  /** true = se le pueden colgar productos; es donde las cuentas se usan */
  es_transaccion: boolean;
  num_hijos?: number;
  num_productos?: number;
  /** Cuántas cuentas tiene puestas ella misma (las demás las hereda) */
  propias: number;
  /** concepto → la cuenta que usa, venga de donde venga */
  cuentas: Record<string, CuentaElegida | null>;
}

/**
 * Una fila del árbol de GRUPOS DE CLIENTES con sus cuentas ya resueltas.
 *
 * Es la hermana de CategoriaCuentas: el mismo árbol, con los conceptos del
 * cliente —cuenta por cobrar, anticipos, mora, incobrables— y sin el «admite
 * productos», que aquí no existe: un cliente puede colgar de cualquier nodo.
 */
export interface GrupoCuentas {
  id: number;
  padre_id?: number | null;
  orden: number;
  nivel: number;
  nombre: string;
  activo: boolean;
  num_hijos?: number;
  /** Clientes que usan este grupo */
  num_clientes?: number;
  /** Cuántas cuentas tiene puestas él mismo (las demás las hereda) */
  propias: number;
  /** concepto → la cuenta que usa, venga de donde venga */
  cuentas: Record<string, CuentaElegida | null>;
}
