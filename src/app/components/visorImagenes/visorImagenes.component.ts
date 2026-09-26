import { Component, ElementRef, HostListener, Input, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

/** Una imagen del visor. */
export interface ImagenVisor {
  url: string;
  titulo: string;
  /** Con qué nombre se descarga; si falta, se saca de la url */
  nombre?: string;
}

/**
 * Ver imágenes a pantalla completa: ampliar, reducir, girar y arrastrar.
 *
 * Sale del visor que tenía dentro el mapa de Google, puesto aparte para que
 * lo use cualquier pantalla —la dirección del empleado, las capturas del
 * mapa, lo que venga— en vez de abrir una pestaña nueva del navegador.
 *
 *   const ref = this.modal.open(VisorImagenesComponent, { size: 'xl', windowClass: 'visor-modal' });
 *   ref.componentInstance.imagenes = [{ url, titulo: 'Mapa' }];
 *   ref.componentInstance.indice = 0;
 *
 * Con varias imágenes se pasa entre ellas con las flechas o con ← →.
 */
@Component({
  selector: 'app-visor-imagenes',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './visorImagenes.component.html',
  styleUrls: ['./visorImagenes.component.css'],
})
export class VisorImagenesComponent implements OnInit {

  @Input() imagenes: ImagenVisor[] = [];
  /** Cuál se abre primero. */
  @Input() indice = 0;

  @ViewChild('visorImg') visorImg?: ElementRef<HTMLImageElement>;
  @ViewChild('visorLienzo') visorLienzo?: ElementRef<HTMLDivElement>;

  escala = 1;
  giro = 0;
  private desplazamiento = { x: 0, y: 0 };

  private arrastrando = false;
  private arrastreInicio = { x: 0, y: 0, panX: 0, panY: 0 };
  private pellizcoInicial = 0;
  private escalaPellizco = 1;

  private readonly ESCALA_MIN = 0.2;
  private readonly ESCALA_MAX = 8;

  constructor(public activeModal: NgbActiveModal) {}

  ngOnInit(): void {
    // Un índice fuera de sitio dejaría el visor en blanco
    if (this.indice < 0 || this.indice >= this.imagenes.length) { this.indice = 0; }
  }

  get actual(): ImagenVisor | null {
    return this.imagenes[this.indice] ?? null;
  }

  get hayVarias(): boolean { return this.imagenes.length > 1; }

  // ================================================================
  // TAMAÑO Y GIRO
  // ================================================================

  /** Vuelve al tamaño y giro de partida. */
  ajustar(): void {
    this.escala = 1;
    this.giro = 0;
    this.desplazamiento = { x: 0, y: 0 };
  }

  get escalaTexto(): string {
    return `${Math.round(this.escala * 100)}%`;
  }

  /** Lo que se aplica a la imagen. */
  get transform(): string {
    return `translate(${this.desplazamiento.x}px, ${this.desplazamiento.y}px) scale(${this.escala}) rotate(${this.giro}deg)`;
  }

  ampliar(paso = 0.25): void {
    this.escala = Math.min(this.ESCALA_MAX, +(this.escala + paso).toFixed(2));
  }

  reducir(paso = 0.25): void {
    this.escala = Math.max(this.ESCALA_MIN, +(this.escala - paso).toFixed(2));
    if (this.escala <= 1) { this.desplazamiento = { x: 0, y: 0 }; }
  }

  girar(grados: number): void {
    this.giro = (this.giro + grados) % 360;
    // Al ponerse de lado la imagen ya no entra: se ajusta al hueco
    this.escala = this.escalaQueEntra();
    this.desplazamiento = { x: 0, y: 0 };
  }

  /** Cuánto hay que reducir para que la imagen (girada o no) quepa. */
  private escalaQueEntra(): number {
    const img = this.visorImg?.nativeElement;
    const caja = this.visorLienzo?.nativeElement;
    if (!img || !caja || !img.offsetWidth || !img.offsetHeight) { return 1; }
    const deLado = Math.abs(this.giro % 180) === 90;
    const ancho = deLado ? img.offsetHeight : img.offsetWidth;
    const alto  = deLado ? img.offsetWidth  : img.offsetHeight;
    return +Math.min(1, (caja.clientWidth * 0.96) / ancho, (caja.clientHeight * 0.96) / alto).toFixed(2);
  }

  // ================================================================
  // RATÓN, DEDOS Y TECLADO
  // ================================================================

  /** Rueda del ratón: acerca y aleja sobre el punto del cursor. */
  onRueda(ev: WheelEvent): void {
    ev.preventDefault();
    const antes = this.escala;
    const despues = Math.min(this.ESCALA_MAX, Math.max(this.ESCALA_MIN, antes * (ev.deltaY < 0 ? 1.12 : 1 / 1.12)));
    if (despues === antes) { return; }

    // Mantener bajo el cursor el punto que se está mirando
    const caja = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    const cx = ev.clientX - (caja.left + caja.width / 2);
    const cy = ev.clientY - (caja.top + caja.height / 2);
    const factor = despues / antes;
    this.desplazamiento = {
      x: cx - (cx - this.desplazamiento.x) * factor,
      y: cy - (cy - this.desplazamiento.y) * factor,
    };
    this.escala = +despues.toFixed(2);
  }

  onRatonAbajo(ev: MouseEvent): void {
    if (ev.button !== 0) { return; }
    ev.preventDefault();
    this.arrastrando = true;
    this.arrastreInicio = { x: ev.clientX, y: ev.clientY, panX: this.desplazamiento.x, panY: this.desplazamiento.y };
  }

  @HostListener('document:mousemove', ['$event'])
  onRatonMueve(ev: MouseEvent): void {
    if (!this.arrastrando) { return; }
    this.desplazamiento = {
      x: this.arrastreInicio.panX + (ev.clientX - this.arrastreInicio.x),
      y: this.arrastreInicio.panY + (ev.clientY - this.arrastreInicio.y),
    };
  }

  @HostListener('document:mouseup')
  onRatonArriba(): void {
    this.arrastrando = false;
  }

  /** Un dedo arrastra; dos dedos amplían o reducen. */
  onDedosAbajo(ev: TouchEvent): void {
    if (ev.touches.length === 2) {
      this.pellizcoInicial = this.distanciaDedos(ev);
      this.escalaPellizco = this.escala;
      this.arrastrando = false;
    } else if (ev.touches.length === 1) {
      const t = ev.touches[0];
      this.arrastrando = true;
      this.arrastreInicio = { x: t.clientX, y: t.clientY, panX: this.desplazamiento.x, panY: this.desplazamiento.y };
    }
  }

  onDedosMueve(ev: TouchEvent): void {
    if (ev.touches.length === 2 && this.pellizcoInicial > 0) {
      ev.preventDefault();
      const proporcion = this.distanciaDedos(ev) / this.pellizcoInicial;
      this.escala = +Math.min(this.ESCALA_MAX, Math.max(this.ESCALA_MIN, this.escalaPellizco * proporcion)).toFixed(2);
    } else if (this.arrastrando && ev.touches.length === 1) {
      ev.preventDefault();
      const t = ev.touches[0];
      this.desplazamiento = {
        x: this.arrastreInicio.panX + (t.clientX - this.arrastreInicio.x),
        y: this.arrastreInicio.panY + (t.clientY - this.arrastreInicio.y),
      };
    }
  }

  onDedosArriba(): void {
    this.arrastrando = false;
    this.pellizcoInicial = 0;
  }

  private distanciaDedos(ev: TouchEvent): number {
    const [a, b] = [ev.touches[0], ev.touches[1]];
    return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
  }

  /** Pasar a la anterior o a la siguiente sin salir. */
  mover(paso: number): void {
    if (!this.hayVarias) { return; }
    this.indice = (this.indice + paso + this.imagenes.length) % this.imagenes.length;
    this.ajustar();
  }

  @HostListener('document:keydown', ['$event'])
  onTecla(ev: KeyboardEvent): void {
    switch (ev.key) {
      // Escape lo cierra por su cuenta (keyboard del modal), pero así también
      // funciona cuando el foco se fue a otra parte
      case 'Escape':      this.activeModal.dismiss(); break;
      case '+': case '=': this.ampliar(); break;
      case '-':           this.reducir(); break;
      case 'r': case 'R': this.girar(ev.shiftKey ? -90 : 90); break;
      case '0':           this.ajustar(); break;
      case 'ArrowLeft':   this.mover(-1); break;
      case 'ArrowRight':  this.mover(1); break;
      default: return;
    }
    ev.preventDefault();
  }

  // ================================================================
  // DESCARGAR
  // ================================================================

  /** Baja la imagen que se está viendo. */
  async descargar(): Promise<void> {
    const img = this.actual;
    if (!img) { return; }

    try {
      // Con un object URL basta el enlace; con una url del servidor hay que
      // traerla antes o el navegador la abre en vez de guardarla
      const r = await fetch(img.url);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = img.nombre || this.nombreDeLaUrl(img.url);
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('No se pudo descargar la imagen:', e);
    }
  }

  private nombreDeLaUrl(url: string): string {
    const limpio = url.split('?')[0].split('/').pop() || 'imagen';
    return /\.[a-z0-9]{3,4}$/i.test(limpio) ? limpio : limpio + '.png';
  }
}
