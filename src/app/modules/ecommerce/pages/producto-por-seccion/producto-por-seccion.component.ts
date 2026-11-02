import {
  Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild,
  inject, ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, firstValueFrom } from 'rxjs';
import { CellClickedEvent, GridApi, GridReadyEvent } from 'ag-grid-community';
import { AgGridModule } from 'ag-grid-angular';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { NgScrollbarModule } from 'ngx-scrollbar';
import {
  CdkDrag, CdkDragDrop, CdkDragHandle, CdkDragPlaceholder, CdkDropList, moveItemInArray,
} from '@angular/cdk/drag-drop';

///   SERVICIOS    ///
import { ProductoSeccionService } from '../../services/productoSeccion.service';
import { ProductoService } from '../../../inventarios/services/producto.service';
import { MarcaService } from '../../../inventarios/services/marca.service';
import { CategoriaService } from '../../../inventarios/services/categoria.service';
import { SeguridadService } from '../../../seguridad/services/seguridad.service';
import { AppAgGridService } from '../../../../service/app-agGrid.service';
import { LoadingService } from '../../../../service/loading.service';

///   MODELOS    ///
import { AccesoModel } from '../../../seguridad/interfaces/accesoModel';
import {
  SeccionProductoModel, VistaProductos, VISTAS_PRODUCTOS, FiltroProductos,
} from '../../interfaces/productoSeccionModel';

///   COMPONENTES    ///
import { PanelComponent } from '../../../../components/panel/panel.component';
import { CampoBusquedaPaginacionComponent } from '../../../../components/campos/campoBusquedaPaginacion/campoBusquedaPaginacion.component';
import { ComboMultiSeleccionComponent } from '../../../../components/campos/combo-multi-seleccion/combo-multi-seleccion.component';
import { FilasEstirablesDirective } from '../../../../core/directives/filasEstirables.directive';
import { SaveSeccionProductoComponent } from './saveSeccionProducto/saveSeccionProducto.component';

/**
 * PRODUCTOS POR SECCIÓN: tres columnas para armar escaparates.
 *
 *   izquierda   las secciones, con lo que lleva cada una
 *   centro      el catálogo, con casillas para elegir
 *   derecha     los filtros, para meter de golpe todo lo que cumple uno
 *
 * UNA SECCIÓN ES UN ESCAPARATE ARMADO A MANO —«Los más vendidos», «Ofertas de
 * navidad»—, y eso es justo lo que la categoría y la marca no saben hacer:
 * ésas las decide quien da de alta el producto, y una sección junta tres
 * televisores de tres marcas y una barra de sonido porque ésa es la oferta de
 * esta semana.
 *
 * CREAR UNA LA PONE EN LA PORTADA, al final y encendida: aparece en «Inicio de
 * la tienda» como una fila más, y allí se le da su orden, su rótulo, su alto y
 * sus fechas. Aquí se decide QUÉ lleva dentro; allí, DÓNDE y CÓMO se ve. Lo
 * hace la base al crearla, así que esta pantalla no tiene que acordarse.
 *
 * EL CATÁLOGO NO SE PIDE AQUÍ: la rejilla usa `ProductoService.allProductos`,
 * la misma que la pantalla de productos. Paginación en servidor, buscador,
 * marcas, categorías por rama y los dos rangos ya están resueltos allí, y un
 * listado propio sería un segundo catálogo que un día deja de traer lo mismo.
 *
 * LA ASIGNACIÓN MASIVA MANDA EL FILTRO, NO LOS IDS. El navegador sólo tiene
 * la página que está viendo; «mete las 340 que cumplen esto» lo resuelve la
 * base llamando a esa misma función de listado. Así lo que entra es
 * exactamente lo que se estaba enseñando, y no hay que mandar 340 números.
 *
 * DOS VISTAS Y NO UN FILTRO DE LA MISMA. «Catálogo» lo pagina el servidor
 * (puede tener miles); «La sección» llega entera (tiene decenas). Por eso
 * reordenar arrastrando sólo se puede en la segunda: arrastrar dentro de una
 * página de diez no dice nada del orden de las otras.
 */
@Component({
  selector: 'app-productoPorSeccion',
  templateUrl: './producto-por-seccion.component.html',
  // La hoja compartida va PRIMERO: lo propio de la pantalla gana sin tener
  // que subir la especificidad de cada regla.
  styleUrls: [
    '../../../../core/styles/columnas-plegables.css',
    './producto-por-seccion.component.css',
  ],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    AgGridModule,
    FilasEstirablesDirective,
    PanelComponent,
    CampoBusquedaPaginacionComponent,
    ComboMultiSeleccionComponent,
    NgScrollbarModule,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    CdkDragPlaceholder,
  ],
})
export class ProductoPorSeccionComponent implements OnInit, OnDestroy {

  public titulo = 'Productos por sección';
  public accesoModel: AccesoModel;
  public isLoading$ = this._loadingService.isLoading$;

  /** Mientras va una llamada que cambia algo: bloquea los mandos. */
  public trabajando = false;

  // ---------- LAS SECCIONES ----------
  public secciones: SeccionProductoModel[] = [];
  public seccionId: number | null = null;
  public cargandoSecciones = false;

  // ---------- LA REJILLA ----------
  public vista: VistaProductos = 'catalogo';
  public readonly vistas = VISTAS_PRODUCTOS;
  /** Las filas que se están enseñando: una página del catálogo, o la sección entera. */
  public filas: any[] = [];

  /**
   * Los ids que ya están en la sección elegida.
   *
   * Un conjunto y no un campo de la fila: la fila viene del catálogo, que no
   * sabe nada de secciones. Marcar la fila obligaría a recorrerlas todas cada
   * vez que se cambia de sección, y a recordar deshacerlo.
   */
  public enLaSeccion = new Set<number>();

