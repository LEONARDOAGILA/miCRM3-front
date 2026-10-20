import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { PuntoRecorrido } from '../interfaces/recorridoModel';

/** Criterio con el que se decide qué cuenta como parada. */
export interface CriterioParada {
  /** Metros: lecturas más cercanas que esto al ancla alargan la parada */
  radioParada: number;
  /** Minutos mínimos para que cuente */
  minutosParada: number;
  /** Metros: a qué distancia se busca un cliente de cada parada */
  radioCliente: number;
}

/**
 * Recorridos del cobrador.
 *
 * Todo el cálculo —metros, paradas, el cliente de cada parada— lo hace el
 * servidor. Aquí sólo viajan el cobrador, el día y el criterio de parada.
 */
@Injectable({ providedIn: 'root' })
export class RecorridoService {

  private URL_SERVICIOS: string;

  constructor(private _http: HttpClient) {
    this.URL_SERVICIOS = environment.URL_SERVICIOS + 'ventas/recorrido/';
  }

  /**
   * Quiénes dejaron rastro en el rango.
   *
   * No lista «los cobradores» sino «los que tienen recorrido»: un desplegable
   * con cuarenta nombres de los que treinta y ocho no mandaron nada obliga a
   * ir probando uno por uno.
   */
  cobradores(desde?: string, hasta?: string): Observable<any> {
    let params = new HttpParams();
    if (desde) { params = params.set('desde', desde); }
    if (hasta) { params = params.set('hasta', hasta); }
    return this._http.get<any>(this.URL_SERVICIOS + 'cobradores', { params });
  }

  /** Qué días anduvo, con los kilómetros de cada uno. */
  dias(usuarioId: number, desde?: string, hasta?: string): Observable<any> {
    let params = new HttpParams();
    if (desde) { params = params.set('desde', desde); }
    if (hasta) { params = params.set('hasta', hasta); }
    return this._http.get<any>(this.URL_SERVICIOS + 'dias/' + usuarioId, { params });
  }

  /** El recorrido de un día: puntos, resumen y paradas. */
  delDia(usuarioId: number, fecha: string, criterio?: Partial<CriterioParada>): Observable<any> {
    let params = new HttpParams().set('fecha', fecha);
    if (criterio?.radioParada != null)   { params = params.set('radio_parada', String(criterio.radioParada)); }
    if (criterio?.minutosParada != null) { params = params.set('minutos_parada', String(criterio.minutosParada)); }
    if (criterio?.radioCliente != null)  { params = params.set('radio_cliente', String(criterio.radioCliente)); }
    return this._http.get<any>(this.URL_SERVICIOS + 'delDia/' + usuarioId, { params });
  }

  /**
   * Sube un lote de posiciones. Lo usa el celular del propio cobrador.
   *
   * El servidor escribe sobre el usuario del token, nunca sobre uno que venga
   * en el cuerpo. Reenviar el mismo lote no duplica nada, así que ante un
   * error de red se puede reintentar sin pensarlo.
   */
  registrar(puntos: Partial<PuntoRecorrido>[], dispositivo?: string): Observable<any> {
    return this._http.post<any>(this.URL_SERVICIOS + 'registrar', { puntos, dispositivo });
  }
}
