import { Component, EventEmitter, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Subject, firstValueFrom, from, merge, of } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';
import { CellClickedEvent, GridApi, GridReadyEvent } from 'ag-grid-community';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { ActivatedRoute, Router } from '@angular/router';
import { AgGridAngular, ICellRendererAngularComp } from 'ag-grid-angular';

///   SERVICIOS    ///
import { SeguridadService } from '../../../services/seguridad.service';
import { UserService } from '../../../services/user.service';
import { AppPrintPdfService } from '../../../../../service/app-printPdf.service';
import { AppExportExcelService } from '../../../../../service/app-exportExcel.service';
import { AppExportCsvService } from '../../../../../service/app-exportCsv.service';
import { AppAgGridService } from '../../../../../service/app-agGrid.service';
import { LoadingService } from '../../../../../service/loading.service';

///   MODELOS    ///
import { UserModel } from "../../../interfaces/userModel";
import { AccesoModel } from '../../../../seguridad/interfaces/accesoModel';

///   COMPONENTES    ///
import { SaveUserComponent } from '../saveUser/saveUser.component';
import { DeleteUserComponent } from '../deleteUser/deleteUser.component';
import { ChangePasswordComponent } from '../change-password/change-password.component';
import { AuditoriaModalComponent } from '../../../../../components/auditoria-modal/auditoria-modal.component';
import { CampoBusquedaPaginacionComponent } from '../../../../../components/campos/campoBusquedaPaginacion/campoBusquedaPaginacion.component';

@Component({
  selector: 'app-allUsers',
  templateUrl: './allUsers.component.html',
  styleUrls: ['./allUsers.component.css'],
  standalone: false,
})
export class AllUsersComponent implements OnInit, OnDestroy {

  public accesoModel: AccesoModel;
  public userModel: UserModel[] = [];
  public selectedRow: UserModel | null = null;

  public titulo: string;
  public isLoading$ = this._loadingService.isLoading$;
  
  public paginaActual: number = 1;
  public totalRegistros: number = 0;
  public registrosPorPagina: number = 10;
  public ultimaPagina: number = 1;

  @ViewChild(AgGridAngular) agGrid!: AgGridAngular;
  public gridApi!: GridApi;
  public columnDefs: any[] = [];
  private touchStartTime = 0;
  private touchStartX = 0;
  private touchStartY = 0;

  /** Corta toda suscripción viva al destruir el componente. */
  private readonly unsubscribe$ = new Subject<void>();

  /** Timeouts pendientes, para cancelarlos en ngOnDestroy. */
  private timeoutIds: any[] = [];
  private resizeTimeoutId: any;

  /**
   * Referencias estables a los listeners de la cabecera. Con `.bind(this)` cada
   * llamada creaba una función nueva y removeEventListener era imposible.
   */
  private headerElement: Element | null = null;
  private readonly onHeaderClick: EventListener = () => this.toggleActionsColumn();
  private readonly onHeaderTouchStart: EventListener = (e) => this.handleTouchStart(e as TouchEvent);
  private readonly onHeaderTouchEnd: EventListener = (e) => this.handleTouchEnd(e as TouchEvent);

  /** Ahora sí pasa por el debounce de ajustarTamanoGrid(). */
  @HostListener('window:resize')
  onResize(): void { this.ajustarTamanoGrid(); }

  @ViewChild(CampoBusquedaPaginacionComponent) campoBusquedaPaginacion!: CampoBusquedaPaginacionComponent;
  public searchTerm: string = '';

  constructor(
    private modal: NgbModal,
    private route: Router,
    private activeRoute: ActivatedRoute,
    private _appPrintPdfService: AppPrintPdfService,
    private _appExportExcelService: AppExportExcelService,
    private _appExportCsvService: AppExportCsvService,
    public _appAgGridService: AppAgGridService,
    private _loadingService: LoadingService,
    private _seguridadService: SeguridadService,
    private _userService: UserService,
  ) {
    this.titulo = "Usuarios";
    this.accesoModel = this.activeRoute.snapshot.data.access;
  }

  ngOnInit(): void {
    this.allUsers();
    this.initializeGrid();
  }

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();

    this.timeoutIds.forEach(id => clearTimeout(id));
    this.timeoutIds = [];
    if (this.resizeTimeoutId) { clearTimeout(this.resizeTimeoutId); }

