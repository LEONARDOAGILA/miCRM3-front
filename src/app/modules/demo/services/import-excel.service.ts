import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ImportExcelService {

  url: string = environment.URL_SERVICIOS + 'demo/demos/';

  constructor(private _http: HttpClient) { }

  addDatosExcel(data: any): Observable<any> {
    return this._http.post(this.url + "addDatosExcel", data);
  }

}
