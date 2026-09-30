import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

/**
 * Departamentos (rh.departamentos). Mismo esquema que CargoService: la
 * paginación y el filtro los hace el servidor (rh.fn_departamentos_listar_paginado).
 */
@Injectable({
  providedIn: 'root',
})
export class DepartamentoService {

  private URL_SERVICIOS: string;

  constructor(
    private _http: HttpClient,
  ) {
    this.URL_SERVICIOS = environment.URL_SERVICIOS + 'rh/departamento/';
  }

  //   ******   LISTADO CON PAGINACIÓN   ******  //
  allDepartamentos(page: number = 1, perPage: number = 10, search: string = ''): Observable<any> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('per_page', perPage.toString());
    if (search) {
      params = params.set('search', search);
    }
    return this._http.get<any>(this.URL_SERVICIOS + 'allDepartamentos', { params, observe: 'response' });
  }

  //   ******   LISTADO SIMPLE (combos / selector)   ******  //
  listDepartamentos(soloActivos: boolean = true): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'listDepartamentos', { params: new HttpParams().set('activos', soloActivos ? '1' : '0') });
  }

  //   ******   RESPONSABLES (empleados activos para el combo)   ******  //
  listResponsables(): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'listResponsables');
  }

  //   ******   CREAR   ******  //
  addDepartamento(data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'addDepartamento', data);
  }

  //   ******   CLONAR (mismo endpoint que crear)   ******  //
  clonDepartamento(data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'addDepartamento', data);
  }

  //   ******   EDITAR   ******  //
  editDepartamento(id: any, data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'editDepartamento/' + id, data);
  }

  //   ******   ELIMINAR   ******  //
  deleteDepartamento(id: any): Observable<any> {
    return this._http.delete(this.URL_SERVICIOS + 'deleteDepartamento/' + id);
  }

  //   ******   BUSCAR POR ID   ******  //
  findByIdDepartamento(id: any): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'findByIdDepartamento/' + id);
  }
}
