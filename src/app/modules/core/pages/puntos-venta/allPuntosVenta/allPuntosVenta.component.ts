import {
  Component, ElementRef, EventEmitter, HostListener, OnDestroy, OnInit, ViewChild, inject,
} from '@angular/core';

import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { Subject, firstValueFrom, from, merge, of } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';
import { AgGridModule, ICellRendererAngularComp } from 'ag-grid-angular';
import { CellClickedEvent, GridApi, GridReadyEvent, RowClassParams, RowNode } from 'ag-grid-community';

///   COMPONENTES COMUNES    ///
import { PanelComponent } from '../../../../../components/panel/panel.component';
import { ActionButtonsComponent } from '../../../../../components/botones/action-buttons/action-buttons.component';
import { CampoBusquedaPaginacionComponent }
  from '../../../../../components/campos/campoBusquedaPaginacion/campoBusquedaPaginacion.component';
import { MenuContextualComponent, OpcionContextual }
  from '../../../../../components/menuContextual/menuContextual.component';
import { AuditoriaModalComponent } from '../../../../../components/auditoria-modal/auditoria-modal.component';

///   SERVICIOS    ///
import { SeguridadService } from '../../../../seguridad/services/seguridad.service';
import { PuntoVentaService } from '../../../services/puntoVenta.service';
import { SucursalService } from '../../../services/sucursal.service';
import { AppPrintPdfService } from '../../../../../service/app-printPdf.service';
import { AppExportExcelService } from '../../../../../service/app-exportExcel.service';
import { AppExportCsvService } from '../../../../../service/app-exportCsv.service';
import { AppAgGridService } from '../../../../../service/app-agGrid.service';
import { LoadingService } from '../../../../../service/loading.service';

///   MODELOS    ///
import { AccesoModel } from '../../../../seguridad/interfaces/accesoModel';
import { PuntoVentaModel } from '../../../interfaces/puntoVentaModel';

///   PANTALLAS DE ESTE MÓDULO    ///
import { SavePuntoVentaComponent } from '../savePuntoVenta/savePuntoVenta.component';
import { DeletePuntoVentaComponent } from '../deletePuntoVenta/deletePuntoVenta.component';
import { PapeleraPuntosVentaComponent } from '../papeleraPuntosVenta/papeleraPuntosVenta.component';
import { FilasEstirablesDirective } from '../../../../../core/directives/filasEstirables.directive';
import { CommonModule } from '@angular/common';

/**
 * Las cajas de cada sucursal, EN DOS COLUMNAS: las tiendas a la izquierda y
 * sus puntos de venta a la derecha.
 *
 * POR QUÉ ASÍ. Un punto de venta no significa nada suelto: significa «la
 * caja 2 de tal tienda». Con una sola rejilla había que leer la columna de
 * sucursal fila por fila para saber qué tiene cada una, y al crear una caja
 * nueva había que acordarse de elegir la tienda. Aquí se pulsa la tienda, se
 * ve lo que tiene, y el botón de añadir ya sabe dónde va.
 *
 * A la izquierda, además, cada tienda dice cuántas cajas tiene y cuántas
 * están incompletas: eso contesta de un vistazo la pregunta con la que se
 * entra, que es «¿dónde me falta trabajo?».
 *
 * SIN PAGINAR EN EL SERVIDOR, a diferencia de clientes o proformas: una
 * empresa tiene decenas de cajas, no miles. Vienen todas de una vez, así que
 * elegir tienda, buscar y filtrar son instantáneos y no van al servidor.
 *
 * LA COLUMNA QUE IMPORTA ES «CUENTAS». Una caja a la que no se le ha resuelto
 * la cuenta de efectivo no puede asentar nada, y eso no se puede descubrir el
 * día del cierre: se ve aquí, en rojo, desde el primer momento.
 */
@Component({
  selector: 'app-allPuntosVenta',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    AgGridModule,
    FilasEstirablesDirective,
    PanelComponent,
    CampoBusquedaPaginacionComponent,
    MenuContextualComponent
],
  templateUrl: './allPuntosVenta.component.html',
  styleUrls: ['./allPuntosVenta.component.css'],
})
export class AllPuntosVentaComponent implements OnInit, OnDestroy {

  /** Permisos del perfil sobre esta pantalla, del resolver de la ruta. */
  public accesoModel: AccesoModel;
  public puntoVentaModel: PuntoVentaModel[] = [];
  public selectedRow: PuntoVentaModel | null = null;
  public accionesPlegadas = false;

  // ================================================================
  // LA COLUMNA DE LA IZQUIERDA: LAS TIENDAS
  // ================================================================

  /** Todas las sucursales, también las inactivas (pueden tener cajas). */
  public sucursales: Array<{ id: number; nombre: string; codigo?: string; activo?: boolean }> = [];

  /** Cuál se está mirando. null = todas. */
  public sucursalElegida: number | null = null;

