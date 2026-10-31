import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { CellClickedEvent, GridApi, GridReadyEvent } from 'ag-grid-community';
import { ICellRendererAngularComp } from 'ag-grid-angular';
import { ToastrService } from 'ngx-toastr';
import { Subject, firstValueFrom } from 'rxjs';
import Swal from 'sweetalert2';

///   SERVICIOS    ///
import { NotificacionService } from '../../../services/notificacion.service';
import { AppAgGridService } from '../../../../../service/app-agGrid.service';
import { LoadingService } from '../../../../../service/loading.service';

///   MODELOS    ///
import { ESTILOS_NOTIFICACION, NotificacionModel, TipoNotificacion } from '../../../interfaces/notificacionModel';
import { AccesoModel } from '../../../../seguridad/interfaces/accesoModel';

///   COMPONENTES    ///
import { SaveNotificacionComponent } from '../saveNotificacion/saveNotificacion.component';
import { DestinatariosNotificacionComponent } from '../destinatariosNotificacion/destinatariosNotificacion.component';
import { AuditoriaModalComponent } from '../../../../../components/auditoria-modal/auditoria-modal.component';
import { CampoBusquedaPaginacionComponent } from '../../../../../components/campos/campoBusquedaPaginacion/campoBusquedaPaginacion.component';
import { MenuContextualComponent, OpcionContextual } from '../../../../../components/menuContextual/menuContextual.component';

import { FormsModule } from '@angular/forms';
import { AgGridModule } from 'ag-grid-angular';
import { PanelComponent } from '../../../../../components/panel/panel.component';
import { FilasEstirablesDirective } from '../../../../../core/directives/filasEstirables.directive';
import { CommonModule } from '@angular/common';

/**
 * Listado de notificaciones enviadas.
 *
 * Grilla ag-Grid con paginación EN SERVIDOR (core.fn_notificaciones_listar_paginado)
 * y filtro por tipo. De cada notificación se ve a cuántos llegó y cuántos la
 * han leído; el botón «Destinatarios» abre la lista con nombre y apellido.
 *
 * Una notificación no se modifica: ya está en la campana de la gente. Se envía
 * (se crea), se consulta y, si sobra, se elimina para todos.
 */
@Component({
  selector: 'app-allNotificaciones',
  templateUrl: './allNotificaciones.component.html',
  styleUrls: ['./allNotificaciones.component.css'],
  standalone: true,
  imports: [
    CommonModule,FormsModule, AgGridModule, FilasEstirablesDirective, PanelComponent, CampoBusquedaPaginacionComponent, MenuContextualComponent],
})
export class AllNotificacionesComponent implements OnInit, OnDestroy {

  public accesoModel: AccesoModel;
  public notificaciones: NotificacionModel[] = [];
  public selectedRow: NotificacionModel | null = null;
  public accionesPlegadas = false;
  public titulo = 'Notificaciones';
  public isLoading$ = this._loadingService.isLoading$;

  /** Filtros de la barra. */
  public tipos = [
    { id: 'TODOS', name: 'Todos los tipos' },
    { id: 'INFO',  name: 'Información' },
    { id: 'EXITO', name: 'Éxito' },
    { id: 'AVISO', name: 'Aviso' },
    { id: 'ERROR', name: 'Problema' },
  ];
  public tipo = 'TODOS';
  public busqueda = '';

  // ---------- Paginación en servidor ----------
  public paginaActual = 1;
  public totalRegistros = 0;
  public registrosPorPagina = 10;
  public ultimaPagina = 1;

  // ---------- ag-Grid ----------
  public gridApi!: GridApi;
  public columnDefs: any[] = [];

  private static readonly ANCHO_ABIERTA = 110;
  private static readonly ANCHO_PLEGADA = 50;

  private readonly unsubscribe$ = new Subject<void>();
  private timeoutIds = new Set<any>();
  private headerElement: Element | null = null;
  private readonly onHeaderClick: EventListener = () => this.toggleActionsColumn();

