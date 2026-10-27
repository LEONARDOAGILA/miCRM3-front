import { Component, ElementRef, EventEmitter, HostListener, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, firstValueFrom, from, merge, of } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';
import { AgGridModule, ICellRendererAngularComp } from 'ag-grid-angular';
import { CellClickedEvent, GridApi, GridReadyEvent, RowNode } from 'ag-grid-community';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';

///   SERVICIOS    ///
import { SeguridadService } from '../../../../seguridad/services/seguridad.service';
import { SucursalService, SucursalModel } from '../../../services/sucursal.service';
import { AppPrintPdfService } from '../../../../../service/app-printPdf.service';
import { AppExportExcelService } from '../../../../../service/app-exportExcel.service';
import { AppExportCsvService } from '../../../../../service/app-exportCsv.service';
import { AppAgGridService } from '../../../../../service/app-agGrid.service';
import { LoadingService } from '../../../../../service/loading.service';
import { AppDescargaService, PeticionDescarga, AccionDescarga }
  from '../../../../../service/app-descarga.service';

///   MODELOS    ///
import { AccesoModel } from '../../../../seguridad/interfaces/accesoModel';

///   COMPONENTES    ///
import { PanelModule } from '../../../../../components/panel/panel.module';
import { ActionButtonsModule } from '../../../../../components/botones/action-buttons/action-buttons.module';
import { CampoBusquedaPaginacionComponent } from '../../../../../components/campos/campoBusquedaPaginacion/campoBusquedaPaginacion.component';
import { MenuContextualComponent, OpcionContextual } from '../../../../../components/menuContextual/menuContextual.component';
import { AuditoriaModalComponent } from '../../../../../components/auditoria-modal/auditoria-modal.component';
import { SaveSucursalComponent } from '../saveSucursal/saveSucursal.component';
import { DeleteSucursalComponent } from '../deleteSucursal/deleteSucursal.component';
import { PapeleraSucursalesComponent } from '../papeleraSucursales/papeleraSucursales.component';

/**
 * Listado de sucursales (ventas.sucursales).
 *
 * Mismo esquema que allMarcas: rejilla ag-Grid con paginación EN SERVIDOR
 * (ventas.fn_sucursales_listar_paginado), barra con buscador / nueva /
 * papelera / auditoría, columna ACCIONES plegable y exportaciones que piden
 * el listado completo aparte.
 *
 * LO QUE AQUÍ SE LLAMA «PERÍMETRO» NO ES DECORACIÓN: es lo que deja o no
 * marcar asistencia a la gente de la sucursal. La columna lo dice fila por
 * fila, porque una sucursal sin perímetro permite marcar desde cualquier
 * sitio y eso no se puede adivinar abriendo el mapa de una en una.
 *
 * El dibujo del perímetro vive en saveSucursal; aquí sólo se lista.
 */
@Component({
  selector: 'app-allSucursales',
  standalone: true,
  imports: [
    CommonModule, FormsModule, AgGridModule, PanelModule,
    CampoBusquedaPaginacionComponent, MenuContextualComponent,
  ],
  templateUrl: './allSucursales.component.html',
  styleUrls: ['./allSucursales.component.css'],
})
export class AllSucursalesComponent implements OnInit, OnDestroy {

  /** Pregunta qué descargar (la página o todo) y trae las filas. */
  private readonly _appDescargaService = inject(AppDescargaService);

  // ---------- Estado ----------
  /** Permisos del perfil sobre esta pantalla, del resolver de la ruta. */
  public accesoModel: AccesoModel;
  /** Filas de la página actual — NO el listado completo. */
  public sucursalModel: SucursalModel[] = [];
  /** Fila marcada en la rejilla; habilita el botón de auditoría. */
  public selectedRow: SucursalModel | null = null;
  /** true mientras la columna ACCIONES está plegada. */
  public accionesPlegadas = false;

  public titulo: string;
  public isLoading$ = this._loadingService.isLoading$;

  // ---------- Paginación en servidor ----------
  public paginaActual: number = 1;
  public totalRegistros: number = 0;
  public registrosPorPagina: number = 10;
  public ultimaPagina: number = 1;

  // ---------- ag-Grid ----------
  public gridApi!: GridApi;
  public columnDefs: any[] = [];

  private touchStartTime = 0;
  private touchStartX = 0;
  private touchStartY = 0;

