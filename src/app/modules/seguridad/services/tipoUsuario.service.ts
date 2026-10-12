// tipoUsuario.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

/**
 * Tipos de usuario (seguridad.tipos_usuarios): la CLASE de usuario —del
 * sistema, de la página web, freelance, temporal…—, no sus permisos.
 *
 * Cada tipo puede tener vigencia (fecha de inicio y de fin): mientras no esté
 * vigente, los usuarios de ese tipo no entran al sistema.
 */
@Injectable({
    providedIn: 'root'
})
export class TipoUsuarioService {
    private URL_SERVICIOS = environment.URL_SERVICIOS + 'auth/tipoUsuario/';

    constructor(private _http: HttpClient) { }

    /** Listado paginado de la pantalla de administración. */
    allTiposUsuario(page: number = 1, perPage: number = 15, search: string = ''): Observable<any> {
        let params = new HttpParams()
            .set('page', page.toString())
            .set('per_page', perPage.toString());
        if (search) params = params.set('search', search);
        return this._http.get(this.URL_SERVICIOS + 'allTiposUsuario', { params, observe: 'response' });
    }

    /**
     * El catálogo para los desplegables.
     *
     * `incluirInactivos` hace falta al EDITAR un usuario, para poder mostrar un
     * tipo ya dado de baja en vez de dejar el campo en blanco; `soloVigentes`
     * es lo sensato al dar de alta.
     */
    listTiposUsuario(incluirInactivos = false, soloVigentes = false): Observable<any> {
        let params = new HttpParams();
        if (incluirInactivos) params = params.set('inactivos', '1');
        if (soloVigentes)     params = params.set('vigentes', '1');
        return this._http.get(this.URL_SERVICIOS + 'listTiposUsuario', { params });
    }

    getTipoUsuario(id: number): Observable<any> {
        return this._http.get(this.URL_SERVICIOS + `getTipoUsuario/${id}`);
    }

    addTipoUsuario(data: any): Observable<any> {
        return this._http.post(this.URL_SERVICIOS + 'addTipoUsuario', data);
    }

    /** Va como FormData en el campo `json`, igual que el resto de los editX. */
    editTipoUsuario(id: number, data: any): Observable<any> {
        const formData = new FormData();
        formData.append('json', JSON.stringify(data));
        return this._http.post(this.URL_SERVICIOS + `editTipoUsuario/${id}`, formData);
    }

    deleteTipoUsuario(id: number): Observable<any> {
        return this._http.delete(this.URL_SERVICIOS + `deleteTipoUsuario/${id}`);
    }
}
