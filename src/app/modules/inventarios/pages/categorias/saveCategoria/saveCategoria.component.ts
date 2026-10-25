import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { Subject, firstValueFrom } from 'rxjs';

import { SeguridadService } from '../../../../seguridad/services/seguridad.service';
import { LoadingService } from '../../../../../service/loading.service';
import { CategoriaService } from '../../../services/categoria.service';
import { CategoriaModel } from '../../../interfaces/categoriaModel';

/** Acciones con las que se abre el modal desde allCategorias. */
type AccionCategoria = 'add' | 'edit' | 'clon' | 'view';

/**
 * Alta, modificación, clonación y vista de una categoría
 * (inventarios.categorias).
 *
 * EL PADRE NO SE ELIGE AQUÍ. Al crear llega decidido —«Nueva» cuelga de la
 * raíz, «Nueva subcategoría» cuelga de la fila marcada— y al modificar NO SE
 * PUEDE CAMBIAR: mover una rama es otra cosa (hay que mirar ciclos, el nivel
 * de todo lo que cuelga y renumerar hermanas) y se hace arrastrando en la
 * rejilla, que además enseña dónde va a caer. Un combo de padres escondido
 * en un formulario reordena el árbol sin que nadie lo vea.
 */
@Component({
  selector: 'app-saveCategoria',
  templateUrl: './saveCategoria.component.html',
  styleUrls: ['./saveCategoria.component.css'],
  standalone: false,
})
export class SaveCategoriaComponent implements OnInit, OnDestroy {

  /** Registro a editar / clonar / ver, o 0 al crear. */
  @Input() registro_selected: any = {};
  @Input() accion: AccionCategoria = 'add';
  /** De quién va a colgar la nueva; null para una categoría raíz. */
  @Input() padre: CategoriaModel | null = null;
  @Output() registrosE: EventEmitter<any> = new EventEmitter();

