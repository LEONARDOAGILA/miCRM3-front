import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';

import { CaracteristicaService } from '../../../services/caracteristica.service';
import { CategoriaService } from '../../../services/categoria.service';
import { LoadingService } from '../../../../../service/loading.service';
import { ListCategoriaComponent } from '../../categorias/listCategoria/listCategoria.component';

/**
 * Alta / modificación de una característica de la plantilla.
 *
 * Una característica es una línea de la lista que se le pedirá a cada
 * producto de esa categoría: «Procesador», «Pulgadas», «Resolución». Aquí se
 * dice CÓMO se llama y DÓNDE va; el valor lo pone después cada producto.
 *
 * La categoría se elige con el mismo trío que la marca en saveProducto —id +
 * ruta + lupa— y la lupa abre el árbol (ListCategoriaComponent). Se enseña la
 * RUTA entera porque hay dos «Accesorios» en el árbol.
 *
 * Memoria: la suscripción al selector se corta cuando ese modal se cierra.
 */
@Component({
  selector: 'app-saveCaracteristica',
  templateUrl: './saveCaracteristica.component.html',
  styleUrls: ['./saveCaracteristica.component.css'],
  standalone: false,
})
export class SaveCaracteristicaComponent implements OnInit {

  /** La fila que se modifica o se clona; 0 al crear. */
  @Input() registro_selected: any = 0;
  /** 'add' | 'edit' | 'clon' | 'view' */
  @Input() accion: string = 'add';
  /** Categoría de partida al crear desde el filtro de la pantalla. */
  @Input() categoriaId: number | null = null;

  @Output() registrosE: EventEmitter<any> = new EventEmitter();

  public form!: FormGroup;
  public titulo = 'Nueva Característica';
  public isdisabled = false;
  public response: any;

  /** La ruta de la categoría, al lado de su id. Va deshabilitado: lo pone el selector. */
  public categoriaNombreControl = new FormControl({ value: '', disabled: true });

  public isLoading$ = this._loadingService.isLoading$;

  constructor(
    public modal: NgbActiveModal,
    private fb: FormBuilder,
    private modalService: NgbModal,
    private _toastr: ToastrService,
    private _loadingService: LoadingService,
    private _caracteristicaService: CaracteristicaService,
    private _categoriaService: CategoriaService,
  ) {}

  get esNuevo(): boolean { return this.accion === 'add' || this.accion === 'clon'; }
  get esView(): boolean { return this.accion === 'view'; }
  get ctrlActivo(): FormControl { return this.form.controls['activo'] as FormControl; }

  /** Cuántos productos la tienen rellena: avisa de que tocarla no es gratis. */
  get numProductos(): number { return Number(this.registro_selected?.num_productos ?? 0); }

  async ngOnInit(): Promise<void> {
    this.isdisabled = this.esView;
    this.initializeForm();

    switch (this.accion) {
      case 'add':  this.titulo = 'Nueva Característica'; break;
      case 'edit': this.titulo = 'Modificar Característica'; break;
      case 'clon': this.titulo = 'Clonar Característica'; break;
      case 'view': this.titulo = 'Ver Característica'; break;
    }

    if (this.registro_selected) {
      await this.cargar(this.registro_selected.id);
    } else if (this.categoriaId) {
      // Se abrió desde una pantalla ya filtrada por categoría: se hereda
      this.form.patchValue({ categoria_id: this.categoriaId });
      await this.cargarCategoriaPorId();
    }
  }

