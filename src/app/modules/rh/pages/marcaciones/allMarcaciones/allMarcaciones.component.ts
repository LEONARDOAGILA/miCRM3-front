import { Component, ElementRef, EventEmitter, HostListener, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, firstValueFrom, from, merge, of } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';
import { CellClickedEvent, GridApi, GridReadyEvent } from 'ag-grid-community';
import { ICellRendererAngularComp } from 'ag-grid-angular';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';

///   SERVICIOS   ///
import { SeguridadService } from '../../../../seguridad/services/seguridad.service';
import { MarcacionService } from '../../../services/marcacion.service';
import { AppPrintPdfService } from '../../../../../service/app-printPdf.service';
import { AppExportExcelService } from '../../../../../service/app-exportExcel.service';
import { AppExportCsvService } from '../../../../../service/app-exportCsv.service';
import { AppAgGridService } from '../../../../../service/app-agGrid.service';
import { LoadingService } from '../../../../../service/loading.service';

///   MODELOS   ///
import { MarcacionModel, ORIGENES_MARCACION, ResumenDia, TIPOS_MARCACION } from '../../../interfaces/marcacionModel';
import { AccesoModel } from '../../../../seguridad/interfaces/accesoModel';

///   COMPONENTES   ///
import { SaveMarcacionComponent } from '../saveMarcacion/saveMarcacion.component';
import { DeleteMarcacionComponent } from '../deleteMarcacion/deleteMarcacion.component';
import { ListEmpleadosComponent } from '../../empleados/listEmpleados/listEmpleados.component';
import { AuditoriaModalComponent } from '../../../../../components/auditoria-modal/auditoria-modal.component';
import { CampoBusquedaPaginacionComponent } from '../../../../../components/campos/campoBusquedaPaginacion/campoBusquedaPaginacion.component';
import { PestanaTab } from '../../../../../components/campos/tabPanel/tabPanel.component';
import { AppDescargaService, PeticionDescarga, AccionDescarga }
  from '../../../../../service/app-descarga.service';

/**
 * Marcaciones (entradas y salidas), en dos pestañas.
 *
 *   · MARCACIONES     la grilla, con el atraso de cada entrada medido
 *                     contra el horario del empleado.
 *   · HORAS TRABAJADAS lo que suma cada uno por día en el mismo rango.
 *
 * LOS FILTROS SON DE LAS DOS y por eso están fuera: el rango de fechas y el
 * empleado valen igual para la grilla que para el resumen, y tenerlos
 * duplicados dentro de cada pestaña sería pedirle al usuario que los
 * ajustara dos veces.
 *
 * Paginación en servidor. Desde aquí se corrigen las marcaciones (hora,
 * tipo, observación) y se añaden a mano las que falten.
 */
@Component({
  selector: 'app-allMarcaciones',
  templateUrl: './allMarcaciones.component.html',
  styleUrls: ['./allMarcaciones.component.css'],
  standalone: false,
})
export class AllMarcacionesComponent implements OnInit, OnDestroy {

  /** Pregunta qué descargar (la página o todo) y trae las filas. */
  private readonly _appDescargaService = inject(AppDescargaService);

  public accesoModel: AccesoModel;
  public titulo = 'Marcaciones';
  public isLoading$ = this._loadingService.isLoading$;

  public marcaciones: MarcacionModel[] = [];
  public selectedRow: MarcacionModel | null = null;
  public accionesPlegadas = false;

  // ---------- Filtros ----------
  public desde = this.hoyIso();
  public hasta = this.hoyIso();
  public empleadoId: number | null = null;
  public empleadoNombre = '';
  public tipo: string | null = null;
  public origen: string | null = null;
  public searchTerm = '';
  public tipos = TIPOS_MARCACION;
  public origenes = ORIGENES_MARCACION;

  // ---------- Las dos vistas ----------
  //
  // Antes el resumen de horas era un panel plegable que se abría ENCIMA de la
  // grilla y la empujaba hacia abajo: con el rango de un mes había que
  // desplazarse un buen trecho para volver a ver las marcaciones. Son dos
  // vistas de lo mismo —los filtros de arriba valen para las dos—, así que
  // van en pestañas, como en Gestión de clientes.
  public vista: 'marcaciones' | 'horas' = 'marcaciones';

  // ---------- Resumen ----------
  public resumen: ResumenDia[] = [];
  public totalesResumen: { empleados: number; dias: number; horas: number } | null = null;

  /** La rejilla de horas: la suya, con su API y sus columnas. */
  public gridApiResumen!: GridApi;
  public columnDefsResumen: any[] = [];

  /** Y su propia paginación, que no es la del listado. */
  public paginaResumen = 1;
  public totalResumen = 0;
  public porPaginaResumen = 15;
  public ultimaPaginaResumen = 1;

  // ================================================================
  // FILTROS DE LA CABECERA
  // ================================================================
  //
  // Los aplica el SERVIDOR, no la rejilla: las dos pestañas paginan, así que
  // ag-Grid sólo tiene las filas de la página y filtrar ahí buscaría dentro
  // de quince. La cabecera sólo recoge lo que el usuario pidió.

