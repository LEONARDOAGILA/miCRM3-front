/** Una imagen de la galería (inventarios.productos_imagenes). */
export interface ImagenProductoModel {
  id: number;
  producto_id: number;
  /** Nombre del fichero en storage; la url la arma ProductoService.urlImagen() */
  archivo: string;
  nombre_original?: string | null;
  orden: number;
  /** Sólo una por producto; es la que sale en la rejilla */
  principal: boolean;
}

/** Producto (inventarios.productos): lo que devuelven inventarios.fn_productos_* */
export interface ProductoModel {
  id: number;

  // ---------- Identificación ----------
  /** SKU interno, obligatorio y único. Se guarda en mayúsculas */
  codigo: string;
  /** EAN/UPC de fábrica; único cuando existe, pero la mayoría de accesorios no traen */
  codigo_barras?: string | null;
  nombre: string;
  descripcion?: string | null;

  // ---------- Clasificación ----------
  marca_id?: number | null;
  marca_nombre?: string | null;
  categoria_id?: number | null;
  categoria_nombre?: string | null;
  /** El camino completo de la categoría: «Línea Blanca > Refrigeración» */
  categoria_ruta?: string | null;
  modelo?: string | null;

  // ---------- Comercial ----------
  unidad: string;
  costo: number;
  precio: number;
  /** Tarifa del producto; 15 es la vigente en Ecuador, pero hay partidas con 0 */
  iva_porcentaje: number;

  // ---------- Existencias ----------
  maneja_stock: boolean;
  stock_minimo: number;
  stock_maximo?: number | null;

  // ---------- Propio del giro ----------
  /** true cuando cada unidad se controla por número de serie o IMEI (garantías) */
  maneja_serie: boolean;
  garantia_meses: number;

  // ---------- Para el despacho ----------
  peso_kg?: number | null;
  alto_cm?: number | null;
  ancho_cm?: number | null;
  profundidad_cm?: number | null;

  activo: boolean;

  // ---------- Galería ----------
  /** El fichero de la imagen principal; sirve para saber si hay foto */
  foto?: string | null;
  /** El id de esa imagen, que es por donde se pide (getImagen va por id de imagen) */
  foto_id?: number | null;
  num_imagenes?: number;
  /** Sólo viene en findByIdProducto, no en el listado */
  imagenes?: ImagenProductoModel[];

  created_at?: string;
  updated_at?: string;
  created_by?: string;
  updated_by?: string;
}

/**
 * Unidades de medida del catálogo.
 *
 * Para electrodomésticos y computadores casi todo va por unidad; las demás
 * están para accesorios que se venden por metro o por juego.
 */
export const UNIDADES_PRODUCTO: { id: string; name: string }[] = [
  { id: 'UNIDAD',  name: 'Unidad' },
  { id: 'CAJA',    name: 'Caja' },
  { id: 'JUEGO',   name: 'Juego / Kit' },
  { id: 'PAR',     name: 'Par' },
  { id: 'METRO',   name: 'Metro' },
  { id: 'PAQUETE', name: 'Paquete' },
];

/**
 * Tarifas de IVA.
 *
 * 15% es la general en Ecuador; 0% lo llevan las partidas exentas, y 5% se
 * ha usado en rebajas temporales por decreto. Va en el producto y no en una
 * constante del código porque cambia.
 */
export const TARIFAS_IVA: { id: number; name: string }[] = [
  { id: 15, name: '15 %' },
  { id: 5,  name: '5 %' },
  { id: 0,  name: '0 %' },
];

/** Garantías que más se repiten, para no escribirlas a mano. */
export const GARANTIAS_MESES: { id: number; name: string }[] = [
  { id: 0,  name: 'Sin garantía' },
  { id: 3,  name: '3 meses' },
  { id: 6,  name: '6 meses' },
  { id: 12, name: '1 año' },
  { id: 24, name: '2 años' },
  { id: 36, name: '3 años' },
  { id: 60, name: '5 años' },
];
