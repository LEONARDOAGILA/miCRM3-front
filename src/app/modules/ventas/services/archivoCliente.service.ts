import { Injectable } from '@angular/core';
import { HttpClient, HttpEvent, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

/**
 * Los archivos de un cliente.
 *
 * Subir y crear el registro van separados, como en el administrador de
 * archivos: `subirArchivo` deja el fichero en disco y devuelve con qué nombre
 * quedó, y `addArchivo` crea la fila con la descripción. Así la pantalla puede
 * enseñar el progreso de cada uno y, si falla el registro, no queda una fila
 * apuntando a un fichero que no se subió.
 */
@Injectable({ providedIn: 'root' })
export class ArchivoClienteService {

  private URL_SERVICIOS: string;

  constructor(
    private _http: HttpClient,
  ) {
    this.URL_SERVICIOS = environment.URL_SERVICIOS + 'ventas/archivoCliente/';
  }

  allArchivos(clienteId: number, incluirInactivos = true): Observable<any> {
    const params = new HttpParams()
      .set('cliente_id', String(clienteId ?? ''))
      .set('inactivos', incluirInactivos ? '1' : '0');
    return this._http.get(this.URL_SERVICIOS + 'allArchivos', { params });
  }

  /**
   * Los adjuntos de una gestión.
   *
   * No salen en la pestaña de Archivos del cliente: son lo que se mandó en una
   * conversación concreta, no documentos suyos.
   */
  archivosDeGestion(gestionId: number, incluirInactivos = true): Observable<any> {
    const params = new HttpParams()
      .set('gestion_id', String(gestionId ?? ''))
      .set('inactivos', incluirInactivos ? '1' : '0');
    return this._http.get(this.URL_SERVICIOS + 'allArchivos', { params });
  }

  /** Sólo deja el fichero en disco; devuelve nombre, tipo, tamaño y mime. */
  subirArchivo(clienteId: number, fichero: File): Observable<HttpEvent<any>> {
    const datos = new FormData();
    datos.append('cliente_id', String(clienteId));
    datos.append('archivo', fichero, fichero.name);
    return this._http.post(this.URL_SERVICIOS + 'subirArchivo', datos, {
      reportProgress: true,
      observe: 'events',
    });
  }

  addArchivo(data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'addArchivo', data);
  }

  /** Sólo el nombre, la descripción, el orden y el activo: el fichero no se cambia. */
  editArchivo(id: any, data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'editArchivo/' + id, data);
  }

  /** Borra la fila y el fichero del disco. */
  deleteArchivo(id: any): Observable<any> {
    return this._http.delete(this.URL_SERVICIOS + 'deleteArchivo/' + id);
  }

  /**
   * La url con la que se ve el archivo.
   *
   * Va sin token a propósito: la consumen <img src> y <video src>, que no
   * mandan cabeceras. Es el mismo trato que ya tienen la foto y el mapa del
   * cliente (getImagenCliente, getFotoUbicacion).
   */
  urlDe(id: number, descargar = false): string {
    return this.URL_SERVICIOS + 'ver/' + id + (descargar ? '?descargar=1' : '');
  }
}
