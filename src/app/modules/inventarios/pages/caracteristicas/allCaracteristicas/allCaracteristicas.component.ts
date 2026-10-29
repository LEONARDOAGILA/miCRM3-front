import { Component, ElementRef, EventEmitter, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Subject, firstValueFrom, from, merge, of } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';
import { CellClickedEvent, ColumnApi, GridApi, GridReadyEvent, RowNode } from 'ag-grid-community';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';

///   SERVICIOS    ///
import { SeguridadService } from '../../../../seguridad/services/seguridad.service';
import { CaracteristicaService } from '../../../services/caracteristica.service';
import { AppAgGridService } from '../../../../../service/app-agGrid.service';
import { LoadingService } from '../../../../../service/loading.service';

///   MODELOS    ///
import { AccesoModel } from '../../../../seguridad/interfaces/accesoModel';

///   COMPONENTES    ///
import { SaveCaracteristicaComponent } from '../saveCaracteristica/saveCaracteristica.component';
import { DeleteCaracteristicaComponent } from '../deleteCaracteristica/deleteCaracteristica.component';
import { CategoriaService } from '../../../services/categoria.service';
import { FileTreeNode, FileTreeNodeComponent } from '../../../../../components/file-tree-node/file-tree-node.component';
import { buscarNodo, filtrarArbol, recorrer } from '../../../../seguridad/pages/grupos/arbolGrupos';
import { CampoBusquedaPaginacionComponent } from '../../../../../components/campos/campoBusquedaPaginacion/campoBusquedaPaginacion.component';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AgGridModule } from 'ag-grid-angular';
import { NgScrollbarModule } from 'ngx-scrollbar';
import { PanelComponent } from '../../../../../components/panel/panel.component';

/**
 * LISTADO DE CARACTERÍSTICAS (la plantilla de cada categoría).
 *
 * Cada categoría lleva su lista de lo que hay que rellenar en un producto:
 * un portátil pide procesador, memoria y almacenamiento; un televisor,
 * pulgadas y resolución. Esta pantalla mantiene esas listas.
 *
 * La paginación y los filtros los hace el SERVIDOR (como en marcas): la
 * rejilla sólo tiene las filas de la página, así que filtrar aquí buscaría
 * dentro de quince.
 *
 * El filtro por categoría es aparte del buscador porque es el que de verdad
 * se usa: se trabaja categoría por categoría, y para elegirla se abre el
 * mismo árbol que en el producto.
 */
@Component({
  selector: 'app-allCaracteristicas',
  templateUrl: './allCaracteristicas.component.html',
  styleUrls: ['./allCaracteristicas.component.css'],
  standalone: true,
  imports: [
    CommonModule, FormsModule, AgGridModule, NgScrollbarModule, PanelComponent,
    CampoBusquedaPaginacionComponent, FileTreeNodeComponent,
  ],
})
export class AllCaracteristicasComponent implements OnInit, OnDestroy {

  public titulo = 'Características';
  public accesoModel: AccesoModel;

  // ---------- ag-Grid ----------
  public gridApi!: GridApi;
  private gridColumnApi!: ColumnApi;
  public columnDefs: any[] = [];
  public caracteristicaModel: any[] = [];
  public selectedRow: any = null;

  /** La columna del asa: se enseña sólo cuando se puede reordenar. */
  private readonly COLUMNA_ASA = 'arrastrar';
  /** Hay una columna ordenada por la cabecera: entonces lo que se ve no es el orden. */
  private hayOrdenDeColumna = false;
  /** Los guardados de orden van uno detrás de otro, no a la vez. */
  private guardandoOrden: Promise<void> = Promise.resolve();

  /** Las inactivas se ven apagadas, como en las demás rejillas. */
  public rowClassRules = {
    'fila-inactiva': (p: any) => p.data?.activo === false,
  };

  // ---------- Paginación en servidor ----------
  public paginaActual = 1;
  public totalRegistros = 0;
  public registrosPorPagina = 15;
  public ultimaPagina = 1;

  // ---------- Búsqueda y filtros ----------
  @ViewChild(CampoBusquedaPaginacionComponent) campoBusquedaPaginacion!: CampoBusquedaPaginacionComponent;
  public searchTerm = '';

  // ---------- LATERAL: EL ÁRBOL DE CATEGORÍAS ----------
  //
  // Antes esto era un botón que abría el selector en un modal. Se trabaja
  // categoría por categoría, así que el árbol se queda a la vista: se
  // pulsa una rama y la rejilla de la derecha enseña lo suyo.

  /** El árbol tal cual se pinta (puede venir filtrado por el buscador). */
  public nodes: FileTreeNode[] = [];
  /** El árbol entero, sin filtrar: es el que guarda el estado. */
  private originalNodes: FileTreeNode[] = [];
  /** Las categorías tal como las manda el servidor (planas, con nivel). */
  private categorias: any[] = [];
  /** Las ramas abiertas. */
  private readonly abiertos = new Set<number>();
  public searchQuery = '';
  public recargandoArbol = false;

