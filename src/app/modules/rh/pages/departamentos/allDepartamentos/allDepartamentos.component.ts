import { Component, ElementRef, EventEmitter, HostListener, OnDestroy, OnInit, ViewChild, inject, ChangeDetectionStrategy } from '@angular/core';
import { Subject, firstValueFrom, from, merge, of } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';
import { CellClickedEvent, GridApi, GridReadyEvent, IRowNode } from 'ag-grid-community';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { ActivatedRoute, Router } from '@angular/router';
import { ICellRendererAngularComp, AgGridModule } from 'ag-grid-angular';
import { ToastrService } from 'ngx-toastr';

///   SERVICIOS    ///
import { SeguridadService } from '../../../../seguridad/services/seguridad.service';
import { DepartamentoService } from '../../../services/departamento.service';
import { AppPrintPdfService } from '../../../../../service/app-printPdf.service';
import { AppExportExcelService } from '../../../../../service/app-exportExcel.service';
import { AppExportCsvService } from '../../../../../service/app-exportCsv.service';
import { AppAgGridService } from '../../../../../service/app-agGrid.service';
import { AppDescargaService, PeticionDescarga, AccionDescarga }
  from '../../../../../service/app-descarga.service';
import { LoadingService } from '../../../../../service/loading.service';

///   MODELOS    ///
import { DepartamentoModel } from '../../../interfaces/departamentoModel';
import { AccesoModel } from '../../../../seguridad/interfaces/accesoModel';

///   COMPONENTES    ///
import { SaveDepartamentoComponent } from '../saveDepartamento/saveDepartamento.component';
import { DeleteDepartamentoComponent } from '../deleteDepartamento/deleteDepartamento.component';
import { PapeleraDepartamentosComponent } from '../papeleraDepartamentos/papeleraDepartamentos.component';
import { AuditoriaModalComponent } from '../../../../../components/auditoria-modal/auditoria-modal.component';
import { MenuContextualComponent, OpcionContextual } from '../../../../../components/menuContextual/menuContextual.component';
import { CampoBusquedaComponent } from '../../../../../components/campos/campoBusqueda/campoBusqueda.component';

import { PanelComponent } from '../../../../../components/panel/panel.component';
import { CampoBusquedaPaginacionComponent } from '../../../../../components/campos/campoBusquedaPaginacion/campoBusquedaPaginacion.component';
import { ActionButtonsComponent } from '../../../../../components/botones/action-buttons/action-buttons.component';
import { FilasEstirablesDirective } from '../../../../../core/directives/filasEstirables.directive';
import { CommonModule } from '@angular/common';

/**
 * Árbol de departamentos (rh.departamentos).
 *
 * ES UN ÁRBOL, NO UNA LISTA, así que se parece más a allMenus que a
 * allCargos:
 *
 *  · NO PAGINA. El servidor devuelve el árbol entero, ya ordenado para
 *    pintarlo, y cada fila trae su `nivel`, que es lo que se usa para la
 *    sangría. Un árbol partido en páginas deja la mitad de los padres fuera.
 *  · El buscador filtra EN EL NAVEGADOR (quickFilter): al ser pocas filas no
 *    hace falta volver al servidor, y además con el filtro puesto la
 *    jerarquía se rompe igualmente —se ven las coincidencias sueltas—.
 *  · Se arrastra una fila para moverla de padre o cambiarle el orden; lo que
 *    decide si se puede (ciclos, nivel máximo, nombres repetidos) es
 *    rh.fn_departamentos_mover.
 *
 * Toda la lógica de modales vive aquí; el renderer de ACCIONES
 * (ButtonAccionDepartamento, al final del fichero) sólo delega.
 */
@Component({
  selector: 'app-allDepartamentos',
  templateUrl: './allDepartamentos.component.html',
  styleUrls: ['./allDepartamentos.component.css'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    CommonModule,
    AgGridModule,
    FilasEstirablesDirective,
    PanelComponent,
    MenuContextualComponent,
    CampoBusquedaPaginacionComponent
],
})
export class AllDepartamentosComponent implements OnInit, OnDestroy {

  /** Pregunta qué descargar (lo desplegado o el árbol entero) y trae las filas. */
  private readonly _appDescargaService = inject(AppDescargaService);

  // ---------- Estado ----------
  /** Permisos del perfil sobre esta pantalla, del resolver de la ruta. */
  public accesoModel: AccesoModel;
  /** El árbol entero, en el orden en que se dibuja. */
  public departamentoModel: DepartamentoModel[] = [];
  /** Fila marcada en la rejilla; habilita auditoría y «nueva subdepartamento». */
  public selectedRow: DepartamentoModel | null = null;
  /** true mientras la columna ACCIONES está plegada. */
  public accionesPlegadas = false;

  public titulo: string;
  public isLoading$ = this._loadingService.isLoading$;

  // ---------- ag-Grid ----------
  public gridApi!: GridApi;
  public columnDefs: any[] = [];

  private touchStartTime = 0;
  private touchStartX = 0;
  private touchStartY = 0;

  private readonly unsubscribe$ = new Subject<void>();
  private timeoutIds = new Set<any>();
  private resizeTimeoutId: any;

  /** setTimeout que se da de baja solo al dispararse (ver allCargos). */
  private programar(fn: () => void, ms: number): void {
    const id = setTimeout(() => {
      this.timeoutIds.delete(id);
      fn();
    }, ms);
    this.timeoutIds.add(id);
  }

  /** Referencias estables a los listeners de la cabecera ACCIONES. */
  private headerElement: Element | null = null;
  private readonly onHeaderClick: EventListener = () => this.toggleActionsColumn();
  private readonly onHeaderTouchStart: EventListener = (e) => this.handleTouchStart(e as TouchEvent);
  private readonly onHeaderTouchEnd: EventListener = (e) => this.handleTouchEnd(e as TouchEvent);

  @HostListener('window:resize')
  onResize(): void { this.ajustarTamanoGrid(); }

  // ---------- Búsqueda ----------
  @ViewChild(CampoBusquedaComponent) campoBusqueda!: CampoBusquedaComponent;
  public searchTerm: string = '';

  constructor(
    private host: ElementRef<HTMLElement>,
    private modal: NgbModal,
    private route: Router,
    private activeRoute: ActivatedRoute,
    private _appPrintPdfService: AppPrintPdfService,
    private _appExportExcelService: AppExportExcelService,
    private _appExportCsvService: AppExportCsvService,
    public _appAgGridService: AppAgGridService,
    private _loadingService: LoadingService,
    private _toastr: ToastrService,
    private _seguridadService: SeguridadService,
    private _departamentoService: DepartamentoService,
  ) {
    this.titulo = 'Departamentos';
    this.accesoModel = this.activeRoute.snapshot.data.access;
  }

