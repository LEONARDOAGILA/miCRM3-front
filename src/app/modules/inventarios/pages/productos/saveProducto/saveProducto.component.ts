import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { CellValueChangedEvent, GridApi, GridReadyEvent, RowClassParams } from 'ag-grid-community';
import { ToastrService } from 'ngx-toastr';
import { Subject, firstValueFrom } from 'rxjs';

import { SeguridadService } from '../../../../seguridad/services/seguridad.service';
import { LoadingService } from '../../../../../service/loading.service';
import { ProductoService } from '../../../services/producto.service';
import { MarcaService } from '../../../services/marca.service';
import { ListMarcaComponent } from '../../marcas/listMarca/listMarca.component';
import { ListCategoriaComponent } from '../../categorias/listCategoria/listCategoria.component';
// Pasa el HTML del editor a texto. Vive en ventas porque allí nació (las
// plantillas de WhatsApp), pero no es de ventas: es una función suelta.
import { soloTexto } from '../../../../ventas/interfaces/plantillasWhatsapp';
import { CaracteristicaService } from '../../../services/caracteristica.service';
import { AlmacenDeImagenes } from '../../../../ventas/interfaces/pegarEnEditor';
import { AppAgGridService } from '../../../../../service/app-agGrid.service';
import { CategoriaService } from '../../../services/categoria.service';
import {
  ProductoModel, ImagenProductoModel,
  UNIDADES_PRODUCTO, GARANTIAS_MESES,
} from '../../../interfaces/productoModel';

/** Acciones con las que se abre el modal desde allProductos. */
type AccionProducto = 'add' | 'edit' | 'clon' | 'view';

/**
 * Alta, modificación, clonación y vista de un producto
 * (inventarios.productos), con su galería de imágenes.
 *
 * Mismo esquema que saveCargo, con dos cosas propias:
 *
 *  · LA GALERÍA NO ESPERA A GUARDAR cuando el producto ya existe: cada
 *    imagen se sube, se borra, se marca como principal o se reordena en el
 *    momento, porque cada una de esas cosas es una llamada suya. Al CREAR no
 *    hay id todavía, así que las elegidas se quedan esperando y se suben en
 *    cuanto el producto está guardado.
 *  · Los dos combos de clasificación salen de sus propias tablas, y en el de
 *    categoría se enseña la RUTA («Línea Blanca > Refrigeración»): fuera del
 *    árbol, «Accesorios» a secas no dice de qué.
 */
@Component({
  selector: 'app-saveProducto',
  templateUrl: './saveProducto.component.html',
  styleUrls: ['./saveProducto.component.css'],
  standalone: false,
})
export class SaveProductoComponent implements OnInit, OnDestroy {

  /** Registro a editar / clonar / ver, o 0 al crear. */
  @Input() registro_selected: any = {};
  @Input() accion: AccionProducto = 'add';
  @Output() registrosE: EventEmitter<any> = new EventEmitter();

  public form: FormGroup;
  public isLoading$ = this._loadingService.isLoading$;
  public response: any;
  public isdisabled = false;
  public titulo = '';
  public textoClon = '';
  public productoModel: ProductoModel | null = null;

  // ---------- Catálogos ----------
  /**
   * El nombre de la marca elegida, para enseñarlo al lado del id.
   *
   * Va deshabilitado a propósito: no se escribe, lo pone el id o el selector.
   * Es el mismo trato que le da saveUser al nombre del perfil.
   */
  public marcaNombreControl = new FormControl({ value: '', disabled: true });
  /**
   * La ruta de la categoría elegida, para enseñarla al lado de su id.
   *
   * Deshabilitado por lo mismo que el de la marca: no se escribe, lo pone
   * el id o el selector. Se enseña la RUTA y no el nombre porque hay dos
   * «Accesorios» en el árbol y a secas no se sabe de cuál se trata.
   */
  public categoriaNombreControl = new FormControl({ value: '', disabled: true });

  /**
   * LAS CARACTERÍSTICAS DE LA CATEGORÍA, para rellenar.
   *
   * Cada una lleva su propio FormControl porque el campo de texto de la
   * casa (app-campoTexto) trabaja con controles, no con ngModel. No van
   * en el FormGroup del producto: son una lista que cambia entera cada
   * vez que se cambia de categoría, y un FormArray que se rehace a cada
   * rato no aporta nada aquí.
   */
  public caracteristicas: {
    caracteristica_id: number | null;
    nombre: string;
    orden: number;
    en_plantilla: boolean;
    valor: string;
    /** Añadida a mano en este producto, no viene de la lista de la categoría. */
    nueva?: boolean;
    /** Clave interna para ag-Grid. Ver getRowIdCaracteristica. */
    clave: number;
  }[] = [];

  /**
   * Dónde van las imágenes que se meten en la DESCRIPCIÓN.
   *
   * Sin esto, el editor incrusta la imagen en base64 dentro del texto: una
   * foto normal se come los 20.000 caracteres que admite la descripción y
   * encima viajaría entera en cada listado. Con esto se sube al servidor y
   * en el texto queda una <img> con su URL, como en las notas del cliente.
   *
   * `traerDeFuera` es para cuando se PEGA contenido con imágenes de otra
   * web: el navegador no puede ir a buscarlas (CORS), el servidor sí. Aquí
   * todavía no hay ese endpoint, así que se devuelve null: esas imágenes se
   * quitan y el editor avisa de cuántas eran.
   */
  public almacenDeImagenes: AlmacenDeImagenes = {
    subir: async (fichero: File) => {
      try {
        const res: any = await firstValueFrom(this._productoService.subirImagenDescripcion(fichero));
        return res?.status === 'success' && res.data?.archivo
          ? this._productoService.urlImagenDescripcion(res.data.archivo)
          : null;
      } catch {
        return null;   // el AuthInterceptor ya enseña el error
      }
    },
    traerDeFuera: async () => null,
  };

