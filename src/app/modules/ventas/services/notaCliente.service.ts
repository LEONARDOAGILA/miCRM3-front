import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

/**
 * Las notas de un cliente.
 *
 * El contenido viaja como HTML del editor; el servidor lo limpia (quita
 * scripts, estilos y atributos que ejecutan) y guarda aparte el texto plano,
 * que es lo que se busca. Aquí no se sanea nada: hacerlo en el navegador da
 * una falsa sensación de seguridad, porque cualquiera puede llamar al API sin
 * pasar por la pantalla.
 */
@Injectable({ providedIn: 'root' })
export class NotaClienteService {

  private URL_SERVICIOS: string;

  constructor(
    private _http: HttpClient,
  ) {
    this.URL_SERVICIOS = environment.URL_SERVICIOS + 'ventas/notaCliente/';
  }

  /** `search` busca en el título y en el texto de la nota. */
  allNotas(clienteId: number, search = ''): Observable<any> {
    let params = new HttpParams().set('cliente_id', String(clienteId ?? ''));
    if ((search ?? '').trim()) { params = params.set('search', search.trim()); }
    return this._http.get(this.URL_SERVICIOS + 'allNotas', { params });
  }

  addNota(data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'addNota', data);
  }

  editNota(id: any, data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'editNota/' + id, data);
  }

  /** Sin `fijada` alterna lo que tenga; no cuenta como edición de la nota. */
  fijarNota(id: any, fijada?: boolean): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'fijarNota/' + id,
      fijada === undefined ? {} : { fijada });
  }

  deleteNota(id: any): Observable<any> {
    return this._http.delete(this.URL_SERVICIOS + 'deleteNota/' + id);
  }

  /**
   * Sube una imagen para incrustarla en una nota y devuelve su enlace.
   *
   * La imagen NO va dentro del HTML en base64: una captura de 2 MB haría esa
   * nota más grande que todas las demás juntas y viajaría entera cada vez que
   * se listan. Se sube al servidor y la nota guarda sólo el enlace.
   */
  subirImagen(clienteId: number, imagen: File): Observable<any> {
    const datos = new FormData();
    datos.append('cliente_id', String(clienteId));
    datos.append('imagen', imagen, imagen.name);
    return this._http.post(this.URL_SERVICIOS + 'subirImagen', datos);
  }

  /**
   * Trae al servidor una imagen que está en otra página.
   *
   * Al pegar algo copiado de una web, sus fotos llegan como enlaces a ese
   * otro servidor y el navegador no las puede descargar: se lo impide el CORS
   * del sitio de origen. O las trae el nuestro, o se pierden.
   */
  traerImagen(clienteId: number, url: string): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'traerImagen', { cliente_id: clienteId, url });
  }

  /** La url con la que se ve una imagen que devolvió subirImagen. */
  urlDeImagen(relativa: string): string {
    return environment.URL_SERVICIOS + String(relativa).replace(/^\/+/, '');
  }
}
