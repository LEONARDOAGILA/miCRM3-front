import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { firstValueFrom } from 'rxjs';

import { NotificacionService } from '../../../services/notificacion.service';
import { CampanaService } from '../../../services/campana.service';
import { destinoDeNotificacion, ESTILOS_NOTIFICACION, NotificacionModel, TipoNotificacion } from '../../../interfaces/notificacionModel';
import { LoadingService } from '../../../../../service/loading.service';
import { PanelModule } from '../../../../../components/panel/panel.module';

/**
 * Las notificaciones del usuario, en grande.
 *
 * Es el «ver todas» de la campana: la misma lista, con el mensaje completo,
 * agrupada por día y con dos filtros (todas / sin leer). Al pulsar una se
 * marca como leída y, si lleva enlace, se va a donde apunta.
 *
 * Quitar no borra nada de nadie: sólo la saca de la campana de quien la quita
 * (archivada), porque la misma notificación la tienen otros usuarios.
 */
@Component({
  selector: 'app-misNotificaciones',
  standalone: true,
  imports: [CommonModule, PanelModule],
  templateUrl: './misNotificaciones.component.html',
  styleUrls: ['./misNotificaciones.component.css'],
})
export class MisNotificacionesComponent implements OnInit {

  public isLoading$ = this._loadingService.isLoading$;

  public notificaciones: NotificacionModel[] = [];
  public noLeidas = 0;
  public total = 0;

  public soloNoLeidas = false;
  /** Cuántas se piden de golpe; el botón de abajo trae otras tantas. */
  private readonly POR_TANDA = 20;

  constructor(
    public activeModal: NgbActiveModal,
    private router: Router,
    private _notificacionService: NotificacionService,
    private _campana: CampanaService,
    private _loadingService: LoadingService,
  ) {}

  ngOnInit(): void {
    this.cargar();
  }

  // ================================================================
  // DATOS
  // ================================================================

  async cargar(mas = false): Promise<void> {
    try {
      this._loadingService.setLoading(true);
      const desplazamiento = mas ? this.notificaciones.length : 0;
      const res: any = await firstValueFrom(
        this._notificacionService.misNotificaciones(this.soloNoLeidas, this.POR_TANDA, desplazamiento)
      );
      if (res?.status !== 'success') { return; }

      const llegadas: NotificacionModel[] = res.data?.data ?? [];
      this.notificaciones = mas ? [...this.notificaciones, ...llegadas] : llegadas;
      this.noLeidas = Number(res.data?.no_leidas) || 0;
      this.total = Number(res.data?.total) || 0;
    } catch (e) {
      console.error('Error al cargar las notificaciones:', e);
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  filtrar(soloNoLeidas: boolean): void {
    if (this.soloNoLeidas === soloNoLeidas) { return; }
    this.soloNoLeidas = soloNoLeidas;
    this.cargar();
  }

  get hayMas(): boolean {
    return !this.soloNoLeidas && this.notificaciones.length < this.total;
  }

  // ================================================================
  // ACCIONES
  // ================================================================

  /**
   * Pulsar una: queda leída y, si lleva enlace, lleva allí.
   *
   * Con un enlace de internet se abre otra pestaña y este modal se queda
   * abierto, para poder seguir revisando la lista; con una ruta del sistema
   * hay que cerrarlo, porque debajo cambia la pantalla.
   */
  async abrir(n: NotificacionModel): Promise<void> {
    if (!n.leida) {
      n.leida = true;
      this.noLeidas = Math.max(0, this.noLeidas - 1);
      await this._campana.marcarLeidas([n.id]);
      if (this.soloNoLeidas) { this.cargar(); }
    }

    const a = destinoDeNotificacion(n.url);
    if (!a) { return; }

    if (a.tipo === 'externa') {
      window.open(a.destino, '_blank', 'noopener,noreferrer');
      return;
    }

    this.activeModal.close('ir');
    this.router.navigateByUrl(a.destino).catch(() => { /* ruta que ya no existe */ });
  }

  /** Para pintar el icono: si el enlace se va fuera del sistema. */
  enlaceFuera(n: NotificacionModel): boolean {
    return destinoDeNotificacion(n.url)?.tipo === 'externa';
  }

  async marcarTodas(): Promise<void> {
    await this._campana.marcarLeidas();
    await this.cargar();
  }

  /** La quita de la campana de este usuario; a los demás no les afecta. */
  async quitar(n: NotificacionModel, ev: Event): Promise<void> {
    ev.stopPropagation();
    this.notificaciones = this.notificaciones.filter(x => x.id !== n.id);
    await this._campana.archivar([n.id]);
    this.noLeidas = this._campana.noLeidas;
    this.total = Math.max(0, this.total - 1);
  }

  async quitarLeidas(): Promise<void> {
    const ids = this.notificaciones.filter(n => n.leida).map(n => n.id);
    if (!ids.length) { return; }
    this.notificaciones = this.notificaciones.filter(n => !n.leida);
    await this._campana.archivar(ids);
    this.total = Math.max(0, this.total - ids.length);
  }

  // ================================================================
  // PRESENTACIÓN
  // ================================================================

  estilo(n: NotificacionModel) {
    return ESTILOS_NOTIFICACION[(n.tipo ?? 'INFO') as TipoNotificacion] ?? ESTILOS_NOTIFICACION.INFO;
  }

  icono(n: NotificacionModel): string {
    return n.icono || this.estilo(n).icono;
  }

  hace(n: NotificacionModel): string {
    return this._campana.hace(n.created_at);
  }

  /** «Hoy», «Ayer» o la fecha: el rótulo del grupo al que pertenece. */
  dia(n: NotificacionModel): string {
    const t = new Date((n.created_at ?? '').replace(' ', 'T'));
    if (isNaN(t.getTime())) { return 'Antes'; }

    const hoy = new Date();
    const mismoDia = (a: Date, b: Date) =>
      a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

    if (mismoDia(t, hoy)) { return 'Hoy'; }
    const ayer = new Date(hoy);
    ayer.setDate(hoy.getDate() - 1);
    if (mismoDia(t, ayer)) { return 'Ayer'; }

    return t.toLocaleDateString('es-EC', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  /** La primera de su día: es la que lleva el rótulo encima. */
  abreDia(i: number): boolean {
    if (i === 0) { return true; }
    return this.dia(this.notificaciones[i]) !== this.dia(this.notificaciones[i - 1]);
  }
}
