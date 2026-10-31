import { Component, ElementRef, EventEmitter, HostListener, Input, NgZone, OnDestroy, OnInit, Output, ViewChild, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { AgGridModule } from 'ag-grid-angular';
import { CellClickedEvent, ColDef, GridApi, GridReadyEvent } from 'ag-grid-community';
import { ToastrService } from 'ngx-toastr';
import Swal from 'sweetalert2';

import { SucursalService, SucursalModel } from '../../../services/sucursal.service';
import { AppAgGridService } from '../../../../../service/app-agGrid.service';
import { LoadingService } from '../../../../../service/loading.service';
import { ModalHeaderComponent } from '../../../../../components/modal/modal-header/modal-header.component';
import { AuditoriaModalComponent } from '../../../../../components/auditoria-modal/auditoria-modal.component';
import { FilasEstirablesDirective } from '../../../../../core/directives/filasEstirables.directive';

/**
 * Papelera de reciclaje de sucursales (modal), la misma de marcas y clientes.
 *
 * «Eliminar» una sucursal es un borrado lógico (deleted_at / deleted_by):
 * acaba aquí sin salir en el listado ni poder asignarse a un empleado. Desde
 * aquí se restaura tal como estaba —con su perímetro— o se borra de verdad,
 * una, varias (casillas) o vaciando la papelera.
 *
 * Emite `cambio` cada vez que algo sale de la papelera, para que la pantalla
 * que la abrió recargue. Sin suscripciones vivas: firstValueFrom.
 */
@Component({
  selector: 'app-papeleraSucursales',
  standalone: true,
  imports: [CommonModule, AgGridModule, FilasEstirablesDirective, ModalHeaderComponent],
  templateUrl: './papeleraSucursales.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./papeleraSucursales.component.css'],
})
export class PapeleraSucursalesComponent implements OnInit, OnDestroy {

  /** Algo se restauró o se borró: el listado ya no es fiel. */
  @Output() cambio = new EventEmitter<void>();

  /**
   * Si el perfil puede ELIMINAR DEFINITIVAMENTE y vaciar la papelera.
   *
   * Es otro permiso distinto de «papelera»: con aquél se entra y se
   * restaura —que se puede deshacer—, y con éste se borra de verdad, que no.
   * Lo pasa la pantalla que abre la papelera, y el servidor lo exige otra
   * vez: esconder el botón no es un permiso.
   */
  @Input() puedeVaciar = false;
  /** Si el perfil puede auditar. Lo pasa la pantalla que abre la papelera. */
  @Input() puedeAuditar = false;

  public isLoading$ = this._loadingService.isLoading$;
  public items: SucursalModel[] = [];
  public seleccionado: SucursalModel | null = null;

  public gridApi!: GridApi;
  public columnDefs: ColDef[] = [];

  // ---------- Menú contextual (clic derecho) ----------
  menuCtx = { visible: false, x: 0, y: 0, elemento: null as SucursalModel | null, lote: [] as SucursalModel[] };
  @ViewChild('menuCtxEl') menuCtxEl?: ElementRef<HTMLElement>;
  private readonly cerrarMenuPorScroll = () => {
    if (this.menuCtx.visible) { this.ngZone.run(() => this.cerrarMenu()); }
  };

  constructor(
    public modal: NgbActiveModal,
    /** Para abrir la auditoría ENCIMA de esta ventana, sin cerrarla. */
    private modalService: NgbModal,
    private _sucursalService: SucursalService,
    private _toastr: ToastrService,
    private _loadingService: LoadingService,
    public _appAgGridService: AppAgGridService,
    private ngZone: NgZone
  ) {}

  ngOnInit(): void {
    this.initializeGrid();
    this.cargar();
    this.ngZone.runOutsideAngular(() => document.addEventListener('scroll', this.cerrarMenuPorScroll, true));
  }

  ngOnDestroy(): void {
    document.removeEventListener('scroll', this.cerrarMenuPorScroll, true);
  }

  // ================================================================
  // SELECCIÓN
  // ================================================================

  /** Sobre qué actúan los botones: las filas marcadas, o la fila pulsada. */
  get lote(): SucursalModel[] {
    const sel = (this.gridApi?.getSelectedRows() ?? []) as SucursalModel[];
    return sel.length ? sel : (this.seleccionado ? [this.seleccionado] : []);
  }

  private loteDe(s: SucursalModel): SucursalModel[] {
    const sel = (this.gridApi?.getSelectedRows() ?? []) as SucursalModel[];
    return sel.some(x => x.id === s.id) ? sel : [s];
  }

