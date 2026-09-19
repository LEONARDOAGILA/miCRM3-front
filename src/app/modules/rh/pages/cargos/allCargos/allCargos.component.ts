import { Component, ElementRef, EventEmitter, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Subject, firstValueFrom, from, merge, of } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';
import { CellClickedEvent, GridApi, GridReadyEvent } from 'ag-grid-community';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { ActivatedRoute, Router } from '@angular/router';
import { ICellRendererAngularComp } from 'ag-grid-angular';
import { ToastrService } from 'ngx-toastr';

///   SERVICIOS    ///
import { SeguridadService } from '../../../../seguridad/services/seguridad.service';
import { CargoService } from '../../../services/cargo.service';
import { AppPrintPdfService } from '../../../../../service/app-printPdf.service';
import { AppExportExcelService } from '../../../../../service/app-exportExcel.service';
import { AppExportCsvService } from '../../../../../service/app-exportCsv.service';
import { AppAgGridService } from '../../../../../service/app-agGrid.service';
import { LoadingService } from '../../../../../service/loading.service';

///   MODELOS    ///
import { CargoModel } from '../../../interfaces/cargoModel';
import { AccesoModel } from '../../../../seguridad/interfaces/accesoModel';

///   COMPONENTES    ///
import { SaveCargoComponent } from '../saveCargo/saveCargo.component';
import { DeleteCargoComponent } from '../deleteCargo/deleteCargo.component';
import { AuditoriaModalComponent } from '../../../../../components/auditoria-modal/auditoria-modal.component';
import { CampoBusquedaPaginacionComponent } from '../../../../../components/campos/campoBusquedaPaginacion/campoBusquedaPaginacion.component';

/**
 * Listado de cargos (rh.cargos).
 *
 * Mismo esquema que allUsers: grilla ag-Grid con paginación EN SERVIDOR
 * (rh.fn_cargos_listar_paginado con página, tamaño y filtro), barra con
 * buscador / nuevo / auditoría, columna ACCIONES plegable y exportaciones
 * que piden el listado completo aparte.
 *
 * Toda la lógica de modales vive aquí; el renderer de ACCIONES
 * (ButtonAccionCargo, al final del fichero) sólo delega.
 */
@Component({
  selector: 'app-allCargos',
  templateUrl: './allCargos.component.html',
  styleUrls: ['./allCargos.component.css'],
  standalone: false,
})
export class AllCargosComponent implements OnInit, OnDestroy {

  // ---------- Estado ----------
  /** Permisos del perfil sobre esta pantalla (crear, reporte, auditar…), del resolver de la ruta. */
  public accesoModel: AccesoModel;
  /** Filas de la página actual — NO el listado completo. */
  public cargoModel: CargoModel[] = [];
  /** Fila marcada en la grilla; habilita el botón de auditoría. */
  public selectedRow: CargoModel | null = null;
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

