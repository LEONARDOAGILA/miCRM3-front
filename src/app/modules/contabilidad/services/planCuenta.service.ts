import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

/**
 * El plan de cuentas (contabilidad.plan_cuentas), que es un ÁRBOL.
 *
 * Por eso no hay paginación: el servidor devuelve el árbol entero ya ordenado
 * para pintarlo, igual que con los menús y con las categorías de inventarios.
 * Son cientos de filas, no miles, y un árbol partido en páginas deja la mitad
 * de los padres fuera.
 *
 * A diferencia del de categorías, ESTE ÁRBOL NO TIENE TOPE DE NIVELES: una
 * empresa que necesite 1.1.01.001.0001 lo necesita de verdad.
 */
@Injectable({
  providedIn: 'root',
})
export class PlanCuentaService {

  private URL_SERVICIOS: string;

  constructor(
    private _http: HttpClient,
  ) {
    this.URL_SERVICIOS = environment.URL_SERVICIOS + 'contabilidad/planCuenta/';
  }

  //   ******   EL ÁRBOL ENTERO, YA ORDENADO   ******  //
  allPlanCuentas(soloActivas: boolean = false): Observable<any> {
    return this._http.get<any>(this.URL_SERVICIOS + 'allPlanCuentas', {
      params: new HttpParams().set('activos', soloActivas ? '1' : '0'),
      observe: 'response',
    });
  }

  //   ******   LO MISMO, PARA LOS COMBOS   ******  //
  listPlanCuentas(soloActivas: boolean = true): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'listPlanCuentas',
                          { params: new HttpParams().set('activos', soloActivas ? '1' : '0') });
  }

  //   ******   CREAR   ******  //
  addPlanCuenta(data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'addPlanCuenta', data);
  }

  //   ******   CLONAR (mismo endpoint que crear)   ******  //
  clonPlanCuenta(data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'addPlanCuenta', data);
  }

  //   ******   ACTIVAR / DESACTIVAR (sólo esa columna)   ******  //
  activarPlanCuenta(id: any, activo?: boolean): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'activarPlanCuenta/' + id,
                           activo === undefined ? {} : { activo });
  }

  //   ******   EDITAR   ******  //
  // No cambia de padre: para eso está moverPlanCuenta, que es lo que usa el
  // arrastre de la rejilla.
  editPlanCuenta(id: any, data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'editPlanCuenta/' + id, data);
  }

  //   ******   MOVER EN EL ÁRBOL (arrastrar)   ******  //
  /**
   * `padreId` nulo la sube a la raíz; `antesDe` dice delante de qué hermana
   * queda, y sin él se va al final.
   */
  moverPlanCuenta(id: any, padreId: number | null, antesDe: number | null): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'moverPlanCuenta/' + id,
                           { padre_id: padreId, antes_de: antesDe });
  }

  //   ******   ELIMINAR   ******  //
  deletePlanCuenta(id: any): Observable<any> {
    return this._http.delete(this.URL_SERVICIOS + 'deletePlanCuenta/' + id);
  }

  //   ******   BUSCAR POR ID   ******  //
  findByIdPlanCuenta(id: any): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'findByIdPlanCuenta/' + id);
  }

  //   ******   EL SIGUIENTE CÓDIGO LIBRE   ******  //
  /**
   * En un plan de cuentas el código no se inventa: sigue al del padre y al de
   * la última hermana. Esto es lo que rellena el campo al abrir la ficha.
   */
  codigoSugerido(padreId: number | null): Observable<any> {
    let params = new HttpParams();
    if (padreId != null) { params = params.set('padre_id', String(padreId)); }
    return this._http.get(this.URL_SERVICIOS + 'codigoSugerido', { params });
  }

  // ================================================================
  // PAPELERA DE RECICLAJE
  // ================================================================
  //
  // `deletePlanCuenta` es un borrado lógico: la cuenta sale del árbol y de
  // los combos. Desde aquí se saca o se borra de verdad.

  /** Lo que hay en la papelera (más reciente primero). */
  papelera(): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'papelera');
  }

  /** Saca de la papelera una o varias cuentas. */
  restaurarPlanCuentas(ids: number[]): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'restaurarPlanCuentas', { ids });
  }

  /** Borrado real de lo seleccionado (sólo de lo que está en la papelera). */
  eliminarDefinitivo(ids: number[]): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'eliminarDefinitivo', { ids });
  }

  /** Borrado real de todo lo que hay en la papelera. */
  vaciarPapelera(): Observable<any> {
    return this._http.delete(this.URL_SERVICIOS + 'vaciarPapelera');
  }
}
