import { Component, ElementRef, EventEmitter, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, firstValueFrom, from, merge, of } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';
import { CellClickedEvent, GridApi, GridReadyEvent } from 'ag-grid-community';
import { ICellRendererAngularComp } from 'ag-grid-angular';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';

///   SERVICIOS   ///
import { SeguridadService } from '../../../../seguridad/services/seguridad.service';
import { MarcacionService } from '../../../services/marcacion.service';
import { AppPrintPdfService } from '../../../../../service/app-printPdf.service';
import { AppExportExcelService } from '../../../../../service/app-exportExcel.service';
import { AppExportCsvService } from '../../../../../service/app-exportCsv.service';
import { AppAgGridService } from '../../../../../service/app-agGrid.service';
import { LoadingService } from '../../../../../service/loading.service';

///   MODELOS   ///
import { MarcacionModel, ORIGENES_MARCACION, ResumenDia, TIPOS_MARCACION } from '../../../interfaces/marcacionModel';
import { AccesoModel } from '../../../../seguridad/interfaces/accesoModel';

///   COMPONENTES   ///
import { SaveMarcacionComponent } from '../saveMarcacion/saveMarcacion.component';
import { DeleteMarcacionComponent } from '../deleteMarcacion/deleteMarcacion.component';
import { ListEmpleadosComponent } from '../../empleados/listEmpleados/listEmpleados.component';
import { AuditoriaModalComponent } from '../../../../../components/auditoria-modal/auditoria-modal.component';
import { CampoBusquedaPaginacionComponent } from '../../../../../components/campos/campoBusquedaPaginacion/campoBusquedaPaginacion.component';

/**
 * Listado de marcaciones (entradas y salidas).
 *
 * Grilla con paginación en servidor y filtros de fecha, empleado, tipo y
 * origen. Desde aquí se corrigen (hora, tipo, observación), se añaden a mano
 * las que falten y se ve el resumen de horas por empleado y día.
 */
@Component({
  selector: 'app-allMarcaciones',
  templateUrl: './allMarcaciones.component.html',
  styleUrls: ['./allMarcaciones.component.css'],
  standalone: false,
})
export class AllMarcacionesComponent implements OnInit, OnDestroy {

  public accesoModel: AccesoModel;
  public titulo = 'Marcaciones';
  public isLoading$ = this._loadingService.isLoading$;

  public marcaciones: MarcacionModel[] = [];
  public selectedRow: MarcacionModel | null = null;
  public accionesPlegadas = false;

  // ---------- Filtros ----------
  public desde = this.hoyIso();
  public hasta = this.hoyIso();
  public empleadoId: number | null = null;
  public empleadoNombre = '';
  public tipo: string | null = null;
  public origen: string | null = null;
  public searchTerm = '';
  public tipos = TIPOS_MARCACION;
  public origenes = ORIGENES_MARCACION;

  // ---------- Resumen ----------
  public resumen: ResumenDia[] = [];
  public totalesResumen: { empleados: number; dias: number; horas: number } | null = null;
  public verResumen = false;

  // ---------- Paginación ----------
  public paginaActual = 1;
  public totalRegistros = 0;
  public registrosPorPagina = 15;
  public ultimaPagina = 1;

  // ---------- ag-Grid ----------
  public gridApi!: GridApi;
  public columnDefs: any[] = [];

  @ViewChild(CampoBusquedaPaginacionComponent) campoBusqueda?: CampoBusquedaPaginacionComponent;

  private readonly unsubscribe$ = new Subject<void>();
  private timeoutIds = new Set<any>();
  private resizeTimeoutId: any;
  private headerElement: Element | null = null;
  private readonly onHeaderClick: EventListener = () => this.toggleActionsColumn();

  constructor(
    private host: ElementRef<HTMLElement>,
    private modal: NgbModal,
    private router: Router,
    private activeRoute: ActivatedRoute,
    private _appPrintPdfService: AppPrintPdfService,
    private _appExportExcelService: AppExportExcelService,
    private _appExportCsvService: AppExportCsvService,
    public _appAgGridService: AppAgGridService,
    private _loadingService: LoadingService,
    private _toastr: ToastrService,
    private _seguridadService: SeguridadService,
    private _marcacionService: MarcacionService,
  ) {
    this.accesoModel = this.activeRoute.snapshot.data['access'];
  }

