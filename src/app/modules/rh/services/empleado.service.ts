import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

interface ApiResponseFoto {
  code: number;
  status: 'success' | 'error';
  message: string;
  data: { foto: string; full_path: string };
}

/**
 * Empleados (rh.empleados). Mismo esquema que UserService, foto incluida:
 * addImagen sube el fichero y getEmpleadoImage da la url para el <img>.
 */
@Injectable({
  providedIn: 'root',
})
export class EmpleadoService {

  private URL_SERVICIOS: string;

  constructor(
    private _http: HttpClient,
  ) {
    this.URL_SERVICIOS = environment.URL_SERVICIOS + 'rh/empleado/';
  }

  //   ******   LISTADO CON PAGINACIÓN   ******  //
  allEmpleados(page: number = 1, perPage: number = 10, search: string = ''): Observable<any> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('per_page', perPage.toString());
    if (search) {
      params = params.set('search', search);
    }
    return this._http.get<any>(this.URL_SERVICIOS + 'allEmpleados', { params, observe: 'response' });
  }

  //   ******   LISTADO SIMPLE (selector / jefe)   ******  //
  listEmpleados(soloActivos: boolean = true): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'listEmpleados', { params: new HttpParams().set('activos', soloActivos ? '1' : '0') });
  }

  //   ******   CREAR   ******  //
  addEmpleado(data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'addEmpleado', data);
  }

  //   ******   CLONAR (mismo endpoint que crear)   ******  //
  clonEmpleado(data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'addEmpleado', data);
  }

  //   ******   EDITAR   ******  //
  editEmpleado(id: any, data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'editEmpleado/' + id, data);
  }

  //   ******   ELIMINAR   ******  //
  deleteEmpleado(id: any): Observable<any> {
    return this._http.delete(this.URL_SERVICIOS + 'deleteEmpleado/' + id);
  }

  //   ******   BUSCAR POR ID   ******  //
  findByIdEmpleado(id: any): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'findByIdEmpleado/' + id);
  }

  //   ******   AGREGAR FOTO   ******  //
  addImagen(data: FormData): Observable<ApiResponseFoto> {
    return this._http.post<ApiResponseFoto>(this.URL_SERVICIOS + 'addImagen', data);
  }

  //   ******   URL DE LA FOTO   ******  //
  getEmpleadoImage(empleadoId: number, avoidCache = false): string {
    let url = `${this.URL_SERVICIOS}getImagenEmpleado/${empleadoId}`;
    if (avoidCache) {
      url += `?t=${Date.now()}`;
    }
    return url;
  }
}
