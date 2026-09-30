import { AfterViewInit, Component, ElementRef, NgZone, OnDestroy, ViewChild } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Camera } from '@capacitor/camera';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';
import * as faceapi from 'face-api.js';

import { EmpleadoService } from '../../../rh/services/empleado.service';

/** Rostro registrado (plantilla facial de una persona). */
interface RostroRegistrado {
  id: string;
  nombre: string;
  /** Id del empleado de RH, si se registró desde la lista */
  empleadoId: number | null;
  /** Descriptores de 128 números: una muestra por captura */
  muestras: number[][];
  /** Miniatura para la lista (data URL) */
  foto: string | null;
  creado: string;
}

/** Una marcación registrada. */
interface Marcacion {
  id: string;
  personaId: string;
  nombre: string;
  empleadoId: number | null;
  tipo: 'ENTRADA' | 'SALIDA';
  fecha: string;           // ISO
  /** 0..1, cuánto se parece al rostro registrado */
  similitud: number;
  foto: string | null;     // miniatura del momento
}

/** Lo que se ve en pantalla de cada rostro detectado en el fotograma actual. */
interface RostroEnPantalla {
  caja: { x: number; y: number; w: number; h: number };
  nombre: string;
  similitud: number;
  conocido: boolean;
  /** Ojos abiertos (para la prueba de vida) */
  ear: number;
}

const CLAVE_ROSTROS = 'miCRM3.marcaciones.rostros';
const CLAVE_MARCACIONES = 'miCRM3.marcaciones.registros';

/**
 * Marcación de empleados por reconocimiento facial (demo).
 *
 * Cámara en vivo con face-api.js (modelos locales en /assets/models):
 * detecta el rostro, lo compara con los rostros registrados y, cuando la
 * coincidencia se mantiene varios fotogramas, registra la marcación
 * (entrada / salida se alternan según la última del día). Incluye prueba de
 * vida por parpadeo para que no valga una foto, tiempo de espera entre
 * marcaciones de la misma persona y registro de rostros desde la lista de
 * empleados de RH (usando su foto) o capturando varias muestras con la cámara.
 *
 * Al ser una demo, rostros y marcaciones se guardan en el navegador
 * (localStorage) y se pueden exportar a CSV; en producción irían al back.
 */
@Component({
  selector: 'app-detecta-rostro',
  templateUrl: './detecta-rostro.component.html',
  styleUrls: ['./detecta-rostro.component.css'],
  standalone: false,
})
export class DetectaRostroComponent implements AfterViewInit, OnDestroy {

  @ViewChild('video', { static: true }) videoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  // ---------- Estado general ----------
  estado: 'cargando' | 'listo' | 'error' = 'cargando';
  mensajeError = '';
  camaraEncendida = false;
  /** 'marcacion' registra entradas/salidas; 'deteccion' sólo dibuja los rostros */
  modo: 'marcacion' | 'deteccion' = 'marcacion';
  espejo = true;
  fps = 0;

  // ---------- Cámaras ----------
  camaras: MediaDeviceInfo[] = [];
  camaraId = '';

  // ---------- Ajustes ----------
  /** Distancia máxima para dar por buena la coincidencia (menor = más estricto) */
  umbral = 0.5;
  /** Fotogramas seguidos con la misma persona antes de marcar */
  confirmaciones = 6;
  /** Segundos que deben pasar para volver a marcar a la misma persona */
  esperaSegundos = 60;
  /** Exigir parpadeo antes de aceptar la marcación */
  exigirParpadeo = true;

  // ---------- Datos ----------
  rostros: RostroRegistrado[] = [];
  marcaciones: Marcacion[] = [];
  enPantalla: RostroEnPantalla[] = [];

  // ---------- Registro de rostros ----------
  empleados: any[] = [];
  empleadoSeleccionado: number | null = null;
  nombreManual = '';
  capturando = false;
  capturasHechas = 0;
  readonly CAPTURAS_NECESARIAS = 5;
  cargandoEmpleados = false;
  importando = false;

