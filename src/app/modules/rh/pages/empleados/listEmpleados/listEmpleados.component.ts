import { Component, Input, OnInit, ViewChild, Output, EventEmitter } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { GridApi, GridReadyEvent, CellClickedEvent, CellKeyDownEvent, RowClassParams } from 'ag-grid-community';

import { EmpleadoService } from '../../../services/empleado.service';
import { AppAgGridService } from '../../../../../service/app-agGrid.service';
import { LoadingService } from '../../../../../service/loading.service';
import { CampoBusquedaPaginacionComponent } from '../../../../../components/campos/campoBusquedaPaginacion/campoBusquedaPaginacion.component';

/**
 * Modal de selección de empleado (mismo esquema que listUsers / listHorarios):
 * grilla con paginación en servidor y buscador; un clic (o Enter) en una
 * fila emite el empleado por `seleccionado` y cierra. Pensado para el
 * formulario de empleados y cualquier otro que necesite elegir un empleado.
 *
 * `empleadoSeleccionadoId`: el ya asignado, marcado como «Actual».
 * `soloActivos`: si true (por defecto) los inactivos salen atenuados y no
 * se pueden elegir.
 */
@Component({
  selector: 'app-listEmpleados',
  templateUrl: './listEmpleados.component.html',
  styleUrls: ['./listEmpleados.component.css'],
  standalone: false,
})
export class ListEmpleadosComponent implements OnInit {

  @Input() empleadoSeleccionadoId?: number;
  @Input() soloActivos = true;
  @Input() ayuda = 'Haz clic sobre un empleado para elegirlo.';

  @Output() seleccionado = new EventEmitter<any>();

  public gridApi!: GridApi;
  public columnDefs: any[] = [];
  public rowData: any[] = [];

  public rowClassRules = {
    'fila-actual':   (p: RowClassParams) => this.empleadoSeleccionadoId != null && p.data?.id === this.empleadoSeleccionadoId,
    'fila-excluida': (p: RowClassParams) => this.estaExcluido(p.data),
  };

  @ViewChild(CampoBusquedaPaginacionComponent) campoBusquedaPaginacion!: CampoBusquedaPaginacionComponent;
  public searchTerm: string = '';

  public paginaActual: number = 1;
  public totalRegistros: number = 0;
  public registrosPorPagina: number = 5;
  public ultimaPagina: number = 1;

  public isLoading$ = this._loadingService.isLoading$;

  constructor(
    public modal: NgbActiveModal,
    private _empleadoService: EmpleadoService,
    public _appAgGridService: AppAgGridService,
    private _loadingService: LoadingService
  ) {}

  ngOnInit(): void {
    this.initializeGrid();
    this.cargarEmpleados();
  }

  public get desde(): number {
    return this.totalRegistros === 0 ? 0 : (this.paginaActual - 1) * this.registrosPorPagina + 1;
  }

  public get hasta(): number {
    return Math.min(this.paginaActual * this.registrosPorPagina, this.totalRegistros);
  }

  private estaExcluido(empleado: any): boolean {
    return !!empleado && this.soloActivos && empleado.activo === false;
  }

  // ================================================================
  // AG-GRID
  // ================================================================

