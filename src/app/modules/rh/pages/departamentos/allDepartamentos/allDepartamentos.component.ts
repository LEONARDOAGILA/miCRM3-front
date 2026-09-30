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
import { DepartamentoService } from '../../../services/departamento.service';
import { AppPrintPdfService } from '../../../../../service/app-printPdf.service';
import { AppExportExcelService } from '../../../../../service/app-exportExcel.service';
import { AppExportCsvService } from '../../../../../service/app-exportCsv.service';
import { AppAgGridService } from '../../../../../service/app-agGrid.service';
import { LoadingService } from '../../../../../service/loading.service';

///   MODELOS    ///
import { DepartamentoModel } from '../../../interfaces/departamentoModel';
import { AccesoModel } from '../../../../seguridad/interfaces/accesoModel';

///   COMPONENTES    ///
import { SaveDepartamentoComponent } from '../saveDepartamento/saveDepartamento.component';
import { DeleteDepartamentoComponent } from '../deleteDepartamento/deleteDepartamento.component';
import { AuditoriaModalComponent } from '../../../../../components/auditoria-modal/auditoria-modal.component';
import { CampoBusquedaPaginacionComponent } from '../../../../../components/campos/campoBusquedaPaginacion/campoBusquedaPaginacion.component';

/**
 * Listado de departamentos (rh.departamentos).
 *
 * Mismo esquema que allUsers: grilla ag-Grid con paginación EN SERVIDOR
 * (rh.fn_departamentos_listar_paginado con página, tamaño y filtro), barra con
 * buscador / nuevo / auditoría, columna ACCIONES plegable y exportaciones
 * que piden el listado completo aparte.
 *
 * Toda la lógica de modales vive aquí; el renderer de ACCIONES
 * (ButtonAccionDepartamento, al final del fichero) sólo delega.
 */
@Component({
  selector: 'app-allDepartamentos',
  templateUrl: './allDepartamentos.component.html',
  styleUrls: ['./allDepartamentos.component.css'],
  standalone: false,
})
export class AllDepartamentosComponent implements OnInit, OnDestroy {