  ngOnInit(): void {
    this.initializeGrid();
    this.allMarcaciones();
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

  private programar(fn: () => void, ms: number): void {
    const id = setTimeout(() => { this.timeoutIds.delete(id); fn(); }, ms);
    this.timeoutIds.add(id);
  }

  private escucharModal<T>(modalRef: NgbModalRef, salida: EventEmitter<T>, alEmitir: (v: T) => void): void {
    const cerrado$ = from(modalRef.result).pipe(catchError(() => of(null)));
    salida.pipe(takeUntil(merge(this.unsubscribe$, cerrado$)))
      .subscribe({ next: alEmitir, error: (e) => console.error('Error en el modal:', e) });
  }

  fun_home(): void { this.router.navigate(['/rh']); }

  private hoyIso(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // ================================================================
  // GRILLA
  // ================================================================

  initializeGrid(): void {
    this.columnDefs = [
      { headerName: 'Fecha', field: 'fecha', minWidth: 110, maxWidth: 120, cellStyle: { textAlign: 'center' } },
      { headerName: 'Hora',  field: 'hora',  minWidth: 100, maxWidth: 110, cellStyle: { textAlign: 'center' } },
      {
        headerName: 'Empleado', field: 'empleado', minWidth: 200, maxWidth: 320, cellStyle: { textAlign: 'left' },
        cellRenderer: (p: any) => {
          const id = p.data?.empleado_id;
          const img = p.data?.empleado_foto
            ? `<img src="${this._marcacionService.getImagenMarcacion(p.data.id)}" class="mar-avatar" alt="" onerror="this.style.display='none'">`
            : `<span class="mar-avatar mar-avatar--vacio"><i class="fa fa-user"></i></span>`;
          return `<span class="mar-empleado" title="Empleado #${id}">${img}<span>${this.escapar(p.value ?? '')}</span></span>`;
        },
      },
      { headerName: 'Identificación', field: 'identificacion', minWidth: 120, maxWidth: 140, cellStyle: { textAlign: 'left' } },
      {
        headerName: 'Tipo', field: 'tipo', minWidth: 110, maxWidth: 120, cellStyle: { textAlign: 'center' },
        cellRenderer: (p: any) => `<span class="mar-tipo ${p.value === 'ENTRADA' ? 'is-entrada' : 'is-salida'}">${p.value === 'ENTRADA' ? 'Entrada' : 'Salida'}</span>`,
      },
      {
        headerName: 'Origen', field: 'origen', minWidth: 110, maxWidth: 130, cellStyle: { textAlign: 'center' },
        valueFormatter: (p: any) => this.origenes.find(o => o.id === p.value)?.name ?? p.value,
      },
      {
        headerName: 'Coincidencia', field: 'similitud', minWidth: 110, maxWidth: 120, cellStyle: { textAlign: 'center' },
        valueFormatter: (p: any) => p.value === null || p.value === undefined ? '—' : `${Math.round(p.value)}%`,
      },
      { headerName: 'Departamento', field: 'departamento', minWidth: 140, maxWidth: 220, cellStyle: { textAlign: 'left' } },
      { headerName: 'Dispositivo',  field: 'dispositivo',  minWidth: 130, maxWidth: 200, cellStyle: { textAlign: 'left' } },
      { headerName: 'Observación',  field: 'observacion',  minWidth: 150, maxWidth: 320, cellStyle: { textAlign: 'left' } },
      { headerName: 'Registrado por', field: 'created_by', minWidth: 130, maxWidth: 180, cellStyle: { textAlign: 'left' } },
      {
        headerName: 'ACCIONES', field: 'actions', pinned: 'right',
        minWidth: AllMarcacionesComponent.ANCHO_ABIERTA, maxWidth: AllMarcacionesComponent.ANCHO_ABIERTA,
        cellStyle: { display: 'flex', justifyContent: 'center', alignItems: 'center' },
        cellRenderer: ButtonAccionMarcacion,
        suppressMenu: true, sortable: false, resizable: false,
        headerComponentParams: { template: this.plantillaCabecera(false) },
      },
    ];
  }

  private escapar(s: string): string {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  private static readonly ANCHO_ABIERTA = 110;
  private static readonly ANCHO_PLEGADA = 50;

  private plantillaCabecera(plegada: boolean): string {
    return plegada
      ? `<div style="display:flex;align-items:center;justify-content:center;" title="Mostrar los botones"><i class="fas fa-bars"></i></div>`
      : `<div style="display:flex;align-items:center;justify-content:center;gap:5px;" title="Ocultar los botones"><span>ACCIONES</span><i class="fas fa-arrow-right"></i></div>`;
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
    this.headerElement?.addEventListener('click', this.onHeaderClick);
  }

  private quitarListenersCabecera(): void {
    this.headerElement?.removeEventListener('click', this.onHeaderClick);
    this.headerElement = null;
  }

  toggleActionsColumn(): void {
    const defs = this.gridApi.getColumnDefs() as any[];
    const col = defs.find(c => c.field === 'actions');
    if (!col) { return; }
    this.accionesPlegadas = !this.accionesPlegadas;
    const ancho = this.accionesPlegadas ? AllMarcacionesComponent.ANCHO_PLEGADA : AllMarcacionesComponent.ANCHO_ABIERTA;
    col.minWidth = ancho; col.maxWidth = ancho;
    col.headerComponentParams = { template: this.plantillaCabecera(this.accionesPlegadas) };
    this.gridApi.setColumnDefs(defs);
    this.gridApi.sizeColumnsToFit();
    this.programar(() => { this.gridApi.sizeColumnsToFit(); this.montarListenersCabecera(); }, 100);
  }

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

  ajustarAlturaGrid(): void {
    const el = this.host.nativeElement.querySelector('.ag-theme-alpine') as HTMLElement | null;
    if (!el || !this.gridApi) { return; }
    el.style.height = `${window.innerHeight - el.getBoundingClientRect().top - 60}px`;
    this.gridApi.sizeColumnsToFit();
  }

  navegarConTeclado = this._appAgGridService.navegacionConFlechas((fila: MarcacionModel) => this.selectedRow = fila);

  onCellClicked(e: CellClickedEvent): void { this.selectedRow = e.data; }

  // ================================================================
  // DATOS
  // ================================================================

  async allMarcaciones(page: number = 1): Promise<void> {
    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._marcacionService.allMarcaciones(page, this.registrosPorPagina, this.searchTerm, {
        desde: this.desde || null, hasta: this.hasta || null, empleado_id: this.empleadoId, tipo: this.tipo, origen: this.origen,
      }));
      if (res.body?.status !== 'success') {
        this._toastr.error(res.body?.message || 'No se pudo obtener el listado', 'Marcaciones');
        this.marcaciones = []; this.totalRegistros = 0; this.ultimaPagina = 1;
        this.gridApi?.setRowData(this.marcaciones);
        return;
      }
      this.marcaciones = res.body?.data?.data || [];
      const meta = res.body?.data?.meta;
      if (meta) {
        this.totalRegistros = meta.total;
        this.registrosPorPagina = meta.per_page;
        this.paginaActual = meta.current_page;
        this.ultimaPagina = meta.last_page;
      }
      this.gridApi?.setRowData(this.marcaciones);
      this.selectedRow = null;
      if (this.verResumen) { await this.cargarResumen(); }
    } catch (e) {
      console.error('Error al cargar las marcaciones:', e);
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  async cargarResumen(): Promise<void> {
    try {
      const res: any = await firstValueFrom(this._marcacionService.resumen(this.desde || null, this.hasta || null, this.empleadoId));
      if (res?.status === 'success') {
        this.resumen = res.data?.data ?? [];
        this.totalesResumen = res.data?.totales ?? null;
      }
    } catch (e) {
      console.error('Error al cargar el resumen:', e);
    }
  }

  async alternarResumen(): Promise<void> {
    this.verResumen = !this.verResumen;
    if (this.verResumen) { await this.cargarResumen(); }
    this.programar(() => this.ajustarTamanoGrid(), 50);
  }

  // ---------- Filtros ----------

  aplicarFiltros(): void {
    this.paginaActual = 1;
    this.allMarcaciones(1);
  }

  hoy(): void { this.desde = this.hasta = this.hoyIso(); this.aplicarFiltros(); }

  estaSemana(): void {
    const d = new Date();
    const lunes = new Date(d); lunes.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    this.desde = this.aIso(lunes); this.hasta = this.hoyIso();
    this.aplicarFiltros();
  }

  esteMes(): void {
    const d = new Date();
    this.desde = this.aIso(new Date(d.getFullYear(), d.getMonth(), 1));
    this.hasta = this.hoyIso();
    this.aplicarFiltros();
  }

  private aIso(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  elegirEmpleado(): void {
    const modalRef = this.modal.open(ListEmpleadosComponent, { size: 'lg', centered: true, backdrop: 'static' });
    modalRef.componentInstance.empleadoSeleccionadoId = this.empleadoId;
    this.escucharModal(modalRef, modalRef.componentInstance.seleccionado, (e: any) => {
      this.empleadoId = e.id;
      this.empleadoNombre = e.nombre_completo || `${e.nombres} ${e.apellidos}`;
      this.aplicarFiltros();
    });
  }

  limpiarEmpleado(): void { this.empleadoId = null; this.empleadoNombre = ''; this.aplicarFiltros(); }

  onFilterTextBoxChanged(term?: string): void {
    if (term !== undefined) { this.searchTerm = term; }
    this.aplicarFiltros();
  }

  clearAllFilters(): void {
    this.campoBusqueda?.reset();
    this.searchTerm = '';
    this.tipo = null;
    this.origen = null;
    this.limpiarEmpleado();
    this.hoy();
  }

  // ---------- Paginación ----------
  get desdeRegistro(): number { return this.totalRegistros === 0 ? 0 : (this.paginaActual - 1) * this.registrosPorPagina + 1; }
  get hastaRegistro(): number { return Math.min(this.paginaActual * this.registrosPorPagina, this.totalRegistros); }
  goToPage(p: number): void { if (p >= 1 && p <= this.ultimaPagina) { this.allMarcaciones(p); } }
  firstPage(): void { this.goToPage(1); }
  prevPage(): void { this.goToPage(this.paginaActual - 1); }
  nextPage(): void { this.goToPage(this.paginaActual + 1); }
  ultimaPagina2(): void { this.goToPage(this.ultimaPagina); }

  // ================================================================
  // ACCIONES
  // ================================================================

  irAlKiosco(): void { this.router.navigate(['/rh/kioscoMarcacion']); }

  addMarcacion(): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.modal.open(SaveMarcacionComponent, { centered: true, size: 'lg', backdrop: 'static', keyboard: false });
    modalRef.componentInstance.accion = 'add';
    modalRef.componentInstance.registro_selected = 0;
    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, () => this.allMarcaciones(this.paginaActual));
  }

  editMarcacion(registro: MarcacionModel): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.modal.open(SaveMarcacionComponent, { centered: true, size: 'lg', backdrop: 'static', keyboard: false });
    modalRef.componentInstance.accion = 'edit';
    modalRef.componentInstance.registro_selected = registro;
    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, () => this.allMarcaciones(this.paginaActual));
  }

