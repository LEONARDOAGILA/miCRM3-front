import { Component, Input, OnInit, ViewChild, Output, EventEmitter } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { GridApi, GridReadyEvent, CellClickedEvent, CellKeyDownEvent, RowClassParams } from 'ag-grid-community';

import { UserService } from '../../../services/user.service';
import { AppAgGridService } from '../../../../../service/app-agGrid.service';
import { LoadingService } from '../../../../../service/loading.service';
import { CampoBusquedaPaginacionComponent } from '../../../../../components/campos/campoBusquedaPaginacion/campoBusquedaPaginacion.component';

/**
 * Modal de selección de usuario (mismo esquema que listHorarios).
 *
 * Grilla ag-Grid con paginación en servidor (auth/user/allUsers) y buscador.
 * Al pulsar cualquier celda de una fila se emite ese usuario por
 * `seleccionado` y se cierra el modal; la columna "Ir" es la pista visual.
 *
 * `usuariosExcluidos`: ids que ya no se pueden elegir (por ejemplo, los que
 * ya tienen permiso sobre un archivo): salen atenuados con la etiqueta
 * «Ya está» y el clic no hace nada.
 *
 * Memoria: sin suscripciones vivas (firstValueFrom) ni listeners nativos;
 * quien abre el modal corta su suscripción a `seleccionado` al cerrarse.
 */
@Component({
  selector: 'app-listUsers',
  templateUrl: './listUsers.component.html',
  styleUrls: ['./listUsers.component.css'],
  standalone: false,
})
export class ListUsersComponent implements OnInit {

  /** Usuario ya asignado, para marcarlo como «Actual». */
  @Input() usuarioSeleccionadoId?: number;
  /** Usuarios que no se pueden elegir (ya están en la lista de destino). */
  @Input() usuariosExcluidos: number[] = [];
  /** Texto de la pista bajo el buscador. */
  @Input() ayuda = 'Haz clic sobre un usuario para elegirlo.';

  /** Usuario elegido. Se emite una sola vez, justo antes de cerrar. */
  @Output() seleccionado = new EventEmitter<any>();

  // ---------- ag-Grid ----------
  public gridApi!: GridApi;
  public columnDefs: any[] = [];
  public rowData: any[] = [];