  /** Cuántas características tiene cada categoría ELLA SOLA. */
  private cuantasPropias = new Map<number, number>();
  /** Y cuántas contando las de todo lo que le cuelga (lo de la chapita). */
  private cuantasRama = new Map<number, number>();

  /** El nodo de «todas»: la rejilla sin filtrar. */
  public readonly NODO_TODAS = 0;

  /** Qué categoría se está mirando; 0 = todas. */
  public seleccionId: number = this.NODO_TODAS;
  /** La ruta de la categoría elegida, para la cabecera de la derecha. */
  public categoriaFiltroRuta = '';

  /** Lo que de verdad se le manda al servidor (null = todas). */
  public get categoriaFiltro(): number | null {
    return this.seleccionId === this.NODO_TODAS ? null : this.seleccionId;
  }

  // ---------- El divisor, igual que en usuariosGrupos ----------
  public mobileSidebarToggled = false;
  public readonly ANCHO_LATERAL_DEFECTO = 280;
  private readonly ANCHO_LATERAL_MIN = 180;
  private readonly ANCHO_LATERAL_MAX = 640;
  private readonly CLAVE_ANCHO_LATERAL = 'miCRM3.allCaracteristicas.anchoLateral';
  public anchoLateral = this.leerAnchoLateral();
  public redimensionando = false;

  /**
   * Las columnas que llevan filtro, y de qué tipo.
   *
   * Tiene que decir lo mismo que la lista blanca de CaracteristicaController:
   * lo que no esté allí se tira en el servidor, así que ponerlo sólo aquí
   * sería pintar un filtro que no filtra.
   */
  private readonly COLUMNAS_FILTRABLES: { [campo: string]: 'texto' | 'numero' } = {
    id: 'numero', orden: 'numero', num_productos: 'numero',
    nombre: 'texto', categoria_ruta: 'texto', estado: 'texto',
    created_by: 'texto', updated_by: 'texto',
    // Las fechas, como texto sobre lo que se ve: «2026-10» busca el mes
    created_at: 'texto', updated_at: 'texto',
  };

  public filtrosColumna: any = {};
  private limpiando = false;

  /** Para no pisar una petición con otra al encender/apagar deprisa. */
  private readonly activoEnVuelo = new Set<number>();
  /** Lo mismo para la palanca de «Requerida»: son dos columnas distintas. */
  private readonly requeridoEnVuelo = new Set<number>();

  private unsubscribe$ = new Subject<void>();
  private readonly timeoutIds = new Set<any>();

  public isLoading$ = this._loadingService.isLoading$;

  /** El temporizador que agrupa los muchos avisos de un redimensionado. */
  private resizeTimeoutId: any = null;

  @HostListener('window:resize')
  onResize(): void { this.ajustarGrid(); }

  constructor(
    private host: ElementRef<HTMLElement>,
    private modal: NgbModal,
    private route: Router,
    private activeRoute: ActivatedRoute,
    public _appAgGridService: AppAgGridService,
    private _loadingService: LoadingService,
    private _toastr: ToastrService,
    private _seguridadService: SeguridadService,
    private _caracteristicaService: CaracteristicaService,
    private _categoriaService: CategoriaService,
  ) {
    this.accesoModel = this.activeRoute.snapshot.data['access'];
  }

