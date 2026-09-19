import { Component, ElementRef, EventEmitter, HostListener, Input, OnInit, Output, ViewChild } from '@angular/core';
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

  // ================================================================
  // MARCAR / DESMARCAR EN BLOQUE
  // Tres atajos para no ir casilla por casilla:
  //   - casilla en la CABECERA de cada columna: toda la columna (de las
  //     filas visibles, si hay filtro);
  //   - columna «Todos» al inicio: todos los permisos de esa fila;
  //   - botones Marcar todo / Desmarcar todo: toda la grilla visible.
  // El estado de las casillas de cabecera (marcada / a medias) se pinta a
  // mano en el DOM porque la cabecera es una plantilla HTML de ag-Grid.
  // ================================================================

  /** Campos de permiso, en el orden de las columnas. */
  readonly camposPermiso = ['ejecutar', 'listar', 'ver', 'crear', 'editar', 'eliminar', 'reporte', 'auditar', 'papelera'];

  /** Casilla de la fila «Todos»: marcada si tiene todos los permisos; a medias si tiene alguno. */
  private checkboxTodosRenderer(params: any): string {
    const soloLectura = params.context?.componentParent?.isdisabled ? 'disabled' : '';
    const n = this.camposPermiso.filter(c => params.data?.[c] === true).length;
    const marcado = n === this.camposPermiso.length ? 'checked' : '';
    const medias = n > 0 && n < this.camposPermiso.length ? 'data-medias="1"' : '';
    return `<div class="permiso-check permiso-check--todos" title="Marcar / desmarcar todos los permisos de este menú">
              <input class="form-check-input" type="checkbox" ${marcado} ${medias} ${soloLectura} />
            </div>`;
  }

  /** Cabecera con casilla (toda la columna) + el título. */
  private cabeceraConCasilla(field: string): any {
    return {
      template: `
        <div class="ag-cell-label-container" role="presentation">
          <div ref="eLabel" class="ag-header-cell-label cabecera-permiso" role="presentation">
            <input type="checkbox" class="form-check-input col-check" data-col="${field}" title="Marcar / desmarcar toda la columna">
            <span ref="eText" class="ag-header-cell-text"></span>
          </div>
        </div>`
    };
  }

  /** Filas sobre las que actúan los atajos: las visibles (respeta el filtro). */
  private filasVisibles(): any[] {
    const filas: any[] = [];
    this.gridApi?.forEachNodeAfterFilter(n => { if (n.data) { filas.push(n.data); } });
    return filas.length ? filas : (this.profile?.acceso ?? []);
  }

  /** Pone un permiso en una fila y lo refleja en el FormArray (sin propagar). */
  private ponerPermiso(fila: any, field: string, valor: boolean): void {
    fila[field] = valor;
    const control = this.acceso.controls.find(c => c.value.menu_id === fila.menu.id);
    control?.patchValue({ [field]: valor }, { emitEvent: false });
  }

  /** Toda la columna `field` (filas visibles) a `valor`. */
  marcarColumna(field: string, valor: boolean): void {
    if (this.isdisabled) { return; }
    this.filasVisibles().forEach(f => this.ponerPermiso(f, field, valor));
    this.refrescarPermisos();
  }

  /** Todos los permisos de una fila a `valor`. */
  marcarFila(fila: any, valor: boolean): void {
    if (this.isdisabled) { return; }
    this.camposPermiso.forEach(c => this.ponerPermiso(fila, c, valor));
    this.refrescarPermisos();
  }

  /** Toda la grilla visible a `valor` (botones Marcar todo / Desmarcar todo). */
  marcarTodo(valor: boolean): void {
    if (this.isdisabled) { return; }
    const filas = this.filasVisibles();
    filas.forEach(f => this.camposPermiso.forEach(c => this.ponerPermiso(f, c, valor)));
    this.refrescarPermisos();
    this._toastr.info(`${valor ? 'Marcados' : 'Desmarcados'} todos los permisos de ${filas.length} menú(s)${this.filtroActivo ? ' (los filtrados)' : ''}`, 'Permisos', { timeOut: 2500 });
  }

  get filtroActivo(): boolean {
    return !!(document.getElementById('filter-text-box22') as HTMLInputElement | null)?.value;
  }

  /** Repinta casillas y cabeceras tras un cambio en bloque. */
  private refrescarPermisos(): void {
    this.gridApi?.refreshCells({ force: true, columns: [...this.camposPermiso, 'todos'] });
    this.actualizarCabeceras();
  }

  /** Casillas de cabecera: marcada si toda la columna visible lo está; a medias si sólo parte. */
  actualizarCabeceras(): void {
    const filas = this.filasVisibles();
    this.host.nativeElement.querySelectorAll<HTMLInputElement>('input.col-check').forEach(input => {
      const field = input.dataset['col']!;
      const tiene = (f: any) => field === 'todos' ? this.camposPermiso.every(c => f[c] === true) : f[field] === true;
      const n = filas.filter(tiene).length;
      input.checked = filas.length > 0 && n === filas.length;
      input.indeterminate = n > 0 && n < filas.length;
      input.disabled = this.isdisabled;
    });
  }

  /** Clic en una casilla de cabecera (se mira el target: la cabecera es HTML de ag-Grid). */
  onHeaderClicked(ev: MouseEvent): void {
    const input = (ev.target as HTMLElement).closest('input.col-check') as HTMLInputElement | null;
    if (!input) { return; }
    ev.stopPropagation();
    const field = input.dataset['col']!;
    // Con la columna a medias, el primer clic marca todo
    const filas = this.filasVisibles();
    if (field === 'todos') {
      const todas = filas.length > 0 && filas.every(f => this.camposPermiso.every(c => f[c] === true));
      this.marcarTodo(!todas);
      return;
    }
    const todas = filas.length > 0 && filas.every(f => f[field] === true);
    this.marcarColumna(field, !todas);
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
      private host: ElementRef<HTMLElement>,
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
          headerName: 'Todos',
          field: 'todos',
          headerTooltip: 'Marcar / desmarcar todos los permisos del menú',
          cellStyle: { textAlign: 'center' },
          minWidth: 80,
          maxWidth: 80,
          sortable: false,
          suppressMenu: true,
          cellRenderer: (params: any) => this.checkboxTodosRenderer(params),
          headerComponentParams: this.cabeceraConCasilla('todos'),
        },

        {
          headerName: 'Ejecutar',
          field: 'ejecutar',
          cellStyle: { textAlign: 'center' },
          minWidth: 95,
          maxWidth: 95,
          sortable: false,
          suppressMenu: true,
          cellRenderer: (params: any) => this.checkboxCellRenderer(params),
          headerComponentParams: this.cabeceraConCasilla('ejecutar'),
        },
        

        ...[
          ['listar', 'Listar', 95], ['ver', 'Ver', 95], ['crear', 'Crear', 95], ['editar', 'Modificar', 105],
          ['eliminar', 'Eliminar', 95], ['reporte', 'Imprimir', 95], ['auditar', 'Auditoria', 105], ['papelera', 'Papelera', 105],
        ].map(([field, headerName, ancho]) => ({
          headerName, field,
          headerTooltip: field === 'papelera' ? 'Puede abrir la papelera de reciclaje del componente (restaurar / borrar definitivamente)' : undefined,
          cellStyle: { textAlign: 'center' },
          minWidth: ancho,
          maxWidth: ancho,
          sortable: false,
          suppressMenu: true,
          cellRenderer: (params: any) => this.checkboxCellRenderer(params),
          headerComponentParams: this.cabeceraConCasilla(field as string),
        })),
        
        {
          headerName: 'path',
          field: 'menu.path',
          minWidth: 10,
          maxWidth: 10,          
          sortable: false,
          hide: true,
        },
        
    // Columna de Acciones (botón a la derecha)
    // {
    //   headerName: 'Acciones',
    //   cellStyle: { textAlign: 'center' },
    //   minWidth: 120,
    //   maxWidth: 120,
    //   // El HTML del cellRenderer es una cadena, no una plantilla de Angular:
    //   // el clic se gestiona en onCellClicked, más abajo.
    //   cellRenderer: (params: any) => {
    //     const soloLectura = params.context?.componentParent?.isdisabled ? 'disabled' : '';
    //     return `<button type="button" class="btn-mas-permisos" ${soloLectura} title="Más permisos">
    //               <i class="bi bi-gear"></i> Más permisos
    //             </button>`;
    //   },
    //   onCellClicked: (event: CellClickedEvent) => {
    //     if (!this.isdisabled) {
    //       this.onActionButtonClick(event.data);
    //     }
    //   }
    // },

        
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
      // La cabecera se pinta después: estado inicial de las casillas de columna
      setTimeout(() => this.actualizarCabeceras(), 300);
    }

    /** Las cabeceras se recrean al cambiar columnas o datos: volver a pintar su estado. */
    onFirstDataRendered(): void { setTimeout(() => this.actualizarCabeceras()); }
    
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
        setTimeout(() => this.actualizarCabeceras());   // las casillas de cabecera miran las filas visibles
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
            auditar: existingAccess?.auditar || false,
            papelera: existingAccess?.papelera || false
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

  

 /** ↑ / ↓ seleccionan la fila como un clic (ver AppAgGridService.navegacionConFlechas). */
 navegarConTeclado = this._appAgGridService.navegacionConFlechas();

 onCellClicked(e: CellClickedEvent): void {
  if (!this.isdisabled) {
    const field = e.column.getColId();
    if (field === 'todos') {
      const rowData = e.data;
      const todas = this.camposPermiso.every(c => rowData[c] === true);
      this.marcarFila(rowData, !todas);   // a medias → marca todo
      return;
    }
    const allowedFields = this.camposPermiso;
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
      // 🔥 Forzar refresco de la celda clickeada (y la casilla «Todos» de la fila y la cabecera)
      this.gridApi.refreshCells({ force: true, columns: [field, 'todos'] });
      this.actualizarCabeceras();
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
            papelera: [{value: false, disabled: this.isdisabled}],
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
                  auditar: currentRow.auditar,
                  papelera: currentRow.papelera
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
