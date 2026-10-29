import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

/**
 * El DICCIONARIO de nombres de característica
 * (inventarios.caracteristicas_nombres).
 *
 * El nombre, su unidad y su tipo de dato se definen aquí una sola vez; las
 * categorías lo escogen de un combo (`listCaracteristicasNombres`) y la ficha
 * del producto lo usa para saber qué campo pintar.
 *
 * Mismo esquema que MarcaService: la paginación y los filtros los hace el
 * servidor (inventarios.fn_caracteristicas_nombres_listar_paginado).
 */
@Injectable({
  providedIn: 'root',
})
export class CaracteristicaNombreService {

  private URL_SERVICIOS: string;

  constructor(
    private _http: HttpClient,
  ) {
    this.URL_SERVICIOS = environment.URL_SERVICIOS + 'inventarios/caracteristicaNombre/';
  }

  //   ******   LISTADO CON PAGINACIÓN   ******  //
  allCaracteristicasNombres(page: number = 1, perPage: number = 10, search: string = '',
                            filtros: any = null): Observable<any> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('per_page', perPage.toString());

    if (search) { params = params.set('search', search); }

    // El modelo de filtros de columna de ag-Grid, en JSON. Se aplica en el
    // servidor, sobre todas las filas: la rejilla sólo tiene la página.
    if (filtros && Object.keys(filtros).length) {
      params = params.set('filtros', JSON.stringify(filtros));
    }

    // observe: 'response' como en allMarcas: el componente lee res.body
    return this._http.get<any>(this.URL_SERVICIOS + 'allCaracteristicasNombres', { params, observe: 'response' });
  }

  //   ******   EL DICCIONARIO ENTERO (el combo)   ******  //
  /**
   * Lo que se ofrece al definir una característica de categoría o una suelta
   * del producto. Sin `soloActivos` salen también los apagados, que es lo que
   * hace falta para enseñar el nombre de uno que ya está puesto.
   */
  listCaracteristicasNombres(soloActivos: boolean = true): Observable<any> {
    const params = new HttpParams().set('activos', soloActivos ? '1' : '0');
    return this._http.get(this.URL_SERVICIOS + 'listCaracteristicasNombres', { params });
  }

  //   ******   BUSCAR POR ID   ******  //
  findByIdCaracteristicaNombre(id: any): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'findByIdCaracteristicaNombre/' + id);
  }

  //   ******   CREAR   ******  //
  addCaracteristicaNombre(data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'addCaracteristicaNombre', data);
  }

  //   ******   MODIFICAR   ******  //
  editCaracteristicaNombre(id: any, data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'editCaracteristicaNombre/' + id, data);
  }

  //   ******   ACTIVAR / DESACTIVAR   ******  //
  /** Sin `activo` alterna; con él, lo deja como se diga. */
  activarCaracteristicaNombre(id: any, activo?: boolean): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'activarCaracteristicaNombre/' + id,
                           activo === undefined ? {} : { activo });
  }

  //   ******   A LA PAPELERA   ******  //
  /** El servidor se niega si el nombre está en uso, y dice en cuántas categorías. */
  deleteCaracteristicaNombre(id: any): Observable<any> {
    return this._http.delete(this.URL_SERVICIOS + 'deleteCaracteristicaNombre/' + id);
  }

  // ================================================================
  // PAPELERA DE RECICLAJE
  // ================================================================

  papelera(): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'papelera');
  }

  restaurarCaracteristicasNombres(ids: number[]): Observable<any> {
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
