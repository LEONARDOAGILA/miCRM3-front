import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
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
import { ToastrService } from 'ngx-toastr';
import { MenuContextualComponent, OpcionContextual } from '../../../../../components/menuContextual/menuContextual.component';
import { AppDescargaService, PeticionDescarga, AccionDescarga }
  from '../../../../../service/app-descarga.service';


@Component({
  selector: 'app-allMenus',
  templateUrl: './allMenus.component.html',
  styleUrls: ['./allMenus.component.css'],
  standalone: false,
})
export class AllMenusComponent implements OnInit, OnDestroy{

  /** Pregunta qué descargar (lo que se ve o el árbol entero) y trae las filas. */
  private readonly _appDescargaService = inject(AppDescargaService);

  public title: string;
  //public isLoading = false;
  public isLoading$ = this._loadingService.isLoading$;

  public errorMessage!: string;
  public accesoModel: AccesoModel;
  public menuModel: MenuModel[] = [];
  public selectedRow: PerfilModel | null = null;
  /**
   * true mientras la columna ACCIONES está plegada (sólo se ve su cabecera).
   * El renderer de la celda lo usa para pintar un único botón que vuelve a
   * desplegarla: sin eso el usuario no sabe que puede pulsar la cabecera.
   */
  public accionesPlegadas = false;

  // ================================================================
  // MENÚ DEL BOTÓN DERECHO
  // ================================================================
  //
  // Las mismas acciones que los botones de la columna ACCIONES, pero sin
  // tener que llegar hasta el final de la fila ni desplegar la columna
  // cuando está plegada.

  @ViewChild('menuCtx') menuCtx!: MenuContextualComponent;

  /** Lo que se ofrece para la fila sobre la que se pulsó. */
  public opcionesContextuales: OpcionContextual[] = [];


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

  /**
   * Clase de la celda según el nivel del menú (nivel-0 … nivel-3): el color
   * lo ponen las variables del tema en allMenus.component.css, así se lee
   * bien en claro y en oscuro. Antes eran colores fijos (black, green…)
   * que en modo oscuro casi no se veían.
   */
  private claseNivel = (params: any): string => 'celda-nivel nivel-' + Math.min(Math.max(Number(params?.data?.nivel ?? 0), 0), 3);
  private readonly centrado = { textAlign: 'center' };
  private readonly izquierda = { textAlign: 'left' };


    constructor(
      /** Para encontrar los botones de la cabecera sin salir de esta pantalla. */
      private host: ElementRef<HTMLElement>,
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
      private _toastr: ToastrService,

    ) {
      this.title = 'Lista de Menús';
      this.accesoModel = this.activeRoute.snapshot.data.access;
      console.log('AccesoModel ->', this.accesoModel);
    }


    //   ******   INIT  - DESTROY  ******  //
    ngOnInit(): void {
      this.leerPlegados();                 // el árbol se abre como se dejó
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
          cellClass: this.claseNivel, cellStyle: this.izquierda,
          cellRenderer: (params) => this.renderIcon(params),
          minWidth: 40,  // Reducido porque los iconos ocupan menos espacio
          maxWidth: 40,  // Reducido porque los iconos ocupan menos espacio
          sortable: false,
        },

        {
          headerName: 'Nombre',
          field: 'nombre',
          cellClass: this.claseNivel, cellStyle: this.izquierda,
          // Sangría por `nivel`, el asa de plegar y el nombre. Los menús sin
          // hijos llevan un hueco del mismo ancho que el asa para que los
          // nombres de un mismo nivel queden alineados.
          cellRenderer: (params) => this.celdaNombre(params),
          // Los botones de contraer y desplegar todo van en la cabecera de
          // esta columna, que es la del árbol (ver cabeceraArbol).
          headerComponentParams: this.cabeceraArbol(),
          minWidth: 280,
          maxWidth: 400, 
          sortable: false,
          // Arrastrar la fila (asa ⋮⋮) para moverla a otro padre o cambiar su
          // orden: mismo esquema que el administrador de archivos. Sólo con
          // permiso de editar.
          dndSource: this.accesoModel?.editar === true,
          dndSourceOnRowDrag: (params: any) => this.onDragStart(params.rowNode.data, params.dragEvent),
        },

        {
          headerName: 'Orden',
          field: 'orden',
          cellClass: this.claseNivel, cellStyle: this.centrado,
          minWidth: 90,
          maxWidth: 90, 
          sortable: false,
        },

        {
          headerName: 'Nivel',
          field: 'nivel',
          cellClass: this.claseNivel, cellStyle: this.centrado,
          minWidth: 90,
          maxWidth: 90, 
          sortable: false,
        },        
        
        {
          headerName: 'URL',
          field: 'url',
          cellClass: this.claseNivel, cellStyle: this.izquierda,           
          minWidth: 150,
          maxWidth: 1200,          
          sortable: false,
        },

