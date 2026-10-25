import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AmbitoContable, ValorCuenta } from '../interfaces/cuentaConfigModel';

/**
 * Qué cuenta contable usa cada cosa (contabilidad.cuentas_config).
 *
 * Sin paginación, como el árbol de cuentas: las categorías vienen enteras y
 * en el orden en que se dibujan.
 */
@Injectable({
  providedIn: 'root',
})
export class CuentaConfigService {

  private URL_SERVICIOS: string;

  constructor(
    private _http: HttpClient,
  ) {
    this.URL_SERVICIOS = environment.URL_SERVICIOS + 'contabilidad/cuentaConfig/';
  }

  //   ******   LOS CONCEPTOS: qué cuentas se piden y de qué tipo   ******  //
  conceptos(ambito?: AmbitoContable): Observable<any> {
    let params = new HttpParams();
    if (ambito) { params = params.set('ambito', ambito); }
    return this._http.get(this.URL_SERVICIOS + 'conceptos', { params });
  }

  //   ******   EL ÁRBOL DE CATEGORÍAS CON SUS CUENTAS   ******  //
  categorias(soloTransaccion: boolean = false): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'categorias', {
      params: new HttpParams().set('transaccion', soloTransaccion ? '1' : '0'),
    });
  }

  //   ******   LA FICHA: lo propio y lo efectivo   ******  //
  obtener(ambito: AmbitoContable, id?: number | null): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'obtener/' + ambito + (id != null ? '/' + id : ''));
  }

  //   ******   GUARDAR   ******  //
  /**
   * `cuentas` es {CONCEPTO: valor}, y el valor dice una de tres cosas:
   *
   *   · un id          la cuenta que usa;
   *   · null           quitar la propia y volver a heredar;
   *   · 'NO_APLICA'    aquí este concepto no existe, y no se hereda nada.
   *
   * Lo que no se mande no se toca.
   */
  guardar(ambito: AmbitoContable, id: number | null, cuentas: Record<string, ValorCuenta>): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'guardar/' + ambito + (id != null ? '/' + id : ''), { cuentas });
  }
}
