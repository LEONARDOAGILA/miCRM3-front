import { Component, ElementRef, EventEmitter, HostListener, Input, NgZone, OnDestroy, OnInit, Output, ViewChild, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { AgGridModule } from 'ag-grid-angular';
import { CellClickedEvent, ColDef, GridApi, GridReadyEvent } from 'ag-grid-community';
import { ToastrService } from 'ngx-toastr';
import Swal from 'sweetalert2';

import { EmpleadoService } from '../../../services/empleado.service';
import { EmpleadoModel } from '../../../interfaces/empleadoModel';
import { AppAgGridService } from '../../../../../service/app-agGrid.service';
import { LoadingService } from '../../../../../service/loading.service';
import { ModalHeaderComponent } from '../../../../../components/modal/modal-header/modal-header.component';
import { AuditoriaModalComponent } from '../../../../../components/auditoria-modal/auditoria-modal.component';
import { FilasEstirablesDirective } from '../../../../../core/directives/filasEstirables.directive';

/**
 * Papelera de reciclaje de empleados (modal), la misma de clientes y marcas.
 *
 * «Eliminar» un empleado es un borrado lógico (deleted_at / deleted_by): sale
 * del listado y de los selectores —ya no se puede elegir como jefe, ni marcar
 * asistencia— pero su ficha, su historial y sus marcaciones siguen ahí. Desde
 * aquí se restaura tal como estaba o se borra de verdad.
 *
 * BORRAR DE VERDAD NO SIEMPRE SE PUEDE: con historial de cargos, ausencias o
 * marcaciones el servidor lo impide, porque esos registros quedarían
 * apuntando a nadie. Vaciar la papelera se lleva sólo a los que sí pueden
 * irse y dice cuántos fueron.
 *
 * Emite `cambio` cada vez que algo sale de la papelera, para que la pantalla
 * que la abrió recargue. Sin suscripciones vivas: firstValueFrom.
 */
@Component({
  selector: 'app-papeleraEmpleados',
  standalone: true,
  imports: [CommonModule, AgGridModule, FilasEstirablesDirective, ModalHeaderComponent],
  templateUrl: './papeleraEmpleados.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./papeleraEmpleados.component.css'],
})
export class PapeleraEmpleadosComponent implements OnInit, OnDestroy {

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
  public items: any[] = [];
  public seleccionado: any = null;

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
    private _empleadoService: EmpleadoService,
    private _toastr: ToastrService,
    private _loadingService: LoadingService,
    public _appAgGridService: AppAgGridService,
    private ngZone: NgZone,
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
  get lote(): any[] {
    const sel = (this.gridApi?.getSelectedRows() ?? []) as any[];
    return sel.length ? sel : (this.seleccionado ? [this.seleccionado] : []);
  }

