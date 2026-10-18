import { Component, ElementRef, EventEmitter, HostListener, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { Subject, firstValueFrom, from, merge, of } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';
import { CellClickedEvent, GridApi, GridReadyEvent, RowNode } from 'ag-grid-community';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { ActivatedRoute, Router } from '@angular/router';
import { ICellRendererAngularComp } from 'ag-grid-angular';
import { ToastrService } from 'ngx-toastr';

///   SERVICIOS    ///
import { SeguridadService } from '../../../../seguridad/services/seguridad.service';
import { ProductoService } from '../../../services/producto.service';
import { soloTexto } from '../../../../ventas/interfaces/plantillasWhatsapp';
import { MarcaService } from '../../../services/marca.service';
import { CategoriaService } from '../../../services/categoria.service';
import { AppPrintPdfService } from '../../../../../service/app-printPdf.service';
import { AppExportExcelService } from '../../../../../service/app-exportExcel.service';
import { AppExportCsvService } from '../../../../../service/app-exportCsv.service';
import { AppAgGridService } from '../../../../../service/app-agGrid.service';
import { AppDescargaService, PeticionDescarga, AccionDescarga }
  from '../../../../../service/app-descarga.service';
import { LoadingService } from '../../../../../service/loading.service';

///   MODELOS    ///
import { ProductoModel } from '../../../interfaces/productoModel';
import { AccesoModel } from '../../../../seguridad/interfaces/accesoModel';

///   COMPONENTES    ///
import { SaveProductoComponent } from '../saveProducto/saveProducto.component';
import { DeleteProductoComponent } from '../deleteProducto/deleteProducto.component';
import { PapeleraProductosComponent } from '../papeleraProductos/papeleraProductos.component';
import { AuditoriaModalComponent } from '../../../../../components/auditoria-modal/auditoria-modal.component';
import { MenuContextualComponent, OpcionContextual } from '../../../../../components/menuContextual/menuContextual.component';
import { CampoBusquedaPaginacionComponent } from '../../../../../components/campos/campoBusquedaPaginacion/campoBusquedaPaginacion.component';

/**
 * Catálogo de productos (inventarios.productos).
 *
 * Mismo esquema que allCargos: rejilla ag-Grid con paginación EN SERVIDOR,
 * barra con buscador / nuevo / auditoría, columna ACCIONES plegable y
 * exportaciones que piden el listado completo aparte.
 *
 * Con dos cosas propias del catálogo:
 *
 *  · DOS FILTROS, marca y categoría, además del buscador. En un catálogo de
 *    electrodomésticos «ver sólo las refrigeradoras Samsung» es la consulta
 *    de todos los días, y hacerla escribiendo en el buscador es adivinar.
 *  · La categoría filtra POR RAMA: pedir «Línea Blanca» trae también lo que
 *    cuelga de ella, porque los productos cuelgan de las hojas.
 *
 * Toda la lógica de modales vive aquí; el renderer de ACCIONES
 * (ButtonAccionProducto, al final del fichero) sólo delega.
 */
@Component({
  selector: 'app-allProductos',
  templateUrl: './allProductos.component.html',
  styleUrls: ['./allProductos.component.css'],
  standalone: false,
})
export class AllProductosComponent implements OnInit, OnDestroy {

  /** Pregunta qué descargar (la página o todo) y trae las filas. */
  private readonly _appDescargaService = inject(AppDescargaService);

  // ---------- Estado ----------
  public accesoModel: AccesoModel;
  /** Filas de la página actual — NO el catálogo completo. */
  public productoModel: ProductoModel[] = [];
  public selectedRow: ProductoModel | null = null;
  public accionesPlegadas = false;

  public titulo: string;
  public isLoading$ = this._loadingService.isLoading$;

  // ---------- Paginación en servidor ----------
  public paginaActual: number = 1;
  public totalRegistros: number = 0;
  public registrosPorPagina: number = 10;
  public ultimaPagina: number = 1;

  // ---------- Filtros ----------
  /** Marcas y categorías para los dos combos de la barra. */
  public marcas: any[] = [];
  public categorias: any[] = [];
  public marcaFiltro: number | null = null;
  public categoriaFiltro: number | null = null;

  // ---------- ag-Grid ----------
  public gridApi!: GridApi;
  public columnDefs: any[] = [];

  private touchStartTime = 0;
  private touchStartX = 0;
  private touchStartY = 0;

  private readonly unsubscribe$ = new Subject<void>();
  private timeoutIds = new Set<any>();
  private resizeTimeoutId: any;

  private programar(fn: () => void, ms: number): void {
    const id = setTimeout(() => {
      this.timeoutIds.delete(id);
      fn();
    }, ms);
    this.timeoutIds.add(id);
  }

  private headerElement: Element | null = null;
  private readonly onHeaderClick: EventListener = () => this.toggleActionsColumn();
  private readonly onHeaderTouchStart: EventListener = (e) => this.handleTouchStart(e as TouchEvent);
  private readonly onHeaderTouchEnd: EventListener = (e) => this.handleTouchEnd(e as TouchEvent);

  @HostListener('window:resize')
  onResize(): void { this.ajustarTamanoGrid(); }

  // ---------- Búsqueda ----------
  @ViewChild(CampoBusquedaPaginacionComponent) campoBusquedaPaginacion!: CampoBusquedaPaginacionComponent;
  public searchTerm: string = '';

  constructor(
    private host: ElementRef<HTMLElement>,
    private modal: NgbModal,
    private route: Router,
    private activeRoute: ActivatedRoute,
    private _appPrintPdfService: AppPrintPdfService,
    private _appExportExcelService: AppExportExcelService,
    private _appExportCsvService: AppExportCsvService,
    public _appAgGridService: AppAgGridService,
    private _loadingService: LoadingService,
    private _toastr: ToastrService,
    private _seguridadService: SeguridadService,
    private _productoService: ProductoService,
    private _marcaService: MarcaService,
    private _categoriaService: CategoriaService,
  ) {
    this.titulo = 'Productos';
    this.accesoModel = this.activeRoute.snapshot.data.access;
  }

  ngOnInit(): void {
    this.allProductos();
    this.initializeGrid();
    this.cargarFiltros();
  }

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
    this.timeoutIds.forEach(id => clearTimeout(id));
    this.timeoutIds.clear();
    if (this.resizeTimeoutId) { clearTimeout(this.resizeTimeoutId); }
    this.quitarListenersCabecera();
    this.modal.dismissAll();
  }

  public escucharModal<T>(modalRef: NgbModalRef, salida: EventEmitter<T>, alEmitir: (valor: T) => void): void {
    const modalCerrado$ = from(modalRef.result).pipe(catchError(() => of(null)));
    salida
      .pipe(takeUntil(merge(this.unsubscribe$, modalCerrado$)))
      .subscribe({
        next: alEmitir,
        error: (err) => console.error('Error en el modal:', err),
      });
  }

  fun_home() {
    this.route.navigate(['/inventarios']);
  }

  public get desde(): number {
    return this.totalRegistros === 0 ? 0 : (this.paginaActual - 1) * this.registrosPorPagina + 1;
  }

  public get hasta(): number {
    return Math.min(this.paginaActual * this.registrosPorPagina, this.totalRegistros);
  }

  // ================================================================
  // AG-GRID
  // ================================================================

  /**
   * Las columnas que llevan filtro en la cabecera, y de qué tipo.
   *
   * Tiene que decir lo mismo que la lista blanca de ProductoController: lo
   * que no esté allí se tira en el servidor, así que ponerlo sólo aquí sería
   * pintar un filtro que no filtra.
   *
   * `activo`, `foto`, `maneja_serie` y las acciones se quedan fuera: son una
   * casilla y unos iconos, y escribir texto para marcarlos no se entiende.
   */
  private readonly COLUMNAS_FILTRABLES: { [campo: string]: 'texto' | 'numero' } = {
    id: 'numero', costo: 'numero', precio: 'numero', iva_porcentaje: 'numero',
    garantia_meses: 'numero', stock_minimo: 'numero', num_imagenes: 'numero',
    codigo: 'texto', nombre: 'texto', marca_nombre: 'texto',
    categoria_nombre: 'texto', modelo: 'texto', updated_by: 'texto',
    // Las fechas, como texto sobre lo que se ve: «2026-10» busca el mes
    created_at: 'texto', updated_at: 'texto',
  };

  /** Lo que haya pedido la cabecera, tal cual lo da ag-Grid. */
  public filtrosColumna: any = {};

  /** Para no recargar mientras se limpian los filtros de golpe. */
  private limpiando = false;

  /**
   * Las columnas con su filtro de cabecera.
   *
   * El CÓMO —que la rejilla recoja el filtro pero no lo aplique, porque sólo
   * tiene las filas de la página— vive en AppAgGridService. Aquí queda el QUÉ.
   */
  private conFiltros(columnas: any[]): any[] {
    return this._appAgGridService.filtrosDeServidor(columnas, this.COLUMNAS_FILTRABLES);
  }

  /**
   * La cabecera pidió otra cosa.
   *
   * Siempre a la página 1: con el filtro nuevo, la página siete puede no
   * existir.
   */
  onFiltroColumna(): void {
    if (this.limpiando) { return; }
    this.filtrosColumna = this.gridApi?.getFilterModel() ?? {};
    this.paginaActual = 1;
    this.allProductos(1);
  }

  /** Cuántas columnas llevan filtro, para decirlo en la pantalla. */
  get cuantasColumnasFiltradas(): number {
    return Object.keys(this.filtrosColumna || {}).length;
  }

  initializeGrid(): void {
    this.columnDefs = this.conFiltros([
      {
        headerName: 'Id',
        field: 'id',
        cellStyle: { textAlign: 'center' },
        minWidth: 70,
        maxWidth: 70,
      },
      {
        // Segunda columna y PULSABLE, igual que en las demás rejillas
        headerName: 'Activo',
        field: 'activo',
        cellStyle: { textAlign: 'center' },
        minWidth: 80,
        maxWidth: 80,
        cellRenderer: (params: any) => this.casillaActivo(params),
      },
      {
        // La imagen principal de la galería. El hueco gris mide lo mismo que
        // la foto: así la columna no baila entre filas con y sin imagen.
        headerName: 'Foto',
        field: 'foto',
        minWidth: 60,
        maxWidth: 60,
        sortable: false,
        cellStyle: { display: 'flex', justifyContent: 'center', alignItems: 'center' },
        cellRenderer: (params: any) => {
          // La ruta va por el id de la IMAGEN, no por el del producto ni por
          // el nombre del fichero: por eso el listado trae `foto_id`.
          const idImagen = params.data?.foto_id;
          if (!params.value || !idImagen) { return '<span class="lista-foto lista-foto--vacia"><i class="fa fa-box"></i></span>'; }
          const url = this._productoService.urlImagen(idImagen);
          return `<img src="${url}" alt="" class="lista-foto"
                       onerror="this.onerror=null; this.outerHTML='<span class=\\'lista-foto lista-foto--vacia\\'><i class=\\'fa fa-box\\'></i></span>'" />`;
        },
      },
      {
        headerName: 'Código',
        field: 'codigo',
        cellStyle: { textAlign: 'left', fontWeight: '600' },
        minWidth: 110,
        maxWidth: 160,
      },
      {
        headerName: 'Producto',
        field: 'nombre',
        cellStyle: { textAlign: 'left' },
        minWidth: 240,
        maxWidth: 480,
        // La descripción se guarda con formato desde saveProducto: en un
        // tooltip, el HTML crudo saldría con las etiquetas a la vista.
        tooltipValueGetter: (p: any) => soloTexto(p.data?.descripcion).slice(0, 400),
      },
      {
        headerName: 'Marca',
        field: 'marca_nombre',
        cellStyle: { textAlign: 'left' },
        minWidth: 110,
        maxWidth: 160,
      },
      {
        headerName: 'Categoría',
        field: 'categoria_nombre',
        // El camino completo en el tooltip: «Accesorios» a secas no dice de qué
        tooltipField: 'categoria_ruta',
        cellStyle: { textAlign: 'left' },
        minWidth: 130,
        maxWidth: 200,
      },
      {
        headerName: 'Modelo',
        field: 'modelo',
        cellStyle: { textAlign: 'left' },
        minWidth: 110,
        maxWidth: 180,
      },
      {
        headerName: 'Costo',
        field: 'costo',
        cellStyle: { textAlign: 'right' },
        minWidth: 110,
        maxWidth: 130,
        valueFormatter: (params: any) => this.formatoMoneda(params.value),
      },
      {
        headerName: 'Precio',
        field: 'precio',
        cellStyle: { textAlign: 'right', fontWeight: '600' },
        minWidth: 110,
        maxWidth: 130,
        valueFormatter: (params: any) => this.formatoMoneda(params.value),
      },
      {
        headerName: 'IVA',
        field: 'iva_porcentaje',
        cellStyle: { textAlign: 'center' },
        minWidth: 70,
        maxWidth: 90,
        valueFormatter: (params: any) =>
          (params.value === null || params.value === undefined) ? '' : Number(params.value).toFixed(0) + ' %',
      },
      {
        headerName: 'Garantía',
        field: 'garantia_meses',
        headerTooltip: 'Meses de garantía del fabricante',
        cellStyle: { textAlign: 'center' },
        minWidth: 90,
        maxWidth: 110,
        valueFormatter: (params: any) => {
          const m = Number(params.value ?? 0);
          if (!m) { return '—'; }
          return m % 12 === 0 ? `${m / 12} ${m === 12 ? 'año' : 'años'}` : `${m} meses`;
        },
      },
      {
        headerName: 'Serie',
        field: 'maneja_serie',
        headerTooltip: 'Se controla cada unidad por número de serie o IMEI',
        cellStyle: { textAlign: 'center' },
        minWidth: 70,
        maxWidth: 90,
        cellRenderer: (params: any) => params.value
          ? '<i class="fa fa-barcode" title="Se controla por serie / IMEI"></i>'
          : '',
      },
      {
        headerName: 'Stock mín.',
        field: 'stock_minimo',
        cellStyle: { textAlign: 'right' },
        minWidth: 100,
        maxWidth: 120,
        valueFormatter: (params: any) =>
          (params.value === null || params.value === undefined) ? '' : Number(params.value).toLocaleString('es-EC'),
      },
      {
        headerName: 'Imágenes',
        field: 'num_imagenes',
        cellStyle: { textAlign: 'center' },
        minWidth: 90,
        maxWidth: 110,
        sortable: false,
        cellRenderer: (params: any) => {
          const n = Number(params.value ?? 0);
          return n ? `<i class="fa fa-images me-1 text-muted"></i>${n}` : '';
        },
      },
      {
        headerName: 'Creado',
        field: 'created_at',
        cellStyle: { textAlign: 'center' },
        minWidth: 160,
        maxWidth: 180,
      },
      {
        headerName: 'Actualizado',
        field: 'updated_at',
        cellStyle: { textAlign: 'center' },
        minWidth: 160,
        maxWidth: 180,
      },
      {
        headerName: 'Actualizado por',
        field: 'updated_by',
        cellStyle: { textAlign: 'left' },
        minWidth: 130,
        maxWidth: 200,
        sortable: false,
      },
      {
        headerName: 'ACCIONES',
        field: 'actions',
        cellStyle: { display: 'flex', justifyContent: 'center', alignItems: 'center' },
        cellRenderer: ButtonAccionProducto,
        pinned: 'right',
        minWidth: AllProductosComponent.ANCHO_ACCIONES_ABIERTA,
        maxWidth: AllProductosComponent.ANCHO_ACCIONES_ABIERTA,
        suppressMenu: true,
        sortable: false,
        resizable: false,
        headerComponentParams: {
          template: `
            <div style="display: flex; align-items: center; justify-content: center; gap: 5px;" title="Ocultar los botones de acción">
              <span>ACCIONES</span>
              <i class="fas fa-arrow-right"></i>
            </div>
          `
        }
      }
    ]);
  }

  /** 1500 → "$ 1.500,00"; vacío si no hay valor. */
  formatoMoneda(valor: any): string {
    if (valor === null || valor === undefined || valor === '') { return ''; }
    const n = Number(valor);
    if (isNaN(n)) { return String(valor); }
    return '$ ' + n.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  onGridReady(params: GridReadyEvent): void {
    this.gridApi = params.api;
    this.programar(() => this.montarListenersCabecera(), 500);
    this._appAgGridService.ajustarTamanoGrid(this.gridApi);
    this.ajustarAlturaGrid();
  }

  private montarListenersCabecera(): void {
    this.quitarListenersCabecera();
    this.headerElement = this.host.nativeElement.querySelector('.ag-header-cell[col-id="actions"]');
    if (!this.headerElement) { return; }
    this.headerElement.addEventListener('click', this.onHeaderClick);
    this.headerElement.addEventListener('touchstart', this.onHeaderTouchStart, { passive: true });
    this.headerElement.addEventListener('touchend', this.onHeaderTouchEnd);
  }

  private quitarListenersCabecera(): void {
    if (!this.headerElement) { return; }
    this.headerElement.removeEventListener('click', this.onHeaderClick);
    this.headerElement.removeEventListener('touchstart', this.onHeaderTouchStart);
    this.headerElement.removeEventListener('touchend', this.onHeaderTouchEnd);
    this.headerElement = null;
  }

  handleTouchStart(e: TouchEvent) {
    this.touchStartTime = Date.now();
    this.touchStartX = e.touches[0].clientX;
    this.touchStartY = e.touches[0].clientY;
  }

  handleTouchEnd(e: TouchEvent) {
    const touchDuration = Date.now() - this.touchStartTime;
    const distX = Math.abs(e.changedTouches[0].clientX - this.touchStartX);
    const distY = Math.abs(e.changedTouches[0].clientY - this.touchStartY);
    if (touchDuration < 300 && distX < 10 && distY < 10) {
      this.toggleActionsColumn();
      e.preventDefault();
    }
  }

  private static readonly ANCHO_ACCIONES_ABIERTA = 130;
  private static readonly ANCHO_ACCIONES_PLEGADA = 50;

  toggleActionsColumn() {
    const columnDefs = this.gridApi.getColumnDefs() as any[];
    const actionsCol = columnDefs.find(col => col.field === 'actions');
    if (!actionsCol) { return; }

    const estabaPlegada = actionsCol.minWidth === AllProductosComponent.ANCHO_ACCIONES_PLEGADA;
    this.accionesPlegadas = !estabaPlegada;

    const ancho = estabaPlegada ? AllProductosComponent.ANCHO_ACCIONES_ABIERTA : AllProductosComponent.ANCHO_ACCIONES_PLEGADA;
    actionsCol.minWidth = ancho;
    actionsCol.maxWidth = ancho;
    actionsCol.cellStyle = { display: 'flex', justifyContent: 'center', alignItems: 'center' };
    actionsCol.headerComponentParams = {
      template: estabaPlegada
        ? `<div style="display: flex; align-items: center; justify-content: center; gap: 5px;" title="Ocultar los botones de acción">
            <span>ACCIONES</span>
            <i class="fas fa-arrow-right"></i>
          </div>`
        : `<div style="display: flex; align-items: center; justify-content: center;" title="Mostrar los botones de acción">
            <i class="fas fa-bars"></i>
          </div>`
    };

    this.gridApi.setColumnDefs(columnDefs);
    this.gridApi.sizeColumnsToFit();
    this.programar(() => {
      this.gridApi.sizeColumnsToFit();
      this.montarListenersCabecera();
    }, 100);
  }

  ajustarTamanoGrid() {
    if (!this.gridApi) { return; }
    if (this.resizeTimeoutId) { clearTimeout(this.resizeTimeoutId); }
    this.resizeTimeoutId = setTimeout(() => {
      this._appAgGridService.ajustarTamanoGrid(this.gridApi);
      this.ajustarAlturaGrid();
    }, 100);
  }

  ajustarAlturaGrid() {
    const gridElement = this.host.nativeElement.querySelector('.ag-theme-alpine') as HTMLElement;
    if (!gridElement) { return; }
    const MARGEN_INFERIOR = 60;
    const alturaDisponible = window.innerHeight - gridElement.getBoundingClientRect().top - MARGEN_INFERIOR;
    gridElement.style.height = `${alturaDisponible}px`;
    this.gridApi.sizeColumnsToFit();
  }

  clearSelection(): void {
    this._appAgGridService.limpiarSeleccion(this.gridApi);
  }

  navegarConTeclado = this._appAgGridService.navegacionConFlechas(fila => this.selectedRow = fila);

  // ================================================================
  // LA CASILLA DE «ACTIVO»
  // ================================================================

  public rowClassRules = this._appAgGridService.reglasFilaInactiva('activo');

  private readonly activoEnVuelo = new Set<number>();

  private casillaActivo(params: any): string {
    return this._appAgGridService.casillaActivo(params, {
      puede: this.accesoModel?.editar === true,
      enVuelo: this.activoEnVuelo,
      que: 'producto',
    });
  }

  cambiarActivo(fila: ProductoModel | null, nodo?: RowNode | null): void {
    if (!fila) { return; }
    if (this._seguridadService.isexpired()) { return; }

    this._appAgGridService.alternarActivo({
      gridApi: this.gridApi,
      filas: this.productoModel,
      fila, nodo,
      campo: 'activo',
      enVuelo: this.activoEnVuelo,
      puede: this.accesoModel?.editar === true,
      que: 'producto',
      llamar: (id, activo) => this._productoService.activarProducto(id, activo),
      nombre: (f: any) => f.nombre,
      hasta: this.unsubscribe$,
    });
  }

  onCellClicked(e: CellClickedEvent): void {
    this.selectedRow = e.data;

    const origen = e.event?.target as HTMLElement | null;
    if (origen?.closest('[data-accion="activo"]')) {
      this.cambiarActivo(e.data, e.node);
    }
  }

  // ================================================================
  // DATOS
  // ================================================================

  /** Las marcas y el árbol de categorías para los dos combos de la barra. */
  private async cargarFiltros(): Promise<void> {
    try {
      const [marcas, categorias]: any[] = await Promise.all([
        firstValueFrom(this._marcaService.listMarcas(true)),
        firstValueFrom(this._categoriaService.listCategorias(true)),
      ]);
      this.marcas = marcas?.data ?? [];
      // En el combo se enseña la RUTA, no el nombre: fuera del árbol,
      // «Accesorios» a secas no dice de qué
      this.categorias = (categorias?.data ?? []).map((c: any) => ({
        id: c.id,
        name: c.ruta || c.nombre,
      }));
    } catch (error) {
      // Sin combos la pantalla sigue sirviendo: se busca por texto
      console.error('Error al cargar los filtros:', error);
    }
  }

  /** Pide una página al servidor y la vuelca en la rejilla. */
  async allProductos(page: number = 1) {
    try {
      this._loadingService.setLoading(true);

      const res = await firstValueFrom(
        this._productoService.allProductos(page, this.registrosPorPagina, this.searchTerm,
                                           this.marcaFiltro, this.categoriaFiltro,
                                           this.filtrosColumna)
      ) as any;

      if (res.body?.status !== 'success') {
        this._toastr.error(res.body?.message || 'No se pudo obtener el catálogo', 'Error');
        this.productoModel = [];
        this.totalRegistros = 0;
        this.ultimaPagina = 1;
        this.gridApi?.setRowData(this.productoModel);
        return;
      }

      this.productoModel = res.body?.data?.data || [];

      if (res.body?.data?.meta) {
        this.totalRegistros = res.body.data.meta.total;
        this.registrosPorPagina = res.body.data.meta.per_page;
        this.paginaActual = res.body.data.meta.current_page;
        this.ultimaPagina = res.body.data.meta.last_page;
      }

      if (this.gridApi) { this.gridApi.setRowData(this.productoModel); }
    } catch (error) {
      console.error('Error al cargar productos:', error);
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  /** Cambió uno de los dos combos: siempre a la página 1. */
  onFiltroCambiado(): void {
    this.paginaActual = 1;
    this.allProductos(1);
  }

  /** Si hay algo que quitar: lo de arriba, los combos o un filtro de columna. */
  get hayFiltro(): boolean {
    return !!this.searchTerm || this.marcaFiltro !== null || this.categoriaFiltro !== null
        || this.cuantasColumnasFiltradas > 0;
  }

  /** Trae TODO lo que cumple el filtro actual, para exportar. */
  private async obtenerTodosParaExportar(): Promise<ProductoModel[]> {
    if (this.totalRegistros === 0) { return []; }
    try {
      this._loadingService.setLoading(true);
      const res = await firstValueFrom(
        this._productoService.allProductos(1, this.totalRegistros, this.searchTerm,
                                           this.marcaFiltro, this.categoriaFiltro,
                                           this.filtrosColumna)
      ) as any;
      if (res.body?.status !== 'success') {
        this._toastr.error(res.body?.message || 'No se pudo obtener el listado completo', 'Error');
        return [];
      }
      return res.body?.data?.data || [];
    } catch (error) {
      console.error('Error al obtener el listado completo:', error);
      return [];
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  /** Filas del reporte, ordenadas por código. */
  /**
   * Filas del reporte con formato de salida.
   *
   * `ordenarPorNombre` sólo cuando se exporta el listado completo: si se
   * exporta la página hay que respetar lo que el usuario tiene delante.
   * Se ordena sobre una COPIA: `sort` cambia el array que recibe, y el de
   * la página es el de la grilla.
   */
  private filasReporte(productos: ProductoModel[], ordenarPorNombre: boolean = true): any[][] {
    return (ordenarPorNombre
      ? [...productos].sort((a, b) => (a.codigo || '').localeCompare(b.codigo || ''))
      : productos)
      .map(item => [
        item.codigo,
        item.nombre,
        item.marca_nombre || '',
        item.categoria_ruta || item.categoria_nombre || '',
        this.formatoMoneda(item.costo),
        this.formatoMoneda(item.precio),
        item.activo ? 'Activo' : 'Inactivo'
      ]);
  }

  // ================================================================
  // BÚSQUEDA
  // ================================================================

  async onFilterTextBoxChanged(term?: string) {
    if (term !== undefined) { this.searchTerm = term; }
    this.paginaActual = 1;
    await this.allProductos(1);
  }

  clearAllFilters() {
    if (!this.hayFiltro) { return; }

    const habiaColumnas = this.cuantasColumnasFiltradas > 0;

    // `limpiando` corta el (filterChanged) que dispara setFilterModel: sin
    // esto se recargaría dos veces, y la primera con los filtros a medio
    // quitar. No se llama a onFilterChanged() a mano por lo mismo.
    this.limpiando = true;
    this.campoBusquedaPaginacion?.reset();
    this.searchTerm = '';
    this.marcaFiltro = null;
    this.categoriaFiltro = null;
    this.filtrosColumna = {};
    if (habiaColumnas) { this.gridApi?.setFilterModel(null); }

    // LA BANDERA SE BAJA EN LA SIGUIENTE VUELTA, no aquí. Medido contra
    // ag-Grid 28: `setFilterModel` NO avisa en esta misma vuelta —el aviso
    // llega tras la microtarea y antes de un setTimeout(0)—, así que
    // apagándola en esta línea el aviso entraría con ella ya baja y
    // pediría al servidor una segunda carga idéntica.
    this.programar(() => { this.limpiando = false; }, 0);

    this.paginaActual = 1;
    this.allProductos(1);
  }

  // ================================================================
  // PAGINACIÓN
  // ================================================================

  firstPage(): void {
    if (this.paginaActual !== 1) { this.goToPage(1); }
  }

  ultimaPagina2(): void {
    if (this.paginaActual !== this.ultimaPagina) { this.goToPage(this.ultimaPagina); }
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.ultimaPagina) { return; }
    this.paginaActual = page;
    this.allProductos(this.paginaActual);
  }

  nextPage(): void { this.goToPage(this.paginaActual + 1); }
  prevPage(): void { this.goToPage(this.paginaActual - 1); }

  // ================================================================
  // IMPRESIÓN Y EXPORTACIÓN
  // ================================================================

  private readonly CABECERAS_REPORTE = ['Código', 'Producto', 'Marca', 'Categoría', 'Costo', 'Precio', 'Estado'];


  /**
   * Lo que se le pide al servicio de descargas: la misma caja para los
   * tres botones. Él pregunta si hace falta, trae las filas y arma el
   * título con los filtros puestos.
   */
  private peticionDescarga(accion: AccionDescarga): PeticionDescarga<any> {
    return {
      accion,
      nombrePlural: 'productos',
      tituloBase: 'Catálogo de Productos',
      gridApi: this.gridApi,
      filasDePagina: this.productoModel,
      total: this.totalRegistros,
      pagina: this.paginaActual,
      ultimaPagina: this.ultimaPagina,
      busqueda: this.searchTerm,
      filtrosColumna: this.filtrosColumna,
      columnDefs: this.columnDefs,
      filtrosExtra: [
        ...(this.marcaFiltro
            ? [`Marca: ${this.marcas.find(m => m.id === this.marcaFiltro)?.nombre ?? this.marcaFiltro}`]
            : []),
        ...(this.categoriaFiltro
            ? [`Categoría: ${this.categorias.find(c => c.id === this.categoriaFiltro)?.name ?? this.categoriaFiltro}`]
            : []),
      ],
      traerTodo: () => this.obtenerTodosParaExportar(),
    };
  }

  async printPdf() {
    const salida = await this._appDescargaService.preparar(this.peticionDescarga('imprimir'));
    if (!salida) { return; }       // no hay nada que descargar, o canceló
    this._appPrintPdfService.generarReporte({
      tamanoPapel: "A4",
      orientacion: "l",
      title: "Reporte de Productos",
      titleTable: salida.titulo,
      headers: this.CABECERAS_REPORTE,
      data: this.filasReporte(salida.filas, salida.alcance === 'todo'),
      piePagina: 'Pie de página - Mi Empresa en Desarrollo S.A....'
    });
  }

  async exportExcel() {
    const salida = await this._appDescargaService.preparar(this.peticionDescarga('excel'));
    if (!salida) { return; }       // no hay nada que descargar, o canceló
    this._appExportExcelService.generarReporteExcel({
      tamanoPapel: "A4",
      orientacion: "l",
      title: "Reporte de Productos",
      titleTable: salida.titulo,
      headers: this.CABECERAS_REPORTE,
      data: this.filasReporte(salida.filas, salida.alcance === 'todo'),
      piePagina: 'Pie de página - Mi Empresa en Desarrollo S.A....'
    });
  }

  async exportCsv() {
    const salida = await this._appDescargaService.preparar(this.peticionDescarga('csv'));
    if (!salida) { return; }       // no hay nada que descargar, o canceló
    this._appExportCsvService.generarReporteCSV({
      headers: this.CABECERAS_REPORTE,
      data: this.filasReporte(salida.filas, salida.alcance === 'todo'),
    });
  }

  // ================================================================
  // ACCIONES (modales)
  // ================================================================

  private abrirModalProducto(registro: any, accion: 'add' | 'edit' | 'clon' | 'view'): NgbModalRef {
    const modalRef = this.modal.open(SaveProductoComponent, {
      centered: true,
      size: 'xl',                 // La ficha es larga y lleva galería
      backdrop: 'static',
      keyboard: accion === 'view',
      scrollable: true,
    });
    modalRef.componentInstance.registro_selected = registro;
    modalRef.componentInstance.accion = accion;
    return modalRef;
  }

  addProducto(): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.abrirModalProducto(0, 'add');
    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, (nuevo: any) => {
      this.productoModel = [nuevo, ...this.productoModel];
      this.totalRegistros++;
      this.gridApi?.setRowData(this.productoModel);
    });
  }

  clonProducto(registro: any): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.abrirModalProducto(registro, 'clon');
    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, (nuevo: any) => {
      this.productoModel = [nuevo, ...this.productoModel];
      this.totalRegistros++;
      this.gridApi?.setRowData(this.productoModel);
    });
  }

  editProducto(registro: any): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.abrirModalProducto(registro, 'edit');
    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, (actualizado: any) => {
      const index = this.productoModel.findIndex(r => r.id === actualizado.id);
      if (index === -1) { return; }
      this.productoModel[index] = actualizado;
      this._appAgGridService.ponerFila(this.gridApi, this.productoModel, actualizado, 'activo');
    });
  }

  viewProducto(registro: any): void {
    if (this._seguridadService.isexpired()) { return; }
    this.abrirModalProducto(registro, 'view');
  }

  /**
   * La papelera de reciclaje.
   *
   * Lo que se «elimina» no se borra: va aquí, y desde aquí se restaura o se
   * borra de verdad. Sólo con el acceso «papelera» del perfil.
   */
  abrirPapelera(): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.modal.open(PapeleraProductosComponent, {
      centered: true, size: 'xl', backdrop: 'static', keyboard: true
    });
    // El permiso viaja con el modal: allí también hay auditoría
    modalRef.componentInstance.puedeAuditar = this.accesoModel?.auditar === true;
    // Y si puede borrar de verdad, que es otro permiso distinto
    modalRef.componentInstance.puedeVaciar = this.accesoModel?.vaciar === true;
    // Al restaurar o borrar de verdad, el catálogo ya no es fiel
    this.escucharModal(modalRef, modalRef.componentInstance.cambio,
                       () => this.allProductos(this.paginaActual));
  }

  deleteProducto(registro: any): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.modal.open(DeleteProductoComponent, {
      centered: true,
      size: 'md',
      backdrop: 'static',
      keyboard: true
    });
    modalRef.componentInstance.registro_selected = registro;

    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, () => {
      const index = this.productoModel.findIndex(r => r.id === registro.id);
      if (index === -1) { return; }
      this.productoModel.splice(index, 1);
      this.totalRegistros = Math.max(0, this.totalRegistros - 1);
      this.gridApi?.applyTransaction({ remove: [registro] });
      if (this.selectedRow?.id === registro.id) { this.selectedRow = null; }
    });
  }

  // ================================================================
  // EL MENÚ DEL BOTÓN DERECHO
  // ================================================================
  //
  // Las mismas acciones que la columna ACCIONES, pero sin tener que llegar
  // hasta el final de la fila ni desplegar la columna cuando está plegada.
  //
  // NO SE USA EL EVENTO `cellContextMenu` DE ag-Grid: se probó contra la
  // librería y no llega —el clic alcanza el contenedor de filas pero la
  // rejilla lo descarta antes de emitirlo—, así que aquí se escucha el
  // `contextmenu` de la rejilla y la fila se resuelve con la API pública.

  @ViewChild('menuCtx') menuCtx!: MenuContextualComponent;

  /** Lo que se ofrece para la fila sobre la que se pulsó. */
  public opcionesContextuales: OpcionContextual[] = [];

  /**
   * Clic derecho sobre la rejilla.
   *
   * LO PRIMERO ES ELEGIR LA FILA: el menú actúa sobre «la fila», y si no se
   * marcara se vería resaltada una y el menú trabajaría sobre otra.
   */
  onContextMenuGrilla(e: MouseEvent): void {
    const fila = this._appAgGridService.filaDeEventoEnGrilla(e, this.gridApi);
    if (!fila) { return; }          // fuera de las filas: el menú del navegador

    e.preventDefault();

    this.selectedRow = fila;
    this._appAgGridService.marcarFila(this.gridApi, fila);

    this.opcionesContextuales = this.opcionesPara(fila);
    this.menuCtx?.abrir(e);
  }

  /** Qué se puede hacer con este producto, según el perfil. */
  private opcionesPara(fila: any): OpcionContextual[] {
    const puedeCrear   = this.accesoModel?.crear    === true;
    const puedeEditar  = this.accesoModel?.editar   === true;
    const puedeBorrar  = this.accesoModel?.eliminar === true;
    const puedeVer     = this.accesoModel?.ver      === true;
    const puedeAuditar = this.accesoModel?.auditar  === true;

    const codigo = String(fila?.codigo ?? '').trim();

    return [
      {
        id: 'ver', texto: 'Ver', icono: 'fa-eye',
        visible: puedeVer,
      },
      {
        id: 'editar', texto: 'Modificar', icono: 'fa-pen',
        visible: puedeEditar,
      },
      {
        id: 'clonar', texto: 'Clonar', icono: 'fa-clone',
        visible: puedeCrear,
        ayuda: 'Crear otro producto partiendo de éste',
      },
      {
        id: 'activo', texto: fila?.activo ? 'Desactivar' : 'Activar',
        icono: fila?.activo ? 'fa-toggle-off' : 'fa-toggle-on',
        separadorAntes: true, visible: puedeEditar,
        ayuda: fila?.activo ? 'Dejar de venderlo, sin borrarlo' : 'Volver a venderlo',
      },
      {
        id: 'codigo', texto: 'Copiar el código', icono: 'fa-copy',
        separadorAntes: true,
        deshabilitada: codigo === '',
        ayuda: codigo !== '' ? codigo : 'Este producto no tiene código',
      },
      {
        id: 'auditoria', texto: 'Ver auditoría', icono: 'fa-user-secret',
        visible: puedeAuditar,
        ayuda: 'Quién tocó este producto y cuándo',
      },
      {
        id: 'eliminar', texto: 'Enviar a la papelera', icono: 'fa-trash',
        separadorAntes: true, peligro: true, visible: puedeBorrar,
        ayuda: 'Se puede recuperar desde la papelera',
      },
    ];
  }

  /** Se eligió una opción del menú. */
  alElegirContextual(id: string): void {
    const fila = this.selectedRow as any;
    if (!fila) { return; }

    switch (id) {
      case 'ver':       this.viewProducto(fila); break;
      case 'editar':    this.editProducto(fila); break;
      case 'clonar':    this.clonProducto(fila); break;
      case 'activo':    this.cambiarActivo(fila, this._appAgGridService.nodoDe(this.gridApi, fila.id)); break;
      case 'codigo':    this.copiarCodigo(fila); break;
      case 'auditoria': this.auditoria(); break;
      case 'eliminar':  this.deleteProducto(fila); break;
    }
  }

  /**
   * El código al portapapeles.
   *
   * En un catálogo es lo que se pega todo el día en un chat o en una orden
   * de compra, y seleccionarlo a mano en una celda es incómodo.
   */
  private copiarCodigo(fila: any): void {
    const codigo = String(fila?.codigo ?? '').trim();
    if (!codigo) { return; }

    const avisar = () => this._toastr.success(codigo, 'Código copiado', { timeOut: 2000 });

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(codigo).then(avisar, () => this.copiarALaAntigua(codigo, avisar));
    } else {
      this.copiarALaAntigua(codigo, avisar);
    }
  }

  /** El portapapeles de antes, para cuando no hay permiso o no es https. */
  private copiarALaAntigua(texto: string, alCopiar: () => void): void {
    const caja = document.createElement('textarea');
    caja.value = texto;
    caja.style.position = 'fixed';
    caja.style.opacity = '0';
    document.body.appendChild(caja);
    caja.select();
    try { document.execCommand('copy'); alCopiar(); }
    catch { this._toastr.warning('No se pudo copiar', 'Código'); }
    finally { document.body.removeChild(caja); }
  }
  /** Historial de auditoría de la fila seleccionada (tabla productos). */
  auditoria(): void {
    if (!this.selectedRow) { return; }
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.modal.open(AuditoriaModalComponent, {
      centered: true,
      size: "xl",
      backdrop: "static",
      keyboard: true
    });
    modalRef.componentInstance.tablaNombre = 'productos';
    modalRef.componentInstance.registroId = this.selectedRow.id;
  }
}

