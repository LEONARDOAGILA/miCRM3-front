import { Injectable } from '@angular/core';
import { HttpClient, HttpEvent, HttpParams, HttpResponse } from '@angular/common/http';
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
  /** Contenido de una carpeta. perPage 0 = toda la carpeta, sin paginar. */
  allArchivos(padre: number, page: number = 1, perPage: number = 0, search: string = ''): Observable<any> {
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
  /** Mueve un archivo o carpeta (con su contenido) a otra carpeta; padre null/0 = raíz. */
  moverArchivo(id: number, padre: number | null): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'moverArchivo/' + id, { padre: padre ?? 0 });
  }
  editArchivo(id: any, data: any) {    return this._http.post(this.URL_SERVICIOS + "editArchivo/" + id, data);      }

  /**
   * Sube un fichero físico (imagen, pdf, excel, word, video, otro). Devuelve
   * los eventos HTTP para poder pintar el progreso; el último trae el cuerpo
   * con { url, nombre_original, tamano, ... }. Se llama ANTES de addArchivo /
   * editArchivo, que reciben esa url.
   */
  subirArchivo(fichero: File): Observable<HttpEvent<any>> {
    // Sólo el fichero: el back clasifica el tipo por la extensión y lo
    // devuelve en data.tipo junto con la url y el tamaño
    const datos = new FormData();
    datos.append('archivo', fichero, fichero.name);
    return this._http.post(this.URL_SERVICIOS + 'subirArchivo', datos, {
      reportProgress: true,
      observe: 'events'
    });
  }

  /**
   * URL absoluta de un archivo: los enlaces (http...) van tal cual; las
   * subidas se guardan relativas ("storage/img/file-manager/...") y se
   * sirven desde la base del back.
   */
  urlPublica(url: string | null | undefined): string {
    if (!url) { return ''; }
    if (/^(https?:)?\/\//i.test(url)) { return url; }
    return environment.URL_SERVICIOS + url.replace(/^\/+/, '');
  }

  /**
   * Descarga un fichero subido como blob (con el token, por el interceptor).
   * El back lo devuelve como adjunto con su nombre legible; el visor lo
   * guarda desde memoria. Un <a download> directo no sirve: el fichero está
   * en otra origen y el navegador ignora `download` y lo abre en una pestaña.
   */
  descargarArchivo(id: number): Observable<HttpResponse<Blob>> {
    return this._http.get(this.URL_SERVICIOS + 'descargarArchivo/' + id, {
      responseType: 'blob',
      observe: 'response'
    });
  }

  // Papelera de reciclaje (borrado lógico en el back)
  /** Espacio que ocupan las subidas y disco libre/total (pie del árbol). */
  almacenamiento(): Observable<any>     { return this._http.get(this.URL_SERVICIOS + 'almacenamiento'); }
  papelera(): Observable<any>           { return this._http.get(this.URL_SERVICIOS + "papelera"); }
  restaurarArchivo(id: any)             { return this._http.post(this.URL_SERVICIOS + "restaurarArchivo/" + id, {}); }
  eliminarDefinitivo(id: any)           { return this._http.delete(this.URL_SERVICIOS + "eliminarDefinitivo/" + id); }
  vaciarPapelera()                      { return this._http.delete(this.URL_SERVICIOS + "vaciarPapelera"); }


}
