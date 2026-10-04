import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { RolResponsable } from '../interfaces/gestionModel';

/** Filtros de la grilla de gestiones. */
export interface FiltrosGestion {
  tipo?: string | null;
  estado?: string | null;
  /** Cómo terminó: CONTACTADO, NO_CONTESTA… */
  resultado?: string | null;
  /** El login de quien la registró (gestiones.created_by) */
  creado_por?: string | null;
  desde?: string | null;
  hasta?: string | null;
}

/** Filtros de la agenda («Lo que toca hacer»). */
export interface FiltrosAgenda {
  /** Sólo lo que programó el usuario que está usando el CRM */
  mias?: boolean;
  /** Sólo lo que ya se pasó de hora */
  soloVencidas?: boolean;
  /** La agenda de un vendedor concreto */
  empleadoId?: number | null;
  /** AAAA-MM-DD */
  desde?: string | null;
  hasta?: string | null;
  limite?: number;

  // ---------- Sólo para la grilla (agendaPaginada) ----------
  /** Busca en asunto, nota, cliente, identificación y teléfono */
  search?: string;
  page?: number;
  perPage?: number;
}

/** Contadores que devuelve la agenda. */
export interface MetaAgenda {
  total: number;
  vencidas: number;
  hoy: number;
  mostradas: number;
  /** Los de la paginación; sólo vienen de agendaPaginada */
  per_page?: number;
  current_page?: number;
  last_page?: number;
  from?: number;
  to?: number;
}

/**
 * Gestiones con el cliente (ventas.gestiones): llamadas hechas, llamadas
 * programadas y reasignación de cartera. Mismo esquema que ClienteService.
 */
@Injectable({
  providedIn: 'root',
})
export class GestionService {

  private URL_SERVICIOS: string;

  constructor(
    private _http: HttpClient,
  ) {
    this.URL_SERVICIOS = environment.URL_SERVICIOS + 'ventas/gestion/';
  }

  //   ******   HISTORIAL DEL CLIENTE (paginado)   ******  //
  allGestiones(clienteId: number, page: number = 1, perPage: number = 10, search: string = '', filtros: FiltrosGestion = {}): Observable<any> {
    let params = new HttpParams()
      .set('cliente_id', String(clienteId ?? ''))
      .set('page', page.toString())
      .set('per_page', perPage.toString());
    if (search) { params = params.set('search', search); }
    if (filtros.tipo)   { params = params.set('tipo', filtros.tipo); }
    if (filtros.estado) { params = params.set('estado', filtros.estado); }
    if (filtros.resultado)  { params = params.set('resultado', filtros.resultado); }
    if (filtros.creado_por) { params = params.set('creado_por', filtros.creado_por); }
    if (filtros.desde)  { params = params.set('desde', filtros.desde); }
    if (filtros.hasta)  { params = params.set('hasta', filtros.hasta); }
    return this._http.get<any>(this.URL_SERVICIOS + 'allGestiones', { params, observe: 'response' });
  }

  //   ******   UNA GESTIÓN   ******  //
  findByIdGestion(id: any): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'findByIdGestion/' + id);
  }

  //   ******   CONTADORES DEL CLIENTE   ******  //
  resumen(clienteId: number): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'resumen/' + clienteId);
  }

  /**
   * Lo pendiente («Lo que toca hacer»).
   *
   * Con `mias` sólo devuelve lo que programó el usuario; sin filtros, lo de
   * todos. Responde { data: [...], meta: { total, vencidas, hoy, mostradas } }.
   */
  agenda(filtros: FiltrosAgenda = {}): Observable<any> {
    let params = new HttpParams().set('limite', String(filtros.limite ?? 200));
    if (filtros.mias) { params = params.set('mias', '1'); }
    if (filtros.soloVencidas) { params = params.set('vencidas', '1'); }
    if (filtros.empleadoId) { params = params.set('empleado_id', String(filtros.empleadoId)); }
    if (filtros.desde) { params = params.set('desde', filtros.desde); }
    if (filtros.hasta) { params = params.set('hasta', filtros.hasta); }
    return this._http.get(this.URL_SERVICIOS + 'agenda', { params });
  }

  /**
   * La misma agenda, pero de a una página y con buscador: es lo que pinta la
   * grilla de «Lo que toca hacer». Los contadores del meta (total, vencidas,
   * hoy) siguen siendo de todo el filtro, no de la página.
   */
  agendaPaginada(filtros: FiltrosAgenda = {}): Observable<any> {
    let params = new HttpParams()
      .set('page', String(filtros.page ?? 1))
      .set('per_page', String(filtros.perPage ?? 15));

    if (filtros.mias) { params = params.set('mias', '1'); }
    if (filtros.soloVencidas) { params = params.set('vencidas', '1'); }
    if (filtros.empleadoId) { params = params.set('empleado_id', String(filtros.empleadoId)); }
    if (filtros.desde) { params = params.set('desde', filtros.desde); }
    if (filtros.hasta) { params = params.set('hasta', filtros.hasta); }
    if (filtros.search) { params = params.set('search', filtros.search); }

    return this._http.get(this.URL_SERVICIOS + 'agendaPaginada', { params });
  }

  /**
   * El tablero que se ve cuando todavía no hay un cliente elegido.
   *
   * Una sola llamada: el back arma cartera, gestiones, lo del usuario y las
   * series en una función de PostgreSQL.
   */
  estadisticas(dias: number = 14): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'estadisticas', { params: new HttpParams().set('dias', String(dias)) });
  }

  //   ******   REGISTRAR / PROGRAMAR   ******  //
  addGestion(data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'addGestion', data);
  }

  editGestion(id: any, data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'editGestion/' + id, data);
  }

  /** Cierra una pendiente: queda realizada y, si viene `siguiente`, deja programado el seguimiento. */
  cerrarGestion(id: any, data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'cerrarGestion/' + id, data);
  }

  deleteGestion(id: any): Observable<any> {
    return this._http.delete(this.URL_SERVICIOS + 'deleteGestion/' + id);
  }

  //   ******   CARTERA   ******  //

  /** Cambia el vendedor del cliente y deja el movimiento en el historial. */
  reasignar(clienteId: number, data: { empleado_id: number | null; motivo?: string | null; mover_agenda?: boolean; rol?: RolResponsable }): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'reasignar/' + clienteId, data);
  }

  /** Quién atiende al cliente ahora mismo, en cada papel. */
  responsables(clienteId: number): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'responsables/' + clienteId);
  }

  asignaciones(clienteId: number): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'asignaciones/' + clienteId);
  }
}
