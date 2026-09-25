import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter,
  Input, OnDestroy, Optional, Output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { ZXingScannerModule } from '@zxing/ngx-scanner';
import { BarcodeFormat, Result } from '@zxing/library';
import Swal from 'sweetalert2';

/** Una lectura: lo que emite el componente a quien lo usa. */
export interface CodigoLeido {
  texto: string;
  /** El formato que dice la librería (QR_CODE, EAN_13…), no una suposición */
  formato: string;
  fecha: Date;
}

/** Los formatos que se intentan reconocer. */
const FORMATOS: BarcodeFormat[] = [
  BarcodeFormat.QR_CODE, BarcodeFormat.CODE_128, BarcodeFormat.CODE_39,
  BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E, BarcodeFormat.CODABAR, BarcodeFormat.CODE_93,
  BarcodeFormat.DATA_MATRIX, BarcodeFormat.PDF_417, BarcodeFormat.AZTEC,
];

/** Cómo se lee cada formato en la pantalla. */
const NOMBRES: Record<string, string> = {
  QR_CODE: 'QR', CODE_128: 'Code 128', CODE_39: 'Code 39',
  EAN_13: 'EAN-13', EAN_8: 'EAN-8', UPC_A: 'UPC-A', UPC_E: 'UPC-E',
  CODABAR: 'Codabar', CODE_93: 'Code 93', DATA_MATRIX: 'DataMatrix',
  PDF_417: 'PDF417', AZTEC: 'Aztec',
};

/**
 * Lector de códigos QR y de barras.
 *
 * Sirve de dos maneras: como pantalla suelta y, sobre todo, incrustado donde
 * haga falta leer un código —inventario, activos fijos, marcaciones—, que es
 * para lo que emite `leido`:
 *
 *   <app-scanner (leido)="buscarProducto($event.texto)"></app-scanner>
 *
 * Abierto con NgbModal se cierra solo al primer código si `continuo` va en
 * false, y devuelve la lectura como resultado del modal.
 *
 * Viene del lector de la carpeta demo, reescrito: allí había dos escáneres
 * con el mismo código repetido (el de la página y el del modal), el formato
 * se adivinaba con expresiones regulares en vez de preguntárselo a la
 * librería, y cada pitido abría un AudioContext nuevo.
 */
