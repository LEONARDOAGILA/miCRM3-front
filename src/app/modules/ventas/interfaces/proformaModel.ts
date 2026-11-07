/**
 * Proformas (ventas.proformas + ventas.proformas_detalle).
 *
 * Es un DOCUMENTO, no un catálogo, y eso se nota en el modelo:
 *
 *   · lleva una FOTO del cliente (cliente_nombre, cliente_direccion…). No es
 *     redundancia: la proforma que se entregó no cambia porque mañana le
 *     cambien el nombre o la dirección al cliente;
 *   · no tiene `activo` sino ESTADO, con su ciclo de vida;
 *   · los importes vienen CALCULADOS POR EL SERVIDOR. El navegador los vuelve
 *     a calcular igual mientras se escribe en la rejilla, pero lo que se
 *     guarda es lo que diga la base.
 */

/** Una línea del documento. */
export interface LineaProformaModel {
  /** El id de la línea guardada; las nuevas no lo tienen */
  id?: number | null;
  orden?: number;

  /** Nulo en una línea escrita a mano, que no sale del catálogo */
  producto_id?: number | null;
  codigo?: string | null;
  descripcion: string;
  unidad?: string | null;

  // Lo que se escribe
  cantidad: number;
  precio_unitario: number;
  descuento_porcentaje: number;
  iva_porcentaje: number;

  // Lo que se calcula (el servidor manda; aquí se repite para verlo al vuelo)
  subtotal?: number;
  descuento_valor?: number;
  base?: number;
  iva_valor?: number;
  total?: number;

  observacion?: string | null;

  /**
   * SÓLO PARA LA REJILLA, no se manda al servidor.
   *
   * Marca la fila en blanco que espera un código: mientras esté puesta no se
   * valida ni se cuenta, porque el usuario todavía no ha escrito nada.
   */
  _vacia?: boolean;
}

/** El IVA agrupado por tarifa, que es lo que se imprime al pie. */
export interface DesgloseIva {
  porcentaje: number;
  base: number;
  valor: number;
}

export interface ProformaModel {
  id: number;
  numero: string;

  cliente_id: number;
  cliente_identificacion?: string | null;
  cliente_nombre?: string | null;
  cliente_direccion?: string | null;
  cliente_telefono?: string | null;
  cliente_email?: string | null;
  grupo_cliente_id?: number | null;
  grupo_nombre?: string | null;

  vendedor_usuario_id?: number | null;
  vendedor_nombre?: string | null;
  sucursal_id?: number | null;
  sucursal_nombre?: string | null;
  bodega_id?: number | null;

  fecha: string;
  validez_dias: number;
  /** La calcula la base: fecha + validez_dias */
  fecha_vence?: string;

  forma_pago?: string | null;
  dias_credito?: number | null;
  /** El que se propone a todas las líneas; cada una puede llevar el suyo */
  descuento_porcentaje: number;
  moneda?: string;

  estado: EstadoProforma;
  estado_etiqueta?: string;
  motivo_rechazo?: string | null;
  fecha_envio?: string | null;
  fecha_respuesta?: string | null;

  subtotal?: number;
  descuento_total?: number;
  subtotal_gravado?: number;
  subtotal_exento?: number;
  iva_total?: number;
  total?: number;

  observaciones?: string | null;
  condiciones?: string | null;

  /** Enviada y pasada de fecha. Es un CÁLCULO del servidor, no el estado */
  vencida?: boolean;
  dias_para_vencer?: number;
  /** Sólo un borrador o una enviada se pueden cambiar */
  puede_editarse?: boolean;
  en_papelera?: boolean;