  /**
   * Las columnas con filtro en la rejilla de MARCACIONES.
   *
   * Tiene que decir lo mismo que la lista blanca de MarcacionController: lo
   * que no esté allí se tira en el servidor, así que ponerlo sólo aquí sería
   * pintar una caja que no filtra.
   *
   * `atraso_min` es numérico aunque la celda pinte una etiqueta: se filtra por
   * los minutos («> 10»), que es lo que se quiere preguntar. Las SALIDAS no
   * tienen atraso, así que ese filtro las deja fuera.
   */
  private readonly COLUMNAS_FILTRABLES: { [campo: string]: 'texto' | 'numero' } = {
    atraso_min: 'numero', similitud: 'numero',
    fecha: 'texto', hora: 'texto', hora_esperada: 'texto',
    empleado: 'texto', identificacion: 'texto', tipo: 'texto', origen: 'texto',
    departamento: 'texto', dispositivo: 'texto', observacion: 'texto', created_by: 'texto',
  };

  /** Y las de la rejilla de HORAS TRABAJADAS, que es otra cosa. */
  private readonly COLUMNAS_FILTRABLES_RESUMEN: { [campo: string]: 'texto' | 'numero' } = {
    marcaciones: 'numero', horas: 'numero',
    fecha: 'texto', empleado: 'texto', identificacion: 'texto',
    departamento: 'texto', primera_entrada: 'texto', ultima_salida: 'texto',
  };

  /** Lo que haya pedido cada cabecera, tal cual lo da ag-Grid. */
  public filtrosColumna: any = {};
  public filtrosResumen: any = {};

  /** Para no recargar mientras se limpian los filtros de golpe. */
  private limpiando = false;

  /**
   * Las columnas con su filtro de cabecera.
   *
   * El CÓMO —que la rejilla recoja el filtro pero no lo aplique— vive en
   * AppAgGridService. Aquí queda sólo el QUÉ.
   */
  private conFiltros(columnas: any[], lista = this.COLUMNAS_FILTRABLES): any[] {
    return this._appAgGridService.filtrosDeServidor(columnas, lista);
  }

  /** La cabecera del listado pidió otra cosa. Siempre a la página 1. */
  onFiltroColumna(): void {
    if (this.limpiando) { return; }
    this.filtrosColumna = this.gridApi?.getFilterModel() ?? {};
    this.paginaActual = 1;
    this.allMarcaciones(1);
  }

  /** Y la de las horas. */
  onFiltroResumen(): void {
    if (this.limpiando) { return; }
    this.filtrosResumen = this.gridApiResumen?.getFilterModel() ?? {};
    this.paginaResumen = 1;
    this.cargarResumen(1);
  }

  /** Cuántas columnas llevan filtro EN LA PESTAÑA ABIERTA. */
  get cuantasColumnasFiltradas(): number {
    const modelo = this.vista === 'horas' ? this.filtrosResumen : this.filtrosColumna;
    return Object.keys(modelo || {}).length;
  }

  /** Si hay algo que quitar: lo escrito arriba, el empleado o una columna. */
  get hayFiltro(): boolean {
    return !!this.searchTerm || !!this.empleadoId || !!this.tipo || !!this.origen
        || this.cuantasColumnasFiltradas > 0;
  }

  /**
   * Las dos pestañas, con lo que hay dentro de cada una.
   *
   * Es un getter y no un campo porque las insignias cambian con los datos:
   * cuántas marcaciones trae el rango y cuántas horas suman.
   */
  get pestanas(): PestanaTab[] {
    return [
      {
        id: 'marcaciones', texto: 'Marcaciones', icono: 'fa-fingerprint',
        insignia: this.totalRegistros || null, tonoInsignia: 'tema',
        ayuda: 'Las entradas y salidas, con el atraso de cada una',
      },
      {
        id: 'horas', texto: 'Horas trabajadas', icono: 'fa-clock',
        insignia: this.totalesResumen?.horas || null, tonoInsignia: 'apagada',
        ayuda: 'Lo que suma cada empleado por día en el rango elegido',
      },
    ];
  }

  // ---------- Paginación ----------
  public paginaActual = 1;
  public totalRegistros = 0;
  public registrosPorPagina = 15;
  public ultimaPagina = 1;

  // ---------- ag-Grid ----------
  public gridApi!: GridApi;
  public columnDefs: any[] = [];

  @ViewChild(CampoBusquedaPaginacionComponent) campoBusqueda?: CampoBusquedaPaginacionComponent;

  private readonly unsubscribe$ = new Subject<void>();
  private timeoutIds = new Set<any>();
  private resizeTimeoutId: any;
  private headerElement: Element | null = null;
  private readonly onHeaderClick: EventListener = () => this.toggleActionsColumn();

  constructor(
    private host: ElementRef<HTMLElement>,
    private modal: NgbModal,
    private router: Router,
    private activeRoute: ActivatedRoute,
    private _appPrintPdfService: AppPrintPdfService,
    private _appExportExcelService: AppExportExcelService,
    private _appExportCsvService: AppExportCsvService,
    public _appAgGridService: AppAgGridService,
    private _loadingService: LoadingService,
    private _toastr: ToastrService,
    private _seguridadService: SeguridadService,
    private _marcacionService: MarcacionService,
  ) {
    this.accesoModel = this.activeRoute.snapshot.data['access'];
  }

