import { Component, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { GridApi, GridReadyEvent, CellClickedEvent } from 'ag-grid-community';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ActivatedRoute, Router } from '@angular/router';
import { AgGridAngular } from 'ag-grid-angular';

//   ******   SERVICIOS   ******  //
import { AppPrintPdfService } from '../../../../../service/app-printPdf.service';
import { AppExportExcelService } from '../../../../../service/app-exportExcel.service';
import { AppExportCsvService } from '../../../../../service/app-exportCsv.service';
import { AppAgGridService } from '../../../../../service/app-agGrid.service';
import { LoadingService } from '../../../../../service/loading.service';
import { SeguridadService } from '../../../../seguridad/services/seguridad.service';
import { HorarioService } from '../../../services/horario.service';

//   ******   MODELOS   ******  //
import { AccesoModel } from '../../../interfaces/accesoModel';
import { ChorarioModel } from '../../../interfaces/chorarioModel';

//   ******   COMPONENTES   ******  //
import { SaveHorarioComponent } from '../save-horario/save-horario.component';
import { DeleteHorarioComponent } from '../delete-horario/delete-horario.component';
import { AuditoriaModalComponent } from '../../../../../components/auditoria-modal/auditoria-modal.component';
import { CampoBusquedaPaginacionComponent } from '../../../../../components/campos/campoBusquedaPaginacion/campoBusquedaPaginacion.component';

@Component({
  selector: 'app-allHorarios',
  templateUrl: './allHorarios.component.html',
  styleUrls: ['./allHorarios.component.css'],
  standalone: false,
})
export class AllHorariosComponent implements OnInit, OnDestroy {
  
  // ****** AG-GRID ****** //
  @ViewChild(AgGridAngular) agGrid!: AgGridAngular;
  public gridApi!: GridApi;
  public columnDefs: any[] = [];
  private touchStartTime = 0;
  private touchStartX = 0;
  private touchStartY = 0;
  
  @HostListener('window:resize', ['$event'])
  onResize(event: Event): void { this._appAgGridService.ajustarTamanoGrid(this.gridApi); }
  private resizeTimeoutId: any;

  // ****** PLANTILLA ****** //
  public isLoading$ = this._loadingService.isLoading$;
  public titulo: string;

  // ****** MODELOS ****** //
  public accesoModel: AccesoModel;
  public chorarioModel: ChorarioModel[] = [];
  public selectedRow: ChorarioModel | null = null;

  // ****** PAGINACIÓN Y BÚSQUEDA ****** //
  public paginaActual: number = 1;
  public totalRegistros: number = 0;
  public registrosPorPagina: number = 3;
  public ultimaPagina: number = 1;
  public searchTerm: string = '';

  @ViewChild(CampoBusquedaPaginacionComponent) campoBusquedaPaginacion!: CampoBusquedaPaginacionComponent;

  constructor(
    private modal: NgbModal,
    private activeRoute: ActivatedRoute,
    private route: Router,
    private _appExportExcelService: AppExportExcelService,
    private _appExportCsvService: AppExportCsvService,
    private _appPrintPdfService: AppPrintPdfService,
    public _appAgGridService: AppAgGridService,
    private _loadingService: LoadingService,
    private _seguridadService: SeguridadService,
    private _horarioService: HorarioService,
  ) {
    this.titulo = "Horarios";
    this.accesoModel = this.activeRoute.snapshot.data.access;
  }

  // ****** INIT - DESTROY ****** //
  ngOnInit(): void {
    this.allHorarios();
    this.initializeGrid();
  }

  ngOnDestroy(): void {
    if (this.resizeTimeoutId) { 
      clearTimeout(this.resizeTimeoutId); 
    }
  }

  // ****** HOME DE MODULO ****** //
  fun_home() {
    this.route.navigate(['/config/home']);
  }

