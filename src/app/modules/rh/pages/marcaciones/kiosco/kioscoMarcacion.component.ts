import { AfterViewInit, Component, ElementRef, NgZone, OnDestroy, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import * as faceapi from 'face-api.js';

import { MarcacionService } from '../../../services/marcacion.service';
import { EmpleadoService } from '../../../services/empleado.service';
import { MarcacionModel, RostroEmpleado } from '../../../interfaces/marcacionModel';
import { AccesoModel } from '../../../../seguridad/interfaces/accesoModel';

/** Lo que se ve de cada rostro en el fotograma actual. */
interface RostroEnPantalla {
  caja: { x: number; y: number; w: number; h: number };
  nombre: string;
  similitud: number;
  conocido: boolean;
}

/**
 * Kiosco de marcación facial.
 *
 * Reconoce al empleado con la cámara (face-api.js y las plantillas faciales
 * guardadas en rh.rostros_empleados) y registra la marcación en el servidor:
 * el tipo (entrada / salida) lo decide el back alternando con la última del
 * día, y hay una espera anti-duplicado. Incluye prueba de vida por parpadeo,
 * registro de nuevas plantillas (capturando muestras o desde la foto del
 * empleado) y la lista de las marcaciones del día.
 *
 * Pensado para dejarlo abierto en una tablet o PC en la puerta.
 */
@Component({
  selector: 'app-kiosco-marcacion',
  templateUrl: './kioscoMarcacion.component.html',
  styleUrls: ['./kioscoMarcacion.component.css'],
  standalone: false,
})
export class KioscoMarcacionComponent implements AfterViewInit, OnDestroy {

  @ViewChild('video', { static: true }) videoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  public accesoModel: AccesoModel;

  // ---------- Estado ----------
  estado: 'cargando' | 'listo' | 'error' = 'cargando';
  mensajeError = '';
  camaraEncendida = false;
  espejo = true;
  fps = 0;
  reloj = new Date();
  private timerReloj: any;

  // ---------- Cámaras ----------
  camaras: MediaDeviceInfo[] = [];
  camaraId = '';

  // ---------- Ajustes (se recuerdan en el navegador) ----------
  umbral = 0.5;
  confirmaciones = 6;
  esperaSegundos = 60;
  exigirParpadeo = true;
  dispositivo = 'Kiosco';
  guardarFoto = true;

  // ---------- Datos ----------
  /** Plantillas faciales del servidor */
  rostros: RostroEmpleado[] = [];
  marcacionesHoy: MarcacionModel[] = [];
  enPantalla: RostroEnPantalla[] = [];
  cargandoDatos = false;

  // ---------- Registro de plantillas ----------
  empleados: any[] = [];
  empleadoSeleccionado: number | null = null;
  capturando = false;
  capturasHechas = 0;
  readonly CAPTURAS_NECESARIAS = 5;
  importando = false;
  registrando = false;

  /** Cartel grande de la última marcación / aviso */
  aviso: { nombre: string; texto: string; hora: string; tono: 'ok' | 'info' | 'error' } | null = null;

  // ---------- Interno ----------
  private stream: MediaStream | null = null;
  private matcher: any = null;
  private bucle = 0;
  private parar = false;
  private candidato: { id: number; veces: number } | null = null;
  private parpadeo = new Map<number, boolean>();
  private ojosCerrados = new Map<number, boolean>();
  private ultimaMarcacion = new Map<number, number>();
  private capturasBuffer: number[][] = [];
  private ultimaCapturaT = 0;
  private cache: { x: number; y: number; empleadoId: number; nombre: string; similitud: number; t: number }[] = [];
  private ultimoReconocimiento = 0;
  private readonly RECONOCER_CADA = 400;
  private enviando = false;

  constructor(
    private zone: NgZone,
    private _toastr: ToastrService,
    private _marcacionService: MarcacionService,
    private _empleadoService: EmpleadoService,
    private activeRoute: ActivatedRoute,
  ) {
    this.accesoModel = this.activeRoute.snapshot.data['access'];
    this.leerAjustes();
  }

  async ngAfterViewInit(): Promise<void> {
    this.timerReloj = setInterval(() => this.reloj = new Date(), 1000);
    try {
      await this.cargarModelos();
      await Promise.all([this.cargarRostros(), this.cargarMarcacionesHoy()]);
      await this.listarCamaras();
      this.estado = 'listo';
      await this.encenderCamara();
    } catch (e: any) {
      console.error('Error al iniciar el kiosco:', e);
      this.estado = 'error';
      this.mensajeError = e?.message ?? 'No se pudieron cargar los modelos de reconocimiento';
    }
  }

  ngOnDestroy(): void {
    clearInterval(this.timerReloj);
    this.apagarCamara();
  }

  // ================================================================
  // AJUSTES
  // ================================================================

  private leerAjustes(): void {
    try {
      const a = JSON.parse(localStorage.getItem('miCRM3.kiosco.ajustes') ?? '{}');
      this.umbral = a.umbral ?? this.umbral;
      this.confirmaciones = a.confirmaciones ?? this.confirmaciones;
      this.esperaSegundos = a.esperaSegundos ?? this.esperaSegundos;
      this.exigirParpadeo = a.exigirParpadeo ?? this.exigirParpadeo;
      this.dispositivo = a.dispositivo ?? this.dispositivo;
      this.guardarFoto = a.guardarFoto ?? this.guardarFoto;
      this.camaraId = a.camaraId ?? '';
      this.espejo = a.espejo ?? true;
    } catch { /* sin storage */ }
  }

  guardarAjustes(): void {
    try {
      localStorage.setItem('miCRM3.kiosco.ajustes', JSON.stringify({
        umbral: this.umbral, confirmaciones: this.confirmaciones, esperaSegundos: this.esperaSegundos,
        exigirParpadeo: this.exigirParpadeo, dispositivo: this.dispositivo, guardarFoto: this.guardarFoto,
        camaraId: this.camaraId, espejo: this.espejo,
      }));
    } catch { /* sin storage */ }
  }

  onUmbralCambia(): void {
    this.rehacerMatcher();
    this.guardarAjustes();
  }

  // ================================================================
  // DATOS DEL SERVIDOR
  // ================================================================

  private async cargarModelos(): Promise<void> {
    const URL = '/assets/models';
    await faceapi.nets.tinyFaceDetector.loadFromUri(URL);
    await faceapi.nets.faceLandmark68Net.loadFromUri(URL);
    await faceapi.nets.faceRecognitionNet.loadFromUri(URL);
  }

  async cargarRostros(): Promise<void> {
    this.cargandoDatos = true;
    try {
      const res: any = await firstValueFrom(this._marcacionService.allRostros());
      this.rostros = res?.status === 'success' ? (res.data ?? []) : [];
      this.rehacerMatcher();
    } catch (e) {
      console.error('Error al cargar las plantillas faciales:', e);
    } finally {
      this.cargandoDatos = false;
    }
  }

  async cargarMarcacionesHoy(): Promise<void> {
    try {
      const hoy = this.hoyIso();
      const res: any = await firstValueFrom(this._marcacionService.allMarcaciones(1, 50, '', { desde: hoy, hasta: hoy }));
      this.marcacionesHoy = res.body?.status === 'success' ? (res.body.data?.data ?? []) : [];
    } catch (e) {
      console.error('Error al cargar las marcaciones de hoy:', e);
    }
  }

  private hoyIso(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private rehacerMatcher(): void {
    const etiquetados = this.rostros
      .filter(r => r.muestras?.length)
      .map(r => new faceapi.LabeledFaceDescriptors(String(r.empleado_id), r.muestras.map(m => new Float32Array(m.descriptor))));
    this.matcher = etiquetados.length ? new faceapi.FaceMatcher(etiquetados, this.umbral) : null;
  }

  get totalMuestras(): number {
    return this.rostros.reduce((s, r) => s + (r.num_muestras ?? 0), 0);
  }

  nombreDe(empleadoId: number): string {
    return this.rostros.find(r => r.empleado_id === empleadoId)?.empleado ?? 'Empleado';
  }

  // ================================================================
  // CÁMARA
  // ================================================================

  private async listarCamaras(): Promise<void> {
    try {
      const d = await navigator.mediaDevices.enumerateDevices();
      this.camaras = d.filter(x => x.kind === 'videoinput');
      if (!this.camaraId && this.camaras.length) { this.camaraId = this.camaras[0].deviceId; }
    } catch { /* sin permiso aún */ }
  }

  async encenderCamara(): Promise<void> {
    if (this.camaraEncendida) { return; }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: this.camaraId ? { deviceId: { exact: this.camaraId }, width: { ideal: 640 }, height: { ideal: 480 } }
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
      this.zone.runOutsideAngular(() => this.procesar());
    } catch (e: any) {
      console.error('Error al abrir la cámara:', e);
      const n = e?.name ?? '';
      this.mensajeError = n === 'NotAllowedError' ? 'Permiso de cámara denegado. Permítelo en el navegador.'
        : n === 'NotFoundError' ? 'No se encontró ninguna cámara.'
        : n === 'NotReadableError' ? 'La cámara está siendo usada por otra aplicación.'
        : (e?.message ?? 'No se pudo abrir la cámara');
      this._toastr.error(this.mensajeError, 'Cámara');
    }
  }

  apagarCamara(): void {
    this.parar = true;
    cancelAnimationFrame(this.bucle);
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
    this.camaraEncendida = false;
    this.enPantalla = [];
    const canvas = this.canvasRef?.nativeElement;
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
  }

  alternarCamara(): void { this.camaraEncendida ? this.apagarCamara() : this.encenderCamara(); }

  async cambiarCamara(): Promise<void> {
    this.guardarAjustes();
    this.apagarCamara();
    await this.encenderCamara();
  }

  // ================================================================
  // BUCLE DE RECONOCIMIENTO (fuera de la zona de Angular)
  // ================================================================

  private async procesar(): Promise<void> {
    if (this.parar) { return; }
    const video = this.videoRef.nativeElement;
    const canvas = this.canvasRef.nativeElement;

    if (video.readyState === 4) {
      const t0 = performance.now();
      const opciones = new faceapi.TinyFaceDetectorOptions({ inputSize: 288, scoreThreshold: 0.5 });
      // El descriptor es lo caro: cada RECONOCER_CADA ms (o siempre que se capture)
      const conDescriptores = this.capturando || (!!this.matcher && performance.now() - this.ultimoReconocimiento > this.RECONOCER_CADA);

      try {
        const base = faceapi.detectAllFaces(video, opciones).withFaceLandmarks();
        const detecciones: any[] = conDescriptores ? await base.withFaceDescriptors() : await base;
        if (conDescriptores) { this.ultimoReconocimiento = performance.now(); }

        const ajustadas = faceapi.resizeResults(detecciones, { width: canvas.width, height: canvas.height });
        const vistos: RostroEnPantalla[] = [];

        for (const d of ajustadas) {
          const caja = d.detection.box;
          const ear = this.aperturaOjos(d.landmarks);
          let nombre = 'No registrado';
          let similitud = 0;
          let conocido = false;
          let empleadoId = 0;

          if (d.descriptor && this.matcher) {
            const mejor = this.matcher.findBestMatch(d.descriptor);
            if (mejor.label !== 'unknown') {
              empleadoId = Number(mejor.label);
              nombre = this.nombreDe(empleadoId);
              similitud = Math.max(0, 1 - mejor.distance);
              conocido = true;
            }
            this.recordar(caja, empleadoId, nombre, similitud);
          } else if (!d.descriptor) {
            const previo = this.recordado(caja);
            if (previo) { empleadoId = previo.empleadoId; nombre = previo.nombre; similitud = previo.similitud; conocido = !!empleadoId; }
          }

          vistos.push({ caja: { x: caja.x, y: caja.y, w: caja.width, h: caja.height }, nombre, similitud, conocido });

          if (this.capturando && ajustadas.length === 1 && d.descriptor) { this.capturarMuestra(d.descriptor); }
          if (!this.capturando && conocido) {
            this.seguirParpadeo(empleadoId, ear);
            this.confirmar(empleadoId, similitud, video);
          }
        }

        if (!ajustadas.length) { this.candidato = null; }
        this.pintar(canvas, vistos);
        this.zone.run(() => {
          this.enPantalla = vistos;
          this.fps = Math.round(1000 / Math.max(1, performance.now() - t0));
        });
      } catch (e) {
        console.error('Error en la detección:', e);
      }
      await new Promise(r => setTimeout(r, Math.max(0, 110 - (performance.now() - t0))));
    }
    this.bucle = requestAnimationFrame(() => this.procesar());
  }

  private pintar(canvas: HTMLCanvasElement, rostros: RostroEnPantalla[]): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) { return; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const r of rostros) {
      const color = this.capturando ? '#f59c1a' : (r.conocido ? '#00acac' : '#dc3545');
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.strokeRect(r.caja.x, r.caja.y, r.caja.w, r.caja.h);

      const etiqueta = this.capturando ? `Capturando ${this.capturasHechas}/${this.CAPTURAS_NECESARIAS}`
        : (r.conocido ? `${r.nombre} · ${Math.round(r.similitud * 100)}%` : 'No registrado');
      ctx.font = 'bold 16px system-ui, sans-serif';
      ctx.fillStyle = color;
      ctx.fillRect(r.caja.x, Math.max(0, r.caja.y - 26), ctx.measureText(etiqueta).width + 14, 26);
      ctx.fillStyle = '#fff';
      ctx.fillText(etiqueta, r.caja.x + 7, Math.max(18, r.caja.y - 8));
    }
  }

  /** Apertura de los ojos (EAR): por debajo de 0,22 están cerrados. */
  private aperturaOjos(landmarks: any): number {
    const medir = (p: any[]) => {
      const d = (a: any, b: any) => Math.hypot(a.x - b.x, a.y - b.y);
      return (d(p[1], p[5]) + d(p[2], p[4])) / (2 * d(p[0], p[3]));
    };
    try { return (medir(landmarks.getLeftEye()) + medir(landmarks.getRightEye())) / 2; } catch { return 1; }
  }

  private seguirParpadeo(id: number, ear: number): void {
    if (ear < 0.22) { this.ojosCerrados.set(id, true); }
    else if (this.ojosCerrados.get(id)) { this.ojosCerrados.set(id, false); this.parpadeo.set(id, true); }
  }

  private recordar(caja: any, empleadoId: number, nombre: string, similitud: number): void {
    const x = caja.x + caja.width / 2, y = caja.y + caja.height / 2;
    this.cache = this.cache.filter(c => Math.hypot(c.x - x, c.y - y) > 80 && performance.now() - c.t < 2000);
    if (empleadoId) { this.cache.push({ x, y, empleadoId, nombre, similitud, t: performance.now() }); }
  }

  private recordado(caja: any): { empleadoId: number; nombre: string; similitud: number } | null {
    const x = caja.x + caja.width / 2, y = caja.y + caja.height / 2;
    const c = this.cache.find(c => Math.hypot(c.x - x, c.y - y) < 80 && performance.now() - c.t < 2000);
    return c ? { empleadoId: c.empleadoId, nombre: c.nombre, similitud: c.similitud } : null;
  }

  // ================================================================
  // MARCACIÓN
  // ================================================================

  private confirmar(empleadoId: number, similitud: number, video: HTMLVideoElement): void {
    if (this.enviando) { return; }
    if (this.candidato?.id === empleadoId) { this.candidato.veces++; }
    else { this.candidato = { id: empleadoId, veces: 1 }; }
    if (this.candidato.veces < this.confirmaciones) { return; }

    const ahora = Date.now();
    if (ahora - (this.ultimaMarcacion.get(empleadoId) ?? 0) < this.esperaSegundos * 1000) { return; }

    if (this.exigirParpadeo && !this.parpadeo.get(empleadoId)) {
      this.zone.run(() => this.aviso = { nombre: this.nombreDe(empleadoId), texto: 'Parpadea para confirmar', hora: '', tono: 'info' });
      return;
    }

    this.candidato = null;
    this.parpadeo.set(empleadoId, false);
    this.ultimaMarcacion.set(empleadoId, ahora);
    const foto = this.guardarFoto ? this.miniatura(video) : null;
    this.zone.run(() => this.enviarMarcacion(empleadoId, similitud, foto));
  }

  private async enviarMarcacion(empleadoId: number, similitud: number, foto: string | null): Promise<void> {
    this.enviando = true;
    try {
      const res: any = await firstValueFrom(this._marcacionService.registrar({
        empleado_id: empleadoId,
        similitud: Math.round(similitud * 1000) / 10,     // 0..100 con un decimal
        dispositivo: this.dispositivo || 'Kiosco',
        foto_base64: foto,
        espera_segundos: this.esperaSegundos,
      }));
      if (res?.status !== 'success') { return; }

      const m: MarcacionModel = res.data;
      this.marcacionesHoy = [m, ...this.marcacionesHoy];
      this.aviso = {
        nombre: m.empleado,
        texto: m.tipo === 'ENTRADA' ? 'Entrada registrada' : 'Salida registrada',
        hora: m.hora,
        tono: 'ok',
      };
      this._toastr.success(`${m.empleado}: ${m.tipo.toLowerCase()} a las ${m.hora}`, 'Marcación', { timeOut: 4000 });
      setTimeout(() => { if (this.aviso?.tono === 'ok') { this.aviso = null; } }, 6000);
    } catch (e: any) {
      // 429 = ya marcó hace poco (el back manda el mensaje); el interceptor ya avisa
      const msg = e?.error?.message ?? 'No se pudo registrar la marcación';
      this.aviso = { nombre: this.nombreDe(empleadoId), texto: msg, hora: '', tono: 'error' };
      setTimeout(() => { if (this.aviso?.tono === 'error') { this.aviso = null; } }, 5000);
    } finally {
      this.enviando = false;
    }
  }

  private miniatura(video: HTMLVideoElement): string | null {
    try {
      const c = document.createElement('canvas');
      c.width = 240; c.height = 180;
      c.getContext('2d')!.drawImage(video, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.6);
    } catch { return null; }
  }

  // ================================================================
  // REGISTRO DE PLANTILLAS
  // ================================================================

  async cargarEmpleados(): Promise<void> {
    if (this.empleados.length) { return; }
    try {
      const res: any = await firstValueFrom(this._empleadoService.listEmpleados(true));
      this.empleados = res?.status === 'success' ? (res.data ?? []) : [];
    } catch (e) {
      console.error('Error al cargar empleados:', e);
    }
  }

  /**
   * Texto de cada opción del selector. La lista simple (fn_empleados_listar)
   * trae `nombre`; la paginada, `nombre_completo`: se aceptan las dos.
   */
  nombreEmpleado(e: any): string {
    const nombre = e?.nombre || e?.nombre_completo || `${e?.nombres ?? ''} ${e?.apellidos ?? ''}`.trim();
    const cargo = e?.cargo_nombre || e?.cargo;
    return (nombre || `Empleado ${e?.id}`) + (cargo ? ` — ${cargo}` : '');
  }

  iniciarCaptura(): void {
    if (!this.empleadoSeleccionado) { this._toastr.warning('Elige el empleado', 'Registrar rostro'); return; }
    if (!this.camaraEncendida) { this._toastr.warning('Enciende la cámara primero', 'Registrar rostro'); return; }
    this.capturasBuffer = [];
    this.capturasHechas = 0;
    this.capturando = true;
    this._toastr.info(`Que mire a la cámara y mueva un poco la cabeza: ${this.CAPTURAS_NECESARIAS} muestras`, 'Registrar rostro', { timeOut: 4000 });
  }

  cancelarCaptura(): void {
    this.capturando = false;
    this.capturasBuffer = [];
    this.capturasHechas = 0;
  }

  private capturarMuestra(descriptor: Float32Array): void {
    const ahora = Date.now();
    if (ahora - this.ultimaCapturaT < 500) { return; }
    this.ultimaCapturaT = ahora;

    this.capturasBuffer.push(Array.from(descriptor));
    this.zone.run(() => this.capturasHechas = this.capturasBuffer.length);

    if (this.capturasBuffer.length >= this.CAPTURAS_NECESARIAS) {
      const muestras = [...this.capturasBuffer];
      this.capturando = false;
      this.zone.run(() => this.guardarMuestras(muestras, 'CAMARA'));
    }
  }

  private async guardarMuestras(muestras: number[][], origen: 'CAMARA' | 'FOTO'): Promise<void> {
    if (!this.empleadoSeleccionado) { return; }
    this.registrando = true;
    try {
      const res: any = await firstValueFrom(this._marcacionService.addRostro(this.empleadoSeleccionado, muestras, origen));
      if (res?.status === 'success') {
        this._toastr.success(res.message, 'Registrar rostro', { closeButton: true });
        await this.cargarRostros();
        this.empleadoSeleccionado = null;
      }
    } catch (e) {
      console.error('Error al guardar las muestras:', e);   // el interceptor ya avisó
    } finally {
      this.registrando = false;
      this.cancelarCaptura();
    }
  }

  /** Calcula el descriptor a partir de la foto del empleado en RRHH. */
  async registrarDesdeFoto(): Promise<void> {
    if (!this.empleadoSeleccionado) { this._toastr.warning('Elige el empleado', 'Registrar rostro'); return; }
    this.importando = true;
    try {
      const url = this._empleadoService.getEmpleadoImage(this.empleadoSeleccionado, true);
      const r = await fetch(url, { mode: 'cors' });
      const img = new Image();
      img.src = URL.createObjectURL(await r.blob());
      await img.decode();

      const d = await faceapi.detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 416 }))
        .withFaceLandmarks().withFaceDescriptor();
      URL.revokeObjectURL(img.src);
      if (!d) { this._toastr.warning('No se reconoció ningún rostro en la foto del empleado', 'Registrar rostro'); return; }

      await this.guardarMuestras([Array.from(d.descriptor)], 'FOTO');
    } catch (e) {
      console.error('Error al procesar la foto del empleado:', e);
      this._toastr.error('No se pudo procesar la foto del empleado', 'Registrar rostro');
    } finally {
      this.importando = false;
    }
  }

  async quitarPlantillas(r: RostroEmpleado): Promise<void> {
    try {
      const res: any = await firstValueFrom(this._marcacionService.deleteRostrosEmpleado(r.empleado_id));
      if (res?.status === 'success') {
        this._toastr.info(`${r.empleado}: plantillas eliminadas`, 'Rostros');
        await this.cargarRostros();
      }
    } catch (e) {
      console.error('Error al eliminar las plantillas:', e);
    }
  }

  /** Marcación a mano desde el kiosco (si la cámara no reconoce a alguien). */
  async marcarAMano(r: RostroEmpleado): Promise<void> {
    this.ultimaMarcacion.set(r.empleado_id, Date.now());
    await this.enviarMarcacion(r.empleado_id, 1, null);
  }

  // ================================================================
  // AYUDAS PARA LA PLANTILLA
  // ================================================================

  get resumenHoy(): { personas: number; entradas: number; salidas: number } {
    return {
      personas: new Set(this.marcacionesHoy.map(m => m.empleado_id)).size,
      entradas: this.marcacionesHoy.filter(m => m.tipo === 'ENTRADA').length,
      salidas: this.marcacionesHoy.filter(m => m.tipo === 'SALIDA').length,
    };
  }

  get textoEstado(): string {
    if (this.estado === 'cargando') { return 'Cargando el reconocimiento facial…'; }
    if (this.estado === 'error') { return this.mensajeError; }
    if (!this.camaraEncendida) { return 'Cámara apagada'; }
    if (this.capturando) { return `Capturando muestras (${this.capturasHechas}/${this.CAPTURAS_NECESARIAS})`; }
    if (!this.matcher) { return 'Sin plantillas faciales: registra a alguien para empezar'; }
    if (!this.enPantalla.length) { return 'Esperando a alguien…'; }
    const conocidos = this.enPantalla.filter(r => r.conocido).length;
    return conocidos ? `${conocidos} persona(s) reconocida(s)` : 'Rostro no registrado';
  }

  fotoMarcacion(m: MarcacionModel): string {
    return this._marcacionService.getImagenMarcacion(m.id);
  }

  fotoEmpleado(empleadoId: number): string {
    return this._empleadoService.getEmpleadoImage(empleadoId, false);
  }

  async recargar(): Promise<void> {
    await Promise.all([this.cargarRostros(), this.cargarMarcacionesHoy()]);
    this._toastr.info('Plantillas y marcaciones actualizadas', 'Kiosco', { timeOut: 2000 });
  }
}
