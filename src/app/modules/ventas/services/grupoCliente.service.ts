import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

/**
 * Grupos de clientes (ventas.grupos_clientes), que son un ÁRBOL.
 *
 * Por eso no hay paginación: el servidor devuelve el árbol entero ya ordenado
 * para pintarlo, igual que con los menús. Son decenas de filas, no miles, y
 * un árbol partido en páginas deja la mitad de los padres fuera.
 *
 * Cada fila trae, además de lo suyo, las CONDICIONES RESUELTAS: lo que de
 * verdad se usaría de forma de pago, cupo, días y descuento, y de qué grupo
 * sale cada una.
 */
@Injectable({
  providedIn: 'root',
})
export class GrupoClienteService {

  private URL_SERVICIOS: string;

  constructor(
    private _http: HttpClient,
  ) {
    this.URL_SERVICIOS = environment.URL_SERVICIOS + 'ventas/grupoCliente/';
  }

  //   ******   EL ÁRBOL ENTERO, YA ORDENADO   ******  //
  allGruposClientes(soloActivas: boolean = false): Observable<any> {
    return this._http.get<any>(this.URL_SERVICIOS + 'allGruposClientes', {
      params: new HttpParams().set('activos', soloActivas ? '1' : '0'),
      observe: 'response',
    });
  }

  //   ******   LO MISMO, PARA LOS COMBOS   ******  //
  listGruposClientes(soloActivas: boolean = true): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'listGruposClientes',
                          { params: new HttpParams().set('activos', soloActivas ? '1' : '0') });
  }

  //   ******   CREAR   ******  //
  addGrupoCliente(data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'addGrupoCliente', data);
  }

  //   ******   CLONAR (mismo endpoint que crear)   ******  //
  clonGrupoCliente(data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'addGrupoCliente', data);
  }

  //   ******   ACTIVOR / DESACTIVOR (sólo esa columna)   ******  //
  activarGrupoCliente(id: any, activo?: boolean): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'activarGrupoCliente/' + id,
                           activo === undefined ? {} : { activo });
  }

  //   ******   EL PREDETERMINADO (sólo puede haber uno)   ******  //
  /**
   * Marca el grupo que la ficha de un cliente nuevo traerá puesto.
   *
   * Marcar éste BAJA EL QUE ESTUVIERA; sin `valor` alterna. Como la casilla
   * de activo, se manda el valor que se quiere y no «lo contrario de lo que
   * hay», para que dos personas pulsando a la vez acaben donde querían.
   */
  predeterminarGrupoCliente(id: any, valor?: boolean): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'predeterminarGrupoCliente/' + id,
                           valor === undefined ? {} : { predeterminado: valor });
  }

  //   ******   EDITAR   ******  //
  // No cambia de padre: para eso está moverGrupoCliente, que es lo que usa el
  // arrastre de la rejilla.
  editGrupoCliente(id: any, data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'editGrupoCliente/' + id, data);
  }

  //   ******   MOVER EN EL ÁRBOL (arrastrar)   ******  //
  /**
   * `padreId` nulo la sube a la raíz; `antesDe` dice delante de qué hermano
   * queda, y sin él se va al final.
   */
  moverGrupoCliente(id: any, padreId: number | null, antesDe: number | null): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'moverGrupoCliente/' + id,
                           { padre_id: padreId, antes_de: antesDe });
  }

  //   ******   ELIMINAR   ******  //
  deleteGrupoCliente(id: any): Observable<any> {
    return this._http.delete(this.URL_SERVICIOS + 'deleteGrupoCliente/' + id);
  }

  //   ******   BUSCAR POR ID   ******  //
  findByIdGrupoCliente(id: any): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'findByIdGrupoCliente/' + id);
  }

  // ================================================================
  // PAPELERA DE RECICLAJE
  // ================================================================
  //
  // `deleteGrupoCliente` es un borrado lógico: el grupo sale del árbol y de
  // los combos. Desde aquí se saca o se borra de verdad.

  /** Lo que hay en la papelera (más reciente primero). */
  papelera(): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'papelera');
  }

  /** Saca de la papelera una o varias grupos. */
  restaurarGruposClientes(ids: number[]): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'restaurarGruposClientes', { ids });
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
