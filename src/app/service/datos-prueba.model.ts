/**
 * Los modelos de los DATOS DE EJEMPLO (datos-prueba.service).
 *
 * Esto no describe ninguna tabla: son las filas inventadas que usan las
 * pantallas de demostración de facturas. Vive aquí y no en
 * `modules/inventarios/interfaces/productoModel` porque aquello pasó a
 * describir `inventarios.productos` de verdad —con marca, categoría, IVA,
 * garantía y galería—, y dejar que el ejemplo marcara la forma del catálogo
 * real sería al revés de como tiene que ser.
 *
 * Si algún día las facturas dejan de ser una demostración, lo que tienen que
 * usar es ProductoModel, no esto.
 */
export interface ProductoDemoModel {
  id?: number;
  codigo?: string;
  nombre?: string;
  descripcion?: string;
  precio_unitario?: number;
  costo?: number;
  stock?: number;
  estado?: boolean;
}
