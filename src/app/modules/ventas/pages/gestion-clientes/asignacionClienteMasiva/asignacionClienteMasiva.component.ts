import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, Subject, firstValueFrom, from, merge, of } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';
import { CellClickedEvent, GridApi, GridReadyEvent } from 'ag-grid-community';
import { AgGridModule, AgGridAngular } from 'ag-grid-angular';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';

//   ******   SERVICIOS   ******  //
import { GestionService } from '../../../services/gestion.service';
import { AppAgGridService } from '../../../../../service/app-agGrid.service';

//   ******   MODELOS   ******  //
import { AccesoModel } from '../../../../seguridad/interfaces/accesoModel';
import { ROLES_RESPONSABLE, RolResponsable } from '../../../interfaces/gestionModel';

//   ******   COMPONENTES   ******  //
import { PanelModule } from '../../../../../components/panel/panel.module';
import { CampoBusquedaPaginacionComponent } from '../../../../../components/campos/campoBusquedaPaginacion/campoBusquedaPaginacion.component';
import { AvisoComponent } from '../../../../../components/campos/aviso/aviso.component';
// El mismo selector que usa la reasignación de uno en uno: usuarios con su
// grupo. Se asigna a un USUARIO, no a un empleado, porque el responsable tiene
// que poder entrar al sistema para que el cliente le aparezca en su agenda.
import { ListUsuariosGruposComponent } from '../../../../seguridad/pages/grupos/listUsuariosGrupos/listUsuariosGrupos.component';
import { ConfirmarRepartoComponent } from './confirmarReparto/confirmarReparto.component';
import { nombreDeUsuario } from '../../../../seguridad/services/user.service';

/** Un destino del reparto: a quién van los clientes. */
interface Destino {
  id: number;
  etiqueta: string;
}


/**
 * En qué paso está la pantalla.
 *
 * Confirmar ya no es un paso de aquí: es un modal. Se quitó de la pantalla
 * porque para preguntar «¿seguro?» se llevaba por delante la rejilla, y al
 * volver había que reorientarse.
 */
type Paso = 'elegir' | 'resultado';

/**
 * Repartir clientes en bloque.
 *
 * La pestaña Asignación del cliente reparte de uno en uno, y eso sirve para
 * un cambio suelto. Para 991 clientes sin vendedor no sirve: hay que poder
 * filtrar, marcar muchos y asignarlos de una vez.
 *
 * ES UNA PANTALLA CON SU PROGRAMA, no un modal. Y eso importa para lo que se
 * ve: quien entra por el menú llega sin ningún cliente elegido, que es
 * justamente la postura en la que se reparte. Desde la gestión de clientes
 * hay un atajo que trae aquí.
 *
 * TRES PASOS, y no un botón suelto: elegir, confirmar y ver qué pasó. El de
 * confirmar está porque esto cambia cientos de filas y la pantalla tiene que
 * decir en voz alta lo que va a hacer antes de hacerlo. El de resultado está
 * porque un reparto no termina en «sí» o «no»: termina en cuántos se movieron,
 * cuántos ya lo tenían y cuáles fallaron.
 *
 * REPARTO POR TURNOS. Si se eligen varias personas los clientes se reparten
 * entre ellas, no se amontonan en la primera: con 991 sueltos y siete
 * vendedores, repartir es justamente lo que se quiere.
 *
 * LA SELECCIÓN ES NUESTRA, no la de ag-Grid: la grilla se pagina en el
 * servidor y su selección se pierde al cambiar de página. Aquí se guardan los
 * ids marcados en un Set que sobrevive a la paginación, y «marcar los 991»
 * usa la lista de ids que manda el servidor con cada consulta.
 */
@Component({
  selector: 'app-asignacionClienteMasiva',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    AgGridModule,
    PanelModule,
    CampoBusquedaPaginacionComponent,
    AvisoComponent,
  ],
  templateUrl: './asignacionClienteMasiva.component.html',
  styleUrls: ['./asignacionClienteMasiva.component.css'],
})
export class AsignacionClienteMasivaComponent implements OnInit, OnDestroy {