  @ViewChild(CampoBusquedaPaginacionComponent) campoBusquedaPaginacion!: CampoBusquedaPaginacionComponent;

  constructor(
    private _toastr: ToastrService,
    private modalService: NgbModal,
    private router: Router,
    private route: ActivatedRoute,
    private host: ElementRef,
    public _appAgGridService: AppAgGridService,
    private _loadingService: LoadingService,
    private _notificacionService: NotificacionService,
  ) {
    this.accesoModel = this.route.snapshot.data['access'] ?? this.route.snapshot.data['profile'] ?? {} as AccesoModel;
  }

  ngOnInit(): void {
    this.armarColumnas();
    this.allNotificaciones(1);
  }

  ngOnDestroy(): void {
    this.quitarListenersCabecera();
    this.timeoutIds.forEach(id => clearTimeout(id));
    this.timeoutIds.clear();
    this.modalService.dismissAll();
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

  private programar(fn: () => void, ms: number): void {
    const id = setTimeout(() => { this.timeoutIds.delete(id); fn(); }, ms);
    this.timeoutIds.add(id);
  }

  fun_home(): void { this.router.navigate(['/config']); }

  // ================================================================
  // COLUMNAS
  // ================================================================

  // ================================================================
  // FILTROS DE LA CABECERA
  // ================================================================
  //
  // Los aplica el SERVIDOR, no la rejilla: esta pantalla pagina, así que
  // ag-Grid sólo tiene las diez filas de la página y filtrar ahí buscaría
  // dentro de diez. La cabecera sólo recoge lo que el usuario pidió.

  /**
   * Las columnas que llevan filtro, y de qué tipo.
   *
   * Tiene que decir lo mismo que la lista blanca de NotificacionController:
   * lo que no esté allí se tira en el servidor, así que ponerlo sólo aquí
   * sería pintar una caja que no filtra.
   *
   * SE FILTRA POR LO QUE SE VE: «Tipo» guarda INFO, EXITO, AVISO o ERROR
   * pero en la rejilla pone Información, Éxito, Aviso y Problema, y por ese
   * texto se filtra; «Leída por» es una cuenta de otra tabla.
   */
  private readonly COLUMNAS_FILTRABLES: { [campo: string]: 'texto' | 'numero' } = {
    id: 'numero', leidas: 'numero',
    titulo: 'texto', mensaje: 'texto', tipo: 'texto', origen: 'texto', created_by: 'texto',
    // Las fechas, como texto sobre lo que se ve: «2026-10» busca el mes
    created_at: 'texto', caduca_at: 'texto',
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
    this.allNotificaciones(1);
  }

  /** Cuántas columnas llevan filtro; el buscador lo enseña y se pone rojo. */
  get cuantasColumnasFiltradas(): number {
    return Object.keys(this.filtrosColumna || {}).length;
  }

  /**
   * Si hay algo que quitar.
   *
   * Cuenta también el combo de tipo, que es un filtro más aunque no viva en
   * la cabecera.
   */
  get hayFiltro(): boolean {
    return !!this.busqueda || this.tipo !== 'TODOS' || this.cuantasColumnasFiltradas > 0;
  }
  private armarColumnas(): void {
    this.columnDefs = this.conFiltros([
      { headerName: 'ID', field: 'id', minWidth: 70, maxWidth: 80, cellStyle: { textAlign: 'center' } },
      {
        headerName: 'Tipo', field: 'tipo', minWidth: 120, maxWidth: 140, cellStyle: { textAlign: 'center' },
        cellRenderer: (p: any) => {
          const e = ESTILOS_NOTIFICACION[p.value as TipoNotificacion] ?? ESTILOS_NOTIFICACION.INFO;
          return `<span class="noti-tipo ${e.clase}"><i class="fa ${e.icono} me-1"></i>${e.nombre}</span>`;
        },
      },
      {
        headerName: 'Título', field: 'titulo', minWidth: 220, cellStyle: { textAlign: 'left' },
        cellRenderer: (p: any) => {
          const enlace = p.data?.url
            ? `<i class="fa fa-link text-muted me-1" title="Lleva a ${this.escapar(p.data.url)}"></i>` : '';
          return `<span title="${this.escapar(p.data?.mensaje ?? '')}">${enlace}${this.escapar(p.value ?? '')}</span>`;
        },
      },
      {
        headerName: 'Mensaje', field: 'mensaje', minWidth: 220, cellStyle: { textAlign: 'left' },
        cellRenderer: (p: any) => `<span class="text-muted" title="${this.escapar(p.value ?? '')}">${this.escapar(p.value ?? '')}</span>`,
      },
      {
        headerName: 'Origen', field: 'origen', minWidth: 100, maxWidth: 120, cellStyle: { textAlign: 'center' },
        cellRenderer: (p: any) => p.value === 'SISTEMA'
          ? `<span title="La generó el propio sistema"><i class="fa fa-robot text-muted me-1"></i>Sistema</span>`
          : `<span title="La envió una persona"><i class="fa fa-user text-muted me-1"></i>Manual</span>`,
      },
      {
        // Cuántos la recibieron y cuántos la han abierto: es la lectura útil
        headerName: 'Leída por', field: 'leidas', minWidth: 130, maxWidth: 160, cellStyle: { textAlign: 'center' },
        cellRenderer: (p: any) => {
          const total = Number(p.data?.destinatarios ?? 0);
          const leidas = Number(p.value ?? 0);
          const pct = total ? Math.round((leidas / total) * 100) : 0;
          return `<span title="${leidas} de ${total} la han leído">${leidas} / ${total} <b class="text-muted">(${pct}%)</b></span>`;
        },
      },
      {
        headerName: 'Enviada', field: 'created_at', minWidth: 130, maxWidth: 160, cellStyle: { textAlign: 'center' },
      },
      {
        headerName: 'Caduca', field: 'caduca_at', minWidth: 130, maxWidth: 160, cellStyle: { textAlign: 'center' },
        cellRenderer: (p: any) => {
          if (!p.value) { return `<span class="text-muted" title="No caduca">—</span>`; }
          return p.data?.caducada
            ? `<span class="noti-caducada" title="Ya no se muestra en la campana">${p.value}</span>`
            : `<span>${p.value}</span>`;
        },
      },
      { headerName: 'Envió', field: 'created_by', minWidth: 120, maxWidth: 150, cellStyle: { textAlign: 'center' } },
      {
        headerName: 'ACCIONES', field: 'actions', pinned: 'right',
        minWidth: AllNotificacionesComponent.ANCHO_ABIERTA, maxWidth: AllNotificacionesComponent.ANCHO_ABIERTA,
        cellStyle: { display: 'flex', justifyContent: 'center', alignItems: 'center' },
        cellRenderer: ButtonAccionNotificacion,
        suppressMenu: true, sortable: false, resizable: false,
        headerComponentParams: { template: this.plantillaCabecera(false) },
      },
    ]);
  }

  private escapar(s: string): string {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

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
    if (!this.gridApi) { return; }
    this.accionesPlegadas = !this.accionesPlegadas;
    const ancho = this.accionesPlegadas ? AllNotificacionesComponent.ANCHO_PLEGADA : AllNotificacionesComponent.ANCHO_ABIERTA;
    const defs = this.gridApi.getColumnDefs() as any[];
    const col = defs.find(d => d.field === 'actions');
    if (!col) { return; }
    col.minWidth = ancho;
    col.maxWidth = ancho;
    col.headerComponentParams = { template: this.plantillaCabecera(this.accionesPlegadas) };
    this.gridApi.setColumnDefs(defs);
    this.gridApi.sizeColumnsToFit();
    this.programar(() => { this.gridApi.sizeColumnsToFit(); this.montarListenersCabecera(); }, 100);
  }

  @HostListener('window:resize')
  onResize(): void { this.ajustarTamanoGrid(); }

  ajustarTamanoGrid(): void {
    if (!this.gridApi) { return; }
    this._appAgGridService.ajustarTamanoGrid(this.gridApi);
    this.ajustarAlturaGrid();
  }

  /** La grilla llena lo que queda de pantalla: sin esto sale con alto cero. */
  ajustarAlturaGrid(): void {
    const el = this.host.nativeElement.querySelector('.ag-theme-alpine') as HTMLElement | null;
    if (!el || !this.gridApi) { return; }
    el.style.height = `${Math.max(240, window.innerHeight - el.getBoundingClientRect().top - 60)}px`;
    this.gridApi.sizeColumnsToFit();
  }

  onCellClicked(e: CellClickedEvent): void { this.selectedRow = e.data; }

  navegarConTeclado = this._appAgGridService.navegacionConFlechas((fila: NotificacionModel) => this.selectedRow = fila);

  // ================================================================
  // DATOS
  // ================================================================

  async allNotificaciones(page: number = 1): Promise<void> {
    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(
        this._notificacionService.allNotificaciones(page, this.registrosPorPagina, this.busqueda, this.tipo,
                                                    this.filtrosColumna)
      );

      if (res.body?.status !== 'success') { return; }
      const paginado = res.body.data?.data ?? res.body.data;
      this.notificaciones = paginado?.data ?? [];
      this.totalRegistros = paginado?.total ?? 0;
      this.paginaActual = paginado?.current_page ?? page;
      this.ultimaPagina = paginado?.last_page ?? 1;
      this.selectedRow = null;
      this.programar(() => this.ajustarTamanoGrid(), 100);
    } catch (e) {
      console.error('Error al listar notificaciones:', e);
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  onFilterTextBoxChanged(texto: string): void {
    this.busqueda = texto ?? '';
    this.allNotificaciones(1);
  }

  cambiarTipo(): void { this.allNotificaciones(1); }

  clearAllFilters(): void {
    if (!this.hayFiltro) { return; }

    const habiaColumnas = this.cuantasColumnasFiltradas > 0;

    // `limpiando` corta el (filterChanged) que dispara setFilterModel: sin
    // esto se recargaría dos veces, y la primera con los filtros a medias.
    this.limpiando = true;
    this.campoBusquedaPaginacion?.reset();
    this.busqueda = '';
    this.tipo = 'TODOS';
    this.filtrosColumna = {};
    if (habiaColumnas) { this.gridApi?.setFilterModel(null); }

    // LA BANDERA SE BAJA EN LA SIGUIENTE VUELTA, no aquí: medido contra
    // ag-Grid 28, `setFilterModel` avisa DESPUÉS de esta línea, así que
    // apagándola aquí ese aviso pediría una segunda carga idéntica.
    this.programar(() => { this.limpiando = false; }, 0);

    this.allNotificaciones(1);
  }

  // ---------- Paginación ----------
  firstPage(): void { if (this.paginaActual !== 1) { this.allNotificaciones(1); } }
  prevPage(): void { if (this.paginaActual > 1) { this.allNotificaciones(this.paginaActual - 1); } }
  nextPage(): void { if (this.paginaActual < this.ultimaPagina) { this.allNotificaciones(this.paginaActual + 1); } }
  ultimaPagina2(): void { if (this.paginaActual !== this.ultimaPagina) { this.allNotificaciones(this.ultimaPagina); } }

  get desdeRegistro(): number { return this.totalRegistros === 0 ? 0 : (this.paginaActual - 1) * this.registrosPorPagina + 1; }
  get hastaRegistro(): number { return Math.min(this.paginaActual * this.registrosPorPagina, this.totalRegistros); }

  // ================================================================
  // ACCIONES
  // ================================================================

  addNotificacion(): void {
    const modalRef = this.modalService.open(SaveNotificacionComponent, { size: 'xl', centered: true, backdrop: 'static', scrollable: true });
    modalRef.componentInstance.accion = 'add';
    modalRef.componentInstance.registrosE.subscribe(() => this.allNotificaciones(1));
  }

  /**
   * La misma pantalla de envío en modo lectura y con los destinatarios ya
   * resueltos: una notificación enviada no se modifica.
   */
  viewNotificacion(n: NotificacionModel): void {
    const modalRef = this.modalService.open(SaveNotificacionComponent, { size: 'xl', centered: true, backdrop: 'static', scrollable: true });
    modalRef.componentInstance.accion = 'view';
    modalRef.componentInstance.registro_selected = n;
  }

  /** Vuelve a enviar lo mismo: se abre el alta con los campos ya puestos. */
  reenviar(n: NotificacionModel): void {
    const modalRef = this.modalService.open(SaveNotificacionComponent, { size: 'xl', centered: true, backdrop: 'static', scrollable: true });
    modalRef.componentInstance.accion = 'add';
    modalRef.componentInstance.plantilla = n;
    modalRef.componentInstance.registrosE.subscribe(() => this.allNotificaciones(1));
  }

  /** Quién la recibió y quién la ha leído. */
  verDestinatarios(): void {
    if (!this.selectedRow) { return; }
    const modalRef = this.modalService.open(DestinatariosNotificacionComponent, {
      size: 'xl', centered: true, backdrop: 'static', keyboard: true, scrollable: true,
    });
    modalRef.componentInstance.registro_selected = this.selectedRow;
  }

  /**
   * La quita de la campana de todos los que la recibieron. No hay papelera:
   * una notificación caducada o sobrante no se recupera, se vuelve a enviar.
   */
  async deleteNotificacion(n: NotificacionModel): Promise<void> {
    const r = await Swal.fire({
      title: `¿Eliminar «${n.titulo}»?`,
      html: `<p class="mb-0">Desaparecerá de la campana de los <b>${n.destinatarios ?? 0}</b> usuarios que la recibieron. No se puede deshacer.</p>`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ff5b57',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      reverseButtons: true,
    });
    if (!r.isConfirmed) { return; }

    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._notificacionService.deleteNotificacion(n.id));
      if (res?.status === 'success') {
        this._toastr.success(res.message, 'Notificaciones', { closeButton: true });
        this.allNotificaciones(this.paginaActual);
      } else {
        this._toastr.error(res?.message ?? 'No se pudo eliminar la notificación', 'Notificaciones');
      }
    } catch (e: any) {
      console.error('Error al eliminar la notificación:', e);
      this._toastr.error(e?.error?.message ?? 'No se pudo eliminar la notificación', 'Notificaciones');
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  /**
   * Historial de cambios de la notificación seleccionada.
   *
   * El modal espera «tablaNombre» —así se llama su @Input— y ese nombre es el
   * de la tabla en auditoria.logs_cambios, sin el esquema.
   */
  // ================================================================
  // EL MENÚ DEL BOTÓN DERECHO
  // ================================================================
  //
  // Las mismas acciones que la columna ACCIONES y las de la barra, sin tener
  // que llegar hasta el final de la fila ni desplegar la columna cuando está
  // plegada.
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

  /** Qué se puede hacer con esta notificación, según el perfil. */
  private opcionesPara(fila: any): OpcionContextual[] {
    const puedeCrear   = this.accesoModel?.crear    === true;
    const puedeBorrar  = this.accesoModel?.eliminar === true;
    const puedeAuditar = this.accesoModel?.auditar  === true;

    const destinatarios = Number(fila?.destinatarios ?? 0);
    const url = String(fila?.url ?? '').trim();

    return [
      { id: 'ver', texto: 'Ver la notificación', icono: 'fa-eye' },
      {
        id: 'reenviar', texto: 'Volver a enviarla', icono: 'fa-rotate-right',
        visible: puedeCrear,
        ayuda: 'Abre el alta con los mismos datos',
      },
      {
        id: 'destinatarios', texto: 'Quién la recibió', icono: 'fa-users',
        separadorAntes: true,
        deshabilitada: destinatarios === 0,
        ayuda: destinatarios
          ? `${fila?.leidas ?? 0} de ${destinatarios} la han leído`
          : 'No llegó a nadie',
      },
      {
        id: 'enlace', texto: 'Abrir el enlace', icono: 'fa-up-right-from-square',
        deshabilitada: url === '',
        ayuda: url !== '' ? url : 'Esta notificación no lleva a ningún sitio',
      },
      {
        id: 'auditoria', texto: 'Ver auditoría', icono: 'fa-user-secret',
        visible: puedeAuditar,
        ayuda: 'Quién la envió y cuándo',
      },
      {
        id: 'eliminar', texto: 'Eliminarla para todos', icono: 'fa-trash',
        separadorAntes: true, peligro: true, visible: puedeBorrar,
        ayuda: 'Desaparece de la campana de quien la recibió; no hay papelera',
      },
    ];
  }

  /** Se eligió una opción del menú. */
  alElegirContextual(id: string): void {
    const fila = this.selectedRow as any;
    if (!fila) { return; }

    switch (id) {
      case 'ver':           this.viewNotificacion(fila); break;
      case 'reenviar':      this.reenviar(fila); break;
      case 'destinatarios': this.verDestinatarios(); break;
      case 'enlace':        this.abrirEnlace(fila); break;
      case 'auditoria':     this.auditoria(); break;
      case 'eliminar':      this.deleteNotificacion(fila); break;
    }
  }

  /** El enlace de la notificación, en otra pestaña. */
  private abrirEnlace(fila: any): void {
    const url = String(fila?.url ?? '').trim();
    if (!url) { return; }
    // `noopener` es obligatorio: sin él la página que se abre puede tocar
    // ésta a través de window.opener.
    window.open(/^https?:\/\//i.test(url) ? url : 'https://' + url, '_blank', 'noopener');
  }
  auditoria(): void {
    if (!this.selectedRow) { return; }
    const modalRef = this.modalService.open(AuditoriaModalComponent, { size: 'xl', centered: true, backdrop: 'static', keyboard: true });
    modalRef.componentInstance.tablaNombre = 'notificaciones';
    modalRef.componentInstance.registroId = this.selectedRow.id;
  }
}

// ================================================================
// RENDERER DE LA COLUMNA ACCIONES
// ================================================================
@Component({
  selector: 'app-button-accion-notificacion',
  standalone: true,
  imports: [],
  template: `
    @if (parent.accionesPlegadas) {
      <button type="button" class="btn btn-sm btn-outline-primary acciones-desplegar" title="Mostrar los botones" (click)="parent.toggleActionsColumn()">
        <i class="fas fa-bars"></i>
      </button>
    } @else {
      <span class="d-flex gap-1">
        <button type="button" class="btn btn-xs btn-white" title="Ver la notificación" (click)="parent.viewNotificacion(params.data)">
          <i class="fa fa-eye"></i>
        </button>
        <button type="button" class="btn btn-xs btn-white text-primary" title="Volver a enviarla"
                [disabled]="parent.accesoModel?.crear === false" (click)="parent.reenviar(params.data)">
          <i class="fa fa-rotate-right"></i>
        </button>
        <button type="button" class="btn btn-xs btn-white text-danger" title="Eliminarla para todos"
                [disabled]="parent.accesoModel?.eliminar === false" (click)="parent.deleteNotificacion(params.data)">
          <i class="fa fa-trash"></i>
        </button>
      </span>
    }
  `,
  styles: [`
    .acciones-desplegar { width: 28px; height: 24px; padding: 0; display: inline-flex; align-items: center; justify-content: center; border-radius: .25rem; }
  `],
})
export class ButtonAccionNotificacion implements ICellRendererAngularComp {
  public params: any;
  constructor(public parent: AllNotificacionesComponent) {}
  agInit(params: any): void { this.params = params; }
  refresh(params: any): boolean { this.params = params; return true; }
}
