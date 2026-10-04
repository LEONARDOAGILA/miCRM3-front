import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { NgbActiveModal, NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { Observable, Subject, firstValueFrom, from, merge, of } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';

import { GestionService } from '../../../services/gestion.service';
import { EmpleadoService } from '../../../../rh/services/empleado.service';
import { LoadingService } from '../../../../../service/loading.service';
import { ClienteModel } from '../../../interfaces/clienteModel';
import { ROLES_RESPONSABLE, RolResponsable } from '../../../interfaces/gestionModel';
// El vendedor es un empleado: se elige con el mismo selector que el jefe en RH
import { ListEmpleadosComponent } from '../../../../rh/pages/empleados/listEmpleados/listEmpleados.component';

/**
 * Pasar el cliente a otro vendedor (ventas.fn_clientes_reasignar).
 *
 * Deja constancia en ventas.asignaciones_clientes —quién lo tenía, quién lo
 * recibe y por qué— y, si se deja marcado, mueve con él las gestiones que
 * quedaban pendientes: si no, el vendedor nuevo hereda un cliente sin agenda
 * y el anterior sigue viendo llamadas de alguien que ya no atiende.
 */
@Component({
  selector: 'app-reasignarCliente',
  templateUrl: './reasignarCliente.component.html',
  styleUrls: ['./reasignarCliente.component.css'],
  standalone: false,
})
export class ReasignarClienteComponent implements OnInit, OnDestroy {

  @Input() cliente: ClienteModel | null = null;
  /** Cuántas gestiones pendientes tiene ahora mismo (sólo informativo) */
  @Input() pendientes = 0;
  /** Con qué papel se asigna. Sin indicar nada, el vendedor de siempre. */
  @Input() rol: RolResponsable = 'VENDEDOR';
  /**
   * Quién lo tiene ahora en ese papel, para no proponer a la misma persona.
   * Para el vendedor se cae a vendedor_id, que es donde vive.
   */
  @Input() actualId: number | null = null;

  @Output() reasignado = new EventEmitter<any>();

  public form!: FormGroup;
  public isLoading$ = this._loadingService.isLoading$;
  public guardando = false;

  /** «Reasignar vendedor», «Reasignar cobrador»… según con qué papel se abra. */
  get titulo(): string {
    const r = ROLES_RESPONSABLE.find(x => x.id === this.rol);
    return 'Reasignar ' + (r ? r.name.toLowerCase() : 'responsable');
  }

  /** Nombre del vendedor elegido, de sólo lectura como en saveCliente */
  public vendedorNombreControl = new FormControl({ value: '', disabled: true });

  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    public modal: NgbActiveModal,
    private modalService: NgbModal,
    private _toastr: ToastrService,
    private _loadingService: LoadingService,
    private _gestionService: GestionService,
    private _empleadoService: EmpleadoService,
  ) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      empleado_id:  [null, [Validators.required]],
      motivo:       ['', [Validators.maxLength(1000)]],
      mover_agenda: [true],
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get ctrlMoverAgenda(): FormControl { return this.form.controls['mover_agenda'] as FormControl; }

  get vendedorActual(): string {
    return this.cliente?.vendedor_nombre || 'Sin vendedor asignado';
  }

  /** Emite cuando el modal hijo se cierra o cuando este componente muere. */
  private hastaQueCierre(modalRef: NgbModalRef): Observable<unknown> {
    return merge(this.destroy$, from(modalRef.result).pipe(catchError(() => of(null))));
  }

  // ================================================================
  // ELEGIR VENDEDOR
  // ================================================================

  /** Escribir el ID y salir del campo también resuelve el vendedor. */
  async cargarVendedorPorId(): Promise<void> {
    const id = this.form.get('empleado_id')?.value;
    if (!id) { this.vendedorNombreControl.setValue(''); return; }
    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._empleadoService.findByIdEmpleado(id));
      if (res?.status === 'success') {
        this.vendedorNombreControl.setValue(res.data.nombre_completo);
      } else {
        this.vendedorNombreControl.setValue('');
        this.form.patchValue({ empleado_id: null });
        this._toastr.warning('Empleado no encontrado');
      }
    } catch (error) {
      this.form.patchValue({ empleado_id: null });
      this.vendedorNombreControl.setValue('');
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  abrirModalVendedores(): void {
    const modalRef = this.modalService.open(ListEmpleadosComponent, { size: 'lg', centered: true, backdrop: 'static' });
    modalRef.componentInstance.empleadoSeleccionadoId = this.form.get('empleado_id')?.value;
    modalRef.componentInstance.ayuda = 'Haz clic sobre el vendedor que se hará cargo del cliente.';
    modalRef.componentInstance.seleccionado
      .pipe(takeUntil(this.hastaQueCierre(modalRef)))
      .subscribe((vendedor: any) => {
        this.form.patchValue({ empleado_id: vendedor.id });
        this.vendedorNombreControl.setValue(vendedor.nombre_completo);
      });
  }

  // ================================================================
  // GUARDAR
  // ================================================================

  public async onSubmitForm($ev?: any): Promise<void> {
    $ev?.preventDefault?.();
    this._toastr.clear();
    this.form.markAllAsTouched();

    if (!this.cliente?.id) { return; }
    if (!this.form.get('empleado_id')?.value) {
      this._toastr.error('Elija el vendedor que se hará cargo.', 'No se puede reasignar', { timeOut: 8000, closeButton: true });
      return;
    }
    const actual = this.actualId ?? (this.rol === 'VENDEDOR' ? this.cliente.vendedor_id : null);
    if (actual && Number(this.form.get('empleado_id')?.value) === Number(actual)) {
      this._toastr.warning('El cliente ya tiene a esa persona en ese papel.', 'Sin cambios');
      return;
    }

    const v = this.form.getRawValue();
    try {
      this.guardando = true;
      this._loadingService.setLoading(true);

      const res: any = await firstValueFrom(this._gestionService.reasignar(this.cliente.id, {
        empleado_id: Number(v.empleado_id),
        motivo: (v.motivo ?? '').trim() || null,
        mover_agenda: v.mover_agenda !== false,
        rol: this.rol,
      }));

      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo reasignar el cliente', 'Error');
        return;
      }

      this.reasignado.emit(res.data);
      this._toastr.success(res.message, 'Asignación actualizada', { closeButton: true });
      this.modal.close(res.data);
    } catch (error) {
      // El AuthInterceptor ya muestra el toast del error HTTP
      console.error('Error al reasignar el cliente:', error);
    } finally {
      this.guardando = false;
      this._loadingService.setLoading(false);
    }
  }
}
