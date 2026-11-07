import { Component, EventEmitter, Input, Output, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

/** Con qué color se pinta el contador de una pestaña. */
export type TonoInsignia = 'apagada' | 'aviso' | 'peligro' | 'exito' | 'tema';

/** Una pestaña. */
export interface PestanaTab {
  /** Lo que se devuelve al elegirla. */
  id: string;

  /** El rótulo. */
  texto: string;

  /**
   * El icono, con sus clases de Font Awesome: 'fa-list-ul', 'fab fa-whatsapp'.
   * Las de marca traen su familia; a las demás se les antepone «fa».
   */
  icono?: string;

  /** El contador de la derecha. Si es null, 0 o '' no se pinta. */
  insignia?: string | number | null;

  /** De qué color va ese contador. Por defecto, apagado. */
  tonoInsignia?: TonoInsignia;

  /**
   * Un texto secundario a la derecha del rótulo, separado por una línea.
   * Lo usa «Gestión» para decir con qué cliente se está trabajando.
   */
  detalle?: string;

  /** Si se enseña. Por defecto sí; sirve para las que dependen del perfil. */
  visible?: boolean;

  /** Se ve pero no se puede pulsar. */
  deshabilitada?: boolean;

  /** Lo que dice al pasar por encima. */
  ayuda?: string;
}

/**
 * La barra de pestañas de la plantilla.
 *
 * POR QUÉ ES UN COMPONENTE. El aspecto de estas pestañas no es el de Bootstrap
 * a secas: son cajas pegadas que comparten borde, con un acento de 3px arriba
 * que está SIEMPRE reservado —así nada salta al cambiar de pestaña—, el color
 * de la aplicación en la activa, la línea de la barra en un ::after para que
 * la activa pueda taparla, y desplazamiento horizontal con sombra en móvil.
 * Son doscientas líneas de CSS que había que copiar en cada pantalla que
 * quisiera pestañas, y copiar doscientas líneas es copiar también los errores.
 *
 * LAS PESTAÑAS SE DECLARAN, no se escriben una a una: el marcado de cada una
 * —el <li>, el role, el aria-selected, el icono, la insignia— es siempre el
 * mismo y es donde se cuelan las diferencias entre pantallas.
 *
 *     <app-tab-panel [pestanas]="vistas" [(activa)]="vista"></app-tab-panel>
 *
 * EL PANEL ES OPCIONAL (`conPanel`): la caja con borde que va debajo y que
 * hace que la pestaña activa se lea como abierta sobre su contenido. Las
 * barras que sólo cambian de vista no la necesitan.
 */
@Component({
  selector: 'app-tab-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './tabPanel.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./tabPanel.component.css'],
})
export class TabPanelComponent {

  @Input() pestanas: PestanaTab[] = [];

  /** La que está abierta. Se puede usar con [(activa)]. */
  @Input() activa = '';
  @Output() activaChange = new EventEmitter<string>();

  /**
   * Se cambió de pestaña.
   *
   * Aparte de `activaChange` porque son dos cosas distintas: aquél avisa de
   * que el valor cambió —también si lo cambia la propia pantalla— y éste de
   * que alguien PULSÓ. Pulsar la que ya estaba abierta no lo emite.
   */
  @Output() cambiada = new EventEmitter<string>();

  /**
   * El tamaño. «compacta» es un punto más pequeña, para las barras de segundo
   * nivel, que van dentro de otra cosa y no deberían pesar lo mismo.
   */
  @Input() tamano: 'normal' | 'compacta' = 'normal';

  /** La caja con borde debajo de la barra, para el contenido proyectado. */
  @Input() conPanel = false;

  /** Separación por debajo cuando NO hay panel. */
  @Input() margenInferior = true;

  /** Las que se enseñan: `visible` sin poner cuenta como sí. */
  get visibles(): PestanaTab[] {
    return (this.pestanas ?? []).filter(p => p.visible !== false);
  }

  elegir(p: PestanaTab): void {
    if (p.deshabilitada || this.activa === p.id) { return; }
    this.activa = p.id;
    this.activaChange.emit(p.id);
    this.cambiada.emit(p.id);
  }

  /** Si la insignia tiene algo que decir. El 0 no se pinta: no es noticia. */
  hayInsignia(p: PestanaTab): boolean {
    return p.insignia !== null && p.insignia !== undefined && p.insignia !== '' && p.insignia !== 0;
  }

  /** Las clases del contador, según el tono. */
  claseInsignia(p: PestanaTab): string {
    switch (p.tonoInsignia) {
      case 'peligro': return 'bg-danger';
      case 'aviso':   return 'bg-warning';
      case 'exito':   return 'bg-teal';
      case 'tema':    return 'tabp__insignia--tema';
      default:        return 'bg-secondary bg-opacity-25 text-body';
    }
  }

  /**
   * Las clases del icono.
   *
   * Los de marca traen su familia («fab fa-whatsapp»); a los demás se les
   * antepone «fa», que es lo mismo que hace `iconoDelTipo` en el catálogo.
   */
  claseIcono(p: PestanaTab): string {
    const i = (p.icono ?? '').trim();
    if (!i) { return ''; }
    return i.startsWith('fa-') ? `fa ${i}` : i;
  }

  /** Para `track` en la plantilla. */
  clave(_: number, p: PestanaTab): string { return p.id; }
}
