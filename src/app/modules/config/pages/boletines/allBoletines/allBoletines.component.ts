import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { CellClickedEvent, GridApi, GridReadyEvent, ColumnApi } from 'ag-grid-community';
import { ICellRendererAngularComp } from 'ag-grid-angular';
import { ToastrService } from 'ngx-toastr';
import { Subject, firstValueFrom } from 'rxjs';
import Swal from 'sweetalert2';

///   SERVICIOS    ///
import { BoletinService } from '../../../services/boletin.service';
import { AppAgGridService } from '../../../../../service/app-agGrid.service';
import { LoadingService } from '../../../../../service/loading.service';

///   MODELOS    ///
import { BoletinModel, ESTADOS_BOLETIN } from '../../../interfaces/boletinModel';
import { AccesoModel } from '../../../../seguridad/interfaces/accesoModel';

///   COMPONENTES    ///
import { SaveBoletinComponent } from '../saveBoletin/saveBoletin.component';
import { DeleteBoletinComponent } from '../deleteBoletin/deleteBoletin.component';
import { VerBoletinesComponent } from '../verBoletines/verBoletines.component';
import { AuditoriaModalComponent } from '../../../../../components/auditoria-modal/auditoria-modal.component';
import { PapeleraBoletinesComponent } from '../papeleraBoletines/papeleraBoletines.component';
import { VistasBoletinComponent } from '../vistasBoletin/vistasBoletin.component';
import { CampoBusquedaPaginacionComponent } from '../../../../../components/campos/campoBusquedaPaginacion/campoBusquedaPaginacion.component';

/**
 * Listado de boletines.
 *
 * Grilla ag-Grid con paginación EN SERVIDOR (core.fn_boletines_listar_paginado)
 * y filtro por estado: vigentes, programados, caducados o inactivos. El
 * botón «Papelera» abre el modal con los eliminados, donde las
 * acciones pasan a restaurar y eliminar definitivamente.
 *
 * Desde aquí se crea, se modifica, se ve como lo verá el usuario (con su marca
 * de agua) y se envía a la papelera.
 */
@Component({
  selector: 'app-allBoletines',
  templateUrl: './allBoletines.component.html',
  styleUrls: ['./allBoletines.component.css'],
  standalone: false,
})
export class AllBoletinesComponent implements OnInit, OnDestroy {

  public accesoModel: AccesoModel;
  public boletines: BoletinModel[] = [];
  public selectedRow: BoletinModel | null = null;
  public accionesPlegadas = false;
  public titulo = 'Boletines';
  public isLoading$ = this._loadingService.isLoading$;

  /** Filtros de la barra. */
  public estados = ESTADOS_BOLETIN;
  public estado = 'TODOS';
  /** Boletines en la papelera de reciclaje (contador del botón). */
  public enPapelera = 0;
  public busqueda = '';

  // ---------- Paginación en servidor ----------
  public paginaActual = 1;
  public totalRegistros = 0;
  public registrosPorPagina = 10;
  public ultimaPagina = 1;

  // ---------- ag-Grid ----------
  public gridApi!: GridApi;
  /** Para saber si la grilla está ordenada por una columna. */
  private columnApi?: ColumnApi;
  public columnDefs: any[] = [];

  private static readonly ANCHO_ABIERTA = 140;
  private static readonly ANCHO_PLEGADA = 50;

  private readonly unsubscribe$ = new Subject<void>();
  private timeoutIds = new Set<any>();
  private headerElement: Element | null = null;
  private readonly onHeaderClick: EventListener = () => this.toggleActionsColumn();

  @ViewChild(CampoBusquedaPaginacionComponent) campoBusquedaPaginacion!: CampoBusquedaPaginacionComponent;

  constructor(
    private _toastr: ToastrService,
    private modalService: NgbModal,
    private router: Router,
    private route: ActivatedRoute,
    private host: ElementRef,
    public _appAgGridService: AppAgGridService,
    private _loadingService: LoadingService,
    private _boletinService: BoletinService,
  ) {
    this.accesoModel = this.route.snapshot.data['access'] ?? this.route.snapshot.data['profile'] ?? {} as AccesoModel;
  }

  ngOnInit(): void {
    this.armarColumnas();
    this.allBoletines(1);
  }

