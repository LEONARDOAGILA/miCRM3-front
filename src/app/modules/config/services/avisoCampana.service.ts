import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

import { NotificacionModel } from '../interfaces/notificacionModel';

/** Lo que el usuario ha decidido para los avisos de su campana. */
export interface PreferenciasAviso {
  /** Suena un «ding» corto cuando entra una notificación */
  sonido: boolean;
  /** Además avisa el navegador, aunque el CRM no esté a la vista */
  escritorio: boolean;
}

/**
 * El aviso de que acaba de entrar una notificación: el sonido y el globo del
 * navegador.
 *
 * Son dos cosas que molestan si se imponen, así que las dos están apagadas
 * hasta que el usuario las enciende desde la campana, y la decisión se guarda
 * en su navegador (no en el servidor: es de este equipo, no de la cuenta).
 *
 * El globo del navegador sólo sale cuando el CRM NO está a la vista: si la
 * pestaña está delante, ya se ve la campana y un globo encima sobra. En iOS y
 * en las páginas servidas por http:// la API no existe, así que ahí sólo queda
 * el sonido y el botón ni se muestra.
 */
@Injectable({ providedIn: 'root' })
export class AvisoCampanaService {

  private static readonly CLAVE = 'campana.avisos';

  /**
   * Cada cuánto vuelve a sonar mientras el usuario no mire la campana.
   *
   * La idea es que un aviso no se pierda porque uno estaba mirando a otro
   * lado; por eso insiste en vez de sonar una sola vez.
   */
  private static readonly INSISTE_CADA_MS = 20000;

  private readonly _preferencias = new BehaviorSubject<PreferenciasAviso>(this.leerPreferencias());
  readonly preferencias$ = this._preferencias.asObservable();

  /**
   * El contexto de audio se crea con el primer sonido, no al arrancar: hasta
   * que no hay un gesto del usuario el navegador lo deja suspendido.
   */
  private audio: AudioContext | null = null;

  /** Los globos abiertos, para poder cerrarlos al salir. */
  private abiertos: Notification[] = [];

  /** El «sigue sonando» mientras haya algo sin mirar. */
  private repetidor: any = null;
  /** El timbre del que insiste: el de la última que entró. */
  private tipoPendiente: NotificacionModel['tipo'] = 'INFO';

  constructor(private router: Router) {}

  get preferencias(): PreferenciasAviso { return this._preferencias.value; }

  // ================================================================
  // PREFERENCIAS
  // ================================================================

  private leerPreferencias(): PreferenciasAviso {
    try {
      const guardado = JSON.parse(localStorage.getItem(AvisoCampanaService.CLAVE) ?? '{}');
      return { sonido: guardado?.sonido === true, escritorio: guardado?.escritorio === true };
    } catch {
      return { sonido: false, escritorio: false };
    }
  }

  private guardar(p: PreferenciasAviso): void {
    this._preferencias.next(p);
    try {
      localStorage.setItem(AvisoCampanaService.CLAVE, JSON.stringify(p));
    } catch { /* navegación privada: se queda sólo para esta sesión */ }
  }

  /**
   * Enciende o apaga el sonido. Al encenderlo suena una vez: sirve de muestra
   * y, sobre todo, aprovecha el clic para que el navegador deje sonar el resto
   * de la sesión.
   */
  alternarSonido(): boolean {
    const sonido = !this.preferencias.sonido;
    this.guardar({ ...this.preferencias, sonido });
    if (sonido) { this.sonar('INFO'); } else { this.callar(); }
    return sonido;
  }

  /** ¿Este navegador sabe mostrar globos? (iOS y http:// plano, no). */
  get soportaEscritorio(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window;
  }

  /** El permiso quedó denegado y sólo se puede cambiar desde el navegador. */
  get escritorioBloqueado(): boolean {
    return this.soportaEscritorio && Notification.permission === 'denied';
  }

  /**
   * Enciende o apaga el globo del navegador. Al encenderlo se pide el permiso,
   * que hay que pedir desde un clic del usuario o el navegador lo descarta.
   *
   * Devuelve cómo quedó, para que quien llama avise si el permiso se denegó.
   */
  async alternarEscritorio(): Promise<{ activo: boolean; permiso: NotificationPermission | 'sin-soporte' }> {
    if (!this.soportaEscritorio) { return { activo: false, permiso: 'sin-soporte' }; }

    if (this.preferencias.escritorio) {
      this.guardar({ ...this.preferencias, escritorio: false });
      return { activo: false, permiso: Notification.permission };
    }

    let permiso = Notification.permission;
    if (permiso === 'default') { permiso = await this.pedirPermiso(); }

    const activo = permiso === 'granted';
    this.guardar({ ...this.preferencias, escritorio: activo });
    return { activo, permiso };
  }

  /** Safari antiguo devuelve el permiso por callback en vez de por promesa. */
  private pedirPermiso(): Promise<NotificationPermission> {
    try {
      const r = Notification.requestPermission();
      if (r && typeof (r as any).then === 'function') { return r as Promise<NotificationPermission>; }
      return new Promise(resolve => Notification.requestPermission(resolve));
    } catch {
      return Promise.resolve('denied' as NotificationPermission);
    }
  }

  // ================================================================
  // EL AVISO
  // ================================================================

