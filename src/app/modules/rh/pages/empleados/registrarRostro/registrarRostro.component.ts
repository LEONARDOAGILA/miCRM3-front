import { AfterViewInit, Component, ElementRef, EventEmitter, Input, NgZone, OnDestroy, Output, ViewChild, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';
import * as faceapi from 'face-api.js';

import { ModalHeaderComponent } from '../../../../../components/modal/modal-header/modal-header.component';
import { MarcacionService } from '../../../services/marcacion.service';
import { EmpleadoService } from '../../../services/empleado.service';

/**
 * REGISTRAR EL ROSTRO DE UN EMPLEADO (plantilla facial).
 *
 * Se abre desde la columna ACCIONES de allEmpleados: se toman cinco muestras
 * con la cámara y se guardan en rh.rostros_empleados; con ellas el kiosco de
 * marcación reconoce después a la persona.
 *
 * POR QUÉ CINCO Y NO UNA. Cada muestra es un descriptor de 128 números sacado
 * de UNA pose. Con cinco, tomadas mientras la persona gira un poco la cabeza,
 * el kiosco acierta aunque la luz o el ángulo no sean los del registro. Las
 * muestras se separan en el tiempo y se descartan las casi idénticas: cinco
 * fotos del mismo instante no aportan nada.
 *
 * La cámara se apaga al cerrar el modal (ngOnDestroy), y los modelos de
 * face-api se cargan de /assets/models, igual que en el kiosco.
 */
@Component({
  selector: 'app-registrar-rostro',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalHeaderComponent],
  templateUrl: './registrarRostro.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./registrarRostro.component.css'],
})
export class RegistrarRostroComponent implements AfterViewInit, OnDestroy {

  /** La fila de la rejilla: hace falta el id y el nombre. */
  @Input() empleado: any = null;
  /** Avisa a la pantalla de empleados de que este ya tiene (o ya no) plantilla. */
  @Output() registrosE = new EventEmitter<{ empleado_id: number; muestras: number }>();

  @ViewChild('video', { static: true }) videoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  // ---------- Estado ----------
  public estado: 'cargando' | 'listo' | 'error' = 'cargando';
  public mensajeError = '';
  public camaraEncendida = false;
  public espejo = true;

  public camaras: MediaDeviceInfo[] = [];
  public camaraId = '';

  /** Lo que se le dice a la persona mientras se la mira. */
  public pista = 'Encendiendo la cámara…';
  /** Hay exactamente una cara, bien grande y centrada. */
  public caraLista = false;

  public capturando = false;
  public capturasHechas = 0;
  public readonly CAPTURAS_NECESARIAS = 5;
  public guardando = false;
  public borrando = false;

  /** Las muestras que YA tiene guardadas (de un registro anterior). */
  public muestrasGuardadas = 0;
  public origenGuardado = '';

  // ---------- Interno ----------
  private stream: MediaStream | null = null;
  private bucle = 0;
  private parar = false;
  private muestras: number[][] = [];
  private ultimaCaptura = 0;

  /** Entre muestra y muestra, para que no salgan cinco del mismo instante. */
  private readonly MS_ENTRE_MUESTRAS = 700;
  /** Dos muestras que se parecen tanto no aportan nada nuevo. */
  private readonly DISTANCIA_MINIMA = 0.06;
  /** La cara tiene que ocupar al menos esta parte del alto del vídeo. */
  private readonly ALTO_MINIMO = 0.25;

  constructor(
    public modal: NgbActiveModal,
    private zone: NgZone,
    private _toastr: ToastrService,
    private _marcacionService: MarcacionService,
    private _empleadoService: EmpleadoService,
  ) {}

  get empleadoId(): number { return Number(this.empleado?.id ?? 0); }

  get nombre(): string {
    const e = this.empleado;
    return e?.nombre_completo || `${e?.nombres ?? ''} ${e?.apellidos ?? ''}`.trim() || `Empleado ${this.empleadoId}`;
  }

  get foto(): string { return this._empleadoService.getEmpleadoImage(this.empleadoId, false); }

  get progreso(): number {
    return Math.round((this.capturasHechas / this.CAPTURAS_NECESARIAS) * 100);
  }

  async ngAfterViewInit(): Promise<void> {
    try {
      await this.cargarModelos();
      await this.cargarGuardadas();
      this.estado = 'listo';
      await this.encenderCamara();
    } catch (e: any) {
      console.error('Error al iniciar el registro de rostro:', e);
      this.estado = 'error';
      this.mensajeError = e?.message ?? 'No se pudieron cargar los modelos de reconocimiento';
    }
  }

