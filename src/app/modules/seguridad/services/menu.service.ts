import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';



@Injectable({
  providedIn: 'root'
})
export class MenuService {

  private URL_SERVICIOS: string;  

  constructor( 
    private _http: HttpClient
  ){ 
    this.URL_SERVICIOS = environment.URL_SERVICIOS  +  'auth/menu/';
  }


  allMenus(): Observable<any>  {  return this._http.get(this.URL_SERVICIOS + "allMenus");  } 
  getMenuTree(): Observable<any>  {  return this._http.get(this.URL_SERVICIOS + "getMenuTree");  } 
  findByIdMenu(id: any){ return this._http.get(this.URL_SERVICIOS    + 'findByIdMenu/' + id);  }
  addMenu(data: any) {    return this._http.post(this.URL_SERVICIOS + "addMenu", data);     }
  deleteMenu(id: any) {     return this._http.delete(this.URL_SERVICIOS + "deleteMenu/" + id);      }
  editMenu(id: any, data: any) {    return this._http.post(this.URL_SERVICIOS + "editMenu/" + id, data);      }
  /** Arrastrar y soltar en allMenus: a otro padre (null = raíz) y/o delante de un hermano (antes_de null = al final). */
  moverMenu(id: number, padreId: number | null, antesDe: number | null): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'moverMenu/' + id, { padre_id: padreId, antes_de: antesDe });
  }


}
