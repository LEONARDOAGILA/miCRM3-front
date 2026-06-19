import { Component, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CellClickedEvent, GridApi,  GridReadyEvent } from 'ag-grid-community';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ActivatedRoute, Router } from '@angular/router';
import { AgGridAngular } from 'ag-grid-angular';

///   SERVICIOS    ///
import { SeguridadService } from '../../../services/seguridad.service';
import { ProfileService } from '../../../services/profile.service';
import { AppPrintPdfService } from '../../../../../service/app-printPdf.service';
import { AppExportExcelService } from '../../../../../service/app-exportExcel.service';
import { AppExportCsvService } from '../../../../../service/app-exportCsv.service';
import { AppAgGridService } from '../../../../../service/app-agGrid.service';
import { LoadingService } from '../../../../../service/loading.service';

///   MODELOS    ///
import { PerfilModel } from "../../../interfaces/perfilModel";
import { AccesoModel } from '../../../../seguridad/interfaces/accesoModel';

///   COMPONENTES    ///
import { DeleteProfileComponent } from '../deleteProfile/deleteProfile.component';
import { Save2ProfileComponent } from '../save2Profile/save2Profile.component';
import { AuditoriaModalComponent } from '../../../../../components/auditoria-modal/auditoria-modal.component';
import { CampoBusquedaPaginacionComponent } from '../../../../../components/campos/campoBusquedaPaginacion/campoBusquedaPaginacion.component';



@Component({
  selector: 'app-allProfiles',
  templateUrl: './allProfiles.component.html',
  styleUrls: ['./allProfiles.component.css'],
  standalone: false,
})
export class AllProfilesComponent implements OnInit, OnDestroy{

  public accesoModel: AccesoModel;
  public perfilModel: PerfilModel[] = [];
  public selectedRow: PerfilModel | null = null;

  public titulo: string;
  public isLoading$ = this._loadingService.isLoading$;
  
  public paginaActual: number = 1;
  public totalRegistros: number = 0;
  public registrosPorPagina: number = 5;
  public ultimaPagina: number = 1;
  


  @ViewChild(AgGridAngular) agGrid!: AgGridAngular;
  public gridApi!: GridApi;
  public columnDefs: any[] = [];
  private touchStartTime = 0;
  private touchStartX = 0;
  private touchStartY = 0;

  
  @HostListener('window:resize', ['$event'])
  onResize(event: Event): void { this._appAgGridService.ajustarTamanoGrid(this.gridApi); }
  private resizeTimeoutId: any; // Almacena el ID del timeout 


  // @ViewChild('inputElement') inputElement!: ElementRef<HTMLInputElement>; // si usas template reference
  @ViewChild(CampoBusquedaPaginacionComponent) campoBusquedaPaginacion!: CampoBusquedaPaginacionComponent;
  public searchTerm: string = '';


  constructor(
    private modal: NgbModal,
    private route: Router,
    private activeRoute: ActivatedRoute,

    private _appPrintPdfService: AppPrintPdfService,
    private _appExportExcelService: AppExportExcelService,
    private _appExportCsvService: AppExportCsvService,
    public  _appAgGridService: AppAgGridService,

    private _loadingService: LoadingService,
    private _seguridadService: SeguridadService, 
    private _profile: ProfileService,
    
  ){
    this.titulo = "Perfiles de Usuario";
    this.accesoModel = this.activeRoute.snapshot.data.access;
  }


    //   ******   INIT  - DESTROY  ******  //
    ngOnInit(): void {
      this.allProfiles();
      this.initializeGrid();

    }
    ngOnDestroy(): void {    
      // Cancela el timeout cuando el componente se destruye (evita fugas)
      if (this.resizeTimeoutId) { 
        clearTimeout(this.resizeTimeoutId); 
      }
    }



    //   ******   HOME DE MODULO  ******  //
    fun_home(){
      this.route.navigate(['/config/home']);
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
          maxWidth: 1200,          
        },
        {
          headerName: 'Inactividad',
          field: 'inactividad',
          cellStyle: { textAlign: 'center' },
          minWidth: 100,
          maxWidth: 100,
          
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
          headerName: 'Creado por',
          field: 'created_by',
          cellStyle: { textAlign: 'left' },
          minWidth: 150,
          maxWidth: 1200, 
          sortable: false,         
        },

