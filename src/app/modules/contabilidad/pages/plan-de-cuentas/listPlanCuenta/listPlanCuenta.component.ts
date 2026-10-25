import { Component, Input, OnInit, Output, EventEmitter, ViewChild } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { GridApi, GridReadyEvent, CellClickedEvent, CellKeyDownEvent, RowClassParams } from 'ag-grid-community';
import { ToastrService } from 'ngx-toastr';

import { PlanCuentaModel } from '../../../interfaces/planCuentaModel';
import { PlanCuentaService } from '../../../services/planCuenta.service';
import { AppAgGridService } from '../../../../../service/app-agGrid.service';
import { LoadingService } from '../../../../../service/loading.service';
import { CampoBusquedaPaginacionComponent } from '../../../../../components/campos/campoBusquedaPaginacion/campoBusquedaPaginacion.component';

/**
 * Modal de selección de cuenta contable.
 *
 * Es el selector que pedirá la pantalla de asientos para elegir la cuenta de
 * cada línea. Se deja hecho con el CRUD porque es el hermano del de
 * categorías y se construye igual.
 *
 * Es el hermano de listMarca, con una diferencia: aquí las cuentas NO son
 * una lista, son un árbol, y plano no se entiende. Hay varias «Caja»: una
 * cuelga de Efectivo y otra de Fondos, y en una lista son la misma palabra
 * dos veces. El código las distingue, y por eso va delante.
 *
 * EL ÁRBOL SE PINTA A MANO. ag-Grid Community no trae `treeData` (es de la
 * versión de pago), así que se hace como en allPlanCuentas: el servidor manda
 * el árbol entero ya ordenado y con `nivel`, la rejilla recibe sólo las filas
 * visibles, y una fila está visible cuando ninguna de sus antepasadas está
 * plegada. La sangría y el asa + / − van dentro de la celda del nombre.
 *
 * NO PAGINA: el árbol entero cabe de una vez. Paginarlo dejaría padres fuera
 * de la página y la sangría quedaría colgando de nada. Por eso el buscador
 * también filtra aquí y no en el servidor.
 *
 * LAS INACTIVAS SE VEN PERO NO SE PUEDEN ELEGIR, y tampoco las que sólo
 * agrupan: un asiento va en una cuenta de movimiento, y el saldo de las de
 * arriba sale de sumar las de abajo.
 *
 * Memoria: no hay suscripciones vivas (firstValueFrom completa sola), ni
 * temporizadores, ni listeners; quien lo abre corta su suscripción a
 * `seleccionado` cuando el modal se cierra.
 */
@Component({
  selector: 'app-listPlanCuenta',
  templateUrl: './listPlanCuenta.component.html',
  styleUrls: ['./listPlanCuenta.component.css'],
  standalone: false,
})
export class ListPlanCuentaComponent implements OnInit {

  /** Cuenta ya elegida antes, para marcarla como «Actual». */
  @Input() cuentaSeleccionadaId?: number | null;

  /** Cuenta elegida. Se emite una sola vez, justo antes de cerrar. */
  @Output() seleccionado = new EventEmitter<any>();

  // ---------- ag-Grid ----------
  public gridApi!: GridApi;
  public columnDefs: any[] = [];

  /** El árbol entero, tal como lo manda el servidor. */
  public arbol: PlanCuentaModel[] = [];

  /** Lo que de verdad recibe la rejilla: el árbol menos las ramas cerradas. */
  public filasVisibles: PlanCuentaModel[] = [];

  /** Las ramas cerradas. Es de este modal: no se recuerda al cerrarlo. */
  private readonly plegadas = new Set<number>();

  /** La cuenta ya asignada, y las inactivas, van con su clase. */
  public rowClassRules = {
    'fila-actual': (p: RowClassParams) =>
      this.cuentaSeleccionadaId != null && (p.data as any)?.id === this.cuentaSeleccionadaId,
    'fila-inactiva': (p: RowClassParams) => (p.data as any)?.activo === false,
    // Las que sólo agrupan: se ven, pero no se pueden elegir
    'fila-agrupa': (p: RowClassParams) => (p.data as any)?.es_movimiento === false,
  };

  // ---------- Búsqueda ----------
  @ViewChild(CampoBusquedaPaginacionComponent) campoBusquedaPaginacion!: CampoBusquedaPaginacionComponent;
  public searchTerm: string = '';

  public isLoading$ = this._loadingService.isLoading$;

