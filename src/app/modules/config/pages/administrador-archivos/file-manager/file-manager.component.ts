import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CellClickedEvent, ColDef, GridApi, GridReadyEvent, RowClassParams } from 'ag-grid-community';
import { firstValueFrom, from, merge, of, Subject } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';
import { ActivatedRoute } from '@angular/router';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import Swal from 'sweetalert2';

import { AppAgGridService } from '../../../../../service/app-agGrid.service';
import { AppSettings } from '../../../../../service/app-settings.service';
import { LoadingService } from '../../../../../service/loading.service';
import { ArchivoService } from '../../../services/archivo.service';
import { SeguridadService } from '../../../../seguridad/services/seguridad.service';

import { SaveFileComponent } from '../save-file/saveFile.component';
import { DeleteFileComponent } from '../delete-file/deleteFile.component';
import { PapeleraComponent } from '../papelera/papelera.component';
import { MoverArchivoComponent } from '../mover-archivo/moverArchivo.component';
import { PermisosArchivoComponent } from '../permisos-archivo/permisosArchivo.component';
import { ModalReporteExternoComponent } from '../modalReporteExterno/modalReporteExterno.component';
import { AuditoriaModalComponent } from '../../../../../components/auditoria-modal/auditoria-modal.component';
import { HistorialAccionesComponent } from '../historial-acciones/historialAcciones.component';
import { TIPO_CARPETA, TIPO_LINK, TIPO_UNIDAD, defTipo, extensionDe, formatoTamano, tipoArchivoDeExtension } from '../../../interfaces/tipoArchivo';

/**
 * Nodo del árbol tal como lo devuelve config/archivo/getArchivoTree: la fila
 * de la tabla `archivo` más `children` (sólo si tiene) y las fechas ya
 * formateadas. isOpen / isSelected son estado de pantalla, no de la base.
 */
export interface FileTreeNode {
  id: number;
  /** Carpeta que lo contiene; null en la raíz (FK autorreferencial en core.archivos) */
  padre: number | null;
  /** Peso en bytes del fichero subido; null/0 en enlaces y carpetas */
  tamano?: number | null;
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
  /** true = Ejecutar abre en otra pestaña del navegador, no en el visor */
  nueva_ventana?: boolean;
  /** true = no se ofrece "abrir en pestaña" ni descargar: la url no sale del visor */
  proteger_url?: boolean;
  /** Extensión del fichero subido (xlsx, pdf…); null en enlaces y carpetas */
  extension_archivo?: string | null;
  created_at_formateado?: string;
  updated_at_formateado?: string;
  children?: FileTreeNode[];
  isOpen?: boolean;
  isSelected?: boolean;
  /** Sólo en modo usuario (misArchivos): permiso efectivo que resolvió el back. */
  permiso?: PermisoEfectivo;
}

/** Banderas efectivas de un usuario sobre un nodo (seguridad.fn_permiso_archivo). */
export interface PermisoEfectivo {
  ver: boolean; ejecutar: boolean; descargar: boolean; crear: boolean;
  editar: boolean; eliminar: boolean; administrar: boolean; restaurar: boolean;
  origen: 'ADMIN' | 'PROPIETARIO' | 'DENEGADO' | 'DIRECTO' | 'HEREDADO' | 'PUBLICO' | 'NINGUNO' | 'PASO';
}

