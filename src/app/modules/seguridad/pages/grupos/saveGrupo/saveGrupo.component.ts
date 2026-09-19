import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { NgbActiveModal, NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { Observable, Subject, firstValueFrom, from, merge, of } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';

import { SeguridadService } from '../../../services/seguridad.service';
import { GrupoService } from '../../../services/grupo.service';
import { ProfileService } from '../../../services/profile.service';
import { HorarioService } from '../../../services/horario.service';
import { LoadingService } from '../../../../../service/loading.service';
import { GrupoModel, TIPOS_ACCESO } from '../../../interfaces/grupoModel';
import { ListProfileComponent } from '../../profiles/listProfile/listProfile.component';
import { ListHorariosComponent } from '../../horarios/listHorarios/listHorarios.component';
import { ListGruposComponent } from '../listGrupos/listGrupos.component';

/**
 * Alta / modificación / vista de un grupo de usuarios.
 *
 * El grupo lleva los valores por defecto que heredan sus usuarios: perfil,
 * horario, si administran y el tipo de acceso. Perfil, horario y grupo
 * padre se eligen con el mismo lookup (id + nombre + lupa) que saveUser.
 *
 *   registro_selected  grupo (edit / view); 0 al crear
 *   accion             'add' | 'edit' | 'view'
 *   padreInicial       al crear un subgrupo desde el árbol: el padre ya puesto
 */
@Component({
  selector: 'app-saveGrupo',
  templateUrl: './saveGrupo.component.html',
  styleUrls: ['./saveGrupo.component.css'],
  standalone: false,
})
export class SaveGrupoComponent implements OnInit, OnDestroy {

  @Input() registro_selected: any = {};
  @Input() accion: 'add' | 'edit' | 'view' = 'add';
  @Input() padreInicial: { id: number; nombre: string; ruta?: string } | null = null;
  @Output() registrosE: EventEmitter<GrupoModel> = new EventEmitter();

  public titulo = '';
  public form!: FormGroup;
  public isdisabled = false;
  public esView = false;
  public esNuevo = false;
  public grupoModel: GrupoModel | null = null;
  public isLoading$ = this._loadingService.isLoading$;
  public tiposAcceso = TIPOS_ACCESO;

  /** Nombres de los lookups (sólo lectura; el id va en el formulario). */
  public padreNombreControl = new FormControl({ value: '', disabled: true });
  public perfilNombreControl = new FormControl({ value: '', disabled: true });
  public horarioNombreControl = new FormControl({ value: '', disabled: true });

  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private _toastr: ToastrService,
    public activeModal: NgbActiveModal,
    private modalService: NgbModal,
    private _loadingService: LoadingService,
    private _seguridadService: SeguridadService,
    private _grupoService: GrupoService,
    private _profileService: ProfileService,
    private _horarioService: HorarioService,
  ) {}

  async ngOnInit(): Promise<void> {
    if (this._seguridadService.isexpired()) {
      this.activeModal.close();
      return;
    }
    this.esView = this.accion === 'view';
    this.esNuevo = this.accion === 'add';
    this.isdisabled = this.esView;
    this.initializeForm();

    switch (this.accion) {
      case 'add':
        this.titulo = this.padreInicial ? `Nuevo subgrupo de «${this.padreInicial.nombre}»` : 'Nuevo grupo';
        if (this.padreInicial) {
          this.form.patchValue({ padre_id: this.padreInicial.id });
          this.padreNombreControl.setValue(this.padreInicial.ruta || this.padreInicial.nombre);
        }
        break;
      case 'edit':
        this.titulo = 'Modificar grupo';
        await this.findByIdGrupo(this.registro_selected.id);
        break;
      case 'view':
        this.titulo = 'Ver grupo';
        await this.findByIdGrupo(this.registro_selected.id);
        break;
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** Hasta que se cierre el modal hijo o se destruya este componente. */
  private hastaQueCierre(modalRef: NgbModalRef): Observable<unknown> {
    return merge(this.destroy$, from(modalRef.result).pipe(catchError(() => of(null))));
  }

  initializeForm(): void {
    this.form = this.fb.group({
      nombre:           [{ value: '', disabled: this.isdisabled }, [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
      padre_id:         [{ value: null, disabled: this.isdisabled }],
      descripcion:      [{ value: '', disabled: this.isdisabled }, [Validators.maxLength(1000)]],
      perfil_id:        [{ value: null, disabled: this.isdisabled }],
      chorario_id:      [{ value: null, disabled: this.isdisabled }],
      es_administrador: [{ value: false, disabled: this.isdisabled }],
      tipo_acceso:      [{ value: 'SISTEMA', disabled: this.isdisabled }, [Validators.required]],
      activo:           [{ value: true, disabled: this.isdisabled }],
    });
  }

  private async findByIdGrupo(id: number): Promise<void> {
    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._grupoService.findByIdGrupo(id));
      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo cargar el grupo', 'Error');
        return;
      }
      this.grupoModel = res.data;
      const g = this.grupoModel!;
      this.form.patchValue({
        nombre: g.nombre,
        padre_id: g.padre_id,
        descripcion: g.descripcion || '',
        perfil_id: g.perfil_id ?? null,
        chorario_id: g.chorario_id ?? null,
        es_administrador: !!g.es_administrador,
        tipo_acceso: g.tipo_acceso || 'SISTEMA',
        activo: g.activo !== false,
      });
      // La ruta del padre es la del grupo sin su último tramo
      this.padreNombreControl.setValue(g.padre_id ? (g.ruta?.replace(/ \/ [^/]*$/, '') || g.padre_nombre || '') : '');
      this.perfilNombreControl.setValue(g.perfil_nombre || '');
      this.horarioNombreControl.setValue(g.chorario_nombre || '');
    } catch (e) {
      console.error('Error al cargar el grupo:', e);
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  // ================================================================
  // LOOKUPS: padre, perfil, horario
  // ================================================================

  abrirModalPadre(): void {
    if (this.isdisabled) { return; }
    const modalRef = this.modalService.open(ListGruposComponent, { size: 'md', centered: true, backdrop: 'static' });
    modalRef.componentInstance.titulo = 'Grupo padre';
    modalRef.componentInstance.grupoSeleccionadoId = this.form.get('padre_id')?.value;
    modalRef.componentInstance.excluirId = this.grupoModel?.id ?? null;   // ni él ni sus subgrupos
    modalRef.componentInstance.permitirNinguno = true;                    // «Sin grupo» = raíz
    modalRef.componentInstance.seleccionado
      .pipe(takeUntil(this.hastaQueCierre(modalRef)))
      .subscribe((g: GrupoModel | null) => {
        this.form.patchValue({ padre_id: g?.id ?? null });
        this.padreNombreControl.setValue(g ? (g.ruta || g.nombre) : '');
      });
  }

  limpiarPadre(): void {
    if (this.isdisabled) { return; }
    this.form.patchValue({ padre_id: null });
    this.padreNombreControl.setValue('');
  }

  async cargarPerfilPorId(): Promise<void> {
    const perfilId = this.form.get('perfil_id')?.value;
    if (!perfilId) { this.perfilNombreControl.setValue(''); return; }
    try {
      const res: any = await firstValueFrom(this._profileService.findByIdProfile(perfilId));
      if (res?.status === 'success' && res.data) {
        this.perfilNombreControl.setValue(res.data.nombre);
      } else {
        this.perfilNombreControl.setValue('');
        this.form.patchValue({ perfil_id: null });
        this._toastr.warning('Perfil no encontrado');
      }
    } catch (e) {
      this.form.patchValue({ perfil_id: null });
      this.perfilNombreControl.setValue('');
    }
  }

  abrirModalPerfiles(): void {
    if (this.isdisabled) { return; }
    const modalRef = this.modalService.open(ListProfileComponent, { size: 'md', centered: true, backdrop: 'static' });
    modalRef.componentInstance.perfilSeleccionadoId = this.form.get('perfil_id')?.value;
    modalRef.componentInstance.seleccionado
      .pipe(takeUntil(this.hastaQueCierre(modalRef)))
      .subscribe((perfil: any) => {
        this.form.patchValue({ perfil_id: perfil.id });
        this.perfilNombreControl.setValue(perfil.nombre);
      });
  }

  limpiarPerfil(): void {
    if (this.isdisabled) { return; }
    this.form.patchValue({ perfil_id: null });
    this.perfilNombreControl.setValue('');
  }

  async cargarHorarioPorId(): Promise<void> {
    const horarioId = this.form.get('chorario_id')?.value;
    if (!horarioId) { this.horarioNombreControl.setValue(''); return; }
    try {
      const res: any = await firstValueFrom(this._horarioService.getHorario(parseInt(horarioId, 10)));
      if (res?.status === 'success' && res.data) {
        this.horarioNombreControl.setValue(res.data.nombre);
      } else {
        this.horarioNombreControl.setValue('');
        this.form.patchValue({ chorario_id: null });
        this._toastr.warning('Horario no encontrado');
      }
    } catch (e) {
      this.form.patchValue({ chorario_id: null });
      this.horarioNombreControl.setValue('');
    }
  }

  abrirModalHorarios(): void {
    if (this.isdisabled) { return; }
    const modalRef = this.modalService.open(ListHorariosComponent, { size: 'md', centered: true, backdrop: 'static' });
    modalRef.componentInstance.horarioSeleccionadoId = this.form.get('chorario_id')?.value;
    modalRef.componentInstance.seleccionado
      .pipe(takeUntil(this.hastaQueCierre(modalRef)))
      .subscribe((horario: any) => {
        this.form.patchValue({ chorario_id: horario.id });
        this.horarioNombreControl.setValue(horario.nombre);
      });
  }

  limpiarHorario(): void {
    if (this.isdisabled) { return; }
    this.form.patchValue({ chorario_id: null });
    this.horarioNombreControl.setValue('');
  }

  // ================================================================
  // GUARDAR
  // ================================================================

  /** Resumen de lo que heredarán los usuarios (se muestra en el formulario). */
  get resumenHerencia(): string {
    const v = this.form?.getRawValue() ?? {};
    const partes: string[] = [];
    partes.push(v.es_administrador ? 'Administradores' : (v.tipo_acceso === 'WEB' ? 'Usuarios web' : 'Usuarios del sistema'));
    if (this.perfilNombreControl.value) { partes.push('perfil ' + this.perfilNombreControl.value); }
    if (this.horarioNombreControl.value) { partes.push('horario ' + this.horarioNombreControl.value); }
    return partes.join(' · ');
  }

  async onSubmitForm(_ev: any): Promise<void> {
    this._toastr.clear();
    Object.values(this.form.controls).forEach(c => c.markAsTouched());
    if (this.form.invalid) {
      this._toastr.error('Revise los campos del formulario.', 'No se puede Guardar', { timeOut: 20000, closeButton: true });
      return;
    }
    const payload = this.form.getRawValue();
    payload.padre_id = payload.padre_id || null;
    payload.perfil_id = payload.perfil_id || null;
    payload.chorario_id = payload.chorario_id || null;

    try {
      this._loadingService.setLoading(true);
      this.isdisabled = true;
      const res: any = await firstValueFrom(
        this.accion === 'edit'
          ? this._grupoService.editGrupo(this.registro_selected.id, payload)
          : this._grupoService.addGrupo(payload)
      );
      if (res?.status !== 'success') {
        this.isdisabled = false;
        return;
      }
      this.registrosE.emit(res.data);
      this._toastr.success(res.message, 'Éxito', { closeButton: true });
      this.activeModal.close(res.data);
    } catch (e) {
      // El interceptor ya avisó (409 nombre duplicado, 422, …)
      this.isdisabled = false;
    } finally {
      this._loadingService.setLoading(false);
    }
  }
}
