import { Component, ElementRef, EventEmitter, HostListener, OnDestroy, OnInit, ViewChild, inject, ChangeDetectionStrategy } from '@angular/core';
import { Subject, firstValueFrom, from, merge, of } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';
import { CellClickedEvent, GridApi, GridReadyEvent, IRowNode } from 'ag-grid-community';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { ActivatedRoute, Router } from '@angular/router';
import { ICellRendererAngularComp, AgGridModule } from 'ag-grid-angular';
import { ToastrService } from 'ngx-toastr';

///   SERVICIOS    ///
import { SeguridadService } from '../../../../seguridad/services/seguridad.service';
import { EmpleadoService } from '../../../services/empleado.service';
import { AppPrintPdfService } from '../../../../../service/app-printPdf.service';
import { AppExportExcelService } from '../../../../../service/app-exportExcel.service';
import { AppExportCsvService } from '../../../../../service/app-exportCsv.service';
import { AppAgGridService } from '../../../../../service/app-agGrid.service';
import { AppDescargaService, PeticionDescarga, AccionDescarga }
  from '../../../../../service/app-descarga.service';
import { LoadingService } from '../../../../../service/loading.service';

///   MODELOS    ///
import { EmpleadoModel } from '../../../interfaces/empleadoModel';
import { AccesoModel } from '../../../../seguridad/interfaces/accesoModel';

///   COMPONENTES    ///
import { SaveEmpleadoComponent } from '../saveEmpleado/saveEmpleado.component';
import { DeleteEmpleadoComponent } from '../deleteEmpleado/deleteEmpleado.component';
import { RegistrarRostroComponent } from '../registrarRostro/registrarRostro.component';
import { PapeleraEmpleadosComponent } from '../papeleraEmpleados/papeleraEmpleados.component';
import { MenuContextualComponent, OpcionContextual } from '../../../../../components/menuContextual/menuContextual.component';
import { AuditoriaModalComponent } from '../../../../../components/auditoria-modal/auditoria-modal.component';
import { CampoBusquedaPaginacionComponent } from '../../../../../components/campos/campoBusquedaPaginacion/campoBusquedaPaginacion.component';

import { PanelComponent } from '../../../../../components/panel/panel.component';
import { ActionButtonsComponent } from '../../../../../components/botones/action-buttons/action-buttons.component';
import { FilasEstirablesDirective } from '../../../../../core/directives/filasEstirables.directive';
import { CommonModule } from '@angular/common';

/**
 * Listado de empleados (rh.empleados).
 *
 * Mismo esquema que allUsers: grilla ag-Grid con paginación EN SERVIDOR
 * (rh.fn_empleados_listar_paginado con página, tamaño y filtro), barra con
 * buscador / nuevo / auditoría, columna ACCIONES plegable y exportaciones
 * que piden el listado completo aparte.
 *
 * Toda la lógica de modales vive aquí; el renderer de ACCIONES
 * (ButtonAccionEmpleado, al final del fichero) sólo delega.
 */
@Component({
  selector: 'app-allEmpleados',
  templateUrl: './allEmpleados.component.html',
  styleUrls: ['./allEmpleados.component.css'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    CommonModule,
    AgGridModule,
    FilasEstirablesDirective,
    PanelComponent,
    MenuContextualComponent,
    CampoBusquedaPaginacionComponent
],
})
export class AllEmpleadosComponent implements OnInit, OnDestroy {

  /** Pregunta qué descargar (la página o todo) y trae las filas. */
  private readonly _appDescargaService = inject(AppDescargaService);

