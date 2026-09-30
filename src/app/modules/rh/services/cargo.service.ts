import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

/**
 * Cargos (rh.cargos). Mismo esquema que UserService: la paginación y el
 * filtro los hace el servidor (rh.fn_cargos_listar_paginado).
 */
@Injectable({
  providedIn: 'root',
})
export class CargoService {

  private URL_SERVICIOS: string;

  constructor(
    private _http: HttpClient,
  ) {
    this.URL_SERVICIOS = environment.URL_SERVICIOS + 'rh/cargo/';
  }

  //   ******   LISTADO CON PAGINACIÓN   ******  //
  allCargos(page: number = 1, perPage: number = 10, search: string = ''): Observable<any> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('per_page', perPage.toString());
    if (search) {
      params = params.set('search', search);
    }
    // observe: 'response' como en allUsers: el componente lee res.body
    return this._http.get<any>(this.URL_SERVICIOS + 'allCargos', { params, observe: 'response' });
  }

  //   ******   LISTADO SIMPLE (combos / selector)   ******  //
  listCargos(soloActivos: boolean = true): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'listCargos', { params: new HttpParams().set('activos', soloActivos ? '1' : '0') });
  }

  //   ******   CREAR   ******  //
  addCargo(data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'addCargo', data);
  }

  //   ******   CLONAR (mismo endpoint que crear)   ******  //
  clonCargo(data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'addCargo', data);
  }

  //   ******   EDITAR   ******  //
  editCargo(id: any, data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'editCargo/' + id, data);
  }

  //   ******   ELIMINAR   ******  //
  deleteCargo(id: any): Observable<any> {
    return this._http.delete(this.URL_SERVICIOS + 'deleteCargo/' + id);
  }

  //   ******   BUSCAR POR ID   ******  //
  findByIdCargo(id: any): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'findByIdCargo/' + id);
  }
}
