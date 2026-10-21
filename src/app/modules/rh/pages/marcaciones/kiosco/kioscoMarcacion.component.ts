import { AfterViewInit, Component, ElementRef, NgZone, OnDestroy, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { firstValueFrom } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import * as faceapi from 'face-api.js';

import { MarcacionService } from '../../../services/marcacion.service';
import { UbicacionDispositivoService } from '../../../services/ubicacionDispositivo.service';
import { MarcacionModel, RostroEmpleado } from '../../../interfaces/marcacionModel';
import { AccesoModel } from '../../../../seguridad/interfaces/accesoModel';
import { AjustesKioscoComponent, AjustesDelKiosco } from './ajustesKiosco/ajustesKiosco.component';

/** Lo que se ve de cada rostro en el fotograma actual. */
interface RostroEnPantalla {
  caja: { x: number; y: number; w: number; h: number };
  nombre: string;
  similitud: number;
  conocido: boolean;
  /** Qué le falta para marcar: «parpadea», «confirmando 3/6», «ya marcó». */
  pista?: string;
}

/**
 * Kiosco de marcación facial.
 *
 * Reconoce al empleado con la cámara (face-api.js y las plantillas faciales
 * guardadas en rh.rostros_empleados) y registra la marcación en el servidor:
 * el tipo (entrada / salida) lo decide el back alternando con la última del
 * día, y hay una espera anti-duplicado. Incluye prueba de vida por parpadeo
 * y la lista de las marcaciones del día.
 *
 * Las plantillas faciales se REGISTRAN EN EMPLEADOS (Recursos Humanos >
 * Empleados, botón «Registrar rostro» de la columna ACCIONES); aquí sólo se
 * usan para reconocer.
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

  /** Cartel grande de la última marcación / aviso */
  aviso: { nombre: string; texto: string; hora: string; tono: 'ok' | 'info' | 'error' } | null = null;

  // ---------- Interno ----------
  private stream: MediaStream | null = null;
  private matcher: any = null;
  private bucle = 0;
  private parar = false;
  /**
   * Fotogramas seguidos viendo a cada empleado, UNO POR EMPLEADO.
   *
   * Antes era un solo candidato para todos: con dos caras delante (alguien
   * que pasa por detrás, una foto en la pared) el contador se reiniciaba en
   * cada fotograma y no llegaba a confirmar nunca. Ahora cada quien lleva la
   * suya, y al que no sale en un fotograma se le resta uno en vez de borrarle
   * la cuenta: un fallo suelto de detección ya no tira lo andado.
   */
  private vistosSeguidos = new Map<number, number>();
  private parpadeo = new Map<number, boolean>();
  private ojosCerrados = new Map<number, boolean>();
  /**
   * La apertura de ojos NORMAL de cada cara, para medir el parpadeo contra
   * ella y no contra un número fijo: el valor depende de la persona, de lo
   * lejos que esté y de la resolución.
   */
  private earAbierto = new Map<number, number>();
  /** Hasta cuándo no se vuelve a intentar marcar a ese empleado. */
  private esperarHasta = new Map<number, number>();

  /** Se dan por cerrados los ojos cuando bajan de esta parte de lo suyo. */
  private readonly CIERRE_RELATIVO = 0.80;
  /** Tras un envío fallido, lo que se espera antes de reintentar. */
  private readonly REINTENTO_SEGUNDOS = 5;
  /** Instante del fotograma anterior, para los fps de verdad. */
  private ultimoFotograma = 0;

  /** Cuánto se reaprovecha la ubicación del kiosco (está fijo: media hora). */
  private readonly UBICACION_VIGENTE_MS = 30 * 60 * 1000;
  private cache: { x: number; y: number; empleadoId: number; nombre: string; similitud: number; t: number }[] = [];
  private ultimoReconocimiento = 0;
  private readonly RECONOCER_CADA = 400;
  private enviando = false;

  constructor(
    private zone: NgZone,
    private modal: NgbModal,
    private _toastr: ToastrService,
    private _marcacionService: MarcacionService,
    private _ubicacion: UbicacionDispositivoService,
    private activeRoute: ActivatedRoute,
  ) {
    this.accesoModel = this.activeRoute.snapshot.data['access'];
    this.leerAjustes();
  }

  async ngAfterViewInit(): Promise<void> {
    this.timerReloj = setInterval(() => this.reloj = new Date(), 1000);

    // El kiosco está fijo en una puerta: una lectura del GPS vale para toda
    // la jornada. Se pide ya, sin esperarla, para que la primera marcación
    // no se retrase por el GPS.
    this._ubicacion.donde(this.UBICACION_VIGENTE_MS).then(() => { /* lo que haya */ });
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

  /**
   * El engranaje de la barra. El modal trabaja sobre una copia y sólo al
   * guardar se aplican aquí: así mover un deslizador no cambia el
   * comportamiento del kiosco mientras alguien está marcando.
   */
  abrirAjustes(): void {
    const modalRef = this.modal.open(AjustesKioscoComponent, {
      centered: true, size: 'md', backdrop: 'static',
    });
    modalRef.componentInstance.ajustes = {
      umbral: this.umbral,
      confirmaciones: this.confirmaciones,
      esperaSegundos: this.esperaSegundos,
      dispositivo: this.dispositivo,
      exigirParpadeo: this.exigirParpadeo,
      guardarFoto: this.guardarFoto,
    } as AjustesDelKiosco;

    modalRef.result.then((a: AjustesDelKiosco) => {
      if (!a) { return; }
      const cambiaElUmbral = a.umbral !== this.umbral;

      this.umbral = a.umbral;
      this.confirmaciones = a.confirmaciones;
      this.esperaSegundos = a.esperaSegundos;
      this.dispositivo = a.dispositivo;
      this.exigirParpadeo = a.exigirParpadeo;
      this.guardarFoto = a.guardarFoto;

      // El emparejador lleva el umbral dentro: hay que rehacerlo
      if (cambiaElUmbral) { this.rehacerMatcher(); }
      this.guardarAjustes();
      this._toastr.success('Ajustes guardados', 'Kiosco', { timeOut: 2500 });
    }).catch(() => { /* salió sin guardar */ });
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
      const conDescriptores = !!this.matcher && performance.now() - this.ultimoReconocimiento > this.RECONOCER_CADA;

      try {
        const base = faceapi.detectAllFaces(video, opciones).withFaceLandmarks();
        const detecciones: any[] = conDescriptores ? await base.withFaceDescriptors() : await base;
        if (conDescriptores) { this.ultimoReconocimiento = performance.now(); }

        const ajustadas = faceapi.resizeResults(detecciones, { width: canvas.width, height: canvas.height });
        const vistos: RostroEnPantalla[] = [];
        const vistosAhora = new Set<number>();

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

          const visto: RostroEnPantalla = {
            caja: { x: caja.x, y: caja.y, w: caja.width, h: caja.height }, nombre, similitud, conocido,
          };
          vistos.push(visto);

          if (conocido) {
            vistosAhora.add(empleadoId);
            this.seguirParpadeo(empleadoId, ear);
            visto.pista = this.confirmar(empleadoId, similitud, video);
          }
        }

        // Al que no se ha visto en este fotograma se le resta una confirmación
        this.enfriarNoVistos(vistosAhora);
        this.pintar(canvas, vistos);

        // Los fps DE VERDAD: de fotograma a fotograma. Antes se medía sólo lo
        // que tardaba el cálculo, sin contar el descanso, y la pantalla decía
        // 25 fps mientras el bucle iba a 9.
        const ahoraT = performance.now();
        const entreFotogramas = this.ultimoFotograma ? ahoraT - this.ultimoFotograma : 0;
        this.ultimoFotograma = ahoraT;

        this.zone.run(() => {
          this.enPantalla = vistos;
          if (entreFotogramas > 0) { this.fps = Math.round(1000 / Math.max(1, entreFotogramas)); }
        });
      } catch (e) {
        console.error('Error en la detección:', e);
      }
      // Con alguien reconocido delante se mira más seguido: un parpadeo dura
      // una décima de segundo y con un fotograma cada 110 ms se escapaba.
      const descanso = this.enPantalla.some(r => r.conocido) ? 65 : 110;
      await new Promise(r => setTimeout(r, Math.max(0, descanso - (performance.now() - t0))));
    }
    this.bucle = requestAnimationFrame(() => this.procesar());
  }

  private pintar(canvas: HTMLCanvasElement, rostros: RostroEnPantalla[]): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) { return; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const r of rostros) {
      const color = r.conocido ? '#00acac' : '#dc3545';
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.strokeRect(r.caja.x, r.caja.y, r.caja.w, r.caja.h);

      const etiqueta = r.conocido
        ? `${r.nombre} · ${Math.round(r.similitud * 100)}%` + (r.pista ? ` · ${r.pista}` : '')
        : 'No registrado';
      ctx.font = 'bold 16px system-ui, sans-serif';
      ctx.fillStyle = color;
      ctx.fillRect(r.caja.x, Math.max(0, r.caja.y - 26), ctx.measureText(etiqueta).width + 14, 26);
      ctx.fillStyle = '#fff';
      ctx.fillText(etiqueta, r.caja.x + 7, Math.max(18, r.caja.y - 8));
    }
  }

  /** Apertura de los ojos (EAR). Qué es «cerrado» lo decide seguirParpadeo. */
  private aperturaOjos(landmarks: any): number {
    const medir = (p: any[]) => {
      const d = (a: any, b: any) => Math.hypot(a.x - b.x, a.y - b.y);
      return (d(p[1], p[5]) + d(p[2], p[4])) / (2 * d(p[0], p[3]));
    };
    try { return (medir(landmarks.getLeftEye()) + medir(landmarks.getRightEye())) / 2; } catch { return 1; }
  }

  /**
   * Prueba de vida: ojos abiertos -> cerrados -> abiertos.
   *
   * El umbral NO es fijo. Antes se daban por cerrados los ojos por debajo de
   * 0,22, y eso dejaba fuera a mucha gente: con la cámara algo lejos el valor
   * normal ya ronda 0,20 —y entonces los ojos están «siempre cerrados» y el
   * parpadeo no se completa nunca—, y a quien los tiene muy abiertos un
   * parpadeo no le baja de 0,24 —y entonces no se ve—. Ahora cada cara trae
   * su propia referencia de ojos abiertos y se da por cerrado un descenso
   * claro respecto de ELLA.
   */
  private seguirParpadeo(id: number, ear: number): void {
    if (!Number.isFinite(ear) || ear <= 0) { return; }

    const referencia = this.earAbierto.get(id) ?? ear;
    const cerrado = ear < referencia * this.CIERRE_RELATIVO;

    // La referencia sólo se mueve con los ojos abiertos: si se actualizara
    // también al parpadear, se iría detrás y no habría caída que ver.
    if (!cerrado) { this.earAbierto.set(id, referencia * 0.9 + ear * 0.1); }

    if (cerrado) { this.ojosCerrados.set(id, true); }
    else if (this.ojosCerrados.get(id)) { this.ojosCerrados.set(id, false); this.parpadeo.set(id, true); }
  }

  /** Al que no sale en el fotograma se le resta una confirmación. */
  private enfriarNoVistos(vistos: Set<number>): void {
    for (const [id, veces] of this.vistosSeguidos) {
      if (vistos.has(id)) { continue; }
      if (veces <= 1) { this.vistosSeguidos.delete(id); this.earAbierto.delete(id); }
      else { this.vistosSeguidos.set(id, veces - 1); }
    }
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

  /**
   * ¿Toca marcar a este empleado? Devuelve qué le falta, para pintarlo junto
   * a su cara: así se ve POR QUÉ no marca, en vez de quedarse esperando.
   */
  private confirmar(empleadoId: number, similitud: number, video: HTMLVideoElement): string {
    const veces = (this.vistosSeguidos.get(empleadoId) ?? 0) + 1;
    this.vistosSeguidos.set(empleadoId, veces);

    if (this.enviando) { return 'registrando…'; }
    if (veces < this.confirmaciones) { return `confirmando ${veces}/${this.confirmaciones}`; }

    const ahora = Date.now();
    const hasta = this.esperarHasta.get(empleadoId) ?? 0;
    if (ahora < hasta) { return `ya marcó · espere ${Math.ceil((hasta - ahora) / 1000)} s`; }

    if (this.exigirParpadeo && !this.parpadeo.get(empleadoId)) {
      this.zone.run(() => this.aviso = { nombre: this.nombreDe(empleadoId), texto: 'Parpadea para confirmar', hora: '', tono: 'info' });
      return 'parpadea';
    }

    this.vistosSeguidos.delete(empleadoId);
    this.parpadeo.set(empleadoId, false);
    // Freno corto mientras va la petición; al responder se pone la espera que
    // toque. Antes se ponía aquí la espera entera, así que un envío fallido
    // dejaba a la persona un minuto sin poder volver a intentarlo.
    this.esperarHasta.set(empleadoId, ahora + this.REINTENTO_SEGUNDOS * 1000);

    const foto = this.guardarFoto ? this.miniatura(video) : null;
    this.zone.run(() => this.enviarMarcacion(empleadoId, similitud, foto));
    return 'registrando…';
  }

  private async enviarMarcacion(empleadoId: number, similitud: number, foto: string | null): Promise<void> {
    this.enviando = true;
    try {
      // De dónde salió la marcación. Si no hay permiso de GPS devuelve null
      // y se registra igual: perder la marcación por eso sería peor.
      const donde = await this._ubicacion.donde(this.UBICACION_VIGENTE_MS);

      const res: any = await firstValueFrom(this._marcacionService.registrar({
        empleado_id: empleadoId,
        similitud: Math.round(similitud * 1000) / 10,     // 0..100 con un decimal
        dispositivo: this.dispositivo || 'Kiosco',
        foto_base64: foto,
        espera_segundos: this.esperaSegundos,
        latitud: donde?.lat,
        longitud: donde?.lng,
        precision_m: donde?.precision ?? null,
      }));
      if (res?.status !== 'success') { return; }

      // Marcó: ahora sí, la espera entera
      this.esperarHasta.set(empleadoId, Date.now() + this.esperaSegundos * 1000);

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

      // FUERA DEL PERÍMETRO DE SU SUCURSAL. Llega como 422 y NO es un fallo
      // pasajero: mientras esa persona siga delante de la cámara, volvería a
      // fallar igual. Se la enfría como si hubiera marcado, o el kiosco
      // reintentaría cada pocos segundos contra el mismo muro.
      //
      // Se reconoce por el texto porque el sobre de la API no lleva el
      // SQLSTATE; los dos mensajes los escribe fn_marcaciones_registrar.
      const fueraDelPerimetro = e?.status === 422
        && /perímetro|permitir la ubicación/i.test(String(msg));

      if (e?.status === 429 || fueraDelPerimetro) {
        this.esperarHasta.set(empleadoId, Date.now() + this.esperaSegundos * 1000);
      }
      this.aviso = { nombre: this.nombreDe(empleadoId), texto: msg, hora: '', tono: 'error' };
      // El de la sucursal es más largo de leer, y hay que hacer algo con él
      const cuanto = fueraDelPerimetro ? 9000 : 5000;
      setTimeout(() => { if (this.aviso?.tono === 'error') { this.aviso = null; } }, cuanto);
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
    if (!this.matcher) { return 'Sin plantillas faciales: regístralas en Empleados'; }
    if (!this.enPantalla.length) { return 'Esperando a alguien…'; }
    const conocidos = this.enPantalla.filter(r => r.conocido).length;
    return conocidos ? `${conocidos} persona(s) reconocida(s)` : 'Rostro no registrado';
  }

  fotoMarcacion(m: MarcacionModel): string {
    return this._marcacionService.getImagenMarcacion(m.id);
  }

  async recargar(): Promise<void> {
    await Promise.all([this.cargarRostros(), this.cargarMarcacionesHoy()]);
    this._toastr.info('Plantillas y marcaciones actualizadas', 'Kiosco', { timeOut: 2000 });
  }
}
