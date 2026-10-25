/** Cuenta contable (contabilidad.plan_cuentas): lo que devuelven contabilidad.fn_plan_cuentas_* */
export interface PlanCuentaModel {
  id: number;
  /** null en las cuentas raíz */
  padre_id?: number | null;
  padre_codigo?: string | null;
  padre_nombre?: string | null;
  /** Posición entre sus hermanas */
  orden: number;
  /**
   * Profundidad en el árbol; es lo que la rejilla usa para la sangría.
   *
   * SIN TOPE, a diferencia del árbol de categorías, que llega al 3: un plan
   * de cuentas crece lo que la empresa necesite y poner un techo sólo obliga
   * a inventarse códigos.
   */
  nivel: number;
  /** La espina dorsal del plan: «1.1.01.001». Único en todo el plan */
  codigo: string;
  nombre: string;
  /** El camino completo de nombres: «ACTIVO > ACTIVO CORRIENTE > Caja» */
  ruta?: string;
  /** El mismo camino en códigos: «1 > 1.1 > 1.1.01» */
  ruta_codigo?: string;
  descripcion?: string | null;

  /** ACTIVO, PASIVO, PATRIMONIO, INGRESO, COSTO, GASTO u ORDEN: decide en qué informe sale */
  tipo: TipoCuenta;
  /**
   * De qué lado aumenta la cuenta.
   *
   * No se deduce del tipo: las cuentas de valuación van al revés —«(-)
   * Depreciación acumulada» es de activo y acreedora—, así que se guarda.
   */
  naturaleza: NaturalezaCuenta;

  /**
   * true = recibe asientos; false = sólo agrupa.
   *
   * Es el equivalente de `es_transaccion` en las categorías de inventarios.
   * Sólo las hojas reciben asientos: si una cuenta tiene subcuentas, el saldo
   * está en ellas y contarlo también arriba lo duplicaría. El servidor lo
   * mantiene solo: al colgarle la primera subcuenta se le quita.
   */
  es_movimiento?: boolean;

  activo: boolean;
  /** Subcuentas directas (con subcuentas no se puede eliminar) */
  num_hijos?: number;

  /** Sólo en la papelera: su cuenta padre también está ahí y no puede volver todavía */
  padre_en_papelera?: boolean;
  deleted_at?: string | null;
  deleted_by?: string | null;

  created_at?: string;
  updated_at?: string;
  created_by?: string;
  updated_by?: string;
}

export type TipoCuenta = 'ACTIVO' | 'PASIVO' | 'PATRIMONIO' | 'INGRESO' | 'COSTO' | 'GASTO' | 'ORDEN';
export type NaturalezaCuenta = 'DEUDORA' | 'ACREEDORA';

/** Los tipos, para los combos y las insignias de la rejilla. */
export const TIPOS_CUENTA: { valor: TipoCuenta; etiqueta: string; naturaleza: NaturalezaCuenta; clase: string }[] = [
  { valor: 'ACTIVO',     etiqueta: 'Activo',     naturaleza: 'DEUDORA',   clase: 'bg-primary' },
  { valor: 'PASIVO',     etiqueta: 'Pasivo',     naturaleza: 'ACREEDORA', clase: 'bg-warning' },
  { valor: 'PATRIMONIO', etiqueta: 'Patrimonio', naturaleza: 'ACREEDORA', clase: 'bg-indigo' },
  { valor: 'INGRESO',    etiqueta: 'Ingreso',    naturaleza: 'ACREEDORA', clase: 'bg-teal' },
  { valor: 'COSTO',      etiqueta: 'Costo',      naturaleza: 'DEUDORA',   clase: 'bg-orange' },
  { valor: 'GASTO',      etiqueta: 'Gasto',      naturaleza: 'DEUDORA',   clase: 'bg-danger' },
  { valor: 'ORDEN',      etiqueta: 'Orden',      naturaleza: 'DEUDORA',   clase: 'bg-secondary' },
];

export const NATURALEZAS_CUENTA: { valor: NaturalezaCuenta; etiqueta: string }[] = [
  { valor: 'DEUDORA',   etiqueta: 'Deudora (aumenta al débito)' },
  { valor: 'ACREEDORA', etiqueta: 'Acreedora (aumenta al crédito)' },
];
