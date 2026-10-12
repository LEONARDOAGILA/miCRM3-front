import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { ClienteDeZona, ZonaModel, ZonaParaGuardar } from '../interfaces/zonaModel';

/** Lo que devuelve «los clientes de esta zona». */
export interface ClientesDeZona {
  data: ClienteDeZona[];
  zona: ZonaModel;
  meta: { total: number; per_page: number; current_page: number; last_page: number };
}

/**
 * Zonas de clientes.
 *
 * Toda la geometría la resuelve el servidor: aquí sólo viaja la forma que se
 * dibujó y vuelve la lista de quién cae dentro.
 */
@Injectable({ providedIn: 'root' })
export class ZonaService {

  private URL_SERVICIOS: string;

  constructor(private _http: HttpClient) {
    this.URL_SERVICIOS = environment.URL_SERVICIOS + 'ventas/zona/';
  }

  /** Todas las zonas, con cuántos clientes tiene cada una. */
  allZonas(incluirInactivas = true): Observable<any> {
    const params = new HttpParams().set('inactivas', incluirInactivas ? '1' : '0');
    return this._http.get<any>(this.URL_SERVICIOS + 'allZonas', { params });
  }

  findByIdZona(id: number): Observable<any> {
    return this._http.get<any>(this.URL_SERVICIOS + 'findByIdZona/' + id);
  }

  /**
   * Los clientes que caen dentro.
   *
   * Cada uno trae sus coordenadas ya partidas en números, para poder pintar
   * un marcador sin pedir la ficha.
   */
  clientesDeZona(id: number, page = 1, perPage = 200, search = ''): Observable<any> {
    let params = new HttpParams()
      .set('page', String(page))
      .set('per_page', String(perPage));
    if (search) { params = params.set('search', search); }
    return this._http.get<any>(this.URL_SERVICIOS + 'clientes/' + id, { params });
  }

  /**
   * Todos los clientes con coordenadas, para pintarlos en el mapa.
   *
   * Sólo id, nombre, activo y el punto: son mil, y traerse la ficha de cada
   * uno sería mover un megabyte para dibujar puntitos.
   */
  clientesUbicados(limite = 2000): Observable<any> {
    const params = new HttpParams().set('limite', String(limite));
    return this._http.get<any>(this.URL_SERVICIOS + 'clientesUbicados', { params });
  }

  /** Sin id es un alta; con id, una modificación. */
  saveZona(zona: ZonaParaGuardar, id: number | null = null): Observable<any> {
    const url = this.URL_SERVICIOS + 'saveZona' + (id ? '/' + id : '');
    return this._http.post<any>(url, zona);
  }

  deleteZona(id: number): Observable<any> {
    return this._http.delete<any>(this.URL_SERVICIOS + 'deleteZona/' + id);
  }
}
