import { Component, ElementRef, EventEmitter, HostListener, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { Subject, firstValueFrom, from, merge, of } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';
import { CellClickedEvent, GridApi, GridReadyEvent, RowNode } from 'ag-grid-community';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { ActivatedRoute, Router } from '@angular/router';
import { ICellRendererAngularComp, AgGridModule } from 'ag-grid-angular';
import { ToastrService } from 'ngx-toastr';

///   SERVICIOS    ///
import { SeguridadService } from '../../../../../seguridad/services/seguridad.service';
import { GrupoClienteService } from '../../../../services/grupoCliente.service';
import { AppPrintPdfService } from '../../../../../../service/app-printPdf.service';
import { AppExportExcelService } from '../../../../../../service/app-exportExcel.service';
import { AppExportCsvService } from '../../../../../../service/app-exportCsv.service';
import { AppAgGridService } from '../../../../../../service/app-agGrid.service';
import { AppDescargaService, PeticionDescarga, AccionDescarga }
  from '../../../../../../service/app-descarga.service';
import { LoadingService } from '../../../../../../service/loading.service';

///   MODELOS    ///
import { GrupoClienteModel } from '../../../../interfaces/grupoClienteModel';
import { AccesoModel } from '../../../../../seguridad/interfaces/accesoModel';

///   COMPONENTES    ///
import { SaveGrupoClienteComponent } from '../saveGrupoCliente/saveGrupoCliente.component';
import { DeleteGrupoClienteComponent } from '../deleteGrupoCliente/deleteGrupoCliente.component';
import { PapeleraGruposClientesComponent } from '../papeleraGruposClientes/papeleraGruposClientes.component';
import { AuditoriaModalComponent } from '../../../../../../components/auditoria-modal/auditoria-modal.component';
import { MenuContextualComponent, OpcionContextual } from '../../../../../../components/menuContextual/menuContextual.component';
import { CampoBusquedaComponent } from '../../../../../../components/campos/campoBusqueda/campoBusqueda.component';
import { CommonModule } from '@angular/common';
import { PanelComponent } from '../../../../../../components/panel/panel.component';
import { CampoBusquedaPaginacionComponent } from '../../../../../../components/campos/campoBusquedaPaginacion/campoBusquedaPaginacion.component';
import { ActionButtonsComponent } from '../../../../../../components/botones/action-buttons/action-buttons.component';

/**
 * Árbol de grupos de clientes (ventas.grupos_clientes).
 *
 * AQUÍ EL ÁRBOL CARGA VALORES, no sólo clasifica: forma de pago, cupo de
 * crédito, días de crédito y descuento se ponen una vez en el grupo y los de
 * abajo los heredan. Las cuatro columnas enseñan LO QUE SE USARÍA, y lo
 * heredado va en cursiva con el nombre del grupo del que viene. Vacío no es
 * cero: es «lo que diga el de arriba».
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
 *  · Se arrastra una fila para moverlo de padre o cambiarle el orden; lo que
 *    decide si se puede (ciclos, nivel máximo, nombres repetidos) es
 *    ventas.fn_grupos_clientes_mover.
 *
 * Toda la lógica de modales vive aquí; el renderer de ACCIONES
 * (ButtonAccionGrupoCliente, al final del fichero) sólo delega.
 */
@Component({
  selector: 'app-allGruposClientes',
  templateUrl: './allGruposClientes.component.html',
  styleUrls: ['./allGruposClientes.component.css'],
  standalone: true,
  imports: [
    CommonModule, AgGridModule, PanelComponent, MenuContextualComponent,
    CampoBusquedaPaginacionComponent,
  ],
})
export class AllGruposClientesComponent implements OnInit, OnDestroy {

  /** Pregunta qué descargar (lo desplegado o el árbol entero) y trae las filas. */
  private readonly _appDescargaService = inject(AppDescargaService);

  // ---------- Estado ----------
  /** Permisos del perfil sobre esta pantalla, del resolver de la ruta. */
  public accesoModel: AccesoModel;
  /** El árbol entero, en el orden en que se dibuja. */
  public grupoModel: GrupoClienteModel[] = [];
  /** Fila marcada en la rejilla; habilita auditoría y «nuevo subgrupo». */
  public selectedRow: GrupoClienteModel | null = null;
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
    private _grupoClienteService: GrupoClienteService,
  ) {
    this.titulo = 'Grupos de Clientes';
    this.accesoModel = this.activeRoute.snapshot.data.access;
  }

  ngOnInit(): void {
    this.leerPlegadas();
    this.allGruposClientes();
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
    this.route.navigate(['/ventas']);
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
        // Desactivar un grupo NO desactiva a sus hijas: son decisiones
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
        // EL PREDETERMINADO: el que la ficha de un cliente nuevo trae
        // puesto. Se maneja como «Activo» —una casilla y un clic— pero es
        // EXCLUSIVO: marcar uno baja el que estuviera, y eso lo resuelve el
        // servidor en la misma llamada, así que después se recarga el árbol.
        headerName: 'Predet.',
        field: 'predeterminado',
        headerTooltip: 'El grupo que la ficha de un cliente nuevo trae puesto. Sólo puede haber uno',
        cellStyle: this.centrado,
        minWidth: 90,
        maxWidth: 90,
        sortable: false,
        cellRenderer: (params: any) => this.casillaPredeterminado(params),
      },
      {
        headerName: 'Icono',
        field: 'icono',
        cellClass: this.claseNivel,
        cellStyle: this.centrado,
        minWidth: 60,
        maxWidth: 60,
        sortable: false,
        cellRenderer: (params: any) => {
          const i = String(params.value ?? '').trim();
          // Sólo clases de Font Awesome: lo que llega va dentro de un
          // atributo class, y aceptar cualquier texto sería dejar meter
          // comillas y cerrar el atributo
          if (!i || !/^[a-z0-9 -]+$/i.test(i)) { return ''; }
          return `<i class="fa ${i}"></i>`;
        },
      },
      {
        headerName: 'Grupo',
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
        // Arrastrar la fila (asa ⋮⋮) para moverlo a otra rama o cambiar su
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
        headerTooltip: 'Posición entre sus hermanos',
        cellClass: this.claseNivel,
        cellStyle: this.centrado,
        minWidth: 80,
        maxWidth: 80,
        sortable: false,
      },
      {
        headerName: 'Subgrupos',
        field: 'num_hijos',
        floatingFilter: true,
        headerTooltip: 'Subgrupos directos; con subgrupos no se puede eliminar',
        cellClass: this.claseNivel,
        cellStyle: this.centrado,
        minWidth: 120,
        maxWidth: 130,
        sortable: false,
      },
      {
        headerName: 'Clientes',
        field: 'num_clientes',
        headerTooltip: 'Clientes de toda la rama (los del grupo más los de sus subgrupos). '
                     + 'Entre paréntesis, los que cuelgan de ella directamente: ésos son los que impiden eliminarlo',
        cellClass: this.claseNivel,
        cellStyle: this.centrado,
        minWidth: 100,
        maxWidth: 110,
        sortable: false,
        cellRenderer: (params: any) => this.celdaClientes(params),
        floatingFilter: true,
        // Se filtra por el número que SE VE —el total de la rama— y no por
        // `num_clientes`, que son sólo los suyos: escribir 6 y que no
        // salga la fila que pone 6 no habría quien lo entendiera.
        filterValueGetter: (params: any) =>
          Number(params.data?.clientes_rama ?? params.data?.num_clientes ?? 0),
      },
      // ---- LAS CUATRO CONDICIONES ----
      // Se enseña LO QUE DE VERDAD SE USA, que puede venir de un grupo de
      // arriba: lo heredado sale en cursiva y apagado, y el título dice de
      // dónde. Sin eso, un grupo con las cuatro vacías parecería no tener
      // condiciones cuando en realidad las tiene todas.
      {
        headerName: 'Forma de pago',
        field: 'forma_pago',
        headerTooltip: 'La que se usará. En cursiva, la que viene de un grupo de arriba',
        cellClass: this.claseNivel,
        cellStyle: this.centrado,
        minWidth: 130,
        maxWidth: 160,
        sortable: false,
        floatingFilter: true,
        cellRenderer: (params: any) => this.celdaCondicion(params, 'forma_pago'),
        // Se filtra por lo que SE VE: escribir «CREDITO» y que no salga la
        // fila que pone CREDITO —porque lo hereda— no habría quien lo
        // entendiera. Igual que con la columna de clientes.
        filterValueGetter: (params: any) => this.efectivo(params.data, 'forma_pago') ?? '',
      },
      {
        headerName: 'Cupo',
        field: 'limite_credito',
        headerTooltip: 'Cupo de crédito que se usará. En cursiva, el que viene de un grupo de arriba',
        cellClass: this.claseNivel,
        cellStyle: this.centrado,
        minWidth: 110,
        maxWidth: 140,
        sortable: false,
        floatingFilter: true,
        cellRenderer: (params: any) => this.celdaCondicion(params, 'limite_credito'),
        filterValueGetter: (params: any) => this.efectivo(params.data, 'limite_credito') ?? '',
      },
      {
        headerName: 'Días',
        field: 'dias_credito',
        headerTooltip: 'Días de crédito que se usarán. En cursiva, los que vienen de un grupo de arriba',
        cellClass: this.claseNivel,
        cellStyle: this.centrado,
        minWidth: 80,
        maxWidth: 100,
        sortable: false,
        floatingFilter: true,
        cellRenderer: (params: any) => this.celdaCondicion(params, 'dias_credito'),
        filterValueGetter: (params: any) => this.efectivo(params.data, 'dias_credito') ?? '',
      },
      {
        headerName: 'Dto. %',
        field: 'descuento',
        headerTooltip: 'Descuento que se usará. En cursiva, el que viene de un grupo de arriba',
        cellClass: this.claseNivel,
        cellStyle: this.centrado,
        minWidth: 90,
        maxWidth: 110,
        sortable: false,
        floatingFilter: true,
        cellRenderer: (params: any) => this.celdaCondicion(params, 'descuento'),
        filterValueGetter: (params: any) => this.efectivo(params.data, 'descuento') ?? '',
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
        cellRenderer: ButtonAccionGrupoCliente,
        pinned: 'right',
        minWidth: AllGruposClientesComponent.ANCHO_ACCIONES_ABIERTA,
        maxWidth: AllGruposClientesComponent.ANCHO_ACCIONES_ABIERTA,
        suppressMenu: true,
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

  /** Los ids de los grupos plegadas (sus descendientes no se pintan). */
  private readonly plegadas = new Set<number>();

  /**
   * El plegado que había ANTES de filtrar.
   *
   * Filtrar abre el árbol entero para que ninguna coincidencia se quede
   * escondida, pero eso no puede costarle al usuario el árbol que tenía
   * montado: se aparta aquí y vuelve al quitar el filtro. Lo que se pliegue
   * CON EL FILTRO PUESTO es del filtro y se descarta con él.
   */
  private plegadasFueraDeFiltro = new Set<number>();

  /** Lo que de verdad recibe la rejilla: el árbol menos las ramas cerradas. */
  public filasVisibles: GrupoClienteModel[] = [];

  /** Dónde se recuerda el estado entre visitas. */
  private static readonly CLAVE_PLEGADAS = 'ventas.gruposClientes.plegadas';

  /** La celda de «Grupo»: sangría + asa + nombre. */
  private celdaNombre(params: any): string {
    const d = params.data;
    const nivel = Math.max(0, Number(d?.nivel ?? 0));
    const hijos = Number(d?.num_hijos ?? 0);

    // La sangría va en píxeles y no en espacios: con `&nbsp;` el ancho
    // depende de la fuente y las columnas dejan de alinearse al cambiar de
    // tema.
    const sangria = `<span class="grp-sangria" style="width:${nivel * 16}px"></span>`;

    const asa = hijos > 0
      ? `<button type="button" class="grp-asa" data-accion="plegar"
                 title="${this.plegadas.has(d.id) ? 'Desplegar' : 'Contraer'} esta rama"
                 aria-label="${this.plegadas.has(d.id) ? 'Desplegar' : 'Contraer'}">
           <i class="fa fa-${this.plegadas.has(d.id) ? 'plus' : 'minus'}"></i>
         </button>`
      : `<span class="grp-asa grp-asa--hueco"></span>`;

    // El nombre ESCAPADO: lo escribe un usuario y acaba dentro de una cadena
    // de HTML, así que sin esto un `<` en el nombre rompe la celda.
    const texto = String(params.value ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    return `<span class="grp-nombre">${sangria}${asa}<span>${texto}</span></span>`;
  }

  /**
   * Suma los clientes de cada rama.
   *
   * A cada grupo se le añaden los clientes de todos sus descendientes,
   * que es lo que interesa al contraer: el número de la raíz pasa a ser el
   * de la rama entera. `num_clientes` se deja como está —son los suyos— y
   * es el que manda en «con clientes no se puede eliminar».
   */
  private recalcularClientes(): void {
    const porId = new Map<number, GrupoClienteModel>();
    this.grupoModel.forEach(c => {
      porId.set(c.id, c);
      c.clientes_rama = Number(c.num_clientes ?? 0);
    });

    this.grupoModel.forEach(c => {
      const propios = Number(c.num_clientes ?? 0);
      if (!propios) { return; }

      // Se sube por los antepasados sumando. `vistos` es por si el árbol
      // llegara con un ciclo: sin él, esto sería un bucle infinito.
      const vistos = new Set<number>([c.id]);
      let p = c.padre_id ?? null;
      while (p != null && !vistos.has(p)) {
        vistos.add(p);
        const padre = porId.get(p);
        if (!padre) { break; }
        padre.clientes_rama = Number(padre.clientes_rama ?? 0) + propios;
        p = padre.padre_id ?? null;
      }
    });
  }

  /**
   * La celda de «Clientes»: el total de la rama y, si además tiene
   * clientes propios, ésos entre paréntesis (son los que impiden
   * eliminarlo). En las hojas, donde los dos números coinciden, va sólo uno.
   */
  private celdaClientes(params: any): string {
    const propios = Number(params.data?.num_clientes ?? 0);
    const rama = Number(params.data?.clientes_rama ?? propios);

    if (rama === propios) { return String(rama); }

    const suyos = propios > 0
      ? `<span class="grp-cli__propios">(${propios})</span>`
      : '';
    return `<span class="grp-cli" title="${rama} en toda la rama · ${propios} en este grupo">${rama}${suyos}</span>`;
  }

  // ================================================================
  // LAS CUATRO CONDICIONES
  // ================================================================
  //
  // El servidor manda, por cada una, lo que tiene puesto el grupo
  // (`propio`), lo que de verdad se usaría (`efectivo`) y DE DÓNDE SALE
  // (`origen_etiqueta`). Un nulo no es un cero: es «lo que diga el de
  // arriba», y un cero puesto a mano sí es un cero.

  /** Lo que de verdad se usaría, venga de donde venga. */
  private efectivo(fila: any, campo: string): any {
    const c = fila?.condiciones?.[campo];
    return c?.efectivo ?? null;
  }

  /** Cómo se escribe cada una (el cupo y el descuento, con dos decimales). */
  private formatearCondicion(campo: string, valor: any): string {
    if (campo === 'forma_pago') { return String(valor); }
    const n = Number(valor);
    if (!Number.isFinite(n)) { return String(valor); }
    if (campo === 'dias_credito') { return String(n); }
    return n.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /** La celda de una condición: el valor y, si se hereda, en cursiva. */
  private celdaCondicion(params: any, campo: string): string {
    const c = params.data?.condiciones?.[campo];
    const efectivo = c?.efectivo;

    if (efectivo === null || efectivo === undefined) {
      return `<span class="grp-cond grp-cond--sin" title="Nadie lo ha puesto en esta rama">—</span>`;
    }

    const propio = c?.propio !== null && c?.propio !== undefined;
    const texto = this.formatearCondicion(campo, efectivo);
    const ayuda = String(c?.origen_etiqueta ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    return propio
      ? `<span class="grp-cond" title="${ayuda}">${texto}</span>`
      : `<span class="grp-cond grp-cond--heredada" title="${ayuda}">${texto}</span>`;
  }

  /**
   * Cabecera de «Grupo»: los botones de plegar y el título.
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
      b.disabled = b.dataset['arbol'] !== 'contraer' && !this.hayPlegadas;
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
  // ella. En clientes o clientes, que paginan, hay que mandarlos al servidor
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
    this.gridApi?.setQuickFilter('');

    // La bandera se baja en la siguiente vuelta: ag-Grid avisa del cambio de
    // filtros DESPUÉS de esta línea (medido), y si se apagara aquí ese aviso
    // entraría con ella ya baja y repintaría otra vez.
    this.programar(() => { this.limpiando = false; }, 0);

    // Sin filtro vuelve el árbol que había antes de ponerlo.
    this.plegadoAlCambiarElFiltro(true);
    this.recalcularVisibles();
  }

  /** Pliega o despliega una rama y lo recuerda. */
  alternarPlegado(fila: GrupoClienteModel | null): void {
    if (!fila?.id || Number(fila.num_hijos ?? 0) === 0) { return; }
    if (this.plegadas.has(fila.id)) { this.plegadas.delete(fila.id); }
    else { this.plegadas.add(fila.id); }
    this.guardarPlegadas();
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
    this.plegadas.clear();
    this.grupoModel.forEach(c => {
      if (Number(c.num_hijos ?? 0) > 0 && (!aLaVista || aLaVista.has(c.id))) { this.plegadas.add(c.id); }
    });
    this.guardarPlegadas();
    this.recalcularVisibles();
  }

  desplegarTodo(): void {
    this.plegadas.clear();
    this.guardarPlegadas();
    this.recalcularVisibles();
  }

  /** Para encender o apagar el botón de la barra. */
  get hayPlegadas(): boolean { return this.plegadas.size > 0; }


  /** Cuántas ramas están cerradas, para decirlo en el pie. */
  get plegadasCuantas(): number { return this.plegadas.size; }

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
    if (this.plegadas.size === 0) {
      this.filasVisibles = [...this.grupoModel];
    } else {
      // Un mapa id → padre para no recorrer el array por cada antepasado
      const padres = new Map<number, number | null>();
      this.grupoModel.forEach(c => padres.set(c.id, c.padre_id ?? null));

      this.filasVisibles = this.grupoModel.filter(c => {
        let p = padres.get(c.id) ?? null;
        while (p != null) {
          if (this.plegadas.has(p)) { return false; }
          p = padres.get(p) ?? null;
        }
        return true;
      });
    }
    this.gridApi?.setRowData(this.filasVisibles);
    this.actualizarBotonesArbol();
  }

  /**
   * Quita del estado las que ya no existen.
   *
   * Si se borra un grupo y su id se queda aquí, al crear otra podría
   * tocarle ese mismo id y nacería plegada sin que nadie lo haya pedido.
   */
  private limpiarPlegadas(): void {
    const existen = new Set(this.grupoModel.map(c => c.id));
    [...this.plegadas].forEach(id => { if (!existen.has(id)) { this.plegadas.delete(id); } });
    [...this.plegadasFueraDeFiltro].forEach(id => { if (!existen.has(id)) { this.plegadasFueraDeFiltro.delete(id); } });
  }

  private guardarPlegadas(): void {
    try {
      // Mientras se filtra, lo que se recuerda es el árbol de ANTES: lo que
      // se pliegue con el filtro puesto se descarta al quitarlo, así que
      // guardarlo dejaría el árbol cerrado en la siguiente visita.
      const aGuardar = this.hayFiltro ? this.plegadasFueraDeFiltro : this.plegadas;
      localStorage.setItem(AllGruposClientesComponent.CLAVE_PLEGADAS, JSON.stringify([...aGuardar]));
    } catch {
      // Ventana privada o almacenamiento bloqueado: se pierde al salir y ya
    }
  }

  private leerPlegadas(): void {
    try {
      const guardado = localStorage.getItem(AllGruposClientesComponent.CLAVE_PLEGADAS);
      if (!guardado) { return; }
      const ids = JSON.parse(guardado);
      if (Array.isArray(ids)) {
        ids.forEach((id: any) => { if (Number.isFinite(Number(id))) { this.plegadas.add(Number(id)); } });
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

    const estabaPlegada = actionsCol.minWidth === AllGruposClientesComponent.ANCHO_ACCIONES_PLEGADA;
    this.accionesPlegadas = !estabaPlegada;

    const ancho = estabaPlegada ? AllGruposClientesComponent.ANCHO_ACCIONES_ABIERTA : AllGruposClientesComponent.ANCHO_ACCIONES_PLEGADA;
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

    this.gridApi.setColumnDefs(columnDefs);
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

  /** Los grupos desactivadas se ven apagadas y tachadas. */
  public rowClassRules = this._appAgGridService.reglasFilaInactiva('activo');

  /** Las que se están guardando ahora mismo: su casilla sale como un giro. */
  private readonly activoEnVuelo = new Set<number>();

  /** La casilla de la columna «Activo». */
  private casillaActivo(params: any): string {
    return this._appAgGridService.casillaActivo(params, {
      puede: this.accesoModel?.editar === true,
      enVuelo: this.activoEnVuelo,
      que: 'grupo',
    });
  }

  cambiarActivo(fila: GrupoClienteModel | null, nodo?: RowNode | null): void {
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
      que: 'grupo',
      llamar: (id, activo) => this._grupoClienteService.activarGrupoCliente(id, activo),
      nombre: (f: any) => f.nombre,
      hasta: this.unsubscribe$,
      // Y el árbol maestro también, que es de donde se recalcula lo visible:
      // si no, al plegar o buscar volvería el valor viejo
      alCambiar: (actualizada: any) => {
        const i = this.grupoModel.findIndex(c => c.id === actualizada.id);
        if (i !== -1) { this.grupoModel[i] = actualizada; }
        this.recalcularClientes();   // la fila viene del servidor, sin la suma
      },
    });
  }

  // ================================================================
  // LA CASILLA DE «PREDETERMINADO»
  // ================================================================
  //
  // Es la misma idea que la de «Activo» y se pinta a mano por lo mismo: el
  // clic se atiende en `onCellClicked` por `data-accion`, y un componente
  // por celda se pagaría en cada repintado de la rejilla.
  //
  // Lo que cambia es que ES EXCLUSIVA: no son diez casillas independientes,
  // es una sola elección entre diez filas. Por eso al volver el servidor se
  // recarga el árbol entero —la fila que se baja es otra— y por eso la
  // casilla de la que ya lo es sale marcada y en verde.

  /** Los que se están guardando ahora mismo: su casilla sale como un giro. */
  private readonly predetEnVuelo = new Set<number>();

  private casillaPredeterminado(params: any): string {
    if (this.predetEnVuelo.has(params.data?.id)) {
      return `<div class="celda-activo">
                <span class="spinner-border spinner-border-sm text-secondary" role="status" aria-label="Guardando"></span>
              </div>`;
    }

    const puede   = this.accesoModel?.editar === true;
    const marcado = params.value === true;
    const titulo  = puede
      ? (marcado ? 'Es el grupo predeterminado de los clientes nuevos'
                 : 'Dejar éste como predeterminado de los clientes nuevos')
      : (marcado ? 'Grupo predeterminado' : 'No es el predeterminado');

    return `<div class="celda-activo" title="${titulo}">
              <input type="checkbox"
                     class="form-check-input${puede ? ' celda-activo__check' : ''}"
                     ${marcado ? 'checked' : ''}
                     ${puede ? 'data-accion="predeterminado"' : 'disabled'}
                     aria-label="${titulo}" />
            </div>`;
  }

  /** Marca —o desmarca— el predeterminado y recarga, porque cambia otra fila. */
  cambiarPredeterminado(fila: GrupoClienteModel | null, nodo?: RowNode | null): void {
    if (!fila) { return; }
    if (this._seguridadService.isexpired()) { return; }

    this._appAgGridService.alternarActivo({
      gridApi: this.gridApi,
      filas: this.filasVisibles,
      fila, nodo,
      campo: 'predeterminado',
      enVuelo: this.predetEnVuelo,
      puede: this.accesoModel?.editar === true,
      que: 'grupo',
      llamar: (id, valor) => this._grupoClienteService.predeterminarGrupoCliente(id, valor),
      nombre: (f: any) => f.nombre,
      hasta: this.unsubscribe$,
      // El que estaba marcado se ha bajado solo en el servidor: su fila ya no
      // es fiel, así que se vuelve a traer el árbol entero.
      alCambiar: () => this.allGruposClientes(),
    });
  }

  /** El nombre del predeterminado, para decirlo en el pie. */
  public get nombrePredeterminado(): string {
    return this.grupoModel.find(g => (g as any).predeterminado === true)?.nombre ?? '';
  }

  onCellClicked(e: CellClickedEvent): void {
    this.selectedRow = e.data;

    const origen = e.event?.target as HTMLElement | null;
    if (origen?.closest('[data-accion="activo"]')) {
      this.cambiarActivo(e.data, e.node);
      return;
    }
    if (origen?.closest('[data-accion="predeterminado"]')) {
      this.cambiarPredeterminado(e.data, e.node);
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
  async allGruposClientes(): Promise<void> {
    try {
      this._loadingService.setLoading(true);

      const res = await firstValueFrom(this._grupoClienteService.allGruposClientes(false)) as any;

      if (res.body?.status !== 'success') {
        this._toastr.error(res.body?.message || 'No se pudo obtener el árbol de grupos', 'Error');
        this.grupoModel = [];
        this.recalcularVisibles();
        return;
      }

      this.grupoModel = res.body?.data || [];
      this.recalcularClientes();
      this.limpiarPlegadas();
      this.recalcularVisibles();
    } catch (error) {
      // El AuthInterceptor ya muestra el toast del error HTTP
      console.error('Error al cargar el árbol de grupos:', error);
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  /** Cuántas hay en total (el pie de la pantalla). */
  public get totalRegistros(): number { return this.grupoModel.length; }

  /** Filas del reporte, en el orden del árbol y con la ruta completa. */
  private filasReporte(lista: any[] = this.grupoModel): any[][] {
    return lista.map(item => [
      item.id,
      item.ruta || item.nombre,
      item.nivel,
      item.num_hijos ?? 0,
      item.clientes_rama ?? item.num_clientes ?? 0,
      // Las condiciones van COMO SE USAN, heredadas incluidas: un reporte
      // con cuatro huecos en los grupos de abajo no dice nada.
      this.efectivo(item, 'forma_pago') ?? '',
      this.efectivo(item, 'limite_credito') ?? '',
      this.efectivo(item, 'dias_credito') ?? '',
      this.efectivo(item, 'descuento') ?? '',
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

    this.gridApi?.setQuickFilter(this.searchTerm);
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
    this.recalcularVisibles();      // vuelven a cerrarse las ramas plegadas
    this.gridApi?.setQuickFilter('');
  }

  // ================================================================
  // ARRASTRAR Y SOLTAR: mover de rama / cambiar el orden
  // ================================================================
  //
  // Igual que en allMenus: el tercio superior o inferior de una fila es un
  // hueco («antes de» / «después de», misma rama que esa fila); el centro es
  // «dentro de» (pasa a ser su hija, al final). Lo demás —ciclos, nivel
  // máximo, nombres repetidos entre hermanos, renumerar— lo decide el
  // servidor (ventas.fn_grupos_clientes_mover).

  /** El grupo que se está arrastrando. */
  private arrastrando: any = null;
  /** Fila resaltada como destino, para quitarle la clase después. */
  private filaDestino: HTMLElement | null = null;

  onDragStart(grupo: any, ev: DragEvent): void {
    this.arrastrando = grupo;
    if (ev.dataTransfer) {
      ev.dataTransfer.effectAllowed = 'move';
      ev.dataTransfer.setData('text/plain', grupo?.nombre ?? '');
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
    // Ni sobre sí mismo ni dentro de su propia rama: eso lo rechazaría el
    // servidor, pero es mejor que ni siquiera se pueda soltar ahí
    if (!data || data.id === this.arrastrando.id || this.esDescendiente(data.id, this.arrastrando.id)) { return null; }
    const r = el.getBoundingClientRect();
    const y = (ev.clientY - r.top) / r.height;
    const zona = y < .3 ? 'antes' : (y > .7 ? 'despues' : 'dentro');
    return { el, data, zona };
  }

  /** true si `id` cuelga (a cualquier profundidad) de `ancestroId`. */
  private esDescendiente(id: number, ancestroId: number): boolean {
    let actual = this.grupoModel.find((c: any) => c.id === id) as any;
    while (actual?.padre_id != null) {
      if (actual.padre_id === ancestroId) { return true; }
      actual = this.grupoModel.find((c: any) => c.id === actual.padre_id);
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
    const grupo = this.arrastrando;
    const d = this.destinoBajo(ev);
    this.onDragEnd();
    if (!grupo || !d) { return; }

    let padreId: number | null;
    let antesDe: number | null;
    if (d.zona === 'dentro') {
      // Aquí NO se comprueba nada más: a diferencia de los grupos con
      // clientes, un grupo con clientes dentro sí admite subgrupos —los
      // clientes siguen resolviendo sus condiciones desde su propio grupo—.
      padreId = d.data.id;
      antesDe = null;                                  // al final de sus hijas
    } else {
      padreId = d.data.padre_id ?? null;               // hermano de la fila destino
      antesDe = d.zona === 'antes' ? d.data.id : this.siguienteHermano(d.data, grupo.id);
    }
    // Soltada donde ya estaba: nada que hacer
    if (padreId === (grupo.padre_id ?? null) && antesDe === this.siguienteHermano(grupo, grupo.id)) { return; }
    this.moverGrupoCliente(grupo, padreId, antesDe);
  }

  /** id de la hermano que sigue a `c` (sin contar `excluir`); null si es la última. */
  private siguienteHermano(c: any, excluir: number): number | null {
    const hermanos = this.grupoModel
      .filter((x: any) => (x.padre_id ?? null) === (c.padre_id ?? null) && x.id !== excluir)
      .sort((a: any, b: any) => (a.orden - b.orden) || String(a.nombre).localeCompare(String(b.nombre)));
    const i = hermanos.findIndex((x: any) => x.id === c.id);
    return i >= 0 ? (hermanos[i + 1]?.id ?? null) : null;
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
  private async moverGrupoCliente(grupo: any, padreId: number | null, antesDe: number | null): Promise<void> {
    if (this._seguridadService.isexpired()) { return; }
    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._grupoClienteService.moverGrupoCliente(grupo.id, padreId, antesDe));
      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo mover el grupo', 'Mover');
        return;
      }
      this._toastr.success(`«${grupo.nombre}»: ${res.message}`, 'Grupos de Clientes', { timeOut: 2500 });
      await this.allGruposClientes();
      // Vuelve a marcar la fila movida
      this.gridApi?.forEachNode(n => n.setSelected(n.data?.id === grupo.id));
      this.selectedRow = this.grupoModel.find((c: any) => c.id === grupo.id) ?? null;
    } catch (e: any) {
      // El AuthInterceptor ya muestra los errores HTTP; el back responde 409
      // con el motivo (ciclo, nivel máximo, nombre repetido…)
      console.error('Error al mover el grupo:', e);
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  // ================================================================
  // IMPRESIÓN Y EXPORTACIÓN
  // ================================================================

  private readonly CABECERAS_REPORTE = ['ID', 'Grupo', 'Nivel', 'Subgrupos', 'Clientes',
                                        'Forma de pago', 'Cupo', 'Días', 'Dto. %', 'Estado'];


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
      nombrePlural: 'grupos',
      tituloBase: 'Árbol de Grupos de Clientes',
      gridApi: this.gridApi,
      total: this.grupoModel.length,
      busqueda: this.searchTerm,
      columnDefs: this.columnDefs,
      traerTodo: () => this.grupoModel,
    };
  }

  async printPdf() {
    const salida = await this._appDescargaService.preparar(this.peticionDescarga('imprimir'));
    if (!salida) { return; }       // no hay nada que descargar, o canceló
    this._appPrintPdfService.generarReporte({
      tamanoPapel: "A4",
      orientacion: "p",
      title: "Reporte de Grupos de Clientes",
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
      title: "Reporte de Grupos de Clientes",
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

  /** Abre saveGrupo en el modo pedido. registro = 0 para crear. */
  private abrirModalGrupoCliente(registro: any, accion: 'add' | 'edit' | 'clon' | 'view', padre: GrupoClienteModel | null = null): NgbModalRef {
    const modalRef = this.modal.open(SaveGrupoClienteComponent, {
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
   * Nuevo grupo de primer nivel.
   *
   * Tras crear se recarga el árbol en vez de meter la fila a mano: la nueva
   * va al final de sus hermanos y el orden lo decide el servidor.
   */
  addGrupoCliente(): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.abrirModalGrupoCliente(0, 'add', null);
    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, () => this.allGruposClientes());
  }

  /** Nuevo subgrupo colgando de la fila marcada. */
  addSubgrupo(padre?: GrupoClienteModel | null): void {
    if (this._seguridadService.isexpired()) { return; }
    const sobre = padre ?? this.selectedRow;
    if (!sobre) {
      this._toastr.info('Elige primero el grupo del que va a colgar', 'Nuevo subgrupo');
      return;
    }
    if ((sobre.nivel ?? 0) >= 3) {
      this._toastr.warning('El árbol admite hasta cuatro niveles y éste ya está en el último', 'Nuevo subgrupo');
      return;
    }
    const modalRef = this.abrirModalGrupoCliente(0, 'add', sobre);
    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, () => this.allGruposClientes());
  }

  clonGrupoCliente(registro: any): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.abrirModalGrupoCliente(registro, 'clon', this.padreDe(registro));
    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, () => this.allGruposClientes());
  }

  /** Al guardar sustituye la fila en sitio: cambiar el nombre no mueve el árbol. */
  editGrupoCliente(registro: any): void {
    if (this._seguridadService.isexpired()) { return; }
    // El padre viaja también al modificar: es de donde salen las
    // condiciones que se heredan, y la ficha las enseña como pista.
    const modalRef = this.abrirModalGrupoCliente(registro, 'edit', this.padreDe(registro));
    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, (actualizado: any) => {
      const index = this.grupoModel.findIndex(r => r.id === actualizado.id);
      if (index === -1) { return; }
      this.grupoModel[index] = actualizado;
      this._appAgGridService.ponerFila(this.gridApi, this.filasVisibles, actualizado, 'activo');
    });
  }

  viewGrupoCliente(registro: any): void {
    if (this._seguridadService.isexpired()) { return; }
    this.abrirModalGrupoCliente(registro, 'view', this.padreDe(registro));
  }

  /** La fila del padre, de donde se heredan las condiciones. */
  private padreDe(registro: any): GrupoClienteModel | null {
    return this.grupoModel.find(c => c.id === registro?.padre_id) ?? null;
  }

  /** Quita la fila del árbol. El back rechaza si tiene hijas o clientes. */
  /**
   * La papelera de reciclaje.
   *
   * Lo que se «elimina» no se borra: va aquí, y desde aquí se restaura o se
   * borra de verdad. Sólo con el acceso «papelera» del perfil.
   */
  abrirPapelera(): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.modal.open(PapeleraGruposClientesComponent, {
      centered: true, size: 'xl', backdrop: 'static', keyboard: true
    });
    // El permiso viaja con el modal: allí también hay auditoría
    modalRef.componentInstance.puedeAuditar = this.accesoModel?.auditar === true;
    // Y si puede borrar de verdad, que es otro permiso distinto
    modalRef.componentInstance.puedeVaciar = this.accesoModel?.vaciar === true;
    // Al restaurar o borrar de verdad, el árbol ya no es fiel
    this.escucharModal(modalRef, modalRef.componentInstance.cambio,
                       () => this.allGruposClientes());
  }

  deleteGrupoCliente(registro: any): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.modal.open(DeleteGrupoClienteComponent, {
      centered: true,
      size: 'md',
      backdrop: 'static',
      keyboard: true
    });
    modalRef.componentInstance.registro_selected = registro;

    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, () => {
      if (this.selectedRow?.id === registro.id) { this.selectedRow = null; }
      // Al borrar se renumeran los hermanos: hay que volver a traer el árbol
      this.allGruposClientes();
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
    const tieneClientes = Number(fila?.num_clientes ?? 0) > 0;

    return [
      {
        id: 'sub', texto: 'Nuevo subgrupo aquí', icono: 'fa-folder-plus',
        visible: puedeCrear,
        deshabilitada: esUltimoNivel,
        ayuda: esUltimoNivel
                 ? 'Éste es el último nivel: no admite nada dentro'
                 : 'Crear un grupo dentro de éste, que heredará sus condiciones',
      },
      {
        id: 'raiz', texto: 'Nuevo grupo de primer nivel', icono: 'fa-plus',
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
        id: 'predeterminado',
        texto: fila?.predeterminado ? 'Quitar como predeterminado' : 'Dejar como predeterminado',
        icono: 'fa-star',
        visible: puedeEditar,
        ayuda: fila?.predeterminado
                 ? 'Los clientes nuevos saldrán sin grupo hasta que marques otro'
                 : 'Es el que traerá puesto la ficha de un cliente nuevo',
      },
      {
        id: 'auditoria', texto: 'Ver auditoría', icono: 'fa-user-secret',
        separadorAntes: true, visible: puedeAuditar,
        ayuda: 'Quién tocó este grupo y cuándo',
      },
      {
        id: 'eliminar', texto: 'Enviar a la papelera', icono: 'fa-trash',
        separadorAntes: true, peligro: true, visible: puedeBorrar,
        deshabilitada: tieneHijos || tieneClientes,
        ayuda: tieneHijos ? 'Primero hay que mover o borrar lo que cuelga de él'
                          : (tieneClientes ? 'Primero hay que cambiar de grupo a los clientes que lo usan'
                                           : 'Se puede recuperar desde la papelera'),
      },
    ];
  }

  /** Se eligió una opción del menú. */
  alElegirContextual(id: string): void {
    const fila = this.selectedRow as any;
    if (!fila) { return; }

    switch (id) {
      case 'sub':       this.addSubgrupo(fila); break;
      case 'raiz':      this.addGrupoCliente(); break;
      case 'ver':       this.viewGrupoCliente(fila); break;
      case 'editar':    this.editGrupoCliente(fila); break;
      case 'clonar':    this.clonGrupoCliente(fila); break;
      case 'activo':    this.cambiarActivo(fila, this._appAgGridService.nodoDe(this.gridApi, fila.id)); break;
      case 'predeterminado': this.cambiarPredeterminado(fila, this._appAgGridService.nodoDe(this.gridApi, fila.id)); break;
      case 'auditoria': this.auditoria(); break;
      case 'eliminar':  this.deleteGrupoCliente(fila); break;
    }
  }
  /** Historial de auditoría de la fila seleccionada (tabla grupos_clientes). */
  auditoria(): void {
    if (!this.selectedRow) { return; }
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.modal.open(AuditoriaModalComponent, {
      centered: true,
      size: "xl",
      backdrop: "static",
      keyboard: true
    });
    modalRef.componentInstance.tablaNombre = 'grupos_clientes';
    modalRef.componentInstance.registroId = this.selectedRow.id;
  }
}

// ================================================================
// RENDERER DE LA COLUMNA ACCIONES
// ================================================================
// Simple delegador: toda la lógica de modales vive en AllGruposClientesComponent.
// Lleva un botón de más que las otras rejillas —«nuevo subgrupo»—, que es
// la forma natural de ir construyendo el árbol: desde la rama donde va.
@Component({
  selector: 'app-button-accion-grupo-cliente',
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
              class="btn-icon btn-subgrupo"
              [title]="parent.accesoModel?.crear !== true
                        ? 'Nuevo subgrupo - Desactivado'
                        : (params.data?.nivel >= 3
                            ? 'Nuevo subgrupo - ya está en el último nivel'
                            : 'Nuevo subgrupo dentro de éste')"
              [disabled]="parent.accesoModel?.crear !== true || params.data?.nivel >= 3"
              (click)="parent.addSubgrupo(params.data)">
        <i class="fa fa-diagram-project"></i>
      </button>
      <app-action-buttons
        [accesoModel]="parent.accesoModel"
        [buttonView]="true"
        [buttonEdit]="true"
        [buttonClone]="true"
        [buttonDelete]="true"
        (view)="parent.viewGrupoCliente(params.data)"
        (edit)="parent.editGrupoCliente(params.data)"
        (clone)="parent.clonGrupoCliente(params.data)"
        (delete)="parent.deleteGrupoCliente(params.data)">
      </app-action-buttons>
    }
  `,
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
    .btn-subgrupo {
      background: none;
      border: none;
      cursor: pointer;
      padding: 3px 5px;
      font-size: 1.1em;
      color: var(--bs-app-theme, #00acac);
      transition: all .3s ease;
    }

    .btn-subgrupo:hover:not(:disabled) { transform: scale(1.2); }
    .btn-subgrupo:active:not(:disabled) { transform: scale(.95); }
    .btn-subgrupo:disabled { opacity: .35; cursor: not-allowed; }
  `],
})
export class ButtonAccionGrupoCliente implements ICellRendererAngularComp {
  public params: any;

  constructor(public parent: AllGruposClientesComponent) { }

  agInit(params: any): void { this.params = params; }

  refresh(params: any): boolean { this.params = params; return true; }
}