  ngOnInit(): void {
    this.leerPlegados();
    this.allDepartamentos();
    this.initializeGrid();
  }

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
    this.timeoutIds.forEach(id => clearTimeout(id));
    this.timeoutIds.clear();
    if (this.resizeTimeoutId) { clearTimeout(this.resizeTimeoutId); }
    this.quitarListenersCabecera();
    this.modal.dismissAll();
  }

  /** Suscribe al @Output de un modal y corta la suscripción al cerrarse o al destruir esta pantalla. */
  public escucharModal<T>(modalRef: NgbModalRef, salida: EventEmitter<T>, alEmitir: (valor: T) => void): void {
    const modalCerrado$ = from(modalRef.result).pipe(catchError(() => of(null)));
    salida
      .pipe(takeUntil(merge(this.unsubscribe$, modalCerrado$)))
      .subscribe({
        next: alEmitir,
        error: (err) => console.error('Error en el modal:', err),
      });
  }

  fun_home() {
    this.route.navigate(['/rh']);
  }

  // ================================================================
  // AG-GRID
  // ================================================================

  /** Celda centrada / a la izquierda, para no repetir el objeto en cada columna. */
  private readonly centrado = { textAlign: 'center' };
  private readonly izquierda = { textAlign: 'left' };

  /**
   * Clase de la celda según el nivel (nivel-0 … nivel-3).
   *
   * El color por nivel es lo que hace legible el árbol de un vistazo: sólo
   * con la sangría, a partir del segundo nivel cuesta seguir de quién cuelga
   * cada fila.
   */
  private claseNivel = (params: any): string =>
    'celda-nivel nivel-' + Math.min(Math.max(Number(params?.data?.nivel ?? 0), 0), 3);

  initializeGrid(): void {
    this.columnDefs = [
      {
        headerName: 'Id',
        field: 'id',
        floatingFilter: true,
        cellClass: this.claseNivel,
        cellStyle: this.centrado,
        minWidth: 70,
        maxWidth: 70,
        sortable: false,
      },
      {
        // Segunda columna y PULSABLE, igual que en las demás rejillas.
        //
        // Desactivar un departamento NO desactiva a sus hijas: son decisiones
        // distintas, y apagar media rama de un clic no se ve venir.
        headerName: 'Activo',
        field: 'activo',
        cellStyle: this.centrado,
        minWidth: 80,
        maxWidth: 80,
        sortable: false,
        cellRenderer: (params: any) => this.casillaActivo(params),
      },
      {
        // El código corto, que es por donde se busca en los papeles de RRHH
        headerName: 'Código',
        field: 'codigo',
        headerTooltip: 'Código corto del departamento; es único en toda la empresa',
        cellClass: this.claseNivel,
        cellStyle: this.centrado,
        minWidth: 90,
        maxWidth: 110,
        sortable: false,
        floatingFilter: true,
      },
      {
        headerName: 'Departamento',
        field: 'nombre',
        floatingFilter: true,
        cellClass: this.claseNivel,
        cellStyle: this.izquierda,
        minWidth: 280,
        maxWidth: 520,
        sortable: false,
        // Sangría por `nivel` (ya viene calculado del servidor), el asa de
        // plegar y el nombre. Las hojas llevan un hueco del mismo ancho que
        // el asa para que todos los nombres de un nivel queden alineados.
        cellRenderer: (params: any) => this.celdaNombre(params),
        // Los botones de contraer y desplegar todo van en la cabecera de
        // esta columna, que es la del árbol (ver cabeceraArbol).
        headerComponentParams: this.cabeceraArbol(),
        // Arrastrar la fila (asa ⋮⋮) para moverla a otra rama o cambiar su
        // orden: mismo esquema que allMenus. Sólo con permiso de editar.
        dndSource: this.accesoModel?.editar === true,
        dndSourceOnRowDrag: (params: any) => this.onDragStart(params.rowNode.data, params.dragEvent),
      },
      {
        headerName: 'Nivel',
        field: 'nivel',
        floatingFilter: true,
        cellClass: this.claseNivel,
        cellStyle: this.centrado,
        minWidth: 80,
        maxWidth: 80,
        sortable: false,
      },
      {
        headerName: 'Orden',
        field: 'orden',
        floatingFilter: true,
        headerTooltip: 'Posición entre sus hermanas',
        cellClass: this.claseNivel,
        cellStyle: this.centrado,
        minWidth: 80,
        maxWidth: 80,
        sortable: false,
      },
      {
        headerName: 'Subdepartamentos',
        field: 'num_hijos',
        floatingFilter: true,
        headerTooltip: 'Subdepartamentos directas; con subdepartamentos no se puede eliminar',
        cellClass: this.claseNivel,
        cellStyle: this.centrado,
        minWidth: 120,
        maxWidth: 130,
        sortable: false,
      },
      {
        headerName: 'Empleados',
        field: 'num_empleados',
        headerTooltip: 'Empleados de toda la rama (los de el departamento más los de sus subdepartamentos). '
                     + 'Entre paréntesis, los que cuelgan de ella directamente: ésos son los que impiden eliminarla',
        cellClass: this.claseNivel,
        cellStyle: this.centrado,
        minWidth: 100,
        maxWidth: 110,
        sortable: false,
        cellRenderer: (params: any) => this.celdaEmpleados(params),
        floatingFilter: true,
        // Se filtra por el número que SE VE —el total de la rama— y no por
        // `num_empleados`, que son sólo los suyos: escribir 6 y que no
        // salga la fila que pone 6 no habría quien lo entendiera.
        filterValueGetter: (params: any) =>
          Number(params.data?.empleados_rama ?? params.data?.num_empleados ?? 0),
      },
      {
        // Quién lo dirige. Se enseña el nombre del empleado, no su id.
        headerName: 'Responsable',
        field: 'responsable',
        headerTooltip: 'Empleado responsable del departamento',
        cellClass: this.claseNivel,
        cellStyle: this.izquierda,
        minWidth: 160,
        maxWidth: 260,
        sortable: false,
        floatingFilter: true,
        valueGetter: (params: any) => params.data?.responsable || '',
      },
      {
        headerName: 'Descripción',
        field: 'descripcion',
        floatingFilter: true,
        cellClass: this.claseNivel,
        cellStyle: this.izquierda,
        minWidth: 200,
        maxWidth: 600,
        sortable: false,
      },
      {
        headerName: 'Creado',
        field: 'created_at',
        floatingFilter: true,
        cellClass: this.claseNivel,
        cellStyle: this.centrado,
        minWidth: 160,
        maxWidth: 180,
        sortable: false,
      },
      {
        headerName: 'Actualizado',
        field: 'updated_at',
        floatingFilter: true,
        cellClass: this.claseNivel,
        cellStyle: this.centrado,
        minWidth: 160,
        maxWidth: 180,
        sortable: false,
      },
      {
        headerName: 'Actualizado por',
        field: 'updated_by',
        floatingFilter: true,
        cellClass: this.claseNivel,
        cellStyle: this.izquierda,
        minWidth: 130,
        maxWidth: 200,
        sortable: false,
      },
      {
        headerName: 'ACCIONES',
        field: 'actions',
        cellStyle: { display: 'flex', justifyContent: 'center', alignItems: 'center' },
        cellRenderer: ButtonAccionDepartamento,
        pinned: 'right',
        minWidth: AllDepartamentosComponent.ANCHO_ACCIONES_ABIERTA,
        maxWidth: AllDepartamentosComponent.ANCHO_ACCIONES_ABIERTA,
        suppressHeaderMenuButton: true,
        sortable: false,
        resizable: false,
        headerComponentParams: {
          template: `
            <div style="display: flex; align-items: center; justify-content: center; gap: 5px;" title="Ocultar los botones de acción">
              <span>ACCIONES</span>
              <i class="fas fa-arrow-right"></i>
            </div>
          `
        }
      }
    ];
  }

  // ================================================================
  // PLEGAR Y DESPLEGAR RAMAS
  // ================================================================
  //
  // ag-Grid Community no trae `treeData` —es de la versión de pago—, así que
  // se hace a mano y resulta más simple: la rejilla recibe SÓLO las filas
  // visibles, y una fila está visible cuando ninguno de sus antepasados está
  // plegado. El servidor ya manda el árbol en orden y con `nivel`, que es lo
  // que hacía falta.

  /** Los ids de los departamentos plegados (sus descendientes no se pintan). */
  private readonly plegados = new Set<number>();

  /**
   * El plegado que había ANTES de filtrar.
   *
   * Filtrar abre el árbol entero para que ninguna coincidencia se quede
   * escondida, pero eso no puede costarle al usuario el árbol que tenía
   * montado: se aparta aquí y vuelve al quitar el filtro. Lo que se pliegue
   * CON EL FILTRO PUESTO es del filtro y se descarta con él.
   */
  private plegadosFueraDeFiltro = new Set<number>();

  /** Lo que de verdad recibe la rejilla: el árbol menos las ramas cerradas. */
  public filasVisibles: DepartamentoModel[] = [];

  /** Dónde se recuerda el estado entre visitas. */
  private static readonly CLAVE_PLEGADOS = 'rh.departamentos.plegados';

  /** La celda de «Departamento»: sangría + asa + nombre. */
  private celdaNombre(params: any): string {
    const d = params.data;
    const nivel = Math.max(0, Number(d?.nivel ?? 0));
    const hijos = Number(d?.num_hijos ?? 0);

    // La sangría va en píxeles y no en espacios: con `&nbsp;` el ancho
    // depende de la fuente y las columnas dejan de alinearse al cambiar de
    // tema.
    const sangria = `<span class="dep-sangria" style="width:${nivel * 16}px"></span>`;

    const asa = hijos > 0
      ? `<button type="button" class="dep-asa" data-accion="plegar"
                 title="${this.plegados.has(d.id) ? 'Desplegar' : 'Contraer'} esta rama"
                 aria-label="${this.plegados.has(d.id) ? 'Desplegar' : 'Contraer'}">
           <i class="fa fa-${this.plegados.has(d.id) ? 'plus' : 'minus'}"></i>
         </button>`
      : `<span class="dep-asa dep-asa--hueco"></span>`;

    // El nombre ESCAPADO: lo escribe un usuario y acaba dentro de una cadena
    // de HTML, así que sin esto un `<` en el nombre rompe la celda.
    const texto = String(params.value ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    return `<span class="dep-nombre">${sangria}${asa}<span>${texto}</span></span>`;
  }

  /**
   * Suma los empleados de cada rama.
   *
   * A cada departamento se le añaden los empleados de todos sus descendientes,
   * que es lo que interesa al contraer: el número de la raíz pasa a ser el
   * de la rama entera. `num_empleados` se deja como está —son los suyos— y
   * es el que manda en «con empleados no se puede eliminar».
   */
  private recalcularEmpleados(): void {
    const porId = new Map<number, DepartamentoModel>();
    this.departamentoModel.forEach(c => {
      porId.set(c.id, c);
      c.empleados_rama = Number(c.num_empleados ?? 0);
    });

    this.departamentoModel.forEach(c => {
      const propios = Number(c.num_empleados ?? 0);
      if (!propios) { return; }

      // Se sube por los antepasados sumando. `vistos` es por si el árbol
      // llegara con un ciclo: sin él, esto sería un bucle infinito.
      const vistos = new Set<number>([c.id]);
      let p = c.padre_id ?? null;
      while (p != null && !vistos.has(p)) {
        vistos.add(p);
        const padre = porId.get(p);
        if (!padre) { break; }
        padre.empleados_rama = Number(padre.empleados_rama ?? 0) + propios;
        p = padre.padre_id ?? null;
      }
    });
  }

  /**
   * La celda de «Empleados»: el total de la rama y, si además tiene
   * empleados propios, ésos entre paréntesis (son los que impiden
   * eliminarla). En las hojas, donde los dos números coinciden, va sólo uno.
   */
  private celdaEmpleados(params: any): string {
    const propios = Number(params.data?.num_empleados ?? 0);
    const rama = Number(params.data?.empleados_rama ?? propios);

    if (rama === propios) { return String(rama); }

    const suyos = propios > 0
      ? `<span class="dep-prod__propios">(${propios})</span>`
      : '';
    return `<span class="dep-prod" title="${rama} en toda la rama · ${propios} en este departamento">${rama}${suyos}</span>`;
  }

  /**
   * Cabecera de «Departamento»: los botones de plegar y el título.
   *
   * Es una plantilla del encabezado de ag-Grid, no de Angular: el clic se
   * atiende en `alClicarCabecera` (el contenedor de la rejilla lo escucha) y
   * el encendido/apagado lo pone `actualizarBotonesArbol` a mano.
   */
  private cabeceraArbol(): any {
    return {
      template: `
        <div class="ag-cell-label-container" role="presentation">
          <span ref="eMenu" class="ag-header-icon ag-header-cell-menu-button"></span>
          <div ref="eLabel" class="ag-header-cell-label cabecera-arbol" role="presentation">
            <span class="cabecera-arbol__botones btn-group" role="group" aria-label="Plegar el árbol">
              <button type="button" class="btn" data-arbol="contraer" title="Contraer todas las ramas">
                <i class="fa fa-minus"></i>
              </button>
              <button type="button" class="btn" data-arbol="desplegar" title="Desplegar todas las ramas">
                <i class="fa fa-plus"></i>
              </button>
            </span>
            <span ref="eText" class="ag-header-cell-text"></span>
          </div>
        </div>`
    };
  }

  /**
   * Enciende o apaga los botones de la cabecera.
   *
   * La plantilla de ag-Grid es HTML suelto, no Angular: no hay `[disabled]`
   * que valga y hay que ponerlo cada vez que cambia el estado.
   */
  private actualizarBotonesArbol(): void {
    const botones = this.host?.nativeElement?.querySelectorAll?.('[data-arbol]');
    botones?.forEach((b: HTMLButtonElement) => {
      // Contraer siempre vale; desplegar sólo si hay algo cerrado.
      b.disabled = b.dataset['arbol'] !== 'contraer' && !this.hayPlegados;
    });
  }

  /**
   * Clic en la cabecera de la rejilla.
   *
   * Lo escucha el contenedor porque los botones los pinta ag-Grid y no
   * Angular, así que no hay `(click)` al que agarrarse.
   */
  alClicarCabecera(ev: MouseEvent): void {
    const boton = (ev.target as HTMLElement).closest('[data-arbol]') as HTMLButtonElement | null;
    if (!boton) { return; }

    ev.stopPropagation();
    if (boton.disabled) { return; }
    if (boton.dataset['arbol'] === 'contraer') { this.contraerTodo(); } else { this.desplegarTodo(); }
  }

  // ================================================================
  // FILTROS DE LA CABECERA
  // ================================================================
  //
  // Aquí los filtra ag-Grid, no el servidor: esta pantalla no pagina —trae el
  // árbol entero— así que la rejilla tiene TODAS las filas y puede filtrar
  // ella. En clientes o empleados, que paginan, hay que mandarlos al servidor
  // porque allí la rejilla sólo tiene la página.

  /** Lo que haya pedido la cabecera, tal cual lo da ag-Grid. */
  public filtrosColumna: any = {};

  /** Para no recargar mientras se limpian los filtros de golpe. */
  private limpiando = false;

  /** Cuántas columnas llevan filtro, para decirlo en el buscador. */
  get cuantasColumnasFiltradas(): number {
    return Object.keys(this.filtrosColumna || {}).length;
  }

  /** Si hay algo que quitar: lo escrito arriba o un filtro de columna. */
  get hayFiltro(): boolean {
    return !!this.searchTerm || this.cuantasColumnasFiltradas > 0;
  }

  /**
   * La cabecera pidió otra cosa.
   *
   * Con un filtro puesto el árbol se abre entero, por lo mismo que con el
   * buscador: una coincidencia dentro de una rama cerrada no se vería y
   * parecería que el filtro no encuentra lo que está ahí.
   */
  onFiltroColumna(): void {
    if (this.limpiando) { return; }

    const habiaFiltro = this.hayFiltro;
    this.filtrosColumna = this.gridApi?.getFilterModel() ?? {};
    if (this.plegadoAlCambiarElFiltro(habiaFiltro)) { this.recalcularVisibles(); }
  }

  /**
   * La × del buscador o el botón de limpiar filtros.
   *
   * Una sola pasada: se quita el texto, se quitan los filtros de columna y se
   * repinta una vez.
   */
  clearAllFilters(): void {
    if (!this.hayFiltro) { return; }

    const habiaColumnas = this.cuantasColumnasFiltradas > 0;

    this.limpiando = true;
    this.searchTerm = '';
    this.filtrosColumna = {};
    if (habiaColumnas) { this.gridApi?.setFilterModel(null); }
    this.gridApi?.setGridOption('quickFilterText', '');

    // La bandera se baja en la siguiente vuelta: ag-Grid avisa del cambio de
    // filtros DESPUÉS de esta línea (medido), y si se apagara aquí ese aviso
    // entraría con ella ya baja y repintaría otra vez.
    this.programar(() => { this.limpiando = false; }, 0);

    // Sin filtro vuelve el árbol que había antes de ponerlo.
    this.plegadoAlCambiarElFiltro(true);
    this.recalcularVisibles();
  }

  /** Pliega o despliega una rama y lo recuerda. */
  alternarPlegado(fila: DepartamentoModel | null): void {
    if (!fila?.id || Number(fila.num_hijos ?? 0) === 0) { return; }
    if (this.plegados.has(fila.id)) { this.plegados.delete(fila.id); }
    else { this.plegados.add(fila.id); }
    this.guardarPlegados();
    this.recalcularVisibles();
  }

  /** Cierra todas las que tienen hijas. */
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
    const hayFiltro = this.hayFiltro;
    if (habiaFiltro === hayFiltro) { return false; }

    if (hayFiltro) {
      this.plegadosFueraDeFiltro = new Set(this.plegados);
      this.plegados.clear();
    } else {
      this.plegados.clear();
      this.plegadosFueraDeFiltro.forEach(id => this.plegados.add(id));
      this.plegadosFueraDeFiltro.clear();
    }
    return true;
  }

  /**
   * Los ids que quedan después del filtro, o sea lo que el usuario tiene
   * delante. `filasVisibles` no sirve para esto: es lo que se le da a la
   * rejilla ANTES de que ella aplique el filtro.
   */
  private idsALaVista(): number[] {
    const ids: number[] = [];
    this.gridApi?.forEachNodeAfterFilter((n: any) => {
      const id = Number(n?.data?.id ?? 0);
      if (id) { ids.push(id); }
    });
    return ids;
  }

  /**
   * Cierra todas las ramas.
   *
   * Con el filtro puesto se cierra sólo lo que SE ESTÁ VIENDO. Si se plegara
   * también lo que el filtro esconde, el árbol se quedaría en las raíces,
   * que casi nunca son las que coinciden, y la rejilla saldría vacía después
   * de pulsar un botón que no promete eso.
   */
  contraerTodo(): void {
    const aLaVista = this.hayFiltro ? new Set(this.idsALaVista()) : null;
    this.plegados.clear();
    this.departamentoModel.forEach(c => {
      if (Number(c.num_hijos ?? 0) > 0 && (!aLaVista || aLaVista.has(c.id))) { this.plegados.add(c.id); }
    });
    this.guardarPlegados();
    this.recalcularVisibles();
  }

  desplegarTodo(): void {
    this.plegados.clear();
    this.guardarPlegados();
    this.recalcularVisibles();
  }

  /** Para encender o apagar el botón de la barra. */
  get hayPlegados(): boolean { return this.plegados.size > 0; }


  /** Cuántas ramas están cerradas, para decirlo en el pie. */
  get plegadosCuantas(): number { return this.plegados.size; }

  /**
   * Rehace la lista que ve la rejilla.
   *
   * CON BÚSQUEDA ESCRITA NO SE PLIEGA NADA: si no, una coincidencia dentro de
   * una rama cerrada no aparecería y parecería que el buscador no encuentra
   * lo que está ahí. Buscar manda sobre el plegado.
   */
  private recalcularVisibles(): void {
    // Con texto escrito O con un filtro de columna se abre el árbol entero:
    // si no, lo que coincidiera dentro de una rama cerrada no saldría.
    if (this.plegados.size === 0) {
      this.filasVisibles = [...this.departamentoModel];
    } else {
      // Un mapa id → padre para no recorrer el array por cada antepasado
      const padres = new Map<number, number | null>();
      this.departamentoModel.forEach(c => padres.set(c.id, c.padre_id ?? null));

      this.filasVisibles = this.departamentoModel.filter(c => {
        let p = padres.get(c.id) ?? null;
        while (p != null) {
          if (this.plegados.has(p)) { return false; }
          p = padres.get(p) ?? null;
        }
        return true;
      });
    }
    this.gridApi?.setGridOption('rowData', this.filasVisibles);
    this.actualizarBotonesArbol();
  }

  /**
   * Quita del estado las que ya no existen.
   *
   * Si se borra un departamento y su id se queda aquí, al crear otra podría
   * tocarle ese mismo id y nacería plegada sin que nadie lo haya pedido.
   */
  private limpiarPlegados(): void {
    const existen = new Set(this.departamentoModel.map(c => c.id));
    [...this.plegados].forEach(id => { if (!existen.has(id)) { this.plegados.delete(id); } });
    [...this.plegadosFueraDeFiltro].forEach(id => { if (!existen.has(id)) { this.plegadosFueraDeFiltro.delete(id); } });
  }

  private guardarPlegados(): void {
    try {
      // Mientras se filtra, lo que se recuerda es el árbol de ANTES: lo que
      // se pliegue con el filtro puesto se descarta al quitarlo, así que
      // guardarlo dejaría el árbol cerrado en la siguiente visita.
      const aGuardar = this.hayFiltro ? this.plegadosFueraDeFiltro : this.plegados;
      localStorage.setItem(AllDepartamentosComponent.CLAVE_PLEGADOS, JSON.stringify([...aGuardar]));
    } catch {
      // Ventana privada o almacenamiento bloqueado: se pierde al salir y ya
    }
  }

  private leerPlegados(): void {
    try {
      const guardado = localStorage.getItem(AllDepartamentosComponent.CLAVE_PLEGADOS);
      if (!guardado) { return; }
      const ids = JSON.parse(guardado);
      if (Array.isArray(ids)) {
        ids.forEach((id: any) => { if (Number.isFinite(Number(id))) { this.plegados.add(Number(id)); } });
      }
    } catch {
      // Lo guardado no sirve: se empieza con el árbol abierto
    }
  }

  onGridReady(params: GridReadyEvent): void {
    this.gridApi = params.api;
    // Los botones de la cabecera se pintan con ella: si el árbol llegó
    // antes, su estado se pone aquí, cuando ya existen.
    this.programar(() => { this.montarListenersCabecera(); this.actualizarBotonesArbol(); }, 500);
    this._appAgGridService.ajustarTamanoGrid(this.gridApi);
    this.ajustarAlturaGrid();
  }

  private montarListenersCabecera(): void {
    this.quitarListenersCabecera();
    this.headerElement = this.host.nativeElement.querySelector('.ag-header-cell[col-id="actions"]');
    if (!this.headerElement) { return; }
    this.headerElement.addEventListener('click', this.onHeaderClick);
    this.headerElement.addEventListener('touchstart', this.onHeaderTouchStart, { passive: true });
    this.headerElement.addEventListener('touchend', this.onHeaderTouchEnd);
  }

  private quitarListenersCabecera(): void {
    if (!this.headerElement) { return; }
    this.headerElement.removeEventListener('click', this.onHeaderClick);
    this.headerElement.removeEventListener('touchstart', this.onHeaderTouchStart);
    this.headerElement.removeEventListener('touchend', this.onHeaderTouchEnd);
    this.headerElement = null;
  }

  handleTouchStart(e: TouchEvent) {
    this.touchStartTime = Date.now();
    this.touchStartX = e.touches[0].clientX;
    this.touchStartY = e.touches[0].clientY;
  }

  handleTouchEnd(e: TouchEvent) {
    const touchDuration = Date.now() - this.touchStartTime;
    const distX = Math.abs(e.changedTouches[0].clientX - this.touchStartX);
    const distY = Math.abs(e.changedTouches[0].clientY - this.touchStartY);
    if (touchDuration < 300 && distX < 10 && distY < 10) {
      this.toggleActionsColumn();
      e.preventDefault();
    }
  }

  private static readonly ANCHO_ACCIONES_ABIERTA = 155;
  private static readonly ANCHO_ACCIONES_PLEGADA = 50;

  /** Pliega o despliega la columna ACCIONES (pulsando su cabecera). */
  toggleActionsColumn() {
    const columnDefs = this.gridApi.getColumnDefs() as any[];
    const actionsCol = columnDefs.find(col => col.field === 'actions');
    if (!actionsCol) { return; }

    const estabaPlegada = actionsCol.minWidth === AllDepartamentosComponent.ANCHO_ACCIONES_PLEGADA;
    this.accionesPlegadas = !estabaPlegada;

    const ancho = estabaPlegada ? AllDepartamentosComponent.ANCHO_ACCIONES_ABIERTA : AllDepartamentosComponent.ANCHO_ACCIONES_PLEGADA;
    actionsCol.minWidth = ancho;
    actionsCol.maxWidth = ancho;
    actionsCol.cellStyle = { display: 'flex', justifyContent: 'center', alignItems: 'center' };
    actionsCol.headerComponentParams = {
      template: estabaPlegada
        ? `<div style="display: flex; align-items: center; justify-content: center; gap: 5px;" title="Ocultar los botones de acción">
            <span>ACCIONES</span>
            <i class="fas fa-arrow-right"></i>
          </div>`
        : `<div style="display: flex; align-items: center; justify-content: center;" title="Mostrar los botones de acción">
            <i class="fas fa-bars"></i>
          </div>`
    };

    this.gridApi.setGridOption('columnDefs', columnDefs);
    this.gridApi.sizeColumnsToFit();
    this.programar(() => {
      this.gridApi.sizeColumnsToFit();
      this.montarListenersCabecera();
    }, 100);
  }

  ajustarTamanoGrid() {
    if (!this.gridApi) { return; }
    if (this.resizeTimeoutId) { clearTimeout(this.resizeTimeoutId); }
    this.resizeTimeoutId = setTimeout(() => {
      this._appAgGridService.ajustarTamanoGrid(this.gridApi);
      this.ajustarAlturaGrid();
    }, 100);
  }

  /** La rejilla llena la pantalla hasta el final de la ventana. */
  ajustarAlturaGrid() {
    const gridElement = this.host.nativeElement.querySelector('.ag-theme-alpine') as HTMLElement;
    if (!gridElement) { return; }
    const MARGEN_INFERIOR = 60;
    const alturaDisponible = window.innerHeight - gridElement.getBoundingClientRect().top - MARGEN_INFERIOR;
    gridElement.style.height = `${alturaDisponible}px`;
    this.gridApi.sizeColumnsToFit();
  }

  clearSelection(): void {
    this._appAgGridService.limpiarSeleccion(this.gridApi);
  }

  /** ↑ / ↓ seleccionan la fila como un clic. */
  navegarConTeclado = this._appAgGridService.navegacionConFlechas(fila => this.selectedRow = fila);

  // ================================================================
  // LA CASILLA DE «ACTIVO»
  // ================================================================

  /** Los departamentos desactivadas se ven apagadas y tachadas. */
  public rowClassRules = this._appAgGridService.reglasFilaInactiva('activo');

  /** Las que se están guardando ahora mismo: su casilla sale como un giro. */
  private readonly activoEnVuelo = new Set<number>();

  /** La casilla de la columna «Activo». */
  private casillaActivo(params: any): string {
    return this._appAgGridService.casillaActivo(params, {
      puede: this.accesoModel?.editar === true,
      enVuelo: this.activoEnVuelo,
      que: 'departamento',
    });
  }

  cambiarActivo(fila: DepartamentoModel | null, nodo?: IRowNode | null): void {
    if (!fila) { return; }
    if (this._seguridadService.isexpired()) { return; }

    this._appAgGridService.alternarActivo({
      gridApi: this.gridApi,
      // La rejilla pinta `filasVisibles`: es ahí donde hay que sustituir la
      // fila para que setData encuentre su nodo
      filas: this.filasVisibles,
      fila, nodo,
      campo: 'activo',
      enVuelo: this.activoEnVuelo,
      puede: this.accesoModel?.editar === true,
      que: 'departamento',
      llamar: (id, activo) => this._departamentoService.activarDepartamento(id, activo),
      nombre: (f: any) => f.nombre,
      hasta: this.unsubscribe$,
      // Y el árbol maestro también, que es de donde se recalcula lo visible:
      // si no, al plegar o buscar volvería el valor viejo
      alCambiar: (actualizada: any) => {
        const i = this.departamentoModel.findIndex(c => c.id === actualizada.id);
        if (i !== -1) { this.departamentoModel[i] = actualizada; }
        this.recalcularEmpleados();   // la fila viene del servidor, sin la suma
      },
    });
  }

  onCellClicked(e: CellClickedEvent): void {
    this.selectedRow = e.data;

    const origen = e.event?.target as HTMLElement | null;
    if (origen?.closest('[data-accion="activo"]')) {
      this.cambiarActivo(e.data, e.node);
      return;
    }
    if (origen?.closest('[data-accion="plegar"]')) {
      this.alternarPlegado(e.data);
    }
  }

  // ================================================================
  // DATOS
  // ================================================================

  /** Trae el árbol entero, ya ordenado para pintarlo. */
  async allDepartamentos(): Promise<void> {
    try {
      this._loadingService.setLoading(true);

      const res = await firstValueFrom(this._departamentoService.arbolDepartamentos(false)) as any;

      // El servicio de departamentos devuelve el CUERPO, no la respuesta
      // entera (el de categorías usa `observe: 'response'`): aquí se lee
      // `res.status`, como en el resto de pantallas de RRHH.
      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo obtener el árbol de departamentos', 'Error');
        this.departamentoModel = [];
        this.recalcularVisibles();
        return;
      }

      this.departamentoModel = res?.data || [];
      this.recalcularEmpleados();
      this.limpiarPlegados();
      this.recalcularVisibles();
    } catch (error) {
      // El AuthInterceptor ya muestra el toast del error HTTP
      console.error('Error al cargar el árbol de departamentos:', error);
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  /** Cuántas hay en total (el pie de la pantalla). */
  public get totalRegistros(): number { return this.departamentoModel.length; }

  /** Filas del reporte, en el orden del árbol y con la ruta completa. */
  private filasReporte(lista: any[] = this.departamentoModel): any[][] {
    return lista.map(item => [
      item.id,
      item.ruta || item.nombre,
      item.codigo || '',
      item.nivel,
      item.num_hijos ?? 0,
      item.num_empleados ?? 0,
      item.empleados_rama ?? item.num_empleados ?? 0,
      item.responsable || '',
      item.activo ? 'Activo' : 'Inactivo'
    ]);
  }

  // ================================================================
  // BÚSQUEDA (en el navegador: son pocas filas)
  // ================================================================

  onFilterTextBoxChanged(term?: string) {
    const habiaFiltro = this.hayFiltro;
    if (term !== undefined) { this.searchTerm = term; }

    // Al empezar o dejar de filtrar cambia qué filas se pintan: con filtro
    // se abre todo para que una coincidencia dentro de una rama cerrada no
    // se quede escondida, y al quitarlo vuelve el árbol que había.
    if (this.plegadoAlCambiarElFiltro(habiaFiltro)) { this.recalcularVisibles(); }

    this.gridApi?.setGridOption('quickFilterText', this.searchTerm);
  }

  /**
   * Se pulsó la × del buscador.
   *
   * No hay botón de «quitar filtros» aparte: en esta pantalla el único
   * filtro es ese texto, y el propio campo ya trae su × —de ahí sale este
   * aviso—.
   */
  alLimpiarBusqueda() {
    const habiaFiltro = this.hayFiltro;
    this.searchTerm = '';
    this.plegadoAlCambiarElFiltro(habiaFiltro);
    this.recalcularVisibles();      // vuelven a cerrarse las ramas plegados
    this.gridApi?.setGridOption('quickFilterText', '');
  }

  // ================================================================
  // ARRASTRAR Y SOLTAR: mover de rama / cambiar el orden
  // ================================================================
  //
  // Igual que en allMenus: el tercio superior o inferior de una fila es un
  // hueco («antes de» / «después de», misma rama que esa fila); el centro es
  // «dentro de» (pasa a ser su hija, al final). Lo demás —ciclos, nivel
  // máximo, nombres repetidos entre hermanas, renumerar— lo decide el
  // servidor (rh.fn_departamentos_mover).

  /** El departamento que se está arrastrando. */
  private arrastrando: any = null;
  /** Fila resaltada como destino, para quitarle la clase después. */
  private filaDestino: HTMLElement | null = null;

  onDragStart(departamento: any, ev: DragEvent): void {
    this.arrastrando = departamento;
    if (ev.dataTransfer) {
      ev.dataTransfer.effectAllowed = 'move';
      ev.dataTransfer.setData('text/plain', departamento?.nombre ?? '');
    }
  }

  @HostListener('document:dragend')
  onDragEnd(): void {
    this.arrastrando = null;
    this.quitarFilaDestino();
  }

  /** Fila y zona (antes / dentro / después) bajo el cursor, si es un destino válido. */
  private destinoBajo(ev: DragEvent): { el: HTMLElement; data: any; zona: 'antes' | 'dentro' | 'despues' } | null {
    if (!this.arrastrando) { return null; }
    const el = (ev.target as HTMLElement).closest('.ag-row') as HTMLElement | null;
    if (!el) { return null; }
    const data = this.gridApi?.getDisplayedRowAtIndex(Number(el.getAttribute('row-index')))?.data;
    // Ni sobre sí misma ni dentro de su propia rama: eso lo rechazaría el
    // servidor, pero es mejor que ni siquiera se pueda soltar ahí
    if (!data || data.id === this.arrastrando.id || this.esDescendiente(data.id, this.arrastrando.id)) { return null; }
    const r = el.getBoundingClientRect();
    const y = (ev.clientY - r.top) / r.height;
    const zona = y < .3 ? 'antes' : (y > .7 ? 'despues' : 'dentro');
    return { el, data, zona };
  }

  /** true si `id` cuelga (a cualquier profundidad) de `ancestroId`. */
  private esDescendiente(id: number, ancestroId: number): boolean {
    let actual = this.departamentoModel.find((c: any) => c.id === id) as any;
    while (actual?.padre_id != null) {
      if (actual.padre_id === ancestroId) { return true; }
      actual = this.departamentoModel.find((c: any) => c.id === actual.padre_id);
    }
    return false;
  }

  onDragOverGrilla(ev: DragEvent): void {
    if (!this.arrastrando) { return; }
    ev.preventDefault();
    if (ev.dataTransfer) { ev.dataTransfer.dropEffect = 'move'; }
    const d = this.destinoBajo(ev);
    const clase = d ? ({ antes: 'fila-insertar-antes', dentro: 'fila-destino', despues: 'fila-insertar-despues' })[d.zona] : '';
    if (!d || this.filaDestino !== d.el || !d.el.classList.contains(clase)) {
      this.quitarFilaDestino();
      if (d) { d.el.classList.add(clase); this.filaDestino = d.el; }
    }
  }

  onDragLeaveGrilla(ev: DragEvent): void {
    const a = ev.relatedTarget as Node | null;
    if (a && (ev.currentTarget as HTMLElement).contains(a)) { return; }
    this.quitarFilaDestino();
  }

  onDropGrilla(ev: DragEvent): void {
    ev.preventDefault();
    const departamento = this.arrastrando;
    const d = this.destinoBajo(ev);
    this.onDragEnd();
    if (!departamento || !d) { return; }

    let padreId: number | null;
    let antesDe: number | null;
    if (d.zona === 'dentro') {
      padreId = d.data.id;
      antesDe = null;                                  // al final de sus hijas
    } else {
      padreId = d.data.padre_id ?? null;               // hermana de la fila destino
      antesDe = d.zona === 'antes' ? d.data.id : this.siguienteHermano(d.data, departamento.id);
    }
    // Soltada donde ya estaba: nada que hacer
    if (padreId === (departamento.padre_id ?? null) && antesDe === this.siguienteHermano(departamento, departamento.id)) { return; }
    this.moverDepartamento(departamento, padreId, antesDe);
  }

  /** id de la hermana que sigue a `c` (sin contar `excluir`); null si es la última. */
  private siguienteHermano(c: any, excluir: number): number | null {
    const hermanas = this.departamentoModel
      .filter((x: any) => (x.padre_id ?? null) === (c.padre_id ?? null) && x.id !== excluir)
      .sort((a: any, b: any) => (a.orden - b.orden) || String(a.nombre).localeCompare(String(b.nombre)));
    const i = hermanas.findIndex((x: any) => x.id === c.id);
    return i >= 0 ? (hermanas[i + 1]?.id ?? null) : null;
  }

  private quitarFilaDestino(): void {
    this.filaDestino?.classList.remove('fila-destino', 'fila-insertar-antes', 'fila-insertar-despues');
    this.filaDestino = null;
  }

  /**
   * Manda el movimiento y recarga.
   *
   * Se recarga el árbol entero en vez de arreglar las filas a mano: un
   * movimiento cambia el nivel de todo lo que cuelga y el orden de dos
   * ramas, y rehacer eso en el navegador es duplicar la lógica del servidor
   * con todas las papeletas de que acaben distintas.
   */
  private async moverDepartamento(departamento: any, padreId: number | null, antesDe: number | null): Promise<void> {
    if (this._seguridadService.isexpired()) { return; }
    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._departamentoService.moverDepartamento(departamento.id, padreId, antesDe));
      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo mover el departamento', 'Mover');
        return;
      }
      this._toastr.success(`«${departamento.nombre}»: ${res.message}`, 'Departamentos', { timeOut: 2500 });
      await this.allDepartamentos();
      // Vuelve a marcar la fila movida
      this.gridApi?.forEachNode(n => n.setSelected(n.data?.id === departamento.id));
      this.selectedRow = this.departamentoModel.find((c: any) => c.id === departamento.id) ?? null;
    } catch (e: any) {
      // El AuthInterceptor ya muestra los errores HTTP; el back responde 409
      // con el motivo (ciclo, nivel máximo, nombre repetido…)
      console.error('Error al mover el departamento:', e);
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  // ================================================================
  // IMPRESIÓN Y EXPORTACIÓN
  // ================================================================

  private readonly CABECERAS_REPORTE = ['ID', 'Departamento', 'Código', 'Nivel', 'Subdepartamentos', 'Empleados', 'En la rama', 'Responsable', 'Estado'];


  /**
   * Lo que se le pide al servicio de descargas.
   *
   * AQUÍ NO HAY PAGINACIÓN: el árbol entero está en memoria y la rejilla
   * sólo pinta lo que está desplegado. Por eso «la página que estoy
   * viendo» son las ramas abiertas y «todo» es el árbol completo, que es
   * justo la diferencia que se pierde al exportar sin preguntar.
   */
  private peticionDescarga(accion: AccionDescarga): PeticionDescarga<any> {
    return {
      accion,
      nombrePlural: 'departamentos',
      tituloBase: 'Árbol de Departamentos',
      gridApi: this.gridApi,
      total: this.departamentoModel.length,
      busqueda: this.searchTerm,
      columnDefs: this.columnDefs,
      traerTodo: () => this.departamentoModel,
    };
  }

  async printPdf() {
    const salida = await this._appDescargaService.preparar(this.peticionDescarga('imprimir'));
    if (!salida) { return; }       // no hay nada que descargar, o canceló
    this._appPrintPdfService.generarReporte({
      tamanoPapel: "A4",
      orientacion: "p",
      title: "Reporte de Departamentos",
      titleTable: salida.titulo,
      headers: this.CABECERAS_REPORTE,
      data: this.filasReporte(salida.filas),
      piePagina: 'Pie de página - Mi Empresa en Desarrollo S.A....'
    });
  }

  async exportExcel() {
    const salida = await this._appDescargaService.preparar(this.peticionDescarga('excel'));
    if (!salida) { return; }       // no hay nada que descargar, o canceló
    this._appExportExcelService.generarReporteExcel({
      tamanoPapel: "A4",
      orientacion: "p",
      title: "Reporte de Departamentos",
      titleTable: salida.titulo,
      headers: this.CABECERAS_REPORTE,
      data: this.filasReporte(salida.filas),
      piePagina: 'Pie de página - Mi Empresa en Desarrollo S.A....'
    });
  }

  async exportCsv() {
    const salida = await this._appDescargaService.preparar(this.peticionDescarga('csv'));
    if (!salida) { return; }       // no hay nada que descargar, o canceló
    this._appExportCsvService.generarReporteCSV({
      headers: this.CABECERAS_REPORTE,
      data: this.filasReporte(salida.filas),
    });
  }

  // ================================================================
  // ACCIONES (modales)
  // ================================================================

  /** Abre saveDepartamento en el modo pedido. registro = 0 para crear. */
  private abrirModalDepartamento(registro: any, accion: 'add' | 'edit' | 'clon' | 'view', padre: DepartamentoModel | null = null): NgbModalRef {
    const modalRef = this.modal.open(SaveDepartamentoComponent, {
      centered: true,
      size: 'lg',
      backdrop: 'static',
      keyboard: accion === 'view',
    });
    modalRef.componentInstance.registro_selected = registro;
    modalRef.componentInstance.accion = accion;
    modalRef.componentInstance.padre = padre;
    return modalRef;
  }

  /**
   * Nueva departamento raíz.
   *
   * Tras crear se recarga el árbol en vez de meter la fila a mano: la nueva
   * va al final de sus hermanas y el orden lo decide el servidor.
   */
  addDepartamento(): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.abrirModalDepartamento(0, 'add', null);
    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, () => this.allDepartamentos());
  }

  /** Nueva subdepartamento colgando de la fila marcada. */
  addSubdepartamento(padre?: DepartamentoModel | null): void {
    if (this._seguridadService.isexpired()) { return; }
    const sobre = padre ?? this.selectedRow;
    if (!sobre) {
      this._toastr.info('Elige primero el departamento de la que va a colgar', 'Nueva subdepartamento');
      return;
    }
    if ((sobre.nivel ?? 0) >= 3) {
      this._toastr.warning('El árbol admite hasta cuatro niveles y ésta ya está en el último', 'Nueva subdepartamento');
      return;
    }
    const modalRef = this.abrirModalDepartamento(0, 'add', sobre);
    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, () => this.allDepartamentos());
  }

  clonDepartamento(registro: any): void {
    if (this._seguridadService.isexpired()) { return; }
    const padre = this.departamentoModel.find(c => c.id === registro?.padre_id) ?? null;
    const modalRef = this.abrirModalDepartamento(registro, 'clon', padre);
    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, () => this.allDepartamentos());
  }

  /** Al guardar sustituye la fila en sitio: cambiar el nombre no mueve el árbol. */
  editDepartamento(registro: any): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.abrirModalDepartamento(registro, 'edit');
    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, (actualizado: any) => {
      const index = this.departamentoModel.findIndex(r => r.id === actualizado.id);
      if (index === -1) { return; }
      this.departamentoModel[index] = actualizado;
      this._appAgGridService.ponerFila(this.gridApi, this.filasVisibles, actualizado, 'activo');
    });
  }

  viewDepartamento(registro: any): void {
    if (this._seguridadService.isexpired()) { return; }
    this.abrirModalDepartamento(registro, 'view');
  }

  /** Quita la fila del árbol. El back rechaza si tiene hijas o empleados. */
  /**
   * La papelera de reciclaje.
   *
   * Lo que se «elimina» no se borra: va aquí, y desde aquí se restaura o se
   * borra de verdad. Sólo con el acceso «papelera» del perfil.
   */
  abrirPapelera(): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.modal.open(PapeleraDepartamentosComponent, {
      centered: true, size: 'xl', backdrop: 'static', keyboard: true
    });
    // El permiso viaja con el modal: allí también hay auditoría
    modalRef.componentInstance.puedeAuditar = this.accesoModel?.auditar === true;
    // Y si puede borrar de verdad, que es otro permiso distinto
    modalRef.componentInstance.puedeVaciar = this.accesoModel?.vaciar === true;
    // Al restaurar o borrar de verdad, el árbol ya no es fiel
    this.escucharModal(modalRef, modalRef.componentInstance.cambio,
                       () => this.allDepartamentos());
  }

  deleteDepartamento(registro: any): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.modal.open(DeleteDepartamentoComponent, {
      centered: true,
      size: 'md',
      backdrop: 'static',
      keyboard: true
    });
    modalRef.componentInstance.registro_selected = registro;

    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, () => {
      if (this.selectedRow?.id === registro.id) { this.selectedRow = null; }
      // Al borrar se renumeran las hermanas: hay que volver a traer el árbol
      this.allDepartamentos();
    });
  }

  // ================================================================
  // EL MENÚ DEL BOTÓN DERECHO
  // ================================================================
  //
  // Las mismas acciones que la columna ACCIONES, pero sin tener que llegar
  // hasta el final de la fila ni desplegar la columna cuando está plegada.
  //
  // NO SE USA EL EVENTO `cellContextMenu` DE ag-Grid: se probó contra la
  // librería y no llega —el clic alcanza el contenedor de filas pero la
  // rejilla lo descarta antes de emitirlo—, así que aquí se escucha el
  // `contextmenu` del contenedor y la fila se resuelve con la API pública.

  @ViewChild('menuCtx') menuCtx!: MenuContextualComponent;

  /** Lo que se ofrece para la fila sobre la que se pulsó. */
  public opcionesContextuales: OpcionContextual[] = [];

  /**
   * Clic derecho sobre la rejilla.
   *
   * LO PRIMERO ES ELEGIR LA FILA: el menú actúa sobre «la fila», y si no se
   * marcara se vería resaltada una y el menú trabajaría sobre otra.
   */
  onContextMenuGrilla(e: MouseEvent): void {
    const fila = this._appAgGridService.filaDeEventoEnGrilla(e, this.gridApi);
    if (!fila) { return; }          // fuera de las filas: el menú del navegador

    e.preventDefault();

    this.selectedRow = fila;
    this._appAgGridService.marcarFila(this.gridApi, fila);

    this.opcionesContextuales = this.opcionesPara(fila);
    this.menuCtx?.abrir(e);
  }

  /** Qué se puede hacer con esta fila, según el perfil y dónde está. */
  private opcionesPara(fila: any): OpcionContextual[] {
    const puedeCrear   = this.accesoModel?.crear    === true;
    const puedeEditar  = this.accesoModel?.editar   === true;
    const puedeBorrar  = this.accesoModel?.eliminar === true;
    const puedeVer     = this.accesoModel?.ver      === true;
    const puedeAuditar = this.accesoModel?.auditar  === true;

    // El último nivel no admite nada dentro: el árbol llega hasta el 3
    const esUltimoNivel = Number(fila?.nivel ?? 0) >= 3;
    const tieneHijos    = Number(fila?.num_hijos ?? 0) > 0;

    return [
      {
        id: 'sub', texto: 'Nuevo subdepartamento aquí', icono: 'fa-folder-plus',
        visible: puedeCrear,
        deshabilitada: esUltimoNivel,
        ayuda: esUltimoNivel ? 'Éste es el último nivel: no admite nada dentro'
                             : 'Crear un departamento dentro de éste',
      },
      {
        id: 'raiz', texto: 'Nuevo departamento de primer nivel', icono: 'fa-plus',
        visible: puedeCrear,
      },
      {
        id: 'ver', texto: 'Ver', icono: 'fa-eye',
        separadorAntes: true, visible: puedeVer,
      },
      {
        id: 'editar', texto: 'Modificar', icono: 'fa-pen',
        visible: puedeEditar,
      },
      {
        id: 'clonar', texto: 'Clonar', icono: 'fa-clone',
        visible: puedeCrear,
      },
      {
        id: 'activo', texto: fila?.activo ? 'Desactivar' : 'Activar',
        icono: fila?.activo ? 'fa-toggle-off' : 'fa-toggle-on',
        separadorAntes: true, visible: puedeEditar,
        ayuda: fila?.activo ? 'Dejar de usarlo, sin borrarlo' : 'Volver a usarlo',
      },
      {
        id: 'auditoria', texto: 'Ver auditoría', icono: 'fa-user-secret',
        separadorAntes: true, visible: puedeAuditar,
        ayuda: 'Quién tocó este departamento y cuándo',
      },
      {
        id: 'eliminar', texto: 'Enviar a la papelera', icono: 'fa-trash',
        separadorAntes: true, peligro: true, visible: puedeBorrar,
        deshabilitada: tieneHijos,
        ayuda: tieneHijos ? 'Primero hay que mover o borrar lo que cuelga de él'
                          : 'Se puede recuperar desde la papelera',
      },
    ];
  }

  /** Se eligió una opción del menú. */
  alElegirContextual(id: string): void {
    const fila = this.selectedRow as any;
    if (!fila) { return; }

    switch (id) {
      case 'sub':       this.addSubdepartamento(fila); break;
      case 'raiz':      this.addDepartamento(); break;
      case 'ver':       this.viewDepartamento(fila); break;
      case 'editar':    this.editDepartamento(fila); break;
      case 'clonar':    this.clonDepartamento(fila); break;
      case 'activo':    this.cambiarActivo(fila, this._appAgGridService.nodoDe(this.gridApi, fila.id)); break;
      case 'auditoria': this.auditoria(); break;
      case 'eliminar':  this.deleteDepartamento(fila); break;
    }
  }
  /** Historial de auditoría de la fila seleccionada (tabla departamentos). */
  auditoria(): void {
    if (!this.selectedRow) { return; }
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.modal.open(AuditoriaModalComponent, {
      centered: true,
      size: "xl",
      backdrop: "static",
      keyboard: true
    });
    modalRef.componentInstance.tablaNombre = 'departamentos';
    modalRef.componentInstance.registroId = this.selectedRow.id;
  }
}

