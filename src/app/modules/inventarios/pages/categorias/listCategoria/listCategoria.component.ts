import { Component, Input, OnInit, Output, EventEmitter, ViewChild, ChangeDetectionStrategy } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { GridApi, GridReadyEvent, CellClickedEvent, CellKeyDownEvent, RowClassParams } from 'ag-grid-community';
import { ToastrService } from 'ngx-toastr';

import { CategoriaModel } from '../../../interfaces/categoriaModel';
import { CategoriaService } from '../../../services/categoria.service';
import { AppAgGridService } from '../../../../../service/app-agGrid.service';
import { LoadingService } from '../../../../../service/loading.service';
import { CampoBusquedaPaginacionComponent } from '../../../../../components/campos/campoBusquedaPaginacion/campoBusquedaPaginacion.component';
import { CommonModule } from '@angular/common';
import { AgGridModule } from 'ag-grid-angular';
import { ModalArrastrableDirective } from '../../../../../components/modal/modal-arrastrable.directive';
import { FilasEstirablesDirective } from '../../../../../core/directives/filasEstirables.directive';

/**
 * Modal de selección de categoría (lo abre saveProducto para el campo
 * «Categoría»).
 *
 * Es el hermano de listMarca, con una diferencia: aquí las categorías NO son
 * una lista, son un árbol, y plano no se entiende. Hay dos «Accesorios», uno
 * cuelga de Computadores y otro de Celulares; en una lista son la misma
 * palabra dos veces.
 *
 * EL ÁRBOL SE PINTA A MANO. ag-Grid Community no trae `treeData` (es de la
 * versión de pago), así que se hace como en allCategorias: el servidor manda
 * el árbol entero ya ordenado y con `nivel`, la rejilla recibe sólo las filas
 * visibles, y una fila está visible cuando ninguna de sus antepasadas está
 * plegada. La sangría y el asa + / − van dentro de la celda del nombre.
 *
 * NO PAGINA: son 28 categorías y el árbol entero cabe de una vez. Paginarlo
 * dejaría padres fuera de la página y la sangría quedaría colgando de nada.
 * Por eso el buscador también filtra aquí y no en el servidor.
 *
 * LAS INACTIVAS SE VEN PERO NO SE PUEDEN ELEGIR, igual que en listMarca: es
 * regla de esta pantalla (fn_productos_validar sólo comprueba que exista),
 * heredada del desplegable anterior, que se llenaba con
 * listCategorias(soloActivas = true).
 *
 * Memoria: no hay suscripciones vivas (firstValueFrom completa sola), ni
 * temporizadores, ni listeners; quien lo abre corta su suscripción a
 * `seleccionado` cuando el modal se cierra.
 */
@Component({
  selector: 'app-listCategoria',
  templateUrl: './listCategoria.component.html',
  styleUrls: ['./listCategoria.component.css'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    CommonModule, AgGridModule, FilasEstirablesDirective, ModalArrastrableDirective,
    CampoBusquedaPaginacionComponent,
  ],
})
export class ListCategoriaComponent implements OnInit {

  /** Categoría ya asignada al producto, para marcarla como «Actual». */
  @Input() categoriaSeleccionadaId?: number | null;

  /** Categoría elegida. Se emite una sola vez, justo antes de cerrar. */
  @Output() seleccionado = new EventEmitter<any>();

  // ---------- ag-Grid ----------
  public gridApi!: GridApi;
  public columnDefs: any[] = [];

  /** El árbol entero, tal como lo manda el servidor. */
  public arbol: CategoriaModel[] = [];

  /** Lo que de verdad recibe la rejilla: el árbol menos las ramas cerradas. */
  public filasVisibles: CategoriaModel[] = [];

  /** Las ramas cerradas. Es de este modal: no se recuerda al cerrarlo. */
  private readonly plegadas = new Set<number>();

  /**
   * El plegado que había ANTES de buscar.
   *
   * Buscar abre el árbol entero para que ninguna coincidencia se quede
   * escondida, pero eso no puede costarle al usuario el árbol que tenía
   * montado: se aparta aquí y vuelve al quitar el filtro. Lo que se pliegue
   * CON EL FILTRO PUESTO es del filtro y se descarta con él.
   */
  private plegadasFueraDeFiltro = new Set<number>();

