import { Injectable } from '@angular/core';
import { BehaviorSubject, firstValueFrom } from 'rxjs';

import { ECHO_PUSHER } from '../../../config/config';
import { SeguridadService } from '../../seguridad/services/seguridad.service';
import { NotificacionService } from './notificacion.service';
import { AvisoCampanaService } from './avisoCampana.service';
import { NotificacionModel } from '../interfaces/notificacionModel';

/**
 * El estado de la campana, en un solo sitio.
 *
 * La cabecera muestra el número y las últimas; el modal de «ver todas» trabaja
 * sobre la misma lista. Cuando entra una notificación nueva, el servidor avisa
 * por websocket al canal propio del usuario (`notificaciones.{user_id}`) y
 * aquí se vuelve a pedir la lista con su token: el aviso es sólo un timbre.
 *
 * La conexión es la misma de toda la aplicación (ver config.ts): aquí sólo se
 * entra y se sale del canal.
 */
@Injectable({ providedIn: 'root' })
export class CampanaService {

  /** Las últimas notificaciones del usuario, las que ve la campana. */
  private readonly _lista = new BehaviorSubject<NotificacionModel[]>([]);
  readonly lista$ = this._lista.asObservable();

  /** Cuántas tiene sin leer. */
  private readonly _noLeidas = new BehaviorSubject<number>(0);
  readonly noLeidas$ = this._noLeidas.asObservable();

  /** Acaba de entrar una: la cabecera lo usa para animar la campana. */
  private readonly _entrante = new BehaviorSubject<NotificacionModel | null>(null);
  readonly entrante$ = this._entrante.asObservable();

  /**
   * Cuántas se traen para el desplegable de la cabecera.
   *
   * Pocas a propósito: el desplegable cuelga de la campana y con más se come
   * la pantalla. El resto se ve en «Ver más».
   */
  private readonly ULTIMAS = 5;

  private echo: any = null;
  private canal = '';
  private cargando = false;

  constructor(
    private _notificacionService: NotificacionService,
    private _seguridadService: SeguridadService,
    private _aviso: AvisoCampanaService,
  ) {}

  get lista(): NotificacionModel[] { return this._lista.value; }
  get noLeidas(): number { return this._noLeidas.value; }

  // ================================================================
  // WEBSOCKET
  // ================================================================

  /** Empieza a escuchar el canal del usuario y trae lo que ya tiene. */
  escuchar(): void {
    const id = this.usuarioId();
    if (!id) { return; }

    this.refrescar();

    const canal = `notificaciones.${id}`;
    if (this.echo && this.canal === canal) { return; }
    this.parar();

    try {
      this.canal = canal;
      this.echo = ECHO_PUSHER(this._seguridadService.token);
      this.echo.channel(canal).listen('NotificacionRecibida', this.alLlegar);
    } catch (e) {
      console.error('No se pudo escuchar el canal de notificaciones:', e);
      this.echo = null;
      this.canal = '';
    }
  }

  /**
   * Manejador con nombre: hace falta el mismo para desuscribirse.
   *
   * El aviso trae el id, así que tras refrescar se busca esa misma: si no, con
   * varias sin leer se avisaría de la que estuviera arriba, no de la que entró.
   */
  private alLlegar = (datos?: { notificacionId?: number }): void => {
    this.refrescar().then(() => {
      const id = Number(datos?.notificacionId) || 0;
      const entrante = (id ? this.lista.find(n => n.id === id) : null)
        ?? this.lista.find(n => !n.leida)
        ?? null;
      this._entrante.next(entrante);
      // El «ding» y el globo del navegador, si el usuario los tiene encendidos
      this._aviso.avisar(entrante);
    });
  };

  /**
   * Deja de escuchar y vacía lo que se tenía.
   *
   * No cierra la conexión: es la misma que usa el resto de la aplicación y
   * quien la cierra es el cierre de sesión (CERRAR_ECHO).
   */
  parar(): void {
    if (this.echo && this.canal) {
      try {
        this.echo.channel(this.canal).stopListening('NotificacionRecibida', this.alLlegar);
        this.echo.leaveChannel(this.canal);
      } catch { /* la conexión ya no está */ }
    }
    this.echo = null;
    this.canal = '';
    this._lista.next([]);
    this._noLeidas.next(0);
    this._entrante.next(null);
    this._aviso.limpiar();
  }

  // ================================================================
  // DATOS
  // ================================================================

  /** Vuelve a pedir las últimas y el contador. */
  async refrescar(): Promise<void> {
    if (this.cargando || !this.usuarioId()) { return; }
    this.cargando = true;
    try {
      const res: any = await firstValueFrom(this._notificacionService.misNotificaciones(false, this.ULTIMAS));
      if (res?.status !== 'success') { return; }
      this._lista.next(res.data?.data ?? []);

      const sinLeer = Number(res.data?.no_leidas) || 0;
      this._noLeidas.next(sinLeer);
      // Sin nada pendiente no hay por qué seguir insistiendo
      if (!sinLeer) { this._aviso.callar(); }
    } catch (e) {
      console.error('No se pudieron traer las notificaciones:', e);
    } finally {
      this.cargando = false;
    }
  }

  /** Marca leídas (sin ids, todas) y actualiza el contador. */
  async marcarLeidas(ids?: number[]): Promise<void> {
    try {
      await firstValueFrom(this._notificacionService.marcarLeidas(ids));
      await this.refrescar();
    } catch (e) {
      console.error('No se pudieron marcar como leídas:', e);
    }
  }

  /** Quita de la campana (sin ids, todas). */
  async archivar(ids?: number[]): Promise<void> {
    try {
      await firstValueFrom(this._notificacionService.archivar(ids));
      await this.refrescar();
    } catch (e) {
      console.error('No se pudieron quitar de la campana:', e);
    }
  }

  // ================================================================
  // AYUDAS
  // ================================================================

  private usuarioId(): number | null {
    try {
      const u = JSON.parse(localStorage.getItem('user') ?? '{}');
      return Number(u?.id) || null;
    } catch {
      return null;
    }
  }

  /** «hace 5 min», «ayer», «12/09»: lo que se lee de un vistazo. */
  hace(fecha: string | null | undefined): string {
    if (!fecha) { return ''; }
    const t = new Date(fecha.replace(' ', 'T')).getTime();
    if (isNaN(t)) { return fecha; }

    const minutos = Math.floor((Date.now() - t) / 60000);
    if (minutos < 1) { return 'ahora mismo'; }
    if (minutos < 60) { return `hace ${minutos} min`; }

    const horas = Math.floor(minutos / 60);
    if (horas < 24) { return `hace ${horas} h`; }

    const dias = Math.floor(horas / 24);
    if (dias === 1) { return 'ayer'; }
    if (dias < 7) { return `hace ${dias} días`; }

    const d = new Date(t);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
}
