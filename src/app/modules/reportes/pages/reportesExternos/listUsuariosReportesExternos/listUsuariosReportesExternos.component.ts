import { Component, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { firstValueFrom,  Subject } from 'rxjs';
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
import { ReporteExternoService } from '../../../../reportes/services/reporteExterno.service';
import { ModalReporteExternoComponent } from '../modalReporteExterno/modalReporteExterno.component';


//   ******   MODELOS   ******  //
import { AccesoModel } from '../../../../seguridad/interfaces/accesoModel';
import { ReporteExternoModel } from "../../../../reportes/interfaces/reporteExternoModel";





@Component({
  selector: 'app-listUsuariosReportesExternos',
  templateUrl: './listUsuariosReportesExternos.component.html',
  styleUrls: ['./listUsuariosReportesExternos.component.css'],
  standalone: false,
})
export class ListUsuariosReportesExternosComponent implements OnInit, OnDestroy {

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
  public reporteExternoModel: ReporteExternoModel[] = [];
  
// Agrega esta propiedad a la clase
public selectedRow: ReporteExternoModel | null = null;
private params: any;


  constructor(
    private modal: NgbModal,
    private activeRoute: ActivatedRoute,
    private route: Router,

    private _appExportExcelService: AppExportExcelService,
    private _appExportCsvService: AppExportCsvService,
    private _appPrintPdfService: AppPrintPdfService,
    private _modalService: NgbModal,

    public  _appAgGridService: AppAgGridService,
    private _loadingService: LoadingService,
    
    private _seguridadService: SeguridadService, 
    private _reporteExternoService: ReporteExternoService,
  ){
    this.title = "Reportes Externos";
    this.accesoModel = this.activeRoute.snapshot.data.access;
  }



    //   ******   INIT  - DESTROY  ******  //
    ngOnInit(): void {
      this.listUserReportesExternos();
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
    async listUserReportesExternos() {
      try {
          this._loadingService.setLoading(true); 
          let res: any = await firstValueFrom(this._reporteExternoService.listUserReportesExternos());
          if (res?.status === 'success') {
              this._loadingService.setLoading(false); 
              this.reporteExternoModel = res.data;
              console.log('reporteExternoModel', this.reporteExternoModel);
          }else{
            this._loadingService.setLoading(false); 
            console.error('response -> Error: Respuesta sin status success', res);
          }
      } catch (error: any) {
        this._loadingService.setLoading(false); 
        console.error('response -> Error en la petición', error);
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
          //hide: true,
        },
        {
          headerName: 'Nombre',
          field: 'nombre',
          cellStyle: { textAlign: 'left' },
          minWidth: 200,
          maxWidth: 1500,          
        },
        {
          headerName: 'Departamento',
          field: 'departamento.nombre',
          cellStyle: { textAlign: 'left' },
          minWidth: 150,
          maxWidth: 1500,          
        },

        {
          headerName: 'Descripcion',
          field: 'descripcion',
          cellStyle: { textAlign: 'left' },
          minWidth: 150,
          maxWidth: 1500,          
        },

        {
          headerName: 'Ultima Revision',
          field: 'users_reporteexterno.view_at',
          cellStyle: { textAlign: 'center' },
          minWidth: 180,
          maxWidth: 180,
        },

        {
          headerName: 'Acciones',
          field: 'acciones',
          cellStyle: { textAlign: 'center' },
          minWidth: 120,
          maxWidth: 120,
          pinned: 'right',
          cellRenderer: (params) => {
            const button = document.createElement('button');
            button.innerHTML = '<i class="fa fa-eye" aria-hidden="true"></i> Ver Informe';
            button.className = 'btn btn-primary btn-sm'; // btn-xs para tamaño extra pequeño en Bootstrap
            button.style.cssText = `
              padding: 1px 5px;
              font-size: 12px;
              line-height: 1.2;
              border-radius: 3px;
              cursor: pointer;
            `;
            
            // Estilo específico para el icono
            const icon = button.querySelector('i');
            if (icon) {
              icon.style.fontSize = '12px';
              icon.style.marginRight = '4px';
            }
            
            button.addEventListener('click', (e) => {
              e.stopPropagation();
              this.verRegistro(params.data);
            });
            return button;
          },
          suppressMenu: true,
          suppressSorting: true,
        },

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
        title: "Reporte de ReporteExternos",
        titleTable: "Listado de ReporteExternos",        
        headers: ['ID', 'Nombre', 'Estado', 'Creado' , 'Modificado'],

        data: this.reporteExternoModel
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
        title: "Reporte de ReporteExternos",
        titleTable: "Listado de ReporteExternos",        
        headers: ['ID', 'Nombre', 'Estado', 'Creado' , 'Modificado'],

        data: this.reporteExternoModel
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
          data: this.reporteExternoModel
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



    async verRegistro(registro: any): Promise<void> {
      try{
          console.log('reporteexterno_id',registro.id)
          let res: any = await firstValueFrom(this._reporteExternoService.updateUsersReportesExternos(registro.id));
          if (res?.status === 'success') {
            //  this._toastr.success(res.status, res.message,{ closeButton: true });
            //  this.LoadingState(false);
            //  console.log('listUsersSelected', res.data)
          } else {
            //  this.LoadingState(false);
            console.error('response -> Error: Respuesta sin status success', res);
          }
      } catch (error: any) {
          // this.LoadingState(false); 
        console.error('response -> Error en la petición', error);
      }


          

      const modalRef = this.modal.open(ModalReporteExternoComponent, { 
        centered: true, 
        size: "xxl", 
        backdrop: "static", 
        keyboard: true,
        windowClass: "my-class",
      });
      modalRef.componentInstance.registro_selected = registro; 

    }


}  














