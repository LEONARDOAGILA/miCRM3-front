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
  /** Varios a la vez a la misma carpeta (una transacción). */
  moverArchivos(ids: number[], padre: number | null): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'moverArchivos', { ids, padre: padre ?? 0 });
  }
  /** Varios a la papelera de una vez (una transacción). */
  eliminarArchivos(ids: number[]): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'eliminarArchivos', { ids });
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

  /**
   * Uno o varios elementos (carpetas con su estructura) en un .zip, como
   * blob con el token. Cabeceras X-Zip-* con el resumen (ficheros, enlaces,
   * omitidos por proteger_url).
   */
  descargarZip(ids: number[]): Observable<HttpResponse<Blob>> {
    return this._http.post(this.URL_SERVICIOS + 'descargarZip', { ids }, {
      responseType: 'blob',
      observe: 'response'
    });
  }

  // ---------- Permisos por archivo (por usuario) ----------
  /** Filas del nodo + heredadas + público/propietario + si el que consulta puede administrar. */
  permisosArchivo(id: number): Observable<any> { return this._http.get(this.URL_SERVICIOS + 'permisosArchivo/' + id); }
  /** Crea o actualiza la fila de un usuario sobre el nodo. */
  guardarPermisoArchivo(id: number, datos: any): Observable<any> { return this._http.post(this.URL_SERVICIOS + 'permisosArchivo/' + id, datos); }
  quitarPermisoArchivo(id: number, userId: number): Observable<any> { return this._http.delete(this.URL_SERVICIOS + 'permisosArchivo/' + id + '/' + userId); }
  /** Usuarios activos para el selector (login, nombre, apellido, email). */
  usuariosParaPermisos(search: string): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'usuariosParaPermisos', { params: new HttpParams().set('search', search ?? '') });
  }
  /**
   * Historial de acciones (quién abrió / descargó) de un archivo o de todo lo
   * que cuelga de una carpeta. Filtros: accion (EJECUTAR | DESCARGAR), desde /
   * hasta (YYYY-MM-DD), limit. Devuelve { filas, totales: { ejecutar, descargar } }.
   */
  accesosArchivo(id: number, filtros: { accion?: string; desde?: string; hasta?: string; limit?: number } = {}): Observable<any> {
    let params = new HttpParams();
    Object.entries(filtros).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') { params = params.set(k, String(v)); } });
    return this._http.get(this.URL_SERVICIOS + 'accesosArchivo/' + id, { params });
  }

  // ---------- Usuario final: Mis archivos ----------
  /** Árbol con lo que el usuario puede ver, con `permiso` en cada nodo. */
  misArchivos(): Observable<any> { return this._http.get(this.URL_SERVICIOS + 'misArchivos'); }
  miPermisoArchivo(id: number): Observable<any> { return this._http.get(this.URL_SERVICIOS + 'miPermisoArchivo/' + id); }
  /** Autoriza `ejecutar`, registra el acceso y devuelve el registro con sus banderas. */
  abrirArchivo(id: number): Observable<any> { return this._http.post(this.URL_SERVICIOS + 'abrirArchivo/' + id, {}); }

  // Papelera de reciclaje (borrado lógico en el back)
  /** Espacio que ocupan las subidas y disco libre/total (pie del árbol). */
  almacenamiento(): Observable<any>     { return this._http.get(this.URL_SERVICIOS + 'almacenamiento'); }
  papelera(): Observable<any>           { return this._http.get(this.URL_SERVICIOS + "papelera"); }
  restaurarArchivo(id: any)             { return this._http.post(this.URL_SERVICIOS + "restaurarArchivo/" + id, {}); }
  eliminarDefinitivo(id: any)           { return this._http.delete(this.URL_SERVICIOS + "eliminarDefinitivo/" + id); }
  vaciarPapelera()                      { return this._http.delete(this.URL_SERVICIOS + "vaciarPapelera"); }


}