  /** La categoría ya asignada, y las inactivas, van con su clase. */
  public rowClassRules = {
    'fila-actual': (p: RowClassParams) =>
      this.categoriaSeleccionadaId != null && (p.data as any)?.id === this.categoriaSeleccionadaId,
    'fila-inactiva': (p: RowClassParams) => (p.data as any)?.activo === false,
    // Las que sólo agrupan: se ven, pero no se pueden elegir
    'fila-agrupa': (p: RowClassParams) => (p.data as any)?.es_transaccion === false,
  };

  // ---------- Búsqueda ----------
  @ViewChild(CampoBusquedaPaginacionComponent) campoBusquedaPaginacion!: CampoBusquedaPaginacionComponent;
  public searchTerm: string = '';

  public isLoading$ = this._loadingService.isLoading$;

  constructor(
    public modal: NgbActiveModal,
    private _categoriaService: CategoriaService,
    private _toastr: ToastrService,
    public _appAgGridService: AppAgGridService,
    private _loadingService: LoadingService
  ) {}

  ngOnInit(): void {
    this.initializeGrid();
    this.cargarArbol();
  }

  /** Cuántas se están viendo, para decirlo debajo de la rejilla. */
  public get cuantasVisibles(): number { return this.filasVisibles.length; }
  public get cuantasTotal(): number { return this.arbol.length; }

  /** Para encender o apagar los botones de plegar. */
  public get hayPlegadas(): boolean { return this.plegadas.size > 0; }


  // ================================================================
  // AG-GRID
  // ================================================================

  initializeGrid(): void {
    this.columnDefs = [
      {
        headerName: 'ID', field: 'id',
        cellStyle: { textAlign: 'center' }, minWidth: 70, maxWidth: 70,
      },
      {
        headerName: 'Categoría', field: 'nombre',
        cellStyle: { textAlign: 'left' }, minWidth: 220, flex: 1,
        // La ruta completa en el título: con dos «Accesorios» en el árbol,
        // el nombre a secas no basta para saber cuál es cuál.
        tooltipValueGetter: (p: any) => p.data?.ruta || p.value,
        cellRenderer: (p: any) => this.celdaNombre(p),
      },
      {
        headerName: 'Productos', field: 'num_productos',
        headerTooltip: 'Productos que ya usan esta categoría',
        cellStyle: { textAlign: 'center' }, minWidth: 90, maxWidth: 110,
      },
      {
        headerName: 'Estado', field: 'activo',
        cellStyle: { textAlign: 'center' }, minWidth: 90, maxWidth: 110,
        sortable: false,
        cellRenderer: (p: any) => p.value
          ? '<span class="badge bg-teal fs-10px">ACTIVA</span>'
          : '<span class="badge bg-danger fs-10px" title="No se puede asignar">INACTIVA</span>',
      },
      // Columna «Ir»: sólo indica que la fila se puede elegir
      {
        headerName: 'Ir', field: 'seleccionar', pinned: 'right',
        minWidth: 60, maxWidth: 60,
        cellStyle: { display: 'flex', justifyContent: 'center', alignItems: 'center' },
        sortable: false, resizable: false, filter: false, suppressHeaderMenuButton: true,
        cellRenderer: (p: any) => {
          if (p.data?.es_transaccion === false) {
            return `<span class="lista-ir lista-ir--agrupa" title="Sólo agrupa: elija una de las de dentro">
                      <i class="fas fa-layer-group"></i>
                    </span>`;
          }
          if (p.data?.activo === false) {
            return `<span class="lista-ir lista-ir--no" title="Categoría inactiva: no se puede asignar">
                      <i class="fas fa-ban"></i>
                    </span>`;
          }
          return `<span class="lista-ir" title="Elegir esta categoría">
                    <i class="fas fa-arrow-right"></i>
                  </span>`;
        },
      },
    ];
  }

