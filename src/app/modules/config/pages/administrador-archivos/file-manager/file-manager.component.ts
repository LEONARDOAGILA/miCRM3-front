import { Component, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CellClickedEvent, ColDef, GridApi, GridReadyEvent, RowClassParams } from 'ag-grid-community';
import { firstValueFrom, from, merge, of, Subject } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';

import { AppAgGridService } from '../../../../../service/app-agGrid.service';
import { AppSettings } from '../../../../../service/app-settings.service';
import { ArchivoService } from '../../../services/archivo.service';
import { SeguridadService } from '../../../../seguridad/services/seguridad.service';

import { SaveFileComponent } from '../save-file/saveFile.component';
import { DeleteFileComponent } from '../delete-file/deleteFile.component';
import { ModalReporteExternoComponent } from '../modalReporteExterno/modalReporteExterno.component';
import { AuditoriaModalComponent } from '../../../../../components/auditoria-modal/auditoria-modal.component';
import { CampoBusquedaPaginacionComponent } from '../../../../../components/campos/campoBusquedaPaginacion/campoBusquedaPaginacion.component';

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

  // ---------- Búsqueda y paginación de la grilla ----------
  // Todo en cliente: la grilla ya tiene todas las filas de la carpeta.
  @ViewChild(CampoBusquedaPaginacionComponent) campoBusqueda!: CampoBusquedaPaginacionComponent;
  public paginaActual = 1;
  public ultimaPagina = 1;
  public totalRegistros = 0;
  public registrosPorPagina = 10;

  private readonly unsubscribe$ = new Subject<void>();

  constructor(
    public appSettings: AppSettings,
    private _archivoService: ArchivoService,
    private _seguridadService: SeguridadService,
    private _toastr: ToastrService,
    private modal: NgbModal,
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
  }

  ngOnDestroy(): void {
    this.appSettings.appSidebarMinified = false;
    this.appSettings.appHeaderInverse = false;
    this.appSettings.appContentFullHeight = false;
    this.appSettings.appContentClass = '';

    this.unsubscribe$.next();
    this.unsubscribe$.complete();
    this.modal.dismissAll();
  }

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

    if (idCarpeta != null) {
      const nodo = this.buscarPorId(this.nodes, idCarpeta);
      if (nodo) {
        this.abrirCarpeta(nodo, false);
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
  private abrirCarpeta(node: FileTreeNode, registrar: boolean): void {
    this.marcarEnArbol(node);
    this.abrirAncestros(node);

    this.carpetaActual = node;
    this.filaSeleccionada = null;
    this.contenido = node.children ?? [];
    this.ruta = this.rutaHasta(this.nodes, node.id) ?? [node];

    if (registrar) { this.registrarHistorial(node); }

    this.gridApi?.setRowData(this.contenido);
    this.gridApi?.deselectAll();
    this.limpiarFiltroGrilla();   // el filtro es de la carpeta, no viaja a la siguiente
  }

  /** Vista de raíz: la grilla muestra las carpetas de primer nivel. */
  irARaiz(): void {
    this.desmarcarTodo(this.nodes);
    this.carpetaActual = null;
    this.filaSeleccionada = null;
    this.contenido = this.nodes;
    this.ruta = [];
    this.gridApi?.setRowData(this.contenido);
    this.gridApi?.deselectAll();
    this.limpiarFiltroGrilla();
  }

  subirNivel(): void {
    if (!this.carpetaActual) { return; }
    const padre = this.buscarPadre(this.nodes, this.carpetaActual.id);
    padre ? this.abrirCarpeta(padre, true) : this.irARaiz();
  }

  /** Clic en un tramo de la barra de ubicación. */
  irA(node: FileTreeNode): void {
    this.abrirCarpeta(node, true);
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
        field: 'escarpeta',
        width: 100,
        maxWidth: 110,
        valueGetter: p => p.data?.escarpeta ? 'Carpeta' : 'Archivo',
        cellStyle: { textAlign: 'center' },
        filter: 'agTextColumnFilter'
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
    const clase = n.icono || (n.escarpeta ? 'fa fa-folder' : 'far fa-file');
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

  // ---------- Búsqueda en la grilla ----------

  /** Filtro rápido de ag-Grid sobre todas las columnas de la carpeta actual. */
  filtrarGrilla(termino: string): void {
    this.gridApi?.setQuickFilter(termino ?? '');
    this.gridApi?.paginationGoToFirstPage();
  }

  limpiarFiltroGrilla(): void {
    this.campoBusqueda?.reset();
    this.gridApi?.setQuickFilter('');
    this.gridApi?.setFilterModel(null);
  }

  // ---------- Paginación en cliente (mismos botones que allUsers) ----------

  /** Primer registro mostrado; 0 sin resultados. */
  get desde(): number {
    return this.totalRegistros === 0 ? 0 : (this.paginaActual - 1) * this.registrosPorPagina + 1;
  }

  /** Último registro mostrado, sin pasarse del total. */
  get hasta(): number {
    return Math.min(this.paginaActual * this.registrosPorPagina, this.totalRegistros);
  }

  /** ag-Grid lo dispara al cambiar de página, de filtro o de datos. */
  onPaginationChanged(): void {
    if (!this.gridApi) { return; }
    this.paginaActual = this.gridApi.paginationGetCurrentPage() + 1;   // la API cuenta desde 0
    this.ultimaPagina = Math.max(this.gridApi.paginationGetTotalPages(), 1);
    this.totalRegistros = this.gridApi.paginationGetRowCount();       // ya filtrado
  }

  firstPage(): void { this.gridApi?.paginationGoToFirstPage(); }
  prevPage(): void  { this.gridApi?.paginationGoToPreviousPage(); }
  nextPage(): void  { this.gridApi?.paginationGoToNextPage(); }
  lastPage(): void  { this.gridApi?.paginationGoToLastPage(); }

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
  get numCarpetas(): number { return this.contenido.filter(n => n.escarpeta).length; }
  get numArchivos(): number { return this.contenido.length - this.numCarpetas; }

  nuevaRaiz(): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.abrirSaveFile(0, 'addNuevaRaiz', this.siguienteOrden(this.nodes));
    this.alCerrar(modalRef, () => this.loaddata());
  }

  nuevaCarpeta(): void {
    if (!this.carpetaActual || this._seguridadService.isexpired()) { return; }
    const modalRef = this.abrirSaveFile(this.carpetaActual, 'addCarpeta', this.siguienteOrden(this.contenido));
    this.alCerrar(modalRef, () => this.loaddata());
  }

  nuevoArchivo(): void {
    if (!this.carpetaActual || this._seguridadService.isexpired()) { return; }
    const modalRef = this.abrirSaveFile(this.carpetaActual, 'addArchivo', this.siguienteOrden(this.contenido));
    this.alCerrar(modalRef, () => this.loaddata());
  }

  editar(): void {
    const objetivo = this.objetivo;
    if (!objetivo || this._seguridadService.isexpired()) { return; }
    const modalRef = this.abrirSaveFile(objetivo, 'edit', objetivo.orden);
    this.alCerrar(modalRef, () => this.loaddata());
  }

  eliminar(): void {
    const objetivo = this.objetivo;
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

  /** Abre el reporte externo del archivo seleccionado a pantalla completa. */
  ejecutar(): void {
    if (!this.puedeEjecutar || this._seguridadService.isexpired()) { return; }
    if (!this.filaSeleccionada?.url) {
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
    modalRef.componentInstance.registro_selected = this.filaSeleccionada;
  }

  auditoria(): void {
    const objetivo = this.objetivo;
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