  // ****** AG-GRID ****** //
  @ViewChild(AgGridAngular) agGrid!: AgGridAngular;
  public gridApi!: GridApi;
  public columnDefs: any[] = [];
  private resizeTimeoutId: any;

  @HostListener('window:resize')
  onResize(): void { this.ajustarTamanoGrid(); }

  // ****** PLANTILLA ****** //
  public titulo = 'Repartir clientes';
  public accesoModel: AccesoModel;

  // ****** CATÁLOGOS ****** //
  /** Los cuatro papeles que existen. */
  public readonly todosLosRoles = ROLES_RESPONSABLE;

  /**
   * Los que ESTE usuario puede repartir, según el cuadro de su perfil.
   *
   * Lo manda el servidor con la lista (meta.papeles) porque es él quien lo
   * decide: aquí sólo se usa para no ofrecer un botón que acabaría en un 403.
   * Empieza vacío —nada que repartir— y lo llena la primera consulta: si algo
   * falla, no se ofrece nada, que es por donde hay que fallar.
   */
  public papelesPermitidos: string[] = [];

  /** Los papeles que se pintan arriba: sólo los que puede repartir. */
  public get roles() {
    return this.todosLosRoles.filter(r => this.papelesPermitidos.includes(r.id));
  }

  // ****** FILTROS ****** //
  /** Con qué papel se reparte. Llega por ?rol= desde el atajo de gestión. */
  public rol: RolResponsable = 'VENDEDOR';
  public busqueda = '';

  /**
   * Lo que haya pedido la cabecera de la rejilla, tal cual lo da ag-Grid.
   *
   * No se guarda nada más: la cabecera es el único sitio donde se filtra por
   * columna, así que no hay dos estados que puedan contradecirse.
   */
  public filtrosColumna: any = {};

  // ****** LISTA ****** //
  public clientes: any[] = [];
  public cargando = false;
  public pagina = 1;
  public porPagina = 20;
  public ultimaPagina = 1;
  public total = 0;
  /** Todos los ids que cumplen el filtro, no sólo los de la página. */
  public idsFiltrados: number[] = [];
  public idsTruncados = false;
  /** Para no pintar una página vieja si llega tarde. */
  private peticion = 0;

  // ****** SELECCIÓN ****** //
  public marcados = new Set<number>();

  // ****** DESTINO ****** //
  public destinos: Destino[] = [];
  public moverAgenda = true;
  public motivo = '';

  // ****** ESTADO DE LA PANTALLA ****** //
  public paso: Paso = 'elegir';
  public guardando = false;
  public resultado: any = null;

  private destroy$ = new Subject<void>();

  constructor(
    private host: ElementRef<HTMLElement>,
    private route: Router,
    private activeRoute: ActivatedRoute,
    private modalService: NgbModal,
    private _toastr: ToastrService,
    private _gestionService: GestionService,
    public _appAgGridService: AppAgGridService,
  ) {
    this.accesoModel = this.activeRoute.snapshot.data['access'];
  }

  ngOnInit(): void {
    // Se puede llegar con el papel puesto (?rol=COBRADOR), que es como entra
    // el atajo de la gestión de clientes.
    //
    // Se compara contra TODOS los papeles, no contra los permitidos: aquí
    // todavía no se sabe cuáles son —los trae la primera consulta—, así que
    // mirar la lista permitida descartaría siempre lo que venga en la url. Si
    // resulta que no puede repartir ése, `cargar()` lo cambia al primero que
    // sí pueda.
    const rolEnLaUrl = (this.activeRoute.snapshot.queryParamMap.get('rol') ?? '').toUpperCase();
    if (this.todosLosRoles.some(r => r.id === rolEnLaUrl)) {
      this.rol = rolEnLaUrl as RolResponsable;
    }

    this.armarColumnas();
    this.cargar(1);
  }

  ngOnDestroy(): void {
    clearTimeout(this.resizeTimeoutId);
    this.destroy$.next();
    this.destroy$.complete();
  }

  fun_home(): void { this.route.navigate(['/ventas']); }

  // ================================================================
  // ROTULOS
  // ================================================================

  /** «Vendedor», «Cobrador»… el nombre del papel que se está repartiendo. */
  get rolNombre(): string {
    return this.todosLosRoles.find(r => r.id === this.rol)?.name ?? 'Responsable';
  }

