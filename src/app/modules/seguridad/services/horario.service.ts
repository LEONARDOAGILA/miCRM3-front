// horario.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

@Injectable({
    providedIn: 'root'
})
export class HorarioService {
    private URL_SERVICIOS = environment.URL_SERVICIOS  + 'auth/horario/';

    constructor(private _http: HttpClient) { }

    allHorarios(page: number = 1, perPage: number = 15, search: string = ''): Observable<any> {
        let params = new HttpParams()
            .set('page', page.toString())
            .set('per_page', perPage.toString());
        if (search) params = params.set('search', search);
        return this._http.get(this.URL_SERVICIOS + 'allHorarios', { params, observe: 'response' });
    }

getHorario(id: number): Observable<any> {
  return this._http.get(this.URL_SERVICIOS + `getHorario/${id}`);
}



addHorario(data: any): Observable<any> {
  return this._http.post(this.URL_SERVICIOS + 'addHorario', data);
}


editHorario(id: number, data: any): Observable<any> {
  const formData = new FormData();
  formData.append('json', JSON.stringify(data));
  return this._http.post(this.URL_SERVICIOS + `editHorario/${id}`, formData);
}

deleteHorario(id: number): Observable<any> {
  return this._http.delete(this.URL_SERVICIOS + `deleteHorario/${id}`);
}


listHorarios(page: number = 1, perPage: number = 5, search: string = ''): Observable<any> {
  let params = new HttpParams()
    .set('page', page.toString())
    .set('per_page', perPage.toString());
  
  if (search) {
    params = params.set('search', search);
  }
  
  return this._http.get(this.URL_SERVICIOS + 'listHorarios', { params, observe: 'response' });
}


}