  viewMarcacion(registro: MarcacionModel): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.modal.open(SaveMarcacionComponent, { centered: true, size: 'lg', backdrop: 'static', keyboard: true });
    modalRef.componentInstance.accion = 'view';
    modalRef.componentInstance.registro_selected = registro;
  }

  deleteMarcacion(registro: MarcacionModel): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.modal.open(DeleteMarcacionComponent, { centered: true, size: 'md', backdrop: 'static', keyboard: true });
    modalRef.componentInstance.registro_selected = registro;
    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, () => this.allMarcaciones(this.paginaActual));
  }

  auditoria(): void {
    if (!this.selectedRow || this._seguridadService.isexpired()) { return; }
    const modalRef = this.modal.open(AuditoriaModalComponent, { centered: true, size: 'xl', backdrop: 'static', keyboard: true });
    modalRef.componentInstance.tablaNombre = 'marcaciones';
    modalRef.componentInstance.registroId = this.selectedRow.id;
  }

  // ================================================================
  // EXPORTAR
  // ================================================================

  private async todasParaExportar(): Promise<MarcacionModel[]> {
    if (!this.totalRegistros) { return []; }
    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._marcacionService.allMarcaciones(1, this.totalRegistros, this.searchTerm, {
        desde: this.desde || null, hasta: this.hasta || null, empleado_id: this.empleadoId, tipo: this.tipo, origen: this.origen,
      }));
      return res.body?.status === 'success' ? (res.body.data?.data ?? []) : [];
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  private filas(m: MarcacionModel[]): any[][] {
    return m.map(x => [x.fecha, x.hora, x.empleado, x.identificacion ?? '', x.tipo === 'ENTRADA' ? 'Entrada' : 'Salida', x.origen, x.similitud ? Math.round(x.similitud) + '%' : '']);
  }

  private get tituloReporte(): string {
    const rango = this.desde === this.hasta ? this.desde : `${this.desde} a ${this.hasta}`;
    return `Marcaciones ${rango}${this.empleadoNombre ? ' · ' + this.empleadoNombre : ''}`;
  }

  private readonly CABECERAS = ['Fecha', 'Hora', 'Empleado', 'Identificación', 'Tipo', 'Origen', 'Coincidencia'];

  async printPdf(): Promise<void> {
    const datos = await this.todasParaExportar();
    if (!datos.length) { this._toastr.info('No hay marcaciones para exportar'); return; }
    this._appPrintPdfService.generarReporte({
      tamanoPapel: 'A4', orientacion: 'l', title: 'Reporte de Marcaciones', titleTable: this.tituloReporte,
      headers: this.CABECERAS, data: this.filas(datos), piePagina: 'Pie de página - Mi Empresa en Desarrollo S.A....',
    });
  }

  async exportExcel(): Promise<void> {
    const datos = await this.todasParaExportar();
    if (!datos.length) { this._toastr.info('No hay marcaciones para exportar'); return; }
    this._appExportExcelService.generarReporteExcel({
      tamanoPapel: 'A4', orientacion: 'l', title: 'Reporte de Marcaciones', titleTable: this.tituloReporte,
      headers: this.CABECERAS, data: this.filas(datos), piePagina: 'Pie de página - Mi Empresa en Desarrollo S.A....',
    });
  }

  async exportCsv(): Promise<void> {
    const datos = await this.todasParaExportar();
    if (!datos.length) { this._toastr.info('No hay marcaciones para exportar'); return; }
    this._appExportCsvService.generarReporteCSV({ headers: this.CABECERAS, data: this.filas(datos) });
  }
}