  /** La agenda sólo viaja con el vendedor: las gestiones son suyas. */
  get laAgendaCuenta(): boolean {
    return this.rol === 'VENDEDOR';
  }

  get quitaResponsable(): boolean {
    return this.destinos.length === 0;
  }

  /** Cuántos clientes le tocarían a cada destino, para enseñarlo antes. */
  get reparteAsi(): { etiqueta: string; cuantos: number }[] {
    const n = this.destinos.length;
    if (!n) { return []; }
    const total = this.marcados.size;
    return this.destinos.map((d, i) => ({
      etiqueta: d.etiqueta,
      // Por turnos: los primeros (total % n) se llevan uno más
      cuantos: Math.floor(total / n) + (i < total % n ? 1 : 0),
    }));
  }

  get hayFiltro(): boolean {
    return !!this.busqueda || Object.keys(this.filtrosColumna || {}).length > 0;
  }

  /** Cuántas columnas tienen filtro puesto, para decirlo en la pantalla. */
  get cuantasColumnasFiltradas(): number {
    return Object.keys(this.filtrosColumna || {}).length;
  }

  /** Mirar se le deja a cualquiera que entre; repartir, no. */
  get puedeRepartir(): boolean {
    return this.accesoModel?.editar !== false;
  }

  // ================================================================
  // LA LISTA
  // ================================================================

  async cargar(page: number = this.pagina): Promise<void> {
    const mia = ++this.peticion;
    try {
      this.cargando = true;
      this.gridApi?.showLoadingOverlay();

      const res: any = await firstValueFrom(this._gestionService.clientesParaAsignar({
        page,
        perPage: this.porPagina,
        search: this.busqueda,
        filtros: this.filtrosColumna,
      }));

      // Llegó tarde: ya se pidió otra cosa y esto pintaría el filtro viejo
      if (mia !== this.peticion) { return; }

      if (res?.status === 'success') {
        this.clientes      = res.data?.data ?? [];
        const meta         = res.data?.meta ?? {};
        this.total         = meta.total ?? 0;
        this.pagina        = meta.current_page ?? page;
        this.ultimaPagina  = meta.last_page ?? 1;
        this.idsFiltrados  = meta.ids ?? [];
        this.idsTruncados  = meta.ids_truncados === true;
        this.papelesPermitidos = meta.papeles ?? [];

        // Si el papel elegido no es de los suyos —porque llegó por la url o
        // porque le cambiaron el perfil mientras miraba—, se pasa al primero
        // que sí pueda repartir en vez de dejarle dar a un botón que falla
        if (this.papelesPermitidos.length && !this.papelesPermitidos.includes(this.rol)) {
          this.rol = this.papelesPermitidos[0] as RolResponsable;
        }
      } else {
        this.clientes = [];
        this.total = 0;
        this.idsFiltrados = [];
      }
    } catch (error) {
      console.error('Error al listar los clientes a repartir:', error);
      if (mia === this.peticion) { this.clientes = []; }
    } finally {
      if (mia === this.peticion) {
        this.cargando = false;
        if (this.clientes.length) { this.gridApi?.hideOverlay(); }
        else { this.gridApi?.showNoRowsOverlay(); }
        // La página es otra: la casilla de la cabecera tiene que decir lo que
        // pasa en ésta, no en la anterior
        this.actualizarCabecera();
      }
    }
  }

  buscar(texto: string): void {
    this.busqueda = texto ?? '';
    this.cargar(1);
  }

  /**
   * Cambiar el papel que se reparte NO toca la lista ni lo marcado.
   *
   * Sólo dice a qué papel se asigna: se pueden marcar «los que no tienen
   * cobrador» y repartirlos como cobradores sin que la pantalla se mueva.
   */
  cambiarRol(rol: RolResponsable): void {
    this.rol = rol;
  }

