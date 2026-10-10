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
  /** El id del RESPONSABLE (gestiones.usuario_id): a quién le toca, no quién la registró */
  responsable_id?: number | null;
  desde?: string | null;
  hasta?: string | null;
}

/** Filtros de la agenda («Lo que toca hacer»). */
/** Lo que filtra la pantalla de reparto en bloque. */
export interface FiltrosAsignacion {
  page?: number;
  perPage?: number;
  /** El buscador de arriba: mira además en correo, teléfono y dirección */
  search?: string;
  /**
   * El modelo de filtros de columna de ag-Grid, tal cual lo da la rejilla.
   *
   *     { canton: { filterType: 'text', type: 'contains', filter: 'manta' } }
   *
   * Se manda al servidor y se aplica allí, sobre los mil, no sobre las veinte
   * filas que la rejilla tiene en la mano.
   */
  filtros?: any;
}

export interface FiltrosAgenda {
  /** Sólo lo que programó el usuario que está usando el CRM */
  mias?: boolean;
  /** Sólo lo que ya se pasó de hora */
  soloVencidas?: boolean;
  /** La agenda de un vendedor concreto, por su id de USUARIO */
  usuarioId?: number | null;
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
  /**
   * Si este usuario manda sobre alguien más (jefe de zona, supervisor,
   * administrador…). Sirve para no enseñarle el botón de «De mi equipo» a
   * quien no tiene equipo, porque no le cambiaría nada.
   *
   * Es una pista para la pantalla, NO el permiso: el límite lo pone siempre el
   * servidor con la jerarquía de grupos, pida lo que pida el navegador.
   */
  ve_de_otros?: boolean;

  /**
   * Si quien pregunta es administrador (es_administrador de su grupo).
   *
   * Viene aquí porque el login no lo dice —devuelve id, nombre, correo, avatar
   * y perfil, nada más— y estas funciones ya lo resuelven para recortar lo que
   * devuelven. Es la misma señal con la que el servidor cierra la ruta de
   * reasignar, así que pantalla y servidor miran lo mismo.
   */
  es_admin?: boolean;
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
    if (filtros.responsable_id) { params = params.set('responsable_id', String(filtros.responsable_id)); }
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
    if (filtros.usuarioId) { params = params.set('usuario_id', String(filtros.usuarioId)); }
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
    if (filtros.usuarioId) { params = params.set('usuario_id', String(filtros.usuarioId)); }
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
  /**
   * Las conversaciones que se trajeron de un fichero.
   *
   * Son gestiones con modo_registro = IMPORTADA. Van por su propia ruta y no
   * por allGestiones con un filtro: la pestaña de WhatsApp las enseña todas y
   * sin paginar, y buscarlas dentro del historial paginado obligaría a pedir
   * páginas hasta dar con ellas.
   */
  /**
   * A qué usuarios puede quien pregunta dejar una gestión a cargo: su equipo,
   * los responsables de ese cliente y él mismo (todos, si es administrador).
   *
   * El cliente importa: sin él la lista es sólo la jerarquía, y con él entra
   * el cobrador o el asistente del cliente aunque no estén por debajo.
   */
  asignables(clienteId: number | null): Observable<any> {
    const query = clienteId ? '?cliente_id=' + clienteId : '';
    return this._http.get(this.URL_SERVICIOS + 'asignables' + query);
  }

  importadas(clienteId: number): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'importadas/' + clienteId);
  }

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
  reasignar(clienteId: number, data: { usuario_id: number | null; motivo?: string | null; mover_agenda?: boolean; rol?: RolResponsable }): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'reasignar/' + clienteId, data);
  }

  /** Quién atiende al cliente ahora mismo, en cada papel. */
  responsables(clienteId: number): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'responsables/' + clienteId);
  }

  asignaciones(clienteId: number): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'asignaciones/' + clienteId);
  }

  //   ******   REPARTO EN BLOQUE   ******  //

  /**
   * Los clientes a repartir, con quién los tiene hoy en ese papel.
   *
   * `meta.ids` trae TODOS los que cumplen el filtro, no sólo los de la página:
   * es lo que permite «marcar los 991» sin recorrer cincuenta páginas.
   */
  clientesParaAsignar(filtros: FiltrosAsignacion = {}): Observable<any> {
    let params = new HttpParams()
      .set('page', String(filtros.page ?? 1))
      .set('per_page', String(filtros.perPage ?? 20));

    if (filtros.search) { params = params.set('search', filtros.search); }

    // En JSON y no como parámetros anidados: el modelo de ag-Grid cambia de
    // forma según la operación (filter, filterTo, condition1…) y aplanarlo
    // sería inventarse un formato que luego hay que deshacer en PHP
    if (filtros.filtros && Object.keys(filtros.filtros).length) {
      params = params.set('filtros', JSON.stringify(filtros.filtros));
    }

    return this._http.get(this.URL_SERVICIOS + 'clientesParaAsignar', { params });
  }

  /**
   * Reparte varios clientes de una vez.
   *
   * `destinos` vacío quita el responsable; con uno van todos a esa persona;
   * con varios se reparten por turnos.
   */
  reasignarMasivo(data: {
    ids: number[];
    destinos: number[];
    rol?: RolResponsable;
    motivo?: string | null;
    mover_agenda?: boolean;
  }): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'reasignarMasivo', data);
  }
}