  ngOnInit(): void {
    this.initializeGrid();
    this.initializeGridResumen();
    this.allMarcaciones();
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

  private programar(fn: () => void, ms: number): void {
    const id = setTimeout(() => { this.timeoutIds.delete(id); fn(); }, ms);
    this.timeoutIds.add(id);
  }

  private escucharModal<T>(modalRef: NgbModalRef, salida: EventEmitter<T>, alEmitir: (v: T) => void): void {
    const cerrado$ = from(modalRef.result).pipe(catchError(() => of(null)));
    salida.pipe(takeUntil(merge(this.unsubscribe$, cerrado$)))
      .subscribe({ next: alEmitir, error: (e) => console.error('Error en el modal:', e) });
  }

  fun_home(): void { this.router.navigate(['/rh']); }

  private hoyIso(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // ================================================================
  // GRILLA
  // ================================================================

  /**
   * La celda de «Atraso».
   *
   * Se pinta aquí y no con un componente por celda porque no hace nada:
   * sólo se mira. El título lleva el detalle —la jornada y los minutos sin
   * descontar— para no gastar tres columnas en ello.
   */
  private celdaAtraso(p: any): string {
    const estado = p.data?.atraso_estado as string | null;
    if (!estado) {
      // Una salida: salir tarde no es llegar tarde
      return '<span class="mar-atraso mar-atraso--nada" title="Las salidas no se miden">—</span>';
    }

    const minutos = Number(p.value ?? 0);
    const diferencia = Number(p.data?.diferencia_min ?? 0);
    const jornada = p.data?.jornada;
    const esperada = p.data?.hora_esperada;
    const tolerancia = Number(p.data?.tolerancia_min ?? 0);

    switch (estado) {
      case 'SIN HORARIO':
        return '<span class="mar-atraso mar-atraso--sin" title="Este empleado no tiene horario asignado: '
             + 'póngaselo en su ficha para medirle los atrasos">Sin horario</span>';
      case 'SIN JORNADA':
        return '<span class="mar-atraso mar-atraso--sin" title="Ese día su horario no tiene jornada">'
             + '<i class="fa fa-calendar-xmark"></i> No trabaja</span>';
      case 'A TIEMPO':
        return `<span class="mar-atraso mar-atraso--bien" title="Jornada ${jornada}, entraba a las ${esperada}">`
             + '<i class="fa fa-check"></i> A tiempo</span>';
      case 'EN TOLERANCIA':
        return `<span class="mar-atraso mar-atraso--justo" title="Entraba a las ${esperada}; llegó ${diferencia} min `
             + `después, dentro de los ${tolerancia} min de gracia">+${diferencia} min · en gracia</span>`;
      default:
        return `<span class="mar-atraso mar-atraso--mal" title="Jornada ${jornada}, entraba a las ${esperada}; `
             + `llegó ${diferencia} min después y su horario perdona ${tolerancia}">`
             + `<i class="fa fa-triangle-exclamation"></i> ${minutos} min</span>`;
    }
  }

  initializeGrid(): void {
    this.columnDefs = this.conFiltros([
      { headerName: 'Fecha', field: 'fecha', minWidth: 110, maxWidth: 120, cellStyle: { textAlign: 'center' } },
      { headerName: 'Hora',  field: 'hora',  minWidth: 100, maxWidth: 110, cellStyle: { textAlign: 'center' } },
      {
        // A QUÉ HORA LE TOCABA. Sale de la jornada del horario del empleado;
        // vacío cuando es una salida o cuando no tiene horario.
        headerName: 'Esperada', field: 'hora_esperada',
        headerTooltip: 'La hora de la jornada que le tocaba, según su horario de trabajo',
        minWidth: 100, maxWidth: 110, cellStyle: { textAlign: 'center' },
        valueFormatter: (p: any) => p.value ?? '—',
      },
      {
        // CUÁNTOS MINUTOS SE PASÓ, ya descontada la tolerancia de su horario.
        //
        // Lo que se pinta no es sólo el número: el estado es lo que se lee de
        // un vistazo, y hay cuatro que no son «llegó tarde» y conviene no
        // confundir — la salida (que no se mide), quien no tiene horario,
        // el día que no trabaja, y quien entró dentro de la gracia.
        headerName: 'Atraso', field: 'atraso_min',
        headerTooltip: 'Minutos de atraso de la entrada, descontada la tolerancia del horario. '
                     + 'Las salidas no se miden',
        minWidth: 130, maxWidth: 160, cellStyle: { textAlign: 'center' },
        cellRenderer: (p: any) => this.celdaAtraso(p),
      },
      {
        headerName: 'Empleado', field: 'empleado', minWidth: 170, maxWidth: 320, cellStyle: { textAlign: 'left' },
        cellRenderer: (p: any) => {
          const id = p.data?.empleado_id;
          const img = p.data?.empleado_foto
            ? `<img src="${this._marcacionService.getImagenMarcacion(p.data.id)}" class="mar-avatar" alt="" onerror="this.style.display='none'">`
            : `<span class="mar-avatar mar-avatar--vacio"><i class="fa fa-user"></i></span>`;
          return `<span class="mar-empleado" title="Empleado #${id}">${img}<span>${this.escapar(p.value ?? '')}</span></span>`;
        },
      },
      { headerName: 'Identificación', field: 'identificacion', minWidth: 110, maxWidth: 140, cellStyle: { textAlign: 'left' } },
      {
        headerName: 'Tipo', field: 'tipo', minWidth: 90, maxWidth: 120, cellStyle: { textAlign: 'center' },
        cellRenderer: (p: any) => `<span class="mar-tipo ${p.value === 'ENTRADA' ? 'is-entrada' : 'is-salida'}">${p.value === 'ENTRADA' ? 'Entrada' : 'Salida'}</span>`,
      },
      {
        headerName: 'Origen', field: 'origen', minWidth: 100, maxWidth: 130, cellStyle: { textAlign: 'center' },
        valueFormatter: (p: any) => this.origenes.find(o => o.id === p.value)?.name ?? p.value,
      },
      {
        headerName: 'Coincidencia', field: 'similitud', minWidth: 100, maxWidth: 120, cellStyle: { textAlign: 'center' },
        valueFormatter: (p: any) => p.value === null || p.value === undefined ? '—' : `${Math.round(p.value)}%`,
      },
      { headerName: 'Departamento', field: 'departamento', minWidth: 120, maxWidth: 220, cellStyle: { textAlign: 'left' } },
      { headerName: 'Dispositivo',  field: 'dispositivo',  minWidth: 110, maxWidth: 200, cellStyle: { textAlign: 'left' } },
      {
        // Dónde se registró. Se enseñan las coordenadas tal como las formatea
        // el servidor, y el error del GPS al lado: un punto a 20 km no es una
        // mentira, es un aparato sin GPS ubicándose por su conexión.
        headerName: 'Dónde', field: 'coordenadas', minWidth: 150, maxWidth: 190,
        cellStyle: { textAlign: 'left' },
        headerTooltip: 'Coordenadas desde donde se registró la marcación',
        tooltipValueGetter: (p: any) => {
          if (!p.data?.coordenadas) { return 'Esta marcación no trae ubicación'; }
          const e = Number(p.data?.precision_m ?? 0);
          if (!e) { return p.data.coordenadas; }
          const error = e >= 1000 ? `${(e / 1000).toFixed(1)} km` : `${Math.round(e)} m`;
          return `${p.data.coordenadas} · el GPS declaró ${error} de error`
               + (e > 500 ? ' — el punto es orientativo' : '');
        },
        // En la celda caben las coordenadas y poco más, así que el error del
        // GPS va en el título y, cuando es grande, en el color: un punto con
        // kilómetros de error no se debe leer como si fuera exacto.
        valueFormatter: (p: any) => {
          const lat = p.data?.latitud, lng = p.data?.longitud;
          if (lat === null || lat === undefined || lng === null || lng === undefined) { return '—'; }
          return `${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`;
        },
        cellClass: (p: any) => Number(p.data?.precision_m ?? 0) > 500 ? 'celda-ubicacion-dudosa' : '',
      },
      { headerName: 'Observación',  field: 'observacion',  minWidth: 150, maxWidth: 320, cellStyle: { textAlign: 'left' } },
      { headerName: 'Registrado por', field: 'created_by', minWidth: 130, maxWidth: 180, cellStyle: { textAlign: 'left' } },
      {
        headerName: 'ACCIONES', field: 'actions', pinned: 'right',
        // La columna de los botones no se filtra
        filter: false,
        minWidth: AllMarcacionesComponent.ANCHO_ABIERTA, maxWidth: AllMarcacionesComponent.ANCHO_ABIERTA,
        cellStyle: { display: 'flex', justifyContent: 'center', alignItems: 'center' },
        cellRenderer: ButtonAccionMarcacion,
        suppressMenu: true, sortable: false, resizable: false,
        headerComponentParams: { template: this.plantillaCabecera(false) },
      },
    ]);
  }

  /**
   * Abre en el mapa el punto donde se registró la marcación.
   *
   * El enlace lo arma el SERVIDOR con las coordenadas que guardó, así que
   * lleva siempre al punto que de verdad quedó en la ficha.
   */
  verUbicacion(registro: any): void {
    if (!registro?.link_ubicacion) {
      this._toastr.info('Esta marcación no trae ubicación', 'Dónde marcó');
      return;
    }
    window.open(registro.link_ubicacion, '_blank', 'noopener');
  }

  private escapar(s: string): string {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  private static readonly ANCHO_ABIERTA = 140;
  private static readonly ANCHO_PLEGADA = 50;

  private plantillaCabecera(plegada: boolean): string {
    return plegada
      ? `<div style="display:flex;align-items:center;justify-content:center;" title="Mostrar los botones"><i class="fas fa-bars"></i></div>`
      : `<div style="display:flex;align-items:center;justify-content:center;gap:5px;" title="Ocultar los botones"><span>ACCIONES</span><i class="fas fa-arrow-right"></i></div>`;
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
    this.headerElement?.addEventListener('click', this.onHeaderClick);
  }

  private quitarListenersCabecera(): void {
    this.headerElement?.removeEventListener('click', this.onHeaderClick);
    this.headerElement = null;
  }

  toggleActionsColumn(): void {
    const defs = this.gridApi.getColumnDefs() as any[];
    const col = defs.find(c => c.field === 'actions');
    if (!col) { return; }
    this.accionesPlegadas = !this.accionesPlegadas;
    const ancho = this.accionesPlegadas ? AllMarcacionesComponent.ANCHO_PLEGADA : AllMarcacionesComponent.ANCHO_ABIERTA;
    col.minWidth = ancho; col.maxWidth = ancho;
    col.headerComponentParams = { template: this.plantillaCabecera(this.accionesPlegadas) };
    this.gridApi.setColumnDefs(defs);
    this.gridApi.sizeColumnsToFit();
    this.programar(() => { this.gridApi.sizeColumnsToFit(); this.montarListenersCabecera(); }, 100);
  }

  @HostListener('window:resize')
  onResize(): void { this.ajustarTamanoGrid(); }

  ajustarTamanoGrid(): void {
    if (this.resizeTimeoutId) { clearTimeout(this.resizeTimeoutId); }
    this.resizeTimeoutId = setTimeout(() => {
      // Se recolocan las dos: sólo una está en el DOM a la vez —la otra la
      // quita el @if de su pestaña— y cada método se protege solo.
      if (this.gridApi) { this._appAgGridService.ajustarTamanoGrid(this.gridApi); }
      if (this.gridApiResumen) { this._appAgGridService.ajustarTamanoGrid(this.gridApiResumen); }
      this.ajustarAlturaGrid();
      this.ajustarAlturaGridResumen();
    }, 100);
  }

  /**
   * Le da a una rejilla el alto que hace que el panel entero quepa en la
   * pantalla, sin barra de desplazamiento en la página.
   *
   * PASO 1. El alto que deja lo que va DEBAJO de la rejilla dentro del panel
   * —la nota, la paginación— justo en el borde. Se mide, no se supone: en
   * marcaciones debajo sólo va la paginación y en horas la nota también, y
   * con una cifra fija para las dos una se salía.
   *
   * PASO 2. Lo que va debajo del PANEL (el margen de la plantilla) no se
   * puede medir de antemano sin preguntarle al documento, y preguntárselo
   * lleva a contar el hueco vacío como si fuera margen. Así que se mira si la
   * página desborda DESPUÉS de aplicar el paso 1 y se le resta eso: sólo
   * resta cuando sobra de verdad, y el paso 1 no depende del alto anterior,
   * de modo que repetirlo no encoge nada.
   *
   * El suelo de 200px es para que en una ventana muy baja la rejilla no quede
   * reducida a su cabecera; ahí la página sí se desplaza, que es lo correcto.
   */
  private encajarEnLaPantalla(el: HTMLElement, api: GridApi): void {
    const RESPIRO = 8;
    const MINIMO = 200;

    let debajo = 0;
    for (let h = el.nextElementSibling; h; h = h.nextElementSibling) {
      debajo += (h as HTMLElement).getBoundingClientRect().height;
    }

    const base = Math.max(MINIMO, window.innerHeight - el.getBoundingClientRect().top - debajo - RESPIRO);
    el.style.height = `${base}px`;

    const sobra = document.documentElement.scrollHeight - window.innerHeight;
    if (sobra > 0) { el.style.height = `${Math.max(MINIMO, base - sobra)}px`; }

    api.sizeColumnsToFit();
  }

  ajustarAlturaGrid(): void {
    // `.lista-grilla` y no `.ag-theme-alpine`: esa clase la llevan las dos
    // rejillas, y querySelector devolvería la primera del DOM.
    const el = this.host.nativeElement.querySelector('.lista-grilla') as HTMLElement | null;
    if (!el || !this.gridApi) { return; }
    this.encajarEnLaPantalla(el, this.gridApi);
  }

  navegarConTeclado = this._appAgGridService.navegacionConFlechas((fila: MarcacionModel) => this.selectedRow = fila);

  onCellClicked(e: CellClickedEvent): void { this.selectedRow = e.data; }

  // ================================================================
  // DATOS
  // ================================================================

  async allMarcaciones(page: number = 1): Promise<void> {
    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._marcacionService.allMarcaciones(page, this.registrosPorPagina, this.searchTerm, {
        desde: this.desde || null, hasta: this.hasta || null, empleado_id: this.empleadoId, tipo: this.tipo, origen: this.origen,
      }, this.filtrosColumna));
      if (res.body?.status !== 'success') {
        this._toastr.error(res.body?.message || 'No se pudo obtener el listado', 'Marcaciones');
        this.marcaciones = []; this.totalRegistros = 0; this.ultimaPagina = 1;
        this.gridApi?.setRowData(this.marcaciones);
        return;
      }
      this.marcaciones = res.body?.data?.data || [];
      const meta = res.body?.data?.meta;
      if (meta) {
        this.totalRegistros = meta.total;
        this.registrosPorPagina = meta.per_page;
        this.paginaActual = meta.current_page;
        this.ultimaPagina = meta.last_page;
      }
      this.gridApi?.setRowData(this.marcaciones);
      this.selectedRow = null;

      // Si las horas están a la vista, se rehacen con el mismo filtro
      if (this.vista === 'horas') { await this.cargarResumen(1); }
    } catch (e) {
      console.error('Error al cargar las marcaciones:', e);
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  /**
   * La rejilla de HORAS TRABAJADAS.
   *
   * Antes era una tabla suelta con todas las filas de golpe: con un mes de
   * rango y cincuenta empleados eran mil quinientas, y no había forma de
   * buscar dentro. Ahora es ag-Grid como el resto, pagina en el servidor y
   * filtra por cabecera.
   */
  initializeGridResumen(): void {
    this.columnDefsResumen = this.conFiltros([
      { headerName: 'Fecha', field: 'fecha', minWidth: 110, maxWidth: 130, cellStyle: { textAlign: 'center' } },
      {
        headerName: 'Empleado', field: 'empleado', minWidth: 200, maxWidth: 320,
        cellStyle: { textAlign: 'left' },
        // El día incompleto se marca con un aviso delante del nombre y no
        // tiñendo la fila entera, que es lo que hacía la tabla de antes: en
        // ámbar completo no se leía nada.
        cellRenderer: (p: any) => p.data?.incompleto
          ? '<i class="fa fa-triangle-exclamation mar-incompleto" '
            + 'title="Le falta la entrada o la salida de ese día"></i>' + this.escapar(p.value ?? '')
          : this.escapar(p.value ?? ''),
      },
      { headerName: 'Identificación', field: 'identificacion', minWidth: 110, maxWidth: 140, cellStyle: { textAlign: 'left' } },
      {
        headerName: 'Departamento', field: 'departamento', minWidth: 140, maxWidth: 240,
        cellStyle: { textAlign: 'left' }, valueFormatter: (p: any) => p.value || '—',
      },
      {
        headerName: 'Entrada', field: 'primera_entrada', minWidth: 100, maxWidth: 120,
        cellStyle: { textAlign: 'center' }, valueFormatter: (p: any) => p.value || '—',
      },
      {
        headerName: 'Salida', field: 'ultima_salida', minWidth: 100, maxWidth: 120,
        cellStyle: { textAlign: 'center' }, valueFormatter: (p: any) => p.value || '—',
      },
      {
        headerName: 'Marcaciones', field: 'marcaciones', minWidth: 110, maxWidth: 130,
        headerTooltip: 'Cuántas entradas y salidas tiene ese día',
        cellStyle: { textAlign: 'center' },
      },
      {
        headerName: 'Horas', field: 'horas', minWidth: 100, maxWidth: 120,
        headerTooltip: 'Suma de cada entrada con su salida siguiente, dentro del mismo día',
        cellStyle: { textAlign: 'center' },
        cellRenderer: (p: any) => {
          const n = Number(p.value ?? 0);
          const texto = p.data?.horas_texto ?? '00:00';
          return n > 0
            ? '<span class="mar-horas">' + texto + '</span>'
            : '<span class="mar-horas mar-horas--cero" '
              + 'title="No se pudo emparejar ninguna entrada con su salida de ese día">' + texto + '</span>';
        },
      },
    ], this.COLUMNAS_FILTRABLES_RESUMEN);
  }

  onGridResumenReady(params: GridReadyEvent): void {
    this.gridApiResumen = params.api;
    this._appAgGridService.ajustarTamanoGrid(this.gridApiResumen);
    this.ajustarAlturaGridResumen();
  }

  ajustarAlturaGridResumen(): void {
    const el = this.host.nativeElement.querySelector('.mar-grilla-resumen') as HTMLElement | null;
    if (!el || !this.gridApiResumen) { return; }
    this.encajarEnLaPantalla(el, this.gridApiResumen);
  }

  navegarResumen = this._appAgGridService.navegacionConFlechas();

  // ---------- Paginación de las horas ----------
  // La suya, no la del listado: son dos consultas distintas y cada una va por
  // su página.
  get desdeResumen(): number { return this.totalResumen === 0 ? 0 : (this.paginaResumen - 1) * this.porPaginaResumen + 1; }
  get hastaResumen(): number { return Math.min(this.paginaResumen * this.porPaginaResumen, this.totalResumen); }
  irAPaginaResumen(p: number): void { if (p >= 1 && p <= this.ultimaPaginaResumen) { this.cargarResumen(p); } }
  primeraResumen(): void { this.irAPaginaResumen(1); }
  anteriorResumen(): void { this.irAPaginaResumen(this.paginaResumen - 1); }
  siguienteResumen(): void { this.irAPaginaResumen(this.paginaResumen + 1); }
  ultimaResumen(): void { this.irAPaginaResumen(this.ultimaPaginaResumen); }

  async cargarResumen(page: number = 1): Promise<void> {
    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._marcacionService.resumen(
        page, this.porPaginaResumen, this.searchTerm,
        this.desde || null, this.hasta || null, this.empleadoId, this.filtrosResumen));

      if (res?.status === 'success') {
        this.resumen = res.data?.data ?? [];
        this.totalesResumen = res.data?.totales ?? null;

        const meta = res.data?.meta;
        if (meta) {
          this.totalResumen = meta.total;
          this.porPaginaResumen = meta.per_page;
          this.paginaResumen = meta.current_page;
          this.ultimaPaginaResumen = meta.last_page;
        }
        this.gridApiResumen?.setRowData(this.resumen);
      }
    } catch (e) {
      console.error('Error al cargar el resumen:', e);
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  /**
   * Se cambió de pestaña.
   *
   * El resumen se pide SÓLO al abrir su pestaña, y no con cada página del
   * listado: es otra consulta al servidor y la mayoría de las veces nadie la
   * mira. Al volver a la grilla hay que recolocarla, porque mientras estuvo
   * escondida no supo de los cambios de ancho.
   */
  async cambiarVista(id: string): Promise<void> {
    this.vista = id === 'horas' ? 'horas' : 'marcaciones';

    if (this.vista === 'horas') {
      await this.cargarResumen(1);
    }

    // La rejilla que acaba de aparecer no supo de los cambios de tamaño
    // mientras estuvo fuera del DOM: se recoloca al entrar.
    this.programar(() => this.ajustarTamanoGrid(), 50);
  }

  // ---------- Filtros ----------

  /**
   * Cambió algo de los filtros de arriba (fechas, empleado, tipo, origen).
   *
   * Se recarga SIEMPRE el listado —es el que lleva el contador de la
   * pestaña— y, si las horas están abiertas, también ellas.
   */
  aplicarFiltros(): void {
    this.paginaActual = 1;
    this.allMarcaciones(1);
  }

  hoy(): void { this.desde = this.hasta = this.hoyIso(); this.aplicarFiltros(); }

  estaSemana(): void {
    const d = new Date();
    const lunes = new Date(d); lunes.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    this.desde = this.aIso(lunes); this.hasta = this.hoyIso();
    this.aplicarFiltros();
  }

  esteMes(): void {
    const d = new Date();
    this.desde = this.aIso(new Date(d.getFullYear(), d.getMonth(), 1));
    this.hasta = this.hoyIso();
    this.aplicarFiltros();
  }

  private aIso(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  elegirEmpleado(): void {
    const modalRef = this.modal.open(ListEmpleadosComponent, { size: 'lg', centered: true, backdrop: 'static' });
    modalRef.componentInstance.empleadoSeleccionadoId = this.empleadoId;
    this.escucharModal(modalRef, modalRef.componentInstance.seleccionado, (e: any) => {
      this.empleadoId = e.id;
      this.empleadoNombre = e.nombre_completo || `${e.nombres} ${e.apellidos}`;
      this.aplicarFiltros();
    });
  }

  limpiarEmpleado(): void { this.empleadoId = null; this.empleadoNombre = ''; this.aplicarFiltros(); }

  onFilterTextBoxChanged(term?: string): void {
    if (term !== undefined) { this.searchTerm = term; }
    this.aplicarFiltros();
  }

  clearAllFilters(): void {
    // `limpiando` corta los (filterChanged) que disparan los setFilterModel:
    // sin esto se recargaría tres veces, y las dos primeras a medias.
    this.limpiando = true;

    this.campoBusqueda?.reset();
    this.searchTerm = '';
    this.tipo = null;
    this.origen = null;
    this.empleadoId = null;
    this.empleadoNombre = '';

    // Las cabeceras de las DOS rejillas: se limpia la pestaña que no se ve
    // también, o al cambiar a ella seguiría filtrada sin que se note.
    if (Object.keys(this.filtrosColumna || {}).length) { this.gridApi?.setFilterModel(null); }
    if (Object.keys(this.filtrosResumen || {}).length) { this.gridApiResumen?.setFilterModel(null); }
    this.filtrosColumna = {};
    this.filtrosResumen = {};

    // LA BANDERA SE BAJA EN LA SIGUIENTE VUELTA, no aquí: medido contra
    // ag-Grid 28, `setFilterModel` avisa DESPUÉS de esta línea.
    this.programar(() => { this.limpiando = false; }, 0);

    this.desde = this.hasta = this.hoyIso();
    this.aplicarFiltros();
  }

  // ---------- Paginación ----------
  get desdeRegistro(): number { return this.totalRegistros === 0 ? 0 : (this.paginaActual - 1) * this.registrosPorPagina + 1; }
  get hastaRegistro(): number { return Math.min(this.paginaActual * this.registrosPorPagina, this.totalRegistros); }
  goToPage(p: number): void { if (p >= 1 && p <= this.ultimaPagina) { this.allMarcaciones(p); } }
  firstPage(): void { this.goToPage(1); }
  prevPage(): void { this.goToPage(this.paginaActual - 1); }
  nextPage(): void { this.goToPage(this.paginaActual + 1); }
  ultimaPagina2(): void { this.goToPage(this.ultimaPagina); }

  // ================================================================
  // ACCIONES
  // ================================================================

  irAlKiosco(): void { this.router.navigate(['/rh/kioscoMarcacion']); }

  addMarcacion(): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.modal.open(SaveMarcacionComponent, { centered: true, size: 'lg', backdrop: 'static', keyboard: false });
    modalRef.componentInstance.accion = 'add';
    modalRef.componentInstance.registro_selected = 0;
    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, () => this.allMarcaciones(this.paginaActual));
  }

  editMarcacion(registro: MarcacionModel): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.modal.open(SaveMarcacionComponent, { centered: true, size: 'lg', backdrop: 'static', keyboard: false });
    modalRef.componentInstance.accion = 'edit';
    modalRef.componentInstance.registro_selected = registro;
    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, () => this.allMarcaciones(this.paginaActual));
  }

