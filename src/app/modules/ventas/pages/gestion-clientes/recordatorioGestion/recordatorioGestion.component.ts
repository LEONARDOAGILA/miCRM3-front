import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';

import { GestionService } from '../../../services/gestion.service';
import { GestionModel, RESULTADOS_GESTION, iconoDeTipo, nombreDe, TIPOS_GESTION } from '../../../interfaces/gestionModel';

/** Lo que el usuario decidió hacer con el recordatorio. */
export interface RespuestaRecordatorio {
  /** 'cerrada' se guardó, 'pospuesta' vuelve a avisar, 'ignorada' se cierra sin más */
  accion: 'cerrada' | 'pospuesta' | 'ignorada';
  minutos?: number;
  gestion: GestionModel;
}

/**
 * El aviso de que llegó la hora de una gestión programada.
 *
 * Sale solo, encima de lo que esté haciendo el usuario, con lo justo para
 * resolverla en el sitio: llamar, cerrarla con su resultado o posponerla. Si
 * hace falta más (ver el historial, reprogramar con detalle) hay un botón que
 * lleva a la pantalla de gestión con el cliente ya cargado.
 *
 * Es standalone a propósito: lo abre un servicio de raíz desde la cabecera,
 * que está en todas las pantallas, así que no puede depender de que el módulo
 * de ventas esté cargado.
 */
@Component({
  selector: 'app-recordatorioGestion',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './recordatorioGestion.component.html',
  styleUrls: ['./recordatorioGestion.component.css'],
})
export class RecordatorioGestionComponent implements OnInit {

  @Input() gestion!: GestionModel;

  @Output() resuelta = new EventEmitter<RespuestaRecordatorio>();

  public resultados = RESULTADOS_GESTION;
  public resultado = 'CONTACTADO';
  public nota = '';
  public duracion: number | null = null;
  public guardando = false;
  /** El formulario de cierre empieza plegado: casi siempre se pospone o se llama */
  public cerrando = false;

  constructor(
    public modal: NgbActiveModal,
    private router: Router,
    private _toastr: ToastrService,
    private _gestionService: GestionService,
  ) {}

  ngOnInit(): void {
    this.nota = this.gestion?.nota ?? '';
    this.duracion = this.gestion?.duracion_minutos ?? null;
  }

  get icono(): string { return iconoDeTipo(this.gestion?.tipo); }
  get tipoNombre(): string { return nombreDe(TIPOS_GESTION, this.gestion?.tipo); }

  get telefono(): string { return (this.gestion?.telefono ?? '').trim(); }

  get enlaceTelefono(): string {
    return this.telefono ? 'tel:' + this.telefono.replace(/\s/g, '') : '';
  }

  get enlaceWhatsapp(): string {
    const limpio = this.telefono.replace(/\D/g, '');
    if (!limpio) { return ''; }
    // Ecuador: 0991234567 → 593991234567
    return 'https://wa.me/' + (limpio.startsWith('0') ? '593' + limpio.substring(1) : limpio);
  }

  /** «Vencida hace 10 min» / «Es ahora» / «En 3 min». */
  get cuando(): string {
    const fecha = this.gestion?.fecha_programada;
    if (!fecha) { return ''; }
    const programada = new Date(fecha.replace(' ', 'T')).getTime();
    const minutos = Math.round((Date.now() - programada) / 60000);
    if (minutos <= 0) { return minutos === 0 ? 'Es ahora' : `En ${-minutos} min`; }
    if (minutos < 60) { return `Hace ${minutos} min`; }
    const horas = Math.floor(minutos / 60);
    if (horas < 24) { return `Hace ${horas} h`; }
    return `Hace ${Math.floor(horas / 24)} día(s)`;
  }

  // ================================================================
  // ACCIONES
  // ================================================================

  posponer(minutos: number): void {
    this.resuelta.emit({ accion: 'pospuesta', minutos, gestion: this.gestion });
    this.modal.close({ accion: 'pospuesta', minutos });
  }

  ignorar(): void {
    this.resuelta.emit({ accion: 'ignorada', gestion: this.gestion });
    this.modal.dismiss('ignorada');
  }

  /** Lleva a la pantalla de gestión con este cliente ya cargado. */
  abrirCliente(): void {
    this.resuelta.emit({ accion: 'ignorada', gestion: this.gestion });
    this.modal.dismiss('abrir');
    this.router.navigate(['/ventas/gestionClientes'], { queryParams: { cliente: this.gestion.cliente_id } });
  }

  /** Cierra la gestión sin salir del aviso. */
  async cerrar(): Promise<void> {
    if (!this.gestion?.id || this.guardando) { return; }
    try {
      this.guardando = true;
      const res: any = await firstValueFrom(this._gestionService.cerrarGestion(this.gestion.id, {
        resultado: this.resultado,
        nota: (this.nota ?? '').trim() || null,
        duracion_minutos: this.duracion === null || (this.duracion as any) === '' ? null : Number(this.duracion),
      }));

      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo cerrar la gestión', 'Error');
        return;
      }

      this._toastr.success(res.message, 'Gestión cerrada', { closeButton: true });
      this.resuelta.emit({ accion: 'cerrada', gestion: this.gestion });
      this.modal.close({ accion: 'cerrada' });
    } catch (error) {
      // El AuthInterceptor ya muestra el toast del error HTTP
      console.error('Error al cerrar la gestión desde el recordatorio:', error);
    } finally {
      this.guardando = false;
    }
  }
}
