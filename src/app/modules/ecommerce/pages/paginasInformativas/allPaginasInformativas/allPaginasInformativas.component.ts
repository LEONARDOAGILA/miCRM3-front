import {
  Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild, inject, ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, firstValueFrom } from 'rxjs';
import {
  CellClickedEvent, GridApi, GridReadyEvent, IRowNode, RowDragEndEvent, RowDragMoveEvent,
} from 'ag-grid-community';
import { AgGridModule, ICellRendererAngularComp } from 'ag-grid-angular';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';

///   SERVICIOS    ///
import { SeguridadService } from '../../../../seguridad/services/seguridad.service';
import { PaginaInformativaService } from '../../../services/paginaInformativa.service';
import { AppPrintPdfService } from '../../../../../service/app-printPdf.service';
import { AppExportExcelService } from '../../../../../service/app-exportExcel.service';
import { AppExportCsvService } from '../../../../../service/app-exportCsv.service';
import { AppAgGridService } from '../../../../../service/app-agGrid.service';
import { LoadingService } from '../../../../../service/loading.service';
import {
  AppDescargaService, PeticionDescarga, AccionDescarga,
} from '../../../../../service/app-descarga.service';

///   MODELOS    ///
import { PaginaInformativaModel } from '../../../interfaces/paginaInformativaModel';
import { AccesoModel } from '../../../../seguridad/interfaces/accesoModel';

///   COMPONENTES    ///
import { SavePaginaInformativaComponent } from '../savePaginaInformativa/savePaginaInformativa.component';
import { PapeleraPaginasInformativasComponent } from '../papeleraPaginasInformativas/papeleraPaginasInformativas.component';
import { AuditoriaModalComponent } from '../../../../../components/auditoria-modal/auditoria-modal.component';
import { CampoBusquedaPaginacionComponent } from '../../../../../components/campos/campoBusquedaPaginacion/campoBusquedaPaginacion.component';
import { MenuContextualComponent, OpcionContextual } from '../../../../../components/menuContextual/menuContextual.component';
import { PanelComponent } from '../../../../../components/panel/panel.component';
import { ActionButtonsComponent } from '../../../../../components/botones/action-buttons/action-buttons.component';
import { FilasEstirablesDirective } from '../../../../../core/directives/filasEstirables.directive';

/**
 * Listado de las páginas de texto de la tienda (ecommerce.paginas_informativas).
 *
 * Términos y condiciones, políticas de datos, garantías, «Conócenos». Se
 * administran desde aquí porque las escribe legal, no sistemas, y porque
 * cambiarlas no puede exigir publicar la tienda otra vez.
 *
 * Mismo esquema que allMarcas: rejilla ag-Grid, barra con buscador / nueva /
 * papelera / auditoría, columna ACCIONES plegable, menú del botón derecho y
 * las tres exportaciones. Toda la lógica de modales vive aquí; el renderer de
 * ACCIONES (ButtonAccionPagina, al final del fichero) sólo delega.
 *
 * DOS COSAS QUE NO SON COMO EN LAS DEMÁS REJILLAS:
 *
 *  · NO PAGINA EN SERVIDOR. Son diez páginas y no van a ser mil: vienen todas
 *    de una vez y la rejilla pagina, filtra y ordena en el navegador, que con
 *    esta cantidad va más rápido que pedir una página de diez filas.
 *
 *  · SE ARRASTRA PARA ORDENAR. Ese orden es el de /documentos en la tienda,
 *    así que tiene que poder cambiarse; ordenar por una columna es sólo mirar
 *    y no se guarda.
 *
 * TODAS LAS PÁGINAS SON IGUALES. Antes cuatro eran «fijas» —las que la tienda
 * tiene en dirección propia— y no se borraban ni se movían. Ya no: se borran
 * y se mueven como las demás, y si se borra una, la dirección que la tienda
 * tiene en su menú se queda en la pantalla de error. Es lo que se pidió.
 *
 * Antes esto era un árbol de carpetas con las páginas colgando y la papelera
 * de dos niveles. Las carpetas se quitaron el 07/11/2026: agrupar diez
 * páginas no justificaba su pantalla, ni la mitad de las funciones de la base.
 */
@Component({
  selector: 'app-allPaginasInformativas',
  templateUrl: './allPaginasInformativas.component.html',
  styleUrls: ['./allPaginasInformativas.component.css'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    CommonModule,
    AgGridModule,
    FilasEstirablesDirective,
    PanelComponent,
    CampoBusquedaPaginacionComponent,
    MenuContextualComponent,
  ],
})
export class AllPaginasInformativasComponent implements OnInit, OnDestroy {

