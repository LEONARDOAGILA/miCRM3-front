import { Injectable, NgZone } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { Subject, Subscription, firstValueFrom } from 'rxjs';

import { GestionService } from './gestion.service';
import { GestionModel } from '../interfaces/gestionModel';
import { AvisoCampanaService } from '../../config/services/avisoCampana.service';
import { PresenciaService } from '../../seguridad/services/presencia.service';
import {
  RecordatorioGestionComponent, RespuestaRecordatorio,
} from '../pages/gestion-clientes/recordatorioGestion/recordatorioGestion.component';

/**
 * El aviso de que llegó la hora de una gestión programada.
 *
 * Mira cada minuto lo que hay pendiente y, en cuanto a una le llega su hora,
 * saca el modal del recordatorio encima de lo que esté haciendo el usuario,
 * con un sonido y —si la pestaña no está a la vista— el globo del navegador.
 *
 * Lo arranca la cabecera, que está en todas las pantallas: si dependiera de la
 * pantalla de gestión sólo avisaría a quien ya la tuviera abierta, que es
 * justo el que no necesita el aviso.
 *
 * Sólo avisa de lo del propio usuario: lo que él programó (created_by) o lo
 * que tiene asignado como vendedor. Mientras seguridad.users no guarde a qué
 * empleado corresponde cada usuario, lo segundo no se puede saber y manda lo
 * primero.
 *
 * En «No molestar» se calla del todo —ni modal, ni sonido, ni globo—, igual
 * que hace la campana. No se pierde nada: se sigue mirando la agenda y lo que
 * toca queda en la cola, así que al volver a Disponible sale lo que haya. Lo
 * pendiente también está siempre en la pestaña «Lo que toca hacer».
 */
@Injectable({ providedIn: 'root' })
export class RecordatorioGestionesService {

  /** Cada cuánto se mira la agenda. */
  private static readonly REVISA_CADA_MS = 60000;

  /** Se avisa desde medio minuto antes: nadie mira el reloj al segundo. */
  private static readonly MARGEN_MS = 30000;

  /** Lo pospuesto sobrevive a un F5; lo ya avisado, no (si sigue pendiente, vuelve a avisar). */
  private static readonly CLAVE_POSPUESTAS = 'gestiones.pospuestas';

  /** Al cerrar un aviso, el siguiente espera un poco: tres modales seguidos abruman. */
  private static readonly ENTRE_AVISOS_MS = 2500;

  private temporizador: any = null;
  private activo = false;

  /** Ya avisadas en esta sesión, para no repetir cada minuto. */
  private readonly avisadas = new Set<number>();
  /** id → hasta cuándo está pospuesta (epoch ms). */
  private pospuestas: Record<string, number> = {};

  private cola: GestionModel[] = [];
  private mostrando = false;

  /** Algo cambió (se cerró una gestión desde el aviso): quien escuche, que recargue. */
  private readonly _cambio = new Subject<GestionModel>();
  readonly cambio$ = this._cambio.asObservable();

  /** Los globos abiertos, para poder cerrarlos al salir. */
  private globos: Notification[] = [];

  /** El estado de presencia, para saber cuándo hay que callarse y cuándo volver. */
  private suscripcionPresencia: Subscription | null = null;
  private callado = false;

  constructor(
    private ngZone: NgZone,
    private modal: NgbModal,
    private _gestionService: GestionService,
    private _aviso: AvisoCampanaService,
    private _presencia: PresenciaService,
  ) {
    this.pospuestas = this.leerPospuestas();
  }

  // ================================================================
  // ARRANQUE Y PARADA
  // ================================================================

  /** Lo llama la cabecera cuando el usuario tiene acceso a la gestión de clientes. */
  empezar(): void {
    if (this.activo) { return; }
    this.activo = true;
    this.callado = this._presencia.noMolestar;
    this.revisar();

    // Al salir de «No molestar» se suelta lo que se quedó en la cola; entrar
    // en él no cancela nada, sólo deja de mostrarlo
    this.suscripcionPresencia = this._presencia.mia$.subscribe(() => {
      const calladoAhora = this._presencia.noMolestar;
      const volvio = this.callado && !calladoAhora;
      this.callado = calladoAhora;
      if (volvio) { this.mostrarSiguiente(); }
    });

    // Fuera de Angular: un intervalo de un minuto dispararía la detección de
    // cambios de toda la aplicación sin necesidad
    this.ngZone.runOutsideAngular(() => {
      this.temporizador = setInterval(
        () => this.ngZone.run(() => this.revisar()),
        RecordatorioGestionesService.REVISA_CADA_MS,
      );
    });
  }

  detener(): void {
    this.activo = false;
    if (this.temporizador) { clearInterval(this.temporizador); this.temporizador = null; }
    this.suscripcionPresencia?.unsubscribe();
    this.suscripcionPresencia = null;
    this.cola = [];
    this.avisadas.clear();
    this.globos.forEach(g => { try { g.close(); } catch { /* ya no estaba */ } });
    this.globos = [];
  }

  // ================================================================
  // LA REVISIÓN
  // ================================================================

