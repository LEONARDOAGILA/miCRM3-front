import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { Subject, firstValueFrom } from 'rxjs';

import { SeguridadService } from '../../../../seguridad/services/seguridad.service';
import { LoadingService } from '../../../../../service/loading.service';
import { DepartamentoService } from '../../../services/departamento.service';
import { DepartamentoModel, ResponsableOpcion } from '../../../interfaces/departamentoModel';

type AccionDepartamento = 'add' | 'edit' | 'clon' | 'view';

/**
 * Alta, modificación, clonación y vista de un departamento (rh.departamentos).
 * Mismo esquema que saveCargo. El responsable se elige de un combo con los
 * empleados activos (rh.fn_departamentos_responsables).
 */
@Component({
  selector: 'app-saveDepartamento',
  templateUrl: './saveDepartamento.component.html',
  styleUrls: ['./saveDepartamento.component.css'],
  standalone: false,
})
export class SaveDepartamentoComponent implements OnInit, OnDestroy {

  @Input() registro_selected: any = {};
  @Input() accion: AccionDepartamento = 'add';
  @Output() registrosE: EventEmitter<any> = new EventEmitter();

  public form: FormGroup;
  public isLoading$ = this._loadingService.isLoading$;
  public response: any;
  public isdisabled = false;
  public titulo = '';
  public textoClon = '';
  public departamentoModel: DepartamentoModel | null = null;

  /** Empleados activos para el combo "Responsable". */
  public responsables: ResponsableOpcion[] = [];

  private readonly destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    public modal: NgbActiveModal,
    private _toastr: ToastrService,
    private _loadingService: LoadingService,
    private _seguridadService: SeguridadService,
    private _departamentoService: DepartamentoService,
  ) {}

  get esView(): boolean { return this.accion === 'view'; }
  get esNuevo(): boolean { return this.accion === 'add' || this.accion === 'clon'; }
  get ctrlActivo(): FormControl { return this.form.controls['activo'] as FormControl; }
  get numEmpleados(): number { return Number(this.departamentoModel?.num_empleados ?? this.registro_selected?.num_empleados ?? 0); }

  /** Nombre del responsable elegido (para la vista de sólo lectura y el resumen). */
  get nombreResponsable(): string {
    const id = this.form?.controls['empleado_id']?.value;
    return this.responsables.find(r => r.id === id)?.nombre ?? this.departamentoModel?.responsable ?? '';
  }

  async ngOnInit(): Promise<void> {
    if (this._seguridadService.isexpired()) {
      this.modal.close();
      return;
    }

    this.isdisabled = this.esView;
    this.initializeForm();
    await this.cargarResponsables();

    switch (this.accion) {
      case 'add':
        this.titulo = 'Nuevo Departamento';
        break;
      case 'edit':
        this.titulo = 'Modificar Departamento';
        await this.findByIdDepartamento(this.registro_selected.id);
        break;
      case 'clon':
        this.titulo = 'Clonar Departamento';
        this.textoClon = '_CLON';
        await this.findByIdDepartamento(this.registro_selected.id);
        break;
      case 'view':
        this.titulo = 'Ver Departamento';
        await this.findByIdDepartamento(this.registro_selected.id);
        break;
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  //   ******   INICIALIZA FORMULARIO   ******  //
  initializeForm(): void {
    this.form = this.fb.group({
      nombre:      [{ value: '', disabled: this.isdisabled }, [Validators.required, Validators.minLength(3), Validators.maxLength(100)]],
      codigo:      [{ value: '', disabled: this.isdisabled }, [Validators.maxLength(20)]],
      empleado_id: [{ value: null, disabled: this.isdisabled }],
      descripcion: [{ value: '', disabled: this.isdisabled }, [Validators.maxLength(1000)]],
      activo:      [{ value: true, disabled: this.isdisabled }],
    });
  }

  //   ******   RESPONSABLES (combo)   ******  //
  async cargarResponsables(): Promise<void> {
    try {
      const res: any = await firstValueFrom(this._departamentoService.listResponsables());
      this.responsables = res?.status === 'success' ? (res.data ?? []) : [];
    } catch (error) {
      console.error('Error al cargar responsables:', error);   // el interceptor ya avisó
      this.responsables = [];
    }
  }

  //   ******   CARGA EL REGISTRO   ******  //
  async findByIdDepartamento(id: number): Promise<void> {
    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._departamentoService.findByIdDepartamento(id));
      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo obtener el departamento', 'Error');
        return;
      }
      this.departamentoModel = res.data;
      this.form.patchValue({
        nombre:      (this.departamentoModel!.nombre ?? '') + this.textoClon,
        // Al clonar el código debe ser único: se deja vacío para que lo escriba el usuario
        codigo:      this.accion === 'clon' ? '' : (this.departamentoModel!.codigo ?? ''),
        empleado_id: this.departamentoModel!.empleado_id ?? null,
        descripcion: this.departamentoModel!.descripcion ?? '',
        activo:      this.departamentoModel!.activo !== false,
      });
    } catch (error) {
      console.error('Error al cargar el departamento:', error);
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  //   ******   VALIDA FORMULARIO   ******  //
  public async onSubmitForm($ev?: any): Promise<void> {
    $ev?.preventDefault?.();
    this._toastr.clear();
    Object.values(this.form.controls).forEach(control => control.markAsTouched());

    if (this.form.invalid) {
      this._toastr.error('Revise los campos del formulario.', 'No se puede Guardar', { timeOut: 20000, closeButton: true });
      return;
    }

    const payload = this.form.getRawValue();
    payload.codigo = (payload.codigo ?? '').trim().toUpperCase() || null;
    payload.descripcion = (payload.descripcion ?? '').trim() || null;
    payload.empleado_id = payload.empleado_id || null;

    await this.saveRecord(payload);
  }

  //   ******   GRABAR DATA  ******  //
  private async saveRecord(data: Partial<DepartamentoModel>): Promise<void> {
    try {
      this._loadingService.setLoading(true);
      this.isdisabled = true;

      if (this.accion === 'edit') {
        this.response = await firstValueFrom(this._departamentoService.editDepartamento(this.registro_selected.id, data));
      } else {
        this.response = await firstValueFrom(
          this.accion === 'clon' ? this._departamentoService.clonDepartamento(data) : this._departamentoService.addDepartamento(data)
        );
      }

      if (this.response?.status !== 'success') {
        this.isdisabled = false;
        return;
      }

      this.registrosE.emit(this.response.data);
      this._toastr.success(this.response.message, 'Éxito', { closeButton: true });
      this.modal.close(this.response.data);
    } catch (error: any) {
      // El AuthInterceptor ya notificó el error HTTP (422 / 409 con el motivo)
      console.error('Error al guardar el departamento:', error);
      this.isdisabled = false;
    } finally {
      this._loadingService.setLoading(false);
    }
  }
}
