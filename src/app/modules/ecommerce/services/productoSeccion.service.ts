import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { FiltroProductos } from '../interfaces/productoSeccionModel';

/**
 * Secciones de productos: los escaparates y lo que lleva cada uno.
 *
 * AQUÍ NO SE PIDE EL CATÁLOGO. La rejilla del medio de la pantalla usa
 * `ProductoService.allProductos`, la misma que la pantalla de productos:
 * paginación, buscador, marcas, categorías por rama y los dos rangos ya están
 * resueltos allí. Lo de este servicio es la sección y el cruce.
 */
@Injectable({
  providedIn: 'root',
})
export class ProductoSeccionService {

  private URL_SERVICIOS: string;

  constructor(
    private _http: HttpClient,
  ) {
    this.URL_SERVICIOS = environment.URL_SERVICIOS + 'ecommerce/productoSeccion/';
  }

  // ---------- Las secciones ----------

  allSecciones(): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'allSecciones');
  }

  addSeccion(datos: { nombre: string; desde?: string | null; hasta?: string | null }): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'addSeccion', datos);
  }

  editSeccion(id: number, datos: { nombre: string; desde?: string | null; hasta?: string | null }): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'editSeccion/' + id, datos);
  }

  /** Sin `activo`, alterna. Es lo que hace la palanca de la lista. */
  activarSeccion(id: number, activo?: boolean): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'activarSeccion/' + id,
                           activo === undefined ? {} : { activo });
  }

  /** Van TODAS las secciones, en el orden en que se ven. */
  ordenarSecciones(ids: number[]): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'ordenarSecciones', { ids });
  }

  /** A la papelera; los productos que tenía dentro no se tocan. */
  deleteSeccion(id: number): Observable<any> {
    return this._http.delete(this.URL_SERVICIOS + 'deleteSeccion/' + id);
  }

  papeleraSecciones(): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'papeleraSecciones');
  }

  restaurarSeccion(id: number): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'restaurarSeccion/' + id, {});
  }

  // ---------- Lo que lleva dentro ----------

  /** Las fichas completas, en el orden de la sección. */
  productos(id: number): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'productos/' + id);
  }

  /**
   * Sólo los ids.
   *
   * Es lo que la rejilla del catálogo necesita para marcar qué filas ya están
   * dentro. Las fichas completas serían el mismo dato que ya tiene la rejilla,
   * traído otra vez.
   */
  ids(id: number): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'ids/' + id);
  }

  agregar(id: number, productoIds: number[]): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'agregar/' + id, { producto_ids: productoIds });
  }

  quitar(id: number, productoIds: number[]): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'quitar/' + id, { producto_ids: productoIds });
  }

  /** Van TODOS los productos de la sección, en el orden nuevo. */
  ordenar(id: number, productoIds: number[]): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'ordenar/' + id, { producto_ids: productoIds });
  }

  /**
   * Mete TODO lo que cumple el filtro, no sólo la página que se está viendo.
   *
   * Viaja el filtro y no los ids: la base lo resuelve con la misma función que
   * llena la rejilla, así que lo que entra es exactamente lo que se enseñaba.
   */
  agregarFiltro(id: number, filtro: FiltroProductos): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'agregarFiltro/' + id, filtro);
  }
}