  ngOnDestroy(): void {
    this.quitarListenersCabecera();
    this.timeoutIds.forEach(id => clearTimeout(id));
    this.timeoutIds.clear();
    this.modalService.dismissAll();
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

  private programar(fn: () => void, ms: number): void {
    const id = setTimeout(() => { this.timeoutIds.delete(id); fn(); }, ms);
    this.timeoutIds.add(id);
  }

  fun_home(): void { this.router.navigate(['/config']); }

  // ================================================================
  // COLUMNAS
  // ================================================================

  private armarColumnas(): void {
    this.columnDefs = [
      {
        // El asa del arrastre va en esta columna: se coge la fila y se sube o
        // se baja. El número es la posición que ocupa en la lista.
        headerName: 'Orden', field: 'orden', minWidth: 90, maxWidth: 110,
        rowDrag: () => !this.ordenadoPorColumna(),
        headerTooltip: 'Arrastre la fila para cambiar el orden',
        cellStyle: { textAlign: 'center' },
      },

      { headerName: 'ID', field: 'id', minWidth: 70, maxWidth: 80, cellStyle: { textAlign: 'center' } },
      {
        headerName: 'Título', field: 'titulo', minWidth: 200, cellStyle: { textAlign: 'left' },
        cellRenderer: (p: any) => {
          const obligatorio = p.data?.obligatorio
            ? `<i class="fa fa-circle-exclamation text-warning me-1" title="Lectura obligatoria"></i>` : '';
          return `<span title="${this.escapar(p.data?.descripcion ?? '')}">${obligatorio}${this.escapar(p.value ?? '')}</span>`;
        },
      },
      {
        headerName: 'Estado', field: 'estado', minWidth: 110, maxWidth: 130, cellStyle: { textAlign: 'center' },
        cellRenderer: (p: any) => {
          const clases: Record<string, string> = {
            VIGENTE: 'is-vigente', PROGRAMADO: 'is-programado', CADUCADO: 'is-caducado', INACTIVO: 'is-inactivo',
          };
          const nombres: Record<string, string> = {
            VIGENTE: 'Vigente', PROGRAMADO: 'Programado', CADUCADO: 'Caducado', INACTIVO: 'Inactivo',
          };
          return `<span class="bol-estado ${clases[p.value] ?? ''}">${nombres[p.value] ?? p.value}</span>`;
        },
      },
      { headerName: 'Desde', field: 'desde', minWidth: 105, maxWidth: 120, cellStyle: { textAlign: 'center' } },
      { headerName: 'Hasta', field: 'hasta', minWidth: 105, maxWidth: 120, cellStyle: { textAlign: 'center' } },
      {
        headerName: 'Imágenes', field: 'num_imagenes', minWidth: 95, maxWidth: 110, cellStyle: { textAlign: 'center' },
        cellRenderer: (p: any) => `<i class="fa fa-images me-1 text-muted"></i>${p.value ?? 0}`,
      },
      {
        headerName: 'Destinatarios', field: 'num_usuarios', minWidth: 140, maxWidth: 170, cellStyle: { textAlign: 'center' },
        cellRenderer: (p: any) =>
          `<span title="Usuarios añadidos uno a uno y grupos">${p.data?.num_usuarios ?? 0} <i class="fa fa-user text-muted"></i> · ${p.data?.num_grupos ?? 0} <i class="fa fa-sitemap text-muted"></i></span>`,
      },
      {
        headerName: 'Vistos', field: 'num_vistos', minWidth: 85, maxWidth: 100, cellStyle: { textAlign: 'center' },
      },
      {
        headerName: 'ACCIONES', field: 'actions', pinned: 'right',
        minWidth: AllBoletinesComponent.ANCHO_ABIERTA, maxWidth: AllBoletinesComponent.ANCHO_ABIERTA,
        cellStyle: { display: 'flex', justifyContent: 'center', alignItems: 'center' },
        cellRenderer: ButtonAccionBoletin,
        suppressMenu: true, sortable: false, resizable: false,
        headerComponentParams: { template: this.plantillaCabecera(false) },
      },
    ];
  }

  private escapar(s: string): string {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  private plantillaCabecera(plegada: boolean): string {
    return plegada
      ? `<div style="display:flex;align-items:center;justify-content:center;" title="Mostrar los botones"><i class="fas fa-bars"></i></div>`
      : `<div style="display:flex;align-items:center;justify-content:center;gap:5px;" title="Ocultar los botones"><span>ACCIONES</span><i class="fas fa-arrow-right"></i></div>`;
  }

  onGridReady(params: GridReadyEvent): void {
    this.gridApi = params.api;
    this.columnApi = params.columnApi;
    this.programar(() => this.montarListenersCabecera(), 500);
    this._appAgGridService.ajustarTamanoGrid(this.gridApi);
    this.ajustarAlturaGrid();
  }

  private montarListenersCabecera(): void {
    this.quitarListenersCabecera();
    this.headerElement = this.host.nativeElement.querySelector('.ag-header-cell[col-id="actions"]');
    this.headerElement?.addEventListener('click', this.onHeaderClick);
  }

  private quitarListenersCabecera(): void {
    this.headerElement?.removeEventListener('click', this.onHeaderClick);
    this.headerElement = null;
  }

  toggleActionsColumn(): void {
    if (!this.gridApi) { return; }
    this.accionesPlegadas = !this.accionesPlegadas;
    const ancho = this.accionesPlegadas ? AllBoletinesComponent.ANCHO_PLEGADA : AllBoletinesComponent.ANCHO_ABIERTA;
    const defs = this.gridApi.getColumnDefs() as any[];
    const col = defs.find(d => d.field === 'actions');
    if (!col) { return; }
    col.minWidth = ancho;
    col.maxWidth = ancho;
    col.headerComponentParams = { template: this.plantillaCabecera(this.accionesPlegadas) };
    this.gridApi.setColumnDefs(defs);
    this.gridApi.sizeColumnsToFit();
    this.programar(() => { this.gridApi.sizeColumnsToFit(); this.montarListenersCabecera(); }, 100);
  }

  @HostListener('window:resize')
  onResize(): void { this.ajustarTamanoGrid(); }

  ajustarTamanoGrid(): void {
    if (!this.gridApi) { return; }
    this._appAgGridService.ajustarTamanoGrid(this.gridApi);
    this.ajustarAlturaGrid();
  }

  /** La grilla llena lo que queda de pantalla: sin esto sale con alto cero. */
  ajustarAlturaGrid(): void {
    const el = this.host.nativeElement.querySelector('.ag-theme-alpine') as HTMLElement | null;
    if (!el || !this.gridApi) { return; }
    el.style.height = `${Math.max(240, window.innerHeight - el.getBoundingClientRect().top - 60)}px`;
    this.gridApi.sizeColumnsToFit();
  }

  onCellClicked(e: CellClickedEvent): void { this.selectedRow = e.data; }

  navegarConTeclado = this._appAgGridService.navegacionConFlechas((fila: BoletinModel) => this.selectedRow = fila);

  // ================================================================
  // DATOS
  // ================================================================

  async allBoletines(page: number = 1): Promise<void> {
    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(
        this._boletinService.allBoletines(page, this.registrosPorPagina, this.busqueda, this.estado)
      );

      if (res.body?.status !== 'success') { return; }
      const paginado = res.body.data?.data ?? res.body.data;
      this.boletines = paginado?.data ?? [];
      this.totalRegistros = paginado?.total ?? 0;
      this.paginaActual = paginado?.current_page ?? page;
      this.ultimaPagina = paginado?.last_page ?? 1;
      this.enPapelera = paginado?.en_papelera ?? 0;
      this.selectedRow = null;
      this.programar(() => this.ajustarTamanoGrid(), 100);
    } catch (e) {
      console.error('Error al listar boletines:', e);
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  onFilterTextBoxChanged(texto: string): void {
    this.busqueda = texto ?? '';
    this.allBoletines(1);
  }

  cambiarEstado(): void { this.allBoletines(1); }

  // ================================================================
  // ORDEN (arrastrando la fila)
  // ================================================================

  /**
   * La grilla está ordenada por una columna: el arrastre no podría reflejar
   * el orden manual, así que no se deja.
   */
  private ordenadoPorColumna(): boolean {
    return (this.columnApi?.getColumnState() ?? []).some(c => !!c.sort);
  }

  /** Se soltó la fila: se guarda el orden en el que quedó la página. */
  async alSoltarFila(): Promise<void> {
    if (this.ordenadoPorColumna()) {
      this._toastr.info('Quite el orden de la columna (clic en su cabecera) para ordenar arrastrando', 'Orden', { timeOut: 4000 });
      this.allBoletines(this.paginaActual);
      return;
    }

    const ids: number[] = [];
    this.gridApi?.forEachNodeAfterFilterAndSort((n: any) => { if (n.data?.id) { ids.push(n.data.id); } });
    if (ids.length < 2) { return; }

    try {
      const res: any = await firstValueFrom(this._boletinService.reordenarBoletines(ids));
      if (res?.status !== 'success') {
        this._toastr.error(res?.message ?? 'No se pudo cambiar el orden', 'Orden');
      } else if (res.data?.cambiados) {
        this._toastr.success(res.message, 'Orden', { timeOut: 2000 });
      }
    } catch (e) {
      console.error('Error al reordenar los boletines:', e);
    } finally {
      // Con los números ya renumerados por el servidor
      this.allBoletines(this.paginaActual);
    }
  }

  /**
   * Quién ha visto el boletín seleccionado: vistos, pendientes y los que
   * pidieron no volver a verlo.
   */
  verVistas(): void {
    if (!this.selectedRow) { return; }
    const modalRef = this.modalService.open(VistasBoletinComponent, {
      size: 'xl', centered: true, backdrop: 'static', keyboard: true, scrollable: true,
    });
    modalRef.componentInstance.registro_selected = this.selectedRow;
  }

  /** Papelera de reciclaje: lo eliminado se restaura o se borra de verdad desde ahí. */
  abrirPapelera(): void {
    const modalRef = this.modalService.open(PapeleraBoletinesComponent, {
      size: 'xl', centered: true, backdrop: 'static', keyboard: true,
    });
    modalRef.componentInstance.cambio.subscribe(() => this.allBoletines(this.paginaActual));
  }

  clearAllFilters(): void {
    this.busqueda = '';
    this.estado = 'TODOS';
    this.allBoletines(1);
  }

  // ---------- Paginación ----------
  firstPage(): void { if (this.paginaActual !== 1) { this.allBoletines(1); } }
  prevPage(): void { if (this.paginaActual > 1) { this.allBoletines(this.paginaActual - 1); } }
  nextPage(): void { if (this.paginaActual < this.ultimaPagina) { this.allBoletines(this.paginaActual + 1); } }
  ultimaPagina2(): void { if (this.paginaActual !== this.ultimaPagina) { this.allBoletines(this.ultimaPagina); } }

  get desdeRegistro(): number { return this.totalRegistros === 0 ? 0 : (this.paginaActual - 1) * this.registrosPorPagina + 1; }
  get hastaRegistro(): number { return Math.min(this.paginaActual * this.registrosPorPagina, this.totalRegistros); }

  // ================================================================
  // ACCIONES
  // ================================================================

  addBoletin(): void {
    const modalRef = this.modalService.open(SaveBoletinComponent, { size: 'xl', centered: true, backdrop: 'static', scrollable: true });
    modalRef.componentInstance.accion = 'add';
    modalRef.componentInstance.registrosE.subscribe(() => this.allBoletines(1));
  }

  editBoletin(b: BoletinModel): void {
    const modalRef = this.modalService.open(SaveBoletinComponent, { size: 'xl', centered: true, backdrop: 'static', scrollable: true });
    modalRef.componentInstance.accion = 'edit';
    modalRef.componentInstance.registro_selected = b;
    modalRef.componentInstance.registrosE.subscribe(() => this.allBoletines(this.paginaActual));
  }

  viewBoletin(b: BoletinModel): void {
    const modalRef = this.modalService.open(SaveBoletinComponent, { size: 'xl', centered: true, backdrop: 'static', scrollable: true });
    modalRef.componentInstance.accion = 'view';
    modalRef.componentInstance.registro_selected = b;
  }

  /** Abre el boletín como lo verá el usuario, con la marca de agua. */
  async previsualizar(b: BoletinModel): Promise<void> {
    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._boletinService.findByIdBoletin(b.id));
      if (res?.status !== 'success') { return; }
      if (!res.data.imagenes?.length) {
        this._toastr.info('Este boletín no tiene imágenes', 'Boletines');
        return;
      }
      const modalRef = this.modalService.open(VerBoletinesComponent, { size: 'xl', centered: true, backdrop: 'static', windowClass: 'bol-modal', backdropClass: 'bol-backdrop' });
      modalRef.componentInstance.boletines = [res.data];
      modalRef.componentInstance.vistaPrevia = true;
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  deleteBoletin(b: BoletinModel): void {
    const modalRef = this.modalService.open(DeleteBoletinComponent, { size: 'md', centered: true, backdrop: 'static' });
    modalRef.componentInstance.registro_selected = b;
    modalRef.componentInstance.registrosE.subscribe(() => this.allBoletines(this.paginaActual));
  }

  /**
   * Lo lanza ahora: avisa por websocket a los destinatarios que tengan la
   * sesión abierta, sin esperar a que vuelvan a entrar. No cambia nada del
   * boletín, así que se puede repetir.
   */
  async lanzar(b: BoletinModel): Promise<void> {
    if (!b?.id) { return; }

    const aviso = b.estado === 'VIGENTE'
      ? 'A quien esté con la sesión abierta le saldrá en pantalla en el momento. A los demás, al entrar.'
      : `Este boletín está ${(b.estado || '').toLowerCase()}: a quien esté con la sesión abierta le saldrá ahora, pero al entrar no lo verá mientras no esté vigente.`;

    const r = await Swal.fire({
      title: `¿Lanzar «${b.titulo}» ahora?`,
      html: `<p class="mb-0">${aviso}</p>`,
      icon: 'question',
      // El check va dentro del aviso: es una decisión del momento, no un ajuste
      input: 'checkbox',
      inputValue: 0,
      inputPlaceholder: 'Ignorar el «no volver a mostrar» de los usuarios',
      showCancelButton: true,
      confirmButtonColor: '#00acac',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Sí, lanzar',
      cancelButtonText: 'Cancelar',
      reverseButtons: true,
      customClass: { input: 'text-start' },
    });
    if (!r.isConfirmed) { return; }

    // Marcado: a quien lo había ocultado se le retira la marca y vuelve a verlo
    const ignorar = !!r.value;

    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._boletinService.lanzarBoletin(b.id, ignorar));
      if (res?.status === 'success') {
        this._toastr.success(res.message, 'Boletines', { closeButton: true });
      } else {
        this._toastr.error(res?.message ?? 'No se pudo lanzar el boletín', 'Boletines');
      }
    } catch (e: any) {
      console.error('Error al lanzar el boletín:', e);
      this._toastr.error(e?.error?.message ?? 'No se pudo lanzar el boletín', 'Boletines');
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  /**
   * Historial de cambios del boletín seleccionado.
   *
   * El modal espera «tablaNombre» —así se llama su @Input— y ese nombre es el
   * de la tabla en auditoria.logs_cambios, sin el esquema.
   */
  auditoria(): void {
    if (!this.selectedRow) { return; }
    const modalRef = this.modalService.open(AuditoriaModalComponent, { size: 'xl', centered: true, backdrop: 'static', keyboard: true });
    modalRef.componentInstance.tablaNombre = 'boletines';
    modalRef.componentInstance.registroId = this.selectedRow.id;
  }
}

// ================================================================
// RENDERER DE LA COLUMNA ACCIONES
// ================================================================
@Component({
  selector: 'app-button-accion-boletin',
  standalone: false,
  template: `
    @if (parent.accionesPlegadas) {
      <button type="button" class="btn btn-sm btn-outline-primary acciones-desplegar" title="Mostrar los botones" (click)="parent.toggleActionsColumn()">
        <i class="fas fa-bars"></i>
      </button>
    } @else {
      <span class="d-flex gap-1">
        <button type="button" class="btn btn-xs btn-white" title="Ver como lo verá el usuario" (click)="parent.previsualizar(params.data)">
          <i class="fa fa-eye"></i>
        </button>
        <button type="button" class="btn btn-xs btn-white text-primary"
                [disabled]="params.data?.estado === 'INACTIVO'"
                [title]="params.data?.estado === 'INACTIVO' ? 'Un boletín inactivo no se puede lanzar' : 'Lanzarlo ahora a los destinatarios conectados'"
                (click)="parent.lanzar(params.data)">
          <i class="fa fa-paper-plane"></i>
        </button>
        <button type="button" class="btn btn-xs btn-white" title="Modificar" [disabled]="parent.accesoModel?.editar === false" (click)="parent.editBoletin(params.data)">
          <i class="fa fa-pen"></i>
        </button>
        <button type="button" class="btn btn-xs btn-white text-danger" title="Enviar a la papelera" [disabled]="parent.accesoModel?.eliminar === false" (click)="parent.deleteBoletin(params.data)">
          <i class="fa fa-trash"></i>
        </button>
      </span>
    }
  `,
  styles: [`
    .acciones-desplegar { width: 28px; height: 24px; padding: 0; display: inline-flex; align-items: center; justify-content: center; border-radius: .25rem; }
  `],
})
export class ButtonAccionBoletin implements ICellRendererAngularComp {
  public params: any;
  constructor(public parent: AllBoletinesComponent) {}
  agInit(params: any): void { this.params = params; }
  refresh(params: any): boolean { this.params = params; return true; }
}
