import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

interface ApiResponseFoto {
  code: number;
  status: 'success' | 'error';
  message: string;
  data: { foto: string; full_path: string };
}

/**
 * Clientes (ventas.clientes). Mismo esquema que EmpleadoService, foto
 * incluida: addImagen sube el fichero y getClienteImage da la url para el
 * <img>.
 */
@Injectable({
  providedIn: 'root',
})
export class ClienteService {

  private URL_SERVICIOS: string;

  constructor(
    private _http: HttpClient,
  ) {
    this.URL_SERVICIOS = environment.URL_SERVICIOS + 'ventas/cliente/';
  }

  //   ******   LISTADO CON PAGINACIÓN   ******  //
  /**
   * Una página de clientes.
   *
   * `estado` filtra por ACTIVO / INACTIVO / SUSPENDIDO / MOROSO, y va al
   * servidor en vez de filtrarse aquí porque la lista está paginada allá: con
   * mil clientes, filtrar en el navegador sólo miraría las quince filas de la
   * página que se está viendo. Vacío = todos.
   */
  allClientes(page: number = 1, perPage: number = 10, search: string = '', estado: string = '', soloMios = false): Observable<any> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('per_page', perPage.toString());
    if (search) {
      params = params.set('search', search);
    }
    if (estado) {
      params = params.set('estado', estado);
    }
    // Sólo la cartera de quien entra. Lo resuelve el servidor con el usuario
    // del token, no con un id que mande el navegador: si no, cualquiera
    // podría pedir la cartera de otro cambiando el parámetro.
    if (soloMios) {
      params = params.set('mios', '1');
    }
    return this._http.get<any>(this.URL_SERVICIOS + 'allClientes', { params, observe: 'response' });
  }

  //   ******   LISTADO SIMPLE (selector / facturación)   ******  //
  listClientes(soloActivos: boolean = true): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'listClientes', { params: new HttpParams().set('activos', soloActivos ? '1' : '0') });
  }

  //   ******   CREAR   ******  //
  addCliente(data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'addCliente', data);
  }

  //   ******   CLONAR (mismo endpoint que crear)   ******  //
  clonCliente(data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'addCliente', data);
  }

  //   ******   EDITAR   ******  //
  editCliente(id: any, data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'editCliente/' + id, data);
  }

  //   ******   ELIMINAR   ******  //
  deleteCliente(id: any): Observable<any> {
    return this._http.delete(this.URL_SERVICIOS + 'deleteCliente/' + id);
  }

  //   ******   BUSCAR POR ID   ******  //
  findByIdCliente(id: any): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'findByIdCliente/' + id);
  }

  //   ******   PAPELERA DE RECICLAJE   ******  //
  // deleteCliente es un borrado lógico: el cliente acaba aquí, y desde aquí
  // se restaura o se borra de verdad.
  papelera(): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'papelera');
  }
  restaurarClientes(ids: number[]): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'restaurarClientes', { ids });
  }
  eliminarDefinitivo(ids: number[]): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'eliminarDefinitivo', { ids });
  }
  vaciarPapelera(): Observable<any> {
    return this._http.delete(this.URL_SERVICIOS + 'vaciarPapelera');
  }

  //   ******   PERSONAS DE CONTACTO   ******  //
  listContactos(clienteId: any): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'listContactos/' + clienteId);
  }

  /** Manda la lista completa: el back inserta, actualiza y elimina lo que falte. */
  guardarContactos(clienteId: any, contactos: any[]): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'guardarContactos/' + clienteId, { contactos });
  }

  //   ******   AGREGAR FOTO   ******  //
  addImagen(data: FormData): Observable<ApiResponseFoto> {
    return this._http.post<ApiResponseFoto>(this.URL_SERVICIOS + 'addImagen', data);
  }

  //   ******   URL DE LA FOTO   ******  //
  getClienteImage(clienteId: number, avoidCache = false): string {
    let url = `${this.URL_SERVICIOS}getImagenCliente/${clienteId}`;
    if (avoidCache) {
      url += `?t=${Date.now()}`;
    }
    return url;
  }

  //   ******   UBICACIÓN (la dirección que trae el mapa)   ******  //

  /** Los diez campos que devuelve el mapa, en una sola llamada. */
  guardarUbicacion(clienteId: number, datos: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'guardarUbicacion/' + clienteId, datos);
  }

  /** Una de las dos capturas: la vista del mapa o la de la calle. */
  addFotoUbicacion(data: FormData): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'addFotoUbicacion', data);
  }

  /** URL para el <img> de cada foto del mapa. */
  getFotoUbicacion(clienteId: number, campo: 'mapa' | 'casa', avoidCache = false): string {
    let url = `${this.URL_SERVICIOS}getFotoUbicacion/${clienteId}/${campo}`;
    if (avoidCache) {
      url += `?t=${Date.now()}`;
    }
    return url;
  }
}