  viewMarcacion(registro: MarcacionModel): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.modal.open(SaveMarcacionComponent, { centered: true, size: 'lg', backdrop: 'static', keyboard: true });
    modalRef.componentInstance.accion = 'view';
    modalRef.componentInstance.registro_selected = registro;
  }

  deleteMarcacion(registro: MarcacionModel): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.modal.open(DeleteMarcacionComponent, { centered: true, size: 'md', backdrop: 'static', keyboard: true });
    modalRef.componentInstance.registro_selected = registro;
    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, () => this.allMarcaciones(this.paginaActual));
  }

  auditoria(): void {
    if (!this.selectedRow || this._seguridadService.isexpired()) { return; }
    const modalRef = this.modal.open(AuditoriaModalComponent, { centered: true, size: 'xl', backdrop: 'static', keyboard: true });
    modalRef.componentInstance.tablaNombre = 'marcaciones';
    modalRef.componentInstance.registroId = this.selectedRow.id;
  }

  // ================================================================
  // EXPORTAR
  // ================================================================

  private async todasParaExportar(): Promise<MarcacionModel[]> {
    if (!this.totalRegistros) { return []; }
    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._marcacionService.allMarcaciones(1, this.totalRegistros, this.searchTerm, {
        desde: this.desde || null, hasta: this.hasta || null, empleado_id: this.empleadoId, tipo: this.tipo, origen: this.origen,
      }));
      return res.body?.status === 'success' ? (res.body.data?.data ?? []) : [];
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  private filas(m: MarcacionModel[]): any[][] {
    return m.map(x => [x.fecha, x.hora, x.empleado, x.identificacion ?? '', x.tipo === 'ENTRADA' ? 'Entrada' : 'Salida', x.origen, x.similitud ? Math.round(x.similitud) + '%' : '']);
  }

  /**
   * Lo que se le pide al servicio de descargas.
   *
   * Las marcaciones SIEMPRE se miran por rango de fechas, así que el rango
   * (y el empleado, si se eligió uno) va como filtro de la pantalla: sale en
   * la ventana que pregunta y en el título del reporte.
   */
  private peticionDescarga(accion: AccionDescarga): PeticionDescarga<any> {
    const rango = this.desde === this.hasta ? this.desde : `${this.desde} a ${this.hasta}`;
    return {
      accion,
      nombrePlural: 'marcaciones',
      tituloBase: 'Marcaciones',
      gridApi: this.gridApi,
      filasDePagina: this.marcaciones,
      total: this.totalRegistros,
      pagina: this.paginaActual,
      ultimaPagina: this.ultimaPagina,
      busqueda: this.searchTerm,
      columnDefs: this.columnDefs,
      filtrosExtra: [
        `Fechas: ${rango}`,
        ...(this.empleadoNombre ? [`Empleado: ${this.empleadoNombre}`] : []),
        ...(this.tipo ? [`Tipo: ${this.tipo}`] : []),
        ...(this.origen ? [`Origen: ${this.origen}`] : []),
      ],
      traerTodo: () => this.todasParaExportar(),
    };
  }

  private readonly CABECERAS = ['Fecha', 'Hora', 'Empleado', 'Identificación', 'Tipo', 'Origen', 'Coincidencia'];

  async printPdf(): Promise<void> {
    const salida = await this._appDescargaService.preparar(this.peticionDescarga('imprimir'));
    if (!salida) { return; }       // no hay nada que descargar, o canceló
    this._appPrintPdfService.generarReporte({
      tamanoPapel: 'A4', orientacion: 'l', title: 'Reporte de Marcaciones', titleTable: salida.titulo,
      headers: this.CABECERAS, data: this.filas(salida.filas), piePagina: 'Pie de página - Mi Empresa en Desarrollo S.A....',
    });
  }

  async exportExcel(): Promise<void> {
    const salida = await this._appDescargaService.preparar(this.peticionDescarga('excel'));
    if (!salida) { return; }       // no hay nada que descargar, o canceló
    this._appExportExcelService.generarReporteExcel({
      tamanoPapel: 'A4', orientacion: 'l', title: 'Reporte de Marcaciones', titleTable: salida.titulo,
      headers: this.CABECERAS, data: this.filas(salida.filas), piePagina: 'Pie de página - Mi Empresa en Desarrollo S.A....',
    });
  }

  async exportCsv(): Promise<void> {
    const salida = await this._appDescargaService.preparar(this.peticionDescarga('csv'));
    if (!salida) { return; }       // no hay nada que descargar, o canceló
    this._appExportCsvService.generarReporteCSV({ headers: this.CABECERAS, data: this.filas(salida.filas) });
  }
}