  /**
   * La cabecera de la rejilla pidió otra cosa.
   *
   * ag-Grid no filtra nada por su cuenta —ver `noFiltrarAquí`—: lo que hace
   * es guardar lo que el usuario pidió, y de ahí se lo lleva el servidor.
   * Siempre a la página 1: con el filtro nuevo, la página siete puede no
   * existir.
   */
  onFiltroColumna(): void {
    this.filtrosColumna = this.gridApi?.getFilterModel() ?? {};
    this.cargar(1);
  }

  /**
   * Deja la pantalla como al entrar.
   *
   * Vaciar la cabecera dispara filterChanged, que ya recarga; llamar además a
   * cargar() sería pedir la lista dos veces. Pero si no había ningún filtro
   * de columna puesto, ag-Grid no tiene nada que cambiar y no avisa, así que
   * en ese caso hay que recargar a mano o borrar el texto del buscador no
   * haría nada.
   */
  limpiarFiltros(): void {
    const habiaColumnas = this.cuantasColumnasFiltradas > 0;
    this.busqueda = '';
    this.filtrosColumna = {};

    if (habiaColumnas && this.gridApi) { this.gridApi.setFilterModel(null); }
    else { this.cargar(1); }
  }

  primera(): void  { if (this.pagina > 1) { this.cargar(1); } }
  anterior(): void { if (this.pagina > 1) { this.cargar(this.pagina - 1); } }
  siguiente(): void{ if (this.pagina < this.ultimaPagina) { this.cargar(this.pagina + 1); } }
  ultima(): void   { if (this.pagina < this.ultimaPagina) { this.cargar(this.ultimaPagina); } }

  // ================================================================
  // LA GRILLA
  // ================================================================

  /**
   * Texto que viene de la base metido dentro de HTML.
   *
   * Los cellRenderer devuelven una cadena que ag-Grid inserta como HTML, así
   * que un nombre de cliente con un `<` rompería la celda —y en el peor caso
   * sería una puerta abierta—. Se escapa siempre.
   */
  private escapar(v: any): string {
    return String(v ?? '').replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
  }

  /**
   * La cabecera de la columna de marcar, con su casilla.
   *
   * Mismo molde que la rejilla de permisos de save2Profile: ag-Grid pinta la
   * cabecera como HTML suelto, así que la casilla no es un control de Angular
   * y hay que leerla y escribirla por el DOM —actualizarCabecera— y atender
   * su clic en el contenedor —onHeaderClicked—.
   */
  private cabeceraConCasilla(): any {
    return {
      template: `
        <div class="ag-cell-label-container" role="presentation">
          <div ref="eLabel" class="ag-header-cell-label asigm-cabecera-marca" role="presentation">
            <input type="checkbox" class="form-check-input asigm-check-todos"
                   title="Marcar o desmarcar los de esta página">
            <span ref="eText" class="ag-header-cell-text"></span>
          </div>
        </div>`,
    };
  }

  /**
   * Una operación de filtro que la rejilla NO aplica: siempre pasa.
   *
   * `predicate` es la pieza que sostiene toda esta pantalla. Como se pagina
   * en el servidor, ag-Grid sólo tiene las veinte filas de la página: si
   * filtrara ella, escribir «Manta» daría tres de 1001 y parecería rota. Con
   * el predicado devolviendo siempre true la rejilla se queda con lo que hace
   * bien —la cabecera, los operadores, el modelo— y no esconde ninguna fila;
   * filtrar de verdad lo hace el servidor con ese mismo modelo.
   *
   * NO VALE `textMatcher`, que era lo primero que parecía servir: gobierna
   * sólo las comparaciones de texto, y «En blanco» —el filtro con el que se
   * empieza a repartir, «no lo atiende nadie»— se resuelve antes de llegar a
   * él y sí escondía filas. Comprobado en el navegador.
   *
   * El displayKey repite el nombre de la operación de ag-Grid a propósito:
   * así el modelo que sale es el mismo que entiende el servidor y no hay que
   * traducir nada por el camino.
   */
  private opcion(clave: string, nombre: string, entradas: 0 | 1 | 2 = 1): any {
    return { displayKey: clave, displayName: nombre, numberOfInputs: entradas, predicate: () => true };
  }

