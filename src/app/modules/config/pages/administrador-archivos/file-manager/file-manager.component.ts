import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CellClickedEvent, ColDef, GridApi, GridReadyEvent, RowClassParams } from 'ag-grid-community';
import { firstValueFrom, from, merge, of, Subject } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';

import { AppAgGridService } from '../../../../../service/app-agGrid.service';
import { AppSettings } from '../../../../../service/app-settings.service';
import { LoadingService } from '../../../../../service/loading.service';
import { ArchivoService } from '../../../services/archivo.service';
import { SeguridadService } from '../../../../seguridad/services/seguridad.service';

import { SaveFileComponent } from '../save-file/saveFile.component';
import { DeleteFileComponent } from '../delete-file/deleteFile.component';
import { PapeleraComponent } from '../papelera/papelera.component';
import { ModalReporteExternoComponent } from '../modalReporteExterno/modalReporteExterno.component';
import { AuditoriaModalComponent } from '../../../../../components/auditoria-modal/auditoria-modal.component';
import { CampoBusquedaPaginacionComponent } from '../../../../../components/campos/campoBusquedaPaginacion/campoBusquedaPaginacion.component';
import { defTipo, formatoTamano } from '../../../interfaces/tipoArchivo';

/**
 * Nodo del árbol tal como lo devuelve config/archivo/getArchivoTree: la fila
 * de la tabla `archivo` más `children` (sólo si tiene) y las fechas ya
 * formateadas. isOpen / isSelected son estado de pantalla, no de la base.
 */
export interface FileTreeNode {
  id: number;
  padre: number;
  orden: number;
  nivel: number;
  nombre: string;
  descripcion?: string;
  url?: string;
  icono?: string;
  color?: string;
  tipo?: string | number;
  escarpeta: boolean;
  activo?: boolean;
  created_at_formateado?: string;
  updated_at_formateado?: string;
  children?: FileTreeNode[];
  isOpen?: boolean;
  isSelected?: boolean;
}

/**
 * Administrador de archivos: árbol de carpetas a la izquierda y contenido de
 * la carpeta actual en una grilla a la derecha. Un "archivo" es un reporte
 * externo (una url) que se abre en un visor a pantalla completa.
 *
 * Dos selecciones distintas conviven aquí, y conviene tenerlo claro:
 *   - carpetaActual: la carpeta cuyo contenido muestra la grilla (se elige
 *     en el árbol o entrando con doble clic desde la grilla).
 *   - filaSeleccionada: el elemento marcado en la grilla, si lo hay.
 * Las acciones (ejecutar, editar, eliminar, auditoría) van sobre `objetivo`:
 * la fila si hay una marcada; si no, la carpeta actual.
 *
 * Memoria: los modales se escuchan con escucharModal() (misma técnica que
 * allUsers), y todo se corta en ngOnDestroy con unsubscribe$ + dismissAll().
 */
@Component({
  selector: 'app-file-manager',
  templateUrl: './file-manager.component.html',
  styleUrls: ['./file-manager.component.css'],
  standalone: false,
  host: {
    'class': 'd-flex flex-column flex-1 h-100'
  }
})
export class FileManagerComponent implements OnInit, OnDestroy {

  public title = 'Administrador de archivos';
  public isLoading$ = this._loadingService.isLoading$;

  // ---------- Árbol ----------
  /** Árbol que se pinta (puede estar filtrado por la búsqueda). */
  nodes: FileTreeNode[] = [];
  /** Árbol completo, para volver a él al limpiar la búsqueda. */
  private originalNodes: FileTreeNode[] = [];
  searchQuery = '';
  mobileSidebarToggled = false;

  // ---------- Selección ----------
  carpetaActual: FileTreeNode | null = null;
  filaSeleccionada: FileTreeNode | null = null;
  /** Elementos de la carpeta actual: lo que ve la grilla. */
  contenido: FileTreeNode[] = [];
  /** Ruta desde la raíz hasta la carpeta actual, para la barra de ubicación. */
  ruta: FileTreeNode[] = [];

  // ---------- Historial de navegación (atrás / adelante) ----------
  private historial: FileTreeNode[] = [];
  private indiceHistorial = -1;

