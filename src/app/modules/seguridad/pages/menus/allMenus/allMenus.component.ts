import { Component, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { firstValueFrom,  Subject, takeUntil } from 'rxjs';
import { CellClickedEvent, GridApi,  GridReadyEvent } from 'ag-grid-community';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ActivatedRoute, Router } from '@angular/router';
import { LoadingBarService } from '@ngx-loading-bar/core';
import { AgGridAngular } from 'ag-grid-angular';

import { SeguridadService } from '../../../../seguridad/services/seguridad.service';
import { MenuService } from "../../../services/menu.service";

import { MenuModel } from "../../../../seguridad/interfaces/menuModel";
import { AccesoModel } from '../../../../seguridad/interfaces/accesoModel';

import { DeleteMenuComponent } from '../deleteMenu/deleteMenu.component';
import { SaveMenuComponent } from '../saveMenu/saveMenu.component';
import { AppAgGridService } from '../../../../../service/app-agGrid.service';
import { LoadingService } from '../../../../../service/loading.service';

import { AppPrintPdfService } from '../../../../../service/app-printPdf.service';
import { AppExportExcelService } from '../../../../../service/app-exportExcel.service';
import { AppExportCsvService } from '../../../../../service/app-exportCsv.service';
import { PerfilModel } from '../../../interfaces/perfilModel';
import { AuditoriaModalComponent } from '../../../../../components/auditoria-modal/auditoria-modal.component';


@Component({
  selector: 'app-allMenus',
  templateUrl: './allMenus.component.html',
  styleUrls: ['./allMenus.component.css'],
  standalone: false,
})
export class AllMenusComponent implements OnInit, OnDestroy{

  public title: string;
  //public isLoading = false;
  public isLoading$ = this._loadingService.isLoading$;

  public errorMessage!: string;
  public accesoModel: AccesoModel;
  public menuModel: MenuModel[] = [];
  public selectedRow: PerfilModel | null = null;

  private unsubscribe$ = new Subject<void>();

  @ViewChild(AgGridAngular) agGrid!: AgGridAngular;
  public gridApi!: GridApi;
  public columnDefs: any[] = [];
  private touchStartTime = 0;
  private touchStartX = 0;
  private touchStartY = 0;

  
  @HostListener('window:resize', ['$event'])
  onResize(event: Event): void { this._appAgGridService.ajustarTamanoGrid(this.gridApi); }
  private resizeTimeoutId: any; // Almacena el ID del timeout 

  private styles = {
    level0: { color: 'black', fontSize: '12px', textAlign: 'center' },
    level1: { color: '#2874a6', fontSize: '12px', textAlign: 'center' },
    level2: { color: 'green', fontSize: '12px', textAlign: 'center' },
    level3: { color: 'purple', fontSize: '12px', textAlign: 'center' },
    default: { color: 'gray', fontSize: '12px', textAlign: 'center' },
    module: { color: 'black', fontSize: '12px', textAlign: 'center' },
    noModule: { color: 'gray', fontSize: '12px', textAlign: 'center' },
  };
  private styles2 = {
    level0: { color: 'black', fontSize: '12px', textAlign: 'left' },
    level1: { color: '#2874a6', fontSize: '12px', textAlign: 'left' },
    level2: { color: 'green', fontSize: '12px', textAlign: 'left' },
    level3: { color: 'purple', fontSize: '12px', textAlign: 'left' },
    default: { color: 'gray', fontSize: '12px', textAlign: 'left' },
    module: { color: 'black', fontSize: '12px', textAlign: 'left' },
    noModule: { color: 'gray', fontSize: '12px', textAlign: 'left' },
  };

    constructor(
      private modal: NgbModal,
      private activeRoute: ActivatedRoute,
      private route: Router,

      private _appExportExcelService: AppExportExcelService,
      private _appExportCsvService: AppExportCsvService,
      private _appPrintPdfService: AppPrintPdfService,
     
      public  _appAgGridService: AppAgGridService,
      private _loadingService: LoadingService,
      private _loadingBar: LoadingBarService,

      private _menuService: MenuService,
      private _seguridadService: SeguridadService, 

    ) {
      this.title = 'Lista de Menús';
      this.accesoModel = this.activeRoute.snapshot.data.access;
      console.log('AccesoModel ->', this.accesoModel);
    }