  /**
   * Filtro de texto que no filtra aquí.
   *
   * Los nombres van en castellano porque una operación propia no pasa por el
   * localeText de la rejilla: si no se ponen, salen en inglés.
   *
   * suppressAndOrCondition: una sola condición por columna. ag-Grid sabe
   * juntar dos con Y/O, pero eso multiplica los casos que la base tiene que
   * entender a cambio de algo que aquí no se usa.
   */
  private get noFiltrarAqui(): any {
    return {
      suppressAndOrCondition: true,
      // Sin esto hay que pulsar Enter y nadie lo pulsa
      debounceMs: 400,
      filterOptions: [
        this.opcion('contains',    'Contiene'),
        this.opcion('notContains', 'No contiene'),
        this.opcion('equals',      'Es igual a'),
        this.opcion('notEqual',    'No es igual a'),
        this.opcion('startsWith',  'Empieza por'),
        this.opcion('endsWith',    'Termina en'),
        this.opcion('blank',       'En blanco', 0),
        this.opcion('notBlank',    'No en blanco', 0),
      ],
    };
  }

  /** Lo mismo para las columnas de números. */
  private get noFiltrarAquiNumero(): any {
    return {
      suppressAndOrCondition: true,
      debounceMs: 400,
      filterOptions: [
        this.opcion('equals',             'Es igual a'),
        this.opcion('notEqual',           'No es igual a'),
        this.opcion('greaterThan',        'Mayor que'),
        this.opcion('greaterThanOrEqual', 'Mayor o igual que'),
        this.opcion('lessThan',           'Menor que'),
        this.opcion('lessThanOrEqual',    'Menor o igual que'),
        this.opcion('inRange',            'Entre', 2),
        this.opcion('blank',              'En blanco', 0),
        this.opcion('notBlank',           'No en blanco', 0),
      ],
    };
  }

  /**
   * La fila de filtros bajo la cabecera, en las columnas que la admiten.
   *
   * `floatingFilter` es propiedad DE COLUMNA, no de rejilla: no está en
   * GridOptions ni entre las entradas de ag-grid-angular, y ponerla en la
   * etiqueta hace que Angular corte el build con NG8002. Las columnas sin
   * filtro dejan su hueco en blanco en esa fila.
   */
  private conFiltroFlotante(columnas: any[]): any[] {
    return columnas.map(c => (c.filter ? { ...c, floatingFilter: true } : c));
  }

