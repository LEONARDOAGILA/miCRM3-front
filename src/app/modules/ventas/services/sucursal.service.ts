import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

/** Una esquina del perímetro. */
export interface PuntoSucursal {
  lat: number;
  lng: number;
}

/** Sucursal (ventas.sucursales), tal como la devuelve fn_sucursales_json. */
export interface SucursalModel {
  id: number;
  codigo: string;
  nombre: string;
  /** La que devuelve Google al buscar o al pulsar el mapa */
  direccion?: string | null;
  /** La escrita a mano, con referencias. Google nunca la toca. */
  direccion_completa?: string | null;
  telefono?: string | null;
  email?: string | null;

  /** POLIGONO o CIRCULO */
  tipo: string;
  color: string;
  vertices?: PuntoSucursal[] | null;
  centro_lat?: number | null;
  centro_lng?: number | null;
  radio_metros?: number | null;
  /** Margen para el error del GPS, en metros */
  tolerancia_metros: number;

  // ---------- El punto de la sucursal (la puerta) ----------
  latitud?: number | null;
  longitud?: number | null;
  /** «-2.896541, -79.003780», ya formateado por la base */
  coordenadas?: string | null;
  /** El enlace de Google Maps al punto; lo arma la base al guardar */
  link_ubicacion?: string | null;

  // ---------- Las imágenes ----------
  /** Nombre del fichero de la foto del local */
  foto?: string | null;
  /** Nombre del fichero de la captura del mapa */
  mapa_foto?: string | null;
  tiene_foto?: boolean;
  tiene_mapa?: boolean;

  /** Lo calcula el servidor: si de verdad hay un perímetro dibujado */
  tiene_perimetro: boolean;
  num_vertices: number;
  num_empleados: number;

  activo: boolean;
  estado: string;

  deleted_at?: string | null;
  deleted_by?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

/**
 * Sucursales con su perímetro (ventas.sucursales).
 *
 * Mismo esquema que MarcaService: la paginación y los filtros los hace el
 * servidor (ventas.fn_sucursales_listar_paginado), y la pantalla sólo tiene
 * las filas de su página.
 */
@Injectable({
  providedIn: 'root',
})
export class SucursalService {

  private URL_SERVICIOS: string;

  constructor(
    private _http: HttpClient,
  ) {
    this.URL_SERVICIOS = environment.URL_SERVICIOS + 'ventas/sucursal/';
  }

  //   ******   LISTADO CON PAGINACIÓN   ******  //
  allSucursales(page: number = 1, perPage: number = 10, search: string = '',
                filtros: any = null): Observable<any> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('per_page', perPage.toString());

    if (search) { params = params.set('search', search); }

    // El modelo de filtros de columna de ag-Grid, en JSON. Se aplica en el
    // servidor, sobre todas las sucursales: la rejilla sólo tiene la página.
    if (filtros && Object.keys(filtros).length) {
      params = params.set('filtros', JSON.stringify(filtros));
    }

    // observe: 'response' como en allMarcas: el componente lee res.body
    return this._http.get<any>(this.URL_SERVICIOS + 'allSucursales', { params, observe: 'response' });
  }

  //   ******   LISTADO SIMPLE (combos / asignar a un empleado)   ******  //
  listSucursales(soloActivas: boolean = true): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'listSucursales',
                          { params: new HttpParams().set('activas', soloActivas ? '1' : '0') });
  }

  findByIdSucursal(id: any): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'findByIdSucursal/' + id);
  }

  addSucursal(data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'addSucursal', data);
  }

  /** Clonar usa el mismo extremo que crear. */
  clonSucursal(data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'addSucursal', data);
  }

  editSucursal(id: any, data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'editSucursal/' + id, data);
  }

  /** Sin `activo` alterna; con él, lo deja como se diga. */
  activarSucursal(id: any, activo?: boolean): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'activarSucursal/' + id,
                           activo === undefined ? {} : { activo });
  }

  deleteSucursal(id: any): Observable<any> {
    return this._http.delete(this.URL_SERVICIOS + 'deleteSucursal/' + id);
  }

  /**
   * ¿Ese punto cae dentro del perímetro?
   *
   * Es el MISMO cálculo que decide si una marcación entra, así que sirve
   * para probar el dibujo sin tener que ir hasta la puerta.
   */
  probarPunto(id: any, latitud: number, longitud: number): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'probarPunto/' + id, { latitud, longitud });
  }

  // ================================================================
  // LAS IMÁGENES: LA FOTO DEL LOCAL Y LA CAPTURA DEL MAPA
  // ================================================================
  //
  // `campo` es 'foto' (el local) o 'mapa' (la captura con el perímetro). Se
  // suben DESPUÉS de guardar, porque el fichero necesita el id de la
  // sucursal, igual que el logo de una marca.

  addFoto(data: FormData): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'addFoto', data);
  }

  /**
   * La url para un `<img src>`.
   *
   * Va sin cabecera de autorización —un <img> no la manda—, así que la ruta
   * está fuera del grupo con jwt. `refrescar` añade un parámetro para saltarse
   * la caché del navegador cuando se acaba de cambiar la imagen.
   */
  urlFoto(id: number | string, campo: 'foto' | 'mapa', refrescar: boolean = false): string {
    return this.URL_SERVICIOS + 'getFoto/' + id + '/' + campo + (refrescar ? '?v=' + Date.now() : '');
  }

  quitarFoto(id: number | string, campo: 'foto' | 'mapa'): Observable<any> {
    return this._http.delete(this.URL_SERVICIOS + 'quitarFoto/' + id + '/' + campo);
  }

  // ================================================================
  // PAPELERA DE RECICLAJE
  // ================================================================

  papelera(): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'papelera');
  }

  restaurarSucursales(ids: number[]): Observable<any> {
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