  private readonly unsubscribe$ = new Subject<void>();
  private timeoutIds = new Set<any>();
  private resizeTimeoutId: any;

  /** setTimeout que se da de baja solo al dispararse (ver allMarcas). */
  private programar(fn: () => void, ms: number): void {
    const id = setTimeout(() => {
      this.timeoutIds.delete(id);
      fn();
    }, ms);
    this.timeoutIds.add(id);
  }

  /** Referencias estables a los listeners de la cabecera ACCIONES. */
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
    private _sucursalService: SucursalService,
  ) {
    this.titulo = 'Sucursales';
    this.accesoModel = this.activeRoute.snapshot.data['access'];
  }

  ngOnInit(): void {
    this.allSucursales();
    this.initializeGrid();
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

  /** Suscribe al @Output de un modal y corta al cerrarse o al destruir la pantalla. */
  public escucharModal<T>(modalRef: NgbModalRef, salida: EventEmitter<T>, alEmitir: (valor: T) => void): void {
    const modalCerrado$ = from(modalRef.result).pipe(catchError(() => of(null)));
    salida
      .pipe(takeUntil(merge(this.unsubscribe$, modalCerrado$)))
      .subscribe({
        next: alEmitir,
        error: (err) => console.error('Error en el modal:', err),
      });
  }

  fun_home(): void {
    this.route.navigate(['/ventas']);
  }

  public get desde(): number {
    return this.totalRegistros === 0 ? 0 : (this.paginaActual - 1) * this.registrosPorPagina + 1;
  }

  public get hasta(): number {
    return Math.min(this.paginaActual * this.registrosPorPagina, this.totalRegistros);
  }

  // ================================================================
  // FILTROS DE LA CABECERA
  // ================================================================
  //
  // Los aplica el SERVIDOR, no la rejilla: esta pantalla pagina, así que
  // ag-Grid sólo tiene las filas de la página y filtrar ahí buscaría dentro
  // de diez. La cabecera sólo recoge lo que el usuario pidió.

  /**
   * Las columnas que llevan filtro, y de qué tipo.
   *
   * Tiene que decir lo mismo que la lista blanca de SucursalController: lo
   * que no esté allí se tira en el servidor, así que ponerlo sólo aquí sería
   * pintar un filtro que no filtra.
   */
  private readonly COLUMNAS_FILTRABLES: { [campo: string]: 'texto' | 'numero' } = {
    id: 'numero', num_empleados: 'numero',
    codigo: 'texto', nombre: 'texto', direccion: 'texto', telefono: 'texto', email: 'texto',
    // «Sí» / «No» sobre lo que se ve en la columna Perímetro
    tiene_perimetro: 'texto',
    created_by: 'texto', updated_by: 'texto',
    // Las fechas, como texto sobre lo que se ve: «2026-10» busca el mes
    created_at: 'texto', updated_at: 'texto',
  };

  /** Lo que haya pedido la cabecera, tal cual lo da ag-Grid. */
  public filtrosColumna: any = {};

  /** Para no recargar mientras se limpian los filtros de golpe. */
  private limpiando = false;

  /** Las columnas con su filtro de cabecera (el cómo vive en AppAgGridService). */
  private conFiltros(columnas: any[]): any[] {
    return this._appAgGridService.filtrosDeServidor(columnas, this.COLUMNAS_FILTRABLES);
  }

  /** La cabecera pidió otra cosa. Siempre a la página 1. */
  onFiltroColumna(): void {
    if (this.limpiando) { return; }
    this.filtrosColumna = this.gridApi?.getFilterModel() ?? {};
    this.paginaActual = 1;
    this.allSucursales(1);
  }

  /** Cuántas columnas llevan filtro; el buscador lo enseña y se pone rojo. */
  get cuantasColumnasFiltradas(): number {
    return Object.keys(this.filtrosColumna || {}).length;
  }

  /** Si hay algo que quitar: lo escrito arriba o un filtro de columna. */
  get hayFiltro(): boolean {
    return !!this.searchTerm || this.cuantasColumnasFiltradas > 0;
  }

  // ================================================================
  // AG-GRID
  // ================================================================

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
        // Segunda columna y PULSABLE: dar de baja una sucursal era abrir la
        // ficha, bajar la casilla y guardar. Ahora se pulsa aquí.
        headerName: 'Activa',
        field: 'activo',
        cellStyle: { textAlign: 'center' },
        minWidth: 80,
        maxWidth: 80,
        cellRenderer: (params: any) => this.casillaActivo(params),
      },
      {
        headerName: 'Código',
        field: 'codigo',
        cellStyle: { textAlign: 'left', fontWeight: '600' },
        minWidth: 100,
        maxWidth: 140,
      },
      {
        headerName: 'Sucursal',
        field: 'nombre',
        cellStyle: { textAlign: 'left', fontWeight: '600' },
        minWidth: 200,
        maxWidth: 360,
      },
      {
        // LA COLUMNA QUE IMPORTA: sin perímetro se puede marcar desde
        // cualquier sitio, y eso no se ve abriendo el mapa de una en una.
        headerName: 'Perímetro',
        field: 'tiene_perimetro',
        headerTooltip: 'Sin perímetro, su gente puede marcar asistencia desde cualquier lugar',
        cellStyle: { textAlign: 'center' },
        minWidth: 150,
        maxWidth: 180,
        sortable: false,
        tooltipValueGetter: (p: any) => p.data?.tiene_perimetro
          ? (p.data?.tipo === 'CIRCULO'
              ? `Círculo de ${Math.round(Number(p.data?.radio_metros ?? 0))} m, con ${Math.round(Number(p.data?.tolerancia_metros ?? 0))} m de tolerancia`
              : `Área de ${p.data?.num_vertices} esquinas, con ${Math.round(Number(p.data?.tolerancia_metros ?? 0))} m de tolerancia`)
          : 'Sin perímetro: se puede marcar desde cualquier lugar',
        cellRenderer: (p: any) => {
          if (!p.data?.tiene_perimetro) {
            return `<span class="suc-perim suc-perim--no"><i class="fa fa-earth-americas"></i> Sin perímetro</span>`;
          }
          const detalle = p.data?.tipo === 'CIRCULO'
            ? `${Math.round(Number(p.data?.radio_metros ?? 0))} m`
            : `${p.data?.num_vertices} esquinas`;
          const icono = p.data?.tipo === 'CIRCULO' ? 'fa-circle-dot' : 'fa-draw-polygon';
          return `<span class="suc-perim suc-perim--si"><i class="fa ${icono}"></i> ${detalle}</span>`;
        },
      },
      {
        headerName: 'Tolerancia',
        field: 'tolerancia_metros',
        headerTooltip: 'Margen para el error del GPS, en metros',
        cellStyle: { textAlign: 'center' },
        minWidth: 100,
        maxWidth: 120,
        sortable: false,
        valueGetter: (p: any) => p.data?.tolerancia_metros != null
          ? `${Math.round(Number(p.data.tolerancia_metros))} m` : '',
      },
      {
        headerName: 'Empleados',
        field: 'num_empleados',
        headerTooltip: 'Empleados asignados; con empleados no se puede eliminar',
        cellStyle: { textAlign: 'center' },
        minWidth: 110,
        maxWidth: 120,
      },
      {
        headerName: 'Dirección',
        field: 'direccion',
        cellStyle: { textAlign: 'left' },
        minWidth: 200,
        maxWidth: 420,
      },
      {
        headerName: 'Teléfono',
        field: 'telefono',
        cellStyle: { textAlign: 'left' },
        minWidth: 120,
        maxWidth: 160,
      },
      {
        headerName: 'Correo',
        field: 'email',
        cellStyle: { textAlign: 'left' },
        minWidth: 170,
        maxWidth: 280,
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
        headerName: 'Creado por',
        field: 'created_by',
        cellStyle: { textAlign: 'left' },
        minWidth: 130,
        maxWidth: 200,
        sortable: false,
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
        cellRenderer: ButtonAccionSucursal,
        // La pantalla va POR PARÁMETRO y no por inyección, igual que en
        // allZonas: este componente es standalone, y que ag-Grid pueda
        // inyectar la pantalla depende del inyector con que cree la celda.
        cellRendererParams: { pantalla: this },
        pinned: 'right',
        minWidth: AllSucursalesComponent.ANCHO_ACCIONES_ABIERTA,
        maxWidth: AllSucursalesComponent.ANCHO_ACCIONES_ABIERTA,
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

  handleTouchStart(e: TouchEvent): void {
    this.touchStartTime = Date.now();
    this.touchStartX = e.touches[0].clientX;
    this.touchStartY = e.touches[0].clientY;
  }

  handleTouchEnd(e: TouchEvent): void {
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

  /** Pliega o despliega la columna ACCIONES (pulsando su cabecera). */
  toggleActionsColumn(): void {
    const columnDefs = this.gridApi.getColumnDefs() as any[];
    const actionsCol = columnDefs.find(col => col.field === 'actions');
    if (!actionsCol) { return; }

    const estabaPlegada = actionsCol.minWidth === AllSucursalesComponent.ANCHO_ACCIONES_PLEGADA;
    this.accionesPlegadas = !estabaPlegada;

    const ancho = estabaPlegada ? AllSucursalesComponent.ANCHO_ACCIONES_ABIERTA
                                : AllSucursalesComponent.ANCHO_ACCIONES_PLEGADA;
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

  ajustarTamanoGrid(): void {
    if (!this.gridApi) { return; }
    if (this.resizeTimeoutId) { clearTimeout(this.resizeTimeoutId); }
    this.resizeTimeoutId = setTimeout(() => {
      this._appAgGridService.ajustarTamanoGrid(this.gridApi);
      this.ajustarAlturaGrid();
    }, 100);
  }

  /** La rejilla llega hasta el final de la ventana, menos la paginación. */
  ajustarAlturaGrid(): void {
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

  /** ↑ / ↓ seleccionan la fila como un clic. */
  navegarConTeclado = this._appAgGridService.navegacionConFlechas(fila => this.selectedRow = fila);

  // ================================================================
  // LA CASILLA DE «ACTIVA»
  // ================================================================
  //
  // El dibujo y el flujo —el giro mientras guarda, repintar con lo que
  // contesta el servidor, volver atrás si falla— viven en AppAgGridService.

  /** Las inactivas se ven, pero apagadas y tachadas. */
  public rowClassRules = this._appAgGridService.reglasFilaInactiva('activo');

  /** Las que se están guardando ahora mismo: su casilla sale como un giro. */
  private readonly activoEnVuelo = new Set<number>();

  private casillaActivo(params: any): string {
    return this._appAgGridService.casillaActivo(params, {
      puede: this.accesoModel?.editar === true,
      enVuelo: this.activoEnVuelo,
      que: 'sucursal',
    });
  }

  /** Activar o desactivar desde la casilla, sin abrir el formulario. */
  cambiarActivo(fila: SucursalModel | null, nodo?: RowNode | null): void {
    if (!fila) { return; }
    if (this._seguridadService.isexpired()) { return; }

    this._appAgGridService.alternarActivo({
      gridApi: this.gridApi,
      filas: this.sucursalModel,
      fila, nodo,
      campo: 'activo',
      enVuelo: this.activoEnVuelo,
      puede: this.accesoModel?.editar === true,
      que: 'sucursal',
      llamar: (id, activo) => this._sucursalService.activarSucursal(id, activo),
      nombre: (f: any) => f.nombre,
      hasta: this.unsubscribe$,
    });
  }

  onCellClicked(e: CellClickedEvent): void {
    this.selectedRow = e.data;

    // La casilla de «Activa» se marca con `data-accion`: se atiende aquí y
    // no con un componente por celda.
    const origen = e.event?.target as HTMLElement | null;
    if (origen?.closest('[data-accion="activo"]')) {
      this.cambiarActivo(e.data, e.node);
    }
  }

  // ================================================================
  // DATOS
  // ================================================================

  /** Pide una página al servidor y la vuelca en la rejilla. */
  async allSucursales(page: number = 1): Promise<void> {
    try {
      this._loadingService.setLoading(true);

      const res = await firstValueFrom(
        this._sucursalService.allSucursales(page, this.registrosPorPagina, this.searchTerm,
                                            this.filtrosColumna)
      ) as any;

      if (res.body?.status !== 'success') {
        this._toastr.error(res.body?.message || 'No se pudo obtener el listado de sucursales', 'Error');
        this.sucursalModel = [];
        this.totalRegistros = 0;
        this.ultimaPagina = 1;
        this.gridApi?.setRowData(this.sucursalModel);
        return;
      }

      this.sucursalModel = res.body?.data?.data || [];

      if (res.body?.data?.meta) {
        this.totalRegistros = res.body.data.meta.total;
        this.registrosPorPagina = res.body.data.meta.per_page;
        this.paginaActual = res.body.data.meta.current_page;
        this.ultimaPagina = res.body.data.meta.last_page;
      }

      if (this.gridApi) { this.gridApi.setRowData(this.sucursalModel); }
    } catch (error) {
      // El AuthInterceptor ya muestra el toast del error HTTP
      console.error('Error al cargar sucursales:', error);
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  /** Trae TODAS las filas que cumplen el filtro actual, para exportar. */
  private async obtenerTodosParaExportar(): Promise<SucursalModel[]> {
    if (this.totalRegistros === 0) { return []; }
    try {
      this._loadingService.setLoading(true);
      const res = await firstValueFrom(
        this._sucursalService.allSucursales(1, this.totalRegistros, this.searchTerm,
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

  /**
   * Filas del reporte con formato de salida.
   *
   * Se ordena sobre una COPIA: `sort` cambia el array que recibe, y el de la
   * página es el de la rejilla.
   */
  private filasReporte(sucursales: SucursalModel[], ordenarPorNombre: boolean = true): any[][] {
    const lista = ordenarPorNombre
      ? [...sucursales].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''))
      : sucursales;

    return lista.map(item => [
      item.id,
      item.codigo,
      item.nombre,
      item.direccion || '',
      item.telefono || '',
      this.textoPerimetro(item),
      `${Math.round(Number(item.tolerancia_metros ?? 0))} m`,
      item.num_empleados ?? 0,
      item.activo ? 'Activa' : 'Inactiva',
    ]);
  }

  /** El perímetro en una línea, para los reportes y los avisos. */
  public textoPerimetro(s: any): string {
    if (!s?.tiene_perimetro) { return 'Sin perímetro'; }
    return s.tipo === 'CIRCULO'
      ? `Círculo de ${Math.round(Number(s.radio_metros ?? 0))} m`
      : `Área de ${s.num_vertices} esquinas`;
  }

  // ================================================================
  // BÚSQUEDA
  // ================================================================

  async onFilterTextBoxChanged(term?: string): Promise<void> {
    if (term !== undefined) { this.searchTerm = term; }
    this.paginaActual = 1;
    await this.allSucursales(1);
  }

  clearAllFilters(): void {
    if (!this.hayFiltro) { return; }

    const habiaColumnas = this.cuantasColumnasFiltradas > 0;

    // `limpiando` corta el (filterChanged) que dispara setFilterModel: sin
    // esto se recargaría dos veces, y la primera con los filtros a medias.
    this.limpiando = true;
    this.campoBusquedaPaginacion?.reset();
    this.searchTerm = '';
    this.filtrosColumna = {};
    if (habiaColumnas) { this.gridApi?.setFilterModel(null); }

    // LA BANDERA SE BAJA EN LA SIGUIENTE VUELTA, no aquí: medido contra
    // ag-Grid 28, `setFilterModel` avisa DESPUÉS de esta línea.
    this.programar(() => { this.limpiando = false; }, 0);

    this.paginaActual = 1;
    this.allSucursales(1);
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
    this.allSucursales(this.paginaActual);
  }

  nextPage(): void { this.goToPage(this.paginaActual + 1); }
  prevPage(): void { this.goToPage(this.paginaActual - 1); }

  // ================================================================
  // IMPRESIÓN Y EXPORTACIÓN (listado completo que cumple el filtro)
  // ================================================================

  private readonly CABECERAS_REPORTE = ['ID', 'Código', 'Sucursal', 'Dirección', 'Teléfono',
                                        'Perímetro', 'Tolerancia', 'Empleados', 'Estado'];

  private peticionDescarga(accion: AccionDescarga): PeticionDescarga<any> {
    return {
      accion,
      nombrePlural: 'sucursales',
      tituloBase: 'Listado de Sucursales',
      gridApi: this.gridApi,
      filasDePagina: this.sucursalModel,
      total: this.totalRegistros,
      pagina: this.paginaActual,
      ultimaPagina: this.ultimaPagina,
      busqueda: this.searchTerm,
      filtrosColumna: this.filtrosColumna,
      columnDefs: this.columnDefs,
      traerTodo: () => this.obtenerTodosParaExportar(),
    };
  }

  async printPdf(): Promise<void> {
    const salida = await this._appDescargaService.preparar(this.peticionDescarga('imprimir'));
    if (!salida) { return; }       // no hay nada que descargar, o canceló
    this._appPrintPdfService.generarReporte({
      tamanoPapel: 'A4',
      orientacion: 'l',
      title: 'Reporte de Sucursales',
      titleTable: salida.titulo,
      headers: this.CABECERAS_REPORTE,
      data: this.filasReporte(salida.filas, salida.alcance === 'todo'),
      piePagina: 'Pie de página - Mi Empresa en Desarrollo S.A....'
    });
  }

  async exportExcel(): Promise<void> {
    const salida = await this._appDescargaService.preparar(this.peticionDescarga('excel'));
    if (!salida) { return; }
    this._appExportExcelService.generarReporteExcel({
      tamanoPapel: 'A4',
      orientacion: 'l',
      title: 'Reporte de Sucursales',
      titleTable: salida.titulo,
      headers: this.CABECERAS_REPORTE,
      data: this.filasReporte(salida.filas, salida.alcance === 'todo'),
      piePagina: 'Pie de página - Mi Empresa en Desarrollo S.A....'
    });
  }

  async exportCsv(): Promise<void> {
    const salida = await this._appDescargaService.preparar(this.peticionDescarga('csv'));
    if (!salida) { return; }
    this._appExportCsvService.generarReporteCSV({
      headers: this.CABECERAS_REPORTE,
      data: this.filasReporte(salida.filas, salida.alcance === 'todo'),
    });
  }

  // ================================================================
  // ACCIONES (modales)
  // ================================================================

  /**
   * Abre saveSucursal en el modo pedido. registro = 0 para crear.
   *
   * Tamaño `xl` y no `lg`: dentro hay un mapa, y dibujar un perímetro en
   * media pantalla es pelearse con el ratón.
   */
  private abrirModalSucursal(registro: any, accion: 'add' | 'edit' | 'clon' | 'view'): NgbModalRef {
    const modalRef = this.modal.open(SaveSucursalComponent, {
      centered: true,
      size: 'xl',
      backdrop: 'static',
      keyboard: accion === 'view',
    });
    modalRef.componentInstance.registro_selected = registro;
    modalRef.componentInstance.accion = accion;
    return modalRef;
  }

  addSucursal(): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.abrirModalSucursal(0, 'add');
    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, (nueva: any) => {
      this.sucursalModel = [nueva, ...this.sucursalModel];
      this.totalRegistros++;
      this.gridApi?.setRowData(this.sucursalModel);
    });
  }

  clonSucursal(registro: any): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.abrirModalSucursal(registro, 'clon');
    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, (nueva: any) => {
      this.sucursalModel = [nueva, ...this.sucursalModel];
      this.totalRegistros++;
      this.gridApi?.setRowData(this.sucursalModel);
    });
  }

  /** Al guardar sustituye la fila en sitio: no hace falta volver al servidor. */
  editSucursal(registro: any): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.abrirModalSucursal(registro, 'edit');
    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, (actualizada: any) => {
      const index = this.sucursalModel.findIndex(r => r.id === actualizada.id);
      if (index === -1) { return; }
      this.sucursalModel[index] = actualizada;
      this.gridApi?.getRowNode(index.toString())?.setData(actualizada);
    });
  }

  viewSucursal(registro: any): void {
    if (this._seguridadService.isexpired()) { return; }
    this.abrirModalSucursal(registro, 'view');
  }

  /** Quita la fila de la rejilla con una transacción. */
  deleteSucursal(registro: any): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.modal.open(DeleteSucursalComponent, {
      centered: true,
      size: 'md',
      backdrop: 'static',
      keyboard: true
    });
    modalRef.componentInstance.registro_selected = registro;

    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, () => {
      const index = this.sucursalModel.findIndex(r => r.id === registro.id);
      if (index === -1) { return; }
      this.sucursalModel.splice(index, 1);
      this.totalRegistros = Math.max(0, this.totalRegistros - 1);
      this.gridApi?.applyTransaction({ remove: [registro] });
      if (this.selectedRow?.id === registro.id) { this.selectedRow = null; }
    });
  }

  /**
   * La papelera de reciclaje.
   *
   * Lo que se «elimina» no se borra: va aquí, y desde aquí se restaura o se
   * borra de verdad. Sólo con el acceso «papelera» del perfil.
   */
  abrirPapelera(): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.modal.open(PapeleraSucursalesComponent, {
      centered: true, size: 'xl', backdrop: 'static', keyboard: true
    });
    // El permiso viaja con el modal: allí también hay auditoría
    modalRef.componentInstance.puedeAuditar = this.accesoModel?.auditar === true;
    // Y si puede borrar de verdad, que es otro permiso distinto
    modalRef.componentInstance.puedeVaciar = this.accesoModel?.vaciar === true;
    this.escucharModal(modalRef, modalRef.componentInstance.cambio,
                       () => this.allSucursales(this.paginaActual));
  }

  // ================================================================
  // EL MENÚ DEL BOTÓN DERECHO
  // ================================================================

  @ViewChild('menuCtx') menuCtx!: MenuContextualComponent;

  /** Lo que se ofrece para la fila sobre la que se pulsó. */
  public opcionesContextuales: OpcionContextual[] = [];

  onContextMenuGrilla(e: MouseEvent): void {
    const fila = this._appAgGridService.filaDeEventoEnGrilla(e, this.gridApi);
    if (!fila) { return; }          // fuera de las filas: el menú del navegador

    e.preventDefault();

    this.selectedRow = fila;
    this._appAgGridService.marcarFila(this.gridApi, fila);

    this.opcionesContextuales = this.opcionesPara(fila);
    this.menuCtx?.abrir(e);
  }

  /** Qué se puede hacer con esta sucursal, según el perfil. */
  private opcionesPara(fila: any): OpcionContextual[] {
    const puedeCrear   = this.accesoModel?.crear    === true;
    const puedeEditar  = this.accesoModel?.editar   === true;
    const puedeBorrar  = this.accesoModel?.eliminar === true;
    const puedeVer     = this.accesoModel?.ver      === true;
    const puedeAuditar = this.accesoModel?.auditar  === true;

    const conEmpleados = Number(fila?.num_empleados ?? 0) > 0;
    const sinPerimetro = fila?.tiene_perimetro !== true;
    const sinUbicacion = !fila?.link_ubicacion && fila?.latitud == null
                      && fila?.centro_lat == null && !fila?.vertices?.length;

    return [
      { id: 'ver',    texto: 'Ver',       icono: 'fa-eye',   visible: puedeVer },
      { id: 'editar', texto: 'Modificar', icono: 'fa-pen',   visible: puedeEditar },
      { id: 'clonar', texto: 'Clonar',    icono: 'fa-clone', visible: puedeCrear,
        ayuda: 'Crear otra sucursal partiendo de ésta' },
      {
        id: 'perimetro', texto: sinPerimetro ? 'Dibujar el perímetro' : 'Ver el perímetro',
        icono: 'fa-draw-polygon', separadorAntes: true,
        visible: sinPerimetro ? puedeEditar : (puedeVer || puedeEditar),
        ayuda: sinPerimetro ? 'Sin perímetro se puede marcar desde cualquier lugar'
                            : this.textoPerimetro(fila),
      },
      {
        // Ya no depende del perímetro: una sucursal puede tener su punto sin
        // tenerlo dibujado todavía.
        id: 'mapa', texto: 'Abrir en Google Maps', icono: 'fa-map-location-dot',
        deshabilitada: sinUbicacion,
        ayuda: sinUbicacion ? 'Esta sucursal todavía no tiene ubicación'
                            : (fila?.coordenadas ?? 'La puerta, en otra pestaña'),
      },
      {
        id: 'activo', texto: fila?.activo ? 'Desactivar' : 'Activar',
        icono: fila?.activo ? 'fa-toggle-off' : 'fa-toggle-on',
        separadorAntes: true, visible: puedeEditar,
        ayuda: fila?.activo ? 'Dejar de usarla, sin borrarla' : 'Volver a usarla',
      },
      {
        id: 'auditoria', texto: 'Ver auditoría', icono: 'fa-user-secret',
        visible: puedeAuditar,
        ayuda: 'Quién tocó esta sucursal y cuándo',
      },
      {
        id: 'eliminar', texto: 'Enviar a la papelera', icono: 'fa-trash',
        separadorAntes: true, peligro: true, visible: puedeBorrar,
        deshabilitada: conEmpleados,
        ayuda: conEmpleados ? 'Tiene empleados asignados: desactívela en lugar de borrarla'
                            : 'Se puede recuperar desde la papelera',
      },
    ];
  }

  /** Se eligió una opción del menú. */
  alElegirContextual(id: string): void {
    const fila = this.selectedRow as any;
    if (!fila) { return; }

    switch (id) {
      case 'ver':       this.viewSucursal(fila); break;
      case 'editar':    this.editSucursal(fila); break;
      case 'clonar':    this.clonSucursal(fila); break;
      // El perímetro se dibuja en el mismo formulario; según el permiso se
      // abre para modificar o sólo para mirar.
      case 'perimetro': this.accesoModel?.editar === true ? this.editSucursal(fila)
                                                          : this.viewSucursal(fila); break;
      case 'mapa':      this.abrirEnGoogleMaps(fila); break;
      case 'activo':    this.cambiarActivo(fila, this._appAgGridService.nodoDe(this.gridApi, fila.id)); break;
      case 'auditoria': this.auditoria(); break;
      case 'eliminar':  this.deleteSucursal(fila); break;
    }
  }

  /**
   * La sucursal en Google Maps, en otra pestaña.
   *
   * Se usa el enlace que arma la BASE al guardar (link_ubicacion): así el que
   * se abre aquí, el que sale en un reporte y el que alguien pega en un
   * WhatsApp son el mismo. Las sucursales guardadas antes de que existiera
   * ese campo caen al punto del perímetro.
   */
  private abrirEnGoogleMaps(fila: any): void {
    let url: string = String(fila?.link_ubicacion ?? '');

    if (!url) {
      const lat = fila?.latitud ?? fila?.centro_lat ?? fila?.vertices?.[0]?.lat;
      const lng = fila?.longitud ?? fila?.centro_lng ?? fila?.vertices?.[0]?.lng;
      if (lat == null || lng == null) {
        this._toastr.info('Esta sucursal todavía no tiene ubicación', 'Sucursales');
        return;
      }
      url = `https://www.google.com/maps/search/?api=1&query=${Number(lat)},${Number(lng)}`;
    }

    // `noopener` es obligatorio: sin él la página que se abre puede tocar
    // ésta a través de window.opener.
    window.open(url, '_blank', 'noopener');
  }

  /** Historial de auditoría de la fila seleccionada (tabla sucursales). */
  auditoria(): void {
    if (!this.selectedRow) { return; }
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.modal.open(AuditoriaModalComponent, {
      centered: true,
      size: 'xl',
      backdrop: 'static',
      keyboard: true
    });
    modalRef.componentInstance.tablaNombre = 'sucursales';
    modalRef.componentInstance.registroId = this.selectedRow.id;
  }
}