        {
          headerName: 'Actualizado por',
          field: 'updated_by',
          cellStyle: { textAlign: 'left' },
          minWidth: 150,
          maxWidth: 1200, 
          sortable: false,         
        },

        {
          headerName: 'ACCIONES',
          field: 'actions',
          cellStyle: { display: 'flex', justifyContent: 'center', alignItems: 'center' },
          cellRenderer: ButtonAccionProfile,
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
        // Calcular altura disponible (puedes ajustar esta lógica según tus necesidades)
        const windowHeight = window.innerHeight;
        const gridPosition = gridElement.getBoundingClientRect().top;
        const marginBottom = 80; // Margen inferior
        
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



  



  async allProfiles(page: number = 1) {
    try {
      // Muestra el indicador de carga en la interfaz
      this._loadingService.setLoading(true);
      
      // Realiza la petición al backend con los parámetros de paginación y búsqueda
      // firstValueFrom convierte el observable en promesa y cancela la suscripción automáticamente
      const res = await firstValueFrom(
        this._profile.allProfiles(page, this.registrosPorPagina, this.searchTerm)
      );
      
      // Extrae el array de perfiles de la respuesta (estructura anidada: body.data.data)
      // Si no existe, asigna un array vacío para evitar errores
      this.perfilModel = res.body?.data?.data || [];
      //console.log('Cargando perfiles...', this.perfilModel);
      
      // Si existen metadatos de paginación, actualiza las variables del componente
      if (res.body?.data?.meta) {
        this.totalRegistros = res.body.data.meta.total;          // Total de registros en la BD
        this.registrosPorPagina = res.body.data.meta.per_page;   // Registros por página
        this.paginaActual = res.body.data.meta.current_page;     // Página actual
        this.ultimaPagina = res.body.data.meta.last_page;        // Última página disponible
      }
      
      // Si el grid ya está inicializado, actualiza los datos mostrados
      if (this.gridApi) this.gridApi.setRowData(this.perfilModel);
      
      // Oculta el indicador de carga
      this._loadingService.setLoading(false);
    } catch (error) {
      // En caso de error, oculta el indicador de carga y registra el error en consola
      this._loadingService.setLoading(false);
      console.error(error);
    }
  }




  

  //   ******   FUNCIONES DE BUSQUEDA   ******  //
  async onFilterTextBoxChanged(term?: string) {
    if (term !== undefined) this.searchTerm = term;
    this.paginaActual = 1;
    await this.allProfiles(1);
  }
  clearAllFilters() {
        this.campoBusquedaPaginacion.reset();
      // if (this.inputElement) {
      //   this.inputElement.nativeElement.value = '';
      // }

    if (this.gridApi) {
      // Remove any column filters
      this.gridApi.setFilterModel(null);
      
      // Clear the search input field and the search term variable
      const quickFilterInput = document.getElementById('filter-text-box') as HTMLInputElement;
      if (quickFilterInput) {
        quickFilterInput.value = '';
      }
      this.searchTerm = '';
      
      // Notify the grid that filters changed (if needed)
      this.gridApi.onFilterChanged();
      
      // Reload data with the cleared search term but stay on the current page
      // However, if the current page exceeds the new total pages, go to last page.
      this.allProfiles(this.paginaActual).then(() => {
        // After reload, check if current page is still valid; if not, go to last page
        if (this.paginaActual > this.ultimaPagina && this.ultimaPagina > 0) {
          this.goToPage(this.ultimaPagina);
        }
      });
    }
  }





  //   ******   FUNCIONES DE PAGINACIÓN   ******  //
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
  onPaginationChanged(event: any) {
    if (this.gridApi) {
      const newPage = this.gridApi.paginationGetCurrentPage() + 1; // ag-Grid usa base 0
      if (newPage !== this.paginaActual) {
        this.allProfiles(newPage);
      }
    }
  }
  goToPage(page: number): void {
    if (page < 1 || page > this.ultimaPagina) return;
    this.paginaActual = page;
    this.allProfiles(this.paginaActual);
  }
  nextPage(): void {
    this.goToPage(this.paginaActual + 1);
  }
  prevPage(): void {
    this.goToPage(this.paginaActual - 1);
  }



  //   ******   FUNCIONES DE IMPRESIÓN   ******  //
  async printPdf() {
      this._appPrintPdfService.generarReporte({
        tamanoPapel:"A4",
        orientacion: "p",
        title: "Reporte de Perfiles",
        titleTable: "Listado de Perfiles",        
        headers: ['ID', 'Nombre','Inactividad', 'Estado', 'Creado' , 'Modificado'],

        data: this.perfilModel
        .sort((a, b) => a.nombre.localeCompare(b.nombre)) // Ordena por nombre
        .map(item => [
          item.id,
          item.nombre,
          `${item.inactividad}`,
          item.activo ? 'Activo' : 'Inactivo',
          item.created_at,
          item.updated_at,
        ]),        

        piePagina: 'Pie de página - Mi Empresa en Desarrollo S.A....'

      });  
  }
  async exportExcel() {
    this._appExportExcelService.generarReporteExcel({
      tamanoPapel:"A4",
      orientacion: "p",
      title: "Reporte de Perfiles",
      titleTable: "Listado de Perfiles",        
      headers: ['ID', 'Nombre','Inactividad', 'Estado', 'Creado' , 'Modificado'],

      data: this.perfilModel
      .sort((a, b) => a.nombre.localeCompare(b.nombre)) // Ordena por nombre
      .map(item => [
        item.id,
        item.nombre,
        `${item.inactividad}`,
        item.activo ? 'Activo' : 'Inactivo',
        item.created_at,
        item.updated_at,
      ]),

      piePagina: 'Pie de página - Mi Empresa en Desarrollo S.A....'

    });  
  }
  async exportCsv() {
    this._appExportCsvService.generarReporteCSV({
        headers: ['ID', 'Nombre','Inactividad', 'Estado', 'Creado' , 'Modificado'],
        data: this.perfilModel
        .sort((a, b) => a.nombre.localeCompare(b.nombre)) // Ordena por nombre
        .map(item => [
          item.id,
          item.nombre,
          `${item.inactividad}`,
          item.activo ? 'Activo' : 'Inactivo',
          item.created_at,
          item.updated_at,
        ]),        
    });  
  }


  //   ******   ACCION NUEVO   ******  //
  addProfile() {
    // Verifica que el token de autenticación no haya expirado
    if (!this._seguridadService.isexpired()) {
      // Abre el modal del formulario de creación de perfiles (Save2ProfileComponent)
      const modalRef = this.modal.open(Save2ProfileComponent, {
        centered: true,      // Centra el modal en la pantalla
        size: 'xl',          // Tamaño extra grande (para el grid de accesos)
        backdrop: 'static',  // No permite cerrar haciendo clic fuera del modal
        keyboard: false      // No permite cerrar con la tecla Escape
      });

      // Pasa al modal el ID 0 (indica que es un nuevo registro) y la acción 'add'
      modalRef.componentInstance.registro_selected = 0;
      modalRef.componentInstance.accion = 'add';

      // Función asíncrona autoinvocada (IIFE) para usar async/await
      (async () => {
        try {
          // Espera la respuesta del modal: se emite cuando el usuario guarda exitosamente
          // firstValueFrom convierte el observable en una promesa; tipamos la respuesta como PerfilModel
          const nuevoPerfil = await firstValueFrom<PerfilModel>(
            modalRef.componentInstance.registrosE
          );

          // Agrega el nuevo perfil al principio del arreglo local 'perfilModel'
          // (porque la lista suele ordenarse por id DESC, los nuevos aparecen primero)
          this.perfilModel.unshift(nuevoPerfil);

          // Refresca el grid con el nuevo arreglo completo
          this.gridApi.setRowData(this.perfilModel);
        } catch (error) {
          // Captura cualquier error o la cancelación del usuario (cierra sin guardar)
          console.error('Error o cancelación en creación:', error);
        }
      })();
    }
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

    modalRef.componentInstance.tablaNombre = 'perfiles';
    modalRef.componentInstance.registroId = this.selectedRow.id; 
    //console.log('Registro seleccionado para auditoría:', this.selectedRow);
    }
  }



}  
/////////   FIN DEL AllProfilesComponent   ///////////////////////////////////////////////////////////////////////////////////////////////////////////














