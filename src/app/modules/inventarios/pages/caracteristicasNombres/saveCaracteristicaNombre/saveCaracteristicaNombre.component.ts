import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Subject, firstValueFrom, takeUntil } from 'rxjs';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';

import { CaracteristicaNombreService } from '../../../services/caracteristicaNombre.service';
import { LoadingService } from '../../../../../service/loading.service';
import { TIPOS_CARACTERISTICA, UNIDADES_CARACTERISTICA } from '../../../interfaces/caracteristicaNombreModel';
import { CommonModule } from '@angular/common';
import { PanelComponent } from '../../../../../components/panel/panel.component';
import { ModalHeaderComponent } from '../../../../../components/modal/modal-header/modal-header.component';
import { ModalFooterComponent } from '../../../../../components/modal/modal-footer/modal-footer.component';
import { ComboComponent } from '../../../../../components/campos/combo/combo.component';
import { CampoTextoComponent } from '../../../../../components/campos/campoTexto/campoTexto.component';
import { CampoTextoAreaComponent } from '../../../../../components/campos/campoTextoArea/campoTextoArea.component';
import { CheckboxComponent } from '../../../../../components/campos/checkbox/checkbox.component';

/**
 * Alta / modificación de un nombre del diccionario de características.
 *
 * Tres campos que son el corazón del asunto:
 *
 *   NOMBRE   escrito UNA vez para toda la empresa. Renombrarlo aquí lo
 *            renombra en todas las categorías que lo piden (lo propaga un
 *            disparador), que es lo que hace que arreglar «pezo» cueste una
 *            sola corrección.
 *   UNIDAD   SEPARADA del nombre: «Potencia» + «W». Con la unidad dentro del
 *            texto, «Potencia (W)» y «Potencia (kW)» serían dos
 *            características distintas para el sistema.
 *   TIPO     texto, número, sí/no o lista. Es la otra mitad del problema: con
 *            el nombre bien pero el valor en texto libre, logística sigue
 *            recibiendo «15», «15 kg» y «15,5».
 *
 * Las OPCIONES de los de tipo lista no están aquí: son de cada categoría
 * («Tipo» es gas/eléctrica en cocinas y split/portátil/ventana en aires), así
 * que se escriben en saveCaracteristica.
 */
@Component({
  selector: 'app-saveCaracteristicaNombre',
  templateUrl: './saveCaracteristicaNombre.component.html',
  styleUrls: ['./saveCaracteristicaNombre.component.css'],
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, PanelComponent, ModalHeaderComponent,
    ModalFooterComponent, ComboComponent, CampoTextoComponent,
    CampoTextoAreaComponent, CheckboxComponent,
  ],
})
export class SaveCaracteristicaNombreComponent implements OnInit, OnDestroy {

  /** La fila que se modifica o se clona; 0 al crear. */
  @Input() registro_selected: any = 0;
  /** 'add' | 'edit' | 'clon' | 'view' */
  @Input() accion: string = 'add';

  @Output() registrosE: EventEmitter<any> = new EventEmitter();

  public form!: FormGroup;
  public titulo = 'Nuevo Nombre de Característica';
  /** Viendo: los campos nacen deshabilitados. No tiene que ver con el pie. */
  public isdisabled = false;
  /** Guardando: bloquea el pie para que un doble clic no mande dos veces. */
  public guardando = false;
  public response: any;

  /** `[items]` va a un CAMPO y no a un getter: un array nuevo en cada ciclo de
   *  detección le borra la selección al ng-select. */
  public readonly tipos = TIPOS_CARACTERISTICA;
  public readonly unidades = UNIDADES_CARACTERISTICA;

  public isLoading$ = this._loadingService.isLoading$;

  private readonly unsubscribe$ = new Subject<void>();

  constructor(
    public modal: NgbActiveModal,
    private fb: FormBuilder,
    private _toastr: ToastrService,
    private _loadingService: LoadingService,
    private _caracteristicaNombreService: CaracteristicaNombreService,
  ) {}

  get esNuevo(): boolean { return this.accion === 'add' || this.accion === 'clon'; }
  get esView(): boolean { return this.accion === 'view'; }
  get ctrlActivo(): FormControl { return this.form.controls['activo'] as FormControl; }
  get ctrlUnidad(): FormControl { return this.form.controls['unidad'] as FormControl; }

  /** La unidad sólo tiene sentido en los numéricos; el servidor la limpia igual. */
  get esNumero(): boolean { return this.form?.get('tipo')?.value === 'NUMERO'; }

  /** Y las opciones de los de lista las pone cada categoría, no esta pantalla. */
  get esLista(): boolean { return this.form?.get('tipo')?.value === 'LISTA'; }

  /** En cuántas categorías se está pidiendo: renombrar las toca todas. */
  get numCategorias(): number { return Number(this.registro_selected?.num_categorias ?? 0); }

