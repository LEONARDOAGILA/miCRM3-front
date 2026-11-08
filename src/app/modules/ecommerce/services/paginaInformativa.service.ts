import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

/**
 * Las páginas de texto de la tienda (ecommerce.paginas_informativas).
 *
 * SIN PAGINACIÓN, a diferencia de casi todos los listados de la casa: son
 * diez páginas y no van a ser mil. Vienen todas de una vez y la rejilla
 * pagina, filtra y ordena en el navegador, que con esta cantidad va más
 * rápido que pedirle al servidor una página de diez filas.
 *
 * NO HAY CARPETAS: se quitaron el 07/11/2026. Esto es un CRUD de páginas.
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

  /** Las páginas, sin su contenido (son cientos de kB de HTML que la lista no enseña). */
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

  /** A la papelera. Se puede restaurar desde ahí. */
  deletePaginaInformativa(id: any): Observable<any> {
    return this._http.delete(this.URL_SERVICIOS + 'deletePaginaInformativa/' + id);
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

  // ================================================================
  // LA IMAGEN
  // ================================================================

  /**
   * Sube la imagen y devuelve su nombre y su dirección.
   *
   * NO LA PEGA A NINGUNA PÁGINA: sólo deja el fichero en el servidor. Quién
   * la lleva lo decide el guardado normal, con el contenido entero. Así una
   * imagen que se elige y luego se descarta no cambia nada.
   */
  addImagen(datos: FormData): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'addImagenPaginaInformativa', datos);
  }

  /**
   * Sube el PDF y devuelve su nombre en el disco, su dirección y cómo se
   * llamaba el fichero que eligieron (`pdf_nombre`).
   *
   * Igual que la imagen: no lo pega a ninguna página. Hasta el 08/11/2026 el
   * PDF venía heredado del CRM viejo y no se podía ni cambiar ni quitar.
   */
  addPdf(datos: FormData): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'addPdfPaginaInformativa', datos);
  }
}