  /** Para que el editor avise de lo que no pudo traer al pegar. */
  public avisarDelPegado = (mensaje: string, titulo: string): void => {
    this._toastr.info(mensaje, titulo, { timeOut: 6000 });
  };

  /** El respiro para poner el cursor en la fila recien anadida. */
  private edicionTimeoutId: any = null;

  /** La rejilla de características: la primera columna no se toca, la segunda sí. */
  public gridCaracteristicas?: GridApi;
  public columnDefsCaracteristicas: any[] = [];

  /** Las que ya no están en la lista de la categoría se marcan en la fila. */
  public rowClassRulesCaracteristicas = {
    // Las recién añadidas NO llevan el aviso: no es que se hayan caído de
    // la lista, es que nunca estuvieron.
    'fila-fuera-plantilla': (p: RowClassParams) =>
      (p.data as any)?.en_plantilla === false && (p.data as any)?.nueva !== true,
    'fila-nueva': (p: RowClassParams) => (p.data as any)?.nueva === true,
  };

  /** El contador de claves de fila. */
  private claveCaracteristica = 0;

  /**
   * El id de fila, para que ag-Grid no rehaga la tabla entera al cambiar un
   * valor.
   *
   * Es un contador propio y NO el id de la característica ni su nombre: una
   * fila añadida a mano no tiene id, y el nombre cambia mientras se escribe.
   * Medido: con el nombre de clave, al renombrar una fila y luego subirla,
   * ag-Grid la trataba como otra y la colocaba donde no era.
   */
  public getRowIdCaracteristica = (p: any) => String(p.data?.clave);

  /** Mientras se pide la plantilla al cambiar de categoría. */
  public cargandoCaracteristicas = false;
  public unidades = UNIDADES_PRODUCTO;
  public garantias = GARANTIAS_MESES;

  // ---------- La galería ----------
  /** Lo que ya está guardado en el servidor. */
  public imagenes: ImagenProductoModel[] = [];
  /** Las elegidas antes de que el producto exista; se suben al guardar. */
  public imagenesPendientes: { file: File; vista: string }[] = [];
  /** El id de la imagen que se está subiendo o borrando, para el giro. */
  public imagenEnVuelo: number | 'nueva' | null = null;
  /** El producto, una vez existe. */
  private productoId: number | null = null;

  private readonly destroy$ = new Subject<void>();
  private readonly lectores = new Set<FileReader>();
  private destruido = false;

  constructor(
    private fb: FormBuilder,
    public modal: NgbActiveModal,
    /** Para abrir OTRO modal encima: el selector de marcas. */
    private modalService: NgbModal,
    private _toastr: ToastrService,
    private _loadingService: LoadingService,
    private _seguridadService: SeguridadService,
    public _productoService: ProductoService,
    private _marcaService: MarcaService,
    private _categoriaService: CategoriaService,
    private _caracteristicaService: CaracteristicaService,
    public _appAgGridService: AppAgGridService,
  ) {}

  // ================================================================
  // ESTADO DERIVADO
  // ================================================================

  get esView(): boolean { return this.accion === 'view'; }
  get esNuevo(): boolean { return this.accion === 'add' || this.accion === 'clon'; }
  get ctrlActivo(): FormControl { return this.form.controls['activo'] as FormControl; }
  /** El editor se ata con [formControl], que es lo que entiende: es un
   *  ControlValueAccessor, no tiene @Input() control. */
  get ctrlDescripcion(): FormControl { return this.form.controls['descripcion'] as FormControl; }
  get ctrlManejaStock(): FormControl { return this.form.controls['maneja_stock'] as FormControl; }
  get ctrlManejaSerie(): FormControl { return this.form.controls['maneja_serie'] as FormControl; }
  get ctrlImpuesto(): FormControl { return this.form.controls['impuesto'] as FormControl; }

  /** El producto ya existe, así que la galería puede trabajar contra el servidor. */
  get galeriaEnVivo(): boolean { return this.productoId !== null && !this.esView; }

  /** Cuántas imágenes hay en total, guardadas más pendientes. */
  get totalImagenes(): number { return this.imagenes.length + this.imagenesPendientes.length; }

  /**
   * El margen sobre el costo, para verlo mientras se escribe el precio.
   *
   * Es sólo informativo: el precio lo fija quien lo escribe. Pero un precio
   * por debajo del costo es casi siempre un cero de más o de menos, y verlo
   * en rojo mientras se teclea lo caza antes de guardar.
   */
  get margen(): number | null {
    const costo  = Number(this.form?.controls['costo']?.value ?? 0);
    const precio = Number(this.form?.controls['precio']?.value ?? 0);
    if (!costo || !precio) { return null; }
    return ((precio - costo) / costo) * 100;
  }

  get margenEnRojo(): boolean {
    const m = this.margen;
    return m !== null && m < 0;
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
    this.initializeGridCaracteristicas();

    switch (this.accion) {
      case 'add':
        this.titulo = 'Nuevo Producto';
        break;
      case 'edit':
        this.titulo = 'Modificar Producto';
        await this.findByIdProducto(this.registro_selected.id);
        this.productoId = this.registro_selected.id;
        break;
      case 'clon':
        this.titulo = 'Clonar Producto';
        this.textoClon = '_CLON';
        await this.findByIdProducto(this.registro_selected.id);
        break;
      case 'view':
        this.titulo = 'Ver Producto';
        await this.findByIdProducto(this.registro_selected.id);
        break;
    }
  }

  ngOnDestroy(): void {
    this.destruido = true;
    if (this.edicionTimeoutId) { clearTimeout(this.edicionTimeoutId); }
    this.lectores.forEach(l => l.abort());
    this.lectores.clear();
    this.destroy$.next();
    this.destroy$.complete();
  }