  // ---------- ag-Grid ----------
  public gridApi!: GridApi;
  public columnDefs: ColDef[] = [];
  public rowClassRules = {
    'fila-inactiva': (p: RowClassParams) => p.data?.activo === false
  };

  // ---------- Búsqueda y paginación de la grilla (en servidor) ----------
  @ViewChild(CampoBusquedaPaginacionComponent) campoBusqueda!: CampoBusquedaPaginacionComponent;
  public paginaActual = 1;
  public ultimaPagina = 1;
  public totalRegistros = 0;
  public registrosPorPagina = 10;

  // ---------- Papelera ----------
  /** Elementos en la papelera, para el contador del botón. */
  public numPapelera = 0;

  // ---------- Menú contextual (clic derecho) ----------
  /**
   * Un único menú para la grilla y el árbol. `elemento` es lo que había bajo
   * el cursor (null = espacio vacío); `dentroDe` es la carpeta en la que se
   * crearían cosas nuevas desde ese punto: la carpeta pulsada si es una, o
   * la carpeta actual si se pulsó un archivo o el fondo de la grilla.
   */
  menuCtx = {
    visible: false,
    x: 0,
    y: 0,
    elemento: null as FileTreeNode | null,
    dentroDe: null as FileTreeNode | null,
    origen: 'grilla' as 'grilla' | 'arbol'
  };
  @ViewChild('menuCtxEl') menuCtxEl?: ElementRef<HTMLElement>;

  /** Cierra el menú si el usuario hace scroll en cualquier sitio (capturado). */
  private readonly cerrarMenuPorScroll = () => this.cerrarMenu();

  private readonly unsubscribe$ = new Subject<void>();

  constructor(
    public appSettings: AppSettings,
    private _archivoService: ArchivoService,
    private _seguridadService: SeguridadService,
    private _toastr: ToastrService,
    private modal: NgbModal,
    private _loadingService: LoadingService,
    public _appAgGridService: AppAgGridService
  ) {
    // Pantalla a altura completa: el panel llena el hueco y el scroll lo
    // hacen el árbol y la grilla, no la página.
    this.appSettings.appSidebarMinified = true;
    this.appSettings.appHeaderInverse = true;
    this.appSettings.appContentFullHeight = true;
    this.appSettings.appContentClass = 'd-flex flex-column';
  }

  ngOnInit(): void {
    this.initializeGrid();
    this.loaddata();
    // capture:true — el scroll de la grilla y del árbol no burbujea a window
    document.addEventListener('scroll', this.cerrarMenuPorScroll, true);
  }

  ngOnDestroy(): void {
    this.appSettings.appSidebarMinified = false;
    this.appSettings.appHeaderInverse = false;
    this.appSettings.appContentFullHeight = false;
    this.appSettings.appContentClass = '';

    document.removeEventListener('scroll', this.cerrarMenuPorScroll, true);
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
    this.modal.dismissAll();
  }

  // ================================================================
  // MENÚ CONTEXTUAL
  // ================================================================

  /**
   * Clic derecho en la grilla. Un solo listener en el contenedor sirve para
   * las filas y para el fondo: si el clic cayó sobre una .ag-row se lee su
   * row-index y se recupera la fila por la API.
   */
  onContextMenuGrilla(e: MouseEvent): void {
    e.preventDefault();
    const fila = (e.target as HTMLElement).closest('.ag-row') as HTMLElement | null;
    let elemento: FileTreeNode | null = null;

    if (fila) {
      const idx = Number(fila.getAttribute('row-index'));
      const nodoGrilla = this.gridApi?.getDisplayedRowAtIndex(idx);
      elemento = (nodoGrilla?.data as FileTreeNode) ?? null;
      // Como en Windows: el clic derecho también selecciona la fila
      if (nodoGrilla) {
        nodoGrilla.setSelected(true, true);
        this.filaSeleccionada = elemento;
        if (elemento) { this.marcarEnArbol(elemento); }
      }
    }
    this.abrirMenu(e, elemento, 'grilla');
  }

