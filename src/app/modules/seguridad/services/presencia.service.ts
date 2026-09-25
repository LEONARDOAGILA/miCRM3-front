import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, firstValueFrom } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { EstadoElegido, PresenciaModel } from '../interfaces/presenciaModel';

/**
 * El estado que el usuario publica, en un solo sitio.
 *
 * Mientras tiene el CRM abierto se manda un «latido» cada pocos minutos: es
 * lo que distingue a quien está de quien dejó la pestaña abierta y se fue.
 * El latido se para cuando la pestaña deja de verse —ni gasta ni miente— y
 * se reanuda al volver.
 *
 * Al cerrar sesión se avisa al servidor para no quedarse en línea veinte
 * minutos más; el estado elegido se conserva para la próxima vez.
 */
@Injectable({ providedIn: 'root' })
export class PresenciaService {

  /** Cada cuánto se dice «sigo aquí». El servidor da por ausente a los 5 min. */
  private static readonly LATIDO_MS = 120000;

  private readonly URL: string;

  private readonly _mia = new BehaviorSubject<PresenciaModel | null>(null);
  readonly mia$ = this._mia.asObservable();

  private latido: any = null;
  /** Para no montar el mismo vigilante dos veces. */
  private enMarcha = false;

  constructor(private _http: HttpClient) {
    this.URL = environment.URL_SERVICIOS + 'auth/presencia/';
  }

  get mia(): PresenciaModel | null { return this._mia.value; }

  /** Atajo para quien sólo necesita saber si hay que callarse. */
  get noMolestar(): boolean { return this._mia.value?.estado === 'NO_MOLESTAR'; }

  // ================================================================
  // ARRANQUE Y PARADA
  // ================================================================

  /** Trae el estado guardado y empieza a latir. Lo llama la cabecera. */
  async empezar(): Promise<void> {
    if (this.enMarcha) { return; }
    this.enMarcha = true;

    await this.refrescar();
    this.arrancarLatido();

    // Con la pestaña de fondo no se late: no se está usando el sistema
    document.addEventListener('visibilitychange', this.alCambiarVisibilidad);
  }

  /** Al cerrar sesión o destruirse la cabecera. */
  parar(): void {
    this.pararLatido();
    document.removeEventListener('visibilitychange', this.alCambiarVisibilidad);
    this.enMarcha = false;
    this._mia.next(null);
  }

  private readonly alCambiarVisibilidad = (): void => {
    if (document.visibilityState === 'visible') {
      // Al volver, un latido inmediato para dejar de figurar como ausente
      this.enviarLatido();
      this.arrancarLatido();
    } else {
      this.pararLatido();
    }
  };

  private arrancarLatido(): void {
    this.pararLatido();
    this.latido = setInterval(() => this.enviarLatido(), PresenciaService.LATIDO_MS);
  }

  private pararLatido(): void {
    if (this.latido) { clearInterval(this.latido); this.latido = null; }
  }

  // ================================================================
  // LLAMADAS
  // ================================================================

  async refrescar(): Promise<void> {
    try {
      const res: any = await firstValueFrom(this._http.get(this.URL + 'mia'));
      if (res?.status === 'success') { this._mia.next(res.data); }
    } catch (e) {
      console.error('No se pudo traer tu estado:', e);
    }
  }

  /** Cambia el estado que se publica. Devuelve si se pudo. */
  async cambiar(estado: EstadoElegido, mensaje: string | null = null): Promise<boolean> {
    try {
      const res: any = await firstValueFrom(this._http.post(this.URL + 'cambiar', { estado, mensaje }));
      if (res?.status !== 'success') { return false; }
      this._mia.next(res.data);
      return true;
    } catch (e) {
      console.error('No se pudo cambiar tu estado:', e);
      return false;
    }
  }

  /** «Sigo aquí». Es la llamada más repetida, así que no hace ruido si falla. */
  private async enviarLatido(): Promise<void> {
    if (!this.enMarcha) { return; }
    try {
      const res: any = await firstValueFrom(this._http.post(this.URL + 'latido', {}));
      if (res?.status === 'success') { this._mia.next(res.data); }
    } catch { /* un latido perdido no importa: viene otro en dos minutos */ }
  }

  /** Antes de cerrar sesión, para no quedarse «en línea» sin estarlo. */
  async desconectar(): Promise<void> {
    this.pararLatido();
    try {
      await firstValueFrom(this._http.post(this.URL + 'desconectar', {}));
    } catch { /* si no llega, el servidor lo dará por ausente igual */ }
  }

  /** Quién está ahora; con `todos` incluye también a los desconectados. */
  async conectados(todos = false): Promise<PresenciaModel[]> {
    try {
      const res: any = await firstValueFrom(this._http.get(this.URL + 'conectados' + (todos ? '?todos=1' : '')));
      return res?.status === 'success' ? (res.data ?? []) : [];
    } catch (e) {
      console.error('No se pudo listar quién está conectado:', e);
      return [];
    }
  }
}
