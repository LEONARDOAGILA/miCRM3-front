import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of, tap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { TipoGestion } from '../interfaces/catalogoGestion';

/**
 * Tipos y asuntos de gestión.
 *
 * `catalogo()` es lo que necesita el formulario de gestión; el resto lo usa la
 * pantalla de mantenimiento.
 */
@Injectable({ providedIn: 'root' })
export class CatalogoGestionService {

  private URL_SERVICIOS: string;

  /**
   * El catálogo se guarda tras la primera petición.
   *
   * Lo pide cada vez que se abre el formulario de gestión, que es muchas veces
   * al día, y cambia muy de tarde en tarde: es una lista que alguien mantiene a
   * mano. Quien lo modifica llama a `olvidar()` y la siguiente vez se vuelve a
   * pedir, así que nadie trabaja con una lista vieja.
   */
  private memoria: TipoGestion[] | null = null;

  constructor(
    private _http: HttpClient,
  ) {
    this.URL_SERVICIOS = environment.URL_SERVICIOS + 'ventas/catalogoGestion/';
  }

  // ================================================================
  // LO QUE USA EL FORMULARIO DE GESTIÓN
  // ================================================================

  /** Tipos activos con sus asuntos activos. */
  catalogo(refrescar = false): Observable<any> {
    if (this.memoria && !refrescar) {
      return of({ status: 'success', message: 'Catálogo en memoria', data: this.memoria });
    }
    return this._http.get(this.URL_SERVICIOS + 'catalogo').pipe(
      tap((r: any) => { if (r?.status === 'success') { this.memoria = r.data ?? []; } })
    );
  }

  /** Lo llama el mantenimiento después de guardar: la próxima vez se pide de nuevo. */
  olvidar(): void { this.memoria = null; }

  // ================================================================
  // MANTENIMIENTO
  // ================================================================

  allTipos(incluirInactivos = true): Observable<any> {
    const params = new HttpParams().set('inactivos', incluirInactivos ? '1' : '0');
    return this._http.get(this.URL_SERVICIOS + 'allTipos', { params });
  }

  addTipo(data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'addTipo', data);
  }

  editTipo(id: any, data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'editTipo/' + id, data);
  }

  /** Si el tipo está en uso no se borra: se desactiva, y el mensaje lo dice. */
  deleteTipo(id: any): Observable<any> {
    return this._http.delete(this.URL_SERVICIOS + 'deleteTipo/' + id);
  }

  allAsuntos(tipoId: number | null = null, incluirInactivos = true): Observable<any> {
    let params = new HttpParams().set('inactivos', incluirInactivos ? '1' : '0');
    if (tipoId) { params = params.set('tipo_id', String(tipoId)); }
    return this._http.get(this.URL_SERVICIOS + 'allAsuntos', { params });
  }

  addAsunto(data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'addAsunto', data);
  }

  editAsunto(id: any, data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'editAsunto/' + id, data);
  }

  /** Igual que con los tipos: en uso se desactiva, libre se borra. */
  deleteAsunto(id: any): Observable<any> {
    return this._http.delete(this.URL_SERVICIOS + 'deleteAsunto/' + id);
  }
}
