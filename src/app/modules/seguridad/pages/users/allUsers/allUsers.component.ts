import { Component, ElementRef, EventEmitter, HostListener, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { MenuContextualComponent, OpcionContextual } from '../../../../../components/menuContextual/menuContextual.component';
import { Subject, firstValueFrom, from, merge, of } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';
import { CellClickedEvent, GridApi, GridReadyEvent, RowNode } from 'ag-grid-community';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { ActivatedRoute, Router } from '@angular/router';
import { ICellRendererAngularComp, AgGridModule } from 'ag-grid-angular';
import { ToastrService } from 'ngx-toastr';

///   SERVICIOS    ///
import { SeguridadService } from '../../../services/seguridad.service';
import { UserService } from '../../../services/user.service';
import { AppPrintPdfService } from '../../../../../service/app-printPdf.service';
import { AppExportExcelService } from '../../../../../service/app-exportExcel.service';
import { AppExportCsvService } from '../../../../../service/app-exportCsv.service';
import { AppAgGridService } from '../../../../../service/app-agGrid.service';
import { AppDescargaService, PeticionDescarga, AccionDescarga }
  from '../../../../../service/app-descarga.service';
import { LoadingService } from '../../../../../service/loading.service';

///   MODELOS    ///
import { UserModel } from "../../../interfaces/userModel";
import { AccesoModel } from '../../../../seguridad/interfaces/accesoModel';

///   COMPONENTES    ///
import { SaveUserComponent } from '../saveUser/saveUser.component';
import { DeleteUserComponent } from '../deleteUser/deleteUser.component';
import { ChangePasswordComponent } from '../change-password/change-password.component';
import { PapeleraUsuariosComponent } from '../../grupos/papeleraUsuarios/papeleraUsuarios.component';
import { AuditoriaModalComponent } from '../../../../../components/auditoria-modal/auditoria-modal.component';
import { CampoBusquedaPaginacionComponent } from '../../../../../components/campos/campoBusquedaPaginacion/campoBusquedaPaginacion.component';
import { etiquetaTipoUsuario } from '../../../interfaces/tipoUsuarioModel';
import { CommonModule } from '@angular/common';
import { PanelComponent } from '../../../../../components/panel/panel.component';
import { ActionButtonsComponent } from '../../../../../components/botones/action-buttons/action-buttons.component';
import { FilasEstirablesDirective } from '../../../../../core/directives/filasEstirables.directive';

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
  standalone: true,
  imports: [
    CommonModule, AgGridModule, FilasEstirablesDirective, PanelComponent, MenuContextualComponent,
    CampoBusquedaPaginacionComponent,
  ],
})
export class AllUsersComponent implements OnInit, OnDestroy {

  /** Pregunta qué descargar (la página o todo) y trae las filas. */
  private readonly _appDescargaService = inject(AppDescargaService);

  // ---------- Estado ----------
  /** Permisos del usuario sobre esta pantalla (crear, reporte, auditar…), del resolver de la ruta. */
  public accesoModel: AccesoModel;
  /** Filas de la página actual — NO el listado completo. */
  public userModel: UserModel[] = [];
  /** Fila marcada en la grilla; habilita el botón de auditoría. */
  public selectedRow: UserModel | null = null;
  /**
   * true mientras la columna ACCIONES está plegada (sólo se ve su cabecera).
   * El renderer de la celda lo usa para pintar un único botón que vuelve a
   * desplegarla: sin eso el usuario no sabe que puede pulsar la cabecera.
   */
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

  // ================================================================
  // MENÚ DEL BOTÓN DERECHO
  // ================================================================
  //
  // Las mismas acciones que la columna ACCIONES, pero sin tener que llegar
  // al final de la fila ni desplegar la columna cuando está plegada.

  @ViewChild('menuCtx') menuCtx!: MenuContextualComponent;

  /** Lo que se ofrece para la fila sobre la que se pulsó. */
  public opcionesContextuales: OpcionContextual[] = [];