  /** Cuántas líneas tiene (sólo en el listado; en la ficha viene `detalle`) */
  lineas?: number;
  detalle?: LineaProformaModel[];
  iva_desglose?: DesgloseIva[];

  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

/** Los estados de ck_proformas_estado. */
export type EstadoProforma = 'BORRADOR' | 'ENVIADA' | 'APROBADA' | 'RECHAZADA' | 'VENCIDA' | 'ANULADA';

/**
 * Los estados con su etiqueta, su color y qué significa cada uno.
 *
 * El color se usa igual en la rejilla, en la ficha y en los botones de
 * arriba: un estado tiene que verse del mismo color en toda la pantalla.
 */
export const ESTADOS_PROFORMA: Array<{
  id: EstadoProforma; name: string; clase: string; icono: string; ayuda: string;
}> = [
  { id: 'BORRADOR',  name: 'Borrador',  clase: 'bg-secondary', icono: 'fa-pen-ruler',
    ayuda: 'Se está armando: se puede cambiar cuanto haga falta' },
  { id: 'ENVIADA',   name: 'Enviada',   clase: 'bg-blue',      icono: 'fa-paper-plane',
    ayuda: 'Ya está en manos del cliente, esperando respuesta' },
  { id: 'APROBADA',  name: 'Aprobada',  clase: 'bg-teal',      icono: 'fa-circle-check',
    ayuda: 'El cliente la aceptó. Ya no se puede cambiar' },
  { id: 'RECHAZADA', name: 'Rechazada', clase: 'bg-danger',    icono: 'fa-circle-xmark',
    ayuda: 'El cliente dijo que no (con su motivo)' },
  { id: 'VENCIDA',   name: 'Vencida',   clase: 'bg-warning',   icono: 'fa-hourglass-end',
    ayuda: 'Se pasó de los días de validez sin respuesta' },
  { id: 'ANULADA',   name: 'Anulada',   clase: 'bg-dark',      icono: 'fa-ban',
    ayuda: 'Se dio de baja. Ya no se puede cambiar' },
];

/** A qué estados puede pasar cada estado (las mismas reglas que la base). */
export const TRANSICIONES_PROFORMA: Record<EstadoProforma, EstadoProforma[]> = {
  BORRADOR:  ['ENVIADA', 'ANULADA'],
  ENVIADA:   ['APROBADA', 'RECHAZADA', 'VENCIDA', 'ANULADA', 'BORRADOR'],
  // Una vencida se RENUEVA (otra acción, porque cambia la fecha del
  // documento); desde aquí sólo se puede anular
  VENCIDA:   ['ANULADA'],
  RECHAZADA: ['ANULADA'],
  APROBADA:  [],
  ANULADA:   [],
};

/** La etiqueta de un estado, o el código tal cual si llega uno nuevo. */
export function etiquetaEstado(id: string | null | undefined): string {
  return ESTADOS_PROFORMA.find(e => e.id === id)?.name ?? (id || '—');
}

export function claseEstado(id: string | null | undefined): string {
  return ESTADOS_PROFORMA.find(e => e.id === id)?.clase ?? 'bg-secondary';
}

/** Lo que hace falta de un producto para rellenar una línea. */
export interface ProductoParaLinea {
  producto_id: number;
  codigo: string | null;
  codigo_barras?: string | null;
  /** El NOMBRE del producto: en la línea se llama descripción */
  descripcion: string;
  detalle?: string | null;
  modelo?: string | null;
  unidad: string;
  precio_unitario: number;
  iva_porcentaje: number;
  maneja_stock?: boolean;
  maneja_serie?: boolean;
  garantia_meses?: number | null;
  marca?: string | null;
  categoria?: string | null;
}

/** Lo que contesta el servidor al teclear un código en la rejilla. */
export interface BusquedaProducto {
  /** true si uno coincidía exacto: la línea se rellena sola, sin preguntar */
  exacto: boolean;
  productos: ProductoParaLinea[];
}

/** Una condición del cliente, con el valor y de dónde sale. */
export interface CondicionCliente {
  valor: any;
  /** 'cliente' si lo tiene puesto él, 'grupo' si lo hereda */
  origen?: 'cliente' | 'grupo' | null;
  origen_etiqueta?: string | null;
}

/** La foto del cliente y con qué condiciones se le vende. */
export interface CondicionesDeCliente {
  cliente: {
    id: number;
    identificacion: string | null;
    tipo_identificacion: string | null;
    nombre: string | null;
    direccion: string | null;
    telefono: string | null;
    email: string | null;
    estado: string | null;
    activo: boolean;
    vendedor_usuario_id: number | null;
    vendedor_nombre: string | null;
    grupo_cliente_id: number | null;
    grupo_nombre: string | null;
  };
  condiciones: {
    forma_pago: CondicionCliente;
    dias_credito: CondicionCliente;
    limite_credito: CondicionCliente;
    descuento: CondicionCliente;
  };
  /** Cosas que conviene ver ANTES de cotizar (inactivo, moroso…) */
  avisos: string[];
}

/** El contador de arriba de la pantalla. */
export interface ResumenProformas {
  total: number;
  importe: number;
  por_estado: Array<{ estado: EstadoProforma; etiqueta: string; cuantas: number; importe: number }>;
  vencidas: number;
  por_vencer: number;
}

/**
 * La aritmética de una línea, igual que ventas.fn_proformas_linea_calcular.
 *
 * EL ORDEN DEL REDONDEO ES PARTE DEL CONTRATO: primero el subtotal a dos
 * decimales, sobre él el descuento, y el IVA sobre lo que queda. Si aquí se
 * hiciera en otro orden, el total que ve el usuario mientras escribe no
 * cuadraría con el que se guarda, y la diferencia de un centavo aparecería
 * justo al dar a Guardar.
 */
export function calcularLinea(l: Partial<LineaProformaModel>): {
  subtotal: number; descuento_valor: number; base: number; iva_valor: number; total: number;
} {
  const dos = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

  const subtotal        = dos(Number(l.cantidad || 0) * Number(l.precio_unitario || 0));
  const descuento_valor = dos(subtotal * Number(l.descuento_porcentaje || 0) / 100);
  const base            = dos(subtotal - descuento_valor);
  const iva_valor       = dos(base * Number(l.iva_porcentaje || 0) / 100);

  return { subtotal, descuento_valor, base, iva_valor, total: dos(base + iva_valor) };
}

/** Los totales de la cabecera a partir de las líneas (los mismos que la base). */
export function calcularTotales(lineas: LineaProformaModel[]): {
  subtotal: number; descuento_total: number; subtotal_gravado: number;
  subtotal_exento: number; iva_total: number; total: number;
  desglose: DesgloseIva[];
} {
  const dos = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  const porTarifa = new Map<number, { base: number; valor: number }>();

  let subtotal = 0, descuento_total = 0, gravado = 0, exento = 0, iva = 0;

  for (const l of lineas) {
    if (l._vacia) { continue; }
    const c = calcularLinea(l);
    subtotal        += c.subtotal;
    descuento_total += c.descuento_valor;
    iva             += c.iva_valor;
    if (Number(l.iva_porcentaje || 0) > 0) { gravado += c.base; } else { exento += c.base; }

    const tarifa = Number(l.iva_porcentaje || 0);
    const acum = porTarifa.get(tarifa) ?? { base: 0, valor: 0 };
    porTarifa.set(tarifa, { base: dos(acum.base + c.base), valor: dos(acum.valor + c.iva_valor) });
  }

  return {
    subtotal: dos(subtotal),
    descuento_total: dos(descuento_total),
    subtotal_gravado: dos(gravado),
    subtotal_exento: dos(exento),
    iva_total: dos(iva),
    total: dos(dos(gravado) + dos(exento) + dos(iva)),
    desglose: [...porTarifa.entries()]
      .map(([porcentaje, v]) => ({ porcentaje, base: v.base, valor: v.valor }))
      .sort((a, b) => a.porcentaje - b.porcentaje),
  };
}