  // ---------- Estado ----------
  /** Permisos del perfil sobre esta pantalla, del resolver de la ruta. */
  public accesoModel!: AccesoModel;
  /** TODAS las páginas: la rejilla se encarga de paginar y filtrar. */
  public paginas: PaginaInformativaModel[] = [];
  /** Fila marcada en la rejilla; habilita el botón de auditoría. */
  public selectedRow: PaginaInformativaModel | null = null;
  /** true mientras la columna ACCIONES está plegada. */
  public accionesPlegadas = false;

  public titulo = 'Páginas informativas';
  public isLoading$;

  // ---------- Paginación (la hace la rejilla) ----------
  public paginaActual = 1;
  public totalRegistros = 0;
  public registrosPorPagina = 10;
  public ultimaPagina = 1;

  // ---------- ag-Grid ----------
  public gridApi!: GridApi;
  public columnDefs: any[] = [];

  public searchTerm = '';
  private filtrosColumna: any = {};
  private limpiando = false;

  private touchStartTime = 0;
  private touchStartX = 0;
  private touchStartY = 0;

  private readonly unsubscribe$ = new Subject<void>();
  private timeoutIds = new Set<any>();
  private resizeTimeoutId: any;

  @ViewChild(CampoBusquedaPaginacionComponent) campoBusquedaPaginacion!: CampoBusquedaPaginacionComponent;
  @ViewChild('menuCtx') menuCtx!: MenuContextualComponent;

  private readonly _paginaService = inject(PaginaInformativaService);
  private readonly _seguridadService = inject(SeguridadService);
  private readonly _appPrintPdfService = inject(AppPrintPdfService);
  private readonly _appExportExcelService = inject(AppExportExcelService);
  private readonly _appExportCsvService = inject(AppExportCsvService);
  private readonly _appDescargaService = inject(AppDescargaService);
  private readonly _loadingService = inject(LoadingService);
  private readonly _toastr = inject(ToastrService);
  public readonly _appAgGridService = inject(AppAgGridService);
  private readonly modal = inject(NgbModal);
  private readonly router = inject(Router);
  private readonly activeRoute = inject(ActivatedRoute);
  private readonly host = inject(ElementRef) as ElementRef<HTMLElement>;

  constructor() {
    this.isLoading$ = this._loadingService.isLoading$;
  }

  /** Referencias estables a los listeners de la cabecera ACCIONES. */
  private headerElement: Element | null = null;
  private readonly onHeaderClick: EventListener = () => this.toggleActionsColumn();
  private readonly onHeaderTouchStart: EventListener = (e) => this.handleTouchStart(e as TouchEvent);
  private readonly onHeaderTouchEnd: EventListener = (e) => this.handleTouchEnd(e as TouchEvent);

  @HostListener('window:resize')
  onResize(): void { this.ajustarTamanoGrid(); }

  // ================================================================
  // CICLO DE VIDA
  // ================================================================

  ngOnInit(): void {
    this.accesoModel = this.activeRoute.snapshot.data['access'];
    this.initializeGrid();
    this.cargar();
  }

