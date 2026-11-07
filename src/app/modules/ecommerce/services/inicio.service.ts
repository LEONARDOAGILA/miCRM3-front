import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

/**
 * Las secciones de un CUERPO de la tienda: su orden, su rótulo y su vigencia.
 *
 * TODO VA POR EL `id` DE LA SECCIÓN, no por su clave. La clave es única dentro
 * del cuerpo y no en la tabla: cada cuerpo tiene su «banner_principal» y sus
 * «categorias_destacadas», así que una clave sola no diría de cuál se habla.
 *
 * SIN `cuerpoId`, EL PRINCIPAL. Es lo que pedía esta pantalla cuando sólo
 * había una portada, y así las llamadas de otras pantallas —el modelado— no
 * tienen que enterarse de que ahora hay varios.
 *
 * Todas las llamadas devuelven LA LISTA ENTERA DEL CUERPO QUE SE TOCÓ, como el
 * encabezado y el pie: mover una sección cambia el orden de las demás, y
 * recomponerlo aquí acabaría enseñando algo distinto de lo que ve la tienda.
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

  allInicio(cuerpoId?: number | null): Observable<any> {
    const query = cuerpoId ? '?cuerpo_id=' + cuerpoId : '';
    return this._http.get(this.URL_SERVICIOS + 'allInicio' + query);
  }

  /** { titulo?, subtitulo?, alcance?, activo?, desde?, hasta? } */
  editSeccion(id: number, datos: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'editSeccion/' + id, datos);
  }

  /** Sin `activo`, alterna. Es lo que hace el interruptor de la lista. */
  activarSeccion(id: number, activo?: boolean): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'activarSeccion/' + id,
                           activo === undefined ? {} : { activo });
  }

  /**
   * Sólo el alto, sin tocar lo demás.
   *
   * No se usa `editSeccion` para esto: guarda la sección entera, así que un
   * `{ alto }` a secas le borraría el rótulo y su color.
   */
  altoSeccion(id: number, alto: string): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'altoSeccion/' + id, { alto });
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
  subirImagenSeccion(id: number, archivo: File): Observable<any> {
    const cuerpo = new FormData();
    cuerpo.append('imagen', archivo);
    // Sin cabecera Content-Type a mano: el navegador tiene que ponerla él con
    // su `boundary`, y escribirla la deja sin él
    return this._http.post(this.URL_SERVICIOS + 'imagenSeccion/' + id, cuerpo);
  }

  quitarImagenSeccion(id: number): Observable<any> {
    return this._http.delete(this.URL_SERVICIOS + 'imagenSeccion/' + id);
  }

  /**
   * Un banner nuevo en un cuerpo.
   *
   * ES LA ÚNICA SECCIÓN QUE SE CREA DESDE AQUÍ: un banner son imágenes con su
   * sitio, y la tienda ya sabe pintarlo. Las de fábrica nacen con el cuerpo y
   * las de productos se arman en «Productos por sección».
   */
  addBanner(nombre: string, cuerpoId?: number | null): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'addBanner',
                           cuerpoId ? { nombre, cuerpo_id: cuerpoId } : { nombre });
  }

  /** Le cambia el nombre. El servidor lo lleva también a su galería. */
  nombreBanner(id: number, nombre: string): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'nombreBanner/' + id, { nombre });
  }

  /** Lo borra CON SUS IMÁGENES. No hay papelera: quien llame, que pregunte antes. */
  deleteBanner(id: number): Observable<any> {
    return this._http.delete(this.URL_SERVICIOS + 'deleteBanner/' + id);
  }

  /**
   * Los escaparates de «Productos por sección» que este cuerpo NO enseña.
   *
   * Cada uno con cuántos productos tiene y en cuántas páginas sale ya: uno
   * vacío se puede añadir, pero la tienda se lo salta.
   */
  escaparatesDisponibles(cuerpoId?: number | null): Observable<any> {
    const query = cuerpoId ? '?cuerpo_id=' + cuerpoId : '';
    return this._http.get(this.URL_SERVICIOS + 'escaparatesDisponibles' + query);
  }

  /** Lo enseña en este cuerpo, al final y encendido. */
  addEscaparate(seccionId: number, cuerpoId?: number | null): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'addEscaparate',
                           cuerpoId ? { seccion_id: seccionId, cuerpo_id: cuerpoId }
                                    : { seccion_id: seccionId });
  }

  /**
   * Lo quita de ESTA página. NO borra el escaparate: sus productos siguen en
   * «Productos por sección» y se puede volver a poner.
   */
  quitarEscaparate(id: number): Observable<any> {
    return this._http.delete(this.URL_SERVICIOS + 'quitarEscaparate/' + id);
  }

  /** Van TODOS los ids del cuerpo, en el orden en que se ven. */
  ordenarSecciones(ids: number[], cuerpoId?: number | null): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'ordenarSecciones',
                           cuerpoId ? { ids, cuerpo_id: cuerpoId } : { ids });
  }
}
