import { Component, ElementRef, EventEmitter, HostListener, Input, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';

/** Una opción del menú del botón derecho. */
export interface OpcionContextual {
  /** Lo que se devuelve al elegirla. */
  id: string;

  texto: string;

  /** Clases de Font Awesome: 'fa-pen', 'fab fa-whatsapp'. */
  icono?: string;

  /** En rojo. Para lo que no tiene vuelta atrás. */
  peligro?: boolean;

  /** Una línea por encima, para separar grupos. */
  separadorAntes?: boolean;

  /** Si se enseña. Sin poner, sí. */
  visible?: boolean;

  /** Se ve pero no se puede pulsar; conviene decir por qué en `ayuda`. */
  deshabilitada?: boolean;

  /** Lo que dice al pasar por encima. */
  ayuda?: string;

  /** Atajo de teclado, sólo para enseñarlo a la derecha: «Supr». */
  atajo?: string;
}

/**
 * El menú del botón derecho.
 *
 * POR QUÉ UN COMPONENTE. Un menú contextual son cuatro cosas que no se ven
 * pero que se notan cuando faltan: colocarse donde se pulsó sin salirse de la
 * pantalla, cerrarse al pulsar fuera, al desplazar y con Escape, y moverse
 * con el teclado. Escribir eso en cada pantalla que lo quiera es escribirlo
 * mal en la segunda.
 *
 *     <app-menu-contextual #menu [opciones]="opciones" (elegida)="hacer($event)">
 *     </app-menu-contextual>
 *
 *     menu.abrir(evento);          // o abrir(x, y) si no hay evento
 *
 * NO DECIDE NADA: devuelve el id de lo que se eligió y se cierra. Qué
 * significa cada opción es de quien lo abrió.
 */
@Component({
  selector: 'app-menu-contextual',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './menuContextual.component.html',
  styleUrls: ['./menuContextual.component.css'],
})
export class MenuContextualComponent {

  @Input() opciones: OpcionContextual[] = [];

  /** Se eligió una: llega su `id`. */
  @Output() elegida = new EventEmitter<string>();

  /** Se cerró sin elegir nada. */
  @Output() cerrado = new EventEmitter<void>();

  @ViewChild('caja') caja!: ElementRef<HTMLDivElement>;

  public visible = false;
  public x = 0;
  public y = 0;
  public activa = -1;

  /**
   * El clic que abrió el menú.
   *
   * Hace falta porque ESE MISMO clic sigue su camino hasta el `document`,
   * donde se escucha para cerrar el menú al pulsar fuera. Y cuando llega, la
   * caja todavía no está en el DOM —Angular no ha repintado—, así que
   * «¿fue dentro?» da que no y el menú se cerraría en el acto: se abriría y
   * se cerraría en el mismo clic, que por fuera se ve como que no hace nada.
   */
  private eventoQueAbrio: Event | null = null;

  /** Las que se enseñan: `visible` sin poner cuenta como sí. */
  get visibles(): OpcionContextual[] {
    return (this.opciones ?? []).filter(o => o.visible !== false);
  }

  /**
   * Abre el menú donde se pulsó.
   *
   * La posición se corrige DESPUÉS de pintarlo: hasta que no está en el DOM
   * no se sabe cuánto mide, y sin saberlo no se puede decir si se sale por
   * abajo. Por eso el setTimeout, que no es un parche sino el único momento
   * en que la medida existe.
   */
  abrir(evento: MouseEvent): void;
  abrir(x: number, y: number): void;
  abrir(a: MouseEvent | number, b?: number): void {
    if (typeof a === 'number') {
      this.x = a;
      this.y = b ?? 0;
      this.eventoQueAbrio = null;
    } else {
      this.x = a.clientX;
      this.y = a.clientY;
      // Para no cerrarse con el mismo clic que lo abrió
      this.eventoQueAbrio = a;
    }

    this.visible = true;
    this.activa = -1;

    setTimeout(() => this.encajarEnLaPantalla(), 0);
  }

  /** ¿Es el clic que lo abrió, todavía de camino hacia el documento? */
  private esElQueAbrio(e: Event): boolean {
    if (e !== this.eventoQueAbrio) { return false; }
    // Ya pasó: el siguiente clic sí cierra
    this.eventoQueAbrio = null;
    return true;
  }

  cerrar(avisar = true): void {
    if (!this.visible) { return; }
    this.visible = false;
    this.activa = -1;
    if (avisar) { this.cerrado.emit(); }
  }

  /** Que no se salga por el borde derecho ni por abajo. */
  private encajarEnLaPantalla(): void {
    const el = this.caja?.nativeElement;
    if (!el) { return; }

    const r = el.getBoundingClientRect();
    const margen = 8;

    if (r.right > window.innerWidth - margen) {
      // A la izquierda del cursor, que es a donde se abre en Windows
      this.x = Math.max(margen, window.innerWidth - r.width - margen);
    }
    if (r.bottom > window.innerHeight - margen) {
      this.y = Math.max(margen, window.innerHeight - r.height - margen);
    }
  }

  elegir(o: OpcionContextual): void {
    if (o.deshabilitada) { return; }
    this.cerrar(false);
    this.elegida.emit(o.id);
  }

  /** Las clases del icono: las de marca traen su familia, el resto es sólida. */
  claseIcono(o: OpcionContextual): string {
    const i = (o.icono ?? '').trim();
    if (!i) { return ''; }
    return i.startsWith('fa-') ? `fa ${i}` : i;
  }

  clave(_: number, o: OpcionContextual): string { return o.id; }

  // ================================================================
  // CERRARSE SOLO
  // ================================================================
  //
  // Un menú contextual que se queda abierto cuando ya no viene a cuento es
  // peor que no tenerlo: tapa justo lo que se quería mirar.

  /**
   * Un clic en cualquier sitio lo cierra.
   *
   * En `mousedown` y no en `click`: así se cierra antes de que el clic llegue
   * a lo que hay debajo, y no queda un parpadeo con el menú encima.
   *
   * El de dentro no cuenta, que para eso está.
   */
  @HostListener('document:mousedown', ['$event'])
  alPulsarFuera(e: MouseEvent): void {
    if (!this.visible) { return; }
    if (this.esElQueAbrio(e)) { return; }
    if (this.caja?.nativeElement.contains(e.target as Node)) { return; }
    this.cerrar();
  }

  /** Otro clic derecho en otra parte: que no queden dos menús. */
  @HostListener('document:contextmenu', ['$event'])
  alOtroContextual(e: MouseEvent): void {
    if (!this.visible) { return; }
    if (this.esElQueAbrio(e)) { return; }
    if (this.caja?.nativeElement.contains(e.target as Node)) { return; }
    this.cerrar();
  }

  /** Al desplazar, el menú se quedaría flotando lejos de su fila. */
  @HostListener('window:scroll')
  @HostListener('window:resize')
  alMoverse(): void {
    this.cerrar();
  }

  @HostListener('document:keydown', ['$event'])
  alTeclear(e: KeyboardEvent): void {
    if (!this.visible) { return; }

    const lista = this.visibles.filter(o => !o.deshabilitada);
    if (e.key === 'Escape') { e.preventDefault(); this.cerrar(); return; }
    if (!lista.length) { return; }

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const paso = e.key === 'ArrowDown' ? 1 : -1;
      // Se recorre sólo lo que se puede pulsar: parar en una opción apagada
      // y que Enter no haga nada se lee como que el menú está roto.
      const actual = lista.findIndex(o => o === this.visibles[this.activa]);
      const siguiente = (actual + paso + lista.length) % lista.length;
      this.activa = this.visibles.indexOf(lista[siguiente]);
    } else if (e.key === 'Enter' && this.activa >= 0) {
      e.preventDefault();
      this.elegir(this.visibles[this.activa]);
    }
  }
}