  public rowClassRules = {
    'fila-actual':   (p: RowClassParams) => this.usuarioSeleccionadoId != null && p.data?.id === this.usuarioSeleccionadoId,
    'fila-excluida': (p: RowClassParams) => this.estaExcluido(p.data?.id),
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

  /** Tipos de usuario (seguridad.users.type_user), para la columna Tipo. */
  private readonly TIPOS: { [k: number]: { texto: string; clase: string } } = {
    1: { texto: 'Super',   clase: 'bg-danger' },
    2: { texto: 'Admin',   clase: 'bg-warning' },
    3: { texto: 'Sistema', clase: 'bg-primary' },
    4: { texto: 'Web',     clase: 'bg-secondary' },
  };

  constructor(
    public modal: NgbActiveModal,
    private _userService: UserService,
    public _appAgGridService: AppAgGridService,
    private _loadingService: LoadingService
  ) {}

  ngOnInit(): void {
    this.initializeGrid();
    this.cargarUsuarios();
  }

  public get desde(): number {
    return this.totalRegistros === 0 ? 0 : (this.paginaActual - 1) * this.registrosPorPagina + 1;
  }

  public get hasta(): number {
    return Math.min(this.paginaActual * this.registrosPorPagina, this.totalRegistros);
  }

  private estaExcluido(id: number | undefined): boolean {
    return id != null && this.usuariosExcluidos.includes(id);
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
        headerName: 'Login',
        field: 'login_user',
        cellStyle: { textAlign: 'left' },
        minWidth: 120,
        maxWidth: 160,
        // El usuario ya asignado lleva «Actual»; los que no se pueden elegir, «Ya está»
        cellRenderer: (params: any) => {
          const login = params.value ?? '';
          if (params.data?.id === this.usuarioSeleccionadoId) { return `${login} <span class="lista-actual">Actual</span>`; }
          if (this.estaExcluido(params.data?.id)) { return `${login} <span class="lista-actual lista-actual--gris">Ya está</span>`; }
          return login;
        }
      },
      {
        headerName: 'Nombre',
        cellStyle: { textAlign: 'left' },
        minWidth: 180,
        valueGetter: (p: any) => `${p.data?.name ?? ''} ${p.data?.surname ?? ''}`.trim(),
      },
      {
        headerName: 'Correo',
        field: 'email',
        cellStyle: { textAlign: 'left' },
        minWidth: 160,
      },
      {
        headerName: 'Tipo',
        field: 'type_user',
        cellStyle: { display: 'flex', justifyContent: 'center', alignItems: 'center' },
        minWidth: 90,
        maxWidth: 90,
        cellRenderer: (params: any) => {
          const t = this.TIPOS[params.value] ?? { texto: params.value ?? '', clase: 'bg-secondary' };
          return `<span class="badge ${t.clase} fs-10px">${t.texto}</span>`;
        }
      },
      {
        headerName: 'Activo',
        field: 'isactive',
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
        cellRenderer: (params: any) => this.estaExcluido(params.data?.id)
          ? ''
          : `<span class="lista-ir" title="Elegir este usuario"><i class="fas fa-arrow-right"></i></span>`
      }
    ];
  }

  onGridReady(params: GridReadyEvent): void {
    this.gridApi = params.api;
    this._appAgGridService.ajustarTamanoGrid(this.gridApi);
  }

  /** Un clic en cualquier celda elige la fila (salvo excluidas): emite el usuario y cierra. */
  /** ↑ / ↓ seleccionan la fila como un clic (ver AppAgGridService.navegacionConFlechas). */
  navegarConTeclado = this._appAgGridService.navegacionConFlechas();

  /** Enter sobre la fila enfocada = elegirla (igual que el clic). */
  onCellKeyDown(event: CellKeyDownEvent): void {
    if ((event.event as KeyboardEvent)?.key === 'Enter') { this.onCellClicked(event as unknown as CellClickedEvent); }
  }

  onCellClicked(event: CellClickedEvent): void {
    if (!event.data || this.estaExcluido(event.data.id)) { return; }
    this.seleccionado.emit(event.data);
    this.modal.close(event.data);
  }

  // ================================================================
  // DATOS
  // ================================================================

  async cargarUsuarios(page: number = 1) {
    try {
      this._loadingService.setLoading(true);
      const res = await firstValueFrom(
        this._userService.allUsers(page, this.registrosPorPagina, this.searchTerm)
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
      console.error('Error al cargar usuarios:', error);
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  // ================================================================
  // BÚSQUEDA
  // ================================================================

  async onSearch(term?: string) {
    if (term !== undefined) this.searchTerm = term;
    this.paginaActual = 1;
    await this.cargarUsuarios(1);
  }

  limpiarBusqueda() {
    this.searchTerm = '';
    this.paginaActual = 1;
    this.campoBusquedaPaginacion?.reset();
    this.cargarUsuarios(1);
  }

  // ================================================================
  // PAGINACIÓN
  // ================================================================

  firstPage(): void { if (this.paginaActual !== 1) { this.goToPage(1); } }
  lastPage(): void { if (this.paginaActual !== this.ultimaPagina) { this.goToPage(this.ultimaPagina); } }

  goToPage(page: number): void {
    if (page < 1 || page > this.ultimaPagina) return;
    this.paginaActual = page;
    this.cargarUsuarios(page);
  }

  nextPage(): void { this.goToPage(this.paginaActual + 1); }
  prevPage(): void { this.goToPage(this.paginaActual - 1); }
}