  constructor(
    public modal: NgbActiveModal,
    private _planCuentaService: PlanCuentaService,
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

  /** Buscando se ve el árbol entero: plegar no pintaría nada. */
  public get plegadoDesactivado(): boolean { return !!this.searchTerm; }

  // ================================================================
  // AG-GRID
  // ================================================================

  initializeGrid(): void {
    this.columnDefs = [
      {
        headerName: 'Código', field: 'codigo',
        cellStyle: { textAlign: 'left' }, minWidth: 140, maxWidth: 200,
      },
      {
        headerName: 'Cuenta', field: 'nombre',
        cellStyle: { textAlign: 'left' }, minWidth: 220, flex: 1,
        // La ruta completa en el título: con dos «Caja» en el árbol, el
        // nombre a secas no basta para saber cuál es cuál.
        tooltipValueGetter: (p: any) => p.data?.ruta || p.value,
        cellRenderer: (p: any) => this.celdaNombre(p),
      },
      {
        headerName: 'Tipo', field: 'tipo',
        headerTooltip: 'El grupo del que es la cuenta',
        cellStyle: { textAlign: 'center' }, minWidth: 110, maxWidth: 130,
      },
      {
        headerName: 'Naturaleza', field: 'naturaleza',
        headerTooltip: 'De qué lado aumenta: al débito (deudora) o al crédito (acreedora)',
        cellStyle: { textAlign: 'center' }, minWidth: 110, maxWidth: 130,
        sortable: false,
        cellRenderer: (p: any) => p.value === 'ACREEDORA'
          ? '<span class="cta-nat cta-nat--haber">ACREEDORA</span>'
          : '<span class="cta-nat cta-nat--debe">DEUDORA</span>',
      },
      {
        headerName: 'Estado', field: 'activo',
        cellStyle: { textAlign: 'center' }, minWidth: 90, maxWidth: 110,
        sortable: false,
        cellRenderer: (p: any) => p.value
          ? '<span class="badge bg-teal fs-10px">ACTIVA</span>'
          : '<span class="badge bg-danger fs-10px" title="No se puede usar">INACTIVA</span>',
      },
      // Columna «Ir»: sólo indica que la fila se puede elegir
      {
        headerName: 'Ir', field: 'seleccionar', pinned: 'right',
        minWidth: 60, maxWidth: 60,
        cellStyle: { display: 'flex', justifyContent: 'center', alignItems: 'center' },
        sortable: false, resizable: false, filter: false, suppressMenu: true,
        cellRenderer: (p: any) => {
          if (p.data?.es_movimiento === false) {
            return `<span class="lista-ir lista-ir--agrupa" title="Sólo agrupa: elija una de las de dentro">
                      <i class="fas fa-layer-group"></i>
                    </span>`;
          }
          if (p.data?.activo === false) {
            return `<span class="lista-ir lista-ir--no" title="Cuenta inactiva: no se puede usar">
                      <i class="fas fa-ban"></i>
                    </span>`;
          }
          return `<span class="lista-ir" title="Elegir esta cuenta">
                    <i class="fas fa-arrow-right"></i>
                  </span>`;
        },
      },
    ];
  }
  /**
   * La celda de «Cuenta»: sangría + asa + nombre.
   *
   * Calcada de allPlanCuentas. La sangría va en píxeles y no con `&nbsp;`:
   * con espacios el ancho depende de la fuente y deja de alinearse al
   * cambiar de tema. La etiqueta «Actual» marca la que ya estaba elegida.
   */
  private celdaNombre(params: any): string {
    const d: any = params.data;
    const nivel = Math.max(0, Number(d?.nivel ?? 0));
    const hijos = Number(d?.num_hijos ?? 0);

    const sangria = `<span class="cta-sangria" style="width:${nivel * 16}px"></span>`;

    // Buscando no se pliega nada, así que tampoco se enseña el asa
    const asa = (hijos > 0 && !this.plegadoDesactivado)
      ? `<button type="button" class="cta-asa" data-accion="plegar"
                 title="${this.plegadas.has(d.id) ? 'Desplegar' : 'Contraer'} esta rama"
                 aria-label="${this.plegadas.has(d.id) ? 'Desplegar' : 'Contraer'}">
           <i class="fa fa-${this.plegadas.has(d.id) ? 'plus' : 'minus'}"></i>
         </button>`
      : `<span class="cta-asa cta-asa--hueco"></span>`;

    // El nombre ESCAPADO: lo escribe un usuario y acaba dentro de una cadena
    // de HTML, así que sin esto un `<` en el nombre rompe la celda.
    const texto = String(params.value ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const actual = d?.id === this.cuentaSeleccionadaId
      ? ' <span class="lista-actual">Actual</span>'
      : '';


    return `<span class="cta-nombre">${sangria}${asa}<span>${texto}</span>${actual}</span>`;
  }

  onGridReady(params: GridReadyEvent): void {
    this.gridApi = params.api;
    this.gridApi.setRowData(this.filasVisibles);
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
   * Un clic en la fila elige la cuenta... salvo que sea en el asa, que
   * abre o cierra la rama. El asa está DENTRO de la celda del nombre, así
   * que sin esta comprobación plegar una rama elegiría esa cuenta y
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
    // sostienen el árbol: sin «ACTIVO CORRIENTE» no se entiende de dónde
    // cuelga «Caja general». Y su saldo sale de sumar las de abajo.
    if ((event.data as any).es_movimiento === false) {
      this._toastr.info(
        `«${(event.data as any).nombre}» agrupa: elija una de las cuentas que cuelgan de ella`,
        'Esa cuenta no recibe asientos', { timeOut: 4000 });
      return;
    }

    if ((event.data as any).activo === false) {
      this._toastr.warning(
        `«${(event.data as any).nombre}» está inactiva: actívela desde el Plan de Cuentas para poder usarla`,
        'Cuenta no disponible', { timeOut: 4000 });
      return;
    }

    this.seleccionado.emit(event.data);
    this.modal.close(event.data);
  }

  // ================================================================
  // EL ÁRBOL
  // ================================================================

  /** Pliega o despliega una rama. */
  alternarPlegado(fila: PlanCuentaModel | null): void {
    if (!fila?.id || Number(fila.num_hijos ?? 0) === 0) { return; }
    if (this.plegadas.has(fila.id)) { this.plegadas.delete(fila.id); }
    else { this.plegadas.add(fila.id); }
    this.recalcularVisibles();
  }

  /** Cierra todas las ramas que tienen hijas. */
  contraerTodo(): void {
    if (this.plegadoDesactivado) { return; }
    this.plegadas.clear();
    this.arbol.forEach(c => { if (Number(c.num_hijos ?? 0) > 0) { this.plegadas.add(c.id); } });
    this.recalcularVisibles();
  }

  desplegarTodo(): void {
    if (this.plegadoDesactivado) { return; }
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

    if (this.searchTerm) {
      const aguja = this.sinTildes(this.searchTerm);

      // Las que coinciden por nombre o por ruta
      const marcadas = new Set<number>();
      this.arbol.forEach(c => {
        const texto = this.sinTildes(`${c.codigo ?? ''} ${c.nombre ?? ''} ${c.ruta ?? ''}`);
        if (texto.includes(aguja)) { marcadas.add(c.id); }
      });

      // ...y sus antepasadas, para que la rama se entienda
      [...marcadas].forEach(id => {
        let p = padres.get(id) ?? null;
        const vistos = new Set<number>([id]);   // por si llegara un ciclo
        while (p != null && !vistos.has(p)) {
          vistos.add(p);
          marcadas.add(p);
          p = padres.get(p) ?? null;
        }
      });

      this.filasVisibles = this.arbol.filter(c => marcadas.has(c.id));
    } else if (this.plegadas.size === 0) {
      this.filasVisibles = [...this.arbol];
    } else {
      this.filasVisibles = this.arbol.filter(c => {
        let p = padres.get(c.id) ?? null;
        const vistos = new Set<number>([c.id]);
        while (p != null && !vistos.has(p)) {
          if (this.plegadas.has(p)) { return false; }
          vistos.add(p);
          p = padres.get(p) ?? null;
        }
        return true;
      });
    }

    this.gridApi?.setRowData(this.filasVisibles);
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
      const res: any = await firstValueFrom(this._planCuentaService.allPlanCuentas(false));

      this.arbol = res.body?.data || [];
      this.recalcularVisibles();
    } catch (error) {
      // El AuthInterceptor ya muestra el toast del error HTTP
      console.error('Error al cargar las cuentas:', error);
      this.arbol = [];
      this.filasVisibles = [];
      this.gridApi?.setRowData([]);
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  // ================================================================
  // BÚSQUEDA
  // ================================================================

  onSearch(term?: string): void {
    this.searchTerm = (term ?? '').trim();
    this.recalcularVisibles();
  }

  limpiarBusqueda(): void {
    if (!this.searchTerm) { return; }
    this.searchTerm = '';
    this.campoBusquedaPaginacion?.reset();   // también se vacía la caja
    this.recalcularVisibles();
  }
}