  /** Los que tienen una llamada en vuelo, para poner su rueda en la celda. */
  private enVuelo = new Set<number>();

  // ---------- PAGINACIÓN EN SERVIDOR (sólo en «Catálogo») ----------
  public paginaActual = 1;
  public totalRegistros = 0;
  public registrosPorPagina = 10;
  public ultimaPagina = 1;

  // ---------- FILTROS ----------
  public searchTerm = '';
  /** Campos y no getters: ng-select pierde la selección si el array es nuevo cada ciclo. */
  public marcaFiltro: number[] = [];
  public categoriaFiltro: number[] = [];
  public precioMin: number | null = null;
  public precioMax: number | null = null;
  public costoMin: number | null = null;
  public costoMax: number | null = null;
  public filtrosColumna: any = {};

  public marcas: any[] = [];
  public categoriasPlanas: { id: number; ruta: string }[] = [];

  // ---------- LAS COLUMNAS QUE SE PLIEGAN ----------
  public lateralPlegado = false;
  public filtrosPlegados = false;
  public readonly ANCHO_LATERAL_DEFECTO = 300;
  private readonly ANCHO_LATERAL_MIN = 200;
  private readonly ANCHO_LATERAL_MAX = 640;
  public readonly ANCHO_FILTROS_DEFECTO = 270;
  private readonly CLAVE_ANCHO_LATERAL = 'miCRM3.productoPorSeccion.anchoLateral';
  private readonly CLAVE_ANCHO_FILTROS = 'miCRM3.productoPorSeccion.anchoFiltros';
  public anchoLateral = this.leerAncho(this.CLAVE_ANCHO_LATERAL, this.ANCHO_LATERAL_DEFECTO);
  public anchoFiltros = this.leerAncho(this.CLAVE_ANCHO_FILTROS, this.ANCHO_FILTROS_DEFECTO);
  public redimensionando = false;
  public mobileSidebarToggled = false;
  /** Cuál de los dos divisores se está arrastrando. */
  private cualDivisor: 'lateral' | 'filtros' | null = null;

  // ---------- ag-Grid ----------
  public gridApi!: GridApi;
  public columnDefs: any[] = [];
  private readonly COLUMNA_ASA = 'asa';
  public rowClassRules = {
    ...this._appAgGridService.reglasFilaInactiva('activo'),
    // La fila que ya está dentro, marcada: con 1.000 productos y diez por
    // página, la casilla sola obliga a mirar fila por fila.
    'pps-fila--dentro': (p: any) => this.vista === 'catalogo' && this.enLaSeccion.has(p.data?.id),
  };

  @ViewChild(CampoBusquedaPaginacionComponent) campoBusqueda!: CampoBusquedaPaginacionComponent;

  private readonly unsubscribe$ = new Subject<void>();
  private timeoutIds = new Set<any>();
  private resizeTimeoutId: any;

  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private modal = inject(NgbModal);
  private router = inject(Router);
  private activeRoute = inject(ActivatedRoute);
  private _toastr = inject(ToastrService);
  private _seguridadService = inject(SeguridadService);
  private _seccionService = inject(ProductoSeccionService);
  private _productoService = inject(ProductoService);
  private _marcaService = inject(MarcaService);
  private _categoriaService = inject(CategoriaService);

  constructor(
    public _appAgGridService: AppAgGridService,
    private _loadingService: LoadingService,
  ) {
    this.accesoModel = this.activeRoute.snapshot.data['access'];
  }

