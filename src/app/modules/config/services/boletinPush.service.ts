import { Injectable } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { firstValueFrom } from 'rxjs';

import { ECHO_PUSHER } from '../../../config/config';
import { SeguridadService } from '../../seguridad/services/seguridad.service';
import { BoletinService } from './boletin.service';
import { BoletinModel } from '../interfaces/boletinModel';
import { VerBoletinesComponent } from '../pages/boletines/verBoletines/verBoletines.component';

/**
 * Los boletines en pantalla, vengan de donde vengan.
 *
 * Dos caminos llevan al mismo sitio:
 *   · al entrar al sistema, la pantalla de inicio pide los pendientes;
 *   · con la sesión ya abierta, el administrador «lanza» un boletín y el
 *     servidor avisa por websocket al canal propio de cada destinatario
 *     (`boletines.{user_id}`).
 *
 * El aviso es sólo un timbre con el id y el título: el contenido se vuelve a
 * pedir con el token del usuario, así que el canal —que es público— no
 * enseña nada. Quien no sea destinatario no recibirá nada que mostrar.
 */
@Injectable({ providedIn: 'root' })
export class BoletinPushService {

  /** La conexión (compartida con el resto de la aplicación) y el canal propio. */
  private echo: any = null;
  private canal = '';
  /** Ya hay un carrusel en pantalla: no se abre otro encima. */
  private abierto = false;

  constructor(
    private modalService: NgbModal,
    private _boletinService: BoletinService,
    private _seguridadService: SeguridadService,
  ) {}

  // ================================================================
  // WEBSOCKET
  // ================================================================

  /** Empieza a escuchar el canal del usuario de la sesión. */
  escuchar(): void {
    const id = this.usuarioId();
    if (!id) { return; }

    const canal = `boletines.${id}`;
    if (this.echo && this.canal === canal) { return; }   // ya está escuchando
    this.parar();

    try {
      this.canal = canal;
      this.echo = ECHO_PUSHER(this._seguridadService.token);
      this.echo.channel(canal).listen('BoletinPublicado', this.alLanzar);
    } catch (e) {
      console.error('No se pudo escuchar el canal de boletines:', e);
      this.echo = null;
      this.canal = '';
    }
  }

  /** Manejador con nombre: hace falta el mismo para desuscribirse. */
  private alLanzar = (aviso: any): void => {
    this.mostrarPendientes(true, Number(aviso?.boletinId) || null);
  };

  /**
   * Deja de escuchar el canal.
   *
   * No cierra la conexión: es la misma que usa el resto de la aplicación y
   * quien la cierra es el cierre de sesión (CERRAR_ECHO).
   */
  parar(): void {
    if (!this.echo || !this.canal) { this.echo = null; this.canal = ''; return; }
    try {
      this.echo.channel(this.canal).stopListening('BoletinPublicado', this.alLanzar);
      this.echo.leaveChannel(this.canal);
    } catch { /* la conexión ya no está */ }
    this.echo = null;
    this.canal = '';
  }

  // ================================================================
  // MOSTRAR
  // ================================================================

  /**
   * Abre el carrusel con lo que el usuario tenga pendiente.
   *
   * Sin `forzar` se respeta la marca de «ya se mostraron en esta sesión del
   * navegador», que es lo que evita que al volver al inicio se repitan. El
   * aviso por websocket sí fuerza: es un boletín recién lanzado.
   */
  async mostrarPendientes(forzar = false, lanzado: number | null = null): Promise<void> {
    if (this.abierto) { return; }
    const clave = this.claveSesion();
    if (!forzar && this.yaMostrados(clave)) { return; }

    try {
      const res: any = await firstValueFrom(this._boletinService.misBoletines());
      let boletines: BoletinModel[] = res?.status === 'success' ? (res.data ?? []) : [];

      // El que acaban de lanzar va primero, y se pide aparte porque puede
      // estar programado o caducado: así no lo devuelve misBoletines.
      if (lanzado) {
        const recien = await this.traer(lanzado);
        if (recien) {
          boletines = [recien, ...boletines.filter(b => b.id !== recien.id)];
        }
      }

      if (!boletines.length) { return; }

      this.marcarMostrados(clave);
      this.abrir(boletines);
    } catch (e) {
      console.error('No se pudieron traer los boletines:', e);
    }
  }

  /** El boletín recién lanzado; null si a este usuario no le toca. */
  private async traer(id: number): Promise<BoletinModel | null> {
    try {
      const res: any = await firstValueFrom(this._boletinService.miBoletin(id));
      return res?.status === 'success' && res.data ? (res.data as BoletinModel) : null;
    } catch (e) {
      console.error('No se pudo traer el boletín lanzado:', e);
      return null;
    }
  }

  private abrir(boletines: BoletinModel[]): void {
    this.abierto = true;
    const modalRef = this.modalService.open(VerBoletinesComponent, {
      size: 'xl',
      centered: true,
      backdrop: 'static',
      keyboard: false,
      windowClass: 'bol-modal',
      backdropClass: 'bol-backdrop',
    });
    modalRef.componentInstance.boletines = boletines;
    modalRef.result.then(() => this.abierto = false, () => this.abierto = false);
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

  /** La marca va por usuario: dos cuentas en el mismo navegador no se pisan. */
  private claveSesion(): string {
    try {
      const u = JSON.parse(localStorage.getItem('user') ?? '{}');
      return 'miCRM3.boletines.mostrados.' + (u?.login_user ?? 'anon');
    } catch {
      return 'miCRM3.boletines.mostrados.anon';
    }
  }

  private yaMostrados(clave: string): boolean {
    try { return sessionStorage.getItem(clave) === '1'; } catch { return false; }
  }

  private marcarMostrados(clave: string): void {
    try { sessionStorage.setItem(clave, '1'); } catch { /* sin sessionStorage */ }
  }
}
