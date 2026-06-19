import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';



@Injectable({
  providedIn: 'root'
})
export class ArchivoService {

  private URL_SERVICIOS: string;  

  constructor( 
    private _http: HttpClient
  ){ 
    this.URL_SERVICIOS = environment.URL_SERVICIOS  +  'config/archivo/';
  }


  allArchivos(): Observable<any>  {  return this._http.get(this.URL_SERVICIOS + "allArchivos");  } 
  getArchivoTree(): Observable<any>  {  return this._http.get(this.URL_SERVICIOS + "getArchivoTree");  } 
  findByIdArchivo(id: any){ return this._http.get(this.URL_SERVICIOS    + 'findByIdArchivo/' + id);  }
  addArchivo(data: any) {    return this._http.post(this.URL_SERVICIOS + "addArchivo", data);     }
  deleteArchivo(id: any) {     return this._http.delete(this.URL_SERVICIOS + "deleteArchivo/" + id);      }
  editArchivo(id: any, data: any) {    return this._http.post(this.URL_SERVICIOS + "editArchivo/" + id, data);      }


}
