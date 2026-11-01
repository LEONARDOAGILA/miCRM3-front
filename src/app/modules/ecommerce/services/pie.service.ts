import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

/**
 * El pie de la tienda: las redes sociales y las columnas con sus enlaces.
 *
 * Como en el encabezado, TODO DEVUELVE EL PIE ENTERO —también crear, borrar y
 * ordenar—: son tres columnas con doce enlaces y cualquier cambio puede mover
 * el orden de otra rama. La pantalla se limita a pintar lo que llega.
 */
@Injectable({
  providedIn: 'root',
})
export class PieService {

  private URL_SERVICIOS: string;

  constructor(
    private _http: HttpClient,
  ) {
    this.URL_SERVICIOS = environment.URL_SERVICIOS + 'ecommerce/pie/';
  }

  /** Configuración, columnas y enlaces de un tirón. */
  getPie(): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'getPie');
  }

  /** Sólo las redes; las columnas tienen sus propias llamadas. */
  editPie(config: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'editPie', { config });
  }

  // ---------- Columnas ----------

  addColumna(data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'addColumna', data);
  }

  editColumna(id: any, data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'editColumna/' + id, data);
  }

  /** Se lleva sus enlaces; restaurarla los devuelve. */
  deleteColumna(id: any): Observable<any> {
    return this._http.delete(this.URL_SERVICIOS + 'deleteColumna/' + id);
  }

  ordenarColumnas(ids: number[]): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'ordenarColumnas', { ids });
  }

  // ---------- Enlaces ----------

  /** `columna_id` sólo al crear: mover de columna es arrastrar, no editar. */
  addEnlace(data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'addEnlace', data);
  }

  editEnlace(id: any, data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'editEnlace/' + id, data);
  }

  deleteEnlace(id: any): Observable<any> {
    return this._http.delete(this.URL_SERVICIOS + 'deleteEnlace/' + id);
  }

  ordenarEnlaces(ids: number[]): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'ordenarEnlaces', { ids });
  }

  // ---------- Papelera (una sola, para columnas y enlaces) ----------

  papelera(): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'papelera');
  }

  /** El servidor se niega a devolver un enlace si su columna sigue borrada. */
  restaurar(tipo: 'columna' | 'enlace', id: number): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'restaurar', { tipo, id });
  }

  vaciarPapelera(): Observable<any> {
    return this._http.delete(this.URL_SERVICIOS + 'vaciarPapelera');
  }
}
