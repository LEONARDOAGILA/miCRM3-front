import { Component, EventEmitter, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { AgGridModule } from 'ag-grid-angular';
import { CellClickedEvent, GridApi, GridReadyEvent, RowClassParams } from 'ag-grid-community';
import { ToastrService } from 'ngx-toastr';
import { Subject, firstValueFrom, from, merge, of } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';
import Swal from 'sweetalert2';

///   SERVICIOS    ///
import { SeguridadService } from '../../../../seguridad/services/seguridad.service';
import { WhatsappPlantillaService } from '../../../services/whatsappPlantilla.service';
import { AppAgGridService } from '../../../../../service/app-agGrid.service';
import { LoadingService } from '../../../../../service/loading.service';

///   MODELOS    ///
import { AccesoModel } from '../../../../seguridad/interfaces/accesoModel';
import { WhatsappPlantillaModel } from '../../../interfaces/whatsappPlantillaModel';

///   COMPONENTES    ///
import { PanelModule } from '../../../../../components/panel/panel.module';
import { CampoBusquedaPaginacionComponent } from '../../../../../components/campos/campoBusquedaPaginacion/campoBusquedaPaginacion.component';
import { SavePlantillaWhatsappComponent } from '../savePlantillaWhatsapp/savePlantillaWhatsapp.component';

/**
 * Plantillas de WhatsApp (ventas.whatsapp_plantillas).
 *
 * Mismo esquema que allCargos: miga de pan, <panel> del tema, barra con
 * buscador y «nuevo», grilla con la columna ACCIONES y modales para el resto.
 *
 * Sin paginación en servidor, al revés que clientes o gestiones: son los
 * mensajes que alguien mantiene a mano y caben de sobra en una pantalla. El
 * buscador filtra lo que ya está, que aquí sí es lo correcto porque están
 * todas; paginar seis filas sería trabajo para nada.
 */
@Component({
  selector: 'app-allPlantillasWhatsapp',
  templateUrl: './allPlantillasWhatsapp.component.html',
  styleUrls: ['./allPlantillasWhatsapp.component.css'],
  standalone: true,
  imports: [CommonModule, AgGridModule, PanelModule, CampoBusquedaPaginacionComponent],
})
export class AllPlantillasWhatsappComponent implements OnInit, OnDestroy {

  public accesoModel: AccesoModel;
  public titulo = 'Respuestas de WhatsApp';
  public isLoading$ = this._loadingService.isLoading$;

  /** Todas, activas e inactivas: esta pantalla es la que las mantiene. */
  public plantillas: WhatsappPlantillaModel[] = [];
  public selectedRow: WhatsappPlantillaModel | null = null;

  public columnDefs: any[] = [];
  public gridApi!: GridApi;

  public rowClassRules = {
    'fila-inactiva': (p: RowClassParams) => p.data?.activo === false,
  };

  private readonly unsubscribe$ = new Subject<void>();

  constructor(
    private modal: NgbModal,
    private route: Router,
    private activeRoute: ActivatedRoute,
    public _appAgGridService: AppAgGridService,
    private _loadingService: LoadingService,
    private _toastr: ToastrService,
    private _seguridadService: SeguridadService,
    private _plantillaService: WhatsappPlantillaService,
  ) {
    this.accesoModel = this.activeRoute.snapshot.data['access'];
  }

  ngOnInit(): void {
    this.initializeGrid();
    this.allPlantillas();
  }

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
    this.modal.dismissAll();
  }

  /** Suscribe al @Output de un modal y corta al cerrarse o al destruir la pantalla. */
  public escucharModal<T>(modalRef: NgbModalRef, salida: EventEmitter<T>, alEmitir: (valor: T) => void): void {
    const modalCerrado$ = from(modalRef.result).pipe(catchError(() => of(null)));
    salida
      .pipe(takeUntil(merge(this.unsubscribe$, modalCerrado$)))
      .subscribe({ next: alEmitir, error: (err) => console.error('Error en el modal:', err) });
  }

  fun_home(): void {
    this.route.navigate(['/ventas']);
  }

  // ================================================================
  // LA GRILLA
  // ================================================================

  private initializeGrid(): void {
    this.columnDefs = [
      {
        headerName: 'Orden', field: 'orden', minWidth: 80, maxWidth: 90,
        cellStyle: { display: 'flex', justifyContent: 'center', alignItems: 'center' },
      },
      {
        headerName: 'Nombre', field: 'nombre', minWidth: 170, maxWidth: 260,
        cellStyle: { textAlign: 'left', fontWeight: '600' },
        cellRenderer: (p: any) =>
          `<i class="fa ${p.data?.icono || 'fa-comment'} fa-fw me-1 text-success"></i>${p.value ?? ''}`,
      },
      { headerName: 'Asunto', field: 'asunto', minWidth: 180, cellStyle: { textAlign: 'left' } },
      {
        headerName: 'Mensaje', field: 'texto', minWidth: 260, cellStyle: { textAlign: 'left' },
        tooltipField: 'texto',
      },
      {
        headerName: 'Activa', field: 'activo', minWidth: 90, maxWidth: 90,
        cellStyle: { display: 'flex', justifyContent: 'center', alignItems: 'center' },
        cellRenderer: (p: any) => p.value === false
          ? '<span class="badge bg-secondary bg-opacity-25 text-body fs-10px">No</span>'
          : '<span class="badge bg-teal fs-10px">Sí</span>',
      },
      {
        headerName: 'ACCIONES', field: 'acciones', pinned: 'right',
        minWidth: 130, maxWidth: 130,
        sortable: false, filter: false, suppressMenu: true, resizable: false, suppressMovable: true,
        cellStyle: { display: 'flex', justifyContent: 'center', alignItems: 'center' },
        cellRenderer: () => {
          const puedeVer    = this.accesoModel?.ver !== false;
          const puedeEditar = this.accesoModel?.editar !== false;
          const puedeBorrar = this.accesoModel?.eliminar !== false;
          return `<div class="plantillas-acciones">`
            + this.boton('ver', 'btn-ver', 'fa fa-eye', 'Ver', puedeVer)
            + this.boton('editar', 'btn-editar', 'fa fa-pen', 'Modificar', puedeEditar)
            + this.boton('clonar', 'btn-clonar', 'fa fa-copy', 'Clonar', this.accesoModel?.crear !== false)
            + this.boton('eliminar', 'btn-quitar', 'fa fa-trash', 'Eliminar', puedeBorrar)
            + `</div>`;
        },
      },
    ];
  }

  private boton(accion: string, clase: string, icono: string, titulo: string, permitido: boolean): string {
    const t = permitido ? titulo : `${titulo} - Desactivado`;
    return `<button type="button" class="btn-icon ${clase}" data-accion="${accion}" title="${t}"${permitido ? '' : ' disabled'}>`
         + `<i class="${icono}"></i></button>`;
  }

  onGridReady(e: GridReadyEvent): void {
    this.gridApi = e.api;
    this._appAgGridService.ajustarTamanoGrid(this.gridApi);
    this.gridApi.setRowData(this.plantillas);
  }

  onCellClicked(e: CellClickedEvent): void {
    this.selectedRow = e.data ?? null;

    const destino = (e.event?.target as HTMLElement)?.closest('[data-accion]') as HTMLElement | null;
    switch (destino?.dataset['accion']) {
      case 'ver':      this.abrirModal('view', e.data); break;
      case 'editar':   this.abrirModal('edit', e.data); break;
      case 'clonar':   this.abrirModal('clon', e.data); break;
      case 'eliminar': this.eliminar(e.data); break;
    }
  }

  onFilterTextBoxChanged(termino?: string): void {
    this.gridApi?.setQuickFilter((termino ?? '').trim());
  }

  clearAllFilters(): void {
    this.gridApi?.setFilterModel(null);
    this.gridApi?.setQuickFilter('');
  }

  // ================================================================
  // DATOS
  // ================================================================

  async allPlantillas(): Promise<void> {
    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._plantillaService.allPlantillas());
      this.plantillas = res?.status === 'success' ? (res.data ?? []) : [];
      this.gridApi?.setRowData(this.plantillas);
    } catch (error) {
      // El AuthInterceptor ya sacó el toast del error HTTP
      console.error('Error al cargar las plantillas:', error);
      this.plantillas = [];
      this.gridApi?.setRowData(this.plantillas);
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  // ================================================================
  // ALTA / EDICIÓN / CLON / VISTA
  // ================================================================

  private permiso(concedido: boolean | undefined, queHacer: string): boolean {
    if (concedido === false) {
      this._toastr.warning(`No tiene permiso para ${queHacer}`, 'Permisos');
      return false;
    }
    return true;
  }

  abrirModal(accion: 'add' | 'edit' | 'clon' | 'view', registro: any = {}): void {
    const necesita = accion === 'edit' ? this.accesoModel?.editar
                   : accion === 'view' ? this.accesoModel?.ver
                   : this.accesoModel?.crear;
    const queHacer = accion === 'edit' ? 'modificar plantillas'
                   : accion === 'view' ? 'ver plantillas'
                   : 'crear plantillas';
    if (!this.permiso(necesita, queHacer)) { return; }
    if (this._seguridadService.isexpired()) { return; }

    const modalRef = this.modal.open(SavePlantillaWhatsappComponent, {
      centered: true, size: 'lg', backdrop: 'static', keyboard: true,
    });
    modalRef.componentInstance.accion = accion;
    modalRef.componentInstance.registro_selected = registro ?? {};
    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, () => this.allPlantillas());
  }

  /**
   * Borra de verdad, no desactiva.
   *
   * Una plantilla no es parte del historial: lo que quedó escrito en la
   * gestión es el texto que se envió, copiado en su momento. Quien la quiera
   * conservar sin ofrecerla tiene el interruptor de «activa».
   */
  async eliminar(registro: WhatsappPlantillaModel): Promise<void> {
    if (!registro?.id) { return; }
    if (!this.permiso(this.accesoModel?.eliminar, 'eliminar plantillas')) { return; }
    if (this._seguridadService.isexpired()) { return; }

    const r = await Swal.fire({
      title: '¿Eliminar la plantilla?',
      html: `Se va a eliminar <b>${registro.nombre}</b>.<br>`
          + `Las gestiones ya registradas no cambian: guardan el texto que se envió.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc3545',
    });
    if (!r.isConfirmed) { return; }

    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._plantillaService.deletePlantilla(registro.id));
      if (res?.status === 'success') {
        this._toastr.success(res.message, 'Éxito', { closeButton: true });
        if (this.selectedRow?.id === registro.id) { this.selectedRow = null; }
        await this.allPlantillas();
      }
    } catch (error) {
      console.error('Error al eliminar la plantilla:', error);
    } finally {
      this._loadingService.setLoading(false);
    }
  }
}
