import { Component, ElementRef, EventEmitter, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { Subject, firstValueFrom, from, merge, of } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';
import { CellClickedEvent, GridApi, GridReadyEvent, RowClassParams } from 'ag-grid-community';
import { LOCALE_CONFIG, LocaleService, DefaultLocaleConfig } from 'ngx-daterangepicker-material';
import moment from 'moment';
import Swal from 'sweetalert2';

///   SERVICIOS    ///
import { ClienteService } from '../../services/cliente.service';
import { GestionService, MetaAgenda } from '../../services/gestion.service';
import { RecordatorioGestionesService } from '../../services/recordatorioGestiones.service';
import { SeguridadService } from '../../../seguridad/services/seguridad.service';
import { AppAgGridService } from '../../../../service/app-agGrid.service';
import { LoadingService } from '../../../../service/loading.service';

///   MODELOS    ///
import { ClienteModel, ContactoCliente } from '../../interfaces/clienteModel';
import {
  AsignacionCliente, GestionModel, ResumenGestiones,
  ESTADOS_GESTION, TIPOS_GESTION, PRIORIDADES_GESTION, claseDeResultado, iconoDeTipo, nombreDe, RESULTADOS_GESTION,
} from '../../interfaces/gestionModel';
import { AccesoModel } from '../../../seguridad/interfaces/accesoModel';

///   COMPONENTES    ///
import { ListClientesComponent } from '../clientes/listClientes/listClientes.component';
import { SaveClienteComponent } from '../clientes/saveCliente/saveCliente.component';
import { SaveGestionComponent, ModoGestion } from './saveGestion/saveGestion.component';
import { CerrarGestionComponent } from './cerrarGestion/cerrarGestion.component';
import { ReasignarClienteComponent } from './reasignarCliente/reasignarCliente.component';

type Pestana = 'historial' | 'pendientes' | 'contactos' | 'cartera';
/** Las dos mitades de la pantalla: mi agenda, o el cliente que estoy trabajando. */
type Vista = 'agenda' | 'cliente';
/** Atajos del rango de fechas de la agenda. */
type Rango = 'vencidas' | 'hoy' | 'manana' | 'semana' | 'mes' | 'todo' | 'rango';

/** Lo pendiente de un día, para pintarlo agrupado. */
export interface DiaDeAgenda {
  clave: string;
  titulo: string;
  vencido: boolean;
  items: GestionModel[];
}

/**
 * Gestión de clientes: el puesto de trabajo del vendedor.
 *
 * Se busca el cliente, se selecciona y debajo queda todo lo suyo: la ficha
 * resumida a la izquierda y, a la derecha, el historial de gestiones, lo que
 * está pendiente, sus personas de contacto y por qué vendedores ha pasado.
 * Desde aquí se registra una llamada, se programa la siguiente y se pasa el
 * cliente a otro vendedor.
 *
 * Sin cliente elegido la pantalla no se queda en blanco: muestra la agenda de
 * lo pendiente (lo vencido primero), que es por donde se empieza el día.
 */
@Component({
  selector: 'app-gestion-clientes',
  templateUrl: './gestionClientes.component.html',
  styleUrls: ['./gestionClientes.component.css'],
  standalone: false,
  providers: [
    // El mismo par que saveBoletin e historialAcciones: en la aplicación no
    // hay NgxDaterangepickerMd.forRoot(), así que cada pantalla que use el
    // selector se trae su LocaleService o revienta con NG0201.
    { provide: LOCALE_CONFIG, useValue: DefaultLocaleConfig },
    { provide: LocaleService, useClass: LocaleService, deps: [LOCALE_CONFIG] },
  ],
})
export class GestionClientesComponent implements OnInit, OnDestroy {

  // ---------- Estado ----------
  public accesoModel: AccesoModel;
  public titulo = 'Gestión de clientes';
  public isLoading$ = this._loadingService.isLoading$;

  public cliente: ClienteModel | null = null;
  public resumen: ResumenGestiones | null = null;
  public contactos: ContactoCliente[] = [];
  public asignaciones: AsignacionCliente[] = [];
  public pendientes: GestionModel[] = [];
  public agenda: GestionModel[] = [];

  public pestana: Pestana = 'historial';

  /** El aviso de «última / próxima»; se cierra a mano y vuelve con otro cliente. */
  public hitosVisible = true;

  /**
   * Los paneles de datos del cliente se pliegan enteros: quien pasa el día en
   * el historial no quiere verlos, y quien está llamando sí. Se recuerda.
   */
  public datosVisibles = this.leerDatosVisibles();

  /** Se entra por la agenda: es por donde se empieza el día. */
  public vista: Vista = 'agenda';

  // ---------- Agenda («Lo que toca hacer») ----------
  public agendaMeta: MetaAgenda = { total: 0, vencidas: 0, hoy: 0, mostradas: 0 };
  public rango: Rango = 'todo';
  public desdeFiltro = '';
  public hastaFiltro = '';
  /** Sólo lo que programó quien está usando el CRM; se puede apagar para ver todo. */
  public soloMias = true;
  public cargandoAgenda = false;

  // ---------- La lista de clientes (columna izquierda) ----------
  /**
   * Los clientes se piden por páginas al servidor, como en la grilla de
   * allClientes: con ochenta mil, ni se traen todos ni se busca por cada
   * letra. El buscador consulta al pulsar Enter o la lupa.
   */
  public listaClientes: ClienteModel[] = [];
  public terminoClientes = '';
  public paginaClientes = 1;
  public totalClientes = 0;
  public porPaginaClientes = 15;
  public ultimaPaginaClientes = 1;
  public cargandoClientes = false;

  /** Lo mismo que en la agenda: la respuesta vieja no pisa a la nueva. */
  private peticionClientes = 0;

  /**
   * La grilla es la misma de «Listar clientes», encajada en la columna: se
   * ordena, se filtra por columna, se recorre con las flechas y se abre el
   * cliente con Enter o con un clic en la fila.
   */
  public gridApiClientes!: GridApi;
  public columnDefsClientes: any[] = [];

  /** El cliente que se está gestionando queda marcado en su fila. */
  public rowClassRulesClientes = {
    'fila-actual': (p: RowClassParams) => this.esElElegido(p.data),
  };

  // ---------- Columna de la izquierda ----------
  /**
   * La columna del cliente se pliega, como el panel del mapa.
   *
   * Se recuerda en el navegador: quien trabaja con el historial a pantalla
   * completa no quiere volver a plegarla cada vez que entra.
   */
  public panelOculto = this.leerPanelOculto();

  /**
   * El ancho de la columna se cambia arrastrando el divisor, igual que en el
   * administrador de archivos: hay quien quiere ver la grilla ancha para
   * buscar y quien quiere el historial a pantalla casi completa. También se
   * recuerda por navegador.
   */
  public readonly ANCHO_COLUMNA_DEFECTO = 432;
  public readonly ANCHO_COLUMNA_MIN = 260;
  public readonly ANCHO_COLUMNA_MAX = 760;
  /** Lo que como mínimo se le deja al panel de trabajo de la derecha. */
  private readonly ANCHO_PANEL_MIN = 420;
  private readonly CLAVE_ANCHO_COLUMNA = 'miCRM3.gestion.anchoColumna';

  public anchoColumna = this.leerAnchoColumna();
  /** true mientras se arrastra: quita transiciones y selección de texto. */
  public redimensionando = false;

  /** Menú del clic derecho: dónde está y sobre qué actúa. */
  public menuCtx = { visible: false, x: 0, y: 0 };

  /** Lo que se deja libre por debajo al repartir el alto de la pantalla. */
  // Lo de debajo no es sólo la paginación: también el relleno de la tarjeta
  // del tema y el margen del pie de página. Medido en pantalla: con menos,
  // la página entera se quedaba con una barra de desplazamiento de 30px.
  private readonly MARGEN_ABAJO = 50;
  private readonly MARGEN_PAGINACION = 88;
  private ajusteAltoTimeout: any = null;

  // ---------- Historial (grilla con paginación en servidor) ----------
  public gestiones: GestionModel[] = [];
  public gridApi!: GridApi;
  public columnDefs: any[] = [];
  public paginaActual = 1;
  public totalRegistros = 0;
  public registrosPorPagina = 10;
  public ultimaPagina = 1;
  public filtroTipo: string | null = null;
  public filtroEstado: string | null = null;

  public tipos = TIPOS_GESTION;
  public estados = ESTADOS_GESTION;

  // ---------- La agenda, en grilla y paginada ----------
  /**
   * Antes era una lista de tarjetas agrupadas por día. Con quinientos
   * pendientes eso es una pantalla interminable: ahora es la misma grilla
   * que el resto del sistema, con paginación en el servidor y buscador.
   */
  public gridApiAgenda!: GridApi;
  public columnDefsAgenda: any[] = [];
  public paginaAgenda = 1;
  public porPaginaAgenda = 15;
  public ultimaPaginaAgenda = 1;
  public buscaAgenda = '';

  /**
   * Cada carga lleva número. Con el servidor tardando medio segundo, pulsar
   * dos atajos seguidos dejaba en pantalla los datos del primero: si al
   * volver una respuesta ya hay otra más nueva pedida, se descarta.
   */
  private peticionAgenda = 0;

  /**
   * Los atajos (Hoy, 7 días…) mueven el selector de fechas, y el selector
   * avisa del cambio como si lo hubiera tocado el usuario. Sin esta bandera
   * ese eco llegaba después, con el rango vacío, y deshacía el atajo recién
   * pulsado: se pedía «hoy» y se acababa viendo todo.
   */
  private ajustandoRango = false;

  public rowClassRulesAgenda = {
    'fila-vencida': (p: RowClassParams) => p.data?.vencida === true,
    'fila-hoy':     (p: RowClassParams) => !p.data?.vencida && this.esDeHoy(p.data?.fecha_programada),
  };

  // ---------- El rango de fechas (el selector de los boletines) ----------
  /** null (y no un objeto con nulos) es lo que deja el campo con su texto de «Todas las fechas». */
  public selectedRango: { startDate: moment.Moment; endDate: moment.Moment } | null = null;

  public locale: any = {
    format: 'DD/MM/YYYY',
    displayFormat: 'DD/MM/YYYY',
    separator: ' - ',
    applyLabel: 'Aplicar',
    cancelLabel: 'Cancelar',
    clearLabel: 'Limpiar',
    customRangeLabel: 'Personalizado',
    daysOfWeek: ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'],
    monthNames: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
    firstDay: 1,
  };

  /** Atajos del selector: los de una agenda comercial. */
  public ranges: any = {
    'Hoy': [moment(), moment()],
    'Mañana': [moment().add(1, 'days'), moment().add(1, 'days')],
    'Próximos 7 días': [moment(), moment().add(7, 'days')],
    'Este mes': [moment().startOf('month'), moment().endOf('month')],
    'Mes que viene': [moment().add(1, 'month').startOf('month'), moment().add(1, 'month').endOf('month')],
    'Lo atrasado': [moment().subtract(1, 'year'), moment().subtract(1, 'days')],
  };

  public rowClassRules = {
    'fila-vencida':   (p: RowClassParams) => p.data?.vencida === true,
    'fila-pendiente': (p: RowClassParams) => p.data?.estado === 'PENDIENTE' && !p.data?.vencida,
  };

  private readonly unsubscribe$ = new Subject<void>();

  @ViewChild('menuCtxEl') menuCtxEl?: ElementRef<HTMLElement>;

  constructor(
    private host: ElementRef<HTMLElement>,
    private modal: NgbModal,
    private route: Router,
    private activeRoute: ActivatedRoute,
    private _toastr: ToastrService,
    private _loadingService: LoadingService,
    private _seguridadService: SeguridadService,
    private _clienteService: ClienteService,
    private _gestionService: GestionService,
    private _recordatorios: RecordatorioGestionesService,
    public _appAgGridService: AppAgGridService,
  ) {
    this.accesoModel = this.activeRoute.snapshot.data['access'];
  }

  ngOnInit(): void {
    this.initializeGrid();
    this.initializeGridClientes();
    this.initializeGridAgenda();
    this.cargarAgenda();
    this.cargarClientes(1);

    // Se puede llegar con el cliente en la url (?cliente=9), que es como
    // entra el recordatorio cuando se pulsa «Abrir el cliente»
    const idEnLaUrl = Number(this.activeRoute.snapshot.queryParamMap.get('cliente'));
    if (idEnLaUrl) { this.seleccionarCliente({ id: idEnLaUrl }); }

    // Si el recordatorio cierra una gestión, lo que hay en pantalla ya no es fiel
    this._recordatorios.cambio$
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe(g => {
        if (this.cliente?.id && g?.cliente_id === this.cliente.id) { this.refrescar(); }
        this.cargarAgenda();
      });
  }

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
    this.modal.dismissAll();
  }

  fun_home(): void { this.route.navigate(['/ventas']); }

  /** Suscribe al @Output de un modal y corta al cerrarse o al destruir la pantalla. */
  private escucharModal<T>(modalRef: NgbModalRef, salida: EventEmitter<T>, alEmitir: (valor: T) => void): void {
    const modalCerrado$ = from(modalRef.result).pipe(catchError(() => of(null)));
    salida
      .pipe(takeUntil(merge(this.unsubscribe$, modalCerrado$)))
      .subscribe({ next: alEmitir, error: (err) => console.error('Error en el modal:', err) });
  }

  // ================================================================
  // LA LISTA DE CLIENTES
  // ================================================================

  /** Una página de clientes, con el filtro que esté escrito. */
  async cargarClientes(page: number = 1): Promise<void> {
    const mia = ++this.peticionClientes;
    try {
      this.cargandoClientes = true;
      this.gridApiClientes?.showLoadingOverlay();
      const res: any = await firstValueFrom(
        this._clienteService.allClientes(page, this.porPaginaClientes, this.terminoClientes)
      );

      if (mia !== this.peticionClientes) { return; }

      this.listaClientes = res.body?.data?.data ?? [];
      const meta = res.body?.data?.meta;
      if (meta) {
        this.totalClientes = meta.total;
        this.porPaginaClientes = meta.per_page;
        this.paginaClientes = meta.current_page;
        this.ultimaPaginaClientes = meta.last_page;
      }
    } catch (error) {
      // El AuthInterceptor ya muestra el toast del error HTTP
      console.error('Error al cargar los clientes:', error);
      if (mia === this.peticionClientes) { this.listaClientes = []; }
    } finally {
      if (mia !== this.peticionClientes) { return; }
      this.cargandoClientes = false;
      // El cartel de la grilla: o se quita, o dice que no hubo resultados
      if (this.listaClientes.length) { this.gridApiClientes?.hideOverlay(); }
      else { this.gridApiClientes?.showNoRowsOverlay(); }
    }
  }

  /** Lo emite el buscador al pulsar Enter o la lupa; nunca mientras se teclea. */
  buscarClientes(termino?: string): void {
    this.terminoClientes = (termino ?? '').trim();
    this.cargarClientes(1);
  }

  public get desdeClientes(): number {
    return this.totalClientes === 0 ? 0 : (this.paginaClientes - 1) * this.porPaginaClientes + 1;
  }

  public get hastaClientes(): number {
    return Math.min(this.paginaClientes * this.porPaginaClientes, this.totalClientes);
  }

  irAPaginaClientes(page: number): void {
    if (page < 1 || page > this.ultimaPaginaClientes || page === this.paginaClientes) { return; }
    this.cargarClientes(page);
  }

  /** ¿Es el que se está gestionando? Para marcarlo en la grilla. */
  esElElegido(c: ClienteModel): boolean {
    return !!this.cliente && c?.id === this.cliente.id;
  }

  /**
   * Las columnas: las tres que identifican al cliente sin sacar una barra de
   * desplazamiento horizontal en una columna estrecha. El resto (ciudad,
   * correo, activo, cupo) está en la ficha de la derecha, y el listado
   * completo con todas sus columnas sigue a un clic derecho de distancia.
   */
  initializeGridClientes(): void {
    this.columnDefsClientes = [
      {
        headerName: 'Cliente',
        field: 'nombre_completo',
        cellStyle: { textAlign: 'left' },
        minWidth: 170,
        cellRenderer: (params: any) => {
          const icono = params.data?.tipo_cliente === 'EMPRESA' ? 'fa-building' : 'fa-user';
          const nombre = params.value ?? '';
          const actual = this.esElElegido(params.data)
            ? ' <span class="gc-chip">Actual</span>'
            : '';
          const estado = params.data?.estado && params.data.estado !== 'ACTIVO'
            ? ` <span class="gc-chip gc-chip--aviso">${params.data.estado}</span>`
            : '';
          return `<i class="fa ${icono} fa-fw me-1 text-secondary"></i>${nombre}${actual}${estado}`;
        }
      },
      {
        headerName: 'Identificación',
        field: 'numero_identificacion',
        cellStyle: { textAlign: 'center' },
        minWidth: 95,
        maxWidth: 110,
      },
      {
        headerName: 'Teléfono',
        field: 'celular',
        cellStyle: { textAlign: 'center' },
        minWidth: 95,
        maxWidth: 110,
        valueGetter: (p: any) => p.data?.celular || p.data?.telefono || '',
      },
    ];
  }

  onGridReadyClientes(params: GridReadyEvent): void {
    this.gridApiClientes = params.api;
    this._appAgGridService.ajustarTamanoGrid(this.gridApiClientes);
    this.replantearAltos();
  }

  /** ↑ / ↓ recorren la grilla; el Enter de abajo es el que abre el cliente. */
  navegarConTecladoClientes = this._appAgGridService.navegacionConFlechas();

  onCellKeyDownClientes(e: any): void {
    if (e.event?.key === 'Enter' && e.data) { this.seleccionarCliente(e.data); }
  }

  /** Toda la fila abre el cliente, no hace falta apuntar a un botón. */
  onCellClickedClientes(e: CellClickedEvent): void {
    if (e.data) { this.seleccionarCliente(e.data); }
  }

  /** El cartel de «no hay filas», que cambia si hay una búsqueda escrita. */
  public get vacioClientes(): string {
    return this.terminoClientes
      ? `<span>Ningún cliente coincide con «${this.terminoClientes}».</span>`
      : '<span>Todavía no hay clientes registrados.</span>';
  }

  // ================================================================
  // ELEGIR EL CLIENTE
  // ================================================================

  /**
   * El selector con paginación en servidor.
   *
   * Antes había además un buscador que consultaba mientras se escribía; con
   * ochenta mil clientes eso es una consulta por letra y se notaba. El
   * selector pide de a una página y trae su propio buscador, que sólo
   * consulta al pulsar Enter.
   */
  abrirSelectorClientes(): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.modal.open(ListClientesComponent, { size: 'lg', centered: true, backdrop: 'static' });
    modalRef.componentInstance.clienteSeleccionadoId = this.cliente?.id;
    modalRef.componentInstance.ayuda = 'Haz clic sobre el cliente que vas a gestionar.';
    this.escucharModal(modalRef, modalRef.componentInstance.seleccionado, (c: any) => this.seleccionarCliente(c));
  }

  /**
   * Suelta el cliente que se estaba mirando.
   *
   * @param irALaAgenda true (lo que hace la opción «Quitar el cliente» del
   *        menú) lleva además a «Lo que toca hacer»; false se queda en esta
   *        pestaña, que es lo que conviene cuando se limpia el buscador: la
   *        columna derecha pasa a enseñar el tablero.
   */
  limpiarCliente(irALaAgenda: boolean = true): void {
    this.cliente = null;
    this.resumen = null;
    this.contactos = [];
    this.asignaciones = [];
    this.pendientes = [];
    this.gestiones = [];
    this.totalRegistros = 0;
    this.gridApi?.setRowData([]);
    this.gridApiClientes?.redrawRows();

    if (irALaAgenda) {
      this.vista = 'agenda';
      this.cargarAgenda();
    }
    this.replantearAltos(200);
  }

  /**
   * La × del buscador de clientes: el listado vuelve a estar completo (de eso
   * se encarga la búsqueda vacía que emite el propio campo) y, ya puestos, se
   * suelta el cliente elegido —que es lo que pide quien borra la búsqueda para
   * empezar con otro—.
   */
  alLimpiarBusquedaClientes(): void {
    if (this.cliente) { this.limpiarCliente(false); }
  }

  // ================================================================
  // LA COLUMNA DE LA IZQUIERDA
  // ================================================================

  private leerPanelOculto(): boolean {
    try { return localStorage.getItem('miCRM3.gestion.panelOculto') === '1'; } catch { return false; }
  }

  /**
   * Arrastre del divisor. Se usa pointer capture: el propio divisor sigue
   * recibiendo los movimientos aunque el cursor se salga de él o de la
   * ventana, y suelta sólo al levantar el botón.
   */
  iniciarRedimension(ev: PointerEvent): void {
    if (ev.button !== 0 || this.panelOculto) { return; }
    ev.preventDefault();

    const divisor = ev.currentTarget as HTMLElement;
    const xInicial = ev.clientX;
    const anchoInicial = this.anchoColumna;
    this.redimensionando = true;
    divisor.setPointerCapture(ev.pointerId);

    const mover = (e: PointerEvent) => {
      this.anchoColumna = this.limitarAncho(anchoInicial + (e.clientX - xInicial));
      // Las columnas de la grilla acompañan al arrastre
      this.gridApiClientes?.sizeColumnsToFit();
    };
    const soltar = (e: PointerEvent) => {
      divisor.removeEventListener('pointermove', mover);
      divisor.removeEventListener('pointerup', soltar);
      divisor.removeEventListener('pointercancel', soltar);
      divisor.releasePointerCapture(e.pointerId);
      this.redimensionando = false;
      this.guardarAnchoColumna();
      // La del historial recupera el sitio que quedó al otro lado
      setTimeout(() => this.gridApi?.sizeColumnsToFit(), 60);
    };

    divisor.addEventListener('pointermove', mover);
    divisor.addEventListener('pointerup', soltar);
    divisor.addEventListener('pointercancel', soltar);
  }

  /** Con el foco en el divisor, las flechas lo mueven sin ratón. */
  onTeclaDivisor(ev: KeyboardEvent): void {
    const paso = ev.shiftKey ? 48 : 16;
    let nuevo: number | null = null;

    if (ev.key === 'ArrowLeft')  { nuevo = this.anchoColumna - paso; }
    if (ev.key === 'ArrowRight') { nuevo = this.anchoColumna + paso; }
    if (ev.key === 'Home')       { nuevo = this.ANCHO_COLUMNA_MIN; }
    if (ev.key === 'End')        { nuevo = this.ANCHO_COLUMNA_MAX; }
    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); this.alternarPanel(); return; }
    if (nuevo === null) { return; }

    ev.preventDefault();
    this.anchoColumna = this.limitarAncho(nuevo);
    this.guardarAnchoColumna();
    setTimeout(() => { this.gridApiClientes?.sizeColumnsToFit(); this.gridApi?.sizeColumnsToFit(); }, 60);
  }

  /** Doble clic en el divisor: el ancho de siempre. */
  restablecerAncho(): void {
    this.anchoColumna = this.limitarAncho(this.ANCHO_COLUMNA_DEFECTO);
    this.guardarAnchoColumna();
    setTimeout(() => { this.gridApiClientes?.sizeColumnsToFit(); this.gridApi?.sizeColumnsToFit(); }, 60);
  }

  /**
   * Entre el mínimo y el máximo, y además sin ahogar al panel de la derecha:
   * en una pantalla estrecha el tope real es menor que ANCHO_COLUMNA_MAX.
   */
  private limitarAncho(px: number): number {
    const cuerpo = this.host.nativeElement.querySelector('.gc-cuerpo') as HTMLElement | null;
    const disponible = cuerpo ? cuerpo.clientWidth - this.ANCHO_PANEL_MIN : this.ANCHO_COLUMNA_MAX;
    const techo = Math.max(this.ANCHO_COLUMNA_MIN, Math.min(this.ANCHO_COLUMNA_MAX, disponible));
    return Math.round(Math.min(techo, Math.max(this.ANCHO_COLUMNA_MIN, px)));
  }

  private guardarAnchoColumna(): void {
    try { localStorage.setItem(this.CLAVE_ANCHO_COLUMNA, String(this.anchoColumna)); } catch { /* sin storage */ }
  }

  private leerAnchoColumna(): number {
    try {
      const v = Number(localStorage.getItem('miCRM3.gestion.anchoColumna'));
      if (v >= 260 && v <= 760) { return v; }
    } catch { /* sin storage */ }
    return 432;
  }

  alternarPanel(): void {
    this.panelOculto = !this.panelOculto;
    try { localStorage.setItem('miCRM3.gestion.panelOculto', this.panelOculto ? '1' : '0'); } catch { /* sin storage */ }
    // Las dos grillas recalculan sus anchos: la del historial gana el hueco
    // que deja la columna, y la de clientes lo recupera al volver
    setTimeout(() => {
      this.gridApi?.sizeColumnsToFit();
      this.gridApiClientes?.sizeColumnsToFit();
    }, 300);
  }

  // ================================================================
  // EL ALTO DE LA PANTALLA
  // ================================================================

  /**
   * Da a cada grilla el alto que queda hasta el borde de la ventana, igual
   * que allUsers: con un alto fijo, en un portátil sobra media pantalla y en
   * un monitor grande se desperdicia la mitad.
   *
   * Se llama al arrancar, al cambiar de pestaña o de vista, al plegar algo y
   * cuando cambia el tamaño de la ventana.
   */
  ajustarAltos(): void {
    const host = this.host.nativeElement;

    // Las dos columnas: llenan hasta abajo y el scroll va por dentro
    const cuerpo = host.querySelector('.gc-cuerpo') as HTMLElement | null;
    if (cuerpo) {
      const alto = window.innerHeight - cuerpo.getBoundingClientRect().top - this.MARGEN_ABAJO;
      cuerpo.style.height = Math.max(alto, 360) + 'px';
    }

    // La grilla de la agenda deja sitio para su paginación
    const agenda = host.querySelector('.agenda-grilla') as HTMLElement | null;
    if (agenda) {
      const alto = window.innerHeight - agenda.getBoundingClientRect().top - this.MARGEN_PAGINACION;
      agenda.style.height = Math.max(alto, 240) + 'px';
    }

    // La del historial va DENTRO del panel de la derecha, que ya está
    // ajustado a la ventana y tiene su propio scroll: se mide contra el panel
    // y no contra la ventana, o se le daba el mínimo y se salía por abajo.
    const panel = host.querySelector('.gc-panel__contenido') as HTMLElement | null;
    const historial = host.querySelector('.gestion-grilla') as HTMLElement | null;
    if (panel && historial) {
      // Cuánto hay por encima de la grilla dentro del panel (la barra, las
      // tarjetas, los contadores y las pestañas), contando lo ya desplazado
      const arriba = historial.getBoundingClientRect().top - panel.getBoundingClientRect().top + panel.scrollTop;
      const alto = panel.clientHeight - arriba - this.MARGEN_PAGINACION;
      historial.style.height = Math.max(alto, 220) + 'px';
    }

    // Ya con el ancho definitivo, las columnas se reparten
    setTimeout(() => {
      this.gridApi?.sizeColumnsToFit();
      this.gridApiAgenda?.sizeColumnsToFit();
      this.gridApiClientes?.sizeColumnsToFit();
    }, 80);
  }

  /** Lo llaman los sitios donde algo aparece o desaparece: se mide después de pintar. */
  private replantearAltos(espera: number = 120): void {
    setTimeout(() => this.ajustarAltos(), espera);
  }

  /** Lo mismo, desde la plantilla: al cambiar de pestaña cambia lo que se ve. */
  replantear(): void {
    this.replantearAltos(160);
  }

  // ================================================================
  // MENÚ DEL CLIC DERECHO
  // ================================================================

  /** Las mismas acciones que los botones, donde esté el puntero. */
  onContextMenu(ev: MouseEvent): void {
    // Dentro de un campo o de la grilla manda el menú del navegador / de ag-Grid
    const destino = ev.target as HTMLElement;
    if (destino.closest('input, textarea, select, .ag-root-wrapper')) { return; }

    ev.preventDefault();
    this.menuCtx = { visible: true, x: ev.clientX, y: ev.clientY };

    // Si se sale de la pantalla, se recoloca
    setTimeout(() => {
      const el = this.menuCtxEl?.nativeElement;
      if (!el) { return; }
      const r = el.getBoundingClientRect();
      if (r.right > window.innerWidth)   { this.menuCtx.x = Math.max(0, window.innerWidth - r.width - 8); }
      if (r.bottom > window.innerHeight) { this.menuCtx.y = Math.max(0, window.innerHeight - r.height - 8); }
    });
  }

  cerrarMenu(): void {
    if (this.menuCtx.visible) { this.menuCtx.visible = false; }
  }

  @HostListener('document:click')
  @HostListener('document:keydown.escape')
  @HostListener('window:scroll')
  onCerrarMenuGlobal(): void { this.cerrarMenu(); }

  /**
   * Al cambiar el tamaño de la ventana se cierra el menú y se vuelve a
   * repartir el alto. Con retardo: redimensionar dispara decenas de eventos
   * y medir en todos ellos hace que la pantalla dé tirones.
   */
  @HostListener('window:resize')
  onRedimensionar(): void {
    this.cerrarMenu();
    if (this.ajusteAltoTimeout) { clearTimeout(this.ajusteAltoTimeout); }
    this.ajusteAltoTimeout = setTimeout(() => this.ajustarAltos(), 150);
  }

  // ================================================================
  // CARGAR TODO LO DEL CLIENTE
  // ================================================================

  async seleccionarCliente(cliente: any): Promise<void> {
    if (!cliente?.id) { return; }
    this.replantearAltos(200);
    this.vista = 'cliente';
    this.pestana = 'historial';
    this.hitosVisible = true;
    this.paginaActual = 1;

    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._clienteService.findByIdCliente(cliente.id));
      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo abrir el cliente', 'Error');
        return;
      }
      this.cliente = res.data;
      // La marca de «Actual» viaja de una fila a otra
      this.gridApiClientes?.redrawRows();
      await Promise.all([
        this.cargarGestiones(1),
        this.cargarResumen(),
        this.cargarContactos(),
        this.cargarAsignaciones(),
        this.cargarPendientes(),
      ]);
    } catch (error) {
      console.error('Error al abrir el cliente:', error);
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  /** Vuelve a pedirlo todo (tras guardar, cerrar o reasignar). */
  private async refrescar(): Promise<void> {
    if (!this.cliente?.id) { return; }
    await Promise.all([
      this.cargarGestiones(this.paginaActual),
      this.cargarResumen(),
      this.cargarPendientes(),
    ]);
  }

  async cargarResumen(): Promise<void> {
    if (!this.cliente?.id) { return; }
    try {
      const res: any = await firstValueFrom(this._gestionService.resumen(this.cliente.id));
      this.resumen = res?.status === 'success' ? res.data : null;
    } catch (error) {
      console.error('Error al cargar el resumen:', error);
    }
  }

  async cargarContactos(): Promise<void> {
    if (!this.cliente?.id) { return; }
    try {
      const res: any = await firstValueFrom(this._clienteService.listContactos(this.cliente.id));
      this.contactos = res?.status === 'success' ? (res.data ?? []) : [];
    } catch (error) {
      console.error('Error al cargar los contactos:', error);
      this.contactos = [];
    }
  }

  async cargarAsignaciones(): Promise<void> {
    if (!this.cliente?.id) { return; }
    try {
      const res: any = await firstValueFrom(this._gestionService.asignaciones(this.cliente.id));
      this.asignaciones = res?.status === 'success' ? (res.data ?? []) : [];
    } catch (error) {
      console.error('Error al cargar el historial de cartera:', error);
      this.asignaciones = [];
    }
  }

  /** Lo pendiente del cliente (la pestaña «Pendientes»). */
  async cargarPendientes(): Promise<void> {
    if (!this.cliente?.id) { return; }
    try {
      const res: any = await firstValueFrom(
        this._gestionService.allGestiones(this.cliente.id, 1, 50, '', { estado: 'PENDIENTE' })
      );
      this.pendientes = res.body?.data?.data ?? [];
    } catch (error) {
      console.error('Error al cargar lo pendiente:', error);
      this.pendientes = [];
    }
  }

  // ================================================================
  // LA AGENDA: TODO LO PENDIENTE, DE TODOS MIS CLIENTES
  // ================================================================

  /** Una página de lo que toca hacer, con el rango de fechas que esté elegido. */
  async cargarAgenda(page: number = this.paginaAgenda): Promise<void> {
    const mia = ++this.peticionAgenda;
    try {
      this.cargandoAgenda = true;
      this.gridApiAgenda?.showLoadingOverlay();

      const res: any = await firstValueFrom(this._gestionService.agendaPaginada({
        mias: this.soloMias,
        soloVencidas: this.rango === 'vencidas',
        desde: this.rango === 'vencidas' ? null : (this.desdeFiltro || null),
        hasta: this.rango === 'vencidas' ? null : (this.hastaFiltro || null),
        search: this.buscaAgenda,
        page,
        perPage: this.porPaginaAgenda,
      }));

      // Llegó tarde: ya se pidió otra cosa y esto pintaría el filtro viejo
      if (mia !== this.peticionAgenda) { return; }

      if (res?.status === 'success') {
        this.agenda = res.data?.data ?? [];
        this.agendaMeta = res.data?.meta ?? { total: 0, vencidas: 0, hoy: 0, mostradas: 0 };
        this.paginaAgenda = this.agendaMeta.current_page ?? page;
        this.ultimaPaginaAgenda = this.agendaMeta.last_page ?? 1;
      } else {
        this.agenda = [];
        this.agendaMeta = { total: 0, vencidas: 0, hoy: 0, mostradas: 0 };
      }
    } catch (error) {
      console.error('Error al cargar la agenda:', error);
      if (mia === this.peticionAgenda) { this.agenda = []; }
    } finally {
      if (mia === this.peticionAgenda) {
        this.cargandoAgenda = false;
        if (this.agenda.length) { this.gridApiAgenda?.hideOverlay(); }
        else { this.gridApiAgenda?.showNoRowsOverlay(); }
      }
    }
  }

  // ---------- La grilla ----------

  /**
   * Las columnas: cuándo toca (con el aviso de vencida), de quién es, qué
   * hay que hacer y los dos botones que se usan de verdad —cerrarla o irse
   * al cliente—.
   */
  initializeGridAgenda(): void {
    this.columnDefsAgenda = [
      {
        headerName: 'Cuándo',
        field: 'fecha_programada',
        minWidth: 135,
        maxWidth: 165,
        cellStyle: { textAlign: 'left' },
        cellRenderer: (p: any) => {
          const f = this.fechaCorta(p.value);
          if (p.data?.vencida) { return `<span class="agenda-cuando is-vencida"><i class="fa fa-triangle-exclamation fa-fw"></i>${f}</span>`; }
          if (this.esDeHoy(p.value)) { return `<span class="agenda-cuando is-hoy"><i class="fa fa-star fa-fw"></i>${f}</span>`; }
          return `<span class="agenda-cuando">${f}</span>`;
        },
      },
      {
        headerName: 'Cliente',
        field: 'cliente_nombre',
        minWidth: 170,
        cellStyle: { textAlign: 'left' },
      },
      {
        headerName: 'Tipo',
        field: 'tipo',
        minWidth: 105,
        maxWidth: 125,
        cellStyle: { textAlign: 'left' },
        cellRenderer: (p: any) => `<i class="fa ${iconoDeTipo(p.value)} fa-fw me-1 text-muted"></i>${nombreDe(this.tipos, p.value)}`,
      },
      {
        headerName: 'Asunto',
        field: 'asunto',
        minWidth: 180,
        cellStyle: { textAlign: 'left' },
      },
      {
        headerName: 'Prioridad',
        field: 'prioridad',
        minWidth: 90,
        maxWidth: 100,
        cellStyle: { display: 'flex', justifyContent: 'center', alignItems: 'center' },
        cellRenderer: (p: any) => {
          const clase = p.value === 'ALTA' ? 'bg-danger' : (p.value === 'BAJA' ? 'bg-secondary' : 'bg-warning text-dark');
          return `<span class="badge ${clase} fs-10px">${nombreDe(PRIORIDADES_GESTION, p.value)}</span>`;
        },
      },
      {
        headerName: 'Teléfono',
        field: 'telefono',
        minWidth: 110,
        maxWidth: 130,
        cellStyle: { textAlign: 'left' },
        // El de la gestión si se anotó; si no, el del cliente: esta grilla
        // es una lista de llamadas y el número tiene que estar a la vista
        valueGetter: (p: any) => p.data?.telefono || p.data?.cliente_telefono || '',
      },
      {
        headerName: 'Vendedor',
        field: 'empleado_nombre',
        minWidth: 130,
        cellStyle: { textAlign: 'left' },
      },
      {
        headerName: 'Acciones',
        field: 'acciones',
        pinned: 'right',
        minWidth: 86,
        maxWidth: 86,
        sortable: false,
        resizable: false,
        filter: false,
        suppressMenu: true,
        cellStyle: { display: 'flex', justifyContent: 'center', alignItems: 'center' },
        cellRenderer: () => `
          <span class="gestion-acciones">
            <button type="button" class="btn btn-xs btn-success" data-accion="cerrar" title="Marcar como hecha"><i class="fa fa-check"></i></button>
            <button type="button" class="btn btn-xs btn-white" data-accion="abrir" title="Abrir el cliente"><i class="fa fa-arrow-right"></i></button>
          </span>`,
      },
    ];
  }

  onGridReadyAgenda(params: GridReadyEvent): void {
    this.gridApiAgenda = params.api;
    this._appAgGridService.ajustarTamanoGrid(this.gridApiAgenda);
    this.replantearAltos();
  }

  navegarConTecladoAgenda = this._appAgGridService.navegacionConFlechas();

  /** Los botones de la columna Acciones y el doble propósito de la fila. */
  onCellClickedAgenda(e: CellClickedEvent): void {
    const destino = (e.event?.target as HTMLElement)?.closest('[data-accion]') as HTMLElement | null;
    if (destino?.dataset['accion'] === 'cerrar') { this.cerrarDesdeAgenda(e.data); return; }
    if (destino?.dataset['accion'] === 'abrir')  { this.irAlCliente(e.data); return; }
  }

  onCellKeyDownAgenda(e: any): void {
    if (e.event?.key === 'Enter' && e.data) { this.irAlCliente(e.data); }
  }

  /** Lo emite el buscador al pulsar Enter o la lupa. */
  buscarEnAgenda(termino?: string): void {
    this.buscaAgenda = (termino ?? '').trim();
    this.cargarAgenda(1);
  }

  irAPaginaAgenda(page: number): void {
    if (page < 1 || page > this.ultimaPaginaAgenda || page === this.paginaAgenda) { return; }
    this.cargarAgenda(page);
  }

  public get desdeAgenda(): number {
    return this.agendaMeta.total === 0 ? 0 : (this.paginaAgenda - 1) * this.porPaginaAgenda + 1;
  }

  public get hastaAgenda(): number {
    return Math.min(this.paginaAgenda * this.porPaginaAgenda, this.agendaMeta.total);
  }

  /** «27/09 14:30», que es lo que cabe en la columna. */
  private fechaCorta(iso?: string | null): string {
    if (!iso) { return ''; }
    const d = new Date(String(iso).replace(' ', 'T'));
    if (isNaN(d.getTime())) { return String(iso); }
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm} ${hh}:${mi}`;
  }

  private esDeHoy(iso?: string | null): boolean {
    if (!iso) { return false; }
    const d = new Date(String(iso).replace(' ', 'T'));
    const hoy = new Date();
    return d.getFullYear() === hoy.getFullYear() && d.getMonth() === hoy.getMonth() && d.getDate() === hoy.getDate();
  }

  /**
   * El selector de rango (el mismo de los boletines). Limpiarlo equivale a
   * «Todo»; elegir dos fechas deja el rango a mano.
   */
  onRangoFechas(rango: { startDate: any; endDate: any } | null): void {
    // Viene de haber pulsado un atajo: ya se cargó con esas fechas
    if (this.ajustandoRango) { return; }

    // El valor lo guarda el componente, no el propio selector: con
    // [(ngModel)] el picker devolvía su versión del rango y borraba la que
    // acababa de poner un atajo (se pedía «Hoy» y el campo quedaba vacío).
    // Se escribe con la bandera puesta porque al escribirlo el picker vuelve
    // a emitir, y sin ella esto se llamaba a sí mismo sin parar.
    this.ajustandoRango = true;
    setTimeout(() => { this.ajustandoRango = false; });
    this.selectedRango = rango?.startDate && rango?.endDate
      ? { startDate: rango.startDate, endDate: rango.endDate }
      : null;

    if (!rango?.startDate || !rango?.endDate) {
      this.desdeFiltro = '';
      this.hastaFiltro = '';
      this.rango = 'todo';
    } else {
      // .format() del propio objeto (dayjs o moment), nunca moment(obj)
      this.desdeFiltro = rango.startDate.format('YYYY-MM-DD');
      this.hastaFiltro = rango.endDate.format('YYYY-MM-DD');
      this.rango = 'rango';
    }
    this.cargarAgenda(1);
  }

  /** Los atajos de arriba: hoy, mañana, la semana… */
  elegirRango(rango: Rango): void {
    this.rango = rango;
    const hoy = new Date();

    switch (rango) {
      case 'vencidas':
      case 'todo':
        this.desdeFiltro = '';
        this.hastaFiltro = '';
        break;
      case 'hoy':
        this.desdeFiltro = this.aIso(hoy);
        this.hastaFiltro = this.aIso(hoy);
        break;
      case 'manana': {
        const m = new Date(hoy);
        m.setDate(m.getDate() + 1);
        this.desdeFiltro = this.aIso(m);
        this.hastaFiltro = this.aIso(m);
        break;
      }
      case 'semana': {
        // De hoy a siete días: es como se mira una agenda comercial
        const f = new Date(hoy);
        f.setDate(f.getDate() + 7);
        this.desdeFiltro = this.aIso(hoy);
        this.hastaFiltro = this.aIso(f);
        break;
      }
      case 'mes': {
        const fin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
        this.desdeFiltro = this.aIso(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
        this.hastaFiltro = this.aIso(fin);
        break;
      }
      case 'rango':
        // Las fechas las pone el usuario; no se tocan
        break;
    }

    // El selector de fechas acompaña al atajo que se pulsó; lo que emita a
    // continuación es eco, no una elección del usuario
    this.ajustandoRango = true;
    setTimeout(() => { this.ajustandoRango = false; });
    this.selectedRango = this.desdeFiltro && this.hastaFiltro
      ? { startDate: moment(this.desdeFiltro, 'YYYY-MM-DD'), endDate: moment(this.hastaFiltro, 'YYYY-MM-DD') }
      : null;

    this.cargarAgenda(1);
  }

  /** Cambió una de las dos fechas a mano. */
  cambiarFecha(cual: 'desde' | 'hasta', valor: string): void {
    if (cual === 'desde') { this.desdeFiltro = valor; } else { this.hastaFiltro = valor; }
    this.rango = 'rango';
    this.cargarAgenda();
  }

  alternarMias(): void {
    this.paginaAgenda = 1;
    this.soloMias = !this.soloMias;
    this.cargarAgenda();
  }

  private aIso(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  /**
   * Lo pendiente repartido por días, con «Vencidas», «Hoy» y «Mañana» por
   * nombre: una lista plana de cuarenta llamadas no se lee.
   */
  get agendaAgrupada(): DiaDeAgenda[] {
    const hoy = this.aIso(new Date());
    const manana = new Date();
    manana.setDate(manana.getDate() + 1);
    const maniana = this.aIso(manana);
    const ahora = Date.now();

    const grupos = new Map<string, DiaDeAgenda>();

    for (const g of this.agenda) {
      const fecha = (g.fecha_programada ?? '').substring(0, 10);
      const vencida = !!g.fecha_programada && new Date(String(g.fecha_programada).replace(' ', 'T')).getTime() < ahora;

      // Todo lo vencido va junto arriba, aunque sea de días distintos
      const clave = vencida ? '0-vencidas' : fecha;
      if (!grupos.has(clave)) {
        grupos.set(clave, {
          clave,
          titulo: vencida ? 'Vencidas'
                : fecha === hoy ? 'Hoy'
                : fecha === maniana ? 'Mañana'
                : this.tituloDeFecha(fecha),
          vencido: vencida,
          items: [],
        });
      }
      grupos.get(clave)!.items.push(g);
    }

    return [...grupos.values()].sort((a, b) => a.clave.localeCompare(b.clave));
  }

  /** «2026-09-30» → «martes, 30 de septiembre». */
  private tituloDeFecha(iso: string): string {
    if (!iso) { return 'Sin fecha'; }
    const [a, m, d] = iso.split('-').map(Number);
    const fecha = new Date(a, (m || 1) - 1, d || 1);
    const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    return `${dias[fecha.getDay()]}, ${fecha.getDate()} de ${meses[fecha.getMonth()]}`;
  }

  /** La hora suelta de una gestión, para la lista de la agenda. */
  horaDe(g: GestionModel): string {
    return (g.fecha_programada ?? '').substring(11, 16);
  }

  /** Cierra desde la agenda, sin tener que entrar al cliente. */
  cerrarDesdeAgenda(g: GestionModel): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.modal.open(CerrarGestionComponent, { centered: true, size: 'lg', backdrop: 'static', keyboard: true });
    modalRef.componentInstance.gestion = g;
    this.escucharModal(modalRef, modalRef.componentInstance.cerrada, () => {
      this.cargarAgenda();
      if (this.cliente?.id === g.cliente_id) { this.refrescar(); }
    });
  }

  /** Salta al cliente de esa gestión, con su ficha y su historial. */
  irAlCliente(g: GestionModel): void {
    this.seleccionarCliente({ id: g.cliente_id });
  }

  // ================================================================
  // HISTORIAL (grilla)
  // ================================================================

  initializeGrid(): void {
    this.columnDefs = [
      {
        headerName: 'Estado', field: 'estado', minWidth: 110, maxWidth: 120,
        cellStyle: { textAlign: 'center' },
        cellRenderer: (p: any) => {
          if (p.value === 'PENDIENTE') {
            return p.data?.vencida
              ? '<span class="badge bg-danger fs-10px">VENCIDA</span>'
              : '<span class="badge bg-warning fs-10px">PROGRAMADA</span>';
          }
          if (p.value === 'CANCELADA') { return '<span class="badge bg-secondary fs-10px">CANCELADA</span>'; }
          return '<span class="badge bg-teal fs-10px">REALIZADA</span>';
        },
      },
      {
        headerName: 'Tipo', field: 'tipo', minWidth: 110, maxWidth: 130,
        cellStyle: { textAlign: 'left' },
        cellRenderer: (p: any) => `<i class="fa ${iconoDeTipo(p.value)} fa-fw me-1 text-muted"></i>${nombreDe(this.tipos, p.value)}`,
      },
      {
        headerName: 'Cuándo', minWidth: 140, maxWidth: 160,
        cellStyle: { textAlign: 'center' },
        valueGetter: (p: any) => p.data?.fecha_realizada || p.data?.fecha_programada || '',
      },
      { headerName: 'Asunto', field: 'asunto', minWidth: 220, cellStyle: { textAlign: 'left', fontWeight: '600' } },
      {
        headerName: 'Resultado', field: 'resultado', minWidth: 140, maxWidth: 170,
        cellStyle: { textAlign: 'center' },
        cellRenderer: (p: any) => p.value
          ? `<span class="badge ${claseDeResultado(p.value)} fs-10px">${nombreDe(RESULTADOS_GESTION, p.value)}</span>`
          : '',
      },
      {
        headerName: 'Min.', field: 'duracion_minutos', minWidth: 70, maxWidth: 80,
        cellStyle: { textAlign: 'right' }, headerTooltip: 'Duración en minutos',
      },
      { headerName: 'Responsable', field: 'empleado_nombre', minWidth: 150, cellStyle: { textAlign: 'left' } },
      { headerName: 'Contacto', field: 'contacto_nombre', minWidth: 140, cellStyle: { textAlign: 'left' } },
      { headerName: 'Nota', field: 'nota', minWidth: 200, cellStyle: { textAlign: 'left' }, tooltipField: 'nota' },
      { headerName: 'Registrado por', field: 'created_by', minWidth: 130, maxWidth: 170, cellStyle: { textAlign: 'left' }, sortable: false },
      {
        headerName: 'ACCIONES', field: 'acciones', pinned: 'right', minWidth: 110, maxWidth: 110,
        sortable: false, filter: false, suppressMenu: true, resizable: false,
        cellStyle: { display: 'flex', justifyContent: 'center', alignItems: 'center' },
        cellRenderer: (p: any) => {
          const cerrar = p.data?.estado === 'PENDIENTE'
            ? `<button type="button" class="btn-icon btn-cerrar" data-accion="cerrar" title="Cerrar la gestión"><i class="fa fa-check"></i></button>`
            : '';
          return `<div class="gestion-acciones">${cerrar}
                    <button type="button" class="btn-icon btn-editar" data-accion="editar" title="Modificar"><i class="fa fa-pen"></i></button>
                    <button type="button" class="btn-icon btn-quitar" data-accion="eliminar" title="Eliminar"><i class="fa fa-trash"></i></button>
                  </div>`;
        },
      },
    ];
  }

  onGridReady(params: GridReadyEvent): void {
    this.gridApi = params.api;
    this._appAgGridService.ajustarTamanoGrid(this.gridApi);
    this.gridApi.setRowData(this.gestiones);
    this.replantearAltos();
  }

  navegarConTeclado = this._appAgGridService.navegacionConFlechas();

  onCellClicked(e: CellClickedEvent): void {
    if (e.column.getColId() !== 'acciones') { return; }
    const accion = ((e.event?.target as HTMLElement)?.closest('[data-accion]') as HTMLElement)?.dataset['accion'];
    switch (accion) {
      case 'cerrar':   this.cerrar(e.data); break;
      case 'editar':   this.editarGestion(e.data); break;
      case 'eliminar': this.eliminarGestion(e.data); break;
    }
  }

  async cargarGestiones(page: number = 1): Promise<void> {
    if (!this.cliente?.id) { return; }
    try {
      const res: any = await firstValueFrom(
        this._gestionService.allGestiones(this.cliente.id, page, this.registrosPorPagina, '', {
          tipo: this.filtroTipo, estado: this.filtroEstado,
        })
      );
      this.gestiones = res.body?.data?.data ?? [];
      const meta = res.body?.data?.meta;
      if (meta) {
        this.totalRegistros = meta.total;
        this.registrosPorPagina = meta.per_page;
        this.paginaActual = meta.current_page;
        this.ultimaPagina = meta.last_page;
      }
      this.gridApi?.setRowData(this.gestiones);
    } catch (error) {
      console.error('Error al cargar las gestiones:', error);
    }
  }

  cambiarFiltro(campo: 'tipo' | 'estado', valor: string | null): void {
    if (campo === 'tipo') { this.filtroTipo = valor; } else { this.filtroEstado = valor; }
    this.cargarGestiones(1);
  }

  public get desde(): number {
    return this.totalRegistros === 0 ? 0 : (this.paginaActual - 1) * this.registrosPorPagina + 1;
  }

  public get hasta(): number {
    return Math.min(this.paginaActual * this.registrosPorPagina, this.totalRegistros);
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.ultimaPagina) { return; }
    this.cargarGestiones(page);
  }

  nextPage(): void { this.goToPage(this.paginaActual + 1); }
  prevPage(): void { this.goToPage(this.paginaActual - 1); }
  firstPage(): void { if (this.paginaActual !== 1) { this.goToPage(1); } }
  lastPage(): void { if (this.paginaActual !== this.ultimaPagina) { this.goToPage(this.ultimaPagina); } }

  // ================================================================
  // ACCIONES
  // ================================================================

  private abrirGestion(modo: ModoGestion, gestion: GestionModel | null = null): void {
    if (!this.cliente) { return; }
    if (this._seguridadService.isexpired()) { return; }

    const modalRef = this.modal.open(SaveGestionComponent, { centered: true, size: 'lg', backdrop: 'static', keyboard: true });
    modalRef.componentInstance.modo = modo;
    modalRef.componentInstance.cliente = this.cliente;
    modalRef.componentInstance.contactos = this.contactos;
    modalRef.componentInstance.gestion = gestion;
    this.escucharModal(modalRef, modalRef.componentInstance.guardado, () => this.refrescar());
  }

  registrarGestion(): void { this.abrirGestion('registrar'); }
  programarGestion(): void { this.abrirGestion('programar'); }
  editarGestion(g: GestionModel): void { this.abrirGestion('editar', g); }

  /** Cierra una pendiente y, si se quiere, deja programada la siguiente. */
  cerrar(g: GestionModel): void {
    if (!g || g.estado !== 'PENDIENTE') { return; }
    if (this._seguridadService.isexpired()) { return; }

    const modalRef = this.modal.open(CerrarGestionComponent, { centered: true, size: 'lg', backdrop: 'static', keyboard: true });
    modalRef.componentInstance.gestion = g;
    this.escucharModal(modalRef, modalRef.componentInstance.cerrada, () => this.refrescar());
  }

  async eliminarGestion(g: GestionModel): Promise<void> {
    if (!g?.id) { return; }
    if (this._seguridadService.isexpired()) { return; }

    const r = await Swal.fire({
      title: '¿Eliminar esta gestión?',
      text: `«${g.asunto}». Se borra del historial del cliente; el movimiento queda en la auditoría.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      reverseButtons: true,
    });
    if (!r.isConfirmed) { return; }

    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._gestionService.deleteGestion(g.id));
      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo eliminar la gestión', 'Error');
        return;
      }
      this._toastr.success(res.message, 'Eliminada', { closeButton: true });
      await this.refrescar();
    } catch (error) {
      console.error('Error al eliminar la gestión:', error);
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  /** Pasa el cliente a otro vendedor, con su agenda si se deja marcado. */
  reasignar(): void {
    if (!this.cliente) { return; }
    if (this._seguridadService.isexpired()) { return; }

    const modalRef = this.modal.open(ReasignarClienteComponent, { centered: true, size: 'lg', backdrop: 'static', keyboard: true });
    modalRef.componentInstance.cliente = this.cliente;
    modalRef.componentInstance.pendientes = this.resumen?.pendientes ?? 0;
    this.escucharModal(modalRef, modalRef.componentInstance.reasignado, (data: any) => {
      if (data?.cliente) { this.cliente = data.cliente; }
      this.cargarAsignaciones();
      this.refrescar();
    });
  }

  /** La ficha completa del cliente, en sólo lectura. */
  verFicha(): void {
    if (!this.cliente) { return; }
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.modal.open(SaveClienteComponent, { centered: true, size: 'xl', backdrop: 'static', keyboard: true });
    modalRef.componentInstance.registro_selected = this.cliente;
    modalRef.componentInstance.accion = 'view';
  }

  // ================================================================
  // AYUDAS PARA LA PLANTILLA
  // ================================================================

  iconoTipo = iconoDeTipo;
  claseResultado = claseDeResultado;
  nombreTipo = (tipo: string) => nombreDe(TIPOS_GESTION, tipo);
  nombreEstado = (estado: string) => nombreDe(ESTADOS_GESTION, estado);

  /** El icono de cada estado, para el menú del filtro. */
  iconoEstado(estado?: string | null): string {
    switch (estado) {
      case 'PENDIENTE': return 'fa-clock';
      case 'REALIZADA': return 'fa-circle-check';
      case 'CANCELADA': return 'fa-ban';
      default:          return 'fa-flag';
    }
  }

  /** Quita los dos filtros de golpe y recarga. */
  limpiarFiltrosHistorial(): void {
    this.filtroTipo = null;
    this.filtroEstado = null;
    this.cargarGestiones(1);
  }
  nombreResultado = (r: string) => nombreDe(RESULTADOS_GESTION, r);

  /** «tel:» y «mailto:» para llamar o escribir desde el navegador o el móvil. */
  /** Plegar y desplegar los paneles de datos del cliente. */
  alternarDatos(): void {
    this.datosVisibles = !this.datosVisibles;
    try { localStorage.setItem('miCRM3.gestion.datosCliente', this.datosVisibles ? '1' : '0'); } catch { /* sin storage */ }
    // Al aparecer o desaparecer las tarjetas, el historial gana o pierde alto
    this.replantearAltos(250);
  }

  private leerDatosVisibles(): boolean {
    try { return localStorage.getItem('miCRM3.gestion.datosCliente') !== '0'; } catch { return true; }
  }

  /** «Cédula», «RUC» o «Pasaporte», según con qué esté registrado. */
  public get rotuloIdentificacion(): string {
    switch (this.cliente?.tipo_identificacion) {
      case 'RUC': return 'RUC';
      case 'PAS': return 'Pasaporte';
      default:    return 'Cédula';
    }
  }

  /**
   * La dirección para leer: la escrita a mano manda; si no hay, se arma con
   * lo que dejó el mapa (calle principal N12-34 y calle secundaria).
   */
  public get direccionDelCliente(): string {
    const c = this.cliente;
    if (!c) { return ''; }
    if (c.direccion) { return c.direccion; }

    const calle = [c.calle_principal, c.numeracion].filter(Boolean).join(' ');
    const conEsquina = [calle, c.calle_secundaria].filter(Boolean).join(' y ');
    return conEsquina || c.ubicacion || '';
  }

  /** Copiar un dato al portapapeles: en una llamada se pega en otro sistema. */
  async copiar(texto?: string | null, que: string = 'El dato'): Promise<void> {
    if (!texto) { return; }
    try {
      await navigator.clipboard.writeText(String(texto));
      this._toastr.success(`${que} se copió al portapapeles`, '', { timeOut: 1500 });
    } catch {
      // Sin permiso o sin https: no se avisa con un error, no es grave
      console.warn('No se pudo copiar al portapapeles');
    }
  }

  /** El sitio web se guarda sin esquema; el enlace lo necesita. */
  enlaceWeb(url?: string | null): string {
    if (!url) { return ''; }
    return /^https?:\/\//i.test(url) ? url : 'https://' + url;
  }

  enlaceTelefono(numero?: string | null): string { return numero ? 'tel:' + String(numero).replace(/\s/g, '') : ''; }
  enlaceWhatsapp(numero?: string | null): string {
    const limpio = (numero ?? '').replace(/\D/g, '');
    if (!limpio) { return ''; }
    // Ecuador: 0991234567 → 593991234567
    const internacional = limpio.startsWith('0') ? '593' + limpio.substring(1) : limpio;
    return 'https://wa.me/' + internacional;
  }

  get hayCliente(): boolean { return !!this.cliente?.id; }

  /**
   * El color del aviso de arriba, según cómo esté el cliente.
   *
   * Rojo si hay algo vencido, ámbar si no queda nada agendado —que es lo que
   * enfría una cartera— y azul cuando está al día. Gris mientras no haya
   * ninguna gestión.
   */
  get claseAviso(): string {
    if (!this.resumen) { return 'alert-secondary'; }
    if (this.resumen.vencidas > 0 || this.resumen.proxima?.vencida) { return 'alert-danger'; }
    if (!this.resumen.proxima) { return this.resumen.total ? 'alert-warning' : 'alert-secondary'; }
    return 'alert-info';
  }

  /** Badge del estado del cliente (el mismo criterio que la grilla de clientes). */
  claseEstadoCliente(estado?: string | null): string {
    const clases: { [k: string]: string } = { ACTIVO: 'bg-teal', INACTIVO: 'bg-secondary', SUSPENDIDO: 'bg-warning', MOROSO: 'bg-danger' };
    return clases[estado ?? ''] ?? 'bg-secondary';
  }
}
