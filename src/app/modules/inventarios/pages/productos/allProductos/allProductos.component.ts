import { Component, ElementRef, EventEmitter, HostListener, OnDestroy, OnInit, ViewChild, inject, ChangeDetectionStrategy } from '@angular/core';
import { Subject, firstValueFrom, from, merge, of } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';
import { CellClickedEvent, GridApi, GridReadyEvent, IRowNode } from 'ag-grid-community';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { ActivatedRoute, Router } from '@angular/router';
import { ICellRendererAngularComp, AgGridModule } from 'ag-grid-angular';
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
import { FileTreeNode, FileTreeNodeComponent } from '../../../../../components/file-tree-node/file-tree-node.component';
import { buscarNodo, filtrarArbol, recorrer } from '../../../../seguridad/pages/grupos/arbolGrupos';
import { NgScrollbarModule } from 'ngx-scrollbar';

import { FormsModule } from '@angular/forms';
import { PanelComponent } from '../../../../../components/panel/panel.component';
import { ActionButtonsComponent } from '../../../../../components/botones/action-buttons/action-buttons.component';
import { FilasEstirablesDirective } from '../../../../../core/directives/filasEstirables.directive';
import { CommonModule } from '@angular/common';

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
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    CommonModule,
    FormsModule,
    AgGridModule,
    FilasEstirablesDirective,
    PanelComponent,
    CampoBusquedaPaginacionComponent,
    MenuContextualComponent,
    FileTreeNodeComponent,
    NgScrollbarModule
],
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
  /** Las marcas, para el combo de la barra. */
  public marcas: any[] = [];
  public marcaFiltro: number | null = null;

  // ---------- EL ÁRBOL DE CATEGORÍAS ----------
  // Calcado de allCaracteristicas, que a su vez lo sacó de usuariosGrupos.
  // La categoría ya no se elige en un combo plano: se trabaja categoría por
  // categoría, así que el árbol se queda a la vista.

  /** Lo que se pinta (puede venir filtrado por el buscador del árbol). */
  public nodes: FileTreeNode[] = [];
  /** El árbol entero, sin filtrar: es el que guarda el estado. */
  private originalNodes: FileTreeNode[] = [];
  /** Las categorías tal como las manda el servidor (planas, con ruta). */
  private categorias: any[] = [];
  /** Las ramas abiertas. */
  private readonly abiertos = new Set<number>();
  public searchQuery = '';
  public recargandoArbol = false;

  /** El nodo de «todas»: la rejilla sin filtrar por categoría. */
  public readonly NODO_TODAS = 0;
  /** Qué categoría se está mirando; 0 = todas. */
  public seleccionId: number = this.NODO_TODAS;
  /** La ruta de la elegida, para la cabecera y para el modal de alta. */
  public categoriaFiltroRuta = '';

  /** Lo que de verdad se le manda al servidor (null = todas). */
  public get categoriaFiltro(): number | null {
    return this.seleccionId === this.NODO_TODAS ? null : this.seleccionId;
  }

  /**
   * Si de la rama abierta pueden colgar productos.
   *
   * Las categorías que sólo AGRUPAN (`es_transaccion` en false, las del
   * icono de capas) son ramas del árbol, no sitios donde poner cosas:
   * «Línea Blanca» agrupa, «Refrigeradoras» es donde van los productos.
   * Con una de ésas abierta, el botón de nuevo producto se bloquea.
   *
   * Con «Todas» abierto devuelve true: ahí no hay rama impuesta y la
   * categoría se elige dentro de la ficha.
   */
  public get categoriaAdmiteProductos(): boolean {
    if (this.seleccionId === this.NODO_TODAS) { return true; }
    const c = this.categorias.find(x => x.id === this.seleccionId);
    return c ? c.es_transaccion !== false : true;
  }

  /** Por qué no se puede crear aquí, para decirlo en el botón. */
  public get motivoSinAlta(): string {
    if (this.accesoModel?.crear === false) { return 'No tienes permiso para crear productos'; }
    if (!this.categoriaAdmiteProductos) {
      return `«${this.categoriaFiltroRuta}» sólo agrupa: no admite productos. Elige una de sus subcategorías.`;
    }
    return '';
  }

  // ---------- El divisor, igual que en allCaracteristicas ----------
  public mobileSidebarToggled = false;
  public readonly ANCHO_LATERAL_DEFECTO = 280;
  private readonly ANCHO_LATERAL_MIN = 180;
  private readonly ANCHO_LATERAL_MAX = 640;
  private readonly CLAVE_ANCHO_LATERAL = 'miCRM3.allProductos.anchoLateral';
  public anchoLateral = this.leerAnchoLateral();
  public redimensionando = false;

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
    this.cargarArbol();
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
    id: 'numero', costo: 'numero', precio: 'numero',
    garantia_meses: 'numero', stock_minimo: 'numero', num_imagenes: 'numero',
    codigo: 'texto', nombre: 'texto', marca_nombre: 'texto',
    // Se filtra por lo que SE VE en la celda: «Sí» / «No»
    impuesto: 'texto',
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
        // Ya no es el porcentaje: el producto sólo dice SI grava impuesto, y
        // la tarifa saldrá de las tablas de impuestos.
        headerName: 'Impuesto',
        field: 'impuesto',
        headerTooltip: 'Si el producto grava impuesto; la tarifa no está en la ficha',
        cellStyle: { textAlign: 'center' },
        minWidth: 90,
        maxWidth: 110,
        valueFormatter: (params: any) => params.value === false ? 'No' : 'Sí',
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
        suppressHeaderMenuButton: true,
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

    this.gridApi.setGridOption('columnDefs', columnDefs);
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

  cambiarActivo(fila: ProductoModel | null, nodo?: IRowNode | null): void {
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
      const marcas: any = await firstValueFrom(this._marcaService.listMarcas(true));
      this.marcas = marcas?.data ?? [];
    } catch (error) {
      // Sin el combo la pantalla sigue sirviendo: se busca por texto
      console.error('Error al cargar las marcas:', error);
    }
  }

  // ================================================================
  // EL ÁRBOL DE CATEGORÍAS
  // ================================================================

  /**
   * Trae el árbol entero y cuántos productos tiene cada rama.
   *
   * Son dos llamadas y no una por categoría: con 28 categorías serían 28
   * viajes para pintar unos contadores. El recuento se hace aquí porque el
   * servidor no tiene un endpoint que lo dé; si algún día el catálogo
   * crece mucho, esto es lo primero que habrá que mover a la base.
   */
  async cargarArbol(): Promise<void> {
    try {
      this.recargandoArbol = true;

      const [arbol, todos]: any[] = await Promise.all([
        firstValueFrom(this._categoriaService.allCategorias(false)),
        firstValueFrom(this._productoService.listProductos(false)),
      ]);

      this.categorias = arbol?.body?.data ?? [];

      const cuantos = new Map<number, number>();
      for (const p of (todos?.data ?? [])) {
        if (p.categoria_id == null) { continue; }
        cuantos.set(p.categoria_id, (cuantos.get(p.categoria_id) ?? 0) + 1);
      }
      this.construirArbol(cuantos);
    } catch (error) {
      // El AuthInterceptor ya enseña el error HTTP
      console.error('Error al cargar el árbol de categorías:', error);
      this.categorias = [];
      this.construirArbol(new Map());
    } finally {
      this.recargandoArbol = false;
    }
  }

  /**
   * Lo de cada categoría SUBIDO por su rama: lo propio más lo de todo lo
   * que le cuelga. Es lo que se pinta en la chapita.
   *
   * Un nodo que sólo agrupa («Línea Blanca») no tiene productos suyos, y
   * con la cuenta propia saldría siempre un 0 que hace creer que por ahí
   * no hay nada.
   */
  private sumarALosPadres(cuantos: Map<number, number>): Map<number, number> {
    const padres = new Map<number, number | null>();
    for (const c of this.categorias) { padres.set(c.id, c.padre_id ?? null); }

    const totales = new Map<number, number>();
    for (const c of this.categorias) { totales.set(c.id, cuantos.get(c.id) ?? 0); }

    for (const c of this.categorias) {
      const propios = cuantos.get(c.id) ?? 0;
      if (!propios) { continue; }

      // El `vistos` es por si los datos trajeran un ciclo (una categoría
      // que acabe siendo su propia abuela): subir sin fin colgaría la
      // pantalla.
      const vistos = new Set<number>([c.id]);
      let p = padres.get(c.id) ?? null;
      while (p !== null && !vistos.has(p)) {
        vistos.add(p);
        totales.set(p, (totales.get(p) ?? 0) + propios);
        p = padres.get(p) ?? null;
      }
    }
    return totales;
  }

  /** Lista plana (padre antes que hijo) -> árbol, con «Todas» por encima. */
  private construirArbol(cuantos: Map<number, number>): void {
    const nodos = new Map<number, FileTreeNode>();
    const raices: FileTreeNode[] = [];
    const totales = this.sumarALosPadres(cuantos);

    for (const c of this.categorias) {
      const propios = cuantos.get(c.id) ?? 0;
      const rama = totales.get(c.id) ?? 0;
      const enHijas = rama - propios;

      nodos.set(c.id, {
        id: c.id,
        nombre: c.nombre,
        tipo: 0,
        escarpeta: true,
        // Las que sólo agrupan llevan otro icono: ahí no cuelgan productos
        icono: c.es_transaccion === false ? 'fa fa-layer-group' : 'fa fa-box',
        color: c.activo === false ? 'var(--bs-secondary-color, #6c757d)' : undefined,
        badge: rama,
        titulo: [c.ruta,
                 enHijas > 0
                   ? `${rama} en la rama: ${propios} suyo(s) y ${enHijas} en sus subcategorías`
                   : `${propios} producto(s)`,
                 c.es_transaccion === false ? 'sólo agrupa: no admite productos' : '',
                 c.activo === false ? '(inactiva)' : ''].filter(Boolean).join(' — '),
        isOpen: this.abiertos.has(c.id),
        isSelected: this.seleccionId === c.id,
      });
    }

    for (const c of this.categorias) {
      const n = nodos.get(c.id)!;
      const padre = c.padre_id ? nodos.get(c.padre_id) : undefined;
      if (padre) { (padre.children ??= []).push(n); } else { raices.push(n); }
    }

    const todas: FileTreeNode = {
      id: this.NODO_TODAS,
      nombre: 'Todas las categorías',
      tipo: 0,
      escarpeta: true,
      icono: 'fa fa-list-check',
      color: 'var(--bs-app-theme, #00acac)',
      badge: [...cuantos.values()].reduce((a, b) => a + b, 0),
      titulo: 'Todos los productos, de cualquier categoría',
      isOpen: this.abiertos.has(this.NODO_TODAS) || this.abiertos.size === 0,
      isSelected: this.seleccionId === this.NODO_TODAS,
      children: raices.length ? raices : undefined,
    };

    this.originalNodes = [todas];
    this.nodes = filtrarArbol(this.originalNodes, this.searchQuery);
  }

  /** Se pulsó una rama: la rejilla pasa a enseñar lo suyo. */
  onNodeSelect(node: FileTreeNode): void {
    this.seleccionar(node.id);
    this.mobileSidebarToggled = false;
  }

  seleccionar(id: number): void {
    this.seleccionId = id;
    recorrer(this.originalNodes, n => n.isSelected = n.id === id);
    recorrer(this.nodes, n => n.isSelected = n.id === id);

    // Se abre el camino hasta ella, para que se vea dónde está
    let c = this.categorias.find(x => x.id === id);
    while (c) {
      this.abiertos.add(c.id);
      c = c.padre_id ? this.categorias.find(x => x.id === c.padre_id) : null;
    }
    this.abiertos.add(this.NODO_TODAS);
    const real = buscarNodo(this.originalNodes, id);
    if (real?.children) { real.isOpen = true; }

    const cat = this.categorias.find(x => x.id === id);
    this.categoriaFiltroRuta = cat ? (cat.ruta || cat.nombre) : '';

    this.selectedRow = null;
    this.paginaActual = 1;
    this.allProductos(1);
  }

  onNodeToggle(node: FileTreeNode): void {
    if (node.isOpen) { this.abiertos.add(node.id); } else { this.abiertos.delete(node.id); }
    const real = buscarNodo(this.originalNodes, node.id);
    if (real) { real.isOpen = node.isOpen; }
  }

  expandirTodo(): void {
    recorrer(this.originalNodes, n => { if (n.children) { n.isOpen = true; this.abiertos.add(n.id); } });
    this.nodes = filtrarArbol(this.originalNodes, this.searchQuery);
  }

  contraerTodo(): void {
    recorrer(this.originalNodes, n => { n.isOpen = false; });
    this.abiertos.clear();
    // «Todas» se queda abierta: si no, el árbol desaparece entero
    const todas = buscarNodo(this.originalNodes, this.NODO_TODAS);
    if (todas) { todas.isOpen = true; this.abiertos.add(this.NODO_TODAS); }
    this.nodes = filtrarArbol(this.originalNodes, this.searchQuery);
  }

  filterNodes(): void { this.nodes = filtrarArbol(this.originalNodes, this.searchQuery); }

  limpiarBusquedaArbol(): void { this.searchQuery = ''; this.filterNodes(); }

  toggleMobileSidebar(): void { this.mobileSidebarToggled = !this.mobileSidebarToggled; }

  /**
   * Arrastrar el divisor cambia el ancho del árbol.
   *
   * Con captura del puntero: si no, al mover deprisa el ratón se sale del
   * divisor y el arrastre se queda a medias.
   */
  iniciarRedimension(ev: PointerEvent): void {
    if (ev.button !== 0) { return; }
    ev.preventDefault();
    const divisor = ev.currentTarget as HTMLElement;
    const xInicial = ev.clientX;
    const anchoInicial = this.anchoLateral;
    this.redimensionando = true;
    divisor.setPointerCapture(ev.pointerId);

    const mover = (e: PointerEvent) => {
      const nuevo = anchoInicial + (e.clientX - xInicial);
      this.anchoLateral = Math.min(this.ANCHO_LATERAL_MAX,
                                   Math.max(this.ANCHO_LATERAL_MIN, Math.round(nuevo)));
    };
    const soltar = (e: PointerEvent) => {
      divisor.removeEventListener('pointermove', mover);
      divisor.removeEventListener('pointerup', soltar);
      divisor.removeEventListener('pointercancel', soltar);
      divisor.releasePointerCapture(e.pointerId);
      this.redimensionando = false;
      this.guardarAnchoLateral();
      this.ajustarTamanoGrid();
    };
    divisor.addEventListener('pointermove', mover);
    divisor.addEventListener('pointerup', soltar);
    divisor.addEventListener('pointercancel', soltar);
  }

  guardarAnchoLateral(): void {
    try { localStorage.setItem(this.CLAVE_ANCHO_LATERAL, String(this.anchoLateral)); }
    catch { /* ventana privada o almacenamiento bloqueado */ }
  }

  private leerAnchoLateral(): number {
    try {
      const guardado = Number(localStorage.getItem('miCRM3.allProductos.anchoLateral'));
      return Number.isFinite(guardado) && guardado >= 180 && guardado <= 640 ? guardado : 280;
    } catch { return 280; }
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
        this.gridApi?.setGridOption('rowData', this.productoModel);
        return;
      }

      this.productoModel = res.body?.data?.data || [];

      if (res.body?.data?.meta) {
        this.totalRegistros = res.body.data.meta.total;
        this.registrosPorPagina = res.body.data.meta.per_page;
        this.paginaActual = res.body.data.meta.current_page;
        this.ultimaPagina = res.body.data.meta.last_page;
      }

      if (this.gridApi) { this.gridApi.setGridOption('rowData', this.productoModel); }
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
    // La categoría ya no es un combo: se vuelve al nodo «Todas» del árbol
    this.seleccionId = this.NODO_TODAS;
    this.categoriaFiltroRuta = '';
    recorrer(this.originalNodes, n => n.isSelected = n.id === this.NODO_TODAS);
    recorrer(this.nodes, n => n.isSelected = n.id === this.NODO_TODAS);
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
            ? [`Categoría: ${this.categoriaFiltroRuta || this.categoriaFiltro}`]
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
    // Si hay una categoría elegida en el árbol, el producto nuevo nace en
    // ella y con ella BLOQUEADA: se está trabajando esa rama.
    modalRef.componentInstance.categoriaId = this.categoriaFiltro;
    modalRef.componentInstance.categoriaRuta = this.categoriaFiltroRuta;
    return modalRef;
  }

  addProducto(): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.abrirModalProducto(0, 'add');
    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, (nuevo: any) => {
      this.productoModel = [nuevo, ...this.productoModel];
      this.totalRegistros++;
      this.gridApi?.setGridOption('rowData', this.productoModel);
    });
  }

  clonProducto(registro: any): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.abrirModalProducto(registro, 'clon');
    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, (nuevo: any) => {
      this.productoModel = [nuevo, ...this.productoModel];
      this.totalRegistros++;
      this.gridApi?.setGridOption('rowData', this.productoModel);
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
  standalone: true,
  imports: [ActionButtonsComponent],
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
  changeDetection: ChangeDetectionStrategy.Eager,
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
