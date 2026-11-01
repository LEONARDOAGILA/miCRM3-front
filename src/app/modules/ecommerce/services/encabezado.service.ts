import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

/**
 * El encabezado de la tienda: la franja de arriba, el aviso de crédito, las
 * frases del buscador y el menú de dos niveles.
 *
 * CASI TODO DEVUELVE EL ENCABEZADO ENTERO, también crear, borrar y ordenar.
 * Es un árbol de seis enlaces y cualquier cambio puede mover el orden de otras
 * ramas: devolver sólo lo tocado obligaría a recomponer el árbol aquí y a
 * equivocarse. La pantalla se limita a pintar lo que llega.
 */
@Injectable({
  providedIn: 'root',
})
export class EncabezadoService {

  private URL_SERVICIOS: string;

  constructor(
    private _http: HttpClient,
  ) {
    this.URL_SERVICIOS = environment.URL_SERVICIOS + 'ecommerce/encabezado/';
  }

  // ================================================================
  // CONFIGURACIÓN
  // ================================================================

  /** La configuración y el menú de un tirón. */
  getEncabezado(): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'getEncabezado');
  }

  /** Sólo la configuración; el menú tiene sus propias llamadas. */
  editEncabezado(config: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'editEncabezado', { config });
  }

  // ================================================================
  // EL MENÚ
  // ================================================================

  /** Con `padre_id` nace dentro de un desplegable; sin él, es principal. */
  addEnlace(data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'addEnlace', data);
  }

  /** El padre NO se cambia aquí: mover un enlace de sitio es arrastrarlo. */
  editEnlace(id: any, data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'editEnlace/' + id, data);
  }

  /** Sin `activo` alterna; con él, lo deja como se diga. */
  activarEnlace(id: any, activo?: boolean): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'activarEnlace/' + id,
                           activo === undefined ? {} : { activo });
  }

  /** La lista entera en el orden nuevo, no sólo el que se movió. */
  ordenarEnlaces(ids: number[]): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'ordenarEnlaces', { ids });
  }

  /** A la papelera; un principal se lleva sus desplegables. */
  deleteEnlace(id: any): Observable<any> {
    return this._http.delete(this.URL_SERVICIOS + 'deleteEnlace/' + id);
  }

  // ================================================================
  // PAPELERA
  // ================================================================

  papelera(): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'papelera');
  }

  restaurar(ids: number[]): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'restaurar', { ids });
  }

  /** No tiene vuelta atrás; el servidor exige el permiso «vaciar». */
  vaciarPapelera(): Observable<any> {
    return this._http.delete(this.URL_SERVICIOS + 'vaciarPapelera');
  }
}