  // ****** LISTADO DE DATOS PAGINADO ****** //
  async allHorarios(page: number = 1) {
    try {
      this._loadingService.setLoading(true);
      
      const res = await firstValueFrom(
        this._horarioService.allHorarios(page, this.registrosPorPagina, this.searchTerm)
      ) as any;
      
      this.chorarioModel = res.body?.data?.data || [];
      
      if (res.body?.data?.meta) {
        this.totalRegistros = res.body.data.meta.total;
        this.registrosPorPagina = res.body.data.meta.per_page;
        this.paginaActual = res.body.data.meta.current_page;
        this.ultimaPagina = res.body.data.meta.last_page;
      }
      
      if (this.gridApi) this.gridApi.setRowData(this.chorarioModel);
      this._loadingService.setLoading(false);
      
    } catch (error: any) {
      this._loadingService.setLoading(false);
      console.error('Error en allHorarios:', error);
    }
  }

  // ****** FUNCIONES DE BÚSQUEDA ****** //
  async onFilterTextBoxChanged(term?: string) {
    if (term !== undefined) this.searchTerm = term;
    this.paginaActual = 1;
    await this.allHorarios(1);
  }
  

  clearAllFilters() {
    this.campoBusquedaPaginacion.reset();
    if (this.gridApi) {
      this.gridApi.setFilterModel(null);
      const quickFilterInput = document.getElementById('filter-text-box') as HTMLInputElement;
      if (quickFilterInput) {
        quickFilterInput.value = '';
      }
      this.searchTerm = '';
      this.gridApi.onFilterChanged();
      this.allHorarios(this.paginaActual).then(() => {
        if (this.paginaActual > this.ultimaPagina && this.ultimaPagina > 0) {
          this.goToPage(this.ultimaPagina);
        }
      });
    }
  }

  // ****** FUNCIONES DE PAGINACIÓN ****** //
  firstPage(): void {
    if (this.paginaActual !== 1) {
      this.goToPage(1);
    }
  }