  /** Última persona reconocida, para el cartel grande */
  ultimoAviso: { nombre: string; tipo: string; hora: string; ok: boolean } | null = null;

  // ---------- Interno ----------
  private stream: MediaStream | null = null;
  private matcher: any = null;
  private bucle = 0;
  private parar = false;
  private candidato: { id: string; veces: number } | null = null;
  private parpadeos = new Map<string, boolean>();   // personaId → ya parpadeó
  private ojosCerrados = new Map<string, boolean>();
  private ultimaMarcacionPor = new Map<string, number>();
  private capturasBuffer: number[][] = [];
  private ultimoFrameT = 0;
  /** Identificaciones recientes, para no calcular el descriptor en cada fotograma. */
  private cache: { x: number; y: number; personaId: string; nombre: string; similitud: number; t: number }[] = [];
  private ultimoReconocimiento = 0;

  constructor(
    private zone: NgZone,
    private _toastr: ToastrService,
    private _empleadoService: EmpleadoService,
  ) {}

  async ngAfterViewInit(): Promise<void> {
    this.cargarLocal();
    try {
      await this.cargarModelos();
      await this.listarCamaras();
      this.estado = 'listo';
      this.rehacerMatcher();
      await this.encenderCamara();
    } catch (e: any) {
      console.error('Error al iniciar el reconocimiento facial:', e);
      this.estado = 'error';
      this.mensajeError = e?.message ?? 'No se pudieron cargar los modelos';
    }
  }

  ngOnDestroy(): void {
    this.apagarCamara();
  }

  // ================================================================
  // MODELOS Y CÁMARA
  // ================================================================

  private async cargarModelos(): Promise<void> {
    const URL = '/assets/models';
    await faceapi.nets.tinyFaceDetector.loadFromUri(URL);
    await faceapi.nets.faceLandmark68Net.loadFromUri(URL);
    await faceapi.nets.faceRecognitionNet.loadFromUri(URL);
  }

  private async listarCamaras(): Promise<void> {
    try {
      const dispositivos = await navigator.mediaDevices.enumerateDevices();
      this.camaras = dispositivos.filter(d => d.kind === 'videoinput');
      if (!this.camaraId && this.camaras.length) { this.camaraId = this.camaras[0].deviceId; }
    } catch { /* sin permiso todavía: se vuelve a listar tras encender */ }
  }