// ================================================================
// RENDERER DE LA COLUMNA ACCIONES
// ================================================================
// Simple delegador, como ButtonAccionZona: toda la lógica vive en
// AllSucursalesComponent. Standalone porque la pantalla también lo es, y la
// pantalla llega por parámetros de la celda y no por inyección.
@Component({
  selector: 'app-button-accion-sucursal',
  standalone: true,
  imports: [ActionButtonsModule],
  template: `
    @if (parent?.accionesPlegadas) {
      <button type="button"
              class="btn btn-sm btn-outline-primary acciones-desplegar"
              title="Mostrar los botones de acción"
              aria-label="Mostrar los botones de acción"
              (click)="parent?.toggleActionsColumn()">
        <i class="fas fa-bars"></i>
      </button>
    } @else {
      <app-action-buttons
        [accesoModel]="parent?.accesoModel"
        [buttonView]="true"
        [buttonEdit]="true"
        [buttonClone]="true"
        [buttonDelete]="true"
        (view)="parent?.viewSucursal(params.data)"
        (edit)="parent?.editSucursal(params.data)"
        (clone)="parent?.clonSucursal(params.data)"
        (delete)="parent?.deleteSucursal(params.data)">
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
export class ButtonAccionSucursal implements ICellRendererAngularComp {
  public params: any;

  /** La pantalla, que llega en los parámetros de la celda. */
  public parent?: AllSucursalesComponent;

  agInit(params: any): void {
    this.params = params;
    this.parent = params?.pantalla;
  }

  refresh(params: any): boolean {
    this.params = params;
    this.parent = params?.pantalla;
    return true;
  }
}
