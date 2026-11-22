import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

/**
 * El encabezado de la tienda: la franja de arriba, el aviso de crédito, las
 * frases del buscador y el menú.
 *
 * CADA ENCABEZADO LLEVA SU MENÚ. Las llamadas que crean, reordenan o vacían
 * dicen de cuál —`encabezadoId`—; las que van por id de enlace no lo
 * necesitan, porque la fila ya dice de qué encabezado es. Sin id se entiende
 * el predeterminado, que es el que abre la pantalla.
 *
 * CASI TODO DEVUELVE EL ENCABEZADO ENTERO, también crear, borrar y ordenar.
 * Es un árbol de seis enlaces y cualquier cambio puede mover el orden de otras
 * ramas: devolver sólo lo tocado obligaría a recomponer el árbol aquí y a
 * equivocarse. La pantalla se limita a pintar lo que llega.
 */
@Injectable({
  providedIn: 'root',
})
export class EncabezadoService {

  private URL_SERVICIOS: string;

  constructor(
    private _http: HttpClient,
  ) {
    this.URL_SERVICIOS = environment.URL_SERVICIOS + 'ecommerce/encabezado/';
  }

  // ================================================================
  // CONFIGURACIÓN
  // ================================================================

  /**
   * La configuración de UNO y el menú de un tirón.
   *
   * Sin id, el predeterminado: es el que abre la pantalla. La respuesta trae
   * además la lista de todos, para poder cambiar de uno a otro sin volver a
   * preguntar.
   */
  getEncabezado(id?: number | null): Observable<any> {
    const query = id ? '?encabezado_id=' + id : '';
    return this._http.get(this.URL_SERVICIOS + 'getEncabezado' + query);
  }

  /** Sólo la pinta de uno; el menú tiene sus propias llamadas. */
  editEncabezado(config: any, id?: number | null): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'editEncabezado', { config, encabezado_id: id ?? null });
  }

  // ================================================================
  // LOS ENCABEZADOS DE CAMPAÑA
  // ================================================================
  //
  // Uno por temporada, con sus fechas. El predeterminado no se apaga ni se
  // borra: lo impide la base, y la pantalla lo dice antes de intentarlo.

  /** Uno nuevo, copiando la pinta de otro (el predeterminado si no se dice). */
  addEncabezado(nombre: string, copiarDe?: number | null): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'addEncabezado', { nombre, copiar_de: copiarDe ?? null });
  }

  /** Su nombre y sus fechas. La pinta va por editEncabezado. */
  editDatos(id: number, datos: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'editDatos/' + id, datos);
  }

  /** Sin `activo`, alterna. */
  activarEncabezado(id: number, activo?: boolean): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'activarEncabezado/' + id,
                           activo === undefined ? {} : { activo });
  }

  /** Éste pasa a ser el predeterminado (y se enciende). */
  predeterminado(id: number): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'predeterminado/' + id, {});
  }

  deleteEncabezado(id: number): Observable<any> {
    return this._http.delete(this.URL_SERVICIOS + 'deleteEncabezado/' + id);
  }

  // ================================================================
  // EL LOGO
  // ================================================================
  //
  // VA POR SU PROPIA PUERTA y no con `editEncabezado`: aquélla reescribe el
  // `config` entero, así que guardar los textos de la franja se llevaría por
  // delante el logo. En la base vive en su columna.
  //
  // Como con el resto de imágenes: se manda en un FormData y NO se le pone el
  // Content-Type a mano —el navegador tiene que poner el suyo con el
  // `boundary`—. Las dos devuelven el encabezado entero.

  subirLogo(archivo: File, id?: number | null): Observable<any> {
    const datos = new FormData();
    datos.append('logo', archivo);
    // CADA ENCABEZADO TIENE EL SUYO: el de Navidad puede llevar el del gorro
    if (id) { datos.append('encabezado_id', String(id)); }
    return this._http.post(this.URL_SERVICIOS + 'logo', datos);
  }

  /** Lo quita: la tienda vuelve a pintar el que trae dibujado. */
  quitarLogo(id?: number | null): Observable<any> {
    const query = id ? '?encabezado_id=' + id : '';
    return this._http.delete(this.URL_SERVICIOS + 'logo' + query);
  }

  // ================================================================
  // EL MENÚ
  // ================================================================

  /**
   * Con `padre_id` nace dentro de un desplegable; sin él, es principal.
   *
   * Y nace EN EL ENCABEZADO que se esté editando. Si cuelga de otro enlace
   * manda el del padre: un desplegable no puede cruzar de encabezado.
   */
  addEnlace(data: any, encabezadoId?: number | null): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'addEnlace',
                           { ...data, encabezado_id: encabezadoId ?? null });
  }

  /** El padre NO se cambia aquí: mover un enlace de sitio es arrastrarlo. */
  editEnlace(id: any, data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'editEnlace/' + id, data);
  }

  /** Sin `activo` alterna; con él, lo deja como se diga. */
  activarEnlace(id: any, activo?: boolean): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'activarEnlace/' + id,
                           activo === undefined ? {} : { activo });
  }

  /**
   * La lista entera en el orden nuevo, no sólo el que se movió.
   *
   * La rejilla usa `moverEnlace`, que dice padre y sitio de una vez; ésta
   * sigue aquí porque renumera una rama entera en una sola llamada, que es
   * otra cosa y el servidor la mantiene.
   */
  ordenarEnlaces(ids: number[], encabezadoId?: number | null): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'ordenarEnlaces',
                           { ids, encabezado_id: encabezadoId ?? null });
  }

  /**
   * Lo cuelga de otro y lo pone en su sitio: es el arrastre de la rejilla.
   *
   * `padreId` null lo saca a principal; `antesDe` null lo deja el último de
   * sus hermanos. EL MENÚ NO TIENE LÍMITE DE NIVELES; lo único que el
   * servidor no admite es meterlo dentro de su propia rama.
   */
  moverEnlace(id: number, padreId: number | null, antesDe: number | null): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'moverEnlace/' + id,
                           { padre_id: padreId, antes_de: antesDe });
  }

  /** A la papelera; un principal se lleva sus desplegables. */
  deleteEnlace(id: any): Observable<any> {
    return this._http.delete(this.URL_SERVICIOS + 'deleteEnlace/' + id);
  }

  // ================================================================
  // PAPELERA
  // ================================================================

  /** La del encabezado que se está editando: cada uno tiene la suya. */
  papelera(encabezadoId?: number | null): Observable<any> {
    const query = encabezadoId ? '?encabezado_id=' + encabezadoId : '';
    return this._http.get(this.URL_SERVICIOS + 'papelera' + query);
  }

  restaurar(ids: number[], encabezadoId?: number | null): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'restaurar',
                           { ids, encabezado_id: encabezadoId ?? null });
  }

  /**
   * No tiene vuelta atrás; el servidor exige el permiso «vaciar».
   *
   * VACÍA LA DE UN ENCABEZADO, no la de todos: no lleva ids, así que el
   * único freno es ése.
   */
  vaciarPapelera(encabezadoId?: number | null): Observable<any> {
    const query = encabezadoId ? '?encabezado_id=' + encabezadoId : '';
    return this._http.delete(this.URL_SERVICIOS + 'vaciarPapelera' + query);
  }
}