  /** Clic derecho sobre un nodo del árbol (lo emite app-file-tree-node). */
  onContextMenuNodo(ev: { node: FileTreeNode; event: MouseEvent }): void {
    ev.event.preventDefault();
    // El del árbol puede ser una copia (búsqueda filtrada): se trabaja con el
    // nodo real para que las acciones vean sus hijos y su orden.
    const real = this.buscarPorId(this.nodes, ev.node.id) ?? ev.node;
    this.abrirMenu(ev.event, real, 'arbol');
  }

  /** Clic derecho en el fondo del árbol (fuera de cualquier nodo). */
  onContextMenuArbol(e: MouseEvent): void {
    if ((e.target as HTMLElement).closest('.file-link')) { return; }   // lo lleva el nodo
    e.preventDefault();
    this.abrirMenu(e, null, 'arbol');
  }

  private abrirMenu(e: MouseEvent, elemento: FileTreeNode | null, origen: 'grilla' | 'arbol'): void {
    this.menuCtx = {
      visible: true,
      x: e.clientX,
      y: e.clientY,
      elemento,
      dentroDe: elemento?.escarpeta ? elemento : this.carpetaActual,
      origen
    };

    // Ya pintado: si se sale de la ventana, se recoloca hacia dentro
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

  // Cualquier clic fuera, Escape o cambio de tamaño lo cierran
  @HostListener('document:click')
  @HostListener('document:keydown.escape')
  @HostListener('window:resize')
  onCerrarMenuGlobal(): void { this.cerrarMenu(); }

  // ================================================================
  // DATOS
  // ================================================================

  /**
   * Recarga el árbol conservando qué carpetas estaban abiertas y cuál era la
   * carpeta actual, para que guardar o borrar no "cierre" todo.
   */
  async loaddata(): Promise<void> {
    const abiertas = this.idsAbiertos(this.nodes);
    const idCarpeta = this.carpetaActual?.id;

    try {
      const res = await firstValueFrom(this._archivoService.getArchivoTree());
      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo cargar el árbol de archivos', 'Error');
        return;
      }
      this.originalNodes = this.prepararNodos(res.data ?? []);
      this.nodes = this.clonar(this.originalNodes);
    } catch (error) {
      // El AuthInterceptor ya muestra el toast del error HTTP
      console.error('Error al cargar el árbol de archivos:', error);
      this.originalNodes = [];
      this.nodes = [];
    }

    this.restaurarAbiertos(this.nodes, abiertas);
    this.contarPapelera();

    if (idCarpeta != null) {
      const nodo = this.buscarPorId(this.nodes, idCarpeta);
      if (nodo) {
        this.abrirCarpeta(nodo, false, true);
        return;
      }
    }
    // Sin carpeta (arranque) o la carpeta ya no existe (borrada)
    this.irARaiz();
  }

  /** Marca todos los nodos como cerrados y sin seleccionar. */
  private prepararNodos(nodes: FileTreeNode[]): FileTreeNode[] {
    return nodes.map(n => ({
      ...n,
      isOpen: false,
      isSelected: false,
      children: n.children ? this.prepararNodos(n.children) : undefined
    }));
  }

  private clonar(nodes: FileTreeNode[]): FileTreeNode[] {
    return JSON.parse(JSON.stringify(nodes));
  }

  refresh(): void {
    this.loaddata();
  }

  /** Cuántos elementos hay en la papelera (sólo para el contador del botón). */
  private async contarPapelera(): Promise<void> {
    try {
      const res = await firstValueFrom(this._archivoService.papelera());
      this.numPapelera = res?.status === 'success' ? (res.data?.length ?? 0) : 0;
    } catch {
      this.numPapelera = 0;   // el contador no merece un toast de error
    }
  }

