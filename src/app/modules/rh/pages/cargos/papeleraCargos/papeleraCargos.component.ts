import { Component, ElementRef, EventEmitter, HostListener, Input, NgZone, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { CellClickedEvent, ColDef, GridApi, GridReadyEvent } from 'ag-grid-community';
import { ToastrService } from 'ngx-toastr';
import Swal from 'sweetalert2';

import { CargoService } from '../../../services/cargo.service';
import { CargoModel } from '../../../interfaces/cargoModel';
import { AppAgGridService } from '../../../../../service/app-agGrid.service';
import { LoadingService } from '../../../../../service/loading.service';
import { AuditoriaModalComponent } from '../../../../../components/auditoria-modal/auditoria-modal.component';
import { CommonModule } from '@angular/common';
import { AgGridModule } from 'ag-grid-angular';
import { ModalHeaderComponent } from '../../../../../components/modal/modal-header/modal-header.component';
import { FilasEstirablesDirective } from '../../../../../core/directives/filasEstirables.directive';

/**
 * Papelera de reciclaje de cargos (modal), la misma de marcas y departamentos.
 *
 * «Eliminar» un cargo es un borrado lógico (deleted_at / deleted_by): acaba
 * aquí sin salir en el listado ni en el combo de la ficha del empleado. Desde
 * aquí se restaura tal como estaba o se borra de verdad, uno, varios
 * (casillas) o vaciando la papelera.
 *
 * Emite `cambio` cada vez que algo sale de la papelera, para que la pantalla
 * que la abrió recargue. Sin suscripciones vivas: firstValueFrom.
 */
@Component({
  selector: 'app-papeleraCargos',
  templateUrl: './papeleraCargos.component.html',
  styleUrls: ['./papeleraCargos.component.css'],
  standalone: true,
  imports: [CommonModule, AgGridModule, FilasEstirablesDirective, ModalHeaderComponent],
})
export class PapeleraCargosComponent implements OnInit, OnDestroy {

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
  /**
   * Si el perfil puede auditar. Lo pasa la pantalla que abre la papelera.
   *
   * Por defecto `false`: sin el dato, no se enseña un botón que el
   * servidor va a rechazar.
   */
  @Input() puedeAuditar = false;

  public isLoading$ = this._loadingService.isLoading$;
  public items: CargoModel[] = [];
  public seleccionado: CargoModel | null = null;

  public gridApi!: GridApi;
  public columnDefs: ColDef[] = [];

  // ---------- Menú contextual (clic derecho) ----------
  menuCtx = { visible: false, x: 0, y: 0, elemento: null as CargoModel | null, lote: [] as CargoModel[] };
  @ViewChild('menuCtxEl') menuCtxEl?: ElementRef<HTMLElement>;
  private readonly cerrarMenuPorScroll = () => {
    if (this.menuCtx.visible) { this.ngZone.run(() => this.cerrarMenu()); }
  };

  constructor(
    public modal: NgbActiveModal,
    /** Para abrir la auditoría ENCIMA de esta ventana, sin cerrarla. */
    private modalService: NgbModal,
    private _cargoService: CargoService,
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
  get lote(): CargoModel[] {
    const sel = (this.gridApi?.getSelectedRows() ?? []) as CargoModel[];
    return sel.length ? sel : (this.seleccionado ? [this.seleccionado] : []);
  }

  private loteDe(c: CargoModel): CargoModel[] {
    const sel = (this.gridApi?.getSelectedRows() ?? []) as CargoModel[];
    return sel.some(s => s.id === c.id) ? sel : [c];
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
    let elemento: CargoModel | null = null;
    if (fila) {
      const nodo = this.gridApi?.getDisplayedRowAtIndex(Number(fila.getAttribute('row-index')));
      elemento = (nodo?.data as CargoModel) ?? null;
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

  /** 1500 → "$ 1.500,00"; vacío si no hay salario (el mismo de allCargos). */
  private formatoMoneda(valor: any): string {
    if (valor === null || valor === undefined || valor === '') { return ''; }
    const n = Number(valor);
    if (isNaN(n)) { return String(valor); }
    return '$ ' + n.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  initializeGrid(): void {
    this.columnDefs = [
      {
        headerName: 'Cargo', field: 'nombre', width: 240, cellStyle: { textAlign: 'left' },
        checkboxSelection: true, headerCheckboxSelection: true,
        cellRenderer: (p: any) =>
          `<span class="pc-cargo"><i class="fa fa-id-badge pc-icono"></i>`
        + `<span class="pc-cargo__nombre">${this.escapeHtml(p.value ?? '')}</span></span>`,
      },
      { headerName: 'Nivel', field: 'nivel', width: 130, maxWidth: 150, cellStyle: { textAlign: 'center' },
        cellRenderer: (p: any) => p.value
          ? `<span class="badge bg-secondary bg-opacity-25 text-body fs-10px">${this.escapeHtml(p.value)}</span>`
          : '—' },
      { headerName: 'Salario base', field: 'salario_base', width: 130, maxWidth: 150, cellStyle: { textAlign: 'right' },
        valueFormatter: p => this.formatoMoneda(p.value) },
      { headerName: 'Descripción', field: 'descripcion', width: 240, cellStyle: { textAlign: 'left' },
        valueGetter: p => p.data?.descripcion || '—' },
      { headerName: 'Estado', field: 'activo', width: 100, maxWidth: 110, cellStyle: { textAlign: 'center' },
        headerTooltip: 'Cómo estaba al enviarlo a la papelera; así vuelve al restaurarlo',
        cellRenderer: (p: any) => p.value
          ? '<span class="badge bg-teal fs-10px">ACTIVO</span>'
          : '<span class="badge bg-danger fs-10px">INACTIVO</span>' },
      { headerName: 'Empleados', field: 'num_empleados', width: 100, maxWidth: 110, cellStyle: { textAlign: 'center' },
        headerTooltip: 'Empleados vigentes que lo usan. Un cargo sólo llega a la papelera sin gente, '
                     + 'así que aquí es 0 salvo que alguien haya restaurado un empleado después',
        cellRenderer: (p: any) => {
          const n = Number(p.value ?? 0);
          return n ? `<i class="fa fa-user me-1 text-muted"></i>${n}` : '0';
        } },
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
    this.seleccionado = e.data as CargoModel;
  }

  // ================================================================
  // DATOS
  // ================================================================

  async cargar(): Promise<void> {
    try {
      this._loadingService.setLoading(true);
      const res = await firstValueFrom(this._cargoService.papelera()) as any;
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

  private nombres(lote: CargoModel[]): string {
    return lote.length === 1 ? `«${lote[0].nombre}»` : `${lote.length} cargos`;
  }

  async restaurar(cargos?: CargoModel[]): Promise<void> {
    const lote = cargos?.length ? cargos : this.lote;
    if (!lote.length) { return; }
    try {
      this._loadingService.setLoading(true);
      const res = await firstValueFrom(this._cargoService.restaurarCargos(lote.map(c => c.id))) as any;
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
  async eliminarDefinitivo(cargos?: CargoModel[]): Promise<void> {
    // Sin el permiso «vaciar» no se elimina definitivamente, ni aunque se
    // llame a mano desde el menú del botón derecho.
    if (!this.puedeVaciar) { return; }
    const lote = cargos?.length ? cargos : this.lote;
    if (!lote.length) { return; }

    const confirmado = await this.confirmar(
      `¿Eliminar definitivamente ${this.nombres(lote)}?`,
      'Se borrará de forma permanente. Si todavía aparece en el historial de cargos de algún empleado '
      + 'el sistema no lo permitirá. Su historial de auditoría se conserva. Esta acción no se puede deshacer.'
    );
    if (!confirmado) { return; }

    try {
      this._loadingService.setLoading(true);
      const res = await firstValueFrom(this._cargoService.eliminarDefinitivo(lote.map(c => c.id))) as any;
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
    // Sin el permiso «vaciar» no se vacía la papelera, ni aunque se llame a
    // mano desde el menú del botón derecho.
    if (!this.puedeVaciar) { return; }
    if (!this.items.length) { return; }

    const confirmado = await this.confirmar(
      '¿Vaciar la papelera?',
      `Se borrarán de forma permanente ${this.items.length} ${this.items.length === 1 ? 'cargo' : 'cargos'}. `
      + 'Los que aparezcan en el historial de algún empleado se quedarán. Esta acción no se puede deshacer.'
    );
    if (!confirmado) { return; }

    try {
      this._loadingService.setLoading(true);
      const res = await firstValueFrom(this._cargoService.vaciarPapelera()) as any;
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
   * La auditoría es de UN registro, así que con varias casillas marcadas
   * no hay a cuál mirar y el botón se apaga.
   */
  get auditable(): CargoModel | null {
    return this.lote.length === 1 ? this.lote[0] : null;
  }

  /**
   * Historial de auditoría de un registro que está en la papelera.
   *
   * Está aquí porque el botón del listado sólo alcanza a las filas del
   * listado, y lo eliminado no está en ninguna: para ver quién lo borró
   * había que restaurarlo antes.
   *
   * Se abre ENCIMA de esta ventana (NgbModal, no NgbActiveModal): al
   * cerrar la auditoría se sigue en la papelera.
   */
  auditoria(registro?: CargoModel): void {
    const quien = registro ?? this.auditable;
    if (!quien || !this.puedeAuditar) { return; }

    const ref = this.modalService.open(AuditoriaModalComponent, {
      centered: true, size: 'xl', backdrop: 'static', keyboard: true
    });
    ref.componentInstance.tablaNombre = 'cargos';
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