  /**
   * Clic derecho sobre la rejilla.
   *
   * La fila la resuelve el servicio común desde el DOM: el evento
   * `cellContextMenu` de ag-Grid no llega (comprobado contra la librería).
   */
  onContextMenuGrilla(e: MouseEvent): void {
    const fila = this._appAgGridService.filaDeEventoEnGrilla(e, this.gridApi);
    if (!fila) { return; }          // fuera de las filas: el menú del navegador

    e.preventDefault();

    this.selectedRow = fila;
    this._appAgGridService.marcarFila(this.gridApi, fila);

    this.opcionesContextuales = this.opcionesPara();
    this.menuCtx?.abrir(e);
  }

  /** Qué se ofrece, según lo que permita el perfil. */
  private opcionesPara(): OpcionContextual[] {
    return [
      { id: 'ver',      texto: 'Ver',       icono: 'fa-eye',
        visible: this.accesoModel?.ver !== false },
      { id: 'editar',   texto: 'Modificar', icono: 'fa-pen',
        visible: this.accesoModel?.editar === true },
      { id: 'clonar',   texto: 'Clonar',    icono: 'fa-clone',
        visible: this.accesoModel?.crear === true,
        ayuda: 'Crear un usuario nuevo copiando los datos de éste' },
      { id: 'eliminar', texto: 'Eliminar',  icono: 'fa-trash',
        peligro: true, separadorAntes: true,
        visible: this.accesoModel?.eliminar === true },
      { id: 'auditoria', texto: 'Ver auditoría', icono: 'fa-user-secret',
        separadorAntes: true,
        visible: this.accesoModel?.auditar === true,
        ayuda: 'Quién tocó este registro y cuándo' },
    ];
  }

  /** Se eligió una opción del menú contextual. */
  alElegirContextual(id: string): void {
    const fila = this.selectedRow as any;
    if (!fila) { return; }

    switch (id) {
      case 'ver':       this.viewUser(fila); break;
      case 'editar':    this.editUser(fila); break;
      case 'clonar':    this.clonUser(fila); break;
      case 'eliminar':  this.deleteUser(fila); break;
      case 'auditoria': this.auditoria(); break;
    }
  }

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
  // ================================================================
  // FILTROS DE LA CABECERA
  // ================================================================
  //
  // Los aplica el SERVIDOR, no la rejilla: esta pantalla pagina, así que
  // ag-Grid sólo tiene las quince filas de la página y filtrar ahí buscaría
  // dentro de quince. La cabecera sólo recoge lo que el usuario pidió.

  /**
   * Las columnas que llevan filtro, y de qué tipo.
   *
   * Tiene que decir lo mismo que la lista blanca de UserController: lo que no
   * esté allí se tira en el servidor, así que ponerlo sólo aquí sería pintar
   * una caja que no filtra.
   *
   * SE FILTRA POR LO QUE SE VE. «Tipo Usuario» enseña el nombre del tipo, no
   * el número que guarda la tabla, y por ese nombre se filtra; «Grupo» sin
   * asignar se enseña y se filtra como «Sin grupo». `isactive` se queda
   * fuera: es una casilla, y escribir texto para filtrarla no se entiende.
   */
  private readonly COLUMNAS_FILTRABLES: { [campo: string]: 'texto' | 'numero' } = {
    id: 'numero',
    login_user: 'texto', surname: 'texto', name: 'texto',
    email: 'texto', phone: 'texto',
    type_user: 'texto', perfil_nombre: 'texto', chorario_nombre: 'texto', grupo_nombre: 'texto',
    created_by: 'texto', updated_by: 'texto',
    // Las fechas, como texto sobre lo que se ve: «2026-10» busca el mes
    last_login_at: 'texto', created_at: 'texto', updated_at: 'texto',
  };

  /** Lo que haya pedido la cabecera, tal cual lo da ag-Grid. */
  public filtrosColumna: any = {};

  /** Para no recargar mientras se limpian los filtros de golpe. */
  private limpiando = false;

  /**
   * Las columnas con su filtro de cabecera.
   *
   * El CÓMO —que la rejilla recoja el filtro pero no lo aplique— vive en
   * AppAgGridService. Aquí queda sólo el QUÉ.
   */
  private conFiltros(columnas: any[]): any[] {
    return this._appAgGridService.filtrosDeServidor(columnas, this.COLUMNAS_FILTRABLES);
  }

  /** La cabecera pidió otra cosa. Siempre a la página 1. */
  onFiltroColumna(): void {
    if (this.limpiando) { return; }
    this.filtrosColumna = this.gridApi?.getFilterModel() ?? {};
    this.paginaActual = 1;
    this.allUsers(1);
  }