  ultimaPagina2(): void {
    if (this.paginaActual !== this.ultimaPagina) {
      this.goToPage(this.ultimaPagina);
    }
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.ultimaPagina) return;
    this.paginaActual = page;
    this.allHorarios(this.paginaActual);
  }

  nextPage(): void {
    this.goToPage(this.paginaActual + 1);
  }

  prevPage(): void {
    this.goToPage(this.paginaActual - 1);
  }

  // ****** FUNCIONES DE AG-GRID ****** //
  initializeGrid(): void {
    this.columnDefs = [
      {
        headerName: 'Id',
        field: 'id',
        cellStyle: { textAlign: 'center' },
        minWidth: 70,
        maxWidth: 70,
      },
      {
        headerName: 'Nombre',
        field: 'nombre',
        cellStyle: { textAlign: 'left' },
        minWidth: 150,
        maxWidth: 1500,
      },
      {
        headerName: 'Activo',
        field: 'activo',
        cellStyle: { textAlign: 'center' },
        minWidth: 95,
        maxWidth: 95,
        cellRenderer: (params: any) =>
          `
          <div class="form-check mb-2 d-flex align-items-center justify-content-center" style="height: 100%;">
            <input disabled class="form-check-input" type="checkbox" ${params.value === true ? 'checked' : ''} />
            <label class="form-check-label"></label>
          </div>
          `,
      },
      {
        headerName: 'Creado',
        field: 'created_at',
        cellStyle: { textAlign: 'center' },
        minWidth: 180,
        maxWidth: 180,
      },
      {
        headerName: 'Actualizado',
        field: 'updated_at',
        cellStyle: { textAlign: 'center' },
        minWidth: 180,
        maxWidth: 180,
      },
      {
        headerName: 'ACCIONES',
        field: 'actions',
        cellStyle: { display: 'flex', justifyContent: 'center', alignItems: 'center' },
        cellRenderer: ButtonAccionHorario,
        pinned: 'right',
        minWidth: 110,
        maxWidth: 110,
        suppressMenu: true,
        sortable: false,
        resizable: false,
        headerComponentParams: {
          template: `
            <div style="display: flex; align-items: center; justify-content: center; gap: 5px;">
              <span>ACCIONES</span>
              <i class="fas fa-arrow-right"></i>
            </div>
          `
        }
      },
    ];
  }

  onGridReady(params: GridReadyEvent): void {
    this.gridApi = params.api;
    
    setTimeout(() => {
      const headerElement = document.querySelector('.ag-header-cell[col-id="actions"]');
      if (headerElement) {
        headerElement.addEventListener('click', this.handleHeaderAction.bind(this));
        headerElement.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: true });
        headerElement.addEventListener('touchend', this.handleTouchEnd.bind(this));
      }
    }, 500);
    
    this._appAgGridService.ajustarTamanoGrid(this.gridApi);
    this.ajustarAlturaGrid();
  }

  handleTouchStart(e: TouchEvent) {
    this.touchStartTime = Date.now();
    this.touchStartX = e.touches[0].clientX;
    this.touchStartY = e.touches[0].clientY;
  }

  handleTouchEnd(e: TouchEvent) {
    const touchDuration = Date.now() - this.touchStartTime;
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const distX = Math.abs(touchEndX - this.touchStartX);
    const distY = Math.abs(touchEndY - this.touchStartY);
    
    if (touchDuration < 300 && distX < 10 && distY < 10) {
      this.toggleActionsColumn();
      e.preventDefault();
    }
  }

  handleHeaderAction() {
    this.toggleActionsColumn();
  }

  toggleActionsColumn() {
    const columnDefs = this.gridApi.getColumnDefs() as any[];
    const actionsCol = columnDefs.find(col => col.field === 'actions');
    
    if (actionsCol) {
      const isCollapsed = actionsCol.minWidth === 50;
      
      actionsCol.minWidth = isCollapsed ? 110 : 50;
      actionsCol.maxWidth = isCollapsed ? 110 : 50;
      actionsCol.cellStyle = isCollapsed ?
        { display: 'flex', justifyContent: 'center', alignItems: 'center' } :
        { display: 'none', justifyContent: 'left', alignItems: 'left' };
      
      actionsCol.headerComponentParams = {
        template: isCollapsed ?
          `<div style="display: flex; align-items: center; justify-content: center; gap: 5px;">
            <span>ACCIONES</span>
            <i class="fas fa-arrow-right"></i>
          </div>` :
          `<div style="display: flex; align-items: center; justify-content: center;">
            <i class="fas fa-bars"></i>
          </div>`
      };
      
      if (window.innerWidth <= 768) {
        actionsCol.minWidth = isCollapsed ? 110 : 50;
        actionsCol.maxWidth = isCollapsed ? 110 : 50;
      }
      
      this.gridApi.setColumnDefs(columnDefs);
      this.gridApi.sizeColumnsToFit();
      
      setTimeout(() => {
        this.gridApi.sizeColumnsToFit();
      }, 100);
    }
  }


  
  ajustarTamanoGrid() {
    if (this.gridApi) {
      if (this.resizeTimeoutId) { clearTimeout(this.resizeTimeoutId); }
      this.resizeTimeoutId = setTimeout(() => {
        this._appAgGridService.ajustarTamanoGrid(this.gridApi);
        this.ajustarAlturaGrid();
      }, 100);
    }
  }

    ajustarAlturaGrid() {
      // Obtener el contenedor del grid
      const gridElement = document.querySelector('.ag-theme-alpine') as HTMLElement;
      
      if (gridElement) {
        // Calcular altura disponible (puedes ajustar esta lógica según tus necesidades)
        const windowHeight = window.innerHeight;
        const gridPosition = gridElement.getBoundingClientRect().top;
        const marginBottom = 60; // Margen inferior
        
        // Establecer nueva altura
        const newHeight = windowHeight - gridPosition - marginBottom;
        gridElement.style.height = `${newHeight}px`;
        
        // Notificar al grid del cambio de tamaño
        this.gridApi.sizeColumnsToFit();
      }
    }

  clearSelection(): void {
    this._appAgGridService.limpiarSeleccion(this.gridApi);
  }

  onCellClicked(e: CellClickedEvent): void {
    this.selectedRow = e.data;
  }

  // ****** ACCIONES ****** //
  // addHorario() {
  //   if (!this._seguridadService.isexpired()) {
  //     const modalRef = this.modal.open(SaveHorarioComponent, {
  //       centered: true,
  //       size: "lg",
  //       backdrop: "static",
  //       keyboard: false
  //     });
  //     modalRef.componentInstance.registro_selected = 0;
  //     modalRef.componentInstance.accion = 'add';
      
  //     (async () => {
  //       try {
  //         const nuevoHorario = await firstValueFrom(modalRef.componentInstance.registrosE) as any;
  //         this.chorarioModel.unshift(nuevoHorario);
  //         this.gridApi.setRowData(this.chorarioModel);
  //       } catch (error) {
  //         console.error('Error o cancelación en creación:', error);
  //       }
  //     })();
  //   }
  // }

