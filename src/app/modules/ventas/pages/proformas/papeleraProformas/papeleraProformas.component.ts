import { Component, EventEmitter, Input, OnInit, Output, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { AgGridModule } from 'ag-grid-angular';
import { CellClickedEvent, ColDef, GridApi, GridReadyEvent } from 'ag-grid-community';
import { ToastrService } from 'ngx-toastr';
import Swal from 'sweetalert2';

import { ModalArrastrableDirective } from '../../../../../components/modal/modal-arrastrable.directive';
import { AuditoriaModalComponent } from '../../../../../components/auditoria-modal/auditoria-modal.component';
import { AppAgGridService } from '../../../../../service/app-agGrid.service';
import { LoadingService } from '../../../../../service/loading.service';
import { ProformaService } from '../../../services/proforma.service';
import { claseEstado, etiquetaEstado } from '../../../interfaces/proformaModel';
import { FilasEstirablesDirective } from '../../../../../core/directives/filasEstirables.directive';

/**
 * Papelera de reciclaje de proformas (modal), como la de clientes.
 *
 * «Eliminar» una proforma es un borrado lógico: sale del listado y de los
 * contadores, pero no se borra. Desde aquí vuelve con todas sus líneas, o se
 * borra de verdad.
 *
 * LAS LÍNEAS VAN CON EL DOCUMENTO, siempre: no hay papelera de líneas, ni al
 * restaurar ni al borrar. Media proforma no es nada.
 */
@Component({
  selector: 'app-papeleraProformas',
  standalone: true,
  imports: [CommonModule, AgGridModule, FilasEstirablesDirective, ModalArrastrableDirective],
  templateUrl: './papeleraProformas.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./papeleraProformas.component.css'],
})
export class PapeleraProformasComponent implements OnInit {

  /** Algo se restauró o se borró: el listado de detrás ya no es fiel. */
  @Output() cambio = new EventEmitter<void>();

  /**
   * Si el perfil puede ELIMINAR DEFINITIVAMENTE y vaciar la papelera.
   *
   * Es otro permiso distinto de «papelera»: con aquél se entra y se restaura
   * —que se puede deshacer— y con éste se borra de verdad, que no. Lo pasa la
   * pantalla que abre la papelera, y el servidor lo exige otra vez: esconder
   * el botón no es un permiso.
   */
  @Input() puedeVaciar = false;
  @Input() puedeAuditar = false;

  public readonly _appAgGridService = inject(AppAgGridService);

  public isLoading$ = this._loadingService.isLoading$;
  public items: any[] = [];
  public seleccionado: any | null = null;

  public gridApi!: GridApi;
  public columnDefs: ColDef[] = [];

  public readonly etiquetaEstado = etiquetaEstado;
  public readonly claseEstado = claseEstado;

  constructor(
    public modal: NgbActiveModal,
    /** Para abrir la auditoría ENCIMA de esta ventana, sin cerrarla. */
    private modalService: NgbModal,
    private _proformaService: ProformaService,
    private _toastr: ToastrService,
    private _loadingService: LoadingService,
  ) {}

  ngOnInit(): void {
    this.armarColumnas();
    this.cargar();
  }

  // ================================================================
  // SELECCIÓN
  // ================================================================

  /** Sobre qué actúan los botones: las filas marcadas, o la pulsada. */
  get lote(): any[] {
    const sel = this.gridApi?.getSelectedRows() ?? [];
    return sel.length ? sel : (this.seleccionado ? [this.seleccionado] : []);
  }

  /** La auditoría es de UN registro: con varias marcadas no hay a cuál mirar. */
  get auditable(): any | null {
    return this.lote.length === 1 ? this.lote[0] : null;
  }

  private nombres(lote: any[]): string {
    return lote.length === 1 ? `«${lote[0].numero}»` : `${lote.length} proformas`;
  }

  importe(v: any): string {
    const n = Number(v ?? 0);
    return isNaN(n) ? '' : n.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // ================================================================
  // GRILLA
  // ================================================================

  private armarColumnas(): void {
    this.columnDefs = [
      {
        headerName: 'Número', field: 'numero', width: 140, maxWidth: 160,
        cellStyle: { textAlign: 'left', fontWeight: '600' },
        checkboxSelection: true, headerCheckboxSelection: true,
      },
      { headerName: 'Fecha', field: 'fecha', width: 110, maxWidth: 120, cellStyle: { textAlign: 'center' } },
      { headerName: 'Cliente', field: 'cliente_nombre', width: 240, flex: 1, cellStyle: { textAlign: 'left' } },
      {
        headerName: 'Estado', field: 'estado', width: 110, maxWidth: 120,
        cellStyle: { textAlign: 'center' },
        cellRenderer: (p: any) => p.value
          ? `<span class="badge ${claseEstado(p.value)} fs-10px">${etiquetaEstado(p.value)}</span>`
          : '',
      },
      {
        headerName: 'Líneas', field: 'lineas', width: 90, maxWidth: 100,
        cellStyle: { textAlign: 'center' },
        headerTooltip: 'Se restauran y se borran con el documento',
      },
      {
        headerName: 'Total', field: 'total', type: 'numericColumn', width: 120, maxWidth: 140,
        valueFormatter: (p: any) => this.importe(p.value),
      },
      { headerName: 'Eliminada', field: 'deleted_at', width: 160, maxWidth: 170, cellStyle: { textAlign: 'center' } },
      {
        headerName: 'Eliminada por', field: 'deleted_by', width: 140, maxWidth: 170,
        headerTooltip: 'Usuario que la envió a la papelera',
        valueGetter: p => p.data?.deleted_by || '—', cellStyle: { textAlign: 'left' },
      },
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
      const res: any = await firstValueFrom(this._proformaService.papelera());
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

  /** Quién la eliminó, sin tener que restaurarla antes. */
  auditoria(): void {
    const quien = this.auditable;
    if (!quien || !this.puedeAuditar) { return; }

    const ref = this.modalService.open(AuditoriaModalComponent, {
      centered: true, size: 'xl', backdrop: 'static', keyboard: true,
    });
    ref.componentInstance.tablaNombre = 'proformas';
    ref.componentInstance.registroId = quien.id;
  }

  async restaurar(): Promise<void> {
    const lote = this.lote;
    if (!lote.length) { return; }

    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._proformaService.restaurarProformas(lote.map(p => p.id)));
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
  async eliminarDefinitivo(): Promise<void> {
    // Sin el permiso «vaciar» no se elimina definitivamente
    if (!this.puedeVaciar) { return; }
    const lote = this.lote;
    if (!lote.length) { return; }

    const confirmado = await this.confirmar(
      `¿Eliminar definitivamente ${this.nombres(lote)}?`,
      'Se borrarán de forma permanente, con todas sus líneas. Su historial de auditoría '
      + 'se conserva. Esta acción no se puede deshacer.'
    );
    if (!confirmado) { return; }

    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._proformaService.eliminarDefinitivo(lote.map(p => p.id)));
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
      `Se borrarán de forma permanente ${this.items.length} `
      + `${this.items.length === 1 ? 'proforma' : 'proformas'} con sus líneas. `
      + 'Esta acción no se puede deshacer.'
    );
    if (!confirmado) { return; }

    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._proformaService.vaciarPapelera());
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

  /** La misma confirmación destructiva que las otras papeleras. */
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
      reverseButtons: true,
    });
    return r.isConfirmed;
  }
}
