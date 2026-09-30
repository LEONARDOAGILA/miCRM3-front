import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

/** Filtros de la grilla de marcaciones. */
export interface FiltrosMarcacion {
  desde?: string | null;
  hasta?: string | null;
  empleado_id?: number | null;
  tipo?: string | null;
  origen?: string | null;
}

/**
 * Marcaciones de empleados (rh.marcaciones) y plantillas faciales
 * (rh.rostros_empleados). Mismo esquema que EmpleadoService.
 */
@Injectable({
  providedIn: 'root',
})
export class MarcacionService {

  private URL: string;
  private URL_ROSTRO: string;

  constructor(private _http: HttpClient) {
    this.URL = environment.URL_SERVICIOS + 'rh/marcacion/';
    this.URL_ROSTRO = environment.URL_SERVICIOS + 'rh/rostro/';
  }

  //   ******   MARCACIONES   ******  //

  allMarcaciones(page = 1, perPage = 15, search = '', filtros: FiltrosMarcacion = {}): Observable<any> {
    let params = new HttpParams().set('page', String(page)).set('per_page', String(perPage));
    if (search) { params = params.set('search', search); }
    if (filtros.desde) { params = params.set('desde', filtros.desde); }
    if (filtros.hasta) { params = params.set('hasta', filtros.hasta); }
    if (filtros.empleado_id) { params = params.set('empleado_id', String(filtros.empleado_id)); }
    if (filtros.tipo) { params = params.set('tipo', filtros.tipo); }
    if (filtros.origen) { params = params.set('origen', filtros.origen); }
    return this._http.get<any>(this.URL + 'allMarcaciones', { params, observe: 'response' });
  }

  findByIdMarcacion(id: any): Observable<any> {
    return this._http.get(this.URL + 'findByIdMarcacion/' + id);
  }

  /** Kiosco: el tipo se deduce solo y hay espera anti-duplicado. */
  registrar(datos: {
    empleado_id: number; similitud?: number; dispositivo?: string; foto_base64?: string | null;
    latitud?: number; longitud?: number; espera_segundos?: number; tipo?: string; observacion?: string;
  }): Observable<any> {
    return this._http.post(this.URL + 'registrar', datos);
  }

  /** Alta manual (con tipo y fecha/hora). */
  addMarcacion(datos: any): Observable<any> {
    return this._http.post(this.URL + 'addMarcacion', datos);
  }

  editMarcacion(id: any, datos: any): Observable<any> {
    return this._http.post(this.URL + 'editMarcacion/' + id, datos);
  }

  deleteMarcacion(id: any): Observable<any> {
    return this._http.delete(this.URL + 'deleteMarcacion/' + id);
  }

  /** Horas trabajadas por empleado y día. */
  resumen(desde?: string | null, hasta?: string | null, empleadoId?: number | null): Observable<any> {
    let params = new HttpParams();
    if (desde) { params = params.set('desde', desde); }
    if (hasta) { params = params.set('hasta', hasta); }
    if (empleadoId) { params = params.set('empleado_id', String(empleadoId)); }
    return this._http.get(this.URL + 'resumen', { params });
  }

  /** URL de la foto del momento (la usa <img src>). */
  getImagenMarcacion(id: number): string {
    return `${this.URL}getImagenMarcacion/${id}`;
  }

  //   ******   ROSTROS (plantillas faciales)   ******  //

  allRostros(empleadoId?: number | null): Observable<any> {
    let params = new HttpParams();
    if (empleadoId) { params = params.set('empleado_id', String(empleadoId)); }
    return this._http.get(this.URL_ROSTRO + 'allRostros', { params });
  }

  /** Guarda muestras (descriptores de 128 números) de un empleado. */
  addRostro(empleadoId: number, descriptores: number[][], origen: 'CAMARA' | 'FOTO' = 'CAMARA'): Observable<any> {
    return this._http.post(this.URL_ROSTRO + 'addRostro', { empleado_id: empleadoId, descriptores, origen });
  }

  deleteRostro(id: number): Observable<any> {
    return this._http.delete(this.URL_ROSTRO + 'deleteRostro/' + id);
  }

  deleteRostrosEmpleado(empleadoId: number): Observable<any> {
    return this._http.delete(this.URL_ROSTRO + 'deleteRostrosEmpleado/' + empleadoId);
  }
}
