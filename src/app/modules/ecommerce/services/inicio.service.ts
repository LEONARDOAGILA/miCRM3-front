import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

/**
 * La portada de la tienda: la lista de secciones, su orden y su vigencia.
 *
 * Todas las llamadas devuelven LA LISTA ENTERA, como el encabezado y el pie:
 * mover una sección cambia el orden de las demás, y recomponerlo aquí acabaría
 * enseñando algo distinto de lo que ve la tienda.
 */
@Injectable({
  providedIn: 'root',
})
export class InicioService {

  private URL_SERVICIOS: string;

  constructor(
    private _http: HttpClient,
  ) {
    this.URL_SERVICIOS = environment.URL_SERVICIOS + 'ecommerce/inicio/';
  }

  allInicio(): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'allInicio');
  }

  /** { titulo?, subtitulo?, activo?, desde?, hasta? } */
  editSeccion(clave: string, datos: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'editSeccion/' + clave, datos);
  }

  /** Sin `activo`, alterna. Es lo que hace el interruptor de la lista. */
  activarSeccion(clave: string, activo?: boolean): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'activarSeccion/' + clave,
                           activo === undefined ? {} : { activo });
  }

  /** Van TODAS las claves, en el orden en que se ven. */
  ordenarSecciones(claves: string[]): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'ordenarSecciones', { claves });
  }
}
