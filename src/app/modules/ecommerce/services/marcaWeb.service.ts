import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

/**
 * Las marcas de la tienda.
 *
 * El catálogo es de Inventarios; aquí sólo se decide qué marcas salen, con
 * qué nombre, en qué orden y con qué imagen. Por eso no hay crear ni borrar.
 *
 * Las llamadas de la marca devuelven LA LISTA ENTERA, y las de las imágenes,
 * TODAS LAS DE ESA MARCA: añadir una cambia cuál sale hoy, y recomponerlo
 * aquí acabaría enseñando algo distinto de lo que ve la tienda.
 */
@Injectable({
  providedIn: 'root',
})
export class MarcaWebService {

  private URL_SERVICIOS: string;

  constructor(
    private _http: HttpClient,
  ) {
    this.URL_SERVICIOS = environment.URL_SERVICIOS + 'ecommerce/marcaWeb/';
  }

  allMarcasWeb(): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'allMarcasWeb');
  }

  /**
   * { oculta?, nombre_web?, promocion? }. Un nombre vacío o igual al del
   * catálogo se descarta.
   *
   * LO QUE NO SE MANDA NO SE TOCA: `promocion` sin mandar deja la marca como
   * estaba, así que guardar el nombre no la saca de la portada.
   */
  editMarcaWeb(id: number, data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'editMarcaWeb/' + id, data);
  }

  /** El orden de «Nuestras marcas». Van TODAS las que salen en la tienda. */
  ordenarMarcas(ids: number[]): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'ordenarMarcas', { ids });
  }

  /** El de los carteles de «Marcas en promoción», que es otro. */
  ordenarPromocion(ids: number[]): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'ordenarPromocion', { ids });
  }

  // ================================================================
  // LAS IMÁGENES DE CADA MARCA
  // ================================================================
  //
  // EL FICHERO VA EN MULTIPART, y por eso estas llamadas mandan FormData y
  // no un objeto: sin cabecera `Content-Type` a mano, que la pone el
  // navegador con su `boundary`.

  imagenesCuentas(): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'imagenesCuentas');
  }

  imagenes(marcaId: number): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'imagenes/' + marcaId);
  }

  addImagen(marcaId: number, datos: FormData): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'addImagen/' + marcaId, datos);
  }

  /** Sin fichero dentro del FormData, se queda la imagen que ya tenía. */
  editImagen(marcaId: number, id: number, datos: FormData): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'editImagen/' + marcaId + '/' + id, datos);
  }

  /** Sin `activo`, alterna. */
  activarImagen(id: number, activo?: boolean): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'activarImagen/' + id,
                           activo === undefined ? {} : { activo });
  }

  ordenarImagenes(ids: number[]): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'ordenarImagenes', { ids });
  }

  deleteImagen(id: number): Observable<any> {
    return this._http.delete(this.URL_SERVICIOS + 'deleteImagen/' + id);
  }

  papeleraImagenes(marcaId: number): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'papeleraImagenes/' + marcaId);
  }

  restaurarImagenes(ids: number[]): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'restaurarImagenes', { ids });
  }

  /** Vacía la de ESTA marca, y ahí sí se borran los ficheros del disco. */
  vaciarImagenes(marcaId: number): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'vaciarImagenes/' + marcaId, {});
  }
}
