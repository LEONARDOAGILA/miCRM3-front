import { Component, Input, OnInit, Output, EventEmitter, ViewChild } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { GridApi, GridReadyEvent, CellClickedEvent, CellKeyDownEvent, RowClassParams } from 'ag-grid-community';
import { ToastrService } from 'ngx-toastr';

import { MarcaService } from '../../../services/marca.service';
import { AppAgGridService } from '../../../../../service/app-agGrid.service';
import { LoadingService } from '../../../../../service/loading.service';
import { CampoBusquedaPaginacionComponent } from '../../../../../components/campos/campoBusquedaPaginacion/campoBusquedaPaginacion.component';

/**
 * Modal de selección de marca (lo abre saveProducto para el campo «Marca»).
 *
 * Es el mismo esquema que listProfile, que abre saveUser para el perfil:
 * rejilla con paginación en servidor y buscador, y al pulsar cualquier celda
 * de una fila se emite esa marca por `seleccionado` y se cierra. La columna
 * «Ir» es sólo la pista de que la fila es pulsable.
 *
 * LAS INACTIVAS SE VEN PERO NO SE PUEDEN ELEGIR. Se podrían esconder, pero
 * entonces quien busca «Samsung» y no la encuentra no sabe si no existe o si
 * está de baja. Se enseñan apagadas y, al pulsarlas, se dice por qué no se
 * pueden usar.
 *
 * Que no se puedan elegir es regla de esta pantalla, no del servidor:
 * fn_productos_validar sólo comprueba que la marca exista. Pero el
 * desplegable que había antes se llenaba con listMarcas(soloActivos = true),
 * así que una marca de baja nunca se pudo asignar aquí y se sigue igual.
 *
 * Memoria: no hay suscripciones vivas (firstValueFrom completa sola), ni
 * temporizadores, ni listeners; quien lo abre corta su suscripción a
 * `seleccionado` cuando el modal se cierra.
 */
@Component({
  selector: 'app-listMarca',
  templateUrl: './listMarca.component.html',
  styleUrls: ['./listMarca.component.css'],
  standalone: false,
})
export class ListMarcaComponent implements OnInit {

  /** Marca ya asignada al producto, para marcarla como «Actual». */
  @Input() marcaSeleccionadaId?: number | null;

  /** Marca elegida. Se emite una sola vez, justo antes de cerrar. */
  @Output() seleccionado = new EventEmitter<any>();

  // ---------- ag-Grid ----------
  public gridApi!: GridApi;
  public columnDefs: any[] = [];
  public rowData: any[] = [];

  /** La fila de la marca ya asignada, y las inactivas, van con su clase. */
  public rowClassRules = {
    'fila-actual': (p: RowClassParams) =>
      this.marcaSeleccionadaId != null && p.data?.id === this.marcaSeleccionadaId,
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
    private _marcaService: MarcaService,
    private _toastr: ToastrService,
    public _appAgGridService: AppAgGridService,
    private _loadingService: LoadingService
  ) {}

  ngOnInit(): void {
    this.initializeGrid();
    this.cargarMarcas();
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
        headerName: 'Marca', field: 'nombre',
        cellStyle: { textAlign: 'left' }, minWidth: 160,
        // La marca que ya tiene el producto lleva la etiqueta «Actual»
        cellRenderer: (p: any) =>
          p.data?.id === this.marcaSeleccionadaId
            ? `${p.value ?? ''} <span class="lista-actual">Actual</span>`
            : (p.value ?? ''),
      },
      {
        headerName: 'País', field: 'pais_origen',
        cellStyle: { textAlign: 'left' }, minWidth: 110, maxWidth: 150,
        valueGetter: (p: any) => p.data?.pais_origen || '—',
      },
      {
        headerName: 'Productos', field: 'num_productos',
        headerTooltip: 'Productos que ya usan esta marca',
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
        sortable: false, resizable: false, filter: false, suppressMenu: true,
        cellRenderer: (p: any) => p.data?.activo === false
          ? `<span class="lista-ir lista-ir--no" title="Marca inactiva: no se puede asignar">
               <i class="fas fa-ban"></i>
             </span>`
          : `<span class="lista-ir" title="Elegir esta marca">
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

  /** Un clic en cualquier celda elige la fila: emite la marca y cierra. */
  onCellClicked(event: CellClickedEvent): void {
    if (!event.data) { return; }

    if (event.data.activo === false) {
      this._toastr.warning(
        `«${event.data.nombre}» está inactiva: actívela desde Marcas para poder usarla`,
        'Marca no disponible', { timeOut: 4000 });
      return;
    }

    this.seleccionado.emit(event.data);
    this.modal.close(event.data);
  }

  // ================================================================
  // DATOS
  // ================================================================

  /** Pide una página al servidor y actualiza rejilla y contadores. */
  async cargarMarcas(page: number = 1) {
    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(
        this._marcaService.allMarcas(page, this.registrosPorPagina, this.searchTerm)
      );

      this.rowData = res.body?.data?.data || [];

      if (res.body?.data?.meta) {
        this.totalRegistros = res.body.data.meta.total;
        this.registrosPorPagina = res.body.data.meta.per_page;
        this.paginaActual = res.body.data.meta.current_page;
        this.ultimaPagina = res.body.data.meta.last_page;
      }

      this.gridApi?.setRowData(this.rowData);
    } catch (error) {
      // El AuthInterceptor ya muestra el toast del error HTTP
      console.error('Error al cargar marcas:', error);
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
    if (term !== undefined) { this.searchTerm = term; }
    this.paginaActual = 1;
    await this.cargarMarcas(1);
  }

  limpiarBusqueda() {
    this.searchTerm = '';
    this.paginaActual = 1;
    this.campoBusquedaPaginacion?.reset();
    this.cargarMarcas(1);
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
    this.cargarMarcas(page);
  }
}
