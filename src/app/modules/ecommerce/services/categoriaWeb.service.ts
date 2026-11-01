import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

/**
 * Las categorias de la tienda.
 *
 * El arbol es de Inventarios; aqui solo se decide que ramas salen en la
 * tienda y con que nombre. Por eso no hay crear, borrar ni ordenar.
 *
 * Las dos llamadas devuelven el ARBOL ENTERO: apagar una rama cambia el
 * estado de todo lo que cuelga de ella —y puede dejar a su padre «sin
 * productos debajo»—, asi que recalcularlo aqui seria repetir la regla del
 * servidor y acabar ensenando algo distinto de lo que ve la tienda.
 */
@Injectable({
  providedIn: 'root',
})
export class CategoriaWebService {

  private URL_SERVICIOS: string;

  constructor(
    private _http: HttpClient,
  ) {
    this.URL_SERVICIOS = environment.URL_SERVICIOS + 'ecommerce/categoriaWeb/';
  }

  /** El arbol entero con el estado de cada rama. Son treinta y tres: no se pagina. */
  allCategoriasWeb(): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'allCategoriasWeb');
  }

  /** { oculta?, nombre_web? }. Un nombre vacio o igual al del catalogo se descarta. */
  editCategoriaWeb(id: any, data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'editCategoriaWeb/' + id, data);
  }

  // ================================================================
  // LAS IMÁGENES DE CADA CATEGORÍA
  // ================================================================
  //
  // EL FICHERO VA EN MULTIPART, y por eso estas llamadas mandan FormData y
  // no un objeto: sin cabecera `Content-Type` a mano, que la pone el
  // navegador con su `boundary`. Escribirla aquí deja el boundary fuera y el
  // servidor recibe un cuerpo que no sabe partir.
  //
  // Todas devuelven LAS IMÁGENES ENTERAS de la categoría: añadir una cambia
  // cuál sale hoy, y recomponerlo aquí acabaría enseñando algo distinto de lo
  // que ve la tienda.

  /** Cuántas tiene cada categoría, para la chapita del árbol. */
  imagenesCuentas(): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'imagenesCuentas');
  }

  imagenes(categoriaId: number): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'imagenes/' + categoriaId);
  }

  addImagen(categoriaId: number, datos: FormData): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'addImagen/' + categoriaId, datos);
  }

  /** Sin fichero dentro del FormData, se queda la imagen que ya tenía. */
  editImagen(categoriaId: number, id: number, datos: FormData): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'editImagen/' + categoriaId + '/' + id, datos);
  }

  /** Sin `activo`, alterna. */
  activarImagen(id: number, activo?: boolean): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'activarImagen/' + id,
                           activo === undefined ? {} : { activo });
  }

  /** El orden decide cuál sale cuando dos se pisan. */
  ordenarImagenes(ids: number[]): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'ordenarImagenes', { ids });
  }

  deleteImagen(id: number): Observable<any> {
    return this._http.delete(this.URL_SERVICIOS + 'deleteImagen/' + id);
  }

  papeleraImagenes(categoriaId: number): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'papeleraImagenes/' + categoriaId);
  }

  restaurarImagenes(ids: number[]): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'restaurarImagenes', { ids });
  }

  /** Vacía la de ESTA categoría, y ahí sí se borran los ficheros del disco. */
  vaciarImagenes(categoriaId: number): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'vaciarImagenes/' + categoriaId, {});
  }
}
