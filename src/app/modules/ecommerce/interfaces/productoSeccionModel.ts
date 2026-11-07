import { ProductoModel } from '../../inventarios/interfaces/productoModel';

/**
 * Una SECCIÓN DE PRODUCTOS (ecommerce.producto_secciones).
 *
 * Un escaparate armado a mano: «Los más vendidos», «Ofertas de navidad», «Lo
 * nuevo de Samsung». No es una categoría ni una marca —ésas las decide quien
 * da de alta el producto—: la sección la decide quien vende, y junta cosas
 * que el catálogo no junta.
 *
 * La sección no guarda productos: los guarda el cruce
 * (ecommerce.producto_secciones_items). Aquí sólo viaja la CUENTA, que es lo
 * que se lee al lado del nombre.
 */
export interface SeccionProductoModel {
  id: number;
  nombre: string;
  /** La posición en la lista; se cambia arrastrando. */
  orden: number;
  activo: boolean;

  /** Vigencia, en el formato del <input type="datetime-local">. Pueden faltar. */
  desde?: string | null;
  hasta?: string | null;

  /**
   * Encendida Y en fechas: lo calcula la base, no la pantalla.
   *
   * `activo` dice si está encendida; `visible` dice si HOY se vería. Una
   * sección encendida con la vigencia pasada está encendida y no se ve, y sin
   * este campo la lista diría que sí.
   */
  visible: boolean;

  /**
   * Cuántos productos tiene DE VERDAD: sin los que están en la papelera del
   * catálogo. Si contara las filas del cruce, la sección diría «8» y la lista
   * de abajo enseñaría seis.
   */
  productos: number;

  deleted_at?: string | null;
  deleted_by?: string | null;
  created_by?: string;
  updated_by?: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Un producto DENTRO de una sección.
 *
 * Es la ficha del catálogo tal cual —la misma que trae la rejilla de
 * productos, porque el servidor la arma con la misma función— más la posición
 * que ocupa en esta sección.
 */
export interface ProductoDeSeccionModel extends ProductoModel {
  orden_seccion: number;
}

/**
 * El filtro del panel de la derecha, tal como viaja para la asignación masiva.
 *
 * VIAJA EL FILTRO, NO LOS IDS. El navegador sólo tiene la página que está
 * viendo; «mete las 340 que cumplen esto» lo resuelve la base llamando a la
 * misma función que llena la rejilla, así que lo que se asigna es exactamente
 * lo que se estaba enseñando.
 */
export interface FiltroProductos {
  search?: string;
  marca_ids?: number[];
  categoria_ids?: number[];
  /** El modelo de filtros de cabecera de ag-Grid, tal cual. */
  filtros?: any;
  precio_min?: number | null;
  precio_max?: number | null;
  costo_min?: number | null;
  costo_max?: number | null;
}

/** Qué está enseñando la rejilla del medio. */
export type VistaProductos = 'catalogo' | 'seccion';

/**
 * Lo que se lee en el conmutador de la rejilla.
 *
 * Son dos listas distintas y no un filtro de la misma: el catálogo lo pagina
 * el servidor (puede tener miles) y la sección llega entera (tiene decenas).
 * Por eso ordenar arrastrando sólo se puede en «La sección».
 */
export const VISTAS_PRODUCTOS: { clave: VistaProductos; texto: string; icono: string; ayuda: string }[] = [
  { clave: 'catalogo', texto: 'Catálogo', icono: 'fa-boxes-stacked',
    ayuda: 'Todo el catálogo, para elegir qué entra en la sección' },
  { clave: 'seccion',  texto: 'La sección', icono: 'fa-basket-shopping',
    ayuda: 'Sólo lo que ya está dentro, en el orden en que va' },
];
