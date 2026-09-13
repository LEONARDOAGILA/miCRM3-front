import { Directive, ElementRef, HostListener, OnDestroy } from '@angular/core';

/**
 * Hace que un modal de ng-bootstrap se pueda mover arrastrándolo por su
 * cabecera, como una ventana de escritorio.
 *
 * Se pone en el elemento que hace de "barra de título" (normalmente
 * <app-modal-header>). La directiva busca hacia arriba el .modal-dialog y lo
 * desplaza con transform: translate(), que no toca el layout ni la
 * centrado de Bootstrap; al cerrar el modal el diálogo se destruye y el
 * desplazamiento se va con él.
 *
 * Uso:
 *   <app-modal-header appModalArrastrable [title]="title" ...>
 *
 * Los botones, enlaces y campos dentro de la cabecera no inician el
 * arrastre (el botón de cerrar sigue cerrando). El diálogo no puede salirse
 * del todo de la ventana: siempre queda un trozo visible para recuperarlo.
 * En pantallas táctiles funciona igual (pointer events).
 */
@Directive({
  selector: '[appModalArrastrable]',
  standalone: true,
  host: {
    'class': 'modal-arrastrable',
    'style': 'cursor: move; user-select: none; touch-action: none;'
  }
})
export class ModalArrastrableDirective implements OnDestroy {

  /** Desplazamiento acumulado del diálogo respecto a su sitio original. */
  private dx = 0;
  private dy = 0;

  /** Punto donde empezó el arrastre en curso, y desplazamiento en ese momento. */
  private inicioX = 0;
  private inicioY = 0;
  private baseX = 0;
  private baseY = 0;

  private dialogo: HTMLElement | null = null;
  private arrastrando = false;

  /** Margen mínimo que debe quedar dentro de la ventana, en px. */
  private static readonly MARGEN_VISIBLE = 60;

  // Los listeners de mover/soltar van sobre document, no sobre la cabecera:
  // si el ratón se sale del elemento a medio arrastre, el modal lo sigue.
  private readonly onMove = (e: PointerEvent) => this.mover(e);
  private readonly onUp = () => this.soltar();

  constructor(private host: ElementRef<HTMLElement>) {}

  @HostListener('pointerdown', ['$event'])
  empezar(e: PointerEvent): void {
    // Sólo botón principal, y nunca desde un control de la cabecera
    if (e.button !== 0) { return; }
    const objetivo = e.target as HTMLElement;
    if (objetivo.closest('button, a, input, select, textarea, [role="button"]')) { return; }

    this.dialogo = this.host.nativeElement.closest('.modal-dialog');
    if (!this.dialogo) { return; }

    this.arrastrando = true;
    this.inicioX = e.clientX;
    this.inicioY = e.clientY;
    this.baseX = this.dx;
    this.baseY = this.dy;

    // Sin transición mientras se arrastra: Bootstrap anima .modal-dialog al
    // abrir y haría que el movimiento fuera "a tirones".
    this.dialogo.style.transition = 'none';

    document.addEventListener('pointermove', this.onMove);
    document.addEventListener('pointerup', this.onUp);
    document.addEventListener('pointercancel', this.onUp);
    e.preventDefault();
  }

  private mover(e: PointerEvent): void {
    if (!this.arrastrando || !this.dialogo) { return; }

    let nuevoX = this.baseX + (e.clientX - this.inicioX);
    let nuevoY = this.baseY + (e.clientY - this.inicioY);

    // Límites: que siempre quede algo del diálogo dentro de la ventana
    const caja = this.dialogo.getBoundingClientRect();
    const m = ModalArrastrableDirective.MARGEN_VISIBLE;
    const izqActual = caja.left - this.dx;      // posición sin desplazar
    const arribaActual = caja.top - this.dy;

    const minX = -(izqActual + caja.width - m);
    const maxX = window.innerWidth - izqActual - m;
    const minY = -arribaActual;                  // no subir por encima del borde
    const maxY = window.innerHeight - arribaActual - m;

    nuevoX = Math.min(Math.max(nuevoX, minX), maxX);
    nuevoY = Math.min(Math.max(nuevoY, minY), maxY);

    this.dx = nuevoX;
    this.dy = nuevoY;
    this.dialogo.style.transform = `translate(${this.dx}px, ${this.dy}px)`;
  }

  private soltar(): void {
    this.arrastrando = false;
    document.removeEventListener('pointermove', this.onMove);
    document.removeEventListener('pointerup', this.onUp);
    document.removeEventListener('pointercancel', this.onUp);
  }

  ngOnDestroy(): void {
    // Por si el modal se destruye a mitad de un arrastre
    this.soltar();
  }
}
