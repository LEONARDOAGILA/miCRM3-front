/**
 * El tablero de ventas demo (reportes.ventas_demo).
 *
 * Lo que devuelven las reportes.fn_ventas_demo_*. Las dimensiones, las
 * medidas y las operaciones NO se escriben aquí: las manda el servidor
 * (`opciones`), que es donde está la lista blanca. Si se duplicaran, un día
 * dirían cosas distintas.
 */

/** Una opción de un desplegable del armador. */
export interface OpcionReporte {
  id: string;
  name: string;
  /** Sólo en las medidas: si se pinta como dinero. */
  dinero?: boolean;
}

export interface OpcionesVentaDemo {
  dimensiones: OpcionReporte[];
  medidas: OpcionReporte[];
  agregaciones: OpcionReporte[];
  /** Los valores que existen, para los filtros. */
  filtros: { [campo: string]: string[] };
  rango: { desde: string; hasta: string; ventas: number };
}

/** Una fila del pivote: su etiqueta, el valor de cada columna y su total. */
export interface FilaPivote {
  grupo: string;
  valores: { [columna: string]: number };
  total: number;
}

export interface PivoteVentaDemo {
  meta: {
    filas: string;
    columnas: string;
    medida: string;
    agregacion: string;
    cuantas_filas: number;
    cuantas_columnas: number;
  };
  columnas: string[];
  filas: FilaPivote[];
  totales: { [columna: string]: number };
  gran_total: number | null;
}

/** Una venta del detalle. */
export interface VentaDemoModel {
  id: number;
  fecha: string;
  region: string;
  ciudad: string;
  vendedor: string;
  canal: string;
  categoria: string;
  producto: string;
  cliente: string;
  forma_pago: string;
  cantidad: number;
  precio_unitario: number;
  descuento: number;
  total: number;
  costo: number;
  margen: number;
  margen_pct: number;
}

/** Lo que se le manda al servidor como filtro. */
export interface FiltrosVentaDemo {
  desde?: string | null;
  hasta?: string | null;
  buscar?: string | null;
  region?: string[];
  categoria?: string[];
  canal?: string[];
  vendedor?: string[];
}

/**
 * Las formas de gráfico.
 *
 * No es decoración: cada una contesta una pregunta distinta. Las barras
 * apiladas comparan la COMPOSICIÓN de cada grupo, las líneas la EVOLUCIÓN
 * cuando las columnas son tiempo, y el pastel sólo vale para el reparto de un
 * total entre pocas partes.
 */
export const GRAFICOS_REPORTE: { id: TipoGrafico; name: string; icono: string }[] = [
  { id: 'barras',    name: 'Barras',          icono: 'fa-chart-column' },
  { id: 'apiladas',  name: 'Barras apiladas', icono: 'fa-layer-group' },
  { id: 'lineas',    name: 'Líneas',          icono: 'fa-chart-line' },
  { id: 'area',      name: 'Área',            icono: 'fa-chart-area' },
  { id: 'pastel',    name: 'Pastel',          icono: 'fa-chart-pie' },
];

export type TipoGrafico = 'barras' | 'apiladas' | 'lineas' | 'area' | 'pastel';
