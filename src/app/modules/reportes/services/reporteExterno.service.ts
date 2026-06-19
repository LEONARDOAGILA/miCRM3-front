import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';


@Injectable({
  providedIn: 'root',
})
export class ReporteExternoService {

  private URL_SERVICIOS: string;  


  constructor(
    private _http: HttpClient,
  ){
    this.URL_SERVICIOS = environment.URL_SERVICIOS  +  'reporte/reporteexterno/';
  }
  

  allReportesExternos(): Observable<any> {  return this._http.get(this.URL_SERVICIOS   + 'allReportesExternos'); }
  listReportesExternos(): Observable<any> { return this._http.get(this.URL_SERVICIOS   + 'listReportesExternos'); }
  addReporteExterno(data: any) { return this._http.post(this.URL_SERVICIOS            + "addReporteExterno", data); }
  editReporteExterno(id: any, data: any) { return this._http.post(this.URL_SERVICIOS  + "editReporteExterno/" + id, data); }
  deleteReporteExterno(id: any) { return this._http.delete(this.URL_SERVICIOS         + "deleteReporteExterno/" + id); }
  clonReporteExterno(data: any) { return this._http.post(this.URL_SERVICIOS           + "clonReporteExterno", data); }
  findByIdReporteExterno(id: any): Observable<any>{ return this._http.get(this.URL_SERVICIOS    + 'findByIdReporteExterno/' + id); }  

  listUserReportesExternos(): Observable<any> {  return this._http.get(this.URL_SERVICIOS   + 'listUserReportesExternos'); } 
  listUsersReportesExternosSelected(id_reporte: number): Observable<any> { return this._http.get(this.URL_SERVICIOS       + 'listUsersReportesExternosSelected/' + id_reporte); } 
  listUsersReportesExternosPendientexSeleccionar(id_reporte: number): Observable<any> { return this._http.get(this.URL_SERVICIOS       + 'listUsersReportesExternosPendientexSeleccionar/' + id_reporte); } 
  saveUsersReportesExternos(data: any) {  return this._http.post(this.URL_SERVICIOS  +  "saveUsersReportesExternos", data); } 
  
  updateUsersReportesExternos(id: any) { return this._http.post(this.URL_SERVICIOS  + "updateUsersReportesExternos/" + id,null); }

}
