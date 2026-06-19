import { Component, EventEmitter, HostListener, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { CellClickedEvent, GridApi, GridReadyEvent } from 'ag-grid-community';
import { firstValueFrom, Subject, takeUntil } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { LoadingBarService } from '@ngx-loading-bar/core';

import { AppAgGridService } from '../../../../../service/app-agGrid.service';
import { SeguridadService } from '../../../../seguridad/services/seguridad.service';
import { UserService } from "../../../../seguridad/services/user.service";
import { ReporteExternoService } from "../../../services/reporteExterno.service";


@Component({
  selector: 'app-usuariosReportesExternos',
  templateUrl: './usuariosReportesExternos.component.html',
  styleUrls: ['./usuariosReportesExternos.component.css'],
  standalone: false,
})
export class UsuariosReportesExternosComponent implements OnInit, OnDestroy {

  @Output() registrosE: EventEmitter<any> = new EventEmitter();
  @Input() registro_selected: any;

  public tilte: string;

  private unsubscribe$ = new Subject<void>();
  public isdisabled: boolean = false;
  public isLoading = false;

  public gridApi!: GridApi;
  public columnDefs: any[] = [];

  enunciado1: any = "Lista de Usuarios";
  enunciado2: any = "Usuarios asignados";


  listaUsuariosTabla1: any[] = [];
  listaUsuariosTabla2: any[] = [];
  listaUsuariosEliminados: any[] = [];

  objFormularioUsuarios: any = {
    id: null,
    reporte_link_id: null,
    user_id: null,
  };

  public gridApi2!: GridApi;
  public columnDefs2: any[] = [];
  
  usuario_obj1: any = {};
  usuario_obj2: any = {};

  countUsuariosSeleccionados: any = 0;
  countUsuarios: any = 0;
  usuarioLogeado: any;

  constructor(
    public modal: NgbActiveModal,
    public _userService: UserService,
    private _seguridadService: SeguridadService,
    private _reporteExternoService: ReporteExternoService,
    public _toastr: ToastrService,
    private _loadingBar: LoadingBarService,
    public  _appAgGridService: AppAgGridService,
  ) { }

  ngOnInit(): void {
    this.tilte = 'Asignacion de usuarios para: ' + this.registro_selected.nombre
    this.usuarioLogeado = this._seguridadService.user;
    this.listUsersPendientexSeleccionar(this.registro_selected.id);
    this.listUsersSelected(this.registro_selected.id);
    this.initializeGrid();
    this.initializeGrid2();
  }

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

  public LoadingState(indicador: boolean) {
    if (indicador === true) {
      this.isLoading = true;
      this._loadingBar.start();
    } else {
      this.isLoading = false;
      this._loadingBar.complete();
    }
  }

  //AG-GRID 1 
  initializeGrid(): void {
    this.columnDefs = [
      {
        headerName: 'Avatar',
        field: 'avatar',
        minWidth: 80,
        maxWidth: 120,
        cellStyle: { textAlign: 'center' },
        cellRenderer: (params: any) => {
          if (params.value === null || params.value === undefined || params.value === '') {
            return '';
          }
          const imageUrl = this._userService.getUserImage(params.data.id, true);
          return `
            <img src="${imageUrl}" 
                alt="avatar" 
                style="width: 30px; height: 30px; border-radius: 50%;"
                onerror="this.onerror=null; this.src='/assets/img/user/default.png'"
            />
          `;
        }
      },
      {
        headerName: 'Id',
        field: 'id',
        cellStyle: { textAlign: 'center'},
        minWidth: 70,
        maxWidth: 70,          
      },
      {
        headerName: 'Usuario',
        field: 'login_user',
        cellStyle: { textAlign: 'left' },
        minWidth: 80,
        maxWidth: 1500,          
      },
      {
        headerName: 'Perfil',
        field: 'profile.name',
        cellStyle: { textAlign: 'left' },
        minWidth: 100,
        maxWidth: 1500,          
      },
      {
        headerName: 'Apellidos',
        field: 'surname',
        cellStyle: { textAlign: 'left' },
        minWidth: 150,
        maxWidth: 1500,          
      },
      {
        headerName: 'Nombre',
        field: 'name',
        cellStyle: { textAlign: 'left' },
        minWidth: 150,
        maxWidth: 1500,          
      },
      {
        headerName: 'Email',
        field: 'email',
        cellStyle: { textAlign: 'left' },
        minWidth: 200,
        maxWidth: 1500,          
      },
      {
        headerName: 'Telefono',
        field: 'phone',
        cellStyle: { textAlign: 'left' },
        minWidth: 100,
        maxWidth: 1500,          
      },
      {
        headerName: 'Tipo Usuario',
        field: 'type_user',
        cellStyle: { textAlign: 'center' },
        minWidth: 150,
        maxWidth: 1500,
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
        headerName: 'Ultimo Inicio de Sesion',
        field: 'user_verified_at',
        cellStyle: { textAlign: 'center' },
        minWidth: 180,
        maxWidth: 180,
      },
    ];     
  } 
  onGridReady(params: GridReadyEvent): void {
    this.gridApi = params.api;        
  }
  onCellClicked(e: CellClickedEvent): void {
    this.usuario_obj2 = null;
    this.usuario_obj1 = e.data;
  }
  onFilterTextBoxChanged() {
    this.gridApi.setQuickFilter((document.getElementById('filter-text-box-listaUsuariosTabla1') as HTMLInputElement).value);
  }
  clearAllFilters() {
    if (this.gridApi) {
      this.gridApi.setFilterModel(null);
      const quickFilterInput1 = document.getElementById('filter-text-box-listaUsuariosTabla1') as HTMLInputElement;
      if (quickFilterInput1) {
        quickFilterInput1.value = '';
      }
      this.onFilterTextBoxChanged();
      this.gridApi.onFilterChanged();
    }
  }
  clearSelection(): void {
    this._appAgGridService.limpiarSeleccion(this.gridApi);
  }


  //AG-GRID 2
  initializeGrid2(): void {
    this.columnDefs2 = [
      {
        headerName: 'Avatar',
        field: 'avatar',
        minWidth: 90,
        maxWidth: 120,
        cellStyle: { textAlign: 'center' },
        cellRenderer: (params: any) => {
          if (params.value === null || params.value === undefined || params.value === '') {
            return '';
          }
          const imageUrl = this._userService.getUserImage(params.data.id, true);
          return `
            <img src="${imageUrl}" 
                alt="avatar" 
                style="width: 30px; height: 30px; border-radius: 50%;"
                onerror="this.onerror=null; this.src='/assets/img/user/default.png'"
            />
          `;
        }
      },
      {
        headerName: 'Id',
        field: 'id',
        cellStyle: { textAlign: 'center'},
        minWidth: 70,
        maxWidth: 70,          
      },
      {
        headerName: 'Usuario',
        field: 'login_user',
        cellStyle: { textAlign: 'left' },
        minWidth: 100,
        maxWidth: 1500,          
      },
      {
        headerName: 'Perfil',
        field: 'profile.name',
        cellStyle: { textAlign: 'left' },
        minWidth: 150,
        maxWidth: 1500,          
      },

      {
        headerName: 'Apellidos',
        field: 'surname',
        cellStyle: { textAlign: 'left' },
        minWidth: 150,
        maxWidth: 1500,          
      },
      {
        headerName: 'Nombre',
        field: 'name',
        cellStyle: { textAlign: 'left' },
        minWidth: 150,
        maxWidth: 1500,          
      },
      {
        headerName: 'Email',
        field: 'email',
        cellStyle: { textAlign: 'left' },
        minWidth: 200,
        maxWidth: 1500,          
      },
      {
        headerName: 'Telefono',
        field: 'phone',
        cellStyle: { textAlign: 'left' },
        minWidth: 100,
        maxWidth: 1500,          
      },
      {
        headerName: 'Tipo Usuario',
        field: 'type_user',
        cellStyle: { textAlign: 'center' },
        minWidth: 150,
        maxWidth: 1500,
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
        headerName: 'Ultimo Inicio de Sesion',
        field: 'user_verified_at',
        cellStyle: { textAlign: 'center' },
        minWidth: 180,
        maxWidth: 180,
      },
    ];     
  } 
  onGridReady2(params: GridReadyEvent) {
    this.gridApi2 = params.api;
  }
  onFilterTextBoxChanged2() {
    this.gridApi2.setQuickFilter(
      (document.getElementById("filter-text-box-listaUsuariosTabla2") as HTMLInputElement).value
    );
  }
  onCellClicked2(e: CellClickedEvent): void {
    this.usuario_obj1 = null;
    this.usuario_obj2 = e.data;
  }
  clearAllFilters2() {
    if (this.gridApi2) {
      this.gridApi2.setFilterModel(null);
      const quickFilterInput2 = document.getElementById('filter-text-box-listaUsuariosTabla2') as HTMLInputElement;
      if (quickFilterInput2) {
        quickFilterInput2.value = '';
      }
      this.onFilterTextBoxChanged2();
      this.gridApi.onFilterChanged();
    }
  }
  clearSelection2(): void {
    this._appAgGridService.limpiarSeleccion(this.gridApi2);
  }


  //BOTONES DE TRANSFERENCIAS
  transferSelectedToRight(): void {
    const selectedNodes = this.gridApi.getSelectedNodes();
    if (selectedNodes.length === 0) {
      this._toastr.warning('Por favor seleccione al menos un usuario', '', {
        timeOut: 3000,
        closeButton: true
      });
      return;
    }

    const selectedData = selectedNodes.map(node => node.data);
    this.transferUsers(selectedData, this.listaUsuariosTabla1, this.listaUsuariosTabla2);
  }
  transferAllToRight(): void {
    const visibleNodes = this.gridApi.getRenderedNodes();
    if (visibleNodes.length === 0) {
      this._toastr.warning('No hay usuarios visibles para transferir', '', {
        timeOut: 3000,
        closeButton: true
      });
      return;
    }

    const visibleData = visibleNodes.map(node => node.data);
    this.transferUsers(visibleData, this.listaUsuariosTabla1, this.listaUsuariosTabla2);
  }
  transferSelectedToLeft(): void {
    const selectedNodes = this.gridApi2.getSelectedNodes();
    if (selectedNodes.length === 0) {
      this._toastr.warning('Por favor seleccione al menos un usuario', '', {
        timeOut: 3000,
        closeButton: true
      });
      return;
    }

    const selectedData = selectedNodes.map(node => node.data);
    this.transferUsers(selectedData, this.listaUsuariosTabla2, this.listaUsuariosTabla1, true);
  }
  transferAllToLeft(): void {
    const visibleNodes = this.gridApi2.getRenderedNodes();
    if (visibleNodes.length === 0) {
      this._toastr.warning('No hay usuarios visibles para transferir', '', {
        timeOut: 3000,
        closeButton: true
      });
      return;
    }

    const visibleData = visibleNodes.map(node => node.data);
    this.transferUsers(visibleData, this.listaUsuariosTabla2, this.listaUsuariosTabla1, true);
  }
  private transferUsers(
      usersToTransfer: any[],
      sourceList: any[],
      targetList: any[],
      isRemoving: boolean = false
  ): void {
      const transferredUsers = [];
      
      for (const user of usersToTransfer) {
          const userExists = targetList.some(u => u.id === user.id);
          
          if (!userExists) {
              // Agregar a la lista destino
              targetList.push({
                  ...user,
                  id_form_usu: user.id_form_usu || null
              });
              transferredUsers.push(user);
              
              // Eliminar de la lista origen (solo si estamos transfiriendo de grid1 a grid2)
              if (!isRemoving) {
                  const index = sourceList.findIndex(u => u.id === user.id);
                  if (index !== -1) {
                      sourceList.splice(index, 1);
                  }
              }
          }
          
          if (isRemoving) {
              // Esto es para cuando transferimos de grid2 a grid1
              const index = sourceList.findIndex(u => u.id === user.id);
              if (index !== -1) {
                  sourceList.splice(index, 1);
                  
                  if (user.id_form_usu) {
                      this.listaUsuariosEliminados.push({
                          id: user.id_form_usu,
                          reporte_link_id: this.registro_selected.id,
                          user_id: user.id
                      });
                  }
              }
          }
      }
      
      // Actualizar contadores
      this.countUsuarios = this.listaUsuariosTabla1.length;
      this.countUsuariosSeleccionados = this.listaUsuariosTabla2.length;
      
      // Forzar actualización de las vistas
      this.listaUsuariosTabla1 = [...this.listaUsuariosTabla1];
      this.listaUsuariosTabla2 = [...this.listaUsuariosTabla2];
      
      // Limpiar selecciones
      if (this.gridApi) {
          this.gridApi.deselectAll();
      }
      if (this.gridApi2) {
          this.gridApi2.deselectAll();
      }
      
      // Mostrar notificación si no se transfirieron todos los seleccionados
      if (transferredUsers.length < usersToTransfer.length) {
          const skipped = usersToTransfer.length - transferredUsers.length;
          this._toastr.info(`${transferredUsers.length} usuarios transferidos, ${skipped} ya existían`, '', {
              timeOut: 3000,
              closeButton: true
          });
      }
  }


  //LISTAS DE USUARIOS
  async listUsersPendientexSeleccionar(id_reporte:number) {
    try {
      this.LoadingState(true); 
      let res: any = await firstValueFrom(this._reporteExternoService.listUsersReportesExternosPendientexSeleccionar(id_reporte));
      if (res?.status === 'success') {
        this.LoadingState(false);
        this.listaUsuariosTabla1 = res.data;
        this.countUsuarios = res.data.length;
        //console.log('listUsuariosActivos', res.data)
      } else {
        this.LoadingState(false);
        console.error('response -> Error: Respuesta sin status success', res);
      }
    } catch (error: any) {
      this.LoadingState(false); 
      console.error('response -> Error en la petición', error);
    }
  }
  async listUsersSelected(id_reporte:number) {
    try {
      this.LoadingState(true); 
      let res: any = await firstValueFrom(this._reporteExternoService.listUsersReportesExternosSelected(id_reporte));
      if (res?.status === 'success') {
        this.LoadingState(false);
        this.listaUsuariosTabla2 = res.data;
        this.countUsuariosSeleccionados = res.data.length;
        //console.log('listUsersSelected', res.data)
      } else {
        this.LoadingState(false);
        console.error('response -> Error: Respuesta sin status success', res);
      }
    } catch (error: any) {
      this.LoadingState(false); 
      console.error('response -> Error en la petición', error);
    }
  }


  //GRABAR USUARIOS EN REPORTE
  async saveUsersReportesExternos() {
    try {      
      this.LoadingState(true); 

      let dataArray = [];
      this.listaUsuariosTabla2.forEach((usuario) => {
        dataArray.push({
          reporteexterno_id: this.registro_selected.id,
          users_id: usuario.id,
        });
      });
      const data = {
        usuariosNuevos: dataArray,
      };


    if (!this.listaUsuariosTabla2 || this.listaUsuariosTabla2.length === 0) {
        dataArray.push({
          reporteexterno_id: this.registro_selected.id,
          users_id: null,
        });
    }


      //console.log('data',data)

      let res: any = await firstValueFrom(this._reporteExternoService.saveUsersReportesExternos(data));
      if (res?.status === 'success') {

        this._toastr.success(res.status, res.message,{ closeButton: true });
        this.LoadingState(false);
        this.modal.close();

        //console.log('listUsersSelected', res.data)
      } else {
        this.LoadingState(false);
        console.error('response -> Error: Respuesta sin status success', res);
      }
    } catch (error: any) {
      this.LoadingState(false); 
      console.error('response -> Error en la petición', error);
    }


  }
}