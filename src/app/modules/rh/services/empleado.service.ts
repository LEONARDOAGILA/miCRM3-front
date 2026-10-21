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

    //   ******   ACTIVAR / DESACTIVAR (solo esa columna)   ******  //
  // No pasa por editEmpleado: el servidor tiene una funcion que escribe solo
  // `activo`. Sin `activo` alterna, pero la pantalla manda el valor que
  // quiere para que dos personas pulsando a la vez no se peleen.
  activarEmpleado(id: any, activo?: boolean): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'activarEmpleado/' + id,
                           activo === undefined ? {} : { activo });
  }

  //   ******   DÓNDE TRABAJA: LA SUCURSAL   ******  //
  // Va aparte de editEmpleado porque la ficha tiene treinta campos y esto se
  // cambia solo, desde la rejilla, cuando alguien cambia de local. Mandar
  // `sucursalId` nulo se la quita, y entonces esa persona puede marcar
  // asistencia desde cualquier lugar.
  asignarSucursal(id: any, sucursalId: number | null): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'asignarSucursal/' + id,
                           { sucursal_id: sucursalId });
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

  //   ******   CONTACTOS DE EMERGENCIA   ******  //
  listContactos(empleadoId: any): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'listContactos/' + empleadoId);
  }

  /** Manda la lista completa: el back inserta, actualiza y elimina lo que falte. */
  guardarContactos(empleadoId: any, contactos: any[]): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'guardarContactos/' + empleadoId, { contactos });
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

  //   ******   UBICACIÓN (la dirección que trae el mapa)   ******  //

  /** Los doce campos que devuelve el mapa, en una sola llamada. */
  guardarUbicacion(empleadoId: number, datos: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'guardarUbicacion/' + empleadoId, datos);
  }

  /** Una de las dos capturas: la vista del mapa o la de la calle. */
  addFotoUbicacion(data: FormData): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'addFotoUbicacion', data);
  }

  /** URL para el <img> de cada foto del mapa. */
  getFotoUbicacion(empleadoId: number, campo: 'mapa' | 'casa', avoidCache = false): string {
    let url = `${this.URL_SERVICIOS}getFotoUbicacion/${empleadoId}/${campo}`;
    if (avoidCache) {
      url += `?t=${Date.now()}`;
    }
    return url;
  }
}
