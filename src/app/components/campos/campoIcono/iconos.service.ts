import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';

import { IconoFa } from './iconos-fa';

/**
 * El catálogo de iconos de Font Awesome, para el selector.
 *
 * SE PIDE AL ABRIR EL MODAL, no al arrancar la aplicación: son 116 KB que
 * sólo hacen falta en las dos pantallas que dejan elegir icono, y cargarlos
 * siempre es castigar a todas las demás.
 *
 * Y SE PIDE UNA VEZ: `shareReplay` guarda la respuesta, así abrir el selector
 * diez veces seguidas no son diez peticiones.
 *
 * El fichero lo genera scripts/generar-iconos-fa.js desde node_modules y está
 * en el repositorio; no se rehace al compilar.
 */
@Injectable({ providedIn: 'root' })
export class IconosService {

  private catalogo$?: Observable<IconoFa[]>;

  constructor(private _http: HttpClient) {}

  catalogo(): Observable<IconoFa[]> {
    if (!this.catalogo$) {
      this.catalogo$ = this._http.get<{ iconos: [string, string, string][] }>('assets/iconos-fa.json').pipe(
        map(r => (r?.iconos ?? []).map(([nombre, estilo, terminos]) => ({
          nombre,
          estilo: estilo as 's' | 'r' | 'b',
          terminos,
        }))),
        // Sin catálogo el selector se queda vacío, pero la pantalla sigue en
        // pie: el icono se puede seguir escribiendo a mano. Un error aquí no
        // es motivo para romper el formulario entero.
        catchError(() => of([] as IconoFa[])),
        shareReplay(1),
      );
    }
    return this.catalogo$;
  }
}
