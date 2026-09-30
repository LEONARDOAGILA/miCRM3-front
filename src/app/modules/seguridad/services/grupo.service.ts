import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

/**
 * Grupos de usuarios (seguridad.grupos). Mismo esquema que UserService:
 * el back llama a seguridad.fn_grupos_*.
 */
@Injectable({
  providedIn: 'root',
})
export class GrupoService {

  private URL_SERVICIOS: string;

  constructor(
    private _http: HttpClient,
  ) {
    this.URL_SERVICIOS = environment.URL_SERVICIOS + 'auth/grupo/';
  }

  /** Árbol completo, plano (padre antes que hijos), con nivel, ruta y contadores. */
  allGrupos(soloActivos: boolean = false): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'allGrupos', { params: new HttpParams().set('activos', soloActivos ? '1' : '0') });
  }

  findByIdGrupo(id: any): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'findByIdGrupo/' + id);
  }

  addGrupo(data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'addGrupo', data);
  }

  editGrupo(id: any, data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'editGrupo/' + id, data);
  }

  deleteGrupo(id: any): Observable<any> {
    return this._http.delete(this.URL_SERVICIOS + 'deleteGrupo/' + id);
  }

  /** Arrastrar y soltar: a otro padre (null = raíz) y/o delante de un hermano. */
  moverGrupo(id: any, padreId: number | null, antesDe: number | null = null): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'moverGrupo/' + id, { padre_id: padreId, antes_de: antesDe });
  }
}
