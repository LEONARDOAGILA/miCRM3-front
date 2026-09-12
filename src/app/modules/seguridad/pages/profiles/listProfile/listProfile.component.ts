import { Component, Input, OnInit, Output, EventEmitter, ViewChild } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { GridApi, GridReadyEvent, CellClickedEvent, RowClassParams } from 'ag-grid-community';

import { ProfileService } from '../../../../seguridad/services/profile.service';
import { AppAgGridService } from '../../../../../service/app-agGrid.service';
import { LoadingService } from '../../../../../service/loading.service';
import { CampoBusquedaPaginacionComponent } from '../../../../../components/campos/campoBusquedaPaginacion/campoBusquedaPaginacion.component';

/**
 * Modal de selección de perfil (lo abre saveUser para el campo "Perfil").
 *
 * Mismo esquema que listHorarios: grilla ag-Grid con paginación en servidor
 * y buscador. Al pulsar cualquier celda de una fila se emite ese perfil por
 * `seleccionado` y se cierra el modal; la columna "Ir" queda como pista
 * visual de que la fila es pulsable.
 *
 * Además marca el perfil que el usuario ya tiene asignado
 * (perfilSeleccionadoId) con una barra lateral y la etiqueta «Actual».
 *
 * Memoria: no hay suscripciones vivas (las peticiones van con
 * firstValueFrom, que completa sola) ni temporizadores ni listeners
 * nativos, así que no hace falta ngOnDestroy. Quien abre el modal es el
 * responsable de cortar su suscripción a `seleccionado` (saveUser lo hace
 * con takeUntil al cerrarse el modal).
 */
@Component({
  selector: 'app-listProfile',
  templateUrl: './listProfile.component.html',
  styleUrls: ['./listProfile.component.css'],
  standalone: false,
})
export class ListProfileComponent implements OnInit {

  /** Perfil ya asignado al usuario, para marcarlo como «Actual» en la grilla. */
  @Input() perfilSeleccionadoId?: number;

  /** Perfil elegido. Se emite una sola vez, justo antes de cerrar. */
  @Output() seleccionado = new EventEmitter<any>();

  // ---------- ag-Grid ----------
  public gridApi!: GridApi;
  public columnDefs: any[] = [];
  /** Filas de la página actual. */
  public rowData: any[] = [];

  /** Clase para la fila del perfil ya asignado (estilo en el .css). */
  public rowClassRules = {
    'fila-actual': (params: RowClassParams) =>
      this.perfilSeleccionadoId != null && params.data?.id === this.perfilSeleccionadoId
  };

  // ---------- Búsqueda ----------
  @ViewChild(CampoBusquedaPaginacionComponent) campoBusquedaPaginacion!: CampoBusquedaPaginacionComponent;
  /** Filtro vigente; viaja al servidor en cada página. */
  public searchTerm: string = '';

  // ---------- Paginación en servidor ----------
  public paginaActual: number = 1;
  public totalRegistros: number = 0;
  public registrosPorPagina: number = 5;
  public ultimaPagina: number = 1;

  public isLoading$ = this._loadingService.isLoading$;

  constructor(
    public modal: NgbActiveModal,
    private _profileService: ProfileService,
    public _appAgGridService: AppAgGridService,
    private _loadingService: LoadingService
  ) {}

  ngOnInit(): void {
    this.initializeGrid();
    this.cargarPerfiles();
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
        headerName: 'ID',
        field: 'id',
        cellStyle: { textAlign: 'center' },
        minWidth: 70,
        maxWidth: 70,
      },
      {
        headerName: 'Nombre',
        field: 'nombre',
        cellStyle: { textAlign: 'left' },
        minWidth: 160,
        // El perfil ya asignado lleva la etiqueta «Actual» junto al nombre
        cellRenderer: (params: any) =>
          params.data?.id === this.perfilSeleccionadoId
            ? `${params.value ?? ''} <span class="lista-actual">Actual</span>`
            : (params.value ?? '')
      },
      {
        headerName: 'Inactividad',
        field: 'inactividad',
        headerTooltip: 'Minutos sin actividad antes de cerrar la sesión',
        cellStyle: { textAlign: 'center' },
        minWidth: 110,
        maxWidth: 130,
        // Sólo el número no decía nada: se le pone la unidad
        cellRenderer: (params: any) => params.value != null ? `${params.value} min` : ''
      },
      // Columna "Ir": sólo indica que la fila se puede elegir. La selección
      // real la hace onCellClicked sobre cualquier celda.
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
        cellRenderer: () =>
          `<span class="lista-ir" title="Elegir este perfil">
             <i class="fas fa-arrow-right"></i>
           </span>`
      }
    ];
  }

  onGridReady(params: GridReadyEvent): void {
    this.gridApi = params.api;
    this._appAgGridService.ajustarTamanoGrid(this.gridApi);
  }

  /** Un clic en cualquier celda elige la fila: emite el perfil y cierra. */
  onCellClicked(event: CellClickedEvent): void {
    if (!event.data) { return; }
    this.seleccionado.emit(event.data);
    this.modal.close(event.data);
  }

  // ================================================================
  // DATOS
  // ================================================================

  /** Pide una página al servidor y actualiza grilla y contadores. */
  async cargarPerfiles(page: number = 1) {
    try {
      this._loadingService.setLoading(true);
      const res = await firstValueFrom(
        this._profileService.listProfiles(page, this.registrosPorPagina, this.searchTerm)
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
      // El AuthInterceptor ya muestra el toast del error HTTP
      console.error('Error al cargar perfiles:', error);
      this.rowData = [];
      this.totalRegistros = 0;
      this.ultimaPagina = 1;
      this.gridApi?.setRowData([]);
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  // ================================================================
  // BÚSQUEDA
  // ================================================================

  /** Nuevo filtro → siempre desde la página 1, o podría caer fuera de rango. */
  async onSearch(term?: string) {
    if (term !== undefined) this.searchTerm = term;
    this.paginaActual = 1;
    await this.cargarPerfiles(1);
  }

  limpiarBusqueda() {
    this.searchTerm = '';
    this.paginaActual = 1;
    this.campoBusquedaPaginacion?.reset();
    this.cargarPerfiles(1);
  }

  // ================================================================
  // PAGINACIÓN
  // ================================================================
  // Todas pasan por goToPage(), que es la única que valida el rango.

  firstPage(): void {
    if (this.paginaActual !== 1) {
      this.goToPage(1);
    }
  }

  lastPage(): void {
    if (this.paginaActual !== this.ultimaPagina) {
      this.goToPage(this.ultimaPagina);
    }
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.ultimaPagina) return;
    this.paginaActual = page;
    this.cargarPerfiles(page);
  }

  nextPage(): void {
    this.goToPage(this.paginaActual + 1);
  }

  prevPage(): void {
    this.goToPage(this.paginaActual - 1);
  }
}
