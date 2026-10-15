import { Component, ElementRef, EventEmitter, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
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
import { MarcaService } from '../../../services/marca.service';
import { CategoriaService } from '../../../services/categoria.service';
import { AppPrintPdfService } from '../../../../../service/app-printPdf.service';
import { AppExportExcelService } from '../../../../../service/app-exportExcel.service';
import { AppExportCsvService } from '../../../../../service/app-exportCsv.service';
import { AppAgGridService } from '../../../../../service/app-agGrid.service';
import { LoadingService } from '../../../../../service/loading.service';

///   MODELOS    ///
import { ProductoModel } from '../../../interfaces/productoModel';
import { AccesoModel } from '../../../../seguridad/interfaces/accesoModel';

///   COMPONENTES    ///
import { SaveProductoComponent } from '../saveProducto/saveProducto.component';
import { DeleteProductoComponent } from '../deleteProducto/deleteProducto.component';
import { AuditoriaModalComponent } from '../../../../../components/auditoria-modal/auditoria-modal.component';
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

  initializeGrid(): void {
    this.columnDefs = [
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
        tooltipField: 'descripcion',
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
    ];
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
                                           this.marcaFiltro, this.categoriaFiltro)
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

  /** Si hay algo que quitar: lo escrito arriba o cualquiera de los dos combos. */
  get hayFiltro(): boolean {
    return !!this.searchTerm || this.marcaFiltro !== null || this.categoriaFiltro !== null;
  }

  /** Trae TODO lo que cumple el filtro actual, para exportar. */
  private async obtenerTodosParaExportar(): Promise<ProductoModel[]> {
    if (this.totalRegistros === 0) { return []; }
    try {
      this._loadingService.setLoading(true);
      const res = await firstValueFrom(
        this._productoService.allProductos(1, this.totalRegistros, this.searchTerm,
                                           this.marcaFiltro, this.categoriaFiltro)
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
  private filasReporte(productos: ProductoModel[]): any[][] {
    return productos
      .sort((a, b) => (a.codigo || '').localeCompare(b.codigo || ''))
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
    this.campoBusquedaPaginacion?.reset();
    this.searchTerm = '';
    this.marcaFiltro = null;
    this.categoriaFiltro = null;
    if (this.gridApi) {
      this.gridApi.setFilterModel(null);
      this.gridApi.onFilterChanged();
    }
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

  private tituloReporte(): string {
    const partes: string[] = [];
    if (this.searchTerm) { partes.push(`texto: ${this.searchTerm}`); }
    if (this.marcaFiltro) {
      partes.push(`marca: ${this.marcas.find(m => m.id === this.marcaFiltro)?.nombre ?? this.marcaFiltro}`);
    }
    if (this.categoriaFiltro) {
      partes.push(`categoría: ${this.categorias.find(c => c.id === this.categoriaFiltro)?.name ?? this.categoriaFiltro}`);
    }
    return partes.length ? `Catálogo de Productos (${partes.join(' · ')})` : 'Catálogo de Productos';
  }

  async printPdf() {
    const productos = await this.obtenerTodosParaExportar();
    if (productos.length === 0) { this._toastr.info('No hay productos para exportar'); return; }
    this._appPrintPdfService.generarReporte({
      tamanoPapel: "A4",
      orientacion: "l",
      title: "Reporte de Productos",
      titleTable: this.tituloReporte(),
      headers: this.CABECERAS_REPORTE,
      data: this.filasReporte(productos),
      piePagina: 'Pie de página - Mi Empresa en Desarrollo S.A....'
    });
  }

  async exportExcel() {
    const productos = await this.obtenerTodosParaExportar();
    if (productos.length === 0) { this._toastr.info('No hay productos para exportar'); return; }
    this._appExportExcelService.generarReporteExcel({
      tamanoPapel: "A4",
      orientacion: "l",
      title: "Reporte de Productos",
      titleTable: this.tituloReporte(),
      headers: this.CABECERAS_REPORTE,
      data: this.filasReporte(productos),
      piePagina: 'Pie de página - Mi Empresa en Desarrollo S.A....'
    });
  }

  async exportCsv() {
    const productos = await this.obtenerTodosParaExportar();
    if (productos.length === 0) { this._toastr.info('No hay productos para exportar'); return; }
    this._appExportCsvService.generarReporteCSV({
      headers: this.CABECERAS_REPORTE,
      data: this.filasReporte(productos),
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
