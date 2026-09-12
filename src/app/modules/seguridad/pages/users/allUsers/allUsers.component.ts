import { Component, ElementRef, EventEmitter, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Subject, firstValueFrom, from, merge, of } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';
import { CellClickedEvent, GridApi, GridReadyEvent } from 'ag-grid-community';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { ActivatedRoute, Router } from '@angular/router';
import { ICellRendererAngularComp } from 'ag-grid-angular';
import { ToastrService } from 'ngx-toastr';

///   SERVICIOS    ///
import { SeguridadService } from '../../../services/seguridad.service';
import { UserService } from '../../../services/user.service';
import { AppPrintPdfService } from '../../../../../service/app-printPdf.service';
import { AppExportExcelService } from '../../../../../service/app-exportExcel.service';
import { AppExportCsvService } from '../../../../../service/app-exportCsv.service';
import { AppAgGridService } from '../../../../../service/app-agGrid.service';
import { LoadingService } from '../../../../../service/loading.service';

///   MODELOS    ///
import { UserModel } from "../../../interfaces/userModel";
import { AccesoModel } from '../../../../seguridad/interfaces/accesoModel';

///   COMPONENTES    ///
import { SaveUserComponent } from '../saveUser/saveUser.component';
import { DeleteUserComponent } from '../deleteUser/deleteUser.component';
import { ChangePasswordComponent } from '../change-password/change-password.component';
import { AuditoriaModalComponent } from '../../../../../components/auditoria-modal/auditoria-modal.component';
import { CampoBusquedaPaginacionComponent } from '../../../../../components/campos/campoBusquedaPaginacion/campoBusquedaPaginacion.component';

/**
 * Listado de usuarios.
 *
 * Grilla ag-Grid con paginación EN SERVIDOR: cada página es una llamada a
 * seguridad.fn_usuarios_listar_paginado con (página, tamaño, filtro). Por eso
 * this.userModel sólo contiene la página visible y los exportadores tienen
 * que pedir el listado completo aparte (obtenerTodosParaExportar).
 *
 * Toda la lógica de modales (crear, editar, clonar, borrar, clave, auditoría)
 * vive aquí; el renderer de la columna ACCIONES (ButtonAccionUser, al final
 * del fichero) sólo delega en este componente.
 *
 * Ciclo de vida y memoria — todo lo que se abre aquí se cierra en ngOnDestroy:
 *   - suscripciones: takeUntil(unsubscribe$)
 *   - setTimeout: registrados en timeoutIds mediante programar()
 *   - listeners nativos de la cabecera de ag-Grid: referencias estables,
 *     quitarListenersCabecera()
 *   - modales abiertos: dismissAll()
 */
@Component({
  selector: 'app-allUsers',
  templateUrl: './allUsers.component.html',
  styleUrls: ['./allUsers.component.css'],
  standalone: false,
})
export class AllUsersComponent implements OnInit, OnDestroy {

  // ---------- Estado ----------
  /** Permisos del usuario sobre esta pantalla (crear, reporte, auditar…), del resolver de la ruta. */
  public accesoModel: AccesoModel;
  /** Filas de la página actual — NO el listado completo. */
  public userModel: UserModel[] = [];
  /** Fila marcada en la grilla; habilita el botón de auditoría. */
  public selectedRow: UserModel | null = null;

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

  /** Punto y momento del touchstart en la cabecera ACCIONES, para distinguir un toque de un arrastre. */
  private touchStartTime = 0;
  private touchStartX = 0;
  private touchStartY = 0;

  /** Corta toda suscripción viva al destruir el componente. */
  private readonly unsubscribe$ = new Subject<void>();

  /** Timeouts pendientes, para cancelarlos en ngOnDestroy. */
  private timeoutIds = new Set<any>();
  private resizeTimeoutId: any;

  /**
   * setTimeout que se da de baja solo al dispararse.
   *
   * Antes se hacía timeoutIds.push(setTimeout(...)) y el id nunca se quitaba:
   * el array crecía sin techo mientras la pantalla estuviera abierta.
   */
  private programar(fn: () => void, ms: number): void {
    const id = setTimeout(() => {
      this.timeoutIds.delete(id);
      fn();
    }, ms);
    this.timeoutIds.add(id);
  }

