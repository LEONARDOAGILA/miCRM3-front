import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of, tap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { WhatsappPlantillaModel } from '../interfaces/whatsappPlantillaModel';

/**
 * Las plantillas de WhatsApp.
 *
 * `activas()` es lo que necesita el menú de gestión de clientes; el resto lo
 * usa la pantalla de mantenimiento.
 *
 * Mismo esquema que CatalogoGestionService, incluida la memoria: el menú las
 * pide cada vez que se pulsa el botón de WhatsApp —muchas veces al día— y
 * cambian de tarde en tarde. Quien las modifica llama a `olvidar()` y la
 * siguiente vez se vuelven a pedir, así que nadie trabaja con una lista vieja.
 */
@Injectable({ providedIn: 'root' })
export class WhatsappPlantillaService {

  private URL_SERVICIOS: string;

  private memoria: WhatsappPlantillaModel[] | null = null;

  constructor(private _http: HttpClient) {
    this.URL_SERVICIOS = environment.URL_SERVICIOS + 'ventas/whatsappPlantilla/';
  }

  // ================================================================
  // LO QUE USA EL MENÚ DE WHATSAPP
  // ================================================================

  /** Sólo las activas, en el orden en que se ofrecen. */
  activas(refrescar = false): Observable<any> {
    if (this.memoria && !refrescar) {
      return of({ status: 'success', message: 'Plantillas obtenidas exitosamente', data: this.memoria });
    }
    const params = new HttpParams().set('inactivos', '0');
    return this._http.get<any>(this.URL_SERVICIOS + 'allPlantillas', { params })
      .pipe(tap(res => { if (res?.status === 'success') { this.memoria = res.data ?? []; } }));
  }

  /** Lo llama el mantenimiento tras guardar o borrar. */
  olvidar(): void {
    this.memoria = null;
  }

  // ================================================================
  // MANTENIMIENTO
  // ================================================================

  /** Todas, activas e inactivas. */
  allPlantillas(): Observable<any> {
    return this._http.get<any>(this.URL_SERVICIOS + 'allPlantillas');
  }

  addPlantilla(data: Partial<WhatsappPlantillaModel>): Observable<any> {
    return this._http.post<any>(this.URL_SERVICIOS + 'addPlantilla', data)
      .pipe(tap(() => this.olvidar()));
  }

  editPlantilla(id: number, data: Partial<WhatsappPlantillaModel>): Observable<any> {
    return this._http.post<any>(this.URL_SERVICIOS + 'editPlantilla/' + id, data)
      .pipe(tap(() => this.olvidar()));
  }

  deletePlantilla(id: number): Observable<any> {
    return this._http.delete<any>(this.URL_SERVICIOS + 'deletePlantilla/' + id)
      .pipe(tap(() => this.olvidar()));
  }
}
