import { Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { firstValueFrom } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import * as faceapi from 'face-api.js';

import { MarcacionService } from '../../../services/marcacion.service';
import { EmpleadoService } from '../../../services/empleado.service';
import { UbicacionDispositivoService, UbicacionDispositivo } from '../../../services/ubicacionDispositivo.service';
import { MarcacionModel } from '../../../interfaces/marcacionModel';
import { MisMarcacionesComponent } from './misMarcaciones/misMarcaciones.component';

/**
 * REGISTRO DE MARCACIONES — EL CELULAR DEL EMPLEADO.
 *
 * El kiosco es una computadora fija en la puerta y reconoce a cualquiera que
 * se le ponga delante. Esta pantalla es lo contrario: cada empleado la abre
 * en SU teléfono, con SU usuario, pulsa un botón y marca.
 *
 * DOS COSAS LA HACEN DISTINTA DEL KIOSCO:
 *
 *  1. A quién se marca lo dice el SERVIDOR (rh/marcacion/miEmpleado y
 *     registrarMia trabajan sobre el empleado de la sesión). Aquí no se
 *     manda un id de empleado: si se mandara, cualquiera podría marcar por
 *     un compañero cambiando un número desde su propio teléfono.
 *  2. La cámara sólo se enciende cuando se pulsa «Iniciar marcación», y se
 *     apaga en cuanto termina. Es el teléfono de una persona, no un puesto
 *     de trabajo: no puede quedarse mirando todo el día.
 *
 * La cara se compara SÓLO contra las plantillas de ese empleado, así que
 * ponerle delante la cara de otro no marca: dice que no le reconoce.
 */
@Component({
  selector: 'app-registro-marcaciones',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './registroMarcaciones.component.html',
  styleUrls: ['./registroMarcaciones.component.css'],
})
export class RegistroMarcacionesComponent implements OnInit, OnDestroy {

  @ViewChild('video') videoRef?: ElementRef<HTMLVideoElement>;

  /** En qué paso va la pantalla. */
  public paso: 'cargando' | 'listo' | 'marcando' | 'exito' | 'sin-empleado' | 'error' = 'cargando';
  public mensajeError = '';
  /** El titular del panel de error: no es lo mismo no cargar que no marcar. */
  public tituloError = 'No se registró';

  // ---------- Quién soy ----------
  public empleado: any = null;
  public marcacionesHoy: MarcacionModel[] = [];
  public muestrasRostro = 0;

  /** La marcación recién hecha (la pantalla de «listo»). */
  public hecha: MarcacionModel | null = null;

  // ---------- Lo que se le dice a la persona ----------
  public pista = '';
  public reloj = new Date();
  private timerReloj: any;

  /** Dónde está el teléfono (se pide al empezar a marcar). */
  public ubicacion: UbicacionDispositivo | null = null;
  public ubicacionMotivo = '';

  // ---------- Interno ----------
  private stream: MediaStream | null = null;
  private matcher: any = null;
  private modelosListos = false;
  private bucle: any = null;
  private parar = true;
  private enviando = false;

  /** Fotogramas seguidos reconociendo la cara. */
  private vistosSeguidos = 0;

  /** Cuántos fotogramas seguidos hacen falta para dar por buena la cara. */
  private readonly CONFIRMACIONES = 5;
  /** Exigencia al comparar (igual que el kiosco de serie). */
  private readonly UMBRAL = 0.5;
  /** Si en este tiempo no se reconoce a nadie, se avisa y se apaga. */
  private readonly LIMITE_MS = 45000;
  private empezadoEn = 0;

  constructor(
    private zone: NgZone,
    private modal: NgbModal,
    private _toastr: ToastrService,
    private _marcacionService: MarcacionService,
    private _empleadoService: EmpleadoService,
    private _ubicacion: UbicacionDispositivoService,
  ) {}

  async ngOnInit(): Promise<void> {
    this.timerReloj = setInterval(() => this.reloj = new Date(), 1000);
    await this.cargarMiFicha();
  }

  ngOnDestroy(): void {
    clearInterval(this.timerReloj);
    this.apagarCamara();
  }

  // ================================================================
  // QUIÉN SOY
  // ================================================================

  async cargarMiFicha(): Promise<void> {
    this.paso = 'cargando';
    try {
      const res: any = await firstValueFrom(this._marcacionService.miEmpleado());
      if (res?.status !== 'success') { throw new Error(res?.message || 'No se pudo cargar su ficha'); }

      this.empleado = res.data?.empleado ?? null;
      this.marcacionesHoy = res.data?.marcaciones_hoy ?? [];
      this.muestrasRostro = Number(res.data?.muestras_rostro ?? 0);
      this.paso = 'listo';

    } catch (e: any) {
      // 409 = el usuario no está enlazado a ningún empleado. El código puede
      // venir en la respuesta HTTP o dentro del cuerpo que arma la API.
      if (this.codigoDe(e) === 409) {
        this.paso = 'sin-empleado';
        this.mensajeError = e?.error?.message ?? 'Su usuario no está enlazado a ningún empleado';
        return;
      }
      this.paso = 'error';
      this.tituloError = 'No se pudo cargar';
      this.mensajeError = e?.error?.message ?? e?.message ?? 'No se pudo cargar su ficha';
    }
  }

  /** El código HTTP, venga donde venga (la API lo repite en el cuerpo). */
  private codigoDe(e: any): number | null {
    const c = e?.status ?? e?.error?.code ?? e?.code ?? null;
    return c === null ? null : Number(c);
  }

  get nombre(): string {
    const e = this.empleado;
    return e?.nombre_completo || `${e?.nombres ?? ''} ${e?.apellidos ?? ''}`.trim() || 'Empleado';
  }

  get foto(): string { return this._empleadoService.getEmpleadoImage(Number(this.empleado?.id ?? 0), false); }

  /** La última marcación del día: dice si ahora toca entrada o salida. */
  get ultima(): MarcacionModel | null { return this.marcacionesHoy[0] ?? null; }

  get proximoTipo(): 'ENTRADA' | 'SALIDA' {
    return this.ultima?.tipo === 'ENTRADA' ? 'SALIDA' : 'ENTRADA';
  }

  get puedeMarcar(): boolean {
    return this.paso === 'listo' && !!this.empleado && this.muestrasRostro > 0;
  }

  // ================================================================
  // MARCAR
  // ================================================================

  /** El botón grande. */
  async iniciar(): Promise<void> {
    if (!this.puedeMarcar) { return; }

    this.hecha = null;
    this.pista = 'Preparando la cámara…';
    this.paso = 'marcando';
    this.vistosSeguidos = 0;
    this.empezadoEn = Date.now();

    // La ubicación se pide a la vez que la cámara: cuando haga falta ya
    // estará, y si el permiso se deniega la marcación entra igual.
    this._ubicacion.olvidar();
    this._ubicacion.donde(0, 10000).then(u => this.zone.run(() => {
      this.ubicacion = u;
      this.ubicacionMotivo = u ? '' : this._ubicacion.motivo;
    }));

    try {
      if (!this.modelosListos) {
        this.pista = 'Preparando el reconocimiento…';
        const URL = '/assets/models';
        await faceapi.nets.tinyFaceDetector.loadFromUri(URL);
        await faceapi.nets.faceLandmark68Net.loadFromUri(URL);
        await faceapi.nets.faceRecognitionNet.loadFromUri(URL);
        this.modelosListos = true;
      }

      await this.armarMatcher();
      await this.encenderCamara();

      this.pista = 'Mire al frente';
      this.parar = false;
      this.zone.runOutsideAngular(() => this.mirar());

    } catch (e: any) {
      console.error('No se pudo iniciar la marcación:', e);
      this.apagarCamara();
      this.paso = 'error';
      this.tituloError = 'No se pudo empezar';
      this.mensajeError = e?.message ?? 'No se pudo encender la cámara';
    }
  }

  /** Cancelar: apaga la cámara y vuelve al principio. */
  cancelar(): void {
    this.apagarCamara();
    this.paso = 'listo';
    this.pista = '';
  }

  /** Cierra la pantalla de éxito. */
  listo(): void {
    this.hecha = null;
    this.paso = 'listo';
  }

  /**
   * El emparejador, SÓLO con las plantillas de este empleado: así la cara de
   * un compañero no marca, dice que no le reconoce.
   */
  private async armarMatcher(): Promise<void> {
    const res: any = await firstValueFrom(this._marcacionService.allRostros(Number(this.empleado.id)));
    const fila = (res?.data ?? []).find((r: any) => Number(r.empleado_id) === Number(this.empleado.id));
    const muestras = (fila?.muestras ?? []).map((m: any) => new Float32Array(m.descriptor));

    if (!muestras.length) {
      this.muestrasRostro = 0;
      throw new Error('Su rostro no está registrado todavía');
    }

    this.muestrasRostro = muestras.length;
    this.matcher = new faceapi.FaceMatcher(
      [new faceapi.LabeledFaceDescriptors(String(this.empleado.id), muestras)], this.UMBRAL);
  }

  private async encenderCamara(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      // La de delante: es el teléfono de la persona mirándose a sí misma
      video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 640 } },
      audio: false,
    });

    // El <video> aparece con el paso 'marcando': se espera a que Angular lo pinte
    for (let i = 0; i < 40 && !this.videoRef; i++) { await new Promise(r => setTimeout(r, 50)); }
    if (!this.videoRef) { throw new Error('No se pudo preparar el vídeo'); }

    const video = this.videoRef.nativeElement;
    video.srcObject = this.stream;
    await video.play();
  }

  apagarCamara(): void {
    this.parar = true;
    if (this.bucle) { clearTimeout(this.bucle); this.bucle = null; }
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
  }

  // ================================================================
  // EL BUCLE
  // ================================================================

  /**
   * Qué hacer con lo que se ve en ESTE fotograma. Devuelve lo que hay que
   * decirle a la persona y, cuando toca, lanza el registro.
   *
   * Está aparte del bucle a propósito: así se puede probar la decisión sin
   * una cámara ni una cara delante.
   *
   * NO SE EXIGE PARPADEO, al revés que en el kiosco. Allí la prueba de vida
   * evita que alguien marque poniéndole al kiosco la foto de un compañero;
   * aquí el empleado marca EN SU TELÉFONO Y CON SU USUARIO, así que el
   * engaño que quedaría —prestarle el teléfono y la clave a alguien— no lo
   * para ningún parpadeo. Lo que sí hacía era dejar a la gente mirando una
   * pantalla que contaba 1/5… 5/5 y no pasaba de ahí cuando la cámara no
   * llegaba a ver el cierre de ojos.
   */
  decidir(caras: any[]): string {
    if (this.enviando) { return 'Registrando…'; }

    if (!caras || caras.length === 0) {
      this.vistosSeguidos = 0;
      return 'Ponga su cara dentro del círculo';
    }
    if (caras.length > 1) {
      this.vistosSeguidos = 0;
      return 'Hay más de una cara: quédese solo';
    }

    const cara = caras[0];
    const mejor = this.matcher.findBestMatch(cara.descriptor);

    if (mejor.label === 'unknown') {
      this.vistosSeguidos = 0;
      return 'No le reconocemos: acérquese y busque luz';
    }

    this.vistosSeguidos++;
    if (this.vistosSeguidos < this.CONFIRMACIONES) {
      return `Reconocido… ${this.vistosSeguidos}/${this.CONFIRMACIONES}`;
    }

    // Confirmado: se registra y el bucle se para solo (registrar apaga la cámara)
    const similitud = Math.max(0, 1 - mejor.distance);
    this.zone.run(() => this.registrar(similitud));
    return 'Registrando…';
  }

  private async mirar(): Promise<void> {
    if (this.parar) { return; }
    const video = this.videoRef?.nativeElement;

    if (video && video.readyState === 4 && !this.enviando) {
      try {
        const opciones = new faceapi.TinyFaceDetectorOptions({ inputSize: 288, scoreThreshold: 0.5 });
        const caras: any[] = await faceapi.detectAllFaces(video, opciones)
          .withFaceLandmarks().withFaceDescriptors();

        const pista = this.decidir(caras);
        const seAcaboElTiempo = Date.now() - this.empezadoEn > this.LIMITE_MS;

        this.zone.run(() => {
          this.pista = pista;
          if (seAcaboElTiempo && !this.enviando) {
            this.apagarCamara();
            this.paso = 'error';
            this.tituloError = 'No le reconocimos';
            this.mensajeError = 'Inténtelo de nuevo con más luz y la cara dentro del círculo, o avise a Recursos Humanos.';
          }
        });

      } catch (e) {
        console.error('Error al mirar la cámara:', e);
      }
    }

    // setTimeout y no requestAnimationFrame: en el celular la pantalla puede
    // apagarse y rAF se queda parado sin avisar.
    this.bucle = setTimeout(() => this.mirar(), 120);
  }

  // ================================================================
  // EL ENVÍO
  // ================================================================

  private async registrar(similitud: number): Promise<void> {
    if (this.enviando) { return; }
    this.enviando = true;

    try {
      // Lo que haya llegado del GPS; si no llegó, se manda sin ubicación
      const donde = this.ubicacion ?? await this._ubicacion.donde(15000, 6000);

      const res: any = await firstValueFrom(this._marcacionService.registrarMia({
        similitud: Math.round(similitud * 1000) / 10,
        dispositivo: this.nombreDelAparato(),
        latitud: donde?.lat,
        longitud: donde?.lng,
        precision_m: donde?.precision ?? null,
      }));

      if (res?.status !== 'success') { throw new Error(res?.message || 'No se pudo registrar'); }

      this.apagarCamara();
      this.hecha = res.data;
      this.ubicacion = donde ?? this.ubicacion;
      this.marcacionesHoy = [res.data, ...this.marcacionesHoy];
      this.paso = 'exito';
      this._toastr.success(res.message, 'Marcación', { timeOut: 5000 });

    } catch (e: any) {
      this.apagarCamara();
      this.paso = 'error';
      // 429 = ya marcó hace poco; el mensaje del servidor lo explica
      this.tituloError = this.codigoDe(e) === 429 ? 'Ya había marcado' : 'No se registró';
      this.mensajeError = e?.error?.message ?? e?.message ?? 'No se pudo registrar la marcación';
    } finally {
      this.enviando = false;
    }
  }

  /** Para saber desde dónde se marcó, sin pedirle nada a la persona. */
  private nombreDelAparato(): string {
    const ua = navigator.userAgent || '';
    const marca = /iPhone/i.test(ua) ? 'iPhone'
      : /iPad/i.test(ua) ? 'iPad'
      : /Android/i.test(ua) ? 'Android'
      : /Windows/i.test(ua) ? 'Windows'
      : /Mac OS/i.test(ua) ? 'Mac'
      : 'Celular';
    return `Celular (${marca})`;
  }

  // ================================================================
  // AYUDAS PARA LA PLANTILLA
  // ================================================================

  get textoUbicacion(): string {
    if (this.hecha?.coordenadas) {
      const p = this.hecha.precision_m;
      return this.hecha.coordenadas + (p ? ` · ±${Math.round(Number(p))} m` : '');
    }
    return this.ubicacionMotivo || 'Sin ubicación';
  }

  comoHora(m: MarcacionModel | null): string { return m?.hora ?? ''; }

  /**
   * El historial, en un modal.
   *
   * Aquí abajo era una rejilla fija que alargaba la pantalla; lo que se
   * viene a hacer al teléfono es pulsar un botón, y las marcaciones de atrás
   * se miran de vez en cuando.
   */
  abrirMisMarcaciones(): void {
    this.modal.open(MisMarcacionesComponent, {
      centered: true, size: 'lg', scrollable: true, backdrop: true,
    });
  }

}