    this.quitarListenersCabecera();
  }

  /**
   * Suscribe al @Output de un modal y corta la suscripción cuando el modal se
   * cierra o cuando este componente se destruye.
   *
   * Con firstValueFrom() la promesa nunca se resolvía si el usuario cancelaba:
   * registrosE solo emite al guardar con éxito y nunca hace complete(). El
   * closure quedaba retenido para siempre junto al modal entero — formulario,
   * registro y el avatar en base64 incluidos.
   */
  public escucharModal<T>(
    modalRef: NgbModalRef,
    salida: EventEmitter<T>,
    alEmitir: (valor: T) => void
  ): void {
    // dismiss() rechaza la promesa; para nosotros es un cierre normal.
    const modalCerrado$ = from(modalRef.result).pipe(catchError(() => of(null)));

    salida
      .pipe(takeUntil(merge(this.unsubscribe$, modalCerrado$)))
      .subscribe({
        next: alEmitir,
        error: (err) => console.error('Error en el modal:', err),
      });
  }

  fun_home() {
    this.route.navigate(['/seguridad']);
  }

  // ****** FUNCIONES DE AG-GRID ****** //
  initializeGrid(): void {
    this.columnDefs = [
      // {
      //   headerName: 'Avatar',
      //   field: 'avatar',
      //   minWidth: 90,
      //   maxWidth: 120,
      //   cellStyle: { textAlign: 'center' },
      //   cellRenderer: (params: any) => {
      //     if (!params.value) return '';
      //     const imageUrl = this._userService.getUserImage(params.data.id, true);
      //     return `
      //       <img src="${imageUrl}" 
      //           alt="avatar" 
      //           style="width: 30px; height: 30px; border-radius: 50%;"
      //           onerror="this.onerror=null; this.src='/assets/img/user/default.png'"
      //       />
      //     `;
      //   }
      // },
      {
        headerName: 'Id',
        field: 'id',
        cellStyle: { textAlign: 'center' },
        minWidth: 70,
        maxWidth: 70,
      },
      {
        headerName: 'Usuario',
        field: 'login_user',
        cellStyle: { textAlign: 'left' },
        minWidth: 200,
        maxWidth: 350,
      },
      {
        headerName: 'Apellidos',
        field: 'surname',
        cellStyle: { textAlign: 'left' },
        minWidth: 150,
        maxWidth: 400,
      },
      {
        headerName: 'Nombre',
        field: 'name',
        cellStyle: { textAlign: 'left' },
        minWidth: 150,
        maxWidth: 400,
      },
      {
        headerName: 'Email',
        field: 'email',
        cellStyle: { textAlign: 'left' },
        minWidth: 200,
        maxWidth: 250,
      },
      {
        headerName: 'Teléfono',
        field: 'phone',
        cellStyle: { textAlign: 'left' },
        minWidth: 100,
        maxWidth: 120,
      },
      {
        headerName: 'Tipo Usuario',
        field: 'type_user',
        cellStyle: { textAlign: 'center' },
        minWidth: 130,
        maxWidth: 130,
        cellRenderer: (params: any) => {
          switch (params.value) {
            case 1: return 'Super Usuario';
            case 2: return 'Administrador';
            case 3: return 'Usuario Sistema';
            default: return 'Usuario Web';
          }
        }
      },
      {
        headerName: 'Perfil',
        field: 'perfil_nombre',
        cellStyle: { textAlign: 'left' },
        minWidth: 120,
        maxWidth: 150,
      },
      {
        headerName: 'Horario',
        field: 'chorario_nombre',
        cellStyle: { textAlign: 'left' },
        minWidth: 120,
        maxWidth: 150,
      },

      {
        headerName: 'Activo',
        field: 'isactive',
        cellStyle: { textAlign: 'center' },
        minWidth: 80,
        maxWidth: 80,
        cellRenderer: (params: any) =>
          `
          <div class="form-check mb-2 d-flex align-items-center justify-content-center" style="height: 100%;">
            <input disabled class="form-check-input" type="checkbox" ${params.value === true ? 'checked' : ''} />
            <label class="form-check-label"></label>
          </div>
          `,
      },
      {
        headerName: 'Último Login',
        field: 'last_login_at',
        cellStyle: { textAlign: 'center' },
        minWidth: 180,
        maxWidth: 180,
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
        cellRenderer: ButtonAccionUser,
        pinned: 'right',
        minWidth: 130,
        maxWidth: 130,
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
      }
    ];
  }

  onGridReady(params: GridReadyEvent): void {
    this.gridApi = params.api;

    this.timeoutIds.push(
      setTimeout(() => this.montarListenersCabecera(), 500)
    );

    this._appAgGridService.ajustarTamanoGrid(this.gridApi);
    this.ajustarAlturaGrid();
  }

  private montarListenersCabecera(): void {
    // ag-Grid recrea la celda de cabecera al cambiar columnDefs: hay que soltar
    // la anterior o el elemento huérfano sigue reteniendo el componente.
    this.quitarListenersCabecera();

    this.headerElement = document.querySelector('.ag-header-cell[col-id="actions"]');
    if (!this.headerElement) { return; }

    this.headerElement.addEventListener('click', this.onHeaderClick);
    this.headerElement.addEventListener('touchstart', this.onHeaderTouchStart, { passive: true });
    this.headerElement.addEventListener('touchend', this.onHeaderTouchEnd);
  }

  private quitarListenersCabecera(): void {
    if (!this.headerElement) { return; }
    this.headerElement.removeEventListener('click', this.onHeaderClick);
    this.headerElement.removeEventListener('touchstart', this.onHeaderTouchStart);
    this.headerElement.removeEventListener('touchend', this.onHeaderTouchEnd);
    this.headerElement = null;
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

  toggleActionsColumn() {
    const columnDefs = this.gridApi.getColumnDefs() as any[];
    const actionsCol = columnDefs.find(col => col.field === 'actions');
    if (actionsCol) {
      const isCollapsed = actionsCol.minWidth === 50;
      actionsCol.minWidth = isCollapsed ? 130 : 50;
      actionsCol.maxWidth = isCollapsed ? 130 : 50;
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
        actionsCol.minWidth = isCollapsed ? 130 : 50;
        actionsCol.maxWidth = isCollapsed ? 130 : 50;
      }
      this.gridApi.setColumnDefs(columnDefs);
      this.gridApi.sizeColumnsToFit();

      this.timeoutIds.push(
        setTimeout(() => {
          this.gridApi.sizeColumnsToFit();
          this.montarListenersCabecera();   // ag-Grid acaba de recrear la cabecera
        }, 100)
      );
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

  // ****** FUNCIÓN PRINCIPAL: LISTAR USUARIOS PAGINADOS ****** //
  async allUsers(page: number = 1) {
    try {
      this._loadingService.setLoading(true);

      const res = await firstValueFrom(
        this._userService.allUsers(page, this.registrosPorPagina, this.searchTerm)
      ) as any;

      this.userModel = res.body?.data?.data || [];
      //console.log('Cargando usuarios...', this.userModel);

      if (res.body?.data?.meta) {
        this.totalRegistros = res.body.data.meta.total;
        this.registrosPorPagina = res.body.data.meta.per_page;
        this.paginaActual = res.body.data.meta.current_page;
        this.ultimaPagina = res.body.data.meta.last_page;
      }

      if (this.gridApi) this.gridApi.setRowData(this.userModel);
      this._loadingService.setLoading(false);
    } catch (error) {
      this._loadingService.setLoading(false);
      console.error('Error al cargar usuarios:', error);
    }
  }

  // ****** FUNCIONES DE BUSQUEDA ****** //
  async onFilterTextBoxChanged(term?: string) {
    if (term !== undefined) this.searchTerm = term;
    this.paginaActual = 1;
    await this.allUsers(1);
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
      this.allUsers(this.paginaActual).then(() => {
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
    this.allUsers(this.paginaActual);
  }

  nextPage(): void {
    this.goToPage(this.paginaActual + 1);
  }

  prevPage(): void {
    this.goToPage(this.paginaActual - 1);
  }

  // ****** IMPRESIÓN Y EXPORTACIÓN ****** //
  async printPdf() {
    this._appPrintPdfService.generarReporte({
      tamanoPapel: "A4",
      orientacion: "p",
      title: "Reporte de Usuarios",
      titleTable: "Listado de Usuarios",
      headers: ['ID', 'Usuario', 'Nombre', 'Apellido', 'Email', 'Activo'],
      data: this.userModel.map(item => [
        item.id,
        item.login_user,
        item.name,
        item.surname,
        item.email,
        item.isactive ? 'Activo' : 'Inactivo'
      ]),
      piePagina: 'Pie de página - Mi Empresa en Desarrollo S.A....'
    });
  }

  async exportExcel() {
    this._appExportExcelService.generarReporteExcel({
      tamanoPapel: "A4",
      orientacion: "p",
      title: "Reporte de Usuarios",
      titleTable: "Listado de Usuarios",
      headers: ['ID', 'Usuario', 'Nombre', 'Apellido', 'Email', 'Activo'],
      data: this.userModel.map(item => [
        item.id,
        item.login_user,
        item.name,
        item.surname,
        item.email,
        item.isactive ? 'Activo' : 'Inactivo'
      ]),
      piePagina: 'Pie de página - Mi Empresa en Desarrollo S.A....'
    });
  }

  async exportCsv() {
    this._appExportCsvService.generarReporteCSV({
      headers: ['ID', 'Usuario', 'Nombre', 'Apellido', 'Email', 'Activo'],
      data: this.userModel.map(item => [
        item.id,
        item.login_user,
        item.name,
        item.surname,
        item.email,
        item.isactive ? 'Activo' : 'Inactivo'
      ]),
    });
  }

  // ****** ACCIONES ****** //
  private abrirModalUsuario(registro: any, accion: 'add' | 'edit' | 'clon' | 'view'): NgbModalRef {
    const modalRef = this.modal.open(SaveUserComponent, {
      centered: true,
      size: 'xl',
      backdrop: 'static',
      keyboard: accion === 'view',
    });
    modalRef.componentInstance.registro_selected = registro;
    modalRef.componentInstance.accion = accion;
    return modalRef;
  }

  addUser(): void {
    if (this._seguridadService.isexpired()) { return; }

    const modalRef = this.abrirModalUsuario(0, 'add');
    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, (nuevo: any) => {
      this.userModel = [nuevo, ...this.userModel];
      this.gridApi?.setRowData(this.userModel);
    });
  }

  clonUser(registro: any): void {
    if (this._seguridadService.isexpired()) { return; }

    const modalRef = this.abrirModalUsuario(registro, 'clon');
    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, (nuevo: any) => {
      this.userModel = [nuevo, ...this.userModel];
      this.gridApi?.setRowData(this.userModel);
    });
  }

  editUser(registro: any): void {
    if (this._seguridadService.isexpired()) { return; }

    const modalRef = this.abrirModalUsuario(registro, 'edit');
    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, (actualizado: any) => {
      const index = this.userModel.findIndex(r => r.id === actualizado.id);
      if (index === -1) { return; }
      this.userModel[index] = actualizado;
      this.gridApi?.getRowNode(index.toString())?.setData(actualizado);
    });
  }

  viewUser(registro: any): void {
    if (this._seguridadService.isexpired()) { return; }
    this.abrirModalUsuario(registro, 'view');   // solo lectura: no emite nada
  }

  deleteUser(registro: any): void {
    if (this._seguridadService.isexpired()) { return; }

    const modalRef = this.modal.open(DeleteUserComponent, {
      centered: true,
      size: 'md',
      backdrop: 'static',
      keyboard: true
    });
    modalRef.componentInstance.registro_selected = registro;

    this.escucharModal(modalRef, modalRef.componentInstance.registrosE, () => {
      const index = this.userModel.findIndex(r => r.id === registro.id);
      if (index === -1) { return; }
      this.userModel.splice(index, 1);
      this.gridApi?.applyTransaction({ remove: [registro] });
    });
  }

  cambioClave(registro: any): void {
    if (this._seguridadService.isexpired()) { return; }

    const modalRef = this.modal.open(ChangePasswordComponent, {
      centered: true,
      size: 'xl',
      backdrop: 'static',
      keyboard: true
    });
    modalRef.componentInstance.userId = registro.id;
    modalRef.componentInstance.login_user = registro.login_user;
    modalRef.componentInstance.email = registro.email;
    modalRef.componentInstance.view_reset = true;
    modalRef.componentInstance.registro_selected = registro;

    this.escucharModal(modalRef, modalRef.componentInstance.passwordChanged, () => {
      this.allUsers(this.paginaActual);   // refresca updated_at / updated_by
    });
  }

  auditoria(): void {
    if (!this.selectedRow) { return; }
    if (this._seguridadService.isexpired()) { return; }

    const modalRef = this.modal.open(AuditoriaModalComponent, {
      centered: true,
      size: "xl",
      backdrop: "static",
      keyboard: true
    });
    modalRef.componentInstance.tablaNombre = 'users';
    modalRef.componentInstance.registroId = this.selectedRow.id;
  }
}

// ****** COMPONENTE DE BOTONES DE ACCIÓN ****** //
// Simple delegador: toda la lógica de modales vive en AllUsersComponent, así no
// se duplica ni deja closures colgando en cada fila renderizada.
@Component({
  selector: 'app-button-accion-user',
  standalone: false,
  template: `
    <app-action-buttons
      [accesoModel]="parent.accesoModel"
      [buttonCambioClave]="true"
      [buttonView]="true"
      [buttonEdit]="true"
      [buttonClone]="true"
      [buttonDelete]="true"
      (cambioClave)="parent.cambioClave(params.data)"
      (view)="parent.viewUser(params.data)"
      (edit)="parent.editUser(params.data)"
      (clone)="parent.clonUser(params.data)"
      (delete)="parent.deleteUser(params.data)">
    </app-action-buttons>
  `,
})
export class ButtonAccionUser implements ICellRendererAngularComp {
  public params: any;

  constructor(public parent: AllUsersComponent) { }

  agInit(params: any): void { this.params = params; }

  /** true = ag-Grid reutiliza esta instancia en vez de recrearla en cada scroll. */
  refresh(params: any): boolean { this.params = params; return true; }
}

