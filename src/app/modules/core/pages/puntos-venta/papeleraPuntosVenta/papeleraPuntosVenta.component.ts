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
import { PuntoVentaService } from '../../../services/puntoVenta.service';
import { FilasEstirablesDirective } from '../../../../../core/directives/filasEstirables.directive';

/**
 * Papelera de reciclaje de puntos de venta.
 *
 * Lo propio de aquí son LAS CUENTAS. Mientras la caja está en la papelera
 * sus cuentas configuradas se conservan, así que al restaurarla vuelve con
 * todo puesto; al borrarla definitivamente se van con ella, y eso se avisa
 * antes porque no hay manera de recuperarlo.
 *
 * Restaurar puede fallar por una razón concreta: mientras estaba en la
 * papelera, otra caja pudo quedarse con su número dentro de la sucursal. El
 * servidor lo dice con el nombre de la que estorba.
 */
@Component({
  selector: 'app-papeleraPuntosVenta',
  standalone: true,
  imports: [CommonModule, AgGridModule, FilasEstirablesDirective, ModalArrastrableDirective],
  templateUrl: './papeleraPuntosVenta.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./papeleraPuntosVenta.component.css'],
})
export class PapeleraPuntosVentaComponent implements OnInit {

  /** Algo se restauró o se borró: el listado de detrás ya no es fiel. */
  @Output() cambio = new EventEmitter<void>();

  /**
   * Si el perfil puede ELIMINAR DEFINITIVAMENTE y vaciar la papelera.
   *
   * Es otro permiso distinto de «papelera»: con aquél se entra y se restaura
   * —que se puede deshacer— y con éste se borra de verdad, que no. El
   * servidor lo exige otra vez: esconder el botón no es un permiso.
   */
  @Input() puedeVaciar = false;
  @Input() puedeAuditar = false;

  public readonly _appAgGridService = inject(AppAgGridService);

  public isLoading$ = this._loadingService.isLoading$;
  public items: any[] = [];
  public seleccionado: any | null = null;

  public gridApi!: GridApi;
  public columnDefs: ColDef[] = [];

  constructor(
    public modal: NgbActiveModal,
    /** Para abrir la auditoría ENCIMA de esta ventana, sin cerrarla. */
    private modalService: NgbModal,
    private _puntoVentaService: PuntoVentaService,
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

  /** Cuántas cuentas se perderían si se borra lo marcado. */
  get cuentasDelLote(): number {
    return this.lote.reduce((n, p) => n + Number(p.cuentas_propias ?? 0), 0);
  }

  private nombres(lote: any[]): string {
    return lote.length === 1 ? `«${lote[0].nombre}»` : `${lote.length} puntos de venta`;
  }

  // ================================================================
  // GRILLA
  // ================================================================

  private armarColumnas(): void {
    this.columnDefs = [
      {
        headerName: 'Código', field: 'codigo', width: 130, maxWidth: 160,
        cellStyle: { textAlign: 'left', fontWeight: '600' },
        checkboxSelection: true, headerCheckboxSelection: true,
      },
      { headerName: 'Punto de venta', field: 'nombre', width: 200, flex: 1, cellStyle: { textAlign: 'left' } },
      { headerName: 'Nº', field: 'numero', width: 70, maxWidth: 80, cellStyle: { textAlign: 'center' } },
      { headerName: 'Sucursal', field: 'sucursal_nombre', width: 180, cellStyle: { textAlign: 'left' } },
      {
        headerName: 'Cuentas', field: 'cuentas_propias', width: 110, maxWidth: 120,
        cellStyle: { textAlign: 'center' },
        headerTooltip: 'Cuentas puestas en esta caja: se conservan mientras esté en la papelera',
      },
      {
        headerName: 'Activo', field: 'activo', width: 90, maxWidth: 100,
        cellStyle: { display: 'flex', justifyContent: 'center', alignItems: 'center' },
        cellRenderer: (p: any) => p.value
          ? '<span class="badge bg-teal fs-10px">SÍ</span>'
          : '<span class="badge bg-danger fs-10px">NO</span>',
      },
      { headerName: 'Eliminado', field: 'deleted_at', width: 160, maxWidth: 170, cellStyle: { textAlign: 'center' } },
      {
        headerName: 'Eliminado por', field: 'deleted_by', width: 140, maxWidth: 170,
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
      const res: any = await firstValueFrom(this._puntoVentaService.papelera());
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

  auditoria(): void {
    const quien = this.auditable;
    if (!quien || !this.puedeAuditar) { return; }

    const ref = this.modalService.open(AuditoriaModalComponent, {
      centered: true, size: 'xl', backdrop: 'static', keyboard: true,
    });
    ref.componentInstance.tablaNombre = 'puntos_venta';
    ref.componentInstance.registroId = quien.id;
  }

  async restaurar(): Promise<void> {
    const lote = this.lote;
    if (!lote.length) { return; }

    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._puntoVentaService.restaurarPuntosVenta(lote.map(p => p.id)));
      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo restaurar', 'Error');
        return;
      }
      this._toastr.success(res.message, 'Restaurado', { closeButton: true });
      this.cambio.emit();
      await this.cargar();
    } catch (error) {
      // El AuthInterceptor ya enseñó el 409 con su motivo (el número ocupado)
      console.error('Error al restaurar:', error);
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  /** Borrado real: pide confirmación porque no hay vuelta atrás. */
  async eliminarDefinitivo(): Promise<void> {
    if (!this.puedeVaciar) { return; }
    const lote = this.lote;
    if (!lote.length) { return; }

    const cuentas = this.cuentasDelLote;
    const confirmado = await this.confirmar(
      `¿Eliminar definitivamente ${this.nombres(lote)}?`,
      'Se borrarán de forma permanente'
      + (cuentas > 0
          ? `, y con ${lote.length === 1 ? 'ella' : 'ellos'} ${cuentas} `
            + (cuentas === 1 ? 'cuenta configurada' : 'cuentas configuradas') + '. '
          : '. ')
      + 'Su historial de auditoría se conserva. Esta acción no se puede deshacer.'
    );
    if (!confirmado) { return; }

    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._puntoVentaService.eliminarDefinitivo(lote.map(p => p.id)));
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

    const cuentas = this.items.reduce((n, p) => n + Number(p.cuentas_propias ?? 0), 0);
    const confirmado = await this.confirmar(
      '¿Vaciar la papelera?',
      `Se borrarán de forma permanente ${this.items.length} `
      + `${this.items.length === 1 ? 'punto de venta' : 'puntos de venta'}`
      + (cuentas > 0 ? ` y ${cuentas} ${cuentas === 1 ? 'cuenta configurada' : 'cuentas configuradas'}` : '')
      + '. Esta acción no se puede deshacer.'
    );
    if (!confirmado) { return; }

    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._puntoVentaService.vaciarPapelera());
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
