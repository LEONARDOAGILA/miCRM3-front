import { Component, ElementRef, EventEmitter, HostListener, Input, NgZone, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { CellClickedEvent, ColDef, GridApi, GridReadyEvent } from 'ag-grid-community';
import { ToastrService } from 'ngx-toastr';
import Swal from 'sweetalert2';

import { HorarioService } from '../../../services/horario.service';
import { AppAgGridService } from '../../../../../service/app-agGrid.service';
import { LoadingService } from '../../../../../service/loading.service';
import { AuditoriaModalComponent } from '../../../../../components/auditoria-modal/auditoria-modal.component';
import { CommonModule } from '@angular/common';
import { AgGridModule } from 'ag-grid-angular';
import { ModalHeaderComponent } from '../../../../../components/modal/modal-header/modal-header.component';

/**
 * Papelera de reciclaje de horarios (modal), la misma de usuarios y clientes.
 *
 * «Eliminar» un horario es un borrado lógico (deleted_at / deleted_by): sale
 * del listado y del combo de la ficha de usuario, pero SE QUEDA CON SUS
 * DÍAS. Desde aquí se restaura tal como estaba o se borra de verdad —y
 * entonces sí se van sus franjas.
 *
 * Un horario en uso no llega a la papelera: la base lo rechaza y dice cuántos
 * usuarios y grupos lo tienen.
 *
 * Emite `cambio` cada vez que algo sale de la papelera, para que la pantalla
 * que la abrió recargue. Sin suscripciones vivas: firstValueFrom.
 */
@Component({
  selector: 'app-papeleraHorarios',
  templateUrl: './papeleraHorarios.component.html',
  styleUrls: ['./papeleraHorarios.component.css'],
  standalone: true,
  imports: [CommonModule, AgGridModule, ModalHeaderComponent],
})
export class PapeleraHorariosComponent implements OnInit, OnDestroy {

  /** Algo se restauró o se borró: el listado ya no es fiel. */
  @Output() cambio = new EventEmitter<void>();

  /**
   * Si el horario puede ELIMINAR DEFINITIVAMENTE y vaciar la papelera.
   *
   * Es otro permiso distinto de «papelera»: con aquél se entra y se
   * restaura —que se puede deshacer—, y con éste se borra de verdad, que no.
   * Lo pasa la pantalla que abre la papelera, y el servidor lo exige otra
   * vez: esconder el botón no es un permiso.
   */
  @Input() puedeVaciar = false;
  /**
   * Si el horario puede auditar. Lo pasa la pantalla que abre la papelera.
   *
   * Por defecto `false`: sin el dato, no se enseña un botón que el servidor
   * va a rechazar.
   */
  @Input() puedeAuditar = false;

  public isLoading$ = this._loadingService.isLoading$;
  public items: any[] = [];
  public seleccionado: any | null = null;

  public gridApi!: GridApi;
  public columnDefs: ColDef[] = [];

  // ---------- Menú contextual (clic derecho) ----------
  menuCtx = { visible: false, x: 0, y: 0, elemento: null as any, lote: [] as any[] };
  @ViewChild('menuCtxEl') menuCtxEl?: ElementRef<HTMLElement>;
  private readonly cerrarMenuPorScroll = () => {
    if (this.menuCtx.visible) { this.ngZone.run(() => this.cerrarMenu()); }
  };

  constructor(
    public modal: NgbActiveModal,
    /** Para abrir la auditoría ENCIMA de esta ventana, sin cerrarla. */
    private modalService: NgbModal,
    private _horario: HorarioService,
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
  get lote(): any[] {
    const sel = (this.gridApi?.getSelectedRows() ?? []) as any[];
    return sel.length ? sel : (this.seleccionado ? [this.seleccionado] : []);
  }

  private loteDe(p: any): any[] {
    const sel = (this.gridApi?.getSelectedRows() ?? []) as any[];
    return sel.some(s => s.id === p.id) ? sel : [p];
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
    let elemento: any = null;
    if (fila) {
      const nodo = this.gridApi?.getDisplayedRowAtIndex(Number(fila.getAttribute('row-index')));
      elemento = nodo?.data ?? null;
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
        headerName: 'Horario', field: 'nombre', width: 260, cellStyle: { textAlign: 'left' },
        checkboxSelection: true, headerCheckboxSelection: true,
        cellRenderer: (p: any) => `<b>${this.escapeHtml(p.value ?? '')}</b>`,
      },
      {
        // POR QUÉ ESTÁ ESTA COLUMNA: es lo que decide entre restaurar y
        // rehacer. Un horario son sus franjas de días con sus horas, y
        // restaurarlo las devuelve todas.
        headerName: 'Días', field: 'num_dias', width: 100, maxWidth: 110,
        cellStyle: { textAlign: 'center' },
        headerTooltip: 'Días configurados con sus horas; vuelven con el horario al restaurarlo',
        cellRenderer: (p: any) => {
          const n = Number(p.value ?? 0);
          return n
            ? `<span class="ph-dias"><i class="fa fa-calendar-day"></i>${n}</span>`
            : `<span class="ph-dias ph-dias--vacio" title="No tenía ningún día configurado"><i class="fa fa-calendar-day"></i>0</span>`;
        },
      },
      {
        headerName: 'Estado', field: 'activo', width: 110, maxWidth: 120, cellStyle: { textAlign: 'center' },
        cellRenderer: (p: any) => p.value
          ? '<span class="badge bg-teal fs-10px">ACTIVO</span>'
          : '<span class="badge bg-danger fs-10px">INACTIVO</span>',
      },
      { headerName: 'Eliminado', field: 'deleted_at', width: 160, maxWidth: 170, cellStyle: { textAlign: 'center' } },
      { headerName: 'Eliminado por', field: 'deleted_by', width: 140, maxWidth: 170,
        headerTooltip: 'Usuario que lo envió a la papelera',
        valueGetter: p => p.data?.deleted_by || '—', cellStyle: { textAlign: 'left' } },
    ];
  }

  onGridReady(params: GridReadyEvent): void {
    this.gridApi = params.api;
    this.gridApi.setRowData(this.items);
  }

  navegarConTeclado = this._appAgGridService.navegacionConFlechas((fila: any) => this.seleccionado = fila);

  onCellClicked(e: CellClickedEvent): void {
    this.seleccionado = e.data;
  }

  // ================================================================
  // DATOS
  // ================================================================

  async cargar(): Promise<void> {
    try {
      this._loadingService.setLoading(true);
      const res = await firstValueFrom(this._horario.papelera()) as any;
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

  private nombres(lote: any[]): string {
    return lote.length === 1 ? `«${lote[0].nombre}»` : `${lote.length} horarios`;
  }

  async restaurar(horarios?: any[]): Promise<void> {
    const lote = horarios?.length ? horarios : this.lote;
    if (!lote.length) { return; }
    try {
      this._loadingService.setLoading(true);
      const res = await firstValueFrom(this._horario.restaurarHorarios(lote.map(p => p.id))) as any;
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
  async eliminarDefinitivo(horarios?: any[]): Promise<void> {
    // Sin el permiso «vaciar» no se eliminar definitivamente, ni aunque se
    // llame a mano desde el menú del botón derecho.
    if (!this.puedeVaciar) { return; }
    const lote = horarios?.length ? horarios : this.lote;
    if (!lote.length) { return; }

    const dias = lote.reduce((n, h) => n + Number(h.num_dias ?? 0), 0);

    const confirmado = await this.confirmar(
      `¿Eliminar definitivamente ${this.nombres(lote)}?`,
      `Se borrará de forma permanente${dias ? `, con sus ${dias} días configurados` : ''}. `
      + 'Su historial de auditoría se conserva. Esta acción no se puede deshacer.'
    );
    if (!confirmado) { return; }

    try {
      this._loadingService.setLoading(true);
      const res = await firstValueFrom(this._horario.eliminarDefinitivo(lote.map(p => p.id))) as any;
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
    // Sin el permiso «vaciar» no se vaciar la papelera, ni aunque se
    // llame a mano desde el menú del botón derecho.
    if (!this.puedeVaciar) { return; }
    if (!this.items.length) { return; }

    const confirmado = await this.confirmar(
      '¿Vaciar la papelera?',
      `Se borrarán de forma permanente ${this.items.length} ${this.items.length === 1 ? 'horario' : 'horarios'}, `
      + 'con sus días. Esta acción no se puede deshacer.'
    );
    if (!confirmado) { return; }

    try {
      this._loadingService.setLoading(true);
      const res = await firstValueFrom(this._horario.vaciarPapelera()) as any;
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
  get auditable(): any | null {
    return this.lote.length === 1 ? this.lote[0] : null;
  }

  /**
   * Historial de auditoría de un registro que está en la papelera.
   *
   * Está aquí porque el botón del listado sólo alcanza a las filas del
   * listado, y lo eliminado no está en ninguna: para ver quién lo borró
   * había que restaurarlo antes.
   *
   * Se abre ENCIMA de esta ventana (NgbModal, no NgbActiveModal): al cerrar
   * la auditoría se sigue en la papelera.
   */
  auditoria(registro?: any): void {
    const quien = registro ?? this.auditable;
    if (!quien || !this.puedeAuditar) { return; }

    const ref = this.modalService.open(AuditoriaModalComponent, {
      centered: true, size: 'xl', backdrop: 'static', keyboard: true
    });
    ref.componentInstance.tablaNombre = 'chorarios';
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