// ================================================================
// RENDERER DE LA COLUMNA ACCIONES
// ================================================================
// Simple delegador: toda la lógica de modales vive en AllDepartamentosComponent.
// Lleva un botón de más que las otras rejillas —«nueva subdepartamento»—, que es
// la forma natural de ir construyendo el árbol: desde la rama donde va.
@Component({
  selector: 'app-button-accion-departamento',
  standalone: true,
  imports: [ActionButtonsComponent],
  template: `
    @if (parent.accionesPlegadas) {
      <button type="button"
              class="btn btn-sm btn-outline-primary acciones-desplegar"
              title="Mostrar los botones de acción"
              aria-label="Mostrar los botones de acción"
              (click)="parent.toggleActionsColumn()">
        <i class="fas fa-bars"></i>
      </button>
    } @else {
      <button type="button"
              class="btn-icon btn-subdepartamento"
              [title]="parent.accesoModel?.crear !== true
                        ? 'Nueva subdepartamento - Desactivado'
                        : (params.data?.nivel >= 3
                            ? 'Nueva subdepartamento - ya está en el último nivel'
                            : 'Nueva subdepartamento dentro de ésta')"
              [disabled]="parent.accesoModel?.crear !== true || params.data?.nivel >= 3"
              (click)="parent.addSubdepartamento(params.data)">
        <i class="fa fa-diagram-project"></i>
      </button>
      <app-action-buttons
        [accesoModel]="parent.accesoModel"
        [buttonView]="true"
        [buttonEdit]="true"
        [buttonClone]="true"
        [buttonDelete]="true"
        (view)="parent.viewDepartamento(params.data)"
        (edit)="parent.editDepartamento(params.data)"
        (clone)="parent.clonDepartamento(params.data)"
        (delete)="parent.deleteDepartamento(params.data)">
      </app-action-buttons>
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    :host {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      overflow: hidden;
    }

    /* El host del componente hijo: sin esto sigue siendo un elemento en
       línea con un bloque dentro. No hace falta ::ng-deep porque el
       elemento está en ESTA plantilla. */
    app-action-buttons {
      display: inline-flex;
      align-items: center;
    }

    .acciones-desplegar {
      width: 28px;
      height: 24px;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: .25rem;
    }

    /* El mismo botón de icono que trae app-action-buttons: esa clase vive
       dentro de SU css con alcance, así que aquí hay que repetirla. */
    .btn-subdepartamento {
      background: none;
      border: none;
      cursor: pointer;
      padding: 3px 5px;
      font-size: 1.1em;
      color: var(--bs-app-theme, #00acac);
      transition: all .3s ease;
    }

    .btn-subdepartamento:hover:not(:disabled) { transform: scale(1.2); }
    .btn-subdepartamento:active:not(:disabled) { transform: scale(.95); }
    .btn-subdepartamento:disabled { opacity: .35; cursor: not-allowed; }
  `],
})
export class ButtonAccionDepartamento implements ICellRendererAngularComp {
  public params: any;

  constructor(public parent: AllDepartamentosComponent) { }

  agInit(params: any): void { this.params = params; }

  refresh(params: any): boolean { this.params = params; return true; }
}