  ngOnInit(): void {
    this.columnDefs = this.columnasDe(this.vista);
    this.cargarFiltros();
    this.cargarSecciones(true);
  }

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
    this.timeoutIds.forEach(id => clearTimeout(id));
    this.timeoutIds.clear();
    if (this.resizeTimeoutId) { clearTimeout(this.resizeTimeoutId); }
    this.modal.dismissAll();
  }

  private programar(fn: () => void, ms: number): void {
    const id = setTimeout(() => { this.timeoutIds.delete(id); fn(); }, ms);
    this.timeoutIds.add(id);
  }

  // ================================================================
  // PERMISOS
  // ================================================================

  get puedeCrear(): boolean { return this.accesoModel?.crear === true; }
  get puedeEditar(): boolean { return this.accesoModel?.editar === true; }
  get puedeBorrar(): boolean { return this.accesoModel?.eliminar === true; }

  /** La sección elegida, o null. */
  get seccion(): SeccionProductoModel | null {
    return this.secciones.find(s => s.id === this.seccionId) ?? null;
  }

  /**
   * Por qué no se puede meter nada, para decirlo en el botón.
   *
   * Un botón apagado sin motivo es una pantalla que no contesta: sin sección
   * elegida el gesto no tiene destino, y eso hay que escribirlo.
   */
  get motivoSinAsignar(): string {
    if (!this.puedeEditar) { return 'No tienes permiso para cambiar las secciones'; }
    if (!this.seccion)     { return 'Elige primero una sección de la izquierda'; }
    return '';
  }

  volver(): void { this.router.navigate(['/ecommerce/home']); }

  // ================================================================
  // LAS SECCIONES
  // ================================================================

  /**
   * Trae la lista y conserva lo elegido.
   *
   * `primera` elige la primera al entrar: una pantalla de tres columnas con
   * la del medio vacía no se entiende, y la primera sección es tan buena
   * suposición como cualquiera.
   */
  async cargarSecciones(primera = false): Promise<void> {
    this.cargandoSecciones = true;
    try {
      const res: any = await firstValueFrom(this._seccionService.allSecciones());
      this.secciones = res?.data ?? [];

      // Si la elegida ya no está (la borró otro), se cae a la primera
      if (this.seccionId !== null && !this.secciones.some(s => s.id === this.seccionId)) {
        this.seccionId = null;
      }
      // La que pidan por la dirección gana: se llega aquí desde la portada,
      // con una sección concreta en la cabeza. Sólo al entrar: después manda
      // lo que se haya pulsado.
      if (primera) { this.seccionId = this.laQuePiden() ?? this.seccionId; }

      if (this.seccionId === null && (primera || this.vista === 'seccion') && this.secciones.length) {
        this.seccionId = this.secciones[0].id;
      }

      await this.alCambiarDeSeccion();
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudieron cargar las secciones', 'Error',
                         { timeOut: 15000, closeButton: true });
      this.secciones = [];
    } finally {
      this.cargandoSecciones = false;
    }
  }

  /**
   * La sección que pide la dirección (`?seccion=7`), si existe y está viva.
   *
   * Se comprueba contra la lista en vez de fiarse del número: la dirección la
   * puede traer un enlace viejo de una sección que ya está en la papelera, y
   * elegir una que no está deja la pantalla con los botones apagados y sin
   * decir por qué.
   */
  private laQuePiden(): number | null {
    const pedida = Number(this.activeRoute.snapshot.queryParamMap.get('seccion'));
    if (!Number.isFinite(pedida) || pedida <= 0) { return null; }
    return this.secciones.some(s => s.id === pedida) ? pedida : null;
  }

  async elegirSeccion(s: SeccionProductoModel): Promise<void> {
    if (this.seccionId === s.id) { return; }
    this.seccionId = s.id;
    await this.alCambiarDeSeccion();
  }

  /** Lo que hay que rehacer cuando cambia la sección elegida. */
  private async alCambiarDeSeccion(): Promise<void> {
    await this.cargarIdsDeLaSeccion();
    if (this.vista === 'seccion') {
      await this.cargarLaSeccion();
    } else {
      // El catálogo es el mismo; lo que cambia es qué filas salen marcadas
      this.repintarTodo();
    }
  }

  /** Los ids que ya están dentro, para marcar la rejilla del catálogo. */
  private async cargarIdsDeLaSeccion(): Promise<void> {
    this.enLaSeccion = new Set<number>();
    if (this.seccionId === null) { return; }
    try {
      const res: any = await firstValueFrom(this._seccionService.ids(this.seccionId));
      this.enLaSeccion = new Set<number>((res?.data ?? []).map((n: any) => Number(n)));
    } catch {
      // Sin esto la rejilla no marca nada, pero sigue sirviendo para asignar:
      // la base no duplica, así que agregar algo que ya estaba no hace daño.
    }
  }

  nuevaSeccion(): void {
    if (this._seguridadService.isexpired() || !this.puedeCrear) { return; }
    const ref = this.modal.open(SaveSeccionProductoComponent, { size: 'md', centered: true, backdrop: 'static' });
    ref.result.then(
      async (creada: any) => {
        // Se queda elegida: lo siguiente que se va a hacer es llenarla
        if (creada?.id) { this.seccionId = Number(creada.id); }
        await this.cargarSecciones();
      },
      () => {});
  }

  editarSeccion(s: SeccionProductoModel): void {
    if (this._seguridadService.isexpired() || !this.puedeEditar) { return; }
    const ref = this.modal.open(SaveSeccionProductoComponent, { size: 'md', centered: true, backdrop: 'static' });
    ref.componentInstance.seccion = s;
    ref.result.then(async () => { await this.cargarSecciones(); }, () => {});
  }

  async alternarSeccion(s: SeccionProductoModel): Promise<void> {
    if (this._seguridadService.isexpired() || !this.puedeEditar || this.trabajando) { return; }

    // Se manda el valor QUE SE QUIERE, no «lo contrario de lo que hay»: si dos
    // personas pulsan a la vez, las dos acaban donde querían llegar.
    const quiero = !s.activo;
    this.trabajando = true;
    try {
      const res: any = await firstValueFrom(this._seccionService.activarSeccion(s.id, quiero));
      this._toastr.success(res?.message ?? 'Sección guardada', 'Listo');
      // La base decide: puede seguir sin verse por la vigencia
      const guardada: SeccionProductoModel | null = res?.data ?? null;
      if (guardada) { this.secciones = this.secciones.map(x => x.id === s.id ? guardada : x); }
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo cambiar la sección', 'Error',
                         { timeOut: 15000, closeButton: true });
    } finally {
      this.trabajando = false;
    }
  }

  async borrarSeccion(s: SeccionProductoModel): Promise<void> {
    if (this._seguridadService.isexpired() || !this.puedeBorrar || this.trabajando) { return; }

    const conQue = s.productos === 0 ? 'Está vacía.'
                 : s.productos === 1 ? 'Se va con su producto dentro.'
                 : `Se va con sus ${s.productos} productos dentro.`;
    if (!confirm(`¿Enviar «${s.nombre}» a la papelera?\n\n${conQue}\n`
                 + 'Se puede restaurar, y vuelve con lo que tenía.')) { return; }

    this.trabajando = true;
    try {
      const res: any = await firstValueFrom(this._seccionService.deleteSeccion(s.id));
      this._toastr.success(res?.message ?? 'Enviada a la papelera', 'Listo');
      if (this.seccionId === s.id) { this.seccionId = null; }
      await this.cargarSecciones(true);
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo eliminar la sección', 'Error',
                         { timeOut: 15000, closeButton: true });
    } finally {
      this.trabajando = false;
    }
  }

  /** Se soltó una sección en otro sitio de la lista. */
  async moverSeccion(ev: CdkDragDrop<SeccionProductoModel[]>): Promise<void> {
    if (!this.puedeEditar || ev.previousIndex === ev.currentIndex) { return; }

    moveItemInArray(this.secciones, ev.previousIndex, ev.currentIndex);
    const ids = this.secciones.map(s => s.id);

    this.trabajando = true;
    try {
      // Sin aviso emergente: el orden nuevo ya está a la vista, y un toast por
      // cada arrastre es ruido.
      await firstValueFrom(this._seccionService.ordenarSecciones(ids));
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo guardar el orden', 'Error',
                         { timeOut: 15000, closeButton: true });
      // Lo de la pantalla ya no es lo que hay guardado
      await this.cargarSecciones();
    } finally {
      this.trabajando = false;
    }
  }

  // ================================================================
  // LA REJILLA
  // ================================================================

  /**
   * Las columnas de la vista que toca.
   *
   * SE REHACEN AL CAMBIAR DE VISTA en vez de esconder y enseñar columnas,
   * porque lo que cambia no es sólo cuáles se ven: en «La sección» no hay
   * servidor que aplique los filtros de cabecera —la lista llega entera—, así
   * que tienen que DESAPARECER. Dejados ahí serían una fila de campos donde se
   * puede escribir y no pasa nada.
   */
  private columnasDe(vista: VistaProductos): any[] {
    const enSeccion = vista === 'seccion';
    return this._appAgGridService.filtrosDeServidor([
      {
        // El asa de arrastrar: sólo en «La sección», que es donde hay un orden
        // que tocar.
        headerName: '', field: this.COLUMNA_ASA, colId: this.COLUMNA_ASA,
        rowDrag: true, hide: !enSeccion || !this.puedeEditar,
        minWidth: 34, maxWidth: 34,
        sortable: false, filter: false, resizable: false, suppressHeaderMenuButton: true,
        cellClass: 'celda-asa',
        headerTooltip: 'Arrastra una fila para cambiarla de sitio dentro de la sección',
      },
      {
        headerName: '#', field: 'orden_seccion', colId: 'orden_seccion', hide: !enSeccion,
        headerTooltip: 'En qué puesto va dentro de la sección',
        cellStyle: { textAlign: 'center' }, minWidth: 54, maxWidth: 70,
        sortable: false, filter: false,
      },
      {
        // La casilla de «ya está dentro». PULSABLE: meter un producto suelto
        // es el gesto de todos los días, y obligar a marcarlo y luego darle a
        // un botón de la barra son dos pasos para una cosa.
        headerName: 'En la sección', field: 'en_seccion', colId: 'en_seccion',
        hide: enSeccion,
        headerTooltip: 'Pulsa para meter el producto en la sección o sacarlo',
        cellStyle: { textAlign: 'center' }, minWidth: 110, maxWidth: 130,
        sortable: false, filter: false,
        cellRenderer: (p: any) => this.casillaEnSeccion(p),
      },
      {
        // La imagen principal. El hueco gris mide lo mismo que la foto: así la
        // columna no baila entre filas con y sin imagen.
        headerName: 'Foto', field: 'foto', minWidth: 60, maxWidth: 60, sortable: false,
        cellStyle: { display: 'flex', justifyContent: 'center', alignItems: 'center' },
        cellRenderer: (p: any) => {
          const idImagen = p.data?.foto_id;
          if (!p.value || !idImagen) {
            return '<span class="lista-foto lista-foto--vacia"><i class="fa fa-box"></i></span>';
          }
          const url = this._productoService.urlImagen(idImagen);
          return `<img src="${url}" alt="" class="lista-foto"
                       onerror="this.onerror=null; this.outerHTML='<span class=\\'lista-foto lista-foto--vacia\\'><i class=\\'fa fa-box\\'></i></span>'" />`;
        },
      },
      {
        headerName: 'Código', field: 'codigo',
        cellStyle: { textAlign: 'left', fontWeight: '600' }, minWidth: 120, maxWidth: 170,
        // Casilla por fila y en la cabecera: la selección múltiple es la que
        // alimenta «agregar» y «quitar» de la barra.
        checkboxSelection: true,
        headerCheckboxSelection: true,
        headerCheckboxSelectionFilteredOnly: true,
      },
      {
        headerName: 'Producto', field: 'nombre',
        cellStyle: { textAlign: 'left' }, minWidth: 240, maxWidth: 480,
      },
      {
        headerName: 'Marca', field: 'marca_nombre',
        cellStyle: { textAlign: 'left' }, minWidth: 110, maxWidth: 170,
      },
      {
        headerName: 'Categoría', field: 'categoria_nombre',
        tooltipField: 'categoria_ruta',
        cellStyle: { textAlign: 'left' }, minWidth: 130, maxWidth: 200,
      },
      {
        headerName: 'Precio', field: 'precio',
        cellStyle: { textAlign: 'right', fontWeight: '600' }, minWidth: 110, maxWidth: 130,
        valueFormatter: (p: any) => this.formatoMoneda(p.value),
      },
      {
        // Sólo se mira: el estado del producto se cambia en su pantalla, no
        // desde un escaparate. Pero hay que verlo: un producto apagado metido
        // en la sección no lo enseñaría la tienda.
        headerName: 'Activo', field: 'activo',
        headerTooltip: 'Si el producto está activo en el catálogo; se cambia en Productos',
        cellStyle: { textAlign: 'center' }, minWidth: 80, maxWidth: 90,
        cellRenderer: (p: any) => p.value === false
          ? '<i class="fa fa-circle-xmark text-danger" title="Producto inactivo: la tienda no lo enseñaría"></i>'
          : '<i class="fa fa-circle-check text-success" title="Producto activo"></i>',
      },
    // La lista blanca tiene que decir lo mismo que la de ProductoController:
    // lo que no esté allí se tira en el servidor, así que ofrecerlo aquí sería
    // pintar un filtro que no filtra. En «La sección» va vacía: sin filtros.
    ], enSeccion ? {} : ProductoPorSeccionComponent.COLUMNAS_FILTRABLES);
  }

  private static readonly COLUMNAS_FILTRABLES: { [campo: string]: 'texto' | 'numero' } = {
    codigo: 'texto', nombre: 'texto', marca_nombre: 'texto',
    categoria_nombre: 'texto', precio: 'numero',
  };

  /** Pone en la rejilla las columnas de la vista de ahora. */
  private aplicarColumnas(): void {
    this.columnDefs = this.columnasDe(this.vista);
    this.gridApi?.setGridOption('columnDefs', this.columnDefs);
    this.programar(() => this.ajustarTamanoGrid(), 60);
  }

  /** La casilla de «está dentro», como HTML: el clic se atiende por data-accion. */
  private casillaEnSeccion(params: any): string {
    const id = Number(params.data?.id);

    if (this.enVuelo.has(id)) {
      return `<div class="celda-activo">
                <span class="spinner-border spinner-border-sm text-secondary"
                      role="status" aria-label="Guardando"></span>
              </div>`;
    }

    if (this.seccionId === null) {
      return `<div class="celda-activo" title="Elige primero una sección">
                <input type="checkbox" class="form-check-input" disabled aria-label="Sin sección" />
              </div>`;
    }

    const dentro = this.enLaSeccion.has(id);
    const donde  = this.seccion?.nombre ?? 'la sección';
    const titulo = this.puedeEditar
      ? (dentro ? `Sacar de «${donde}»` : `Meter en «${donde}»`)
      : (dentro ? `Está en «${donde}»` : `No está en «${donde}»`);

    return `<div class="celda-activo" title="${this.escapar(titulo)}">
              <input type="checkbox"
                     class="form-check-input${this.puedeEditar ? ' celda-activo__check' : ''}"
                     ${dentro ? 'checked' : ''}
                     ${this.puedeEditar ? 'data-accion="en-seccion"' : 'disabled'}
                     aria-label="${this.escapar(titulo)}" />
            </div>`;
  }

  private escapar(s: string): string {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  formatoMoneda(valor: any): string {
    if (valor === null || valor === undefined || valor === '') { return ''; }
    const n = Number(valor);
    if (isNaN(n)) { return String(valor); }
    return '$ ' + n.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  onGridReady(params: GridReadyEvent): void {
    this.gridApi = params.api;
    this.cargarVista();
  }

  async cambiarVista(v: VistaProductos): Promise<void> {
    if (this.vista === v) { return; }
    this.vista = v;

    // Los filtros de cabecera son del catálogo. Al irse a la sección se
    // quitan ANTES de rehacer las columnas: si no, el modelo se quedaría
    // puesto y al volver al catálogo filtraría sin que se vea por qué.
    if (v === 'seccion' && this.cuantasColumnasFiltradas) { this.limpiarFiltrosDeColumna(); }

    this.aplicarColumnas();
    await this.cargarVista();
  }

  /** Pide lo que toque según la vista. */
  async cargarVista(pagina?: number): Promise<void> {
    if (this.vista === 'seccion') { await this.cargarLaSeccion(); }
    else { await this.cargarCatalogo(pagina ?? this.paginaActual); }
  }

  /** Una página del catálogo, con todos los filtros puestos. */
  async cargarCatalogo(page = 1): Promise<void> {
    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(
        this._productoService.allProductos(page, this.registrosPorPagina, this.searchTerm,
                                           this.marcaFiltro, this.categoriaFiltro,
                                           this.filtrosColumna, this.rangos));

      if (res.body?.status !== 'success') {
        this._toastr.error(res.body?.message || 'No se pudo obtener el catálogo', 'Error');
        this.ponerFilas([]);
        this.totalRegistros = 0;
        this.ultimaPagina = 1;
        return;
      }

      this.ponerFilas(res.body?.data?.data ?? []);

      const meta = res.body?.data?.meta;
      if (meta) {
        this.totalRegistros = meta.total;
        this.registrosPorPagina = meta.per_page;
        this.paginaActual = meta.current_page;
        this.ultimaPagina = meta.last_page;
      }
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo obtener el catálogo', 'Error',
                         { timeOut: 15000, closeButton: true });
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  /**
   * Los productos de la sección, enteros.
   *
   * Sin paginar: una sección tiene decenas, no miles, y partirla en páginas
   * haría que arrastrar para ordenar sólo valiera dentro de cada página.
   */
  async cargarLaSeccion(): Promise<void> {
    if (this.seccionId === null) {
      this.ponerFilas([]);
      this.totalRegistros = 0;
      return;
    }
    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._seccionService.productos(this.seccionId));
      const filas = res?.data ?? [];
      this.ponerFilas(filas);
      this.totalRegistros = filas.length;
      this.paginaActual = 1;
      this.ultimaPagina = 1;
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudieron cargar los productos de la sección',
                         'Error', { timeOut: 15000, closeButton: true });
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  private ponerFilas(filas: any[]): void {
    this.filas = filas;
    this.gridApi?.setGridOption('rowData', this.filas);
  }

  /** Repinta las celdas que dependen del conjunto, que no está en la fila. */
  private repintarTodo(): void {
    if (!this.gridApi) { return; }
    // refreshCells y no setData: lo que cambió no está en los datos de la
    // fila, sino en `enLaSeccion`, así que la rejilla no tiene cómo notarlo.
    this.gridApi.refreshCells({ columns: ['en_seccion'], force: true });
    this.gridApi.redrawRows();
  }

  // ================================================================
  // METER Y SACAR
  // ================================================================

  /** Los productos marcados con las casillas; si no hay ninguno, la fila pulsada. */
  private get seleccionados(): any[] {
    return (this.gridApi?.getSelectedRows() ?? []) as any[];
  }

  get cuantosSeleccionados(): number { return this.seleccionados.length; }

  onCellClicked(e: CellClickedEvent): void {
    const origen = e.event?.target as HTMLElement | null;
    if (origen?.closest('[data-accion="en-seccion"]')) {
      this.alternarEnSeccion(e.data);
    }
  }

  /** La casilla de una fila: mete o saca ese producto solo. */
  async alternarEnSeccion(fila: any): Promise<void> {
    if (this._seguridadService.isexpired() || !this.puedeEditar) { return; }
    if (this.seccionId === null) {
      this._toastr.info('Elige primero una sección de la izquierda', 'Secciones de productos');
      return;
    }

    const id = Number(fila?.id);
    if (!id || this.enVuelo.has(id)) { return; }

    const dentro = this.enLaSeccion.has(id);
    this.enVuelo.add(id);
    this.repintarTodo();

    try {
      const res: any = await firstValueFrom(
        dentro ? this._seccionService.quitar(this.seccionId, [id])
               : this._seccionService.agregar(this.seccionId, [id]));

      // LA CASILLA NO DECIDE: quien dice cómo queda es el servidor
      if (dentro) { this.enLaSeccion.delete(id); } else { this.enLaSeccion.add(id); }
      this.refrescarCuenta(res?.data?.seccion);
      this._toastr.success(res?.message ?? 'Listo', 'Secciones de productos');
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo cambiar el producto', 'Error',
                         { timeOut: 15000, closeButton: true });
    } finally {
      this.enVuelo.delete(id);
      this.repintarTodo();
    }
  }

  /** Mete en la sección los productos marcados. */
  async agregarSeleccionados(): Promise<void> {
    if (this._seguridadService.isexpired() || this.motivoSinAsignar || this.trabajando) { return; }

    const ids = this.seleccionados.map(f => Number(f.id)).filter(Boolean);
    if (!ids.length) {
      this._toastr.info('Marca con las casillas los productos que quieres meter', 'Secciones de productos');
      return;
    }

    this.trabajando = true;
    try {
      const res: any = await firstValueFrom(this._seccionService.agregar(this.seccionId!, ids));
      this._toastr.success(res?.message ?? 'Agregados', 'Secciones de productos');
      ids.forEach(id => this.enLaSeccion.add(id));
      this.refrescarCuenta(res?.data?.seccion);
      this.gridApi?.deselectAll();
      if (this.vista === 'seccion') { await this.cargarLaSeccion(); } else { this.repintarTodo(); }
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudieron agregar los productos', 'Error',
                         { timeOut: 15000, closeButton: true });
      // Puede haber entrado una parte: se vuelve a leer quién está dentro
      await this.cargarIdsDeLaSeccion();
      this.repintarTodo();
    } finally {
      this.trabajando = false;
    }
  }

  /** Saca de la sección los productos marcados. */
  async quitarSeleccionados(): Promise<void> {
    if (this._seguridadService.isexpired() || this.motivoSinAsignar || this.trabajando) { return; }

    const ids = this.seleccionados.map(f => Number(f.id)).filter(Boolean);
    if (!ids.length) {
      this._toastr.info('Marca con las casillas los productos que quieres sacar', 'Secciones de productos');
      return;
    }

    this.trabajando = true;
    try {
      const res: any = await firstValueFrom(this._seccionService.quitar(this.seccionId!, ids));
      this._toastr.success(res?.message ?? 'Quitados', 'Secciones de productos');
      ids.forEach(id => this.enLaSeccion.delete(id));
      this.refrescarCuenta(res?.data?.seccion);
      this.gridApi?.deselectAll();
      if (this.vista === 'seccion') { await this.cargarLaSeccion(); } else { this.repintarTodo(); }
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudieron quitar los productos', 'Error',
                         { timeOut: 15000, closeButton: true });
      await this.cargarIdsDeLaSeccion();
      this.repintarTodo();
    } finally {
      this.trabajando = false;
    }
  }

  /**
   * LA ASIGNACIÓN MASIVA: todo lo que cumple el filtro, no sólo esta página.
   *
   * Se pregunta antes y con el número delante, porque es el único gesto de la
   * pantalla que no se ve venir: el filtro puede traer mil productos y la
   * rejilla sólo está enseñando diez.
   */
  async agregarTodoElFiltro(): Promise<void> {
    if (this._seguridadService.isexpired() || this.motivoSinAsignar || this.trabajando) { return; }
    if (this.vista !== 'catalogo') { return; }
    if (!this.totalRegistros) {
      this._toastr.info('Con este filtro no hay ningún producto', 'Secciones de productos');
      return;
    }

    const cuantos = this.totalRegistros;
    const queFiltro = this.hayFiltro ? this.comoSeFiltra() : 'TODO el catálogo, sin filtrar';
    if (!confirm(`¿Meter ${cuantos} ${cuantos === 1 ? 'producto' : 'productos'} en «${this.seccion!.nombre}»?\n\n`
                 + `Es ${queFiltro}.\n`
                 + 'No es sólo lo que se ve en la página: son todos los que cumplen el filtro.\n'
                 + 'Los que ya estén dentro no se duplican.')) { return; }

    this.trabajando = true;
    try {
      const res: any = await firstValueFrom(
        this._seccionService.agregarFiltro(this.seccionId!, this.filtroParaElServidor()));
      this._toastr.success(res?.message ?? 'Agregados', 'Secciones de productos',
                           { timeOut: 8000, closeButton: true });
      this.refrescarCuenta(res?.data?.seccion);
      await this.cargarIdsDeLaSeccion();
      this.gridApi?.deselectAll();
      this.repintarTodo();
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo hacer la asignación', 'Error',
                         { timeOut: 15000, closeButton: true });
      await this.cargarIdsDeLaSeccion();
      this.repintarTodo();
    } finally {
      this.trabajando = false;
    }
  }

  /** El filtro tal como lo quiere el servidor. */
  private filtroParaElServidor(): FiltroProductos {
    return {
      search:        this.searchTerm || '',
      marca_ids:     this.marcaFiltro ?? [],
      categoria_ids: this.categoriaFiltro ?? [],
      filtros:       this.filtrosColumna ?? {},
      precio_min:    this.precioMin,
      precio_max:    this.precioMax,
      costo_min:     this.costoMin,
      costo_max:     this.costoMax,
    };
  }

  /** El filtro en palabras, para la pregunta de la asignación masiva. */
  private comoSeFiltra(): string {
    const partes: string[] = [];
    if (this.searchTerm) { partes.push(`lo que coincide con «${this.searchTerm}»`); }
    if (this.marcaFiltro.length) {
      partes.push(this.marcaFiltro.length === 1 ? '1 marca' : `${this.marcaFiltro.length} marcas`);
    }
    if (this.categoriaFiltro.length) {
      partes.push(this.categoriaFiltro.length === 1 ? '1 categoría' : `${this.categoriaFiltro.length} categorías`);
    }
    if (this.precioMin !== null || this.precioMax !== null) { partes.push('un rango de precio'); }
    if (this.costoMin !== null || this.costoMax !== null) { partes.push('un rango de costo'); }
    if (this.cuantasColumnasFiltradas) {
      partes.push(this.cuantasColumnasFiltradas === 1
        ? 'un filtro de columna' : `${this.cuantasColumnasFiltradas} filtros de columna`);
    }
    return partes.join(' + ');
  }

  /** Mete en la lista la sección que acaba de contestar el servidor. */
  private refrescarCuenta(seccion: SeccionProductoModel | null | undefined): void {
    if (!seccion?.id) { return; }
    this.secciones = this.secciones.map(s => s.id === seccion.id ? seccion : s);
  }

  /**
   * Se soltó una fila en otro sitio dentro de la sección.
   *
   * Con rowDragManaged la rejilla ya la movió en SU modelo; aquí se lee ese
   * orden nuevo —es el único sitio donde está— y se manda al servidor.
   */
  async onFilaArrastrada(): Promise<void> {
    if (this.vista !== 'seccion' || !this.puedeEditar || !this.gridApi || this.seccionId === null) { return; }

    const enPantalla: any[] = [];
    this.gridApi.forEachNode(nodo => { if (nodo.data) { enPantalla.push(nodo.data); } });
    if (enPantalla.length !== this.filas.length) { return; }

    const ids = enPantalla.map(f => Number(f.id));
    if (ids.every((id, i) => id === Number(this.filas[i]?.id))) { return; }  // se soltó donde ya estaba

    // Los números de la columna «#» se reparten aquí, sin esperar la respuesta
    this.filas = enPantalla.map((f, i) => ({ ...f, orden_seccion: i + 1 }));
    this.gridApi.setGridOption('rowData', this.filas);

    this.trabajando = true;
    try {
      await firstValueFrom(this._seccionService.ordenar(this.seccionId, ids));
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo guardar el orden', 'Error',
                         { timeOut: 15000, closeButton: true });
      await this.cargarLaSeccion();
    } finally {
      this.trabajando = false;
    }
  }

  // ================================================================
  // FILTROS
  // ================================================================

  private async cargarFiltros(): Promise<void> {
    try {
      const [marcas, arbol]: any[] = await Promise.all([
        firstValueFrom(this._marcaService.listMarcas(true)),
        firstValueFrom(this._categoriaService.allCategorias(false)),
      ]);
      this.marcas = marcas?.data ?? [];

      // La ruta entera, que es lo que distingue «Accesorios» de «Accesorios»
      this.categoriasPlanas = (arbol?.body?.data ?? [])
        .map((c: any) => ({ id: Number(c.id), ruta: String(c.ruta ?? c.nombre ?? '') }))
        .sort((a: any, b: any) => a.ruta.localeCompare(b.ruta, 'es'));
    } catch (e) {
      // Sin los combos la pantalla sigue sirviendo: se busca por texto
      console.error('No se pudieron cargar los filtros:', e);
    }
  }

  private get rangos() {
    return { precio_min: this.precioMin, precio_max: this.precioMax,
             costo_min: this.costoMin,  costo_max: this.costoMax };
  }

  get cuantosFiltros(): number {
    return (this.marcaFiltro.length ? 1 : 0)
         + (this.categoriaFiltro.length ? 1 : 0)
         + (this.precioMin !== null || this.precioMax !== null ? 1 : 0)
         + (this.costoMin !== null || this.costoMax !== null ? 1 : 0);
  }

  get cuantasColumnasFiltradas(): number {
    return Object.keys(this.filtrosColumna || {}).length;
  }

  get hayFiltro(): boolean {
    return !!this.searchTerm || this.cuantosFiltros > 0 || this.cuantasColumnasFiltradas > 0;
  }

  get tituloQuitarFiltros(): string {
    if (!this.hayFiltro) { return 'No hay filtros que quitar'; }
    const partes: string[] = [];
    if (this.cuantosFiltros) { partes.push(this.cuantosFiltros === 1 ? '1 filtro' : this.cuantosFiltros + ' filtros'); }
    if (this.searchTerm) { partes.push('la búsqueda'); }
    if (this.cuantasColumnasFiltradas === 1) { partes.push('1 columna'); }
    else if (this.cuantasColumnasFiltradas > 1) { partes.push(this.cuantasColumnasFiltradas + ' columnas'); }
    return 'Quitar ' + partes.join(' y ');
  }

  /** Cambió un filtro del panel: siempre a la página 1. */
  onFiltroCambiado(): void {
    this.paginaActual = 1;
    // Los filtros son del catálogo; en «La sección» no hay nada que filtrar
    if (this.vista === 'catalogo') { this.cargarCatalogo(1); }
  }

  /** La cabecera pidió otra cosa. */
  onFiltroColumna(): void {
    if (this.limpiando) { return; }
    this.filtrosColumna = this.gridApi?.getFilterModel() ?? {};
    this.paginaActual = 1;
    if (this.vista === 'catalogo') { this.cargarCatalogo(1); }
  }

  private limpiando = false;

  private limpiarFiltrosDeColumna(): void {
    if (!this.gridApi) { return; }
    this.limpiando = true;
    this.gridApi.setFilterModel(null);
    this.filtrosColumna = {};
    this.limpiando = false;
  }

  async onFilterTextBoxChanged(term?: string): Promise<void> {
    this.searchTerm = term ?? '';
    this.paginaActual = 1;
    if (this.vista === 'catalogo') { await this.cargarCatalogo(1); }
  }

  limpiarTodosLosFiltros(): void {
    this.marcaFiltro = [];
    this.categoriaFiltro = [];
    this.precioMin = this.precioMax = null;
    this.costoMin = this.costoMax = null;
    this.searchTerm = '';
    this.campoBusqueda?.limpiar?.();
    this.limpiarFiltrosDeColumna();
    this.paginaActual = 1;
    if (this.vista === 'catalogo') { this.cargarCatalogo(1); }
  }

  // ================================================================
  // PAGINACIÓN
  // ================================================================

  get desde(): number {
    return this.totalRegistros === 0 ? 0 : (this.paginaActual - 1) * this.registrosPorPagina + 1;
  }

  get hasta(): number {
    return Math.min(this.paginaActual * this.registrosPorPagina, this.totalRegistros);
  }

  irAPagina(p: number): void {
    if (p < 1 || p > this.ultimaPagina || p === this.paginaActual) { return; }
    this.cargarCatalogo(p);
  }

  primeraPagina(): void { this.irAPagina(1); }
  anteriorPagina(): void { this.irAPagina(this.paginaActual - 1); }
  siguientePagina(): void { this.irAPagina(this.paginaActual + 1); }
  ultima(): void { this.irAPagina(this.ultimaPagina); }

  // ================================================================
  // LAS DOS COLUMNAS QUE SE PLIEGAN
  // ================================================================

  alternarLateral(): void {
    this.lateralPlegado = !this.lateralPlegado;
    this.programar(() => this.ajustarTamanoGrid(), 60);
  }

  alternarFiltros(): void {
    this.filtrosPlegados = !this.filtrosPlegados;
    this.programar(() => this.ajustarTamanoGrid(), 60);
  }

  toggleMobileSidebar(): void { this.mobileSidebarToggled = !this.mobileSidebarToggled; }

  iniciarRedimension(ev: PointerEvent, cual: 'lateral' | 'filtros'): void {
    ev.preventDefault();
    this.cualDivisor = cual;
    this.redimensionando = true;

    const inicioX = ev.clientX;
    const base = cual === 'lateral' ? this.anchoLateral : this.anchoFiltros;

    const mover = (e: PointerEvent) => {
      // El lateral crece hacia la derecha y el panel de filtros hacia la
      // izquierda: de ahí el signo
      const delta = cual === 'lateral' ? (e.clientX - inicioX) : (inicioX - e.clientX);
      const ancho = Math.min(this.ANCHO_LATERAL_MAX,
                             Math.max(this.ANCHO_LATERAL_MIN, base + delta));
      if (cual === 'lateral') { this.anchoLateral = ancho; } else { this.anchoFiltros = ancho; }
    };

    const soltar = () => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
      window.removeEventListener('pointercancel', soltar);
      this.redimensionando = false;
      this.cualDivisor = null;
      this.guardarAnchos();
      this.ajustarTamanoGrid();
    };

    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
    window.addEventListener('pointercancel', soltar);
  }

  anchoPorDefecto(cual: 'lateral' | 'filtros'): void {
    if (cual === 'lateral') { this.anchoLateral = this.ANCHO_LATERAL_DEFECTO; }
    else { this.anchoFiltros = this.ANCHO_FILTROS_DEFECTO; }
    this.guardarAnchos();
    this.ajustarTamanoGrid();
  }

  private guardarAnchos(): void {
    try {
      localStorage.setItem(this.CLAVE_ANCHO_LATERAL, String(this.anchoLateral));
      localStorage.setItem(this.CLAVE_ANCHO_FILTROS, String(this.anchoFiltros));
    } catch { /* sin localStorage la pantalla sigue, sólo no recuerda el ancho */ }
  }

  private leerAncho(clave: string, porDefecto: number): number {
    try {
      const n = Number(localStorage.getItem(clave));
      return Number.isFinite(n) && n >= 200 && n <= 640 ? n : porDefecto;
    } catch { return porDefecto; }
  }

  // ================================================================
  // TAMAÑO DE LA REJILLA
  // ================================================================

  @HostListener('window:resize')
  onResize(): void { this.ajustarTamanoGrid(); }

  ajustarTamanoGrid(): void {
    if (!this.gridApi) { return; }
    if (this.resizeTimeoutId) { clearTimeout(this.resizeTimeoutId); }
    this.resizeTimeoutId = setTimeout(() => {
      this._appAgGridService.ajustarTamanoGrid(this.gridApi);
      this.ajustarAlturaGrid();
    }, 100);
  }

  private ajustarAlturaGrid(): void {
    const el = this.host.nativeElement.querySelector('.ag-theme-alpine') as HTMLElement;
    if (!el) { return; }
    const MARGEN_INFERIOR = 60;
    el.style.height = `${window.innerHeight - el.getBoundingClientRect().top - MARGEN_INFERIOR}px`;
    this.gridApi.sizeColumnsToFit();
  }

  /** El botón de recargar del panel. */
  async recargar(): Promise<void> {
    await this.cargarSecciones();
    await this.cargarVista();
  }
}