  // ---------- Estado ----------
  /** Permisos del perfil sobre esta pantalla (crear, reporte, auditar…), del resolver de la ruta. */
  public accesoModel: AccesoModel;
  /** Filas de la página actual — NO el listado completo. */
  public empleadoModel: EmpleadoModel[] = [];
  /** Fila marcada en la grilla; habilita el botón de auditoría. */
  public selectedRow: EmpleadoModel | null = null;
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
    private _empleadoService: EmpleadoService,
  ) {
    this.titulo = "Empleados";
    this.accesoModel = this.activeRoute.snapshot.data.access;
  }

  ngOnInit(): void {
    this.allEmpleados();
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
  // FILTROS DE LA CABECERA
  // ================================================================
  //
  // Los aplica el SERVIDOR, no la rejilla: esta pantalla pagina, así que
  // ag-Grid sólo tiene las filas de la página y filtrar ahí buscaría dentro
  // de diez. La cabecera sólo recoge lo que el usuario pidió.

  /**
   * Las columnas que llevan filtro, y de qué tipo.
   *
   * Tiene que decir lo mismo que la lista blanca de EmpleadoController y que
   * rh.fn_empleados_listar_paginado: lo que no esté en las tres se tira en el
   * servidor, así que ponerlo sólo aquí sería pintar un filtro que no filtra.
   *
   * `activo` y `foto` se quedan fuera a propósito: una es una casilla —y
   * escribir en un filtro para marcarla no se entiende, para eso está
   * Estado— y la otra es una imagen.
   */
  private readonly COLUMNAS_FILTRABLES: { [campo: string]: 'texto' | 'numero' } = {
    id: 'numero', salario: 'numero',
    numero_identificacion: 'texto', tipo_identificacion: 'texto',
    nombres: 'texto', apellidos: 'texto', nombre_completo: 'texto',
    email: 'texto', celular: 'texto', telefono: 'texto',
    cargo_nombre: 'texto', departamento_nombre: 'texto',
    sucursal_nombre: 'texto', horario_nombre: 'texto', jefe_nombre: 'texto',
    estado: 'texto', tipo_contrato: 'texto',
    created_by: 'texto', updated_by: 'texto',
    // Las fechas, como texto sobre lo que se ve: «2026-10» busca el mes
    fecha_ingreso: 'texto', fecha_salida: 'texto',
    created_at: 'texto', updated_at: 'texto',
  };

  /** Lo que haya pedido la cabecera, tal cual lo da ag-Grid. */
  public filtrosColumna: any = {};

  /** Para no recargar mientras se limpian los filtros de golpe. */
  private limpiando = false;

  /** Las columnas con su filtro de cabecera (el cómo vive en AppAgGridService). */
  private conFiltros(columnas: any[]): any[] {
    return this._appAgGridService.filtrosDeServidor(columnas, this.COLUMNAS_FILTRABLES);
  }

  /** La cabecera pidió otra cosa. Siempre a la página 1. */
  onFiltroColumna(): void {
    if (this.limpiando) { return; }
    this.filtrosColumna = this.gridApi?.getFilterModel() ?? {};
    this.paginaActual = 1;
    this.allEmpleados(1);
  }

  /** Cuántas columnas llevan filtro; el buscador lo enseña y se pone rojo. */
  get cuantasColumnasFiltradas(): number {
    return Object.keys(this.filtrosColumna || {}).length;
  }

  /** Si hay algo que quitar: lo escrito arriba o un filtro de columna. */
  get hayFiltro(): boolean {
    return !!this.searchTerm || this.cuantasColumnasFiltradas > 0;
  }

  clearAllFilters(): void {
    if (!this.hayFiltro) { return; }

    const habiaColumnas = this.cuantasColumnasFiltradas > 0;

    // `limpiando` corta el (filterChanged) que dispara setFilterModel: sin
    // esto se recargaría dos veces, y la primera con los filtros a medias.
    this.limpiando = true;
    this.campoBusquedaPaginacion?.reset();
    this.searchTerm = '';
    this.filtrosColumna = {};
    if (habiaColumnas) { this.gridApi?.setFilterModel(null); }

    // LA BANDERA SE BAJA EN LA SIGUIENTE VUELTA, no aquí: medido contra
    // ag-Grid 28, `setFilterModel` avisa DESPUÉS de esta línea.
    this.programar(() => { this.limpiando = false; }, 0);

    this.paginaActual = 1;
    this.allEmpleados(1);
  }

  // ================================================================
  // AG-GRID
  // ================================================================

  initializeGrid(): void {
    this.columnDefs = this.conFiltros([
      {
        headerName: 'Id',
        field: 'id',
        cellStyle: { textAlign: 'center' },
        minWidth: 70,
        maxWidth: 70,
      },
      {
        // Segunda columna y PULSABLE: dar de baja esto era abrir la ficha
        // entera, bajar la casilla y guardar. Ahora se pulsa aqui.
        headerName: 'Activo',
        field: 'activo',
        cellStyle: { textAlign: 'center' },
        minWidth: 80,
        maxWidth: 80,
        cellRenderer: (params: any) => this.casillaActivo(params),
      },
      {
        headerName: 'Foto',
        field: 'foto',
        minWidth: 60,
        maxWidth: 60,
        sortable: false,
        cellStyle: { display: 'flex', justifyContent: 'center', alignItems: 'center' },
        cellRenderer: (params: any) => {
          if (!params.value) { return '<span class="lista-foto lista-foto--vacia"><i class="fa fa-user"></i></span>'; }
          const url = this._empleadoService.getEmpleadoImage(params.data.id, true);
          return `<img src="${url}" alt="" class="lista-foto" onerror="this.onerror=null; this.src='/assets/img/user/default.png'" />`;
        }
      },
      {
        headerName: 'Identificación',
        field: 'numero_identificacion',
        cellStyle: { textAlign: 'center' },
        minWidth: 120,
        maxWidth: 140,
      },
      {
        headerName: 'Apellidos',
        field: 'apellidos',
        cellStyle: { textAlign: 'left', fontWeight: '600' },
        minWidth: 150,
        maxWidth: 260,
      },
      {
        headerName: 'Nombres',
        field: 'nombres',
        cellStyle: { textAlign: 'left' },
        minWidth: 150,
        maxWidth: 260,
      },
      {
        headerName: 'Cargo',
        field: 'cargo_nombre',
        cellStyle: { textAlign: 'left' },
        minWidth: 160,
        maxWidth: 260,
      },
      {
        headerName: 'Departamento',
        field: 'departamento_nombre',
        cellStyle: { textAlign: 'left' },
        minWidth: 150,
        maxWidth: 260,
      },
      {
        // DÓNDE TRABAJA. Importa porque es lo que decide desde dónde puede
        // marcar asistencia: sin sucursal, desde cualquier lugar.
        headerName: 'Sucursal',
        field: 'sucursal_nombre',
        headerTooltip: 'Sin sucursal, el empleado puede marcar asistencia desde cualquier lugar',
        cellStyle: { textAlign: 'left' },
        minWidth: 150,
        maxWidth: 240,
        cellRenderer: (params: any) => params.value
          ? `<span class="emp-sucursal">${params.value}</span>`
          : `<span class="emp-sucursal emp-sucursal--no" title="Puede marcar desde cualquier lugar">
               <i class="fa fa-earth-americas"></i> Sin sucursal</span>`,
      },
      {
        // A QUÉ HORA SE LE ESPERA. Junto a la sucursal son las dos cosas que
        // deciden si una marcación vale y si llegó tarde: sin horario, nadie
        // le cuenta los minutos.
        headerName: 'Horario',
        field: 'horario_nombre',
        headerTooltip: 'Sin horario, al empleado no se le miden los atrasos',
        cellStyle: { textAlign: 'left' },
        minWidth: 150,
        maxWidth: 240,
        cellRenderer: (params: any) => params.value
          ? `<span class="emp-sucursal">${params.value}</span>`
          : `<span class="emp-sucursal emp-sucursal--no" title="No se le miden los atrasos">
               <i class="fa fa-clock"></i> Sin horario</span>`,
      },
      {
        headerName: 'Correo',
        field: 'email',
        cellStyle: { textAlign: 'left' },
        minWidth: 200,
        maxWidth: 280,
      },
      {
        headerName: 'Celular',
        field: 'celular',
        cellStyle: { textAlign: 'left' },
        minWidth: 110,
        maxWidth: 130,
      },
      {
        headerName: 'Ingreso',
        field: 'fecha_ingreso',
        cellStyle: { textAlign: 'center' },
        minWidth: 110,
        maxWidth: 120,
      },
      {
        headerName: 'Contrato',
        field: 'tipo_contrato',
        cellStyle: { textAlign: 'center' },
        minWidth: 110,
        maxWidth: 130,
        cellRenderer: (params: any) => params.value
          ? `<span class="badge bg-secondary bg-opacity-25 text-body fs-10px">${params.value}</span>`
          : '',
      },
      {
        headerName: 'Estado',
        field: 'estado',
        cellStyle: { textAlign: 'center' },
        minWidth: 100,
        maxWidth: 120,
        cellRenderer: (params: any) => {
          const clases: { [k: string]: string } = { ACTIVO: 'bg-teal', VACACIONES: 'bg-info', LICENCIA: 'bg-warning', INACTIVO: 'bg-secondary', RETIRADO: 'bg-danger' };
          return params.value ? `<span class="badge ${clases[params.value] ?? 'bg-secondary'} fs-10px">${params.value}</span>` : '';
        },
      },
      {
        headerName: 'Salario',
        field: 'salario',
        cellStyle: { textAlign: 'right' },
        minWidth: 110,
        maxWidth: 130,
        valueFormatter: (params: any) => this.formatoMoneda(params.value),
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
        cellRenderer: ButtonAccionEmpleado,
        pinned: 'right',
        minWidth: AllEmpleadosComponent.ANCHO_ACCIONES_ABIERTA,
        maxWidth: AllEmpleadosComponent.ANCHO_ACCIONES_ABIERTA,
        suppressHeaderMenuButton: true,
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
    ]);
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

  // Cinco iconos en la fila: ver, modificar, clonar, eliminar y rostro.
  private static readonly ANCHO_ACCIONES_ABIERTA = 140;
  private static readonly ANCHO_ACCIONES_PLEGADA = 50;

  /** Pliega o despliega la columna ACCIONES (pulsando su cabecera). */
  toggleActionsColumn() {
    const columnDefs = this.gridApi.getColumnDefs() as any[];
    const actionsCol = columnDefs.find(col => col.field === 'actions');
    if (!actionsCol) { return; }

    const estabaPlegada = actionsCol.minWidth === AllEmpleadosComponent.ANCHO_ACCIONES_PLEGADA;
    this.accionesPlegadas = !estabaPlegada;

    const ancho = estabaPlegada ? AllEmpleadosComponent.ANCHO_ACCIONES_ABIERTA : AllEmpleadosComponent.ANCHO_ACCIONES_PLEGADA;
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

    this.gridApi.setGridOption('columnDefs', columnDefs);
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

  // ================================================================
  // LA CASILLA DE «ACTIVO»
  // ================================================================
  //
  // El dibujo y el flujo —el giro mientras guarda, repintar con lo que
  // contesta el servidor, volver atrás si falla— viven en
  // AppAgGridService: son los mismos en las nueve rejillas que tienen esta
  // casilla. Aquí sólo van los datos de esta pantalla.

  /**
   * Los desactivados se ven, pero se ven apagados y tachados.
   *
   * No se esconden: siguen en la lista y se pueden buscar y abrir. Lo que se
   * busca es no tener que leer la casilla fila por fila para saber cuál ya no
   * está en juego. La regla y su CSS son los mismos en las nueve rejillas con
   * casilla, así que viven en AppAgGridService y en styles.css.
   */
  public rowClassRules = this._appAgGridService.reglasFilaInactiva('activo');

  /** Los que se están guardando ahora mismo: su casilla sale como un giro. */
  private readonly activoEnVuelo = new Set<number>();

  /** La casilla de la columna «Activo». */
  private casillaActivo(params: any): string {
    return this._appAgGridService.casillaActivo(params, {
      puede: this.accesoModel?.editar === true,
      enVuelo: this.activoEnVuelo,
      que: 'empleado',
    });
  }

  /**
   * Activar o desactivar desde la casilla, sin abrir el formulario.
   *
   * Lo escribe una función del servidor que toca SÓLO esa columna. Guardar
   * la ficha entera para bajar una casilla la revalidaba toda, y un
   * registro que hoy no cumpliría alguna regla —cargado antes de que
   * existiera— no se podría desactivar hasta arreglarle todo lo demás.
   */
  cambiarActivo(fila: EmpleadoModel | null, nodo?: IRowNode | null): void {
    if (!fila) { return; }
    if (this._seguridadService.isexpired()) { return; }

    this._appAgGridService.alternarActivo({
      gridApi: this.gridApi,
      filas: this.empleadoModel,
      fila, nodo,
      campo: 'activo',
      enVuelo: this.activoEnVuelo,
      puede: this.accesoModel?.editar === true,
      que: 'empleado',
      llamar: (id, activo) => this._empleadoService.activarEmpleado(id, activo),
      nombre: (f: any) => f.nombre_completo || ((f.nombres ?? '') + ' ' + (f.apellidos ?? '')).trim(),
        hasta: this.unsubscribe$,
    });
  }

  onCellClicked(e: CellClickedEvent): void {
    this.selectedRow = e.data;

    // La casilla de «Activo» se marca con `data-accion`, igual que el botón
    // de llamar de las rejillas de clientes: se atiende aquí y no con un
    // componente por celda.
    const origen = e.event?.target as HTMLElement | null;
    if (origen?.closest('[data-accion="activo"]')) {
      this.cambiarActivo(e.data, e.node);
    }
  }

  // ================================================================
  // DATOS
  // ================================================================

  /** Pide una página al servidor y la vuelca en la grilla (con el meta de paginación). */
  async allEmpleados(page: number = 1) {
    try {
      this._loadingService.setLoading(true);

      const res = await firstValueFrom(
        this._empleadoService.allEmpleados(page, this.registrosPorPagina, this.searchTerm,
                                           this.filtrosColumna)
      ) as any;

      if (res.body?.status !== 'success') {
        this._toastr.error(res.body?.message || 'No se pudo obtener el listado de empleados', 'Error');
        this.empleadoModel = [];
        this.totalRegistros = 0;
        this.ultimaPagina = 1;
        this.gridApi?.setGridOption('rowData', this.empleadoModel);
        return;
      }

      this.empleadoModel = res.body?.data?.data || [];

      if (res.body?.data?.meta) {
        this.totalRegistros = res.body.data.meta.total;
        this.registrosPorPagina = res.body.data.meta.per_page;
        this.paginaActual = res.body.data.meta.current_page;
        this.ultimaPagina = res.body.data.meta.last_page;
      }

      if (this.gridApi) this.gridApi.setGridOption('rowData', this.empleadoModel);
    } catch (error) {
      // El AuthInterceptor ya muestra el toast del error HTTP
      console.error('Error al cargar empleados:', error);
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  /** Trae TODOS los registros que cumplen el filtro actual, para exportar. */
  private async obtenerTodosParaExportar(): Promise<EmpleadoModel[]> {
    if (this.totalRegistros === 0) { return []; }
    try {
      this._loadingService.setLoading(true);
      const res = await firstValueFrom(
        this._empleadoService.allEmpleados(1, this.totalRegistros, this.searchTerm,
                                           this.filtrosColumna)
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
  /**
   * Filas del reporte con formato de salida.
   *
   * `ordenarPorNombre` sólo cuando se exporta el listado completo: si se
   * exporta la página hay que respetar lo que el usuario tiene delante.
   * Se ordena sobre una COPIA: `sort` cambia el array que recibe, y el de
   * la página es el de la grilla.
   */
  private filasReporte(empleados: EmpleadoModel[], ordenarPorNombre: boolean = true): any[][] {
    return (ordenarPorNombre
      ? [...empleados].sort((a, b) => (a.apellidos || '').localeCompare(b.apellidos || ''))
      : empleados)
      .map(item => [
        item.id,
        item.numero_identificacion,
        item.apellidos,
        item.nombres,
        item.cargo_nombre || '',
        item.departamento_nombre || '',
        item.email,
        item.estado,
        item.activo ? 'Activo' : 'Inactivo'
      ]);
  }

  // ================================================================
  // BÚSQUEDA
  // ================================================================

  async onFilterTextBoxChanged(term?: string) {
    if (term !== undefined) this.searchTerm = term;
    this.paginaActual = 1;
    await this.allEmpleados(1);
  }

  // El `clearAllFilters` de antes vivía aquí y llamaba a onFilterChanged()
  // a mano. Ahora vive arriba, junto a los filtros de columna, y corta la
  // recarga doble que disparaba setFilterModel.

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
    this.allEmpleados(this.paginaActual);
  }

  nextPage(): void { this.goToPage(this.paginaActual + 1); }
  prevPage(): void { this.goToPage(this.paginaActual - 1); }

  // ================================================================
  // IMPRESIÓN Y EXPORTACIÓN (listado completo que cumple el filtro)
  // ================================================================

  private readonly CABECERAS_REPORTE = ['ID', 'Identificación', 'Apellidos', 'Nombres', 'Cargo', 'Departamento', 'Correo', 'Estado', 'Activo'];


  /**
   * Lo que se le pide al servicio de descargas: la misma caja para los
   * tres botones. Él pregunta si hace falta, trae las filas y arma el
   * título con los filtros puestos.
   */
  private peticionDescarga(accion: AccionDescarga): PeticionDescarga<any> {
    return {
      accion,
      nombrePlural: 'empleados',
      tituloBase: 'Listado de Empleados',
      gridApi: this.gridApi,
      filasDePagina: this.empleadoModel,
      total: this.totalRegistros,
      pagina: this.paginaActual,
      ultimaPagina: this.ultimaPagina,
      busqueda: this.searchTerm,
      // (esta pantalla todavia no tiene filtros de columna)
      columnDefs: this.columnDefs,
      traerTodo: () => this.obtenerTodosParaExportar(),
    };
  }

  async printPdf() {
    const salida = await this._appDescargaService.preparar(this.peticionDescarga('imprimir'));
    if (!salida) { return; }       // no hay nada que descargar, o canceló
    this._appPrintPdfService.generarReporte({
      tamanoPapel: "A4",
      orientacion: "p",
      title: "Reporte de Empleados",
      titleTable: salida.titulo,
      headers: this.CABECERAS_REPORTE,
      data: this.filasReporte(salida.filas, salida.alcance === 'todo'),
      piePagina: 'Pie de página - Mi Empresa en Desarrollo S.A....'
    });
  }

  async exportExcel() {
    const salida = await this._appDescargaService.preparar(this.peticionDescarga('excel'));
    if (!salida) { return; }       // no hay nada que descargar, o canceló
    this._appExportExcelService.generarReporteExcel({
      tamanoPapel: "A4",
      orientacion: "p",
      title: "Reporte de Empleados",
      titleTable: salida.titulo,
      headers: this.CABECERAS_REPORTE,
      data: this.filasReporte(salida.filas, salida.alcance === 'todo'),
      piePagina: 'Pie de página - Mi Empresa en Desarrollo S.A....'
    });
  }

  async exportCsv() {
    const salida = await this._appDescargaService.preparar(this.peticionDescarga('csv'));
    if (!salida) { return; }       // no hay nada que descargar, o canceló
    this._appExportCsvService.generarReporteCSV({
      headers: this.CABECERAS_REPORTE,
      data: this.filasReporte(salida.filas, salida.alcance === 'todo'),
    });
  }

  // ================================================================
  // ACCIONES (modales)
  // ================================================================

  /** Abre saveEmpleado en el modo pedido. registro = 0 para crear. */
  private abrirModalEmpleado(registro: any, accion: 'add' | 'edit' | 'clon' | 'view'): NgbModalRef {
    const modalRef = this.modal.open(SaveEmpleadoComponent, {
      centered: true,
      size: 'xl',
      backdrop: 'static',
      keyboard: accion === 'view',
    });
    modalRef.componentInstance.registro_selected = registro;
    modalRef.componentInstance.accion = accion;
    return modalRef;
  }

  /**
   * Registrar el rostro del empleado de la fila (para el kiosco de marcación).
   *
   * Se hace aquí y no sólo en el kiosco porque el alta de la persona es donde
   * se tiene delante su ficha: el kiosco es la puerta, no el escritorio.
   */
  registrarRostro(registro: any): void {
    if (this._seguridadService.isexpired()) { return; }
    if (this.accesoModel?.editar === false) {
      this._toastr.warning('No tiene permiso para modificar empleados', 'Acceso denegado');
      return;
    }

    const modalRef = this.modal.open(RegistrarRostroComponent, {
      centered: true,
      size: 'lg',
      backdrop: 'static',
      keyboard: false,
    });
    modalRef.componentInstance.empleado = registro;
  }

  addEmpleado(): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.abrirModalEmpleado(0, 'add');
    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, (nuevo: any) => {
      this.empleadoModel = [nuevo, ...this.empleadoModel];
      this.totalRegistros++;
      this.gridApi?.setGridOption('rowData', this.empleadoModel);
    });
  }

  clonEmpleado(registro: any): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.abrirModalEmpleado(registro, 'clon');
    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, (nuevo: any) => {
      this.empleadoModel = [nuevo, ...this.empleadoModel];
      this.totalRegistros++;
      this.gridApi?.setGridOption('rowData', this.empleadoModel);
    });
  }

  /** Al guardar sustituye la fila en sitio: no hace falta volver al servidor. */
  editEmpleado(registro: any): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.abrirModalEmpleado(registro, 'edit');
    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, (actualizado: any) => {
      const index = this.empleadoModel.findIndex(r => r.id === actualizado.id);
      if (index === -1) { return; }
      this.empleadoModel[index] = actualizado;
      this.gridApi?.getRowNode(index.toString())?.setData(actualizado);
    });
  }

  viewEmpleado(registro: any): void {
    if (this._seguridadService.isexpired()) { return; }
    this.abrirModalEmpleado(registro, 'view');
  }

  /** Quita la fila de la grilla con una transacción. */
  deleteEmpleado(registro: any): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.modal.open(DeleteEmpleadoComponent, {
      centered: true,
      size: 'md',
      backdrop: 'static',
      keyboard: true
    });
    modalRef.componentInstance.registro_selected = registro;

    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, () => {
      const index = this.empleadoModel.findIndex(r => r.id === registro.id);
      if (index === -1) { return; }
      this.empleadoModel.splice(index, 1);
      this.totalRegistros = Math.max(0, this.totalRegistros - 1);
      this.gridApi?.applyTransaction({ remove: [registro] });
      if (this.selectedRow?.id === registro.id) { this.selectedRow = null; }
    });
  }

  /**
   * La papelera de reciclaje.
   *
   * Lo que se «elimina» no se borra: va aquí, y desde aquí se restaura o se
   * borra de verdad. Sólo con el acceso «papelera» del perfil.
   */
  abrirPapelera(): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.modal.open(PapeleraEmpleadosComponent, {
      centered: true, size: 'xl', backdrop: 'static', keyboard: true
    });
    // El permiso viaja con el modal: allí también hay auditoría
    modalRef.componentInstance.puedeAuditar = this.accesoModel?.auditar === true;
    // Y si puede borrar de verdad, que es otro permiso distinto
    modalRef.componentInstance.puedeVaciar = this.accesoModel?.vaciar === true;
    this.escucharModal(modalRef, modalRef.componentInstance.cambio,
                       () => this.allEmpleados(this.paginaActual));
  }

  // ================================================================
  // EL MENÚ DEL BOTÓN DERECHO
  // ================================================================
  //
  // Las mismas acciones que la columna ACCIONES, sin tener que llegar hasta
  // el final de la fila ni desplegar la columna cuando está plegada.
  //
  // NO SE USA EL EVENTO `cellContextMenu` DE ag-Grid: se probó contra la
  // librería y no llega. Aquí se escucha el `contextmenu` de la rejilla y la
  // fila se resuelve con la API pública.

  @ViewChild('menuCtx') menuCtx!: MenuContextualComponent;

  /** Lo que se ofrece para la fila sobre la que se pulsó. */
  public opcionesContextuales: OpcionContextual[] = [];

  onContextMenuGrilla(e: MouseEvent): void {
    const fila = this._appAgGridService.filaDeEventoEnGrilla(e, this.gridApi);
    if (!fila) { return; }          // fuera de las filas: el menú del navegador

    e.preventDefault();

    this.selectedRow = fila;
    this._appAgGridService.marcarFila(this.gridApi, fila);

    this.opcionesContextuales = this.opcionesPara(fila);
    this.menuCtx?.abrir(e);
  }

  /** Qué se puede hacer con este empleado, según el perfil. */
  private opcionesPara(fila: any): OpcionContextual[] {
    const puedeCrear   = this.accesoModel?.crear    === true;
    const puedeEditar  = this.accesoModel?.editar   === true;
    const puedeBorrar  = this.accesoModel?.eliminar === true;
    const puedeVer     = this.accesoModel?.ver      === true;
    const puedeAuditar = this.accesoModel?.auditar  === true;

    const correo  = String(fila?.email ?? '').trim();
    const celular = String(fila?.celular ?? '').trim();

    return [
      { id: 'ver',    texto: 'Ver',       icono: 'fa-eye',   visible: puedeVer },
      { id: 'editar', texto: 'Modificar', icono: 'fa-pen',   visible: puedeEditar },
      { id: 'clonar', texto: 'Clonar',    icono: 'fa-clone', visible: puedeCrear,
        ayuda: 'Crear otro empleado partiendo de éste' },
      {
        id: 'rostro', texto: 'Registrar rostro', icono: 'fa-user-check',
        separadorAntes: true, visible: puedeEditar,
        ayuda: 'Las cinco muestras que usa el kiosco de marcación',
      },
      {
        id: 'activo', texto: fila?.activo ? 'Desactivar' : 'Activar',
        icono: fila?.activo ? 'fa-toggle-off' : 'fa-toggle-on',
        visible: puedeEditar,
        ayuda: fila?.activo ? 'Dejar de usarlo, sin borrarlo' : 'Volver a usarlo',
      },
      {
        id: 'correo', texto: 'Escribirle un correo', icono: 'fa-envelope',
        separadorAntes: true,
        deshabilitada: correo === '',
        ayuda: correo !== '' ? correo : 'Este empleado no tiene correo',
      },
      {
        id: 'copiarCelular', texto: 'Copiar el celular', icono: 'fa-copy',
        deshabilitada: celular === '',
        ayuda: celular !== '' ? celular : 'Este empleado no tiene celular',
      },
      {
        id: 'auditoria', texto: 'Ver auditoría', icono: 'fa-user-secret',
        separadorAntes: true, visible: puedeAuditar,
        ayuda: 'Quién tocó esta ficha y cuándo',
      },
      {
        id: 'eliminar', texto: 'Enviar a la papelera', icono: 'fa-trash',
        separadorAntes: true, peligro: true, visible: puedeBorrar,
        ayuda: 'Se puede recuperar desde la papelera',
      },
    ];
  }

  /** Se eligió una opción del menú. */
  alElegirContextual(id: string): void {
    const fila = this.selectedRow as any;
    if (!fila) { return; }

    switch (id) {
      case 'ver':       this.viewEmpleado(fila); break;
      case 'editar':    this.editEmpleado(fila); break;
      case 'clonar':    this.clonEmpleado(fila); break;
      case 'rostro':    this.registrarRostro(fila); break;
      case 'activo':    this.cambiarActivo(fila, this._appAgGridService.nodoDe(this.gridApi, fila.id)); break;
      case 'correo':    this.escribirCorreo(fila); break;
      case 'copiarCelular': this.copiarCelular(fila); break;
      case 'auditoria': this.auditoria(); break;
      case 'eliminar':  this.deleteEmpleado(fila); break;
    }
  }

  /** El correo del empleado, en el cliente de correo de siempre. */
  private escribirCorreo(fila: any): void {
    const correo = String(fila?.email ?? '').trim();
    if (!correo) { return; }
    window.location.href = `mailto:${correo}`;
  }

  /**
   * El celular al portapapeles.
   *
   * No se marca desde aquí: los números de esta aplicación son texto, y
   * llamar se hace desde los botones que lo tienen por oficio.
   */
  private copiarCelular(fila: any): void {
    const celular = String(fila?.celular ?? '').trim();
    if (!celular) { return; }
    navigator.clipboard?.writeText(celular)
      .then(() => this._toastr.success(`Copiado: ${celular}`, 'Celular', { timeOut: 2000 }))
      .catch(() => this._toastr.warning('No se pudo copiar', 'Celular'));
  }

  /** Historial de auditoría de la fila seleccionada (tabla empleados). */
  auditoria(): void {
    if (!this.selectedRow) { return; }
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.modal.open(AuditoriaModalComponent, {
      centered: true,
      size: "xl",
      backdrop: "static",
      keyboard: true
    });
    modalRef.componentInstance.tablaNombre = 'empleados';
    modalRef.componentInstance.registroId = this.selectedRow.id;
  }
}

