import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { BoletinGuardar } from '../interfaces/boletinModel';

/**
 * Boletines (core.boletines). El back llama a las funciones core.fn_boletines_*.
 *
 * Las imágenes no tienen URL pública: se piden con el token por
 * `imagen/{id}` y llegan como blob, así que la pantalla las pinta desde un
 * object URL. Eso evita que el enlace de una imagen circule por fuera.
 */
@Injectable({
  providedIn: 'root',
})
export class BoletinService {

  private URL_SERVICIOS: string;

  constructor(
    private _http: HttpClient,
  ) {
    this.URL_SERVICIOS = environment.URL_SERVICIOS + 'config/boletin/';
  }

  //   ******   LISTADO CON PAGINACIÓN   ******  //
  allBoletines(page: number = 1, perPage: number = 10, search: string = '', estado: string = 'TODOS'): Observable<any> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('per_page', perPage.toString())
      .set('estado', estado || 'TODOS');
    if (search) { params = params.set('search', search); }
    return this._http.get<any>(this.URL_SERVICIOS + 'allBoletines', { params, observe: 'response' });
  }

  findByIdBoletin(id: number | string): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'findByIdBoletin/' + id);
  }

  /** Usuarios que verán el boletín, ya resueltos (directos + por grupo). */
  destinatarios(id: number | string): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'destinatarios/' + id);
  }

  addBoletin(data: BoletinGuardar): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'addBoletin', data);
  }

  editBoletin(id: number | string, data: BoletinGuardar): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'editBoletin/' + id, data);
  }

  /** Borrado lógico: se va a la papelera. */
  deleteBoletin(id: number | string): Observable<any> {
    return this._http.delete(this.URL_SERVICIOS + 'deleteBoletin/' + id);
  }

  //   ******   PAPELERA   ******  //
  papelera(): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'papelera');
  }
  restaurarBoletin(id: number | string): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'restaurarBoletin/' + id, {});
  }
  eliminarDefinitivo(id: number | string): Observable<any> {
    return this._http.delete(this.URL_SERVICIOS + 'eliminarDefinitivo/' + id);
  }
  vaciarPapelera(): Observable<any> {
    return this._http.delete(this.URL_SERVICIOS + 'vaciarPapelera');
  }

  //   ******   IMÁGENES   ******  //
  /** Sube el fichero y devuelve el nombre con el que quedó guardado. */
  subirImagen(archivo: File): Observable<any> {
    const fd = new FormData();
    fd.append('imagen_file', archivo, archivo.name);
    return this._http.post(this.URL_SERVICIOS + 'subirImagen', fd);
  }

  /** La imagen como blob (va con el token del interceptor). */
  imagen(imagenId: number | string): Observable<Blob> {
    return this._http.get(this.URL_SERVICIOS + 'imagen/' + imagenId, { responseType: 'blob' });
  }

  //   ******   LO QUE VE EL USUARIO AL ENTRAR   ******  //
  misBoletines(): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'misBoletines');
  }

  /** Registra la lectura; con no_mostrar el boletín deja de aparecer a ese usuario. */
  marcarVisto(id: number | string, noMostrar: boolean = false): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'marcarVisto/' + id, { no_mostrar: noMostrar });
  }
}
