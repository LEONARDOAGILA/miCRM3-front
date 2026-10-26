import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';

import { ModalArrastrableDirective } from '../../../../../components/modal/modal-arrastrable.directive';
import { ProformaService } from '../../../services/proforma.service';
import {
  ESTADOS_PROFORMA, EstadoProforma, ProformaModel, TRANSICIONES_PROFORMA,
  claseEstado, etiquetaEstado,
} from '../../../interfaces/proformaModel';

/**
 * Mover la proforma de estado: enviarla, aprobarla, rechazarla o anularla.
 *
 * Está aparte del formulario a propósito. Guardar la ficha es «he cambiado
 * los precios»; esto es «el cliente dijo que sí», y son dos cosas que no
 * deben poder pasar por descuido la una por la otra.
 *
 * SÓLO SE OFRECE LO QUE SE PUEDE. Las transiciones son las mismas que
 * comprueba la base (TRANSICIONES_PROFORMA ↔ fn_proformas_cambiar_estado):
 * una aprobada no sale de ahí, y lo que haya que volver a ofertar se duplica.
 *
 * LA VENCIDA ES EL CASO ESPECIAL: volver a enviarla no es un cambio de estado
 * sino RENOVARLA, porque le cambia la fecha al documento, y eso no puede
 * pasar escondido dentro de un «enviar».
 */
@Component({
  selector: 'app-estadoProforma',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalArrastrableDirective],
  templateUrl: './estadoProforma.component.html',
  styleUrls: ['./estadoProforma.component.css'],
})
export class EstadoProformaComponent implements OnInit {

  @Input() registro_selected!: ProformaModel | any;
  /** Si llega, el modal se abre con ese estado ya elegido. */
  @Input() estadoSugerido: EstadoProforma | null = null;
  @Output() registrosE: EventEmitter<any> = new EventEmitter();

  public elegido: EstadoProforma | null = null;
  public motivo = '';
  /** Al renovar: con cuántos días de validez vuelve a salir. */
  public validezDias: number | null = null;
  public guardando = false;

  public readonly etiquetaEstado = etiquetaEstado;
  public readonly claseEstado = claseEstado;

  /** Lo que se le puede ofrecer: campo, no getter (va a un @for). */
  public opciones: Array<{ id: EstadoProforma; name: string; clase: string; icono: string; ayuda: string }> = [];

  constructor(
    public modal: NgbActiveModal,
    private _toastr: ToastrService,
    private _proformaService: ProformaService,
  ) {}

  ngOnInit(): void {
    const actual = (this.registro_selected?.estado ?? 'BORRADOR') as EstadoProforma;
    const permitidos = TRANSICIONES_PROFORMA[actual] ?? [];

    this.opciones = ESTADOS_PROFORMA.filter(e => permitidos.includes(e.id));
    this.validezDias = Number(this.registro_selected?.validez_dias ?? 15);

    if (this.estadoSugerido && permitidos.includes(this.estadoSugerido)) {
      this.elegido = this.estadoSugerido;
    } else if (this.opciones.length === 1 && !this.puedeRenovar) {
      // Con una sola salida no hay nada que elegir
      this.elegido = this.opciones[0].id;
    }
  }

  get estadoActual(): EstadoProforma {
    return (this.registro_selected?.estado ?? 'BORRADOR') as EstadoProforma;
  }

  /** Una vencida (o una enviada pasada de fecha) se puede renovar. */
  get puedeRenovar(): boolean {
    return this.estadoActual === 'VENCIDA'
        || (this.estadoActual === 'ENVIADA' && !!this.registro_selected?.vencida);
  }

  /** Sin motivo no se rechaza: un «no» sin motivo no sirve seis meses después. */
  get motivoObligatorio(): boolean { return this.elegido === 'RECHAZADA'; }

  get puedeGuardar(): boolean {
    if (this.guardando) { return false; }
    if (!this.elegido)  { return false; }
    if (this.motivoObligatorio && !this.motivo.trim()) { return false; }
    return true;
  }

  /** Qué va a pasar, dicho en una frase antes de pulsar. */
  get consecuencia(): string {
    switch (this.elegido) {
      case 'ENVIADA':   return 'Queda a la espera de respuesta y se guarda la fecha de envío.';
      case 'APROBADA':  return 'Es lo que el cliente aceptó: ya no se podrá cambiar ni eliminar.';
      case 'RECHAZADA': return 'Se guarda el motivo para saber por qué se perdió.';
      case 'VENCIDA':   return 'Se marca como pasada de fecha; se puede renovar más adelante.';
      case 'ANULADA':   return 'Se da de baja y ya no se podrá cambiar. Se seguirá viendo en el listado.';
      case 'BORRADOR':  return 'Vuelve a poderse cambiar, y se borra el rastro del envío anterior.';
      default:          return '';
    }
  }

  async confirmar(): Promise<void> {
    if (!this.puedeGuardar) { return; }

    try {
      this.guardando = true;
      const res: any = await firstValueFrom(
        this._proformaService.cambiarEstado(this.registro_selected.id, this.elegido!, this.motivo.trim() || null)
      );

      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo cambiar el estado', 'Error');
        return;
      }

      this._toastr.success(res.message, 'Listo', { closeButton: true });
      this.registrosE.emit(res.data);
      this.modal.close(res.data);

    } catch (e) {
      // El AuthInterceptor ya enseñó el error HTTP (el 409 con su motivo)
      console.error('Error al cambiar el estado:', e);
    } finally {
      this.guardando = false;
    }
  }

  /** Renovar: fecha de hoy y otra vez enviada, con los mismos precios. */
  async renovar(): Promise<void> {
    if (this.guardando) { return; }

    try {
      this.guardando = true;
      const res: any = await firstValueFrom(
        this._proformaService.renovarProforma(this.registro_selected.id, this.validezDias)
      );

      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo renovar la proforma', 'Error');
        return;
      }

      this._toastr.success(res.message, 'Listo', { closeButton: true });
      this.registrosE.emit(res.data);
      this.modal.close(res.data);

    } catch (e) {
      console.error('Error al renovar la proforma:', e);
    } finally {
      this.guardando = false;
    }
  }
}
