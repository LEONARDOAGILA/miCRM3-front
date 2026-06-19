import { Component, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { firstValueFrom,  Subject, takeUntil } from 'rxjs';
import { CellClickedEvent, GridApi,  GridReadyEvent } from 'ag-grid-community';
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
import { DepartamentoService } from '../../../services/departamento.service';


//   ******   MODELOS   ******  //
import { AccesoModel } from '../../../../seguridad/interfaces/accesoModel';
import { DepartamentoModel } from "../../../interfaces/departamentoModel";


//   ******   COMPONENTES   ******  //
import { SaveDepartamentoComponent } from '../saveDepartamento/saveDepartamento.component';
import { DeleteDepartamentoComponent } from '../deleteDepartamento/deleteDepartamento.component';

import { AuditoriaModalComponent } from '../../../../../components/auditoria-modal/auditoria-modal.component';



@Component({
  selector: 'app-allDepartamentos',
  templateUrl: './allDepartamentos.component.html',
  styleUrls: ['./allDepartamentos.css'],

  standalone: false,
})
export class AllDepartamentosComponent implements OnInit, OnDestroy{

  //   ******   AG-GRID   ******  //
  @ViewChild(AgGridAngular) agGrid!: AgGridAngular;
  public gridApi!: GridApi;
  public columnDefs: any[] = [];
  private touchStartTime = 0;
  private touchStartX = 0;
  private touchStartY = 0;  
  @HostListener('window:resize', ['$event'])
  onResize(event: Event): void { this._appAgGridService.ajustarTamanoGrid(this.gridApi); }
  private resizeTimeoutId: any; // Almacena el ID del timeout 
  
  //   ******   PLANTILLA   ******  //
  private unsubscribe$ = new Subject<void>();
  public isLoading$ = this._loadingService.isLoading$; 
  public title: string;
  
  //   ******   MODELOS   ******  //  
  public accesoModel: AccesoModel; 
  public departamentoModel: DepartamentoModel[] = [];
  
// Agrega esta propiedad a la clase
public selectedRow: DepartamentoModel | null = null;



  constructor(
    private modal: NgbModal,
    private activeRoute: ActivatedRoute,
    private route: Router,

    private _appExportExcelService: AppExportExcelService,
    private _appExportCsvService: AppExportCsvService,
    private _appPrintPdfService: AppPrintPdfService,

    public  _appAgGridService: AppAgGridService,
    private _loadingService: LoadingService,
    
    private _seguridadService: SeguridadService, 
    private _departamento: DepartamentoService,
  ){
    this.title = "Departamentos";
    this.accesoModel = this.activeRoute.snapshot.data.acceso;
  }



    //   ******   INIT  - DESTROY  ******  //
    ngOnInit(): void {
      this.allDepartamentos();
      this.initializeGrid();
    }
    ngOnDestroy(): void {    
      if (this.resizeTimeoutId) { clearTimeout(this.resizeTimeoutId); } // Cancela el timeout cuando el componente se destruye
      this.unsubscribe$.next();
      this.unsubscribe$.complete();
    }


    //   ******   HOME DE MODULO  ******  //
    fun_home(){
      this.route.navigate(['/config/home']);
    }


    //   ******   LISTADO DE DATOS   ******  //
    async allDepartamentos() {
      try {
          this._loadingService.setLoading(true); 
          let res: any = await firstValueFrom(this._departamento.allDepartamentos());
          if (res?.status === 'success') {
              this._loadingService.setLoading(false); 
              this.departamentoModel = res.data;
              //console.log('departamentoModel', this.departamentoModel);
          }else{
            this._loadingService.setLoading(false); 
            console.error('response -> Error: Respuesta sin status success', res);
          }
      } catch (error: any) {
        this._loadingService.setLoading(false); 
        console.error('response -> Error en la petición', error);
      }
    }


    //   ******   ACCION NUEVO   ******  //
    addDepartamento() {
      if (!this._seguridadService.isexpired()) {    
          const modalRef = this.modal.open(SaveDepartamentoComponent, { centered: true, size: "xs", backdrop: "static", keyboard: false,});
          modalRef.componentInstance.registro_selected = 0;
          modalRef.componentInstance.accion = 'add';      
          modalRef.componentInstance.registrosE.pipe(takeUntil(this.unsubscribe$)).subscribe({
              next:  (response: any) => {  this.departamentoModel = response; },
              error: (error: any) =>    { console.error(error.message);
              },
          });  
      }
    }



    

    //   ******   FUNCIONES DE AG-GRID   ******  //
    initializeGrid(): void {
      this.columnDefs = [
        {
          headerName: 'Id',
          field: 'id',
          cellStyle: { textAlign: 'center'},
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
            <div class="form-check  mb-2 d-flex align-items-center justify-content-center" style="height: 100%;">
              <input disabled class="form-check-input" type="checkbox"   ${params.value === true ? 'checked' : ''}    />
              <label class="form-check-label"></label>
            </div>        
            `,      
        },
        {
          headerName: 'Creado',
          field: 'created_at_formateado',
          cellStyle: { textAlign: 'center' },
          minWidth: 180,
          maxWidth: 180,
        },
        {
          headerName: 'Actualizado',
          field: 'updated_at_formateado',
          cellStyle: { textAlign: 'center' },
          minWidth: 180,
          maxWidth: 180,
        },

        {
          headerName: 'ACCIONES',
          field: 'actions',
          cellStyle: { display: 'flex', justifyContent: 'center', alignItems: 'center' },
          cellRenderer: ButtonAccionDepartamento,
          pinned: 'right',
          minWidth: 110,
          maxWidth: 110,
          suppressMenu: true,
          sortable: false,
          resizable: false,
          suppressSizeToFit: false,
          headerComponentParams: {
            template: `
              <div style="display: flex; align-items: center; justify-content: center; gap: 5px;">
                <span>ACCIONES</span>
                <i class="fas fa-arrow-right"></i>
              </div>
            `
          }
        }

      ];     
    }
    onGridReady(params: GridReadyEvent): void {
      this.gridApi = params.api;
      
      // Agregar eventos para desktop y móvil
      setTimeout(() => {
        const headerElement = document.querySelector('.ag-header-cell[col-id="actions"]');
        if (headerElement) {
          // Evento para desktop
          headerElement.addEventListener('click', this.handleHeaderAction.bind(this));
          
          // Eventos para móvil
          headerElement.addEventListener('touchstart', this.handleTouchStart.bind(this), {passive: true});
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
      
      // Consideramos como "tap" si fue breve y con poco movimiento
      if (touchDuration < 300 && distX < 10 && distY < 10) {
        this.toggleActionsColumn();
        e.preventDefault(); // Prevenir comportamiento por defecto
      }
    }
    handleHeaderAction() {
      //console.log('Acción de header detectada');
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
          { display: 'none', justifyContent: 'left', alignItems: 'left'};

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

        //actionsCol.headerName = isCollapsed ? 'ACCIONES' : '☰';
        // ☰ ⠿ ☷

        // Optimización para móviles
        if (window.innerWidth <= 768) {
          actionsCol.minWidth = isCollapsed ? 110 : 50; // Ancho menor en móviles
          actionsCol.maxWidth = isCollapsed ? 110 : 50;
        }
        
        this.gridApi.setColumnDefs(columnDefs);
        this.gridApi.sizeColumnsToFit();
        
        // Asegurar redimensionado en móviles
        setTimeout(() => {
          this.gridApi.sizeColumnsToFit();
        }, 100);
      }
    }
    ajustarTamanoGrid(){
      if (this.gridApi) {      
        if (this.resizeTimeoutId) { clearTimeout(this.resizeTimeoutId); }    // Cancela el timeout anterior si existe    
          this.resizeTimeoutId = setTimeout(() => {  
              this._appAgGridService.ajustarTamanoGrid(this.gridApi);
              this.ajustarAlturaGrid(); 
          }, 100); // Esperar 100ms para asegurar que el DOM se haya actualizado
        }
    }
    ajustarAlturaGrid() {
      // Obtener el contenedor del grid
      const gridElement = document.querySelector('.ag-theme-alpine') as HTMLElement;
      
      if (gridElement) {
        // Calcular altura disponible
        const windowHeight = window.innerHeight;
        const gridPosition = gridElement.getBoundingClientRect().top;
        const marginBottom = 20; // Margen inferior
        
        // Establecer nueva altura
        const newHeight = windowHeight - gridPosition - marginBottom;
        gridElement.style.height = `${newHeight}px`;
        
        // Notificar al grid del cambio de tamaño
        this.gridApi.sizeColumnsToFit();
      }
    }
    onCellClicked(e: CellClickedEvent): void {
        this.selectedRow = e.data;
      //console.log('cliked', e.data)
      //this.id = e.data.id;
      //this.nombre = e.data.nombre;
    }
    onFilterTextBoxChanged() {
      this.gridApi.setQuickFilter((document.getElementById('filter-text-box') as HTMLInputElement).value);
    }
    clearAllFilters() {
      if (this.gridApi) {
        this.gridApi.setFilterModel(null); // Esto elimina todos los filtros
        const quickFilterInput = document.getElementById('filter-text-box') as HTMLInputElement;
        if (quickFilterInput) {
          quickFilterInput.value = '';
        }
        this.onFilterTextBoxChanged();
        this.gridApi.onFilterChanged(); // Notifica al grid que los filtros cambiaron
      }
    }
    clearSelection(): void {
      this._appAgGridService.limpiarSeleccion(this.gridApi); // Usa el método del servicio
    }


    //   ******   IMPRESION   ******  //
    async printPdf() {
      this._appPrintPdfService.generarReporte({
        tamanoPapel:"A4",
        orientacion: "p",
        title: "Reporte de Departamentos",
        titleTable: "Listado de Departamentos",        
        headers: ['ID', 'Nombre', 'Estado', 'Creado' , 'Modificado'],

        data: this.departamentoModel
        .sort((a, b) => a.nombre.localeCompare(b.nombre)) // Ordena por nombre
        .map(item => [
          item.id,
          item.nombre,
          item.activo ? 'Activo' : 'Inactivo',
          item.created_at_formateado,
          item.updated_at_formateado,
        ]),        

        piePagina: 'Pie de página - Mi Empresa en Desarrollo S.A....'

      });  
    }
    async exportExcel() {
      this._appExportExcelService.generarReporteExcel({
        tamanoPapel:"A4",
        orientacion: "p",
        title: "Reporte de Departamentos",
        titleTable: "Listado de Departamentos",        
        headers: ['ID', 'Nombre', 'Estado', 'Creado' , 'Modificado'],

        data: this.departamentoModel
        .sort((a, b) => a.nombre.localeCompare(b.nombre)) // Ordena por nombre
        .map(item => [
          item.id,
          item.nombre,
          item.activo ? 'Activo' : 'Inactivo',
          item.created_at_formateado,
          item.updated_at_formateado,
        ]),

        piePagina: 'Pie de página - Mi Empresa en Desarrollo S.A....'

      });  
    }
    async exportCsv() {
      this._appExportCsvService.generarReporteCSV({
          headers: ['ID', 'Nombre', 'Estado', 'Creado' , 'Modificado'],
          data: this.departamentoModel
          .sort((a, b) => a.nombre.localeCompare(b.nombre)) // Ordena por nombre
          .map(item => [
            item.id,
            item.nombre,
            item.activo ? 'Activo' : 'Inactivo',
            item.created_at_formateado,
            item.updated_at_formateado,
          ]),        
      });  
    }





// AUDITORIA
auditoria() {
  if (!this.selectedRow) return;
  
  if (!this._seguridadService.isexpired()) {    
    const modalRef = this.modal.open(AuditoriaModalComponent, { 
      centered: true, 
      size: "xl", 
      backdrop: "static", 
      keyboard: true
    });

  modalRef.componentInstance.tablaNombre = 'departamento';
  modalRef.componentInstance.registroId = this.selectedRow.id; 
  }
}




}  










// COMPONENTE QUE CONTIENE LOS BOTONES DEL AG GRID
@Component({
  selector: 'app-button-accion',
  standalone: false,
  template: `
      <app-action-buttons 
        [accesoModel]="AllDepartamentosComponent.accesoModel"
        [buttonView] = true
        [buttonEdit] = true
        [buttonClone] = true
        [buttonDelete] = true
        (view)="viewDepartamento()"
        (edit)="editDepartamento()"
        (clone)="clonDepartamento()"
        (delete)="deleteDepartamento()">
      </app-action-buttons>
  `,
})

export class ButtonAccionDepartamento implements OnDestroy{

  private params: any;
  private unsubscribe$ = new Subject<void>();

  constructor(
      private modalService: NgbModal, 
      public AllDepartamentosComponent: AllDepartamentosComponent
  ){}


  agInit(params: any): void {
    this.params = params;
  }

  ngOnDestroy(): void {    
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }


  clonDepartamento() {
      const modalRef = this.modalService.open(SaveDepartamentoComponent, { centered: true, size: 'xs',  backdrop: 'static',  keyboard: false });
      modalRef.componentInstance.registro_selected = this.params.data;
      modalRef.componentInstance.accion = 'clon';

      modalRef.componentInstance.registrosE.pipe(takeUntil(this.unsubscribe$)).subscribe({
        next: (response: any) => {  this.AllDepartamentosComponent.departamentoModel = response;  },
        error: (error: any) => { console.error(error.message); }
      });
  }

  editDepartamento() {
      const modalRef = this.modalService.open(SaveDepartamentoComponent, { centered: true, size: 'xs',  backdrop: 'static',  keyboard: false });
      let copia = structuredClone(this.params.data);
      modalRef.componentInstance.registro_selected = this.params.data;
      modalRef.componentInstance.accion = 'edit';

      modalRef.componentInstance.registrosE.pipe(takeUntil(this.unsubscribe$)).subscribe({
          next: (response: any) => {
              let INDEX = this.AllDepartamentosComponent.departamentoModel.findIndex(registro => registro.id == response.id);
              let rowNode = this.AllDepartamentosComponent.gridApi.getRowNode(INDEX.toString());
              rowNode?.setData(this.AllDepartamentosComponent.departamentoModel[INDEX] = response);
          },
          error: (error: any) => {
              console.error(error.message);
          }
      });      
      modalRef.closed.subscribe((message: any) => { this.params.data = copia; }); // creo la copia o clon para que si cambio algo no me modifique el objeto original
  }

  viewDepartamento() {
      const modalRef = this.modalService.open(SaveDepartamentoComponent, { centered: true, size: 'xs',  backdrop: 'static',  keyboard: true   });
      modalRef.componentInstance.registro_selected = this.params.data;
      modalRef.componentInstance.accion = 'view';
  }

  deleteDepartamento() {
      const modalRef = this.modalService.open(DeleteDepartamentoComponent, { centered: true, size: 'md',  backdrop: 'static',  keyboard: true });      
      modalRef.componentInstance.registro_selected = this.params.data;
      modalRef.componentInstance.registrosE.pipe(takeUntil(this.unsubscribe$)).subscribe({
          next: (response: any) => {
            const selectedData = this.AllDepartamentosComponent.gridApi.getSelectedRows();
            const resdel = this.AllDepartamentosComponent.gridApi.applyTransaction({ remove: selectedData })!;
          },
          error: (error: any) => {
            console.error(error.message);
          }
      });
  }






}
