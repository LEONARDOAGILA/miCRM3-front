import { Component, EventEmitter, Input, OnInit, Output, ChangeDetectionStrategy } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';

import { CaracteristicaService } from '../../../services/caracteristica.service';
import { CaracteristicaNombreService } from '../../../services/caracteristicaNombre.service';
import { CategoriaService } from '../../../services/categoria.service';
import { LoadingService } from '../../../../../service/loading.service';
import { ListCategoriaComponent } from '../../categorias/listCategoria/listCategoria.component';
import { CommonModule } from '@angular/common';
import { PanelComponent } from '../../../../../components/panel/panel.component';
import { ModalHeaderComponent } from '../../../../../components/modal/modal-header/modal-header.component';
import { ModalFooterComponent } from '../../../../../components/modal/modal-footer/modal-footer.component';
import { ComboComponent } from '../../../../../components/campos/combo/combo.component';
import { CampoTextoComponent } from '../../../../../components/campos/campoTexto/campoTexto.component';
import { CampoNumeroEnteroComponent } from '../../../../../components/campos/campoNumeroEntero/campoNumeroEntero.component';
import { CheckboxComponent } from '../../../../../components/campos/checkbox/checkbox.component';

/**
 * Alta / modificación de una característica de la plantilla.
 *
 * Una característica es una línea de la lista que se le pedirá a cada
 * producto de esa categoría: «Procesador», «Pulgadas», «Resolución». Aquí se
 * dice CÓMO se llama y DÓNDE va; el valor lo pone después cada producto.
 *
 * EL NOMBRE YA NO SE ESCRIBE: se escoge del diccionario
 * (Inventarios → Nombres de característica). Antes se escribía a mano aquí, y
 * eso daba 98 filas para 19 categorías con sólo 64 nombres distintos: «Color»
 * cuatro veces, «Potencia (W)» otras cuatro, y cada reescritura una
 * oportunidad de poner «pezo» en vez de «peso».
 *
 * Lo que SÍ es de esta pantalla son las OPCIONES de los nombres de tipo lista:
 * «Tipo» significa (gas / eléctrica) en cocinas y (split / portátil / ventana)
 * en aires, así que la lista de valores es de la categoría, no del nombre.
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
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    CommonModule, ReactiveFormsModule, PanelComponent, ModalHeaderComponent,
    ModalFooterComponent, ComboComponent, CampoTextoComponent,
    CampoNumeroEnteroComponent, CheckboxComponent,
  ],
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
  /** Viendo: los campos nacen deshabilitados. No tiene que ver con el pie. */
  public isdisabled = false;
  /** Guardando: bloquea el pie para que un doble clic no mande dos veces. */
  public guardando = false;
  public response: any;

  /** La ruta de la categoría, al lado de su id. Va deshabilitado: lo pone el selector. */
  public categoriaNombreControl = new FormControl({ value: '', disabled: true });

  /**
   * El diccionario, para el combo del nombre.
   *
   * Es un CAMPO y no un getter: un array nuevo en cada ciclo de detección le
   * borra la selección al ng-select.
   */
  public nombres: any[] = [];

  public isLoading$ = this._loadingService.isLoading$;

  constructor(
    public modal: NgbActiveModal,
    private fb: FormBuilder,
    private modalService: NgbModal,
    private _toastr: ToastrService,
    private _loadingService: LoadingService,
    private _caracteristicaService: CaracteristicaService,
    private _caracteristicaNombreService: CaracteristicaNombreService,
    private _categoriaService: CategoriaService,
  ) {}

  get esNuevo(): boolean { return this.accion === 'add' || this.accion === 'clon'; }
  get esView(): boolean { return this.accion === 'view'; }
  get ctrlActivo(): FormControl { return this.form.controls['activo'] as FormControl; }
  get ctrlRequerido(): FormControl { return this.form.controls['requerido'] as FormControl; }

  /**
   * Productos de esa categoría que la tienen VACÍA.
   *
   * Es lo que cuesta marcarla requerida: a partir de ahí esos productos no se
   * pueden guardar sin rellenarla. Lo cuenta el servidor en el json.
   */
  get numSinValor(): number { return Number(this.registro_selected?.num_sin_valor ?? 0); }

  /** Cuántos productos la tienen rellena: avisa de que tocarla no es gratis. */
  get numProductos(): number { return Number(this.registro_selected?.num_productos ?? 0); }

  /** En qué posición está hoy. Sólo para decirlo: aquí no se cambia. */
  get ordenActual(): number { return Number(this.registro_selected?.orden ?? 0); }

  /** La entrada del diccionario que está elegida ahora mismo. */
  get nombreElegido(): any | null {
    const id = Number(this.form?.get('nombre_id')?.value ?? 0);
    return id ? (this.nombres.find(n => Number(n.id) === id) ?? null) : null;
  }

  /** Los de tipo lista son los que piden opciones, y son de esta categoría. */
  get esLista(): boolean { return this.nombreElegido?.tipo === 'LISTA'; }

  /** Cuántas opciones se han escrito, para decirlo en la ayuda. */
  get cuantasOpciones(): number { return this.opcionesEscritas().length; }

  async ngOnInit(): Promise<void> {
    this.isdisabled = this.esView;
    this.initializeForm();
    await this.cargarNombres();

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
      // El nombre se ESCOGE del diccionario: lo que se guarda es su id.
      nombre_id:    [{ value: null, disabled: this.isdisabled }, [Validators.required]],
      // Las opciones permitidas, separadas por «/», tal como se venían
      // escribiendo dentro del propio nombre: «gas / eléctrica». Sólo cuentan
      // si el nombre elegido es de tipo lista.
      valores_lista: [{ value: '', disabled: this.isdisabled }, [Validators.maxLength(500)]],
      // El ORDEN no está en el formulario: se manda null y lo pone el
      // servidor (la última de su categoría al crear, y la que ya tenía al
      // modificar). El sitio se cambia arrastrando las filas del listado.
      activo:       [{ value: true, disabled: this.isdisabled }],
      // Requerida: el producto de esta categoría no se podrá guardar sin
      // ella. Es la otra palanca, y no la misma que `activo`: una dice si se
      // PIDE y la otra si se puede dejar en blanco.
      requerido:    [{ value: false, disabled: this.isdisabled }],
    });
  }

  /**
   * El diccionario entero, también los inactivos.
   *
   * Los inactivos hacen falta para poder ENSEÑAR el nombre de una
   * característica que ya los usa; si no, el combo saldría vacío al abrir una
   * fila vieja. Se marcan en la etiqueta para que no se escojan por error.
   */
  private async cargarNombres(): Promise<void> {
    try {
      const res: any = await firstValueFrom(
        this._caracteristicaNombreService.listCaracteristicasNombres(false));
      const lista: any[] = res?.status === 'success' ? (res.data ?? []) : [];
      this.nombres = lista.map(n => ({
        ...n,
        etiquetaCombo: (n.etiqueta || n.nombre)
          + (n.activo === false ? ' (inactivo)' : '')
          + (n.tipo && n.tipo !== 'TEXTO' ? ' · ' + (n.tipo_nombre || n.tipo) : ''),
      }));
    } catch (error) {
      // El AuthInterceptor ya enseña el error HTTP
      console.error('Error al cargar el diccionario de nombres:', error);
      this.nombres = [];
    }
  }

  /** Las opciones tal como están escritas: sin vacías y sin espacios de sobra. */
  private opcionesEscritas(): string[] {
    return String(this.form?.get('valores_lista')?.value ?? '')
      .split('/')
      .map(v => v.trim())
      .filter(v => v.length > 0);
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
        // El nombre es un id del diccionario. Al CLONAR no se le puede poner
        // el mismo en la misma categoría, así que se deja elegir: antes se le
        // añadía « (copia)» al texto, y eso ahora sería inventar una entrada
        // nueva en el diccionario, que es justo lo que se quiere evitar.
        nombre_id:    this.accion === 'clon' ? null : (k.nombre_id ?? null),
        valores_lista: Array.isArray(k.valores_lista) ? k.valores_lista.join(' / ') : '',
        activo:       k.activo !== false,
        requerido:    k.requerido === true,
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
    if (this.guardando) { return; }

    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this._toastr.error('Revise los campos del formulario.', 'No se puede Guardar',
                         { timeOut: 8000, closeButton: true });
      return;
    }

    const payload: any = this.form.getRawValue();
    payload.nombre_id = Number(payload.nombre_id);

    // Las opciones, como array y sólo si el nombre elegido es de tipo lista:
    // así no queda un «gas / eléctrica» colgado de un nombre que es de texto.
    // El servidor las limpia otra vez (vacías, repetidas) y también mira el
    // tipo: esto es para no mandar basura, no el portero.
    payload.valores_lista = this.esLista ? this.opcionesEscritas() : null;
    if (payload.valores_lista && payload.valores_lista.length === 0) {
      payload.valores_lista = null;
    }

    // Sin orden: al crear, el servidor la pone la última de su categoría
    // (MAX(orden) + 1); al modificar, le deja el que ya tenía. Clonar también
    // entra al final, que si no la copia empataría con el original.
    payload.orden = null;

    try {
      this._loadingService.setLoading(true);
      this.guardando = true;

      this.response = this.accion === 'edit'
        ? await firstValueFrom(this._caracteristicaService.editCaracteristica(this.registro_selected.id, payload))
        : await firstValueFrom(this._caracteristicaService.addCaracteristica(payload));

      if (this.response?.status !== 'success') {
        this.guardando = false;
        return;
      }

      this.registrosE.emit(this.response.data);
      this._toastr.success(this.response.message, 'Éxito', { closeButton: true });
      this.modal.close(this.response.data);

    } catch (error: any) {
      // El AuthInterceptor ya notificó el error HTTP (409 con el motivo)
      console.error('Error al guardar la característica:', error);
      this.guardando = false;
    } finally {
      this._loadingService.setLoading(false);
    }
  }
}
