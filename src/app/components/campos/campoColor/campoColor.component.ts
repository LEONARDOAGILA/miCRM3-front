import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, signal } from '@angular/core';

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

  /**
   * EL NOMBRE A LA IZQUIERDA, Y CON ÉL LA OTRA FORMA DEL CAMPO.
   *
   * Vacío —lo de siempre— el rótulo lo pone quien lo usa encima, y el color
   * se lee en un `code`. Con rótulo se arma EN UNA FILA: nombre, muestra,
   * código escribible, «Quitar», y la paleta debajo en pequeño.
   *
   * ES UN SOLO INPUT Y NO UNA PALANCA APARTE a propósito: un campo con el
   * nombre dentro y otro rótulo encima diría el nombre dos veces, así que
   * poner el rótulo ES elegir la forma.
   */
  @Input() rotulo = '';

  @Output() cambia = new EventEmitter<string>();

  /**
   * Lo escrito no era un color: se avisa un momento y se deshace.
   *
   * ES UNA SEÑAL y no un campo normal porque lo cambia un manejador que NO
   * emite nada hacia fuera —el valor se deshace aquí dentro—, así que no hay
   * nada más que haga repintar y el borde rojo no llegaba a verse.
   */
  public error = signal(false);

  delSelector(evento: Event): void {
    this.error.set(false);
    this.cambia.emit((evento.target as HTMLInputElement).value);
  }

  /**
   * EL CÓDIGO, ESCRITO A MANO.
   *
   * Un color de marca llega en un correo como «#E30613» y buscarlo en la
   * rueda es imposible de acertar. Se admite con almohadilla o sin ella, en
   * mayúsculas o en minúsculas, y de tres cifras o de seis («#fff» es
   * «#ffffff»): es lo que la gente escribe.
   *
   * VACÍO ES QUITARLO, no es negro: deja el campo sin color propio, que es lo
   * mismo que pulsar «Quitar». Y LO QUE NO SEA UN COLOR SE DESHACE —vuelve a
   * lo que había— en vez de guardarse: un `background-color` con basura no da
   * error, deja la cosa de un color que nadie eligió.
   */
  delTexto(evento: Event): void {
    const campo = evento.target as HTMLInputElement;
    const escrito = (campo.value ?? '').trim();

    if (!escrito) { this.error.set(false); this.cambia.emit(''); return; }

    const color = this.aColor(escrito);
    if (!color) {
      this.error.set(true);
      campo.value = this.propio ? this.valor : '';
      setTimeout(() => this.error.set(false), 1500);
      return;
    }

    this.error.set(false);
    campo.value = color;
    this.cambia.emit(color);
  }

  /** «E30613», «#fff», «#E30613» → «#e30613». Lo que no lo sea, null. */
  private aColor(escrito: string): string | null {
    const limpio = escrito.replace(/^#/, '').trim().toLowerCase();
    if (/^[0-9a-f]{3}$/.test(limpio)) {
      return '#' + limpio.split('').map(c => c + c).join('');
    }
    return /^[0-9a-f]{6}$/.test(limpio) ? '#' + limpio : null;
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
