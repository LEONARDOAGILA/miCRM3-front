import { Component, ElementRef, HostListener, Input, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

import { ArchivoCliente, formatoTamano, pintaDeTipo } from '../../../interfaces/archivoCliente';

/**
 * Visor de los archivos de un cliente: ampliar, girar, arrastrar y pasar al
 * siguiente sin salir de la pantalla.
 *
 * Antes el botón «Abrir» mandaba el archivo a otra pestaña del navegador, que
 * sirve para verlo pero no para trabajar con él: no hay zoom sobre un detalle,
 * no se puede enderezar una foto tomada de lado y se pierde el contexto del
 * cliente.
 *
 * Las fórmulas del zoom y del giro son las de extra-profile, que es el visor
 * que ya tenía la plantilla: mismos topes (0,5 a 6), mismo paso (0,25), mismo
 * anclaje al puntero —al hacer rueda, el punto bajo el cursor se queda quieto—
 * y el mismo reajuste al girar, que vuelve a encajar la foto cuando queda de
 * lado. Lo que cambia es la forma: aquel monta sus botones a mano sobre el DOM
 * de lity, y esto es un componente, que es lo que hacía falta para poder usarlo
 * desde otra pantalla.
 *
 * Sólo las imágenes se amplían. Un video trae sus propios controles, un PDF lo
 * pinta el visor del navegador y del resto no hay nada que ver: para ésos el
 * visor ofrece descargar.
 */
@Component({
  selector: 'app-visorArchivo',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './visorArchivo.component.html',
  styleUrls: ['./visorArchivo.component.css'],
})
export class VisorArchivoComponent implements OnInit {

  /** Todos los del cliente: son los que se recorren con las flechas. */
  @Input() archivos: ArchivoCliente[] = [];
  /** Cuál se abre. */
  @Input() indice = 0;
  /** Cómo se construye la url de cada uno (lo sabe el servicio, no el visor). */
  @Input() urlDe!: (a: ArchivoCliente, descargar?: boolean) => string;

  @ViewChild('escenario') escenario?: ElementRef<HTMLElement>;
  @ViewChild('lamina') lamina?: ElementRef<HTMLImageElement>;

  // ---------- Zoom y giro (los valores de extra-profile) ----------
  private readonly ZOOM_MIN = 0.5;
  private readonly ZOOM_MAX = 6;
  private readonly ZOOM_PASO = 0.25;

  public zoom = 1;
  public giro = 0;
  public panX = 0;
  public panY = 0;

  /**
   * El zoom al que la imagen «entra» en el escenario.
   *
   * Normalmente 1, pero al girar 90° una foto apaisada ya no cabe y hay que
   * encogerla. Se guarda aparte del zoom actual porque es el suelo: por debajo
   * de él no tiene sentido arrastrar, y se vuelve a centrar sola.
   */
  private zoomBase = 1;

  public arrastrando = false;
  private xAlEmpezar = 0;
  private yAlEmpezar = 0;
  private panXAlEmpezar = 0;
  private panYAlEmpezar = 0;

  // ---------- Pellizco (móvil) ----------
  private pellizcando = false;
  private separacionInicial = 0;
  private zoomAlPellizcar = 1;

  public readonly formatoTamano = formatoTamano;
  public readonly pintaDeTipo = pintaDeTipo;

  constructor(
    public modal: NgbActiveModal,
    private _sanitizador: DomSanitizer,
  ) {}

  ngOnInit(): void {
    if (this.indice < 0 || this.indice >= this.archivos.length) { this.indice = 0; }
  }

  // ================================================================
  // QUÉ SE ESTÁ VIENDO
  // ================================================================

  get actual(): ArchivoCliente | null {
    return this.archivos[this.indice] ?? null;
  }

  get url(): string {
    return this.actual && this.urlDe ? this.urlDe(this.actual) : '';
  }

  /**
   * La misma url, marcada como segura.
   *
   * Angular no deja poner un [src] calculado en un <iframe> sin esto, y con
   * razón: ahí dentro se ejecutaría lo que se cargue. Es nuestra propia ruta
   * del back (ventas/archivoCliente/ver/{id}), no algo que escriba el usuario.
   */
  get urlSegura(): SafeResourceUrl {
    return this._sanitizador.bypassSecurityTrustResourceUrl(this.url);
  }

  get esImagen(): boolean { return this.actual?.tipo === 'imagen'; }
  get esVideo(): boolean { return this.actual?.tipo === 'video'; }
  get esPdf(): boolean { return this.actual?.tipo === 'pdf'; }
  get esAudio(): boolean { return this.actual?.tipo === 'audio'; }

  /** Ni se amplía ni se reproduce: lo único que se puede hacer es bajarlo. */
  get soloDescarga(): boolean {
    return !!this.actual && !this.esImagen && !this.esVideo && !this.esPdf && !this.esAudio;
  }

  get hayVarios(): boolean { return this.archivos.length > 1; }

  get transformacion(): string {
    return `translate(${this.panX}px, ${this.panY}px) rotate(${this.giro}deg) scale(${this.zoom})`;
  }

  get porcentaje(): number { return Math.round(this.zoom * 100); }

  /** Sólo tiene sentido arrastrar cuando hay más imagen que escenario. */
  get puedeArrastrar(): boolean { return this.esImagen && this.zoom > this.zoomBase; }

  // ================================================================
  // PASAR DE UNO A OTRO
  // ================================================================

  pasar(sentido: number): void {
    if (!this.hayVarios) { return; }
    const n = this.archivos.length;
    this.indice = (this.indice + sentido + n) % n;
    this.reiniciar();
  }

  irA(i: number): void {
    if (i === this.indice) { return; }
    this.indice = i;
    this.reiniciar();
  }

  /** Cada archivo se abre como si fuera el primero: sin zoom y derecho. */
  reiniciar(): void {
    this.zoom = 1;
    this.zoomBase = 1;
    this.giro = 0;
    this.panX = 0;
    this.panY = 0;
  }

  // ================================================================
  // ZOOM
  // ================================================================

  private limitar(valor: number): number {
    const redondeado = Math.round(valor * 100) / 100;
    return Math.min(this.ZOOM_MAX, Math.max(this.ZOOM_MIN, redondeado));
  }

  /** Sin zoom no hay nada que desplazar: se vuelve al centro. */
  private centrarSiNoHayZoom(): void {
    if (this.zoom <= this.zoomBase) { this.panX = 0; this.panY = 0; }
  }

  /**
   * Rueda del ratón: el punto que está bajo el cursor se queda donde está.
   *
   * Es lo que hace que ampliar un detalle sea útil: sin este ajuste la imagen
   * crece desde el centro y el detalle que se quería mirar se va de la
   * pantalla.
   */
  alRodar(ev: WheelEvent): void {
    if (!this.esImagen) { return; }
    ev.preventDefault();

    const anterior = this.zoom;
    const nuevo = this.limitar(anterior + (ev.deltaY < 0 ? 1 : -1) * this.ZOOM_PASO);
    if (nuevo === anterior) { return; }

    const caja = this.escenario?.nativeElement.getBoundingClientRect();
    if (caja) {
      const px = ev.clientX - caja.left - caja.width / 2;
      const py = ev.clientY - caja.top - caja.height / 2;
      this.panX = px - ((px - this.panX) / anterior) * nuevo;
      this.panY = py - ((py - this.panY) / anterior) * nuevo;
    }

    this.zoom = nuevo;
    this.centrarSiNoHayZoom();
  }

  /** Los botones de + y −, que amplían desde el centro. */
  acercar(paso: number): void {
    const anterior = this.zoom;
    this.zoom = this.limitar(anterior + paso);
    if (this.zoom === anterior) { return; }

    const factor = this.zoom / anterior;
    this.panX *= factor;
    this.panY *= factor;
    this.centrarSiNoHayZoom();
  }

  ajustar(): void {
    this.zoom = this.zoomBase;
    this.panX = 0;
    this.panY = 0;
  }

  // ================================================================
  // GIRAR
  // ================================================================

  /**
   * Gira 90° y vuelve a encajar.
   *
   * De lado, una foto apaisada se sale del escenario por arriba y por abajo;
   * el zoom base pasa a ser el que la hace caber, y de ahí parte el usuario.
   */
  girar(grados: number): void {
    if (!this.esImagen) { return; }
    this.giro += grados;
    this.panX = 0;
    this.panY = 0;
    this.zoomBase = this.zoomQueEntraAlGirar();
    this.zoom = this.zoomBase;
  }

  private zoomQueEntraAlGirar(): number {
    const deLado = this.giro % 180 !== 0;
    const img = this.lamina?.nativeElement;
    const caja = this.escenario?.nativeElement;
    if (!deLado || !img || !caja || !img.offsetWidth || !img.offsetHeight) { return 1; }

    // De lado, el ancho de la imagen ocupa el alto del escenario y al revés
    const factor = Math.min(1, caja.clientWidth / img.offsetHeight, caja.clientHeight / img.offsetWidth);
    return Math.max(0.1, Math.floor(factor * 100) / 100);
  }

  // ================================================================
  // ARRASTRAR
  // ================================================================

  alPulsar(ev: MouseEvent): void {
    if (!this.puedeArrastrar) { return; }
    ev.preventDefault();
    this.arrastrando = true;
    this.xAlEmpezar = ev.clientX;
    this.yAlEmpezar = ev.clientY;
    this.panXAlEmpezar = this.panX;
    this.panYAlEmpezar = this.panY;
  }

  @HostListener('document:mousemove', ['$event'])
  alMover(ev: MouseEvent): void {
    if (!this.arrastrando) { return; }
    this.panX = this.panXAlEmpezar + (ev.clientX - this.xAlEmpezar);
    this.panY = this.panYAlEmpezar + (ev.clientY - this.yAlEmpezar);
  }

  @HostListener('document:mouseup')
  alSoltar(): void { this.arrastrando = false; }

  // ================================================================
  // DEDOS
  // ================================================================

  alTocar(ev: TouchEvent): void {
    if (!this.esImagen) { return; }

    if (ev.touches.length === 2) {
      this.pellizcando = true;
      this.separacionInicial = this.separacion(ev.touches);
      this.zoomAlPellizcar = this.zoom;
      return;
    }
    if (ev.touches.length === 1 && this.puedeArrastrar) {
      this.arrastrando = true;
      this.xAlEmpezar = ev.touches[0].clientX;
      this.yAlEmpezar = ev.touches[0].clientY;
      this.panXAlEmpezar = this.panX;
      this.panYAlEmpezar = this.panY;
    }
  }

  alArrastrarDedo(ev: TouchEvent): void {
    if (this.pellizcando && ev.touches.length === 2) {
      ev.preventDefault();
      const ahora = this.separacion(ev.touches);
      if (this.separacionInicial > 0) {
        this.zoom = this.limitar(this.zoomAlPellizcar * (ahora / this.separacionInicial));
        this.centrarSiNoHayZoom();
      }
      return;
    }
    if (this.arrastrando && ev.touches.length === 1) {
      ev.preventDefault();
      this.panX = this.panXAlEmpezar + (ev.touches[0].clientX - this.xAlEmpezar);
      this.panY = this.panYAlEmpezar + (ev.touches[0].clientY - this.yAlEmpezar);
    }
  }

  alLevantarDedo(): void {
    this.pellizcando = false;
    this.arrastrando = false;
  }

  private separacion(dedos: TouchList): number {
    const dx = dedos[0].clientX - dedos[1].clientX;
    const dy = dedos[0].clientY - dedos[1].clientY;
    return Math.hypot(dx, dy);
  }

  // ================================================================
  // TECLADO
  // ================================================================

  @HostListener('document:keydown', ['$event'])
  alTeclear(ev: KeyboardEvent): void {
    switch (ev.key) {
      case 'ArrowLeft':  this.pasar(-1); break;
      case 'ArrowRight': this.pasar(1); break;
      case '+': case '=': this.acercar(this.ZOOM_PASO); break;
      case '-': this.acercar(-this.ZOOM_PASO); break;
      case 'r': case 'R': this.girar(90); break;
      case '0': this.ajustar(); break;
      default: return;
    }
    ev.preventDefault();
  }

  // ================================================================
  // DESCARGAR
  // ================================================================

  descargar(): void {
    if (!this.actual || !this.urlDe) { return; }
    window.open(this.urlDe(this.actual, true), '_blank', 'noopener');
  }

  /**
   * El archivo en una pestaña aparte, tal cual.
   *
   * Es la salida cuando el navegador se niega a incrustar el PDF —pasa con
   * «Descargar los archivos PDF en lugar de abrirlos automáticamente»
   * activado, y con algunas extensiones—: ahí el <iframe> se queda en negro
   * y sin esto no hay forma de llegar al documento sin cerrar el visor.
   */
  abrirAparte(): void {
    if (!this.url) { return; }
    window.open(this.url, '_blank', 'noopener');
  }
}