  async encenderCamara(): Promise<void> {
    if (this.camaraEncendida) { return; }
    try {
      if (Capacitor.isNativePlatform()) {
        const permiso = await Camera.requestPermissions({ permissions: ['camera'] });
        if (permiso.camera !== 'granted') { throw new Error('Permiso de cámara denegado'); }
      }
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: this.camaraId ? { deviceId: { exact: this.camaraId }, width: { ideal: 640 }, height: { ideal: 480 } }
                             : { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      const video = this.videoRef.nativeElement;
      video.srcObject = this.stream;
      await video.play();
      await this.listarCamaras();          // ya con permiso salen los nombres

      const canvas = this.canvasRef.nativeElement;
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;

      this.camaraEncendida = true;
      this.parar = false;
      this.zone.runOutsideAngular(() => this.procesar());
    } catch (e: any) {
      console.error('Error al acceder a la cámara:', e);
      const nombre = e?.name ?? '';
      this.mensajeError = nombre === 'NotAllowedError' ? 'Permiso de cámara denegado. Permítelo en el navegador.'
        : nombre === 'NotFoundError' ? 'No se encontró ninguna cámara.'
        : nombre === 'NotReadableError' ? 'La cámara está siendo usada por otra aplicación.'
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

  async cambiarCamara(): Promise<void> {
    this.apagarCamara();
    await this.encenderCamara();
  }

  alternarCamara(): void {
    this.camaraEncendida ? this.apagarCamara() : this.encenderCamara();
  }

  // ================================================================
  // BUCLE DE DETECCIÓN (fuera de la zona de Angular)
  // ================================================================

  private async procesar(): Promise<void> {
    if (this.parar) { return; }
    const video = this.videoRef.nativeElement;
    const canvas = this.canvasRef.nativeElement;

    if (video.readyState === 4) {
      const t0 = performance.now();
      const opciones = new faceapi.TinyFaceDetectorOptions({ inputSize: 288, scoreThreshold: 0.5 });

      // El descriptor (lo que identifica a la persona) es lo caro: se calcula
      // cada RECONOCER_CADA ms, o siempre que se estén capturando muestras.
      // Entre medias se reutiliza la identificación anterior por cercanía.
      const hacenFaltaDescriptores = this.capturando
        || (this.modo === 'marcacion' && !!this.matcher && performance.now() - this.ultimoReconocimiento > this.RECONOCER_CADA);

      try {
        const base = faceapi.detectAllFaces(video, opciones).withFaceLandmarks();
        const detecciones: any[] = hacenFaltaDescriptores ? await base.withFaceDescriptors() : await base;
        if (hacenFaltaDescriptores) { this.ultimoReconocimiento = performance.now(); }

        const tamano = { width: canvas.width, height: canvas.height };
        const ajustadas = faceapi.resizeResults(detecciones, tamano);
        const vistos: RostroEnPantalla[] = [];

        for (const d of ajustadas) {
          const caja = d.detection.box;
          const ear = this.aperturaOjos(d.landmarks);
          let nombre = 'Desconocido';
          let similitud = 0;
          let conocido = false;
          let personaId = '';

          if (d.descriptor && this.matcher) {
            const mejor = this.matcher.findBestMatch(d.descriptor);
            if (mejor.label !== 'unknown') {
              personaId = mejor.label;
              const persona = this.rostros.find(r => r.id === personaId);
              nombre = persona?.nombre ?? 'Registrado';
              similitud = Math.max(0, 1 - mejor.distance);
              conocido = true;
            }
            this.recordar(caja, personaId, nombre, similitud);
          } else if (!d.descriptor) {
            // Fotograma sin descriptor: se hereda lo identificado hace poco en esa zona
            const previo = this.recordado(caja);
            if (previo) { personaId = previo.personaId; nombre = previo.nombre; similitud = previo.similitud; conocido = !!personaId; }
          }

          vistos.push({ caja: { x: caja.x, y: caja.y, w: caja.width, h: caja.height }, nombre, similitud, conocido, ear });

          // Captura de muestras para registrar un rostro
          if (this.capturando && ajustadas.length === 1 && d.descriptor) { this.capturarMuestra(d.descriptor, video); }

          // Marcación
          if (this.modo === 'marcacion' && conocido && !this.capturando) {
            this.seguirParpadeo(personaId, ear);
            this.confirmar(personaId, similitud, video);
          }
        }

        if (!ajustadas.length) { this.candidato = null; }

        this.pintar(canvas, vistos);
        const fps = 1000 / Math.max(1, performance.now() - this.ultimoFrameT);
        this.ultimoFrameT = performance.now();
        // Sólo se entra en Angular si hay algo que refrescar en pantalla
        this.zone.run(() => {
          this.enPantalla = vistos;
          this.fps = Math.round(fps);
        });
      } catch (e) {
        console.error('Error en la detección:', e);
      }
      // Ritmo suave: ~8 fotogramas por segundo son de sobra para marcar
      const tardanza = performance.now() - t0;
      await new Promise(r => setTimeout(r, Math.max(0, 120 - tardanza)));
    }

    this.bucle = requestAnimationFrame(() => this.procesar());
  }

  /** Caja + etiqueta de cada rostro (dibujo propio: colores del estado). */
  private pintar(canvas: HTMLCanvasElement, rostros: RostroEnPantalla[]): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) { return; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const r of rostros) {
      const color = this.capturando ? '#f59c1a' : (r.conocido ? '#00acac' : '#dc3545');
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.strokeRect(r.caja.x, r.caja.y, r.caja.w, r.caja.h);

      const etiqueta = this.capturando
        ? `Capturando ${this.capturasHechas}/${this.CAPTURAS_NECESARIAS}`
        : (r.conocido ? `${r.nombre} · ${Math.round(r.similitud * 100)}%` : 'Desconocido');
      ctx.font = 'bold 16px system-ui, sans-serif';
      const ancho = ctx.measureText(etiqueta).width + 14;
      ctx.fillStyle = color;
      ctx.fillRect(r.caja.x, Math.max(0, r.caja.y - 26), ancho, 26);
      ctx.fillStyle = '#fff';
      ctx.fillText(etiqueta, r.caja.x + 7, Math.max(18, r.caja.y - 8));
    }
  }

  /** Cuánto se espera entre cálculos de descriptor (ms). */
  private readonly RECONOCER_CADA = 400;

  /** Guarda a quién se identificó en esa zona de la imagen. */
  private recordar(caja: any, personaId: string, nombre: string, similitud: number): void {
    const x = caja.x + caja.width / 2, y = caja.y + caja.height / 2;
    this.cache = this.cache.filter(c => Math.hypot(c.x - x, c.y - y) > 80 && performance.now() - c.t < 2000);
    if (personaId) { this.cache.push({ x, y, personaId, nombre, similitud, t: performance.now() }); }
  }

  /** Lo identificado hace menos de 2 s a menos de 80 px de esta caja. */
  private recordado(caja: any): { personaId: string; nombre: string; similitud: number } | null {
    const x = caja.x + caja.width / 2, y = caja.y + caja.height / 2;
    const c = this.cache.find(c => Math.hypot(c.x - x, c.y - y) < 80 && performance.now() - c.t < 2000);
    return c ? { personaId: c.personaId, nombre: c.nombre, similitud: c.similitud } : null;
  }

  /**
   * Apertura de los ojos (EAR): alto entre ancho del ojo. Por debajo de ~0,22
   * el ojo está cerrado; así se detecta el parpadeo (prueba de vida).
   */
  private aperturaOjos(landmarks: any): number {
    const medir = (p: any[]) => {
      const d = (a: any, b: any) => Math.hypot(a.x - b.x, a.y - b.y);
      return (d(p[1], p[5]) + d(p[2], p[4])) / (2 * d(p[0], p[3]));
    };
    try {
      return (medir(landmarks.getLeftEye()) + medir(landmarks.getRightEye())) / 2;
    } catch {
      return 1;
    }
  }

  private seguirParpadeo(personaId: string, ear: number): void {
    if (ear < 0.22) { this.ojosCerrados.set(personaId, true); }
    else if (this.ojosCerrados.get(personaId)) {
      this.ojosCerrados.set(personaId, false);
      this.parpadeos.set(personaId, true);       // cerró y abrió: está vivo
    }
  }

  // ================================================================
  // MARCACIÓN
  // ================================================================

  /** Exige varios fotogramas seguidos con la misma persona antes de marcar. */
  private confirmar(personaId: string, similitud: number, video: HTMLVideoElement): void {
    if (this.candidato?.id === personaId) { this.candidato.veces++; }
    else { this.candidato = { id: personaId, veces: 1 }; }

    if (this.candidato.veces < this.confirmaciones) { return; }

    const ahora = Date.now();
    const ultima = this.ultimaMarcacionPor.get(personaId) ?? 0;
    if (ahora - ultima < this.esperaSegundos * 1000) { return; }

    if (this.exigirParpadeo && !this.parpadeos.get(personaId)) {
      this.zone.run(() => {
        this.ultimoAviso = { nombre: this.nombreDe(personaId), tipo: 'Parpadea para confirmar', hora: '', ok: false };
      });
      return;
    }

    this.candidato = null;
    this.parpadeos.set(personaId, false);
    this.ultimaMarcacionPor.set(personaId, ahora);
    const foto = this.miniatura(video);
    this.zone.run(() => this.registrarMarcacion(personaId, similitud, foto));
  }

  private nombreDe(personaId: string): string {
    return this.rostros.find(r => r.id === personaId)?.nombre ?? 'Registrado';
  }

  private registrarMarcacion(personaId: string, similitud: number, foto: string | null): void {
    const persona = this.rostros.find(r => r.id === personaId);
    if (!persona) { return; }

    // Entrada / salida se alternan según la última marcación de hoy
    const hoy = new Date().toDateString();
    const ultimaHoy = this.marcaciones.find(m => m.personaId === personaId && new Date(m.fecha).toDateString() === hoy);
    const tipo: 'ENTRADA' | 'SALIDA' = ultimaHoy?.tipo === 'ENTRADA' ? 'SALIDA' : 'ENTRADA';

    const m: Marcacion = {
      id: `${Date.now()}-${personaId}`,
      personaId,
      nombre: persona.nombre,
      empleadoId: persona.empleadoId,
      tipo,
      fecha: new Date().toISOString(),
      similitud,
      foto,
    };
    this.marcaciones = [m, ...this.marcaciones].slice(0, 500);
    this.guardarLocal();

    this.ultimoAviso = {
      nombre: persona.nombre,
      tipo: tipo === 'ENTRADA' ? 'Entrada registrada' : 'Salida registrada',
      hora: new Date(m.fecha).toLocaleTimeString(),
      ok: true,
    };
    this._toastr.success(`${persona.nombre}: ${tipo.toLowerCase()} a las ${new Date(m.fecha).toLocaleTimeString()}`, 'Marcación', { timeOut: 4000 });
    setTimeout(() => { if (this.ultimoAviso?.ok) { this.ultimoAviso = null; } }, 6000);
  }

  /** Marcación a mano (por si la cámara no reconoce a alguien). */
  marcarAMano(r: RostroRegistrado): void {
    this.ultimaMarcacionPor.set(r.id, Date.now());
    this.registrarMarcacion(r.id, 1, r.foto);
  }

  private miniatura(video: HTMLVideoElement): string | null {
    try {
      const c = document.createElement('canvas');
      c.width = 120; c.height = 90;
      c.getContext('2d')!.drawImage(video, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.6);
    } catch { return null; }
  }

  // ================================================================
  // REGISTRO DE ROSTROS
  // ================================================================

  /** Empieza a capturar muestras del rostro que esté delante de la cámara. */
  iniciarCaptura(): void {
    const nombre = this.nombreCapturaDestino();
    if (!nombre) { this._toastr.warning('Elige un empleado o escribe un nombre', 'Registrar rostro'); return; }
    if (!this.camaraEncendida) { this._toastr.warning('Enciende la cámara primero', 'Registrar rostro'); return; }
    this.capturasBuffer = [];
    this.capturasHechas = 0;
    this.capturando = true;
    this._toastr.info(`Mira a la cámara y mueve un poco la cabeza: se tomarán ${this.CAPTURAS_NECESARIAS} muestras`, 'Registrar rostro', { timeOut: 4000 });
  }

  cancelarCaptura(): void {
    this.capturando = false;
    this.capturasBuffer = [];
    this.capturasHechas = 0;
  }

  private nombreCapturaDestino(): string {
    if (this.empleadoSeleccionado) {
      const e = this.empleados.find(x => x.id === this.empleadoSeleccionado);
      return e ? (e.nombre_completo || `${e.nombres} ${e.apellidos}`).trim() : '';
    }
    return this.nombreManual.trim();
  }

  private capturarMuestra(descriptor: Float32Array, video: HTMLVideoElement): void {
    // Una muestra cada ~0,5 s para que salgan distintas
    const ahora = Date.now();
    if ((this as any)._ultimaCaptura && ahora - (this as any)._ultimaCaptura < 500) { return; }
    (this as any)._ultimaCaptura = ahora;

    this.capturasBuffer.push(Array.from(descriptor));
    this.zone.run(() => { this.capturasHechas = this.capturasBuffer.length; });

    if (this.capturasBuffer.length >= this.CAPTURAS_NECESARIAS) {
      const foto = this.miniatura(video);
      this.zone.run(() => this.guardarRostro(foto));
    }
  }

  private guardarRostro(foto: string | null): void {
    const nombre = this.nombreCapturaDestino();
    const empleadoId = this.empleadoSeleccionado;
    const existente = this.rostros.find(r => (empleadoId && r.empleadoId === empleadoId) || (!empleadoId && r.nombre === nombre));

    if (existente) {
      existente.muestras = [...existente.muestras, ...this.capturasBuffer].slice(-10);
      existente.foto = foto ?? existente.foto;
      this._toastr.success(`Se añadieron ${this.capturasBuffer.length} muestras a ${nombre}`, 'Registrar rostro');
    } else {
      this.rostros = [...this.rostros, {
        id: `p${Date.now()}`,
        nombre,
        empleadoId: empleadoId ?? null,
        muestras: [...this.capturasBuffer],
        foto,
        creado: new Date().toISOString(),
      }];
      this._toastr.success(`${nombre} registrado con ${this.capturasBuffer.length} muestras`, 'Registrar rostro');
    }

    this.cancelarCaptura();
    this.nombreManual = '';
    this.empleadoSeleccionado = null;
    this.guardarLocal();
    this.rehacerMatcher();
  }

  quitarRostro(r: RostroRegistrado): void {
    this.rostros = this.rostros.filter(x => x.id !== r.id);
    this.guardarLocal();
    this.rehacerMatcher();
    this._toastr.info(`${r.nombre} ya no está registrado`, 'Rostros');
  }

  /** Vuelve a armar el comparador con los rostros registrados. */
  private rehacerMatcher(): void {
    const etiquetados = this.rostros
      .filter(r => r.muestras.length)
      .map(r => new faceapi.LabeledFaceDescriptors(r.id, r.muestras.map(m => new Float32Array(m))));
    this.matcher = etiquetados.length ? new faceapi.FaceMatcher(etiquetados, this.umbral) : null;
  }

  onUmbralCambia(): void { this.rehacerMatcher(); }

  // ---------- Empleados de RH ----------

  async cargarEmpleados(): Promise<void> {
    if (this.empleados.length || this.cargandoEmpleados) { return; }
    this.cargandoEmpleados = true;
    try {
      const res: any = await firstValueFrom(this._empleadoService.listEmpleados(true));
      this.empleados = res?.status === 'success' ? (res.data ?? []) : [];
    } catch (e) {
      console.error('Error al cargar empleados:', e);
    } finally {
      this.cargandoEmpleados = false;
    }
  }

  /**
   * Registra de una vez a todos los empleados que tengan foto, calculando su
   * descriptor a partir de ella. Una sola foto da menos precisión que las
   * capturas en vivo, pero sirve para arrancar.
   */
  async importarDesdeFotos(): Promise<void> {
    await this.cargarEmpleados();
    const conFoto = this.empleados.filter(e => e.foto && !this.rostros.some(r => r.empleadoId === e.id));
    if (!conFoto.length) { this._toastr.info('No hay empleados con foto pendientes de registrar', 'Rostros'); return; }

    this.importando = true;
    let ok = 0, sinRostro = 0;
    try {
      for (const e of conFoto) {
        try {
          const img = await this.cargarImagen(this._empleadoService.getEmpleadoImage(e.id, true));
          const d = await faceapi.detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 416 }))
            .withFaceLandmarks().withFaceDescriptor();
          if (!d) { sinRostro++; continue; }
          this.rostros = [...this.rostros, {
            id: `e${e.id}`,
            nombre: (e.nombre_completo || `${e.nombres} ${e.apellidos}`).trim(),
            empleadoId: e.id,
            muestras: [Array.from(d.descriptor)],
            foto: this._empleadoService.getEmpleadoImage(e.id, false),
            creado: new Date().toISOString(),
          }];
          ok++;
        } catch (err) {
          console.error('No se pudo procesar la foto del empleado', e.id, err);
          sinRostro++;
        }
      }
      this.guardarLocal();
      this.rehacerMatcher();
      this._toastr.success(`${ok} empleado(s) registrado(s) desde su foto${sinRostro ? `; ${sinRostro} sin rostro reconocible` : ''}`, 'Rostros', { timeOut: 6000 });
    } finally {
      this.importando = false;
    }
  }

  /** La foto viene del API (otro origen): se baja con fetch para poder leer sus píxeles. */
  private async cargarImagen(url: string): Promise<HTMLImageElement> {
    const r = await fetch(url, { mode: 'cors' });
    const blob = await r.blob();
    const img = new Image();
    img.src = URL.createObjectURL(blob);
    await img.decode();
    return img;
  }

  // ================================================================
  // MARCACIONES: LISTA, CSV, LIMPIEZA
  // ================================================================

  get marcacionesHoy(): Marcacion[] {
    const hoy = new Date().toDateString();
    return this.marcaciones.filter(m => new Date(m.fecha).toDateString() === hoy);
  }

  get resumenHoy(): { personas: number; entradas: number; salidas: number } {
    const hoy = this.marcacionesHoy;
    return {
      personas: new Set(hoy.map(m => m.personaId)).size,
      entradas: hoy.filter(m => m.tipo === 'ENTRADA').length,
      salidas: hoy.filter(m => m.tipo === 'SALIDA').length,
    };
  }

  exportarCsv(): void {
    if (!this.marcaciones.length) { return; }
    const filas = [['Fecha', 'Hora', 'Empleado', 'Empleado ID', 'Tipo', 'Similitud %']];
    for (const m of this.marcaciones) {
      const f = new Date(m.fecha);
      filas.push([f.toLocaleDateString(), f.toLocaleTimeString(), m.nombre, String(m.empleadoId ?? ''), m.tipo, String(Math.round(m.similitud * 100))]);
    }
    const csv = filas.map(f => f.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `marcaciones_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  limpiarMarcaciones(): void {
    this.marcaciones = [];
    this.guardarLocal();
    this._toastr.info('Marcaciones borradas', 'Marcaciones');
  }

  // ================================================================
  // PERSISTENCIA (demo: en el navegador)
  // ================================================================

  private cargarLocal(): void {
    try {
      this.rostros = JSON.parse(localStorage.getItem(CLAVE_ROSTROS) ?? '[]');
      this.marcaciones = JSON.parse(localStorage.getItem(CLAVE_MARCACIONES) ?? '[]');
    } catch { this.rostros = []; this.marcaciones = []; }
  }

  private guardarLocal(): void {
    try {
      localStorage.setItem(CLAVE_ROSTROS, JSON.stringify(this.rostros));
      localStorage.setItem(CLAVE_MARCACIONES, JSON.stringify(this.marcaciones));
    } catch (e) {
      console.error('No se pudo guardar en el navegador:', e);
    }
  }

  // ================================================================
  // AYUDAS PARA LA PLANTILLA
  // ================================================================

  get hayRostrosRegistrados(): boolean { return this.rostros.length > 0; }

  get textoEstado(): string {
    if (this.estado === 'cargando') { return 'Cargando los modelos de reconocimiento…'; }
    if (this.estado === 'error') { return this.mensajeError; }
    if (!this.camaraEncendida) { return 'Cámara apagada'; }
    if (this.capturando) { return `Capturando muestras (${this.capturasHechas}/${this.CAPTURAS_NECESARIAS})`; }
    if (!this.enPantalla.length) { return 'Buscando rostros…'; }
    const conocidos = this.enPantalla.filter(r => r.conocido).length;
    return conocidos ? `${conocidos} rostro(s) reconocido(s)` : 'Rostro no registrado';
  }

  segundosDesdeUltima(r: RostroRegistrado): number {
    const t = this.ultimaMarcacionPor.get(r.id);
    return t ? Math.round((Date.now() - t) / 1000) : -1;
  }
}