// ================================================================
// RENDERER DE LA COLUMNA ACCIONES
// ================================================================
// Simple delegador: toda la lógica de modales vive en AllEmpleadosComponent.
@Component({
  selector: 'app-button-accion-empleado',
  standalone: true,
  imports: [ActionButtonsComponent],
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
        <app-action-buttons
          [accesoModel]="parent.accesoModel"
          [buttonView]="true"
          [buttonEdit]="true"
          [buttonClone]="true"
          [buttonDelete]="true"
          (view)="parent.viewEmpleado(params.data)"
          (edit)="parent.editEmpleado(params.data)"
          (clone)="parent.clonEmpleado(params.data)"
          (delete)="parent.deleteEmpleado(params.data)">
        </app-action-buttons>

        <!-- El rostro para el kiosco de marcación. Va aparte de
             app-action-buttons, que es compartido por media aplicación. -->
        <button type="button"
                class="btn-icon acciones-rostro"
                [title]="parent.accesoModel?.editar === false
                          ? 'Registrar rostro - Desactivado'
                          : 'Registrar rostro para el kiosco'"
                [disabled]="parent.accesoModel?.editar === false"
                (click)="parent.registrarRostro(params.data)">
          <i class="fa fa-user-check"></i>
        </button>

        <!-- La sucursal YA NO está aquí: es un campo de la ficha, al lado
             del cargo y el departamento (saveEmpleado). La columna
             «Sucursal» de la rejilla sigue enseñando cuál tiene. -->
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .acciones-fila {
      display: flex;
      align-items: center;
      justify-content: center;
    }

    /* IGUAL QUE LOS DEMÁS BOTONES DE LA FILA, en el tono del kiosco.
       La clase «btn-icon» que lleva en la plantilla vive DENTRO de
       action-buttons.component.scss, que es CSS con alcance de ese
       componente: aquí no llega, y por eso este botón salía con el borde y
       el fondo que pone el navegador. Se repiten sus medidas —sin fondo,
       sin borde, el mismo relleno, el mismo tamaño de icono y el mismo
       zoom al pasar— para que se lea como uno más. */
    .acciones-rostro {
      background: none;
      border: none;
      padding: 3px 5px;
      font-size: 1.1em;
      cursor: pointer;
      transition: all .3s ease;
      color: var(--bs-app-theme, #00acac);
    }

    .acciones-rostro:hover:not(:disabled) {
      transform: scale(1.2);
    }

    .acciones-rostro:active:not(:disabled) {
      transform: scale(.95);
    }

    .acciones-rostro:disabled {
      color: #e0dfdf;
      opacity: .3;
      cursor: not-allowed;
      transform: none;
    }

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
export class ButtonAccionEmpleado implements ICellRendererAngularComp {
  public params: any;

  constructor(public parent: AllEmpleadosComponent) { }

  agInit(params: any): void { this.params = params; }

  refresh(params: any): boolean { this.params = params; return true; }
}