        {
          headerName: 'Etiqueta',
          field: 'etiqueta',
          cellClass: this.claseNivel, cellStyle: this.izquierda,           
          minWidth: 100,
          maxWidth: 150,  
          sortable: false,        
        },


        {
          headerName: 'Descripción',
          field: 'descripcion',
          cellClass: this.claseNivel, cellStyle: this.izquierda,           
          minWidth: 150,
          maxWidth: 1200,   
          sortable: false,       
        },
        
        {
          headerName: 'Creado',
          field: 'created_at',
          cellClass: this.claseNivel, cellStyle: this.izquierda,           
          minWidth: 180,
          maxWidth: 180,
          sortable: false,
        },
        {
          headerName: 'Actualizado',
          field: 'updated_at',
          cellClass: this.claseNivel, cellStyle: this.izquierda,           
          minWidth: 180,
          maxWidth: 180,
          sortable: false,
        },

        {
          headerName: 'Creado por',
          field: 'created_by',
          cellClass: this.claseNivel, cellStyle: this.izquierda,           
          minWidth: 150,
          maxWidth: 1200, 
          sortable: false,         
        },

        {
          headerName: 'Actualizado por',
          field: 'updated_by',
          cellClass: this.claseNivel, cellStyle: this.izquierda,           
          minWidth: 150,
          maxWidth: 1200, 
          sortable: false,         
        },

