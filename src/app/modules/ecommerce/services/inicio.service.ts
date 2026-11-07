import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

/**
 * La portada de la tienda: la lista de secciones, su orden y su vigencia.
 *
 * Todas las llamadas devuelven LA LISTA ENTERA, como el encabezado y el pie:
 * mover una sección cambia el orden de las demás, y recomponerlo aquí acabaría
 * enseñando algo distinto de lo que ve la tienda.
 */
@Injectable({
  providedIn: 'root',
})
export class InicioService {

  private URL_SERVICIOS: string;

  constructor(
    private _http: HttpClient,
  ) {
    this.URL_SERVICIOS = environment.URL_SERVICIOS + 'ecommerce/inicio/';
  }

  allInicio(): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'allInicio');
  }

  /** { titulo?, subtitulo?, activo?, desde?, hasta? } */
  editSeccion(clave: string, datos: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'editSeccion/' + clave, datos);
  }

  /** Sin `activo`, alterna. Es lo que hace el interruptor de la lista. */
  activarSeccion(clave: string, activo?: boolean): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'activarSeccion/' + clave,
                           activo === undefined ? {} : { activo });
  }

  /**
   * Sólo el alto, sin tocar lo demás.
   *
   * No se usa `editSeccion` para esto: guarda la sección entera, así que un
   * `{ alto }` a secas le borraría el rótulo y su color.
   */
  altoSeccion(clave: string, alto: string): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'altoSeccion/' + clave, { alto });
  }

  /**
   * La imagen de al lado de una sección de productos.
   *
   * Tampoco va por `editSeccion`, y por el mismo motivo que el alto: aquélla
   * guarda todos los campos de la sección, así que un guardado normal —que no
   * lleva el fichero— borraría la imagen. Se sube al elegirla, como en las
   * galerías, y lo demás de la imagen (el lado, el texto y el enlace) sí viaja
   * con el resto.
   */
  subirImagenSeccion(clave: string, archivo: File): Observable<any> {
    const cuerpo = new FormData();
    cuerpo.append('imagen', archivo);
    // Sin cabecera Content-Type a mano: el navegador tiene que ponerla él con
    // su `boundary`, y escribirla la deja sin él
    return this._http.post(this.URL_SERVICIOS + 'imagenSeccion/' + clave, cuerpo);
  }

  quitarImagenSeccion(clave: string): Observable<any> {
    return this._http.delete(this.URL_SERVICIOS + 'imagenSeccion/' + clave);
  }

  /**
   * Un banner nuevo en la portada.
   *
   * ES LA ÚNICA SECCIÓN QUE SE CREA DESDE AQUÍ: un banner son imágenes con su
   * sitio, y la tienda ya sabe pintarlo. Las de fábrica son código y las de
   * productos se arman en «Productos por sección».
   */
  addBanner(nombre: string): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'addBanner', { nombre });
  }

  /** Le cambia el nombre. El servidor lo lleva también a su galería. */
  nombreBanner(clave: string, nombre: string): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'nombreBanner/' + clave, { nombre });
  }

  /** Lo borra CON SUS IMÁGENES. No hay papelera: quien llame, que pregunte antes. */
  deleteBanner(clave: string): Observable<any> {
    return this._http.delete(this.URL_SERVICIOS + 'deleteBanner/' + clave);
  }

  /** Van TODAS las claves, en el orden en que se ven. */
  ordenarSecciones(claves: string[]): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'ordenarSecciones', { claves });
  }
}