// ================================================================
// RENDERER DE LA COLUMNA ACCIONES
// ================================================================
@Component({
  selector: 'app-button-accion-marcacion',
  standalone: false,
  template: `
    @if (parent.accionesPlegadas) {
      <button type="button" class="btn btn-sm btn-outline-primary acciones-desplegar" title="Mostrar los botones" (click)="parent.toggleActionsColumn()">
        <i class="fas fa-bars"></i>
      </button>
    } @else {
      <app-action-buttons
        [accesoModel]="parent.accesoModel"
        [buttonView]="true"
        [buttonEdit]="true"
        [buttonDelete]="true"
        (view)="parent.viewMarcacion(params.data)"
        (edit)="parent.editMarcacion(params.data)"
        (delete)="parent.deleteMarcacion(params.data)">
      </app-action-buttons>
    }
  `,
  styles: [`
    .acciones-desplegar { width: 28px; height: 24px; padding: 0; display: inline-flex; align-items: center; justify-content: center; border-radius: .25rem; }
  `],
})
export class ButtonAccionMarcacion implements ICellRendererAngularComp {
  public params: any;
  constructor(public parent: AllMarcacionesComponent) {}
  agInit(params: any): void { this.params = params; }
  refresh(params: any): boolean { this.params = params; return true; }
}