// COMPONENTE QUE CONTIENE EL BOTON
@Component({
  selector: 'app-button-accion',
  standalone: false,
  template: `
      <app-action-buttons 
        [accesoModel]="AllProfilesComponent.accesoModel"
        [buttonView] = true
        [buttonEdit] = true
        [buttonClone] = true
        [buttonDelete] = true
        (view)="viewProfile()"
        (edit)="editProfile()"
        (clone)="clonProfile()"
        (delete)="deleteProfile()">
      </app-action-buttons>
  `,
})

export class ButtonAccionProfile {

  private params: any;

  constructor(
      private modalService: NgbModal, 
      public AllProfilesComponent: AllProfilesComponent
  ){}


  agInit(params: any): void {
    this.params = params;
  }


  clonProfile() {
    // Abre el modal del formulario de clonación de perfiles (Save2ProfileComponent)
    const modalRef = this.modalService.open(Save2ProfileComponent, {
      centered: true,      // Centra el modal en la pantalla
      size: 'xl',          // Tamaño extra grande (para el grid de accesos)
      backdrop: 'static',  // No permite cerrar haciendo clic fuera del modal
      keyboard: false      // No permite cerrar con la tecla Escape
    });

    // Pasa al modal los datos del perfil que se va a clonar
    modalRef.componentInstance.registro_selected = this.params.data;
    // Indica al modal que la acción es 'clon' (para que sepa que debe crear un nuevo perfil a partir del existente)
    modalRef.componentInstance.accion = 'clon';

    // Usamos una función asíncrona autoinvocada (IIFE) para usar async/await
    // Usamos firstValueFrom para convertir el observable en promesa y evitar suscripciones manuales
    // Con esto, no se necesita desuscribirse en ngOnDestroy.
    // Esto simplifica el manejo de la respuesta del modal.
    (async () => {
      try {
        // Espera la respuesta del modal: se emite cuando el usuario guarda exitosamente
        // firstValueFrom convierte el observable en una promesa; tipamos la respuesta como PerfilModel
        const nuevoPerfil = await firstValueFrom<PerfilModel>(
          modalRef.componentInstance.registrosE
        );

        // Agrega el nuevo perfil al principio del arreglo local 'perfilModel' (porque la lista suele ordenarse por id DESC)
        // Si el orden fuera ascendente, usaríamos push() en lugar de unshift()
        this.AllProfilesComponent.perfilModel.unshift(nuevoPerfil);

        // Refresca el grid con el nuevo arreglo completo (setRowData es simple y garantiza consistencia)
        // También se podría usar applyTransaction para añadir solo la fila, pero setRowData es más claro y menos propenso a errores
        this.AllProfilesComponent.gridApi.setRowData(this.AllProfilesComponent.perfilModel);
      } catch (error) {
        // Captura cualquier error o la cancelación del usuario (cierra sin guardar)
        console.error('Error o cancelación en clonación:', error);
      }
    })();
  }



