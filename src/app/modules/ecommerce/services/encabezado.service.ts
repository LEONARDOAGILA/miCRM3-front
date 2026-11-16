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
  // EL LOGO
  // ================================================================
  //
  // VA POR SU PROPIA PUERTA y no con `editEncabezado`: aquélla reescribe el
  // `config` entero, así que guardar los textos de la franja se llevaría por
  // delante el logo. En la base vive en su columna.
  //
  // Como con el resto de imágenes: se manda en un FormData y NO se le pone el
  // Content-Type a mano —el navegador tiene que poner el suyo con el
  // `boundary`—. Las dos devuelven el encabezado entero.

  subirLogo(archivo: File): Observable<any> {
    const datos = new FormData();
    datos.append('logo', archivo);
    return this._http.post(this.URL_SERVICIOS + 'logo', datos);
  }

  /** Lo quita: la tienda vuelve a pintar el que trae dibujado. */
  quitarLogo(): Observable<any> {
    return this._http.delete(this.URL_SERVICIOS + 'logo');
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

  /**
   * La lista entera en el orden nuevo, no sólo el que se movió.
   *
   * La rejilla usa `moverEnlace`, que dice padre y sitio de una vez; ésta
   * sigue aquí porque renumera una rama entera en una sola llamada, que es
   * otra cosa y el servidor la mantiene.
   */
  ordenarEnlaces(ids: number[]): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'ordenarEnlaces', { ids });
  }

  /**
   * Lo cuelga de otro y lo pone en su sitio: es el arrastre de la rejilla.
   *
   * `padreId` null lo saca a principal; `antesDe` null lo deja el último de
   * sus hermanos. EL MENÚ NO TIENE LÍMITE DE NIVELES; lo único que el
   * servidor no admite es meterlo dentro de su propia rama.
   */
  moverEnlace(id: number, padreId: number | null, antesDe: number | null): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'moverEnlace/' + id,
                           { padre_id: padreId, antes_de: antesDe });
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
