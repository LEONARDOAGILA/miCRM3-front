import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

import { CuerpoModel } from '../interfaces/cuerpoModel';

/**
 * Los cuerpos de la tienda: las páginas hechas de secciones.
 *
 * Uno es el PRINCIPAL y sale al abrir la tienda; los demás se llegan por su
 * dirección. Las SECCIONES de cada uno van por `InicioService`.
 *
 * `allCuerpos` y las acciones devuelven la lista o el cuerpo tocado, como el
 * resto del módulo: la pantalla pinta lo que llega y no recompone nada.
 */
@Injectable({
  providedIn: 'root',
})
export class CuerpoService {

  private URL_SERVICIOS: string;

  constructor(
    private _http: HttpClient,
  ) {
    this.URL_SERVICIOS = environment.URL_SERVICIOS + 'ecommerce/cuerpo/';
  }

  allCuerpos(): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'allCuerpos');
  }

  /** { nombre, ruta, categoria_id?, marca_id?, titulo?, descripcion?, catalogo?, activo? } */
  addCuerpo(datos: Partial<CuerpoModel>): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'addCuerpo', datos);
  }

  editCuerpo(id: number, datos: Partial<CuerpoModel>): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'editCuerpo/' + id, datos);
  }

  /** Sin `activo`, alterna. */
  activarCuerpo(id: number, activo?: boolean): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'activarCuerpo/' + id,
                           activo === undefined ? {} : { activo });
  }

  /** Lo pone de entrada de la tienda. El de antes deja de serlo solo. */
  principalCuerpo(id: number): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'principalCuerpo/' + id, {});
  }

  /** A la papelera, con sus secciones. El principal no se puede. */
  deleteCuerpo(id: number): Observable<any> {
    return this._http.delete(this.URL_SERVICIOS + 'deleteCuerpo/' + id);
  }

  papelera(): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'papelera');
  }

  restaurarCuerpo(id: number): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'restaurarCuerpo/' + id, {});
  }

  /**
   * Vacía la papelera ENTERA.
   *
   * NO LLEVA IDS: borra todo lo que haya ahí, con sus secciones y las galerías
   * de sus banners. Quien llame, que pregunte antes.
   */
  vaciarPapelera(): Observable<any> {
    return this._http.delete(this.URL_SERVICIOS + 'vaciarPapelera');
  }
}
