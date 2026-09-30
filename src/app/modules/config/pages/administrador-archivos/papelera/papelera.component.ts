import { Component, ElementRef, EventEmitter, HostListener, Input, NgZone, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { CellClickedEvent, ColDef, GridApi, GridReadyEvent } from 'ag-grid-community';
import { ToastrService } from 'ngx-toastr';
import Swal from 'sweetalert2';

import { ArchivoService } from '../../../services/archivo.service';
import { AppAgGridService } from '../../../../../service/app-agGrid.service';
import { LoadingService } from '../../../../../service/loading.service';
import { formatoTamano } from '../../../interfaces/tipoArchivo';

/** Elemento en la papelera: la fila de `archivo` más la ruta donde estaba. */
interface ItemPapelera {
  id: number;
  nombre: string;
  descripcion?: string;
  escarpeta: boolean;
  icono?: string;
  color?: string;
  ruta: string;
  /** Bytes del fichero subido; 0/null en enlaces y carpetas */
  tamano?: number | null;
  url?: string;
  deleted_at_formateado?: string;
  /** Login de quien lo envió a la papelera */
  deleted_by?: string | null;
}

/**
 * Papelera de reciclaje del administrador de archivos.
 *
 * Lo que se "elimina" en el administrador acaba aquí (borrado lógico en el
 * back). Desde aquí se restaura —con su contenido y, si hace falta, sus
 * carpetas padre— o se borra de verdad, uno a uno o vaciando la papelera.
 *
 * Emite `cambio` cada vez que algo sale de la papelera, para que el
 * administrador recargue el árbol. Sin suscripciones vivas: firstValueFrom.
 */
@Component({
  selector: 'app-papelera',
  templateUrl: './papelera.component.html',
  styleUrls: ['./papelera.component.css'],
  standalone: false,
})
export class PapeleraComponent implements OnInit, OnDestroy {

  /** Algo se restauró o se borró: el árbol del administrador ya no es fiel. */
  @Output() cambio = new EventEmitter<void>();
  /**
   * Modo usuario (permiso `restaurar`): sólo ve lo que puede restaurar y no
   * puede borrar definitivamente ni vaciar (eso es de administrador; el back
   * también lo rechaza).
   */
  @Input() soloRestaurar = false;

  public isLoading$ = this._loadingService.isLoading$;
  public items: ItemPapelera[] = [];
  public seleccionado: ItemPapelera | null = null;

  public gridApi!: GridApi;
  public columnDefs: ColDef[] = [];

  // ---------- Menú contextual (clic derecho) ----------
  // Misma lógica que en el administrador: un menú en position: fixed en el
  // punto del clic, con opciones según haya una fila debajo o no.
  menuCtx = { visible: false, x: 0, y: 0, elemento: null as ItemPapelera | null };
  @ViewChild('menuCtxEl') menuCtxEl?: ElementRef<HTMLElement>;
  // Fuera de la zona de Angular (ver file-manager): sólo entra si hay menú que cerrar
  private readonly cerrarMenuPorScroll = () => {
    if (this.menuCtx.visible) { this.ngZone.run(() => this.cerrarMenu()); }
  };

  constructor(
    public modal: NgbActiveModal,
    private _archivoService: ArchivoService,
    private _toastr: ToastrService,
    private _loadingService: LoadingService,
    public _appAgGridService: AppAgGridService,
    private ngZone: NgZone
  ) {}

  ngOnInit(): void {
    this.initializeGrid();
    this.cargar();
    // capture:true — el scroll de la grilla no burbujea a window
    this.ngZone.runOutsideAngular(() => document.addEventListener('scroll', this.cerrarMenuPorScroll, true));
  }

  ngOnDestroy(): void {
    document.removeEventListener('scroll', this.cerrarMenuPorScroll, true);
  }

  // ================================================================
  // MENÚ CONTEXTUAL
  // ================================================================

  /** Clic derecho en la grilla: fila (se selecciona, como en Windows) o fondo. */
  onContextMenuGrilla(e: MouseEvent): void {
    e.preventDefault();
    const fila = (e.target as HTMLElement).closest('.ag-row') as HTMLElement | null;
    let elemento: ItemPapelera | null = null;

    if (fila) {
      const nodo = this.gridApi?.getDisplayedRowAtIndex(Number(fila.getAttribute('row-index')));
      elemento = (nodo?.data as ItemPapelera) ?? null;
      if (nodo) {
        nodo.setSelected(true, true);
        this.seleccionado = elemento;
      }
    }

    this.menuCtx = { visible: true, x: e.clientX, y: e.clientY, elemento };

    // Ya pintado: si se sale de la ventana, se recoloca hacia dentro
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

  get numCarpetas(): number { return this.items.filter(i => i.escarpeta).length; }
  get numArchivos(): number { return this.items.length - this.numCarpetas; }

  /** Bytes que siguen ocupando en disco los ficheros subidos que hay en la papelera. */
  get bytesOcupados(): number {
    return this.items.reduce((s, i) => s + (this.esSubida(i) ? Number(i.tamano || 0) : 0), 0);
  }

  get tamanoOcupado(): string { return formatoTamano(this.bytesOcupados); }

  /** Fichero subido al servidor (los enlaces y carpetas no ocupan disco). */
  private esSubida(i: ItemPapelera): boolean {
    return !i.escarpeta && !!i.url && i.url.startsWith('storage/');
  }

  // ================================================================
  // GRILLA
  // ================================================================

  initializeGrid(): void {
    this.columnDefs = [
      {
        headerName: '',
        field: 'icono',
        width: 44,
        maxWidth: 44,
        cellRenderer: (p: any) => {
          const n = p.data as ItemPapelera;
          const clase = n.icono || (n.escarpeta ? 'fa fa-folder' : 'far fa-file');
          const color = n.color || (n.escarpeta ? '#F0B13B' : '#A6A09B');
          return `<i class="${clase}" style="color:${color}"></i>`;
        },
        cellStyle: { display: 'flex', justifyContent: 'center', alignItems: 'center' },
        suppressMenu: true, sortable: false, filter: false, resizable: false
      },
      { headerName: 'Nombre', field: 'nombre', width: 270, cellStyle: { textAlign: 'left' } },
      {
        headerName: 'Tipo', field: 'escarpeta', width: 100, maxWidth: 110,
        valueGetter: p => p.data?.escarpeta ? 'Carpeta' : 'Archivo',
        cellStyle: { textAlign: 'center' }
      },
      {
        headerName: 'Tamaño', field: 'tamano', width: 90, maxWidth: 100,
        headerTooltip: 'Espacio que sigue ocupando en el servidor hasta borrarlo definitivamente',
        valueGetter: p => this.esSubida(p.data) ? formatoTamano(Number(p.data.tamano || 0)) : '',
        cellStyle: { textAlign: 'right' }
      },
      {
        headerName: 'Estaba en', field: 'ruta', width: 300,
        headerTooltip: 'Carpeta a la que volverá al restaurarlo',
        cellStyle: { textAlign: 'left' }
      },
      {
        headerName: 'Eliminado', field: 'deleted_at_formateado', width: 160, maxWidth: 170,
        cellStyle: { textAlign: 'center' }
      },
      {
        headerName: 'Eliminado por', field: 'deleted_by', width: 130, maxWidth: 160,
        headerTooltip: 'Usuario que lo envió a la papelera',
        valueGetter: p => p.data?.deleted_by || '—',
        cellStyle: { textAlign: 'left' }
      }
    ];
  }

  onGridReady(params: GridReadyEvent): void {
    this.gridApi = params.api;
    this.gridApi.setRowData(this.items);
    // Sin sizeColumnsToFit: columnas de ancho fijo; si no caben, scroll horizontal
  }

  /** ↑ / ↓ seleccionan la fila como un clic (ver AppAgGridService.navegacionConFlechas). */
  navegarConTeclado = this._appAgGridService.navegacionConFlechas(fila => this.seleccionado = fila);

  onCellClicked(e: CellClickedEvent): void {
    this.seleccionado = e.data as ItemPapelera;
  }

  // ================================================================
  // DATOS
  // ================================================================

  async cargar(): Promise<void> {
    try {
      this._loadingService.setLoading(true);
      const res = await firstValueFrom(this._archivoService.papelera());
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

  async restaurar(): Promise<void> {
    if (!this.seleccionado) { return; }
    try {
      this._loadingService.setLoading(true);
      const res = await firstValueFrom(this._archivoService.restaurarArchivo(this.seleccionado.id)) as any;
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

  /** Borrado real de un elemento: pide confirmación porque no hay vuelta atrás. */
  async eliminarDefinitivo(): Promise<void> {
    const item = this.seleccionado;
    if (!item) { return; }

    const confirmado = await this.confirmar(
      `¿Eliminar definitivamente «${item.nombre}»?`,
      item.escarpeta
        ? 'La carpeta y todo su contenido se borrarán de forma permanente. Esta acción no se puede deshacer.'
        : 'El archivo se borrará de forma permanente. Esta acción no se puede deshacer.'
    );
    if (!confirmado) { return; }

    try {
      this._loadingService.setLoading(true);
      const res = await firstValueFrom(this._archivoService.eliminarDefinitivo(item.id)) as any;
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
      `Se borrarán de forma permanente ${this.items.length} ${this.items.length === 1 ? 'elemento' : 'elementos'}`
      + (this.bytesOcupados > 0 ? ` y se liberarán ${this.tamanoOcupado} en el servidor` : '')
      + '. Esta acción no se puede deshacer.'
    );
    if (!confirmado) { return; }

    try {
      this._loadingService.setLoading(true);
      const res = await firstValueFrom(this._archivoService.vaciarPapelera()) as any;
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

  /** Confirmación destructiva con SweetAlert2, el mismo que usa "Cerrar sesión". */
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