  ngOnInit(): void {
    this.initializeGrid();
    this.cargarArbol();
    this.allCaracteristicas();
  }

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
    this.timeoutIds.forEach(id => clearTimeout(id));
    this.timeoutIds.clear();
    if (this.resizeTimeoutId) { clearTimeout(this.resizeTimeoutId); }
    this.modal.dismissAll();
  }

  /** setTimeout que se limpia solo al destruir la pantalla. */
  private programar(fn: () => void, ms: number): void {
    const id = setTimeout(() => { this.timeoutIds.delete(id); fn(); }, ms);
    this.timeoutIds.add(id);
  }

  /** Suscribe al @Output de un modal y corta al cerrarse o al destruir la pantalla. */
  private escucharModal<T>(modalRef: NgbModalRef, salida: EventEmitter<T>, alEmitir: (valor: T) => void): void {
    const modalCerrado$ = from(modalRef.result).pipe(catchError(() => of(null)));
    salida
      .pipe(takeUntil(merge(this.unsubscribe$, modalCerrado$)))
      .subscribe({ next: alEmitir, error: (err) => console.error('Error en el modal:', err) });
  }

  fun_home(): void { this.route.navigate(['/inventarios']); }

  public get desde(): number {
    return this.totalRegistros === 0 ? 0 : (this.paginaActual - 1) * this.registrosPorPagina + 1;
  }
  public get hasta(): number {
    return Math.min(this.paginaActual * this.registrosPorPagina, this.totalRegistros);
  }

  // ================================================================
  // AG-GRID
  // ================================================================

  /** Las columnas con su filtro de cabecera (el cómo vive en AppAgGridService). */
  private conFiltros(columnas: any[]): any[] {
    return this._appAgGridService.filtrosDeServidor(columnas, this.COLUMNAS_FILTRABLES);
  }

  initializeGrid(): void {
    this.columnDefs = this.conFiltros([
      {
        // El asa de arrastrar, en columna propia y estrecha: puesta sobre el
        // Id, el icono se pega al número y no se ve que sea un agarre.
        // Nace escondida porque al entrar se está en «Todas las categorías»,
        // donde no hay un orden que tocar (ver `puedeOrdenar`).
        headerName: '', field: this.COLUMNA_ASA, colId: this.COLUMNA_ASA,
        rowDrag: true, hide: true,
        minWidth: 34, maxWidth: 34,
        sortable: false, filter: false, resizable: false, suppressMenu: true,
        cellClass: 'celda-asa',
        headerTooltip: 'Arrastre una fila para cambiarla de sitio dentro de su categoría',
      },
      {
        headerName: 'Orden', field: 'orden',
        headerTooltip: 'En qué posición se pide dentro de su categoría',
        cellStyle: { textAlign: 'center' }, minWidth: 90, maxWidth: 110,
      },

      {
        // La casilla de activo: se atiende por data-accion en onCellClicked,
        // igual que en el árbol de categorías.
        headerName: 'Activa', field: 'activo',
        cellStyle: { textAlign: 'center' }, minWidth: 90, maxWidth: 100,
        sortable: false, filter: false,
        cellRenderer: (p: any) => `
          <span class="carac-activo" data-accion="activo"
                title="${p.value ? 'Desactivar' : 'Activar'} esta característica">
            <i class="fa ${p.value ? 'fa-toggle-on text-teal' : 'fa-toggle-off text-muted'}"></i>
          </span>`,
      },

      {
        // La otra palanca: «Activa» dice si se pide, «Requerida» si el
        // producto se puede guardar sin ella. Se atiende por data-accion,
        // igual que la de activo.
        headerName: 'Requerida', field: 'requerido',
        headerTooltip: 'Si está marcada, el producto de esa categoría no se puede guardar sin rellenarla',
        cellStyle: { textAlign: 'center' }, minWidth: 110, maxWidth: 120,
        // Sin filtro de cabecera, igual que «Activa»: se pulsa, no se filtra
        sortable: false, filter: false,
        cellRenderer: (p: any) => `
          <span class="carac-activo" data-accion="requerido"
                title="${p.value ? 'Dejar de exigirla' : 'Exigirla al guardar el producto'}">
            <i class="fa ${p.value ? 'fa-asterisk text-danger' : 'fa-minus text-muted'}"></i>
          </span>`,
      },

      {
        headerName: 'Id', field: 'id',
        cellStyle: { textAlign: 'center' }, minWidth: 80, maxWidth: 90,
      },
      {
        headerName: 'Característica', field: 'nombre',
        cellStyle: { textAlign: 'left', fontWeight: '600' }, minWidth: 180, maxWidth: 320,
      },
      {
        headerName: 'Productos', field: 'num_productos',
        headerTooltip: 'Productos que la tienen rellena',
        cellStyle: { textAlign: 'center' }, minWidth: 110, maxWidth: 130,
      },
      {
        headerName: 'Categoría', field: 'categoria_ruta',
        headerTooltip: 'La rama entera: hay dos «Accesorios» en el árbol',
        cellStyle: { textAlign: 'left' }, minWidth: 220, maxWidth: 460,
        tooltipField: 'categoria_ruta',
      },
      {
        headerName: 'ACCIONES', field: 'actions',
        pinned: 'right', minWidth: 150, maxWidth: 150,
        sortable: false, resizable: false, filter: false, suppressMenu: true,
        cellStyle: { display: 'flex', justifyContent: 'center', alignItems: 'center' },
        // HTML suelto con data-accion en vez de un componente renderer: son
        // cuatro botones sin estado y así no hay un componente por fila.
        cellRenderer: () => `
          <span class="carac-acciones">
            <button type="button" class="btn btn-sm btn-ver"     data-accion="ver"      title="Ver"><i class="fa fa-eye"></i></button>
            <button type="button" class="btn btn-sm btn-editar"  data-accion="editar"   title="Modificar"><i class="fa fa-pen-to-square"></i></button>
            <button type="button" class="btn btn-sm btn-clonar"  data-accion="clonar"   title="Clonar"><i class="fa fa-copy"></i></button>
            <button type="button" class="btn btn-sm btn-borrar"  data-accion="eliminar" title="Enviar a la papelera"><i class="fa fa-trash"></i></button>
          </span>`,
      },
    ]);
  }

  onGridReady(params: GridReadyEvent): void {
    this.gridApi = params.api;
    this.gridColumnApi = params.columnApi;
    this._appAgGridService.ajustarTamanoGrid(this.gridApi);
    this.ajustarAlturaGrid();
    this.actualizarAsas();
  }

  /** Anchos y alto, agrupando los avisos seguidos del redimensionado. */
  ajustarGrid(): void {
    if (!this.gridApi) { return; }
    if (this.resizeTimeoutId) { clearTimeout(this.resizeTimeoutId); }
    this.resizeTimeoutId = setTimeout(() => {
      this._appAgGridService.ajustarTamanoGrid(this.gridApi);
      this.ajustarAlturaGrid();
    }, 100);
  }

  /**
   * La rejilla llega hasta el final de la ventana.
   *
   * El .css le da 360px, que es sólo un valor de arranque: con eso el panel
   * acababa a media pantalla y debajo quedaba un hueco gris. El alto de
   * verdad depende de dónde empiece la rejilla, que cambia con la barra de
   * herramientas y la miga de pan, así que se mide y se pone aquí. Los 60px
   * de abajo son los controles de paginación. Calcado de allMarcas.
   */
  ajustarAlturaGrid(): void {
    const rejilla = this.host.nativeElement.querySelector('.ag-theme-alpine') as HTMLElement;
    if (!rejilla || !this.gridApi) { return; }

    const MARGEN_INFERIOR = 60;
    const disponible = window.innerHeight - rejilla.getBoundingClientRect().top - MARGEN_INFERIOR;
    rejilla.style.height = `${disponible}px`;
    this.gridApi.sizeColumnsToFit();
  }

  navegarConTeclado = this._appAgGridService.navegacionConFlechas();

  /** Un clic en la fila: el botón que se haya pulsado manda. */
  onCellClicked(e: CellClickedEvent): void {
    this.selectedRow = e.data;
    const origen = e.event?.target as HTMLElement | null;
    const boton = origen?.closest('[data-accion]') as HTMLElement | null;
    if (!boton || !e.data) { return; }

    switch (boton.dataset['accion']) {
      case 'activo':    this.cambiarActivo(e.data, e.node as RowNode); break;
      case 'requerido': this.cambiarRequerido(e.data, e.node as RowNode); break;
      case 'ver':      this.abrirFormulario(e.data, 'view'); break;
      case 'editar':   this.editCaracteristica(e.data); break;
      case 'clonar':   this.clonCaracteristica(e.data); break;
      case 'eliminar': this.deleteCaracteristica(e.data); break;
    }
  }

  // ================================================================
  // CAMBIAR EL ORDEN ARRASTRANDO LAS FILAS
  // ================================================================
  //
  // El orden de una categoría es el que ve después quien rellena un producto,
  // así que se cambia donde se ve: arrastrando la fila por el asa.
  //
  // Sólo se puede cuando lo que está en pantalla ES el orden: una categoría
  // elegida en el árbol, sin buscador, sin filtros de cabecera y sin ordenar
  // por una columna. Con «Todas» las filas son de categorías distintas y
  // moverlas no querría decir nada; con la lista recortada, soltar una fila
  // «encima» de otra tampoco dice dónde va de verdad.

  /** ¿Tiene sentido arrastrar ahora mismo? */
  public get puedeOrdenar(): boolean {
    return this.categoriaFiltro !== null
        && !this.searchTerm
        && this.cuantasColumnasFiltradas === 0
        && !this.hayOrdenDeColumna
        && this.caracteristicaModel.length > 1
        && this.accesoModel?.editar !== false;
  }

  /** Por qué se puede o no: es el título del icono de la barra. */
  public get pistaOrden(): string {
    if (this.accesoModel?.editar === false)   { return 'No tiene permiso para cambiar el orden'; }
    if (this.categoriaFiltro === null)        { return 'Elija una categoría en el árbol y podrá ordenar sus características arrastrándolas'; }
    if (this.searchTerm)                      { return 'Limpie el buscador para poder ordenar: lo que se ve está recortado'; }
    if (this.cuantasColumnasFiltradas > 0)    { return 'Quite los filtros de la cabecera para poder ordenar'; }
    if (this.hayOrdenDeColumna)               { return 'Quite el orden de la cabecera para poder arrastrar: así no se ve el orden de la categoría'; }
    if (this.caracteristicaModel.length < 2)  { return 'Con una sola característica no hay nada que ordenar'; }
    return 'Arrastre las filas por el asa de la izquierda para cambiar el orden';
  }

  /** Enseña o esconde la columna del asa según `puedeOrdenar`. */
  private actualizarAsas(): void {
    if (!this.gridColumnApi || !this.gridApi) { return; }

    const visible = this.gridColumnApi.getColumn(this.COLUMNA_ASA)?.isVisible() ?? false;
    if (visible === this.puedeOrdenar) { return; }   // sin cambios, no se repinta

    this.gridColumnApi.setColumnVisible(this.COLUMNA_ASA, this.puedeOrdenar);
    this._appAgGridService.ajustarTamanoGrid(this.gridApi);
  }

  /** Se ordenó por una cabecera: lo que se ve ya no es el orden de la categoría. */
  onOrdenColumna(): void {
    this.hayOrdenDeColumna = (this.gridColumnApi?.getColumnState() ?? []).some((c: any) => !!c.sort);
    this.actualizarAsas();
  }

  /**
   * Se soltó una fila en otro sitio.
   *
   * Con rowDragManaged la rejilla ya la movió en SU modelo; aquí se lee ese
   * orden nuevo (es el único sitio donde está: el array sigue como estaba),
   * se renumera y se manda al servidor.
   */
  onFilaArrastrada(): void {
    if (!this.puedeOrdenar || !this.gridApi) { return; }

    const enPantalla: any[] = [];
    this.gridApi.forEachNode(nodo => { if (nodo.data) { enPantalla.push(nodo.data); } });
    if (enPantalla.length !== this.caracteristicaModel.length) { return; }

    const ids = enPantalla.map(c => Number(c.id));
    if (ids.every((id, i) => id === Number(this.caracteristicaModel[i]?.id))) {
      return;                                   // se soltó donde ya estaba
    }

    // Los MISMOS números de orden que ya ocupaban estas filas, repartidos en
    // el orden nuevo. Es lo que hace el servidor, así que la columna «Orden»
    // no se queda esperando a la respuesta; y como sólo se reparte lo que ya
    // había, reordenar una página no se mete en el sitio de otra.
    const numeros = this.caracteristicaModel.map(c => Number(c.orden)).sort((a, b) => a - b);
    const nuevas = enPantalla.map((c, i) => ({ ...c, orden: numeros[i] }));

    // setData fila a fila y no setRowData: la rejilla ya está pintada en el
    // orden bueno y recargarla entera hace parpadear lo que se acaba de
    // soltar. Además, en ag-Grid 28 cambiar el objeto en sitio no repinta.
    let i = 0;
    this.gridApi.forEachNode(nodo => {
      const nueva = nuevas[i++];
      if (nueva && nodo.data?.orden !== nueva.orden) { nodo.setData(nueva); }
    });
    this.caracteristicaModel = nuevas;

    this.guardarOrden(ids);
  }

  /**
   * Manda el orden nuevo.
   *
   * Los guardados se encadenan: dos arrastres seguidos no pueden llegar al
   * revés y dejar guardado el primero. Si falla, se recarga la página desde
   * el servidor para que la rejilla no se quede enseñando un orden que no
   * llegó a guardarse.
   */
  private guardarOrden(ids: number[]): void {
    const pagina = this.paginaActual;

    this.guardandoOrden = this.guardandoOrden.then(async () => {
      try {
        const res: any = await firstValueFrom(this._caracteristicaService.ordenarCaracteristicas(ids));

        if (res?.status !== 'success') {
          throw new Error(res?.message || 'No se pudo guardar el orden');
        }
        this._toastr.success(res?.message || 'Orden guardado', 'Características');

      } catch (error: any) {
        console.error('Error al guardar el orden de las características:', error);

        // Si vino del servidor, el AuthInterceptor ya sacó su aviso: aquí
        // sólo se avisa de lo que el usuario no ve, que es que lo que tiene
        // delante no es lo guardado.
        if (typeof error?.status !== 'number') {
          this._toastr.error(error?.message || 'El orden no se guardó', 'Características');
        }
        await this.allCaracteristicas(pagina);
      }
    });
  }

  // ================================================================
  // FILTROS
  // ================================================================

  get cuantasColumnasFiltradas(): number {
    return Object.keys(this.filtrosColumna || {}).length;
  }

  get hayFiltro(): boolean {
    return !!this.searchTerm || this.cuantasColumnasFiltradas > 0 || this.categoriaFiltro !== null;
  }

  /**
   * Lo que pone la rejilla cuando no hay ninguna fila.
   *
   * La chapita del árbol cuenta LA RAMA, así que un padre puede decir 10 y
   * no tener ninguna suya. Sin esto, la rejilla contestaría «todavía no
   * tiene características» y parecería que una de las dos miente.
   */
  public get mensajeSinFilas(): string {
    if (this.categoriaFiltro === null || this.searchTerm || this.cuantasColumnasFiltradas > 0) {
      return 'No hay características que cumplan el filtro';
    }

    const enHijas = (this.cuantasRama.get(this.categoriaFiltro) ?? 0)
                  - (this.cuantasPropias.get(this.categoriaFiltro) ?? 0);

    return enHijas > 0
      ? `Esta categoría no tiene características propias. Sus subcategorías tienen ${enHijas}: elíjalas en el árbol`
      : 'Esta categoría todavía no tiene características. Créelas con el botón +';
  }

  /** La cabecera pidió otra cosa: se vuelve a la página 1 y se recarga. */
  onFiltroColumna(): void {
    if (this.limpiando) { return; }
    this.filtrosColumna = this.gridApi?.getFilterModel() ?? {};
    this.allCaracteristicas(1);
  }

  onFilterTextBoxChanged(term?: string): void {
    this.searchTerm = (term ?? '').trim();
    this.allCaracteristicas(1);
  }

  /** La × del buscador: una sola pasada y una sola recarga. */
  clearAllFilters(): void {
    if (!this.hayFiltro) { return; }

    const habiaColumnas = this.cuantasColumnasFiltradas > 0;
    this.limpiando = true;
    this.searchTerm = '';
    this.filtrosColumna = {};
    // La categoría NO se toca aquí: es el árbol de la izquierda, no un
    // filtro de la barra. Quitarla al limpiar el buscador sacaría al
    // usuario de la rama en la que está trabajando.
    this.campoBusquedaPaginacion?.reset();
    if (habiaColumnas) { this.gridApi?.setFilterModel(null); }

    // La bandera se baja en la siguiente vuelta: ag-Grid avisa del cambio de
    // filtros DESPUÉS de esta línea y si no entraría con ella ya baja.
    this.programar(() => { this.limpiando = false; }, 0);

    this.allCaracteristicas(1);
  }

  // ================================================================
  // EL ÁRBOL DE CATEGORÍAS
  // ================================================================

  /**
   * Trae el árbol entero y cuántas características tiene cada rama.
   *
   * Son dos llamadas y no una por categoría: 28 categorías serían 28
   * viajes para pintar unos contadores.
   */
  async cargarArbol(): Promise<void> {
    try {
      this.recargandoArbol = true;

      const [arbol, todas]: any[] = await Promise.all([
        firstValueFrom(this._categoriaService.allCategorias(false)),
        firstValueFrom(this._caracteristicaService.listCaracteristicas(null, false)),
      ]);

      this.categorias = arbol?.body?.data ?? [];

      // Cuántas tiene cada categoría, para la chapita del nodo
      const cuantas = new Map<number, number>();
      for (const k of (todas?.data ?? [])) {
        cuantas.set(k.categoria_id, (cuantas.get(k.categoria_id) ?? 0) + 1);
      }
      this.construirArbol(cuantas);
    } catch (error) {
      // El AuthInterceptor ya enseña el error HTTP
      console.error('Error al cargar el árbol de categorías:', error);
      this.categorias = [];
      this.construirArbol(new Map());
    } finally {
      this.recargandoArbol = false;
    }
  }

  /**
   * Lo de cada categoría SUBIDO por su rama: lo propio más lo de todo lo que
   * le cuelga.
   *
   * Es lo que se pinta en la chapita. Un nodo que sólo agrupa («Línea
   * Blanca») no tiene características suyas, y con la cuenta propia salía
   * siempre un 0 que hacía creer que por ahí no había nada.
   */
  private sumarALosPadres(cuantas: Map<number, number>): Map<number, number> {
    const padres = new Map<number, number | null>();
    for (const c of this.categorias) { padres.set(c.id, c.padre_id ?? null); }

    const totales = new Map<number, number>();
    for (const c of this.categorias) { totales.set(c.id, cuantas.get(c.id) ?? 0); }

    for (const c of this.categorias) {
      const propias = cuantas.get(c.id) ?? 0;
      if (!propias) { continue; }

      // Se sube por la rama hasta la raíz. El `vistos` es por si los datos
      // trajeran un ciclo (una categoría que acabe siendo su propia abuela):
      // subir sin fin colgaría la pantalla.
      const vistos = new Set<number>([c.id]);
      let p = padres.get(c.id) ?? null;
      while (p !== null && !vistos.has(p)) {
        vistos.add(p);
        totales.set(p, (totales.get(p) ?? 0) + propias);
        p = padres.get(p) ?? null;
      }
    }
    return totales;
  }

  /** Lista plana (padre antes que hijo) -> árbol, con «Todas» por encima. */
  private construirArbol(cuantas: Map<number, number>): void {
    const nodos = new Map<number, FileTreeNode>();
    const raices: FileTreeNode[] = [];

    // La chapita enseña LA RAMA ENTERA; el detalle de qué es suyo y qué de
    // sus hijas va en el título, que es donde se puede explicar.
    const totales = this.sumarALosPadres(cuantas);
    this.cuantasPropias = cuantas;
    this.cuantasRama = totales;

    for (const c of this.categorias) {
      const propias = cuantas.get(c.id) ?? 0;
      const rama = totales.get(c.id) ?? 0;
      const enHijas = rama - propias;

      nodos.set(c.id, {
        id: c.id,
        nombre: c.nombre,
        tipo: 0,
        escarpeta: true,
        // Las que sólo agrupan llevan otro icono: ahí no cuelgan productos,
        // aunque sí pueden tener características definidas.
        icono: c.es_transaccion === false ? 'fa fa-layer-group' : 'fa fa-box',
        color: c.activo === false ? 'var(--bs-secondary-color, #6c757d)' : undefined,
        badge: rama,
        titulo: [c.ruta,
                 enHijas > 0
                   ? `${rama} en la rama: ${propias} suya(s) y ${enHijas} en sus subcategorías`
                   : `${propias} característica(s)`,
                 c.activo === false ? '(inactiva)' : ''].filter(Boolean).join(' — '),
        isOpen: this.abiertos.has(c.id),
        isSelected: this.seleccionId === c.id,
      });
    }

    for (const c of this.categorias) {
      const n = nodos.get(c.id)!;
      const padre = c.padre_id ? nodos.get(c.padre_id) : undefined;
      if (padre) { (padre.children ??= []).push(n); } else { raices.push(n); }
    }

    const todas: FileTreeNode = {
      id: this.NODO_TODAS,
      nombre: 'Todas las categorías',
      tipo: 0,
      escarpeta: true,
      icono: 'fa fa-list-check',
      color: 'var(--bs-app-theme, #00acac)',
      badge: [...cuantas.values()].reduce((a, b) => a + b, 0),
      titulo: 'Todas las características, de cualquier categoría',
      isOpen: this.abiertos.has(this.NODO_TODAS) || this.abiertos.size === 0,
      isSelected: this.seleccionId === this.NODO_TODAS,
      children: raices.length ? raices : undefined,
    };

    this.originalNodes = [todas];
    this.nodes = filtrarArbol(this.originalNodes, this.searchQuery);
  }

  /** Se pulsó una rama: la rejilla pasa a enseñar lo suyo. */
  onNodeSelect(node: FileTreeNode): void {
    this.seleccionar(node.id);
    this.mobileSidebarToggled = false;
  }

  seleccionar(id: number): void {
    this.seleccionId = id;
    recorrer(this.originalNodes, n => n.isSelected = n.id === id);
    recorrer(this.nodes, n => n.isSelected = n.id === id);

    // Se abre el camino hasta ella, para que se vea dónde está
    let c = this.categorias.find(x => x.id === id);
    while (c) {
      this.abiertos.add(c.id);
      c = c.padre_id ? this.categorias.find(x => x.id === c.padre_id) : null;
    }
    this.abiertos.add(this.NODO_TODAS);
    const real = buscarNodo(this.originalNodes, id);
    if (real?.children) { real.isOpen = true; }

    const cat = this.categorias.find(x => x.id === id);
    this.categoriaFiltroRuta = cat ? (cat.ruta || cat.nombre) : '';

    this.selectedRow = null;
    this.allCaracteristicas(1);
  }

  onNodeToggle(node: FileTreeNode): void {
    if (node.isOpen) { this.abiertos.add(node.id); } else { this.abiertos.delete(node.id); }
    const real = buscarNodo(this.originalNodes, node.id);
    if (real) { real.isOpen = node.isOpen; }
  }

  expandirTodo(): void {
    recorrer(this.originalNodes, n => { if (n.children) { n.isOpen = true; this.abiertos.add(n.id); } });
    this.nodes = filtrarArbol(this.originalNodes, this.searchQuery);
  }

  contraerTodo(): void {
    recorrer(this.originalNodes, n => { n.isOpen = false; });
    this.abiertos.clear();
    // «Todas» se queda abierta: si no, el árbol desaparece entero
    const todas = buscarNodo(this.originalNodes, this.NODO_TODAS);
    if (todas) { todas.isOpen = true; this.abiertos.add(this.NODO_TODAS); }
    this.nodes = filtrarArbol(this.originalNodes, this.searchQuery);
  }

  filterNodes(): void { this.nodes = filtrarArbol(this.originalNodes, this.searchQuery); }

  limpiarBusquedaArbol(): void { this.searchQuery = ''; this.filterNodes(); }

  toggleMobileSidebar(): void { this.mobileSidebarToggled = !this.mobileSidebarToggled; }

  // ---------- El divisor ----------

  /**
   * Arrastrar el divisor cambia el ancho del árbol.
   *
   * Con captura del puntero: si no, al mover deprisa el ratón se sale del
   * divisor y el arrastre se queda a medias. Calcado de usuariosGrupos.
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
      this.anchoLateral = Math.min(this.ANCHO_LATERAL_MAX,
                                   Math.max(this.ANCHO_LATERAL_MIN, Math.round(nuevo)));
    };
    const soltar = (e: PointerEvent) => {
      divisor.removeEventListener('pointermove', mover);
      divisor.removeEventListener('pointerup', soltar);
      divisor.removeEventListener('pointercancel', soltar);
      divisor.releasePointerCapture(e.pointerId);
      this.redimensionando = false;
      this.guardarAnchoLateral();
      this.ajustarGrid();
    };
    divisor.addEventListener('pointermove', mover);
    divisor.addEventListener('pointerup', soltar);
    divisor.addEventListener('pointercancel', soltar);
  }

  guardarAnchoLateral(): void {
    try { localStorage.setItem(this.CLAVE_ANCHO_LATERAL, String(this.anchoLateral)); }
    catch { /* ventana privada o almacenamiento bloqueado */ }
  }

  private leerAnchoLateral(): number {
    try {
      const guardado = Number(localStorage.getItem('miCRM3.allCaracteristicas.anchoLateral'));
      return Number.isFinite(guardado) && guardado >= 180 && guardado <= 640 ? guardado : 280;
    } catch { return 280; }
  }

  // ================================================================
  // DATOS
  // ================================================================

  /** Pide una página al servidor y la vuelca en la rejilla. */
  async allCaracteristicas(page: number = 1): Promise<void> {
    try {
      this._loadingService.setLoading(true);

      const res: any = await firstValueFrom(
        this._caracteristicaService.allCaracteristicas(
          page, this.registrosPorPagina, this.searchTerm, this.categoriaFiltro, this.filtrosColumna)
      );

      if (res.body?.status !== 'success') {
        this._toastr.error(res.body?.message || 'No se pudo obtener el listado', 'Error');
        this.caracteristicaModel = [];
        this.totalRegistros = 0;
        this.ultimaPagina = 1;
        this.gridApi?.setRowData([]);
        return;
      }

      this.caracteristicaModel = res.body?.data?.data || [];

      if (res.body?.data?.meta) {
        this.totalRegistros = res.body.data.meta.total;
        this.registrosPorPagina = res.body.data.meta.per_page;
        this.paginaActual = res.body.data.meta.current_page;
        this.ultimaPagina = res.body.data.meta.last_page;
      }

      this.gridApi?.setRowData(this.caracteristicaModel);

    } catch (error) {
      // El AuthInterceptor ya muestra el toast del error HTTP
      console.error('Error al cargar las características:', error);
      this.caracteristicaModel = [];
      this.totalRegistros = 0;
      this.ultimaPagina = 1;
      this.gridApi?.setRowData([]);
    } finally {
      this._loadingService.setLoading(false);
      // El asa sale o se esconde según lo que haya quedado en pantalla
      this.actualizarAsas();
    }
  }

  // ================================================================
  // ACCIONES
  // ================================================================

  private abrirFormulario(registro: any, accion: string): NgbModalRef {
    const modalRef = this.modal.open(SaveCaracteristicaComponent, {
      size: 'lg', centered: true, backdrop: 'static', keyboard: false,
    });
    modalRef.componentInstance.registro_selected = registro;
    modalRef.componentInstance.accion = accion;
    // Si la pantalla está filtrada por categoría, la nueva nace en ella
    modalRef.componentInstance.categoriaId = this.categoriaFiltro;
    return modalRef;
  }

  addCaracteristica(): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.abrirFormulario(0, 'add');
    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, () => this.allCaracteristicas(1));
  }

  clonCaracteristica(registro: any): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.abrirFormulario(registro, 'clon');
    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, () => this.allCaracteristicas(this.paginaActual));
  }

  /** Al guardar sustituye la fila en sitio: no hace falta volver al servidor. */
  editCaracteristica(registro: any): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.abrirFormulario(registro, 'edit');
    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, (actualizado: any) => {
      const i = this.caracteristicaModel.findIndex(r => r.id === actualizado.id);
      if (i === -1) { return; }
      this.caracteristicaModel[i] = actualizado;
      this.gridApi?.getRowNode(i.toString())?.setData(actualizado);
    });
  }

  deleteCaracteristica(registro: any): void {
    if (this._seguridadService.isexpired()) { return; }
    if (this.accesoModel?.eliminar === false) {
      this._toastr.warning('No tiene permiso para eliminar', 'Acceso denegado');
      return;
    }

    const modalRef = this.modal.open(DeleteCaracteristicaComponent, { centered: true, backdrop: 'static' });
    modalRef.componentInstance.registro_selected = registro;
    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, () => this.allCaracteristicas(this.paginaActual));
  }

  /** La casilla de Activa: enciende o apaga sin salir de la rejilla. */
  cambiarActivo(fila: any, nodo?: RowNode | null): void {
    if (!fila) { return; }
    if (this._seguridadService.isexpired()) { return; }

    this._appAgGridService.alternarActivo({
      gridApi: this.gridApi,
      filas: this.caracteristicaModel,
      fila, nodo,
      campo: 'activo',
      enVuelo: this.activoEnVuelo,
      puede: this.accesoModel?.editar !== false,
      que: 'característica',
      llamar: (id, activo) => this._caracteristicaService.activarCaracteristica(id, activo),
      nombre: (f: any) => f.nombre,
      hasta: this.unsubscribe$,
    });
  }

  /**
   * La casilla de «Requerida»: exigirla o dejar de exigirla sin abrir la ficha.
   *
   * El mismo mecanismo que la de activo —con su giro mientras guarda y su
   * vuelta atrás si falla—, pero con `campo: 'requerido'`. El servidor
   * contesta diciendo cuántos productos de esa categoría se quedan sin poder
   * guardarse, y ese mensaje es el que sale en el aviso.
   */
  cambiarRequerido(fila: any, nodo?: RowNode | null): void {
    if (!fila) { return; }
    if (this._seguridadService.isexpired()) { return; }

    this._appAgGridService.alternarActivo({
      gridApi: this.gridApi,
      filas: this.caracteristicaModel,
      fila, nodo,
      campo: 'requerido',
      enVuelo: this.requeridoEnVuelo,
      puede: this.accesoModel?.editar !== false,
      que: 'característica',
      llamar: (id, requerido) => this._caracteristicaService.requeridoCaracteristica(id, requerido),
      nombre: (f: any) => f.nombre,
      hasta: this.unsubscribe$,
    });
  }

  // ================================================================
  // PAGINACIÓN
  // ================================================================
  // Todas pasan por goToPage(), que es la única que valida el rango.

  firstPage(): void { if (this.paginaActual !== 1) { this.goToPage(1); } }
  prevPage(): void { this.goToPage(this.paginaActual - 1); }
  nextPage(): void { this.goToPage(this.paginaActual + 1); }
  lastPage(): void { if (this.paginaActual !== this.ultimaPagina) { this.goToPage(this.ultimaPagina); } }

  goToPage(page: number): void {
    if (page < 1 || page > this.ultimaPagina) { return; }
    this.allCaracteristicas(page);
  }
}
