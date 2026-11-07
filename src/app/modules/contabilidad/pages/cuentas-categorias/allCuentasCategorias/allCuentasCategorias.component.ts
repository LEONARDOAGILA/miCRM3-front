import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, HostListener, OnDestroy, OnInit, ViewChild, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CellClickedEvent, GridApi, GridReadyEvent } from 'ag-grid-community';
import { AgGridModule } from 'ag-grid-angular';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { Subject, firstValueFrom, from, merge, of } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';

import { PanelComponent } from '../../../../../components/panel/panel.component';
import { CampoBusquedaPaginacionComponent } from '../../../../../components/campos/campoBusquedaPaginacion/campoBusquedaPaginacion.component';
import { MenuContextualComponent, OpcionContextual } from '../../../../../components/menuContextual/menuContextual.component';

import { AppAgGridService } from '../../../../../service/app-agGrid.service';
import { LoadingService } from '../../../../../service/loading.service';
import { SeguridadService } from '../../../../seguridad/services/seguridad.service';
import { CuentaConfigService } from '../../../services/cuentaConfig.service';
import { AccesoModel } from '../../../../seguridad/interfaces/accesoModel';
import { CategoriaCuentas, ConceptoContable } from '../../../interfaces/cuentaConfigModel';
import { SaveCuentasCategoriaComponent } from '../saveCuentasCategoria/saveCuentasCategoria.component';
import { FilasEstirablesDirective } from '../../../../../core/directives/filasEstirables.directive';

/**
 * Qué cuenta contable usa cada categoría de productos.
 *
 * Es el árbol de categorías de inventario —el mismo, con su sangría y su
 * plegado— con una columna por concepto: inventario, ingreso, costo,
 * devoluciones y descuentos. De ahí salen las cuentas de un producto cuando
 * se factura.
 *
 * LAS CUENTAS SE HEREDAN, y eso es lo que esta pantalla tiene que dejar claro
 * de un vistazo: lo que una categoría no tiene puesto lo toma de la de
 * arriba, y al final de la configuración por omisión. Por eso cada celda dice
 * de dónde sale la cuenta —propia en negro, heredada apagada— y la columna
 * «Propias» cuenta cuántas ha puesto ella misma.
 *
 * Configurar la rama de arriba y dejar que lo demás herede es lo normal: son
 * 28 categorías y casi todas usan las mismas cuentas.
 *
 * NO PAGINA: es un árbol, y partido en páginas deja padres fuera.
 */
@Component({
  selector: 'app-allCuentasCategorias',
  standalone: true,
  imports: [CommonModule, PanelComponent, AgGridModule, FilasEstirablesDirective, CampoBusquedaPaginacionComponent, MenuContextualComponent],
  templateUrl: './allCuentasCategorias.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./allCuentasCategorias.component.css'],
})
export class AllCuentasCategoriasComponent implements OnInit, OnDestroy {

  /** Permisos del perfil sobre esta pantalla, del resolver de la ruta. */
  public accesoModel: AccesoModel;

  public titulo = 'Cuentas por Categoría';
  public isLoading$ = this._loadingService.isLoading$;

  /** El árbol entero, en el orden en que se dibuja. */
  public categorias: CategoriaCuentas[] = [];
  /** Lo que de verdad recibe la rejilla: el árbol menos las ramas cerradas. */
  public filasVisibles: CategoriaCuentas[] = [];
  public conceptos: ConceptoContable[] = [];
  public selectedRow: CategoriaCuentas | null = null;

  public gridApi!: GridApi;
  public columnDefs: any[] = [];

  public searchTerm = '';

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
  private static readonly CLAVE_PLEGADAS = 'cont.cuentasCategorias.plegadas';

  private readonly unsubscribe$ = new Subject<void>();
  private timeoutIds = new Set<any>();
  private resizeTimeoutId: any;

  @HostListener('window:resize')
  onResize(): void { this.ajustarTamanoGrid(); }

  constructor(
    private host: ElementRef<HTMLElement>,
    private modal: NgbModal,
    private route: Router,
    private activeRoute: ActivatedRoute,
    public _appAgGridService: AppAgGridService,
    private _loadingService: LoadingService,
    private _toastr: ToastrService,
    private _seguridadService: SeguridadService,
    private _cuentaConfigService: CuentaConfigService,
  ) {
    this.accesoModel = this.activeRoute.snapshot.data['access'];
  }

