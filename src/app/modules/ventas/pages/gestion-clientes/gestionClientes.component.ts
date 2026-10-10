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
import { WhatsappService, MensajeWhatsapp, ResumenWhatsapp } from '../../services/whatsapp.service';
import { SoftphoneService } from '../../services/softphone.service';
import { SeguridadService } from '../../../seguridad/services/seguridad.service';
import { AppAgGridService } from '../../../../service/app-agGrid.service';
import { LoadingService } from '../../../../service/loading.service';

///   MODELOS    ///
import { CARGOS_CONTACTO, ClienteModel, ContactoCliente, ESTADOS_CLIENTE } from '../../interfaces/clienteModel';
import {
  AsignacionCliente, GestionModel, ResumenGestiones,
  ESTADOS_GESTION, TIPOS_GESTION, PRIORIDADES_GESTION, claseDeResultado, iconoDeTipo, nombreDe, RESULTADOS_GESTION,
  ResponsableCliente, RolResponsable, ROLES_RESPONSABLE,
} from '../../interfaces/gestionModel';
import { AccesoModel } from '../../../seguridad/interfaces/accesoModel';
import {
  abrirWhatsapp, comoHtml, numeroInternacional, puedeTenerWhatsapp, soloTexto,
} from '../../interfaces/plantillasWhatsapp';
import {
  aplicarHuecos, datosDeHuecos,
} from '../../interfaces/huecosPlantilla';

///   COMPONENTES    ///
import { ListClientesComponent } from '../clientes/listClientes/listClientes.component';
import { SaveClienteComponent } from '../clientes/saveCliente/saveCliente.component';
import { ResumenVentasComponent } from './resumenVentas/resumenVentas.component';
import { SaveGestionComponent, ModoGestion } from './saveGestion/saveGestion.component';
import { CerrarGestionComponent } from './cerrarGestion/cerrarGestion.component';
import { ReasignarClienteComponent } from './reasignarCliente/reasignarCliente.component';
import { ConversacionesWhatsappComponent } from './conversacionesWhatsapp/conversacionesWhatsapp.component';
import { SubirArchivosComponent } from './subirArchivos/subirArchivos.component';
import { VisorArchivoComponent } from './visorArchivo/visorArchivo.component';
import { SaveNotaComponent } from './saveNota/saveNota.component';
import { VerNotaComponent } from './verNota/verNota.component';
import { ImportarConversacionComponent } from './importarConversacion/importarConversacion.component';
import { esAsuntoDeImportacion } from '../../interfaces/conversacionWhatsapp';
import { NotaClienteService } from '../../services/notaCliente.service';
import { NotaCliente, conTokenLasImagenes, tinteDeNota, nombreDeColor } from '../../interfaces/notaCliente';
import { CatalogoGestionService } from '../../services/catalogoGestion.service';
import { AsuntoGestion, TipoGestion, asuntosDe, traeMensaje } from '../../interfaces/catalogoGestion';
import { lanzarProtocolo } from '../../../../service/lanzarProtocolo';
import { ArchivoClienteService } from '../../services/archivoCliente.service';
import { ArchivoCliente, formatoTamano, pintaDeTipo } from '../../interfaces/archivoCliente';