  /**
   * Lo escrito en el buscador de tiendas.
   *
   * Filtra SÓLO la lista de la izquierda, en el navegador: están todas
   * cargadas y son pocas, así que escribir y ver el resultado es
   * instantáneo. Lo de la derecha no se toca: la tienda elegida sigue
   * elegida aunque el filtro la esconda.
   */
  public busquedaSucursal = '';

  /** Sin tildes y en minúsculas, para que «Totoracocha» salga al escribir «toto». */
  private sinTildes(t: string): string {
    return String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  /** Las tiendas que pasan el buscador (por código o por nombre). */
  get sucursalesVisibles(): Array<{ id: number; nombre: string; codigo?: string; activo?: boolean }> {
    const q = this.sinTildes(this.busquedaSucursal).trim();
    if (!q) { return this.sucursales; }
    return this.sucursales.filter(s =>
      this.sinTildes(s.codigo ?? '').includes(q) || this.sinTildes(s.nombre).includes(q));
  }

  limpiarBusquedaSucursal(): void {
    this.busquedaSucursal = '';
  }

  /**
   * El filtro de la rejilla por sucursal.
   *
   * Se hace con el filtro EXTERNO de ag-Grid y no cambiando `rowData`: así
   * las filas siguen siendo las mismas —con sus nodos— y lo que se edite o
   * se borre sigue encontrándose aunque haya una tienda elegida.
   */
  public readonly hayFiltroExterno = () => this.sucursalElegida != null;
  public readonly pasaFiltroExterno = (nodo: any) =>
    this.sucursalElegida == null || nodo?.data?.sucursal_id === this.sucursalElegida;

  public titulo = 'Puntos de Venta';
  public isLoading$ = this._loadingService.isLoading$;

  /** Lo escrito en el buscador: la rejilla filtra sola (están todas las filas). */
  public searchTerm = '';

  public gridApi!: GridApi;
  /** Para esconder la columna de sucursal cuando ya hay una elegida. */
  public columnApi: any;
  public columnDefs: any[] = [];

  private touchStartTime = 0;
  private touchStartX = 0;
  private touchStartY = 0;

  private readonly unsubscribe$ = new Subject<void>();
  private timeoutIds = new Set<any>();
  private resizeTimeoutId: any;

  /** Las cajas cuya casilla «Activo» se está guardando ahora mismo. */
  private readonly activoEnVuelo = new Set<number>();

  private programar(fn: () => void, ms: number): void {
    const id = setTimeout(() => { this.timeoutIds.delete(id); fn(); }, ms);
    this.timeoutIds.add(id);
  }

  private headerElement: Element | null = null;
  private readonly onHeaderClick: EventListener = () => this.toggleActionsColumn();
  private readonly onHeaderTouchStart: EventListener = (e) => this.handleTouchStart(e as TouchEvent);
  private readonly onHeaderTouchEnd: EventListener = (e) => this.handleTouchEnd(e as TouchEvent);

  @HostListener('window:resize')
  onResize(): void { this.ajustarTamanoGrid(); }

  @ViewChild(CampoBusquedaPaginacionComponent) campoBusqueda!: CampoBusquedaPaginacionComponent;

  // ================================================================
  // MENÚ DEL BOTÓN DERECHO
  // ================================================================

  @ViewChild('menuCtx') menuCtx!: MenuContextualComponent;
  public opcionesContextuales: OpcionContextual[] = [];

  /**
   * Sobre qué se pulsó el botón derecho.
   *
   * Las dos columnas comparten el mismo menú —uno solo, y el que se abre
   * sabe dónde está— porque dos componentes de menú en la misma pantalla se
   * pisan al cerrarse. Lo que cambia son las opciones y a dónde van.
   */
  private contextoEs: 'caja' | 'sucursal' = 'caja';
  /** La tienda sobre la que se pulsó con el derecho. */
  private sucursalContextual: { id: number; nombre: string; codigo?: string } | null = null;

  onContextMenuGrilla(e: MouseEvent): void {
    const fila = this._appAgGridService.filaDeEventoEnGrilla(e, this.gridApi);
    if (!fila) { return; }          // fuera de las filas: el menú del navegador

    e.preventDefault();
    this.contextoEs = 'caja';
    this.selectedRow = fila;
    this._appAgGridService.marcarFila(this.gridApi, fila);
    this.opcionesContextuales = this.opcionesPara();
    this.menuCtx?.abrir(e);
  }

  /**
   * Clic derecho sobre una tienda de la columna izquierda.
   *
   * Aquí sí hace falta el `$event` de la fila —no se resuelve desde el DOM
   * como en la rejilla— porque cada tienda es su propio botón.
   */
  onContextMenuSucursal(e: MouseEvent, s: { id: number; nombre: string; codigo?: string } | null): void {
    e.preventDefault();
    e.stopPropagation();

    this.contextoEs = 'sucursal';
    this.sucursalContextual = s;
    this.opcionesContextuales = s
      ? this.opcionesParaSucursal(s)
      // Sobre «Todas» sólo tienen sentido estas dos
      : [
          { id: 'suc-ver',      texto: 'Ver todas las sucursales', icono: 'fa-layer-group' },
          { id: 'suc-recargar', texto: 'Recargar', icono: 'fa-rotate', separadorAntes: true },
        ];
    this.menuCtx?.abrir(e);
  }

  /** Lo que se puede hacer con una tienda desde la columna izquierda. */
  private opcionesParaSucursal(s: { id: number; nombre: string }): OpcionContextual[] {
    const esLaElegida = this.sucursalElegida === s.id;
    return [
      { id: 'suc-ver', texto: esLaElegida ? 'Ver todas las sucursales' : 'Ver sólo ésta',
        icono: esLaElegida ? 'fa-layer-group' : 'fa-filter',
        ayuda: esLaElegida ? 'Quitar el filtro' : 'Filtrar las cajas de ' + s.nombre },
      { id: 'suc-nueva', texto: 'Nuevo punto de venta aquí', icono: 'fa-plus',
        visible: this.accesoModel?.crear === true,
        ayuda: 'Una caja nueva en ' + s.nombre },
      { id: 'suc-recargar', texto: 'Recargar', icono: 'fa-rotate',
        separadorAntes: true, ayuda: 'Volver a traer las cajas' },
    ];
  }

  private opcionesPara(): OpcionContextual[] {
    return [
      { id: 'ver',      texto: 'Ver',       icono: 'fa-eye',
        visible: this.accesoModel?.ver !== false },
      { id: 'editar',   texto: 'Modificar', icono: 'fa-pen',
        visible: this.accesoModel?.editar === true,
        ayuda: 'Los datos de la caja y sus cuentas contables' },
      { id: 'clonar',   texto: 'Clonar',    icono: 'fa-clone',
        visible: this.accesoModel?.crear === true,
        ayuda: 'Otra caja en la misma sucursal, con el siguiente número' },
      { id: 'eliminar', texto: 'Eliminar',  icono: 'fa-trash',
        peligro: true, separadorAntes: true,
        visible: this.accesoModel?.eliminar === true },
      { id: 'auditoria', texto: 'Ver auditoría', icono: 'fa-user-secret',
        separadorAntes: true,
        visible: this.accesoModel?.auditar === true,
        ayuda: 'Quién tocó esta caja y cuándo' },
    ];
  }

  alElegirContextual(id: string): void {
    // Las opciones de la columna de tiendas van por su cuenta: no necesitan
    // una fila marcada en la rejilla
    if (this.contextoEs === 'sucursal') {
      const s = this.sucursalContextual;   // null = se pulsó sobre «Todas»
      switch (id) {
        case 'suc-ver':
          this.elegirSucursal(s ? s.id : null);
          break;
        case 'suc-nueva':
          if (!s) { return; }
          // Primero se deja elegida —`elegirSucursal` alterna, así que sólo
          // se llama si no lo estaba ya— y después se añade: el alta toma de
          // ahí la tienda
          if (this.sucursalElegida !== s.id) { this.elegirSucursal(s.id); }
          this.addPuntoVenta();
          break;
        case 'suc-recargar':
          this.allPuntosVenta();
          break;
      }
      return;
    }

    const fila = this.selectedRow as any;
    if (!fila) { return; }

    switch (id) {
      case 'ver':       this.viewPuntoVenta(fila); break;
      case 'editar':    this.editPuntoVenta(fila); break;
      case 'clonar':    this.clonPuntoVenta(fila); break;
      case 'eliminar':  this.deletePuntoVenta(fila); break;
      case 'auditoria': this.auditoria(); break;
    }
  }

  private readonly _appDescarga = inject(AppPrintPdfService);

  // ================================================================
  // EL REPARTO DE LAS DOS COLUMNAS
  // ================================================================
  //
  // El mismo divisor del administrador de archivos y de la proforma: pointer
  // events con captura, para que siga respondiendo aunque el cursor se salga
  // de él. El ancho se recuerda por navegador.

  readonly ANCHO_IZQ_DEFECTO = 300;
  private readonly ANCHO_IZQ_MIN = 200;
  private readonly ANCHO_IZQ_MAX = 520;
  private readonly CLAVE_ANCHO_IZQ = 'miCRM3.puntosVenta.anchoIzquierda';

  public anchoIzquierda = this.leerAnchoIzquierda();
  public redimensionando = false;

  // ================================================================
  // EL ALTO DE LAS DOS COLUMNAS
  // ================================================================
  //
  // Se mide, no se calcula con un número fijo. Encima de la caja hay cosas
  // que aparecen y desaparecen —la miga de pan, la cabecera del panel, el
  // aviso de cuentas sin resolver— y el panel se puede EXPANDIR, que lo
  // saca del flujo y lo pone a ocupar la ventana entera. Un
  // `calc(100vh - 13.5rem)` acierta en un caso y falla en los demás: deja
  // un palmo muerto abajo o se sale por el pie.

  /** Lo que queda por debajo de la caja dentro del panel, más el aire del pie. */
  private readonly MARGEN_ABAJO = 32;
  /** Por debajo de esto las columnas se apilan y el alto lo pone el CSS. */
  private readonly ANCHO_DOS_COLUMNAS = 992;
  /** null = sin alto en línea; manda el CSS (pantallas estrechas). */
  public altoColumnas: number | null = null;

  constructor(
    private host: ElementRef<HTMLElement>,
    private modal: NgbModal,
    private route: Router,
    private activeRoute: ActivatedRoute,
    private _appExportExcelService: AppExportExcelService,
    private _appExportCsvService: AppExportCsvService,
    public _appAgGridService: AppAgGridService,
    private _loadingService: LoadingService,
    private _toastr: ToastrService,
    private _seguridadService: SeguridadService,
    private _puntoVentaService: PuntoVentaService,
    private _sucursalService: SucursalService,
  ) {
    this.accesoModel = this.activeRoute.snapshot.data['access'];
  }

  ngOnInit(): void {
    this.initializeGrid();
    this.cargarSucursales();
    this.allPuntosVenta();
    this.programarAltoColumnas();
  }

  /**
   * El alto de la caja de dos columnas: lo que quede desde donde empieza
   * hasta el final de la ventana.
   *
   * Sirve igual con el panel normal y con el panel expandido —que se pone
   * `position: fixed` y ocupa la ventana— porque no se fía de cuánto mide
   * lo de arriba: lo pregunta.
   */
  private ajustarAltoColumnas(): void {
    const caja = this.host.nativeElement.querySelector('.pv-dos-columnas') as HTMLElement | null;
    if (!caja) { return; }

    // Apilado no hay nada que repartir: las tiendas llevan su alto y la
    // rejilla el suyo, y un alto en línea estropearía el @media
    if (window.innerWidth < this.ANCHO_DOS_COLUMNAS) {
      this.altoColumnas = null;
      return;
    }

    const arriba = caja.getBoundingClientRect().top;
    this.altoColumnas = Math.max(360, Math.round(window.innerHeight - arriba - this.MARGEN_ABAJO));
  }

  /**
   * Lo mismo, pero en el siguiente fotograma.
   *
   * Se llama justo después de cosas que cambian lo que hay ENCIMA de la
   * caja (pintar el aviso, expandir el panel): si se midiera en el mismo
   * ciclo, se mediría la pantalla de antes.
   */
  private programarAltoColumnas(): void {
    requestAnimationFrame(() => this.ajustarAltoColumnas());
  }

  // ================================================================
  // EL DIVISOR
  // ================================================================

  iniciarRedimension(ev: PointerEvent): void {
    if (ev.button !== 0) { return; }
    ev.preventDefault();

    const divisor = ev.currentTarget as HTMLElement;
    const xInicial = ev.clientX;
    const anchoInicial = this.anchoIzquierda;
    this.redimensionando = true;
    divisor.setPointerCapture(ev.pointerId);

    const mover = (e: PointerEvent) => {
      const nuevo = anchoInicial + (e.clientX - xInicial);
      this.anchoIzquierda = Math.min(this.ANCHO_IZQ_MAX, Math.max(this.ANCHO_IZQ_MIN, Math.round(nuevo)));
      // En el cuadro siguiente: Angular todavía no aplicó el ancho nuevo y
      // la rejilla repartiría sus columnas con el de antes
      requestAnimationFrame(() => this.gridApi?.sizeColumnsToFit());
    };
    const soltar = (e: PointerEvent) => {
      divisor.removeEventListener('pointermove', mover);
      divisor.removeEventListener('pointerup', soltar);
      divisor.removeEventListener('pointercancel', soltar);
      divisor.releasePointerCapture(e.pointerId);
      this.redimensionando = false;
      this.guardarAnchoIzquierda();
    };

    divisor.addEventListener('pointermove', mover);
    divisor.addEventListener('pointerup', soltar);
    divisor.addEventListener('pointercancel', soltar);
  }

  guardarAnchoIzquierda(): void {
    try { localStorage.setItem(this.CLAVE_ANCHO_IZQ, String(this.anchoIzquierda)); } catch { /* sin storage */ }
  }

  private leerAnchoIzquierda(): number {
    try {
      const v = Number(localStorage.getItem(this.CLAVE_ANCHO_IZQ));
      if (v >= this.ANCHO_IZQ_MIN && v <= this.ANCHO_IZQ_MAX) { return v; }
    } catch { /* sin storage */ }
    return this.ANCHO_IZQ_DEFECTO;
  }

  // ================================================================
  // LAS TIENDAS
  // ================================================================

  /** Todas, también las inactivas: pueden tener cajas de antes. */
  private async cargarSucursales(): Promise<void> {
    try {
      const res: any = await firstValueFrom(this._sucursalService.listSucursales(false));
      this.sucursales = (res?.data ?? [])
        .map((s: any) => ({ id: s.id, nombre: s.nombre ?? s.name, codigo: s.codigo, activo: s.activo }))
        // POR CÓDIGO, que es como están numeradas (01, 02, 03…) y como se
        // nombran entre ellos. El servidor las devuelve en otro orden y
        // encontrarlas en una lista desordenada cuesta más que leerlas.
        // `numeric` para que la 10 vaya detrás de la 9 y no entre la 1 y la 2.
        .sort((a: any, b: any) => String(a.codigo ?? '').localeCompare(String(b.codigo ?? ''),
                                                                      'es', { numeric: true }));
    } catch (e) {
      console.error('Error al cargar las sucursales:', e);
      this.sucursales = [];
    }
  }

  /** Cuántas cajas tiene una tienda. */
  cuantasCajas(sucursalId: number): number {
    return this.puntoVentaModel.filter(p => p.sucursal_id === sucursalId).length;
  }

  /** Y cuántas de ésas no pueden asentar todavía. */
  cuantasIncompletasDe(sucursalId: number): number {
    return this.puntoVentaModel
      .filter(p => p.sucursal_id === sucursalId && Number(p.cuentas?.sin_resolver ?? 0) > 0).length;
  }

  /**
   * Se pulsó una tienda (o «Todas»).
   *
   * Pulsar la que ya estaba elegida la quita: así el mismo sitio sirve para
   * entrar y para salir, sin un botón de «quitar filtro» aparte.
   */
  elegirSucursal(id: number | null): void {
    this.sucursalElegida = (id !== null && this.sucursalElegida === id) ? null : id;
    this.gridApi?.onFilterChanged();

    // Con una tienda elegida, su columna sobra: todas las filas dirían lo
    // mismo y ese ancho lo necesitan las demás
    this.columnApi?.setColumnVisible('sucursal_nombre', this.sucursalElegida == null);
    this.gridApi?.sizeColumnsToFit();
    // La fila marcada puede haberse quedado fuera de lo que se ve
    if (this.selectedRow && this.sucursalElegida != null
        && this.selectedRow.sucursal_id !== this.sucursalElegida) {
      this.selectedRow = null;
    }
  }

  /** El nombre de la tienda que se está mirando, para los textos. */
  get nombreSucursalElegida(): string {
    return this.sucursales.find(s => s.id === this.sucursalElegida)?.nombre ?? '';
  }

  /** Y su código, que es con lo que empieza el código de sus cajas. */
  get codigoSucursalElegida(): string {
    return this.sucursales.find(s => s.id === this.sucursalElegida)?.codigo ?? '';
  }

  /** Cuántas cajas se están viendo ahora mismo. */
  get cuantasVisibles(): number {
    return this.sucursalElegida == null
      ? this.puntoVentaModel.length
      : this.cuantasCajas(this.sucursalElegida);
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

  /** Suscribe al @Output de un modal y corta al cerrarse o al destruir la pantalla. */
  public escucharModal<T>(modalRef: NgbModalRef, salida: EventEmitter<T>, alEmitir: (valor: T) => void): void {
    const modalCerrado$ = from(modalRef.result).pipe(catchError(() => of(null)));
    salida
      .pipe(takeUntil(merge(this.unsubscribe$, modalCerrado$)))
      .subscribe({
        next: alEmitir,
        error: (err) => console.error('Error en el modal:', err),
      });
  }

  fun_home(): void { this.route.navigate(['/ventas']); }

  // ================================================================
  // AG-GRID
  // ================================================================

  /**
   * Las cajas desactivadas se ven, pero apagadas y tachadas.
   *
   * Y las que tienen cuentas sin resolver se marcan: es lo que hay que
   * arreglar antes de que alguien intente facturar desde ahí.
   */
  public rowClassRules = {
    ...this._appAgGridService.reglasFilaInactiva('activo'),
    'fila-sin-cuentas': (p: RowClassParams) => Number(p.data?.cuentas?.sin_resolver ?? 0) > 0,
  };

  initializeGrid(): void {
    this.columnDefs = [
      {
        headerName: 'Código', field: 'codigo',
        cellStyle: { textAlign: 'left', fontWeight: '600' },
        minWidth: 120, maxWidth: 150,
      },
      {
        // Segunda columna y PULSABLE: cerrar una caja era abrir la ficha
        // entera y bajar la casilla. Ahora se pulsa aquí.
        headerName: 'Activo', field: 'activo',
        cellStyle: { textAlign: 'center' }, minWidth: 80, maxWidth: 80,
        cellRenderer: (params: any) => this.casillaActivo(params),
      },
      {
        headerName: 'Punto de venta', field: 'nombre',
        cellStyle: { textAlign: 'left' }, minWidth: 160, maxWidth: 300,
      },
      {
        headerName: 'Nº', field: 'numero',
        headerTooltip: 'El número de la caja dentro de su sucursal',
        cellStyle: { textAlign: 'center' }, minWidth: 60, maxWidth: 85,
      },
      {
        // Se esconde cuando hay una tienda elegida: ahí todas las filas
        // dirían lo mismo, y ese ancho lo necesitan las demás columnas
        // (ver `elegirSucursal`).
        headerName: 'Sucursal', field: 'sucursal_nombre',
        cellStyle: { textAlign: 'left' }, minWidth: 150, maxWidth: 280,
      },
      {
        headerName: 'Cuentas', field: 'cuentas',
        headerTooltip: 'Cuántas cuentas le faltan por resolver. Mientras no sea «completa», hay asientos que esta caja no puede hacer',
        cellStyle: { textAlign: 'center' }, minWidth: 150, maxWidth: 190,
        // Se ordena y se filtra por lo que falta, que es lo que se busca
        valueGetter: (p: any) => Number(p.data?.cuentas?.sin_resolver ?? 0),
        cellRenderer: (p: any) => {
          const faltan = Number(p.data?.cuentas?.sin_resolver ?? 0);
          const propias = Number(p.data?.cuentas?.propias ?? 0);
          const marca = propias > 0
            ? `<span class="pv-propias" title="Cuentas puestas en esta caja; el resto se heredan">${propias} propias</span>`
            : '';
          return faltan > 0
            ? `<span class="badge bg-danger fs-10px" title="Conceptos sin cuenta y sin marcar como «no aplica»">faltan ${faltan}</span> ${marca}`
            : `<span class="badge bg-teal fs-10px">completa</span> ${marca}`;
        },
      },
      // La descripción NO está en la rejilla a propósito: casi nunca se
      // rellena, se lee en la ficha, y ese ancho hacía que el total de las
      // columnas no cupiera en la columna derecha y apareciera un
      // desplazamiento horizontal justo encima de las acciones.
      {
        headerName: 'Creado', field: 'created_at',
        cellStyle: { textAlign: 'center' }, minWidth: 150, maxWidth: 180,
      },
      {
        headerName: 'Creado por', field: 'created_by',
        cellStyle: { textAlign: 'left' }, minWidth: 110, maxWidth: 200, sortable: false,
      },
      {
        headerName: 'ACCIONES', field: 'actions',
        cellStyle: { display: 'flex', justifyContent: 'center', alignItems: 'center' },
        cellRenderer: ButtonAccionPuntoVenta,
        pinned: 'right',
        minWidth: AllPuntosVentaComponent.ANCHO_ACCIONES_ABIERTA,
        maxWidth: AllPuntosVentaComponent.ANCHO_ACCIONES_ABIERTA,
        suppressMenu: true, sortable: false, resizable: false, filter: false,
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
    this.columnApi = params.columnApi;
    this.programar(() => this.montarListenersCabecera(), 500);
    this.ajustarAltoColumnas();
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

  private static readonly ANCHO_ACCIONES_ABIERTA = 130;
  private static readonly ANCHO_ACCIONES_PLEGADA = 50;

  toggleActionsColumn(): void {
    const columnDefs = this.gridApi.getColumnDefs() as any[];
    const actionsCol = columnDefs.find(col => col.field === 'actions');
    if (!actionsCol) { return; }

    const estabaPlegada = actionsCol.minWidth === AllPuntosVentaComponent.ANCHO_ACCIONES_PLEGADA;
    this.accionesPlegadas = !estabaPlegada;

    const ancho = estabaPlegada
      ? AllPuntosVentaComponent.ANCHO_ACCIONES_ABIERTA
      : AllPuntosVentaComponent.ANCHO_ACCIONES_PLEGADA;
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

    this.gridApi.setColumnDefs(columnDefs);
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
      // El alto primero: las columnas de la rejilla se reparten DESPUÉS, ya
      // con el ancho definitivo (si aparece o desaparece la barra de
      // desplazamiento, el ancho cambia)
      this.ajustarAltoColumnas();
      this._appAgGridService.ajustarTamanoGrid(this.gridApi);
      this.ajustarAlturaGrid();
    }, 100);
  }

  /**
   * Aquí el alto NO se calcula: lo pone el CSS.
   *
   * La caja de dos columnas tiene alto fijo y la rejilla llena su columna por
   * la cadena flex. Medir y escribir un alto en píxeles, como hacen las
   * pantallas de una sola rejilla, pelearía con ese reparto cada vez que se
   * arrastra el divisor. Lo único que hay que rehacer es el ancho de las
   * columnas.
   */
  ajustarAlturaGrid(): void {
    this.gridApi?.sizeColumnsToFit();
  }

  navegarConTeclado = this._appAgGridService.navegacionConFlechas(fila => this.selectedRow = fila);

  onCellClicked(e: CellClickedEvent): void {
    this.selectedRow = e.data;

    const origen = e.event?.target as HTMLElement | null;
    if (origen?.closest('[data-accion="activo"]')) {
      // LA CASILLA NO DECIDE: la marca que acaba de poner el navegador es
      // sólo un acuse de recibo. Quien dice si la caja queda activa es el
      // servidor, y la celda se vuelve a dibujar con lo que conteste.
      this.cambiarActivo(e.data, e.node as RowNode);
    }
  }

  /** La casilla de la columna «Activo». */
  private casillaActivo(params: any): string {
    return this._appAgGridService.casillaActivo(params, {
      puede: this.accesoModel?.editar === true,
      enVuelo: this.activoEnVuelo,
      que: 'punto de venta',
    });
  }

  /** Abrir o cerrar la caja desde la casilla, sin abrir la ficha. */
  cambiarActivo(punto: PuntoVentaModel | null, nodo?: RowNode | null): void {
    if (!punto) { return; }
    if (this._seguridadService.isexpired()) { return; }

    this._appAgGridService.alternarActivo({
      gridApi: this.gridApi,
      filas: this.puntoVentaModel,
      fila: punto, nodo,
      campo: 'activo',
      enVuelo: this.activoEnVuelo,
      puede: this.accesoModel?.editar === true,
      que: 'punto de venta',
      llamar: (id, activo) => this._puntoVentaService.activarPuntoVenta(id, activo),
      nombre: (f: any) => f.nombre,
      hasta: this.unsubscribe$,
    });
  }

  // ================================================================
  // DATOS
  // ================================================================

  /** Todas las cajas (no hay paginación: son decenas). */
  async allPuntosVenta(): Promise<void> {
    try {
      this._loadingService.setLoading(true);

      const res: any = await firstValueFrom(this._puntoVentaService.allPuntosVenta(false));

      if (res.body?.status !== 'success') {
        this._toastr.error(res.body?.message || 'No se pudo obtener el listado de puntos de venta', 'Error');
        this.puntoVentaModel = [];
        this.gridApi?.setRowData(this.puntoVentaModel);
        return;
      }

      this.puntoVentaModel = res.body?.data || [];
      this.gridApi?.setRowData(this.puntoVentaModel);

    } catch (error) {
      // El AuthInterceptor ya enseñó el toast del error HTTP
      console.error('Error al cargar puntos de venta:', error);
    } finally {
      this._loadingService.setLoading(false);
      // Con datos puede aparecer (o irse) el aviso de cuentas sin resolver,
      // y entonces la caja empieza más abajo o más arriba
      this.programarAltoColumnas();
    }
  }

  /** Cuántas cajas tienen cuentas sin resolver (para el aviso de arriba). */
  get cuantasIncompletas(): number {
    return this.puntoVentaModel.filter(p => Number(p.cuentas?.sin_resolver ?? 0) > 0).length;
  }

  // ================================================================
  // BÚSQUEDA
  // ================================================================
  //
  // Filtra la REJILLA, no el servidor: están todas las filas cargadas, así
  // que es instantáneo y no hace falta ir y volver.

  onFilterTextBoxChanged(term?: string): void {
    if (term !== undefined) { this.searchTerm = term; }
    this.gridApi?.setQuickFilter(this.searchTerm ?? '');
  }

  get hayFiltro(): boolean {
    return !!this.searchTerm || Object.keys(this.gridApi?.getFilterModel() ?? {}).length > 0;
  }

  get cuantasColumnasFiltradas(): number {
    return Object.keys(this.gridApi?.getFilterModel() ?? {}).length;
  }

  clearAllFilters(): void {
    this.searchTerm = '';
    this.campoBusqueda?.reset();
    this.gridApi?.setQuickFilter('');
    this.gridApi?.setFilterModel(null);
  }

  // ================================================================
  // EXPORTACIONES
  // ================================================================

  private readonly CABECERAS_REPORTE =
    ['Código', 'Punto de venta', 'Nº', 'Sucursal', 'Cuentas propias', 'Sin resolver', 'Activo'];

  private filasReporte(): any[][] {
    return this.puntoVentaModel.map(p => [
      p.codigo,
      p.nombre,
      p.numero,
      p.sucursal_nombre ?? '',
      p.cuentas?.propias ?? 0,
      p.cuentas?.sin_resolver ?? 0,
      p.activo ? 'Activo' : 'Inactivo',
    ]);
  }

  printPdf(): void {
    this._appDescarga.generarReporte({
      tamanoPapel: 'A4',
      orientacion: 'l',
      title: 'Puntos de Venta',
      titleTable: 'Las cajas de cada sucursal y cómo están sus cuentas',
      headers: this.CABECERAS_REPORTE,
      data: this.filasReporte(),
      piePagina: 'Pie de página - Mi Empresa en Desarrollo S.A....',
    });
  }

  exportExcel(): void {
    this._appExportExcelService.generarReporteExcel({
      tamanoPapel: 'A4',
      orientacion: 'l',
      title: 'Puntos de Venta',
      titleTable: 'Las cajas de cada sucursal y cómo están sus cuentas',
      headers: this.CABECERAS_REPORTE,
      data: this.filasReporte(),
      piePagina: 'Pie de página - Mi Empresa en Desarrollo S.A....',
    });
  }

  exportCsv(): void {
    this._appExportCsvService.generarReporteCSV({
      headers: this.CABECERAS_REPORTE,
      data: this.filasReporte(),
    });
  }

  // ================================================================
  // ACCIONES (modales)
  // ================================================================

  private abrirModal(registro: any, accion: 'add' | 'edit' | 'clon' | 'view'): NgbModalRef {
    const modalRef = this.modal.open(SavePuntoVentaComponent, {
      centered: true,
      size: 'xl',
      backdrop: 'static',
      keyboard: accion === 'view',
    });
    modalRef.componentInstance.registro_selected = registro;
    modalRef.componentInstance.accion = accion;
    return modalRef;
  }

  /**
   * Una caja nueva EN LA TIENDA QUE SE ESTÁ MIRANDO.
   *
   * Sin tienda elegida no se abre: la ficha ya no pregunta de cuál es —se
   * escoge aquí, en la columna de la izquierda— y una caja sin tienda no
   * significa nada. El botón está apagado en ese caso; esto es el cinturón.
   */
  addPuntoVenta(): void {
    if (this._seguridadService.isexpired()) { return; }

    if (this.sucursalElegida == null) {
      this._toastr.info('Elija primero la sucursal en la lista de la izquierda: la caja se crea en ella.',
                        'Falta la sucursal', { timeOut: 6000, closeButton: true });
      return;
    }

    const modalRef = this.abrirModal(0, 'add');
    modalRef.componentInstance.sucursalInicial = this.sucursalElegida;
    modalRef.componentInstance.sucursalNombre = this.nombreSucursalElegida;
    // El código de la tienda es media parte del código de la caja («01-501»),
    // y la ficha lo necesita para rehacerlo mientras se teclea el número
    modalRef.componentInstance.sucursalCodigo = this.codigoSucursalElegida;
    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, () => this.allPuntosVenta());
  }

  clonPuntoVenta(registro: any): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.abrirModal(registro, 'clon');
    // La copia se queda en la tienda de la original
    modalRef.componentInstance.sucursalNombre = registro?.sucursal_nombre ?? '';
    modalRef.componentInstance.sucursalCodigo = registro?.sucursal_codigo ?? '';
    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, () => this.allPuntosVenta());
  }