// ================================================================
// RENDERER DE LA COLUMNA ACCIONES
// ================================================================
// Simple delegador: toda la lógica de modales vive en AllProductosComponent.
@Component({
  selector: 'app-button-accion-producto',
  standalone: false,
  template: `
    @if (parent.accionesPlegadas) {
      <button type="button"
              class="btn btn-sm btn-outline-primary acciones-desplegar"
              title="Mostrar los botones de acción"
              aria-label="Mostrar los botones de acción"
              (click)="parent.toggleActionsColumn()">
        <i class="fas fa-bars"></i>
      </button>
    } @else {
      <app-action-buttons
        [accesoModel]="parent.accesoModel"
        [buttonView]="true"
        [buttonEdit]="true"
        [buttonClone]="true"
        [buttonDelete]="true"
        (view)="parent.viewProducto(params.data)"
        (edit)="parent.editProducto(params.data)"
        (clone)="parent.clonProducto(params.data)"
        (delete)="parent.deleteProducto(params.data)">
      </app-action-buttons>
    }
  `,
  styles: [`
    .acciones-desplegar {
      width: 28px;
      height: 24px;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: .25rem;
    }
  `],
})
export class ButtonAccionProducto implements ICellRendererAngularComp {
  public params: any;

  constructor(public parent: AllProductosComponent) { }

  agInit(params: any): void { this.params = params; }

  refresh(params: any): boolean { this.params = params; return true; }
}
