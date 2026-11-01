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
}