  editPuntoVenta(registro: any): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.abrirModal(registro, 'edit');
    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, (actualizado: any) => {
      const i = this.puntoVentaModel.findIndex(r => r.id === actualizado?.id);
      if (i === -1) { this.allPuntosVenta(); return; }
      this.puntoVentaModel[i] = actualizado;

      // El nodo se busca POR EL DATO y no por la posición: con una tienda
      // elegida la rejilla enseña un subconjunto, y el índice del array ya
      // no es el de la fila.
      this.gridApi?.forEachNode(n => {
        if (n.data?.id === actualizado.id) { n.setData(actualizado); }
      });
      if (this.selectedRow?.id === actualizado.id) { this.selectedRow = actualizado; }
    });
  }

  viewPuntoVenta(registro: any): void {
    if (this._seguridadService.isexpired()) { return; }
    this.abrirModal(registro, 'view');
  }

  deletePuntoVenta(registro: any): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.modal.open(DeletePuntoVentaComponent, {
      centered: true, size: 'md', backdrop: 'static', keyboard: true,
    });
    modalRef.componentInstance.registro_selected = registro;

    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, () => {
      const i = this.puntoVentaModel.findIndex(r => r.id === registro.id);
      if (i === -1) { return; }
      this.puntoVentaModel.splice(i, 1);
      this.gridApi?.applyTransaction({ remove: [registro] });
      if (this.selectedRow?.id === registro.id) { this.selectedRow = null; }
    });
  }

  abrirPapelera(): void {
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.modal.open(PapeleraPuntosVentaComponent, {
      centered: true, size: 'xl', backdrop: 'static', keyboard: true,
    });
    modalRef.componentInstance.puedeAuditar = this.accesoModel?.auditar === true;
    modalRef.componentInstance.puedeVaciar = this.accesoModel?.vaciar === true;
    this.escucharModal(modalRef, modalRef.componentInstance.cambio, () => this.allPuntosVenta());
  }

  auditoria(): void {
    if (!this.selectedRow) { return; }
    if (this._seguridadService.isexpired()) { return; }
    const modalRef = this.modal.open(AuditoriaModalComponent, {
      centered: true, size: 'xl', backdrop: 'static', keyboard: true,
    });
    modalRef.componentInstance.tablaNombre = 'puntos_venta';
    modalRef.componentInstance.registroId = this.selectedRow.id;
  }
}

// ================================================================
// RENDERER DE LA COLUMNA ACCIONES
// ================================================================
// Simple delegador: toda la lógica de modales vive en AllPuntosVentaComponent.
@Component({
  selector: 'app-button-accion-punto-venta',
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
        [buttonClone]="true"
        [buttonDelete]="true"
        (view)="parent.viewPuntoVenta(params.data)"
        (edit)="parent.editPuntoVenta(params.data)"
        (clone)="parent.clonPuntoVenta(params.data)"
        (delete)="parent.deletePuntoVenta(params.data)">
      </app-action-buttons>
    }
  `,
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
export class ButtonAccionPuntoVenta implements ICellRendererAngularComp {
  public params: any;

  constructor(public parent: AllPuntosVentaComponent) { }

  agInit(params: any): void { this.params = params; }

  refresh(params: any): boolean { this.params = params; return true; }
}
