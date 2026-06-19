import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';


@Injectable({
  providedIn: 'root',
})
export class DepartamentoService {

  private URL_SERVICIOS: string;  


  constructor(
    private _http: HttpClient,
  ){
    this.URL_SERVICIOS = environment.URL_SERVICIOS  +  'config/departamento/';
  }
  

  allDepartamentos(): Observable<any> {  return this._http.get(this.URL_SERVICIOS   + 'allDepartamentos'); }
  listDepartamentos(): Observable<any> { return this._http.get(this.URL_SERVICIOS   + 'listDepartamentos'); }
  addDepartamento(data: any) { return this._http.post(this.URL_SERVICIOS            + "addDepartamento", data); }
  editDepartamento(id: any, data: any) { return this._http.post(this.URL_SERVICIOS  + "editDepartamento/" + id, data); }
  deleteDepartamento(id: any) { return this._http.delete(this.URL_SERVICIOS         + "deleteDepartamento/" + id); }
  clonDepartamento(data: any) { return this._http.post(this.URL_SERVICIOS           + "clonDepartamento", data); }
  findByIdDepartamento(id: any): Observable<any>{ return this._http.get(this.URL_SERVICIOS    + 'findByIdDepartamento/' + id); }
  
  
}
