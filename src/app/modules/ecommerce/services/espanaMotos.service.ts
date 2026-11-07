import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

/**
 * España Motos: la configuración de su portada, las pestañas de su catálogo y
 * las marcas que se venden ahí.
 *
 * Todas las llamadas devuelven la CONFIGURACIÓN ENTERA, como el encabezado y
 * el pie: añadir una pestaña cambia el orden de las demás, y recomponerlo aquí
 * acabaría enseñando algo distinto de lo que ve la tienda.
 */
@Injectable({
  providedIn: 'root',
})
export class EspanaMotosService {

  private URL_SERVICIOS: string;

  constructor(
    private _http: HttpClient,
  ) {
    this.URL_SERVICIOS = environment.URL_SERVICIOS + 'ecommerce/espanaMotos/';
  }

  getEspanaMotos(): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'getEspanaMotos');
  }

  /** La portada: qué piezas se ven y el fondo. Incluye la palanca de publicar. */
  editEspanaMotos(datos: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'editEspanaMotos', datos);
  }

  // ---------- Pestañas del catálogo ----------

  /** { nombre, categorias: [ids], activo? } */
  addPestana(data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'addPestana', data);
  }

  editPestana(id: any, data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'editPestana/' + id, data);
  }

  deletePestana(id: any): Observable<any> {
    return this._http.delete(this.URL_SERVICIOS + 'deletePestana/' + id);
  }

  ordenarPestanas(ids: number[]): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'ordenarPestanas', { ids });
  }

  // ---------- Marcas ----------

  /** Se añade una del catálogo; repetirla avisa en vez de duplicarla. */
  addMarca(marca_id: number): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'addMarca', { marca_id });
  }

  deleteMarca(id: any): Observable<any> {
    return this._http.delete(this.URL_SERVICIOS + 'deleteMarca/' + id);
  }

  ordenarMarcas(ids: number[]): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'ordenarMarcas', { ids });
  }
}
