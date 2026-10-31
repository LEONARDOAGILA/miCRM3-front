import { Component, Input, OnInit, ViewChild, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { GridApi, GridReadyEvent, CellClickedEvent, CellKeyDownEvent, RowClassParams } from 'ag-grid-community';

import { HorarioEmpleadoService } from '../../../services/horarioEmpleado.service';
import { AppAgGridService } from '../../../../../service/app-agGrid.service';
import { LoadingService } from '../../../../../service/loading.service';
import { CampoBusquedaPaginacionComponent } from '../../../../../components/campos/campoBusquedaPaginacion/campoBusquedaPaginacion.component';
import { CommonModule } from '@angular/common';
import { AgGridModule } from 'ag-grid-angular';
import { ModalArrastrableDirective } from '../../../../../components/modal/modal-arrastrable.directive';
import { FilasEstirablesDirective } from '../../../../../core/directives/filasEstirables.directive';

/**
 * Modal de selección de horario de trabajo (rh.horarios_empleados).
 *
 * Grilla ag-Grid con paginación en servidor y buscador. Al pulsar cualquier
 * celda de una fila se emite ese horario por `seleccionado` y se cierra el
 * modal; la columna "Ir" queda como pista visual de que la fila es pulsable.
 *
 * Además marca el horario que el usuario ya tiene asignado
 * (horarioSeleccionadoId) con una barra lateral y la etiqueta «Actual».
 *
 * Memoria: no hay suscripciones vivas (las peticiones van con
 * firstValueFrom, que completa sola) ni temporizadores ni listeners
 * nativos, así que no hace falta ngOnDestroy. Quien abre el modal es el
 * responsable de cortar su suscripción a `seleccionado` (saveUser lo hace
 * con takeUntil al cerrarse el modal).
 */
@Component({
  selector: 'app-listHorariosEmpleados',
  templateUrl: './listHorariosEmpleados.component.html',
  styleUrls: ['./listHorariosEmpleados.component.css'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    CommonModule, AgGridModule, FilasEstirablesDirective, ModalArrastrableDirective,
    CampoBusquedaPaginacionComponent,
  ],
})
export class ListHorariosEmpleadosComponent implements OnInit {

  /** Horario ya asignado al usuario, para marcarlo como «Actual» en la grilla. */
  @Input() horarioSeleccionadoId?: number;

  /**
   * La pista de arriba. La pone quien abre el modal, porque lo que se está
   * eligiendo cambia según desde dónde se abra.
   */
  @Input() ayuda = 'Haz clic sobre un horario para elegirlo. Los inactivos no se pueden asignar.';

  /** Horario elegido. Se emite una sola vez, justo antes de cerrar. */
  @Output() seleccionado = new EventEmitter<any>();

  // ---------- ag-Grid ----------
  public gridApi!: GridApi;
  public columnDefs: any[] = [];
  /** Filas de la página actual. */
  public rowData: any[] = [];

  /** Clase para la fila del horario ya asignado (estilo en el .css). */
  public rowClassRules = {
    'fila-actual': (params: RowClassParams) =>
      this.horarioSeleccionadoId != null && params.data?.id === this.horarioSeleccionadoId
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
    private _horarioService: HorarioEmpleadoService,
    public _appAgGridService: AppAgGridService,
    private _loadingService: LoadingService
  ) {}

  ngOnInit(): void {
    this.initializeGrid();
    this.cargarHorarios();
  }

  /** Primer registro mostrado; 0 sin resultados (antes decía "1 - 0 de 0"). */
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
        headerName: 'Horario',
        field: 'nombre',
        cellStyle: { textAlign: 'left' },
        minWidth: 180,
        maxWidth: 300,
        // El horario ya asignado lleva la etiqueta «Actual» junto al nombre
        cellRenderer: (params: any) =>
          params.data?.id === this.horarioSeleccionadoId
            ? `${params.value ?? ''} <span class="lista-actual">Actual</span>`
            : (params.value ?? '')
      },
      {
        // El cuadro de la semana: sin esto, dos horarios con nombres
        // parecidos no se distinguen desde aquí.
        headerName: 'Semana',
        field: 'jornadas',
        minWidth: 180,
        maxWidth: 200,
        sortable: false,
        filter: false,
        cellStyle: { textAlign: 'center' },
        cellRenderer: (params: any) => {
          const jornadas = (params.value ?? []) as any[];
          const letras = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
          const nombres = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
          return '<span class="semana">' + letras.map((letra, i) => {
            const delDia = jornadas.filter(j => j.dia === i + 1 && j.activo !== false);
            if (!delDia.length) {
              return `<span class="semana-dia semana-dia--libre" title="${nombres[i]}: libre">${letra}</span>`;
            }
            const horas = delDia
              .sort((a, b) => (a.jornada ?? 0) - (b.jornada ?? 0))
              .map(j => `${j.hora_inicio}-${j.hora_fin}`)
              .join(' · ');
            const cuantas = delDia.length > 1 ? `<sup>${delDia.length}</sup>` : '';
            return `<span class="semana-dia semana-dia--trabaja" title="${nombres[i]}: ${horas}">${letra}${cuantas}</span>`;
          }).join('') + '</span>';
        }
      },
      {
        headerName: 'Horas',
        field: 'horas_semana',
        cellStyle: { textAlign: 'right' },
        minWidth: 90,
        maxWidth: 100,
        valueFormatter: (p: any) => (p.value ?? 0) + ' h',
      },
      {
        headerName: 'Tolerancia',
        field: 'tolerancia_min',
        headerTooltip: 'Minutos de gracia antes de contar atraso',
        cellStyle: { textAlign: 'center' },
        minWidth: 100,
        maxWidth: 110,
        valueFormatter: (p: any) => (p.value ?? 0) + ' min',
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
        suppressHeaderMenuButton: true,
        cellRenderer: () =>
          `<span class="lista-ir" title="Elegir este horario">
             <i class="fas fa-arrow-right"></i>
           </span>`
      }
    ];
  }

  onGridReady(params: GridReadyEvent): void {
    this.gridApi = params.api;
    this._appAgGridService.ajustarTamanoGrid(this.gridApi);
  }

  /**
   * Un clic en cualquier celda elige la fila: emite el horario y cierra.
   * Antes había que acertar en el botón de la columna "Ir".
   */
  /** ↑ / ↓ seleccionan la fila como un clic (ver AppAgGridService.navegacionConFlechas). */
  navegarConTeclado = this._appAgGridService.navegacionConFlechas();

  /** Enter sobre la fila enfocada = elegirla (igual que el clic). */
  onCellKeyDown(event: CellKeyDownEvent): void {
    if ((event.event as KeyboardEvent)?.key === 'Enter') { this.onCellClicked(event as unknown as CellClickedEvent); }
  }

  onCellClicked(event: CellClickedEvent): void {
    if (!event.data) { return; }
    this.seleccionado.emit(event.data);
    this.modal.close(event.data);
  }

  // ================================================================
  // DATOS
  // ================================================================

  /** Pide una página al servidor y actualiza grilla y contadores. */
  async cargarHorarios(page: number = 1) {
    try {
      this._loadingService.setLoading(true);
      const res = await firstValueFrom(
        this._horarioService.listHorarios(page, this.registrosPorPagina, this.searchTerm)
      );

      this.rowData = res.body?.data?.data || [];

      if (res.body?.data?.meta) {
        this.totalRegistros = res.body.data.meta.total;
        this.registrosPorPagina = res.body.data.meta.per_page;
        this.paginaActual = res.body.data.meta.current_page;
        this.ultimaPagina = res.body.data.meta.last_page;
      }

      if (this.gridApi) {
        this.gridApi.setGridOption('rowData', this.rowData);
      }
    } catch (error) {
      // El AuthInterceptor ya muestra el toast del error HTTP
      console.error('Error al cargar horarios:', error);
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
    await this.cargarHorarios(1);
  }

  limpiarBusqueda() {
    this.searchTerm = '';
    this.paginaActual = 1;
    this.campoBusquedaPaginacion?.reset();
    this.cargarHorarios(1);
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
    this.cargarHorarios(page);
  }

  nextPage(): void {
    this.goToPage(this.paginaActual + 1);
  }

  prevPage(): void {
    this.goToPage(this.paginaActual - 1);
  }
}