  private armarColumnas(): void {
    this.columnDefs = this.conFiltroFlotante([
      {
        headerName: '', field: 'marcado', width: 44, minWidth: 44, maxWidth: 44,
        sortable: false, filter: false, resizable: false, pinned: 'left',
        cellClass: 'text-center asigm-celda-marca',
        headerComponentParams: this.cabeceraConCasilla(),
        cellRenderer: (p: any) => {
          const marcado = this.marcados.has(p.data?.id);
          return `<i class="fa ${marcado ? 'fa-square-check text-primary' : 'fa-square text-muted'} asigm-marca"
                     role="img" aria-label="${marcado ? 'Marcado' : 'Sin marcar'}"></i>`;
        },
      },
      {
        headerName: 'Id', field: 'id', width: 90, minWidth: 80,
        filter: 'agNumberColumnFilter', filterParams: this.noFiltrarAquiNumero,
      },
      {
        headerName: 'Cliente', field: 'nombre_completo', minWidth: 200, flex: 2,
        tooltipField: 'nombre_completo',
        filter: 'agTextColumnFilter', filterParams: this.noFiltrarAqui,
      },
      {
        headerName: 'Identificación', field: 'numero_identificacion', width: 140, minWidth: 115,
        filter: 'agTextColumnFilter', filterParams: this.noFiltrarAqui,
      },

      // ---------- La zona ----------
      // Repartir por zona es la forma natural de repartir una cartera, así
      // que las tres van juntas y seguidas, no desperdigadas entre lo demás.
      {
        headerName: 'Provincia', field: 'provincia', width: 130, minWidth: 105,
        filter: 'agTextColumnFilter', filterParams: this.noFiltrarAqui,
      },
      {
        headerName: 'Cantón', field: 'canton', width: 130, minWidth: 105,
        filter: 'agTextColumnFilter', filterParams: this.noFiltrarAqui,
      },
      {
        headerName: 'Parroquia', field: 'parroquia', width: 130, minWidth: 105,
        filter: 'agTextColumnFilter', filterParams: this.noFiltrarAqui,
      },
      {
        headerName: 'Coordenadas', field: 'coordenadas', width: 150, minWidth: 120,
        headerTooltip: 'Ubicación guardada del cliente. «En blanco» / «No en blanco» separa los que la tienen',
        filter: 'agTextColumnFilter', filterParams: this.noFiltrarAqui,
        // Texto y no enlace: en esta rejilla el clic en la fila marca o
        // desmarca, y un enlace dentro pelearía con eso
        cellRenderer: (p: any) => p.value
          ? `<span title="${this.escapar(p.value)}"><i class="fa fa-location-dot text-primary me-1"></i>${this.escapar(p.value)}</span>`
          : `<span class="text-muted">—</span>`,
      },

      // ---------- Quién lo atiende, los cuatro papeles ----------
      // Antes era una sola columna, la del papel que se estaba repartiendo,
      // y para ver quién cobra había que cambiar de papel. Estando las cuatro
      // se lee de un vistazo qué le falta a cada cliente.
      ...this.roles.map(r => ({
        headerName: r.name,
        field: r.id.toLowerCase() + '_nombre',
        minWidth: 160,
        flex: 1,
        // «En blanco» en esta columna es «no lo atiende nadie», que es el
        // filtro con el que se empieza a repartir
        headerTooltip: 'Quién lo atiende hoy como ' + r.name.toLowerCase() + '. «En blanco» = nadie',
        tooltipField: r.id.toLowerCase() + '_nombre',
        filter: 'agTextColumnFilter',
        filterParams: this.noFiltrarAqui,
        cellRenderer: (p: any) => p.value
          ? `<span>${this.escapar(p.value)}</span>`
          : `<span class="text-muted fst-italic">nadie</span>`,
      })),
      {
        headerName: 'Pendientes', field: 'pendientes', width: 120, minWidth: 100,
        cellClass: 'text-center',
        headerTooltip: 'Gestiones pendientes que se moverían con el cliente',
        filter: 'agNumberColumnFilter', filterParams: this.noFiltrarAquiNumero,
        cellRenderer: (p: any) => p.value
          ? `<span class="badge bg-warning bg-opacity-25 text-body fs-10px">${p.value}</span>`
          : `<span class="text-muted">—</span>`,
      },
      {
        headerName: 'Estado', field: 'estado', width: 120, minWidth: 100,
        filter: 'agTextColumnFilter', filterParams: this.noFiltrarAqui,
        cellRenderer: (p: any) =>
          `<span class="badge fs-10px ${p.value === 'ACTIVO' ? 'bg-success' : 'bg-secondary'}">${this.escapar(p.value)}</span>`,
      },
    ]);
  }

  /**
   * Clic en la casilla de la cabecera.
   *
   * Se escucha en el contenedor de la rejilla y se mira el destino del clic,
   * porque la cabecera es HTML que pinta ag-Grid y no un control de Angular.
   */
  onHeaderClicked(ev: MouseEvent): void {
    const input = (ev.target as HTMLElement).closest('input.asigm-check-todos');
    if (!input) { return; }
    ev.stopPropagation();
    this.alternarPagina();
  }

  /**
   * Deja la casilla de la cabecera diciendo la verdad sobre esta página:
   * marcada si están todos, a medias si sólo algunos.
   *
   * A medias importa: sin eso, con tres de veinte marcados la cabecera se
   * vería vacía y parecería que no hay nada marcado.
   */
  private actualizarCabecera(): void {
    const input = this.host.nativeElement.querySelector<HTMLInputElement>('input.asigm-check-todos');
    if (!input) { return; }
    const n = this.clientes.filter(c => this.marcados.has(c.id)).length;
    input.checked = this.clientes.length > 0 && n === this.clientes.length;
    input.indeterminate = n > 0 && n < this.clientes.length;
  }

  onGridReady(params: GridReadyEvent): void {
    this.gridApi = params.api;
    this.ajustarTamanoGrid();
  }

