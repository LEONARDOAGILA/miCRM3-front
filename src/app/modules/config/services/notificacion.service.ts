import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { NotificacionEnviar } from '../interfaces/notificacionModel';

/**
 * Notificaciones (core.notificaciones). El back llama a las funciones
 * core.fn_notificaciones_*.
 *
 * Dos usos en el mismo sitio: la administración (enviar, listar, eliminar) y
 * la campana de cada usuario, que es lo que se pide cien veces al día.
 */
@Injectable({
  providedIn: 'root',
})
export class NotificacionService {

  private URL_SERVICIOS: string;

  constructor(private _http: HttpClient) {
    this.URL_SERVICIOS = environment.URL_SERVICIOS + 'config/notificacion/';
  }

  //   ******   ADMINISTRACIÓN   ******  //
  allNotificaciones(page: number = 1, perPage: number = 15, search: string = '', tipo: string = 'TODOS'): Observable<any> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('per_page', perPage.toString())
      .set('tipo', tipo || 'TODOS');
    if (search) { params = params.set('search', search); }
    return this._http.get<any>(this.URL_SERVICIOS + 'allNotificaciones', { params, observe: 'response' });
  }

  findByIdNotificacion(id: number | string): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'findByIdNotificacion/' + id);
  }

  /** Quién la recibió y quién la ha leído. */
  destinatarios(id: number | string): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'destinatarios/' + id);
  }

  enviarNotificacion(data: NotificacionEnviar): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'enviarNotificacion', data);
  }

  deleteNotificacion(id: number | string): Observable<any> {
    return this._http.delete(this.URL_SERVICIOS + 'deleteNotificacion/' + id);
  }

  //   ******   LA CAMPANA   ******  //
  /** Las del usuario de la sesión, de la más reciente a la más vieja. */
  misNotificaciones(soloNoLeidas = false, limite = 20, desplazamiento = 0): Observable<any> {
    const params = new HttpParams()
      .set('solo_no_leidas', soloNoLeidas ? '1' : '0')
      .set('limite', limite.toString())
      .set('desplazamiento', desplazamiento.toString());
    return this._http.get(this.URL_SERVICIOS + 'misNotificaciones', { params });
  }

  /** Sólo el número que lleva la campana. */
  contador(): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'contador');
  }

  /** Sin ids, marca todas las del usuario. */
  marcarLeidas(ids?: (number | string)[]): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'marcarLeidas', ids?.length ? { ids } : {});
  }

  /** Quitar de la campana (no borra la notificación de los demás). */
  archivar(ids?: (number | string)[]): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'archivar', ids?.length ? { ids } : {});
  }
}
