import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

/**
 * Marcas (inventarios.marcas). Mismo esquema que CargoService: la paginación
 * y el filtro los hace el servidor (inventarios.fn_marcas_listar_paginado).
 */
@Injectable({
  providedIn: 'root',
})
export class MarcaService {

  private URL_SERVICIOS: string;

  constructor(
    private _http: HttpClient,
  ) {
    this.URL_SERVICIOS = environment.URL_SERVICIOS + 'inventarios/marca/';
  }

  //   ******   LISTADO CON PAGINACIÓN   ******  //
  allMarcas(page: number = 1, perPage: number = 10, search: string = '',
            filtros: any = null): Observable<any> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('per_page', perPage.toString());
    if (search) {
      params = params.set('search', search);
    }
    // observe: 'response' como en allCargos: el componente lee res.body
    // El modelo de filtros de columna de ag-Grid, en JSON. Se aplica en el
    // servidor, sobre todas las marcas: la rejilla sólo tiene la página.
    if (filtros && Object.keys(filtros).length) {
      params = params.set('filtros', JSON.stringify(filtros));
    }

    return this._http.get<any>(this.URL_SERVICIOS + 'allMarcas', { params, observe: 'response' });
  }

  //   ******   LISTADO SIMPLE (combos / selector)   ******  //
  listMarcas(soloActivos: boolean = true): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'listMarcas',
                          { params: new HttpParams().set('activos', soloActivos ? '1' : '0') });
  }

  //   ******   CREAR   ******  //
  addMarca(data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'addMarca', data);
  }

  //   ******   CLONAR (mismo endpoint que crear)   ******  //
  clonMarca(data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'addMarca', data);
  }

  //   ******   ACTIVAR / DESACTIVAR (sólo esa columna)   ******  //
  // No pasa por editMarca: el servidor tiene una función que escribe sólo
  // `activo`. Sin `activo` alterna, pero la pantalla manda el valor que
  // quiere para que dos personas pulsando a la vez no se peleen.
  activarMarca(id: any, activo?: boolean): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'activarMarca/' + id,
                           activo === undefined ? {} : { activo });
  }

  //   ******   EDITAR   ******  //
  editMarca(id: any, data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'editMarca/' + id, data);
  }

  //   ******   ELIMINAR   ******  //
  deleteMarca(id: any): Observable<any> {
    return this._http.delete(this.URL_SERVICIOS + 'deleteMarca/' + id);
  }

  //   ******   BUSCAR POR ID   ******  //
  findByIdMarca(id: any): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'findByIdMarca/' + id);
  }

  //   ******   EL LOGO   ******  //
  /** `data` lleva MarcaId e imagen_file dentro de un FormData. */
  addLogo(data: FormData): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'addLogo', data);
  }

  /**
   * La url del logo para un <img src>.
   *
   * Con `refrescar` lleva un parámetro `v` con la hora: sin él, al cambiar el
   * logo el navegador seguiría enseñando el de antes, que viene con cabecera
   * de caché de un año. En la rejilla se aprovecha esa caché.
   */
  urlLogo(id: number | string, refrescar: boolean = false): string {
    return this.URL_SERVICIOS + 'getLogo/' + id + (refrescar ? '?v=' + Date.now() : '');
  }

  // ================================================================
  // PAPELERA DE RECICLAJE
  // ================================================================
  //
  // `deleteMarca` es un borrado lógico: la marca sale del listado y del
  // combo. Desde aquí se saca o se borra de verdad.

  /** Lo que hay en la papelera (más reciente primero). */
  papelera(): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'papelera');
  }

  /** Saca de la papelera una o varias marcas. */
  restaurarMarcas(ids: number[]): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'restaurarMarcas', { ids });
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