  //   ******   INICIALIZA FORMULARIO   ******  //
  initializeForm(): void {
    this.form = this.fb.group({
      // Identificación
      codigo:         [{ value: '', disabled: this.isdisabled }, [Validators.required, Validators.minLength(2), Validators.maxLength(30)]],
      codigo_barras:  [{ value: '', disabled: this.isdisabled }, [Validators.maxLength(50)]],
      nombre:         [{ value: '', disabled: this.isdisabled }, [Validators.required, Validators.minLength(3), Validators.maxLength(150)]],
      // 20.000 y no 4.000: ahora lo que se guarda es HTML, y las etiquetas
      // ocupan. Una ficha de media página en texto pasa de 4.000 en cuanto
      // lleva una lista y tres negritas. La columna es `text`, no tiene
      // límite propio; el del servidor subió igual.
      descripcion:    [{ value: '', disabled: this.isdisabled }, [Validators.maxLength(20000)]],

      // Clasificación
      marca_id:       [{ value: null, disabled: this.isdisabled }],
      categoria_id:   [{ value: null, disabled: this.isdisabled }],
      modelo:         [{ value: '', disabled: this.isdisabled }, [Validators.maxLength(80)]],

      // Comercial
      unidad:         [{ value: 'UNIDAD', disabled: this.isdisabled }],
      costo:          [{ value: 0, disabled: this.isdisabled }, [Validators.min(0)]],
      precio:         [{ value: 0, disabled: this.isdisabled }, [Validators.min(0)]],
      // Sólo SI grava; el porcentaje vendrá de las tablas de impuestos
      impuesto:       [{ value: true, disabled: this.isdisabled }],

      // Existencias
      maneja_stock:   [{ value: true, disabled: this.isdisabled }],
      stock_minimo:   [{ value: 0, disabled: this.isdisabled }, [Validators.min(0)]],
      stock_maximo:   [{ value: null, disabled: this.isdisabled }, [Validators.min(0)]],

      // Propio del giro
      maneja_serie:   [{ value: false, disabled: this.isdisabled }],
      garantia_meses: [{ value: 0, disabled: this.isdisabled }],

      // Despacho
      peso_kg:        [{ value: null, disabled: this.isdisabled }, [Validators.min(0)]],
      alto_cm:        [{ value: null, disabled: this.isdisabled }, [Validators.min(0)]],
      ancho_cm:       [{ value: null, disabled: this.isdisabled }, [Validators.min(0)]],
      profundidad_cm: [{ value: null, disabled: this.isdisabled }, [Validators.min(0)]],

      activo:         [{ value: true, disabled: this.isdisabled }],
    });
  }

  // Ya no se piden catálogos al abrir: marca y categoría tienen cada una su
  // selector, que pide lo suyo cuando se abre. Antes se traían TODAS las
  // marcas y TODAS las categorías para llenar dos desplegables, en cada
  // apertura del formulario y aunque no se tocaran.

  // ================================================================
  // LA MARCA (id + nombre + lupa)
  // ================================================================
  //
  // El mismo trío que usa saveUser para el perfil. Antes era un desplegable
  // con todas las marcas dentro: con cuatro marcas iba bien, con doscientas
  // es una lista imposible de recorrer y no se puede buscar por país.

  /**
   * Se escribió un id a mano: se trae el nombre.
   *
   * Si no existe (el servidor responde P0013 «La marca no existe», que cae
   * en el catch) o está en la papelera, se limpian los dos campos: más vale
   * el campo vacío que un id que nadie va a reconocer.
   */
  async cargarMarcaPorId(): Promise<void> {
    const id = this.form.get('marca_id')?.value;

    if (!id) { this.marcaNombreControl.setValue(''); return; }

    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._marcaService.findByIdMarca(id));

