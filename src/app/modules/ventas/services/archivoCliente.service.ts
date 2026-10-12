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

  /**
   * Sólo deja el fichero en disco; devuelve nombre, tipo, tamaño y mime.
   *
   * El origen decide la carpeta: lo adjuntado a una gestión va a
   * img/clientes/gestiones y lo demás a img/clientes. Se manda al SUBIR y no
   * al crear el registro porque para entonces el fichero ya está escrito.
   */
  subirArchivo(clienteId: number, fichero: File, origen?: 'gestion'): Observable<HttpEvent<any>> {
    const datos = new FormData();
    datos.append('cliente_id', String(clienteId));
    datos.append('archivo', fichero, fichero.name);
    if (origen) { datos.append('origen', origen); }
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
  /**
   * La url para ver o descargar un fichero.
   *
   * CON EL TOKEN EN LA URL, y no en una cabecera: quien pide es un <img src>,
   * un <video src> o un <iframe>, y ésos no mandan cabeceras. Antes la ruta era
   * pública —con el id a mano cualquiera se llevaba el fichero de cualquier
   * cliente, sin sesión— y ahora comprueba quién pide y si ese cliente es suyo.
   *
   * El coste es que el token queda en el historial del navegador. La
   * alternativa son enlaces firmados con caducidad que acuñe el servidor; es la
   * mejora siguiente, no la primera.
   */
  urlDe(id: number, descargar = false): string {
    const t = encodeURIComponent(localStorage.getItem('token') ?? '');
    return this.URL_SERVICIOS + 'ver/' + id + '?t=' + t + (descargar ? '&descargar=1' : '');
  }
}
