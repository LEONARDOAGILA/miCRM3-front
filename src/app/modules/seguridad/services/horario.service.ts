// horario.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

@Injectable({
    providedIn: 'root'
})
export class HorarioService {
    private URL_SERVICIOS = environment.URL_SERVICIOS  + 'auth/horario/';

    constructor(private _http: HttpClient) { }

    allHorarios(page: number = 1, perPage: number = 15, search: string = '',
                filtros: any = null): Observable<any> {
        let params = new HttpParams()
            .set('page', page.toString())
            .set('per_page', perPage.toString());
        if (search) params = params.set('search', search);

        // El modelo de filtros de columna de ag-Grid, en JSON. Se aplica en el
        // servidor, sobre todos los horarios: la rejilla sólo tiene la página.
        if (filtros && Object.keys(filtros).length) {
            params = params.set('filtros', JSON.stringify(filtros));
        }
        return this._http.get(this.URL_SERVICIOS + 'allHorarios', { params, observe: 'response' });
    }

getHorario(id: number): Observable<any> {
  return this._http.get(this.URL_SERVICIOS + `getHorario/${id}`);
}



addHorario(data: any): Observable<any> {
  return this._http.post(this.URL_SERVICIOS + 'addHorario', data);
}


//   ******   ACTIVAR / DESACTIVAR (solo esa columna)   ******  //
// No pasa por editHorario: el servidor tiene una funcion que escribe solo
// `activo`. Sin `activo` alterna, pero la pantalla manda el valor que
// quiere para que dos personas pulsando a la vez no se peleen.
activarHorario(id: any, activo?: boolean): Observable<any> {
  return this._http.post(this.URL_SERVICIOS + 'activarHorario/' + id,
                         activo === undefined ? {} : { activo });
}

editHorario(id: number, data: any): Observable<any> {
  const formData = new FormData();
  formData.append('json', JSON.stringify(data));
  return this._http.post(this.URL_SERVICIOS + `editHorario/${id}`, formData);
}

deleteHorario(id: number): Observable<any> {
  return this._http.delete(this.URL_SERVICIOS + `deleteHorario/${id}`);
}

/**
 * ¿Con este horario se podría entrar en tal momento?
 *
 * Es la misma pregunta que responde el middleware en cada petición, pero
 * para una fecha y hora cualquiera: sirve para probar un horario antes de
 * ponérselo a nadie. No escribe nada.
 */
puedeEntrar(id: number, fechaHora: string): Observable<any> {
  return this._http.get(this.URL_SERVICIOS + `puedeEntrar/${id}`,
                        { params: new HttpParams().set('fecha_hora', fechaHora) });
}

// ================================================================
// PAPELERA DE RECICLAJE
// ================================================================
//
// `deleteHorario` es un borrado lógico: el horario sale del listado y del
// combo de la ficha de usuario, pero conserva sus días. Desde aquí se saca
// o se borra de verdad.

/** Lo que hay en la papelera (más reciente primero). */
papelera(): Observable<any> {
  return this._http.get(this.URL_SERVICIOS + 'papeleraHorarios');
}

/** Saca de la papelera uno o varios horarios, con sus días. */
restaurarHorarios(ids: number[]): Observable<any> {
  return this._http.post(this.URL_SERVICIOS + 'restaurarHorarios', { ids });
}

/** Borrado real de lo seleccionado (sólo de lo que está en la papelera). */
eliminarDefinitivo(ids: number[]): Observable<any> {
  return this._http.post(this.URL_SERVICIOS + 'eliminarDefinitivoHorarios', { ids });
}

/** Borrado real de todo lo que hay en la papelera. */
vaciarPapelera(): Observable<any> {
  return this._http.delete(this.URL_SERVICIOS + 'vaciarPapeleraHorarios');
}


listHorarios(page: number = 1, perPage: number = 5, search: string = ''): Observable<any> {
  let params = new HttpParams()
    .set('page', page.toString())
    .set('per_page', perPage.toString());
  
  if (search) {
    params = params.set('search', search);
  }
  
  return this._http.get(this.URL_SERVICIOS + 'listHorarios', { params, observe: 'response' });
}


}

