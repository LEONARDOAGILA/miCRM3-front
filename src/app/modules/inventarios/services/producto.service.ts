import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

/**
 * Productos (inventarios.productos) y su galería de imágenes.
 *
 * La paginación y los filtros los hace el servidor
 * (inventarios.fn_productos_listar_paginado), que además admite filtrar por
 * marca y por RAMA de categoría: pedir «Línea Blanca» trae también lo que
 * cuelga de ella, que es lo que hace falta porque los productos cuelgan de
 * las hojas.
 */
@Injectable({
  providedIn: 'root',
})
export class ProductoService {

  private URL_SERVICIOS: string;

  constructor(
    private _http: HttpClient,
  ) {
    this.URL_SERVICIOS = environment.URL_SERVICIOS + 'inventarios/producto/';
  }

  //   ******   LISTADO CON PAGINACIÓN   ******  //
  allProductos(page: number = 1, perPage: number = 10, search: string = '',
               marcaId: number | null = null, categoriaId: number | null = null,
               filtros: any = null): Observable<any> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('per_page', perPage.toString());
    if (search)      { params = params.set('search', search); }
    if (marcaId)     { params = params.set('marca_id', String(marcaId)); }
    if (categoriaId) { params = params.set('categoria_id', String(categoriaId)); }

    // El modelo de filtros de columna de ag-Grid, en JSON. Se aplica en el
    // servidor, sobre todo el catálogo: la rejilla sólo tiene la página.
    if (filtros && Object.keys(filtros).length) {
      params = params.set('filtros', JSON.stringify(filtros));
    }

    // observe: 'response' como en allCargos: el componente lee res.body
    return this._http.get<any>(this.URL_SERVICIOS + 'allProductos', { params, observe: 'response' });
  }

  //   ******   LISTADO SIMPLE (combos / selector)   ******  //
  listProductos(soloActivos: boolean = true): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'listProductos',
                          { params: new HttpParams().set('activos', soloActivos ? '1' : '0') });
  }

  //   ******   CREAR   ******  //
  addProducto(data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'addProducto', data);
  }

  //   ******   CLONAR (mismo endpoint que crear)   ******  //
  clonProducto(data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'addProducto', data);
  }

  //   ******   ACTIVAR / DESACTIVAR (sólo esa columna)   ******  //
  activarProducto(id: any, activo?: boolean): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'activarProducto/' + id,
                           activo === undefined ? {} : { activo });
  }

  //   ******   EDITAR   ******  //
  editProducto(id: any, data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'editProducto/' + id, data);
  }

  //   ******   ELIMINAR (se lleva su galería)   ******  //
  deleteProducto(id: any): Observable<any> {
    return this._http.delete(this.URL_SERVICIOS + 'deleteProducto/' + id);
  }

  //   ******   BUSCAR POR ID (incluye la galería)   ******  //
  findByIdProducto(id: any): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'findByIdProducto/' + id);
  }

  // ================================================================
  // LA GALERÍA
  // ================================================================

  /**
   * Las características rellenas del producto.
   *
   * Trae la plantilla vigente de su categoría con los valores puestos, y
   * además lo que se rellenó en su día y hoy ya no está en la plantilla
   * (viene con en_plantilla = false).
   */
  //   ******   IMÁGENES DENTRO DE LA DESCRIPCIÓN   ******  //
  /**
   * Sube una imagen que va dentro del texto de la descripción.
   *
   * No es una foto de la galería: no sale en el listado. Devuelve el nombre
   * del fichero, que luego se convierte en URL con urlImagenDescripcion.
   * Se sube en vez de incrustarla en base64 porque una foto se llevaría los
   * 20.000 caracteres que admite la descripción.
   */
  subirImagenDescripcion(fichero: File): Observable<any> {
    const data = new FormData();
    data.append('imagen', fichero);
    return this._http.post(this.URL_SERVICIOS + 'subirImagenDescripcion', data);
  }

  /** La URL pública de una de esas imágenes (la pide un <img src>). */
  urlImagenDescripcion(archivo: string): string {
    return this.URL_SERVICIOS + 'getImagenDescripcion/' + encodeURIComponent(archivo);
  }

  caracteristicas(productoId: any): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'caracteristicas/' + productoId);
  }

  imagenes(productoId: any): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'imagenes/' + productoId);
  }

  /** `data` lleva ProductoId e imagen_file dentro de un FormData. */
  addImagen(data: FormData): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'addImagen', data);
  }

  /** El id es el de la IMAGEN, no el del producto. */
  imagenPrincipal(imagenId: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'imagenPrincipal/' + imagenId, {});
  }

  /** Los ids de la galería en el orden nuevo, tras arrastrar. */
  ordenarImagenes(productoId: any, ids: number[]): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'ordenarImagenes/' + productoId, { ids });
  }

  /** El id es el de la IMAGEN, no el del producto. */
  deleteImagen(imagenId: any): Observable<any> {
    return this._http.delete(this.URL_SERVICIOS + 'deleteImagen/' + imagenId);
  }

  /**
   * La url de una imagen para un <img src>.
   *
   * Con `refrescar` lleva un parámetro `v` con la hora: sin él, al cambiar la
   * imagen el navegador seguiría enseñando la de antes, que viene con
   * cabecera de caché de un año. En la rejilla se aprovecha esa caché.
   */
  urlImagen(imagenId: number | string, refrescar: boolean = false): string {
    return this.URL_SERVICIOS + 'getImagen/' + imagenId + (refrescar ? '?v=' + Date.now() : '');
  }

  // ================================================================
  // PAPELERA DE RECICLAJE
  // ================================================================
  //
  // `deleteProducto` es un borrado lógico: el producto va a la papelera y
  // deja de salir en los listados. Desde aquí se saca o se borra de verdad.

  /** Lo que hay en la papelera (más reciente primero). */
  papelera(): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'papelera');
  }

  /** Saca de la papelera uno o varios productos. */
  restaurarProductos(ids: number[]): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'restaurarProductos', { ids });
  }

  /** Borrado real de lo seleccionado (sólo de lo que está en la papelera). */
  eliminarDefinitivo(ids: number[]): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'eliminarDefinitivo', { ids });
  }

  /** Borrado real de todo lo que hay en la papelera. */
  vaciarPapelera(): Observable<any> {
    return this._http.delete(this.URL_SERVICIOS + 'vaciarPapelera');
  }
}