  ngOnDestroy(): void {
    this.apagarCamara();
  }

  // ================================================================
  // ARRANQUE
  // ================================================================

  private async cargarModelos(): Promise<void> {
    const URL = '/assets/models';
    await faceapi.nets.tinyFaceDetector.loadFromUri(URL);
    await faceapi.nets.faceLandmark68Net.loadFromUri(URL);
    await faceapi.nets.faceRecognitionNet.loadFromUri(URL);
  }

  /** Cuántas muestras tiene ya: registrar otra vez las sustituye. */
  async cargarGuardadas(): Promise<void> {
    try {
      const res: any = await firstValueFrom(this._marcacionService.allRostros(this.empleadoId));
      const fila = (res?.data ?? []).find((r: any) => Number(r.empleado_id) === this.empleadoId);
      this.muestrasGuardadas = Number(fila?.num_muestras ?? 0);

      // El origen va en CADA muestra, no en la fila: se mira de dónde salieron
      const origenes = new Set<string>((fila?.muestras ?? []).map((m: any) => m.origen));
      this.origenGuardado = origenes.size > 1 ? 'MIXTO' : [...origenes][0] ?? '';
    } catch (e) {
      console.error('Error al consultar las plantillas del empleado:', e);
      this.muestrasGuardadas = 0;
    }
  }

  private async listarCamaras(): Promise<void> {
    try {
      const d = await navigator.mediaDevices.enumerateDevices();
      this.camaras = d.filter(x => x.kind === 'videoinput');
      if (!this.camaraId && this.camaras.length) { this.camaraId = this.camaras[0].deviceId; }
    } catch { /* sin permiso todavía */ }
  }

  async encenderCamara(): Promise<void> {
    if (this.camaraEncendida) { return; }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: this.camaraId
          ? { deviceId: { exact: this.camaraId }, width: { ideal: 640 }, height: { ideal: 480 } }
          : { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });

      const video = this.videoRef.nativeElement;
      video.srcObject = this.stream;
      await video.play();
      await this.listarCamaras();

      const canvas = this.canvasRef.nativeElement;
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;

