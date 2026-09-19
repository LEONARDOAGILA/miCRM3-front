import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { Subject, firstValueFrom } from 'rxjs';

import { SeguridadService } from '../../../../seguridad/services/seguridad.service';
import { LoadingService } from '../../../../../service/loading.service';
import { CargoService } from '../../../services/cargo.service';
import { CargoModel, NIVELES_CARGO } from '../../../interfaces/cargoModel';

/** Acciones con las que se abre el modal desde allCargos. */
type AccionCargo = 'add' | 'edit' | 'clon' | 'view';

/**
 * Alta, modificación, clonación y vista de un cargo (rh.cargos).
 *
 * Mismo esquema que saveUser / save-horario: formulario reactivo, paneles
 * del tema, campos app-campo*, y el pie con Guardar (app-modal-footer).
 * En 'view' el formulario va deshabilitado y no hay botón de guardar.
 * Al guardar con éxito emite el registro por `registrosE` y cierra: el
 * listado lo pone en la grilla sin volver al servidor.
 */
@Component({
  selector: 'app-saveCargo',
  templateUrl: './saveCargo.component.html',
  styleUrls: ['./saveCargo.component.css'],
  standalone: false,
})
export class SaveCargoComponent implements OnInit, OnDestroy {

  /** Registro a editar / clonar / ver, o 0 al crear. */
  @Input() registro_selected: any = {};
  @Input() accion: AccionCargo = 'add';
  @Output() registrosE: EventEmitter<any> = new EventEmitter();

  public form: FormGroup;
  public isLoading$ = this._loadingService.isLoading$;
  public response: any;
  public isdisabled = false;
  public titulo = '';
  public textoClon = '';
  public cargoModel: CargoModel | null = null;

  /** Opciones del combo Nivel. */
  public niveles = NIVELES_CARGO;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    public modal: NgbActiveModal,
    private _toastr: ToastrService,
    private _loadingService: LoadingService,
    private _seguridadService: SeguridadService,
    private _cargoService: CargoService,
  ) {}

  // ================================================================
  // ESTADO DERIVADO
  // ================================================================

  get esView(): boolean { return this.accion === 'view'; }
  get esNuevo(): boolean { return this.accion === 'add' || this.accion === 'clon'; }
  get ctrlActivo(): FormControl { return this.form.controls['activo'] as FormControl; }

  /** Empleados con este cargo (sólo informativo, viene del back). */
  get numEmpleados(): number { return Number(this.cargoModel?.num_empleados ?? this.registro_selected?.num_empleados ?? 0); }

  // ================================================================
  // CICLO DE VIDA
  // ================================================================

  async ngOnInit(): Promise<void> {
    if (this._seguridadService.isexpired()) {
      this.modal.close();
      return;
    }

    this.isdisabled = this.esView;
    this.initializeForm();

    switch (this.accion) {
      case 'add':
        this.titulo = 'Nuevo Cargo';
        break;
      case 'edit':
        this.titulo = 'Modificar Cargo';
        await this.findByIdCargo(this.registro_selected.id);
        break;
      case 'clon':
        this.titulo = 'Clonar Cargo';
        this.textoClon = '_CLON';
        await this.findByIdCargo(this.registro_selected.id);
        break;
      case 'view':
        this.titulo = 'Ver Cargo';
        await this.findByIdCargo(this.registro_selected.id);
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
      nombre:       [{ value: '', disabled: this.isdisabled }, [Validators.required, Validators.minLength(3), Validators.maxLength(100)]],
      nivel:        [{ value: null, disabled: this.isdisabled }],
      salario_base: [{ value: null, disabled: this.isdisabled }, [Validators.min(0), Validators.max(999999999)]],
      descripcion:  [{ value: '', disabled: this.isdisabled }, [Validators.maxLength(1000)]],
      activo:       [{ value: true, disabled: this.isdisabled }],
    });
  }

  //   ******   CARGA EL REGISTRO   ******  //
  async findByIdCargo(id: number): Promise<void> {
    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._cargoService.findByIdCargo(id));
      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo obtener el cargo', 'Error');
        return;
      }
      this.cargoModel = res.data;
      this.form.patchValue({
        nombre:       (this.cargoModel!.nombre ?? '') + this.textoClon,
        nivel:        this.cargoModel!.nivel ?? null,
        salario_base: this.cargoModel!.salario_base != null ? Number(this.cargoModel!.salario_base) : null,
        descripcion:  this.cargoModel!.descripcion ?? '',
        activo:       this.cargoModel!.activo !== false,
      });
    } catch (error) {
      // El AuthInterceptor ya muestra el toast del error HTTP
      console.error('Error al cargar el cargo:', error);
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  // ================================================================
  // GUARDAR
  // ================================================================

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
    // Salario vacío → null (el back lo admite); texto → número
    payload.salario_base = (payload.salario_base === '' || payload.salario_base === null || payload.salario_base === undefined)
      ? null
      : Number(payload.salario_base);
    payload.nivel = payload.nivel || null;
    payload.descripcion = (payload.descripcion ?? '').trim() || null;

    await this.saveRecord(payload);
  }

  //   ******   GRABAR DATA  ******  //
  private async saveRecord(data: Partial<CargoModel>): Promise<void> {
    try {
      this._loadingService.setLoading(true);
      this.isdisabled = true;

      if (this.accion === 'edit') {
        this.response = await firstValueFrom(this._cargoService.editCargo(this.registro_selected.id, data));
      } else {
        this.response = await firstValueFrom(
          this.accion === 'clon' ? this._cargoService.clonCargo(data) : this._cargoService.addCargo(data)
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
      // El AuthInterceptor ya notificó el error HTTP (422 / 409 con el motivo): aquí sólo reactivamos el form.
      console.error('Error al guardar el cargo:', error);
      this.isdisabled = false;
    } finally {
      this._loadingService.setLoading(false);
    }
  }
}
