import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { Subject, firstValueFrom } from 'rxjs';

import { SeguridadService } from '../../../../seguridad/services/seguridad.service';
import { LoadingService } from '../../../../../service/loading.service';
import { ProductoService } from '../../../services/producto.service';
import { MarcaService } from '../../../services/marca.service';
import { CategoriaService } from '../../../services/categoria.service';
import {
  ProductoModel, ImagenProductoModel,
  UNIDADES_PRODUCTO, TARIFAS_IVA, GARANTIAS_MESES,
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
  public marcas: { id: number; name: string }[] = [];
  public categorias: { id: number; name: string }[] = [];
  public unidades = UNIDADES_PRODUCTO;
  public tarifasIva = TARIFAS_IVA;
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
    private _toastr: ToastrService,
    private _loadingService: LoadingService,
    private _seguridadService: SeguridadService,
    public _productoService: ProductoService,
    private _marcaService: MarcaService,
    private _categoriaService: CategoriaService,
  ) {}

  // ================================================================
  // ESTADO DERIVADO
  // ================================================================

  get esView(): boolean { return this.accion === 'view'; }
  get esNuevo(): boolean { return this.accion === 'add' || this.accion === 'clon'; }
  get ctrlActivo(): FormControl { return this.form.controls['activo'] as FormControl; }
  get ctrlManejaStock(): FormControl { return this.form.controls['maneja_stock'] as FormControl; }
  get ctrlManejaSerie(): FormControl { return this.form.controls['maneja_serie'] as FormControl; }

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
    await this.cargarCatalogos();

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
      descripcion:    [{ value: '', disabled: this.isdisabled }, [Validators.maxLength(4000)]],

      // Clasificación
      marca_id:       [{ value: null, disabled: this.isdisabled }],
      categoria_id:   [{ value: null, disabled: this.isdisabled }],
      modelo:         [{ value: '', disabled: this.isdisabled }, [Validators.maxLength(80)]],

      // Comercial
      unidad:         [{ value: 'UNIDAD', disabled: this.isdisabled }],
      costo:          [{ value: 0, disabled: this.isdisabled }, [Validators.min(0)]],
      precio:         [{ value: 0, disabled: this.isdisabled }, [Validators.min(0)]],
      iva_porcentaje: [{ value: 15, disabled: this.isdisabled }],

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

  /** Marcas y categorías para los dos combos. */
  private async cargarCatalogos(): Promise<void> {
    try {
      const [marcas, categorias]: any[] = await Promise.all([
        firstValueFrom(this._marcaService.listMarcas(true)),
        firstValueFrom(this._categoriaService.listCategorias(true)),
      ]);
      this.marcas = (marcas?.data ?? []).map((m: any) => ({ id: m.id, name: m.nombre }));
      // La RUTA y no el nombre: «Accesorios» a secas no dice de qué
      this.categorias = (categorias?.data ?? []).map((c: any) => ({ id: c.id, name: c.ruta || c.nombre }));
    } catch (error) {
      // Sin combos se puede guardar igual: marca y categoría son opcionales
      console.error('Error al cargar marcas y categorías:', error);
      this._toastr.warning('No se pudieron cargar marcas y categorías', 'Catálogos');
    }
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
        iva_porcentaje: Number(m.iva_porcentaje ?? 15),
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
    for (const k of ['codigo_barras', 'descripcion', 'modelo']) {
      payload[k] = (payload[k] ?? '').toString().trim() || null;
    }
    for (const k of ['stock_maximo', 'peso_kg', 'alto_cm', 'ancho_cm', 'profundidad_cm']) {
      payload[k] = (payload[k] === '' || payload[k] === null || payload[k] === undefined) ? null : Number(payload[k]);
    }
    for (const k of ['costo', 'precio', 'iva_porcentaje', 'stock_minimo', 'garantia_meses']) {
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
