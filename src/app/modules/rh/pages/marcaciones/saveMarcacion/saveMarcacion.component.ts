import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { NgbActiveModal, NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { Observable, Subject, firstValueFrom, from, merge, of } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';

import { SeguridadService } from '../../../../seguridad/services/seguridad.service';
import { MarcacionService } from '../../../services/marcacion.service';
import { LoadingService } from '../../../../../service/loading.service';
import { MarcacionModel, ORIGENES_MARCACION, TIPOS_MARCACION } from '../../../interfaces/marcacionModel';
import { ListEmpleadosComponent } from '../../empleados/listEmpleados/listEmpleados.component';

/**
 * Alta manual, corrección o vista de una marcación.
 *
 *   add   → elegir empleado, tipo, fecha y hora (origen MANUAL)
 *   edit  → sólo se pueden corregir tipo, fecha/hora y observación
 *   view  → sólo lectura, con la foto del momento si la hay
 */
@Component({
  selector: 'app-saveMarcacion',
  templateUrl: './saveMarcacion.component.html',
  styleUrls: ['./saveMarcacion.component.css'],
  standalone: false,
})
export class SaveMarcacionComponent implements OnInit, OnDestroy {

  @Input() registro_selected: any = {};
  @Input() accion: 'add' | 'edit' | 'view' = 'add';
  @Output() registrosE: EventEmitter<MarcacionModel> = new EventEmitter();

  public titulo = '';
  public form!: FormGroup;
  public isdisabled = false;
  public esView = false;
  public esNuevo = false;
  public marcacion: MarcacionModel | null = null;
  public isLoading$ = this._loadingService.isLoading$;
  public tipos = TIPOS_MARCACION;
  public origenes = ORIGENES_MARCACION;

  /** Nombre del empleado (el id va en el formulario) */
  public empleadoNombreControl = new FormControl({ value: '', disabled: true });

  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private _toastr: ToastrService,
    public activeModal: NgbActiveModal,
    private modalService: NgbModal,
    private _loadingService: LoadingService,
    private _seguridadService: SeguridadService,
    private _marcacionService: MarcacionService,
  ) {}

  ngOnInit(): void {
    if (this._seguridadService.isexpired()) { this.activeModal.close(); return; }
    this.esView = this.accion === 'view';
    this.esNuevo = this.accion === 'add';
    this.isdisabled = this.esView;
    this.initializeForm();

    switch (this.accion) {
      case 'add':
        this.titulo = 'Registrar marcación';
        this.form.patchValue({ fecha: this.hoyIso(), hora: this.horaActual(), tipo: 'ENTRADA' });
        break;
      case 'edit':
      case 'view':
        this.titulo = this.esView ? 'Ver marcación' : 'Corregir marcación';
        this.cargar(this.registro_selected);
        break;
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private hastaQueCierre(modalRef: NgbModalRef): Observable<unknown> {
    return merge(this.destroy$, from(modalRef.result).pipe(catchError(() => of(null))));
  }

  private hoyIso(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private horaActual(): string {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  initializeForm(): void {
    this.form = this.fb.group({
      empleado_id: [{ value: null, disabled: this.isdisabled }, [Validators.required]],
      tipo:        [{ value: 'ENTRADA', disabled: this.isdisabled }, [Validators.required]],
      fecha:       [{ value: '', disabled: this.isdisabled }, [Validators.required]],
      hora:        [{ value: '', disabled: this.isdisabled }, [Validators.required]],
      observacion: [{ value: '', disabled: this.isdisabled }, [Validators.maxLength(1000)]],
    });
  }

  private cargar(m: MarcacionModel): void {
    this.marcacion = m;
    this.form.patchValue({
      empleado_id: m.empleado_id,
      tipo: m.tipo,
      fecha: m.fecha,
      hora: (m.hora ?? '').slice(0, 5),
      observacion: m.observacion ?? '',
    });
    this.empleadoNombreControl.setValue(m.empleado);
    // El empleado de una marcación existente no se cambia (sería otra marcación)
    this.form.get('empleado_id')?.disable();
  }

  get fotoUrl(): string | null {
    return this.marcacion?.foto ? this._marcacionService.getImagenMarcacion(this.marcacion.id) : null;
  }

  get textoOrigen(): string {
    return this.origenes.find(o => o.id === this.marcacion?.origen)?.name ?? (this.marcacion?.origen ?? '');
  }

  elegirEmpleado(): void {
    if (this.isdisabled || !this.esNuevo) { return; }
    const modalRef = this.modalService.open(ListEmpleadosComponent, { size: 'lg', centered: true, backdrop: 'static' });
    modalRef.componentInstance.empleadoSeleccionadoId = this.form.get('empleado_id')?.value;
    modalRef.componentInstance.ayuda = 'Haz clic sobre el empleado que marca.';
    modalRef.componentInstance.seleccionado
      .pipe(takeUntil(this.hastaQueCierre(modalRef)))
      .subscribe((e: any) => {
        this.form.patchValue({ empleado_id: e.id });
        this.empleadoNombreControl.setValue(e.nombre_completo || `${e.nombres} ${e.apellidos}`);
      });
  }

  async onSubmitForm(_ev: any): Promise<void> {
    this._toastr.clear();
    Object.values(this.form.controls).forEach(c => c.markAsTouched());
    if (this.esNuevo && !this.form.get('empleado_id')?.value) {
      this._toastr.error('Debe elegir el empleado', 'Marcación');
      return;
    }
    if (this.form.invalid) {
      this._toastr.error('Revise los campos del formulario.', 'No se puede Guardar', { timeOut: 20000, closeButton: true });
      return;
    }

    const v = this.form.getRawValue();
    const fechaHora = `${v.fecha} ${v.hora}:00`;

    try {
      this._loadingService.setLoading(true);
      this.isdisabled = true;
      const res: any = this.esNuevo
        ? await firstValueFrom(this._marcacionService.addMarcacion({
            empleado_id: v.empleado_id, tipo: v.tipo, origen: 'MANUAL',
            fecha_hora: fechaHora, observacion: v.observacion || null,
          }))
        : await firstValueFrom(this._marcacionService.editMarcacion(this.registro_selected.id, {
            tipo: v.tipo, fecha_hora: fechaHora, observacion: v.observacion || null,
          }));

      if (res?.status !== 'success') { this.isdisabled = false; return; }
      this.registrosE.emit(res.data);
      this._toastr.success(res.message, 'Éxito', { closeButton: true });
      this.activeModal.close(res.data);
    } catch (e) {
      this.isdisabled = false;   // el interceptor ya avisó
    } finally {
      this._loadingService.setLoading(false);
    }
  }
}