      if (res?.status === 'success' && res.data) {
        this.marcaNombreControl.setValue(res.data.nombre ?? '');

        // Una marca en la papelera no vale: el selector no la ofrece y, si se
        // vacía la papelera, el producto se quedaría apuntando a nada.
        // fn_marcas_json la devuelve igual (no filtra deleted_at), así que
        // el corte se hace aquí.
        if (res.data.deleted_at) {
          this.limpiarMarca();
          this._toastr.warning(
            'Esa marca está en la papelera de reciclaje',
            'Marca no disponible', { timeOut: 4000 });
          return;
        }

        // De baja SÍ la deja guardar el servidor (fn_productos_validar sólo
        // comprueba que la marca exista), pero el desplegable de antes sólo
        // traía las activas (listMarcas(soloActivos)); se mantiene la regla
        // y se avisa, sin bloquear lo que ya estuviera guardado.
        if (res.data.activo === false) {
          this._toastr.warning(
            `«${res.data.nombre}» está inactiva: actívela desde Marcas para poder usarla`,
            'Marca no disponible', { timeOut: 4000 });
        }
      } else {
        this.limpiarMarca();
        this._toastr.warning('Marca no encontrada');
      }
    } catch (error) {
      console.error('Error al cargar la marca:', error);
      this.limpiarMarca();
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  /** La lupa: el selector con buscador y paginación. */
  abrirModalMarcas(): void {
    if (this.esView) { return; }

    const modalRef = this.modalService.open(ListMarcaComponent, {
      size: 'md', centered: true, backdrop: 'static'
    });

    // Para que el selector marque como «Actual» la que ya tiene el producto
    modalRef.componentInstance.marcaSeleccionadaId = this.form.get('marca_id')?.value;

    // La suscripcion se corta cuando el selector se cierra, se elija algo o
    // se cancele: el modal se destruye y con el su EventEmitter.
    const sub = modalRef.componentInstance.seleccionado.subscribe((marca: any) => {
      this.form.patchValue({ marca_id: marca.id });
      this.marcaNombreControl.setValue(marca.nombre ?? '');
    });
    modalRef.result.catch(() => {}).finally(() => sub.unsubscribe());
  }

  /** Producto sin marca: se vacían los dos campos a la vez. */
  limpiarMarca(): void {
    this.form.patchValue({ marca_id: null });
    this.marcaNombreControl.setValue('');
  }
  // ================================================================
  // LA CATEGORÍA (id + ruta + lupa)
  // ================================================================
  //
  // Lo mismo que la marca, con una diferencia: las categorías son un ÁRBOL.
  // El desplegable las enseñaba en lista, con la ruta entera en cada línea,
  // y con tres niveles eso es una pared de texto donde no se ve qué cuelga
  // de qué. El selector las pinta como árbol (ver ListCategoriaComponent).

  /**
   * Se escribió un id a mano: se trae la ruta.
   *
   * Si no existe (el servidor responde P0013, que cae en el catch) o está en
   * la papelera, se limpian los dos campos.
   */
  async cargarCategoriaPorId(): Promise<void> {
    const id = this.form.get('categoria_id')?.value;

    if (!id) { this.categoriaNombreControl.setValue(''); return; }

    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._categoriaService.findByIdCategoria(id));

      if (res?.status === 'success' && res.data) {
        this.categoriaNombreControl.setValue(res.data.ruta || res.data.nombre || '');

        // En la papelera no vale: el selector no la ofrece y, si se vacía la
        // papelera, el producto se quedaría apuntando a nada.
        if (res.data.deleted_at) {
          this.limpiarCategoria();
          this._toastr.warning(
            'Esa categoría está en la papelera de reciclaje',
            'Categoría no disponible', { timeOut: 4000 });
          return;
        }

        // Las que sólo agrupan no admiten productos: el selector no las
        // ofrece y el servidor las rechaza (fn_productos_validar), así que
        // tecleando el id tampoco pueden entrar.
        if (res.data.es_transaccion === false) {
          this.limpiarCategoria();
          this._toastr.warning(
            `«${res.data.nombre}» agrupa: elija una de las categorías que cuelgan de ella`,
            'Esa categoría no admite productos', { timeOut: 4000 });
          return;
        }

        // De baja SÍ la deja guardar el servidor, pero el desplegable de
        // antes sólo traía las activas (listCategorias(soloActivas)); se
        // mantiene la regla.
        if (res.data.activo === false) {
          this._toastr.warning(
            `«${res.data.ruta || res.data.nombre}» está inactiva: actívela desde Categorías para poder usarla`,
            'Categoría no disponible', { timeOut: 4000 });
        }

        await this.cargarPlantilla(Number(id));
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

  /** La lupa: el selector con el árbol. */
  abrirModalCategorias(): void {
    if (this.esView) { return; }

    const modalRef = this.modalService.open(ListCategoriaComponent, {
      size: 'lg', centered: true, backdrop: 'static'
    });

    // Para que el selector marque como «Actual» la que ya tiene el producto
    modalRef.componentInstance.categoriaSeleccionadaId = this.form.get('categoria_id')?.value;

    // La suscripcion se corta cuando el selector se cierra, se elija algo o
    // se cancele: el modal se destruye y con el su EventEmitter.
    const sub = modalRef.componentInstance.seleccionado.subscribe((categoria: any) => {
      this.form.patchValue({ categoria_id: categoria.id });
      this.categoriaNombreControl.setValue(categoria.ruta || categoria.nombre || '');
      this.cargarPlantilla(categoria.id);
    });
    modalRef.result.catch(() => {}).finally(() => sub.unsubscribe());
  }

  /** Producto sin categoría: se vacían los dos campos a la vez. */
  limpiarCategoria(): void {
    this.form.patchValue({ categoria_id: null });
    this.categoriaNombreControl.setValue('');
    // Sin categoría no hay plantilla que rellenar
    this.caracteristicas = [];
    this.gridCaracteristicas?.setRowData([]);
  }

  // ================================================================
  // LAS CARACTERÍSTICAS DE LA CATEGORÍA
  // ================================================================
  //
  // La categoría manda qué hay que rellenar: un portátil pide procesador
  // y memoria; un televisor, pulgadas y resolución. La lista la mantiene
  // la pantalla de Características (inventarios/allCaracteristicas).

  /** Hay algo que enseñar en el panel. */
  get hayCaracteristicas(): boolean { return this.caracteristicas.length > 0; }

  /** Cuántas llevan valor, para decirlo en la cabecera del panel. */
  get caracteristicasRellenas(): number {
    return this.caracteristicas.filter(c => !!(c.valor ?? '').toString().trim()).length;
  }

  /**
   * Trae la plantilla de una categoría y la deja lista para rellenar.
   *
   * SE CONSERVA LO YA ESCRITO: si alguien escribió «16 GB» y cambia de
   * categoría a otra que también pide «Memoria RAM», el valor se queda.
   * Se compara por nombre porque el id de la plantilla es otro en cada
   * categoría.
   */
  async cargarPlantilla(categoriaId: number | null): Promise<void> {
    if (!categoriaId) { this.caracteristicas = []; return; }

    const escritoAntes = new Map<string, string>();
    this.caracteristicas.forEach(c => {
      const v = (c.valor ?? '').toString().trim();
      if (v) { escritoAntes.set(c.nombre.trim().toUpperCase(), v); }
    });

    try {
      this.cargandoCaracteristicas = true;
      const res: any = await firstValueFrom(
        this._caracteristicaService.listCaracteristicas(categoriaId, true));

      const filas = (res?.data ?? []) as any[];
      this.caracteristicas = filas.map((k: any) => this.filaCaracteristica({
        caracteristica_id: k.id,
        nombre: k.nombre,
        orden: k.orden,
        en_plantilla: true,
        valor: escritoAntes.get(String(k.nombre).trim().toUpperCase()) ?? '',
      }));
      this.gridCaracteristicas?.setRowData(this.caracteristicas);
    } catch (error) {
      // El AuthInterceptor ya enseña el error HTTP. Sin plantilla se puede
      // guardar igual: las características son opcionales.
      console.error('Error al cargar las características de la categoría:', error);
      this.caracteristicas = [];
    } finally {
      this.cargandoCaracteristicas = false;
    }
  }

  /** Las que ya tiene rellenas un producto que existe. */
  private async cargarCaracteristicasDelProducto(productoId: number): Promise<void> {
    try {
      const res: any = await firstValueFrom(this._productoService.caracteristicas(productoId));
      const filas = (res?.data ?? []) as any[];
      this.caracteristicas = filas.map((c: any) => this.filaCaracteristica({
        caracteristica_id: c.caracteristica_id ?? null,
        nombre: c.nombre,
        orden: c.orden ?? 1,
        en_plantilla: c.en_plantilla !== false,
        valor: c.valor ?? '',
      }));
      this.gridCaracteristicas?.setRowData(this.caracteristicas);
    } catch (error) {
      console.error('Error al cargar las características del producto:', error);
      this.caracteristicas = [];
    }
  }

  /** Una fila de la lista, con su control (deshabilitado al ver). */
  private filaCaracteristica(d: { caracteristica_id: number | null; nombre: string;
                                  orden: number; en_plantilla: boolean; valor: string }) {
    return {
      caracteristica_id: d.caracteristica_id,
      nombre: d.nombre,
      orden: d.orden,
      en_plantilla: d.en_plantilla,
      valor: d.valor ?? '',
      clave: ++this.claveCaracteristica,
    };
  }
  // ---------- LA REJILLA ----------
  //
  // Una rejilla y no una lista de campos: con ocho características, ocho
  // campos flotantes ocupaban media pantalla y aquí caben en ocho filas de
  // 34px. Es el mismo trato que «Personas de contacto» en saveCliente: se
  // escribe directamente en la celda.

  /** Las dos columnas: el nombre no se toca, el valor sí. */
  private initializeGridCaracteristicas(): void {
    this.columnDefsCaracteristicas = [
      // El asa de arrastrar. Columna propia y estrecha: puesta sobre el
      // nombre, el icono se pega al texto y no se ve que sea un agarre.
      // Viendo el producto no sale: no hay nada que reordenar.
      {
        headerName: '',
        field: 'arrastrar',
        rowDrag: !this.esView,
        hide: this.esView,
        minWidth: 34, maxWidth: 34,
        sortable: false, filter: false, resizable: false, suppressMenu: true, editable: false,
        cellClass: 'celda-asa',
        headerTooltip: 'Arrastre una fila para cambiarla de sitio',
      },
      {
        headerName: 'Característica',
        field: 'nombre',
        // El nombre que viene de la LISTA DE LA CATEGORÍA no se toca: se
        // cambia en Características, no producto a producto. El de una
        // fila añadida a mano sí, que si no no habría cómo llamarla.
        editable: (p: any) => !this.esView && !p.data?.caracteristica_id,
        sortable: false, filter: false, resizable: true,
        minWidth: 160, maxWidth: 320,
        cellClass: 'celda-nombre-caracteristica',
        tooltipValueGetter: (p: any) => p.data?.en_plantilla === false
          ? p.value + ' — ya no está en la lista de esta categoría'
          : p.value,
      },
      {
        headerName: 'Valor',
        field: 'valor',
        editable: !this.esView,
        sortable: false, filter: false,
        flex: 1, minWidth: 180,
        singleClickEdit: true,
        cellEditor: 'agTextCellEditor',
        cellEditorParams: { maxLength: 500 },
        cellClass: (p: any) => String(p.value ?? '').trim() ? '' : 'celda-vacia',
        // El hueco vacío dice qué hacer, en vez de quedarse en blanco
        cellRenderer: (p: any) => String(p.value ?? '').trim()
          ? String(p.value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          : (this.esView ? '<span class="carac-sin-valor">—</span>'
                         : '<span class="carac-sin-valor">Sin especificar</span>'),
      },
    ];

    // Viendo el producto no hay nada que ordenar ni que quitar
    if (this.esView) { return; }

    this.columnDefsCaracteristicas.push({
      headerName: 'ACCIONES',
      field: 'acciones',
      pinned: 'right',
      minWidth: 112, maxWidth: 112,
      sortable: false, filter: false, resizable: false, suppressMenu: true, editable: false,
      cellStyle: { display: 'flex', justifyContent: 'center', alignItems: 'center' },
      // HTML suelto con data-accion, como en el árbol de categorías: son
      // botones sin estado y así no hay un componente por fila.
      cellRenderer: (p: any) => {
        const primera = p.node?.rowIndex === 0;
        const ultima  = p.node?.rowIndex === this.caracteristicas.length - 1;
        const suelta  = !p.data?.caracteristica_id;
        return `
          <span class="carac-acciones">
            <button type="button" class="btn btn-sm" data-accion="subir" title="Subir"
                    ${primera ? 'disabled' : ''}><i class="fa fa-chevron-up"></i></button>
            <button type="button" class="btn btn-sm" data-accion="bajar" title="Bajar"
                    ${ultima ? 'disabled' : ''}><i class="fa fa-chevron-down"></i></button>
            <button type="button" class="btn btn-sm btn-quitar" data-accion="quitar"
                    title="${suelta ? 'Quitar esta fila' : 'Vaciar el valor (la característica es de la categoría)'}">
              <i class="fa fa-times"></i></button>
          </span>`;
      },
    });
  }

  onGridCaracteristicasReady(params: GridReadyEvent): void {
    this.gridCaracteristicas = params.api;
    this._appAgGridService.ajustarTamanoGrid(this.gridCaracteristicas);
  }

  /**
   * Se escribió en una celda.
   *
   * El dato ya está en la fila (ag-Grid lo escribe solo); esto es para que el
   * contador de la cabecera —«3 / 7»— se entere, que si no sólo cambiaría al
   * repintar por otra cosa.
   */
  onCaracteristicaChanged(e: CellValueChangedEvent): void {
    const fila: any = e.data;
    if (!fila) { return; }

    if (typeof fila.valor === 'string') { fila.valor = fila.valor.trim(); }

    if (e.colDef.field === 'nombre') {
      fila.nombre = (fila.nombre ?? '').toString().trim();

      // Dos filas con el mismo nombre acabarían peleándose al guardar (el
      // servidor las distingue por nombre cuando no vienen de la lista),
      // así que se avisa en cuanto se escribe.
      const repetida = this.caracteristicas.some(c =>
        c !== fila && (c.nombre ?? '').toString().trim().toUpperCase()
                      === fila.nombre.toUpperCase() && fila.nombre);
      if (repetida) {
        this._toastr.warning(`«${fila.nombre}» ya está en la lista de este producto`,
                             'Característica repetida', { timeOut: 4000 });
        fila.nombre = '';
        this.gridCaracteristicas?.setRowData(this.caracteristicas);
      }
    }
  }

  /**
   * Un clic en la rejilla: sólo hacen algo los botones de ACCIONES.
   *
   * Se mira data-accion y no el icono: el icono cambia y el atributo no.
   */
  onCeldaCaracteristicaClic(e: any): void {
    const origen = e.event?.target as HTMLElement | null;
    const boton = origen?.closest('[data-accion]') as HTMLButtonElement | null;
    if (!boton || boton.disabled || !e.data) { return; }

    switch (boton.dataset['accion']) {
      case 'subir':  this.moverCaracteristica(e.data, -1); break;
      case 'bajar':  this.moverCaracteristica(e.data, +1); break;
      case 'quitar': this.quitarCaracteristica(e.data); break;
    }
  }

  /**
   * Añade una fila para una característica que no está en la lista de la
   * categoría: algo que sólo tiene ESTE producto.
   *
   * Si va a repetirse en todos los de su categoría, el sitio es
   * Inventarios → Características; así se pide sola en cada producto.
   */
  agregarCaracteristica(): void {
    if (this.esView) { return; }

    this.caracteristicas = [...this.caracteristicas, {
      caracteristica_id: null,
      nombre: '',
      orden: this.caracteristicas.length + 1,
      en_plantilla: false,
      valor: '',
      nueva: true,
      clave: ++this.claveCaracteristica,
    }];
    this.gridCaracteristicas?.setRowData(this.caracteristicas);

    // El cursor en el nombre de la fila nueva, que es lo que toca escribir.
    // Hace falta esperar a que ag-Grid pinte la fila: sin el respiro,
    // startEditingCell apunta a una fila que todavia no existe.
    if (this.edicionTimeoutId) { clearTimeout(this.edicionTimeoutId); }
    this.edicionTimeoutId = setTimeout(() => {
      this.edicionTimeoutId = null;
      if (this.destruido) { return; }
      this.gridCaracteristicas?.startEditingCell({
        rowIndex: this.caracteristicas.length - 1,
        colKey: 'nombre',
      });
    }, 60);
  }

  /**
   * Se soltó una fila en otro sitio.
   *
   * Con rowDragManaged la rejilla ya movió la fila en SU modelo; aquí sólo
   * se rehace el array en ese mismo orden y se renumera, que es lo que se
   * manda al guardar. Se recorre con forEachNode porque es el único sitio
   * donde está el orden nuevo (el array sigue como estaba).
   *
   * NO se llama a setRowData: la rejilla ya está pintada como toca y
   * repintarla encima hace que la fila parpadee.
   */
  onFilaArrastrada(): void {
    if (this.esView || !this.gridCaracteristicas) { return; }

    const enPantalla: any[] = [];
    this.gridCaracteristicas.forEachNode(nodo => {
      if (nodo.data) { enPantalla.push(nodo.data); }
    });
    if (enPantalla.length !== this.caracteristicas.length) { return; }

    enPantalla.forEach((c, n) => { c.orden = n + 1; });
    this.caracteristicas = enPantalla;
  }

  /** Sube o baja una fila y renumera el orden. */
  moverCaracteristica(fila: any, salto: number): void {
    const i = this.caracteristicas.indexOf(fila);
    const j = i + salto;
    if (i === -1 || j < 0 || j >= this.caracteristicas.length) { return; }

    const copia = [...this.caracteristicas];
    [copia[i], copia[j]] = [copia[j], copia[i]];
    copia.forEach((c, n) => { c.orden = n + 1; });

    this.caracteristicas = copia;
    this.gridCaracteristicas?.setRowData(this.caracteristicas);
  }

  /**
   * La × hace una cosa u otra según de dónde venga la fila:
   *
   *   · añadida a mano  -> se va la fila entera
   *   · de la categoría -> se vacía el valor y la fila se queda
   *
   * Quitar del todo una de la categoría no se puede: la lista es de la
   * categoría, y al volver a abrir el producto estaría otra vez ahí. Lo
   * que de verdad se borra al guardar es el valor.
   */
  quitarCaracteristica(fila: any): void {
    if (this.esView) { return; }

    if (fila.caracteristica_id) {
      // OJO: la fila se SUSTITUYE por una nueva, no se le cambia el valor
      // encima. Con clave estable, ag-Grid compara por id y, si el objeto
      // es el mismo, da la celda por buena y no la repinta: el dato se
      // vaciaba y en pantalla seguia el texto de antes (medido).
      this.caracteristicas = this.caracteristicas.map(c =>
        c === fila ? { ...c, valor: '' } : c);
      this.gridCaracteristicas?.setRowData(this.caracteristicas);
      return;
    }

    this.caracteristicas = this.caracteristicas.filter(c => c !== fila);
    this.caracteristicas.forEach((c, n) => { c.orden = n + 1; });
    this.gridCaracteristicas?.setRowData(this.caracteristicas);
  }

  /** Vacía la columna de valores de un tirón (no toca la plantilla). */
  limpiarCaracteristicas(): void {
    if (this.esView || !this.hayCaracteristicas) { return; }
    // Filas nuevas, por lo mismo que en quitarCaracteristica
    this.caracteristicas = this.caracteristicas.map(c => ({ ...c, valor: '' }));
    this.gridCaracteristicas?.setRowData(this.caracteristicas);
  }

  //   ******   CARGA EL REGISTRO   ******  //
  async findByIdProducto(id: number): Promise<void> {
    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._productoService.findByIdProducto(id));
      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo obtener el producto', 'Error');
        return;
      }
      this.productoModel = res.data;
      const m = this.productoModel!;

      this.form.patchValue({
        codigo:         (m.codigo ?? '') + this.textoClon,
        // El código de barras NO se clona: es el EAN del fabricante y es
        // único, así que la copia saldría rechazada al guardar
        codigo_barras:  this.accion === 'clon' ? '' : (m.codigo_barras ?? ''),
        nombre:         (m.nombre ?? '') + this.textoClon,
        descripcion:    m.descripcion ?? '',
        marca_id:       m.marca_id ?? null,
        categoria_id:   m.categoria_id ?? null,
        modelo:         m.modelo ?? '',
        unidad:         m.unidad ?? 'UNIDAD',
        costo:          Number(m.costo ?? 0),
        precio:         Number(m.precio ?? 0),
        impuesto:       m.impuesto !== false,
        maneja_stock:   m.maneja_stock !== false,
        stock_minimo:   Number(m.stock_minimo ?? 0),
        stock_maximo:   m.stock_maximo != null ? Number(m.stock_maximo) : null,
        maneja_serie:   m.maneja_serie === true,
        garantia_meses: Number(m.garantia_meses ?? 0),
        peso_kg:        m.peso_kg != null ? Number(m.peso_kg) : null,
        alto_cm:        m.alto_cm != null ? Number(m.alto_cm) : null,
        ancho_cm:       m.ancho_cm != null ? Number(m.ancho_cm) : null,
        profundidad_cm: m.profundidad_cm != null ? Number(m.profundidad_cm) : null,
        activo:         m.activo !== false,
      });

      // El nombre de la marca, al lado de su id: lo trae el propio producto
      // (fn_productos_json devuelve marca_nombre), así que no hace falta
      // pedirlo aparte.
      this.marcaNombreControl.setValue(m.marca_nombre ?? '');
      this.categoriaNombreControl.setValue(m.categoria_ruta ?? m.categoria_nombre ?? '');

      // Las características: las del producto si ya existe, y la plantilla
      // de la categoría si es un clon (el clon nace sin valores, como nace
      // sin fotos).
      if (this.accion === 'clon') {
        await this.cargarPlantilla(m.categoria_id ?? null);
      } else {
        await this.cargarCaracteristicasDelProducto(Number(id));
      }

      // La galería sólo se hereda al VER o MODIFICAR. Al clonar, la copia
      // empieza sin fotos: duplicar ficheros en disco para un producto que
      // a lo mejor acaba siendo otro no compensa.
      this.imagenes = this.accion === 'clon' ? [] : (m.imagenes ?? []);
    } catch (error) {
      // El AuthInterceptor ya muestra el toast del error HTTP
      console.error('Error al cargar el producto:', error);
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  // ================================================================
  // LA GALERÍA
  // ================================================================

  /** La url de una imagen ya guardada. */
  urlImagen(img: ImagenProductoModel): string {
    return this._productoService.urlImagen(img.id);
  }

  /**
   * Eligieron ficheros (se admiten varios de una vez).
   *
   * Si el producto YA EXISTE se suben en el momento. Si todavía no —se está
   * creando—, se quedan esperando: addImagen necesita el id.
   */
  async onImagenesElegidas(evento: Event): Promise<void> {
    const input = evento.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    // Se limpia siempre: si no, elegir dos veces el MISMO fichero no vuelve
    // a disparar el evento
    input.value = '';
    if (!files.length) { return; }

    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        this._toastr.warning(`«${file.name}» no es una imagen`, 'Galería');
        continue;
      }
      if (file.size > 10 * 1024 * 1024) {
        this._toastr.warning(`«${file.name}» supera los 10 MB`, 'Galería');
        continue;
      }

      if (this.galeriaEnVivo) {
        await this.subirImagen(file);
      } else {
        const vista = await this.leerComoDataUrl(file);
        if (vista && !this.destruido) {
          this.imagenesPendientes.push({ file, vista });
        }
      }
    }
  }

  private leerComoDataUrl(blob: Blob): Promise<string | null> {
    return new Promise((resolve) => {
      if (this.destruido) { resolve(null); return; }
      const lector = new FileReader();
      this.lectores.add(lector);
      const terminar = (valor: string | null) => {
        this.lectores.delete(lector);
        lector.onloadend = null;
        lector.onerror = null;
        resolve(this.destruido ? null : valor);
      };
      lector.onloadend = () => terminar(lector.result as string);
      lector.onerror = () => terminar(null);
      lector.readAsDataURL(blob);
    });
  }

  /** Sube una imagen al producto que ya existe. */
  private async subirImagen(file: File): Promise<void> {
    if (!this.productoId) { return; }
    try {
      this.imagenEnVuelo = 'nueva';
      const datos = new FormData();
      datos.append('ProductoId', String(this.productoId));
      datos.append('imagen_file', file);
      const res: any = await firstValueFrom(this._productoService.addImagen(datos));
      if (res?.status !== 'success') {
        this._toastr.error(res?.message || `No se pudo subir «${file.name}»`, 'Galería');
        return;
      }
      // La función devuelve la galería entera ya ordenada: se usa esa y no
      // se arma a mano, que es como se acaba con dos principales
      this.imagenes = res.data?.imagenes ?? this.imagenes;
    } catch (error) {
      console.error('Error al subir la imagen:', error);
    } finally {
      this.imagenEnVuelo = null;
    }
  }

  /** Quita una imagen ya guardada. */
  async quitarImagen(img: ImagenProductoModel): Promise<void> {
    if (this.esView) { return; }
    try {
      this.imagenEnVuelo = img.id;
      const res: any = await firstValueFrom(this._productoService.deleteImagen(img.id));
      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo quitar la imagen', 'Galería');
        return;
      }
      // Si la que se fue era la principal, el servidor ya ascendió otra
      this.imagenes = res.data?.imagenes ?? this.imagenes.filter(i => i.id !== img.id);
    } catch (error) {
      console.error('Error al quitar la imagen:', error);
    } finally {
      this.imagenEnVuelo = null;
    }
  }

  /** Quita una de las que todavía no se han subido. */
  quitarPendiente(indice: number): void {
    this.imagenesPendientes.splice(indice, 1);
  }

  /** Marca una imagen como la principal (la que sale en la rejilla). */
  async marcarPrincipal(img: ImagenProductoModel): Promise<void> {
    if (this.esView || img.principal) { return; }
    try {
      this.imagenEnVuelo = img.id;
      const res: any = await firstValueFrom(this._productoService.imagenPrincipal(img.id));
      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo marcar la imagen', 'Galería');
        return;
      }
      this.imagenes = res.data?.imagenes ?? this.imagenes;
    } catch (error) {
      console.error('Error al marcar la imagen principal:', error);
    } finally {
      this.imagenEnVuelo = null;
    }
  }

  /** Mueve una imagen un puesto a la izquierda o a la derecha. */
  async moverImagen(indice: number, desplazamiento: -1 | 1): Promise<void> {
    if (this.esView) { return; }
    const destino = indice + desplazamiento;
    if (destino < 0 || destino >= this.imagenes.length) { return; }

    // Se mueve en pantalla primero: el orden es cosa de mirar, y esperar al
    // servidor para ver el cambio hace que parezca que no responde
    const copia = [...this.imagenes];
    [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
    this.imagenes = copia;

    if (!this.productoId) { return; }
    try {
      const res: any = await firstValueFrom(
        this._productoService.ordenarImagenes(this.productoId, this.imagenes.map(i => i.id))
      );
      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo guardar el orden', 'Galería');
        return;
      }
      this.imagenes = res.data?.imagenes ?? this.imagenes;
    } catch (error) {
      console.error('Error al ordenar la galería:', error);
    }
  }

  /**
   * Sube las que estaban esperando, ya con el id.
   *
   * Si alguna falla NO se deshace el guardado: el producto ya está bien
   * creado y lo que falta son imágenes, que se pueden volver a subir
   * entrando a modificarlo.
   */
  private async subirPendientes(id: number): Promise<void> {
    if (!this.imagenesPendientes.length) { return; }
    let fallos = 0;
    for (const p of this.imagenesPendientes) {
      try {
        const datos = new FormData();
        datos.append('ProductoId', String(id));
        datos.append('imagen_file', p.file);
        const res: any = await firstValueFrom(this._productoService.addImagen(datos));
        if (res?.status !== 'success') { fallos++; }
      } catch {
        fallos++;
      }
    }
    if (fallos) {
      this._toastr.warning(
        `El producto se guardó, pero ${fallos} ${fallos === 1 ? 'imagen no se pudo subir' : 'imágenes no se pudieron subir'}`,
        'Galería');
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

    const payload: any = this.form.getRawValue();

    // Los vacíos van como null, no como '': el back los distingue
    for (const k of ['codigo_barras', 'modelo']) {
      payload[k] = (payload[k] ?? '').toString().trim() || null;
    }

    // Las características rellenas. Van siempre, aunque la lista esté
    // vacía: es la foto completa de la ficha, y el servidor borra lo que
    // no venga. Lo que quede sin valor lo descarta él (una característica
    // sin valor no es un dato).
    // Una fila añadida y dejada sin nombre no es nada: se tira aquí para
    // no mandar basura (el servidor también la descarta).
    payload.caracteristicas = this.caracteristicas
      .filter(c => (c.nombre ?? '').toString().trim())
      .map(c => ({
        caracteristica_id: c.caracteristica_id,
        nombre: (c.nombre ?? '').toString().trim(),
        valor: (c.valor ?? '').toString().trim(),
        orden: c.orden,
      }));

    // La descripción ahora es HTML: el editor devuelve «<p></p>» cuando no
    // se escribió nada, y eso no es una descripción, es el envoltorio
    // vacío. Se mira el TEXTO para decidir, como en saveGestion.
    payload.descripcion = soloTexto(payload.descripcion)
      ? (payload.descripcion ?? '').trim()
      : null;
    for (const k of ['stock_maximo', 'peso_kg', 'alto_cm', 'ancho_cm', 'profundidad_cm']) {
      payload[k] = (payload[k] === '' || payload[k] === null || payload[k] === undefined) ? null : Number(payload[k]);
    }
    for (const k of ['costo', 'precio', 'stock_minimo', 'garantia_meses']) {
      payload[k] = (payload[k] === '' || payload[k] === null || payload[k] === undefined) ? 0 : Number(payload[k]);
    }

    await this.saveRecord(payload);
  }

  //   ******   GRABAR DATA  ******  //
  private async saveRecord(data: any): Promise<void> {
    try {
      this._loadingService.setLoading(true);
      this.isdisabled = true;

      if (this.accion === 'edit') {
        this.response = await firstValueFrom(this._productoService.editProducto(this.registro_selected.id, data));
      } else {
        this.response = await firstValueFrom(
          this.accion === 'clon' ? this._productoService.clonProducto(data) : this._productoService.addProducto(data)
        );
      }

      if (this.response?.status !== 'success') {
        this.isdisabled = false;
        return;
      }

      // Las imágenes que estaban esperando, ya con id
      const id = this.accion === 'edit' ? this.registro_selected.id : this.response.data.id;
      this.productoId = id;
      if (this.imagenesPendientes.length) {
        await this.subirPendientes(id);
        // El listado necesita el recuento y la foto para pintar la fila
        this.response.data.num_imagenes = this.imagenesPendientes.length;
      }

      this.registrosE.emit(this.response.data);
      this._toastr.success(this.response.message, 'Éxito', { closeButton: true });
      this.modal.close(this.response.data);
    } catch (error: any) {
      // El AuthInterceptor ya notificó el error HTTP (422 / 409 con el motivo)
      console.error('Error al guardar el producto:', error);
      this.isdisabled = false;
    } finally {
      this._loadingService.setLoading(false);
    }
  }
}