  /** setTimeout que se da de baja solo al dispararse (ver allUsers). */
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
    private _cargoService: CargoService,
  ) {
    this.titulo = "Cargos";
    this.accesoModel = this.activeRoute.snapshot.data.access;
  }

  ngOnInit(): void {
    this.allCargos();
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

  /** Suscribe al @Output de un modal y corta la suscripción al cerrarse o al destruir esta pantalla. */
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
    this.route.navigate(['/rh']);
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
        headerName: 'Cargo',
        field: 'nombre',
        cellStyle: { textAlign: 'left', fontWeight: '600' },
        minWidth: 220,
        maxWidth: 400,
      },
      {
        headerName: 'Nivel',
        field: 'nivel',
        cellStyle: { textAlign: 'center' },
        minWidth: 120,
        maxWidth: 140,
        cellRenderer: (params: any) => params.value
          ? `<span class="badge bg-secondary bg-opacity-25 text-body fs-10px">${params.value}</span>`
          : '',
      },
      {
        headerName: 'Salario base',
        field: 'salario_base',
        cellStyle: { textAlign: 'right' },
        minWidth: 120,
        maxWidth: 140,
        valueFormatter: (params: any) => this.formatoMoneda(params.value),
      },
      {
        headerName: 'Descripción',
        field: 'descripcion',
        cellStyle: { textAlign: 'left' },
        minWidth: 200,
        maxWidth: 600,
      },
      {
        headerName: 'Empleados',
        field: 'num_empleados',
        headerTooltip: 'Empleados que tienen este cargo',
        cellStyle: { textAlign: 'center' },
        minWidth: 100,
        maxWidth: 110,
      },
      {
        headerName: 'Activo',
        field: 'activo',
        cellStyle: { textAlign: 'center' },
        minWidth: 80,
        maxWidth: 80,
        cellRenderer: (params: any) =>
          `
          <div class="form-check mb-2 d-flex align-items-center justify-content-center" style="height: 100%;">
            <input disabled class="form-check-input" type="checkbox" ${params.value === true ? 'checked' : ''} />
            <label class="form-check-label"></label>
          </div>
          `,
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
        cellRenderer: ButtonAccionCargo,
        pinned: 'right',
        minWidth: AllCargosComponent.ANCHO_ACCIONES_ABIERTA,
        maxWidth: AllCargosComponent.ANCHO_ACCIONES_ABIERTA,
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

  /** 1500 → "$ 1.500,00"; vacío si no hay salario. */
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

  /** Pliega o despliega la columna ACCIONES (pulsando su cabecera). */
  toggleActionsColumn() {
    const columnDefs = this.gridApi.getColumnDefs() as any[];
    const actionsCol = columnDefs.find(col => col.field === 'actions');
    if (!actionsCol) { return; }

    const estabaPlegada = actionsCol.minWidth === AllCargosComponent.ANCHO_ACCIONES_PLEGADA;
    this.accionesPlegadas = !estabaPlegada;

    const ancho = estabaPlegada ? AllCargosComponent.ANCHO_ACCIONES_ABIERTA : AllCargosComponent.ANCHO_ACCIONES_PLEGADA;
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

  /** La grilla llena la pantalla hasta el final de la ventana, menos la paginación. */
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

  /** ↑ / ↓ seleccionan la fila como un clic (ver AppAgGridService.navegacionConFlechas). */
  navegarConTeclado = this._appAgGridService.navegacionConFlechas(fila => this.selectedRow = fila);

  onCellClicked(e: CellClickedEvent): void {
    this.selectedRow = e.data;
  }

  // ================================================================
  // DATOS
  // ================================================================

  /** Pide una página al servidor y la vuelca en la grilla (con el meta de paginación). */
  async allCargos(page: number = 1) {
    try {
      this._loadingService.setLoading(true);

      const res = await firstValueFrom(
        this._cargoService.allCargos(page, this.registrosPorPagina, this.searchTerm)
      ) as any;

      if (res.body?.status !== 'success') {
        this._toastr.error(res.body?.message || 'No se pudo obtener el listado de cargos', 'Error');
        this.cargoModel = [];
        this.totalRegistros = 0;
        this.ultimaPagina = 1;
        this.gridApi?.setRowData(this.cargoModel);
        return;
      }

      this.cargoModel = res.body?.data?.data || [];

      if (res.body?.data?.meta) {
        this.totalRegistros = res.body.data.meta.total;
        this.registrosPorPagina = res.body.data.meta.per_page;
        this.paginaActual = res.body.data.meta.current_page;
        this.ultimaPagina = res.body.data.meta.last_page;
      }

      if (this.gridApi) this.gridApi.setRowData(this.cargoModel);
    } catch (error) {
      // El AuthInterceptor ya muestra el toast del error HTTP
      console.error('Error al cargar cargos:', error);
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  /** Trae TODOS los registros que cumplen el filtro actual, para exportar. */
  private async obtenerTodosParaExportar(): Promise<CargoModel[]> {
    if (this.totalRegistros === 0) { return []; }
    try {
      this._loadingService.setLoading(true);
      const res = await firstValueFrom(
        this._cargoService.allCargos(1, this.totalRegistros, this.searchTerm)
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

  /** Filas del reporte, ordenadas por nombre y con formato de salida. */
  private filasReporte(cargos: CargoModel[]): any[][] {
    return cargos
      .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''))
      .map(item => [
        item.id,
        item.nombre,
        item.nivel || '',
        this.formatoMoneda(item.salario_base),
        item.num_empleados ?? 0,
        item.activo ? 'Activo' : 'Inactivo'
      ]);
  }

  // ================================================================
  // BÚSQUEDA
  // ================================================================

  async onFilterTextBoxChanged(term?: string) {
    if (term !== undefined) this.searchTerm = term;
    this.paginaActual = 1;
    await this.allCargos(1);
  }

  clearAllFilters() {
    this.campoBusquedaPaginacion?.reset();
    if (this.gridApi) {
      this.gridApi.setFilterModel(null);
      this.searchTerm = '';
      this.gridApi.onFilterChanged();
      this.allCargos(this.paginaActual).then(() => {
        if (this.paginaActual > this.ultimaPagina && this.ultimaPagina > 0) {
          this.goToPage(this.ultimaPagina);
        }
      });
    }
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
    if (page < 1 || page > this.ultimaPagina) return;
    this.paginaActual = page;
    this.allCargos(this.paginaActual);
  }

  nextPage(): void { this.goToPage(this.paginaActual + 1); }
  prevPage(): void { this.goToPage(this.paginaActual - 1); }

  // ================================================================
  // IMPRESIÓN Y EXPORTACIÓN (listado completo que cumple el filtro)
  // ================================================================

  private readonly CABECERAS_REPORTE = ['ID', 'Cargo', 'Nivel', 'Salario base', 'Empleados', 'Estado'];

  private tituloReporte(): string {
    return this.searchTerm ? `Listado de Cargos (filtro: ${this.searchTerm})` : 'Listado de Cargos';
  }

  async printPdf() {
    const cargos = await this.obtenerTodosParaExportar();
    if (cargos.length === 0) { this._toastr.info('No hay cargos para exportar'); return; }
    this._appPrintPdfService.generarReporte({
      tamanoPapel: "A4",
      orientacion: "p",
      title: "Reporte de Cargos",
      titleTable: this.tituloReporte(),
      headers: this.CABECERAS_REPORTE,
      data: this.filasReporte(cargos),
      piePagina: 'Pie de página - Mi Empresa en Desarrollo S.A....'
    });
  }

  async exportExcel() {
    const cargos = await this.obtenerTodosParaExportar();
    if (cargos.length === 0) { this._toastr.info('No hay cargos para exportar'); return; }
    this._appExportExcelService.generarReporteExcel({
      tamanoPapel: "A4",
      orientacion: "p",
      title: "Reporte de Cargos",
      titleTable: this.tituloReporte(),
      headers: this.CABECERAS_REPORTE,
      data: this.filasReporte(cargos),
      piePagina: 'Pie de página - Mi Empresa en Desarrollo S.A....'
    });
  }

  async exportCsv() {
    const cargos = await this.obtenerTodosParaExportar();
    if (cargos.length === 0) { this._toastr.info('No hay cargos para exportar'); return; }
    this._appExportCsvService.generarReporteCSV({
      headers: this.CABECERAS_REPORTE,
      data: this.filasReporte(cargos),
    });
  }

  // ================================================================
  // ACCIONES (modales)
  // ================================================================

  /** Abre saveCargo en el modo pedido. registro = 0 para crear. */
  private abrirModalCargo(registro: any, accion: 'add' | 'edit' | 'clon' | 'view'): NgbModalRef {
    const modalRef = this.modal.open(SaveCargoComponent, {
      centered: true,
      size: 'lg',
      backdrop: 'static',
      keyboard: accion === 'view',
    });
    modalRef.componentInstance.registro_selected = registro;
    modalRef.componentInstance.accion = accion;
    return modalRef;
  }

  addCargo(): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.abrirModalCargo(0, 'add');
    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, (nuevo: any) => {
      this.cargoModel = [nuevo, ...this.cargoModel];
      this.totalRegistros++;
      this.gridApi?.setRowData(this.cargoModel);
    });
  }

  clonCargo(registro: any): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.abrirModalCargo(registro, 'clon');
    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, (nuevo: any) => {
      this.cargoModel = [nuevo, ...this.cargoModel];
      this.totalRegistros++;
      this.gridApi?.setRowData(this.cargoModel);
    });
  }

  /** Al guardar sustituye la fila en sitio: no hace falta volver al servidor. */
  editCargo(registro: any): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.abrirModalCargo(registro, 'edit');
    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, (actualizado: any) => {
      const index = this.cargoModel.findIndex(r => r.id === actualizado.id);
      if (index === -1) { return; }
      this.cargoModel[index] = actualizado;
      this.gridApi?.getRowNode(index.toString())?.setData(actualizado);
    });
  }

  viewCargo(registro: any): void {
    if (this._seguridadService.isexpired()) { return; }
    this.abrirModalCargo(registro, 'view');
  }

  /** Quita la fila de la grilla con una transacción. */
  deleteCargo(registro: any): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.modal.open(DeleteCargoComponent, {
      centered: true,
      size: 'md',
      backdrop: 'static',
      keyboard: true
    });
    modalRef.componentInstance.registro_selected = registro;

    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, () => {
      const index = this.cargoModel.findIndex(r => r.id === registro.id);
      if (index === -1) { return; }
      this.cargoModel.splice(index, 1);
      this.totalRegistros = Math.max(0, this.totalRegistros - 1);
      this.gridApi?.applyTransaction({ remove: [registro] });
      if (this.selectedRow?.id === registro.id) { this.selectedRow = null; }
    });
  }

  /** Historial de auditoría de la fila seleccionada (tabla cargos). */
  auditoria(): void {
    if (!this.selectedRow) { return; }
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.modal.open(AuditoriaModalComponent, {
      centered: true,
      size: "xl",
      backdrop: "static",
      keyboard: true
    });
    modalRef.componentInstance.tablaNombre = 'cargos';
    modalRef.componentInstance.registroId = this.selectedRow.id;
  }
}

// ================================================================
// RENDERER DE LA COLUMNA ACCIONES
// ================================================================
// Simple delegador: toda la lógica de modales vive en AllCargosComponent.
@Component({
  selector: 'app-button-accion-cargo',
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
        (view)="parent.viewCargo(params.data)"
        (edit)="parent.editCargo(params.data)"
        (clone)="parent.clonCargo(params.data)"
        (delete)="parent.deleteCargo(params.data)">
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
export class ButtonAccionCargo implements ICellRendererAngularComp {
  public params: any;

  constructor(public parent: AllCargosComponent) { }

  agInit(params: any): void { this.params = params; }

  refresh(params: any): boolean { this.params = params; return true; }
}