  /**
   * El nombre acaba en un paréntesis.
   *
   * Es la herencia de cuando no había columna de unidad: la migración dejó
   * enteros los que al acortarlos habrían chocado con otro («Capacidad
   * (litros)» frente a «Capacidad (BTU)»). Se avisa, no se bloquea: decidir
   * cómo se llama cada uno no lo puede hacer el sistema.
   */
  get nombreConParentesis(): boolean {
    return /\([^()]*\)\s*$/.test(String(this.form?.get('nombre')?.value ?? ''));
  }

  async ngOnInit(): Promise<void> {
    this.isdisabled = this.esView;
    this.initializeForm();

    switch (this.accion) {
      case 'add':  this.titulo = 'Nuevo Nombre de Característica'; break;
      case 'edit': this.titulo = 'Modificar Nombre de Característica'; break;
      case 'clon': this.titulo = 'Clonar Nombre de Característica'; break;
      case 'view': this.titulo = 'Ver Nombre de Característica'; break;
    }

    // El combo no tiene un (change) propio: se escucha el control. Y hace
    // falta escucharlo porque al dejar de ser numérico la unidad tiene que
    // irse del formulario, no sólo del payload.
    this.form.get('tipo')?.valueChanges
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe(() => this.alCambiarTipo());

    if (this.registro_selected) {
      await this.cargar(this.registro_selected.id);
    }
  }

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

  initializeForm(): void {
    this.form = this.fb.group({
      nombre:      [{ value: '', disabled: this.isdisabled },
                    [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
      unidad:      [{ value: null, disabled: this.isdisabled }, [Validators.maxLength(20)]],
      tipo:        [{ value: 'TEXTO', disabled: this.isdisabled }, [Validators.required]],
      descripcion: [{ value: '', disabled: this.isdisabled }, [Validators.maxLength(1000)]],
      activo:      [{ value: true, disabled: this.isdisabled }],
    });
  }

  /** Trae la fila a modificar o clonar. */
  private async cargar(id: number): Promise<void> {
    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._caracteristicaNombreService.findByIdCaracteristicaNombre(id));
      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo obtener el nombre', 'Error');
        return;
      }
      const n = res.data;
      this.registro_selected = n;
      this.form.patchValue({
        // Al clonar, el nombre no puede repetirse: se marca para que quien
        // clona lo cambie.
        nombre:      (n.nombre ?? '') + (this.accion === 'clon' ? ' (copia)' : ''),
        unidad:      n.unidad ?? null,
        tipo:        n.tipo ?? 'TEXTO',
        descripcion: n.descripcion ?? '',
        activo:      n.activo !== false,
      });
    } catch (error) {
      console.error('Error al cargar el nombre de característica:', error);
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  /** Cambió el tipo: si ya no es numérico, la unidad no pinta nada. */
  alCambiarTipo(): void {
    if (!this.esNumero && this.ctrlUnidad.value) {
      this.ctrlUnidad.setValue(null);
    }
  }

  /** Las unidades más usadas, para no escribirlas. */
  ponerUnidad(unidad: string): void {
    if (this.esView) { return; }
    this.ctrlUnidad.setValue(unidad);
    this.ctrlUnidad.markAsDirty();
  }

  // ================================================================
  // GUARDAR
  // ================================================================

  async onSubmitForm(): Promise<void> {
    if (this.esView) { this.modal.dismiss(); return; }
    if (this.guardando) { return; }

    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this._toastr.error('Revise los campos del formulario.', 'No se puede Guardar',
                         { timeOut: 8000, closeButton: true });
      return;
    }

    const payload: any = this.form.getRawValue();
    payload.nombre = (payload.nombre ?? '').trim();
    payload.descripcion = (payload.descripcion ?? '').trim() || null;
    // La unidad, sólo si el tipo la admite: así no queda un «kg» colgado de un
    // nombre que pasó a ser de texto.
    payload.unidad = payload.tipo === 'NUMERO'
      ? (String(payload.unidad ?? '').trim() || null)
      : null;

    try {
      this._loadingService.setLoading(true);
      this.guardando = true;

      this.response = this.accion === 'edit'
        ? await firstValueFrom(this._caracteristicaNombreService.editCaracteristicaNombre(this.registro_selected.id, payload))
        : await firstValueFrom(this._caracteristicaNombreService.addCaracteristicaNombre(payload));

      if (this.response?.status !== 'success') {
        this.guardando = false;
        return;
      }

      this.registrosE.emit(this.response.data);
      this._toastr.success(this.response.message, 'Éxito', { closeButton: true });
      this.modal.close(this.response.data);

    } catch (error: any) {
      // El AuthInterceptor ya notificó el error HTTP (409 con el motivo)
      console.error('Error al guardar el nombre de característica:', error);
      this.guardando = false;
    } finally {
      this._loadingService.setLoading(false);
    }
  }
}
