import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

/**
 * Departamentos (rh.departamentos). Mismo esquema que CargoService: la
 * paginación y el filtro los hace el servidor (rh.fn_departamentos_listar_paginado).
 */
@Injectable({
  providedIn: 'root',
})
export class DepartamentoService {

  private URL_SERVICIOS: string;

  constructor(
    private _http: HttpClient,
  ) {
    this.URL_SERVICIOS = environment.URL_SERVICIOS + 'rh/departamento/';
  }

  //   ******   LISTADO CON PAGINACIÓN   ******  //
  allDepartamentos(page: number = 1, perPage: number = 10, search: string = ''): Observable<any> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('per_page', perPage.toString());
    if (search) {
      params = params.set('search', search);
    }
    return this._http.get<any>(this.URL_SERVICIOS + 'allDepartamentos', { params, observe: 'response' });
  }

  //   ******   LISTADO SIMPLE (combos / selector)   ******  //
  listDepartamentos(soloActivos: boolean = true): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'listDepartamentos', { params: new HttpParams().set('activos', soloActivos ? '1' : '0') });
  }

  //   ******   RESPONSABLES (empleados activos para el combo)   ******  //
  listResponsables(): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'listResponsables');
  }

  //   ******   CREAR   ******  //
  addDepartamento(data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'addDepartamento', data);
  }

  //   ******   CLONAR (mismo endpoint que crear)   ******  //
  clonDepartamento(data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'addDepartamento', data);
  }

    //   ******   ACTIVAR / DESACTIVAR (solo esa columna)   ******  //
  // No pasa por editDepartamento: el servidor tiene una funcion que escribe solo
  // `activo`. Sin `activo` alterna, pero la pantalla manda el valor que
  // quiere para que dos personas pulsando a la vez no se peleen.
  activarDepartamento(id: any, activo?: boolean): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'activarDepartamento/' + id,
                           activo === undefined ? {} : { activo });
  }

//   ******   EDITAR   ******  //
  editDepartamento(id: any, data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'editDepartamento/' + id, data);
  }

  //   ******   ELIMINAR   ******  //
  deleteDepartamento(id: any): Observable<any> {
    return this._http.delete(this.URL_SERVICIOS + 'deleteDepartamento/' + id);
  }

  //   ******   BUSCAR POR ID   ******  //
  findByIdDepartamento(id: any): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'findByIdDepartamento/' + id);
  }

  // ================================================================
  // EL ÁRBOL
  // ================================================================

  /**
   * El árbol entero, ya ordenado para pintarlo.
   *
   * No pagina: son pocas filas y una rama partida entre dos páginas no se
   * entiende. La rejilla filtra y pliega en el navegador.
   */
  arbolDepartamentos(soloActivos: boolean = false): Observable<any> {
    const params = new HttpParams().set('activos', soloActivos ? '1' : '0');
    return this._http.get(this.URL_SERVICIOS + 'arbolDepartamentos', { params });
  }

  /**
   * Mueve un departamento de rama o le cambia el orden.
   *
   * `padreId` null lo deja en el primer nivel; `antesDe` null lo pone al
   * final de sus hermanos.
   */
  moverDepartamento(id: number, padreId: number | null, antesDe: number | null): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'moverDepartamento/' + id,
                           { padre_id: padreId, antes_de: antesDe });
  }

  // ================================================================
  // PAPELERA DE RECICLAJE
  // ================================================================
  //
  // `deleteDepartamento` es un borrado lógico: el departamento sale del árbol
  // y de los combos. Desde aquí se saca o se borra de verdad.

  /** Lo que hay en la papelera (más reciente primero). */
  papelera(): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'papelera');
  }

  /** Saca de la papelera uno o varios departamentos. */
  restaurarDepartamentos(ids: number[]): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'restaurarDepartamentos', { ids });
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