  /**
   * Acaba de entrar una: suena y, si toca, sale el globo.
   *
   * El sonido no se queda en una vez: sigue insistiendo hasta que el usuario
   * mire la campana. El globo sí sale una sola vez — el navegador lo deja en
   * su bandeja, no hace falta repetirlo.
   */
  avisar(n: NotificacionModel | null): void {
    if (!n) { return; }
    if (this.preferencias.sonido) {
      this.sonar(n.tipo);
      this.insistir(n.tipo);
    }
    this.mostrarGlobo(n);
  }

  /**
   * Vuelve a sonar cada tanto mientras nadie mire la campana.
   *
   * Si entra otra antes de que se mire, se reinicia la cuenta con el timbre de
   * la nueva: insiste una sola voz, no una por notificación.
   */
  private insistir(tipo: NotificacionModel['tipo']): void {
    this.callar();
    if (!this.preferencias.sonido) { return; }

    this.tipoPendiente = tipo ?? 'INFO';
    this.repetidor = setInterval(() => {
      // Si mientras tanto apagó el sonido, se calla sin esperar a nada más
      if (!this.preferencias.sonido) { this.callar(); return; }
      this.sonar(this.tipoPendiente);
    }, AvisoCampanaService.INSISTE_CADA_MS);
  }

  /**
   * Deja de insistir: lo llama la campana en cuanto el usuario la abre, y
   * también el propio servicio cuando ya no queda nada sin leer.
   */
  callar(): void {
    if (this.repetidor) {
      clearInterval(this.repetidor);
      this.repetidor = null;
    }
  }

  /** ¿Está insistiendo ahora mismo? (para pintar la campana inquieta). */
  get insistiendo(): boolean {
    return this.repetidor !== null;
  }

  /**
   * Un «ding» corto hecho con el propio navegador: así no hay que descargar
   * ningún archivo ni depende de que el audio esté en el servidor.
   *
   * Los avisos y los problemas suenan más graves que las demás: se distinguen
   * sin mirar la pantalla.
   */
  sonar(tipo: NotificacionModel['tipo'] = 'INFO'): void {
    try {
      const Contexto = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Contexto) { return; }

      this.audio ??= new Contexto();
      const ctx = this.audio!;
      // Sin un gesto previo el contexto nace suspendido; se reanuda y ya queda listo
      if (ctx.state === 'suspended') { ctx.resume().catch(() => { /* hace falta un clic */ }); }

      const grave = tipo === 'AVISO' || tipo === 'ERROR';
      const notas = grave ? [523.25, 392.00] : [880.00, 1174.66];

      notas.forEach((hz, i) => {
        const osc = ctx.createOscillator();
        const vol = ctx.createGain();
        const desde = ctx.currentTime + i * 0.13;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(hz, desde);

        // Ataque rápido y caída suave: un timbre de campana, no un pitido
        vol.gain.setValueAtTime(0.0001, desde);
        vol.gain.exponentialRampToValueAtTime(0.09, desde + 0.012);
        vol.gain.exponentialRampToValueAtTime(0.0001, desde + 0.26);

        osc.connect(vol);
        vol.connect(ctx.destination);
        osc.start(desde);
        osc.stop(desde + 0.28);
        // Sin esto quedarían nodos colgando con cada notificación
        osc.onended = () => { osc.disconnect(); vol.disconnect(); };
      });
    } catch (e) {
      console.warn('No se pudo reproducir el aviso de la campana:', e);
    }
  }

  /**
   * El globo del navegador. Sólo cuando el CRM no está a la vista: con la
   * pestaña delante ya se ve la campana.
   */
  private mostrarGlobo(n: NotificacionModel): void {
    if (!this.preferencias.escritorio || !this.soportaEscritorio) { return; }
    if (Notification.permission !== 'granted') { return; }
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') { return; }

    try {
      const globo = new Notification(n.titulo, {
        body: n.mensaje ?? '',
        icon: '/assets/img/logo/logo-admin.png',
        // Con la misma etiqueta, una notificación repetida reemplaza a la anterior
        tag: 'micrm-notificacion-' + n.id,
        silent: true,   // el sonido ya lo pone la aplicación, que sabe el tipo
      });

      globo.onclick = () => {
        try { window.focus(); } catch { /* el navegador puede negarlo */ }
        if (n.url) { this.router.navigateByUrl(n.url).catch(() => { /* ruta que ya no existe */ }); }
        globo.close();
      };

      globo.onclose = () => { this.abiertos = this.abiertos.filter(g => g !== globo); };
      this.abiertos.push(globo);

      // Ningún aviso debe quedarse en pantalla indefinidamente
      setTimeout(() => { try { globo.close(); } catch { /* ya se cerró */ } }, 12000);
    } catch (e) {
      console.warn('No se pudo mostrar el aviso del navegador:', e);
    }
  }

  /** Al cerrar sesión: nada de globos ni de audio abierto de la sesión anterior. */
  limpiar(): void {
    this.callar();
    this.abiertos.forEach(g => { try { g.close(); } catch { /* ya se cerró */ } });
    this.abiertos = [];
    if (this.audio) {
      this.audio.close().catch(() => { /* ya estaba cerrado */ });
      this.audio = null;
    }
  }
}
