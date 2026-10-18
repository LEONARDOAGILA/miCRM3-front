import { Component, ElementRef, EventEmitter, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Subject, firstValueFrom, from, merge, of } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';
import { CellClickedEvent, GridApi, GridReadyEvent, RowNode } from 'ag-grid-community';
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
import { ListCategoriaComponent } from '../../categorias/listCategoria/listCategoria.component';
import { CampoBusquedaPaginacionComponent } from '../../../../../components/campos/campoBusquedaPaginacion/campoBusquedaPaginacion.component';

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
  standalone: false,
})
export class AllCaracteristicasComponent implements OnInit, OnDestroy {

  public titulo = 'Características';
  public accesoModel: AccesoModel;

  // ---------- ag-Grid ----------
  public gridApi!: GridApi;
  public columnDefs: any[] = [];
  public caracteristicaModel: any[] = [];
  public selectedRow: any = null;

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

  /** El filtro por categoría (y su ruta, para enseñarla en la barra). */
  public categoriaFiltro: number | null = null;
  public categoriaFiltroRuta = '';

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
  ) {
    this.accesoModel = this.activeRoute.snapshot.data['access'];
  }

  ngOnInit(): void {
    this.initializeGrid();
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
        headerName: 'Id', field: 'id',
        cellStyle: { textAlign: 'center' }, minWidth: 80, maxWidth: 90,
      },
      {
        headerName: 'Característica', field: 'nombre',
        cellStyle: { textAlign: 'left', fontWeight: '600' }, minWidth: 180, maxWidth: 320,
      },
      {
        headerName: 'Categoría', field: 'categoria_ruta',
        headerTooltip: 'La rama entera: hay dos «Accesorios» en el árbol',
        cellStyle: { textAlign: 'left' }, minWidth: 220, maxWidth: 460,
        tooltipField: 'categoria_ruta',
      },
      {
        headerName: 'Orden', field: 'orden',
        headerTooltip: 'En qué posición se pide dentro de su categoría',
        cellStyle: { textAlign: 'center' }, minWidth: 90, maxWidth: 110,
      },
      {
        headerName: 'Productos', field: 'num_productos',
        headerTooltip: 'Productos que la tienen rellena',
        cellStyle: { textAlign: 'center' }, minWidth: 110, maxWidth: 130,
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
    this._appAgGridService.ajustarTamanoGrid(this.gridApi);
    this.ajustarAlturaGrid();
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
      case 'activo':   this.cambiarActivo(e.data, e.node as RowNode); break;
      case 'ver':      this.abrirFormulario(e.data, 'view'); break;
      case 'editar':   this.editCaracteristica(e.data); break;
      case 'clonar':   this.clonCaracteristica(e.data); break;
      case 'eliminar': this.deleteCaracteristica(e.data); break;
    }
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
    this.categoriaFiltro = null;
    this.categoriaFiltroRuta = '';
    this.campoBusquedaPaginacion?.reset();
    if (habiaColumnas) { this.gridApi?.setFilterModel(null); }

    // La bandera se baja en la siguiente vuelta: ag-Grid avisa del cambio de
    // filtros DESPUÉS de esta línea y si no entraría con ella ya baja.
    this.programar(() => { this.limpiando = false; }, 0);

    this.allCaracteristicas(1);
  }

  /** El árbol, para quedarse con una categoría. */
  elegirCategoria(): void {
    const modalRef = this.modal.open(ListCategoriaComponent, {
      size: 'lg', centered: true, backdrop: 'static',
    });
    modalRef.componentInstance.categoriaSeleccionadaId = this.categoriaFiltro;

    const sub = modalRef.componentInstance.seleccionado.subscribe((categoria: any) => {
      this.categoriaFiltro = categoria.id;
      this.categoriaFiltroRuta = categoria.ruta || categoria.nombre || '';
      this.allCaracteristicas(1);
    });
    modalRef.result.catch(() => {}).finally(() => sub.unsubscribe());
  }

  quitarCategoria(): void {
    if (this.categoriaFiltro === null) { return; }
    this.categoriaFiltro = null;
    this.categoriaFiltroRuta = '';
    this.allCaracteristicas(1);
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
