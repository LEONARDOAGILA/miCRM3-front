import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';


@Injectable({
  providedIn: 'root',
})
export class ProfileService {

  private URL_SERVICIOS: string;  


  constructor(
    private _http: HttpClient,
  ){
    this.URL_SERVICIOS = environment.URL_SERVICIOS  +  'auth/profile/';
  }
  

allProfiles(page: number = 1, perPage: number = 5, search: string = ''): Observable<any> {
  let params = new HttpParams()
    .set('page', page.toString())
    .set('per_page', perPage.toString());
  
  if (search) {
    params = params.set('search', search);
  }
  
  return this._http.get(this.URL_SERVICIOS + 'allProfiles', { params, observe: 'response' });
}



listProfiles(page: number = 1, perPage: number = 5, search: string = ''): Observable<any> {
  let params = new HttpParams()
    .set('page', page.toString())
    .set('per_page', perPage.toString());
  
  if (search) {
    params = params.set('search', search);
  }
  
  return this._http.get(this.URL_SERVICIOS + 'listProfiles', { params, observe: 'response' });
}

  addProfile(data: any) {   
    return this._http.post(this.URL_SERVICIOS   + "addProfile", data);   
  }
  
  editProfile(id: any, data: any) {    
    return this._http.post(this.URL_SERVICIOS   + "editProfile/" + id, data);   
  }

  deleteProfile(id: any) {             
    //console.log('deleteProfile id', id);
    return this._http.delete(this.URL_SERVICIOS + "deleteProfile/" + id);   
  }

  clonProfile(data: any) {              return this._http.post(this.URL_SERVICIOS   + "clonProfile", data);   }
  findByIdProfileAccess(id: any): Observable<any>{ return this._http.get(this.URL_SERVICIOS    + 'findByIdProfileAccess/' + id);    }
  findByIdProfile(id: any): Observable<any>{ return this._http.get(this.URL_SERVICIOS    + 'findByIdProfile/' + id);    }
  findByProgramProfile(id: number, routAccess: string): Observable<any> {  
    return this._http.get(this.URL_SERVICIOS  + "findByProgramProfile/" + id + "/" + routAccess.toUpperCase());    
  }
    
  getAppMenus(perfil_id: any): Observable<any>  {
    return this._http.get(this.URL_SERVICIOS  + "getAppMenus/" + perfil_id);
  }

  /**
   * Qué ve este perfil dentro de un cliente.
   *
   * Devuelve siempre los cuatro datos —{ GESTION, NOTA, ARCHIVO, WHATSAPP }—
   * con TODO donde nadie ha decidido nada, así que la pantalla nunca recibe
   * un hueco que tenga que rellenar a mano.
   */
  visibilidadPerfil(id: any): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'visibilidadPerfil/' + id);
  }

  /** Lo que no se mande se queda como estaba. */
  editVisibilidadPerfil(id: any, visibilidad: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'editVisibilidadPerfil/' + id, { visibilidad });
  }


  
}