  /**
   * El alto no se ajusta solo cuando el panel se expande o se gira el
   * teléfono: hay que recalcularlo a mano, como en el resto de la casa.
   */
  ajustarTamanoGrid(): void {
    clearTimeout(this.resizeTimeoutId);
    this.resizeTimeoutId = setTimeout(() => {
      if (this.gridApi) { this._appAgGridService.ajustarTamanoGrid(this.gridApi); }
    }, 150);
  }

  /**
   * Cualquier punto de la fila marca o desmarca.
   *
   * Con cientos de clientes, obligar a acertar en una casilla de catorce
   * píxeles es castigo.
   */
  onCellClicked(e: CellClickedEvent): void {
    this.alternarMarca(e.data?.id);
  }

  // ================================================================
  // LO MARCADO
  // ================================================================

  alternarMarca(id: number | undefined): void {
    if (!id) { return; }
    if (this.marcados.has(id)) { this.marcados.delete(id); } else { this.marcados.add(id); }
    this.refrescarMarcas();
  }

  /** Repinta las casillas de las filas y la de la cabecera, que van juntas. */
  private refrescarMarcas(): void {
    this.gridApi?.refreshCells({ force: true, columns: ['marcado'] });
    this.actualizarCabecera();
  }

  /** Los de esta página: es lo que el botón «Esta página» espera hacer. */
  get paginaEntera(): boolean {
    return this.clientes.length > 0 && this.clientes.every(c => this.marcados.has(c.id));
  }

  alternarPagina(): void {
    const marcar = !this.paginaEntera;
    for (const c of this.clientes) {
      if (marcar) { this.marcados.add(c.id); } else { this.marcados.delete(c.id); }
    }
    this.refrescarMarcas();
  }

  /**
   * Si acaba de marcarse la página entera pero el filtro tiene más.
   *
   * Es el momento de ofrecer «y los otros 971»: marcar veinte y creer que se
   * marcaron los 991 es el error caro de esta pantalla.
   */
  get ofrecerTodoElFiltro(): boolean {
    return this.paginaEntera && this.marcados.size < this.total;
  }

  /** Los que cumplen el filtro, estén o no en esta página. */
  marcarTodoElFiltro(): void {
    for (const id of this.idsFiltrados) { this.marcados.add(id); }
    this.refrescarMarcas();
    if (this.idsTruncados) {
      this._toastr.info(
        'Son demasiados para marcarlos todos de una vez: se marcaron los primeros ' + this.idsFiltrados.length + '. Acote el filtro para el resto.',
        'Marcados', { timeOut: 9000, closeButton: true });
    }
  }

  quitarMarcas(): void {
    this.marcados.clear();
    this.refrescarMarcas();
  }

  // ================================================================
  // A QUIÉN VA
  // ================================================================

  /** Emite mientras el modal hijo esté abierto y esta pantalla viva. */
  private hastaQueCierre(modalRef: NgbModalRef): Observable<unknown> {
    return merge(this.destroy$, from(modalRef.result).pipe(catchError(() => of(null))));
  }

  private abrirSelector(ayuda: string, excluidos: number[], alElegir: (u: any) => void): void {
    const modalRef = this.modalService.open(ListUsuariosGruposComponent, { size: 'xl', centered: true, backdrop: 'static' });
    modalRef.componentInstance.ayuda = ayuda;
    modalRef.componentInstance.usuariosExcluidos = excluidos;
    modalRef.componentInstance.seleccionado
      .pipe(takeUntil(this.hastaQueCierre(modalRef)))
      .subscribe(alElegir);
  }

  anadirDestino(): void {
    this.abrirSelector(
      'Haz clic sobre quien se hará cargo de los clientes marcados.',
      this.destinos.map(d => d.id),
      (u: any) => {
        if (this.destinos.some(d => d.id === u.id)) { return; }
        this.destinos = [...this.destinos, { id: u.id, etiqueta: nombreDeUsuario(u) }];
      });
  }

  quitarDestino(id: number): void {
    this.destinos = this.destinos.filter(d => d.id !== id);
  }


  // ================================================================
  // REPARTIR
  // ================================================================