        {
          headerName: 'path',
          field: 'path',
          cellClass: this.claseNivel, cellStyle: this.izquierda,           
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
              <div style="display: flex; align-items: center; justify-content: center; gap: 5px;" title="Ocultar los botones de acción">
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


    // ================================================================
    // PAGINACIÓN
    // ================================================================
    // La pagina ag-Grid en cliente (todas las filas están cargadas). Se
    // oculta su panel y se pintan los botones de allUsers; estos contadores
    // se refrescan en (paginationChanged) leyendo la API de la grilla.

    public paginaActual = 1;
    public ultimaPagina = 1;
    public totalRegistros = 0;
    public registrosPorPagina = 0;

    /** Primer registro mostrado; 0 sin resultados. */
    public get desde(): number {
      return this.totalRegistros === 0 ? 0 : (this.paginaActual - 1) * this.registrosPorPagina + 1;
    }

    /** Último registro mostrado, sin pasarse del total. */
    public get hasta(): number {
      return Math.min(this.paginaActual * this.registrosPorPagina, this.totalRegistros);
    }

    /** ag-Grid lo dispara al cambiar de página, de tamaño, de filtro o de datos. */
    onPaginationChanged(): void {
      if (!this.gridApi) { return; }
      this.paginaActual = this.gridApi.paginationGetCurrentPage() + 1;   // la API cuenta desde 0
      this.ultimaPagina = Math.max(this.gridApi.paginationGetTotalPages(), 1);
      this.totalRegistros = this.gridApi.paginationGetRowCount();
      this.registrosPorPagina = this.gridApi.paginationGetPageSize();
    }

    firstPage(): void { this.gridApi?.paginationGoToFirstPage(); }
    prevPage(): void  { this.gridApi?.paginationGoToPreviousPage(); }
    nextPage(): void  { this.gridApi?.paginationGoToNextPage(); }
    lastPage(): void  { this.gridApi?.paginationGoToLastPage(); }

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

        // Los botones de plegar se pintan con la cabecera: si el árbol llegó
        // antes que ella, su estado se pone aquí, cuando ya existen.
        this.actualizarBotonesArbol();
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

      // Estado para el renderer de la celda: tras este cambio la columna queda
      // al revés de como estaba.
      this.accionesPlegadas = !isCollapsed;
        
        actionsCol.minWidth = isCollapsed ? 100 : 50;
        actionsCol.maxWidth = isCollapsed ? 100 : 50;
        // Las celdas se ven en los dos estados: plegada, la celda muestra el botón
      // de desplegar (ver renderer al final del fichero), así que ya no se oculta.
      actionsCol.cellStyle = { display: 'flex', justifyContent: 'center', alignItems: 'center' };

        actionsCol.headerComponentParams = {
          template: isCollapsed ? 
            `<div style="display: flex; align-items: center; justify-content: center; gap: 5px;" title="Ocultar los botones de acción">
              <span>ACCIONES</span>
              <i class="fas fa-arrow-right"></i>
            </div>` : 
            `<div style="display: flex; align-items: center; justify-content: center;" title="Mostrar los botones de acción">
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
   /** ↑ / ↓ seleccionan la fila como un clic (ver AppAgGridService.navegacionConFlechas). */
   navegarConTeclado = this._appAgGridService.navegacionConFlechas(fila => this.selectedRow = fila);

   onCellClicked(e: CellClickedEvent): void {
      this.selectedRow = e.data;

      // El asa +/- de la columna Nombre: pliega o despliega esa rama.
      // Se mira el elemento pulsado y no una columna concreta porque el asa
      // vive dentro de la celda del nombre, junto al texto.
      const origen = e.event?.target as HTMLElement | null;
      if (origen?.closest('[data-accion="plegar"]')) {
        this.alternarPlegado(e.data);
      }
    }

    onFilterTextBoxChanged() {
      const texto = (document.getElementById('filter-text-box') as HTMLInputElement)?.value ?? '';
      const antes = !!this.searchTerm;
      this.searchTerm = texto;

      // Al empezar o dejar de buscar cambia QUÉ filas se pintan: con texto
      // escrito se abre todo (si no, una coincidencia dentro de una rama
      // cerrada no saldría y parecería que el buscador no la encuentra) y al
      // limpiarlo vuelven a cerrarse las ramas plegadas.
      if (antes !== !!this.searchTerm) { this.recalcularVisibles(); }

      this.gridApi?.setQuickFilter(this.searchTerm);
    }

    //   ******   IMPRESION   ******  //
    /**
     * Lo que se le pide al servicio de descargas.
     *
     * Esta pantalla es un árbol Y ADEMÁS pagina con la propia rejilla, así
     * que «la página que estoy viendo» son las filas desplegadas de la
     * página actual de ag-Grid, y «todo» es el árbol entero (menuModel).
     */
    private peticionDescarga(accion: AccionDescarga): PeticionDescarga<any> {
      return {
        accion,
        nombrePlural: 'menús',
        tituloBase: 'Listado de Menús',
        gridApi: this.gridApi,
        filasDePagina: this.filasVisibles,
        total: this.menuModel.length,
        busqueda: this.searchTerm,
        columnDefs: this.columnDefs,
        traerTodo: () => this.menuModel,
      };
    }

    /** Las cabeceras del reporte, en un solo sitio. */
    private readonly CABECERAS_REPORTE = ['ID', 'Nombre', 'Estado', 'Creado', 'Modificado'];

    /**
     * Filas del reporte.
     *
     * Antes faltaba el estado: la cabecera decía cinco columnas y las filas
     * traían cuatro, así que «Creado» salía debajo de «Estado».
     */
    private filasReporte(lista: any[]): any[][] {
      return lista.map(item => [
        item.id,
        item.nombre,
        item.activo ? 'Activo' : 'Inactivo',
        item.created_at_formateado,
        item.updated_at_formateado,
      ]);
    }

    async printPdf() {
      const salida = await this._appDescargaService.preparar(this.peticionDescarga('imprimir'));
      if (!salida) { return; }       // no hay nada que descargar, o canceló
      this._appPrintPdfService.generarReporte({
        tamanoPapel: 'A4',
        orientacion: 'p',
        title: 'Reporte de Menús',
        titleTable: salida.titulo,
        headers: this.CABECERAS_REPORTE,
        data: this.filasReporte(salida.filas),
        piePagina: 'Pie de página - Mi Empresa en Desarrollo S.A....'
      });
    }

    async exportExcel() {
      const salida = await this._appDescargaService.preparar(this.peticionDescarga('excel'));
      if (!salida) { return; }
      this._appExportExcelService.generarReporteExcel({
        tamanoPapel: 'A4',
        orientacion: 'p',
        title: 'Reporte de Menús',
        titleTable: salida.titulo,
        headers: this.CABECERAS_REPORTE,
        data: this.filasReporte(salida.filas),
        piePagina: 'Pie de página - Mi Empresa en Desarrollo S.A....'
      });
    }

    async exportCsv() {
      const salida = await this._appDescargaService.preparar(this.peticionDescarga('csv'));
      if (!salida) { return; }
      this._appExportCsvService.generarReporteCSV({
        headers: this.CABECERAS_REPORTE,
        data: this.filasReporte(salida.filas),
      });
    }


    // ================================================================
    // PLEGAR Y DESPLEGAR EL ÁRBOL
    // ================================================================
    //
    // ag-Grid Community no trae `treeData` —es de la versión de pago—, así
    // que se hace a mano, igual que en allCategorias: la rejilla recibe SÓLO
    // las filas visibles, y una fila lo es cuando ninguno de sus antepasados
    // está plegado. El servidor ya manda el árbol en orden y con `nivel`.

    /** Los ids de los menús plegados (sus descendientes no se pintan). */
    private readonly plegados = new Set<number>();

    /** Lo que de verdad recibe la rejilla: el árbol menos las ramas cerradas. */
    public filasVisibles: MenuModel[] = [];

    /**
     * Cuántos hijos tiene cada menú.
     *
     * `MenuModel` no trae `num_hijos` —el listado no lo manda—, así que se
     * cuenta aquí una vez al cargar y no en cada pintada de celda.
     */
    private hijosPorId = new Map<number, number>();

    /** Lo escrito en el buscador: con texto, el plegado se ignora. */
    public searchTerm = '';

    /** Dónde se recuerda el estado entre visitas. */
    private static readonly CLAVE_PLEGADOS = 'seg.menus.plegados';

    /** La celda de «Nombre»: sangría + asa + nombre. */
    private celdaNombre(params: any): string {
      const d = params.data;
      const id = Number(d?.id ?? 0);
      const nivel = Math.max(0, Number(d?.nivel ?? 0));
      const hijos = this.hijosPorId.get(id) ?? 0;
      const plegado = this.plegados.has(id);

      // La sangría va en PÍXELES y no en `&nbsp;`: con espacios el ancho
      // depende de la fuente y las columnas dejan de alinearse al cambiar
      // de tema.
      const sangria = `<span class="menu-sangria" style="width:${nivel * 16}px"></span>`;

      const asa = hijos > 0
        ? `<button type="button" class="menu-asa" data-accion="plegar"
                   title="${plegado ? 'Desplegar' : 'Contraer'} esta rama"
                   aria-label="${plegado ? 'Desplegar' : 'Contraer'}">
             <i class="fa fa-${plegado ? 'plus' : 'minus'}"></i>
           </button>`
        : `<span class="menu-asa menu-asa--hueco"></span>`;

      // El nombre ESCAPADO: lo escribe un usuario y acaba dentro de una
      // cadena de HTML, así que sin esto un `<` rompe la celda.
      const texto = String(params.value ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      return `<span class="menu-nombre">${sangria}${asa}<span>${texto}</span></span>`;
    }

    /**
     * Cabecera de «Nombre»: los botones de plegar y el título.
     *
     * Es una plantilla del encabezado de ag-Grid, no de Angular: el clic se
     * atiende en `alClicarCabecera` (lo escucha el contenedor de la rejilla)
     * y el encendido/apagado lo pone `actualizarBotonesArbol` a mano.
     */
    private cabeceraArbol(): any {
      return {
        template: `
          <div class="ag-cell-label-container" role="presentation">
            <span ref="eMenu" class="ag-header-icon ag-header-cell-menu-button"></span>
            <div ref="eLabel" class="ag-header-cell-label cabecera-arbol" role="presentation">
              <span class="cabecera-arbol__botones btn-group" role="group" aria-label="Plegar el árbol">
                <button type="button" class="btn" data-arbol="contraer" title="Contraer todas las ramas">
                  <i class="fa fa-minus"></i>
                </button>
                <button type="button" class="btn" data-arbol="desplegar" title="Desplegar todas las ramas">
                  <i class="fa fa-plus"></i>
                </button>
              </span>
              <span ref="eText" class="ag-header-cell-text"></span>
            </div>
          </div>`
      };
    }

    /**
     * Enciende o apaga los botones de la cabecera.
     *
     * La plantilla de ag-Grid es HTML suelto, no Angular: no hay `[disabled]`
     * que valga y hay que ponerlo cada vez que cambia el estado.
     */
    private actualizarBotonesArbol(): void {
      const botones = this.host?.nativeElement?.querySelectorAll?.('[data-arbol]');
      botones?.forEach((b: HTMLButtonElement) => {
        b.disabled = b.dataset['arbol'] === 'contraer'
          ? !!this.searchTerm                          // buscando se ve todo
          : (!!this.searchTerm || !this.hayPlegados);  // nada que desplegar
      });
    }

    /**
     * Clic en la cabecera de la rejilla.
     *
     * Lo escucha el contenedor porque esos botones los pinta ag-Grid y no
     * Angular, así que no hay `(click)` al que agarrarse.
     */
    alClicarCabecera(ev: MouseEvent): void {
      const boton = (ev.target as HTMLElement).closest('[data-arbol]') as HTMLButtonElement | null;
      if (!boton) { return; }

      ev.stopPropagation();
      if (boton.disabled) { return; }
      if (boton.dataset['arbol'] === 'contraer') { this.contraerTodo(); } else { this.desplegarTodo(); }
    }

    /** Pliega o despliega una rama y lo recuerda. */
    alternarPlegado(fila: MenuModel | null): void {
      const id = Number(fila?.id ?? 0);
      if (!id || (this.hijosPorId.get(id) ?? 0) === 0) { return; }

      if (this.plegados.has(id)) { this.plegados.delete(id); }
      else { this.plegados.add(id); }

      this.guardarPlegados();
      this.recalcularVisibles();
    }

    /** Cierra todas las ramas: sólo quedan los menús raíz. */
    contraerTodo(): void {
      this.plegados.clear();
      this.hijosPorId.forEach((cuantos, id) => { if (cuantos > 0) { this.plegados.add(id); } });
      this.guardarPlegados();
      this.recalcularVisibles();
    }

    /** Abre el árbol entero. */
    desplegarTodo(): void {
      this.plegados.clear();
      this.guardarPlegados();
      this.recalcularVisibles();
    }

    /** Para encender o apagar el botón de la barra. */
    get hayPlegados(): boolean { return this.plegados.size > 0; }

    /** Cuántas ramas están cerradas, para decirlo en el pie. */
    get plegadosCuantos(): number { return this.plegados.size; }

    /** Tras cargar o cambiar el modelo: recuenta, limpia el estado y repinta. */
    private refrescarArbol(): void {
      this.recalcularHijos();
      this.limpiarPlegados();
      this.recalcularVisibles();
    }

    /** Recuenta los hijos de cada menú. */
    private recalcularHijos(): void {
      this.hijosPorId = new Map<number, number>();
      this.menuModel.forEach((m: any) => {
        const padre = m?.padre_id ?? null;
        if (padre != null) {
          const p = Number(padre);
          this.hijosPorId.set(p, (this.hijosPorId.get(p) ?? 0) + 1);
        }
      });
    }

    /**
     * Rehace la lista que ve la rejilla.
     *
     * Se esconde la RAMA ENTERA, no sólo los hijos directos: por eso se sube
     * por los antepasados en vez de mirar únicamente `padre_id`.
     */
    private recalcularVisibles(): void {
      if (this.searchTerm || this.plegados.size === 0) {
        this.filasVisibles = [...this.menuModel];
      } else {
        // Un mapa id → padre para no recorrer el array por cada antepasado
        const padres = new Map<number, number | null>();
        this.menuModel.forEach((m: any) => padres.set(Number(m.id), m.padre_id ?? null));

        this.filasVisibles = this.menuModel.filter((m: any) => {
          let p = padres.get(Number(m.id)) ?? null;
          while (p != null) {
            if (this.plegados.has(Number(p))) { return false; }
            p = padres.get(Number(p)) ?? null;
          }
          return true;
        });
      }
      this.gridApi?.setRowData(this.filasVisibles);
      this.actualizarBotonesArbol();
    }

    /**
     * Quita del estado los menús que ya no existen.
     *
     * Si se borra uno y su id se queda aquí, al crear otro podría tocarle ese
     * mismo id y nacería plegado sin que nadie lo haya pedido.
     */
    private limpiarPlegados(): void {
      const existen = new Set(this.menuModel.map((m: any) => Number(m.id)));
      [...this.plegados].forEach(id => { if (!existen.has(id)) { this.plegados.delete(id); } });
    }

    private guardarPlegados(): void {
      try {
        localStorage.setItem(AllMenusComponent.CLAVE_PLEGADOS, JSON.stringify([...this.plegados]));
      } catch {
        // Ventana privada o almacenamiento bloqueado: se pierde al salir y ya
      }
    }

    private leerPlegados(): void {
      try {
        const guardado = localStorage.getItem(AllMenusComponent.CLAVE_PLEGADOS);
        if (!guardado) { return; }
        const ids = JSON.parse(guardado);
        if (Array.isArray(ids)) {
          ids.forEach((id: any) => { if (Number.isFinite(Number(id))) { this.plegados.add(Number(id)); } });
        }
      } catch {
        // Lo guardado no sirve: se empieza con el árbol abierto
      }
    }

    //   ******   LISTADO DE DATOS   ******  //
    async allMenus() {
      try {
          this._loadingService.setLoading(true); // Inicia carga
          let res: any = await firstValueFrom(this._menuService.allMenus());
          if (res?.status === 'success') {
              this._loadingService.setLoading(false); // Finaliza carga    
              this.menuModel = res.data;
              this.refrescarArbol();
            }else{
              this._loadingService.setLoading(false); // Finaliza carga    
              this.menuModel = []; // Evita que sea `undefined`
              this.refrescarArbol();
              console.error('response -> Error: Respuesta sin status success', res.message);
          }
      } catch (error: any) {
        this._loadingService.setLoading(false); // Finaliza carga    
        this.menuModel = []; // Evita que sea `undefined`
        this.refrescarArbol();
        console.error('response -> Error en la petición', error);
      }
    }
      
    // ================================================================
    // ARRASTRAR Y SOLTAR: mover de padre / cambiar el orden
    // Como en el administrador de archivos: el tercio superior o inferior
    // de una fila es un hueco ("antes de" / "después de", mismo padre que
    // esa fila); el centro de una fila es "dentro de" (pasa a ser su hijo,
    // al final). Lo demás (ciclos, nivel máximo 3, renumerar) lo decide el
    // back (seguridad.fn_menus_mover).
    // ================================================================

    /** Menú que se está arrastrando. */
    private arrastrando: any = null;
    /** Fila resaltada como destino y la clase que lleva (para quitarla después). */
    private filaDestino: HTMLElement | null = null;

    onDragStart(menu: any, ev: DragEvent): void {
      this.arrastrando = menu;
      if (ev.dataTransfer) {
        ev.dataTransfer.effectAllowed = 'move';
        ev.dataTransfer.setData('text/plain', menu?.nombre ?? '');
      }
    }

    @HostListener('document:dragend')
    onDragEnd(): void {
      this.arrastrando = null;
      this.quitarFilaDestino();
    }

    /** Fila y zona (antes / dentro / despues) bajo el cursor, si es un destino válido. */
    private destinoBajo(ev: DragEvent): { el: HTMLElement; data: any; zona: 'antes' | 'dentro' | 'despues' } | null {
      if (!this.arrastrando) { return null; }
      const el = (ev.target as HTMLElement).closest('.ag-row') as HTMLElement | null;
      if (!el) { return null; }
      const data = this.gridApi?.getDisplayedRowAtIndex(Number(el.getAttribute('row-index')))?.data;
      if (!data || data.id === this.arrastrando.id || this.esDescendiente(data.id, this.arrastrando.id)) { return null; }
      const r = el.getBoundingClientRect();
      const y = (ev.clientY - r.top) / r.height;
      const zona = y < .3 ? 'antes' : (y > .7 ? 'despues' : 'dentro');
      return { el, data, zona };
    }

    /** true si `id` cuelga (a cualquier profundidad) de `ancestroId`. */
    private esDescendiente(id: number, ancestroId: number): boolean {
      let actual = this.menuModel.find((m: any) => m.id === id) as any;
      while (actual?.padre_id != null) {
        if (actual.padre_id === ancestroId) { return true; }
        actual = this.menuModel.find((m: any) => m.id === actual.padre_id);
      }
      return false;
    }

    onDragOverGrilla(ev: DragEvent): void {
      if (!this.arrastrando) { return; }
      ev.preventDefault();
      if (ev.dataTransfer) { ev.dataTransfer.dropEffect = 'move'; }
      const d = this.destinoBajo(ev);
      const clase = d ? ({ antes: 'fila-insertar-antes', dentro: 'fila-destino', despues: 'fila-insertar-despues' })[d.zona] : '';
      if (!d || this.filaDestino !== d.el || !d.el.classList.contains(clase)) {
        this.quitarFilaDestino();
        if (d) { d.el.classList.add(clase); this.filaDestino = d.el; }
      }
    }

    onDragLeaveGrilla(ev: DragEvent): void {
      const a = ev.relatedTarget as Node | null;
      if (a && (ev.currentTarget as HTMLElement).contains(a)) { return; }
      this.quitarFilaDestino();
    }

    onDropGrilla(ev: DragEvent): void {
      ev.preventDefault();
      const menu = this.arrastrando;
      const d = this.destinoBajo(ev);
      this.onDragEnd();
      if (!menu || !d) { return; }

      let padreId: number | null;
      let antesDe: number | null;
      if (d.zona === 'dentro') {
        padreId = d.data.id;
        antesDe = null;                                  // al final de sus hijos
      } else {
        padreId = d.data.padre_id ?? null;               // hermano de la fila destino
        antesDe = d.zona === 'antes' ? d.data.id : this.siguienteHermano(d.data, menu.id);
      }
      // Soltado donde ya estaba: nada que hacer
      if (padreId === (menu.padre_id ?? null) && antesDe === this.siguienteHermano(menu, menu.id)) { return; }
      this.moverMenu(menu, padreId, antesDe);
    }

    /** id del hermano que sigue a `m` (sin contar `excluir`); null si es el último. */
    private siguienteHermano(m: any, excluir: number): number | null {
      const hermanos = this.menuModel
        .filter((x: any) => (x.padre_id ?? null) === (m.padre_id ?? null) && x.id !== excluir)
        .sort((a: any, b: any) => (a.orden - b.orden) || String(a.nombre).localeCompare(String(b.nombre)));
      const i = hermanos.findIndex((x: any) => x.id === m.id);
      return i >= 0 ? (hermanos[i + 1]?.id ?? null) : null;
    }

    private quitarFilaDestino(): void {
      this.filaDestino?.classList.remove('fila-destino', 'fila-insertar-antes', 'fila-insertar-despues');
      this.filaDestino = null;
    }

    private async moverMenu(menu: any, padreId: number | null, antesDe: number | null): Promise<void> {
      if (this._seguridadService.isexpired()) { return; }
      try {
        this._loadingService.setLoading(true);
        const res: any = await firstValueFrom(this._menuService.moverMenu(menu.id, padreId, antesDe));
        if (res?.status !== 'success') {
          this._toastr.error(res?.message || 'No se pudo mover el menú', 'Mover');
          return;
        }
        this._toastr.success(`«${menu.nombre}»: ${res.message}`, 'Menús', { timeOut: 2500 });
        await this.allMenus();
        // Vuelve a marcar la fila movida
        this.gridApi?.forEachNode(n => n.setSelected(n.data?.id === menu.id));
        this.selectedRow = this.menuModel.find((m: any) => m.id === menu.id) as any ?? null;
      } catch (e: any) {
        // El AuthInterceptor ya muestra los errores HTTP; el back responde 400 con el motivo (ciclo, nivel máximo…)
        console.error('Error al mover el menú:', e);
      } finally {
        this._loadingService.setLoading(false);
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
  // ================================================================
  // LAS ACCIONES DE UNA FILA
  // ================================================================
  //
  // Viven aquí y no en el renderizador de la columna ACCIONES porque las usan
  // DOS sitios: esos botones y el menú del botón derecho. Tenerlas duplicadas
  // era garantizar que acabaran distintas.

  /** Cuelga un menú nuevo DENTRO de la fila. */
  nuevoSubmenu(fila: any): void {
    if (!fila || this._seguridadService.isexpired()) { return; }

    const modalRef = this.modal.open(SaveMenuComponent,
      { centered: true, size: 'lg', backdrop: 'static', keyboard: false });

    modalRef.componentInstance.registro_selected = fila;
    modalRef.componentInstance.accion = 'add';
    modalRef.componentInstance.maxOrder2 = this.getMaxOrder2ByParent(fila.id) + 1;
    modalRef.componentInstance.tieneHijos = this.menuModel.some(m => m.padre_id === fila.id);

    modalRef.result
      .then(() => this.allMenus())
      .catch((error) => {
        if (error !== 'Close click' && error !== 'Escape key press') {
          console.error('Error al cerrar el modal:', error);
        }
      });
  }

  /** Modifica la fila. */
  editarMenu(fila: any): void {
    if (!fila || this._seguridadService.isexpired()) { return; }

    const modalRef = this.modal.open(SaveMenuComponent,
      { centered: true, size: 'lg', backdrop: 'static', keyboard: false });

    modalRef.componentInstance.registro_selected = fila;
    modalRef.componentInstance.accion = 'edit';
    modalRef.componentInstance.tieneHijos = this.menuModel.some(m => m.padre_id === fila.id);

    modalRef.result
      .then(() => this.allMenus())
      .catch((error) => {
        if (error !== 'Close click' && error !== 'Escape key press') {
          console.error('Error al cerrar el modal:', error);
        }
      });
  }

  /** Borra la fila, previa confirmación del propio modal. */
  eliminarMenu(fila: any): void {
    if (!fila || this._seguridadService.isexpired()) { return; }

    const modalRef = this.modal.open(DeleteMenuComponent,
      { centered: true, size: 'md', backdrop: 'static', keyboard: true });

    modalRef.componentInstance.registro_selected = fila;
    modalRef.componentInstance.registrosE
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe({
        next: () => {
          // Se quita del modelo y se repinta sin recargar la lista entera.
          // No vale `applyTransaction({remove})`: al irse un menú cambian los
          // recuentos de hijos y, con ellos, qué filas llevan asa.
          this.menuModel = this.menuModel.filter((m: any) => m.id !== fila.id);
          this.refrescarArbol();
          if (this.selectedRow?.id === fila.id) { this.selectedRow = null; }
        },
        error: (error: any) => console.error(error.message),
      });
  }

  // ================================================================
  // EL MENÚ DEL BOTÓN DERECHO
  // ================================================================

  /**
   * Clic derecho sobre la rejilla.
   *
   * NO SE USA EL EVENTO `cellContextMenu` DE ag-Grid. Se probó contra la
   * librería de verdad y no llegaba: el clic alcanza el contenedor de filas
   * pero la rejilla lo descarta antes de emitirlo. En vez de pelearme con
   * sus entresijos, aquí se escucha el `contextmenu` del contenedor y la
   * fila se resuelve con la API pública, que sí está documentada y no cambia
   * entre versiones.
   *
   * LO PRIMERO ES ELEGIR LA FILA: el menú actúa sobre «la fila», y si no se
   * marcara se vería resaltada una y el menú trabajaría sobre otra. Es el
   * error clásico de los menús contextuales sobre tablas.
   */
  onContextMenuGrilla(e: MouseEvent): void {
    const fila = this._appAgGridService.filaDeEventoEnGrilla(e, this.gridApi);
    if (!fila) { return; }          // fuera de las filas: el menú del navegador

    e.preventDefault();

    this.selectedRow = fila;
    this._appAgGridService.marcarFila(this.gridApi, fila);

    this.opcionesContextuales = this.opcionesPara(fila);
    this.menuCtx?.abrir(e);
  }


  /**
   * Qué se ofrece para esta fila.
   *
   * Se arma cada vez porque depende de la fila y del perfil: un menú de
   * cuarto nivel no admite submenús, y quien no puede editar no debe ver
   * «Modificar» como si pudiera.
   */
  private opcionesPara(fila: any): OpcionContextual[] {
    const puedeCrear  = this.accesoModel?.crear    === true;
    const puedeEditar = this.accesoModel?.editar   === true;
    const puedeBorrar = this.accesoModel?.eliminar === true;
    const puedeAuditar = this.accesoModel?.auditar === true;

    // El cuarto nivel (level 3) es el último: colgarle algo dentro pasaría
    // de los cuatro niveles que entiende el menú de la aplicación.
    const esUltimoNivel = fila?.level === 3;

    return [
      {
        id: 'submenu', texto: 'Nuevo submenú aquí', icono: 'fa-folder-plus',
        visible: puedeCrear,
        deshabilitada: esUltimoNivel,
        ayuda: esUltimoNivel ? 'Este es el último nivel: no admite submenús' : 'Crear un menú dentro de éste',
      },
      {
        id: 'raiz', texto: 'Nuevo menú principal', icono: 'fa-plus',
        visible: puedeCrear,
        ayuda: 'Crear un menú de primer nivel',
      },
      {
        id: 'editar', texto: 'Modificar', icono: 'fa-pen',
        separadorAntes: true, visible: puedeEditar,
      },
      {
        id: 'eliminar', texto: 'Eliminar', icono: 'fa-trash',
        peligro: true, visible: puedeBorrar,
      },
      {
        id: 'auditoria', texto: 'Ver auditoría', icono: 'fa-user-secret',
        separadorAntes: true, visible: puedeAuditar,
        ayuda: 'Quién tocó este menú y cuándo',
      },
      {
        id: 'copiarUrl', texto: 'Copiar la url', icono: 'fa-link',
        separadorAntes: true,
        deshabilitada: !fila?.url || fila.url === '.',
        ayuda: fila?.url && fila.url !== '.' ? fila.url : 'Este menú no tiene url (es una carpeta)',
      },
    ];
  }

  /** Se eligió una opción del menú contextual. */
  alElegirContextual(id: string): void {
    const fila = this.selectedRow as any;
    if (!fila) { return; }

    switch (id) {
      case 'submenu':   this.nuevoSubmenu(fila); break;
      case 'raiz':      this.addMenu(); break;
      case 'editar':    this.editarMenu(fila); break;
      case 'eliminar':  this.eliminarMenu(fila); break;
      case 'auditoria': this.auditoria(); break;
      case 'copiarUrl': this.copiarUrl(fila); break;
    }
  }

  /**
   * La url al portapapeles.
   *
   * Con el respaldo de toda la vida: `navigator.clipboard` sólo existe en
   * páginas seguras, y esto se usa por http en la red local.
   */
  private copiarUrl(fila: any): void {
    const url = (fila?.url ?? '').trim();
    if (!url || url === '.') { return; }

    const avisar = () => this._toastr.success(url, 'Url copiada', { timeOut: 2000 });

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(avisar, () => this.copiarALaAntigua(url, avisar));
    } else {
      this.copiarALaAntigua(url, avisar);
    }
  }

  private copiarALaAntigua(texto: string, alCopiar: () => void): void {
    const caja = document.createElement('textarea');
    caja.value = texto;
    caja.style.position = 'fixed';
    caja.style.opacity = '0';
    document.body.appendChild(caja);
    caja.select();
    try { document.execCommand('copy'); alCopiar(); }
    catch { this._toastr.warning('No se pudo copiar', 'Url'); }
    finally { document.body.removeChild(caja); }
  }

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
        const modalRef = this.modal.open(SaveMenuComponent, { centered: true, size: "lg", backdrop: "static", keyboard: false,});
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
    @if (AllMenusComponent.accionesPlegadas) {
      <button type="button"
              class="btn btn-sm btn-outline-primary acciones-desplegar"
              title="Mostrar los botones de acción"
              aria-label="Mostrar los botones de acción"
              (click)="AllMenusComponent.toggleActionsColumn()">
        <i class="fas fa-bars"></i>
      </button>
    } @else {
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
    }
  `,
  styles: [`
    .acciones-desplegar {
      width: 28px;
      height: 24px;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: .25rem;
    }
  `],
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

  // Las tres acciones viven en AllMenusComponent: las comparten estos botones
  // y el menú del botón derecho. Aquí sólo se les pasa la fila.
  addMenu()    { this.AllMenusComponent.nuevoSubmenu(this.params.data); }
  editMenu()   { this.AllMenusComponent.editarMenu(this.params.data); }
  deleteMenu() { this.AllMenusComponent.eliminarMenu(this.params.data); }



}
