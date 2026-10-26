import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

/**
 * Proformas (ventas.proformas).
 *
 * Dos cosas distintas de los demás servicios del módulo:
 *
 *   · SE GUARDA EL DOCUMENTO ENTERO. No hay métodos para añadir o quitar una
 *     línea: se manda la cabecera con su `detalle` completo y el servidor lo
 *     deja todo en una transacción. Media proforma guardada no es nada.
 *
 *   · EL ESTADO NO SE GUARDA CON LA FICHA. Tiene su propio método porque
 *     tiene reglas —qué transición vale y cuándo hace falta un motivo— y
 *     porque enviar o aprobar no es «editar un campo más».
 */
@Injectable({
  providedIn: 'root',
})
export class ProformaService {

  private URL_SERVICIOS: string;

  constructor(
    private _http: HttpClient,
  ) {
    this.URL_SERVICIOS = environment.URL_SERVICIOS + 'ventas/proforma/';
  }

  //   ******   EL LISTADO (paginado en el servidor)   ******  //
  /**
   * Una página del listado.
   *
   * El alcance lo pone el servidor con el usuario del token: quien no es
   * administrador ve las de los vendedores que tiene a cargo. No se manda
   * ningún id de usuario; si no, cualquiera podría pedir la cartera de otro.
   */
  allProformas(page: number = 1, perPage: number = 20, search: string = '',
               estado: string = '', filtros: any = null): Observable<any> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('per_page', perPage.toString());

    // El modelo de filtros de columna de ag-Grid, en JSON. Se aplica en el
    // SERVIDOR: la pantalla pagina allí, así que la rejilla sólo tiene las
    // filas de la página y filtrando por su cuenta buscaría dentro de veinte.
    if (filtros && Object.keys(filtros).length) {
      params = params.set('filtros', JSON.stringify(filtros));
    }
    if (search) { params = params.set('search', search); }
    if (estado) { params = params.set('estado', estado); }

    return this._http.get<any>(this.URL_SERVICIOS + 'allProformas', { params, observe: 'response' });
  }

  //   ******   EL CONTADOR DE ARRIBA   ******  //
  resumenProformas(): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'resumenProformas');
  }

  //   ******   UNA PROFORMA, CON SUS LÍNEAS   ******  //
  findByIdProforma(id: any): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'findByIdProforma/' + id);
  }

  //   ******   EL CLIENTE Y SUS CONDICIONES   ******  //
  /**
   * Al escoger el cliente: su foto y con qué condiciones se le vende.
   *
   * Una sola vuelta para rellenar media cabecera y proponer forma de pago,
   * días de crédito y descuento (los del cliente, o los que herede de su
   * grupo), más los avisos que conviene ver antes de cotizar.
   */
  condicionesCliente(clienteId: any): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'condicionesCliente/' + clienteId);
  }

  //   ******   EL MISMO CLIENTE, POR SU CÉDULA O RUC   ******  //
  /**
   * Lo que se llama al teclear la identificación en el campo del cliente.
   *
   * Devuelve lo mismo que `condicionesCliente`, así que la pantalla trata
   * igual lo que venga de aquí y lo que venga de la lupa. Contesta 404
   * cuando no hay ningún cliente con esa identificación.
   */
  clientePorIdentificacion(identificacion: string): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'clientePorIdentificacion/'
                          + encodeURIComponent(String(identificacion ?? '').trim()));
  }

  //   ******   BUSCAR UN PRODUCTO DESDE LA REJILLA   ******  //
  /**
   * Lo que se llama al teclear un código en la celda y pulsar Enter.
   *
   * Si uno coincide exacto viene con `exacto: true` y la línea se rellena
   * sola; si no, vienen los parecidos para ofrecerlos o abrir el listado.
   */
  buscarProducto(texto: string, limite: number = 10): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'buscarProducto', {
      params: new HttpParams().set('texto', texto ?? '').set('limite', String(limite)),
    });
  }

  //   ******   EL CATÁLOGO, PARA EL SELECTOR DE PRODUCTOS   ******  //
  /**
   * El catálogo paginado con la forma que pide una línea.
   *
   * No se usa el de inventarios a propósito: ése no trae el IVA del producto
   * —que es lo que la línea necesita para calcularse— y sí trae el costo y la
   * descripción larga en HTML. Esto viene listo para volcarlo en la rejilla.
   */
  productos(page: number = 1, perPage: number = 10, search: string = '',
            categoriaId: number | null = null, marcaId: number | null = null): Observable<any> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('per_page', perPage.toString());
    if (search)      { params = params.set('search', search); }
    if (categoriaId) { params = params.set('categoria_id', String(categoriaId)); }
    if (marcaId)     { params = params.set('marca_id', String(marcaId)); }

    return this._http.get<any>(this.URL_SERVICIOS + 'productos', { params, observe: 'response' });
  }

  //   ******   CREAR   ******  //
  addProforma(data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'addProforma', data);
  }

  //   ******   EDITAR   ******  //
  // Manda el documento completo: la cabecera y TODAS las líneas. Las que no
  // vayan en `detalle` desaparecen, que es justo lo que significa haberlas
  // quitado de la rejilla.
  editProforma(id: any, data: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'editProforma/' + id, data);
  }

  //   ******   ENVIAR / APROBAR / RECHAZAR / ANULAR   ******  //
  /** El motivo es obligatorio al rechazar; en lo demás es opcional. */
  cambiarEstado(id: any, estado: string, motivo?: string | null): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'estadoProforma/' + id,
                           motivo ? { estado, motivo } : { estado });
  }

  //   ******   RENOVAR UNA VENCIDA   ******  //
  /** Le pone fecha de hoy y la deja enviada otra vez, con los mismos precios. */
  renovarProforma(id: any, validezDias?: number | null): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'renovarProforma/' + id,
                           validezDias == null ? {} : { validez_dias: validezDias });
  }

  //   ******   DUPLICAR   ******  //
  /** Otro documento igual, en borrador y con su propio número. */
  duplicarProforma(id: any): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'duplicarProforma/' + id, {});
  }

  //   ******   A LA PAPELERA   ******  //
  deleteProforma(id: any): Observable<any> {
    return this._http.delete(this.URL_SERVICIOS + 'deleteProforma/' + id);
  }

  //   ******   PAPELERA DE RECICLAJE   ******  //
  papelera(): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'papelera');
  }

  restaurarProformas(ids: number[]): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'restaurarProformas', { ids });
  }

  /** Borrado real de lo que está en la papelera (pide el permiso «vaciar»). */
  eliminarDefinitivo(ids: number[]): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'eliminarDefinitivo', { ids });
  }

  /** Borrado real de TODO lo que hay en la papelera (pide el permiso «vaciar»). */
  vaciarPapelera(): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'vaciarPapelera', {});
  }
}