  // ---------- Estado ----------
  /** Permisos del perfil sobre esta pantalla (crear, reporte, auditar…), del resolver de la ruta. */
  public accesoModel: AccesoModel;
  /** Filas de la página actual — NO el listado completo. */
  public departamentoModel: DepartamentoModel[] = [];
  /** Fila marcada en la grilla; habilita el botón de auditoría. */
  public selectedRow: DepartamentoModel | null = null;
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
    private _departamentoService: DepartamentoService,
  ) {
    this.titulo = "Departamentos";
    this.accesoModel = this.activeRoute.snapshot.data.access;
  }

  ngOnInit(): void {
    this.allDepartamentos();
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
        headerName: 'Departamento',
        field: 'nombre',
        cellStyle: { textAlign: 'left', fontWeight: '600' },
        minWidth: 220,
        maxWidth: 400,
      },
      {
        headerName: 'Código',
        field: 'codigo',
        cellStyle: { textAlign: 'center' },
        minWidth: 100,
        maxWidth: 120,
        cellRenderer: (params: any) => params.value
          ? `<span class="badge bg-secondary bg-opacity-25 text-body fs-10px">${params.value}</span>`
          : '',
      },
      {
        headerName: 'Responsable',
        field: 'responsable',
        cellStyle: { textAlign: 'left' },
        minWidth: 180,
        maxWidth: 260,
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
        headerTooltip: 'Empleados del departamento',
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
        cellRenderer: ButtonAccionDepartamento,
        pinned: 'right',
        minWidth: AllDepartamentosComponent.ANCHO_ACCIONES_ABIERTA,
        maxWidth: AllDepartamentosComponent.ANCHO_ACCIONES_ABIERTA,
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

    const estabaPlegada = actionsCol.minWidth === AllDepartamentosComponent.ANCHO_ACCIONES_PLEGADA;
    this.accionesPlegadas = !estabaPlegada;

    const ancho = estabaPlegada ? AllDepartamentosComponent.ANCHO_ACCIONES_ABIERTA : AllDepartamentosComponent.ANCHO_ACCIONES_PLEGADA;
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
  async allDepartamentos(page: number = 1) {
    try {
      this._loadingService.setLoading(true);

      const res = await firstValueFrom(
        this._departamentoService.allDepartamentos(page, this.registrosPorPagina, this.searchTerm)
      ) as any;

      if (res.body?.status !== 'success') {
        this._toastr.error(res.body?.message || 'No se pudo obtener el listado de departamentos', 'Error');
        this.departamentoModel = [];
        this.totalRegistros = 0;
        this.ultimaPagina = 1;
        this.gridApi?.setRowData(this.departamentoModel);
        return;
      }

      this.departamentoModel = res.body?.data?.data || [];

      if (res.body?.data?.meta) {
        this.totalRegistros = res.body.data.meta.total;
        this.registrosPorPagina = res.body.data.meta.per_page;
        this.paginaActual = res.body.data.meta.current_page;
        this.ultimaPagina = res.body.data.meta.last_page;
      }

      if (this.gridApi) this.gridApi.setRowData(this.departamentoModel);
    } catch (error) {
      // El AuthInterceptor ya muestra el toast del error HTTP
      console.error('Error al cargar departamentos:', error);
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  /** Trae TODOS los registros que cumplen el filtro actual, para exportar. */
  private async obtenerTodosParaExportar(): Promise<DepartamentoModel[]> {
    if (this.totalRegistros === 0) { return []; }
    try {
      this._loadingService.setLoading(true);
      const res = await firstValueFrom(
        this._departamentoService.allDepartamentos(1, this.totalRegistros, this.searchTerm)
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
  private filasReporte(departamentos: DepartamentoModel[]): any[][] {
    return departamentos
      .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''))
      .map(item => [
        item.id,
        item.codigo || '',
        item.nombre,
        item.responsable || '',
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
    await this.allDepartamentos(1);
  }

  clearAllFilters() {
    this.campoBusquedaPaginacion?.reset();
    if (this.gridApi) {
      this.gridApi.setFilterModel(null);
      this.searchTerm = '';
      this.gridApi.onFilterChanged();
      this.allDepartamentos(this.paginaActual).then(() => {
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
    this.allDepartamentos(this.paginaActual);
  }

  nextPage(): void { this.goToPage(this.paginaActual + 1); }
  prevPage(): void { this.goToPage(this.paginaActual - 1); }

  // ================================================================
  // IMPRESIÓN Y EXPORTACIÓN (listado completo que cumple el filtro)
  // ================================================================

  private readonly CABECERAS_REPORTE = ['ID', 'Código', 'Departamento', 'Responsable', 'Empleados', 'Estado'];

  private tituloReporte(): string {
    return this.searchTerm ? `Listado de Departamentos (filtro: ${this.searchTerm})` : 'Listado de Departamentos';
  }

  async printPdf() {
    const departamentos = await this.obtenerTodosParaExportar();
    if (departamentos.length === 0) { this._toastr.info('No hay departamentos para exportar'); return; }
    this._appPrintPdfService.generarReporte({
      tamanoPapel: "A4",
      orientacion: "p",
      title: "Reporte de Departamentos",
      titleTable: this.tituloReporte(),
      headers: this.CABECERAS_REPORTE,
      data: this.filasReporte(departamentos),
      piePagina: 'Pie de página - Mi Empresa en Desarrollo S.A....'
    });
  }

  async exportExcel() {
    const departamentos = await this.obtenerTodosParaExportar();
    if (departamentos.length === 0) { this._toastr.info('No hay departamentos para exportar'); return; }
    this._appExportExcelService.generarReporteExcel({
      tamanoPapel: "A4",
      orientacion: "p",
      title: "Reporte de Departamentos",
      titleTable: this.tituloReporte(),
      headers: this.CABECERAS_REPORTE,
      data: this.filasReporte(departamentos),
      piePagina: 'Pie de página - Mi Empresa en Desarrollo S.A....'
    });
  }

  async exportCsv() {
    const departamentos = await this.obtenerTodosParaExportar();
    if (departamentos.length === 0) { this._toastr.info('No hay departamentos para exportar'); return; }
    this._appExportCsvService.generarReporteCSV({
      headers: this.CABECERAS_REPORTE,
      data: this.filasReporte(departamentos),
    });
  }

  // ================================================================
  // ACCIONES (modales)
  // ================================================================

  /** Abre saveDepartamento en el modo pedido. registro = 0 para crear. */
  private abrirModalDepartamento(registro: any, accion: 'add' | 'edit' | 'clon' | 'view'): NgbModalRef {
    const modalRef = this.modal.open(SaveDepartamentoComponent, {
      centered: true,
      size: 'lg',
      backdrop: 'static',
      keyboard: accion === 'view',
    });
    modalRef.componentInstance.registro_selected = registro;
    modalRef.componentInstance.accion = accion;
    return modalRef;
  }

  addDepartamento(): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.abrirModalDepartamento(0, 'add');
    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, (nuevo: any) => {
      this.departamentoModel = [nuevo, ...this.departamentoModel];
      this.totalRegistros++;
      this.gridApi?.setRowData(this.departamentoModel);
    });
  }

  clonDepartamento(registro: any): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.abrirModalDepartamento(registro, 'clon');
    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, (nuevo: any) => {
      this.departamentoModel = [nuevo, ...this.departamentoModel];
      this.totalRegistros++;
      this.gridApi?.setRowData(this.departamentoModel);
    });
  }

  /** Al guardar sustituye la fila en sitio: no hace falta volver al servidor. */
  editDepartamento(registro: any): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.abrirModalDepartamento(registro, 'edit');
    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, (actualizado: any) => {
      const index = this.departamentoModel.findIndex(r => r.id === actualizado.id);
      if (index === -1) { return; }
      this.departamentoModel[index] = actualizado;
      this.gridApi?.getRowNode(index.toString())?.setData(actualizado);
    });
  }

  viewDepartamento(registro: any): void {
    if (this._seguridadService.isexpired()) { return; }
    this.abrirModalDepartamento(registro, 'view');
  }

  /** Quita la fila de la grilla con una transacción. */
  deleteDepartamento(registro: any): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.modal.open(DeleteDepartamentoComponent, {
      centered: true,
      size: 'md',
      backdrop: 'static',
      keyboard: true
    });
    modalRef.componentInstance.registro_selected = registro;

    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, () => {
      const index = this.departamentoModel.findIndex(r => r.id === registro.id);
      if (index === -1) { return; }
      this.departamentoModel.splice(index, 1);
      this.totalRegistros = Math.max(0, this.totalRegistros - 1);
      this.gridApi?.applyTransaction({ remove: [registro] });
      if (this.selectedRow?.id === registro.id) { this.selectedRow = null; }
    });
  }

  /** Historial de auditoría de la fila seleccionada (tabla departamentos). */
  auditoria(): void {
    if (!this.selectedRow) { return; }
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.modal.open(AuditoriaModalComponent, {
      centered: true,
      size: "xl",
      backdrop: "static",
      keyboard: true
    });
    modalRef.componentInstance.tablaNombre = 'departamentos';
    modalRef.componentInstance.registroId = this.selectedRow.id;
  }
}

// ================================================================
// RENDERER DE LA COLUMNA ACCIONES
// ================================================================
// Simple delegador: toda la lógica de modales vive en AllDepartamentosComponent.
@Component({
  selector: 'app-button-accion-departamento',
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
        (view)="parent.viewDepartamento(params.data)"
        (edit)="parent.editDepartamento(params.data)"
        (clone)="parent.clonDepartamento(params.data)"
        (delete)="parent.deleteDepartamento(params.data)">
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
export class ButtonAccionDepartamento implements ICellRendererAngularComp {
  public params: any;

  constructor(public parent: AllDepartamentosComponent) { }

  agInit(params: any): void { this.params = params; }

  refresh(params: any): boolean { this.params = params; return true; }
}