  private escapeHtml(s: string): string {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ================================================================
  // MENÚ CONTEXTUAL
  // ================================================================

  onContextMenuGrilla(e: MouseEvent): void {
    if ((e.target as HTMLElement).closest('.ag-header')) { return; }
    e.preventDefault();
    const fila = (e.target as HTMLElement).closest('.ag-row') as HTMLElement | null;
    let elemento: SucursalModel | null = null;
    if (fila) {
      const nodo = this.gridApi?.getDisplayedRowAtIndex(Number(fila.getAttribute('row-index')));
      elemento = (nodo?.data as SucursalModel) ?? null;
      if (nodo && !nodo.isSelected()) { nodo.setSelected(true, true); }
      this.seleccionado = elemento;
    }
    this.menuCtx = { visible: true, x: e.clientX, y: e.clientY, elemento, lote: elemento ? this.loteDe(elemento) : [] };
    setTimeout(() => {
      const el = this.menuCtxEl?.nativeElement;
      if (!el) { return; }
      const r = el.getBoundingClientRect();
      if (r.right > window.innerWidth)   { this.menuCtx.x = Math.max(0, window.innerWidth - r.width - 8); }
      if (r.bottom > window.innerHeight) { this.menuCtx.y = Math.max(0, window.innerHeight - r.height - 8); }
    });
  }

  cerrarMenu(): void {
    if (this.menuCtx.visible) { this.menuCtx.visible = false; }
  }

  @HostListener('document:click')
  @HostListener('document:keydown.escape')
  @HostListener('window:resize')
  onCerrarMenuGlobal(): void { this.cerrarMenu(); }

  // ================================================================
  // GRILLA
  // ================================================================

  initializeGrid(): void {
    this.columnDefs = [
      {
        headerName: 'Sucursal', field: 'nombre', width: 260, cellStyle: { textAlign: 'left' },
        checkboxSelection: true, headerCheckboxSelection: true,
        cellRenderer: (p: any) => {
          const codigo = p.data?.codigo
            ? `<span class="ps-suc__codigo">${this.escapeHtml(p.data.codigo)}</span>` : '';
          return `<span class="ps-suc">${codigo}<span class="ps-suc__nombre">${this.escapeHtml(p.value ?? '')}</span></span>`;
        },
      },
      {
        headerName: 'Perímetro', field: 'tiene_perimetro', width: 140, maxWidth: 160,
        cellStyle: { textAlign: 'center' },
        headerTooltip: 'Al restaurarla vuelve con el perímetro que tenía',
        cellRenderer: (p: any) => {
          if (!p.data?.tiene_perimetro) {
            return `<span class="ps-perim ps-perim--no"><i class="fa fa-earth-americas"></i> Sin perímetro</span>`;
          }
          const detalle = p.data?.tipo === 'CIRCULO'
            ? `${Math.round(Number(p.data?.radio_metros ?? 0))} m`
            : `${p.data?.num_vertices} esquinas`;
          const icono = p.data?.tipo === 'CIRCULO' ? 'fa-circle-dot' : 'fa-draw-polygon';
          return `<span class="ps-perim ps-perim--si"><i class="fa ${icono}"></i> ${detalle}</span>`;
        },
      },
      { headerName: 'Dirección', field: 'direccion', width: 220, maxWidth: 320, cellStyle: { textAlign: 'left' },
        valueGetter: p => p.data?.direccion || '—' },
      { headerName: 'Teléfono', field: 'telefono', width: 130, maxWidth: 160, cellStyle: { textAlign: 'left' },
        valueGetter: p => p.data?.telefono || '—' },
      { headerName: 'Empleados', field: 'num_empleados', width: 100, maxWidth: 110, cellStyle: { textAlign: 'center' },
        headerTooltip: 'Empleados asignados. Una sucursal sólo llega a la papelera sin empleados, '
                     + 'así que aquí es 0 salvo que alguien la haya asignado después',
        cellRenderer: (p: any) => {
          const n = Number(p.value ?? 0);
          return n ? `<i class="fa fa-users me-1 text-muted"></i>${n}` : '0';
        } },
      { headerName: 'Eliminada', field: 'deleted_at', width: 160, maxWidth: 170, cellStyle: { textAlign: 'center' } },
      { headerName: 'Eliminada por', field: 'deleted_by', width: 130, maxWidth: 160,
        headerTooltip: 'Usuario que la envió a la papelera',
        valueGetter: p => p.data?.deleted_by || '—', cellStyle: { textAlign: 'left' } },
    ];
  }

  onGridReady(params: GridReadyEvent): void {
    this.gridApi = params.api;
    this.gridApi.setGridOption('rowData', this.items);
  }

  navegarConTeclado = this._appAgGridService.navegacionConFlechas(fila => this.seleccionado = fila);

  onCellClicked(e: CellClickedEvent): void {
    this.seleccionado = e.data as SucursalModel;
  }

  // ================================================================
  // DATOS
  // ================================================================

  async cargar(): Promise<void> {
    try {
      this._loadingService.setLoading(true);
      const res = await firstValueFrom(this._sucursalService.papelera()) as any;
      this.items = res?.status === 'success' ? (res.data ?? []) : [];
      this.seleccionado = null;
      this.gridApi?.setGridOption('rowData', this.items);
    } catch (error) {
      console.error('Error al cargar la papelera:', error);
      this.items = [];
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  // ================================================================
  // ACCIONES
  // ================================================================

  private nombres(lote: SucursalModel[]): string {
    return lote.length === 1 ? `«${lote[0].nombre}»` : `${lote.length} sucursales`;
  }

  async restaurar(sucursales?: SucursalModel[]): Promise<void> {
    const lote = sucursales?.length ? sucursales : this.lote;
    if (!lote.length) { return; }
    try {
      this._loadingService.setLoading(true);
      const res = await firstValueFrom(this._sucursalService.restaurarSucursales(lote.map(s => s.id))) as any;
      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo restaurar', 'Error');
        return;
      }
      this._toastr.success(res.message, 'Restaurado', { closeButton: true });
      this.cambio.emit();
      await this.cargar();
    } catch (error) {
      console.error('Error al restaurar:', error);
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  /** Borrado real: pide confirmación porque no hay vuelta atrás. */
  async eliminarDefinitivo(sucursales?: SucursalModel[]): Promise<void> {
    // Sin el permiso «vaciar» no se elimina definitivamente, ni aunque se
    // llame a mano desde el menú del botón derecho.
    if (!this.puedeVaciar) { return; }
    const lote = sucursales?.length ? sucursales : this.lote;
    if (!lote.length) { return; }

    const confirmado = await this.confirmar(
      `¿Eliminar definitivamente ${this.nombres(lote)}?`,
      'Se borrará de forma permanente, con su perímetro. Su historial de auditoría se conserva. Esta acción no se puede deshacer.'
    );
    if (!confirmado) { return; }

    try {
      this._loadingService.setLoading(true);
      const res = await firstValueFrom(this._sucursalService.eliminarDefinitivo(lote.map(s => s.id))) as any;
      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo eliminar', 'Error');
        return;
      }
      this._toastr.success(res.message, 'Eliminado', { closeButton: true });
      this.cambio.emit();
      await this.cargar();
    } catch (error) {
      console.error('Error al eliminar definitivamente:', error);
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  async vaciar(): Promise<void> {
    if (!this.puedeVaciar) { return; }
    if (!this.items.length) { return; }

    const confirmado = await this.confirmar(
      '¿Vaciar la papelera?',
      `Se borrarán de forma permanente ${this.items.length} ${this.items.length === 1 ? 'sucursal' : 'sucursales'}, con sus perímetros. Esta acción no se puede deshacer.`
    );
    if (!confirmado) { return; }

    try {
      this._loadingService.setLoading(true);
      const res = await firstValueFrom(this._sucursalService.vaciarPapelera()) as any;
      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo vaciar la papelera', 'Error');
        return;
      }
      this._toastr.success(res.message, 'Papelera vacía', { closeButton: true });
      this.cambio.emit();
      await this.cargar();
    } catch (error) {
      console.error('Error al vaciar la papelera:', error);
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  /**
   * El registro sobre el que se puede auditar: exactamente uno.
   *
   * La auditoría es de UN registro, así que con varias casillas marcadas no
   * hay a cuál mirar y el botón se apaga.
   */
  get auditable(): SucursalModel | null {
    return this.lote.length === 1 ? this.lote[0] : null;
  }

  /**
   * Historial de auditoría de un registro que está en la papelera.
   *
   * Está aquí porque el botón del listado sólo alcanza a las filas del
   * listado, y lo eliminado no está en ninguna.
   *
   * Se abre ENCIMA de esta ventana (NgbModal, no NgbActiveModal): al cerrar
   * la auditoría se sigue en la papelera.
   */
  auditoria(registro?: SucursalModel): void {
    const quien = registro ?? this.auditable;
    if (!quien || !this.puedeAuditar) { return; }

    const ref = this.modalService.open(AuditoriaModalComponent, {
      centered: true, size: 'xl', backdrop: 'static', keyboard: true
    });
    ref.componentInstance.tablaNombre = 'sucursales';
    ref.componentInstance.registroId = quien.id;
  }

  /** Confirmación destructiva con SweetAlert2, la misma que las demás papeleras. */
  private async confirmar(titulo: string, texto: string): Promise<boolean> {
    const r = await Swal.fire({
      title: titulo,
      text: texto,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      reverseButtons: true
    });
    return r.isConfirmed;
  }
}
