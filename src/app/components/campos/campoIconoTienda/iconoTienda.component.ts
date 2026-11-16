import { Component, ChangeDetectionStrategy, Input } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

// El catálogo es una copia literal del de la tienda, nombres incluidos: el
// alias es para que aquí se lea de qué iconos hablamos.
import { ICONOS, TipoIcono, existeIcono as existeIconoTienda } from './iconos-tienda';

/**
 * Un icono de los que dibuja la TIENDA, pintado aquí dentro.
 *
 * Es el mismo componente que la tienda tiene en su `app-icono`, copiado por
 * lo mismo que el catálogo: son dos proyectos sin nada compartido. Si allí
 * cambian los atributos del <svg>, aquí se verán distintos.
 *
 * MIDE 1em Y USA currentColor, como los iconos de fuente a los que sustituye:
 * toma el tamaño y el color del texto donde se pone, sin reglas aparte.
 *
 * ES DECORATIVO (aria-hidden): el nombre para quien no ve la pantalla va en el
 * botón o el enlace que lo contiene, no aquí.
 */

// Atributos del <svg> según el tipo de dibujo. Copiados tal cual de la tienda.
const TRAZO = 'stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"';
const ATRIBUTOS: Record<TipoIcono, string> = {
  t: `fill="none" ${TRAZO} stroke-width="2"`,
  g: `fill="none" ${TRAZO} stroke-width="3"`,
  r: 'fill="currentColor"',
  rt: `fill="currentColor" ${TRAZO} stroke-width="2"`,
};

/**
 * El SVG de un icono de la tienda, como texto.
 *
 * Lo usa el componente de aquí abajo y también quien tenga que pintar uno
 * FUERA de una plantilla de Angular —una celda de ag-Grid, por ejemplo, que
 * se arma con una cadena de HTML—. Está aquí para que los atributos del
 * <svg> vivan en un solo sitio: con dos copias, el día que la tienda cambie
 * el grosor del trazo una de las dos se queda vieja.
 *
 * Sin nombre, o con uno que la tienda no tenga, devuelve cadena vacía.
 */
export function svgDeIconoTienda(nombre: string | null | undefined): string {
  const icono = existeIconoTienda(nombre) ? ICONOS[(nombre as string)] : undefined;
  if (!icono) { return ''; }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${icono.viewBox ?? '0 0 24 24'}" `
       + `${ATRIBUTOS[icono.tipo]} focusable="false">${icono.contenido}</svg>`;
}

@Component({
  selector: 'app-iconoTienda',
  standalone: true,
  template: '',
  host: {
    'class': 'icono-tienda',
    'aria-hidden': 'true',
    '[innerHTML]': 'svg',
  },
  styles: [`
    :host {
      display: inline-block;
      flex-shrink: 0;
      width: 1em;
      height: 1em;
      line-height: 1;
      /* La misma alineación con el texto que los iconos de fuente */
      vertical-align: -0.125em;
    }

    :host ::ng-deep svg {
      display: block;
      width: 100%;
      height: 100%;
    }
  `],
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class IconoTiendaComponent {

  /** Sin nombre, o con uno que la tienda no tiene, no se pinta nada. */
  @Input()
  set nombre(valor: string | null | undefined) {
    const svg = svgDeIconoTienda(valor);
    // El SVG sale del catálogo —contenido nuestro y fijo—, por eso se marca
    // como seguro: no hay forma de que entre aquí nada escrito por un usuario.
    this.svg = svg ? this._sanitizer.bypassSecurityTrustHtml(svg) : '';
  }

  public svg: SafeHtml = '';

  constructor(private _sanitizer: DomSanitizer) {}

}
