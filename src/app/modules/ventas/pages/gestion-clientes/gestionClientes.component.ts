import { Component, ElementRef, EventEmitter, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { Subject, firstValueFrom, from, merge, of } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';
import { CellClickedEvent, GridApi, GridReadyEvent, RowClassParams } from 'ag-grid-community';
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
  ESTADOS_GESTION, TIPOS_GESTION, claseDeResultado, iconoDeTipo, nombreDe, RESULTADOS_GESTION,
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

  // ---------- Columna de la izquierda ----------
  /**
   * La columna del cliente se pliega, como el panel del mapa.
   *
   * Se recuerda en el navegador: quien trabaja con el historial a pantalla
   * completa no quiere volver a plegarla cada vez que entra.
   */
  public panelOculto = this.leerPanelOculto();

  /** Menú del clic derecho: dónde está y sobre qué actúa. */
  public menuCtx = { visible: false, x: 0, y: 0 };

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
    this.cargarAgenda();

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

  limpiarCliente(): void {
    this.cliente = null;
    this.resumen = null;
    this.contactos = [];
    this.asignaciones = [];
    this.pendientes = [];
    this.gestiones = [];
    this.totalRegistros = 0;
    this.gridApi?.setRowData([]);
    this.vista = 'agenda';
    this.cargarAgenda();
  }

  // ================================================================
  // LA COLUMNA DE LA IZQUIERDA
  // ================================================================

  private leerPanelOculto(): boolean {
    try { return localStorage.getItem('miCRM3.gestion.panelOculto') === '1'; } catch { return false; }
  }

  alternarPanel(): void {
    this.panelOculto = !this.panelOculto;
    try { localStorage.setItem('miCRM3.gestion.panelOculto', this.panelOculto ? '1' : '0'); } catch { /* sin storage */ }
    // La grilla del historial ocupa el hueco que deja la columna
    setTimeout(() => this.gridApi?.sizeColumnsToFit(), 300);
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
  @HostListener('window:resize')
  @HostListener('window:scroll')
  onCerrarMenuGlobal(): void { this.cerrarMenu(); }

  // ================================================================
  // CARGAR TODO LO DEL CLIENTE
  // ================================================================

  async seleccionarCliente(cliente: any): Promise<void> {
    if (!cliente?.id) { return; }
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

  /** Lo que toca hacer, con el rango de fechas que esté elegido. */
  async cargarAgenda(): Promise<void> {
    try {
      this.cargandoAgenda = true;
      const res: any = await firstValueFrom(this._gestionService.agenda({
        mias: this.soloMias,
        soloVencidas: this.rango === 'vencidas',
        desde: this.rango === 'vencidas' ? null : (this.desdeFiltro || null),
        hasta: this.rango === 'vencidas' ? null : (this.hastaFiltro || null),
        limite: 200,
      }));

      if (res?.status === 'success') {
        this.agenda = res.data?.data ?? [];
        this.agendaMeta = res.data?.meta ?? { total: 0, vencidas: 0, hoy: 0, mostradas: 0 };
      } else {
        this.agenda = [];
        this.agendaMeta = { total: 0, vencidas: 0, hoy: 0, mostradas: 0 };
      }
    } catch (error) {
      console.error('Error al cargar la agenda:', error);
      this.agenda = [];
    } finally {
      this.cargandoAgenda = false;
    }
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
    this.cargarAgenda();
  }

  /** Cambió una de las dos fechas a mano. */
  cambiarFecha(cual: 'desde' | 'hasta', valor: string): void {
    if (cual === 'desde') { this.desdeFiltro = valor; } else { this.hastaFiltro = valor; }
    this.rango = 'rango';
    this.cargarAgenda();
  }

  alternarMias(): void {
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
  nombreResultado = (r: string) => nombreDe(RESULTADOS_GESTION, r);

  /** «tel:» y «mailto:» para llamar o escribir desde el navegador o el móvil. */
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