  async ngOnInit(): Promise<void> {
    this.leerPlegadas();
    await this.cargarConceptos();
    this.initializeGrid();
    await this.cargar();
  }

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
    this.timeoutIds.forEach(id => clearTimeout(id));
    this.timeoutIds.clear();
    if (this.resizeTimeoutId) { clearTimeout(this.resizeTimeoutId); }
    this.modal.dismissAll();
  }

  /** setTimeout que se da de baja solo al dispararse. */
  private programar(fn: () => void, ms: number): void {
    const id = setTimeout(() => { this.timeoutIds.delete(id); fn(); }, ms);
    this.timeoutIds.add(id);
  }

  /** Suscribe al @Output de un modal y corta al cerrarse o al destruir la pantalla. */
  private escucharModal<T>(modalRef: NgbModalRef, salida: EventEmitter<T>, alEmitir: (valor: T) => void): void {
    const modalCerrado$ = from(modalRef.result).pipe(catchError(() => of(null)));
    salida.pipe(takeUntil(merge(this.unsubscribe$, modalCerrado$)))
          .subscribe({ next: alEmitir, error: (err) => console.error('Error en el modal:', err) });
  }

  fun_home(): void {
    this.route.navigate(['/contabilidad']);
  }

  // ================================================================
  // DATOS
  // ================================================================

  /** Los conceptos mandan las columnas: añadir uno nuevo añade su columna. */
  private async cargarConceptos(): Promise<void> {
    try {
      const res: any = await firstValueFrom(this._cuentaConfigService.conceptos('CATEGORIA'));
      this.conceptos = res?.status === 'success' ? (res.data ?? []) : [];
    } catch (error) {
      console.error('Error al cargar los conceptos contables:', error);
      this.conceptos = [];
    }
  }

  async cargar(): Promise<void> {
    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._cuentaConfigService.categorias(false));

      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo obtener las cuentas por categoría', 'Error');
        this.categorias = [];
        this.recalcularVisibles();
        return;
      }

      this.categorias = res.data ?? [];
      this.limpiarPlegadas();
      this.recalcularVisibles();
    } catch (error) {
      console.error('Error al cargar las cuentas por categoría:', error);
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  public get totalRegistros(): number { return this.categorias.length; }

  /** Cuántas categorías tienen alguna cuenta propia. */
  public get conPropias(): number {
    return this.categorias.filter(c => Number(c.propias ?? 0) > 0).length;
  }

  /**
   * Las que admiten productos y tienen algún concepto sin resolver.
   *
   * Un concepto marcado «no aplica» SÍ está resuelto: alguien dijo que aquí
   * no se asienta, que es una respuesta tan buena como una cuenta.
   */
  public get sinResolver(): number {
    const obligatorios = this.conceptos.filter(c => c.naturaleza_tipica).map(c => c.codigo);
    return this.categorias.filter(c =>
      c.es_transaccion && obligatorios.some(k => {
        const cuenta = c.cuentas?.[k];
        return !cuenta?.cuenta_id && !cuenta?.no_aplica;
      })).length;
  }

  // ================================================================
  // AG-GRID
  // ================================================================

  private readonly centrado = { textAlign: 'center' };
  private readonly izquierda = { textAlign: 'left' };

  private claseNivel = (params: any): string =>
    'celda-nivel nivel-' + Math.min(Math.max(Number(params?.data?.nivel ?? 0), 0), 3);

  initializeGrid(): void {
    this.columnDefs = [
      {
        headerName: 'Categoría',
        field: 'nombre',
        floatingFilter: true,
        cellClass: this.claseNivel,
        cellStyle: this.izquierda,
        minWidth: 300,
        maxWidth: 460,
        sortable: false,
        cellRenderer: (params: any) => this.celdaArbol(params),
        headerComponentParams: this.cabeceraArbol(),
      },
      {
        // Donde se cuelgan los productos: son las categorías en las que
        // estas cuentas se usan de verdad
        headerName: 'Admite',
        field: 'es_transaccion',
        headerTooltip: 'Si se le pueden colgar productos. Las que agrupan sólo sirven para que sus hijas hereden',
        cellStyle: this.centrado,
        minWidth: 110,
        maxWidth: 120,
        sortable: false,
        cellRenderer: (params: any) => params.value === false
          ? '<span class="badge bg-secondary fs-10px" title="Sólo agrupa">AGRUPA</span>'
          : '<span class="badge bg-teal fs-10px" title="Admite productos">PRODUCTOS</span>',
      },
      {
        headerName: 'Productos',
        field: 'num_productos',
        headerTooltip: 'Productos colgados de esta categoría',
        cellClass: this.claseNivel,
        cellStyle: this.centrado,
        minWidth: 100,
        maxWidth: 110,
        sortable: false,
      },
      {
        headerName: 'Propias',
        field: 'propias',
        headerTooltip: 'Cuentas puestas en esta categoría. Las demás las hereda de arriba',
        cellStyle: this.centrado,
        minWidth: 95,
        maxWidth: 110,
        sortable: false,
        cellRenderer: (params: any) => {
          const n = Number(params.value ?? 0);
          return n > 0
            ? `<span class="badge bg-indigo fs-10px" title="${n} cuenta(s) propia(s)">${n}</span>`
            : '<span class="cc-heredadas" title="Todas heredadas">heredadas</span>';
        },
      },

      // UNA COLUMNA POR CONCEPTO. Salen de la base, así que un concepto
      // nuevo aparece aquí sin tocar esto.
      ...this.conceptos.map(c => ({
        headerName: c.nombre.replace(/^Cuenta\s+|^Cta\.\s+/i, ''),
        field: 'cuentas.' + c.codigo + '.codigo',
        headerTooltip: c.nombre + (c.descripcion ? ' — ' + c.descripcion : ''),
        cellStyle: this.centrado,
        minWidth: 125,
        maxWidth: 150,
        sortable: false,
        valueGetter: (p: any) => p.data?.cuentas?.[c.codigo]?.codigo ?? '',
        cellRenderer: (p: any) => this.celdaCuenta(p.data?.cuentas?.[c.codigo]),
      })),

      {
        headerName: 'ACCIONES',
        field: 'actions',
        pinned: 'right',
        minWidth: 90,
        maxWidth: 90,
        suppressHeaderMenuButton: true,
        sortable: false,
        resizable: false,
        cellStyle: { display: 'flex', justifyContent: 'center', alignItems: 'center' },
        cellRenderer: () => this.accesoModel?.editar === true
          ? `<button type="button" class="cc-btn" data-accion="configurar" title="Configurar las cuentas de esta categoría">
               <i class="fa fa-sliders"></i></button>`
          : `<button type="button" class="cc-btn" data-accion="configurar" title="Ver las cuentas de esta categoría">
               <i class="fa fa-eye"></i></button>`,
      },
    ];
  }

  /** La celda de una cuenta: el código, apagado cuando viene heredada. */
  private celdaCuenta(cuenta: any): string {
    // «No aplica» no es lo mismo que no tener cuenta: aquí este concepto no
    // existe, y es una respuesta, no un hueco por rellenar
    if (cuenta?.no_aplica) {
      const de = String(cuenta.origen_etiqueta ?? '').replace(/"/g, '&quot;');
      return `<span class="cc-na" title="No aplica: aquí no se asienta este concepto · ${de}">n/a</span>`;
    }
    if (!cuenta?.cuenta_id) {
      return '<span class="cc-sin" title="Sin cuenta: no se podrá asentar este concepto">—</span>';
    }
    const propia = cuenta.origen_etiqueta === 'Propia';
    const titulo = `${cuenta.codigo} ${cuenta.nombre}\n${cuenta.origen_etiqueta}`
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const texto = String(cuenta.codigo ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
    return `<span class="cc-cuenta ${propia ? 'cc-cuenta--propia' : 'cc-cuenta--heredada'}" title="${titulo}">${texto}</span>`;
  }

  /** La celda del árbol: sangría + asa + nombre, como en el plan de cuentas. */
  private celdaArbol(params: any): string {
    const d = params.data;
    const nivel = Math.max(0, Number(d?.nivel ?? 0));
    const hijos = Number(d?.num_hijos ?? 0);

    const sangria = `<span class="cta-sangria" style="width:${nivel * 16}px"></span>`;
    const asa = hijos > 0
      ? `<button type="button" class="cta-asa" data-accion="plegar"
                 title="${this.plegadas.has(d.id) ? 'Desplegar' : 'Contraer'} esta rama">
           <i class="fa fa-${this.plegadas.has(d.id) ? 'plus' : 'minus'}"></i>
         </button>`
      : `<span class="cta-asa cta-asa--hueco"></span>`;

    const texto = String(params.value ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    return `<span class="cta-arbol">${sangria}${asa}<span>${texto}</span></span>`;
  }

  /** Los botones de contraer y desplegar todo, en la cabecera del árbol. */
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

  onGridReady(params: GridReadyEvent): void {
    this.gridApi = params.api;
    this.programar(() => this.actualizarBotonesArbol(), 500);
    this._appAgGridService.ajustarTamanoGrid(this.gridApi);
    this.ajustarAlturaGrid();
  }

  onCellClicked(e: CellClickedEvent): void {
    this.selectedRow = e.data;
    const origen = e.event?.target as HTMLElement | null;

    if (origen?.closest('[data-accion="plegar"]')) { this.alternarPlegado(e.data); return; }
    if (origen?.closest('[data-accion="configurar"]')) { this.configurar(e.data); }
  }

  navegarConTeclado = this._appAgGridService.navegacionConFlechas(fila => this.selectedRow = fila);

  ajustarTamanoGrid(): void {
    if (!this.gridApi) { return; }
    if (this.resizeTimeoutId) { clearTimeout(this.resizeTimeoutId); }
    this.resizeTimeoutId = setTimeout(() => {
      this._appAgGridService.ajustarTamanoGrid(this.gridApi);
      this.ajustarAlturaGrid();
    }, 100);
  }

  /** La rejilla llena la pantalla hasta el final de la ventana. */
  ajustarAlturaGrid(): void {
    const gridElement = this.host.nativeElement.querySelector('.ag-theme-alpine') as HTMLElement;
    if (!gridElement) { return; }
    const MARGEN_INFERIOR = 60;
    gridElement.style.height = `${window.innerHeight - gridElement.getBoundingClientRect().top - MARGEN_INFERIOR}px`;
    this.gridApi?.sizeColumnsToFit();
  }

  // ================================================================
  // PLEGAR Y DESPLEGAR
  // ================================================================

  alternarPlegado(fila: CategoriaCuentas | null): void {
    if (!fila?.id || Number(fila.num_hijos ?? 0) === 0) { return; }
    if (this.plegadas.has(fila.id)) { this.plegadas.delete(fila.id); } else { this.plegadas.add(fila.id); }
    this.guardarPlegadas();
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
    const aLaVista = this.searchTerm ? new Set(this.idsALaVista()) : null;
    this.plegadas.clear();
    this.categorias.forEach(c => {
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

  get hayPlegadas(): boolean { return this.plegadas.size > 0; }
  get plegadasCuantas(): number { return this.plegadas.size; }

  /** Clic en la cabecera: los botones los pinta ag-Grid, no Angular. */
  alClicarCabecera(ev: MouseEvent): void {
    const boton = (ev.target as HTMLElement).closest('[data-arbol]') as HTMLButtonElement | null;
    if (!boton) { return; }
    ev.stopPropagation();
    if (boton.disabled) { return; }
    if (boton.dataset['arbol'] === 'contraer') { this.contraerTodo(); } else { this.desplegarTodo(); }
  }

  private actualizarBotonesArbol(): void {
    this.host?.nativeElement?.querySelectorAll?.('[data-arbol]')
      .forEach((b: any) => {
        // Contraer siempre vale; desplegar sólo si hay algo cerrado.
        b.disabled = b.dataset['arbol'] !== 'contraer' && !this.hayPlegadas;
      });
  }

  private recalcularVisibles(): void {
    if (this.plegadas.size === 0) {
      this.filasVisibles = [...this.categorias];
    } else {
      const padres = new Map<number, number | null>();
      this.categorias.forEach(c => padres.set(c.id, c.padre_id ?? null));
      this.filasVisibles = this.categorias.filter(c => {
        let p = padres.get(c.id) ?? null;
        while (p != null) {
          if (this.plegadas.has(p)) { return false; }
          p = padres.get(p) ?? null;
        }
        return true;
      });
    }
    this.gridApi?.setGridOption('rowData', this.filasVisibles);
    this.actualizarBotonesArbol();
  }

  private limpiarPlegadas(): void {
    const existen = new Set(this.categorias.map(c => c.id));
    [...this.plegadas].forEach(id => { if (!existen.has(id)) { this.plegadas.delete(id); } });
    [...this.plegadasFueraDeFiltro].forEach(id => { if (!existen.has(id)) { this.plegadasFueraDeFiltro.delete(id); } });
  }

  private guardarPlegadas(): void {
    try {
      // Mientras se filtra, lo que se recuerda es el árbol de ANTES: lo que
      // se pliegue con el filtro puesto se descarta al quitarlo, así que
      // guardarlo dejaría el árbol cerrado en la siguiente visita.
      const aGuardar = this.searchTerm ? this.plegadasFueraDeFiltro : this.plegadas;
      localStorage.setItem(AllCuentasCategoriasComponent.CLAVE_PLEGADAS, JSON.stringify([...aGuardar]));
    } catch {
      // Ventana privada o almacenamiento bloqueado: se pierde al salir y ya
    }
  }

  private leerPlegadas(): void {
    try {
      const guardado = localStorage.getItem(AllCuentasCategoriasComponent.CLAVE_PLEGADAS);
      if (!guardado) { return; }
      const ids = JSON.parse(guardado);
      if (Array.isArray(ids)) {
        ids.forEach((id: any) => { if (Number.isFinite(Number(id))) { this.plegadas.add(Number(id)); } });
      }
    } catch {
      // Lo guardado no sirve: se empieza con el árbol abierto
    }
  }

  // ================================================================
  // BÚSQUEDA (en el navegador: son pocas filas)
  // ================================================================

  onFilterTextBoxChanged(term?: string): void {
    const habiaFiltro = !!this.searchTerm;
    if (term !== undefined) { this.searchTerm = term; }
    if (this.plegadoAlCambiarElFiltro(habiaFiltro)) { this.recalcularVisibles(); }
    this.gridApi?.setGridOption('quickFilterText', this.searchTerm);
  }

  alLimpiarBusqueda(): void {
    const habiaFiltro = !!this.searchTerm;
    this.searchTerm = '';
    this.plegadoAlCambiarElFiltro(habiaFiltro);   // vuelve el árbol que había
    this.recalcularVisibles();
    this.gridApi?.setGridOption('quickFilterText', '');
  }

  // ================================================================
  // CONFIGURAR
  // ================================================================

  /** Las cuentas de una categoría. */
  configurar(fila?: CategoriaCuentas | null): void {
    const sobre = fila ?? this.selectedRow;
    if (!sobre) {
      this._toastr.info('Elige primero una categoría en la lista', 'Cuentas contables');
      return;
    }
    if (this._seguridadService.isexpired()) { return; }

    const modalRef = this.modal.open(SaveCuentasCategoriaComponent, {
      centered: true, size: 'lg', backdrop: 'static', keyboard: true,
    });
    modalRef.componentInstance.ambito = 'CATEGORIA';
    modalRef.componentInstance.ambitoId = sobre.id;
    modalRef.componentInstance.titulo = sobre.nombre;
    modalRef.componentInstance.soloLectura = this.accesoModel?.editar !== true;

    this.escucharModal(modalRef, modalRef.componentInstance.guardado, () => this.cargar());
  }

  /**
   * Las cuentas por omisión (ámbito GLOBAL).
   *
   * Es lo que usa todo lo que no tenga nada puesto, así que es por donde se
   * empieza: se configuran una vez y las 28 categorías quedan resueltas.
   */
  configurarGlobal(): void {
    if (this._seguridadService.isexpired()) { return; }

    const modalRef = this.modal.open(SaveCuentasCategoriaComponent, {
      centered: true, size: 'lg', backdrop: 'static', keyboard: true,
    });
    modalRef.componentInstance.ambito = 'GLOBAL';
    modalRef.componentInstance.ambitoId = null;
    modalRef.componentInstance.titulo = 'Por omisión';
    modalRef.componentInstance.soloLectura = this.accesoModel?.editar !== true;

    this.escucharModal(modalRef, modalRef.componentInstance.guardado, () => this.cargar());
  }

  // ================================================================
  // EL MENÚ DEL BOTÓN DERECHO
  // ================================================================

  @ViewChild('menuCtx') menuCtx!: MenuContextualComponent;
  public opcionesContextuales: OpcionContextual[] = [];

  onContextMenuGrilla(e: MouseEvent): void {
    const fila = this._appAgGridService.filaDeEventoEnGrilla(e, this.gridApi);
    if (!fila) { return; }

    e.preventDefault();
    this.selectedRow = fila;
    this._appAgGridService.marcarFila(this.gridApi, fila);

    this.opcionesContextuales = [
      {
        id: 'configurar',
        texto: this.accesoModel?.editar === true ? 'Configurar sus cuentas' : 'Ver sus cuentas',
        icono: 'fa-sliders',
        ayuda: 'Inventario, ingreso, costo, devoluciones y descuentos',
      },
      {
        id: 'global', texto: 'Cuentas por omisión', icono: 'fa-globe',
        separadorAntes: true,
        ayuda: 'Las que usa todo lo que no tenga nada puesto',
      },
      {
        id: 'recargar', texto: 'Recargar', icono: 'fa-arrows-rotate',
        separadorAntes: true,
      },
    ];
    this.menuCtx?.abrir(e);
  }

  alElegirContextual(id: string): void {
    switch (id) {
      case 'configurar': this.configurar(this.selectedRow); break;
      case 'global':     this.configurarGlobal(); break;
      case 'recargar':   this.cargar(); break;
    }
  }
}