addHorario() {
  if (!this._seguridadService.isexpired()) {
    const modalRef = this.modal.open(SaveHorarioComponent, {
      centered: true,
      size: "lg",
      backdrop: "static",
      keyboard: false
    });
    modalRef.componentInstance.registro_selected = 0;
    modalRef.componentInstance.accion = 'add';
    
    (async () => {
      try {
        // Recibir la respuesta directamente (response es el objeto emitido por el modal)
        const nuevoHorario = await firstValueFrom(modalRef.componentInstance.registrosE) as any;
        
        // Agregar al principio del array y actualizar grid
        this.chorarioModel.unshift(nuevoHorario);
        this.gridApi.setRowData(this.chorarioModel);
      } catch (error) {
        console.error('Error o cancelación en creación:', error);
      }
    })();
  }
}


  // ****** IMPRESIÓN ****** //
  async printPdf() {
    this._appPrintPdfService.generarReporte({
      tamanoPapel: "A4",
      orientacion: "p",
      title: "Reporte de Horarios",
      titleTable: "Listado de Horarios",
      headers: ['ID', 'Nombre', 'Estado', 'Creado', 'Modificado'],
      data: this.chorarioModel
        .sort((a, b) => a.nombre.localeCompare(b.nombre))
        .map(item => [
          item.id,
          item.nombre,
          item.activo ? 'Activo' : 'Inactivo',
          item.created_at,
          item.updated_at,
        ]),
      piePagina: 'Pie de página - Mi Empresa en Desarrollo S.A....'
    });
  }

  async exportExcel() {
    this._appExportExcelService.generarReporteExcel({
      tamanoPapel: "A4",
      orientacion: "p",
      title: "Reporte de Horarios",
      titleTable: "Listado de Horarios",
      headers: ['ID', 'Nombre', 'Estado', 'Creado', 'Modificado'],
      data: this.chorarioModel
        .sort((a, b) => a.nombre.localeCompare(b.nombre))
        .map(item => [
          item.id,
          item.nombre,
          item.activo ? 'Activo' : 'Inactivo',
          item.created_at,
          item.updated_at,
        ]),
      piePagina: 'Pie de página - Mi Empresa en Desarrollo S.A....'
    });
  }

  async exportCsv() {
    this._appExportCsvService.generarReporteCSV({
      headers: ['ID', 'Nombre', 'Estado', 'Creado', 'Modificado'],
      data: this.chorarioModel
        .sort((a, b) => a.nombre.localeCompare(b.nombre))
        .map(item => [
          item.id,
          item.nombre,
          item.activo ? 'Activo' : 'Inactivo',
          item.created_at,
          item.updated_at,
        ]),
    });
  }

  // ****** AUDITORIA ****** //
  auditoria() {
    if (!this.selectedRow) return;
    if (!this._seguridadService.isexpired()) {
      const modalRef = this.modal.open(AuditoriaModalComponent, {
        centered: true,
        size: "xl",
        backdrop: "static",
        keyboard: true
      });
      modalRef.componentInstance.tablaNombre = 'chorarios';
      modalRef.componentInstance.registroId = this.selectedRow.id;
    }
  }
}

