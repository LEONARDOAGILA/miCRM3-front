import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
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


  /**
   * Contenido de una carpeta, paginado en servidor (padre = 0 es la raíz).
   * Devuelve data: { data: [...], meta: { total, per_page, current_page,
   * last_page, carpetas, archivos } }.
   */
  allArchivos(padre: number, page: number = 1, perPage: number = 10, search: string = ''): Observable<any> {
    let params = new HttpParams()
      .set('padre', String(padre))
      .set('page', String(page))
      .set('per_page', String(perPage));
    if (search) { params = params.set('search', search); }
    return this._http.get(this.URL_SERVICIOS + 'allArchivos', { params });
  }
  getArchivoTree(): Observable<any>  {  return this._http.get(this.URL_SERVICIOS + "getArchivoTree");  } 
  findByIdArchivo(id: any){ return this._http.get(this.URL_SERVICIOS    + 'findByIdArchivo/' + id);  }
  addArchivo(data: any) {    return this._http.post(this.URL_SERVICIOS + "addArchivo", data);     }
  deleteArchivo(id: any) {     return this._http.delete(this.URL_SERVICIOS + "deleteArchivo/" + id);      }   // a la papelera
  editArchivo(id: any, data: any) {    return this._http.post(this.URL_SERVICIOS + "editArchivo/" + id, data);      }

  // Papelera de reciclaje (borrado lógico en el back)
  papelera(): Observable<any>           { return this._http.get(this.URL_SERVICIOS + "papelera"); }
  restaurarArchivo(id: any)             { return this._http.post(this.URL_SERVICIOS + "restaurarArchivo/" + id, {}); }
  eliminarDefinitivo(id: any)           { return this._http.delete(this.URL_SERVICIOS + "eliminarDefinitivo/" + id); }
  vaciarPapelera()                      { return this._http.delete(this.URL_SERVICIOS + "vaciarPapelera"); }


}
