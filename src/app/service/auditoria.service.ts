import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class AuditoriaService {
  private URL_SERVICIOS: string;

  constructor(private _http: HttpClient) {
    this.URL_SERVICIOS = environment.URL_SERVICIOS + 'auth/auditoria/';
  }

  getAuditoriaByRegistro(
    tabla: string,
    registroId: number,
    tipoOperacion?: string,
    fechaDesde?: string,
    fechaHasta?: string,
    page: number = 1,
    perPage: number = 15
  ): Observable<any> {
    const formData = new FormData();
    if (tipoOperacion) formData.append('tipo_operacion', tipoOperacion);
    if (fechaDesde) formData.append('fecha_desde', fechaDesde);
    if (fechaHasta) formData.append('fecha_hasta', fechaHasta);
    formData.append('page', page.toString());
    formData.append('per_page', perPage.toString());

    const url = `${this.URL_SERVICIOS}getByRecord/${tabla}/${registroId}`;
    //console.log('getAuditoriaByRegistro:', { tabla, registroId, tipoOperacion, fechaDesde, fechaHasta, page, perPage });

    return this._http.post(url, formData);
  }
}