  initializeForm(): void {
    this.form = this.fb.group({
      categoria_id: [{ value: null, disabled: this.isdisabled }, [Validators.required]],
      nombre:       [{ value: '', disabled: this.isdisabled },
                     [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
      // El orden en que se le enseñan a quien rellena el producto. Vacío =
      // la última de su categoría (lo decide el servidor).
      orden:        [{ value: null, disabled: this.isdisabled }, [Validators.min(1), Validators.max(9999)]],
      activo:       [{ value: true, disabled: this.isdisabled }],
    });
  }

  /** Trae la fila a modificar o clonar. */
  private async cargar(id: number): Promise<void> {
    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._caracteristicaService.findByIdCaracteristica(id));
      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo obtener la característica', 'Error');
        return;
      }
      const k = res.data;
      this.registro_selected = k;
      this.form.patchValue({
        categoria_id: k.categoria_id,
        // Al clonar, el nombre no puede repetirse dentro de la misma
        // categoría: se marca para que quien clona lo cambie.
        nombre:       (k.nombre ?? '') + (this.accion === 'clon' ? ' (copia)' : ''),
        orden:        k.orden,
        activo:       k.activo !== false,
      });
      this.categoriaNombreControl.setValue(k.categoria_ruta || k.categoria_nombre || '');
    } catch (error) {
      console.error('Error al cargar la característica:', error);
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  // ================================================================
  // LA CATEGORÍA (id + ruta + lupa)
  // ================================================================

  /** Se escribió un id a mano: se trae la ruta. */
  async cargarCategoriaPorId(): Promise<void> {
    const id = this.form.get('categoria_id')?.value;
    if (!id) { this.categoriaNombreControl.setValue(''); return; }

    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._categoriaService.findByIdCategoria(id));

      if (res?.status === 'success' && res.data) {
        this.categoriaNombreControl.setValue(res.data.ruta || res.data.nombre || '');

        if (res.data.deleted_at) {
          this.limpiarCategoria();
          this._toastr.warning('Esa categoría está en la papelera de reciclaje',
                               'Categoría no disponible', { timeOut: 4000 });
        }
      } else {
        this.limpiarCategoria();
        this._toastr.warning('Categoría no encontrada');
      }
    } catch (error) {
      console.error('Error al cargar la categoría:', error);
      this.limpiarCategoria();
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  /**
   * La lupa: el árbol de categorías.
   *
   * AQUÍ SÍ VALEN LAS QUE AGRUPAN. En el producto no, porque un producto no
   * cuelga de «Tecnología»; pero una característica común sí puede definirse
   * donde haga falta. El selector las marca igualmente.
   */
  abrirModalCategorias(): void {
    if (this.esView) { return; }

    const modalRef = this.modalService.open(ListCategoriaComponent, {
      size: 'lg', centered: true, backdrop: 'static',
    });
    modalRef.componentInstance.categoriaSeleccionadaId = this.form.get('categoria_id')?.value;

    const sub = modalRef.componentInstance.seleccionado.subscribe((categoria: any) => {
      this.form.patchValue({ categoria_id: categoria.id });
      this.categoriaNombreControl.setValue(categoria.ruta || categoria.nombre || '');
    });
    modalRef.result.catch(() => {}).finally(() => sub.unsubscribe());
  }

  limpiarCategoria(): void {
    this.form.patchValue({ categoria_id: null });
    this.categoriaNombreControl.setValue('');
  }

  // ================================================================
  // GUARDAR
  // ================================================================

  async onSubmitForm(): Promise<void> {
    if (this.esView) { this.modal.dismiss(); return; }

    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this._toastr.error('Revise los campos del formulario.', 'No se puede Guardar',
                         { timeOut: 8000, closeButton: true });
      return;
    }

    const payload: any = this.form.getRawValue();
    payload.nombre = (payload.nombre ?? '').trim();
    payload.orden  = payload.orden === '' || payload.orden === null ? null : Number(payload.orden);

    try {
      this._loadingService.setLoading(true);
      this.isdisabled = true;

      this.response = this.accion === 'edit'
        ? await firstValueFrom(this._caracteristicaService.editCaracteristica(this.registro_selected.id, payload))
        : await firstValueFrom(this._caracteristicaService.addCaracteristica(payload));

      if (this.response?.status !== 'success') {
        this.isdisabled = false;
        return;
      }

      this.registrosE.emit(this.response.data);
      this._toastr.success(this.response.message, 'Éxito', { closeButton: true });
      this.modal.close(this.response.data);

    } catch (error: any) {
      // El AuthInterceptor ya notificó el error HTTP (409 con el motivo)
      console.error('Error al guardar la característica:', error);
      this.isdisabled = false;
    } finally {
      this._loadingService.setLoading(false);
    }
  }
}