      this.camaraEncendida = true;
      this.parar = false;
      this.pista = 'Mire a la cámara';
      this.zone.runOutsideAngular(() => this.mirar());
    } catch (e: any) {
      console.error('Error al abrir la cámara:', e);
      const n = e?.name ?? '';
      this.mensajeError = n === 'NotAllowedError' ? 'Permiso de cámara denegado. Permítalo en el navegador.'
        : n === 'NotFoundError' ? 'No se encontró ninguna cámara.'
        : n === 'NotReadableError' ? 'La cámara está siendo usada por otra aplicación.'
        : (e?.message ?? 'No se pudo abrir la cámara');
      this.estado = 'error';
      this._toastr.error(this.mensajeError, 'Cámara');
    }
  }

  apagarCamara(): void {
    this.parar = true;
    cancelAnimationFrame(this.bucle);
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
    this.camaraEncendida = false;
    const canvas = this.canvasRef?.nativeElement;
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
  }

  async cambiarCamara(): Promise<void> {
    this.cancelar();
    this.apagarCamara();
    await this.encenderCamara();
  }

  // ================================================================
  // EL BUCLE: UNA CARA, BIEN PUESTA
  // ================================================================

  private async mirar(): Promise<void> {
    if (this.parar) { return; }
    const video = this.videoRef.nativeElement;
    const canvas = this.canvasRef.nativeElement;

    if (video.readyState === 4) {
      const t0 = performance.now();
      try {
        const opciones = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });
        // Con descriptor siempre: aquí lo único que se hace es registrar, y
        // es el descriptor lo que se guarda.
        const caras: any[] = await faceapi.detectAllFaces(video, opciones)
          .withFaceLandmarks().withFaceDescriptors();

        const ajustadas = faceapi.resizeResults(caras, { width: canvas.width, height: canvas.height });
        const cara = ajustadas.length === 1 ? ajustadas[0] : null;
        const caja = cara?.detection?.box ?? null;

        // Qué le falta a la foto para servir
        let pista: string;
        let lista = false;
        if (ajustadas.length === 0) { pista = 'No veo ninguna cara'; }
        else if (ajustadas.length > 1) { pista = 'Hay más de una cara delante'; }
        else if (caja.height < canvas.height * this.ALTO_MINIMO) { pista = 'Acérquese un poco'; }
        else { pista = this.capturando ? 'Gire despacio la cabeza' : 'Listo para capturar'; lista = true; }

        this.pintar(canvas, caja, lista);

        if (this.capturando && lista && cara?.descriptor) { this.guardarMuestra(cara.descriptor); }

        this.zone.run(() => { this.pista = pista; this.caraLista = lista; });
      } catch (e) {
        console.error('Error al mirar la cámara:', e);
      }
      await new Promise(r => setTimeout(r, Math.max(0, 120 - (performance.now() - t0))));
    }
    this.bucle = requestAnimationFrame(() => this.mirar());
  }

  private pintar(canvas: HTMLCanvasElement, caja: any, lista: boolean): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) { return; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!caja) { return; }

    ctx.strokeStyle = lista ? '#00acac' : '#f59c1a';
    ctx.lineWidth = 3;
    ctx.strokeRect(caja.x, caja.y, caja.width, caja.height);
  }

  // ================================================================
  // CAPTURA
  // ================================================================

  empezar(): void {
    if (!this.camaraEncendida) { this._toastr.warning('Encienda la cámara primero', 'Registrar rostro'); return; }
    this.muestras = [];
    this.capturasHechas = 0;
    this.ultimaCaptura = 0;
    this.capturando = true;
    this._toastr.info('Que mire a la cámara y gire un poco la cabeza', 'Registrar rostro', { timeOut: 4000 });
  }

  cancelar(): void {
    this.capturando = false;
    this.muestras = [];
    this.capturasHechas = 0;
  }

  /**
   * Guarda una muestra si aporta algo: ni demasiado seguida de la anterior ni
   * casi idéntica a ella (si no, se registran cinco veces la misma pose).
   */
  private guardarMuestra(descriptor: Float32Array): void {
    // Con las cinco hechas se apaga `capturando`; sin esta guarda, una
    // llamada de más volvería a pasar del tope y guardaría dos veces.
    if (!this.capturando) { return; }

    const ahora = Date.now();
    if (ahora - this.ultimaCaptura < this.MS_ENTRE_MUESTRAS) { return; }

    const ultima = this.muestras[this.muestras.length - 1];
    if (ultima) {
      const d = faceapi.euclideanDistance(new Float32Array(ultima), descriptor);
      if (d < this.DISTANCIA_MINIMA) { return; }   // la misma pose otra vez
    }

    this.ultimaCaptura = ahora;
    this.muestras.push(Array.from(descriptor));
    this.zone.run(() => this.capturasHechas = this.muestras.length);

    if (this.muestras.length >= this.CAPTURAS_NECESARIAS) {
      const muestras = [...this.muestras];
      this.capturando = false;
      this.zone.run(() => this.guardar(muestras));
    }
  }

  private async guardar(muestras: number[][]): Promise<void> {
    this.guardando = true;
    try {
      const res: any = await firstValueFrom(
        this._marcacionService.addRostro(this.empleadoId, muestras, 'CAMARA'));

      if (res?.status !== 'success') { return; }

      this._toastr.success(res.message || `${this.nombre}: rostro registrado`, 'Registrar rostro', { closeButton: true });
      await this.cargarGuardadas();
      this.registrosE.emit({ empleado_id: this.empleadoId, muestras: this.muestrasGuardadas });
      this.modal.close(this.muestrasGuardadas);
    } catch (e) {
      // El AuthInterceptor ya enseñó el error HTTP
      console.error('Error al guardar las muestras:', e);
    } finally {
      this.guardando = false;
      this.cancelar();
    }
  }

  /** Borra lo registrado antes (para volver a tomarlo de cero). */
  async borrarGuardadas(): Promise<void> {
    if (!this.muestrasGuardadas) { return; }
    this.borrando = true;
    try {
      const res: any = await firstValueFrom(this._marcacionService.deleteRostrosEmpleado(this.empleadoId));
      if (res?.status === 'success') {
        this._toastr.info(`${this.nombre}: plantillas eliminadas`, 'Registrar rostro');
        this.muestrasGuardadas = 0;
        this.origenGuardado = '';
        this.registrosE.emit({ empleado_id: this.empleadoId, muestras: 0 });
      }
    } catch (e) {
      console.error('Error al eliminar las plantillas:', e);
    } finally {
      this.borrando = false;
    }
  }

  cerrar(): void {
    this.apagarCamara();
    this.modal.dismiss();
  }
}