type Pestana = 'historial' | 'pendientes' | 'contactos' | 'cartera' | 'whatsapp' | 'archivos' | 'notas';
/** Las dos mitades de la pantalla: mi agenda, o el cliente que estoy trabajando. */
type Vista = 'agenda' | 'cliente' | 'metricas';
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
  /** Quién lo atiende ahora en cada papel; siempre llegan los tres. */
  public responsables: ResponsableCliente[] = [];
  /** Para pintar rótulo, icono y ayuda de cada papel. */
  public readonly rolesResponsable = ROLES_RESPONSABLE;
  public pendientes: GestionModel[] = [];
  public agenda: GestionModel[] = [];

  public pestana: Pestana = 'historial';

  /**
   * Las pestañas cuyos datos ya se pidieron para el cliente que está abierto.
   *
   * Abrir un cliente lanzaba de golpe todo lo de las siete pestañas, y cada
   * petición cruzada arrastra además su preflight de CORS: dieciocho idas y
   * vueltas que el servidor de desarrollo atiende de una en una. Ahora sólo se
   * pide lo que se ve —la ficha, el historial y los contadores— y cada pestaña
   * trae lo suyo la primera vez que se abre.
   *
   * Se vacía al cambiar de cliente: lo de uno no vale para el siguiente.
   */
  private pestanasCargadas = new Set<Pestana>();

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

  /**
   * Los atajos de fecha de la agenda.
   *
   * En una lista y no escritos a mano en la plantilla porque se pintan de dos
   * maneras: botones en pantalla ancha y un desplegable en el teléfono, donde
   * seis botones se parten en dos renglones. Dos sitios con los mismos seis
   * rótulos es como se acaba cambiando uno y olvidando el otro.
   *
   * 'rango' no está aquí: no es un atajo, es lo que queda cuando se eligen
   * fechas a mano en el calendario.
   */
  public readonly rangos: { id: Rango; name: string; icono?: string; tono: string }[] = [
    { id: 'vencidas', name: 'Vencidas', icono: 'fa-triangle-exclamation', tono: 'btn-danger' },
    { id: 'hoy',      name: 'Hoy',      tono: 'btn-primary' },
    { id: 'manana',   name: 'Mañana',   tono: 'btn-primary' },
    { id: 'semana',   name: '7 días',   tono: 'btn-primary' },
    { id: 'mes',      name: 'Este mes', tono: 'btn-primary' },
    { id: 'todo',     name: 'Todo',     tono: 'btn-primary' },
  ];
  public desdeFiltro = '';
  public hastaFiltro = '';
  /**
   * Sólo lo que le toca a quien está usando el CRM.
   *
   * Apagarlo NO enseña la agenda de la empresa: enseña la de la gente de la
   * que uno responde según el árbol de grupos, y para quien no responde por
   * nadie no cambia nada. Por eso el botón ni se ofrece si no hay equipo.
   */
  public soloMias = true;
  /**
   * Si este usuario manda sobre alguien más. Lo dice el servidor en cada
   * respuesta de la agenda; se guarda aparte de agendaMeta para que un error
   * de red no haga desaparecer el botón y deje al jefe atrapado en «De mi
   * equipo» sin manera de volver.
   */
  public puedeVerDeOtros = false;
  public cargandoAgenda = false;

  // ---------- La lista de clientes (columna izquierda) ----------
  /**
   * Los clientes se piden por páginas al servidor, como en la grilla de
   * allClientes: con ochenta mil, ni se traen todos ni se busca por cada
   * letra. El buscador consulta al pulsar Enter o la lupa.
   */
  public listaClientes: ClienteModel[] = [];
  public terminoClientes = '';
  /**
   * El estado por el que se filtra la lista; vacío = todos.
   *
   * Va al servidor junto con el término de búsqueda y no se filtra aquí:
   * la lista está paginada allá, así que filtrar en el navegador sólo
   * miraría las quince filas de la página que se está viendo.
   */
  public estadoClientes = '';
  public readonly estadosCliente = ESTADOS_CLIENTE;
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

  /**
   * Menú del clic derecho: dónde está y sobre qué actúa.
   *
   * `objetivo` es la fila que había debajo del puntero cuando se abrió: así
   * el menú ofrece lo de ESE cliente o ESA gestión, y no sólo lo general.
   */
  public menuCtx: {
    visible: boolean;
    x: number;
    y: number;
    tipo: 'cliente' | 'gestion' | 'contacto' | null;
    fila: any;
  } = { visible: false, x: 0, y: 0, tipo: null, fila: null };

  /** Lo que se deja libre por debajo al repartir el alto de la pantalla. */
  // Lo de debajo no es sólo la paginación: también el relleno de la tarjeta
  // del tema y el margen del pie de página. Medido en pantalla: con menos,
  // la página entera se quedaba con una barra de desplazamiento de 30px.
  private readonly MARGEN_ABAJO = 50;
  private readonly MARGEN_PAGINACION = 88;

  // Con el panel expandido (el botón de la cabecera) la tarjeta llega al
  // borde de la ventana: ya no hay pie de página que esquivar, así que se
  // deja sólo lo que ocupan la paginación y el relleno del panel.
  private readonly MARGEN_ABAJO_EXPANDIDO = 22;
  private readonly MARGEN_PAGINACION_EXPANDIDO = 56;
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
  public filtroResultado: string | null = null;
  public filtroCreadoPor: string | null = null;

  /**
   * Quiénes han registrado gestiones de ESTE cliente.
   *
   * Lo manda el servidor junto con la lista y no sale de la tabla de
   * usuarios: lo que hace falta ofrecer son los que de verdad aparecen en
   * este historial, no los trescientos del sistema.
   *
   * Cada uno viene con las dos cosas: `login` es lo que se manda al filtrar
   * —la consulta compara con created_by— y `etiqueta` es cómo se lee,
   * LOGIN  -  APELLIDOS NOMBRES.
   */
  public registradores: { login: string; etiqueta: string }[] = [];

  /**
   * Los tipos salen del catálogo (ventas.gestiones_tipos), el mismo del que
   * los toma el formulario de gestión. La constante se queda de respaldo por
   * si la petición falla: un filtro vacío sería peor que uno desactualizado.
   */
  /**
   * Cómo se lee el filtro elegido en el botón.
   *
   * `filtroCreadoPor` guarda el login —es lo que entiende la consulta—, así
   * que para el rótulo hay que buscar su etiqueta. Si el que está filtrado ya
   * no aparece en la lista, se enseña el login: mejor eso que un botón en
   * blanco con un filtro puesto.
   */
  public get etiquetaCreadoPor(): string {
    if (!this.filtroCreadoPor) { return ''; }
    return this.registradores.find(u => u.login === this.filtroCreadoPor)?.etiqueta
        ?? this.filtroCreadoPor;
  }

  public tipos: { id: string; name: string; icono: string }[] = TIPOS_GESTION;
  public estados = ESTADOS_GESTION;
  public resultados = RESULTADOS_GESTION;

  // ---------- Notas del cliente ----------
  /**
   * Lo que hay que saber del cliente y no es una gestión.
   *
   * Igual que los archivos, se piden al entrar en la pestaña: es una
   * petición más por cliente y no todo el mundo las mira.
   */
  public notas: NotaCliente[] = [];
  public cargandoNotas = false;
  public buscaNotas = '';
  /** De qué cliente son las que hay cargadas, para no volver a pedirlas. */
  private notasDe: number | null = null;

  public readonly tinteDeNota = tinteDeNota;
  public readonly nombreDeColor = nombreDeColor;

  // ---------- Archivos del cliente ----------
  /**
   * Fotos, videos y documentos del cliente.
   *
   * Se piden al entrar en la pestaña y no al abrir el cliente: son una
   * petición más por cliente y la mayoría de las veces nadie los mira.
   */
  public archivos: ArchivoCliente[] = [];
  public cargandoArchivos = false;
  /** Para no volver a pedirlos cada vez que se entra y se sale de la pestaña. */
  private archivosDe: number | null = null;

  public readonly formatoTamano = formatoTamano;
  public readonly pintaDeTipo = pintaDeTipo;

  // ---------- WhatsApp ----------
  /**
   * Los mensajes que se ofrecen al escribir.
   *
   * Vienen de la base (Ventas > Respuestas de WhatsApp), no del codigo: se
   * piden una vez al entrar y el servicio los recuerda, porque el menu se
   * abre muchas veces al dia y la lista cambia de tarde en tarde.
   */
  public plantillasWhatsapp: AsuntoGestion[] = [];

  /** Lo mismo para marcar: los asuntos activos de tipo LLAMADA. */
  public asuntosLlamada: AsuntoGestion[] = [];

  /** Y para escribir: los de tipo CORREO. */
  public asuntosCorreo: AsuntoGestion[] = [];

  /** Dónde se pinta el menú de la llamada y a qué número marca. */
  public menuTel: { visible: boolean; x: number; y: number; numero: string | null; aQuien: string | null } =
    { visible: false, x: 0, y: 0, numero: null, aQuien: null };

  @ViewChild('menuTelEl') menuTelEl?: ElementRef<HTMLElement>;

  /** Dónde se pinta el menú del correo y a quién escribe. */
  public menuCorreo: { visible: boolean; x: number; y: number; para: string | null; aQuien: string | null } =
    { visible: false, x: 0, y: 0, para: null, aQuien: null };

  @ViewChild('menuCorreoEl') menuCorreoEl?: ElementRef<HTMLElement>;

  /**
   * Dónde estaba el puntero en el último clic.
   *
   * El menú de la llamada nace ahí. Los diez sitios que marcan —la ficha, tres
   * grillas, dos menús contextuales— llaman todos con (número, quién) y sin
   * evento; pasarles además el elemento al que anclarse habría sido tocar los
   * diez para colocar un recuadro.
   */
  private ultimoPuntero = { x: 24, y: 24 };

  @HostListener('document:pointerdown', ['$event'])
  anotarPuntero(ev: PointerEvent): void {
    if (ev.clientX || ev.clientY) { this.ultimoPuntero = { x: ev.clientX, y: ev.clientY }; }
  }

  /**
   * La conversación de WhatsApp del cliente.
   *
   * La alimenta el servicio miCRM3-wa, que está enlazado a la cuenta del
   * vendedor como un dispositivo más y sólo escucha. Aquí sólo se lee: para
   * escribir están las plantillas, que abren el WhatsApp del vendedor.
   */
  /**
   * Lo que se trajo de un fichero, aparte de lo que escucha miCRM3-wa.
   *
   * Son gestiones con modo_registro = IMPORTADA; se enseñan en tarjetas, como
   * las notas, y sólo se leen.
   */
  public importadas: GestionModel[] = [];
  public cargandoImportadas = false;

  public conversacion: MensajeWhatsapp[] = [];
  public resumenWhatsapp: ResumenWhatsapp | null = null;
  public cargandoConversacion = false;

  /**
   * El menú de plantillas, flotando por encima de todo.
   *
   * No es un desplegable de Bootstrap a propósito: vive dentro de una tarjeta
   * con overflow: hidden y de un panel con scroll, así que el menú se abría
   * pero quedaba recortado y parecía que el botón no hacía nada. Se coloca
   * igual que el menú del clic derecho, con coordenadas y position: fixed.
   */
  public menuWa: { visible: boolean; x: number; y: number; numero: string | null; aQuien: string | null } =
    { visible: false, x: 0, y: 0, numero: null, aQuien: null };

  @ViewChild('menuWaEl') menuWaEl?: ElementRef<HTMLElement>;

  /** El tablero de métricas, para poder recargarlo desde el botón del panel. */
  @ViewChild(ResumenVentasComponent) tablero?: ResumenVentasComponent;

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

  // ---------- Las otras tres pestañas, también en grilla ----------
  /**
   * Pendientes, Contactos y Cartera eran listas de tarjetas. Se pasan a
   * grilla por lo mismo que la agenda: se ordena, se filtra por columna y
   * cada fila ocupa un renglón en vez de tres.
   */
  public gridApiPendientes!: GridApi;
  public gridApiContactos!: GridApi;
  public gridApiCartera!: GridApi;
  public columnDefsPendientes: any[] = [];
  public columnDefsContactos: any[] = [];
  public columnDefsCartera: any[] = [];

  public rowClassRulesPendientes = {
    'fila-vencida': (p: RowClassParams) => p.data?.vencida === true,
  };

  public rowClassRulesContactos = {
    'fila-excluida': (p: RowClassParams) => p.data?.activo === false,
    // A medio escribir: avisa antes de intentar guardarla
    'fila-incompleta': (p: RowClassParams) => !!p.data && !this.contactoCompleto(p.data),
  };

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
    private _whatsappService: WhatsappService,
    private _softphone: SoftphoneService,
    private _archivoService: ArchivoClienteService,
    private _notaService: NotaClienteService,
    private _catalogoService: CatalogoGestionService,
    public _appAgGridService: AppAgGridService,
  ) {
    this.accesoModel = this.activeRoute.snapshot.data['access'];
  }

  ngOnInit(): void {
    this.initializeGrid();
    this.initializeGridClientes();
    this.initializeGridAgenda();
    this.initializeGridPendientes();
    this.initializeGridContactos();
    this.initializeGridCartera();

    // En un teléfono la columna de acciones entra plegada: son 110-142 píxeles
    // de los 375 que hay, y lo primero que se viene a leer es el asunto, no
    // los botones. Se despliega con el ☰ como en cualquier otro sitio.
    // Sólo al entrar: si luego se gira el teléfono, manda lo que haya elegido
    // quien lo usa.
    if (window.innerWidth <= 767.98) { this.alternarAcciones(); }

    this.cargarAgenda();
    this.cargarClientes(1);
    this.cargarTiposDelCatalogo();

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
        // true: aquí cada uno trabaja su cartera. Para repartir los que no tienen
        // dueño está Ventas > Clientes, que sí los lista todos.
        this._clienteService.allClientes(page, this.porPaginaClientes, this.terminoClientes, this.estadoClientes, true)
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

  /**
   * Cambia el filtro por estado.
   *
   * Vuelve a la página 1 a propósito: si uno está en la página 40 de los mil
   * clientes y filtra por morosos —que son ciento y pico—, esa página ya no
   * existe y la lista saldría vacía sin que se entienda por qué.
   */
  filtrarPorEstado(estado: string): void {
    this.estadoClientes = estado ?? '';
    this.cargarClientes(1);
  }

  /** El nombre bonito del estado elegido, para los carteles. */
  private get nombreEstadoElegido(): string {
    return this.estadosCliente.find(e => e.id === this.estadoClientes)?.name ?? '';
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
        minWidth: 310,
        maxWidth: 390,
        cellRenderer: (params: any) => {
          const icono = params.data?.tipo_cliente === 'EMPRESA' ? 'fa-building' : 'fa-user';
          const nombre = params.value ?? '';
          // Aquí hubo un chip de «Actual» que se quitó; al comentar las dos
          // ramas del ternario quedó `const actual = this.esElElegido(...)`, un
          // booleano, y se colaba al nombre: «ALIMENTOS TOBAR S.A.true». Al
          // cliente que se está gestionando ya lo marca la fila en dorado
          // (rowClassRulesClientes), que es más discreto que un chip.
          const estado = params.data?.estado && params.data.estado !== 'ACTIVO'
            ? ` <span class="gc-chip gc-chip--aviso">${params.data.estado}</span>`
            : '';
          return `<i class="fa ${icono} fa-fw me-1 text-secondary"></i>${nombre}${estado}`;
        }
      },
      {
        headerName: 'Identificación',
        field: 'numero_identificacion',
        cellStyle: { textAlign: 'center' },
        minWidth: 120,
        maxWidth: 140,
        // Una cédula son diez dígitos que empiezan por 0, igual que un
        // celular: sin esto la extensión también le cuelga el logotipo
        cellRenderer: this.celdaNumero,
      },
      // {
      //   headerName: 'Teléfono',
      //   field: 'celular',
      //   cellStyle: { textAlign: 'center' },
      //   minWidth: 95,
      //   maxWidth: 115,
      //   valueGetter: (p: any) => p.data?.celular || p.data?.telefono || '',
      //   cellRenderer: this.celdaNumero,
      // },
      // {
      //   // El número es texto, así que marcar es cosa de este botón
      //   headerName: '', field: 'acciones', pinned: 'right', minWidth: 46, maxWidth: 46,
      //   sortable: false, filter: false, suppressMenu: true, resizable: false,
      //   cellStyle: { display: 'flex', justifyContent: 'center', alignItems: 'center' },
      //   cellRenderer: (p: any) => p.data?.celular || p.data?.telefono
      //     ? `<span class="gestion-acciones"><button type="button" class="btn-icon btn-llamar" data-accion="llamar" title="Llamar"><i class="fa fa-phone"></i></button></span>`
      //     : '',
      // },
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
    // Marcar no debe abrir la ficha: son cinco peticiones al servidor para
    // algo que no se ha pedido.
    if ((e.event?.target as HTMLElement)?.closest('[data-accion="llamar"]')) {
      this.llamarConSoftphone(e.data?.celular || e.data?.telefono, e.data?.nombre_completo);
      return;
    }
    if (e.data) { this.seleccionarCliente(e.data); }
  }

  /**
   * El cartel de «no hay filas».
   *
   * Dice por qué está vacío, y eso incluye el filtro por estado: con un
   * «Todavía no hay clientes registrados» delante de mil clientes filtrados por
   * morosos, uno piensa que se rompió algo en vez de mirar el selector.
   */
  public get vacioClientes(): string {
    const termino = this.terminoClientes;
    const estado = this.nombreEstadoElegido;

    if (termino && estado) {
      return `<span>Ningún cliente en estado «${estado}» coincide con «${termino}».</span>`;
    }
    if (estado) {
      return `<span>No hay clientes en estado «${estado}».</span>`;
    }
    if (termino) {
      return `<span>Ningún cliente coincide con «${termino}».</span>`;
    }
    // Esta lista es la cartera propia, no el fichero de clientes: decir «todavía
    // no hay clientes registrados» con mil en la base haría pensar que se
    // rompió algo, cuando lo que pasa es que a esta persona no le han asignado
    // ninguno todavía.
    return '<span>No tienes clientes asignados.<br>'
      + '<small class="text-muted">Pídele a quien reparte la cartera que te asigne alguno '
      + 'desde Ventas › Clientes.</small></span>';
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

  /**
   * Si quien está usando el CRM es administrador.
   *
   * Lo dice el servidor en la respuesta de la agenda (meta.es_admin), que se
   * pide al entrar en la pantalla. No sale del usuario guardado porque el
   * login no lo manda: devuelve id, nombre, login, correo, avatar y perfil, ni
   * type_user ni grupo_id —comprobado contra el API—.
   *
   * Empieza en false y sólo lo levanta una respuesta buena: si la agenda falla,
   * la pestaña de Asignación no sale, que es por donde hay que fallar.
   *
   * Es para decidir qué se ENSEÑA. Quién puede reasignar de verdad lo decide
   * el servidor: esconder una pestaña no cierra una ruta.
   */
  public esAdministrador = false;

  /** Si hay algo que quitar: texto buscado, estado filtrado o cliente elegido. */
  get hayFiltroClientes(): boolean {
    return !!this.terminoClientes || !!this.estadoClientes || !!this.cliente;
  }

  /**
   * Deja la lista como al entrar: sin texto, sin estado y sin cliente elegido.
   *
   * La × del propio campo sólo borra lo escrito; esto quita además el filtro
   * por estado y suelta el cliente, que es lo que hace falta cuando uno se ha
   * dejado puesto un «morosos» de hace media hora y no entiende por qué no
   * aparece quien busca.
   *
   * Una sola consulta: se ponen los dos filtros a cero y se pide la página 1
   * una vez, en vez de encadenar una recarga por cada cosa que se limpia.
   */
  limpiarFiltrosClientes(): void {
    if (!this.hayFiltroClientes) { return; }

    this.terminoClientes = '';
    this.estadoClientes = '';
    if (this.cliente) { this.limpiarCliente(false); }
    this.cargarClientes(1);
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

  /**
   * En un teléfono la lista de clientes es un cajón, no una columna.
   *
   * Apilada se comía 364 de los 667 píxeles de un iPhone 7: había que pasar
   * la lista entera para llegar al trabajo del cliente, que empezaba fuera de
   * pantalla. Así que debajo de lg sale por encima, como el árbol de carpetas
   * del administrador de archivos, y se quita de en medio al elegir.
   *
   * Entra ABIERTO: en un teléfono lo primero que hay que hacer es elegir
   * cliente, y empezar con el cajón cerrado obligaba a descubrir la pestaña
   * antes de poder trabajar. Se cierra solo al elegir, así que el estorbo dura
   * lo que tarda el primer toque.
   *
   * El ancho se mira una vez, al construir: el cajón sólo existe por debajo de
   * lg, y en escritorio esta bandera no la lee nadie. `panelOculto` es otra
   * cosa y sigue siendo de escritorio.
   */
  public listaMovilAbierta = window.innerWidth <= 991.98;

  alternarListaMovil(): void {
    this.listaMovilAbierta = !this.listaMovilAbierta;
    // La grilla se dibuja dentro de un cajón que estaba fuera de pantalla: sin
    // esto sale con el ancho que tenía antes de abrirse
    if (this.listaMovilAbierta) {
      setTimeout(() => this.gridApiClientes?.sizeColumnsToFit(), 260);
    }
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

    // Expandido o no, el hueco que hay que dejar por debajo cambia. El <panel>
    // del tema va DENTRO de esta pantalla, así que se busca hacia abajo: con
    // closest() no se encontraba y el modo expandido nunca se notaba.
    const expandido = !!host.querySelector('.panel.panel-expand');
    const margenAbajo = expandido ? this.MARGEN_ABAJO_EXPANDIDO : this.MARGEN_ABAJO;
    const margenPaginacion = expandido ? this.MARGEN_PAGINACION_EXPANDIDO : this.MARGEN_PAGINACION;

    // Las dos columnas: llenan hasta abajo y el scroll va por dentro
    const cuerpo = host.querySelector('.gc-cuerpo') as HTMLElement | null;
    if (cuerpo) {
      const alto = window.innerHeight - cuerpo.getBoundingClientRect().top - margenAbajo;
      cuerpo.style.height = Math.max(alto, 360) + 'px';
    }

    // La grilla de la agenda deja sitio para su paginación
    const agenda = host.querySelector('.agenda-grilla') as HTMLElement | null;
    if (agenda) {
      const alto = window.innerHeight - agenda.getBoundingClientRect().top - margenPaginacion;
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
      const alto = panel.clientHeight - arriba - margenPaginacion;
      historial.style.height = Math.max(alto, 220) + 'px';
    }

    // Ya con el ancho definitivo, las columnas se reparten
    setTimeout(() => {
      this.gridApi?.sizeColumnsToFit();
      this.gridApiAgenda?.sizeColumnsToFit();
      this.gridApiClientes?.sizeColumnsToFit();
      this.gridApiPendientes?.sizeColumnsToFit();
      this.gridApiContactos?.sizeColumnsToFit();
      this.gridApiCartera?.sizeColumnsToFit();
    }, 80);
  }

  /** Lo llaman los sitios donde algo aparece o desaparece: se mide después de pintar. */
  private replantearAltos(espera: number = 120): void {
    setTimeout(() => this.ajustarAltos(), espera);
  }

  /** Lo mismo, desde la plantilla: al cambiar de pestaña cambia lo que se ve. */
  /**
   * Cambia de pestaña y trae sus datos si es la primera vez.
   *
   * Antes cada botón hacía su propia mezcla en la plantilla («pestana = 'x';
   * cargarAlgo(); replantear()»), que es donde se olvidan cosas. Con un solo
   * sitio, añadir una pestaña es añadir un caso aquí.
   */
  /**
   * El botón de recargar del panel, aplicado a lo que se esté mirando.
   *
   * Antes era una condición en la plantilla que sólo conocía dos vistas, así
   * que al entrar la de métricas recargaba la agenda, que no estaba delante.
   */
  recargarVista(): void {
    if (this.vista === 'metricas') { this.tablero?.cargar(); return; }
    if (this.vista === 'cliente' && this.cliente) { this.seleccionarCliente(this.cliente); return; }
    this.cargarAgenda();
  }

  async abrirPestana(p: Pestana): Promise<void> {
    // La asignación es de administradores. Se comprueba aquí y no sólo al
    // pintar la pestaña: así tampoco se llega por un estado anterior ni desde
    // otro sitio que llame a este método.
    if (p === 'cartera' && !this.esAdministrador) { p = 'historial'; }
    this.pestana = p;
    this.replantear();
    await this.cargarPestana(p);
    if (p === 'whatsapp') { this.bajarAlUltimoMensaje(); }
  }

  /** Lo que necesita cada pestaña, una sola vez por cliente. */
  private async cargarPestana(p: Pestana): Promise<void> {
    if (!this.cliente?.id) { return; }
    // El historial y los contadores llegan al abrir el cliente
    if (p === 'historial' || this.pestanasCargadas.has(p)) { return; }

    // Se marca antes de pedir: dos clics seguidos no deben lanzar dos veces
    this.pestanasCargadas.add(p);
    try {
      switch (p) {
        case 'pendientes': await this.cargarPendientes(); break;
        case 'contactos':  await this.cargarContactos(); break;
        // La cartera enseña las dos cosas a la vez
        case 'cartera':    await Promise.all([this.cargarAsignaciones(), this.cargarResponsables()]); break;
        case 'whatsapp':   await Promise.all([this.cargarConversacion(), this.cargarImportadas()]); break;
        case 'notas':      await this.cargarNotas(); break;
        case 'archivos':   await this.cargarArchivos(); break;
      }
    } catch (error) {
      // Si falló, que se pueda reintentar volviendo a entrar
      this.pestanasCargadas.delete(p);
      console.error('Error al cargar la pestaña ' + p + ':', error);
    }
  }

  replantear(): void {
    this.replantearAltos(160);
  }

  // ================================================================
  // MENÚ DEL CLIC DERECHO
  // ================================================================

  /** Las mismas acciones que los botones, donde esté el puntero. */
  onContextMenu(ev: MouseEvent): void {
    // En un campo de texto manda el menú del navegador (copiar, pegar…)
    const destino = ev.target as HTMLElement;
    if (destino.closest('input, textarea, select')) { return; }

    ev.preventDefault();

    // ¿Se pulsó sobre una fila de alguna grilla? Entonces el menú se abre con
    // las acciones de esa fila. (ag-Grid Community no trae menú propio, así
    // que aquí no se le quita nada a nadie.)
    const objetivo = this.filaBajoElPuntero(destino);

    this.menuCtx = {
      visible: true,
      x: ev.clientX,
      y: ev.clientY,
      tipo: objetivo.tipo,
      fila: objetivo.fila,
    };

    // Si se sale de la pantalla, se recoloca
    setTimeout(() => {
      const el = this.menuCtxEl?.nativeElement;
      if (!el) { return; }
      const r = el.getBoundingClientRect();
      if (r.right > window.innerWidth)   { this.menuCtx.x = Math.max(0, window.innerWidth - r.width - 8); }
      if (r.bottom > window.innerHeight) { this.menuCtx.y = Math.max(0, window.innerHeight - r.height - 8); }
    });
  }

  /**
   * Cierra el menú, pero NO borra la fila señalada: las opciones se escriben
   * «cerrarMenu(); hacerAlgo(menuCtx.fila)», y si se limpiara aquí la acción
   * recibiría null. Los datos se sustituyen solos en el siguiente clic.
   */
  cerrarMenu(): void {
    if (this.menuCtx.visible) { this.menuCtx.visible = false; }
  }

  /**
   * De dónde salió el clic derecho: qué grilla y qué fila.
   *
   * ag-Grid pinta la misma fila en varios contenedores (el central y los
   * fijados), pero todos llevan el mismo row-index, así que con eso y la api
   * de la grilla se recupera el dato.
   */
  private filaBajoElPuntero(destino: HTMLElement): { tipo: 'cliente' | 'gestion' | 'contacto' | null; fila: any } {
    const vacio = { tipo: null, fila: null } as { tipo: 'cliente' | 'gestion' | 'contacto' | null; fila: any };

    const filaEl = destino.closest('.ag-row') as HTMLElement | null;
    if (!filaEl) { return vacio; }

    const indice = Number(filaEl.getAttribute('row-index'));
    if (!Number.isFinite(indice)) { return vacio; }

    // Qué grilla es; la del cliente depende de la pestaña que esté abierta
    let api: GridApi | undefined;
    let tipo: 'cliente' | 'gestion' | 'contacto' | null = null;

    if (destino.closest('.gc-grilla')) {
      api = this.gridApiClientes; tipo = 'cliente';
    } else if (destino.closest('.agenda-grilla')) {
      api = this.gridApiAgenda; tipo = 'gestion';
    } else if (destino.closest('.gestion-grilla')) {
      switch (this.pestana) {
        case 'historial':  api = this.gridApi;           tipo = 'gestion';  break;
        case 'pendientes': api = this.gridApiPendientes; tipo = 'gestion';  break;
        case 'contactos':  api = this.gridApiContactos;  tipo = 'contacto'; break;
        default:           return vacio;   // cartera: es historial, no hay nada que hacerle
      }
    }

    const fila = api?.getDisplayedRowAtIndex(indice)?.data;
    return fila ? { tipo, fila } : vacio;
  }

  /** El teléfono que toca marcar según lo que haya debajo del puntero. */
  public get telefonoDelObjetivo(): string | null {
    const f = this.menuCtx.fila;
    if (!f) { return null; }
    return f.telefono || f.cliente_telefono || f.celular || null;
  }

  @HostListener('document:click')
  @HostListener('document:keydown.escape')
  @HostListener('window:scroll')
  onCerrarMenuGlobal(): void { this.cerrarMenu(); this.cerrarMenuWhatsapp(); this.cerrarMenuLlamada(); this.cerrarMenuCorreo(); }

  /**
   * Al cambiar el tamaño de la ventana se cierra el menú y se vuelve a
   * repartir el alto. Con retardo: redimensionar dispara decenas de eventos
   * y medir en todos ellos hace que la pantalla dé tirones.
   */
  @HostListener('window:resize')
  onRedimensionar(): void {
    this.cerrarMenu();
    this.cerrarMenuWhatsapp();
    this.cerrarMenuLlamada();
    this.cerrarMenuCorreo();
    if (this.ajusteAltoTimeout) { clearTimeout(this.ajusteAltoTimeout); }
    this.ajusteAltoTimeout = setTimeout(() => this.ajustarAltos(), 150);
  }

  // ================================================================
  // CARGAR TODO LO DEL CLIENTE
  // ================================================================

  async seleccionarCliente(cliente: any): Promise<void> {
    if (!cliente?.id) { return; }
    // Elegido el cliente, el cajón sobra: lo que se quiere ver es su trabajo
    this.listaMovilAbierta = false;
    this.replantearAltos(200);
    this.vista = 'cliente';
    this.pestana = 'historial';
    this.hitosVisible = true;
    this.paginaActual = 1;
    // Los del cliente anterior no valen; los nuevos se piden al entrar en la pestaña
    this.archivos = [];
    this.archivosDe = null;
    this.notas = [];
    this.notasDe = null;
    this.buscaNotas = '';
    // Lo de las pestañas del cliente anterior no vale
    this.pestanasCargadas.clear();
    this.pendientes = [];
    this.conversacion = [];
    this.asignaciones = [];
    this.responsables = [];
    this.ponerContactos([]);

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
      // Sólo lo que se ve nada más abrir: la ficha ya está, el historial es la
      // pestaña de entrada y el resumen llena los contadores de arriba y el de
      // «Pendientes». El de WhatsApp es el que avisa de mensajes sin
      // responder, así que también entra —es una petición pequeña y es un
      // aviso, no un detalle—. Lo demás lo pide su pestaña al abrirse.
      await Promise.all([
        this.cargarGestiones(1),
        this.cargarResumen(),
        this.cargarResumenWhatsapp(),
      ]);
    } catch (error) {
      console.error('Error al abrir el cliente:', error);
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  /**
   * Vuelve a pedir lo que está a la vista (tras guardar, cerrar o reasignar).
   *
   * Lo de las pestañas que nadie ha abierto todavía no se pide: se pedirá solo
   * cuando se abran, y ya vendrá al día.
   */
  private async refrescar(): Promise<void> {
    if (!this.cliente?.id) { return; }

    const tareas: Promise<any>[] = [
      this.cargarGestiones(this.paginaActual),
      this.cargarResumen(),
    ];
    // Lo pendiente cambia al cerrar una gestión, así que se repite aunque su
    // pestaña no esté abierta sólo si ya se había cargado
    if (this.pestanasCargadas.has('pendientes')) { tareas.push(this.cargarPendientes()); }
    if (this.pestanasCargadas.has('contactos'))  { tareas.push(this.cargarContactos()); }
    if (this.pestanasCargadas.has('cartera'))    { tareas.push(this.cargarAsignaciones(), this.cargarResponsables()); }
    if (this.pestanasCargadas.has('whatsapp'))   { tareas.push(this.cargarConversacion(), this.cargarImportadas()); }

    await Promise.all(tareas);
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
      this.ponerContactos(res?.status === 'success' ? (res.data ?? []) : []);
    } catch (error) {
      console.error('Error al cargar los contactos:', error);
      this.ponerContactos([]);
    }
  }

  async cargarAsignaciones(): Promise<void> {
    if (!this.cliente?.id) { return; }
    try {
      const res: any = await firstValueFrom(this._gestionService.asignaciones(this.cliente.id));
      this.asignaciones = res?.status === 'success' ? (res.data ?? []) : [];
    } catch (error) {
      console.error('Error al cargar el historial de asignaciones:', error);
      this.asignaciones = [];
    }
  }

  /**
   * Quién atiende al cliente ahora mismo, en cada papel.
   *
   * El servidor devuelve siempre los tres, con el empleado en null cuando el
   * puesto está vacío, así que la pantalla no tiene que componer la lista.
   */
  async cargarResponsables(): Promise<void> {
    if (!this.cliente?.id) { this.responsables = []; return; }
    try {
      const res: any = await firstValueFrom(this._gestionService.responsables(this.cliente.id));
      this.responsables = res?.status === 'success' ? (res.data ?? []) : [];
    } catch (error) {
      console.error('Error al cargar los responsables:', error);
      this.responsables = [];
    }
  }

  /**
   * La conversación de WhatsApp y su resumen.
   *
   * Se piden juntos al abrir el cliente: el resumen es lo que pone el número
   * en la pestaña, así que tiene que estar aunque nadie entre a leerla.
   */
  /**
   * Sólo el resumen: cuántos mensajes hay y cuántos sin responder.
   *
   * Va aparte del chat porque es lo que pinta el aviso rojo de la pestaña, y
   * ese aviso tiene que verse sin entrar: es la razón por la que uno entra.
   * Pesa un kilobyte; la conversación entera no.
   */
  async cargarResumenWhatsapp(): Promise<void> {
    if (!this.cliente?.id) { return; }
    try {
      const res: any = await firstValueFrom(this._whatsappService.resumen(this.cliente.id));
      this.resumenWhatsapp = res?.status === 'success' ? res.data : null;
    } catch (error) {
      console.error('Error al cargar el resumen de WhatsApp:', error);
      this.resumenWhatsapp = null;
    }
  }

  /** El chat, que es lo gordo: sólo al entrar en su pestaña. */
  /** Las conversaciones traídas de un fichero, para las tarjetas de arriba. */
  async cargarImportadas(): Promise<void> {
    const id = this.cliente?.id;
    if (!id) { this.importadas = []; return; }

    try {
      this.cargandoImportadas = true;
      const res: any = await firstValueFrom(this._gestionService.importadas(id));
      this.importadas = res?.status === 'success' ? (res.data ?? []) : [];
    } catch (error) {
      // El AuthInterceptor ya saca el toast del error HTTP
      console.error('Error al cargar las conversaciones importadas:', error);
      this.importadas = [];
    } finally {
      this.cargandoImportadas = false;
    }
  }

  /**
   * Una conversación importada, entera y sin poder tocarla.
   *
   * Se reusa el visor de las notas: ya es de sólo lectura y trae imprimir y
   * exportar a Word, que es exactamente lo que se quiere hacer con una
   * conversación. Se le arma una nota de mentira con lo que necesita.
   */
  verImportada(g: GestionModel): void {
    const ref = this.modal.open(VerNotaComponent, { size: 'lg', centered: true, scrollable: false });
    ref.componentInstance.nota = {
      id: g.id,
      titulo: this.tituloDeImportada(g),
      contenido: g.nota ?? '',
      color: 'gris',
      fijada: false,
      created_by: g.created_by,
      created_at: g.created_at,
    } as any;
    ref.componentInstance.clienteNombre = this.cliente?.nombre_completo ?? '';
    // Sin cliente: en una conversación no hay huecos que rellenar, y pasarlo
    // haría que un «{nombre}» que dijo el cliente de verdad se cambiara
    ref.componentInstance.cliente = null;
  }

  /** "WhatsApp · 6/10/2026" — lo que se lee en la tarjeta y en el visor. */
  tituloDeImportada(g: GestionModel): string {
    const cuando = (g.fecha_realizada || g.created_at || '').slice(0, 10);
    return (g.asunto || 'Conversación') + (cuando ? ' · ' + cuando : '');
  }

  async cargarConversacion(): Promise<void> {
    if (!this.cliente?.id) { return; }
    try {
      this.cargandoConversacion = true;
      const chat: any = await firstValueFrom(this._whatsappService.conversacion(this.cliente.id));
      this.conversacion = chat?.status === 'success' ? (chat.data ?? []) : [];
      // Al abrir el chat se aprovecha para poner al día el contador
      await this.cargarResumenWhatsapp();
    } catch (error) {
      console.error('Error al cargar la conversación de WhatsApp:', error);
      this.conversacion = [];
    } finally {
      this.cargandoConversacion = false;
      // Al entrar en la pestaña se baja al último mensaje, como en un chat
      if (this.pestana === 'whatsapp') { this.bajarAlUltimoMensaje(); }
    }
  }

  /** El chat se lee por el final. */
  bajarAlUltimoMensaje(): void {
    setTimeout(() => {
      const caja = this.host.nativeElement.querySelector('.wa-chat') as HTMLElement | null;
      if (caja) { caja.scrollTop = caja.scrollHeight; }
    }, 120);
  }

  /** Lo que se ve en cada burbuja cuando el mensaje no es texto. */
  descripcionDeMensaje(m: MensajeWhatsapp): string {
    if (m.cuerpo) { return m.cuerpo; }
    switch (m.tipo) {
      case 'IMAGEN':    return 'Envió una imagen';
      case 'AUDIO':     return 'Envió una nota de voz';
      case 'VIDEO':     return 'Envió un video';
      case 'DOCUMENTO': return 'Envió un documento';
      case 'UBICACION': return 'Compartió su ubicación';
      default:          return 'Envió un mensaje';
    }
  }

  /** El día al que pertenece un mensaje, para separar la conversación. */
  diaDelMensaje(m: MensajeWhatsapp): string {
    return (m.enviado_at ?? '').slice(0, 10);
  }

  /** ¿Empieza aquí un día nuevo dentro de la conversación? */
  esNuevoDia(i: number): boolean {
    if (i === 0) { return true; }
    return this.diaDelMensaje(this.conversacion[i]) !== this.diaDelMensaje(this.conversacion[i - 1]);
  }

  /** Sólo la hora, que es lo que se pone debajo de cada burbuja. */
  horaDelMensaje(m: MensajeWhatsapp): string {
    return (m.enviado_at ?? '').slice(11, 16);
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
        // Sólo desde una respuesta buena: así un fallo no esconde el botón
        this.puedeVerDeOtros = this.agendaMeta.ve_de_otros === true;
        this.esAdministrador = this.agendaMeta.es_admin === true;
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
        headerName: 'Tipo',
        field: 'tipo',
        minWidth: 85,
        maxWidth: 125,
        cellStyle: { textAlign: 'left' },
        cellRenderer: (p: any) => `<i class="fa ${iconoDeTipo(p.value)} fa-fw me-1 text-muted"></i>${nombreDe(this.tipos, p.value)}`,
      },
      {
        headerName: 'Cuándo',
        field: 'fecha_programada',
        minWidth: 105,
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
        cellRenderer: this.celdaNumero,
      },
      {
        headerName: 'Vendedor',
        field: 'responsable_nombre',
        minWidth: 130,
        cellStyle: { textAlign: 'left' },
      },
      {
        headerName: 'Acciones',
        field: 'acciones',
        pinned: 'right',
        minWidth: 118,
        maxWidth: 118,
        suppressMovable: true,
        headerComponentParams: this.cabeceraAcciones('Acciones'),
        sortable: false,
        resizable: false,
        filter: false,
        suppressMenu: true,
        cellStyle: { display: 'flex', justifyContent: 'center', alignItems: 'center' },
        cellRenderer: () => {
          if (this.accionesPlegadas) { return this.botonDesplegarAcciones(); }
          // Marcar no escribe nada: basta con poder ver al cliente. Lo que pide
          // crear es el formulario que se abre después, y de eso se encarga
          // abrirGestionDeLlamada. Marcarla como hecha va también con crear:
          // se anota un trabajo hecho, no se corrige lo que ya había.
          const puedeCerrar = this.accesoModel?.crear !== false;
          const puedeVer    = this.accesoModel?.ver !== false;
          return `<span class="gestion-acciones">${this.botonAccion('llamar', 'btn-llamar', 'fa fa-phone', 'Llamar', puedeVer)}${this.botonAccion('cerrar', 'btn-cerrar', 'fa fa-check', 'Marcar como hecha', puedeCerrar)}${this.botonAccion('abrir', 'btn-abrir', 'fa fa-arrow-right', 'Abrir el cliente', puedeVer)}</span>`;
        },
      },
    ];
  }

  /** Lo que queda por hacer con este cliente. */
  initializeGridPendientes(): void {
    this.columnDefsPendientes = [
      {
        headerName: 'Cuándo', field: 'fecha_programada', minWidth: 140, maxWidth: 170,
        cellStyle: { textAlign: 'left' },
        cellRenderer: (p: any) => p.data?.vencida
          ? `<span class="agenda-cuando is-vencida"><i class="fa fa-triangle-exclamation fa-fw"></i>${p.value ?? ''}</span>`
          : `<span class="agenda-cuando">${p.value ?? ''}</span>`,
      },
      {
        headerName: 'Tipo', field: 'tipo', minWidth: 110, maxWidth: 130,
        cellStyle: { textAlign: 'left' },
        cellRenderer: (p: any) => `<i class="fa ${iconoDeTipo(p.value)} fa-fw me-1 text-muted"></i>${nombreDe(this.tipos, p.value)}`,
      },
      { headerName: 'Asunto', field: 'asunto', minWidth: 200, cellStyle: { textAlign: 'left', fontWeight: '600' } },
      {
        headerName: 'Prioridad', field: 'prioridad', minWidth: 90, maxWidth: 110,
        cellStyle: { display: 'flex', justifyContent: 'center', alignItems: 'center' },
        cellRenderer: (p: any) => {
          const clase = p.value === 'ALTA' ? 'bg-danger' : (p.value === 'BAJA' ? 'bg-secondary' : 'bg-warning text-dark');
          return `<span class="badge ${clase} fs-10px">${nombreDe(PRIORIDADES_GESTION, p.value)}</span>`;
        },
      },
      {
        headerName: 'Teléfono', field: 'telefono', minWidth: 110, maxWidth: 140,
        cellStyle: { textAlign: 'left' },
        valueGetter: (p: any) => p.data?.telefono || p.data?.cliente_telefono || '',
        cellRenderer: this.celdaNumero,
      },
      { headerName: 'Responsable', field: 'responsable_nombre', minWidth: 140, cellStyle: { textAlign: 'left' } },
      { headerName: 'Nota', field: 'nota', minWidth: 180, cellStyle: { textAlign: 'left' },
        // Sin formato: la nota puede traer HTML desde que se escribe con
        // editor, y en una celda saldrían las etiquetas escritas.
        valueFormatter: (p: any) => soloTexto(p.value), tooltipValueGetter: (p: any) => soloTexto(p.value) },
      {
        headerName: 'ACCIONES', field: 'acciones', pinned: 'right', minWidth: 214, maxWidth: 214,
        suppressMovable: true,
        headerComponentParams: this.cabeceraAcciones('ACCIONES'),
        sortable: false, filter: false, suppressMenu: true, resizable: false,
        cellStyle: { display: 'flex', justifyContent: 'center', alignItems: 'center' },
        cellRenderer: (p: any) => {
          if (this.accionesPlegadas) { return this.botonDesplegarAcciones(); }
          // Marcar no escribe nada: basta con poder ver al cliente. El
          // formulario que se abre tras marcar sí pide crear, y eso lo mira
          // abrirGestionDeLlamada. Cerrar la gestión también va con crear:
          // se está anotando un trabajo hecho, no corrigiendo uno anterior.
          const puedeVer    = this.accesoModel?.ver !== false;
          const puedeCerrar = this.accesoModel?.crear !== false;
          const puedeEditar = this.accesoModel?.editar !== false;
          const puedeBorrar = this.accesoModel?.eliminar !== false;
          return `<div class="gestion-acciones">${this.botonAdjuntos(p.data?.num_adjuntos)}${this.botonAccion('ver', 'btn-abrir', 'fa fa-eye', 'Ver la gestión', puedeVer)}${this.botonAccion('llamar', 'btn-llamar', 'fa fa-phone', 'Llamar', puedeVer)}${this.botonAccion('cerrar', 'btn-cerrar', 'fa fa-check', 'Cerrar la gestión', puedeCerrar)}${this.botonAccion('editar', 'btn-editar', 'fa fa-pen', 'Modificar', puedeEditar)}${this.botonAccion('eliminar', 'btn-quitar', 'fa fa-trash', 'Eliminar', puedeBorrar)}</div>`;
        },
      },
    ];
  }

  /** Las personas de contacto del cliente. */
  /**
   * Los contactos se escriben en la propia grilla, igual que en la ficha del
   * cliente: celdas editables, una fila nueva con el botón de arriba y quitar
   * con la X. La diferencia es que aquí no hay un «guardar» del formulario
   * entero, así que la lista tiene su propio botón.
   */
  initializeGridContactos(): void {
    const editable = this.accesoModel?.editar !== false;
    const texto = (field: string, headerName: string, minWidth: number, maxWidth?: number, extra: any = {}) => ({
      field, headerName, minWidth, maxWidth, editable, sortable: false, filter: false,
      cellStyle: { textAlign: 'left' },
      // El nombre y el teléfono son lo mínimo para que el contacto sirva
      cellClass: (p: any) => (['nombres', 'telefono'].includes(field) && !String(p.value ?? '').trim()) ? 'celda-obligatoria' : '',
      ...extra,
    });

    this.columnDefsContactos = [
      {
        headerName: '#', field: 'prioridad', headerTooltip: 'Orden en que se debe llamar (1 = primero)',
        minWidth: 56, maxWidth: 56, editable, sortable: false, filter: false,
        cellStyle: { textAlign: 'center', fontWeight: '600' },
        valueSetter: (p: any) => {
          const n = parseInt(p.newValue, 10);
          if (!n || n < 1) { this._toastr.warning('La prioridad debe ser 1 o mayor', 'Contactos'); return false; }
          p.data.prioridad = n; return true;
        },
      },
      texto('nombres', 'Nombres y apellidos', 170),
      {
        ...texto('cargo', 'Cargo', 120, 150),
        cellEditor: 'agSelectCellEditor',
        cellEditorParams: { values: this.cargosContacto },
      },
      // El número va como texto: aquí se escribe, y para llamar está el botón
      // de la columna de acciones. Pulsarlo abre la edición, que es lo que se
      // espera de una celda editable, y de paso es la forma de copiarlo, que
      // con celdaNumero el número deja de poder seleccionarse con el ratón.
      texto('telefono', 'Teléfono', 115, 145, { cellRenderer: this.celdaNumero }),
      texto('telefono_alterno', 'Tel. alterno', 110, 140, { cellRenderer: this.celdaNumero }),
      texto('email', 'Correo', 170),
      {
        headerName: 'Activo', field: 'activo', minWidth: 70, maxWidth: 70, sortable: false, filter: false,
        cellStyle: { display: 'flex', justifyContent: 'center', alignItems: 'center' },
        cellRenderer: (p: any) => p.value === false
          ? '<span class="badge bg-danger fs-10px">NO</span>'
          : '<span class="badge bg-teal fs-10px">SÍ</span>',
      },
      {
        headerName: 'ACCIONES', field: 'acciones', pinned: 'right', minWidth: 140, maxWidth: 140,
        suppressMovable: true,
        headerComponentParams: this.cabeceraAcciones('ACCIONES'),
        sortable: false, filter: false, suppressMenu: true, resizable: false,
        cellStyle: { display: 'flex', justifyContent: 'center', alignItems: 'center' },
        /**
         * Aquí no se borra un contacto: se desactiva. Un contacto borrado se
         * lleva por delante el rastro de con quién se habló —las gestiones lo
         * apuntan—, y lo normal es que la persona ya no esté, no que nunca
         * haya estado. Para eso está la ficha del cliente, que sí borra.
         *
         * La excepción es una fila recién añadida y todavía sin guardar: ahí
         * no hay nada que desactivar, y sin forma de quitarla una fila puesta
         * por error bloquearía el guardado.
         */
        cellRenderer: (p: any) => {
          if (this.accionesPlegadas) { return this.botonDesplegarAcciones(); }
          const activo = p.data?.activo !== false;
          // Al desactivado no se le llama ni se le escribe por WhatsApp: para
          // eso se le dio de baja. Vuelve a aparecer si se reactiva.
          const tel = (activo && p.data?.telefono)
            ? this.botonAccion('llamar', 'btn-llamar', 'fa fa-phone', 'Llamar con Zoiper', this.accesoModel?.ver !== false)
            : '';
          // El de WhatsApp sólo si el número puede tener cuenta: a un fijo el
          // enlace le sale inservible, y mientras se teclea tampoco vale
          const wa = (activo && puedeTenerWhatsapp(p.data?.telefono))
            ? `<button type="button" class="btn-icon btn-wa" data-accion="whatsapp" title="WhatsApp"><i class="fab fa-whatsapp"></i></button>`
            : '';
          const mail = p.data?.email
            ? `<button type="button" class="btn-icon btn-correo" data-accion="correo" title="Escribir"><i class="fa fa-envelope"></i></button>`
            : '';

          let alta = '';
          if (editable) {
            alta = !p.data?.id
              ? `<button type="button" class="btn-icon btn-quitar" data-accion="descartar" title="Descartar esta fila (todavía no se ha guardado)"><i class="fa fa-times"></i></button>`
              : (p.data?.activo !== false
                  ? `<button type="button" class="btn-icon btn-quitar" data-accion="alta" title="Desactivar: deja de aparecer para llamarle"><i class="fa fa-user-slash"></i></button>`
                  : `<button type="button" class="btn-icon btn-cerrar" data-accion="alta" title="Volver a activar"><i class="fa fa-user-check"></i></button>`);
          }

          return `<div class="gestion-acciones">${tel}${wa}${mail}${alta}</div>`;
        },
      },
    ];
  }

  // ---------- Editar la lista de contactos ----------

  public cargosContacto = CARGOS_CONTACTO;
  /** Cómo estaba la lista al cargarla, para saber si hay algo que guardar. */
  private contactosOriginal = '[]';
  /** ag-Grid necesita una identidad estable; los nuevos todavía no tienen id. */
  private claveContacto = 0;
  public guardandoContactos = false;

  getRowIdContacto = (p: any) => String(p.data._clave);

  contactoCompleto(c: ContactoCliente): boolean {
    return !!(c.nombres?.trim() && c.telefono?.trim());
  }

  get hayContactosIncompletos(): boolean { return this.contactos.some(c => !this.contactoCompleto(c)); }
  get contactosCambiados(): boolean { return JSON.stringify(this.normalizarContactos()) !== this.contactosOriginal; }

  agregarContacto(): void {
    if (this.accesoModel?.editar === false) { return; }
    const nuevo: any = {
      _clave: ++this.claveContacto, id: null, nombres: '', cargo: '', telefono: '',
      telefono_alterno: '', email: '', prioridad: this.contactos.length + 1, activo: true,
    };
    this.contactos = [...this.contactos, nuevo];
    this.gridApiContactos?.setRowData(this.contactos);
    // Abrir la celda del nombre: así se escribe sin tener que buscar dónde
    setTimeout(() => {
      const idx = this.contactos.length - 1;
      this.gridApiContactos?.ensureIndexVisible(idx);
      this.gridApiContactos?.startEditingCell({ rowIndex: idx, colKey: 'nombres' });
    });
  }

  /**
   * Al cambiar una celda se repinta su fila.
   *
   * Los botones de la columna ACCIONES miran el teléfono —el de WhatsApp
   * sólo sale si el número puede tener cuenta—, y ag-Grid no repinta una
   * columna porque haya cambiado otra: sin esto el botón no aparecería
   * hasta recargar la ficha.
   */
  alCambiarContacto(e: any): void {
    if (e?.node) { this.gridApiContactos?.redrawRows({ rowNodes: [e.node] }); }
  }

  /**
   * Activar o desactivar: lo que aquí sustituye al borrado. El contacto se
   * queda en la ficha pero deja de ofrecerse para llamar.
   */
  alternarActivoContacto(c: ContactoCliente): void {
    if (this.accesoModel?.editar === false || !c) { return; }
    c.activo = c.activo === false;

    const nodo = this.gridApiContactos?.getRowNode(String((c as any)._clave));
    if (nodo) { this.gridApiContactos.redrawRows({ rowNodes: [nodo] }); }
  }

  /**
   * Sólo para filas que todavía no se han guardado. A las guardadas se las
   * desactiva; para borrarlas de verdad está la ficha del cliente.
   */
  quitarContacto(c: ContactoCliente): void {
    if (this.accesoModel?.editar === false || c?.id) { return; }
    this.contactos = this.contactos.filter(x => x !== c);
    this.contactos.forEach((x, i) => x.prioridad = i + 1);
    this.gridApiContactos?.setRowData(this.contactos);
  }

  /** Lo que se le manda al servidor: la lista entera, que él sincroniza. */
  private normalizarContactos(): any[] {
    return this.contactos.map(c => ({
      id: c.id ?? null,
      nombres: (c.nombres ?? '').trim(),
      cargo: (c.cargo ?? '').trim() || null,
      telefono: (c.telefono ?? '').trim(),
      telefono_alterno: ((c as any).telefono_alterno ?? '').trim() || null,
      email: (c.email ?? '').trim() || null,
      prioridad: c.prioridad || 1,
      activo: c.activo !== false,
    }));
  }

  /**
   * Guarda la lista.
   *
   * El servidor recibe todas las filas y se encarga de insertar, actualizar y
   * borrar las que falten: el mismo endpoint que usa la ficha del cliente, así
   * que las dos pantallas se comportan igual.
   */
  async guardarContactos(): Promise<void> {
    if (!this.cliente?.id || this.guardandoContactos) { return; }
    if (this._seguridadService.isexpired()) { return; }

    if (this.hayContactosIncompletos) {
      this._toastr.warning('Hay contactos sin nombre o sin teléfono', 'Contactos', { timeOut: 4000 });
      return;
    }

    try {
      this.guardandoContactos = true;
      const res: any = await firstValueFrom(this._clienteService.guardarContactos(this.cliente.id, this.normalizarContactos()));
      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudieron guardar los contactos', 'Error');
        return;
      }
      this.ponerContactos(res.data ?? []);
      this._toastr.success(res.message, 'Contactos', { timeOut: 2500 });
    } catch (error) {
      // El AuthInterceptor ya muestra el toast del error HTTP
      console.error('Error al guardar los contactos:', error);
    } finally {
      this.guardandoContactos = false;
    }
  }

  /** Los deja en la grilla con su clave, y apunta cómo quedaron. */
  private ponerContactos(lista: ContactoCliente[]): void {
    this.contactos = (lista ?? []).map(c => ({ ...c, _clave: ++this.claveContacto } as any));
    this.contactosOriginal = JSON.stringify(this.normalizarContactos());
    this.gridApiContactos?.setRowData(this.contactos);
  }

  /** Por qué vendedores ha pasado el cliente. */
  initializeGridCartera(): void {
    this.columnDefsCartera = [
      { headerName: 'Cuándo', field: 'asignado_at', minWidth: 150, maxWidth: 180, cellStyle: { textAlign: 'left' } },
      {
        headerName: 'Papel', field: 'rol', minWidth: 110, maxWidth: 130,
        cellStyle: { display: 'flex', justifyContent: 'center', alignItems: 'center' },
        // Lo de antes del cambio no tenía rol: todo era del vendedor
        cellRenderer: (p: any) => {
          const rol = this.rolesResponsable.find(r => r.id === (p.value || 'VENDEDOR'));
          return `<span class="badge bg-secondary bg-opacity-25 text-body fs-10px">
                    <i class="fa ${rol?.icono ?? 'fa-user'} me-1"></i>${rol?.name ?? p.value}
                  </span>`;
        },
      },
      {
        headerName: 'Antes lo atendía', field: 'anterior', minWidth: 160,
        cellStyle: { textAlign: 'left' },
        valueGetter: (p: any) => p.data?.anterior || 'Nadie',
      },
      {
        headerName: 'Pasó a', field: 'nuevo', minWidth: 160,
        cellStyle: { textAlign: 'left', fontWeight: '600' },
        valueGetter: (p: any) => p.data?.nuevo || 'Nadie',
      },
      { headerName: 'Motivo', field: 'motivo', minWidth: 200, cellStyle: { textAlign: 'left' }, tooltipField: 'motivo' },
      { headerName: 'Lo hizo', field: 'created_by_nombre', minWidth: 170, maxWidth: 280, cellStyle: { textAlign: 'left' }, tooltipField: 'created_by_nombre' },
    ];
  }

  onGridReadyPendientes(params: GridReadyEvent): void {
    this.gridApiPendientes = params.api;
    this._appAgGridService.ajustarTamanoGrid(this.gridApiPendientes);
    this.replantearAltos();
  }

  onGridReadyContactos(params: GridReadyEvent): void {
    this.gridApiContactos = params.api;
    this._appAgGridService.ajustarTamanoGrid(this.gridApiContactos);
    this.replantearAltos();
  }

  onGridReadyCartera(params: GridReadyEvent): void {
    this.gridApiCartera = params.api;
    this._appAgGridService.ajustarTamanoGrid(this.gridApiCartera);
    this.replantearAltos();
  }

  /** Los tres botones de la columna ACCIONES de Pendientes. */
  onCellClickedPendientes(e: CellClickedEvent): void {
    const destino = (e.event?.target as HTMLElement)?.closest('[data-accion]') as HTMLElement | null;
    switch (destino?.dataset['accion']) {
      case 'cerrar':   this.cerrar(e.data); break;
      case 'editar':   this.editarGestion(e.data); break;
      case 'eliminar': this.eliminarGestion(e.data); break;
      case 'llamar':   this.llamarConSoftphone(e.data?.telefono || e.data?.cliente_telefono, this.cliente?.nombre_completo); break;
      case 'ver':      this.verGestion(e.data); break;
      case 'adjuntos': this.verAdjuntosDeGestion(e.data); break;
    }
  }

  /** Llamar, WhatsApp, correo o quitar a la persona de contacto. */
  onCellClickedContactos(e: CellClickedEvent): void {
    const destino = (e.event?.target as HTMLElement)?.closest('[data-accion]') as HTMLElement | null;
    const accion = destino?.dataset['accion'];
    if (!accion) { return; }

    if (accion === 'llamar')    { this.llamarConSoftphone(e.data?.telefono, e.data?.nombres); }
    // El menú de plantillas, igual que en la ficha de contactabilidad: antes
    // este botón abría el chat en blanco y había que escribirlo todo a mano
    if (accion === 'whatsapp')  { this.abrirMenuWhatsapp(e.event as MouseEvent, e.data?.telefono, e.data?.nombres, destino); }
    if (accion === 'correo')    { window.location.href = 'mailto:' + e.data?.email; }
    if (accion === 'alta')      { this.alternarActivoContacto(e.data); }
    if (accion === 'descartar') { this.quitarContacto(e.data); }
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
    if (destino?.dataset['accion'] === 'llamar') {
      this.llamarConSoftphone(e.data?.telefono || e.data?.cliente_telefono, e.data?.cliente_nombre);
      return;
    }
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

  /**
   * Qué agenda se mira: la propia o la de todo el equipo.
   *
   * «Todo» es todo lo que ESE usuario puede ver, que no es lo mismo para un
   * jefe de zona que para un administrador; el servidor ya pone ese límite.
   */
  verAgendaDe(soloMias: boolean): void {
    if (this.soloMias === soloMias) { return; }
    this.paginaAgenda = 1;
    this.soloMias = soloMias;
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
    if (!this.permiso(this.accesoModel?.crear, 'cerrar gestiones')) { return; }
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
    if (!this.permiso(this.accesoModel?.ver, 'ver la ficha del cliente')) { return; }
    this.seleccionarCliente({ id: g.cliente_id });
  }

  // ================================================================
  // HISTORIAL (grilla)
  // ================================================================

  initializeGrid(): void {
    this.columnDefs = [
      { headerName: 'Responsable', field: 'responsable_nombre', minWidth: 150, cellStyle: { textAlign: 'left' } },

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
      { headerName: 'Contacto', field: 'contacto_nombre', minWidth: 140, cellStyle: { textAlign: 'left' } },
      { headerName: 'Nota', field: 'nota', minWidth: 200, cellStyle: { textAlign: 'left' },
        valueFormatter: (p: any) => soloTexto(p.value), tooltipValueGetter: (p: any) => soloTexto(p.value) },
      { headerName: 'Creado por', field: 'registrado_por_nombre', minWidth: 170, maxWidth: 280, cellStyle: { textAlign: 'left' }, sortable: false, tooltipField: 'registrado_por_nombre' },

      {
        headerName: 'ACCIONES', field: 'acciones', pinned: 'right', minWidth: 178, maxWidth: 178,
        suppressMovable: true,
        headerComponentParams: this.cabeceraAcciones('ACCIONES'),
        sortable: false, filter: false, suppressMenu: true, resizable: false,
        cellStyle: { display: 'flex', justifyContent: 'center', alignItems: 'center' },
        cellRenderer: (p: any) => {
          if (this.accionesPlegadas) { return this.botonDesplegarAcciones(); }
          // Cerrar una pendiente va con CREAR, no con editar: lo que se hace es
          // dejar anotado un trabajo recién hecho, no corregir lo que ya estaba.
          // Modificar sí es editar, y borrarla del historial es eliminar.
          const puedeVer     = this.accesoModel?.ver !== false;
          const puedeCerrar  = this.accesoModel?.crear !== false;
          const puedeEditar  = this.accesoModel?.editar !== false;
          const puedeBorrar  = this.accesoModel?.eliminar !== false;
          const cerrar = p.data?.estado === 'PENDIENTE'
            ? this.botonAccion('cerrar', 'btn-cerrar', 'fa fa-check', 'Cerrar la gestión', puedeCerrar)
            : '';
          return `<div class="gestion-acciones">${this.botonAdjuntos(p.data?.num_adjuntos)}${this.botonAccion('ver', 'btn-abrir', 'fa fa-eye', 'Ver la gestión', puedeVer)}${cerrar}${this.botonAccion('editar', 'btn-editar', 'fa fa-pen', 'Modificar', puedeEditar)}${this.botonAccion('eliminar', 'btn-quitar', 'fa fa-trash', 'Eliminar', puedeBorrar)}</div>`;
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
    // Ya no vale preguntar sólo por la columna de acciones: el clip vive en
    // la suya. Se mira el data-accion, como en los pendientes.
    const accion = ((e.event?.target as HTMLElement)?.closest('[data-accion]') as HTMLElement)?.dataset['accion'];
    switch (accion) {
      case 'ver':      this.verGestion(e.data); break;
      case 'cerrar':   this.cerrar(e.data); break;
      case 'editar':   this.editarGestion(e.data); break;
      case 'eliminar': this.eliminarGestion(e.data); break;
      case 'adjuntos': this.verAdjuntosDeGestion(e.data); break;
    }
  }

  async cargarGestiones(page: number = 1): Promise<void> {
    if (!this.cliente?.id) { return; }
    try {
      const res: any = await firstValueFrom(
        this._gestionService.allGestiones(this.cliente.id, page, this.registrosPorPagina, '', {
          tipo: this.filtroTipo, estado: this.filtroEstado,
          resultado: this.filtroResultado, creado_por: this.filtroCreadoPor,
        })
      );
      this.gestiones = res.body?.data?.data ?? [];
      // La lista del desplegable «Registrado por» viene con los datos y se
      // calcula sin los demás filtros, para que al elegir a alguien no
      // desaparezcan los otros del menú
      this.registradores = res.body?.data?.filtros?.registradores ?? this.registradores;
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

  cambiarFiltro(campo: 'tipo' | 'estado' | 'resultado' | 'creadoPor', valor: string | null): void {
    switch (campo) {
      case 'tipo':      this.filtroTipo = valor; break;
      case 'estado':    this.filtroEstado = valor; break;
      case 'resultado': this.filtroResultado = valor; break;
      case 'creadoPor': this.filtroCreadoPor = valor; break;
    }
    // Siempre a la página 1: con el filtro puesto puede que la que se estaba
    // viendo ya no exista
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
    // Corregir una existente es editar; registrarla o programarla es crear;
    // mirarla es ver, que es el permiso más bajo y el que casi todos tienen.
    const puede = modo === 'ver'    ? this.accesoModel?.ver
                : modo === 'editar' ? this.accesoModel?.editar
                : this.accesoModel?.crear;
    const queHacer = modo === 'ver'    ? 'ver gestiones'
                   : modo === 'editar' ? 'modificar gestiones'
                   : 'registrar gestiones';
    if (!this.permiso(puede, queHacer)) { return; }
    // Sólo leer no necesita sesión fresca para escribir, pero sí para pedir los
    // datos: si caducó, que lo diga aquí y no con un 401 a medio abrir.
    if (this._seguridadService.isexpired()) { return; }

    const modalRef = this.modal.open(SaveGestionComponent, { centered: true, size: 'xl', backdrop: 'static', keyboard: true });
    modalRef.componentInstance.modo = modo;
    modalRef.componentInstance.cliente = this.cliente;
    modalRef.componentInstance.contactos = this.contactos;
    modalRef.componentInstance.gestion = gestion;
    this.escucharModal(modalRef, modalRef.componentInstance.guardado, () => this.refrescar());
  }

  /**
   * Leerla sin poder tocarla.
   *
   * Es el mismo formulario con todo bloqueado, como el «view» del resto de los
   * CRUD: una pantalla aparte para leer lo mismo acaba enseñando otros campos u
   * otro orden, y entonces hay que mantener las dos.
   */
  verGestion(g: GestionModel): void { this.abrirGestion('ver', g); }

  registrarGestion(): void { this.abrirGestion('registrar'); }
  programarGestion(): void { this.abrirGestion('programar'); }
  editarGestion(g: GestionModel): void { this.abrirGestion('editar', g); }

  /** Cierra una pendiente y, si se quiere, deja programada la siguiente. */
  cerrar(g: GestionModel): void {
    if (!g || g.estado !== 'PENDIENTE') { return; }
    if (!this.permiso(this.accesoModel?.crear, 'cerrar gestiones')) { return; }
    if (this._seguridadService.isexpired()) { return; }

    const modalRef = this.modal.open(CerrarGestionComponent, { centered: true, size: 'lg', backdrop: 'static', keyboard: true });
    modalRef.componentInstance.gestion = g;
    this.escucharModal(modalRef, modalRef.componentInstance.cerrada, () => this.refrescar());
  }

  async eliminarGestion(g: GestionModel): Promise<void> {
    if (!g?.id) { return; }
    if (!this.permiso(this.accesoModel?.eliminar, 'eliminar gestiones')) { return; }
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
  /**
   * Cambia quién atiende al cliente en un papel.
   *
   * Sin indicar papel es el vendedor, que es como se comportaba cuando un
   * cliente sólo tenía uno.
   */
  reasignar(rol: RolResponsable = 'VENDEDOR'): void {
    if (!this.cliente) { return; }
    if (this._seguridadService.isexpired()) { return; }

    const modalRef = this.modal.open(ReasignarClienteComponent, { centered: true, size: 'lg', backdrop: 'static', keyboard: true });
    modalRef.componentInstance.cliente = this.cliente;
    modalRef.componentInstance.rol = rol;
    modalRef.componentInstance.actualId = this.responsableDe(rol)?.usuario_id ?? null;
    // Las gestiones sólo se mueven con el vendedor; al resto no les toca agenda
    modalRef.componentInstance.pendientes = rol === 'VENDEDOR' ? (this.resumen?.pendientes ?? 0) : 0;
    this.escucharModal(modalRef, modalRef.componentInstance.reasignado, (data: any) => {
      if (data?.cliente) { this.cliente = data.cliente; }
      this.cargarAsignaciones();
      this.cargarResponsables();
      this.refrescar();
    });
  }

  /** El responsable de un papel, o undefined si todavía no se ha cargado. */
  responsableDe(rol: RolResponsable): ResponsableCliente | undefined {
    return this.responsables.find(r => r.rol === rol);
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

  claseResultado = claseDeResultado;
  nombreEstado = (estado: string) => nombreDe(ESTADOS_GESTION, estado);

  /**
   * El nombre y el icono del tipo salen de la lista cargada, no de la
   * constante: si alguien añade un tipo en el catálogo, el historial tiene que
   * saber cómo se llama. Si no está (un tipo que se desactivó), se cae a la
   * constante y, en última instancia, al propio código.
   */
  nombreTipo = (tipo: string): string =>
    this.tipos.find(t => t.id === tipo)?.name ?? nombreDe(TIPOS_GESTION, tipo);

  iconoTipo = (tipo: string | null | undefined): string =>
    this.tipos.find(t => t.id === tipo)?.icono || iconoDeTipo(tipo);

  /** El icono de cada estado, para el menú del filtro. */
  iconoEstado(estado?: string | null): string {
    switch (estado) {
      case 'PENDIENTE': return 'fa-clock';
      case 'REALIZADA': return 'fa-circle-check';
      case 'CANCELADA': return 'fa-ban';
      default:          return 'fa-flag';
    }
  }

  /** ¿Hay algún filtro puesto? Decide si se ve el botón de quitarlos. */
  get hayFiltrosHistorial(): boolean {
    return !!(this.filtroTipo || this.filtroEstado || this.filtroResultado || this.filtroCreadoPor);
  }

  /** Quita los cuatro filtros de golpe y recarga. */
  limpiarFiltrosHistorial(): void {
    this.filtroTipo = null;
    this.filtroEstado = null;
    this.filtroResultado = null;
    this.filtroCreadoPor = null;
    this.cargarGestiones(1);
  }

  /**
   * Trae los tipos del catálogo para el filtro y para las grillas.
   *
   * El servicio lo guarda en memoria, así que abrir cliente tras cliente no
   * repite la petición. Lo que se guarda en ventas.gestiones.tipo es el
   * CÓDIGO, así que es lo que va como id del filtro.
   */
  private async cargarTiposDelCatalogo(): Promise<void> {
    try {
      const res: any = await firstValueFrom(this._catalogoService.catalogo());
      const lista: TipoGestion[] = res?.status === 'success' ? (res.data ?? []) : [];
      if (lista.length) {
        this.tipos = lista.map(t => ({
          id: t.codigo,
          name: t.nombre,
          icono: t.icono || 'fa-comment-dots',
        }));
      }

      // Y de paso el menú de WhatsApp: TODOS los asuntos activos de ese tipo,
      // traigan mensaje o no. El catálogo ya devuelve sólo los activos.
      //
      // Los que no traen mensaje también valen: al elegirlos se abre el chat
      // en blanco y la gestión queda registrada con ese asunto, que es de lo
      // que salen los informes. El mensaje, cuando lo hay, es un adelanto;
      // no es el motivo de que el asunto esté en la lista.
      //
      // Alfabético, y no por el `orden` del catálogo: aquí no se repasa una
      // lista, se busca uno concreto entre veintitantos, y para eso lo que
      // sirve es saber por dónde empieza. localeCompare con 'es' para que la
      // Á vaya con la A y las mayúsculas no manden.
      this.plantillasWhatsapp = this.asuntosParaElMenu(lista, 'WHATSAPP');
      this.asuntosLlamada     = this.asuntosParaElMenu(lista, 'LLAMADA');
      this.asuntosCorreo      = this.asuntosParaElMenu(lista, 'CORREO');
    } catch (error) {
      // Se queda la constante: un filtro de tipos vacío sería peor
      console.error('Error al cargar el catálogo de tipos de gestión:', error);
    }
  }

  /**
   * Los de WhatsApp que se pueden MANDAR.
   *
   * El del menú verde es para elegir qué escribirle al cliente, y el asunto de
   * las importaciones no se le manda a nadie: existe sólo para que la gestión
   * que crea «Importar» tenga uno. El modal de importar sí recibe la lista
   * entera, que es de donde saca su id.
   */
  get respuestasWhatsapp(): AsuntoGestion[] {
    return this.plantillasWhatsapp.filter(a => !esAsuntoDeImportacion(a.nombre));
  }

  /** Los asuntos activos de un tipo, en el orden en que se buscan. */
  private asuntosParaElMenu(catalogo: TipoGestion[], codigo: string): AsuntoGestion[] {
    return asuntosDe(catalogo.find(t => t.codigo === codigo))
      .slice()
      .sort((a, b) => (a.nombre ?? '').localeCompare(b.nombre ?? '', 'es', { sensitivity: 'base' }));
  }
  nombreResultado = (r: string) => nombreDe(RESULTADOS_GESTION, r);

  /**
   * Las conversaciones de WhatsApp que el CRM no pudo atar a ningún cliente.
   *
   * Pasa cuando el número no está en ninguna ficha o cuando WhatsApp manda un
   * identificador oculto en vez del teléfono. Desde ahí se asignan a mano.
   */
  verConversacionesSueltas(): void {
    if (this._seguridadService.isexpired()) { return; }

    const ref = this.modal.open(ConversacionesWhatsappComponent, { size: 'lg', centered: true, backdrop: 'static' });
    ref.componentInstance.asignado.subscribe(() => {
      // Si la que se asignó es del cliente abierto, su pestaña ya la tiene
      if (this.cliente?.id) { this.cargarConversacion(); }
    });
  }

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

  /**
   * Un botón de una columna ACCIONES, apagado si el perfil no lo permite.
   *
   * Mismo trato que app-action-buttons en la lista de clientes: el botón no
   * se esconde, se deshabilita y el title lo explica. Escondiéndolo, la
   * columna cambiaría de ancho según quién entre y el usuario no sabría que
   * la acción existe —acabaría preguntando por qué a él no le sale—.
   *
   * Esto es presentación: quien de verdad corta es el método al que llama
   * cada acción, porque al menú del clic derecho y al teclado no les afecta
   * un `disabled` puesto aquí.
   */
  /**
   * ¿El perfil deja hacer esto? Si no, lo dice y corta.
   *
   * El botón de la grilla ya sale apagado, pero la misma acción se alcanza
   * desde el menú del clic derecho y con el teclado, así que la comprobación
   * de verdad va aquí. El aviso es para que no parezca que la pantalla se
   * quedó colgada: sin él, pulsar y que no pase nada se lee como un error.
   */
  private permiso(concedido: boolean | undefined, queHacer: string): boolean {
    if (concedido !== false) { return true; }
    this._toastr.info(`Tu perfil no permite ${queHacer}.`, 'Sin permiso');
    return false;
  }

  private botonAccion(accion: string, clase: string, icono: string, titulo: string, permitido: boolean): string {
    const t = permitido ? titulo : `${titulo} - Desactivado`;
    return `<button type="button" class="btn-icon ${clase}" data-accion="${accion}" title="${t}"${permitido ? '' : ' disabled'}>`
         + `<i class="${icono}"></i></button>`;
  }

  // ================================================================
  // PLEGAR LA COLUMNA DE ACCIONES
  //
  // Lo mismo que en seguridad > perfiles: se pulsa la cabecera ACCIONES y la
  // columna se encoge, que en una pantalla estrecha son 140 píxeles que le
  // hacen falta a lo que de verdad se viene a leer. Plegada, cada celda deja
  // un botón ☰ para devolverla, así que nunca hay que adivinar que la cabecera
  // responde al clic.
  //
  // Aquí hay CUATRO grillas con acciones (agenda, pendientes, contactos e
  // historial) y por eso no se copió aquello tal cual: aquello busca la
  // cabecera con un document.querySelector, que con varias grillas en la misma
  // pantalla engancha siempre la primera. En su lugar va un solo escuchador
  // delegado en el componente, que además sirve para las grillas de las
  // pestañas que todavía no se han abierto.
  //
  // El estado es uno para las cuatro: es una preferencia de sitio en pantalla,
  // y plegarlo en una pestaña y encontrárselo desplegado en la siguiente sería
  // raro.
  // ================================================================

  /** true mientras la columna de acciones está encogida. */
  public accionesPlegadas = false;

  /** Lo que queda de ancho la columna plegada: justo para el botón. */
  private readonly ANCHO_ACCIONES_PLEGADAS = 46;

  /** Las grillas de esta pantalla que tienen columna de acciones. */
  private get grillasConAcciones(): { api?: GridApi; defs: any[] }[] {
    return [
      { api: this.gridApiAgenda,     defs: this.columnDefsAgenda },
      { api: this.gridApiPendientes, defs: this.columnDefsPendientes },
      { api: this.gridApiContactos,  defs: this.columnDefsContactos },
      { api: this.gridApi,           defs: this.columnDefs },
    ];
  }

  /** Dónde empezó la pulsación, para no confundir un arrastre con un toque. */
  private pulsacionEn: string | null = null;

  /**
   * Qué se puede pulsar para plegar o desplegar: la cabecera ACCIONES de
   * cualquier grilla, y el ☰ que queda en las celdas cuando está plegada.
   *
   * Devuelve QUÉ se ha pulsado, no el elemento: ag-Grid rehace la celda entre
   * pointerdown y pointerup —al marcar el foco—, así que comparando elementos
   * el botón de la celda no respondía nunca al ratón.
   */
  private objetivoPlegado(e: Event): string | null {
    const t = e.target as HTMLElement;
    if (!t?.closest) { return null; }
    if (t.closest('.ag-header-cell[col-id="acciones"]')) { return 'cabecera'; }
    if (t.closest('[data-accion="desplegar-acciones"]')) { return 'boton'; }
    return null;
  }

  /**
   * Va por pointerup y NO por click.
   *
   * Con el dedo, ag-Grid se queda el toque de la cabecera —llegan
   * pointerdown, touchstart, pointerup y touchend, pero NUNCA un click—, así
   * que escuchando `click` esto no funcionaba en el teléfono. `pointerup`
   * sirve igual para el ratón y para el dedo.
   *
   * Se guarda dónde empezó la pulsación para que arrastrar el ancho de una
   * columna y soltar encima de la cabecera no la pliegue sin querer.
   *
   * Delegado en el componente entero a propósito: las grillas de las pestañas
   * se crean al abrirlas, así que engancharse a cada cabecera obligaría a
   * repetir el enganche en cada `onGridReady` y a soltarlo al destruir. Un
   * escuchador de Angular se va solo con el componente.
   */
  @HostListener('pointerdown', ['$event'])
  onPulsacionAbajo(e: PointerEvent): void {
    this.pulsacionEn = this.objetivoPlegado(e);
  }

  @HostListener('pointerup', ['$event'])
  onPulsacionArriba(e: PointerEvent): void {
    const destino = this.objetivoPlegado(e);
    const empezoAhi = !!destino && destino === this.pulsacionEn;
    this.pulsacionEn = null;
    // button 0 es el principal: con el dedo también llega como 0
    if (empezoAhi && e.button === 0) { this.alternarAcciones(); }
  }

  /** Pliega o despliega la columna de acciones en las cuatro grillas. */
  alternarAcciones(): void {
    this.accionesPlegadas = !this.accionesPlegadas;

    for (const g of this.grillasConAcciones) {
      const col = (g.defs ?? []).find((c: any) => c?.field === 'acciones');
      if (!col) { continue; }

      // La primera vez se guarda cómo venía: cada grilla tiene su propio ancho
      // (118, 142, 140, 110) y hay que devolverle el suyo, no uno común.
      if (col.anchoAbierto === undefined) {
        col.anchoAbierto = col.minWidth;
        col.rotuloAbierto = col.headerName;
      }

      const ancho = this.accionesPlegadas ? this.ANCHO_ACCIONES_PLEGADAS : col.anchoAbierto;
      col.minWidth = ancho;
      col.maxWidth = ancho;
      col.headerName = this.accionesPlegadas ? '' : col.rotuloAbierto;
      col.headerComponentParams = {
        template: this.plantillaCabecera(col.rotuloAbierto, this.accionesPlegadas),
      };

      g.api?.setColumnDefs(g.defs);
      // Las celdas cambian de contenido, no sólo de ancho: con la columna
      // plegada enseñan el botón de devolverla
      g.api?.redrawRows();
      g.api?.sizeColumnsToFit();
    }
  }

  /**
   * La cabecera de la columna de acciones, con la flecha que anuncia que se
   * puede plegar. Va desde el principio: sin ella nadie adivina que la
   * cabecera responde al clic.
   */
  private cabeceraAcciones(rotulo: string): { template: string } {
    return { template: this.plantillaCabecera(rotulo, false) };
  }

  /**
   * Lo que se pulsa en la cabecera, como <button> y no como <div>.
   *
   * No es cosmética: en iOS un elemento que no es interactivo pero tiene regla
   * :hover pide DOS toques —el primero lo deja «por encima», el segundo
   * pulsa—, y era lo que obligaba a dar doble toque para plegar la columna en
   * el teléfono. Siendo un botón, el navegador dispara el clic a la primera.
   */
  private plantillaCabecera(rotulo: string, plegada: boolean): string {
    const titulo = plegada ? 'Mostrar los botones de acción' : 'Ocultar los botones de acción';
    const dentro = plegada
      ? `<i class="fa fa-bars"></i>`
      : `<span>${rotulo}</span><i class="fa fa-arrow-right"></i>`;
    return `<button type="button" class="gc-acciones-cabecera" title="${titulo}" aria-label="${titulo}">${dentro}</button>`;
  }

  /** El botón que devuelve la columna, para que siempre haya algo pulsable. */
  private botonDesplegarAcciones(): string {
    return `<button type="button" class="btn-icon gc-desplegar" data-accion="desplegar-acciones"`
         + ` title="Mostrar los botones de acción" aria-label="Mostrar los botones de acción">`
         + `<i class="fa fa-bars"></i></button>`;
  }

  /**
   * El número de una celda, puesto donde no lo lea una extensión.
   *
   * Sale en un atributo y lo pinta el CSS (.numero-plano, en styles.css):
   * así no hay texto que recorrer y Zoiper Click2Dial no le engancha su
   * logotipo ni la bandera del país. Se ve y se ordena igual, porque el
   * valor de la celda no cambia; lo único que se pierde es seleccionarlo
   * con el ratón, y para eso están el botón de copiar y, en contactos, la
   * propia celda, que se edita.
   *
   * Es una propiedad y no un método para que ag-Grid lo llame sin perder
   * el `this` del componente.
   */
  public celdaNumero = (p: any): string => {
    const n = String(p.value ?? '').trim().replace(/["<>&]/g, '');
    return n ? `<span class="numero-plano" data-numero="${n}"></span>` : '';
  };

  // ================================================================
  // NOTAS DEL CLIENTE
  // ================================================================

  /**
   * Las notas del cliente abierto.
   *
   * Con `forzar` se vuelven a pedir aunque ya se tengan: lo usan el botón de
   * recargar, el buscador y lo que se llama tras guardar o borrar. El buscador
   * va al servidor y no filtra en memoria porque busca también dentro del
   * texto de la nota, que aquí sólo llega recortado a 220 caracteres.
   */
  /**
   * Cambia los huecos de cada nota por los datos de este cliente.
   *
   * Una vez al cargar la lista y no en la plantilla: con un método en el
   * [innerHTML] se recalcularía en cada ciclo de detección de cambios, por
   * cada nota, y aquí hay clientes con cincuenta.
   */
  private resolverHuecosDeLasNotas(): void {
    const datos = datosDeHuecos(this.cliente);
    for (const n of this.notas) {
      n.titulo_vista = aplicarHuecos(n.titulo ?? '', datos);
      // El token va al final, sobre el html ya resuelto: las imágenes del
      // servidor no se ven sin él desde que ver/{id} pide sesión
      n.contenido_vista = conTokenLasImagenes(aplicarHuecos(n.contenido ?? '', datos));
    }
  }

  async cargarNotas(forzar = false): Promise<void> {
    const id = this.cliente?.id;
    if (!id) { this.notas = []; return; }
    if (!forzar && this.notasDe === id) { return; }

    try {
      this.cargandoNotas = true;
      const res: any = await firstValueFrom(this._notaService.allNotas(id, this.buscaNotas));
      this.notas = res?.status === 'success' ? (res.data ?? []) : [];
      this.resolverHuecosDeLasNotas();
      this.notasDe = id;
    } catch (error) {
      // El AuthInterceptor ya muestra el toast del error HTTP
      console.error('Error al cargar las notas del cliente:', error);
      this.notas = [];
    } finally {
      this.cargandoNotas = false;
    }
  }

  /**
   * Abre la nota para leerla entera.
   *
   * En la tarjeta el cuerpo va recortado a seis renglones para que una nota
   * larga no deje a las demás fuera de pantalla; aquí se lee completa y, con
   * el botón de expandir del panel, a pantalla entera —que es lo que hace
   * falta cuando lleva una captura—.
   *
   * Sólo se lee: para corregirla está el botón de modificar de la tarjeta, y
   * para llevársela en papel el de imprimir de la barra del visor.
   */
  verNota(n: NotaCliente): void {
    const ref = this.modal.open(VerNotaComponent, { size: 'lg', centered: true, scrollable: false });
    ref.componentInstance.nota = n;
    ref.componentInstance.clienteNombre = this.cliente?.nombre_completo ?? '';
    ref.componentInstance.cliente = this.cliente ?? null;
  }

  nuevaNota(): void {
    if (!this.permiso(this.accesoModel?.crear, 'crear notas')) { return; }
    if (!this.cliente?.id) { return; }
    if (this._seguridadService.isexpired()) { return; }
    this.abrirNota(null);
  }

  editarNota(n: NotaCliente): void {
    if (!this.permiso(this.accesoModel?.editar, 'modificar notas')) { return; }
    if (this._seguridadService.isexpired()) { return; }
    this.abrirNota(n);
  }

  private abrirNota(n: NotaCliente | null): void {
    const ref = this.modal.open(SaveNotaComponent, { size: 'lg', centered: true, backdrop: 'static' });
    ref.componentInstance.clienteId = this.cliente!.id;
    ref.componentInstance.clienteNombre = this.cliente?.nombre_completo ?? '';
    ref.componentInstance.cliente = this.cliente ?? null;
    ref.componentInstance.nota = n;
    this.escucharModal(ref, ref.componentInstance.guardado, () => this.cargarNotas(true));
  }

  /**
   * Fijar o desfijar.
   *
   * Va por su propio endpoint y no por el de guardar: fijar no es editar la
   * nota, y si contara como edición, subir una al principio la haría parecer
   * además la más reciente.
   */
  async fijarNota(n: NotaCliente): Promise<void> {
    if (!this.permiso(this.accesoModel?.editar, 'fijar notas')) { return; }

    try {
      const res: any = await firstValueFrom(this._notaService.fijarNota(n.id));
      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo fijar la nota', 'Error');
        return;
      }
      this._toastr.success(res.message, 'Notas');
      await this.cargarNotas(true);
    } catch (error) {
      console.error('Error al fijar la nota:', error);
    }
  }

  async eliminarNota(n: NotaCliente): Promise<void> {
    if (!this.permiso(this.accesoModel?.eliminar, 'eliminar notas')) { return; }

    const r = await Swal.fire({
      title: '¿Eliminar esta nota?',
      text: `«${n.titulo}». Lo que dice no se puede volver a escribir de memoria; el contenido queda en la auditoría.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
    });
    if (!r.isConfirmed) { return; }

    try {
      const res: any = await firstValueFrom(this._notaService.deleteNota(n.id));
      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo eliminar la nota', 'Error');
        return;
      }
      this._toastr.success(res.message, 'Notas', { closeButton: true });
      await this.cargarNotas(true);
    } catch (error) {
      console.error('Error al eliminar la nota:', error);
    }
  }

  // ================================================================
  // ARCHIVOS DEL CLIENTE
  // ================================================================

  /**
   * Los archivos del cliente abierto.
   *
   * Con `forzar` se vuelven a pedir aunque ya se tengan: es lo que hace el
   * botón de recargar y lo que se llama tras subir o borrar.
   */
  async cargarArchivos(forzar = false): Promise<void> {
    const id = this.cliente?.id;
    if (!id) { this.archivos = []; return; }
    if (!forzar && this.archivosDe === id) { return; }

    try {
      this.cargandoArchivos = true;
      const res: any = await firstValueFrom(this._archivoService.allArchivos(id));
      this.archivos = res?.status === 'success' ? (res.data ?? []) : [];
      this.archivosDe = id;
    } catch (error) {
      // El AuthInterceptor ya muestra el toast del error HTTP
      console.error('Error al cargar los archivos del cliente:', error);
      this.archivos = [];
    } finally {
      this.cargandoArchivos = false;
    }
  }

  /** Lo que ocupan todos juntos, que es lo que avisa de cuándo hay que limpiar. */
  get pesoTotalArchivos(): string {
    return formatoTamano(this.archivos.reduce((t, a) => t + Number(a.tamano ?? 0), 0));
  }

  /** La url con la que se ve un archivo (sin token: la usan <img> y <video>). */
  urlArchivo(a: ArchivoCliente): string {
    return this._archivoService.urlDe(a.id);
  }

  /**
   * Abre el visor: ampliar, girar y pasar al siguiente sin salir de aquí.
   *
   * Antes mandaba el archivo a otra pestaña del navegador, que sirve para
   * verlo pero no para trabajar con él: ni zoom sobre un detalle, ni
   * enderezar una foto tomada de lado, y encima se pierde el cliente de
   * vista. Se le pasan todos los archivos para poder recorrerlos con las
   * flechas, y la forma de armar la url, que la sabe el servicio.
   */
  verArchivo(a: ArchivoCliente): void {
    const ref = this.modal.open(VisorArchivoComponent, {
      size: 'xl', centered: true, scrollable: false, windowClass: 'visor-ventana',
    });
    ref.componentInstance.archivos = this.archivos;
    ref.componentInstance.indice = Math.max(0, this.archivos.findIndex(x => x.id === a.id));
    ref.componentInstance.urlDe = (x: ArchivoCliente, descargar = false) =>
      this._archivoService.urlDe(x.id, descargar);
  }

  /**
   * El clip de la fila, sólo si esa gestión lleva algo.
   *
   * Sale con botonAccion, como los demás: es un botón más de la columna y
   * tiene que verse igual. Cuántos hay va en el título y no dibujado al lado:
   * un número pegado al icono rompía la fila de botones, que es lo único que
   * se lee de un vistazo cuando hay diez gestiones en pantalla.
   */
  private botonAdjuntos(cuantos: any): string {
    const n = Number(cuantos ?? 0);
    if (!n) { return ''; }
    const titulo = n === 1 ? 'Ver el archivo adjunto' : `Ver los ${n} archivos adjuntos`;
    return this.botonAccion('adjuntos', 'btn-adjuntos', 'fa fa-paperclip', titulo, true);
  }
  /**
   * Abre los adjuntos de una gestión en el visor del cliente.
   *
   * El mismo visor de la pestaña de Archivos, no uno parecido: se amplía,
   * se gira y se pasa de uno a otro con las flechas igual que allí. Lo que
   * cambia es de dónde sale la lista.
   */
  async verAdjuntosDeGestion(g: GestionModel): Promise<void> {
    if (!g?.id) { return; }

    let archivos: ArchivoCliente[] = [];
    try {
      const res: any = await firstValueFrom(this._archivoService.archivosDeGestion(g.id, false));
      archivos = res?.status === 'success' ? (res.data ?? []) : [];
    } catch (error) {
      // El AuthInterceptor ya saca el toast del error HTTP
      console.error('Error al traer los adjuntos de la gestión:', error);
      return;
    }

    if (!archivos.length) {
      this._toastr.info('Esta gestión ya no tiene archivos adjuntos', 'Adjuntos');
      return;
    }

    const ref = this.modal.open(VisorArchivoComponent, {
      size: 'xl', centered: true, scrollable: false, windowClass: 'visor-ventana',
    });
    ref.componentInstance.archivos = archivos;
    ref.componentInstance.indice = 0;
    ref.componentInstance.urlDe = (x: ArchivoCliente, descargar = false) =>
      this._archivoService.urlDe(x.id, descargar);
  }

  descargarArchivo(a: ArchivoCliente): void {
    window.open(this._archivoService.urlDe(a.id, true), '_blank', 'noopener');
  }

  agregarArchivos(): void {
    if (!this.permiso(this.accesoModel?.crear, 'agregar archivos')) { return; }
    if (!this.cliente?.id) { return; }
    if (this._seguridadService.isexpired()) { return; }

    const ref = this.modal.open(SubirArchivosComponent, { size: 'lg', centered: true, backdrop: 'static' });
    ref.componentInstance.clienteId = this.cliente.id;
    ref.componentInstance.clienteNombre = this.cliente.nombre_completo ?? '';
    this.escucharModal(ref, ref.componentInstance.subidos, () => this.cargarArchivos(true));
  }

  /**
   * Cambia el nombre y la descripción. El fichero no se toca: para eso se
   * sube otro y se borra éste, que deja rastro en la auditoría.
   */
  async editarArchivo(a: ArchivoCliente): Promise<void> {
    if (!this.permiso(this.accesoModel?.editar, 'modificar archivos')) { return; }

    const r = await Swal.fire({
      title: 'Modificar el archivo',
      html:
        `<input id="arch-nombre" class="swal2-input" maxlength="150" placeholder="Nombre"
                value="${(a.nombre ?? '').replace(/"/g, '&quot;')}">` +
        `<textarea id="arch-desc" class="swal2-textarea" maxlength="4000"
                   placeholder="Para qué es este archivo">${a.descripcion ?? ''}</textarea>`,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#00acac',
      cancelButtonColor: '#6c757d',
      preConfirm: () => {
        const nombre = (document.getElementById('arch-nombre') as HTMLInputElement)?.value?.trim();
        const descripcion = (document.getElementById('arch-desc') as HTMLTextAreaElement)?.value?.trim();
        if (!nombre) {
          Swal.showValidationMessage('El nombre no puede quedar vacío');
          return false;
        }
        return { nombre, descripcion };
      },
    });
    if (!r.isConfirmed || !r.value) { return; }

    try {
      const res: any = await firstValueFrom(this._archivoService.editArchivo(a.id, {
        nombre: r.value.nombre,
        descripcion: r.value.descripcion || null,
        activo: a.activo !== false,
      }));
      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo guardar', 'Error');
        return;
      }
      this._toastr.success(res.message, 'Archivos', { closeButton: true });
      await this.cargarArchivos(true);
    } catch (error) {
      console.error('Error al modificar el archivo:', error);
    }
  }

  async eliminarArchivo(a: ArchivoCliente): Promise<void> {
    if (!this.permiso(this.accesoModel?.eliminar, 'eliminar archivos')) { return; }

    const r = await Swal.fire({
      title: '¿Eliminar este archivo?',
      text: `«${a.nombre}» se borra del cliente y del servidor. El movimiento queda en la auditoría.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
    });
    if (!r.isConfirmed) { return; }

    try {
      const res: any = await firstValueFrom(this._archivoService.deleteArchivo(a.id));
      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo eliminar', 'Error');
        return;
      }
      this._toastr.success(res.message, 'Archivos', { closeButton: true });
      await this.cargarArchivos(true);
    } catch (error) {
      console.error('Error al eliminar el archivo:', error);
    }
  }

  // ================================================================
  // MARCAR CON EL SOFTPHONE (ZOIPER)
  // ================================================================

  // Todo esto vive en SoftphoneService desde que la lista de clientes también
  // marca; aquí sólo queda lo que usa la plantilla, delegando.
  //
  // No hay ningún método que devuelva la URL del softphone: se marca llamando
  // al servicio, nunca poniéndola en un href. Un enlace saca el cartel de
  // «¿abandonar la página?» y además Safari del iPhone y la integración de
  // Zoiper en el navegador lo decoran con su icono y la bandera del país.

  /**
   * Antes de marcar, de qué va la llamada.
   *
   * Se abre el mismo menú que en WhatsApp, con los asuntos de tipo LLAMADA:
   * se elige uno, SE MARCA, y la gestión se abre con el asunto puesto y —si
   * ese asunto trae mensaje— con él de guion en «Qué se habló». Lo que se
   * gana es que el asunto queda elegido cuando se sabe, al descolgar, y no
   * diez minutos después intentando acordarse.
   *
   * Se marca directamente, sin menú, en los dos casos en que el menú no
   * pintaría nada: sin cliente en pantalla no hay gestión que abrir —se marca
   * desde la lista de clientes y ya—, y sin asuntos de LLAMADA en el catálogo
   * el menú saldría vacío.
   *
   * La firma no cambia: los diez sitios que marcan siguen llamando igual.
   */
  llamarConSoftphone(numero?: string | null, quien?: string | null): void {
    if (!numero) {
      this._toastr.warning('No tiene teléfono registrado', 'Sin número');
      return;
    }

    if (!this.cliente || !this.asuntosLlamada.length || this.accesoModel?.crear === false) {
      this.marcarYAbrirGestion(numero, quien);
      return;
    }

    // Un tic de espera, y no es un adorno: el clic que abre este menú sigue
    // subiendo hasta document, donde onCerrarMenuGlobal cierra los menús. Si
    // se abriera aquí mismo, se cerraría solo en el mismo clic. El de WhatsApp
    // no lo necesita porque corta la propagación, y eso aquí no se puede: los
    // diez sitios que marcan llaman sin evento.
    setTimeout(() => {
      // El menú nace donde está el puntero: lo abren botones de la ficha, de
      // las grillas y de los menús contextuales, y pasarle el elemento a cada
      // uno sería tocar diez sitios para colocar un recuadro.
      this.menuTel = {
        visible: true,
        x: Math.min(this.ultimoPuntero.x, Math.max(8, window.innerWidth - 260)),
        y: this.ultimoPuntero.y + 8,
        numero,
        aQuien: quien ?? null,
      };

      setTimeout(() => {
        const el = this.menuTelEl?.nativeElement;
        if (!el) { return; }
        const m = el.getBoundingClientRect();
        if (m.right > window.innerWidth)   { this.menuTel.x = Math.max(8, window.innerWidth - m.width - 8); }
        if (m.bottom > window.innerHeight) { this.menuTel.y = Math.max(8, this.ultimoPuntero.y - m.height - 8); }
      });
    });
  }

  cerrarMenuLlamada(): void {
    if (this.menuTel.visible) { this.menuTel.visible = false; }
  }

  // ---------- Correo ----------
  //
  // Lo mismo que la llamada y que WhatsApp: de qué va, antes de escribir. La
  // diferencia es quién manda el correo: Outlook, el que está instalado en el
  // puesto, al que se le habla por el mismo ayudante del protocolo micrm3:
  // (ver copiar-archivos.ps1, en «.mis configuraciones/base de datos/4. herramientas» del back). Y va DESPUÉS de guardar, como el
  // WhatsApp: primero queda escrita la gestión, después sale el correo.

  escribirCorreo(para?: string | null, aQuien?: string | null): void {
    if (!para || !para.includes('@')) {
      this._toastr.warning('No tiene un correo al que escribir', 'Correo');
      return;
    }

    if (!this.cliente || !this.asuntosCorreo.length || this.accesoModel?.crear === false) {
      this.abrirCorreo(para, '', '');
      return;
    }

    // Un tic de espera, por lo mismo que el menú de la llamada: el clic que lo
    // abre sigue subiendo hasta document, donde se cierran los menús.
    setTimeout(() => {
      this.menuCorreo = {
        visible: true,
        x: Math.min(this.ultimoPuntero.x, Math.max(8, window.innerWidth - 260)),
        y: this.ultimoPuntero.y + 8,
        para,
        aQuien: aQuien ?? null,
      };

      setTimeout(() => {
        const el = this.menuCorreoEl?.nativeElement;
        if (!el) { return; }
        const m = el.getBoundingClientRect();
        if (m.right > window.innerWidth)   { this.menuCorreo.x = Math.max(8, window.innerWidth - m.width - 8); }
        if (m.bottom > window.innerHeight) { this.menuCorreo.y = Math.max(8, this.ultimoPuntero.y - m.height - 8); }
      });
    });
  }

  cerrarMenuCorreo(): void {
    if (this.menuCorreo.visible) { this.menuCorreo.visible = false; }
  }

  /**
   * Abre la gestión del correo, con el mensaje listo para salir al guardar.
   *
   * El cuerpo viaja en HTML y la nota en texto llano, y no es lo mismo: el
   * correo lleva el formato que se escribió en el catálogo, y «Qué se habló»
   * es el historial, donde unas etiquetas <p> sólo estorbarían.
   *
   * @param asunto null escribe sin asunto: el correo sale en blanco y la
   *        gestión también, pero queda registrada.
   */
  correoConAsunto(asunto: AsuntoGestion | null): void {
    const para = this.menuCorreo.para;
    if (!para) { return; }
    if (this._seguridadService.isexpired()) { return; }

    const cuerpoHtml = asunto ? this.textoDePlantilla(asunto) : '';

    const modalRef = this.modal.open(SaveGestionComponent, { centered: true, size: 'xl', backdrop: 'static', keyboard: true });
    modalRef.componentInstance.modo = 'registrar';
    modalRef.componentInstance.cliente = this.cliente;
    modalRef.componentInstance.contactos = this.contactos;
    modalRef.componentInstance.gestion = null;
    modalRef.componentInstance.tipoInicial = 'CORREO';
    if (asunto) { modalRef.componentInstance.asuntoInicial = asunto.id; }
    // El HTML tal cual: el editor lo enseña con su formato, que es justo de
    // lo que se trata. Antes iba en texto llano porque el campo era llano.
    modalRef.componentInstance.notaInicial = cuerpoHtml;
    modalRef.componentInstance.correoPendiente = {
      para,
      asunto: asunto?.nombre ?? '',
      cuerpoHtml,
    };
    this.escucharModal(modalRef, modalRef.componentInstance.guardado, () => this.refrescar());
  }

  /**
   * Outlook, con el correo ya escrito.
   *
   * Lo abre el ayudante del puesto y no un enlace mailto: porque mailto sólo
   * admite texto llano —el formato del mensaje se perdería— y porque así el
   * correo puede llevar los adjuntos de la gestión. Si el puesto no tiene el
   * ayudante instalado, Windows no reconoce el protocolo y no pasa nada: la
   * gestión queda guardada igual.
   */
  abrirCorreo(para: string, asunto: string, cuerpoHtml: string, ids: number[] = []): void {
    lanzarProtocolo('micrm3://correo'
      + '?para=' + encodeURIComponent(para)
      + '&asunto=' + encodeURIComponent(asunto)
      + '&cuerpo=' + encodeURIComponent(cuerpoHtml)
      + (ids.length ? '&ids=' + ids.join(',') : ''));
  }

  /**
   * Marca y abre la gestión, con el asunto elegido si lo hubo.
   *
   * @param asunto null es «Llamar sin asunto»: marca y abre el formulario en
   *        blanco, que es como funcionaba antes de que hubiera menú.
   */
  llamarConAsunto(asunto: AsuntoGestion | null): void {
    const numero = this.menuTel.numero;
    const quien = this.menuTel.aQuien;
    if (!numero) { return; }

    this.marcarYAbrirGestion(numero, quien, asunto);
  }

  /** Lo que hacía `llamarConSoftphone` antes del menú, más el asunto. */
  private marcarYAbrirGestion(numero: string, quien?: string | null, asunto: AsuntoGestion | null = null): void {
    const marcado = this._softphone.marcar(numero);
    if (!marcado) {
      this._toastr.warning('No tiene teléfono registrado', 'Sin número');
      return;
    }
    this._toastr.info('Marcando ' + marcado + '…', quien || 'Zoiper', { timeOut: 2500 });

    if (this.cliente) { this.abrirGestionDeLlamada(marcado, asunto); }
  }

  /**
   * El formulario de gestión que acompaña a la llamada.
   *
   * Va en un setTimeout corto porque el lanzamiento del protocolo y la
   * apertura del modal caen en el mismo gesto: dándole ese respiro, el
   * navegador termina de entregarle el enlace al sistema antes de ponerse a
   * montar el diálogo.
   */
  private abrirGestionDeLlamada(numero: string, asunto: AsuntoGestion | null = null): void {
    // Marcar sí se le deja a todo el que vea al cliente; lo que no se abre, si
    // no puede crear, es el formulario. Sin aviso: la llamada ya está saliendo
    // y un cartel de «sin permiso» justo ahí se lee como que falló el marcado.
    if (this.accesoModel?.crear === false) { return; }
    if (this._seguridadService.isexpired()) { return; }

    setTimeout(() => {
      if (!this.cliente) { return; }

      const modalRef = this.modal.open(SaveGestionComponent, { centered: true, size: 'xl', backdrop: 'static', keyboard: true });
      modalRef.componentInstance.modo = 'registrar';
      modalRef.componentInstance.cliente = this.cliente;
      modalRef.componentInstance.contactos = this.contactos;
      modalRef.componentInstance.gestion = null;
      // El tipo ya sale LLAMADA por defecto; lo que el formulario no puede
      // saber es a qué número se llamó, que puede ser el de un contacto.
      modalRef.componentInstance.telefonoInicial = numero;

      if (asunto) {
        modalRef.componentInstance.tipoInicial = 'LLAMADA';
        modalRef.componentInstance.asuntoInicial = asunto.id;
        // El mensaje del asunto, de guion: para una llamada no se envía nada,
        // se lee. Por eso va en la nota y no en ningún otro sitio.
        modalRef.componentInstance.notaInicial = comoHtml(this.textoDePlantilla(asunto));
      }

      this.escucharModal(modalRef, modalRef.componentInstance.guardado, () => this.refrescar());
    }, 400);
  }
  // El enlace y el número internacional los arma plantillasWhatsapp.ts, que es
  // de donde los toma también el formulario de gestión. Aquí había una copia
  // igual de las dos funciones; lo mismo escrito dos veces es lo mismo hasta
  // que alguien arregla una sola, que es justo lo que pasó con la pestaña en
  // blanco del enlace whatsapp://.

  /**
   * ¿A ese número se le puede escribir? Lo usan la plantilla y la grilla de
   * contactos para no ofrecer el botón donde el enlace saldría inservible
   * (un fijo, o un número a medio teclear). La regla vive en
   * plantillasWhatsapp.ts, que es de donde la toma también saveGestion.
   */
  public tieneWhatsapp = puedeTenerWhatsapp;

  /** Dónde se abre el chat: en el navegador o en la aplicación instalada. */
  public get destinoWhatsapp(): 'web' | 'app' {
    try { return localStorage.getItem('miCRM3.whatsapp') === 'app' ? 'app' : 'web'; } catch { return 'web'; }
  }

  /** Cambia de WhatsApp Web a la aplicación de escritorio y al revés. */
  alternarDestinoWhatsapp(): void {
    const nuevo = this.destinoWhatsapp === 'app' ? 'web' : 'app';
    try { localStorage.setItem('miCRM3.whatsapp', nuevo); } catch { /* sin storage */ }
    this._toastr.info(
      nuevo === 'app' ? 'Los chats se abrirán en la aplicación instalada' : 'Los chats se abrirán en WhatsApp Web',
      'WhatsApp', { timeOut: 2500 },
    );
  }

  /**
   * Abre el menú de plantillas junto al botón que se pulsó.
   *
   * `ancla` es para los botones que pinta ag-Grid: ahí el manejador lo llama
   * el grid y `currentTarget` ya no es el botón, así que se le pasa el
   * elemento a mano. Sin ella sigue valiendo el del propio evento, que es como
   * lo llaman los botones de la ficha.
   */
  abrirMenuWhatsapp(ev: MouseEvent, numero?: string | null, aQuien?: string | null, ancla?: HTMLElement | null): void {
    ev.stopPropagation();

    if (!numero) {
      this._toastr.warning('No tiene un número al que escribir', 'WhatsApp');
      return;
    }

    const base = ancla ?? (ev.currentTarget as HTMLElement) ?? (ev.target as HTMLElement);
    const r = base.getBoundingClientRect();
    this.menuWa = { visible: true, x: r.left, y: r.bottom + 4, numero, aQuien: aQuien ?? null };

    // Si no cabe hacia abajo o hacia la derecha, se recoloca
    setTimeout(() => {
      const el = this.menuWaEl?.nativeElement;
      if (!el) { return; }
      const m = el.getBoundingClientRect();
      if (m.right > window.innerWidth)   { this.menuWa.x = Math.max(8, window.innerWidth - m.width - 8); }
      if (m.bottom > window.innerHeight) { this.menuWa.y = Math.max(8, r.top - m.height - 4); }
    });
  }

  cerrarMenuWhatsapp(): void {
    if (this.menuWa.visible) { this.menuWa.visible = false; }
  }

  /**
   * Traer al historial una conversación ya mantenida por WhatsApp.
   *
   * Se importa el .txt que deja «Exportar chat», no se lee la ventana de
   * WhatsApp: Windows no expone el texto de los mensajes —vive dentro del
   * WebView2 y su árbol de accesibilidad sólo se construye si lo pide un
   * lector de pantalla al arrancar— y lo otro sería entrar en su almacén
   * cifrado, que se rompe en cada actualización.
   *
   * Queda como una gestión de tipo WhatsApp, así que entra en el historial y
   * cuenta en las estadísticas igual que si se hubiera registrado a mano.
   */
  importarConversacion(): void {
    if (!this.permiso(this.accesoModel?.crear, 'importar conversaciones')) { return; }
    if (!this.cliente?.id) { return; }

    const ref = this.modal.open(ImportarConversacionComponent, {
      size: 'lg', centered: true, backdrop: 'static',
    });
    ref.componentInstance.cliente = this.cliente;
    ref.componentInstance.numero  = this.cliente?.celular || this.cliente?.telefono || '';
    ref.componentInstance.asuntos = this.plantillasWhatsapp;

    // Al terminar se recarga todo: la gestión nueva sale en el historial y en
    // los contadores de arriba, que si no seguirían diciendo lo de antes.
    this.escucharModal(ref, ref.componentInstance.guardado, () => this.refrescar());
  }

  /** Toda la conversación: sube hasta llegar al principio del chat. */
  capturarConversacion(): Promise<void> { return this.capturar('todo'); }

  /** Sólo lo que se ve ahora, que es el final del chat. */
  capturarUltimaPantalla(): Promise<void> { return this.capturar('pantalla'); }

  /**
   * Fotografiar el chat y colgarlo de una gestión.
   *
   * Lo hace el ayudante del equipo (capturar-whatsapp.ps1): abre el chat,
   * fotografía la ventana y, si se le pide todo, sube media pantalla y repite
   * hasta que dos capturas salen idénticas —que es la señal de que el scroll ya
   * no mueve nada y se llegó al principio—. Cada pantallazo queda como adjunto.
   *
   * LA GESTIÓN SE CREA ANTES. El ayudante necesita un id al que colgar las
   * imágenes, y no puede crearla él: no sabría qué asunto ni qué vendedor. Si la
   * captura falla, queda la gestión con cero adjuntos, que se ve y se borra; al
   * revés —capturar y no tener dónde dejarlo— se perderían las imágenes sin que
   * nadie se entere.
   *
   * ESTO SON IMÁGENES: no se busca dentro de ellas ni se copia un número. Para
   * tener el texto está «Importar», que trae la conversación entera en un .txt.
   */
  private async capturar(cuanto: 'todo' | 'pantalla'): Promise<void> {
    if (!this.permiso(this.accesoModel?.crear, 'capturar conversaciones')) { return; }
    if (!this.cliente?.id) { return; }

    const numero = this.cliente?.celular || this.cliente?.telefono || '';
    if (!numero) {
      this._toastr.info('Este cliente no tiene un número al que abrirle el chat', 'WhatsApp');
      return;
    }

    const asunto = this.plantillasWhatsapp.find(a => esAsuntoDeImportacion(a.nombre));
    if (!asunto) {
      this._toastr.error(
        'Falta el asunto «Importación de mensajes de WhatsApp» en el catálogo de gestiones',
        'No se puede capturar');
      return;
    }

    const todo = cuanto === 'todo';
    const r = await Swal.fire({
      title: todo ? '¿Capturar toda la conversación?' : '¿Capturar la última pantalla?',
      text: todo
        ? 'Se abrirá tu WhatsApp y se irá fotografiando el chat hacia atrás hasta el '
          + 'principio. Tarda unos segundos y conviene no tocar la ventana mientras: '
          + 'cada pantalla queda como adjunto de una gestión nueva.'
        : 'Se abrirá tu WhatsApp y se guardará una sola foto, la de lo que se ve ahora '
          + '—el final del chat—, como adjunto de una gestión nueva.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#25d366',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Capturar',
      cancelButtonText: 'Cancelar',
      reverseButtons: true,
    });
    if (!r.isConfirmed) { return; }

    let gestionId: number | null = null;
    try {
      const res: any = await firstValueFrom(this._gestionService.addGestion({
        cliente_id:    this.cliente.id,
        tipo:          'WHATSAPP',
        estado:        'REALIZADA',
        modo_registro: 'IMPORTADA',
        asunto_id:     asunto.id,
        asunto:        asunto.nombre,
        nota: todo
          ? '<p><i>Conversación capturada en imágenes. Las pantallas están en los adjuntos.</i></p>'
          : '<p><i>Última pantalla de la conversación, capturada en imagen. Está en los adjuntos.</i></p>',
        usuario_id:    this.cliente.vendedor_id ?? null,
        telefono:      numero,
        prioridad:     'MEDIA',
        resultado:     'CONTACTADO',
      }));
      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo crear la gestión', 'Error');
        return;
      }
      gestionId = res.data?.id ?? null;
    } catch (error) {
      // El AuthInterceptor ya saca el toast del error HTTP
      console.error('Error al crear la gestión de las capturas:', error);
      return;
    }
    if (!gestionId) { return; }

    // El token va en el enlace porque el ayudante tiene que SUBIR, y subir pide
    // sesión. El enlace no sale de este equipo —lo atiende un programa local—,
    // pero queda en la línea de comandos del proceso mientras dura.
    const token = localStorage.getItem('token') ?? '';
    lanzarProtocolo('micrm3://capturas'
      + '?tel=' + encodeURIComponent(numero)
      + '&gestion=' + gestionId
      + '&cliente=' + this.cliente.id
      + '&max=' + (todo ? 25 : 1)
      + '&token=' + encodeURIComponent(token));

    this._toastr.info(
      todo
        ? 'Capturando… las imágenes van apareciendo en los adjuntos de la gestión.'
        : 'Capturando la pantalla… en unos segundos estará en los adjuntos de la gestión.',
      'WhatsApp', { timeOut: 9000, closeButton: true });

    // Un respiro y se recarga. Una sola pantalla tarda poco; la conversación
    // entera, lo que tarde: para entonces suelen estar las primeras.
    setTimeout(() => this.refrescar(), todo ? 12000 : 6000);
  }

  /** ¿Ese asunto trae mensaje escrito? Lo usa el menú para distinguirlos. */
  public traeMensaje = traeMensaje;

  /** El texto de una respuesta, ya con el nombre del cliente y el del vendedor. */
  textoDePlantilla(plantilla: AsuntoGestion): string {
    return aplicarHuecos(plantilla.mensaje ?? '', datosDeHuecos(this.cliente));
  }

  /**
   * A qué contacto del cliente corresponde ese mensaje.
   *
   * Se busca primero por el número, que es dato duro, y sólo si no aparece
   * por el nombre que enseñaba la grilla. Si no es de ninguno —lo normal
   * cuando se escribe al celular del cliente— se devuelve null y el combo
   * queda vacío.
   */
  private contactoLlamado(aQuien?: string | null, numero?: string | null): number | null {
    const soloDigitos = (s?: string | null) => (s ?? '').replace(/\D/g, '');
    const buscado = soloDigitos(numero);

    const porNumero = buscado
      ? this.contactos.find(c => soloDigitos(c.telefono) === buscado || soloDigitos(c.telefono_alterno) === buscado)
      : undefined;
    if (porNumero?.id) { return porNumero.id; }

    const nombre = (aQuien ?? '').trim().toLowerCase();
    const porNombre = nombre
      ? this.contactos.find(c => (c.nombres ?? '').trim().toLowerCase() === nombre)
      : undefined;
    return porNombre?.id ?? null;
  }

  /**
   * Elegir una respuesta abre la gestión; el chat se abre al guardarla.
   *
   * Antes era al revés: se abría el chat y la gestión se registraba sola por
   * detrás. Parecía cómodo y era frágil —si el registro fallaba, el mensaje
   * ya había salido y el historial mentía— y además dejaba la gestión sin
   * nada que contar: el vendedor no podía escribir lo que de verdad pasó en
   * la conversación, porque nadie le preguntaba.
   *
   * Ahora se hace como con las llamadas: se abre el formulario con el mensaje
   * ya puesto en «Qué se habló», y el botón pasa a ser «Guardar y enviar».
   * Primero queda escrito, después se manda.
   *
   * El asunto puede no traer mensaje: entonces el chat se abre en blanco,
   * pero la gestión se registra igual con ese asunto. Lo que pone la gestión
   * en marcha es haber elegido de qué va la conversación, no que hubiera un
   * texto preparado.
   *
   * @param plantilla null es «Abrir el chat sin mensaje»: ahí no se eligió
   *        asunto, así que no hay nada que registrar; puede que sólo se vaya
   *        a leer la conversación.
   */
  escribirPorWhatsapp(numero?: string | null, plantilla: AsuntoGestion | null = null, aQuien?: string | null): void {
    if (!numeroInternacional(numero)) {
      this._toastr.warning('No tiene un número al que escribir', 'WhatsApp');
      return;
    }

    const texto = plantilla ? this.textoDePlantilla(plantilla) : '';

    // Sin asunto no hay gestión que abrir; y sin permiso para crearlas,
    // tampoco: se escribe al cliente igual, que es lo que no se le puede
    // quitar a nadie, aunque esa vez no quede registrada.
    if (!plantilla || !this.cliente?.id || this.accesoModel?.crear === false) {
      abrirWhatsapp(numero, texto);
      return;
    }
    if (this._seguridadService.isexpired()) { return; }

    const modalRef = this.modal.open(SaveGestionComponent, { centered: true, size: 'xl', backdrop: 'static', keyboard: true });
    modalRef.componentInstance.modo = 'registrar';
    modalRef.componentInstance.cliente = this.cliente;
    modalRef.componentInstance.contactos = this.contactos;
    modalRef.componentInstance.gestion = null;
    modalRef.componentInstance.telefonoInicial = numero;
    modalRef.componentInstance.tipoInicial = 'WHATSAPP';
    modalRef.componentInstance.notaInicial = comoHtml(texto);
    // El asunto va por id y no por su nombre: la respuesta ES un asunto del
    // catálogo, así que no hay nada que buscar ni nada que pueda no encontrarse.
    modalRef.componentInstance.asuntoInicial = plantilla.id;
    // Con quién se habló: antes se pegaba al asunto porque no había dónde
    // ponerlo; ahora va en su campo, que es de donde salen los informes.
    modalRef.componentInstance.contactoInicial = this.contactoLlamado(aQuien, numero);
    modalRef.componentInstance.whatsappPendiente = { numero: String(numero), texto };
    this.escucharModal(modalRef, modalRef.componentInstance.guardado, () => this.refrescar());
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
