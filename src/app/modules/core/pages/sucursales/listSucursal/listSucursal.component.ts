import { Component, Input, OnInit, Output, EventEmitter, ViewChild, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { AgGridModule } from 'ag-grid-angular';
import { GridApi, GridReadyEvent, CellClickedEvent, CellKeyDownEvent, RowClassParams } from 'ag-grid-community';
import { ToastrService } from 'ngx-toastr';

import { SucursalService } from '../../../services/sucursal.service';
import { AppAgGridService } from '../../../../../service/app-agGrid.service';
import { LoadingService } from '../../../../../service/loading.service';
import { CampoBusquedaPaginacionComponent } from '../../../../../components/campos/campoBusquedaPaginacion/campoBusquedaPaginacion.component';
import { ModalArrastrableDirective } from '../../../../../components/modal/modal-arrastrable.directive';
import { FilasEstirablesDirective } from '../../../../../core/directives/filasEstirables.directive';

/**
 * Modal de selección de sucursal (lo abre saveEmpleado para «Sucursal»).
 *
 * Es el mismo esquema que listMarca, el selector de marca de saveProducto:
 * rejilla con paginación en servidor y buscador, y al pulsar cualquier celda
 * de una fila se emite esa sucursal por `seleccionado` y se cierra. La
 * columna «Ir» es sólo la pista de que la fila es pulsable.
 *
 * LAS INACTIVAS SE VEN PERO NO SE PUEDEN ELEGIR. Se podrían esconder, pero
 * entonces quien busca «Matriz» y no la encuentra no sabe si no existe o si
 * está de baja. Se enseñan apagadas y, al pulsarlas, se dice por qué no
 * valen. Aquí el servidor piensa igual: rh.fn_empleados_crear/modificar
 * rechazan una sucursal inactiva o en la papelera.
 *
 * SE ENSEÑA EL PERÍMETRO en su columna porque es lo que decide desde dónde
 * podrá marcar esa persona: elegir entre dos sucursales sin saber cuál tiene
 * perímetro es elegir a ciegas.
 */
@Component({
  selector: 'app-listSucursal',
  standalone: true,
  imports: [CommonModule, AgGridModule, FilasEstirablesDirective, CampoBusquedaPaginacionComponent, ModalArrastrableDirective],
  templateUrl: './listSucursal.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./listSucursal.component.css'],
})
export class ListSucursalComponent implements OnInit {

  /** La sucursal que ya tiene el empleado, para marcarla como «Actual». */
  @Input() sucursalSeleccionadaId?: number | null;

  /** Lo que se dice arriba de la rejilla; cada pantalla pone lo suyo. */
  @Input() ayuda = 'Haz clic sobre una sucursal para elegirla. Las inactivas no se pueden asignar.';

  /** Sucursal elegida. Se emite una sola vez, justo antes de cerrar. */
  @Output() seleccionado = new EventEmitter<any>();

  // ---------- ag-Grid ----------
  public gridApi!: GridApi;
  public columnDefs: any[] = [];
  public rowData: any[] = [];

  /** La fila de la sucursal ya asignada, y las inactivas, con su clase. */
  public rowClassRules = {
    'fila-actual': (p: RowClassParams) =>
      this.sucursalSeleccionadaId != null && p.data?.id === this.sucursalSeleccionadaId,
    'fila-inactiva': (p: RowClassParams) => p.data?.activo === false,
  };

  // ---------- Búsqueda ----------
  @ViewChild(CampoBusquedaPaginacionComponent) campoBusquedaPaginacion!: CampoBusquedaPaginacionComponent;
  public searchTerm: string = '';

  // ---------- Paginación en servidor ----------
  public paginaActual: number = 1;
  public totalRegistros: number = 0;
  public registrosPorPagina: number = 5;
  public ultimaPagina: number = 1;

  public isLoading$ = this._loadingService.isLoading$;

  constructor(
    public modal: NgbActiveModal,
    private _sucursalService: SucursalService,
    private _toastr: ToastrService,
    public _appAgGridService: AppAgGridService,
    private _loadingService: LoadingService,
  ) {}

  ngOnInit(): void {
    this.initializeGrid();
    this.cargarSucursales();
  }

  /** Primer registro mostrado; 0 sin resultados. */
  public get desde(): number {
    return this.totalRegistros === 0 ? 0 : (this.paginaActual - 1) * this.registrosPorPagina + 1;
  }

  /** Último registro mostrado, sin pasarse del total. */
  public get hasta(): number {
    return Math.min(this.paginaActual * this.registrosPorPagina, this.totalRegistros);
  }

  // ================================================================
  // AG-GRID
  // ================================================================