  /** Cuántas columnas llevan filtro; el buscador lo enseña y se pone rojo. */
  get cuantasColumnasFiltradas(): number {
    return Object.keys(this.filtrosColumna || {}).length;
  }

  /** Si hay algo que quitar: lo escrito arriba o un filtro de columna. */
  get hayFiltro(): boolean {
    return !!this.searchTerm || this.cuantasColumnasFiltradas > 0;
  }
  initializeGrid(): void {
    this.columnDefs = this.conFiltros([
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
        // Segunda columna y PULSABLE: dar de baja esto era abrir la ficha
        // entera, bajar la casilla y guardar. Ahora se pulsa aqui.
        headerName: 'Activo',
        field: 'isactive',
        cellStyle: { textAlign: 'center' },
        minWidth: 80,
        maxWidth: 80,
        cellRenderer: (params: any) => this.casillaActivo(params),
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
        // El nombre lo manda el back en `type_user_tipo`: la lista vive en
        // seguridad.tipos_usuarios y no se repite en cada pantalla
        cellRenderer: (params: any) => etiquetaTipoUsuario(params.data?.type_user_tipo, params.value)
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
        headerName: 'Grupo',
        field: 'grupo_nombre',
        cellStyle: { textAlign: 'left' },
        minWidth: 120,
        maxWidth: 200,
        valueFormatter: (p: any) => p.value || 'Sin grupo',
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
            <div style="display: flex; align-items: center; justify-content: center; gap: 5px;" title="Ocultar los botones de acción">
              <span>ACCIONES</span>
              <i class="fas fa-arrow-right"></i>
            </div>
          `
        }
      }
    ]);
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

    // Estado para el renderer de la celda: tras este cambio la columna queda
    // al revés de como estaba.
    this.accionesPlegadas = !estabaPlegada;

    const ancho = estabaPlegada
      ? AllUsersComponent.ANCHO_ACCIONES_ABIERTA
      : AllUsersComponent.ANCHO_ACCIONES_PLEGADA;

    actionsCol.minWidth = ancho;
    actionsCol.maxWidth = ancho;
    // Las celdas se ven en los dos estados: plegada, la celda muestra el botón
    // de desplegar (ver renderer al final del fichero), así que ya no se oculta.
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
  public rowClassRules = this._appAgGridService.reglasFilaInactiva('isactive');

  /** Los que se están guardando ahora mismo: su casilla sale como un giro. */
  private readonly activoEnVuelo = new Set<number>();

  /** La casilla de la columna «Activo». */
  private casillaActivo(params: any): string {
    return this._appAgGridService.casillaActivo(params, {
      puede: this.accesoModel?.editar === true,
      enVuelo: this.activoEnVuelo,
      que: 'usuario',
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
  cambiarActivo(fila: UserModel | null, nodo?: RowNode | null): void {
    if (!fila) { return; }
    if (this._seguridadService.isexpired()) { return; }

    this._appAgGridService.alternarActivo({
      gridApi: this.gridApi,
      filas: this.userModel,
      fila, nodo,
      campo: 'isactive',
      enVuelo: this.activoEnVuelo,
      puede: this.accesoModel?.editar === true,
      que: 'usuario',
      llamar: (id, activo) => this._userService.activarUser(id, activo),
      nombre: (f: any) => f.login_user,
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

  /**
   * Pide una página al servidor y la vuelca en la grilla.
   * Actualiza también los contadores de paginación con el meta que devuelve
   * el back (total, per_page, current_page, last_page).
   */
  async allUsers(page: number = 1) {
    try {
      this._loadingService.setLoading(true);

      const res = await firstValueFrom(
        this._userService.allUsers(page, this.registrosPorPagina, this.searchTerm,
                                   this.filtrosColumna)
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
        this._userService.allUsers(1, this.totalRegistros, this.searchTerm,
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

  /** Filas del reporte, ya ordenadas y con el formato de salida. */
  /**
   * Filas del reporte con formato de salida.
   *
   * `ordenarPorNombre` sólo cuando se exporta el listado completo: si se
   * exporta la página hay que respetar lo que el usuario tiene delante.
   * Se ordena sobre una COPIA: `sort` cambia el array que recibe, y el de
   * la página es el de la grilla.
   */
  private filasReporte(usuarios: UserModel[], ordenarPorNombre: boolean = true): any[][] {
    return (ordenarPorNombre
      ? [...usuarios].sort((a, b) => (a.login_user || '').localeCompare(b.login_user || ''))
      : usuarios)
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
    if (!this.hayFiltro) { return; }

    const habiaColumnas = this.cuantasColumnasFiltradas > 0;

    // `limpiando` corta el (filterChanged) que dispara setFilterModel: sin
    // esto se recargaría dos veces, y la primera con los filtros a medias.
    this.limpiando = true;
    // reset() ya vacía el input del buscador: el getElementById que había aquí
    // hacía lo mismo por segunda vez y a nivel de documento.
    this.campoBusquedaPaginacion?.reset();
    this.searchTerm = '';
    this.filtrosColumna = {};
    if (habiaColumnas) { this.gridApi?.setFilterModel(null); }

    // LA BANDERA SE BAJA EN LA SIGUIENTE VUELTA, no aquí: medido contra
    // ag-Grid 28, `setFilterModel` avisa DESPUÉS de esta línea, así que
    // apagándola aquí ese aviso pediría una segunda carga idéntica.
    this.programar(() => { this.limpiando = false; }, 0);

    this.paginaActual = 1;
    this.allUsers(1);
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

  /**
   * Lo que se le pide al servicio de descargas: la misma caja para los
   * tres botones. Él pregunta si hace falta, trae las filas y arma el
   * título con los filtros puestos.
   */
  private peticionDescarga(accion: AccionDescarga): PeticionDescarga<any> {
    return {
      accion,
      nombrePlural: 'usuarios',
      tituloBase: 'Listado de Usuarios',
      gridApi: this.gridApi,
      filasDePagina: this.userModel,
      total: this.totalRegistros,
      pagina: this.paginaActual,
      ultimaPagina: this.ultimaPagina,
      busqueda: this.searchTerm,
      filtrosColumna: this.filtrosColumna,
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
      title: "Reporte de Usuarios",
      titleTable: salida.titulo,
      headers: ['ID', 'Usuario', 'Nombre', 'Apellido', 'Email', 'Activo'],
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
      title: "Reporte de Usuarios",
      titleTable: salida.titulo,
      headers: ['ID', 'Usuario', 'Nombre', 'Apellido', 'Email', 'Activo'],
      data: this.filasReporte(salida.filas, salida.alcance === 'todo'),
      piePagina: 'Pie de página - Mi Empresa en Desarrollo S.A....'
    });
  }

  async exportCsv() {
    const salida = await this._appDescargaService.preparar(this.peticionDescarga('csv'));
    if (!salida) { return; }       // no hay nada que descargar, o canceló

    this._appExportCsvService.generarReporteCSV({
      headers: ['ID', 'Usuario', 'Nombre', 'Apellido', 'Email', 'Activo'],
      data: this.filasReporte(salida.filas, salida.alcance === 'todo'),
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

  /** Papelera de reciclaje: los usuarios eliminados se restauran o se borran de verdad desde ahí. */
  abrirPapelera(): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.modal.open(PapeleraUsuariosComponent, { centered: true, size: 'xl', backdrop: 'static', keyboard: true });
    // El permiso viaja con el modal: allí también hay auditoría, que es como
    // se ve quién borró a alguien sin tener que restaurarlo antes. Sin esta
    // línea el botón no salía al abrir la papelera desde aquí.
    modalRef.componentInstance.puedeAuditar = this.accesoModel?.auditar === true;
    // Y si puede borrar de verdad, que es otro permiso distinto
    modalRef.componentInstance.puedeVaciar = this.accesoModel?.vaciar === true;
    this.escucharModal(modalRef, modalRef.componentInstance.cambio, () => this.allUsers(this.paginaActual));
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
export class ButtonAccionUser implements ICellRendererAngularComp {
  public params: any;

  constructor(public parent: AllUsersComponent) { }

  agInit(params: any): void { this.params = params; }

  /** true = ag-Grid reutiliza esta instancia en vez de recrearla en cada scroll. */
  refresh(params: any): boolean { this.params = params; return true; }
}

