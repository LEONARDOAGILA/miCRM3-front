import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

/**
 * Puntos de venta: las cajas de cada sucursal (core.puntos_venta).
 *
 * Sin paginación a propósito: una empresa tiene decenas de cajas, no miles,
 * y se miran agrupadas por tienda.
 *
 * LAS CUENTAS NO SE GUARDAN POR AQUÍ. Son las mismas de siempre
 * (CuentaConfigService con ámbito PUNTO_VENTA), que es lo que usan también
 * las categorías y los grupos de clientes: un solo mecanismo, un solo sitio
 * donde arreglarlo.
 */
@Injectable({
  providedIn: 'root',
})
export class PuntoVentaService {

  private URL_SERVICIOS: string;

  constructor(
    private _http: HttpClient,
  ) {
    this.URL_SERVICIOS = environment.URL_SERVICIOS + 'core/puntoVenta/';
  }

  //   ******   TODAS, AGRUPADAS POR SUCURSAL   ******  //
  /** Cada una trae cuántas cuentas le faltan por resolver. */
  allPuntosVenta(soloActivos: boolean = false, sucursalId: number | null = null): Observable<any> {
    let params = new HttpParams().set('activos', soloActivos ? '1' : '0');
    if (sucursalId) { params = params.set('sucursal_id', String(sucursalId)); }
    return this._http.get<any>(this.URL_SERVICIOS + 'allPuntosVenta', { params, observe: 'response' });
  }

  //   ******   LO MISMO, PARA LOS COMBOS   ******  //
  listPuntosVenta(soloActivos: boolean = true, sucursalId: number | null = null): Observable<any> {
    let params = new HttpParams().set('activos', soloActivos ? '1' : '0');
    if (sucursalId) { params = params.set('sucursal_id', String(sucursalId)); }
    return this._http.get(this.URL_SERVICIOS + 'listPuntosVenta', { params });
  }

  findByIdPuntoVenta(id: any): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'findByIdPuntoVenta/' + id);
  }

  //   ******   QUÉ CÓDIGO Y QUÉ NÚMERO LE TOCAN   ******  //
  /**
   * El siguiente libre de esa sucursal, para que dar de alta una caja sea
   * escribir un nombre. El código se arma con el de la sucursal (LC2-03) y
   * se comprueba que no esté cogido, ni siquiera por uno de la papelera.
   */
  sugerencia(sucursalId: number): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'sugerencia',
                          { params: new HttpParams().set('sucursal_id', String(sucursalId)) });
  }

  //   ******   CREAR   ******  //
  addPuntoVenta(data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'addPuntoVenta', data);
  }

  //   ******   CLONAR (mismo endpoint que crear)   ******  //
  clonPuntoVenta(data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'addPuntoVenta', data);
  }

  //   ******   EDITAR   ******  //
  editPuntoVenta(id: any, data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'editPuntoVenta/' + id, data);
  }

  //   ******   ACTIVAR / DESACTIVAR (sólo esa columna)   ******  //
  activarPuntoVenta(id: any, activo?: boolean): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'activarPuntoVenta/' + id,
                           activo === undefined ? {} : { activo });
  }

  //   ******   A LA PAPELERA   ******  //
  deletePuntoVenta(id: any): Observable<any> {
    return this._http.delete(this.URL_SERVICIOS + 'deletePuntoVenta/' + id);
  }

  //   ******   PAPELERA DE RECICLAJE   ******  //
  papelera(): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'papelera');
  }

  restaurarPuntosVenta(ids: number[]): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'restaurarPuntosVenta', { ids });
  }

  /**
   * Borrado real (pide el permiso «vaciar»).
   *
   * SE LLEVA LAS CUENTAS CONFIGURADAS de la caja: contabilidad.cuentas_config
   * apunta al punto de venta por ámbito e id, que no es una clave ajena, así
   * que las borra la función de base a mano.
   */
  eliminarDefinitivo(ids: number[]): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'eliminarDefinitivo', { ids });
  }

  vaciarPapelera(): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'vaciarPapelera', {});
  }
}