@Component({
  selector: 'app-scanner',
  standalone: true,
  imports: [CommonModule, FormsModule, ZXingScannerModule],
  templateUrl: './scanner.component.html',
  styleUrls: ['./scanner.component.css'],
  // La cámara dispara eventos sin parar: sin OnPush, Angular revisaría toda
  // la pantalla en cada uno
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScannerComponent implements OnDestroy {

  /** Sigue leyendo tras el primer código; en false se para (y cierra el modal). */
  @Input() continuo = true;
  /** La lista de lo leído; se puede ocultar cuando va incrustado. */
  @Input() mostrarHistorial = true;
  /** Enciende la cámara nada más aparecer. */
  @Input() autoEncender = false;

  /** Cada código leído. */
  @Output() leido = new EventEmitter<CodigoLeido>();

  readonly formatos = FORMATOS;

  // ---------- cámara ----------
  encendida = false;
  arrancando = false;
  camaras: MediaDeviceInfo[] = [];
  camara: MediaDeviceInfo | undefined;
  linterna = false;
  hayLinterna = false;
  /** Mensaje cuando el navegador no da la cámara. */
  problema = '';

  // ---------- lecturas ----------
  ultimo: CodigoLeido | null = null;
  historial: CodigoLeido[] = [];
  total = 0;
  totalQr = 0;
  totalBarras = 0;

  /** Lo que no cabe en pantalla tampoco hace falta en memoria. */
  private static readonly TOPE_HISTORIAL = 50;
  private static readonly CLAVE = 'scanner.historial';
  /** Un mismo código pegado al lector dispararía decenas de lecturas. */
  private static readonly ESPERA_MS = 1200;

  private ultimaLectura = 0;
  /** El formato real de la última lectura, que llega por su propio evento. */
  private formatoEnCurso = '';
  /** Un solo contexto de audio para todos los pitidos. */
  private audio: AudioContext | null = null;

  constructor(
    private _toastr: ToastrService,
    private _cd: ChangeDetectorRef,
    @Optional() public activeModal: NgbActiveModal | null,
  ) {
    this.historial = this.leerGuardado();
    this.total = this.historial.length;
    this.totalQr = this.historial.filter(l => l.formato === 'QR_CODE').length;
    this.totalBarras = this.total - this.totalQr;
  }

  ngOnInit(): void {
    if (this.autoEncender) { this.encender(); }
  }

  ngOnDestroy(): void {
    this.apagar();
    if (this.audio) {
      this.audio.close().catch(() => { /* ya estaba cerrado */ });
      this.audio = null;
    }
  }

  // ================================================================
  // CÁMARA
  // ================================================================

  encender(): void {
    this.problema = '';
    this.encendida = true;
    this.arrancando = true;
    this._cd.markForCheck();
  }

  apagar(): void {
    this.encendida = false;
    this.arrancando = false;
    this.linterna = false;
    this._cd.markForCheck();
  }

  /** Enciende o apaga, que es lo que se pulsa el 90 % de las veces. */
  alternarCamara(): void {
    this.encendida ? this.apagar() : this.encender();
  }

  alEncontrarCamaras(camaras: MediaDeviceInfo[]): void {
    this.camaras = (camaras ?? []).filter(c => c.kind === 'videoinput');

    // La trasera es la que sirve para leer un código; se elige sola
    const traseras = this.camaras.filter(c => /back|tr[aá]s|rear|traseira|environment|ambiente/i.test(c.label));
    this.camara = traseras[0] ?? this.camaras[0];

    if (!this.camaras.length) {
      this.problema = 'No se encontró ninguna cámara en este equipo.';
      this.encendida = false;
    }
    this._cd.markForCheck();
  }

  /** El navegador contesta al permiso: sin él no hay nada que hacer. */
  alResponderPermiso(concedido: boolean): void {
    if (!concedido) {
      this.problema = 'El navegador no dio permiso para usar la cámara. Se concede desde el candado de la barra de direcciones.';
      this.encendida = false;
      this.arrancando = false;
    }
    this._cd.markForCheck();
  }

  alArrancar(): void {
    this.arrancando = false;
    this._cd.markForCheck();
  }

  alSaberDeLaLinterna(hay: boolean): void {
    this.hayLinterna = hay;
    this._cd.markForCheck();
  }

  alternarLinterna(): void {
    this.linterna = !this.linterna;
    this._cd.markForCheck();
  }

  /** Pasa a la siguiente cámara del equipo. */
  siguienteCamara(): void {
    if (this.camaras.length < 2) {
      this._toastr.info('Este equipo sólo tiene una cámara', '', { timeOut: 2000 });
      return;
    }
    const i = this.camaras.findIndex(c => c.deviceId === this.camara?.deviceId);
    this.camara = this.camaras[(i + 1) % this.camaras.length];
    this._cd.markForCheck();
  }

  elegirCamara(indice: string | number): void {
    const c = this.camaras[Number(indice)];
    if (c) { this.camara = c; this._cd.markForCheck(); }
  }

  esTrasera(c: MediaDeviceInfo): boolean {
    return /back|tr[aá]s|rear|traseira|environment|ambiente/i.test(c.label);
  }

  alternarContinuo(): void {
    this.continuo = !this.continuo;
    this._toastr.info(this.continuo ? 'Sigue leyendo sin parar' : 'Se detiene en cada código', '', { timeOut: 2000 });
    this._cd.markForCheck();
  }

  // ================================================================
  // LECTURA
  // ================================================================

  /**
   * El formato de verdad, tal como lo identificó la librería.
   *
   * Llega en su propio evento justo antes del texto; antes se adivinaba con
   * expresiones regulares sobre el contenido y se equivocaba a menudo (un QR
   * con trece cifras se tomaba por un EAN-13).
   */
  alCompletar(resultado: Result | undefined): void {
    if (!resultado) { return; }
    try {
      this.formatoEnCurso = BarcodeFormat[resultado.getBarcodeFormat()] ?? '';
    } catch { this.formatoEnCurso = ''; }
  }

  alLeer(texto: string): void {
    const ahora = Date.now();
    if (!texto || ahora - this.ultimaLectura < ScannerComponent.ESPERA_MS) { return; }
    this.ultimaLectura = ahora;

    const lectura: CodigoLeido = {
      texto,
      formato: this.formatoEnCurso || 'DESCONOCIDO',
      fecha: new Date(),
    };

    this.ultimo = lectura;
    this.total++;
    if (lectura.formato === 'QR_CODE') { this.totalQr++; } else { this.totalBarras++; }

    this.historial.unshift(lectura);
    if (this.historial.length > ScannerComponent.TOPE_HISTORIAL) { this.historial.pop(); }
    this.guardar();

    this.pitar();
    this.leido.emit(lectura);

    // Modo de uno en uno: se para, y si está en un modal lo cierra devolviendo
    // la lectura a quien lo abrió
    if (!this.continuo) {
      this.apagar();
      this.activeModal?.close(lectura);
    }

    this._cd.markForCheck();
  }

  nombreFormato(formato: string): string {
    return NOMBRES[formato] ?? formato;
  }

  /** Un QR con una dirección de internet: se ofrece abrirla. */
  esEnlace(texto: string): boolean {
    return /^https?:\/\//i.test((texto ?? '').trim());
  }

  async abrirEnlace(texto: string): Promise<void> {
    if (!this.esEnlace(texto)) { return; }

    const r = await Swal.fire({
      title: '¿Abrir este enlace?',
      html: `<p class="mb-0 text-break">${this.escapar(texto)}</p>`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#00acac',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Abrir',
      cancelButtonText: 'Cancelar',
      reverseButtons: true,
    });
    if (r.isConfirmed) {
      window.open(texto, '_blank', 'noopener,noreferrer');
    }
  }

  private escapar(s: string): string {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ================================================================
  // HISTORIAL
  // ================================================================

  async copiar(texto: string): Promise<void> {
    try {
      // El portapapeles sólo existe en https o en localhost
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(texto);
      } else {
        const t = document.createElement('textarea');
        t.value = texto;
        t.style.position = 'fixed';
        t.style.opacity = '0';
        document.body.appendChild(t);
        t.select();
        document.execCommand('copy');
        t.remove();
      }
      this._toastr.success('Copiado', '', { timeOut: 1500 });
    } catch {
      this._toastr.error('El navegador no dejó copiar', '', { timeOut: 2500 });
    }
  }

  async limpiarHistorial(): Promise<void> {
    if (!this.historial.length) { return; }

    const r = await Swal.fire({
      title: '¿Borrar el historial?',
      text: `Se quitan las ${this.historial.length} lecturas guardadas en este equipo.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ff5b57',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Sí, borrar',
      cancelButtonText: 'Cancelar',
      reverseButtons: true,
    });
    if (!r.isConfirmed) { return; }

    this.historial = [];
    this.ultimo = null;
    this.total = this.totalQr = this.totalBarras = 0;
    this.guardar();
    this._toastr.success('Historial borrado', '', { timeOut: 1500 });
    this._cd.markForCheck();
  }

  quitar(lectura: CodigoLeido): void {
    this.historial = this.historial.filter(l => l !== lectura);
    this.guardar();
    this._cd.markForCheck();
  }

  /**
   * A CSV, que es lo que abre Excel de una vez. Antes bajaba un JSON que
   * había que convertir a mano.
   */
  exportar(): void {
    if (!this.historial.length) {
      this._toastr.info('No hay nada que exportar', '', { timeOut: 2000 });
      return;
    }

    const escapa = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const filas = [
      ['Fecha', 'Formato', 'Código'].map(escapa).join(';'),
      ...this.historial.map(l => [
        escapa(new Date(l.fecha).toLocaleString('es-EC')),
        escapa(this.nombreFormato(l.formato)),
        escapa(l.texto),
      ].join(';')),
    ].join('\r\n');

    // El BOM es lo que hace que Excel respete las tildes
    const blob = new Blob(['﻿' + filas], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lecturas-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    this._toastr.success(`${this.historial.length} lecturas exportadas`, '', { timeOut: 2000 });
  }

  /** Para el @for: sin esto la lista se repinta entera en cada lectura. */
  porFecha = (_: number, l: CodigoLeido) => l.fecha + '|' + l.texto;

  // ================================================================
  // AYUDAS
  // ================================================================

  /**
   * Un pitido corto de confirmación.
   *
   * El contexto se crea una vez y se reutiliza: antes se abría y se cerraba
   * uno por lectura, y los navegadores limitan cuántos se pueden tener.
   */
  private pitar(): void {
    try {
      const Contexto = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Contexto) { return; }

      this.audio ??= new Contexto();
      const ctx = this.audio!;
      if (ctx.state === 'suspended') { ctx.resume().catch(() => { /* hace falta un gesto */ }); }

      const osc = ctx.createOscillator();
      const vol = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      vol.gain.setValueAtTime(0.06, ctx.currentTime);
      vol.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);

      osc.connect(vol);
      vol.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
      osc.onended = () => { osc.disconnect(); vol.disconnect(); };
    } catch { /* sin sonido se sigue leyendo igual */ }
  }

  private leerGuardado(): CodigoLeido[] {
    try {
      const crudo = JSON.parse(localStorage.getItem(ScannerComponent.CLAVE) ?? '[]');
      return Array.isArray(crudo)
        ? crudo.map((l: any) => ({ texto: l.texto, formato: l.formato, fecha: new Date(l.fecha) }))
        : [];
    } catch {
      return [];
    }
  }

  private guardar(): void {
    try {
      localStorage.setItem(ScannerComponent.CLAVE, JSON.stringify(this.historial));
    } catch { /* navegación privada o disco lleno */ }
  }
}
