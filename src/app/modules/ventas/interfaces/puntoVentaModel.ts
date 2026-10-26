/**
 * Puntos de venta (core.puntos_venta).
 *
 * UN PUNTO DE VENTA ES UNA CAJA. Una sucursal tiene varias —la 1, la 2…— y
 * lo que de verdad las distingue es que cada una CUADRA SU PROPIO DINERO:
 * por eso lo importante de la ficha no es el nombre sino sus cuentas
 * contables, que se configuran con el mecanismo común (ámbito PUNTO_VENTA) y
 * siguen la cadena punto de venta → su sucursal → lo que valga para todos.
 */
export interface PuntoVentaModel {
  id: number;

  sucursal_id: number;
  sucursal_nombre?: string | null;
  sucursal_codigo?: string | null;

  /**
   * Único en toda la empresa, y COMPUESTO: código de la sucursal + número de
   * la caja. La caja 501 de la sucursal 01 es «01-501». No se teclea.
   */
  codigo: string;
  nombre: string;
  /**
   * El número de la caja dentro de su sucursal. No se repite entre las de la
   * misma tienda: dos «Caja 1» no se distinguen al cuadrar.
   */
  numero: number;
  descripcion?: string | null;
  activo: boolean;
  en_papelera?: boolean;

  /** Cómo están sus cuentas (ver ResumenCuentasPuntoVenta) */
  cuentas?: ResumenCuentasPuntoVenta;

  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
}

/**
 * Cómo están las cuentas de una caja.
 *
 * `sin_resolver` es el número que importa: conceptos que no tienen cuenta NI
 * están marcados como «no aplica», ni propios ni heredados. Mientras eso no
 * sea cero, hay asientos que esta caja no podría hacer.
 */
export interface ResumenCuentasPuntoVenta {
  /** Cuántos conceptos tiene el ámbito PUNTO_VENTA */
  total: number;
  /** Cuántas cuentas tiene puestas ELLA (el resto las hereda) */
  propias: number;
  sin_resolver: number;
}

/** Lo que propone el servidor para la siguiente caja de una sucursal. */
export interface SugerenciaPuntoVenta {
  codigo: string;
  nombre: string;
  numero: number;
  /**
   * El código de la tienda, con el que empieza el de la caja («01-501»): así
   * la ficha puede recomponerlo al teclear otro número sin volver a preguntar.
   */
  sucursal_codigo?: string | null;
}

/**
 * Los conceptos contables de una caja, en el orden en que los devuelve el
 * servidor, con una nota de por qué está cada uno.
 *
 * No se usa para pintar —eso viene del servidor— sino para los textos de
 * ayuda de la ficha: explicar POR QUÉ hace falta cada cuenta es lo que
 * convierte una lista de diez desplegables en algo que se puede rellenar.
 */
export const AYUDA_CUENTAS_PUNTO_VENTA: Record<string, string> = {
  CAJA_PV:
    'La única que casi siempre es propia de cada caja: si dos comparten cuenta, no hay manera de saber cuál cuadró.',
  FONDO_CAMBIO:
    'El fondo fijo para dar vueltos. Va aparte de la caja porque no es venta del día.',
  TARJETA_CREDITO:
    'No es efectivo: es una cuenta por cobrar a la procesadora hasta que acredite.',
  TARJETA_DEBITO:
    'Igual que el crédito, pero suele acreditar en otro plazo y con otra comisión.',
  TRANSFERENCIA:
    'Entra directo al banco, sin pasar por el cajón.',
  CHEQUE_RECIBIDO:
    'Cheques en mano, pendientes de depositar.',
  EFECTIVO_TRANSITO:
    'Lo que salió de la caja camino del banco y todavía no llegó. Sin esta cuenta el efectivo desaparece entre el cierre y el depósito.',
  SOBRANTE_CAJA:
    'Lo que sobra al cuadrar.',
  FALTANTE_CAJA:
    'Lo que falta al cuadrar. Separado de los sobrantes a propósito: netearlos esconde lo que hay que vigilar.',
  REDONDEO:
    'Los centavos que se perdonan al cobrar en efectivo.',
};
