import { Component, ElementRef, EventEmitter, HostListener, NgZone, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { CellClickedEvent, ColDef, GridApi, GridReadyEvent } from 'ag-grid-community';
import { ToastrService } from 'ngx-toastr';
import Swal from 'sweetalert2';

import { ClienteService } from '../../../services/cliente.service';
import { ClienteModel } from '../../../interfaces/clienteModel';
import { AppAgGridService } from '../../../../../service/app-agGrid.service';
import { LoadingService } from '../../../../../service/loading.service';

/**
 * Papelera de reciclaje de clientes (modal), calcada de la de usuarios.
 *
 * "Eliminar" un cliente es un borrado lógico (deleted_at / deleted_by): acaba
 * aquí sin salir en ningún listado ni poder elegirse en una venta. Desde aquí
 * se restaura tal como estaba —con sus contactos, su dirección y sus fotos— o
 * se borra de verdad, uno, varios (casillas) o vaciando la papelera.
 *
 * Emite `cambio` cada vez que algo sale de la papelera, para que la pantalla
 * que la abrió recargue. Sin suscripciones vivas: firstValueFrom.
 */
@Component({
  selector: 'app-papeleraClientes',
  templateUrl: './papeleraClientes.component.html',
  styleUrls: ['./papeleraClientes.component.css'],
  standalone: false,
})
export class PapeleraClientesComponent implements OnInit, OnDestroy {

  /** Algo se restauró o se borró: la lista de clientes ya no es fiel. */
  @Output() cambio = new EventEmitter<void>();

  public isLoading$ = this._loadingService.isLoading$;
  public items: ClienteModel[] = [];
  public seleccionado: ClienteModel | null = null;

  public gridApi!: GridApi;
  public columnDefs: ColDef[] = [];

  // ---------- Menú contextual (clic derecho) ----------
  menuCtx = { visible: false, x: 0, y: 0, elemento: null as ClienteModel | null, lote: [] as ClienteModel[] };
  @ViewChild('menuCtxEl') menuCtxEl?: ElementRef<HTMLElement>;
  private readonly cerrarMenuPorScroll = () => {
    if (this.menuCtx.visible) { this.ngZone.run(() => this.cerrarMenu()); }
  };

  constructor(
    public modal: NgbActiveModal,
    private _clienteService: ClienteService,
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

  /** Sobre qué actúan los botones: las filas con casilla marcada, o la fila pulsada. */
  get lote(): ClienteModel[] {
    const sel = (this.gridApi?.getSelectedRows() ?? []) as ClienteModel[];
    return sel.length ? sel : (this.seleccionado ? [this.seleccionado] : []);
  }

  private loteDe(u: ClienteModel): ClienteModel[] {
    const sel = (this.gridApi?.getSelectedRows() ?? []) as ClienteModel[];
    return sel.some(s => s.id === u.id) ? sel : [u];
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
    let elemento: ClienteModel | null = null;
    if (fila) {
      const nodo = this.gridApi?.getDisplayedRowAtIndex(Number(fila.getAttribute('row-index')));
      elemento = (nodo?.data as ClienteModel) ?? null;
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
        headerName: 'Cliente', field: 'nombre_completo', width: 240, cellStyle: { textAlign: 'left' },
        checkboxSelection: true, headerCheckboxSelection: true,
        cellRenderer: (p: any) => {
          const url = p.data?.foto ? this._clienteService.getClienteImage(p.data.id, false) : '';
          const icono = p.data?.tipo_cliente === 'EMPRESA' ? 'fa-building' : 'fa-user';
          const img = url
            ? `<img src="${url}" class="pu-avatar" alt="" onerror="this.style.display='none'">`
            : `<span class="pu-avatar pu-avatar--vacio"><i class="fa ${icono}"></i></span>`;
          return `<span class="pu-cliente">${img}<span class="pu-cliente__login">${this.escapeHtml(p.value ?? '')}</span></span>`;
        },
      },
      { headerName: 'Tipo', field: 'tipo_cliente', width: 100, maxWidth: 110, cellStyle: { textAlign: 'center' },
        cellRenderer: (p: any) => p.value === 'EMPRESA'
          ? '<span class="badge bg-indigo fs-10px">EMPRESA</span>'
          : '<span class="badge bg-secondary bg-opacity-25 text-body fs-10px">PERSONA</span>' },
      { headerName: 'Identificación', field: 'numero_identificacion', width: 140, maxWidth: 160, cellStyle: { textAlign: 'center' } },
      { headerName: 'Correo', field: 'email', width: 200, cellStyle: { textAlign: 'left' },
        valueGetter: p => p.data?.email || '—' },
      { headerName: 'Teléfono', width: 130, maxWidth: 150, cellStyle: { textAlign: 'left' },
        valueGetter: p => p.data?.celular || p.data?.telefono || '—' },
      { headerName: 'Vendedor', width: 160, cellStyle: { textAlign: 'left' },
        headerTooltip: 'Vendedor que volverá a tener asignado al restaurarlo',
        valueGetter: p => p.data?.vendedor_nombre || 'Sin vendedor' },
      { headerName: 'Contactos', field: 'num_contactos', width: 100, maxWidth: 110, cellStyle: { textAlign: 'center' },
        headerTooltip: 'Personas de contacto que se restauran con él' },
      { headerName: 'Eliminado', field: 'deleted_at', width: 160, maxWidth: 170, cellStyle: { textAlign: 'center' } },
      { headerName: 'Eliminado por', field: 'deleted_by', width: 130, maxWidth: 160,
        headerTooltip: 'Usuario que lo envió a la papelera',
        valueGetter: p => p.data?.deleted_by || '—', cellStyle: { textAlign: 'left' } },
    ];
  }

  onGridReady(params: GridReadyEvent): void {
    this.gridApi = params.api;
    this.gridApi.setRowData(this.items);
  }

  navegarConTeclado = this._appAgGridService.navegacionConFlechas(fila => this.seleccionado = fila);

  onCellClicked(e: CellClickedEvent): void {
    this.seleccionado = e.data as ClienteModel;
  }

  // ================================================================
  // DATOS
  // ================================================================

  async cargar(): Promise<void> {
    try {
      this._loadingService.setLoading(true);
      const res = await firstValueFrom(this._clienteService.papelera()) as any;
      this.items = res?.status === 'success' ? (res.data ?? []) : [];
      this.seleccionado = null;
      this.gridApi?.setRowData(this.items);
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

  private nombres(lote: ClienteModel[]): string {
    return lote.length === 1 ? `«${lote[0].nombre_completo}»` : `${lote.length} clientes`;
  }

  async restaurar(clientes?: ClienteModel[]): Promise<void> {
    const lote = clientes?.length ? clientes : this.lote;
    if (!lote.length) { return; }
    try {
      this._loadingService.setLoading(true);
      const res = await firstValueFrom(this._clienteService.restaurarClientes(lote.map(u => u.id))) as any;
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
  async eliminarDefinitivo(clientes?: ClienteModel[]): Promise<void> {
    const lote = clientes?.length ? clientes : this.lote;
    if (!lote.length) { return; }

    const confirmado = await this.confirmar(
      `¿Eliminar definitivamente ${this.nombres(lote)}?`,
      'Se borrará de forma permanente, con sus personas de contacto y sus imágenes. Su historial de auditoría se conserva. Esta acción no se puede deshacer.'
    );
    if (!confirmado) { return; }

    try {
      this._loadingService.setLoading(true);
      const res = await firstValueFrom(this._clienteService.eliminarDefinitivo(lote.map(u => u.id))) as any;
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
    if (!this.items.length) { return; }

    const confirmado = await this.confirmar(
      '¿Vaciar la papelera?',
      `Se borrarán de forma permanente ${this.items.length} ${this.items.length === 1 ? 'cliente' : 'clientes'}, con sus contactos y sus imágenes. Esta acción no se puede deshacer.`
    );
    if (!confirmado) { return; }

    try {
      this._loadingService.setLoading(true);
      const res = await firstValueFrom(this._clienteService.vaciarPapelera()) as any;
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

  /** Confirmación destructiva con SweetAlert2, la misma que usa la papelera de archivos. */
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
