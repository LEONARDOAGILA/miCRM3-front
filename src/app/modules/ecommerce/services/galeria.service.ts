import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

/**
 * Las galerías de la tienda: las imágenes de cada sitio del diseño.
 *
 * EL FICHERO NO SE SUBE AQUÍ, se elige de la biblioteca compartida
 * (ImagenService). Lo que se guarda es su nombre; la dirección la arma el
 * servidor al leer.
 *
 * Todo devuelve LA GALERÍA ENTERA: añadir o quitar una imagen cambia el orden
 * de las demás.
 */
@Injectable({
  providedIn: 'root',
})
export class GaleriaService {

  private URL_SERVICIOS: string;

  constructor(
    private _http: HttpClient,
  ) {
    this.URL_SERVICIOS = environment.URL_SERVICIOS + 'ecommerce/galeria/';
  }

  allGalerias(): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'allGalerias');
  }

  getGaleria(clave: string): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'getGaleria/' + clave);
  }

  addImagen(clave: string, datos: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'addImagen/' + clave, datos);
  }

  editImagen(clave: string, id: number, datos: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'editImagen/' + clave + '/' + id, datos);
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

  // ---------- La papelera, por galería ----------

  papelera(clave: string): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'papelera/' + clave);
  }

  restaurar(ids: number[]): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'restaurar', { ids });
  }

  /** Vacía la de ESTA galería, no la de todas. */
  vaciarPapelera(clave: string): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'vaciarPapelera/' + clave, {});
  }
}