  editProfile() {
    // Abre el modal del formulario de edición de perfiles (Save2ProfileComponent)
    const modalRef = this.modalService.open(Save2ProfileComponent, {
      centered: true,      // Centra el modal en la pantalla
      size: 'xl',          // Tamaño extra grande (para el grid de accesos)
      backdrop: 'static',  // No permite cerrar haciendo clic fuera del modal
      keyboard: false      // No permite cerrar con la tecla Escape
    });

    // Pasa al modal los datos del perfil que se va a editar
    modalRef.componentInstance.registro_selected = this.params.data;
    // Indica al modal que la acción es 'edit' (para que sepa que debe actualizar, no crear)
    modalRef.componentInstance.accion = 'edit';


    // Usamos una función asíncrona autoinvocada (IIFE) para usar async/await
    // Usamos firstValueFrom para convertir el observable en promesa y evitar suscripciones manuales
    // Con esto, no se necesita desuscribirse en ngOnDestroy.
    // Esto simplifica el manejo de la respuesta del modal.
    (async () => {
      try {
        // Espera la respuesta del modal: se emite cuando el usuario guarda exitosamente
        // firstValueFrom convierte el observable en una promesa; tipamos la respuesta como PerfilModel
        const response = await firstValueFrom<PerfilModel>(
          modalRef.componentInstance.registrosE
        );
        // Busca la posición (índice) del perfil editado dentro del arreglo 'perfilModel' del padre
        const index = this.AllProfilesComponent.perfilModel.findIndex(
          registro => registro.id === response.id
        );
        // Si lo encuentra (índice válido)
        if (index !== -1) {
          // Actualiza el arreglo local con los datos nuevos (respuesta del backend)
          this.AllProfilesComponent.perfilModel[index] = response;
          // Obtiene la referencia a la fila correspondiente en el grid (ag-Grid)
          const rowNode = this.AllProfilesComponent.gridApi.getRowNode(index.toString());
          // Actualiza los datos de esa fila con la respuesta (refresca el grid)
          rowNode?.setData(response);
        }
      } catch (error) {
        // Captura cualquier error o la cancelación del usuario (cierra sin guardar)
        console.error('Error o cancelación en edición:', error);
      }
    })();
  }