  /**
   * Referencias estables a los listeners de la cabecera. Con `.bind(this)` cada
   * llamada creaba una función nueva y removeEventListener era imposible.
   */
  private headerElement: Element | null = null;
  private readonly onHeaderClick: EventListener = () => this.toggleActionsColumn();
  private readonly onHeaderTouchStart: EventListener = (e) => this.handleTouchStart(e as TouchEvent);
  private readonly onHeaderTouchEnd: EventListener = (e) => this.handleTouchEnd(e as TouchEvent);

  /**
   * Redimensionado de ventana → recalcular columnas y alto de la grilla.
   * Pasa por el debounce de ajustarTamanoGrid() para no recalcular en cada
   * píxel. Angular quita el listener solo al destruir el componente.
   */
  @HostListener('window:resize')
  onResize(): void { this.ajustarTamanoGrid(); }

  // ---------- Búsqueda ----------
  @ViewChild(CampoBusquedaPaginacionComponent) campoBusquedaPaginacion!: CampoBusquedaPaginacionComponent;
  /** Texto de filtro vigente; viaja al servidor en cada página y en las exportaciones. */
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
    private _userService: UserService,
  ) {
    this.titulo = "Usuarios";
    this.accesoModel = this.activeRoute.snapshot.data.access;
  }

  ngOnInit(): void {
    // La primera página se pide ya; si la grilla aún no está lista, allUsers()
    // deja los datos en userModel y [rowData] los pinta cuando aparezca.
    this.allUsers();
    this.initializeGrid();
  }

  ngOnDestroy(): void {
    // 1. Suscripciones (modales, etc.)
    this.unsubscribe$.next();
    this.unsubscribe$.complete();

    // 2. Timeouts pendientes
    this.timeoutIds.forEach(id => clearTimeout(id));
    this.timeoutIds.clear();
    if (this.resizeTimeoutId) { clearTimeout(this.resizeTimeoutId); }

    // 3. Listeners nativos sobre la cabecera de ag-Grid
    this.quitarListenersCabecera();

    // 4. Modales que sigan abiertos. Los modales cuelgan de <body>, no de este
    //    componente: si la ruta cambia con uno abierto (p. ej. el interceptor
    //    manda al login al caducar la sesión) el modal se quedaba encima de la
    //    pantalla nueva, con su formulario y sus datos vivos.
    this.modal.dismissAll();
  }

  /**
   * Suscribe al @Output de un modal y corta la suscripción cuando el modal se
   * cierra o cuando este componente se destruye.
   *
   * Con firstValueFrom() la promesa nunca se resolvía si el usuario cancelaba:
   * registrosE solo emite al guardar con éxito y nunca hace complete(). El
   * closure quedaba retenido para siempre junto al modal entero — formulario,
   * registro y el avatar en base64 incluidos.
   */
  public escucharModal<T>(
    modalRef: NgbModalRef,
    salida: EventEmitter<T>,
    alEmitir: (valor: T) => void
  ): void {
    // dismiss() rechaza la promesa; para nosotros es un cierre normal.
    const modalCerrado$ = from(modalRef.result).pipe(catchError(() => of(null)));

    salida
      .pipe(takeUntil(merge(this.unsubscribe$, modalCerrado$)))
      .subscribe({
        next: alEmitir,
        error: (err) => console.error('Error en el modal:', err),
      });
  }

  fun_home() {
    this.route.navigate(['/seguridad']);
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

  /**
   * Definición de columnas. Los anchos van en px con min/max para que
   * sizeColumnsToFit() reparta el sobrante sin aplastar las columnas cortas.
   * La columna ACCIONES va fijada a la derecha (pinned) y su cabecera es
   * pulsable para plegarla (ver toggleActionsColumn).
   */
  initializeGrid(): void {
    this.columnDefs = [
      // {
      //   headerName: 'Avatar',
      //   field: 'avatar',
      //   minWidth: 90,
      //   maxWidth: 120,
      //   cellStyle: { textAlign: 'center' },
      //   cellRenderer: (params: any) => {
      //     if (!params.value) return '';
      //     const imageUrl = this._userService.getUserImage(params.data.id, true);
      //     return `
      //       <img src="${imageUrl}" 
      //           alt="avatar" 
      //           style="width: 30px; height: 30px; border-radius: 50%;"
      //           onerror="this.onerror=null; this.src='/assets/img/user/default.png'"
      //       />
      //     `;
      //   }
      // },
      {
        headerName: 'Id',
        field: 'id',
        cellStyle: { textAlign: 'center' },
        minWidth: 70,
        maxWidth: 70,
      },
      {
        headerName: 'Usuario',
        field: 'login_user',
        cellStyle: { textAlign: 'left' },
        minWidth: 200,
        maxWidth: 350,
      },
      {
        headerName: 'Apellidos',
        field: 'surname',
        cellStyle: { textAlign: 'left' },
        minWidth: 150,
        maxWidth: 400,
      },
      {
        headerName: 'Nombre',
        field: 'name',
        cellStyle: { textAlign: 'left' },
        minWidth: 150,
        maxWidth: 400,
      },
      {
        headerName: 'Email',
        field: 'email',
        cellStyle: { textAlign: 'left' },
        minWidth: 200,
        maxWidth: 250,
      },
      {
        headerName: 'Teléfono',
        field: 'phone',
        cellStyle: { textAlign: 'left' },
        minWidth: 100,
        maxWidth: 120,
      },
      {
        headerName: 'Tipo Usuario',
        field: 'type_user',
        cellStyle: { textAlign: 'center' },
        minWidth: 130,
        maxWidth: 130,
        cellRenderer: (params: any) => {
          switch (params.value) {
            case 1: return 'Super Usuario';
            case 2: return 'Administrador';
            case 3: return 'Usuario Sistema';
            default: return 'Usuario Web';
          }
        }
      },
      {
        headerName: 'Perfil',
        field: 'perfil_nombre',
        cellStyle: { textAlign: 'left' },
        minWidth: 120,
        maxWidth: 150,
      },
      {
        headerName: 'Horario',
        field: 'chorario_nombre',
        cellStyle: { textAlign: 'left' },
        minWidth: 120,
        maxWidth: 150,
      },

      {
        headerName: 'Activo',
        field: 'isactive',
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
        headerName: 'Último Login',
        field: 'last_login_at',
        cellStyle: { textAlign: 'center' },
        minWidth: 180,
        maxWidth: 180,
      },
      {
        headerName: 'Creado',
        field: 'created_at',
        cellStyle: { textAlign: 'center' },
        minWidth: 180,
        maxWidth: 180,
      },
      {
        headerName: 'Actualizado',
        field: 'updated_at',
        cellStyle: { textAlign: 'center' },
        minWidth: 180,
        maxWidth: 180,
      },

        {
          headerName: 'Creado por',
          field: 'created_by',
          cellStyle: { textAlign: 'left' },
          minWidth: 150,
          maxWidth: 1200, 
          sortable: false,         
        },

        {
          headerName: 'Actualizado por',
          field: 'updated_by',
          cellStyle: { textAlign: 'left' },
          minWidth: 150,
          maxWidth: 1200, 
          sortable: false,         
        },


      {
        headerName: 'ACCIONES',
        field: 'actions',
        cellStyle: { display: 'flex', justifyContent: 'center', alignItems: 'center' },
        cellRenderer: ButtonAccionUser,
        pinned: 'right',
        minWidth: 130,
        maxWidth: 130,
        suppressMenu: true,
        sortable: false,
        resizable: false,
        headerComponentParams: {
          template: `
            <div style="display: flex; align-items: center; justify-content: center; gap: 5px;">
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

    // La cabecera de ACCIONES aún no está en el DOM en este punto: se espera
    // a que ag-Grid la pinte antes de engancharle los listeners.
    this.programar(() => this.montarListenersCabecera(), 500);

    this._appAgGridService.ajustarTamanoGrid(this.gridApi);
    this.ajustarAlturaGrid();
  }

  private montarListenersCabecera(): void {
    // ag-Grid recrea la celda de cabecera al cambiar columnDefs: hay que soltar
    // la anterior o el elemento huérfano sigue reteniendo el componente.
    this.quitarListenersCabecera();

    // Acotado a este componente: con document.querySelector, si había otra
    // grilla en pantalla se enganchaba a la cabecera equivocada.
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

  /** Cabecera ACCIONES en táctil: se anota dónde y cuándo empezó el toque. */
  handleTouchStart(e: TouchEvent) {
    this.touchStartTime = Date.now();
    this.touchStartX = e.touches[0].clientX;
    this.touchStartY = e.touches[0].clientY;
  }

  /**
   * Cabecera ACCIONES en táctil: sólo cuenta como toque si fue corto (<300 ms)
   * y sin desplazamiento (<10 px); así un arrastre para hacer scroll
   * horizontal no pliega la columna sin querer.
   */
  handleTouchEnd(e: TouchEvent) {
    const touchDuration = Date.now() - this.touchStartTime;
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const distX = Math.abs(touchEndX - this.touchStartX);
    const distY = Math.abs(touchEndY - this.touchStartY);
    if (touchDuration < 300 && distX < 10 && distY < 10) {
      this.toggleActionsColumn();
      e.preventDefault();
    }
  }

  /** Ancho de la columna ACCIONES abierta (botones visibles) y plegada (sólo la cabecera). */
  private static readonly ANCHO_ACCIONES_ABIERTA = 130;
  private static readonly ANCHO_ACCIONES_PLEGADA = 50;

  /**
   * Pliega o despliega la columna ACCIONES (pulsando su cabecera).
   *
   * Sirve sobre todo en móvil: la columna va fijada a la derecha y con 130px
   * tapa media grilla; plegada a 50px deja ver los datos y se vuelve a abrir
   * con un toque. Se pliega ocultando las celdas (display:none) y cambiando el
   * icono de la cabecera.
   */
  toggleActionsColumn() {
    const columnDefs = this.gridApi.getColumnDefs() as any[];
    const actionsCol = columnDefs.find(col => col.field === 'actions');
    if (!actionsCol) { return; }

    const estabaPlegada = actionsCol.minWidth === AllUsersComponent.ANCHO_ACCIONES_PLEGADA;
    const ancho = estabaPlegada
      ? AllUsersComponent.ANCHO_ACCIONES_ABIERTA
      : AllUsersComponent.ANCHO_ACCIONES_PLEGADA;

    actionsCol.minWidth = ancho;
    actionsCol.maxWidth = ancho;
    actionsCol.cellStyle = estabaPlegada
      ? { display: 'flex', justifyContent: 'center', alignItems: 'center' }
      : { display: 'none' };
    actionsCol.headerComponentParams = {
      template: estabaPlegada
        ? `<div style="display: flex; align-items: center; justify-content: center; gap: 5px;">
            <span>ACCIONES</span>
            <i class="fas fa-arrow-right"></i>
          </div>`
        : `<div style="display: flex; align-items: center; justify-content: center;">
            <i class="fas fa-bars"></i>
          </div>`
    };

    this.gridApi.setColumnDefs(columnDefs);
    this.gridApi.sizeColumnsToFit();

    // setColumnDefs recrea la celda de cabecera: hay que volver a enganchar
    // los listeners, y repartir columnas otra vez cuando ya esté pintada.
    this.programar(() => {
      this.gridApi.sizeColumnsToFit();
      this.montarListenersCabecera();
    }, 100);
  }

  /** Recalcula columnas y alto con un debounce de 100 ms (resize, expandir panel). */
  ajustarTamanoGrid() {
    if (!this.gridApi) { return; }
    if (this.resizeTimeoutId) { clearTimeout(this.resizeTimeoutId); }
    this.resizeTimeoutId = setTimeout(() => {
      this._appAgGridService.ajustarTamanoGrid(this.gridApi);
      this.ajustarAlturaGrid();
    }, 100);
  }

  /**
   * Da a la grilla toda la altura que queda entre su borde superior y el
   * final de la ventana, menos un margen para la paginación. Así la grilla
   * llena la pantalla sin importar la resolución ni si el panel está
   * expandido.
   */
  ajustarAlturaGrid() {
    // El contenedor de ESTA grilla, no el primero del documento
    const gridElement = this.host.nativeElement.querySelector('.ag-theme-alpine') as HTMLElement;
    if (!gridElement) { return; }

    const MARGEN_INFERIOR = 60;   // sitio para los controles de paginación
    const alturaDisponible = window.innerHeight - gridElement.getBoundingClientRect().top - MARGEN_INFERIOR;

    gridElement.style.height = `${alturaDisponible}px`;
    this.gridApi.sizeColumnsToFit();
  }

  clearSelection(): void {
    this._appAgGridService.limpiarSeleccion(this.gridApi);
  }

  /** Guarda la fila pulsada: es lo que usa el botón de auditoría. */
  onCellClicked(e: CellClickedEvent): void {
    this.selectedRow = e.data;
  }

  // ================================================================
  // DATOS
  // ================================================================

  /**
   * Pide una página al servidor y la vuelca en la grilla.
   * Actualiza también los contadores de paginación con el meta que devuelve
   * el back (total, per_page, current_page, last_page).
   */
  async allUsers(page: number = 1) {
    try {
      this._loadingService.setLoading(true);

      const res = await firstValueFrom(
        this._userService.allUsers(page, this.registrosPorPagina, this.searchTerm)
      ) as any;

      // El backend responde 200 aunque la función de PostgreSQL devuelva
      // success:false. Sin esta comprobación un fallo de BD se veía como una
      // grilla vacía, sin ningún aviso.
      if (res.body?.status !== 'success') {
        this._toastr.error(res.body?.message || 'No se pudo obtener el listado de usuarios', 'Error');
        this.userModel = [];
        this.totalRegistros = 0;
        this.ultimaPagina = 1;
        this.gridApi?.setRowData(this.userModel);
        return;
      }

      this.userModel = res.body?.data?.data || [];

      if (res.body?.data?.meta) {
        this.totalRegistros = res.body.data.meta.total;
        this.registrosPorPagina = res.body.data.meta.per_page;
        this.paginaActual = res.body.data.meta.current_page;
        this.ultimaPagina = res.body.data.meta.last_page;
      }

      if (this.gridApi) this.gridApi.setRowData(this.userModel);
    } catch (error) {
      // El AuthInterceptor ya muestra el toast del error HTTP
      console.error('Error al cargar usuarios:', error);
    } finally {
      // En finally para que el retorno anticipado de arriba no deje el spinner colgado
      this._loadingService.setLoading(false);
    }
  }

  /**
   * Trae TODOS los registros que cumplen el filtro actual, para exportar.
   *
   * Los exportadores recorrían this.userModel, que con la paginación en
   * servidor son solo los 10 de la página visible: el PDF decía "Listado de
   * Usuarios" y traía una página suelta.
   */
  private async obtenerTodosParaExportar(): Promise<UserModel[]> {
    if (this.totalRegistros === 0) { return []; }

    try {
      this._loadingService.setLoading(true);
      const res = await firstValueFrom(
        this._userService.allUsers(1, this.totalRegistros, this.searchTerm)
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

  /** Filas del reporte, ya ordenadas y con el formato de salida. */
  private filasReporte(usuarios: UserModel[]): any[][] {
    return usuarios
      .sort((a, b) => (a.login_user || '').localeCompare(b.login_user || ''))
      .map(item => [
        item.id,
        item.login_user,
        item.name,
        item.surname,
        item.email,
        item.isactive ? 'Activo' : 'Inactivo'
      ]);
  }

  // ================================================================
  // BÚSQUEDA
  // ================================================================

  /** Nuevo filtro → siempre desde la página 1, o podría caer fuera de rango. */
  async onFilterTextBoxChanged(term?: string) {
    if (term !== undefined) this.searchTerm = term;
    this.paginaActual = 1;
    await this.allUsers(1);
  }

  /** Vacía el buscador y los filtros de columna de ag-Grid y recarga. */
  clearAllFilters() {
    // reset() ya vacía el input del buscador: el getElementById que había aquí
    // hacía lo mismo por segunda vez y a nivel de documento.
    this.campoBusquedaPaginacion?.reset();
    if (this.gridApi) {
      this.gridApi.setFilterModel(null);
      this.searchTerm = '';
      this.gridApi.onFilterChanged();
      this.allUsers(this.paginaActual).then(() => {
        if (this.paginaActual > this.ultimaPagina && this.ultimaPagina > 0) {
          this.goToPage(this.ultimaPagina);
        }
      });
    }
  }

  // ================================================================
  // PAGINACIÓN
  // ================================================================
  // Los botones de la plantilla llaman a estas cuatro; todas pasan por
  // goToPage(), que es la única que valida el rango y pide datos.

  firstPage(): void {
    if (this.paginaActual !== 1) {
      this.goToPage(1);
    }
  }

  ultimaPagina2(): void {
    if (this.paginaActual !== this.ultimaPagina) {
      this.goToPage(this.ultimaPagina);
    }
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.ultimaPagina) return;
    this.paginaActual = page;
    this.allUsers(this.paginaActual);
  }

  nextPage(): void {
    this.goToPage(this.paginaActual + 1);
  }

  prevPage(): void {
    this.goToPage(this.paginaActual - 1);
  }

  // ================================================================
  // IMPRESIÓN Y EXPORTACIÓN
  // ================================================================
  // Las tres exportan el listado COMPLETO que cumple el filtro actual, no la
  // página visible (ver obtenerTodosParaExportar).

  /** Título del reporte, indicando si sale filtrado. */
  private tituloReporte(): string {
    return this.searchTerm
      ? `Listado de Usuarios (filtro: ${this.searchTerm})`
      : 'Listado de Usuarios';
  }

  async printPdf() {
    const usuarios = await this.obtenerTodosParaExportar();
    if (usuarios.length === 0) {
      this._toastr.info('No hay usuarios para exportar');
      return;
    }

    this._appPrintPdfService.generarReporte({
      tamanoPapel: "A4",
      orientacion: "p",
      title: "Reporte de Usuarios",
      titleTable: this.tituloReporte(),
      headers: ['ID', 'Usuario', 'Nombre', 'Apellido', 'Email', 'Activo'],
      data: this.filasReporte(usuarios),
      piePagina: 'Pie de página - Mi Empresa en Desarrollo S.A....'
    });
  }

  async exportExcel() {
    const usuarios = await this.obtenerTodosParaExportar();
    if (usuarios.length === 0) {
      this._toastr.info('No hay usuarios para exportar');
      return;
    }

    this._appExportExcelService.generarReporteExcel({
      tamanoPapel: "A4",
      orientacion: "p",
      title: "Reporte de Usuarios",
      titleTable: this.tituloReporte(),
      headers: ['ID', 'Usuario', 'Nombre', 'Apellido', 'Email', 'Activo'],
      data: this.filasReporte(usuarios),
      piePagina: 'Pie de página - Mi Empresa en Desarrollo S.A....'
    });
  }

  async exportCsv() {
    const usuarios = await this.obtenerTodosParaExportar();
    if (usuarios.length === 0) {
      this._toastr.info('No hay usuarios para exportar');
      return;
    }

    this._appExportCsvService.generarReporteCSV({
      headers: ['ID', 'Usuario', 'Nombre', 'Apellido', 'Email', 'Activo'],
      data: this.filasReporte(usuarios),
    });
  }

  // ================================================================
  // ACCIONES (modales)
  // ================================================================
  // Patrón común: comprobar sesión → abrir modal → escucharModal() para
  // reflejar en la grilla lo que el modal emita al guardar.

  /** Abre saveUser en el modo pedido. registro = 0 para crear. */
  private abrirModalUsuario(registro: any, accion: 'add' | 'edit' | 'clon' | 'view'): NgbModalRef {
    const modalRef = this.modal.open(SaveUserComponent, {
      centered: true,
      size: 'xl',
      backdrop: 'static',
      keyboard: accion === 'view',
    });
    modalRef.componentInstance.registro_selected = registro;
    modalRef.componentInstance.accion = accion;
    return modalRef;
  }

  addUser(): void {
    if (this._seguridadService.isexpired()) { return; }

    const modalRef = this.abrirModalUsuario(0, 'add');
    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, (nuevo: any) => {
      this.userModel = [nuevo, ...this.userModel];
      this.gridApi?.setRowData(this.userModel);
    });
  }

  clonUser(registro: any): void {
    if (this._seguridadService.isexpired()) { return; }

    const modalRef = this.abrirModalUsuario(registro, 'clon');
    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, (nuevo: any) => {
      this.userModel = [nuevo, ...this.userModel];
      this.gridApi?.setRowData(this.userModel);
    });
  }

  /** Al guardar sustituye la fila en sitio: no hace falta volver al servidor. */
  editUser(registro: any): void {
    if (this._seguridadService.isexpired()) { return; }

    const modalRef = this.abrirModalUsuario(registro, 'edit');
    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, (actualizado: any) => {
      const index = this.userModel.findIndex(r => r.id === actualizado.id);
      if (index === -1) { return; }
      this.userModel[index] = actualizado;
      this.gridApi?.getRowNode(index.toString())?.setData(actualizado);
    });
  }

  viewUser(registro: any): void {
    if (this._seguridadService.isexpired()) { return; }
    this.abrirModalUsuario(registro, 'view');   // solo lectura: no emite nada
  }

  /** Quita la fila de la grilla con una transacción (más barato que setRowData). */
  deleteUser(registro: any): void {
    if (this._seguridadService.isexpired()) { return; }

    const modalRef = this.modal.open(DeleteUserComponent, {
      centered: true,
      size: 'md',
      backdrop: 'static',
      keyboard: true
    });
    modalRef.componentInstance.registro_selected = registro;

    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, () => {
      const index = this.userModel.findIndex(r => r.id === registro.id);
      if (index === -1) { return; }
      this.userModel.splice(index, 1);
      this.gridApi?.applyTransaction({ remove: [registro] });
    });
  }

  cambioClave(registro: any): void {
    if (this._seguridadService.isexpired()) { return; }

    const modalRef = this.modal.open(ChangePasswordComponent, {
      centered: true,
      size: 'xl',
      backdrop: 'static',
      keyboard: true
    });
    modalRef.componentInstance.userId = registro.id;
    modalRef.componentInstance.login_user = registro.login_user;
    modalRef.componentInstance.email = registro.email;
    modalRef.componentInstance.view_reset = true;
    modalRef.componentInstance.registro_selected = registro;

    this.escucharModal(modalRef, modalRef.componentInstance.passwordChanged, () => {
      this.allUsers(this.paginaActual);   // refresca updated_at / updated_by
    });
  }

  /** Historial de auditoría de la fila seleccionada (tabla users). */
  auditoria(): void {
    if (!this.selectedRow) { return; }
    if (this._seguridadService.isexpired()) { return; }

    const modalRef = this.modal.open(AuditoriaModalComponent, {
      centered: true,
      size: "xl",
      backdrop: "static",
      keyboard: true
    });
    modalRef.componentInstance.tablaNombre = 'users';
    modalRef.componentInstance.registroId = this.selectedRow.id;
  }
}

// ================================================================
// RENDERER DE LA COLUMNA ACCIONES
// ================================================================
// Simple delegador: toda la lógica de modales vive en AllUsersComponent, así no
// se duplica ni deja closures colgando en cada fila renderizada. ag-Grid crea
// una instancia por fila visible y la destruye al salir de pantalla; con
// refresh() devolviendo true la reutiliza al hacer scroll en vez de recrearla.
@Component({
  selector: 'app-button-accion-user',
  standalone: false,
  template: `
    <app-action-buttons
      [accesoModel]="parent.accesoModel"
      [buttonCambioClave]="true"
      [buttonView]="true"
      [buttonEdit]="true"
      [buttonClone]="true"
      [buttonDelete]="true"
      (cambioClave)="parent.cambioClave(params.data)"
      (view)="parent.viewUser(params.data)"
      (edit)="parent.editUser(params.data)"
      (clone)="parent.clonUser(params.data)"
      (delete)="parent.deleteUser(params.data)">
    </app-action-buttons>
  `,
})
export class ButtonAccionUser implements ICellRendererAngularComp {
  public params: any;

  constructor(public parent: AllUsersComponent) { }

  agInit(params: any): void { this.params = params; }

  /** true = ag-Grid reutiliza esta instancia en vez de recrearla en cada scroll. */
  refresh(params: any): boolean { this.params = params; return true; }
}