  public form: FormGroup;
  public isLoading$ = this._loadingService.isLoading$;
  public response: any;
  public isdisabled = false;
  public titulo = '';
  public textoClon = '';
  public categoriaModel: CategoriaModel | null = null;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    public modal: NgbActiveModal,
    private _toastr: ToastrService,
    private _loadingService: LoadingService,
    private _seguridadService: SeguridadService,
    private _categoriaService: CategoriaService,
  ) {}

  // ================================================================
  // ESTADO DERIVADO
  // ================================================================

  get esView(): boolean { return this.accion === 'view'; }
  get esNuevo(): boolean { return this.accion === 'add' || this.accion === 'clon'; }
  get ctrlActivo(): FormControl { return this.form.controls['activo'] as FormControl; }
  get ctrlEsTransaccion(): FormControl { return this.form.controls['es_transaccion'] as FormControl; }
  get ctrlIcono(): FormControl { return this.form.controls['icono'] as FormControl; }

  /** Subcategorías directas (sólo informativo, viene del back). */
  get numHijos(): number {
    return Number(this.categoriaModel?.num_hijos ?? this.registro_selected?.num_hijos ?? 0);
  }

  /** Productos en esta categoría (sólo informativo). */
  get numProductos(): number {
    return Number(this.categoriaModel?.num_productos ?? this.registro_selected?.num_productos ?? 0);
  }

  /** Dónde va a quedar: la ruta del padre, o «Primer nivel» si no tiene. */
  get dondeVa(): string {
    if (this.accion === 'add' || this.accion === 'clon') {
      return this.padre ? (this.padre.ruta || this.padre.nombre) : 'Primer nivel (raíz)';
    }
    const ruta = this.categoriaModel?.ruta ?? '';
    const corte = ruta.lastIndexOf(' > ');
    return corte > 0 ? ruta.slice(0, corte) : 'Primer nivel (raíz)';
  }

  /** El nivel que va a tener: el del padre más uno. */
  get nivelResultante(): number {
    if (this.accion === 'add' || this.accion === 'clon') {
      return this.padre ? Number(this.padre.nivel ?? 0) + 1 : 0;
    }
    return Number(this.categoriaModel?.nivel ?? 0);
  }

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
        this.titulo = this.padre ? 'Nueva Subcategoría' : 'Nueva Categoría';
        // Una categoría RAÍZ nace agrupando: encabeza una línea y de ésas
        // cuelgan categorías, no productos. Además, una que admite productos
        // no admite subcategorías, así que dejarla marcada obligaría a
        // volver a entrar en su ficha para desmarcarla antes de la primera.
        if (!this.padre) { this.ctrlEsTransaccion.setValue(false); }
        break;
      case 'edit':
        this.titulo = 'Modificar Categoría';
        await this.findByIdCategoria(this.registro_selected.id);
        break;
      case 'clon':
        this.titulo = 'Clonar Categoría';
        this.textoClon = '_CLON';
        await this.findByIdCategoria(this.registro_selected.id);
        break;
      case 'view':
        this.titulo = 'Ver Categoría';
        await this.findByIdCategoria(this.registro_selected.id);
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
      nombre:      [{ value: '', disabled: this.isdisabled }, [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
      icono:       [{ value: '', disabled: this.isdisabled }, [Validators.maxLength(50)]],
      descripcion: [{ value: '', disabled: this.isdisabled }, [Validators.maxLength(2000)]],
      activo:      [{ value: true, disabled: this.isdisabled }],
      // De transacción por omisión: la mayoría de las que se crean son
      // hojas, donde después se cuelgan los productos.
      es_transaccion: [{ value: true, disabled: this.isdisabled }],
    });
  }

  //   ******   CARGA EL REGISTRO   ******  //
  async findByIdCategoria(id: number): Promise<void> {
    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._categoriaService.findByIdCategoria(id));
      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo obtener la categoría', 'Error');
        return;
      }
      this.categoriaModel = res.data;
      this.form.patchValue({
        nombre:      (this.categoriaModel!.nombre ?? '') + this.textoClon,
        icono:       this.categoriaModel!.icono ?? '',
        descripcion: this.categoriaModel!.descripcion ?? '',
        activo:      this.categoriaModel!.activo !== false,
        es_transaccion: this.categoriaModel!.es_transaccion !== false,
      });

      // CON PRODUCTOS DENTRO NO SE PUEDE QUITAR: esos productos quedarían
      // colgando de algo que el selector ya no ofrece y que el servidor
      // rechaza al guardar (fn_categorias_modificar lo corta con P0021).
      // Se apaga aquí para no ofrecer algo que va a fallar.
      if (this.accion === 'edit' && this.numProductos > 0) {
        this.ctrlEsTransaccion.disable();
      }

      // Y CON SUBCATEGORÍAS NO SE PUEDE MARCAR: los productos cuelgan de las
      // hojas, y tenerlos aquí dejaría productos y subcategorías colgando de
      // lo mismo. El servidor lo corta igual.
      if (this.accion === 'edit' && this.numHijos > 0) {
        this.ctrlEsTransaccion.setValue(false);
        this.ctrlEsTransaccion.disable();
      }
    } catch (error) {
      // El AuthInterceptor ya muestra el toast del error HTTP
      console.error('Error al cargar la categoría:', error);
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  // El icono lo lleva <app-campoIcono>, que ya trae el selector: se elige de
  // una lista y no se escribe a mano porque `fa-snowflake` mal escrito no da
  // ningun error, simplemente no se ve nada y nadie sabe por que.

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

    const payload: any = this.form.getRawValue();
    payload.icono       = (payload.icono ?? '').trim() || null;
    payload.descripcion = (payload.descripcion ?? '').trim() || null;

    // El padre sólo se manda al crear: al modificar, la rama no se toca
    if (this.esNuevo) {
      payload.padre_id = this.padre?.id ?? null;
    }

    await this.saveRecord(payload);
  }

  //   ******   GRABAR DATA  ******  //
  private async saveRecord(data: any): Promise<void> {
    try {
      this._loadingService.setLoading(true);
      this.isdisabled = true;

      if (this.accion === 'edit') {
        this.response = await firstValueFrom(this._categoriaService.editCategoria(this.registro_selected.id, data));
      } else {
        this.response = await firstValueFrom(
          this.accion === 'clon' ? this._categoriaService.clonCategoria(data) : this._categoriaService.addCategoria(data)
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
      console.error('Error al guardar la categoría:', error);
      this.isdisabled = false;
    } finally {
      this._loadingService.setLoading(false);
    }
  }
}