  /** Por qué no se puede repartir todavía, o cadena vacía si sí se puede. */
  get impedimento(): string {
    if (!this.puedeRepartir) { return 'Su perfil puede mirar esta pantalla, pero no repartir.'; }
    if (!this.papelesPermitidos.length) { return 'Su perfil no puede repartir ningún papel.'; }
    if (!this.papelesPermitidos.includes(this.rol)) {
      return 'Su perfil no puede repartir clientes como ' + this.rolNombre.toLowerCase() + '.';
    }
    if (!this.marcados.size) { return 'Marque al menos un cliente.'; }
    if (this.marcados.size > 2000) { return 'Son ' + this.marcados.size + ' clientes y el máximo por tanda es 2000. Acote el filtro.'; }
    return '';
  }

  /**
   * Preguntar antes de mover cientos de filas.
   *
   * El modal sólo contesta sí o no; el trabajo lo hace esta pantalla, que es
   * la que tiene lo marcado y el aviso de carga. `result` se resuelve al
   * confirmar y se rechaza al cancelar o cerrar: de ahí el catch vacío, que
   * es lo normal en ng-bootstrap y no un error que haya que enseñar.
   */
  irAConfirmar(): void {
    this._toastr.clear();
    if (this.impedimento) {
      this._toastr.warning(this.impedimento, 'No se puede repartir todavía', { timeOut: 8000, closeButton: true });
      return;
    }

    const modalRef = this.modalService.open(ConfirmarRepartoComponent, {
      centered: true, size: 'lg', backdrop: 'static', keyboard: true,
    });
    modalRef.componentInstance.clientes        = this.marcados.size;
    modalRef.componentInstance.rolNombre       = this.rolNombre;
    modalRef.componentInstance.reparto         = this.reparteAsi;
    modalRef.componentInstance.quitaResponsable = this.quitaResponsable;
    modalRef.componentInstance.laAgendaCuenta  = this.laAgendaCuenta;
    modalRef.componentInstance.moverAgenda     = this.moverAgenda;

    modalRef.result.then(
      (confirmado: boolean) => { if (confirmado) { this.repartir(); } },
      () => { /* cancelado: no hay nada que hacer */ },
    );
  }

  async repartir(): Promise<void> {
    if (this.impedimento || this.guardando) { return; }

    try {
      this.guardando = true;

      const res: any = await firstValueFrom(this._gestionService.reasignarMasivo({
        ids: Array.from(this.marcados),
        destinos: this.destinos.map(d => d.id),
        rol: this.rol,
        motivo: (this.motivo ?? '').trim() || null,
        mover_agenda: this.laAgendaCuenta ? this.moverAgenda : false,
      }));

      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo repartir', 'Error');
        this.paso = 'elegir';
        return;
      }

      this.resultado = res.data;
      this.paso = 'resultado';

      // LO MARCADO SE QUEDA. Repartir los mismos clientes en varios papeles
      // —el vendedor, luego el cobrador, luego el asistente— es el caso
      // normal, y borrar la selección obligaba a volver a filtrar y marcar
      // 31 clientes por cada papel. Las marcas son ids, así que sobreviven a
      // la recarga aunque la fila deje de salir con el filtro puesto.
      this.cargar(1);

      if ((res.data?.fallidos ?? 0) > 0) {
        this._toastr.warning(res.message, 'Reparto terminado con errores', { timeOut: 12000, closeButton: true });
      } else {
        this._toastr.success(res.message, 'Reparto terminado', { closeButton: true });
      }
    } catch (error) {
      // El AuthInterceptor ya enseña el toast del error HTTP
      console.error('Error al repartir los clientes:', error);
      this.paso = 'elegir';
    } finally {
      this.guardando = false;
    }
  }

  /**
   * Volver a la lista con los mismos clientes marcados.
   *
   * Se van los destinos y el motivo —son de la tanda que acaba de terminar—,
   * pero no las marcas: lo habitual es repartir el mismo grupo en otro papel.
   */
  otraTanda(): void {
    this.resultado = null;
    this.destinos = [];
    this.motivo = '';
    this.paso = 'elegir';
    // La rejilla se repintó mientras se veía el resultado; que las casillas
    // digan la verdad al volver
    this.refrescarMarcas();
  }
}
