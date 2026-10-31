import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { FiltrosVentaDemo } from '../interfaces/ventaDemoModel';

/**
 * El tablero de ventas demo.
 *
 * Todo LEE y nada escribe. La agregación la hace PostgreSQL
 * (reportes.fn_ventas_demo_pivote): aquí sólo se piden los números ya
 * cruzados, que son doce, en vez de bajarse las tres mil ventas para sumarlas
 * en el navegador.
 */
@Injectable({
  providedIn: 'root',
})
export class VentaDemoService {

  private URL_SERVICIOS: string;

  constructor(
    private _http: HttpClient,
  ) {
    this.URL_SERVICIOS = environment.URL_SERVICIOS + 'reportes/ventaDemo/';
  }

  /** Qué se puede poner en filas, en columnas y como medida; y qué valores hay. */
  opciones(): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'opciones');
  }

  /** La tabla cruzada, ya agregada. */
  pivote(filas: string, columnas: string, medida: string, agregacion: string,
         filtros: FiltrosVentaDemo, orden: string = 'valor', limite: number = 200): Observable<any> {
    const params = new HttpParams()
      .set('filas', filas)
      .set('columnas', columnas || 'ninguna')
      .set('medida', medida)
      .set('agregacion', agregacion)
      .set('orden', orden)
      .set('limite', String(limite))
      .set('filtros', JSON.stringify(this.limpiar(filtros)));

    return this._http.get(this.URL_SERVICIOS + 'pivote', { params });
  }

  /** El detalle, fila a fila. */
  detalle(page: number, perPage: number, filtros: FiltrosVentaDemo,
          ordenar: string = 'fecha', sentido: string = 'DESC'): Observable<any> {
    const params = new HttpParams()
      .set('page', String(page))
      .set('per_page', String(perPage))
      .set('ordenar', ordenar)
      .set('sentido', sentido)
      .set('filtros', JSON.stringify(this.limpiar(filtros)));

    return this._http.get(this.URL_SERVICIOS + 'detalle', { params });
  }

  /**
   * Fuera lo vacío antes de mandarlo.
   *
   * Un `region: []` viaja igual que un `region: ["Sierra"]` y en el servidor
   * no filtra nada, pero ensucia la url y el registro. Se quita aquí.
   */
  private limpiar(filtros: FiltrosVentaDemo): any {
    const salida: any = {};
    Object.entries(filtros || {}).forEach(([clave, valor]) => {
      if (valor === null || valor === undefined || valor === '') { return; }
      if (Array.isArray(valor) && !valor.length) { return; }
      salida[clave] = valor;
    });
    return salida;
  }
}
