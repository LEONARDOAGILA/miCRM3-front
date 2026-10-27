import {
  Component, ElementRef, EventEmitter, HostListener, OnDestroy, OnInit, ViewChild, inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { Subject, firstValueFrom, from, merge, of } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';
import { AgGridModule, ICellRendererAngularComp } from 'ag-grid-angular';
import { CellClickedEvent, GridApi, GridReadyEvent, RowClassParams } from 'ag-grid-community';

///   COMPONENTES COMUNES    ///
import { PanelComponent } from '../../../../../components/panel/panel.component';
import { ActionButtonsComponent } from '../../../../../components/botones/action-buttons/action-buttons.component';
import { CampoBusquedaPaginacionComponent }
  from '../../../../../components/campos/campoBusquedaPaginacion/campoBusquedaPaginacion.component';
import { MenuContextualComponent, OpcionContextual }
  from '../../../../../components/menuContextual/menuContextual.component';
import { AuditoriaModalComponent } from '../../../../../components/auditoria-modal/auditoria-modal.component';

///   SERVICIOS    ///
import { SeguridadService } from '../../../../seguridad/services/seguridad.service';
import { ProformaService } from '../../../services/proforma.service';
import { AppPrintPdfService } from '../../../../../service/app-printPdf.service';
import { AppExportExcelService } from '../../../../../service/app-exportExcel.service';
import { AppExportCsvService } from '../../../../../service/app-exportCsv.service';
import { AppAgGridService } from '../../../../../service/app-agGrid.service';
import { AppDescargaService, PeticionDescarga, AccionDescarga }
  from '../../../../../service/app-descarga.service';
import { LoadingService } from '../../../../../service/loading.service';

///   MODELOS    ///
import { AccesoModel } from '../../../../seguridad/interfaces/accesoModel';
import {
  ESTADOS_PROFORMA, EstadoProforma, ProformaModel, ResumenProformas,
  claseEstado, etiquetaEstado,
} from '../../../interfaces/proformaModel';

///   PANTALLAS DE ESTE MÓDULO    ///
import { SaveProformaComponent } from '../saveProforma/saveProforma.component';
import { DeleteProformaComponent } from '../deleteProforma/deleteProforma.component';
import { EstadoProformaComponent } from '../estadoProforma/estadoProforma.component';
import { PapeleraProformasComponent } from '../papeleraProformas/papeleraProformas.component';

/**
 * Listado de proformas (ventas.proformas).
 *
 * Mismo esquema que allClientes —rejilla con paginación EN SERVIDOR, filtros
 * por columna que se aplican allí, papelera y exportaciones—, con lo propio
 * de un documento:
 *
 *   · LOS BOTONES DE ESTADO DE ARRIBA. No son un adorno: lo que un vendedor
 *     mira al entrar es «qué tengo enviado sin respuesta» y «qué se me está
 *     venciendo». Cada uno trae su cuenta y su importe, del mismo resumen que
 *     calcula el servidor con el alcance del usuario.
 *
 *   · DUPLICAR Y CAMBIAR DE ESTADO son acciones de la fila. Una proforma
 *     aprobada o anulada ya no se toca: se duplica, y la copia nace en
 *     borrador con su propio número.
 *
 *   · EL ALCANCE LO PONE EL SERVIDOR con el usuario del token: quien no es
 *     administrador ve las de los vendedores que tiene a cargo. Aquí no se
 *     manda ningún id de usuario.
 */
@Component({
  selector: 'app-allProformas',
  standalone: true,
  imports: [
    CommonModule, AgGridModule, PanelComponent,
    CampoBusquedaPaginacionComponent, MenuContextualComponent,
  ],
  templateUrl: './allProformas.component.html',
  styleUrls: ['./allProformas.component.css'],
})
export class AllProformasComponent implements OnInit, OnDestroy {

  /** Pregunta qué descargar (la página o todo) y trae las filas. */
  private readonly _appDescargaService = inject(AppDescargaService);

  // ---------- Estado ----------
  /** Permisos del perfil sobre esta pantalla, del resolver de la ruta. */
  public accesoModel: AccesoModel;
  /** Filas de la página actual — NO el listado completo. */
  public proformaModel: ProformaModel[] = [];
  public selectedRow: ProformaModel | null = null;
  public accionesPlegadas = false;

  public titulo = 'Proformas';
  public isLoading$ = this._loadingService.isLoading$;

  /** El contador de arriba, con el mismo alcance que el listado. */
  public resumen: ResumenProformas | null = null;
  /** El estado por el que se está filtrando, o null para todas. */
  public estadoFiltro: EstadoProforma | null = null;

  /** Los estados, para los botones de arriba (campo, no getter). */
  public readonly estados = ESTADOS_PROFORMA;
  public readonly etiquetaEstado = etiquetaEstado;
  public readonly claseEstado = claseEstado;

  // ---------- Paginación en servidor ----------
  public paginaActual = 1;
  public totalRegistros = 0;
  public registrosPorPagina = 20;
  public ultimaPagina = 1;

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
    const id = setTimeout(() => { this.timeoutIds.delete(id); fn(); }, ms);
    this.timeoutIds.add(id);
  }

  /** Referencias estables a los listeners de la cabecera ACCIONES. */
  private headerElement: Element | null = null;
  private readonly onHeaderClick: EventListener = () => this.toggleActionsColumn();
  private readonly onHeaderTouchStart: EventListener = (e) => this.handleTouchStart(e as TouchEvent);
  private readonly onHeaderTouchEnd: EventListener = (e) => this.handleTouchEnd(e as TouchEvent);

  @HostListener('window:resize')
  onResize(): void { this.ajustarTamanoGrid(); }

  @ViewChild(CampoBusquedaPaginacionComponent) campoBusquedaPaginacion!: CampoBusquedaPaginacionComponent;
  public searchTerm = '';

  // ================================================================
  // MENÚ DEL BOTÓN DERECHO
  // ================================================================

  @ViewChild('menuCtx') menuCtx!: MenuContextualComponent;
  public opcionesContextuales: OpcionContextual[] = [];

  /**
   * Clic derecho sobre la rejilla.
   *
   * La fila la resuelve el servicio común desde el DOM: el evento
   * `cellContextMenu` de ag-Grid no llega (comprobado contra la librería).
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

  /** Qué se ofrece para esta fila, según su estado y lo que permita el perfil. */
  private opcionesPara(fila: any): OpcionContextual[] {
    const editable = fila?.puede_editarse === true;
    return [
      { id: 'ver',      texto: 'Ver',       icono: 'fa-eye',
        visible: this.accesoModel?.ver !== false },
      { id: 'editar',   texto: 'Modificar', icono: 'fa-pen',
        visible: this.accesoModel?.editar === true && editable,
        ayuda: 'Sólo un borrador o una enviada se pueden cambiar' },
      { id: 'estado',   texto: 'Cambiar situación', icono: 'fa-arrow-right-arrow-left',
        visible: this.accesoModel?.editar === true,
        ayuda: 'Enviar, aprobar, rechazar, anular o renovar' },
      { id: 'duplicar', texto: 'Duplicar',  icono: 'fa-clone',
        visible: this.accesoModel?.crear === true,
        ayuda: 'Otra igual, en borrador y con su propio número' },
      { id: 'imprimir', texto: 'Imprimir',  icono: 'fa-print',
        visible: this.accesoModel?.reporte === true,
        ayuda: 'El documento, para enviárselo al cliente' },
      { id: 'eliminar', texto: 'Eliminar',  icono: 'fa-trash',
        peligro: true, separadorAntes: true,
        visible: this.accesoModel?.eliminar === true },
      { id: 'auditoria', texto: 'Ver auditoría', icono: 'fa-user-secret',
        separadorAntes: true,
        visible: this.accesoModel?.auditar === true,
        ayuda: 'Quién tocó este documento y cuándo' },
    ];
  }

  alElegirContextual(id: string): void {
    const fila = this.selectedRow as any;
    if (!fila) { return; }

    switch (id) {
      case 'ver':       this.viewProforma(fila); break;
      case 'editar':    this.editProforma(fila); break;
      case 'estado':    this.cambiarEstado(fila); break;
      case 'duplicar':  this.duplicarProforma(fila); break;
      case 'imprimir':  this.imprimirProforma(fila); break;
      case 'eliminar':  this.deleteProforma(fila); break;
      case 'auditoria': this.auditoria(); break;
    }
  }

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
    private _proformaService: ProformaService,
  ) {
    this.accesoModel = this.activeRoute.snapshot.data['access'];
  }

  ngOnInit(): void {
    this.initializeGrid();
    this.allProformas();
    this.cargarResumen();
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

  fun_home(): void { this.route.navigate(['/ventas']); }

  get desde(): number {
    return this.totalRegistros === 0 ? 0 : (this.paginaActual - 1) * this.registrosPorPagina + 1;
  }

  get hasta(): number {
    return Math.min(this.paginaActual * this.registrosPorPagina, this.totalRegistros);
  }

  // ================================================================
  // AG-GRID
  // ================================================================

  /**
   * Por qué columnas se puede filtrar, y de qué tipo.
   *
   * Tiene que cuadrar con la lista blanca de ProformaController: lo que no
   * esté allí se tira, así que ofrecer aquí un filtro de más sería prometer
   * algo que el servidor no hace.
   */
  private readonly COLUMNAS_FILTRABLES: { [campo: string]: 'texto' | 'numero' } = {
    id: 'numero', lineas: 'numero', validez_dias: 'numero', dias_credito: 'numero',
    descuento_porcentaje: 'numero', subtotal: 'numero', descuento_total: 'numero',
    iva_total: 'numero', total: 'numero',
    numero: 'texto', cliente_nombre: 'texto', cliente_identificacion: 'texto',
    vendedor_nombre: 'texto', estado: 'texto', forma_pago: 'texto',
    observaciones: 'texto', created_by: 'texto', updated_by: 'texto',
    // Las fechas, como texto sobre lo que se ve: «2026-10» busca el mes
    fecha: 'texto', fecha_vence: 'texto', created_at: 'texto', updated_at: 'texto',
  };

  /** Lo que haya pedido la cabecera, tal cual lo da ag-Grid. */
  public filtrosColumna: any = {};

  /**
   * Las vencidas se ven, y se ven distintas.
   *
   * Una enviada que ya pasó de fecha sigue diciendo «Enviada» —el estado
   * guardado no cambia solo— y es justo la que hay que atender. Se tiñe la
   * fila para que no haya que comparar la fecha de vencimiento con la de hoy
   * renglón por renglón.
   */
  public rowClassRules = {
    'fila-vencida': (p: RowClassParams) => p.data?.vencida === true,
    'fila-anulada': (p: RowClassParams) => p.data?.estado === 'ANULADA',
  };

  private conFiltros(columnas: any[]): any[] {
    return this._appAgGridService.filtrosDeServidor(columnas, this.COLUMNAS_FILTRABLES);
  }

  /** La cabecera pidió otra cosa. Siempre a la página 1. */
  onFiltroColumna(): void {
    if (this.limpiando) { return; }
    this.filtrosColumna = this.gridApi?.getFilterModel() ?? {};
    this.allProformas(1);
  }

  get cuantasColumnasFiltradas(): number {
    return Object.keys(this.filtrosColumna || {}).length;
  }

  get hayFiltro(): boolean {
    return !!this.searchTerm || this.cuantasColumnasFiltradas > 0 || !!this.estadoFiltro;
  }

  initializeGrid(): void {
    this.columnDefs = this.conFiltros([
      {
        headerName: 'Número', field: 'numero',
        cellStyle: { textAlign: 'left', fontWeight: '600' },
        minWidth: 130, maxWidth: 150,
      },
      {
        headerName: 'Fecha', field: 'fecha',
        cellStyle: { textAlign: 'center' }, minWidth: 105, maxWidth: 115,
      },
      {
        headerName: 'Vence', field: 'fecha_vence',
        headerTooltip: 'Fecha más los días de validez',
        cellStyle: { textAlign: 'center' }, minWidth: 105, maxWidth: 125,
        cellRenderer: (p: any) => {
          if (!p.value) { return ''; }
          // Lo que importa no es la fecha, es cuántos días quedan
          const dias = Number(p.data?.dias_para_vencer ?? 0);
          if (p.data?.vencida) {
            return `${p.value} <span class="pf-aviso pf-aviso--mal">hace ${Math.abs(dias)} d</span>`;
          }
          if (p.data?.estado === 'ENVIADA' && dias >= 0 && dias <= 7) {
            return `${p.value} <span class="pf-aviso pf-aviso--ojo">${dias} d</span>`;
          }
          return p.value;
        },
      },
      {
        headerName: 'Cliente', field: 'cliente_nombre',
        cellStyle: { textAlign: 'left' }, minWidth: 200, maxWidth: 320,
      },
      {
        headerName: 'Identificación', field: 'cliente_identificacion',
        cellStyle: { textAlign: 'center' }, minWidth: 120, maxWidth: 150,
      },
      {
        headerName: 'Estado', field: 'estado',
        cellStyle: { textAlign: 'center' }, minWidth: 110, maxWidth: 130,
        cellRenderer: (p: any) => p.value
          ? `<span class="badge ${claseEstado(p.value)} fs-10px">${etiquetaEstado(p.value)}</span>`
          : '',
      },
      {
        headerName: 'Líneas', field: 'lineas',
        cellStyle: { textAlign: 'center' }, minWidth: 80, maxWidth: 95,
      },
      {
        headerName: 'Subtotal', field: 'subtotal',
        cellStyle: { textAlign: 'right' }, minWidth: 110, maxWidth: 130,
        valueFormatter: (p: any) => this.formatoMoneda(p.value),
      },
      {
        headerName: 'Dcto.', field: 'descuento_total',
        cellStyle: { textAlign: 'right' }, minWidth: 100, maxWidth: 120,
        valueFormatter: (p: any) => this.formatoMoneda(p.value),
      },
      {
        headerName: 'IVA', field: 'iva_total',
        cellStyle: { textAlign: 'right' }, minWidth: 100, maxWidth: 120,
        valueFormatter: (p: any) => this.formatoMoneda(p.value),
      },
      {
        headerName: 'Total', field: 'total',
        cellStyle: { textAlign: 'right', fontWeight: '600' }, minWidth: 115, maxWidth: 140,
        valueFormatter: (p: any) => this.formatoMoneda(p.value),
      },
      {
        headerName: 'Forma de pago', field: 'forma_pago',
        cellStyle: { textAlign: 'center' }, minWidth: 120, maxWidth: 145,
        cellRenderer: (p: any) => p.value
          ? `<span class="badge bg-secondary bg-opacity-25 text-body fs-10px">${p.value}</span>`
          : '',
      },
      {
        headerName: 'Vendedor', field: 'vendedor_nombre',
        cellStyle: { textAlign: 'left' }, minWidth: 160, maxWidth: 260,
      },
      {
        headerName: 'Creada', field: 'created_at',
        cellStyle: { textAlign: 'center' }, minWidth: 160, maxWidth: 180,
      },
      {
        headerName: 'Creada por', field: 'created_by',
        cellStyle: { textAlign: 'left' }, minWidth: 130, maxWidth: 200, sortable: false,
      },
      {
        headerName: 'ACCIONES', field: 'actions',
        cellStyle: { display: 'flex', justifyContent: 'center', alignItems: 'center' },
        cellRenderer: ButtonAccionProforma,
        pinned: 'right',
        minWidth: AllProformasComponent.ANCHO_ACCIONES_ABIERTA,
        maxWidth: AllProformasComponent.ANCHO_ACCIONES_ABIERTA,
        suppressMenu: true, sortable: false, resizable: false,
        headerComponentParams: {
          template: `
            <div style="display: flex; align-items: center; justify-content: center; gap: 5px;" title="Ocultar los botones de acción">
              <span>ACCIONES</span>
              <i class="fas fa-arrow-right"></i>
            </div>
          `,
        },
      },
    ]);
  }

  /** 1500 → "$ 1.500,00"; vacío si no hay importe. */
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

  handleTouchStart(e: TouchEvent): void {
    this.touchStartTime = Date.now();
    this.touchStartX = e.touches[0].clientX;
    this.touchStartY = e.touches[0].clientY;
  }

  handleTouchEnd(e: TouchEvent): void {
    const duracion = Date.now() - this.touchStartTime;
    const distX = Math.abs(e.changedTouches[0].clientX - this.touchStartX);
    const distY = Math.abs(e.changedTouches[0].clientY - this.touchStartY);
    if (duracion < 300 && distX < 10 && distY < 10) {
      this.toggleActionsColumn();
      e.preventDefault();
    }
  }

  private static readonly ANCHO_ACCIONES_ABIERTA = 180;
  private static readonly ANCHO_ACCIONES_PLEGADA = 50;

  /** Pliega o despliega la columna ACCIONES (pulsando su cabecera). */
  toggleActionsColumn(): void {
    const columnDefs = this.gridApi.getColumnDefs() as any[];
    const actionsCol = columnDefs.find(col => col.field === 'actions');
    if (!actionsCol) { return; }

    const estabaPlegada = actionsCol.minWidth === AllProformasComponent.ANCHO_ACCIONES_PLEGADA;
    this.accionesPlegadas = !estabaPlegada;

    const ancho = estabaPlegada
      ? AllProformasComponent.ANCHO_ACCIONES_ABIERTA
      : AllProformasComponent.ANCHO_ACCIONES_PLEGADA;
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
          </div>`,
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

  /** ↑ / ↓ seleccionan la fila como un clic. */
  navegarConTeclado = this._appAgGridService.navegacionConFlechas(fila => this.selectedRow = fila);

  onCellClicked(e: CellClickedEvent): void {
    this.selectedRow = e.data;
  }

  // ================================================================
  // DATOS
  // ================================================================

  /** Pide una página al servidor y la vuelca en la rejilla. */
  async allProformas(page: number = 1): Promise<void> {
    try {
      this._loadingService.setLoading(true);

      const res: any = await firstValueFrom(
        this._proformaService.allProformas(page, this.registrosPorPagina, this.searchTerm,
                                           this.estadoFiltro ?? '', this.filtrosColumna)
      );

      if (res.body?.status !== 'success') {
        this._toastr.error(res.body?.message || 'No se pudo obtener el listado de proformas', 'Error');
        this.proformaModel = [];
        this.totalRegistros = 0;
        this.ultimaPagina = 1;
        this.gridApi?.setRowData(this.proformaModel);
        return;
      }

      this.proformaModel = res.body?.data?.data || [];

      const meta = res.body?.data?.meta;
      if (meta) {
        this.totalRegistros = meta.total;
        this.registrosPorPagina = meta.per_page;
        this.paginaActual = meta.current_page;
        this.ultimaPagina = meta.last_page;
      }

      this.gridApi?.setRowData(this.proformaModel);

    } catch (error) {
      // El AuthInterceptor ya enseñó el toast del error HTTP
      console.error('Error al cargar proformas:', error);
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  /** El contador de arriba. Se recarga cuando algo cambia de estado. */
  async cargarResumen(): Promise<void> {
    try {
      const res: any = await firstValueFrom(this._proformaService.resumenProformas());
      this.resumen = res?.status === 'success' ? res.data : null;
    } catch (error) {
      console.error('Error al cargar el resumen:', error);
      this.resumen = null;
    }
  }

  /** Cuántas hay en un estado, según el resumen (0 si no hay ninguna). */
  cuantasEn(estado: EstadoProforma): number {
    return Number(this.resumen?.por_estado?.find(e => e.estado === estado)?.cuantas ?? 0);
  }

  /** Filtra por un estado, o lo quita si ya estaba puesto. */
  filtrarPorEstado(estado: EstadoProforma | null): void {
    this.estadoFiltro = this.estadoFiltro === estado ? null : estado;
    this.allProformas(1);
  }

  /** Trae TODO lo que cumple el filtro actual, para exportar. */
  private async obtenerTodosParaExportar(): Promise<ProformaModel[]> {
    if (this.totalRegistros === 0) { return []; }
    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(
        this._proformaService.allProformas(1, this.totalRegistros, this.searchTerm,
                                           this.estadoFiltro ?? '', this.filtrosColumna)
      );
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

  // ================================================================
  // BÚSQUEDA Y PAGINACIÓN
  // ================================================================

  async onFilterTextBoxChanged(term?: string): Promise<void> {
    if (this.limpiando) { return; }
    if (term !== undefined) { this.searchTerm = term; }
    this.paginaActual = 1;
    await this.allProformas(1);
  }

  /**
   * Deja la pantalla como al entrar, con UNA sola petición.
   *
   * El aviso de la rejilla y el del buscador recargan por su cuenta: se
   * apagan mientras se limpia y se enciende al final una sola consulta.
   */
  clearAllFilters(): void {
    if (!this.hayFiltro) { return; }

    const habiaColumnas = this.cuantasColumnasFiltradas > 0;

    this.limpiando = true;
    this.searchTerm = '';
    this.filtrosColumna = {};
    this.estadoFiltro = null;
    if (habiaColumnas) { this.gridApi?.setFilterModel(null); }
    this.limpiando = false;

    this.allProformas(1);
  }

  private limpiando = false;

  firstPage(): void { if (this.paginaActual !== 1) { this.goToPage(1); } }
  ultimaPagina2(): void { if (this.paginaActual !== this.ultimaPagina) { this.goToPage(this.ultimaPagina); } }

  goToPage(page: number): void {
    if (page < 1 || page > this.ultimaPagina) { return; }
    this.paginaActual = page;
    this.allProformas(this.paginaActual);
  }

  nextPage(): void { this.goToPage(this.paginaActual + 1); }
  prevPage(): void { this.goToPage(this.paginaActual - 1); }

  // ================================================================
  // IMPRESIÓN Y EXPORTACIÓN DEL LISTADO
  // ================================================================

  private readonly CABECERAS_REPORTE =
    ['Número', 'Fecha', 'Vence', 'Cliente', 'Vendedor', 'Estado', 'Líneas', 'Subtotal', 'IVA', 'Total'];

  private filasReporte(filas: ProformaModel[]): any[][] {
    return filas.map(p => [
      p.numero,
      p.fecha,
      p.fecha_vence ?? '',
      p.cliente_nombre ?? '',
      p.vendedor_nombre ?? '',
      etiquetaEstado(p.estado),
      p.lineas ?? '',
      Number(p.subtotal ?? 0).toFixed(2),
      Number(p.iva_total ?? 0).toFixed(2),
      Number(p.total ?? 0).toFixed(2),
    ]);
  }

  private peticionDescarga(accion: AccionDescarga): PeticionDescarga<any> {
    return {
      accion,
      nombrePlural: 'proformas',
      tituloBase: 'Listado de Proformas',
      gridApi: this.gridApi,
      filasDePagina: this.proformaModel,
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
    if (!salida) { return; }
    this._appPrintPdfService.generarReporte({
      tamanoPapel: 'A4',
      orientacion: 'l',          // apaisado: diez columnas no caben de pie
      title: 'Reporte de Proformas',
      titleTable: salida.titulo,
      headers: this.CABECERAS_REPORTE,
      data: this.filasReporte(salida.filas),
      piePagina: 'Pie de página - Mi Empresa en Desarrollo S.A....',
    });
  }

  async exportExcel(): Promise<void> {
    const salida = await this._appDescargaService.preparar(this.peticionDescarga('excel'));
    if (!salida) { return; }
    this._appExportExcelService.generarReporteExcel({
      tamanoPapel: 'A4',
      orientacion: 'l',
      title: 'Reporte de Proformas',
      titleTable: salida.titulo,
      headers: this.CABECERAS_REPORTE,
      data: this.filasReporte(salida.filas),
      piePagina: 'Pie de página - Mi Empresa en Desarrollo S.A....',
    });
  }

  async exportCsv(): Promise<void> {
    const salida = await this._appDescargaService.preparar(this.peticionDescarga('csv'));
    if (!salida) { return; }
    this._appExportCsvService.generarReporteCSV({
      headers: this.CABECERAS_REPORTE,
      data: this.filasReporte(salida.filas),
    });
  }

  // ================================================================
  // IMPRIMIR UNA PROFORMA (el documento, para el cliente)
  // ================================================================

  /**
   * El documento en PDF: lo que se le manda al cliente.
   *
   * Se piden las líneas al servidor —el listado no las trae— y se arma con
   * el mismo generador de informes que el resto de la aplicación. Los
   * totales van como últimas filas de la tabla, que es donde se leen.
   */
  async imprimirProforma(fila: any): Promise<void> {
    if (!fila?.id) { return; }
    if (this._seguridadService.isexpired()) { return; }

    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._proformaService.findByIdProforma(fila.id));
      if (res?.status !== 'success' || !res?.data) {
        this._toastr.error(res?.message || 'No se pudo abrir la proforma', 'Error');
        return;
      }

      const p: ProformaModel = res.data;
      const dos = (n: any) => Number(n ?? 0).toFixed(2);

      const lineas: any[][] = (p.detalle ?? []).map((l, i) => [
        i + 1,
        l.codigo ?? '',
        l.descripcion,
        l.unidad ?? '',
        Number(l.cantidad ?? 0).toFixed(2),
        dos(l.precio_unitario),
        Number(l.descuento_porcentaje ?? 0).toFixed(2) + ' %',
        Number(l.iva_porcentaje ?? 0).toFixed(0) + ' %',
        dos(l.total),
      ]);

      // Los totales, al pie de la misma tabla
      const sumas: any[][] = [
        ['', '', '', '', '', '', '', 'Subtotal', dos(p.subtotal)],
      ];
      if (Number(p.descuento_total ?? 0) > 0) {
        sumas.push(['', '', '', '', '', '', '', 'Descuento', '-' + dos(p.descuento_total)]);
      }
      for (const t of (p.iva_desglose ?? [])) {
        if (Number(t.porcentaje) > 0) {
          sumas.push(['', '', '', '', '', '', '', `IVA ${Number(t.porcentaje).toFixed(0)} %`, dos(t.valor)]);
        }
      }
      sumas.push(['', '', '', '', '', '', '', 'TOTAL', dos(p.total)]);

      // La cabecera del documento: a quién, con qué condiciones y hasta cuándo
      const condiciones = [
        p.cliente_nombre,
        p.cliente_identificacion ? `Id: ${p.cliente_identificacion}` : null,
        p.cliente_direccion,
        p.cliente_telefono,
        `Fecha: ${p.fecha}`,
        `Válida hasta: ${p.fecha_vence}`,
        p.forma_pago ? `Forma de pago: ${p.forma_pago}` : null,
        Number(p.dias_credito ?? 0) > 0 ? `Crédito: ${p.dias_credito} días` : null,
        p.vendedor_nombre ? `Vendedor: ${p.vendedor_nombre}` : null,
      ].filter(Boolean).join(' · ');

      this._appPrintPdfService.generarReporte({
        tamanoPapel: 'A4',
        orientacion: 'p',
        title: `Proforma ${p.numero}`,
        titleTable: condiciones,
        headers: ['#', 'Código', 'Descripción', 'Unidad', 'Cantidad', 'P. unit.', 'Dcto.', 'IVA', 'Total'],
        data: [...lineas, ...sumas],
        piePagina: [p.condiciones, p.observaciones].filter(Boolean).join(' — ')
                   || 'Pie de página - Mi Empresa en Desarrollo S.A....',
      });

    } catch (error) {
      console.error('Error al imprimir la proforma:', error);
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  // ================================================================
  // ACCIONES (modales)
  // ================================================================

  private abrirModalProforma(registro: any, accion: 'add' | 'edit' | 'clon' | 'view'): NgbModalRef {
    const modalRef = this.modal.open(SaveProformaComponent, {
      centered: true,
      size: 'xl',
      // Más ancho que un xl normal (ver .proforma-modal en styles.css): la
      // ficha va en dos columnas y la rejilla de líneas necesita sitio para
      // que se vea el total de cada una sin desplazarla
      windowClass: 'proforma-modal',
      backdrop: 'static',
      keyboard: accion === 'view',
    });
    modalRef.componentInstance.registro_selected = registro;
    modalRef.componentInstance.accion = accion;
    return modalRef;
  }

  addProforma(): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.abrirModalProforma(0, 'add');
    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, () => {
      // Una proforma nueva estrena número, así que no se puede colar en la
      // página como una fila más: se recarga la página 1, que es donde sale
      this.allProformas(1);
      this.cargarResumen();
    });
  }

  editProforma(registro: any): void {
    if (this._seguridadService.isexpired()) { return; }
    if (registro?.puede_editarse === false) {
      this._toastr.info('Una proforma aprobada, rechazada, vencida o anulada ya no se puede cambiar. Duplíquela para hacer una nueva.',
                        'No se puede modificar', { timeOut: 7000, closeButton: true });
      return;
    }
    const modalRef = this.abrirModalProforma(registro, 'edit');
    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, (actualizada: any) => {
      this.refrescarFila(actualizada);
      this.cargarResumen();
    });
  }

  viewProforma(registro: any): void {
    if (this._seguridadService.isexpired()) { return; }
    this.abrirModalProforma(registro, 'view');
  }

  /** Otra igual, en borrador y con su propio número. */
  async duplicarProforma(registro: any): Promise<void> {
    if (this._seguridadService.isexpired()) { return; }
    if (!registro?.id) { return; }

    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._proformaService.duplicarProforma(registro.id));
      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo duplicar la proforma', 'Error');
        return;
      }
      this._toastr.success(res.message, 'Copiada', { closeButton: true });
      await this.allProformas(1);
      this.cargarResumen();

      // Se abre la copia: duplicar casi siempre es el paso previo a cambiarle
      // algo, y así no hay que ir a buscarla
      if (res.data?.id) { this.editProforma(res.data); }

    } catch (error) {
      console.error('Error al duplicar la proforma:', error);
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  /** Enviar, aprobar, rechazar, anular o renovar. */
  cambiarEstado(registro: any, sugerido: EstadoProforma | null = null): void {
    if (this._seguridadService.isexpired()) { return; }

    const modalRef = this.modal.open(EstadoProformaComponent, {
      centered: true, size: 'md', backdrop: 'static', keyboard: true,
    });
    modalRef.componentInstance.registro_selected = registro;
    modalRef.componentInstance.estadoSugerido = sugerido;

    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, (actualizada: any) => {
      this.refrescarFila(actualizada);
      this.cargarResumen();
    });
  }

  /** Sustituye una fila en sitio, sin volver al servidor por toda la página. */
  private refrescarFila(actualizada: any): void {
    if (!actualizada?.id) { return; }
    const i = this.proformaModel.findIndex(r => r.id === actualizada.id);
    if (i === -1) { return; }

    // Lo que viene de guardar es el documento completo (con sus líneas); la
    // rejilla sólo necesita la cabecera y cuántas líneas tiene
    const fila = { ...actualizada, lineas: (actualizada.detalle?.length ?? actualizada.lineas ?? 0) };
    this.proformaModel[i] = fila;
    this.gridApi?.getRowNode(i.toString())?.setData(fila);
    if (this.selectedRow?.id === fila.id) { this.selectedRow = fila; }
  }

  /** Manda la proforma a la papelera y quita la fila. */
  deleteProforma(registro: any): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.modal.open(DeleteProformaComponent, {
      centered: true, size: 'md', backdrop: 'static', keyboard: true,
    });
    modalRef.componentInstance.registro_selected = registro;

    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, () => {
      const i = this.proformaModel.findIndex(r => r.id === registro.id);
      if (i === -1) { return; }
      this.proformaModel.splice(i, 1);
      this.totalRegistros = Math.max(0, this.totalRegistros - 1);
      this.gridApi?.applyTransaction({ remove: [registro] });
      if (this.selectedRow?.id === registro.id) { this.selectedRow = null; }
      this.cargarResumen();
    });
  }

  /** Papelera de reciclaje: desde ahí se restauran o se borran de verdad. */
  abrirPapelera(): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.modal.open(PapeleraProformasComponent, {
      centered: true, size: 'xl', backdrop: 'static', keyboard: true,
    });
    // Los permisos viajan con el modal: el de auditar y el de vaciar, que es
    // otro distinto de «papelera» (y el servidor lo exige otra vez)
    modalRef.componentInstance.puedeAuditar = this.accesoModel?.auditar === true;
    modalRef.componentInstance.puedeVaciar = this.accesoModel?.vaciar === true;
    this.escucharModal(modalRef, modalRef.componentInstance.cambio, () => {
      this.allProformas(this.paginaActual);
      this.cargarResumen();
    });
  }

  /** Historial de auditoría de la fila marcada. */
  auditoria(): void {
    if (!this.selectedRow) { return; }
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.modal.open(AuditoriaModalComponent, {
      centered: true, size: 'xl', backdrop: 'static', keyboard: true,
    });
    modalRef.componentInstance.tablaNombre = 'proformas';
    modalRef.componentInstance.registroId = this.selectedRow.id;
  }
}

// ================================================================
// RENDERER DE LA COLUMNA ACCIONES
// ================================================================
// Simple delegador: toda la lógica de modales vive en AllProformasComponent.
//
// Lleva dos botones propios además de los de siempre —«enviar/cambiar
// situación» e «imprimir»—, porque son las dos cosas que se hacen con una
// proforma todo el día y buscarlas en el menú del botón derecho cansa.
@Component({
  selector: 'app-button-accion-proforma',
  standalone: true,
  imports: [CommonModule, ActionButtonsComponent],
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
      <div class="acciones-fila">
        @if (parent.accesoModel?.editar === true) {
          <button type="button"
                  class="btn btn-sm btn-outline-primary acciones-extra"
                  title="Enviar, aprobar, rechazar, anular o renovar"
                  (click)="parent.cambiarEstado(params.data)">
            <i class="fa-solid fa-arrow-right-arrow-left"></i>
          </button>
        }
        @if (parent.accesoModel?.reporte === true) {
          <button type="button"
                  class="btn btn-sm btn-outline-secondary acciones-extra"
                  title="Imprimir la proforma para el cliente"
                  (click)="parent.imprimirProforma(params.data)">
            <i class="fa-solid fa-print"></i>
          </button>
        }
        <app-action-buttons
          [accesoModel]="parent.accesoModel"
          [buttonView]="true"
          [buttonEdit]="true"
          [buttonClone]="true"
          [buttonDelete]="true"
          (view)="parent.viewProforma(params.data)"
          (edit)="parent.editProforma(params.data)"
          (clone)="parent.duplicarProforma(params.data)"
          (delete)="parent.deleteProforma(params.data)">
        </app-action-buttons>
      </div>
    }
  `,
  styles: [`
    .acciones-fila {
      display: inline-flex;
      align-items: center;
      gap: .25rem;
    }

    .acciones-desplegar,
    .acciones-extra {
      width: 28px;
      height: 24px;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: .25rem;
      font-size: .7rem;
    }
  `],
})
export class ButtonAccionProforma implements ICellRendererAngularComp {
  public params: any;

  constructor(public parent: AllProformasComponent) { }

  agInit(params: any): void { this.params = params; }

  refresh(params: any): boolean { this.params = params; return true; }
}