  initializeGrid(): void {
    this.columnDefs = [
      {
        headerName: 'ID',
        field: 'id',
        cellStyle: { textAlign: 'center' },
        minWidth: 70,
        maxWidth: 70,
      },
      {
        headerName: 'Empleado',
        field: 'nombre_completo',
        cellStyle: { textAlign: 'left' },
        minWidth: 200,
        cellRenderer: (params: any) => {
          const nombre = params.value ?? '';
          if (params.data?.id === this.empleadoSeleccionadoId) { return `${nombre} <span class="lista-actual">Actual</span>`; }
          if (this.estaExcluido(params.data)) { return `${nombre} <span class="lista-actual lista-actual--gris">Inactivo</span>`; }
          return nombre;
        }
      },
      {
        headerName: 'Identificación',
        field: 'numero_identificacion',
        cellStyle: { textAlign: 'center' },
        minWidth: 110,
        maxWidth: 130,
      },
      {
        headerName: 'Cargo',
        field: 'cargo_nombre',
        cellStyle: { textAlign: 'left' },
        minWidth: 140,
      },
      {
        headerName: 'Departamento',
        field: 'departamento_nombre',
        cellStyle: { textAlign: 'left' },
        minWidth: 140,
      },
      {
        headerName: 'Activo',
        field: 'activo',
        cellStyle: { display: 'flex', justifyContent: 'center', alignItems: 'center' },
        minWidth: 80,
        maxWidth: 80,
        cellRenderer: (params: any) => params.value
          ? '<span class="badge bg-teal fs-10px">SÍ</span>'
          : '<span class="badge bg-danger fs-10px">NO</span>'
      },
      {
        headerName: 'Ir',
        field: 'seleccionar',
        pinned: 'right',
        minWidth: 60,
        maxWidth: 60,
        cellStyle: { display: 'flex', justifyContent: 'center', alignItems: 'center' },
        sortable: false,
        resizable: false,
        filter: false,
        suppressMenu: true,
        cellRenderer: (params: any) => this.estaExcluido(params.data)
          ? ''
          : `<span class="lista-ir" title="Elegir este empleado"><i class="fas fa-arrow-right"></i></span>`
      }
    ];
  }

  onGridReady(params: GridReadyEvent): void {
    this.gridApi = params.api;
    this._appAgGridService.ajustarTamanoGrid(this.gridApi);
  }

  /** ↑ / ↓ resaltan la fila; Enter la elige (ver AppAgGridService.navegacionConFlechas). */
  navegarConTeclado = this._appAgGridService.navegacionConFlechas();

  onCellKeyDown(event: CellKeyDownEvent): void {
    if ((event.event as KeyboardEvent)?.key === 'Enter') { this.onCellClicked(event as unknown as CellClickedEvent); }
  }

  /** Un clic en cualquier celda elige la fila (salvo excluidas): emite el empleado y cierra. */
  onCellClicked(event: CellClickedEvent): void {
    if (!event.data || this.estaExcluido(event.data)) { return; }
    this.seleccionado.emit(event.data);
    this.modal.close(event.data);
  }

  // ================================================================
  // DATOS
  // ================================================================

  async cargarEmpleados(page: number = 1) {
    try {
      this._loadingService.setLoading(true);
      const res = await firstValueFrom(
        this._empleadoService.allEmpleados(page, this.registrosPorPagina, this.searchTerm)
      );

      this.rowData = res.body?.data?.data || [];

      if (res.body?.data?.meta) {
        this.totalRegistros = res.body.data.meta.total;
        this.registrosPorPagina = res.body.data.meta.per_page;
        this.paginaActual = res.body.data.meta.current_page;
        this.ultimaPagina = res.body.data.meta.last_page;
      }

      if (this.gridApi) {
        this.gridApi.setRowData(this.rowData);
      }
    } catch (error) {
      console.error('Error al cargar empleados:', error);
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  // ================================================================
  // BÚSQUEDA Y PAGINACIÓN
  // ================================================================

  async onSearch(term?: string) {
    if (term !== undefined) this.searchTerm = term;
    this.paginaActual = 1;
    await this.cargarEmpleados(1);
  }

  limpiarBusqueda() {
    this.searchTerm = '';
    this.paginaActual = 1;
    this.campoBusquedaPaginacion?.reset();
    this.cargarEmpleados(1);
  }

  firstPage(): void { if (this.paginaActual !== 1) { this.goToPage(1); } }
  lastPage(): void { if (this.paginaActual !== this.ultimaPagina) { this.goToPage(this.ultimaPagina); } }

  goToPage(page: number): void {
    if (page < 1 || page > this.ultimaPagina) return;
    this.paginaActual = page;
    this.cargarEmpleados(page);
  }

  nextPage(): void { this.goToPage(this.paginaActual + 1); }
  prevPage(): void { this.goToPage(this.paginaActual - 1); }
}
