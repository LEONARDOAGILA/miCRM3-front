import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

/**
 * ELEGIR UN COLOR: la muestra redonda, el código al lado, «Quitar» y la paleta
 * de siempre.
 *
 * ESTE TROZO ESTABA COPIADO EN TRES SITIOS —el modal de archivos, el de varios
 * archivos y «Inicio de la tienda»— con sus mismos nombres de clase y su misma
 * hoja de estilos repetida. En «Inicio de la tienda» hacían falta cuatro
 * copias más (el cartel de descuento y el fondo y el borde de la tarjeta), y
 * siete copias de lo mismo es donde se acaban separando: una se arregla y las
 * otras no.
 *
 * LOS DE ADMINISTRADOR DE ARCHIVOS SIGUEN COMO ESTABAN, a propósito: son de
 * otro módulo y cambiarlos aquí sería tocar lo que no se pidió. Cuando haya
 * que meterles mano, el sitio es éste.
 *
 * EL VALOR QUE RECIBE ES EL QUE SE VE, no el que está guardado. Quien lo use
 * decide qué enseñar cuando nadie ha elegido nada —el color que usa la tienda
 * hoy— y lo dice con `propio`. Así la muestra no es una aproximación: es lo
 * que se va a ver.
 *
 * `cambia` sale con el color nuevo, o con '' cuando se pulsa «Quitar». Vacío
 * significa «ninguno elegido», que no es lo mismo que negro.
 */
@Component({
  selector: 'app-campoColor',
  standalone: true,
  templateUrl: './campoColor.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./campoColor.component.css'],
  host: {
    '[class.campo-color--apilado]': 'apilado',
    '[class.campo-color--compacto]': 'compacto',
  },
})
export class CampoColorComponent {

  /** El del <input type="color">, para que la <label> de fuera lo alcance. */
  @Input() idCampo = '';

  /** El color que se ve: el elegido, o el que usa esa cosa hoy. */
  @Input() valor = '#ffffff';

  /** Si se eligió a mano. Sin él manda el valor por defecto. */
  @Input() propio = false;

  /** Lo que se lee en vez del código cuando no hay color elegido. */
  @Input() porDefecto = 'El de la tienda';

  /** Qué se está pintando: va en los títulos y en los lectores de pantalla. */
  @Input() etiqueta = 'Color';

  @Input() paleta: string[] = [];

  @Input() deshabilitado = false;

  /** La paleta debajo, en su propia línea, en vez de a la derecha. */
  @Input() apilado = false;

  /** Puntos más pequeños, para cuando el bloque es estrecho. */
  @Input() compacto = false;

  @Output() cambia = new EventEmitter<string>();

  delSelector(evento: Event): void {
    this.cambia.emit((evento.target as HTMLInputElement).value);
  }

  /**
   * Si ese punto de la paleta es el que está puesto.
   *
   * Se compara en minúsculas porque el <input type="color"> devuelve siempre
   * minúsculas y la paleta está escrita a mano: sin esto, el mismo color
   * elegido desde el selector no se señalaría en la paleta.
   */
  esEste(color: string): boolean {
    return this.propio && this.valor.toLowerCase() === color.toLowerCase();
  }
}
