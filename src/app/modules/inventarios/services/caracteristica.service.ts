import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

/**
 * La PLANTILLA de características por categoría
 * (inventarios.caracteristicas_categorias).
 *
 * Cada categoría lleva su lista de lo que hay que rellenar en un producto:
 * un portátil pide procesador, memoria y almacenamiento. Aquí se mantiene esa
 * lista; los valores de cada producto van con el producto
 * (ProductoService.caracteristicas / el campo `caracteristicas` al guardar).
 *
 * Mismo esquema que MarcaService: la paginación y los filtros los hace el
 * servidor (inventarios.fn_caracteristicas_listar_paginado).
 */
@Injectable({
  providedIn: 'root',
})
export class CaracteristicaService {

  private URL_SERVICIOS: string;

  constructor(
    private _http: HttpClient,
  ) {
    this.URL_SERVICIOS = environment.URL_SERVICIOS + 'inventarios/caracteristica/';
  }

  //   ******   LISTADO CON PAGINACIÓN   ******  //
  allCaracteristicas(page: number = 1, perPage: number = 10, search: string = '',
                     categoriaId: number | null = null, filtros: any = null): Observable<any> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('per_page', perPage.toString());

    if (search) { params = params.set('search', search); }
    if (categoriaId) { params = params.set('categoria_id', String(categoriaId)); }

    // El modelo de filtros de columna de ag-Grid, en JSON. Se aplica en el
    // servidor, sobre todas las filas: la rejilla sólo tiene la página.
    if (filtros && Object.keys(filtros).length) {
      params = params.set('filtros', JSON.stringify(filtros));
    }

    // observe: 'response' como en allMarcas: el componente lee res.body
    return this._http.get<any>(this.URL_SERVICIOS + 'allCaracteristicas', { params, observe: 'response' });
  }

  //   ******   LA PLANTILLA DE UNA CATEGORÍA   ******  //
  /** Lo que el formulario del producto tiene que pedir al elegir categoría. */
  /** Sin `categoriaId` las trae TODAS: así se cuentan por categoría. */
  listCaracteristicas(categoriaId: number | null, soloActivas: boolean = true): Observable<any> {
    let params = new HttpParams().set('activos', soloActivas ? '1' : '0');
    if (categoriaId) { params = params.set('categoria_id', String(categoriaId)); }

    return this._http.get(this.URL_SERVICIOS + 'listCaracteristicas', { params });
  }

  //   ******   BUSCAR POR ID   ******  //
  findByIdCaracteristica(id: any): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'findByIdCaracteristica/' + id);
  }

  //   ******   CREAR   ******  //
  addCaracteristica(data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'addCaracteristica', data);
  }

  //   ******   MODIFICAR   ******  //
  editCaracteristica(id: any, data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'editCaracteristica/' + id, data);
  }

  //   ******   ACTIVAR / DESACTIVAR   ******  //
  /** Sin `activo` alterna; con él, lo deja como se diga. */
  activarCaracteristica(id: any, activo?: boolean): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'activarCaracteristica/' + id,
                           activo === undefined ? {} : { activo });
  }

  //   ******   REQUERIDA / OPCIONAL   ******  //
  /**
   * La misma palanca que `activo`, pero para otra pregunta: aquélla dice si
   * se pide, ésta si el producto se puede guardar sin ella.
   *
   * Sin `requerido` alterna; con él, lo deja como se diga. El mensaje que
   * contesta el servidor avisa de cuántos productos de esa categoría la
   * tienen vacía, que son los que dejarán de poder guardarse.
   */
  requeridoCaracteristica(id: any, requerido?: boolean): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'requeridoCaracteristica/' + id,
                           requerido === undefined ? {} : { requerido });
  }

  //   ******   CAMBIAR EL ORDEN   ******  //
  /**
   * Los ids EN EL ORDEN NUEVO, al arrastrar las filas de la rejilla.
   *
   * Todos tienen que ser de la misma categoría: el orden es dentro de su
   * lista. Se mandan sólo las filas que se ven (la página) y el servidor
   * reparte entre ellas los números de orden que ya ocupaban.
   */
  ordenarCaracteristicas(ids: number[]): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'ordenarCaracteristicas', { ids });
  }

  //   ******   A LA PAPELERA   ******  //
  deleteCaracteristica(id: any): Observable<any> {
    return this._http.delete(this.URL_SERVICIOS + 'deleteCaracteristica/' + id);
  }

  // ================================================================
  // PAPELERA DE RECICLAJE
  // ================================================================

  papelera(): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'papelera');
  }

  restaurarCaracteristicas(ids: number[]): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'restaurar', { ids });
  }

  eliminarDefinitivo(ids: number[]): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'eliminarDefinitivo', { ids });
  }

  /** OJO: no lleva ids, vacía la papelera ENTERA. */
  vaciarPapelera(): Observable<any> {
    return this._http.delete(this.URL_SERVICIOS + 'vaciarPapelera');
  }
}
