import { Component, ElementRef, EventEmitter, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, firstValueFrom, from, merge, of } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';
import { CellClickedEvent, GridApi, GridReadyEvent } from 'ag-grid-community';
import { ICellRendererAngularComp } from 'ag-grid-angular';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';

///   SERVICIOS    ///
import { SeguridadService } from '../../../services/seguridad.service';
import { UserService } from '../../../services/user.service';
import { GrupoService } from '../../../services/grupo.service';
import { AppAgGridService } from '../../../../../service/app-agGrid.service';
import { LoadingService } from '../../../../../service/loading.service';
import { AppSettings } from '../../../../../service/app-settings.service';

///   MODELOS    ///
import { UserModel } from '../../../interfaces/userModel';
import { GrupoModel } from '../../../interfaces/grupoModel';
import { AccesoModel } from '../../../interfaces/accesoModel';
import { FileTreeNode } from '../../../../../components/file-tree-node/file-tree-node.component';
import { buscarNodo, construirArbolGrupos, filtrarArbol, recorrer } from '../arbolGrupos';

///   COMPONENTES    ///
import { SaveUserComponent } from '../../users/saveUser/saveUser.component';
import { DeleteUserComponent } from '../../users/deleteUser/deleteUser.component';
import { ChangePasswordComponent } from '../../users/change-password/change-password.component';
import { SaveGrupoComponent } from '../saveGrupo/saveGrupo.component';
import { DeleteGrupoComponent } from '../deleteGrupo/deleteGrupo.component';
import { ListGruposComponent } from '../listGrupos/listGrupos.component';
import { PapeleraUsuariosComponent } from '../papeleraUsuarios/papeleraUsuarios.component';
import { AuditoriaModalComponent } from '../../../../../components/auditoria-modal/auditoria-modal.component';
import { CampoBusquedaPaginacionComponent } from '../../../../../components/campos/campoBusquedaPaginacion/campoBusquedaPaginacion.component';

/** Ids de los dos nodos virtuales del árbol (no son grupos de la tabla). */
const NODO_TODOS = -1;
const NODO_SIN_GRUPO = 0;

/**
 * Usuarios y grupos, al estilo de "Usuarios y equipos de Active Directory":
 * a la izquierda el árbol de grupos (unidades organizativas), a la derecha
 * la grilla con los usuarios del grupo seleccionado.
 *
 * Misma estructura y gestos que el administrador de archivos:
 *   - clic en un grupo → sus usuarios (opcionalmente con los subgrupos);
 *   - arrastrar usuarios de la grilla a un grupo del árbol → los mueve;
 *   - arrastrar un grupo sobre otro → lo cuelga de él (sobre «Todos» = raíz);
 *   - clic derecho en el árbol → nuevo subgrupo, nuevo usuario, modificar…;
 *   - divisor arrastrable y lateral plegable en móvil.
 *
 * El árbol tiene dos nodos virtuales: «Todos los usuarios» (raíz, contiene
 * los grupos de primer nivel) y «Sin grupo» (usuarios sin grupo asignado,
 * como los de antes de existir los grupos).
 */
@Component({
  selector: 'app-usuariosGrupos',
  templateUrl: './usuariosGrupos.component.html',
  styleUrls: ['./usuariosGrupos.component.css'],
  standalone: false,
  host: {
    'class': 'd-flex flex-column flex-1 h-100'
  }
})
export class UsuariosGruposComponent implements OnInit, OnDestroy {

  readonly NODO_TODOS = NODO_TODOS;
  readonly NODO_SIN_GRUPO = NODO_SIN_GRUPO;

  public accesoModel: AccesoModel;
  public titulo = 'Usuarios y grupos';
  public isLoading$ = this._loadingService.isLoading$;

  // ---------- Árbol ----------
  /** Lista plana que devuelve el back (padre antes que hijos). */
  public grupos: GrupoModel[] = [];
  public nodes: FileTreeNode[] = [];
  private originalNodes: FileTreeNode[] = [];
  public searchQuery = '';
  /** Grupos abiertos (se conservan al recargar). */
  private abiertos = new Set<number>([NODO_TODOS]);
  /** Nodo seleccionado: NODO_TODOS, NODO_SIN_GRUPO o el id de un grupo. */
  public seleccionId: number = NODO_TODOS;
  /** La grilla incluye los usuarios de los subgrupos del seleccionado (por defecto sí: un grupo «contiene» a sus subgrupos). */
  public incluirSubgrupos = true;
  public sinGrupo = 0;
  public totalUsuarios = 0;
  /** Usuarios en la papelera de reciclaje (contador del botón). */
  public enPapelera = 0;
  public recargandoArbol = false;

  // ---------- Grilla ----------
  public usuarios: UserModel[] = [];
  public selectedRow: UserModel | null = null;
  public gridApi!: GridApi;
  public columnDefs: any[] = [];
  public accionesPlegadas = false;
  public paginaActual = 1;
  public totalRegistros = 0;
  public registrosPorPagina = 15;
  public ultimaPagina = 1;
  public searchTerm = '';
  @ViewChild(CampoBusquedaPaginacionComponent) campoBusquedaPaginacion?: CampoBusquedaPaginacionComponent;

