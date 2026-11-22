import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { FiltroProductos } from '../interfaces/grupoProductosModel';

/**
 * Grupos de productos: los escaparates y lo que lleva cada uno.
 *
 * AQUÍ NO SE PIDE EL CATÁLOGO. La rejilla del medio de la pantalla usa
 * `ProductoService.allProductos`, la misma que la pantalla de productos:
 * paginación, buscador, marcas, categorías por rama y los dos rangos ya están
 * resueltos allí. Lo de este servicio es el grupo y el cruce.
 */
@Injectable({
  providedIn: 'root',
})
export class GrupoProductosService {

  private URL_SERVICIOS: string;

  constructor(
    private _http: HttpClient,
  ) {
    this.URL_SERVICIOS = environment.URL_SERVICIOS + 'ecommerce/grupoProductos/';
  }

  // ---------- Los grupos ----------

  allGrupos(): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'allGrupos');
  }

  addGrupo(datos: { nombre: string; desde?: string | null; hasta?: string | null }): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'addGrupo', datos);
  }

  editGrupo(id: number, datos: { nombre: string; desde?: string | null; hasta?: string | null }): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'editGrupo/' + id, datos);
  }

  /** Sin `activo`, alterna. Es lo que hace la palanca de la lista. */
  activarGrupo(id: number, activo?: boolean): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'activarGrupo/' + id,
                           activo === undefined ? {} : { activo });
  }

  /** Van TODAS los grupos, en el orden en que se ven. */
  ordenarGrupos(ids: number[]): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'ordenarGrupos', { ids });
  }

  /** A la papelera; los productos que tenía dentro no se tocan. */
  deleteGrupo(id: number): Observable<any> {
    return this._http.delete(this.URL_SERVICIOS + 'deleteGrupo/' + id);
  }

  papeleraGrupos(): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'papeleraGrupos');
  }

  restaurarGrupo(id: number): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'restaurarGrupo/' + id, {});
  }

  // ---------- Lo que lleva dentro ----------

  /** Las fichas completas, en el orden del grupo. */
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

  /** Van TODOS los productos del grupo, en el orden nuevo. */
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
