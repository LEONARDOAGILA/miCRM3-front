import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

/** Con qué color se dice. */
export type TonoAviso = 'tema' | 'info' | 'exito' | 'alerta' | 'peligro';

/**
 * La cajita de «esto es lo que hay que saber» que llevan casi todas las
 * pantallas: una línea con su icono, su barra de color a la izquierda y su
 * fondo teñido.
 *
 * Existía ya en una docena de sitios, copiada y pegada en el CSS de cada
 * componente con nombres distintos —.asigm-aviso, .tu-aviso, .eliminar-nota—
 * y con el azul de Bootstrap quemado. Aquí se escribe una vez.
 *
 * EL TONO POR DEFECTO ES «tema», es decir, el color elegido en «Ajustes de la
 * aplicación» (--bs-app-theme). Ojo con --bs-primary: ésa NO cambia con el
 * tema, se queda azul siempre, y era el motivo de que estas cajas se vieran
 * azules con un tema verde.
 *
 * El texto va dentro, no por parámetro, para poder escribir en negrita o
 * meter un enlace:
 *
 *     <app-aviso>
 *       <strong>Filtre en la cabecera.</strong> Se busca sin tildes.
 *     </app-aviso>
 *
 *     <app-aviso tono="peligro" titulo="Sin vuelta atrás">
 *       El fichero se borra del servidor.
 *     </app-aviso>
 *
 *     <app-aviso [cerrable]="true">Esto se puede quitar de en medio.</app-aviso>
 */
@Component({
  selector: 'app-aviso',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './aviso.component.html',
  styleUrls: ['./aviso.component.css'],
})
export class AvisoComponent {

  /** De qué color. Por defecto, el del tema de la aplicación. */
  @Input() tono: TonoAviso = 'tema';

  /** Negrita delante del texto, para cuando hace falta un encabezado corto. */
  @Input() titulo = '';

  /**
   * El icono. Si no se pone, el que le toque al tono.
   *
   * Se acepta cualquier clase de Font Awesome: 'fa-filter', 'fa-location-dot'…
   */
  @Input() icono = '';

  /** Sin icono, para cuando la caja va dentro de algo que ya lo tiene. */
  @Input() sinIcono = false;

  /**
   * Si se puede quitar de en medio con una ×.
   *
   * Apagado por defecto a propósito: hay avisos que no son un estorbo sino
   * parte de lo que la pantalla tiene que decir —«esto borra del servidor»—,
   * y ésos no deberían poder taparse.
   */
  @Input() cerrable = false;

  /**
   * Se pulsó la ×.
   *
   * El aviso ya se quitó por su cuenta; esto es el aviso aparte, por si la
   * pantalla quiere recordar que no lo vuelva a enseñar.
   */
  @Output() cerrado = new EventEmitter<void>();

  /** Mientras sea true se pinta. Lo apaga la ×. */
  public visible = true;

  cerrar(): void {
    this.visible = false;
    this.cerrado.emit();
  }

  /** Para volver a enseñarlo desde fuera, si hiciera falta. */
  public mostrar(): void {
    this.visible = true;
  }

  /** El icono que se pinta: el pedido, o el que corresponde al tono. */
  get iconoFinal(): string {
    if (this.sinIcono) { return ''; }
    if (this.icono) { return this.icono; }

    switch (this.tono) {
      case 'exito':   return 'fa-circle-check';
      case 'alerta':  return 'fa-triangle-exclamation';
      case 'peligro': return 'fa-circle-exclamation';
      default:        return 'fa-circle-info';
    }
  }
}