  private loteDe(e: any): any[] {
    const sel = (this.gridApi?.getSelectedRows() ?? []) as any[];
    return sel.some(s => s.id === e.id) ? sel : [e];
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
        headerName: 'Empleado', field: 'nombre_completo', width: 240, cellStyle: { textAlign: 'left' },
        checkboxSelection: true, headerCheckboxSelection: true,
        cellRenderer: (p: any) => {
          // La foto si la tiene; si no, una caja con el icono. `getImagen` no
          // mira deleted_at, así que la de alguien en la papelera se sigue
          // sirviendo y se ve a quién corresponde la fila.
          const img = p.data?.foto
            ? `<img src="${this._empleadoService.getEmpleadoImage(p.data.id, false)}" class="pm-avatar" alt="" onerror="this.style.display='none'">`
            : `<span class="pm-avatar pm-avatar--vacio"><i class="fa fa-user"></i></span>`;
          return `<span class="pm-empleado">${img}<span class="pm-empleado__nombre">${this.escapeHtml(p.value ?? '')}</span></span>`;
        },
      },
      { headerName: 'Identificación', field: 'numero_identificacion', width: 130, maxWidth: 150,
        cellStyle: { textAlign: 'left' } },
      { headerName: 'Cargo', field: 'cargo_nombre', width: 160, maxWidth: 220, cellStyle: { textAlign: 'left' },
        valueGetter: p => p.data?.cargo_nombre || '—' },
      { headerName: 'Departamento', field: 'departamento_nombre', width: 160, maxWidth: 220,
        cellStyle: { textAlign: 'left' }, valueGetter: p => p.data?.departamento_nombre || '—' },
      { headerName: 'Sucursal', field: 'sucursal_nombre', width: 150, maxWidth: 200,
        cellStyle: { textAlign: 'left' }, valueGetter: p => p.data?.sucursal_nombre || '—' },
      { headerName: 'Eliminado', field: 'deleted_at', width: 160, maxWidth: 170, cellStyle: { textAlign: 'center' } },
      { headerName: 'Eliminado por', field: 'deleted_by', width: 130, maxWidth: 160,
        headerTooltip: 'Usuario que lo envió a la papelera',
        valueGetter: p => p.data?.deleted_by || '—', cellStyle: { textAlign: 'left' } },
    ];
  }

  onGridReady(params: GridReadyEvent): void {
    this.gridApi = params.api;
    this.gridApi.setGridOption('rowData', this.items);
  }

  navegarConTeclado = this._appAgGridService.navegacionConFlechas(fila => this.seleccionado = fila);

  onCellClicked(e: CellClickedEvent): void {
    this.seleccionado = e.data;
  }

  // ================================================================
  // DATOS
  // ================================================================

  async cargar(): Promise<void> {
    try {
      this._loadingService.setLoading(true);
      const res = await firstValueFrom(this._empleadoService.papelera()) as any;
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

  private nombres(lote: any[]): string {
    return lote.length === 1 ? `«${lote[0].nombre_completo}»` : `${lote.length} empleados`;
  }

  async restaurar(empleados?: any[]): Promise<void> {
    const lote = empleados?.length ? empleados : this.lote;
    if (!lote.length) { return; }
    try {
      this._loadingService.setLoading(true);
      const res = await firstValueFrom(this._empleadoService.restaurarEmpleados(lote.map(e => e.id))) as any;
      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo restaurar', 'Error');
        return;
      }
      this._toastr.success(res.message, 'Restaurado', { closeButton: true });
      this.cambio.emit();
      await this.cargar();
    } catch (error) {
      // El AuthInterceptor ya muestra el toast (409 si alguien tomó su cédula)
      console.error('Error al restaurar:', error);
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  /** Borrado real: pide confirmación porque no hay vuelta atrás. */
  async eliminarDefinitivo(empleados?: any[]): Promise<void> {
    // Sin el permiso «vaciar» no se elimina definitivamente, ni aunque se
    // llame a mano desde el menú del botón derecho.
    if (!this.puedeVaciar) { return; }
    const lote = empleados?.length ? empleados : this.lote;
    if (!lote.length) { return; }

    const confirmado = await this.confirmar(
      `¿Eliminar definitivamente ${this.nombres(lote)}?`,
      'Se borrará de forma permanente, con su foto. Si tiene historial de cargos, ausencias o marcaciones, '
      + 'el servidor lo impedirá. Esta acción no se puede deshacer.'
    );
    if (!confirmado) { return; }

    try {
      this._loadingService.setLoading(true);
      const res = await firstValueFrom(this._empleadoService.eliminarDefinitivo(lote.map(e => e.id))) as any;
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
      `Se borrarán de forma permanente los que se puedan de estos ${this.items.length} empleados. `
      + 'Los que tengan historial, ausencias o marcaciones se quedan. Esta acción no se puede deshacer.'
    );
    if (!confirmado) { return; }

    try {
      this._loadingService.setLoading(true);
      const res = await firstValueFrom(this._empleadoService.vaciarPapelera()) as any;
      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo vaciar la papelera', 'Error');
        return;
      }
      this._toastr.success(res.message, 'Papelera', { closeButton: true });
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
  get auditable(): any {
    return this.lote.length === 1 ? this.lote[0] : null;
  }

  /**
   * Historial de auditoría de alguien que está en la papelera.
   *
   * Está aquí porque el botón del listado sólo alcanza a las filas del
   * listado, y lo eliminado no está en ninguna: para ver quién lo borró
   * había que restaurarlo antes.
   */
  auditoria(registro?: any): void {
    const quien = registro ?? this.auditable;
    if (!quien || !this.puedeAuditar) { return; }

    const ref = this.modalService.open(AuditoriaModalComponent, {
      centered: true, size: 'xl', backdrop: 'static', keyboard: true
    });
    ref.componentInstance.tablaNombre = 'empleados';
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