  // ---------- Lateral (mismo comportamiento que el file-manager) ----------
  mobileSidebarToggled = false;
  readonly ANCHO_LATERAL_DEFECTO = 260;
  private readonly ANCHO_LATERAL_MIN = 180;
  private readonly ANCHO_LATERAL_MAX = 640;
  private readonly CLAVE_ANCHO_LATERAL = 'miCRM3.usuariosGrupos.anchoLateral';
  anchoLateral = this.leerAnchoLateral();
  redimensionando = false;

  // ---------- Arrastrar y soltar ----------
  dnd = {
    /** Usuarios que se arrastran desde la grilla (la selección múltiple si se cogió una fila de ella). */
    usuarios: [] as UserModel[],
    /** Grupo que se arrastra en el árbol. */
    grupo: null as FileTreeNode | null,
    sobreRaizArbol: false,
  };

  // ---------- Menú contextual del árbol ----------
  menuCtx = {
    visible: false, x: 0, y: 0,
    /** 'arbol': sobre un nodo (o el fondo) del árbol; 'grilla': sobre una fila (o el fondo) de usuarios. */
    origen: 'arbol' as 'arbol' | 'grilla',
    node: null as FileTreeNode | null,
    /** Fila pulsada en la grilla (null = fondo). */
    usuario: null as UserModel | null,
    /** Usuarios sobre los que actúa: la selección múltiple si el clic cayó en ella, o la fila sola. */
    lote: [] as UserModel[],
  };
  @ViewChild('menuCtxEl') menuCtxEl?: ElementRef<HTMLElement>;

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
    public _appAgGridService: AppAgGridService,
    private _loadingService: LoadingService,
    private _toastr: ToastrService,
    private _seguridadService: SeguridadService,
    private _userService: UserService,
    private _grupoService: GrupoService,
    public appSettings: AppSettings,
  ) {
    this.accesoModel = this.activeRoute.snapshot.data.access;
    // Pantalla a altura completa (como el administrador de archivos): el
    // panel llena el hueco y el scroll lo hacen el árbol y la grilla.
    this.appSettings.appContentFullHeight = true;
    this.appSettings.appContentClass = 'd-flex flex-column';
  }

  async ngOnInit(): Promise<void> {
    this.initializeGrid();
    await this.cargarGrupos();
    await this.cargarUsuarios(1);
  }

  ngOnDestroy(): void {
    this.appSettings.appContentFullHeight = false;
    this.appSettings.appContentClass = '';
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

  /** Suscribe al @Output de un modal hasta que se cierre o se destruya este componente. */
  private escucharModal<T>(modalRef: NgbModalRef, salida: EventEmitter<T>, alEmitir: (valor: T) => void): void {
    const modalCerrado$ = from(modalRef.result).pipe(catchError(() => of(null)));
    salida.pipe(takeUntil(merge(this.unsubscribe$, modalCerrado$)))
      .subscribe({ next: alEmitir, error: (err) => console.error('Error en el modal:', err) });
  }

  fun_home(): void { this.router.navigate(['/seguridad']); }

  // ================================================================
  // ÁRBOL
  // ================================================================

  /** Recarga los grupos conservando lo abierto y lo seleccionado. */
  async cargarGrupos(): Promise<void> {
    this.recargandoArbol = true;
    try {
      const res: any = await firstValueFrom(this._grupoService.allGrupos(false));
      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudieron cargar los grupos', 'Grupos');
        return;
      }
      this.grupos = res.data?.grupos ?? [];
      this.sinGrupo = res.data?.sin_grupo ?? 0;
      this.totalUsuarios = res.data?.total_usuarios ?? 0;
      this.enPapelera = res.data?.en_papelera ?? 0;
      // Si el seleccionado ya no existe (lo borraron), se vuelve a «Todos»
      if (this.seleccionId > 0 && !this.grupos.some(g => g.id === this.seleccionId)) {
        this.seleccionId = NODO_TODOS;
      }
      this.construirArbol();
    } catch (e) {
      console.error('Error al cargar los grupos:', e);
    } finally {
      this.recargandoArbol = false;
    }
  }

  private construirArbol(): void {
    const raices = construirArbolGrupos(this.grupos, {
      abiertos: this.abiertos,
      seleccionadoId: this.seleccionId,
    });
    const todos: FileTreeNode = {
      id: NODO_TODOS, nombre: 'Todos los usuarios', tipo: 0, escarpeta: true,
      icono: 'fa fa-building', color: 'var(--bs-app-theme, #00acac)',
      badge: this.totalUsuarios, titulo: 'Todos los usuarios del sistema',
      isOpen: this.abiertos.has(NODO_TODOS), isSelected: this.seleccionId === NODO_TODOS,
      children: raices.length ? raices : undefined,
    };
    const sinGrupo: FileTreeNode = {
      id: NODO_SIN_GRUPO, nombre: 'Sin grupo', tipo: 0, escarpeta: true,
      icono: 'fa fa-user-slash', color: 'var(--bs-secondary-color, #6c757d)',
      badge: this.sinGrupo, titulo: 'Usuarios que todavía no están en ningún grupo',
      isSelected: this.seleccionId === NODO_SIN_GRUPO,
    };
    this.originalNodes = [todos, sinGrupo];
    this.nodes = filtrarArbol(this.originalNodes, this.searchQuery);
  }

  /** Nodo real (no la copia filtrada) por id. */
  private nodoReal(id: number): FileTreeNode | null { return buscarNodo(this.originalNodes, id); }
  public grupoDe(id: number): GrupoModel | null { return this.grupos.find(g => g.id === id) ?? null; }
  public get grupoActual(): GrupoModel | null { return this.grupoDe(this.seleccionId); }
  public get nombreSeleccion(): string {
    if (this.seleccionId === NODO_TODOS) { return 'Todos los usuarios'; }
    if (this.seleccionId === NODO_SIN_GRUPO) { return 'Sin grupo'; }
    return this.grupoActual?.nombre ?? '';
  }
  /** Tramos de la ruta del grupo seleccionado (pulsables). */
  public get rutaSeleccion(): GrupoModel[] {
    const out: GrupoModel[] = [];
    let g = this.grupoActual;
    while (g) { out.unshift(g); g = g.padre_id !== null ? this.grupoDe(g.padre_id) : null; }
    return out;
  }

  onNodeSelect(node: FileTreeNode): void {
    this.seleccionar(node.id);
    this.mobileSidebarToggled = false;
  }

  seleccionar(id: number): void {
    this.seleccionId = id;
    recorrer(this.originalNodes, n => n.isSelected = n.id === id);
    recorrer(this.nodes, n => n.isSelected = n.id === id);
    // Abrir el camino hasta el grupo y el propio grupo
    let g = this.grupoDe(id);
    while (g) { this.abiertos.add(g.id); g = g.padre_id !== null ? this.grupoDe(g.padre_id) : null; }
    this.abiertos.add(NODO_TODOS);
    const real = this.nodoReal(id);
    if (real?.children) { real.isOpen = true; }
    this.selectedRow = null;
    this.paginaActual = 1;
    this.cargarUsuarios(1);
  }

  onNodeToggle(node: FileTreeNode): void {
    if (node.isOpen) { this.abiertos.add(node.id); } else { this.abiertos.delete(node.id); }
    const real = this.nodoReal(node.id);
    if (real && real !== node) { real.isOpen = node.isOpen; }
  }

  expandirTodo(): void {
    recorrer(this.originalNodes, n => { if (n.children?.length) { n.isOpen = true; this.abiertos.add(n.id); } });
    this.nodes = filtrarArbol(this.originalNodes, this.searchQuery);
  }

  contraerTodo(): void {
    recorrer(this.originalNodes, n => { if (n.children?.length) { n.isOpen = false; this.abiertos.delete(n.id); } });
    // La raíz siempre abierta, y el camino hasta el seleccionado
    this.abiertos.add(NODO_TODOS);
    const raiz = this.nodoReal(NODO_TODOS);
    if (raiz) { raiz.isOpen = true; }
    let g = this.grupoActual ? this.grupoDe(this.grupoActual.padre_id ?? -99) : null;
    while (g) { const n = this.nodoReal(g.id); if (n) { n.isOpen = true; this.abiertos.add(g.id); } g = g.padre_id !== null ? this.grupoDe(g.padre_id) : null; }
    this.nodes = filtrarArbol(this.originalNodes, this.searchQuery);
  }

  filterNodes(): void { this.nodes = filtrarArbol(this.originalNodes, this.searchQuery); }
  limpiarBusqueda(): void { this.searchQuery = ''; this.filterNodes(); }

  toggleIncluirSubgrupos(): void {
    this.incluirSubgrupos = !this.incluirSubgrupos;
    this.paginaActual = 1;
    this.cargarUsuarios(1);
  }

  // ---------- Menú contextual ----------

  onContextMenuNodo(ev: { node: FileTreeNode; event: MouseEvent }): void {
    ev.event.preventDefault();
    this.abrirMenu(ev.event, this.nodoReal(ev.node.id) ?? ev.node);
  }

  onContextMenuArbol(e: MouseEvent): void {
    if ((e.target as HTMLElement).closest('.file-link')) { return; }
    e.preventDefault();
    this.abrirMenu(e, null);
  }

  /** Clic derecho en una fila o en el fondo de la grilla (como en Windows, también selecciona la fila). */
  onContextMenuGrilla(e: MouseEvent): void {
    if ((e.target as HTMLElement).closest('.ag-header')) { return; }   // la cabecera conserva el menú de ag-Grid
    e.preventDefault();
    const fila = (e.target as HTMLElement).closest('.ag-row') as HTMLElement | null;
    let usuario: UserModel | null = null;
    if (fila) {
      const nodoGrilla = this.gridApi?.getDisplayedRowAtIndex(Number(fila.getAttribute('row-index')));
      usuario = (nodoGrilla?.data as UserModel) ?? null;
      if (nodoGrilla && !nodoGrilla.isSelected()) { nodoGrilla.setSelected(true, true); }
      this.selectedRow = usuario;
    }
    this.abrirMenu(e, null, 'grilla', usuario);
  }

  private abrirMenu(e: MouseEvent, node: FileTreeNode | null, origen: 'arbol' | 'grilla' = 'arbol', usuario: UserModel | null = null): void {
    this.menuCtx = { visible: true, x: e.clientX, y: e.clientY, origen, node, usuario, lote: usuario ? this.loteDe(usuario) : [] };
    setTimeout(() => {
      const el = this.menuCtxEl?.nativeElement;
      if (!el) { return; }
      const r = el.getBoundingClientRect();
      if (r.right > window.innerWidth)   { this.menuCtx.x = Math.max(0, window.innerWidth - r.width - 8); }
      if (r.bottom > window.innerHeight) { this.menuCtx.y = Math.max(0, window.innerHeight - r.height - 8); }
    });
  }

  cerrarMenu(): void { if (this.menuCtx.visible) { this.menuCtx.visible = false; } }

  @HostListener('document:click')
  @HostListener('document:keydown.escape')
  onCerrarMenuGlobal(): void { this.cerrarMenu(); }

  @HostListener('window:resize')
  onResize(): void { this.cerrarMenu(); this.ajustarTamanoGrid(); }

  /** Grupo real detrás de un nodo del menú (null en los virtuales). */
  get grupoMenu(): GrupoModel | null { return this.menuCtx.node && this.menuCtx.node.id > 0 ? this.grupoDe(this.menuCtx.node.id) : null; }

  // ---------- Lateral: divisor y móvil ----------

  iniciarRedimension(ev: PointerEvent): void {
    if (ev.button !== 0) { return; }
    ev.preventDefault();
    const divisor = ev.currentTarget as HTMLElement;
    const xInicial = ev.clientX;
    const anchoInicial = this.anchoLateral;
    this.redimensionando = true;
    divisor.setPointerCapture(ev.pointerId);
    const mover = (e: PointerEvent) => {
      const nuevo = anchoInicial + (e.clientX - xInicial);
      this.anchoLateral = Math.min(this.ANCHO_LATERAL_MAX, Math.max(this.ANCHO_LATERAL_MIN, Math.round(nuevo)));
    };
    const soltar = (e: PointerEvent) => {
      divisor.removeEventListener('pointermove', mover);
      divisor.removeEventListener('pointerup', soltar);
      divisor.removeEventListener('pointercancel', soltar);
      divisor.releasePointerCapture(e.pointerId);
      this.redimensionando = false;
      this.guardarAnchoLateral();
      this.ajustarTamanoGrid();
    };
    divisor.addEventListener('pointermove', mover);
    divisor.addEventListener('pointerup', soltar);
    divisor.addEventListener('pointercancel', soltar);
  }

  guardarAnchoLateral(): void {
    try { localStorage.setItem(this.CLAVE_ANCHO_LATERAL, String(this.anchoLateral)); } catch { /* sin storage */ }
  }

  private leerAnchoLateral(): number {
    try {
      const v = Number(localStorage.getItem(this.CLAVE_ANCHO_LATERAL));
      if (v >= this.ANCHO_LATERAL_MIN && v <= this.ANCHO_LATERAL_MAX) { return v; }
    } catch { /* sin storage */ }
    return this.ANCHO_LATERAL_DEFECTO;
  }

  toggleMobileSidebar(): void { this.mobileSidebarToggled = !this.mobileSidebarToggled; }

  // ================================================================
  // ARRASTRAR Y SOLTAR
  // ================================================================

  /** Usuarios que viajan con la fila cogida: la selección múltiple si está en ella, o la fila sola. */
  private loteDe(u: UserModel): UserModel[] {
    const sel = (this.gridApi?.getSelectedRows() ?? []) as UserModel[];
    return sel.some(s => s.id === u.id) ? sel : [u];
  }

  /** Fila de la grilla cogida (dndSourceOnRowDrag). */
  onDragStartUsuario(u: UserModel, event: DragEvent): void {
    this.dnd.usuarios = this.loteDe(u);
    this.dnd.grupo = null;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', this.dnd.usuarios.map(x => x.login_user).join(', '));
    }
  }

  /** Nodo del árbol cogido: sólo los grupos reales se pueden mover. */
  onDragStartGrupo(node: FileTreeNode, event: DragEvent): void {
    if (node.id <= 0) { event.preventDefault(); return; }
    this.dnd.grupo = this.nodoReal(node.id) ?? node;
    this.dnd.usuarios = [];
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', node.nombre);
    }
  }

  @HostListener('document:dragend')
  onDragEnd(): void {
    this.dnd.usuarios = [];
    this.dnd.grupo = null;
    this.dnd.sobreRaizArbol = false;
  }

  /** Soltado sobre un nodo del árbol. */
  onDropNodo(destino: FileTreeNode, event: DragEvent): void {
    event.preventDefault();
    const usuarios = this.dnd.usuarios;
    const grupo = this.dnd.grupo;
    this.onDragEnd();
    if (usuarios.length) {
      if (destino.id === NODO_TODOS) { this._toastr.info('Suelta los usuarios sobre un grupo o sobre «Sin grupo»', 'Mover usuarios'); return; }
      this.moverUsuarios(usuarios, destino.id === NODO_SIN_GRUPO ? null : destino.id);
    } else if (grupo) {
      if (destino.id === NODO_SIN_GRUPO) { return; }
      this.moverGrupo(grupo, destino.id === NODO_TODOS ? null : destino.id);
    }
  }

  /** Fondo del árbol (fuera de los nodos): un grupo pasa a la raíz. */
  onDragOverArbol(event: DragEvent): void {
    if (!this.dnd.grupo) { return; }
    event.preventDefault();
    if (event.dataTransfer) { event.dataTransfer.dropEffect = 'move'; }
    this.dnd.sobreRaizArbol = true;
  }

  onDropArbol(event: DragEvent): void {
    event.preventDefault();
    const grupo = this.dnd.grupo;
    this.onDragEnd();
    if (grupo) { this.moverGrupo(grupo, null); }
  }

  private async moverGrupo(nodo: FileTreeNode, padreId: number | null): Promise<void> {
    const g = this.grupoDe(nodo.id);
    if (!g || g.padre_id === padreId || nodo.id === padreId) { return; }
    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._grupoService.moverGrupo(nodo.id, padreId));
      if (res?.status === 'success') {
        this._toastr.success(res.message, 'Grupos', { closeButton: true });
        if (padreId !== null) { this.abiertos.add(padreId); }
        await this.cargarGrupos();
      }
    } catch (e) {
      // El interceptor ya avisó (ciclo, nombre repetido…)
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  async moverUsuarios(usuarios: UserModel[], grupoId: number | null): Promise<void> {
    const ids = usuarios.filter(u => (u as any).grupo_id !== grupoId).map(u => u.id);
    if (!ids.length) { this._toastr.info('Esos usuarios ya están ahí', 'Mover usuarios'); return; }
    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._userService.moverGrupo(ids, grupoId));
      if (res?.status === 'success') {
        this._toastr.success(res.message, 'Usuarios', { closeButton: true });
        await this.cargarGrupos();          // contadores
        await this.cargarUsuarios(this.paginaActual);
      }
    } catch (e) {
      // El interceptor ya avisó
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  /** Botón «Mover a…» (también sirve en móvil, sin arrastrar): abre el selector. */
  moverSeleccionA(usuarios?: UserModel[]): void {
    const sel = (this.gridApi?.getSelectedRows() ?? []) as UserModel[];
    const lote = usuarios?.length ? usuarios : (sel.length ? sel : (this.selectedRow ? [this.selectedRow] : []));
    if (!lote.length) { return; }
    const modalRef = this.modal.open(ListGruposComponent, { size: 'md', centered: true, backdrop: 'static' });
    modalRef.componentInstance.titulo = lote.length === 1 ? `Mover a «${lote[0].login_user}»` : `Mover ${lote.length} usuarios a`;
    modalRef.componentInstance.permitirNinguno = true;
    modalRef.componentInstance.grupoSeleccionadoId = lote.length === 1 ? (lote[0] as any).grupo_id : null;
    this.escucharModal(modalRef, modalRef.componentInstance.seleccionado, (g: GrupoModel | null) => {
      this.moverUsuarios(lote, g?.id ?? null);
    });
  }

  get haySeleccionados(): boolean {
    return !!this.selectedRow || (this.gridApi?.getSelectedRows()?.length ?? 0) > 0;
  }

  // ================================================================
  // GRILLA
  // ================================================================

  initializeGrid(): void {
    this.columnDefs = [
      {
        headerName: 'Usuario', field: 'login_user', minWidth: 170, maxWidth: 300,
        cellStyle: { textAlign: 'left' },
        // Casilla por fila y en la cabecera: multiselección para arrastrar varios
        checkboxSelection: true,
        headerCheckboxSelection: true,
        headerCheckboxSelectionFilteredOnly: true,
        // Arrastre nativo desde esta celda hacia el árbol
        dndSource: true,
        dndSourceOnRowDrag: (params: any) => this.onDragStartUsuario(params.rowNode.data, params.dragEvent),
        cellRenderer: (p: any) => {
          const url = p.data?.avatar ? this._userService.getUserImage(p.data.id, false) : '';
          const img = url
            ? `<img src="${url}" class="ug-avatar" alt="" onerror="this.style.display='none'">`
            : `<span class="ug-avatar ug-avatar--vacio"><i class="fa fa-user"></i></span>`;
          return `<span class="ug-usuario">${img}<span class="ug-usuario__login">${this.escapeHtml(p.value ?? '')}</span></span>`;
        },
      },
      { headerName: 'Apellidos', field: 'surname', minWidth: 140, maxWidth: 300, cellStyle: { textAlign: 'left' } },
      { headerName: 'Nombre',    field: 'name',    minWidth: 140, maxWidth: 300, cellStyle: { textAlign: 'left' } },
      { headerName: 'Email',     field: 'email',   minWidth: 180, maxWidth: 280, cellStyle: { textAlign: 'left' } },
      {
        headerName: 'Grupo', field: 'grupo_nombre', minWidth: 140, maxWidth: 260, cellStyle: { textAlign: 'left' },
        cellRenderer: (p: any) => p.value
          ? `<span class="ug-grupo" title="${this.escapeHtml(this.grupoDe(p.data.grupo_id)?.ruta ?? '')}"><i class="fa fa-users"></i> ${this.escapeHtml(p.value)}</span>`
          : `<span class="ug-grupo ug-grupo--sin"><i class="fa fa-user-slash"></i> Sin grupo</span>`,
      },
      {
        headerName: 'Tipo', field: 'type_user', minWidth: 120, maxWidth: 140, cellStyle: { textAlign: 'center' },
        cellRenderer: (p: any) => {
          switch (p.value) {
            case 1: return 'Super Usuario';
            case 2: return 'Administrador';
            case 3: return 'Usuario Sistema';
            default: return 'Usuario Web';
          }
        },
      },
      { headerName: 'Perfil',  field: 'perfil_nombre',   minWidth: 110, maxWidth: 160, cellStyle: { textAlign: 'left' } },
      { headerName: 'Horario', field: 'chorario_nombre', minWidth: 110, maxWidth: 160, cellStyle: { textAlign: 'left' } },
      {
        headerName: 'Activo', field: 'isactive', minWidth: 76, maxWidth: 76, cellStyle: { textAlign: 'center' },
        cellRenderer: (p: any) => `<div class="form-check d-flex align-items-center justify-content-center" style="height:100%">
            <input disabled class="form-check-input" type="checkbox" ${p.value === true ? 'checked' : ''} /></div>`,
      },
      { headerName: 'Último login', field: 'last_login_at', minWidth: 150, maxWidth: 170, cellStyle: { textAlign: 'center' } },
      {
        headerName: 'ACCIONES', field: 'actions', pinned: 'right',
        minWidth: UsuariosGruposComponent.ANCHO_ACCIONES_ABIERTA, maxWidth: UsuariosGruposComponent.ANCHO_ACCIONES_ABIERTA,
        cellStyle: { display: 'flex', justifyContent: 'center', alignItems: 'center' },
        cellRenderer: ButtonAccionUsuarioGrupo,
        suppressMenu: true, sortable: false, resizable: false,
        headerComponentParams: { template: this.plantillaCabeceraAcciones(false) },
      },
    ];
  }

  private escapeHtml(s: string): string {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  private static readonly ANCHO_ACCIONES_ABIERTA = 130;
  private static readonly ANCHO_ACCIONES_PLEGADA = 50;

  private plantillaCabeceraAcciones(plegada: boolean): string {
    return plegada
      ? `<div style="display:flex;align-items:center;justify-content:center;" title="Mostrar los botones de acción"><i class="fas fa-bars"></i></div>`
      : `<div style="display:flex;align-items:center;justify-content:center;gap:5px;" title="Ocultar los botones de acción"><span>ACCIONES</span><i class="fas fa-arrow-right"></i></div>`;
  }

  onGridReady(params: GridReadyEvent): void {
    this.gridApi = params.api;
    if (this.usuarios.length) { this.gridApi.setRowData(this.usuarios); }
    this.programar(() => this.montarListenersCabecera(), 500);
    this._appAgGridService.ajustarTamanoGrid(this.gridApi);
  }

  private montarListenersCabecera(): void {
    this.quitarListenersCabecera();
    this.headerElement = this.host.nativeElement.querySelector('.ag-header-cell[col-id="actions"]');
    if (!this.headerElement) { return; }
    this.headerElement.addEventListener('click', this.onHeaderClick);
  }

  private quitarListenersCabecera(): void {
    if (!this.headerElement) { return; }
    this.headerElement.removeEventListener('click', this.onHeaderClick);
    this.headerElement = null;
  }

  toggleActionsColumn(): void {
    const columnDefs = this.gridApi.getColumnDefs() as any[];
    const actionsCol = columnDefs.find(col => col.field === 'actions');
    if (!actionsCol) { return; }
    this.accionesPlegadas = !this.accionesPlegadas;
    const ancho = this.accionesPlegadas ? UsuariosGruposComponent.ANCHO_ACCIONES_PLEGADA : UsuariosGruposComponent.ANCHO_ACCIONES_ABIERTA;
    actionsCol.minWidth = ancho;
    actionsCol.maxWidth = ancho;
    actionsCol.headerComponentParams = { template: this.plantillaCabeceraAcciones(this.accionesPlegadas) };
    this.gridApi.setColumnDefs(columnDefs);
    this.gridApi.sizeColumnsToFit();
    this.programar(() => { this.gridApi.sizeColumnsToFit(); this.montarListenersCabecera(); }, 100);
  }

  ajustarTamanoGrid(): void {
    if (!this.gridApi) { return; }
    if (this.resizeTimeoutId) { clearTimeout(this.resizeTimeoutId); }
    this.resizeTimeoutId = setTimeout(() => this._appAgGridService.ajustarTamanoGrid(this.gridApi), 100);
  }

  navegarConTeclado = this._appAgGridService.navegacionConFlechas(fila => this.selectedRow = fila);

  onCellClicked(e: CellClickedEvent): void { this.selectedRow = e.data; }

  // ================================================================
  // DATOS DE LA GRILLA
  // ================================================================

  async cargarUsuarios(page: number = 1): Promise<void> {
    try {
      this._loadingService.setLoading(true);
      const grupoParam = this.seleccionId === NODO_TODOS ? null : this.seleccionId;
      const res: any = await firstValueFrom(
        this._userService.usuariosPorGrupo(grupoParam, this.incluirSubgrupos, page, this.registrosPorPagina, this.searchTerm)
      );
      if (res.body?.status !== 'success') {
        this._toastr.error(res.body?.message || 'No se pudo obtener el listado de usuarios', 'Error');
        this.usuarios = [];
        this.totalRegistros = 0;
        this.ultimaPagina = 1;
        this.gridApi?.setRowData(this.usuarios);
        return;
      }
      this.usuarios = res.body?.data?.data || [];
      const meta = res.body?.data?.meta;
      if (meta) {
        this.totalRegistros = meta.total;
        this.registrosPorPagina = meta.per_page;
        this.paginaActual = meta.current_page;
        this.ultimaPagina = meta.last_page;
      }
      this.gridApi?.setRowData(this.usuarios);
      this.selectedRow = null;
    } catch (error) {
      console.error('Error al cargar usuarios:', error);
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  async recargar(): Promise<void> {
    await this.cargarGrupos();
    await this.cargarUsuarios(this.paginaActual);
  }

  get desde(): number { return this.totalRegistros === 0 ? 0 : (this.paginaActual - 1) * this.registrosPorPagina + 1; }
  get hasta(): number { return Math.min(this.paginaActual * this.registrosPorPagina, this.totalRegistros); }

  async onFilterTextBoxChanged(term?: string): Promise<void> {
    if (term !== undefined) { this.searchTerm = term; }
    this.paginaActual = 1;
    await this.cargarUsuarios(1);
  }

  clearAllFilters(): void {
    this.campoBusquedaPaginacion?.reset();
    this.searchTerm = '';
    this.gridApi?.setFilterModel(null);
    this.cargarUsuarios(1);
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.ultimaPagina) { return; }
    this.paginaActual = page;
    this.cargarUsuarios(page);
  }
  firstPage(): void { if (this.paginaActual !== 1) { this.goToPage(1); } }
  prevPage(): void { this.goToPage(this.paginaActual - 1); }
  nextPage(): void { this.goToPage(this.paginaActual + 1); }
  lastPage(): void { if (this.paginaActual !== this.ultimaPagina) { this.goToPage(this.ultimaPagina); } }

  // ================================================================
  // ACCIONES: GRUPOS
  // ================================================================

  /** Nuevo grupo dentro de `padre` (null = raíz). Por defecto, dentro del seleccionado. */
  nuevoGrupo(padre?: GrupoModel | null): void {
    if (this._seguridadService.isexpired()) { return; }
    const p = padre === undefined ? this.grupoActual : padre;
    const modalRef = this.modal.open(SaveGrupoComponent, { centered: true, size: 'xl', backdrop: 'static', keyboard: false });
    modalRef.componentInstance.registro_selected = 0;
    modalRef.componentInstance.accion = 'add';
    modalRef.componentInstance.padreInicial = p ? { id: p.id, nombre: p.nombre, ruta: p.ruta } : null;
    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, async (nuevo: GrupoModel) => {
      if (nuevo.padre_id !== null) { this.abiertos.add(nuevo.padre_id); }
      await this.cargarGrupos();
      this.seleccionar(nuevo.id);
    });
  }

  editarGrupo(g: GrupoModel): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.modal.open(SaveGrupoComponent, { centered: true, size: 'xl', backdrop: 'static', keyboard: false });
    modalRef.componentInstance.registro_selected = g;
    modalRef.componentInstance.accion = 'edit';
    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, async () => {
      await this.cargarGrupos();
      if (this.seleccionId === g.id) { this.cargarUsuarios(this.paginaActual); }
    });
  }

  verGrupo(g: GrupoModel): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.modal.open(SaveGrupoComponent, { centered: true, size: 'xl', backdrop: 'static', keyboard: true });
    modalRef.componentInstance.registro_selected = g;
    modalRef.componentInstance.accion = 'view';
  }

  eliminarGrupo(g: GrupoModel): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.modal.open(DeleteGrupoComponent, { centered: true, size: 'md', backdrop: 'static', keyboard: true });
    modalRef.componentInstance.registro_selected = g;
    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, async () => {
      if (this.seleccionId === g.id) { this.seleccionId = g.padre_id ?? NODO_TODOS; }
      await this.cargarGrupos();
      await this.cargarUsuarios(1);
    });
  }

  auditoriaGrupo(g: GrupoModel): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.modal.open(AuditoriaModalComponent, { centered: true, size: 'xl', backdrop: 'static', keyboard: true });
    modalRef.componentInstance.tablaNombre = 'grupos';
    modalRef.componentInstance.registroId = g.id;
  }

  // ================================================================
  // ACCIONES: USUARIOS (los mismos modales que allUsers)
  // ================================================================

  private abrirModalUsuario(registro: any, accion: 'add' | 'edit' | 'clon' | 'view', grupo?: GrupoModel | null): NgbModalRef {
    const modalRef = this.modal.open(SaveUserComponent, { centered: true, size: 'xl', backdrop: 'static', keyboard: accion === 'view' });
    modalRef.componentInstance.registro_selected = registro;
    modalRef.componentInstance.accion = accion;
    if (grupo) { modalRef.componentInstance.grupoInicial = grupo; }
    return modalRef;
  }

  /** Nuevo usuario dentro de `grupo` (por defecto el seleccionado; sin grupo si es «Todos» / «Sin grupo»). */
  addUser(grupo?: GrupoModel | null): void {
    if (this._seguridadService.isexpired()) { return; }
    const g = grupo === undefined ? this.grupoActual : grupo;
    const modalRef = this.abrirModalUsuario(0, 'add', g);
    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, () => this.recargar());
  }

  clonUser(registro: any): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.abrirModalUsuario(registro, 'clon');
    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, () => this.recargar());
  }

  editUser(registro: any): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.abrirModalUsuario(registro, 'edit');
    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, (actualizado: any) => {
      // Si cambió de grupo hay que recargar (contadores y puede que ya no esté en esta vista)
      if (actualizado.grupo_id !== registro.grupo_id) { this.recargar(); return; }
      const index = this.usuarios.findIndex(r => r.id === actualizado.id);
      if (index === -1) { return; }
      this.usuarios[index] = actualizado;
      this.gridApi?.getRowNode(index.toString())?.setData(actualizado);
    });
  }

  viewUser(registro: any): void {
    if (this._seguridadService.isexpired()) { return; }
    this.abrirModalUsuario(registro, 'view');
  }

  deleteUser(registro: any): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.modal.open(DeleteUserComponent, { centered: true, size: 'md', backdrop: 'static', keyboard: true });
    modalRef.componentInstance.registro_selected = registro;
    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, () => this.recargar());
  }

  /** Papelera de reciclaje: lo eliminado se restaura o se borra de verdad desde ahí. */
  abrirPapelera(): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.modal.open(PapeleraUsuariosComponent, { centered: true, size: 'xl', backdrop: 'static', keyboard: true });
    this.escucharModal(modalRef, modalRef.componentInstance.cambio, () => this.recargar());
  }

  cambioClave(registro: any): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.modal.open(ChangePasswordComponent, { centered: true, size: 'xl', backdrop: 'static', keyboard: true });
    modalRef.componentInstance.userId = registro.id;
    modalRef.componentInstance.login_user = registro.login_user;
    modalRef.componentInstance.email = registro.email;
    modalRef.componentInstance.view_reset = true;
    modalRef.componentInstance.registro_selected = registro;
    this.escucharModal(modalRef, modalRef.componentInstance.passwordChanged, () => this.cargarUsuarios(this.paginaActual));
  }

  auditoria(usuario?: UserModel | null): void {
    const u = usuario ?? this.selectedRow;
    if (!u) { return; }
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.modal.open(AuditoriaModalComponent, { centered: true, size: 'xl', backdrop: 'static', keyboard: true });
    modalRef.componentInstance.tablaNombre = 'users';
    modalRef.componentInstance.registroId = u.id;
  }
}

// ================================================================
// RENDERER DE LA COLUMNA ACCIONES (delega en el componente padre)
// ================================================================
@Component({
  selector: 'app-button-accion-usuario-grupo',
  standalone: false,
  template: `
    @if (parent.accionesPlegadas) {
      <button type="button" class="btn btn-sm btn-outline-primary acciones-desplegar"
              title="Mostrar los botones de acción" (click)="parent.toggleActionsColumn()">
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
    .acciones-desplegar { width: 28px; height: 24px; padding: 0; display: inline-flex; align-items: center; justify-content: center; border-radius: .25rem; }
  `],
})
export class ButtonAccionUsuarioGrupo implements ICellRendererAngularComp {
  public params: any;
  constructor(public parent: UsuariosGruposComponent) {}
  agInit(params: any): void { this.params = params; }
  refresh(params: any): boolean { this.params = params; return true; }
}
