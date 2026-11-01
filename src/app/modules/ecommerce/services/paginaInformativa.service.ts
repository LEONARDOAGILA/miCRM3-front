import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

/**
 * Las páginas de texto de la tienda (ecommerce.paginas_informativas).
 *
 * SIN PAGINACIÓN, a diferencia de casi todos los listados de la casa: son
 * diez páginas en dos carpetas y no van a ser cien. Paginarlas obligaría a
 * traer las carpetas aparte y a pintar la lista a medias mientras llega la
 * segunda petición, para ahorrar unos pocos kilobytes.
 *
 * `allPaginasInformativas` trae las páginas Y las carpetas de un tirón por lo
 * mismo: la pantalla no sirve de nada con la mitad, porque las páginas se
 * pintan DENTRO de su carpeta.
 */
@Injectable({
  providedIn: 'root',
})
export class PaginaInformativaService {

  private URL_SERVICIOS: string;

  constructor(
    private _http: HttpClient,
  ) {
    this.URL_SERVICIOS = environment.URL_SERVICIOS + 'ecommerce/paginaInformativa/';
  }

  // ================================================================
  // PÁGINAS
  // ================================================================

  /** Las páginas (sin su contenido) y las carpetas, en una sola respuesta. */
  allPaginasInformativas(): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'allPaginasInformativas');
  }

  /** Una página CON su contenido, que es lo que abre el editor. */
  findByIdPaginaInformativa(id: any): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'findByIdPaginaInformativa/' + id);
  }

  /** Por la clave: es como la enlaza el menú de la tienda. */
  findByClavePaginaInformativa(clave: string): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'findByClavePaginaInformativa/' + encodeURIComponent(clave));
  }

  /** Sin `clave`, el servidor la saca del título. */
  addPaginaInformativa(data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'addPaginaInformativa', data);
  }

  /**
   * La clave NO se manda: es la dirección de la página y se queda como nació.
   * Si se mandara, el servidor la ignora.
   */
  editPaginaInformativa(id: any, data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'editPaginaInformativa/' + id, data);
  }

  /** Sin `activo` alterna; con él, lo deja como se diga. */
  activarPaginaInformativa(id: any, activo?: boolean): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'activarPaginaInformativa/' + id,
                           activo === undefined ? {} : { activo });
  }

  /** La lista entera en el orden nuevo, no sólo la que se movió. */
  ordenarPaginasInformativas(ids: number[]): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'ordenarPaginasInformativas', { ids });
  }

  /** A la papelera. El servidor se niega si la página es fija. */
  deletePaginaInformativa(id: any): Observable<any> {
    return this._http.delete(this.URL_SERVICIOS + 'deletePaginaInformativa/' + id);
  }

  // ================================================================
  // PAPELERA (un solo cesto para páginas y carpetas)
  // ================================================================

  papelera(): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'papelera');
  }

  restaurar(ids: number[]): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'restaurar', { ids });
  }

  restaurarGrupo(id: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'restaurarGrupo/' + id, {});
  }

  /** No tiene vuelta atrás; el servidor exige el permiso «vaciar». */
  vaciarPapelera(): Observable<any> {
    return this._http.delete(this.URL_SERVICIOS + 'vaciarPapelera');
  }

  // ================================================================
  // CARPETAS
  // ================================================================

  grupos(): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'grupos');
  }

  addGrupo(nombre: string): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'addGrupo', { nombre });
  }

  editGrupo(id: any, nombre: string): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'editGrupo/' + id, { nombre });
  }

  ordenarGrupos(ids: number[]): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'ordenarGrupos', { ids });
  }

  /** Se lleva sus páginas; restaurarla las devuelve. */
  deleteGrupo(id: any): Observable<any> {
    return this._http.delete(this.URL_SERVICIOS + 'deleteGrupo/' + id);
  }
}