// ================================================================
// RENDERER DE LA COLUMNA ACCIONES
// ================================================================
@Component({
  selector: 'app-button-accion-marcacion',
  standalone: false,
  template: `
    @if (parent.accionesPlegadas) {
      <button type="button" class="btn btn-sm btn-outline-primary acciones-desplegar" title="Mostrar los botones" (click)="parent.toggleActionsColumn()">
        <i class="fas fa-bars"></i>
      </button>
    } @else {
      <div class="acciones-fila">
        <app-action-buttons
          [accesoModel]="parent.accesoModel"
          [buttonView]="true"
          [buttonEdit]="true"
          [buttonDelete]="true"
          (view)="parent.viewMarcacion(params.data)"
          (edit)="parent.editMarcacion(params.data)"
          (delete)="parent.deleteMarcacion(params.data)">
        </app-action-buttons>

        <!-- Dónde marcó. Va aparte de app-action-buttons, que lo comparte
             media aplicación. Apagado cuando esa marcación no trae punto. -->
        <button type="button"
                class="btn-icon acciones-mapa"
                [class.is-apagado]="!params.data?.link_ubicacion"
                [title]="params.data?.link_ubicacion
                          ? 'Ver en el mapa dónde se registró'
                          : 'Esta marcación no trae ubicación'"
                [disabled]="!params.data?.link_ubicacion"
                (click)="parent.verUbicacion(params.data)">
          <i class="fa fa-location-dot"></i>
        </button>
      </div>
    }
  `,
  styles: [`
    .acciones-desplegar { width: 28px; height: 24px; padding: 0; display: inline-flex; align-items: center; justify-content: center; border-radius: .25rem; }
    .acciones-fila { display: flex; align-items: center; justify-content: center; }

    /* La base de .btn-icon, repetida aquí a propósito: aquel estilo está
       encapsulado en action-buttons y no alcanza a este botón, que va fuera
       del componente. Sin esto es el único de la fila con recuadro. */
    .acciones-mapa {
      background: none;
      border: none;
      padding: 3px 5px;
      font-size: 1.1em;
      line-height: 1;
      cursor: pointer;
      transition: all .3s ease;
      color: #348FE2;
    }

    .acciones-mapa:hover:not(:disabled)  { transform: scale(1.2); color: #2a72b5; }
    .acciones-mapa:active:not(:disabled) { transform: scale(.95); }

    /* Sin punto que enseñar: apagado, como los botones sin permiso */
    .acciones-mapa:disabled,
    .acciones-mapa.is-apagado {
      color: var(--bs-secondary-color, #6c757d);
      opacity: .3;
      cursor: not-allowed;
      transform: none;
    }
  `],
})
export class ButtonAccionMarcacion implements ICellRendererAngularComp {
  public params: any;
  constructor(public parent: AllMarcacionesComponent) {}
  agInit(params: any): void { this.params = params; }
  refresh(params: any): boolean { this.params = params; return true; }
}