    //   ******   INIT  - DESTROY  ******  //
    ngOnInit(): void {
      this.allMenus();
      this.initializeGrid();
    }    
    ngOnDestroy(): void {
        // Cancela el timeout cuando el componente se destruye
      if (this.resizeTimeoutId) {clearTimeout(this.resizeTimeoutId);}
      this.unsubscribe$.next();
      this.unsubscribe$.complete();
    }


    //   ******   HOME DE MODULO  ******  //
    fun_home(){
      this.route.navigate(['/seguridad']);
    }


    //   ******   FUNCIONES DE GRID   ******  //
    initializeGrid(): void {  
      this.columnDefs = [     
        {
          headerName: 'Id',
          field: 'id',
          cellStyle: { textAlign: 'left'},
          minWidth: 70,
          maxWidth: 70,
          sortable: false,                  
        },

        {
          headerName: 'Icono',
          field: 'icono',
          cellStyle: (params) => { return this.styles2[`level${params.data.level}`] || this.styles2.default; },
          cellRenderer: (params) => this.renderIcon(params),
          minWidth: 40,  // Reducido porque los iconos ocupan menos espacio
          maxWidth: 40,  // Reducido porque los iconos ocupan menos espacio
          sortable: false,
        },

        {
          headerName: 'Nombre',
          field: 'nombre',
          cellStyle: (params) => { return this.styles2[`level${params.data.nivel}`] || this.styles2.default; },
          cellRenderer: (params) => {
            const indentation = '&nbsp;'.repeat(params.data.nivel * 6); // Ajusta el número de espacios según necesites
            return `${indentation}${params.value}`;
          },
          minWidth: 280,
          maxWidth: 400, 
          sortable: false,        
        },

        {
          headerName: 'Orden',
          field: 'orden',
          cellStyle: (params) => { return this.styles[`level${params.data.level}`] || this.styles.default; },     
          minWidth: 90,
          maxWidth: 90, 
          sortable: false,
        },

        {
          headerName: 'Nivel',
          field: 'nivel',
          cellStyle: (params) => { return this.styles[`level${params.data.level}`] || this.styles.default; },     
          minWidth: 90,
          maxWidth: 90, 
          sortable: false,
        },        
        
        {
          headerName: 'URL',
          field: 'url',
          cellStyle: (params) => { return this.styles2[`level${params.data.level}`] || this.styles2.default; },           
          minWidth: 150,
          maxWidth: 1200,          
          sortable: false,
        },

        {
          headerName: 'Etiqueta',
          field: 'etiqueta',
          cellStyle: (params) => { return this.styles2[`level${params.data.level}`] || this.styles2.default; },           
          minWidth: 100,
          maxWidth: 150,  
          sortable: false,        
        },


        {
          headerName: 'Descripción',
          field: 'descripcion',
          cellStyle: (params) => { return this.styles2[`level${params.data.level}`] || this.styles2.default; },           
          minWidth: 150,
          maxWidth: 1200,   
          sortable: false,       
        },
        
        {
          headerName: 'Creado',
          field: 'created_at',
          cellStyle: (params) => { return this.styles2[`level${params.data.level}`] || this.styles2.default; },           
          minWidth: 180,
          maxWidth: 180,
          sortable: false,
        },
        {
          headerName: 'Actualizado',
          field: 'updated_at',
          cellStyle: (params) => { return this.styles2[`level${params.data.level}`] || this.styles2.default; },           
          minWidth: 180,
          maxWidth: 180,
          sortable: false,
        },

        {
          headerName: 'Creado por',
          field: 'created_by',
          cellStyle: (params) => { return this.styles2[`level${params.data.level}`] || this.styles2.default; },           
          minWidth: 150,
          maxWidth: 1200, 
          sortable: false,         
        },

        {
          headerName: 'Actualizado por',
          field: 'updated_by',
          cellStyle: (params) => { return this.styles2[`level${params.data.level}`] || this.styles2.default; },           
          minWidth: 150,
          maxWidth: 1200, 
          sortable: false,         
        },

        {
          headerName: 'path',
          field: 'path',
          cellStyle: (params) => { return this.styles2[`level${params.data.level}`] || this.styles2.default; },           
          minWidth: 350,
          maxWidth: 2200,   
          sortable: false,
          hide: true,

        },


        {
          headerName: 'ACCIONES',
          field: 'actions',
          cellStyle: { display: 'flex', justifyContent: 'center', alignItems: 'center' },
          cellRenderer: ButtonAccionMenu,
          pinned: 'right',
          minWidth: 100,
          maxWidth: 100,
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


    // Método para renderizar iconos
    renderIcon(params: any) {
      const iconName = params.value;
      if (!iconName) return '';
      
      // Si el icono ya viene con formato de clase (ej: 'fas fa-home')
      if (iconName.includes('fa-')) {
        return `<i class="${iconName}"></i>`;
      }
      
      // Si solo tienes el nombre del icono (ej: 'home')
      return `<i class="fas fa-${iconName}"></i>`;
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
        
        actionsCol.minWidth = isCollapsed ? 100 : 50;
        actionsCol.maxWidth = isCollapsed ? 100 : 50;
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
          actionsCol.minWidth = isCollapsed ? 100 : 50; // Ancho menor en móviles
          actionsCol.maxWidth = isCollapsed ? 100 : 50;
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
        // Calcular altura disponible (puedes ajustar esta lógica según tus necesidades)
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
    clearSelection(): void {
      this._appAgGridService.limpiarSeleccion(this.gridApi); // Usa el método del servicio
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

    //   ******   IMPRESION   ******  //
    async printPdf() {
      this._appPrintPdfService.generarReporte({
        tamanoPapel:"A4",
        orientacion: "p",
        title: "Reporte de Departamentos",
        titleTable: "Listado de Departamentos",        
        headers: ['ID', 'Nombre', 'Estado', 'Creado' , 'Modificado'],

        data: this.menuModel
        .map(item => [
          item.id,
          item.nombre,
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

        data: this.menuModel
        .map(item => [
          item.id,
          item.nombre,
          item.created_at_formateado,
          item.updated_at_formateado,
        ]),

        piePagina: 'Pie de página - Mi Empresa en Desarrollo S.A....'

      });  
    }
    async exportCsv() {
      this._appExportCsvService.generarReporteCSV({
          headers: ['ID', 'Nombre', 'Estado', 'Creado' , 'Modificado'],
          data: this.menuModel
          .map(item => [
            item.id,
            item.nombre,
            item.created_at_formateado,
            item.updated_at_formateado,
          ]),        
      });  
    }


    //   ******   LISTADO DE DATOS   ******  //
    async allMenus() {
      try {
          this._loadingService.setLoading(true); // Inicia carga
          let res: any = await firstValueFrom(this._menuService.allMenus());
          if (res?.status === 'success') {
              this._loadingService.setLoading(false); // Finaliza carga    
              this.menuModel = res.data;
              //console.log('response -> Menús obtenidos', this.menuModel);
            }else{
              this._loadingService.setLoading(false); // Finaliza carga    
              this.menuModel = []; // Evita que sea `undefined`
              console.error('response -> Error: Respuesta sin status success', res.message);
          }
      } catch (error: any) {
        this._loadingService.setLoading(false); // Finaliza carga    
        this.menuModel = []; // Evita que sea `undefined`
        console.error('response -> Error en la petición', error);
      }
    }
      
    //   ******   ORDENAR COMO ARBOL   ******  //
    getMaxOrder2ByParent(parentId: number): number {
      // Filtrar elementos que tienen el mismo parent
      const children = this.menuModel.filter((item: any) => item.padre_id === parentId);

      if (children.length === 0) {
        return 0; // Si no hay hijos, retornar 0 por defecto
      }

      // Obtener el máximo valor de order2
      return Math.max(...children.map((item: any) => item.orden));
    }  
    getMaxOrder2Root(): number {
      // Filtrar elementos que tienen parent = 0
      //console.log('menuModel ->', this.menuModel);
      const rootItems = this.menuModel.filter((item: any) => item.padre_id === null || item.padre_id === 0);

      if (rootItems.length === 0) {
        return 0; // Si no hay elementos raíz, retornar 0 por defecto
      }

      // Obtener el máximo valor de order2 entre los elementos raíz
      return Math.max(...rootItems.map((item: any) => item.orden));
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

    modalRef.componentInstance.tablaNombre = 'menus';
    modalRef.componentInstance.registroId = this.selectedRow.id; 
    //console.log('Registro seleccionado para auditoría:', this.selectedRow);
    }
  }    

    //   ******   ACCION NUEVO   ******  //
    addMenu() {
      if (!this._seguridadService.isexpired()) {    
        const modalRef = this.modal.open(SaveMenuComponent, { centered: true, size: "xs", backdrop: "static", keyboard: false,});
        modalRef.componentInstance.registro_selected = 0;
          modalRef.componentInstance.accion = 'addNuevaRaiz';
          const maxOrder2 = this.getMaxOrder2Root();
          modalRef.componentInstance.maxOrder2 = maxOrder2 + 1 ;
    

          modalRef.result.then((result) => {
            this.allMenus();
            }).catch((error) => {
              if (error !== 'Close click' && error !== 'Escape key press') {
                console.error('Error al cerrar el modal:', error);
              }
            });

            
          modalRef.componentInstance.registrosE.pipe(takeUntil(this.unsubscribe$)).subscribe({
              next:  (response: any) => {  this.menuModel = response; },
              error: (error: any) =>    { console.error(error.message);
              },
          });  


      }
    }
  
  
  } 
  /////////   FIN DEL AllMenusComponent   ///////////////////////////////////////////////////////////////////////////////////////////////////////////
  




// COMPONENTE QUE CONTIENE EL BOTON
@Component({
  selector: 'app-button-accion',
  standalone: false,
  template: `
      <app-action-buttons 
        [accesoModel]="AllMenusComponent.accesoModel"
        [buttonAdd2] = "params.data.level === 3"
        [buttonAdd]  = "params.data.level !== 3"
        [buttonEdit] = true
        [buttonDelete] = true
        (add)="addMenu()"
        (edit)="editMenu()"
        (delete)="deleteMenu()">
      </app-action-buttons>
  `,
})


export class ButtonAccionMenu {

  public params: any;
  private unsubscribe$ = new Subject<void>();

  constructor(
      private modalService: NgbModal, 
      public AllMenusComponent: AllMenusComponent
  ){}


  agInit(params: any): void {
    this.params = params;
  }

  addMenu() {
      const modalRef = this.modalService.open(SaveMenuComponent, { centered: true, size: 'xs',  backdrop: 'static',  keyboard: false });
      modalRef.componentInstance.registro_selected = this.params.data;
      modalRef.componentInstance.accion = 'add';
      const maxOrder2 = this.AllMenusComponent.getMaxOrder2ByParent(this.params.data.id);
      modalRef.componentInstance.maxOrder2 = maxOrder2 + 1 ;
      let tieneHijos = this.AllMenusComponent.menuModel.some(item => item.padre_id === this.params.data.id);
      modalRef.componentInstance.tieneHijos = tieneHijos;

      modalRef.result.then((result) => {
          this.AllMenusComponent.allMenus();
      }).catch((error) => {
        if (error !== 'Close click' && error !== 'Escape key press') {
          console.error('Error al cerrar el modal:', error);
        }
      });
  }
        
  editMenu() {
      const modalRef = this.modalService.open(SaveMenuComponent, { centered: true, size: 'xs',  backdrop: 'static',  keyboard: false });
      modalRef.componentInstance.registro_selected = this.params.data;
      modalRef.componentInstance.accion = 'edit';
      let tieneHijos = this.AllMenusComponent.menuModel.some(item => item.padre_id === this.params.data.id);
      modalRef.componentInstance.tieneHijos = tieneHijos;

      modalRef.result.then((result) => {  this.AllMenusComponent.allMenus();
      }).catch((error) => {
        if (error !== 'Close click' && error !== 'Escape key press') {
          console.error('Error al cerrar el modal:', error);
        }
      });

  }

  deleteMenu() {
      const modalRef = this.modalService.open(DeleteMenuComponent, { centered: true, size: 'md',  backdrop: 'static',  keyboard: true });      
      modalRef.componentInstance.registro_selected = this.params.data;
      modalRef.componentInstance.registrosE.pipe(takeUntil(this.unsubscribe$)).subscribe({
          next: (response: any) => {
            const selectedData = this.AllMenusComponent.gridApi.getSelectedRows();
            const resdel = this.AllMenusComponent.gridApi.applyTransaction({ remove: selectedData })!;
          },
          error: (error: any) => {
            console.error(error.message);
          }
      });
  }




}