  viewProfile() {
    // Abre el modal del formulario de perfiles en modo vista (solo lectura)
    const modalRef = this.modalService.open(Save2ProfileComponent, {
      centered: true,      // Centra el modal en la pantalla
      size: 'xl',          // Tamaño extra grande (para el grid de accesos)
      backdrop: 'static',  // No permite cerrar haciendo clic fuera del modal
      keyboard: false      // No permite cerrar con la tecla Escape
    });

    // Pasa al modal los datos del perfil que se va a visualizar
    modalRef.componentInstance.registro_selected = this.params.data;
    // Indica al modal que la acción es 'view' (modo solo lectura, sin botones de guardar)
    modalRef.componentInstance.accion = 'view';
  }



  deleteProfile() {
    // Abre el modal de confirmación de eliminación
    const modalRef = this.modalService.open(DeleteProfileComponent, {
      centered: true,      // Centrado en pantalla
      size: 'md',          // Tamaño mediano
      backdrop: 'static',  // No cierra al hacer clic fuera
      keyboard: true       // Permite cerrar con tecla Escape
    });

    // Pasa al modal los datos del perfil a eliminar
    modalRef.componentInstance.registro_selected = this.params.data;

    
    // Usamos una función asíncrona autoinvocada (IIFE) para usar async/await
    // Usamos firstValueFrom para convertir el observable en promesa y evitar suscripciones manuales
    // Con esto, no se necesita desuscribirse en ngOnDestroy.
    // Esto simplifica el manejo de la respuesta del modal.
    (async () => {
      try {
        // Espera la confirmación del modal (emite cuando el usuario confirma la eliminación)
        await firstValueFrom(modalRef.componentInstance.registrosE);

        // Datos del perfil que se está eliminando
        const perfilAEliminar = this.params.data;
        const perfilId = perfilAEliminar.id;

        // Busca el índice del perfil en el arreglo local (perfilModel)
        const index = this.AllProfilesComponent.perfilModel.findIndex(
          registro => registro.id === perfilId
        );

        if (index !== -1) {
          // Elimina el perfil del arreglo local
          this.AllProfilesComponent.perfilModel.splice(index, 1);
          // Elimina la fila del grid usando applyTransaction
          this.AllProfilesComponent.gridApi.applyTransaction({ remove: [perfilAEliminar] });
        }
      } catch (error) {
        // Si el usuario cancela la eliminación o hay error, solo se registra
        console.error('Error o cancelación en eliminación:', error);
      }
    })();
  }


}
