import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

/**
 * Horarios de trabajo del personal (rh.horarios_empleados).
 *
 * No es el HorarioService de seguridad: aquél maneja el horario de ACCESO AL
 * CRM (una franja por día, lo usa el middleware para cerrar la sesión fuera
 * de hora). Éste maneja el horario de TRABAJO, con hasta cuatro jornadas por
 * día, y es contra el que se miden los atrasos de las marcaciones.
 *
 * La paginación y el filtro los hace el servidor
 * (rh.fn_horarios_empleados_listar_paginado).
 */
@Injectable({
  providedIn: 'root',
})
export class HorarioEmpleadoService {

  private URL_SERVICIOS: string;

  constructor(
    private _http: HttpClient,
  ) {
    this.URL_SERVICIOS = environment.URL_SERVICIOS + 'rh/horarioEmpleado/';
  }

  //   ******   LISTADO CON PAGINACIÓN   ******  //
  allHorarios(page: number = 1, perPage: number = 10, search: string = '',
              filtros: any = null): Observable<any> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('per_page', perPage.toString());
    if (search) {
      params = params.set('search', search);
    }
    // El modelo de filtros de columna de ag-Grid, en JSON. Se aplica en el
    // SERVIDOR: la pantalla pagina, así que la rejilla sólo tiene las filas
    // de la página y filtrar ahí buscaría dentro de diez.
    if (filtros && Object.keys(filtros).length) {
      params = params.set('filtros', JSON.stringify(filtros));
    }
    // observe: 'response' como en allCargos: el componente lee res.body
    return this._http.get<any>(this.URL_SERVICIOS + 'allHorariosEmpleados', { params, observe: 'response' });
  }

  //   ******   LISTADO SIMPLE (selector)   ******  //
  /** Sólo los activos y fuera de la papelera: lo que se puede elegir. */
  listHorarios(page: number = 1, perPage: number = 5, search: string = ''): Observable<any> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('per_page', perPage.toString());
    if (search) {
      params = params.set('search', search);
    }
    return this._http.get(this.URL_SERVICIOS + 'listHorariosEmpleados', { params, observe: 'response' });
  }

  //   ******   LA FICHA CON SUS JORNADAS   ******  //
  getHorario(id: any): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'getHorarioEmpleado/' + id);
  }

  //   ******   CREAR   ******  //
  addHorario(data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'addHorarioEmpleado', data);
  }

  //   ******   CLONAR (mismo endpoint que crear)   ******  //
  clonHorario(data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'addHorarioEmpleado', data);
  }

  //   ******   EDITAR   ******  //
  editHorario(id: any, data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'editHorarioEmpleado/' + id, data);
  }

  //   ******   ACTIVAR / DESACTIVAR (sólo esa columna)   ******  //
  // No pasa por editHorario: aquélla REESCRIBE LAS JORNADAS, y bajar una
  // casilla desde la rejilla no tiene por qué tocar las veintiocho franjas.
  // Sin `activo` la función alterna, pero la pantalla manda el valor que
  // quiere para que dos personas pulsando a la vez no se peleen.
  activarHorario(id: any, activo?: boolean): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'activarHorarioEmpleado/' + id,
                           activo === undefined ? {} : { activo });
  }

  //   ******   ELIMINAR (a la papelera)   ******  //
  deleteHorario(id: any): Observable<any> {
    return this._http.delete(this.URL_SERVICIOS + 'deleteHorarioEmpleado/' + id);
  }

  //   ******   PROBAR EL HORARIO CONTRA UNA HORA   ******  //
  /** Qué jornada tocaba y de cuántos minutos sería el atraso. No escribe nada. */
  evaluar(id: any, fechaHora: string): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'evaluar/' + id,
                          { params: new HttpParams().set('fecha_hora', fechaHora) });
  }

  // ================================================================
  // PAPELERA DE RECICLAJE
  // ================================================================
  //
  // `deleteHorario` es un borrado lógico: el horario sale del listado y del
  // selector PERO CONSERVA SUS JORNADAS. Desde aquí se saca o se borra de
  // verdad.

  /** Lo que hay en la papelera (más reciente primero). */
  papelera(): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'papelera');
  }

  /** Saca de la papelera uno o varios horarios, con sus jornadas. */
  restaurarHorarios(ids: number[]): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'restaurarHorariosEmpleados', { ids });
  }

  /** Borrado real de lo seleccionado (sólo de lo que está en la papelera). */
  eliminarDefinitivo(ids: number[]): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'eliminarDefinitivo', { ids });
  }

  /** Borrado real de todo lo que hay en la papelera. */
  vaciarPapelera(): Observable<any> {
    return this._http.delete(this.URL_SERVICIOS + 'vaciarPapelera');
  }
}
