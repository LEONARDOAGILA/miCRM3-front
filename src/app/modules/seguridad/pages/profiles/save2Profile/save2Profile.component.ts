import { Component, EventEmitter, HostListener, Input, OnInit, Output, ViewChild } from '@angular/core';
import { firstValueFrom, } from 'rxjs';
import { FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { AgGridAngular } from 'ag-grid-angular';
import { CellClickedEvent, GridApi,  GridReadyEvent } from 'ag-grid-community';



import { AppAgGridService } from '../../../../../service/app-agGrid.service';
import { ProfileService } from "../../../services/profile.service";
import { MenuService } from "../../../services/menu.service";
import { SeguridadService } from '../../../services/seguridad.service';
import { LoadingService } from '../../../../../service/loading.service';


import { PerfilModel } from "../../../interfaces/perfilModel";
import { MenuModel } from "../../../interfaces/menuModel";
import { AccesoModel } from "../../../../seguridad/interfaces/accesoModel";



@Component({
  selector: 'app-save2Profile',
  templateUrl: './save2Profile.component.html',
  styleUrls: ['./save2Profile.component.css'],
  standalone: false,
})
export class Save2ProfileComponent implements OnInit  {
  
  @Input() registro_selected: any = {};
  @Input() accion: any = {};
  @Output() registrosE: EventEmitter<any> = new EventEmitter();

  @ViewChild(AgGridAngular) agGrid!: AgGridAngular;
  public gridApi!: GridApi;
  public columnDefs: any[] = [];

  @HostListener('window:resize', ['$event'])
  onResize(event: Event): void { this._appAgGridService.ajustarTamanoGrid(this.gridApi); }
  private resizeTimeoutId: any; // Almacena el ID del timeout 


  
  
  public title: string;
  public profile: PerfilModel;
  public textoClon: string;
  public response: any;
  
  public isLoading$ = this._loadingService.isLoading$;
  public isdisabled: boolean;
  
  public form: FormGroup;
  public menuModel: MenuModel[] = [];
  public menus: MenuModel[] = [];
  
  /** Nº de menús listados en el grid */
  public get totalMenus(): number {
    return this.profile?.acceso?.length || 0;
  }

  /** Nº de menús con acceso (ejecutar) habilitado */
  public get totalMenusActivos(): number {
    return (this.profile?.acceso || []).filter((a: any) => a.ejecutar).length;
  }

  /**
   * Casilla de permiso para el grid. El clic lo gestiona onCellClicked,
   * por eso el input no es interactivo (pointer-events: none en el CSS).
   */
  private checkboxCellRenderer(params: any): string {
    const soloLectura = params.context?.componentParent?.isdisabled ? 'disabled' : '';
    const marcado = params.value === true ? 'checked' : '';
    return `<div class="permiso-check">
              <input class="form-check-input" type="checkbox" ${marcado} ${soloLectura} />
            </div>`;
  }


  constructor(
      private fb: FormBuilder,
      public  modal: NgbActiveModal,
      private _profileService: ProfileService,
      private _menuService: MenuService,
      private _seguridadService: SeguridadService,       
      private _toastr: ToastrService,
      public  _appAgGridService: AppAgGridService,
      private _loadingService: LoadingService,

  ){      
      this.isdisabled = false;
      this.textoClon = "";
  }


  async ngOnInit() {


    if (this._seguridadService.isexpired()) {
      this.modal.close();
      return;
    }

    this.profile = { id: 0, nombre: '', inactividad: 0, activo: true, acceso: [] }; // valor por defecto para todos los casos

    switch (this.accion) {
      case 'add':
        this.title = "Nuevo Perfil";
        this.initializeForm();
        break;
  
      case 'edit':
        this.title = "Modificar Perfil";
        this.initializeForm();
        await this.findByIdProfileAccess(this.registro_selected.id);
        break;
  
      case 'clon':
        this.title = "Clonar Perfil";
        this.textoClon = '_CLON';
        this.initializeForm();
        await this.findByIdProfileAccess(this.registro_selected.id);
        break;
  
      case 'view':
        this.title = "Ver Perfil";
        this.isdisabled = true;
        this.initializeForm();
        await this.findByIdProfileAccess(this.registro_selected.id);
        break;
    }
        
    await this.allMenus(); 
    this.initializeGrid();
    this.ajustarTamanoGrid();
  }
  

    initializeForm():void{
      this.form = this.fb.group({
        id: [ this.registro_selected.id?.id || 0 ],
        nombre: [{ value: '', disabled: this.isdisabled }, Validators.compose([Validators.required, Validators.maxLength(100)])],
        inactividad: [{ value: 0, disabled: this.isdisabled }, [Validators.required, Validators.maxLength(3)]],
        activo: [{ value: true, disabled: this.isdisabled }]
      });
    }
    
    initializeGrid(): void {  
      this.columnDefs = [

        {
          headerName: 'Id',
          field: 'menu.id',
          cellStyle: { textAlign: 'left'},
          minWidth: 70,
          maxWidth: 70,
          sortable: false,                  
        },

        {
          headerName: 'Nombre',
          field: 'menu.nombre',
          cellStyle: { textAlign: 'left' },
          cellRenderer: (params) => {
            // El color por nivel se aplica con clases (.nivel-N) para que
            // siga el tema; antes eran colores fijos y además se leía
            // 'menu.level', que no existe en el modelo (es 'menu.nivel').
            const nivel = params.data?.menu?.nivel || 0;
            const sangria = nivel * 14;
            const flecha = nivel > 0
              ? '<i class="bi bi-arrow-return-right menu-flecha"></i>'
              : '';
            return `<span class="menu-nombre nivel-${nivel}" style="padding-left:${sangria}px">${flecha}${params.value ?? ''}</span>`;
          },
          minWidth: 250,
          maxWidth: 600,
          sortable: false,
          filter: true,
        },

        {
          headerName: 'Descripcion',
          field: 'menu.descripcion',
          cellStyle: { textAlign: 'left' },
          minWidth: 150,
          maxWidth: 1200,
          sortable: false,
          hide: true,
        },
  

        {
          headerName: 'Ejecutar',
          field: 'ejecutar',
          cellStyle: { textAlign: 'center' },
          minWidth: 95,
          maxWidth: 95,
          cellRenderer: (params: any) => this.checkboxCellRenderer(params)
        },
        

        {
          headerName: 'Listar',
          field: 'listar',
          cellStyle: { textAlign: 'center' },
          minWidth: 95,
          maxWidth: 95,
          cellRenderer: (params: any) => this.checkboxCellRenderer(params)
        },
        {
          headerName: 'Ver',
          field: 'ver',
          cellStyle: { textAlign: 'center' },
          minWidth: 95,
          maxWidth: 95,
          cellRenderer: (params: any) => this.checkboxCellRenderer(params)
        },

        {
          headerName: 'Crear',
          field: 'crear',
          cellStyle: { textAlign: 'center' },
          minWidth: 95,
          maxWidth: 95,
          cellRenderer: (params: any) => this.checkboxCellRenderer(params)
        },

        {
          headerName: 'Modificar',
          field: 'editar',
          cellStyle: { textAlign: 'center' },
          minWidth: 100,
          maxWidth: 100,
          cellRenderer: (params: any) => this.checkboxCellRenderer(params)
        },

        {
          headerName: 'Eliminar',
          field: 'eliminar',
          cellStyle: { textAlign: 'center' },
          minWidth: 95,
          maxWidth: 95,
          cellRenderer: (params: any) => this.checkboxCellRenderer(params)
        },

        {
          headerName: 'Imprimir',
          field: 'reporte',
          cellStyle: { textAlign: 'center' },
          minWidth: 95,
          maxWidth: 95,
          cellRenderer: (params: any) => this.checkboxCellRenderer(params)
        },

        {
          headerName: 'Auditoria',
          field: 'auditar',
          cellStyle: { textAlign: 'center' },
          minWidth: 95,
          maxWidth: 95,
          cellRenderer: (params: any) => this.checkboxCellRenderer(params)
        },       
        
        {
          headerName: 'path',
          field: 'menu.path',
          minWidth: 10,
          maxWidth: 10,          
          sortable: false,
          hide: true,
        },
        
    // Columna de Acciones (botón a la derecha)
    {
      headerName: 'Acciones',
      cellStyle: { textAlign: 'center' },
      minWidth: 120,
      maxWidth: 120,
      // El HTML del cellRenderer es una cadena, no una plantilla de Angular:
      // el clic se gestiona en onCellClicked, más abajo.
      cellRenderer: (params: any) => {
        const soloLectura = params.context?.componentParent?.isdisabled ? 'disabled' : '';
        return `<button type="button" class="btn-mas-permisos" ${soloLectura} title="Más permisos">
                  <i class="bi bi-gear"></i> Más permisos
                </button>`;
      },
      onCellClicked: (event: CellClickedEvent) => {
        if (!this.isdisabled) {
          this.onActionButtonClick(event.data);
        }
      }
    },

        
      ];
    }

    onActionButtonClick(rowData: any): void {
      console.log('Botón clickeado en la fila:', rowData);
      // Ejemplo: Abrir un modal o ejecutar una acción
      this._toastr.info(`Acción ejecutada para: ${rowData.menu.nombre} de id: ${rowData.menu.id}`);
    }

    onGridReady(params: GridReadyEvent): void {
      this.gridApi = params.api;
      this._appAgGridService.ajustarTamanoGrid(this.gridApi); // Usa el método del servicio
    }
    
    ajustarTamanoGrid(){
      if (this.gridApi) {      
        if (this.resizeTimeoutId) { clearTimeout(this.resizeTimeoutId); }    // Cancela el timeout anterior si existe    
          this.resizeTimeoutId = setTimeout(() => {  this._appAgGridService.ajustarTamanoGrid(this.gridApi); }, 100); // Esperar 100ms para asegurar que el DOM se haya actualizado
        }
    }

  
    onFilterTextBoxChanged() {
      if (this.gridApi && this.gridApi.setQuickFilter) {
        const filterText = (document.getElementById('filter-text-box22') as HTMLInputElement).value;
        this.gridApi.setQuickFilter(filterText);
      }    
    }
    
    
  public async allMenus() {
    try {
      this._loadingService.setLoading(true);    
      let res: any = await firstValueFrom(this._menuService.allMenus());
      
      if (res?.status === 'success') {
        this.menuModel = res.data;           
        this.form.addControl('acceso', this.fb.array([]));
        
        // Crear estructura base para el grid con todos los menús
        const allMenusWithAccess = this.menuModel.map(menu => {
          // Buscar si este menú ya tiene acceso definido en el perfil
          const existingAccess = this.profile?.acceso?.find(a => a.menu_id === menu.id);
          
          return {
            id: existingAccess?.id || null,
            perfil_id: this.profile?.id || null,
            menu_id: menu.id,
            parent: menu.padre_id,
            menu: menu, // Menú completo para el grid
            listar: existingAccess?.listar || false,
            ver: existingAccess?.ver || false,
            crear: existingAccess?.crear || false,
            editar: existingAccess?.editar || false,
            eliminar: existingAccess?.eliminar || false,
            reporte: existingAccess?.reporte || false,
            ejecutar: existingAccess?.ejecutar || false,
            auditar: existingAccess?.auditar || false
          };
        });
  
        // Actualizar el profile.acceso con la estructura completa
        this.profile.acceso = allMenusWithAccess;
        //console.log('this.profile.acceso:', this.profile.acceso);
        
        // Crear controles para cada menú
        this.menuModel.forEach((menu) => this.createControlAccess(menu));
        
        // Aplicar valores si existen
        if (this.profile?.acceso?.length) {  
          this.profile.acceso.forEach((acceso) => this.patchValueAccess(acceso));  
        }
      } else {
        console.error('Error: Respuesta sin status success', res);
      }
      this._loadingService.setLoading(false);
      
    } catch (error: any) {
      console.error('Error en la petición', error);
      this.modal.close(); 
      this._loadingService.setLoading(false);
    }
  }
  

  
     private async findByIdProfileAccess(id: number) {
      this._loadingService.setLoading(true);
      try {
        let res: any = await firstValueFrom(this._profileService.findByIdProfileAccess(id));
        if (res?.status === 'success') {
          this.profile = res.data;
          this.profile.nombre = this.profile.nombre + this.textoClon;          
          this.profile.acceso = this.profile.acceso || [];  // Asegurarnos que access existe aunque esté vacío
          this.form.patchValue(this.profile);
          this._appAgGridService.ajustarTamanoGrid(this.gridApi);
        } else {
          console.error('Error: Respuesta sin status success', res);
        }
        this._loadingService.setLoading(false);
      } catch (error: any) {
        console.error('Error en la petición', error);
        this.modal.close();         
        this._loadingService.setLoading(false);
      }
    }

  

 onCellClicked(e: CellClickedEvent): void {
  if (!this.isdisabled) {
    const field = e.column.getColId();
    const allowedFields = ['ejecutar', 'listar', 'ver', 'crear', 'editar', 'eliminar', 'reporte', 'auditar'];
    if (allowedFields.includes(field)) {
      const rowData = e.data;
      rowData[field] = !rowData[field];
      // Actualizar FormArray
      const accessControl = this.acceso.controls.find(control => control.value.menu_id === rowData.menu.id);
      if (accessControl) {
        accessControl.patchValue({ [field]: rowData[field] });
      }
      if (field === 'ejecutar') {
        this.updateChildren(rowData.menu.id, field, rowData[field]);
        this.updateParentState(rowData.menu.padre_id, field);
      }
      // 🔥 Forzar refresco de la celda clickeada
      this.gridApi.refreshCells({ force: true, columns: [field] });
    }
  }
}

    // Actualiza hijos recursivamente
    updateChildren(parentId: number, field: string, newValue: boolean) {
        this.profile.acceso.forEach(item => {
            if (item.menu.padre_id === parentId) {
                item[field] = newValue; // Fuerza el mismo valor en los hijos
                this.updateChildren(item.menu.id, field, newValue); // Recursión
            }
        });
    }
    
    // Actualiza padres verificando el estado de TODOS los hijos
    updateParentState(parentId: number, field: string) {
        if (!parentId) return; // Fin de la recursión (no hay más padres)
        
        const parent = this.profile.acceso.find(item => item.menu.id === parentId);
        if (!parent) return;
        
        // Obtiene TODOS los hijos directos
        const children = this.profile.acceso.filter(item => item.menu.padre_id === parentId);
        
        // Determina el nuevo estado del padre:
        // - true si TODOS los hijos están marcados.
        // - false si AL MENOS UN hijo está desmarcado.
        const allChildrenChecked = children.length > 0 && children.some(child => child[field]);
        parent[field] = allChildrenChecked;
        
        // Propaga el cambio hacia arriba (abuelos, bisabuelos, etc.)
        this.updateParentState(parent.menu.padre_id, field);
    }





    public get acceso() {
        return this.form.get('acceso') as FormArray;
    }

    private patchValueAccess(acceso: AccesoModel) {
        this.acceso.controls.forEach((control) => { 
            if (control.value.menu_id === acceso.menu_id) { 
                control.patchValue(acceso); 
            } 
        });
    }


    private createControlAccess(menu: MenuModel) {
        let control = this.fb.group({
            id: [null],
            perfil_id: [this.profile?.id || null],
            menu_id: [menu.id],
            padre_id: [menu.padre_id],
            listar: [{value: false, disabled: this.isdisabled}],
            ver: [{value: false, disabled: this.isdisabled}],
            crear: [{value: false, disabled: this.isdisabled}],
            editar: [{value: false, disabled: this.isdisabled}],
            eliminar: [{value: false, disabled: this.isdisabled}],
            reporte: [{value: false, disabled: this.isdisabled}],
            ejecutar: [{value: false, disabled: this.isdisabled}],
            auditar: [{value: false, disabled: this.isdisabled}],
        });
        this.acceso.push(control);
    }





    private async saveRecord(data: PerfilModel) {      
        try {
          this._loadingService.setLoading(true);
            this.isdisabled = true;
            if (this.accion === 'add') {  this.response = await firstValueFrom(this._profileService.addProfile(data));  }
            else{
                let formData = new FormData();
                formData.append('json', JSON.stringify(data));
                if (this.accion === 'edit'){  
                  this.response = await firstValueFrom(this._profileService.editProfile(this.registro_selected.id, formData));  
                  //console.log('Respuesta de edición:', this.response);
                }
                if (this.accion === 'clon'){  this.response = await firstValueFrom(this._profileService.clonProfile(formData));  }
            }
            this.registrosE.emit(this.response.data);
            this._toastr.success(this.response.status, this.response.message,{ closeButton: true });
            this._loadingService.setLoading(false);
            this.modal.close();
        } catch (error: any) {
            this.isdisabled = false;
            this._loadingService.setLoading(false);
        }
    }

    private updateFormAccessFromGrid(): void {
      if (!this.gridApi) return;
  
      // Obtener todos los datos actuales del grid
      const rowData: any[] = [];
      this.gridApi.forEachNode(node => rowData.push(node.data));
      
      // Actualizar cada control en el FormArray 'access'
      this.acceso.controls.forEach(control => {
          const menuId = control.value.menu_id;
          const currentRow = rowData.find(row => row.menu.id === menuId);
          
          if (currentRow) {
              control.patchValue({
                  listar: currentRow.listar,
                  ver: currentRow.ver,
                  crear: currentRow.crear,
                  editar: currentRow.editar,
                  eliminar: currentRow.eliminar,
                  reporte: currentRow.reporte,
                  ejecutar: currentRow.ejecutar,
                  auditar: currentRow.auditar
              }, { emitEvent: false });
          }
      });
  }


    public async onSubmitForm($event: any) {
        (<any>Object).values(this.form.controls).forEach((control: any) => { control.markAsTouched(); });
        if (this.form.valid) {
            this.updateFormAccessFromGrid();
            let data = this.form.value;
            this.saveRecord(data);        
        }else{
            this._toastr.error(`Revise los campos del formulario.`, `No se puede Guardar`, {timeOut: 20000,closeButton: true,});
        }
    }





}