  ngOnDestroy(): void {
    this.quitarListenersCabecera();
    this.timeoutIds.forEach(id => clearTimeout(id));
    this.timeoutIds.clear();
    if (this.resizeTimeoutId) { clearTimeout(this.resizeTimeoutId); }
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

  /** setTimeout que se da de baja solo al dispararse. */
  private programar(fn: () => void, ms: number): void {
    const id = setTimeout(() => { this.timeoutIds.delete(id); fn(); }, ms);
    this.timeoutIds.add(id);
  }

  fun_home(): void { this.router.navigate(['/ecommerce/home']); }

  // ================================================================
  // PERMISOS
  // ================================================================

  get puedeCrear(): boolean { return this.accesoModel?.crear === true; }
  get puedeEditar(): boolean { return this.accesoModel?.editar === true; }
  get puedeEliminar(): boolean { return this.accesoModel?.eliminar === true; }

  // ================================================================
  // LA REJILLA
  // ================================================================

  get cuantasColumnasFiltradas(): number {
    return Object.keys(this.filtrosColumna || {}).length;
  }

  get hayFiltro(): boolean {
    return !!this.searchTerm || this.cuantasColumnasFiltradas > 0;
  }

  private initializeGrid(): void {
    this.columnDefs = [
      {
        headerName: 'Id',
        field: 'id',
        cellStyle: { textAlign: 'center' },
        minWidth: 70,
        maxWidth: 70,
        filter: 'agNumberColumnFilter',
      },
      {
        // Segunda columna y PULSABLE: ocultar una página era abrir la ficha
        // entera, bajar la casilla y guardar. Ahora se pulsa aquí.
        headerName: 'Activo',
        field: 'activo',
        cellStyle: { textAlign: 'center' },
        minWidth: 80,
        maxWidth: 80,
        sortable: false,
        filter: false,
        cellRenderer: (params: any) => this.casillaActivo(params),
      },
      {
        // CON EL TIRADOR DE ARRASTRE: este orden es el de /documentos en la
        // tienda. Ordenar por una columna es sólo mirar; arrastrar se guarda.
        headerName: 'Título',
        field: 'titulo',
        cellStyle: { textAlign: 'left', fontWeight: '600' },
        minWidth: 240,
        maxWidth: 460,
        rowDrag: () => this.puedeEditar,
        filter: 'agTextColumnFilter',
      },
      {
        // La imagen de la página. Sin ella, un hueco gris del mismo tamaño:
        // así la fila no cambia de alto según tenga o no.
        headerName: 'Imagen',
        field: 'imagen',
        minWidth: 70,
        maxWidth: 70,
        sortable: false,
        filter: false,
        cellStyle: { display: 'flex', justifyContent: 'center', alignItems: 'center' },
        cellRenderer: (params: any) => {
          const url = String(params.value ?? '').trim();
          if (!url) {
            return '<span class="lista-foto lista-foto--vacia"><i class="fa fa-image"></i></span>';
          }
          return `<img src="${url}" alt="" class="lista-foto"
                       onerror="this.onerror=null; this.outerHTML='<span class=\\'lista-foto lista-foto--vacia\\'><i class=\\'fa fa-image\\'></i></span>'" />`;
        },
      },
      {
        // La dirección por la que la pide la tienda. En monoespaciada: es una
        // dirección, no una frase, y así se ve dónde lleva un guion.
        headerName: 'Dirección',
        field: 'clave',
        cellStyle: { textAlign: 'left', fontFamily: 'monospace', fontSize: '12px' },
        minWidth: 180,
        maxWidth: 280,
        filter: 'agTextColumnFilter',
        cellRenderer: (params: any) => {
          const clave = String(params.value ?? '');
          return `<span title="En la tienda: /paginas/${clave}">/paginas/${clave}</span>`;
        },
      },
      {
        headerName: 'Orden',
        field: 'orden',
        cellStyle: { textAlign: 'center' },
        minWidth: 80,
        maxWidth: 90,
        filter: false,
      },
      {
        headerName: 'Creado',
        field: 'created_at',
        cellStyle: { textAlign: 'center' },
        minWidth: 150,
        maxWidth: 180,
        filter: 'agTextColumnFilter',
      },
      {
        headerName: 'Actualizado',
        field: 'updated_at',
        cellStyle: { textAlign: 'center' },
        minWidth: 150,
        maxWidth: 180,
        filter: 'agTextColumnFilter',
      },
      {
        headerName: 'Creado por',
        field: 'created_by',
        cellStyle: { textAlign: 'left' },
        minWidth: 130,
        maxWidth: 200,
        sortable: false,
        filter: 'agTextColumnFilter',
      },
      {
        headerName: 'Actualizado por',
        field: 'updated_by',
        cellStyle: { textAlign: 'left' },
        minWidth: 130,
        maxWidth: 200,
        sortable: false,
        filter: 'agTextColumnFilter',
      },
      {
        headerName: 'ACCIONES',
        field: 'actions',
        cellStyle: { display: 'flex', justifyContent: 'center', alignItems: 'center' },
        cellRenderer: ButtonAccionPagina,
        pinned: 'right',
        minWidth: AllPaginasInformativasComponent.ANCHO_ACCIONES_ABIERTA,
        maxWidth: AllPaginasInformativasComponent.ANCHO_ACCIONES_ABIERTA,
        suppressHeaderMenuButton: true,
        sortable: false,
        filter: false,
        resizable: false,
        headerComponentParams: {
          template: `
            <div style="display: flex; align-items: center; justify-content: center; gap: 5px;" title="Ocultar los botones de acción">
              <span>ACCIONES</span>
              <i class="fas fa-arrow-right"></i>
            </div>
          `,
        },
      },
    ];
  }

  onGridReady(params: GridReadyEvent): void {
    this.gridApi = params.api;
    this.gridApi.setGridOption('rowData', this.paginas);
    this.programar(() => this.montarListenersCabecera(), 500);
    this._appAgGridService.ajustarTamanoGrid(this.gridApi);
    this.ajustarAlturaGrid();
    this.refrescarPaginacion();
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

  handleTouchStart(e: TouchEvent): void {
    this.touchStartTime = Date.now();
    this.touchStartX = e.touches[0].clientX;
    this.touchStartY = e.touches[0].clientY;
  }

  handleTouchEnd(e: TouchEvent): void {
    const duracion = Date.now() - this.touchStartTime;
    const distX = Math.abs(e.changedTouches[0].clientX - this.touchStartX);
    const distY = Math.abs(e.changedTouches[0].clientY - this.touchStartY);
    if (duracion < 300 && distX < 10 && distY < 10) {
      this.toggleActionsColumn();
      e.preventDefault();
    }
  }

  private static readonly ANCHO_ACCIONES_ABIERTA = 110;
  private static readonly ANCHO_ACCIONES_PLEGADA = 50;

  /** Pliega o despliega la columna ACCIONES (pulsando su cabecera). */
  toggleActionsColumn(): void {
    const columnDefs = this.gridApi.getColumnDefs() as any[];
    const actionsCol = columnDefs.find(col => col.field === 'actions');
    if (!actionsCol) { return; }

    const estabaPlegada = actionsCol.minWidth === AllPaginasInformativasComponent.ANCHO_ACCIONES_PLEGADA;
    this.accionesPlegadas = !estabaPlegada;

    const ancho = estabaPlegada
      ? AllPaginasInformativasComponent.ANCHO_ACCIONES_ABIERTA
      : AllPaginasInformativasComponent.ANCHO_ACCIONES_PLEGADA;
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
          </div>`,
    };

    this.gridApi.setGridOption('columnDefs', columnDefs);
    this.gridApi.sizeColumnsToFit();
    this.programar(() => {
      this.gridApi.sizeColumnsToFit();
      this.montarListenersCabecera();
    }, 100);
  }

  ajustarTamanoGrid(): void {
    if (!this.gridApi) { return; }
    if (this.resizeTimeoutId) { clearTimeout(this.resizeTimeoutId); }
    this.resizeTimeoutId = setTimeout(() => {
      this._appAgGridService.ajustarTamanoGrid(this.gridApi);
      this.ajustarAlturaGrid();
    }, 100);
  }

  /** La rejilla llega hasta el final de la ventana, menos la paginación. */
  ajustarAlturaGrid(): void {
    const grid = this.host.nativeElement.querySelector('.ag-theme-alpine') as HTMLElement | null;
    if (!grid || !this.gridApi) { return; }
    const MARGEN_INFERIOR = 60;
    const alto = window.innerHeight - grid.getBoundingClientRect().top - MARGEN_INFERIOR;
    grid.style.height = `${alto}px`;
    this.gridApi.sizeColumnsToFit();
  }

  /** ↑ / ↓ seleccionan la fila como un clic. */
  navegarConTeclado = this._appAgGridService.navegacionConFlechas(
    (fila: any) => this.selectedRow = fila);

  public rowClassRules = this._appAgGridService.reglasFilaInactiva('activo');

  // ================================================================
  // LA CASILLA DE «ACTIVO»
  // ================================================================

  private readonly activoEnVuelo = new Set<number>();

  private casillaActivo(params: any): string {
    return this._appAgGridService.casillaActivo(params, {
      puede: this.puedeEditar,
      enVuelo: this.activoEnVuelo,
      que: 'página',
    });
  }

  /**
   * Activar o desactivar desde la casilla, sin abrir la ficha.
   *
   * Lo escribe una función del servidor que toca SÓLO esa columna. Guardar la
   * ficha entera para bajar una casilla revalidaría el texto, y una página
   * cargada antes de que existiera alguna regla no se podría ocultar hasta
   * arreglarle todo lo demás.
   */
  cambiarActivo(fila: PaginaInformativaModel | null, nodo?: IRowNode | null): void {
    if (!fila || this._seguridadService.isexpired()) { return; }

    this._appAgGridService.alternarActivo({
      gridApi: this.gridApi,
      filas: this.paginas,
      fila, nodo,
      campo: 'activo',
      enVuelo: this.activoEnVuelo,
      puede: this.puedeEditar,
      que: 'página',
      llamar: (id: any, activo: boolean) => this._paginaService.activarPaginaInformativa(id, activo),
      nombre: (f: any) => f.titulo,
      hasta: this.unsubscribe$,
    });
  }

  onCellClicked(e: CellClickedEvent): void {
    this.selectedRow = e.data;

    const origen = e.event?.target as HTMLElement | null;
    if (origen?.closest('[data-accion="activo"]')) {
      this.cambiarActivo(e.data, e.node);
    }
  }

  // ================================================================
  // DATOS
  // ================================================================

  /** Todas las páginas de una vez: son diez y no van a ser mil. */
  async cargar(): Promise<void> {
    try {
      this._loadingService.setLoading(true);

      const res: any = await firstValueFrom(this._paginaService.allPaginasInformativas());
      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo obtener el listado de páginas', 'Error');
        return;
      }

      this.paginas = res.data ?? [];
      this.totalRegistros = this.paginas.length;
      this.gridApi?.setGridOption('rowData', this.paginas);
      this.selectedRow = null;
      this.refrescarPaginacion();
      this.programar(() => this.ajustarAlturaGrid(), 0);

    } catch (error) {
      // El AuthInterceptor ya muestra el toast del error HTTP
      console.error('Error al cargar las páginas informativas:', error);
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  // ================================================================
  // EL ORDEN
  // ================================================================

  /**
   * Se soltó una fila: se coloca donde se soltó y el orden nuevo se guarda
   * entero.
   *
   * EL MOVIMIENTO LO HACEMOS NOSOTROS, no ag-Grid. El suyo —el «managed»— no
   * convive con la paginación y la deja sin tirador: lo dice él mismo por la
   * consola. Aquí se mueve el elemento en la lista y se vuelve a pintar, que
   * es lo que aquél haría.
   *
   * Se manda la lista COMPLETA y no sólo la que se movió, porque mover una
   * cambia la posición de todas las de debajo. El servidor las numera en el
   * orden en que llegan.
   *
   * NO SE PUEDE ARRASTRAR CON LA REJILLA ORDENADA POR UNA COLUMNA: lo que se
   * ve entonces no es el orden guardado, y soltar ahí guardaría un orden que
   * nadie pidió.
   */
  async alSoltarFila(evento: RowDragEndEvent): Promise<void> {
    this.finDelArrastre();
    if (!this.puedeEditar) { return; }

    const movida = evento.node?.data;
    const sobre  = evento.overNode?.data;
    if (!movida || !sobre || movida.id === sobre.id) { return; }

    const hayOrdenDeColumna = (this.gridApi.getColumnState() ?? []).some(c => !!c.sort);
    if (hayOrdenDeColumna) {
      this._toastr.info('Quite el orden de la columna para poder reordenar arrastrando', 'Orden');
      return;
    }

    const desde = this.paginas.findIndex(p => p.id === movida.id);
    const hasta = this.paginas.findIndex(p => p.id === sobre.id);
    if (desde < 0 || hasta < 0) { return; }

    const [fila] = this.paginas.splice(desde, 1);
    this.paginas.splice(hasta, 0, fila);
    this.gridApi.setGridOption('rowData', [...this.paginas]);

    const ids = this.paginas.map(p => p.id);
    if (!ids.length) { return; }

    try {
      await firstValueFrom(this._paginaService.ordenarPaginasInformativas(ids));
      // Sin aviso de éxito: arrastrar y ver que se queda donde se soltó ya es
      // la confirmación, y un toast por movimiento es ruido.
      await this.cargar();
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo guardar el orden', 'Error',
                         { timeOut: 15000, closeButton: true });
      await this.cargar();
    }
  }

  // ---------- DÓNDE VA A CAER ----------
  // Las mismas marcas que «Menús»: una línea azul en el borde de la fila sobre
  // la que se está pasando. Allí hay además un resaltado para «dentro de», que
  // aquí no tiene sentido: una página no cuelga de otra, la lista es plana.
  //
  // LA LÍNEA VA DEL LADO AL QUE DE VERDAD CAE. Soltar sobre una fila es
  // ocupar su sitio, así que bajando se queda DEBAJO de ella y subiendo
  // ENCIMA. Se saca de las posiciones y no de dónde esté el cursor dentro de
  // la fila: así la línea no promete una cosa y el guardado hace otra.

  /** Las filas marcadas ahora mismo (son varias: la rejilla fija ACCIONES a la derecha). */
  private filasDestino: HTMLElement[] = [];

  /**
   * Hay una fila en el aire.
   *
   * MIENTRAS DURE NO SE SELECCIONA TEXTO. Esta rejilla deja seleccionar el
   * texto de las celdas (`enableCellTextSelection`), y arrastrar es también
   * apretar y mover: sin esto, al llevarse una fila se iba pintando de azul
   * media lista. En «Menús» no pasa porque allí esa opción no está puesta.
   */
  public arrastrando = false;

  alEntrarArrastre(): void {
    this.arrastrando = true;
    // Lo que se haya alcanzado a seleccionar antes de que entrara la clase
    window.getSelection()?.removeAllRanges();
  }

  alMoverFila(evento: RowDragMoveEvent): void {
    this.quitarFilaDestino();
    if (!this.puedeEditar) { return; }

    const movida = evento.node?.data;
    const sobre  = evento.overNode?.data;
    if (!movida || !sobre || movida.id === sobre.id) { return; }

    // Con la rejilla ordenada por una columna no se reordena: tampoco se
    // marca nada, que sería prometer un movimiento que no va a pasar
    if ((this.gridApi.getColumnState() ?? []).some(c => !!c.sort)) { return; }

    const desde = this.paginas.findIndex(p => p.id === movida.id);
    const hasta = this.paginas.findIndex(p => p.id === sobre.id);
    if (desde < 0 || hasta < 0) { return; }

    const indice = evento.overIndex;
    if (indice == null || indice < 0) { return; }

    const clase = hasta > desde ? 'fila-insertar-despues' : 'fila-insertar-antes';
    // Todas las partes de la fila: el centro y lo que esté fijado a los lados
    this.filasDestino = Array.from(
      this.host.nativeElement.querySelectorAll<HTMLElement>(`.ag-row[row-index="${indice}"]`));
    this.filasDestino.forEach(fila => fila.classList.add(clase));
  }

  /** Salió de la rejilla sin soltar. */
  alSalirDeLaRejilla(): void {
    this.finDelArrastre();
  }

  private quitarFilaDestino(): void {
    this.filasDestino.forEach(fila =>
      fila.classList.remove('fila-insertar-antes', 'fila-insertar-despues'));
    this.filasDestino = [];
  }

  /** Se acabó el arrastre, con o sin soltar: vuelve a poder seleccionarse texto. */
  private finDelArrastre(): void {
    this.arrastrando = false;
    this.quitarFilaDestino();
  }

  // ================================================================
  // BUSCADOR Y FILTROS
  // ================================================================

  onFilterTextBoxChanged(valor: string): void {
    this.searchTerm = valor ?? '';
    this.gridApi?.setGridOption('quickFilterText', this.searchTerm);
    this.refrescarPaginacion();
  }

  onFiltroColumna(): void {
    if (this.limpiando) { return; }
    this.filtrosColumna = this.gridApi?.getFilterModel() ?? {};
    this.refrescarPaginacion();
  }

  clearAllFilters(): void {
    if (!this.hayFiltro) { return; }

    const habiaColumnas = this.cuantasColumnasFiltradas > 0;

    this.limpiando = true;
    this.campoBusquedaPaginacion?.reset();
    this.searchTerm = '';
    this.filtrosColumna = {};
    this.gridApi?.setGridOption('quickFilterText', '');
    if (habiaColumnas) { this.gridApi?.setFilterModel(null); }

    this.programar(() => { this.limpiando = false; this.refrescarPaginacion(); }, 0);
  }

  // ================================================================
  // PAGINACIÓN (la hace la rejilla, los botones son los de la casa)
  // ================================================================

  /** Lo que dicen los botones de abajo, leído de la rejilla. */
  private refrescarPaginacion(): void {
    if (!this.gridApi) { return; }
    this.paginaActual  = this.gridApi.paginationGetCurrentPage() + 1;
    this.ultimaPagina  = Math.max(1, this.gridApi.paginationGetTotalPages());
    this.totalRegistros = this.gridApi.paginationGetRowCount();
  }

  onPaginationChanged(): void { this.refrescarPaginacion(); }

  get desde(): number {
    return this.totalRegistros === 0 ? 0 : (this.paginaActual - 1) * this.registrosPorPagina + 1;
  }

  get hasta(): number {
    return Math.min(this.paginaActual * this.registrosPorPagina, this.totalRegistros);
  }

  firstPage(): void { this.gridApi?.paginationGoToFirstPage(); }
  prevPage(): void { this.gridApi?.paginationGoToPreviousPage(); }
  nextPage(): void { this.gridApi?.paginationGoToNextPage(); }
  ultimaPagina2(): void { this.gridApi?.paginationGoToLastPage(); }

  // ================================================================
  // IMPRESIÓN Y EXPORTACIÓN
  // ================================================================

  private readonly CABECERAS_REPORTE = ['ID', 'Título', 'Dirección', 'Orden', 'Estado'];

  private filasReporte(filas: any[]): any[][] {
    return (filas ?? []).map(p => [
      p.id,
      p.titulo,
      '/paginas/' + p.clave,
      p.orden,
      p.activo ? 'Activa' : 'Oculta',
    ]);
  }

  private peticionDescarga(accion: AccionDescarga): PeticionDescarga<any> {
    return {
      accion,
      nombrePlural: 'páginas',
      tituloBase: 'Listado de Páginas Informativas',
      gridApi: this.gridApi,
      filasDePagina: this.paginas,
      total: this.totalRegistros,
      pagina: this.paginaActual,
      ultimaPagina: this.ultimaPagina,
      busqueda: this.searchTerm,
      filtrosColumna: this.filtrosColumna,
      columnDefs: this.columnDefs,
      // Ya están todas aquí: no hay segunda llamada que hacer
      traerTodo: async () => this.paginas,
    };
  }

  async printPdf(): Promise<void> {
    const salida = await this._appDescargaService.preparar(this.peticionDescarga('imprimir'));
    if (!salida) { return; }
    this._appPrintPdfService.generarReporte({
      tamanoPapel: 'A4',
      orientacion: 'p',
      title: 'Reporte de Páginas Informativas',
      titleTable: salida.titulo,
      headers: this.CABECERAS_REPORTE,
      data: this.filasReporte(salida.filas),
      piePagina: 'Pie de página - Mi Empresa en Desarrollo S.A....',
    });
  }

  async exportExcel(): Promise<void> {
    const salida = await this._appDescargaService.preparar(this.peticionDescarga('excel'));
    if (!salida) { return; }
    this._appExportExcelService.generarReporteExcel({
      tamanoPapel: 'A4',
      orientacion: 'p',
      title: 'Reporte de Páginas Informativas',
      titleTable: salida.titulo,
      headers: this.CABECERAS_REPORTE,
      data: this.filasReporte(salida.filas),
      piePagina: 'Pie de página - Mi Empresa en Desarrollo S.A....',
    });
  }

  async exportCsv(): Promise<void> {
    const salida = await this._appDescargaService.preparar(this.peticionDescarga('csv'));
    if (!salida) { return; }
    this._appExportCsvService.generarReporteCSV({
      headers: this.CABECERAS_REPORTE,
      data: this.filasReporte(salida.filas),
    });
  }

  // ================================================================
  // ACCIONES (modales)
  // ================================================================

  private abrirModal(registro: any, accion: 'add' | 'edit' | 'view'): NgbModalRef {
    const ref = this.modal.open(SavePaginaInformativaComponent, {
      centered: true,
      size: 'xl',
      backdrop: 'static',
      keyboard: accion === 'view',
    });
    ref.componentInstance.registro_selected = registro;
    ref.componentInstance.accion = accion;
    return ref;
  }

  addPagina(): void {
    if (this._seguridadService.isexpired() || !this.puedeCrear) { return; }
    this.abrirModal({}, 'add').result.then(() => this.cargar(), () => { /* se cerró sin guardar */ });
  }

  editPagina(registro: any): void {
    if (this._seguridadService.isexpired()) { return; }
    this.abrirModal(registro, this.puedeEditar ? 'edit' : 'view')
        .result.then(() => this.cargar(), () => { /* se cerró sin guardar */ });
  }

  viewPagina(registro: any): void {
    if (this._seguridadService.isexpired()) { return; }
    this.abrirModal(registro, 'view').result.then(() => { }, () => { });
  }

  /** La página, abierta en la tienda, en otra pestaña. */
  verEnLaTienda(registro: any): void {
    const clave = String(registro?.clave ?? '').trim();
    if (!clave) { return; }
    // `noopener` es obligatorio: sin él la página que se abre puede tocar
    // ésta a través de window.opener.
    window.open('/paginas/' + clave, '_blank', 'noopener');
  }

  async deletePagina(registro: any): Promise<void> {
    if (this._seguridadService.isexpired() || !this.puedeEliminar) { return; }

    if (!confirm(`¿Enviar «${registro.titulo}» a la papelera?\n\n`
                 + 'Dejará de verse en la tienda. Se puede restaurar desde la papelera.')) {
      return;
    }

    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._paginaService.deletePaginaInformativa(registro.id));
      this._toastr.success(res?.message ?? 'Enviada a la papelera', 'Listo');
      await this.cargar();
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo eliminar la página', 'Error',
                         { timeOut: 15000, closeButton: true });
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  abrirPapelera(): void {
    if (this._seguridadService.isexpired()) { return; }

    const ref = this.modal.open(PapeleraPaginasInformativasComponent, {
      size: 'lg', backdrop: 'static', centered: true,
    });
    ref.componentInstance.puedeVaciar = this.accesoModel?.vaciar === true;

    // Sólo se recarga si de verdad se restauró o se vació algo
    ref.result.then((hubo: boolean) => { if (hubo) { this.cargar(); } }, () => { /* cerrada */ });
  }

  /** Historial de auditoría de la fila marcada (tabla paginas_informativas). */
  auditoria(): void {
    if (!this.selectedRow || this._seguridadService.isexpired()) { return; }
    const ref = this.modal.open(AuditoriaModalComponent, {
      centered: true, size: 'xl', backdrop: 'static', keyboard: true,
    });
    ref.componentInstance.tablaNombre = 'paginas_informativas';
    ref.componentInstance.registroId = this.selectedRow.id;
  }

  // ================================================================
  // MENÚ DEL BOTÓN DERECHO
  // ================================================================

  public opcionesContextuales: OpcionContextual[] = [];
  private filaContextual: any = null;

  onContextMenuGrilla(e: MouseEvent): void {
    const celda = (e.target as HTMLElement)?.closest('.ag-row');
    if (!celda) { return; }

    const id = celda.getAttribute('row-id');
    const fila = this.paginas.find(p => String(p.id) === String(id));
    if (!fila) { return; }

    this.selectedRow = fila;
    this.filaContextual = fila;
    this.opcionesContextuales = this.opcionesPara(fila);
    this.menuCtx?.abrir(e);
  }

  /** Qué se puede hacer con esta página, según el perfil. */
  private opcionesPara(fila: any): OpcionContextual[] {
    const puedeVer     = this.accesoModel?.ver     === true;
    const puedeAuditar = this.accesoModel?.auditar === true;

    return [
      { id: 'ver',    texto: 'Ver',       icono: 'fa-eye', visible: puedeVer },
      { id: 'editar', texto: 'Modificar', icono: 'fa-pen', visible: this.puedeEditar },
      {
        id: 'activo', texto: fila?.activo ? 'Ocultar en la tienda' : 'Mostrar en la tienda',
        icono: fila?.activo ? 'fa-toggle-off' : 'fa-toggle-on',
        separadorAntes: true, visible: this.puedeEditar,
        ayuda: fila?.activo ? 'Dejar de verse, sin borrarla' : 'Volver a verse en la tienda',
      },
      {
        id: 'tienda', texto: 'Abrir en la tienda', icono: 'fa-up-right-from-square',
        visible: true, ayuda: 'Ver cómo queda para el visitante',
      },
      {
        id: 'auditoria', texto: 'Auditoría', icono: 'fa-user-secret',
        separadorAntes: true, visible: puedeAuditar,
      },
      {
        id: 'eliminar', texto: 'Enviar a la papelera', icono: 'fa-trash-can',
        visible: this.puedeEliminar,
      },
    ];
  }

  alElegirContextual(id: string): void {
    const fila = this.filaContextual;
    if (!fila) { return; }
    switch (id) {
      case 'ver':       this.viewPagina(fila); break;
      case 'editar':    this.editPagina(fila); break;
      case 'activo':    this.cambiarActivo(fila); break;
      case 'tienda':    this.verEnLaTienda(fila); break;
      case 'auditoria': this.auditoria(); break;
      case 'eliminar':  this.deletePagina(fila); break;
    }
  }
}

// ============================================================
// EL RENDERER DE LA COLUMNA ACCIONES
// ============================================================
// Sólo delega en el componente de la pantalla: aquí no hay lógica, y así los
// botones son los mismos que en las demás rejillas de la casa.
@Component({
  selector: 'app-button-accion-pagina',
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
      <app-action-buttons
        [accesoModel]="parent.accesoModel"
        [buttonView]="true"
        [buttonEdit]="true"
        [buttonDelete]="true"
        (view)="parent.viewPagina(params.data)"
        (edit)="parent.editPagina(params.data)"
        (delete)="parent.deletePagina(params.data)">
      </app-action-buttons>
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .acciones-desplegar {
      width: 28px;
      height: 24px;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: .25rem;
    }
  `],
})
export class ButtonAccionPagina implements ICellRendererAngularComp {
  public params: any;

  constructor(public parent: AllPaginasInformativasComponent) { }

  agInit(params: any): void { this.params = params; }

  refresh(params: any): boolean { this.params = params; return true; }
}