/** En el administrador (modo admin) todo está permitido: el menú de acceso ya lo protege. */
const PERMISO_TOTAL: PermisoEfectivo = {
  ver: true, ejecutar: true, descargar: true, crear: true, editar: true, eliminar: true, administrar: true, restaurar: true, origen: 'ADMIN',
};

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

  // ---------- Modo ----------
  /**
   * false = administrador (ruta filemanager): ve y puede todo; el acceso lo
   *         protege el menú.
   * true  = "Mis archivos" (ruta misArchivos): el árbol sólo trae lo que el
   *         usuario puede ver y cada acción se habilita con el permiso
   *         efectivo del nodo (`permiso`), que también valida el back.
   */
  modoUsuario = false;
  /** Tipo del usuario logueado: 1 super, 2 admin (ven todo, incluso en modo usuario). */
  private tipoUsuario = 0;

  // ---------- Árbol ----------
  /** Árbol que se pinta (puede estar filtrado por la búsqueda). */
  nodes: FileTreeNode[] = [];
  /** Árbol completo, para volver a él al limpiar la búsqueda. */
  private originalNodes: FileTreeNode[] = [];
  searchQuery = '';
  mobileSidebarToggled = false;

  // ---------- Selección ----------
  carpetaActual: FileTreeNode | null = null;
  /** Última fila pulsada: objetivo de las acciones de uno en uno (ejecutar, editar…). */
  filaSeleccionada: FileTreeNode | null = null;
  /**
   * Todas las filas marcadas en la grilla (Ctrl+clic / Mayús+clic / casilla).
   * Con más de una, Mover y Eliminar actúan sobre el lote.
   */
  seleccion: FileTreeNode[] = [];
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

  // ---------- Búsqueda en la grilla (quick filter de ag-Grid) ----------
  /** Id del input de búsqueda (app-campoBusqueda), para leerlo y limpiarlo. */
  readonly idBuscador = 'filter-archivos';

  // ---------- Ancho del lateral (divisor arrastrable) ----------
  /** Ancho por defecto del tema (--bs-file-manager-sidebar-width = 250px). */
  readonly ANCHO_LATERAL_DEFECTO = 250;
  private readonly ANCHO_LATERAL_MIN = 180;
  private readonly ANCHO_LATERAL_MAX = 640;
  private readonly CLAVE_ANCHO_LATERAL = 'miCRM3.archivos.anchoLateral';
  /** Ancho actual en px; se recuerda por navegador. */
  anchoLateral = this.leerAnchoLateral();
  /** true mientras se arrastra el divisor (quita transiciones y selección de texto). */
  redimensionando = false;

  // ---------- Arrastrar y soltar (mover) ----------
  /**
   * Estado del arrastre en curso. `elemento` es lo que se está moviendo
   * (viene del árbol o de la grilla); las banderas sólo pintan el destino.
   */
  dnd = {
    /** Lo que se arrastra: la selección múltiple si se cogió una fila de ella, o el elemento solo. */
    elementos: [] as FileTreeNode[],
    sobreRaizArbol: false,
    sobreFondoGrilla: false,
    /** Tile-carpeta de la cuadrícula sobre el que se va a soltar (id). */
    sobreTile: null as number | null,
  };
  /** Fila de la grilla resaltada como destino (para quitarle la clase después). */
  private filaDestino: HTMLElement | null = null;

  // ---------- Modo de vista: lista (ag-Grid) o cuadrícula (iconos grandes) ----------
  private readonly CLAVE_VISTA = 'miCRM3.archivos.vista';
  vista: 'lista' | 'cuadricula' = this.leerVista();
  /** Texto del buscador; en lista lo aplica ag-Grid, en cuadrícula contenidoFiltrado. */
  filtroTexto = '';
  /** Ancla del último clic sin Mayús en la cuadrícula, para seleccionar rangos. */
  private anclaSeleccion: number | null = null;

  // ---------- Papelera ----------
  /** Elementos en la papelera, para el contador del botón. */
  public numPapelera = 0;

  // ---------- Almacenamiento (pie del árbol) ----------
  /** Lo que ocupan los ficheros subidos y el disco del servidor, ya formateado. */
  almacen = {
    cargando: false,
    subidos: '—',
    subidosPapelera: '',
    ficheros: 0,
    discoLibre: '',
    discoTotal: '',
    /** % de disco ocupado (todo el disco, no sólo las subidas) para la barra. */
    porcentajeDisco: 0,
    tooltip: 'Espacio que ocupan los archivos subidos. Clic para actualizar.',
  };

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
    origen: 'grilla' as 'grilla' | 'arbol',
    /** Elementos sobre los que actúa: la selección múltiple si el clic cayó en ella, o el elemento solo. */
    lote: [] as FileTreeNode[],
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
    public _appAgGridService: AppAgGridService,
    private _route: ActivatedRoute
  ) {
    // Pantalla a altura completa: el panel llena el hueco y el scroll lo
    // hacen el árbol y la grilla, no la página.
    this.appSettings.appSidebarMinified = true;
    this.appSettings.appHeaderInverse = true;
    this.appSettings.appContentFullHeight = true;
    this.appSettings.appContentClass = 'd-flex flex-column';

    // La ruta decide el modo (config-routing: data.modo = 'mio')
    this.modoUsuario = this._route.snapshot.data?.['modo'] === 'mio';
    if (this.modoUsuario) { this.title = 'Mis archivos'; }
    this.tipoUsuario = Number(this._seguridadService.getUserLogin()?.type_user ?? 0);
  }

  // ================================================================
  // PERMISOS (modo usuario)
  // ================================================================

  /** Permiso efectivo sobre un nodo; en modo admin, todo. */
  p(el: FileTreeNode | null | undefined): PermisoEfectivo {
    if (!this.modoUsuario) { return PERMISO_TOTAL; }
    return el?.permiso ?? { ...PERMISO_TOTAL, ver: false, ejecutar: false, descargar: false, crear: false, editar: false, eliminar: false, administrar: false, restaurar: false, origen: 'NINGUNO' };
  }

  /** Crear en la raíz: sólo administradores (en modo usuario, tipo 1 y 2). */
  get puedeNuevaRaiz(): boolean {
    return !this.modoUsuario || this.tipoUsuario === 1 || this.tipoUsuario === 2;
  }

  /** Almacenamiento y auditoría: cosas de administrador. */
  get esAdministrador(): boolean {
    return this.puedeNuevaRaiz;
  }

  /**
   * Papelera: administradores, o quien tenga `restaurar` en algún nodo
   * visible (el back sólo le enseña lo que puede restaurar).
   */
  get puedeVerPapelera(): boolean {
    if (this.esAdministrador) { return true; }
    const alguno = (nodos: FileTreeNode[]): boolean =>
      nodos.some(n => !!n.permiso?.restaurar || alguno(n.children ?? []));
    return alguno(this.nodes);
  }

  /** Carpeta "de paso" (modo usuario): sólo sirve para llegar a lo visible. */
  esDePaso(el: FileTreeNode | null | undefined): boolean {
    return this.modoUsuario && el?.permiso?.origen === 'PASO';
  }

  /** Mover `el` a `destino` (null = raíz): editar sobre él y crear en el destino. */
  puedeMoverA(el: FileTreeNode, destino: FileTreeNode | null): boolean {
    return this.p(el).editar && (destino ? this.p(destino).crear : this.puedeNuevaRaiz);
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
      // Como en Windows: el clic derecho también selecciona la fila, salvo
      // que ya forme parte de la selección múltiple (entonces se conserva)
      if (nodoGrilla) {
        if (!nodoGrilla.isSelected()) { nodoGrilla.setSelected(true, true); }
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
      origen,
      // Sólo en la grilla: si el clic derecho cayó sobre una fila de la
      // selección múltiple, el menú va sobre todas
      lote: origen === 'grilla' && elemento ? this.loteDe(elemento) : (elemento ? [elemento] : []),
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
      // Modo usuario: el back sólo manda lo visible, con `permiso` en cada nodo
      const res = await firstValueFrom(this.modoUsuario
        ? this._archivoService.misArchivos()
        : this._archivoService.getArchivoTree());
      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo cargar el árbol de archivos', 'Error');
        return;
      }
      this.originalNodes = this.prepararNodos(res.data ?? []);
      this.nodes = this.clonar(this.originalNodes);
      // Si había una búsqueda en el árbol, se vuelve a aplicar sobre los datos nuevos
      if (this.searchQuery.trim()) { this.filterNodes(); }
    } catch (error) {
      // El AuthInterceptor ya muestra el toast del error HTTP
      console.error('Error al cargar el árbol de archivos:', error);
      this.originalNodes = [];
      this.nodes = [];
    }

    this.restaurarAbiertos(this.nodes, abiertas);
    if (this.puedeVerPapelera) { this.contarPapelera(); }
    if (this.esAdministrador) { this.cargarAlmacenamiento(); }   // pie del árbol: cambia al subir, borrar o vaciar la papelera

    if (idCarpeta != null) {
      const nodo = this.buscarPorId(this.nodes, idCarpeta);
      if (nodo) {
        await this.abrirCarpeta(nodo, false, true);   // también recarga la grilla
        return;
      }
    }
    // Sin carpeta (arranque) o la carpeta ya no existe (borrada)
    await this.irARaiz();
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

  /**
   * Botones "Recargar" (barra de ubicación, menú contextual y cabecera del
   * panel): vuelve a pedir el árbol y el contenido de la carpeta actual al
   * servidor, más el contador de la papelera y el pie de almacenamiento.
   * Conserva la carpeta abierta, las ramas desplegadas y el filtro escrito.
   */
  async refresh(): Promise<void> {
    this.recargando = true;
    try {
      await this.loaddata();
      this._toastr.info('Árbol y contenido actualizados', 'Recargar', { timeOut: 1500 });
    } finally {
      this.recargando = false;
    }
  }

  /** true mientras se recarga desde el botón: velo sobre el árbol (la grilla ya tiene el suyo). */
  recargando = false;

  /**
   * Pie del árbol: bytes de los ficheros subidos (vivos y en papelera),
   * cuántos son, y disco libre/total del servidor. El desglose por tipo
   * (ARCHIVO PDF: 3 · 1,2 MB…) va al tooltip.
   */
  async cargarAlmacenamiento(): Promise<void> {
    if (this.almacen.cargando) { return; }
    this.almacen.cargando = true;
    try {
      const res = await firstValueFrom(this._archivoService.almacenamiento());
      if (res?.status !== 'success') { return; }
      const d = res.data;
      const libre = Number(d.disco?.libre ?? 0);
      const total = Number(d.disco?.total ?? 0);

      this.almacen.subidos = formatoTamano(Number(d.subidos ?? 0));
      this.almacen.subidosPapelera = d.subidos_papelera > 0 ? formatoTamano(Number(d.subidos_papelera)) : '';
      this.almacen.ficheros = Number(d.ficheros ?? 0);
      this.almacen.discoLibre = total ? formatoTamano(libre) : '';
      this.almacen.discoTotal = total ? formatoTamano(total) : '';
      this.almacen.porcentajeDisco = total ? Math.round(100 * (total - libre) / total) : 0;

      const porTipo = (d.por_tipo ?? [])
        .map((t: any) => `${t.tipo}: ${t.unidades} · ${formatoTamano(Number(t.bytes))}`)
        .join('\n');
      this.almacen.tooltip =
        `Archivos subidos: ${this.almacen.subidos} en ${this.almacen.ficheros}` +
        (porTipo ? `\n${porTipo}` : '') +
        `\nEnlaces: ${d.enlaces ?? 0} · Carpetas: ${d.carpetas ?? 0}` +
        (total ? `\nDisco del servidor: ${this.almacen.discoLibre} libres de ${this.almacen.discoTotal} (${this.almacen.porcentajeDisco} % usado)` : '') +
        `\nClic para actualizar.`;
    } catch {
      // el pie no merece un toast; el interceptor ya avisa si es un error HTTP
    } finally {
      this.almacen.cargando = false;
    }
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
    modalRef.componentInstance.soloRestaurar = !this.esAdministrador;   // sin borrar definitivo ni vaciar
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

  // ---------- Divisor: ancho del lateral ----------

  /**
   * Arrastre del divisor entre el árbol y la grilla. Se usan pointer events
   * con captura: el propio divisor recibe los movimientos aunque el cursor
   * se salga de él (o de la ventana), y suelta solo al levantar el botón.
   */
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

  /** Abre todas las ramas del árbol (el que se ve: filtrado o completo). */
  expandirTodo(): void {
    this.abrirCerrarTodo(this.nodes, true);
  }

  /**
   * Cierra todas las ramas. Si hay una carpeta abierta en la grilla, se
   * vuelve a abrir el camino hasta ella para no perderla de vista.
   */
  contraerTodo(): void {
    this.abrirCerrarTodo(this.nodes, false);
    if (this.carpetaActual) { this.abrirAncestros(this.carpetaActual); }
  }

  private abrirCerrarTodo(nodes: FileTreeNode[], abrir: boolean): void {
    nodes.forEach(n => {
      if (n.children?.length) {
        n.isOpen = abrir;
        this.abrirCerrarTodo(n.children, abrir);
      }
    });
  }

  /**
   * Hace de `node` la carpeta actual: grilla, ruta e historial.
   * @param registrar false al restaurar tras recargar, para no duplicar
   *                  entradas en el historial.
   */
  private abrirCarpeta(node: FileTreeNode, registrar: boolean, conservarVista = false): Promise<void> {
    this.marcarEnArbol(node);
    this.abrirAncestros(node);

    this.carpetaActual = node;
    this.filaSeleccionada = null;
    this.ruta = this.rutaHasta(this.nodes, node.id) ?? [node];

    if (registrar) { this.registrarHistorial(node); }

    // Tras guardar o borrar (conservarVista) se mantiene el filtro escrito;
    // al cambiar de carpeta se limpia: el filtro es de la carpeta.
    if (!conservarVista) { this.limpiarFiltroGrilla(); }
    return this.cargarContenido();
  }

  /** Vista de raíz: la grilla muestra las carpetas de primer nivel. */
  irARaiz(): Promise<void> {
    this.desmarcarTodo(this.nodes);
    this.carpetaActual = null;
    this.filaSeleccionada = null;
    this.ruta = [];
    this.limpiarFiltroGrilla();
    return this.cargarContenido();
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
  // CONTENIDO DE LA CARPETA
  // ================================================================
  // La grilla pide al servidor la carpeta actual COMPLETA
  // (config/archivo/allArchivos?padre=&per_page=0): no hay tanta data como
  // para paginar, y así ag-Grid filtra (quick filter y filtros de columna)
  // y ordena en el navegador, al instante.

  async cargarContenido(): Promise<void> {
    // Modo usuario: el árbol ya trae todo lo visible (con permisos); la
    // grilla son los hijos de la carpeta actual, sin ir al servidor
    if (this.modoUsuario) {
      const lista = this.carpetaActual ? (this.carpetaActual.children ?? []) : this.nodes;
      this.contenido = [...lista].sort((a, b) =>
        Number(b.escarpeta) - Number(a.escarpeta) || (a.orden - b.orden) || a.nombre.localeCompare(b.nombre));
      this.numCarpetas = this.contenido.filter(n => n.escarpeta).length;
      this.numArchivos = this.contenido.length - this.numCarpetas;
      this.gridApi?.setRowData(this.contenido);
      this.gridApi?.deselectAll();
      return;
    }

    const padre = this.carpetaActual?.id ?? 0;   // 0 → el back lo trata como raíz (padre IS NULL)
    try {
      this._loadingService.setLoading(true);
      const res = await firstValueFrom(this._archivoService.allArchivos(padre));

      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo obtener el contenido de la carpeta', 'Error');
        this.contenido = [];
        this.numCarpetas = this.numArchivos = 0;
      } else {
        this.contenido = res.data?.data ?? [];
        const meta = res.data?.meta ?? {};
        this.numCarpetas = meta.carpetas ?? this.contenido.filter(n => n.escarpeta).length;
        this.numArchivos = meta.archivos ?? this.contenido.filter(n => !n.escarpeta).length;
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
        width: 280,
        // Casilla por fila y en la cabecera (todas las visibles): multiselección
        // también con el ratón/táctil, sin Ctrl ni Mayús
        checkboxSelection: true,
        headerCheckboxSelection: true,
        headerCheckboxSelectionFilteredOnly: true,
        cellStyle: { textAlign: 'left' },
        filter: 'agTextColumnFilter',
        // Arrastre nativo (HTML5) desde esta celda: así se puede soltar en el
        // árbol o sobre otra fila. dndSourceOnRowDrag deja el id en dataTransfer
        // y avisa al componente de qué se está arrastrando.
        dndSource: true,
        dndSourceOnRowDrag: (params: any) => this.onDragStart(params.rowNode.data, params.dragEvent),
        // Los que se abren en otra pestaña llevan una marca al lado del nombre
        cellRenderer: (p: any) => {
          const nombre = this.escapeHtml(p.value ?? '');
          return p.data?.nueva_ventana
            ? `${nombre} <i class="fa fa-arrow-up-right-from-square lista-nueva-ventana" title="Se abre en una ventana nueva"></i>`
            : nombre;
        }
      },
      {
        headerName: 'Descripción',
        field: 'descripcion',
        width: 280,
        cellStyle: { textAlign: 'left' },
        filter: 'agTextColumnFilter'
      },
      {
        headerName: 'Tipo',
        field: 'tipo',
        width: 100,
        maxWidth: 110,
        // Carpeta, o el tipo de archivo (Enlace, PDF, Imagen…)
        // El valor grabado: UNIDAD, CARPETA, LINK, ARCHIVO PDF, ARCHIVO MP4…
        // (registros antiguos sin tipo o con categoría: se muestra normalizado)
        valueGetter: p => this.tipoMostrado(p.data),
        cellStyle: { textAlign: 'center' },
        filter: 'agTextColumnFilter'
      },
      {
        // extension_archivo: la graba la subida (minúsculas, sin punto). Vacía en enlaces y carpetas.
        headerName: 'Ext.',
        field: 'extension_archivo',
        width: 80,
        maxWidth: 90,
        valueGetter: p => (p.data?.extension_archivo ?? '').toUpperCase(),
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
        // proteger_url: sin "abrir en pestaña" ni descarga en el visor. Sólo archivos.
        headerName: 'URL protegida',
        field: 'proteger_url',
        width: 110,
        maxWidth: 120,
        cellStyle: { display: 'flex', justifyContent: 'center', alignItems: 'center' },
        cellRenderer: (p: any) => {
          if (p.data?.escarpeta) { return ''; }
          return p.value
            ? '<span class="badge bg-teal fs-10px" title="Sólo se ve dentro del sistema"><i class="fa fa-shield-halved me-1"></i>SÍ</span>'
            : '<span class="badge bg-secondary fs-10px" title="Se puede abrir fuera y descargar">NO</span>';
        },
        suppressMenu: true,
        filter: false
      },
      {
        headerName: 'Creación',
        field: 'created_at_formateado',
        width: 160,
        maxWidth: 170,
        cellStyle: { textAlign: 'center' },
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
  /**
   * Texto de la columna Tipo: lo grabado en `tipo` (UNIDAD, CARPETA, LINK,
   * ARCHIVO PDF…). Los registros anteriores al formato actual (sin tipo, o
   * con la categoría "imagen"/"pdf") se muestran ya normalizados.
   */
  private tipoMostrado(n: FileTreeNode | undefined): string {
    if (!n) { return ''; }
    if (n.escarpeta) { return n.padre ? TIPO_CARPETA : TIPO_UNIDAD; }
    const t = String(n.tipo ?? '').trim().toUpperCase();
    if (t.startsWith('ARCHIVO') || t === TIPO_LINK) { return t; }
    const ext = n.extension_archivo || (n.url?.startsWith('storage/') ? extensionDe(n.url) : '');
    return ext ? tipoArchivoDeExtension(ext) : TIPO_LINK;
  }

  /** El nombre va en un cellRenderer con HTML: se escapa para que no inyecte nada. */
  private escapeHtml(texto: string): string {
    return String(texto)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

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
    // Sin sizeColumnsToFit: las columnas tienen ancho fijo y, si no caben,
    // la grilla hace scroll horizontal (en vez de encoger las celdas).
  }

  /** Un clic marca la fila (archivo o carpeta) como objetivo de las acciones. */
  onCellClicked(event: CellClickedEvent): void {
    this.filaSeleccionada = event.data as FileTreeNode;
    this.marcarEnArbol(this.filaSeleccionada);
  }

  /**
   * La selección de la grilla cambió (clic, Ctrl+clic, Mayús+clic, casillas).
   * ag-Grid lleva la selección múltiple como Windows: clic normal = sólo esa
   * fila; Ctrl = añade/quita; Mayús = rango; la casilla de la cabecera = todas.
   */
  onSelectionChanged(): void {
    this.seleccion = (this.gridApi?.getSelectedRows() ?? []) as FileTreeNode[];
    if (!this.seleccion.length) {
      this.filaSeleccionada = null;
    } else if (!this.filaSeleccionada || !this.seleccion.some(s => s.id === this.filaSeleccionada!.id)) {
      // La última pulsada ya no está marcada: el objetivo pasa a ser la última de la selección
      this.filaSeleccionada = this.seleccion[this.seleccion.length - 1];
    }
  }

  /** Más de una fila marcada: Mover y Eliminar actúan sobre el lote. */
  get hayVarios(): boolean { return this.seleccion.length > 1; }

  limpiarSeleccion(): void {
    this.gridApi?.deselectAll();
    this.seleccion = [];
    this.filaSeleccionada = null;
  }

  /**
   * Elementos sobre los que actúa una acción pedida para `el`: si hay
   * selección múltiple y `el` forma parte de ella, todos; si no, sólo `el`.
   */
  private loteDe(el: FileTreeNode): FileTreeNode[] {
    return this.hayVarios && this.seleccion.some(s => s.id === el.id) ? [...this.seleccion] : [el];
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

  /** Columnas de ancho fijo: al cambiar el tamaño no hay nada que reajustar. */
  onResize(): void { }

  // ---------- Búsqueda en la grilla (quick filter de ag-Grid) ----------

  /** Cada tecla filtra al instante sobre todas las columnas (nombre, descripción, tipo…). */
  filtrarGrilla(termino: string): void {
    this.filtroTexto = (termino ?? '').trim();
    this.gridApi?.setQuickFilter(this.filtroTexto);   // la cuadrícula usa contenidoFiltrado
  }

  /** Vacía el input y quita el quick filter y los filtros de columna. */
  limpiarFiltroGrilla(): void {
    const input = document.getElementById(this.idBuscador) as HTMLInputElement | null;
    if (input) { input.value = ''; }
    this.filtroTexto = '';
    this.gridApi?.setQuickFilter('');
    this.gridApi?.setFilterModel(null);
  }

  // ================================================================
  // VISTA CUADRÍCULA
  // ================================================================
  // Misma data que la grilla (contenido) pintada como tiles. La selección
  // se lleva aquí a mano (seleccion / filaSeleccionada), con el mismo
  // comportamiento que ag-Grid: clic, Ctrl+clic, Mayús+clic y casilla.

  cambiarVista(v: 'lista' | 'cuadricula'): void {
    if (this.vista === v) { return; }
    this.vista = v;
    this.limpiarSeleccion();   // la selección no viaja entre vistas
    this.anclaSeleccion = null;
    try { localStorage.setItem(this.CLAVE_VISTA, v); } catch { /* sin storage */ }
  }

  private leerVista(): 'lista' | 'cuadricula' {
    try { return localStorage.getItem(this.CLAVE_VISTA) === 'cuadricula' ? 'cuadricula' : 'lista'; } catch { return 'lista'; }
  }

  /** Contenido con el texto del buscador aplicado (nombre, descripción, tipo, extensión). */
  get contenidoFiltrado(): FileTreeNode[] {
    const q = this.filtroTexto.toLowerCase();
    if (!q) { return this.contenido; }
    return this.contenido.filter(n =>
      [n.nombre, n.descripcion, this.tipoMostrado(n), n.extension_archivo]
        .some(v => (v ?? '').toString().toLowerCase().includes(q)));
  }

  estaSeleccionado(el: FileTreeNode): boolean {
    return this.seleccion.some(s => s.id === el.id);
  }

  /** Clic en un tile: como en Windows (Ctrl añade/quita, Mayús rango, solo = sólo ése). */
  onClickTile(el: FileTreeNode, ev: MouseEvent): void {
    ev.stopPropagation();
    const lista = this.contenidoFiltrado;
    const idx = lista.findIndex(n => n.id === el.id);

    if (ev.shiftKey && this.anclaSeleccion !== null) {
      const [a, b] = [Math.min(this.anclaSeleccion, idx), Math.max(this.anclaSeleccion, idx)];
      this.seleccion = lista.slice(a, b + 1);
    } else if (ev.ctrlKey || ev.metaKey) {
      this.seleccion = this.estaSeleccionado(el)
        ? this.seleccion.filter(s => s.id !== el.id)
        : [...this.seleccion, el];
      this.anclaSeleccion = idx;
    } else {
      this.seleccion = [el];
      this.anclaSeleccion = idx;
    }
    this.filaSeleccionada = this.estaSeleccionado(el) ? el : (this.seleccion[this.seleccion.length - 1] ?? null);
    if (this.filaSeleccionada) { this.marcarEnArbol(this.filaSeleccionada); }
  }

  /** Casilla del tile: añade/quita sin necesidad de Ctrl (táctil). */
  alternarSeleccion(el: FileTreeNode, ev: Event): void {
    ev.stopPropagation();
    this.seleccion = this.estaSeleccionado(el)
      ? this.seleccion.filter(s => s.id !== el.id)
      : [...this.seleccion, el];
    this.filaSeleccionada = this.seleccion[this.seleccion.length - 1] ?? null;
    this.anclaSeleccion = this.contenidoFiltrado.findIndex(n => n.id === el.id);
  }

  onDobleClickTile(el: FileTreeNode): void {
    if (el.escarpeta) {
      const enArbol = this.buscarPorId(this.nodes, el.id) ?? el;
      this.abrirCarpeta(enArbol, true);
    } else {
      this.filaSeleccionada = el;
      this.ejecutar(el);
    }
  }

  /** Clic en el fondo (fuera de los tiles): quita la selección. */
  onClickFondoCuadricula(ev: MouseEvent): void {
    if ((ev.target as HTMLElement).closest('.archivos-tile')) { return; }
    this.limpiarSeleccion();
  }

  /** Clic derecho en un tile: si no estaba seleccionado, pasa a ser el único. */
  onContextMenuTile(el: FileTreeNode, ev: MouseEvent): void {
    ev.preventDefault();
    ev.stopPropagation();
    if (!this.estaSeleccionado(el)) {
      this.seleccion = [el];
      this.anclaSeleccion = this.contenidoFiltrado.findIndex(n => n.id === el.id);
    }
    this.filaSeleccionada = el;
    this.marcarEnArbol(el);
    this.abrirMenu(ev, el, 'grilla');
  }

  onContextMenuFondoCuadricula(ev: MouseEvent): void {
    if ((ev.target as HTMLElement).closest('.archivos-tile')) { return; }
    ev.preventDefault();
    this.abrirMenu(ev, null, 'grilla');
  }

  // ---- arrastrar y soltar en la cuadrícula ----

  onDragOverTile(el: FileTreeNode, ev: DragEvent): void {
    if (!this.dnd.elementos.length) { return; }
    ev.stopPropagation();                  // que el fondo no lo tome como "carpeta actual"
    if (!el.escarpeta) { this.dnd.sobreTile = null; return; }
    ev.preventDefault();
    if (ev.dataTransfer) { ev.dataTransfer.dropEffect = 'move'; }
    this.dnd.sobreTile = el.id;
    this.dnd.sobreFondoGrilla = false;
  }

  onDragLeaveTile(el: FileTreeNode, ev: DragEvent): void {
    const destino = ev.relatedTarget as Node | null;
    if (destino && (ev.currentTarget as HTMLElement).contains(destino)) { return; }
    if (this.dnd.sobreTile === el.id) { this.dnd.sobreTile = null; }
  }

  onDropTile(el: FileTreeNode, ev: DragEvent): void {
    ev.stopPropagation();
    if (!el.escarpeta) { return; }
    ev.preventDefault();
    const lote = this.dnd.elementos;
    this.onDragEnd();
    if (lote.length) { this.moverA(lote, el); }
  }

  onDragOverFondoCuadricula(ev: DragEvent): void {
    if (!this.dnd.elementos.length) { return; }
    ev.preventDefault();
    if (ev.dataTransfer) { ev.dataTransfer.dropEffect = 'move'; }
    this.dnd.sobreFondoGrilla = true;
  }

  onDropFondoCuadricula(ev: DragEvent): void {
    ev.preventDefault();
    const lote = this.dnd.elementos;
    this.onDragEnd();
    if (lote.length) { this.moverA(lote, this.carpetaActual); }
  }

  // ---- aspecto de los tiles ----

  /** Miniatura para imágenes subidas (se sirven desde el back); null para el resto. */
  miniaturaDe(el: FileTreeNode): string | null {
    if (el.escarpeta || !el.url) { return null; }
    return defTipo(el.tipo as string, el.url).id === 'imagen' ? this._archivoService.urlPublica(el.url) : null;
  }

  claseIconoDe(el: FileTreeNode): string {
    return el.icono || (el.escarpeta ? 'fa fa-folder' : defTipo(el.tipo as string, el.url).icono);
  }

  colorDe(el: FileTreeNode): string {
    return el.color || (el.escarpeta ? '#F0B13B' : defTipo(el.tipo as string, el.url).color);
  }

  /** Cuántos elementos cuelgan de una carpeta (lo sabe el árbol; la grilla viene sin hijos). */
  numHijos(el: FileTreeNode): number {
    return this.buscarPorId(this.nodes, el.id)?.children?.length ?? 0;
  }

  formatoTamanoTile(bytes: number | null | undefined): string {
    return formatoTamano(bytes);
  }

  tituloTile(el: FileTreeNode): string {
    const partes = [el.nombre];
    if (el.descripcion) { partes.push(el.descripcion); }
    partes.push(this.tipoMostrado(el));
    if (el.tamano) { partes.push(formatoTamano(el.tamano)); }
    if (el.activo === false) { partes.push('INACTIVO'); }
    return partes.join('\n');
  }

  /** Filas que pasan el filtro, para el resumen ("3 de 12"). */
  get filasVisibles(): number {
    if (this.vista === 'cuadricula') { return this.contenidoFiltrado.length; }
    return this.gridApi?.getDisplayedRowCount() ?? this.contenido.length;
  }

  // ================================================================
  // ACCIONES
  // ================================================================

  /** Elemento sobre el que actúan editar / eliminar / auditoría. */
  get objetivo(): FileTreeNode | null {
    return this.filaSeleccionada ?? this.carpetaActual;
  }

  // En modo admin p() devuelve todo true, así que estas reglas se reducen a
  // "hay algo seleccionado"; en modo usuario mandan las banderas del nodo.
  get puedeCrearDentro(): boolean { return !!this.carpetaActual && this.p(this.carpetaActual).crear; }
  get puedeEjecutar(): boolean { return !!this.filaSeleccionada && !this.filaSeleccionada.escarpeta && this.p(this.filaSeleccionada).ejecutar; }
  get puedeEditar(): boolean { return !!this.objetivo && this.p(this.objetivo).editar; }
  get puedeEliminar(): boolean {
    const lote = this.hayVarios ? this.seleccion : (this.objetivo ? [this.objetivo] : []);
    return lote.length > 0 && lote.every(e => this.p(e).eliminar);
  }
  /** Mover: editar sobre todo el lote (el destino se comprueba al soltar / en el modal). */
  get puedeMover(): boolean {
    const lote = this.hayVarios ? this.seleccion : (this.objetivo ? [this.objetivo] : []);
    return lote.length > 0 && lote.every(e => this.p(e).editar);
  }
  get puedeAdministrarPermisos(): boolean { return !!this.objetivo && this.p(this.objetivo).administrar; }

  // ---- contadores para la barra de estado ----
  /** Totales de la carpeta (no de la página): los manda el servidor en meta. */
  public numCarpetas = 0;
  public numArchivos = 0;

  // Todas admiten el elemento como parámetro: la barra de herramientas las
  // llama sin él (actúan sobre `objetivo`) y el menú contextual con el
  // elemento que hay bajo el cursor, como en el explorador de Windows.

  nuevaRaiz(): void {
    if (!this.puedeNuevaRaiz || this._seguridadService.isexpired()) { return; }
    const modalRef = this.abrirSaveFile(0, 'addNuevaRaiz', this.siguienteOrden(this.nodes));
    this.alCerrar(modalRef, () => this.loaddata());
  }

  nuevaCarpeta(dentroDe: FileTreeNode | null = this.carpetaActual): void {
    if (!dentroDe?.escarpeta || !this.p(dentroDe).crear || this._seguridadService.isexpired()) { return; }
    // Las filas de la grilla vienen del servidor sin hijos: el orden se lee del árbol
    const carpeta = this.buscarPorId(this.nodes, dentroDe.id) ?? dentroDe;
    const modalRef = this.abrirSaveFile(carpeta, 'addCarpeta', this.siguienteOrden(carpeta.children ?? []));
    this.alCerrar(modalRef, () => this.loaddata());
  }

  nuevoArchivo(dentroDe: FileTreeNode | null = this.carpetaActual): void {
    if (!dentroDe?.escarpeta || !this.p(dentroDe).crear || this._seguridadService.isexpired()) { return; }
    const carpeta = this.buscarPorId(this.nodes, dentroDe.id) ?? dentroDe;
    const modalRef = this.abrirSaveFile(carpeta, 'addArchivo', this.siguienteOrden(carpeta.children ?? []));
    this.alCerrar(modalRef, () => this.loaddata());
  }

  editar(objetivo: FileTreeNode | null = this.objetivo): void {
    if (!objetivo || !this.p(objetivo).editar || this._seguridadService.isexpired()) { return; }
    const modalRef = this.abrirSaveFile(objetivo, 'edit', objetivo.orden);
    this.alCerrar(modalRef, () => this.loaddata());
  }

  /**
   * Eliminar (a la papelera). Con varios seleccionados y el objetivo entre
   * ellos, va el lote entero con una confirmación; si no, el modal de uno.
   */
  eliminar(objetivo: FileTreeNode | null = this.objetivo): void {
    if (!objetivo || this._seguridadService.isexpired()) { return; }

    const lote = this.loteDe(objetivo);
    const sinPermiso = lote.find(e => !this.p(e).eliminar);
    if (sinPermiso) {
      this._toastr.warning(`«${sinPermiso.nombre}»: no tienes permiso para eliminarlo`, 'Eliminar');
      return;
    }
    if (lote.length > 1) {
      this.eliminarVarios(lote);
      return;
    }

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

  /**
   * Abre un archivo: en el visor a pantalla completa, o en otra pestaña del
   * navegador si el registro tiene `nueva_ventana` (se decide en saveFile).
   */
  async ejecutar(archivo: FileTreeNode | null = this.filaSeleccionada): Promise<void> {
    if (!archivo || archivo.escarpeta || this._seguridadService.isexpired()) { return; }
    if (!archivo.url) {
      this._toastr.warning('Este archivo no tiene una URL configurada', 'Sin destino');
      return;
    }
    if (!this.p(archivo).ejecutar) {
      this._toastr.warning('No tienes permiso para abrir este archivo', 'Mis archivos');
      return;
    }

    // Siempre por el back: vuelve a comprobar `ejecutar` (los administradores
    // pasan) y deja rastro en el historial (core.archivos_accesos); en modo
    // usuario el visor además respeta `descargar`
    let permiso: PermisoEfectivo | null = null;
    try {
      this._loadingService.setLoading(true);
      const res = await firstValueFrom(this._archivoService.abrirArchivo(archivo.id));
      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo abrir', this.modoUsuario ? 'Mis archivos' : 'Archivos');
        return;
      }
      if (this.modoUsuario) { permiso = res.data?.permiso ?? this.p(archivo); }
    } catch (e) {
      console.error('Error al abrir:', e);   // el interceptor ya avisó
      return;
    } finally {
      this._loadingService.setLoading(false);
    }

    // En otra pestaña sólo si además puede descargar (la url queda a la vista)
    if (archivo.nueva_ventana && (!permiso || (permiso.descargar && !archivo.proteger_url))) {
      // noopener: la pestaña nueva no puede tocar window.opener (seguridad)
      const ventana = window.open(this._archivoService.urlPublica(archivo.url), '_blank', 'noopener,noreferrer');
      if (!ventana) {
        this._toastr.warning('El navegador bloqueó la ventana emergente. Permite las ventanas emergentes para este sitio.', 'Ventana bloqueada');
      }
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
    modalRef.componentInstance.permiso = permiso;   // null en modo admin = puede todo
  }

  // ================================================================
  // MOVER
  // ================================================================
  // Dos caminos y el mismo destino: el modal "Mover a…" (botón y menú
  // contextual) y arrastrar y soltar, desde el árbol o desde la grilla,
  // sobre una carpeta del árbol, una fila-carpeta de la grilla, el fondo
  // del árbol (= raíz) o el fondo de la grilla (= carpeta actual). Todo
  // termina en moverA(), que valida y llama al back.

  /** Varios a la papelera de una vez, con confirmación (SweetAlert, como en la papelera). */
  private async eliminarVarios(lote: FileTreeNode[]): Promise<void> {
    const carpetas = lote.filter(e => e.escarpeta).length;
    const detalle = carpetas
      ? ` (${carpetas} ${carpetas === 1 ? 'carpeta' : 'carpetas'} con todo su contenido)`
      : '';
    const { isConfirmed } = await Swal.fire({
      title: `¿Enviar ${lote.length} elementos a la papelera?`,
      html: `<div class="text-start small">${lote.slice(0, 8).map(e => `• ${this.escapeHtml(e.nombre)}`).join('<br>')}`
          + (lote.length > 8 ? `<br>… y ${lote.length - 8} más` : '') + `</div>`
          + `<p class="mt-2 mb-0 small text-muted">Podrás restaurarlos desde la papelera${detalle}.</p>`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, enviar a la papelera',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc3545',
      reverseButtons: true,
    });
    if (!isConfirmed) { return; }

    try {
      this._loadingService.setLoading(true);
      const res = await firstValueFrom(this._archivoService.eliminarArchivos(lote.map(e => e.id)));
      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudieron eliminar', 'Eliminar');
        return;
      }
      this._toastr.success(res.message, 'Papelera', { closeButton: true });
      // Si entre lo borrado está la carpeta abierta, loaddata() sube a la raíz
      if (this.carpetaActual && lote.some(e => e.id === this.carpetaActual!.id)) { this.carpetaActual = null; }
      this.limpiarSeleccion();
      this.loaddata();
    } catch (e) {
      console.error('Error al eliminar varios:', e);   // el interceptor ya avisó
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  /**
   * Abre el modal con el árbol de carpetas para elegir el destino. Con
   * varios seleccionados (y el objetivo entre ellos) se mueven todos.
   */
  mover(objetivo: FileTreeNode | null = this.objetivo): void {
    if (!objetivo || this._seguridadService.isexpired()) { return; }
    if (this.loteDe(objetivo).some(e => !this.p(e).editar)) {
      this._toastr.warning('No tienes permiso para mover alguno de los elementos', 'Mover');
      return;
    }
    // Los elementos del árbol traen `children`: el modal bloquea sus subárboles
    const lote = this.loteDe(objetivo).map(e => this.buscarPorId(this.nodes, e.id) ?? e);

    const modalRef = this.modal.open(MoverArchivoComponent, {
      centered: true,
      size: 'md',
      backdrop: 'static',
      keyboard: true
    });
    modalRef.componentInstance.elemento = lote[0];
    modalRef.componentInstance.elementos = lote.length > 1 ? lote : [];
    modalRef.componentInstance.arbol = this.nodes;
    modalRef.componentInstance.puedeCrearEn = (c: FileTreeNode | null) => c ? this.p(c).crear : this.puedeNuevaRaiz;
    this.escucharModal(modalRef, modalRef.componentInstance.movido, () => this.trasMover());
  }

  /**
   * Mueve `lote` dentro de `destino` (null = raíz) tras comprobar lo que se
   * puede comprobar aquí; el back repite las comprobaciones. Uno solo →
   * moverArchivo; varios → moverArchivos (una transacción).
   */
  private async moverA(lote: FileTreeNode[], destino: FileTreeNode | null): Promise<void> {
    if (!lote.length || this._seguridadService.isexpired()) { return; }
    const padreNuevo = destino?.id ?? null;

    if (destino && !destino.escarpeta) {
      this._toastr.warning('Sólo se puede soltar sobre una carpeta', 'Mover');
      return;
    }
    const aMover = lote.filter(e => (e.padre ?? null) !== padreNuevo);   // los que no están ya ahí
    if (!aMover.length) { return; }
    const sinPermiso = aMover.find(e => !this.puedeMoverA(e, destino));
    if (sinPermiso) {
      this._toastr.warning(`«${sinPermiso.nombre}»: no tienes permiso para moverlo ahí (hace falta editar sobre él y crear en el destino)`, 'Mover');
      return;
    }
    const conflicto = destino ? aMover.find(e => this.estaDentroDe(destino.id, e)) : undefined;
    if (conflicto) {
      this._toastr.warning(`«${conflicto.nombre}»: no se puede mover una carpeta dentro de sí misma`, 'Mover');
      return;
    }

    try {
      this._loadingService.setLoading(true);
      const res = await firstValueFrom(aMover.length === 1
        ? this._archivoService.moverArchivo(aMover[0].id, padreNuevo)
        : this._archivoService.moverArchivos(aMover.map(e => e.id), padreNuevo));
      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo mover', 'Mover');
        return;
      }
      this._toastr.success(res.message, 'Movido', { closeButton: true });
      this.trasMover();
    } catch (e) {
      console.error('Error al mover:', e);   // el interceptor ya avisó
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  // ================================================================
  // DESCARGAR .ZIP
  // ================================================================

  /** true mientras el servidor arma el zip y el navegador lo recibe. */
  descargandoZip = false;

  /** Hay algo seleccionado que pueda ir en un zip (carpeta, fichero no protegido o enlace no protegido). */
  get puedeDescargar(): boolean {
    const lote = this.hayVarios ? this.seleccion : (this.objetivo ? [this.objetivo] : []);
    return lote.some(e => e.escarpeta || (!e.proteger_url && !!e.url && this.p(e).descargar));
  }

  /**
   * Descarga el lote (o el objetivo) como .zip: el back lo arma con las
   * carpetas como rutas, los ficheros subidos tal cual y los enlaces como
   * accesos directos .url; los protegidos (proteger_url) se omiten y se
   * avisa. El fichero llega como blob con el token y se guarda desde
   * memoria (misma técnica que Descargar en el visor).
   */
  async descargarZip(lote?: FileTreeNode[]): Promise<void> {
    if (this.descargandoZip || this._seguridadService.isexpired()) { return; }
    const elementos = lote ?? (this.hayVarios ? this.seleccion : (this.objetivo ? [this.objetivo] : []));
    if (!elementos.length) { return; }

    this.descargandoZip = true;
    this._loadingService.setLoading(true);
    try {
      const resp = await firstValueFrom(this._archivoService.descargarZip(elementos.map(e => e.id)));
      if (!resp.body) { return; }

      const enlace = document.createElement('a');
      const urlBlob = URL.createObjectURL(resp.body);
      enlace.href = urlBlob;
      enlace.download = this.nombreDescargaZip(resp.headers.get('Content-Disposition'), elementos);
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      setTimeout(() => URL.revokeObjectURL(urlBlob), 1000);

      const ficheros = Number(resp.headers.get('X-Zip-Ficheros') ?? 0);
      const enlaces  = Number(resp.headers.get('X-Zip-Enlaces') ?? 0);
      const omitidos = Number(resp.headers.get('X-Zip-Omitidos') ?? 0);
      const partes = [];
      if (ficheros) { partes.push(`${ficheros} ${ficheros === 1 ? 'fichero' : 'ficheros'}`); }
      if (enlaces)  { partes.push(`${enlaces} ${enlaces === 1 ? 'enlace' : 'enlaces'}`); }
      const resumen = partes.length ? `Zip con ${partes.join(' y ')}` : 'Zip generado';
      if (omitidos) {
        this._toastr.warning(`${resumen}. Se omitieron ${omitidos} ${omitidos === 1 ? 'elemento protegido' : 'elementos protegidos'} (URL protegida).`, 'Descarga', { timeOut: 8000, closeButton: true });
      } else {
        this._toastr.success(resumen, 'Descarga', { closeButton: true });
      }
    } catch (e: any) {
      // El interceptor ya avisó del error HTTP; con responseType blob el
      // mensaje del back viene dentro del blob, así que se muestra aquí
      if (e?.error instanceof Blob) {
        try {
          const cuerpo = JSON.parse(await e.error.text());
          this._toastr.error(cuerpo?.message || 'No se pudo generar el zip', 'Descarga', { closeButton: true });
        } catch { /* nada más que decir */ }
      }
      console.error('Error al descargar el zip:', e);
    } finally {
      this.descargandoZip = false;
      this._loadingService.setLoading(false);
    }
  }

  /** Nombre del zip: el que manda el back en Content-Disposition; si no llega, uno razonable. */
  private nombreDescargaZip(disposition: string | null, elementos: FileTreeNode[]): string {
    const utf8 = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
    if (utf8) { try { return decodeURIComponent(utf8); } catch { /* cae al siguiente */ } }
    const plano = disposition?.match(/filename="?([^";]+)"?/i)?.[1];
    if (plano) { return plano; }
    return elementos.length === 1 && elementos[0].escarpeta
      ? `${elementos[0].nombre}.zip`
      : 'archivos.zip';
  }

  /**
   * "Mover a la raíz" del menú contextual: saca el elemento (o el lote) del
   * árbol y lo deja en el primer nivel; una carpeta pasa a ser UNIDAD con
   * todo su contenido. Va con confirmación porque cambia la estructura.
   */
  async moverARaiz(lote: FileTreeNode[]): Promise<void> {
    const aMover = lote.filter(e => e.padre != null);
    if (!aMover.length) { return; }
    const nombres = aMover.length === 1 ? `«${aMover[0].nombre}»` : `${aMover.length} elementos`;
    const { isConfirmed } = await Swal.fire({
      title: `¿Mover ${nombres} a la raíz?`,
      text: aMover.some(e => e.escarpeta)
        ? 'Las carpetas pasan a ser unidades de primer nivel, con todo su contenido.'
        : 'Quedará en el primer nivel, fuera de cualquier carpeta.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, mover a la raíz',
      cancelButtonText: 'Cancelar',
      reverseButtons: true,
    });
    if (isConfirmed) { await this.moverA(aMover, null); }
  }

  /** Para el menú contextual: hay algo en el lote que no está ya en la raíz. */
  algunoFueraDeRaiz(lote: FileTreeNode[]): boolean {
    return lote.some(e => e.padre != null);
  }

  /** true si `id` es el propio elemento o cuelga de él (moverlo ahí crearía un ciclo). */
  private estaDentroDe(id: number, elemento: FileTreeNode): boolean {
    const completo = this.buscarPorId(this.nodes, elemento.id) ?? elemento;
    const recorrer = (n: FileTreeNode): boolean =>
      n.id === id || (n.children ?? []).some(recorrer);
    return recorrer(completo);
  }

  /** Tras mover: si se movió la carpeta abierta, la vista sigue en ella (en su nuevo sitio). */
  private trasMover(): void {
    this.limpiarSeleccion();
    this.loaddata();
  }

  // ---------- Arrastrar y soltar ----------

  /** Empieza un arrastre (desde el árbol o desde la grilla). */
  onDragStart(elemento: FileTreeNode, event: DragEvent): void {
    this.dnd.elementos = this.loteDe(elemento);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      // Por si algún día se suelta fuera de este componente
      event.dataTransfer.setData('application/x-micrm-archivo', String(elemento.id));
      event.dataTransfer.setData('text/plain', this.dnd.elementos.map(e => e.nombre).join(', '));
    }
  }

  /** Fin del arrastre. A nivel de documento: el de la grilla lo dispara ag-Grid en su celda. */
  @HostListener('document:dragend')
  onDragEnd(): void {
    this.dnd.elementos = [];
    this.dnd.sobreTile = null;
    this.dnd.sobreRaizArbol = false;
    this.dnd.sobreFondoGrilla = false;
    this.quitarFilaDestino();
  }

  /** Soltado sobre una carpeta del árbol. */
  onDropNodo(destino: FileTreeNode, event: DragEvent): void {
    event.preventDefault();
    const lote = this.dnd.elementos;
    this.onDragEnd();
    if (lote.length) { this.moverA(lote, destino); }
  }

  /** Fondo del árbol (fuera de los nodos): destino = raíz. */
  onDragOverArbol(event: DragEvent): void {
    if (!this.dnd.elementos.length) { return; }
    // Si el cursor está sobre un nodo, ya lo gestiona el nodo (stopPropagation)
    event.preventDefault();
    if (event.dataTransfer) { event.dataTransfer.dropEffect = 'move'; }
    this.dnd.sobreRaizArbol = true;
  }

  onDropArbol(event: DragEvent): void {
    event.preventDefault();
    const lote = this.dnd.elementos;
    this.onDragEnd();
    if (lote.length) { this.moverA(lote, null); }
  }

  /**
   * Sobre la grilla: si el cursor está en una fila-carpeta se resalta esa
   * fila; si está en el fondo (o sobre un archivo) el destino es la carpeta
   * actual y se resalta la grilla entera.
   */
  onDragOverGrilla(event: DragEvent): void {
    if (!this.dnd.elementos.length) { return; }
    event.preventDefault();
    if (event.dataTransfer) { event.dataTransfer.dropEffect = 'move'; }

    const fila = this.filaCarpetaBajo(event);
    if (fila) {
      if (this.filaDestino !== fila.el) {
        this.quitarFilaDestino();
        fila.el.classList.add('fila-destino');
        this.filaDestino = fila.el;
      }
      this.dnd.sobreFondoGrilla = false;
    } else {
      this.quitarFilaDestino();
      this.dnd.sobreFondoGrilla = true;
    }
  }

  onDragLeaveGrilla(event: DragEvent): void {
    const destino = event.relatedTarget as Node | null;
    if (destino && (event.currentTarget as HTMLElement).contains(destino)) { return; }
    this.quitarFilaDestino();
    this.dnd.sobreFondoGrilla = false;
  }

  onDropGrilla(event: DragEvent): void {
    event.preventDefault();
    const lote = this.dnd.elementos;
    const fila = this.filaCarpetaBajo(event);
    this.onDragEnd();
    if (!lote.length) { return; }
    // Sobre una carpeta de la lista → dentro de ella; si no → carpeta actual (o raíz)
    this.moverA(lote, fila ? fila.data : this.carpetaActual);
  }

  /** Fila-carpeta de la grilla bajo el cursor, si la hay. */
  private filaCarpetaBajo(event: DragEvent): { el: HTMLElement; data: FileTreeNode } | null {
    const el = (event.target as HTMLElement).closest('.ag-row') as HTMLElement | null;
    if (!el) { return null; }
    const idx = Number(el.getAttribute('row-index'));
    const data = this.gridApi?.getDisplayedRowAtIndex(idx)?.data as FileTreeNode | undefined;
    return data?.escarpeta ? { el, data } : null;
  }

  private quitarFilaDestino(): void {
    this.filaDestino?.classList.remove('fila-destino');
    this.filaDestino = null;
  }

  /**
   * Permisos por usuario del elemento (modal "Seguridad"). Si cambia algo
   * (público, filas) se recarga el árbol para que la grilla refleje `publico`.
   */
  permisos(objetivo: FileTreeNode | null = this.objetivo): void {
    if (!objetivo || !this.p(objetivo).administrar || this._seguridadService.isexpired()) { return; }
    const modalRef = this.modal.open(PermisosArchivoComponent, {
      centered: true,
      size: 'xl',
      backdrop: 'static',
      keyboard: false
    });
    modalRef.componentInstance.elemento = objetivo;
    let cambio = false;
    this.escucharModal(modalRef, modalRef.componentInstance.cambio, () => { cambio = true; });
    this.alCerrar(modalRef, () => { if (cambio) { this.loaddata(); } });
  }

  auditoria(objetivo: FileTreeNode | null = this.objetivo): void {
    if (!objetivo || this._seguridadService.isexpired()) { return; }
    const modalRef = this.modal.open(AuditoriaModalComponent, {
      centered: true,
      size: 'xl',
      backdrop: 'static',
      keyboard: true
    });
    modalRef.componentInstance.tablaNombre = 'archivos';   // core.archivos: lo que graba el trigger en logs_cambios
    modalRef.componentInstance.registroId = objetivo.id;
  }

  /** Historial de acciones: quién abrió / descargó el elemento (o lo que cuelga de la carpeta). */
  historialAcciones(objetivo: FileTreeNode | null = this.objetivo): void {
    if (!objetivo || this._seguridadService.isexpired()) { return; }
    const modalRef = this.modal.open(HistorialAccionesComponent, {
      centered: true,
      size: 'xl',
      backdrop: 'static',
      keyboard: true
    });
    modalRef.componentInstance.elemento = objetivo;
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