  /**
   * La celda de «Categoría»: sangría + asa + nombre.
   *
   * Calcada de allCategorias. La sangría va en píxeles y no con `&nbsp;`:
   * con espacios el ancho depende de la fuente y deja de alinearse al
   * cambiar de tema. La etiqueta «Actual» marca la que ya tiene el producto.
   */
  private celdaNombre(params: any): string {
    const d: any = params.data;
    const nivel = Math.max(0, Number(d?.nivel ?? 0));
    const hijos = Number(d?.num_hijos ?? 0);

    const sangria = `<span class="cat-sangria" style="width:${nivel * 16}px"></span>`;

    const asa = (hijos > 0)
      ? `<button type="button" class="cat-asa" data-accion="plegar"
                 title="${this.plegadas.has(d.id) ? 'Desplegar' : 'Contraer'} esta rama"
                 aria-label="${this.plegadas.has(d.id) ? 'Desplegar' : 'Contraer'}">
           <i class="fa fa-${this.plegadas.has(d.id) ? 'plus' : 'minus'}"></i>
         </button>`
      : `<span class="cat-asa cat-asa--hueco"></span>`;

    // El nombre ESCAPADO: lo escribe un usuario y acaba dentro de una cadena
    // de HTML, así que sin esto un `<` en el nombre rompe la celda.
    const texto = String(params.value ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const actual = d?.id === this.categoriaSeleccionadaId
      ? ' <span class="lista-actual">Actual</span>'
      : '';

    return `<span class="cat-nombre">${sangria}${asa}<span>${texto}</span>${actual}</span>`;
  }

  onGridReady(params: GridReadyEvent): void {
    this.gridApi = params.api;
    this.gridApi.setGridOption('rowData', this.filasVisibles);
    this._appAgGridService.ajustarTamanoGrid(this.gridApi);
  }

  /** ↑ / ↓ mueven la selección (ver AppAgGridService.navegacionConFlechas). */
  navegarConTeclado = this._appAgGridService.navegacionConFlechas();

  /** Enter sobre la fila enfocada = elegirla, igual que el clic. */
  onCellKeyDown(event: CellKeyDownEvent): void {
    if ((event.event as KeyboardEvent)?.key === 'Enter') {
      this.onCellClicked(event as unknown as CellClickedEvent);
    }
  }

  /**
   * Un clic en la fila elige la categoría... salvo que sea en el asa, que
   * abre o cierra la rama. El asa está DENTRO de la celda del nombre, así
   * que sin esta comprobación plegar una rama elegiría esa categoría y
   * cerraría el modal.
   */
  onCellClicked(event: CellClickedEvent): void {
    if (!event.data) { return; }

    const origen = event.event?.target as HTMLElement | null;
    if (origen?.closest('[data-accion="plegar"]')) {
      this.alternarPlegado(event.data as any);
      return;
    }

    // LAS QUE AGRUPAN NO SE ELIGEN. No se esconden porque son las que
    // sostienen el árbol: sin «Tecnología» no se entiende de dónde cuelga
    // «Portátiles». El servidor piensa igual (fn_productos_validar).
    if ((event.data as any).es_transaccion === false) {
      this._toastr.info(
        `«${(event.data as any).nombre}» agrupa: elija una de las categorías que cuelgan de ella`,
        'Esa categoría no admite productos', { timeOut: 4000 });
      return;
    }

    if ((event.data as any).activo === false) {
      this._toastr.warning(
        `«${(event.data as any).nombre}» está inactiva: actívela desde Categorías para poder usarla`,
        'Categoría no disponible', { timeOut: 4000 });
      return;
    }

    this.seleccionado.emit(event.data);
    this.modal.close(event.data);
  }

  // ================================================================
  // EL ÁRBOL
  // ================================================================

  /** Pliega o despliega una rama. */
  alternarPlegado(fila: CategoriaModel | null): void {
    if (!fila?.id || Number(fila.num_hijos ?? 0) === 0) { return; }
    if (this.plegadas.has(fila.id)) { this.plegadas.delete(fila.id); }
    else { this.plegadas.add(fila.id); }
    this.recalcularVisibles();
  }

  /**
   * Aparta o devuelve el plegado cuando el filtro se enciende o se apaga.
   *
   * Al EMPEZAR a filtrar se abre el árbol entero, porque una coincidencia
   * dentro de una rama cerrada no saldría y parecería que el filtro no la
   * encuentra. Al quitar el filtro vuelve el árbol que había.
   *
   * Lo que ya NO se hace es desactivar el plegado mientras se filtra: con el
   * filtro puesto, el +/- sigue plegando y desplegando.
   *
   * Devuelve true si cambió algo, o sea si hay que repintar.
   */
  private plegadoAlCambiarElFiltro(habiaFiltro: boolean): boolean {
    const hayFiltro = !!this.searchTerm;
    if (habiaFiltro === hayFiltro) { return false; }

    if (hayFiltro) {
      this.plegadasFueraDeFiltro = new Set(this.plegadas);
      this.plegadas.clear();
    } else {
      this.plegadas.clear();
      this.plegadasFueraDeFiltro.forEach(id => this.plegadas.add(id));
      this.plegadasFueraDeFiltro.clear();
    }
    return true;
  }

  /**
   * Cierra todas las ramas que tienen hijas.
   *
   * Buscando se cierra sólo lo que SE ESTÁ VIENDO: `filasVisibles` ya es lo
   * que hay en pantalla. Cerrarlo todo dejaría las raíces, que casi nunca
   * son las que coinciden, y la lista saldría vacía.
   */
  contraerTodo(): void {
    const aLaVista = this.searchTerm ? new Set(this.filasVisibles.map(c => c.id)) : null;
    this.plegadas.clear();
    this.arbol.forEach(c => {
      if (Number(c.num_hijos ?? 0) > 0 && (!aLaVista || aLaVista.has(c.id))) { this.plegadas.add(c.id); }
    });
    this.recalcularVisibles();
  }

  desplegarTodo(): void {
    this.plegadas.clear();
    this.recalcularVisibles();
  }

  /**
   * Rehace la lista que ve la rejilla.
   *
   * Con algo escrito manda la búsqueda: se enseñan las que coinciden Y SUS
   * ANTEPASADAS, porque una rama suelta sin su padre no dice de qué cuelga
   * (hay dos «Accesorios»). Sin búsqueda, se esconde lo que cuelgue de una
   * rama cerrada.
   */
  private recalcularVisibles(): void {
    const padres = new Map<number, number | null>();
    this.arbol.forEach(c => padres.set(c.id, c.padre_id ?? null));

    // 1. El filtro: qué ids deja pasar (null = no hay nada escrito).
    let marcadas: Set<number> | null = null;
    if (this.searchTerm) {
      const aguja = this.sinTildes(this.searchTerm);
      const pasan = new Set<number>();

      // Las que coinciden por nombre o por ruta
      this.arbol.forEach(c => {
        const texto = this.sinTildes(`${c.nombre ?? ''} ${c.ruta ?? ''}`);
        if (texto.includes(aguja)) { pasan.add(c.id); }
      });

      // ...y sus antepasadas, para que la rama se entienda
      [...pasan].forEach(id => {
        let p = padres.get(id) ?? null;
        const vistos = new Set<number>([id]);   // por si llegara un ciclo
        while (p != null && !vistos.has(p)) {
          vistos.add(p);
          pasan.add(p);
          p = padres.get(p) ?? null;
        }
      });

      marcadas = pasan;
    }

    // 2. El plegado, ENCIMA del filtro: una fila se ve si la deja pasar el
    // filtro y no cuelga de una rama cerrada. Antes buscar desactivaba el
    // plegado, y con algo escrito el +/- no hacía nada.
    const cuelgaDeUnaRamaCerrada = (id: number): boolean => {
      let p = padres.get(id) ?? null;
      const vistos = new Set<number>([id]);
      while (p != null && !vistos.has(p)) {
        if (this.plegadas.has(p)) { return true; }
        vistos.add(p);
        p = padres.get(p) ?? null;
      }
      return false;
    };

    if (!marcadas && this.plegadas.size === 0) {
      this.filasVisibles = [...this.arbol];
    } else {
      const pasaElFiltro = marcadas;
      this.filasVisibles = this.arbol.filter(c =>
        (!pasaElFiltro || pasaElFiltro.has(c.id)) && !cuelgaDeUnaRamaCerrada(c.id));
    }

    this.gridApi?.setGridOption('rowData', this.filasVisibles);
  }

  /** Para que «cocción» se encuentre escribiendo «coccion». */
  private sinTildes(texto: string): string {
    return (texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }

  // ================================================================
  // DATOS
  // ================================================================

  /** Trae el árbol entero, ya ordenado y con `nivel`. */
  async cargarArbol(): Promise<void> {
    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._categoriaService.allCategorias(false));

      this.arbol = res.body?.data || [];
      this.recalcularVisibles();
    } catch (error) {
      // El AuthInterceptor ya muestra el toast del error HTTP
      console.error('Error al cargar las categorías:', error);
      this.arbol = [];
      this.filasVisibles = [];
      this.gridApi?.setGridOption('rowData', []);
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  // ================================================================
  // BÚSQUEDA
  // ================================================================

  onSearch(term?: string): void {
    const habiaFiltro = !!this.searchTerm;
    this.searchTerm = (term ?? '').trim();
    this.plegadoAlCambiarElFiltro(habiaFiltro);
    this.recalcularVisibles();
  }

  limpiarBusqueda(): void {
    if (!this.searchTerm) { return; }
    this.searchTerm = '';
    this.campoBusquedaPaginacion?.reset();   // también se vacía la caja
    this.plegadoAlCambiarElFiltro(true);     // vuelve el árbol que había
    this.recalcularVisibles();
  }
}
