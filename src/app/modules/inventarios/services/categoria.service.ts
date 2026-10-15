import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

/**
 * Categorías (inventarios.categorias), que son un ÁRBOL.
 *
 * Por eso no hay paginación: el servidor devuelve el árbol entero ya ordenado
 * para pintarlo, igual que con los menús. Son decenas de filas, no miles, y
 * un árbol partido en páginas deja la mitad de los padres fuera.
 */
@Injectable({
  providedIn: 'root',
})
export class CategoriaService {

  private URL_SERVICIOS: string;

  constructor(
    private _http: HttpClient,
  ) {
    this.URL_SERVICIOS = environment.URL_SERVICIOS + 'inventarios/categoria/';
  }

  //   ******   EL ÁRBOL ENTERO, YA ORDENADO   ******  //
  allCategorias(soloActivas: boolean = false): Observable<any> {
    return this._http.get<any>(this.URL_SERVICIOS + 'allCategorias', {
      params: new HttpParams().set('activos', soloActivas ? '1' : '0'),
      observe: 'response',
    });
  }

  //   ******   LO MISMO, PARA LOS COMBOS   ******  //
  listCategorias(soloActivas: boolean = true): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'listCategorias',
                          { params: new HttpParams().set('activos', soloActivas ? '1' : '0') });
  }

  //   ******   CREAR   ******  //
  addCategoria(data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'addCategoria', data);
  }

  //   ******   CLONAR (mismo endpoint que crear)   ******  //
  clonCategoria(data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'addCategoria', data);
  }

  //   ******   ACTIVAR / DESACTIVAR (sólo esa columna)   ******  //
  activarCategoria(id: any, activo?: boolean): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'activarCategoria/' + id,
                           activo === undefined ? {} : { activo });
  }

  //   ******   EDITAR   ******  //
  // No cambia de padre: para eso está moverCategoria, que es lo que usa el
  // arrastre de la rejilla.
  editCategoria(id: any, data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'editCategoria/' + id, data);
  }

  //   ******   MOVER EN EL ÁRBOL (arrastrar)   ******  //
  /**
   * `padreId` nulo la sube a la raíz; `antesDe` dice delante de qué hermana
   * queda, y sin él se va al final.
   */
  moverCategoria(id: any, padreId: number | null, antesDe: number | null): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'moverCategoria/' + id,
                           { padre_id: padreId, antes_de: antesDe });
  }

  //   ******   ELIMINAR   ******  //
  deleteCategoria(id: any): Observable<any> {
    return this._http.delete(this.URL_SERVICIOS + 'deleteCategoria/' + id);
  }

  //   ******   BUSCAR POR ID   ******  //
  findByIdCategoria(id: any): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'findByIdCategoria/' + id);
  }
}
