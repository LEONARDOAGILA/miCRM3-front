import { Component, ElementRef, EventEmitter, HostListener, Input, NgZone, OnDestroy, OnInit, Output, ViewChild, ChangeDetectionStrategy } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { CellClickedEvent, ColDef, GridApi, GridReadyEvent } from 'ag-grid-community';
import { ToastrService } from 'ngx-toastr';
import Swal from 'sweetalert2';

import { GrupoClienteService } from '../../../../services/grupoCliente.service';
import { GrupoClienteModel } from '../../../../interfaces/grupoClienteModel';
import { AppAgGridService } from '../../../../../../service/app-agGrid.service';
import { LoadingService } from '../../../../../../service/loading.service';
import { AuditoriaModalComponent } from '../../../../../../components/auditoria-modal/auditoria-modal.component';
import { CommonModule } from '@angular/common';
import { AgGridModule } from 'ag-grid-angular';
import { ModalHeaderComponent } from '../../../../../../components/modal/modal-header/modal-header.component';
import { FilasEstirablesDirective } from '../../../../../../core/directives/filasEstirables.directive';

/**
 * Papelera de reciclaje de grupos (modal), como la de clientes.
 *
 * «Eliminar» un grupo es un borrado lógico: sale del árbol y de los
 * combos y deja de contar como subgrupo de su padre, pero no se borra.
 *
 * LO QUE TIENE DE PROPIO, POR SER UN ÁRBOL: un grupo cuya madre también
 * está en la papelera NO se puede restaurar —colgaría de algo que no se ve—,
 * y eso se avisa aquí en lugar de dejar que falle al intentarlo. El servidor
 * lo manda ya resuelto en `padre_en_papelera`.
 */
