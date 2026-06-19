import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ClienteService {

  url: string = environment.URL_SERVICIOS + 'demo/demos/';

  constructor(private _http: HttpClient) { }

  listClientes(): Observable<any> { return this._http.get(this.url + 'listClientes'); }


  // addReporteLink(data: any) {
  //   let URL = this.url + this.modulo + "addReporteLink";
  //   return this._http.post(URL, data);
  // }

  // editReporteLink(reporte_id: any, data: any) {
  //   let URL = this.url + this.modulo + "editReporteLink/" + reporte_id;
  //   return this._http.post(URL, data);
  // }

  // deleteReporteLink(reporte_id: any) {
  //   let URL = this.url + this.modulo + "deleteReporteLink/" + reporte_id;
  //   return this._http.delete(URL);
  // }

}