  /** Mira la agenda y encola lo que ya toca. Pública para poder forzarla. */
  async revisar(): Promise<void> {
    if (!this.activo || !localStorage.getItem('token')) { return; }

    try {
      // Sólo lo del propio usuario: el back filtra por su login
      const res: any = await firstValueFrom(this._gestionService.agenda({ mias: true, limite: 100 }));
      if (res?.status !== 'success') { return; }

      const ahora = Date.now();
      const vencen: GestionModel[] = (res.data?.data ?? []).filter((g: GestionModel) =>
        g?.id
        && g.estado === 'PENDIENTE'
        && this.esMia(g)
        && !this.avisadas.has(g.id)
        && !this.estaPospuesta(g.id, ahora)
        && this.leHaLlegadoLaHora(g, ahora)
      );

      if (!vencen.length) { return; }

      // Las más atrasadas primero
      for (const g of vencen) {
        if (!this.cola.some(c => c.id === g.id)) { this.cola.push(g); }
      }
      this.mostrarSiguiente();
    } catch (error) {
      // Sin conexión o sin permiso: se reintenta en la siguiente vuelta
      console.warn('No se pudo revisar la agenda de gestiones:', error);
    }
  }

  private leHaLlegadoLaHora(g: GestionModel, ahora: number): boolean {
    if (!g.fecha_programada) { return false; }
    const programada = new Date(String(g.fecha_programada).replace(' ', 'T')).getTime();
    if (!Number.isFinite(programada)) { return false; }
    return programada - RecordatorioGestionesService.MARGEN_MS <= ahora;
  }

  /**
   * ¿Es de quien está usando el CRM?
   *
   * Se compara con el login porque es lo único que hoy relaciona una gestión
   * con una persona. Si algún día seguridad.users guarda su empleado, aquí se
   * añade la comparación con empleado_id y el aviso será exacto.
   */
  private esMia(g: GestionModel): boolean {
    try {
      const u = JSON.parse(localStorage.getItem('user') ?? '{}');
      const login = (u?.login_user ?? '').toString().toUpperCase();
      if (!login) { return false; }
      if ((g.created_by ?? '').toString().toUpperCase() === login) { return true; }
      // Por si el usuario ya tiene empleado asociado (campo opcional)
      return !!u?.empleado_id && Number(u.empleado_id) === Number(g.empleado_id);
    } catch {
      return false;
    }
  }

  // ================================================================
  // EL AVISO
  // ================================================================

  private mostrarSiguiente(): void {
    if (this.mostrando || !this.cola.length || !this.activo) { return; }

    // «No molestar»: lo que toca se queda en la cola y sale cuando el usuario
    // vuelva a estar disponible. Mismo criterio que la campana, que tampoco
    // suena pero sigue contando lo que llega.
    if (this._presencia.noMolestar) { return; }

    const gestion = this.cola.shift()!;
    this.avisadas.add(gestion.id);
    this.mostrando = true;

    this.sonar();
    this.mostrarGlobo(gestion);

    const modalRef = this.modal.open(RecordatorioGestionComponent, {
      centered: true,
      size: 'md',
      backdrop: 'static',   // que no se cierre por un clic despistado
      keyboard: true,
      windowClass: 'recordatorio-modal',
    });
    modalRef.componentInstance.gestion = gestion;

    modalRef.componentInstance.resuelta.subscribe((r: RespuestaRecordatorio) => {
      if (r.accion === 'pospuesta') {
        this.posponer(r.gestion.id, r.minutos ?? 15);
      } else if (r.accion === 'cerrada') {
        this._cambio.next(r.gestion);
      }
    });

    // Se cierre como se cierre, el siguiente entra un momento después
    modalRef.result.then(
      () => this.liberar(),
      () => this.liberar(),
    );
  }

  private liberar(): void {
    this.mostrando = false;
    setTimeout(() => this.mostrarSiguiente(), RecordatorioGestionesService.ENTRE_AVISOS_MS);
  }

  /** Vuelve a avisar dentro de N minutos. */
  posponer(id: number, minutos: number): void {
    this.pospuestas[String(id)] = Date.now() + minutos * 60000;
    this.avisadas.delete(id);
    this.guardarPospuestas();
  }

  private estaPospuesta(id: number, ahora: number): boolean {
    const hasta = this.pospuestas[String(id)];
    if (!hasta) { return false; }
    if (hasta <= ahora) { delete this.pospuestas[String(id)]; this.guardarPospuestas(); return false; }
    return true;
  }

  private leerPospuestas(): Record<string, number> {
    try {
      const guardado = JSON.parse(localStorage.getItem(RecordatorioGestionesService.CLAVE_POSPUESTAS) ?? '{}');
      return typeof guardado === 'object' && guardado ? guardado : {};
    } catch {
      return {};
    }
  }

  private guardarPospuestas(): void {
    try {
      localStorage.setItem(RecordatorioGestionesService.CLAVE_POSPUESTAS, JSON.stringify(this.pospuestas));
    } catch { /* modo privado: se queda en memoria */ }
  }

  // ================================================================
  // SONIDO Y GLOBO
  // ================================================================

  /** El mismo timbre grave de los avisos de la campana. */
  private sonar(): void {
    try { this._aviso.sonar('AVISO'); } catch { /* sin audio, queda el modal */ }
  }

  /**
   * El globo del navegador, sólo si el CRM no está a la vista y el usuario ya
   * dio permiso: si está delante, el modal ya se ve.
   */
  private mostrarGlobo(g: GestionModel): void {
    try {
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') { return; }
      if (document.visibilityState === 'visible') { return; }

      const globo = new Notification('Toca hacer una gestión', {
        body: `${g.asunto}\n${g.cliente_nombre ?? ''}`,
        tag: 'gestion-' + g.id,
        requireInteraction: true,
      });
      globo.onclick = () => { window.focus(); globo.close(); };
      this.globos.push(globo);
    } catch (e) {
      console.warn('No se pudo mostrar el aviso del navegador:', e);
    }
  }
}