@Component({
  selector: 'app-papeleraGruposClientes',
  templateUrl: './papeleraGruposClientes.component.html',
  styleUrls: ['./papeleraGruposClientes.component.css'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [CommonModule, AgGridModule, FilasEstirablesDirective, ModalHeaderComponent],
})
export class PapeleraGruposClientesComponent implements OnInit, OnDestroy {

  /** Algo se restauró o se borró: el árbol ya no es fiel. */
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
   * Por defecto `false`: sin el dato, no se enseña un botón que el servidor
   * va a rechazar.
   */
  @Input() puedeAuditar = false;

  public isLoading$ = this._loadingService.isLoading$;
  public items: GrupoClienteModel[] = [];
  public seleccionado: GrupoClienteModel | null = null;

  public gridApi!: GridApi;
  public columnDefs: ColDef[] = [];

  // ---------- Menú contextual (clic derecho) ----------
  menuCtx = { visible: false, x: 0, y: 0, elemento: null as GrupoClienteModel | null, lote: [] as GrupoClienteModel[] };
  @ViewChild('menuCtxEl') menuCtxEl?: ElementRef<HTMLElement>;
  private readonly cerrarMenuPorScroll = () => {
    if (this.menuCtx.visible) { this.ngZone.run(() => this.cerrarMenu()); }
  };

  constructor(
    public modal: NgbActiveModal,
    /** Para abrir la auditoría ENCIMA de esta ventana, sin cerrarla. */
    private modalService: NgbModal,
    private _grupoClienteService: GrupoClienteService,
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

  /** Sobre qué actúan los botones: las filas con casilla marcada, o la pulsada. */
  get lote(): GrupoClienteModel[] {
    const sel = (this.gridApi?.getSelectedRows() ?? []) as GrupoClienteModel[];
    return sel.length ? sel : (this.seleccionado ? [this.seleccionado] : []);
  }

  private loteDe(c: GrupoClienteModel): GrupoClienteModel[] {
    const sel = (this.gridApi?.getSelectedRows() ?? []) as GrupoClienteModel[];
    return sel.some(s => s.id === c.id) ? sel : [c];
  }

  /** Las del lote que NO podrán volver porque su padre sigue en la papelera. */
  get colgados(): GrupoClienteModel[] {
    return this.lote.filter(c => (c as any).padre_en_papelera === true);
  }

  /** Si todo lo elegido está colgando de algo que sigue en la papelera. */
  get todosColgados(): boolean {
    return this.lote.length > 0 && this.colgados.length === this.lote.length;
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
    let elemento: GrupoClienteModel | null = null;
    if (fila) {
      const nodo = this.gridApi?.getDisplayedRowAtIndex(Number(fila.getAttribute('row-index')));
      elemento = (nodo?.data as GrupoClienteModel) ?? null;
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
        headerName: 'Grupo', field: 'nombre', width: 240, cellStyle: { textAlign: 'left' },
        checkboxSelection: true, headerCheckboxSelection: true,
        cellRenderer: (p: any) => {
          const icono = p.data?.icono && /^[a-z0-9 -]+$/i.test(p.data.icono) ? p.data.icono : 'fa-folder';
          // Un aviso donde se ve: el padre sigue en la papelera y éste no
          // puede volver todavía.
          const colgado = p.data?.padre_en_papelera
            ? '<i class="fa fa-link-slash pc-colgado" title="Su grupo padre sigue en la papelera: restaure primero el de arriba"></i>'
            : '';
          return `<span class="pc-grupo"><i class="fa ${icono} pc-icono"></i>`
               + `<span class="pc-grupo__nombre">${this.escapeHtml(p.value ?? '')}</span>${colgado}</span>`;
        },
      },
      { headerName: 'Ruta', field: 'ruta', width: 280, cellStyle: { textAlign: 'left' },
        headerTooltip: 'Dónde volverá a colgar al restaurarlo',
        valueGetter: p => p.data?.ruta || p.data?.nombre || '—' },
      { headerName: 'Nivel', field: 'nivel', width: 80, maxWidth: 90, cellStyle: { textAlign: 'center' } },
      { headerName: 'Subgrupos', field: 'num_hijos', width: 120, maxWidth: 130, cellStyle: { textAlign: 'center' },
        headerTooltip: 'Subgrupos vigentes; con alguna no se puede borrar definitivamente' },
      { headerName: 'Clientes', field: 'num_clientes', width: 100, maxWidth: 110, cellStyle: { textAlign: 'center' },
        headerTooltip: 'Clientes vigentes que lo usan; con alguno no se puede borrar definitivamente' },
      { headerName: 'Eliminado', field: 'deleted_at', width: 160, maxWidth: 170, cellStyle: { textAlign: 'center' } },
      { headerName: 'Eliminado por', field: 'deleted_by', width: 130, maxWidth: 160,
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
    this.seleccionado = e.data as GrupoClienteModel;
  }

  // ================================================================
  // DATOS
  // ================================================================

  async cargar(): Promise<void> {
    try {
      this._loadingService.setLoading(true);
      const res = await firstValueFrom(this._grupoClienteService.papelera()) as any;
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

  private nombres(lote: GrupoClienteModel[]): string {
    return lote.length === 1 ? `«${lote[0].nombre}»` : `${lote.length} grupos`;
  }

  /**
   * El registro sobre el que se puede auditar: exactamente uno.
   *
   * La auditoría es de UN registro, así que con varias casillas marcadas no
   * hay a cuál mirar y el botón se apaga.
   */
  get auditable(): GrupoClienteModel | null {
    return this.lote.length === 1 ? this.lote[0] : null;
  }

  /**
   * Historial de auditoría de un grupo que está en la papelera: quién la
   * eliminó, sin tener que restaurarlo antes.
   */
  auditoria(grupo?: GrupoClienteModel): void {
    const quien = grupo ?? this.auditable;
    if (!quien || !this.puedeAuditar) { return; }

    const ref = this.modalService.open(AuditoriaModalComponent, {
      centered: true, size: 'xl', backdrop: 'static', keyboard: true
    });
    ref.componentInstance.tablaNombre = 'grupos_clientes';
    ref.componentInstance.registroId = quien.id;
  }

  async restaurar(grupos?: GrupoClienteModel[]): Promise<void> {
    const lote = grupos?.length ? grupos : this.lote;
    if (!lote.length) { return; }

    // Se avisa antes de llamar: el servidor lo rechazaría igual, pero así se
    // entiende por qué sin tener que leer un error.
    if (lote.every(c => (c as any).padre_en_papelera === true)) {
      this._toastr.info('Su grupo padre sigue en la papelera: restaure primero el de arriba', 'No se puede restaurar todavía');
      return;
    }

    try {
      this._loadingService.setLoading(true);
      const res = await firstValueFrom(this._grupoClienteService.restaurarGruposClientes(lote.map(c => c.id))) as any;
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
  async eliminarDefinitivo(grupos?: GrupoClienteModel[]): Promise<void> {
    // Sin el permiso «vaciar» no se eliminar definitivamente, ni aunque se
    // llame a mano desde el menú del botón derecho.
    if (!this.puedeVaciar) { return; }
    const lote = grupos?.length ? grupos : this.lote;
    if (!lote.length) { return; }

    const confirmado = await this.confirmar(
      `¿Eliminar definitivamente ${this.nombres(lote)}?`,
      'Se borrará de forma permanente. Si todavía le cuelga alguna subgrupo —aunque esté en la papelera— '
      + 'el sistema no lo permitirá: bórrelo antes. Su historial de auditoría se conserva. Esta acción no se puede deshacer.'
    );
    if (!confirmado) { return; }

    try {
      this._loadingService.setLoading(true);
      const res = await firstValueFrom(this._grupoClienteService.eliminarDefinitivo(lote.map(c => c.id))) as any;
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
      `Se borrarán de forma permanente ${this.items.length} ${this.items.length === 1 ? 'grupo' : 'grupos'}, `
      + 'empezando por las más hondas. Esta acción no se puede deshacer.'
    );
    if (!confirmado) { return; }

    try {
      this._loadingService.setLoading(true);
      const res = await firstValueFrom(this._grupoClienteService.vaciarPapelera()) as any;
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

  /** Confirmación destructiva con SweetAlert2, la misma que las otras papeleras. */
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