  /** Abre la papelera; si algo se restaura o se borra, se recarga el árbol. */
  abrirPapelera(): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.modal.open(PapeleraComponent, {
      centered: true,
      size: 'lg',
      backdrop: 'static',
      keyboard: true
    });
    this.escucharModal(modalRef, modalRef.componentInstance.cambio, () => this.loaddata());
  }

  // ================================================================
  // NAVEGACIÓN
  // ================================================================

  /** Desde el árbol: una carpeta se abre; un archivo se marca como fila. */
  onNodeSelect(node: FileTreeNode): void {
    if (node.escarpeta) {
      this.abrirCarpeta(node, true);
    } else {
      // Un archivo del árbol: se abre su carpeta y se deja el archivo marcado
      const padre = this.buscarPadre(this.nodes, node.id);
      if (padre) { this.abrirCarpeta(padre, true); }
      this.filaSeleccionada = node;
      this.marcarEnArbol(node);
    }
    this.mobileSidebarToggled = false;
  }

  onNodeToggle(_node: FileTreeNode): void {
    // El nodo ya cambió su isOpen; no hay nada más que hacer. Se mantiene el
    // evento por si el árbol quiere avisar de algo en el futuro.
  }

  /**
   * Hace de `node` la carpeta actual: grilla, ruta e historial.
   * @param registrar false al restaurar tras recargar, para no duplicar
   *                  entradas en el historial.
   */
  private abrirCarpeta(node: FileTreeNode, registrar: boolean, conservarVista = false): void {
    this.marcarEnArbol(node);
    this.abrirAncestros(node);

    this.carpetaActual = node;
    this.filaSeleccionada = null;
    this.ruta = this.rutaHasta(this.nodes, node.id) ?? [node];

    if (registrar) { this.registrarHistorial(node); }

    if (conservarVista) {
      // Tras guardar o borrar: misma página y mismo filtro
      this.cargarContenido(this.paginaActual);
      return;
    }
    // El filtro es de la carpeta, no viaja a la siguiente
    this.searchTerm = '';
    this.campoBusqueda?.reset();
    this.cargarContenido(1);
  }

  /** Vista de raíz: la grilla muestra las carpetas de primer nivel. */
  irARaiz(): void {
    this.desmarcarTodo(this.nodes);
    this.carpetaActual = null;
    this.filaSeleccionada = null;
    this.ruta = [];
    this.searchTerm = '';
    this.campoBusqueda?.reset();
    this.cargarContenido(1);
  }

  subirNivel(): void {
    if (!this.carpetaActual) { return; }
    const padre = this.buscarPadre(this.nodes, this.carpetaActual.id);
    padre ? this.abrirCarpeta(padre, true) : this.irARaiz();
  }

  /**
   * Abre una carpeta desde la ruta, el menú contextual o la grilla. Las filas
   * de la grilla vienen del servidor y no son los objetos del árbol, así que
   * se resuelve por id.
   */
  irA(node: FileTreeNode): void {
    const enArbol = this.buscarPorId(this.nodes, node.id);
    if (enArbol) { this.abrirCarpeta(enArbol, true); }
  }

  // ================================================================
  // CONTENIDO DE LA CARPETA (paginado en servidor)
  // ================================================================
  // La grilla no muestra los hijos del árbol: pide al servidor la página
  // de la carpeta actual (config/archivo/allArchivos?padre=&page=&search=),
  // igual que allUsers. Así una carpeta con miles de reportes no pesa.

  /** Filtro vigente sobre la carpeta actual; viaja al servidor en cada página. */
  public searchTerm = '';

  async cargarContenido(page: number = this.paginaActual): Promise<void> {
    const padre = this.carpetaActual?.id ?? 0;
    try {
      this._loadingService.setLoading(true);
      const res = await firstValueFrom(
        this._archivoService.allArchivos(padre, page, this.registrosPorPagina, this.searchTerm)
      );

      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo obtener el contenido de la carpeta', 'Error');
        this.contenido = [];
        this.totalRegistros = 0;
        this.ultimaPagina = 1;
      } else {
        this.contenido = res.data?.data ?? [];
        const meta = res.data?.meta ?? {};
        this.totalRegistros    = meta.total ?? this.contenido.length;
        this.registrosPorPagina = meta.per_page ?? this.registrosPorPagina;
        this.paginaActual      = meta.current_page ?? page;
        this.ultimaPagina      = Math.max(meta.last_page ?? 1, 1);
        this.numCarpetas       = meta.carpetas ?? 0;
        this.numArchivos       = meta.archivos ?? 0;
      }
    } catch (error) {
      // El AuthInterceptor ya muestra el toast del error HTTP
      console.error('Error al cargar el contenido de la carpeta:', error);
      this.contenido = [];
    } finally {
      this._loadingService.setLoading(false);
    }

    this.gridApi?.setRowData(this.contenido);
    this.gridApi?.deselectAll();
  }

  private registrarHistorial(node: FileTreeNode): void {
    const actual = this.historial[this.indiceHistorial];
    if (actual?.id === node.id) { return; }
    this.historial = this.historial.slice(0, this.indiceHistorial + 1);
    this.historial.push(node);
    this.indiceHistorial = this.historial.length - 1;
  }

  get puedeAtras(): boolean { return this.indiceHistorial > 0; }
  get puedeAdelante(): boolean { return this.indiceHistorial < this.historial.length - 1; }

  atras(): void {
    if (!this.puedeAtras) { return; }
    this.indiceHistorial--;
    this.irAHistorial();
  }

  adelante(): void {
    if (!this.puedeAdelante) { return; }
    this.indiceHistorial++;
    this.irAHistorial();
  }

  private irAHistorial(): void {
    // Se busca por id: tras una recarga los objetos del historial ya no son
    // los del árbol actual.
    const nodo = this.buscarPorId(this.nodes, this.historial[this.indiceHistorial].id);
    if (nodo) { this.abrirCarpeta(nodo, false); }
  }

  // ================================================================
  // GRILLA
  // ================================================================

  initializeGrid(): void {
    this.columnDefs = [
      {
        headerName: '',
        field: 'icono',
        width: 44,
        maxWidth: 44,
        cellRenderer: (p: any) => this.iconoHtml(p.data),
        cellStyle: { display: 'flex', justifyContent: 'center', alignItems: 'center' },
        suppressMenu: true,
        sortable: false,
        filter: false,
        resizable: false
      },
      {
        headerName: 'Nombre',
        field: 'nombre',
        flex: 2,
        minWidth: 180,
        cellStyle: { textAlign: 'left' },
        filter: 'agTextColumnFilter'
      },
      {
        headerName: 'Descripción',
        field: 'descripcion',
        flex: 3,
        minWidth: 160,
        cellStyle: { textAlign: 'left' },
        filter: 'agTextColumnFilter'
      },
      {
        headerName: 'Tipo',
        field: 'tipo',
        width: 100,
        maxWidth: 110,
        // Carpeta, o el tipo de archivo (Enlace, PDF, Imagen…)
        valueGetter: p => p.data?.escarpeta ? 'Carpeta' : defTipo(p.data?.tipo, p.data?.url).etiqueta,
        cellStyle: { textAlign: 'center' },
        filter: 'agTextColumnFilter'
      },
      {
        headerName: 'Tamaño',
        field: 'tamano',
        width: 90,
        maxWidth: 100,
        // Sólo los ficheros subidos pesan; enlaces y carpetas van en blanco
        valueGetter: p => (p.data?.escarpeta || !p.data?.tamano) ? '' : formatoTamano(p.data.tamano),
        cellStyle: { textAlign: 'right' },
        filter: false
      },
      {
        headerName: 'Orden',
        field: 'orden',
        width: 80,
        maxWidth: 90,
        cellStyle: { textAlign: 'center' },
        filter: false
      },
      {
        headerName: 'Activo',
        field: 'activo',
        width: 90,
        maxWidth: 100,
        cellStyle: { display: 'flex', justifyContent: 'center', alignItems: 'center' },
        cellRenderer: (p: any) => p.value === false
          ? '<span class="badge bg-danger fs-10px">NO</span>'
          : '<span class="badge bg-teal fs-10px">SÍ</span>',
        suppressMenu: true,
        filter: false
      },
      {
        headerName: 'Modificación',
        field: 'updated_at_formateado',
        width: 160,
        maxWidth: 170,
        cellStyle: { textAlign: 'center' },
        filter: false
      }
    ];
  }

  /** Icono del elemento con su color, igual en la grilla que en el árbol. */
  private iconoHtml(n: FileTreeNode | undefined): string {
    if (!n) { return ''; }
    const color = n.color || (n.escarpeta ? '#F0B13B' : '#A6A09B');
    // Sin icono propio: el de carpeta, o el del tipo de archivo
    const clase = n.icono || (n.escarpeta ? 'fa fa-folder' : defTipo(n.tipo as string, n.url as string).icono);
    return `<i class="${clase}" style="color:${color}"></i>`;
  }

  onGridReady(params: GridReadyEvent): void {
    this.gridApi = params.api;
    this.gridApi.setRowData(this.contenido);
    this._appAgGridService.ajustarTamanoGrid(this.gridApi);
  }

  /** Un clic marca la fila (archivo o carpeta) como objetivo de las acciones. */
  onCellClicked(event: CellClickedEvent): void {
    this.filaSeleccionada = event.data as FileTreeNode;
    this.marcarEnArbol(this.filaSeleccionada);
  }

  /** Doble clic: entrar en la carpeta, o ejecutar el archivo. */
  onCellDoubleClicked(event: CellClickedEvent): void {
    const node = event.data as FileTreeNode;
    if (node.escarpeta) {
      const enArbol = this.buscarPorId(this.nodes, node.id) ?? node;
      this.abrirCarpeta(enArbol, true);
    } else {
      this.filaSeleccionada = node;
      this.ejecutar();
    }
  }

  @HostListener('window:resize')
  onResize(): void {
    this.gridApi?.sizeColumnsToFit();
  }

  // ---------- Búsqueda en la grilla (servidor) ----------

  /** Nuevo filtro → siempre desde la página 1, o podría caer fuera de rango. */
  filtrarGrilla(termino: string): void {
    this.searchTerm = (termino ?? '').trim();
    this.cargarContenido(1);
  }

  limpiarFiltroGrilla(): void {
    this.campoBusqueda?.reset();
    if (!this.searchTerm) { return; }
    this.searchTerm = '';
    this.cargarContenido(1);
  }

  // ---------- Paginación en servidor (mismos botones que allUsers) ----------

  /** Primer registro mostrado; 0 sin resultados. */
  get desde(): number {
    return this.totalRegistros === 0 ? 0 : (this.paginaActual - 1) * this.registrosPorPagina + 1;
  }

  /** Último registro mostrado, sin pasarse del total. */
  get hasta(): number {
    return Math.min(this.paginaActual * this.registrosPorPagina, this.totalRegistros);
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.ultimaPagina || page === this.paginaActual) { return; }
    this.cargarContenido(page);
  }

  firstPage(): void { this.goToPage(1); }
  prevPage(): void  { this.goToPage(this.paginaActual - 1); }
  nextPage(): void  { this.goToPage(this.paginaActual + 1); }
  lastPage(): void  { this.goToPage(this.ultimaPagina); }

  // ================================================================
  // ACCIONES
  // ================================================================

  /** Elemento sobre el que actúan editar / eliminar / auditoría. */
  get objetivo(): FileTreeNode | null {
    return this.filaSeleccionada ?? this.carpetaActual;
  }

  get puedeCrearDentro(): boolean { return !!this.carpetaActual; }
  get puedeEjecutar(): boolean { return !!this.filaSeleccionada && !this.filaSeleccionada.escarpeta; }
  get puedeEditar(): boolean { return !!this.objetivo; }
  get puedeEliminar(): boolean { return !!this.objetivo; }

  // ---- contadores para la barra de estado ----
  /** Totales de la carpeta (no de la página): los manda el servidor en meta. */
  public numCarpetas = 0;
  public numArchivos = 0;

  // Todas admiten el elemento como parámetro: la barra de herramientas las
  // llama sin él (actúan sobre `objetivo`) y el menú contextual con el
  // elemento que hay bajo el cursor, como en el explorador de Windows.

  nuevaRaiz(): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.abrirSaveFile(0, 'addNuevaRaiz', this.siguienteOrden(this.nodes));
    this.alCerrar(modalRef, () => this.loaddata());
  }

  nuevaCarpeta(dentroDe: FileTreeNode | null = this.carpetaActual): void {
    if (!dentroDe?.escarpeta || this._seguridadService.isexpired()) { return; }
    // Las filas de la grilla vienen del servidor sin hijos: el orden se lee del árbol
    const carpeta = this.buscarPorId(this.nodes, dentroDe.id) ?? dentroDe;
    const modalRef = this.abrirSaveFile(carpeta, 'addCarpeta', this.siguienteOrden(carpeta.children ?? []));
    this.alCerrar(modalRef, () => this.loaddata());
  }

  nuevoArchivo(dentroDe: FileTreeNode | null = this.carpetaActual): void {
    if (!dentroDe?.escarpeta || this._seguridadService.isexpired()) { return; }
    const carpeta = this.buscarPorId(this.nodes, dentroDe.id) ?? dentroDe;
    const modalRef = this.abrirSaveFile(carpeta, 'addArchivo', this.siguienteOrden(carpeta.children ?? []));
    this.alCerrar(modalRef, () => this.loaddata());
  }

  editar(objetivo: FileTreeNode | null = this.objetivo): void {
    if (!objetivo || this._seguridadService.isexpired()) { return; }
    const modalRef = this.abrirSaveFile(objetivo, 'edit', objetivo.orden);
    this.alCerrar(modalRef, () => this.loaddata());
  }

  eliminar(objetivo: FileTreeNode | null = this.objetivo): void {
    if (!objetivo || this._seguridadService.isexpired()) { return; }

    const modalRef = this.modal.open(DeleteFileComponent, {
      centered: true,
      size: 'md',
      backdrop: 'static',
      keyboard: true
    });
    modalRef.componentInstance.registro_selected = objetivo;

    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, () => {
      // Si se borró la carpeta actual, loaddata() no la encuentra y sube a raíz
      if (this.carpetaActual?.id === objetivo.id) { this.carpetaActual = null; }
      this.loaddata();
    });
  }

  /** Abre el reporte externo de un archivo a pantalla completa. */
  ejecutar(archivo: FileTreeNode | null = this.filaSeleccionada): void {
    if (!archivo || archivo.escarpeta || this._seguridadService.isexpired()) { return; }
    if (!archivo.url) {
      this._toastr.warning('Este archivo no tiene una URL configurada', 'Sin destino');
      return;
    }
    const modalRef = this.modal.open(ModalReporteExternoComponent, {
      centered: true,
      size: 'xxl',
      backdrop: 'static',
      keyboard: true,
      windowClass: 'my-class'   // modal a pantalla completa (ver estilos globales)
    });
    modalRef.componentInstance.registro_selected = archivo;
  }

  auditoria(objetivo: FileTreeNode | null = this.objetivo): void {
    if (!objetivo || this._seguridadService.isexpired()) { return; }
    const modalRef = this.modal.open(AuditoriaModalComponent, {
      centered: true,
      size: 'xl',
      backdrop: 'static',
      keyboard: true
    });
    modalRef.componentInstance.tablaNombre = 'archivo';
    modalRef.componentInstance.registroId = objetivo.id;
  }

  private abrirSaveFile(registro: FileTreeNode | 0, accion: string, orden: number): NgbModalRef {
    const modalRef = this.modal.open(SaveFileComponent, {
      centered: true,
      size: 'lg',
      backdrop: 'static',
      keyboard: false
    });
    modalRef.componentInstance.registro_selected = registro;
    modalRef.componentInstance.accion = accion;
    modalRef.componentInstance.maxOrder2 = orden;
    modalRef.componentInstance.tieneHijos = registro !== 0 && !!registro.children?.length;
    return modalRef;
  }

  /**
   * Siguiente número de orden dentro de una lista de hermanos.
   * Antes se calculaba sobre archivoModel, que nunca se cargaba, y salía
   * siempre 1; el árbol ya trae `orden`, así que se lee de ahí.
   */
  private siguienteOrden(hermanos: FileTreeNode[]): number {
    if (!hermanos.length) { return 1; }
    return Math.max(...hermanos.map(n => n.orden ?? 0)) + 1;
  }

  /** Ejecuta `fn` cuando el modal se cierra, se guarde o se cancele. */
  private alCerrar(modalRef: NgbModalRef, fn: () => void): void {
    modalRef.result.then(fn).catch(() => fn());
  }

  /**
   * Suscribe al @Output de un modal y corta la suscripción cuando el modal se
   * cierra o cuando esta pantalla se destruye (misma técnica que allUsers).
   */
  private escucharModal<T>(modalRef: NgbModalRef, salida: { pipe: any }, alEmitir: (v: T) => void): void {
    const modalCerrado$ = from(modalRef.result).pipe(catchError(() => of(null)));
    salida
      .pipe(takeUntil(merge(this.unsubscribe$, modalCerrado$)))
      .subscribe({ next: alEmitir, error: (e: any) => console.error('Error en el modal:', e) });
  }

  // ================================================================
  // BÚSQUEDA EN EL ÁRBOL
  // ================================================================

  filterNodes(): void {
    const q = this.searchQuery.trim().toLowerCase();
    if (!q) {
      this.nodes = this.clonar(this.originalNodes);
      return;
    }
    this.nodes = this.originalNodes
      .map(n => this.filtrarNodo(n, q))
      .filter((n): n is FileTreeNode => n !== null);
  }

  limpiarBusqueda(): void {
    this.searchQuery = '';
    this.filterNodes();
  }

  /** Devuelve el nodo si él o algún descendiente coincide; abre la rama. */
  private filtrarNodo(node: FileTreeNode, q: string): FileTreeNode | null {
    if (node.nombre.toLowerCase().includes(q)) {
      return { ...node, isOpen: true };
    }
    const hijos = (node.children ?? [])
      .map(h => this.filtrarNodo(h, q))
      .filter((h): h is FileTreeNode => h !== null);
    return hijos.length ? { ...node, children: hijos, isOpen: true } : null;
  }

  toggleMobileSidebar(): void {
    this.mobileSidebarToggled = !this.mobileSidebarToggled;
  }

  // ================================================================
  // UTILIDADES DEL ÁRBOL
  // ================================================================

  private buscarPorId(nodes: FileTreeNode[], id: number): FileTreeNode | null {
    for (const n of nodes) {
      if (n.id === id) { return n; }
      const hijo = n.children ? this.buscarPorId(n.children, id) : null;
      if (hijo) { return hijo; }
    }
    return null;
  }

  private buscarPadre(nodes: FileTreeNode[], id: number): FileTreeNode | null {
    for (const n of nodes) {
      if (n.children?.some(h => h.id === id)) { return n; }
      const p = n.children ? this.buscarPadre(n.children, id) : null;
      if (p) { return p; }
    }
    return null;
  }

  /** Camino raíz → nodo, o null si no está en el árbol. */
  private rutaHasta(nodes: FileTreeNode[], id: number): FileTreeNode[] | null {
    for (const n of nodes) {
      if (n.id === id) { return [n]; }
      const sub = n.children ? this.rutaHasta(n.children, id) : null;
      if (sub) { return [n, ...sub]; }
    }
    return null;
  }

  /**
   * Abre las ramas por encima del nodo para que quede a la vista. El propio
   * nodo no se toca: su +/− es cosa del usuario, y si se forzara aquí el "−"
   * no cerraría nunca una carpeta seleccionada.
   */
  private abrirAncestros(node: FileTreeNode): void {
    const ruta = this.rutaHasta(this.nodes, node.id) ?? [];
    ruta.slice(0, -1).forEach(n => n.isOpen = true);
  }

  private marcarEnArbol(node: FileTreeNode): void {
    this.desmarcarTodo(this.nodes);
    const enArbol = this.buscarPorId(this.nodes, node.id);
    if (enArbol) { enArbol.isSelected = true; }
  }

  private desmarcarTodo(nodes: FileTreeNode[]): void {
    nodes.forEach(n => {
      n.isSelected = false;
      if (n.children) { this.desmarcarTodo(n.children); }
    });
  }

  private idsAbiertos(nodes: FileTreeNode[]): Set<number> {
    const ids = new Set<number>();
    nodes.forEach(n => {
      if (n.isOpen) { ids.add(n.id); }
      if (n.children) { this.idsAbiertos(n.children).forEach(i => ids.add(i)); }
    });
    return ids;
  }

  private restaurarAbiertos(nodes: FileTreeNode[], ids: Set<number>): void {
    nodes.forEach(n => {
      n.isOpen = ids.has(n.id);
      if (n.children) { this.restaurarAbiertos(n.children, ids); }
    });
  }
}