  initializeGrid(): void {
    this.columnDefs = [
      {
        headerName: 'ID', field: 'id',
        cellStyle: { textAlign: 'center' }, minWidth: 70, maxWidth: 70,
      },
      {
        headerName: 'Código', field: 'codigo',
        cellStyle: { textAlign: 'left', fontWeight: '600' }, minWidth: 90, maxWidth: 120,
      },
      {
        headerName: 'Sucursal', field: 'nombre',
        cellStyle: { textAlign: 'left' }, minWidth: 160,
        // La que ya tiene el empleado lleva la etiqueta «Actual»
        cellRenderer: (p: any) =>
          p.data?.id === this.sucursalSeleccionadaId
            ? `${p.value ?? ''} <span class="lista-actual">Actual</span>`
            : (p.value ?? ''),
      },
      {
        headerName: 'Perímetro', field: 'tiene_perimetro',
        headerTooltip: 'Sin perímetro, su gente puede marcar asistencia desde cualquier lugar',
        cellStyle: { textAlign: 'center' }, minWidth: 130, maxWidth: 150,
        sortable: false,
        cellRenderer: (p: any) => {
          if (!p.data?.tiene_perimetro) {
            return '<span class="lista-perim lista-perim--no">Sin perímetro</span>';
          }
          const detalle = p.data?.tipo === 'CIRCULO'
            ? `${Math.round(Number(p.data?.radio_metros ?? 0))} m`
            : `${p.data?.num_vertices} esquinas`;
          return `<span class="lista-perim lista-perim--si">${detalle}</span>`;
        },
      },
      {
        headerName: 'Empleados', field: 'num_empleados',
        headerTooltip: 'Empleados que ya trabajan en esta sucursal',
        cellStyle: { textAlign: 'center' }, minWidth: 90, maxWidth: 110,
      },
      {
        headerName: 'Estado', field: 'activo',
        cellStyle: { textAlign: 'center' }, minWidth: 90, maxWidth: 110,
        sortable: false,
        cellRenderer: (p: any) => p.value
          ? '<span class="badge bg-teal fs-10px">ACTIVA</span>'
          : '<span class="badge bg-danger fs-10px" title="No se puede asignar">INACTIVA</span>',
      },
      // Columna «Ir»: sólo indica que la fila se puede elegir
      {
        headerName: 'Ir', field: 'seleccionar', pinned: 'right',
        minWidth: 60, maxWidth: 60,
        cellStyle: { display: 'flex', justifyContent: 'center', alignItems: 'center' },
        sortable: false, resizable: false, filter: false, suppressHeaderMenuButton: true,
        cellRenderer: (p: any) => p.data?.activo === false
          ? `<span class="lista-ir lista-ir--no" title="Sucursal inactiva: no se puede asignar">
               <i class="fas fa-ban"></i>
             </span>`
          : `<span class="lista-ir" title="Elegir esta sucursal">
               <i class="fas fa-arrow-right"></i>
             </span>`,
      },
    ];
  }

  onGridReady(params: GridReadyEvent): void {
    this.gridApi = params.api;
    this._appAgGridService.ajustarTamanoGrid(this.gridApi);
  }

  /** ↑ / ↓ mueven la selección (ver AppAgGridService.navegacionConFlechas). */
  navegarConTeclado = this._appAgGridService.navegacionConFlechas();

  /** Enter sobre la fila enfocada = elegirla, igual que el clic. */
  onCellKeyDown(event: CellKeyDownEvent): void {
    if ((event.event as KeyboardEvent)?.key === 'Enter') {
      this.onCellClicked(event as unknown as CellClickedEvent);
    }
  }

  /** Un clic en cualquier celda elige la fila: emite la sucursal y cierra. */
  onCellClicked(event: CellClickedEvent): void {
    if (!event.data) { return; }

    if (event.data.activo === false) {
      this._toastr.warning(
        `«${event.data.nombre}» está inactiva: actívela desde Sucursales para poder usarla`,
        'Sucursal no disponible', { timeOut: 4000 });
      return;
    }

    this.seleccionado.emit(event.data);
    this.modal.close(event.data);
  }

  // ================================================================
  // DATOS
  // ================================================================

  /** Pide una página al servidor y actualiza rejilla y contadores. */
  async cargarSucursales(page: number = 1): Promise<void> {
    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(
        this._sucursalService.allSucursales(page, this.registrosPorPagina, this.searchTerm)
      );

      this.rowData = res.body?.data?.data || [];

      if (res.body?.data?.meta) {
        this.totalRegistros = res.body.data.meta.total;
        this.registrosPorPagina = res.body.data.meta.per_page;
        this.paginaActual = res.body.data.meta.current_page;
        this.ultimaPagina = res.body.data.meta.last_page;
      }

      this.gridApi?.setGridOption('rowData', this.rowData);
    } catch (error) {
      // El AuthInterceptor ya muestra el toast del error HTTP
      console.error('Error al cargar sucursales:', error);
      this.rowData = [];
      this.totalRegistros = 0;
      this.ultimaPagina = 1;
      this.gridApi?.setGridOption('rowData', []);
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  // ================================================================
  // BÚSQUEDA
  // ================================================================

  /** Nuevo filtro → siempre desde la página 1, o podría caer fuera de rango. */
  async onSearch(term?: string): Promise<void> {
    if (term !== undefined) { this.searchTerm = term; }
    this.paginaActual = 1;
    await this.cargarSucursales(1);
  }

  limpiarBusqueda(): void {
    this.searchTerm = '';
    this.paginaActual = 1;
    this.campoBusquedaPaginacion?.reset();
    this.cargarSucursales(1);
  }

  // ================================================================
  // PAGINACIÓN
  // ================================================================
  // Todas pasan por goToPage(), que es la única que valida el rango.

  firstPage(): void { if (this.paginaActual !== 1) { this.goToPage(1); } }
  lastPage(): void { if (this.paginaActual !== this.ultimaPagina) { this.goToPage(this.ultimaPagina); } }
  nextPage(): void { this.goToPage(this.paginaActual + 1); }
  prevPage(): void { this.goToPage(this.paginaActual - 1); }

  goToPage(page: number): void {
    if (page < 1 || page > this.ultimaPagina) { return; }
    this.paginaActual = page;
    this.cargarSucursales(page);
  }
}