// ****** COMPONENTE QUE CONTIENE LOS BOTONES DEL AG GRID ****** //
@Component({
  selector: 'app-button-accion-horario',
  standalone: false,
  template: `
    <app-action-buttons 
      [accesoModel]="AllHorariosComponent.accesoModel"
      [buttonView]="true"
      [buttonEdit]="true"
      [buttonClone]="true"
      [buttonDelete]="true"
      (view)="viewHorario()"
      (edit)="editHorario()"
      (clone)="clonHorario()"
      (delete)="deleteHorario()">
    </app-action-buttons>
  `,
})
export class ButtonAccionHorario {
  private params: any;

  constructor(
    private modalService: NgbModal,
    public AllHorariosComponent: AllHorariosComponent
  ) { }

  agInit(params: any): void {
    this.params = params;
  }

clonHorario() {
  const modalRef = this.modalService.open(SaveHorarioComponent, {
    centered: true,
    size: 'lg',
    backdrop: 'static',
    keyboard: false
  });
  modalRef.componentInstance.registro_selected = this.params.data;
  modalRef.componentInstance.accion = 'clon';

  (async () => {
    try {
      const nuevoHorario = await firstValueFrom(modalRef.componentInstance.registrosE) as any;
      
      // Verificar que el nuevo horario tiene datos válidos
      if (nuevoHorario && nuevoHorario.id) {
        // Agregar al principio del array y actualizar grid
        this.AllHorariosComponent.chorarioModel.unshift(nuevoHorario);
        this.AllHorariosComponent.gridApi.setRowData(this.AllHorariosComponent.chorarioModel);
      } else {
        console.error('Respuesta inválida en clonación:', nuevoHorario);
      }
    } catch (error) {
      console.error('Error o cancelación en clonación:', error);
    }
  })();
}





  editHorario() {
    const modalRef = this.modalService.open(SaveHorarioComponent, {
      centered: true,
      size: 'lg',
      backdrop: 'static',
      keyboard: false
    });
    modalRef.componentInstance.registro_selected = this.params.data;
    modalRef.componentInstance.accion = 'edit';

    (async () => {
      try {
        const response = await firstValueFrom(modalRef.componentInstance.registrosE) as any;
        const index = this.AllHorariosComponent.chorarioModel.findIndex(
          registro => registro.id === response.id
        );
        if (index !== -1) {
          this.AllHorariosComponent.chorarioModel[index] = response;
          const rowNode = this.AllHorariosComponent.gridApi.getRowNode(index.toString());
          rowNode?.setData(response);
        }
      } catch (error) {
        console.error('Error o cancelación en edición:', error);
      }
    })();
  }

  viewHorario() {
    const modalRef = this.modalService.open(SaveHorarioComponent, {
      centered: true,
      size: 'lg',
      backdrop: 'static',
      keyboard: true
    });
    modalRef.componentInstance.registro_selected = this.params.data;
    modalRef.componentInstance.accion = 'view';
  }

deleteHorario() {
  const modalRef = this.modalService.open(DeleteHorarioComponent, {
    centered: true,
    size: 'md',
    backdrop: 'static',
    keyboard: true
  });
  modalRef.componentInstance.registro_selected = this.params.data;

  (async () => {
    try {
      await firstValueFrom(modalRef.componentInstance.registrosE);
      const horarioAEliminar = this.params.data;
      const index = this.AllHorariosComponent.chorarioModel.findIndex(
        registro => registro.id === horarioAEliminar.id
      );
      if (index !== -1) {
        this.AllHorariosComponent.chorarioModel.splice(index, 1);
        this.AllHorariosComponent.gridApi.applyTransaction({ remove: [horarioAEliminar] });
      }
    } catch (error) {
      console.error('Error o cancelación en eliminación:', error);
    }
  })();
}



}