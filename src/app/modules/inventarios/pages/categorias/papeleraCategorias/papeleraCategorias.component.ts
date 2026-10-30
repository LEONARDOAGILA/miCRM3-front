import { Component, ElementRef, EventEmitter, HostListener, Input, NgZone, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { CellClickedEvent, ColDef, GridApi, GridReadyEvent } from 'ag-grid-community';
import { ToastrService } from 'ngx-toastr';
import Swal from 'sweetalert2';

import { CategoriaService } from '../../../services/categoria.service';
import { CategoriaModel } from '../../../interfaces/categoriaModel';
import { AppAgGridService } from '../../../../../service/app-agGrid.service';
import { LoadingService } from '../../../../../service/loading.service';
import { AuditoriaModalComponent } from '../../../../../components/auditoria-modal/auditoria-modal.component';
import { CommonModule } from '@angular/common';
import { AgGridModule } from 'ag-grid-angular';
import { ModalHeaderComponent } from '../../../../../components/modal/modal-header/modal-header.component';
import { FilasEstirablesDirective } from '../../../../../core/directives/filasEstirables.directive';

/**
 * Papelera de reciclaje de categorías (modal), como la de productos.
 *
 * «Eliminar» una categoría es un borrado lógico: sale del árbol y de los
 * combos y deja de contar como subcategoría de su madre, pero no se borra.
 *
 * LO QUE TIENE DE PROPIO, POR SER UN ÁRBOL: una categoría cuya madre también
 * está en la papelera NO se puede restaurar —colgaría de algo que no se ve—,
 * y eso se avisa aquí en lugar de dejar que falle al intentarlo. El servidor
 * lo manda ya resuelto en `padre_en_papelera`.
 */
@Component({
  selector: 'app-papeleraCategorias',
  templateUrl: './papeleraCategorias.component.html',
  styleUrls: ['./papeleraCategorias.component.css'],
  standalone: true,
  imports: [CommonModule, AgGridModule, FilasEstirablesDirective, ModalHeaderComponent],
})
export class PapeleraCategoriasComponent implements OnInit, OnDestroy {

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
  public items: CategoriaModel[] = [];
  public seleccionado: CategoriaModel | null = null;

  public gridApi!: GridApi;
  public columnDefs: ColDef[] = [];

  // ---------- Menú contextual (clic derecho) ----------
  menuCtx = { visible: false, x: 0, y: 0, elemento: null as CategoriaModel | null, lote: [] as CategoriaModel[] };
  @ViewChild('menuCtxEl') menuCtxEl?: ElementRef<HTMLElement>;
  private readonly cerrarMenuPorScroll = () => {
    if (this.menuCtx.visible) { this.ngZone.run(() => this.cerrarMenu()); }
  };

  constructor(
    public modal: NgbActiveModal,
    /** Para abrir la auditoría ENCIMA de esta ventana, sin cerrarla. */
    private modalService: NgbModal,
    private _categoriaService: CategoriaService,
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
  get lote(): CategoriaModel[] {
    const sel = (this.gridApi?.getSelectedRows() ?? []) as CategoriaModel[];
    return sel.length ? sel : (this.seleccionado ? [this.seleccionado] : []);
  }

  private loteDe(c: CategoriaModel): CategoriaModel[] {
    const sel = (this.gridApi?.getSelectedRows() ?? []) as CategoriaModel[];
    return sel.some(s => s.id === c.id) ? sel : [c];
  }

  /** Las del lote que NO podrán volver porque su madre sigue en la papelera. */
  get colgadas(): CategoriaModel[] {
    return this.lote.filter(c => (c as any).padre_en_papelera === true);
  }

  /** Si todo lo elegido está colgando de algo que sigue en la papelera. */
  get todasColgadas(): boolean {
    return this.lote.length > 0 && this.colgadas.length === this.lote.length;
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
    let elemento: CategoriaModel | null = null;
    if (fila) {
      const nodo = this.gridApi?.getDisplayedRowAtIndex(Number(fila.getAttribute('row-index')));
      elemento = (nodo?.data as CategoriaModel) ?? null;
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
        headerName: 'Categoría', field: 'nombre', width: 240, cellStyle: { textAlign: 'left' },
        checkboxSelection: true, headerCheckboxSelection: true,
        cellRenderer: (p: any) => {
          const icono = p.data?.icono && /^[a-z0-9 -]+$/i.test(p.data.icono) ? p.data.icono : 'fa-folder';
          // Un aviso donde se ve: la madre sigue en la papelera y ésta no
          // puede volver todavía.
          const colgada = p.data?.padre_en_papelera
            ? '<i class="fa fa-link-slash pc-colgada" title="Su categoría padre sigue en la papelera: restaure primero la de arriba"></i>'
            : '';
          return `<span class="pc-categoria"><i class="fa ${icono} pc-icono"></i>`
               + `<span class="pc-categoria__nombre">${this.escapeHtml(p.value ?? '')}</span>${colgada}</span>`;
        },
      },
      { headerName: 'Ruta', field: 'ruta', width: 280, cellStyle: { textAlign: 'left' },
        headerTooltip: 'Dónde volverá a colgar al restaurarla',
        valueGetter: p => p.data?.ruta || p.data?.nombre || '—' },
      { headerName: 'Nivel', field: 'nivel', width: 80, maxWidth: 90, cellStyle: { textAlign: 'center' } },
      { headerName: 'Subcategorías', field: 'num_hijos', width: 120, maxWidth: 130, cellStyle: { textAlign: 'center' },
        headerTooltip: 'Subcategorías vigentes; con alguna no se puede borrar definitivamente' },
      { headerName: 'Productos', field: 'num_productos', width: 100, maxWidth: 110, cellStyle: { textAlign: 'center' },
        headerTooltip: 'Productos vigentes que la usan' },
      { headerName: 'Eliminada', field: 'deleted_at', width: 160, maxWidth: 170, cellStyle: { textAlign: 'center' } },
      { headerName: 'Eliminada por', field: 'deleted_by', width: 130, maxWidth: 160,
        headerTooltip: 'Usuario que la envió a la papelera',
        valueGetter: p => p.data?.deleted_by || '—', cellStyle: { textAlign: 'left' } },
    ];
  }

  onGridReady(params: GridReadyEvent): void {
    this.gridApi = params.api;
    this.gridApi.setRowData(this.items);
  }

  navegarConTeclado = this._appAgGridService.navegacionConFlechas(fila => this.seleccionado = fila);

  onCellClicked(e: CellClickedEvent): void {
    this.seleccionado = e.data as CategoriaModel;
  }

  // ================================================================
  // DATOS
  // ================================================================

  async cargar(): Promise<void> {
    try {
      this._loadingService.setLoading(true);
      const res = await firstValueFrom(this._categoriaService.papelera()) as any;
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

  private nombres(lote: CategoriaModel[]): string {
    return lote.length === 1 ? `«${lote[0].nombre}»` : `${lote.length} categorías`;
  }

  /**
   * El registro sobre el que se puede auditar: exactamente uno.
   *
   * La auditoría es de UN registro, así que con varias casillas marcadas no
   * hay a cuál mirar y el botón se apaga.
   */
  get auditable(): CategoriaModel | null {
    return this.lote.length === 1 ? this.lote[0] : null;
  }

  /**
   * Historial de auditoría de una categoría que está en la papelera: quién la
   * eliminó, sin tener que restaurarla antes.
   */
  auditoria(categoria?: CategoriaModel): void {
    const quien = categoria ?? this.auditable;
    if (!quien || !this.puedeAuditar) { return; }

    const ref = this.modalService.open(AuditoriaModalComponent, {
      centered: true, size: 'xl', backdrop: 'static', keyboard: true
    });
    ref.componentInstance.tablaNombre = 'categorias';
    ref.componentInstance.registroId = quien.id;
  }

  async restaurar(categorias?: CategoriaModel[]): Promise<void> {
    const lote = categorias?.length ? categorias : this.lote;
    if (!lote.length) { return; }

    // Se avisa antes de llamar: el servidor lo rechazaría igual, pero así se
    // entiende por qué sin tener que leer un error.
    if (lote.every(c => (c as any).padre_en_papelera === true)) {
      this._toastr.info('Su categoría padre sigue en la papelera: restaure primero la de arriba', 'No se puede restaurar todavía');
      return;
    }

    try {
      this._loadingService.setLoading(true);
      const res = await firstValueFrom(this._categoriaService.restaurarCategorias(lote.map(c => c.id))) as any;
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
  async eliminarDefinitivo(categorias?: CategoriaModel[]): Promise<void> {
    // Sin el permiso «vaciar» no se eliminar definitivamente, ni aunque se
    // llame a mano desde el menú del botón derecho.
    if (!this.puedeVaciar) { return; }
    const lote = categorias?.length ? categorias : this.lote;
    if (!lote.length) { return; }

    const confirmado = await this.confirmar(
      `¿Eliminar definitivamente ${this.nombres(lote)}?`,
      'Se borrará de forma permanente. Si todavía le cuelga alguna subcategoría —aunque esté en la papelera— '
      + 'el sistema no lo permitirá: bórrela antes. Su historial de auditoría se conserva. Esta acción no se puede deshacer.'
    );
    if (!confirmado) { return; }

    try {
      this._loadingService.setLoading(true);
      const res = await firstValueFrom(this._categoriaService.eliminarDefinitivo(lote.map(c => c.id))) as any;
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
      `Se borrarán de forma permanente ${this.items.length} ${this.items.length === 1 ? 'categoría' : 'categorías'}, `
      + 'empezando por las más hondas. Esta acción no se puede deshacer.'
    );
    if (!confirmado) { return; }

    try {
      this._loadingService.setLoading(true);
      const res = await firstValueFrom(this._categoriaService.vaciarPapelera()) as any;
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
