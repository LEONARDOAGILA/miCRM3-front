import { Component, HostListener, OnDestroy, OnInit, ViewChild, inject, ChangeDetectionStrategy } from '@angular/core';
import { MenuContextualComponent, OpcionContextual } from '../../../../../components/menuContextual/menuContextual.component';
import { Subject, firstValueFrom } from 'rxjs';
import { CellClickedEvent, GridApi, GridReadyEvent, IRowNode } from 'ag-grid-community';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ActivatedRoute, Router } from '@angular/router';
import { AgGridAngular, AgGridModule } from 'ag-grid-angular';

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
import { PapeleraPerfilesComponent } from '../papeleraPerfiles/papeleraPerfiles.component';
import { AppDescargaService, PeticionDescarga, AccionDescarga }
  from '../../../../../service/app-descarga.service';

import { PanelComponent } from '../../../../../components/panel/panel.component';
import { ActionButtonsComponent } from '../../../../../components/botones/action-buttons/action-buttons.component';
import { FilasEstirablesDirective } from '../../../../../core/directives/filasEstirables.directive';
import { CommonModule } from '@angular/common';



@Component({
  selector: 'app-allProfiles',
  templateUrl: './allProfiles.component.html',
  styleUrls: ['./allProfiles.component.css'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    CommonModule,
    AgGridModule,
    FilasEstirablesDirective,
    PanelComponent,
    MenuContextualComponent,
    CampoBusquedaPaginacionComponent
],
})
export class AllProfilesComponent implements OnInit, OnDestroy{

  /** Pregunta qué descargar (la página o todo) y trae las filas. */
  private readonly _appDescargaService = inject(AppDescargaService);

  public accesoModel: AccesoModel;
  public perfilModel: PerfilModel[] = [];
  public selectedRow: PerfilModel | null = null;

  /**
   * true mientras la columna ACCIONES está plegada (sólo se ve su cabecera).
   * La plantilla lo usa para enseñar el botón "Mostrar acciones": si no, el
   * usuario no tiene forma de saber que hay que pulsar la cabecera para
   * recuperar los botones.
   */
  public accionesPlegadas = false;

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


  // ================================================================
  // MENÚ DEL BOTÓN DERECHO
  // ================================================================
  //
  // Las mismas acciones que la columna ACCIONES, pero sin llegar al final de
  // la fila ni desplegar la columna cuando está plegada.

  @ViewChild('menuCtx') menuCtx!: MenuContextualComponent;

  /** Lo que se ofrece para la fila sobre la que se pulsó. */
  public opcionesContextuales: OpcionContextual[] = [];

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
      if (this.limpiandoTimeoutId) { clearTimeout(this.limpiandoTimeoutId); }
      // Cancela el timeout cuando el componente se destruye (evita fugas)
      if (this.resizeTimeoutId) { 
        clearTimeout(this.resizeTimeoutId); 
      }
      this.unsubscribe$.next();
      this.unsubscribe$.complete();
    }



    //   ******   HOME DE MODULO  ******  //
    fun_home(){
      this.route.navigate(['/config/home']);
    }


    
    //   ******   FUNCIONES DE AG-GRID   ******  //
    // ================================================================
    // FILTROS DE LA CABECERA
    // ================================================================
    //
    // Los aplica el SERVIDOR, no la rejilla: esta pantalla pagina, así que
    // ag-Grid sólo tiene las filas de la página y filtrar ahí buscaría dentro
    // de cinco. La cabecera sólo recoge lo que el usuario pidió.

    /**
     * Las columnas que llevan filtro, y de qué tipo.
     *
     * Tiene que decir lo mismo que la lista blanca de ProfileController: lo
     * que no esté allí se tira en el servidor, así que ponerlo sólo aquí
     * sería pintar una caja que no filtra. `activo` se queda fuera: es una
     * casilla, y escribir texto para filtrarla no se entiende.
     */
    private readonly COLUMNAS_FILTRABLES: { [campo: string]: 'texto' | 'numero' } = {
      id: 'numero', inactividad: 'numero',
      nombre: 'texto', created_by: 'texto', updated_by: 'texto',
      // Las fechas, como texto sobre lo que se ve: «2026-10» busca el mes
      created_at: 'texto', updated_at: 'texto',
    };

    /** Lo que haya pedido la cabecera, tal cual lo da ag-Grid. */
    public filtrosColumna: any = {};

    /** Para no recargar mientras se limpian los filtros de golpe. */
    private limpiando = false;
    /** El temporizador que baja esa bandera; se cancela al salir. */
    private limpiandoTimeoutId?: any;

    /**
     * Las columnas con su filtro de cabecera.
     *
     * El CÓMO —que la rejilla recoja el filtro pero no lo aplique— vive en
     * AppAgGridService. Aquí queda sólo el QUÉ.
     */
    private conFiltros(columnas: any[]): any[] {
      return this._appAgGridService.filtrosDeServidor(columnas, this.COLUMNAS_FILTRABLES);
    }

    /** La cabecera pidió otra cosa. Siempre a la página 1. */
    onFiltroColumna(): void {
      if (this.limpiando) { return; }
      this.filtrosColumna = this.gridApi?.getFilterModel() ?? {};
      this.paginaActual = 1;
      this.allProfiles(1);
    }

    /** Cuántas columnas llevan filtro; el buscador lo enseña y se pone rojo. */
    get cuantasColumnasFiltradas(): number {
      return Object.keys(this.filtrosColumna || {}).length;
    }

    /** Si hay algo que quitar: lo escrito arriba o un filtro de columna. */
    get hayFiltro(): boolean {
      return !!this.searchTerm || this.cuantasColumnasFiltradas > 0;
    }

    /**
     * La papelera de reciclaje.
     *
     * Lo que se «elimina» no se borra: va aquí CON SUS ACCESOS, y desde aquí
     * se restaura tal cual o se borra de verdad. Un perfil son sus permisos
     * pantalla por pantalla, y rehacerlos a mano es media tarde.
     */
    abrirPapelera(): void {
      const modalRef = this.modal.open(PapeleraPerfilesComponent, {
        centered: true, size: 'xl', backdrop: 'static', keyboard: true
      });
      // El permiso viaja con el modal: allí también hay auditoría
      modalRef.componentInstance.puedeAuditar = this.accesoModel?.auditar === true;
      // Y si puede borrar de verdad, que es otro permiso distinto
      modalRef.componentInstance.puedeVaciar = this.accesoModel?.vaciar === true;
      modalRef.componentInstance.cambio.subscribe(() => this.allProfiles(this.paginaActual));
    }
    initializeGrid(): void {
      this.columnDefs = this.conFiltros([
        {
          headerName: 'Id',
          field: 'id',
          cellStyle: { textAlign: 'center'},
          minWidth: 70,
          maxWidth: 70,          
        },
        {
          // Segunda columna y PULSABLE: dar de baja esto era abrir la ficha
          // entera, bajar la casilla y guardar. Ahora se pulsa aqui.
          headerName: 'Activo',
          field: 'activo',
          cellStyle: { textAlign: 'center' },
          minWidth: 80,
          maxWidth: 80,
          cellRenderer: (params: any) => this.casillaActivo(params),
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
          suppressHeaderMenuButton: true,
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

      ]);
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

        // Estado para la plantilla: tras este cambio la columna queda al revés
        // de como estaba.
        this.accionesPlegadas = !isCollapsed;

        actionsCol.minWidth = isCollapsed ? 110 : 50;
        actionsCol.maxWidth = isCollapsed ? 110 : 50;
        // Las celdas se ven en los dos estados: plegada, la celda muestra el
        // botón de desplegar (ver ButtonAccionProfile), así que ya no se oculta.
        actionsCol.cellStyle = { display: 'flex', justifyContent: 'center', alignItems: 'center' };

        // La cabecera plegada lleva title: al menos con el ratón encima se
        // explica sola. El botón de la barra cubre el caso táctil.
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
          actionsCol.minWidth = isCollapsed ? 110 : 50; // Ancho menor en móviles
          actionsCol.maxWidth = isCollapsed ? 110 : 50;
        }
        
        this.gridApi.setGridOption('columnDefs', columnDefs);
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
    /** ↑ / ↓ seleccionan la fila como un clic (ver AppAgGridService.navegacionConFlechas). */
    navegarConTeclado = this._appAgGridService.navegacionConFlechas(fila => this.selectedRow = fila);

    // ================================================================
    // LA CASILLA DE «ACTIVO»
    // ================================================================
    //
    // El dibujo y el flujo —el giro mientras guarda, repintar con lo que
    // contesta el servidor, volver atrás si falla— viven en
    // AppAgGridService: son los mismos en las nueve rejillas que tienen esta
    // casilla. Aquí sólo van los datos de esta pantalla.

    /**
     * Los desactivados se ven, pero se ven apagados y tachados.
     *
     * No se esconden: siguen en la lista y se pueden buscar y abrir. Lo que se
     * busca es no tener que leer la casilla fila por fila para saber cuál ya no
     * está en juego. La regla y su CSS son los mismos en las nueve rejillas con
     * casilla, así que viven en AppAgGridService y en styles.css.
     */
    public rowClassRules = this._appAgGridService.reglasFilaInactiva('activo');

    /** Los que se están guardando ahora mismo: su casilla sale como un giro. */
    private readonly activoEnVuelo = new Set<number>();

    /**
     * Para cortar la peticion si la pantalla se cierra antes de que conteste.
     *
     * Sin esto, la respuesta llegaria y repintaria una rejilla ya destruida.
     */
    private readonly unsubscribe$ = new Subject<void>();

    /** La casilla de la columna «Activo». */
    private casillaActivo(params: any): string {
      return this._appAgGridService.casillaActivo(params, {
        puede: this.accesoModel?.editar === true,
        enVuelo: this.activoEnVuelo,
        que: 'perfil',
      });
    }

    /**
     * Activar o desactivar desde la casilla, sin abrir el formulario.
     *
     * Lo escribe una función del servidor que toca SÓLO esa columna. Guardar
     * la ficha entera para bajar una casilla la revalidaba toda, y un
     * registro que hoy no cumpliría alguna regla —cargado antes de que
     * existiera— no se podría desactivar hasta arreglarle todo lo demás.
     */
    cambiarActivo(fila: PerfilModel | null, nodo?: IRowNode | null): void {
      if (!fila) { return; }
      if (this._seguridadService.isexpired()) { return; }

      this._appAgGridService.alternarActivo({
        gridApi: this.gridApi,
        filas: this.perfilModel,
        fila, nodo,
        campo: 'activo',
        enVuelo: this.activoEnVuelo,
        puede: this.accesoModel?.editar === true,
        que: 'perfil',
        llamar: (id, activo) => this._profile.activarProfile(id, activo),
        nombre: (f: any) => f.nombre,
        hasta: this.unsubscribe$,
      });
    }

    onCellClicked(e: CellClickedEvent): void {
      this.selectedRow = e.data;

      // La casilla de «Activo» se marca con `data-accion`, igual que el botón
      // de llamar de las rejillas de clientes: se atiende aquí y no con un
      // componente por celda.
      const origen = e.event?.target as HTMLElement | null;
      if (origen?.closest('[data-accion="activo"]')) {
        this.cambiarActivo(e.data, e.node);
      }
    }



  



  async allProfiles(page: number = 1) {
    try {
      // Muestra el indicador de carga en la interfaz
      this._loadingService.setLoading(true);
      
      // Realiza la petición al backend con los parámetros de paginación y búsqueda
      // firstValueFrom convierte el observable en promesa y cancela la suscripción automáticamente
      const res = await firstValueFrom(
        this._profile.allProfiles(page, this.registrosPorPagina, this.searchTerm,
                                  this.filtrosColumna)
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
      if (this.gridApi) this.gridApi.setGridOption('rowData', this.perfilModel);
      
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
    if (!this.hayFiltro) { return; }

    const habiaColumnas = this.cuantasColumnasFiltradas > 0;

    // `limpiando` corta el (filterChanged) que dispara setFilterModel: sin
    // esto se recargaría dos veces, y la primera con los filtros a medias.
    this.limpiando = true;
    this.campoBusquedaPaginacion?.reset();
    this.searchTerm = '';
    this.filtrosColumna = {};
    if (habiaColumnas) { this.gridApi?.setFilterModel(null); }

    // LA BANDERA SE BAJA EN LA SIGUIENTE VUELTA, no aquí: medido contra
    // ag-Grid 28, `setFilterModel` avisa DESPUÉS de esta línea, así que
    // apagándola aquí ese aviso pediría una segunda carga idéntica.
    this.limpiandoTimeoutId = setTimeout(() => { this.limpiando = false; }, 0);

    this.paginaActual = 1;
    this.allProfiles(1);
  }





  //   ******   FUNCIONES DE PAGINACIÓN   ******  //
  /** Primer registro mostrado; 0 sin resultados (antes decía "1 - 0 de 0"). */
  public get desde(): number {
    return this.totalRegistros === 0 ? 0 : (this.paginaActual - 1) * this.registrosPorPagina + 1;
  }

  /** Último registro mostrado, sin pasarse del total. */
  public get hasta(): number {
    return Math.min(this.paginaActual * this.registrosPorPagina, this.totalRegistros);
  }

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
  /**
   * Trae TODOS los que cumplen el filtro, para exportar.
   *
   * La pantalla pagina en el servidor, así que `perfilModel` es sólo la
   * página: hasta ahora el reporte salía con esas filas aunque dijera
   * «Listado». Se pide una página del tamaño del total.
   */
  private async obtenerTodosParaExportar(): Promise<any[]> {
    if (this.totalRegistros === 0) { return []; }
    try {
      this._loadingService.setLoading(true);
      const res = await firstValueFrom(
        this._profile.allProfiles(1, this.totalRegistros, this.searchTerm,
                                  this.filtrosColumna)
      ) as any;
      // Del error HTTP ya avisa el interceptor; aqui basta con no
      // devolver filas para que no se descargue un fichero vacio.
      if (res.body?.status !== 'success') { return []; }
      return res.body?.data?.data || [];
    } catch (error) {
      console.error('Error al obtener el listado completo:', error);
      return [];
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  /** Las cabeceras del reporte, en un solo sitio. */
  private readonly CABECERAS_REPORTE = ['ID', 'Nombre', 'Inactividad', 'Estado', 'Creado', 'Modificado'];

  /**
   * Filas del reporte con formato de salida.
   *
   * `ordenarPorNombre` sólo al exportar el listado completo: si se
   * exporta la página hay que respetar lo que se tiene delante. Y se
   * ordena sobre una COPIA, porque `sort` cambia el array que recibe
   * y el de la página es el de la grilla.
   */
  private filasReporte(lista: any[], ordenarPorNombre: boolean = true): any[][] {
    return (ordenarPorNombre ? [...lista].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '')) : lista)
      .map(item => [
      item.id,
      item.nombre,
      `${item.inactividad}`,
      item.activo ? 'Activo' : 'Inactivo',
      item.created_at,
      item.updated_at,
      ]);
  }

  /**
   * Lo que se le pide al servicio de descargas: la misma caja para los
   * tres botones. Él pregunta si hace falta, trae las filas y arma el
   * título con los filtros puestos.
   */
  private peticionDescarga(accion: AccionDescarga): PeticionDescarga<any> {
    return {
      accion,
      nombrePlural: 'perfiles',
      tituloBase: 'Listado de Perfiles',
      gridApi: this.gridApi,
      filasDePagina: this.perfilModel,
      total: this.totalRegistros,
      pagina: this.paginaActual,
      ultimaPagina: this.ultimaPagina,
      busqueda: this.searchTerm,
      columnDefs: this.columnDefs,
      traerTodo: () => this.obtenerTodosParaExportar(),
    };
  }

  async printPdf() {
    const salida = await this._appDescargaService.preparar(this.peticionDescarga('imprimir'));
    if (!salida) { return; }       // no hay nada que descargar, o canceló
    this._appPrintPdfService.generarReporte({
      tamanoPapel: 'A4',
      orientacion: 'p',
      title: 'Reporte de Perfiles',
      titleTable: salida.titulo,
      headers: this.CABECERAS_REPORTE,
      data: this.filasReporte(salida.filas, salida.alcance === 'todo'),
      piePagina: 'Pie de página - Mi Empresa en Desarrollo S.A....'
    });
  }

  async exportExcel() {
    const salida = await this._appDescargaService.preparar(this.peticionDescarga('excel'));
    if (!salida) { return; }
    this._appExportExcelService.generarReporteExcel({
      tamanoPapel: 'A4',
      orientacion: 'p',
      title: 'Reporte de Perfiles',
      titleTable: salida.titulo,
      headers: this.CABECERAS_REPORTE,
      data: this.filasReporte(salida.filas, salida.alcance === 'todo'),
      piePagina: 'Pie de página - Mi Empresa en Desarrollo S.A....'
    });
  }

  async exportCsv() {
    const salida = await this._appDescargaService.preparar(this.peticionDescarga('csv'));
    if (!salida) { return; }
    this._appExportCsvService.generarReporteCSV({
      headers: this.CABECERAS_REPORTE,
      data: this.filasReporte(salida.filas, salida.alcance === 'todo'),
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
          this.gridApi.setGridOption('rowData', this.perfilModel);
        } catch (error) {
          // Captura cualquier error o la cancelación del usuario (cierra sin guardar)
          console.error('Error o cancelación en creación:', error);
        }
      })();
    }
  }


  // AUDITORIA
  // ================================================================
  // LAS ACCIONES DE UNA FILA
  // ================================================================
  //
  // Viven aquí y no en el renderizador de la columna ACCIONES porque las usan
  // DOS sitios: esos botones y el menú del botón derecho. Tenerlas duplicadas
  // era garantizar que acabaran distintas.

  clonProfile(fila: any) {
    // Abre el modal del formulario de clonación de perfiles (Save2ProfileComponent)
    const modalRef = this.modal.open(Save2ProfileComponent, {
      centered: true,      // Centra el modal en la pantalla
      size: 'xl',          // Tamaño extra grande (para el grid de accesos)
      backdrop: 'static',  // No permite cerrar haciendo clic fuera del modal
      keyboard: false      // No permite cerrar con la tecla Escape
    });

    // Pasa al modal los datos del perfil que se va a clonar
    modalRef.componentInstance.registro_selected = fila;
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
        this.perfilModel.unshift(nuevoPerfil);

        // Refresca el grid con el nuevo arreglo completo (setRowData es simple y garantiza consistencia)
        // También se podría usar applyTransaction para añadir solo la fila, pero setRowData es más claro y menos propenso a errores
        this.gridApi.setGridOption('rowData', this.perfilModel);
      } catch (error) {
        // Captura cualquier error o la cancelación del usuario (cierra sin guardar)
        console.error('Error o cancelación en clonación:', error);
      }
    })();
  }



  editProfile(fila: any) {
    // Abre el modal del formulario de edición de perfiles (Save2ProfileComponent)
    const modalRef = this.modal.open(Save2ProfileComponent, {
      centered: true,      // Centra el modal en la pantalla
      size: 'xl',          // Tamaño extra grande (para el grid de accesos)
      backdrop: 'static',  // No permite cerrar haciendo clic fuera del modal
      keyboard: false      // No permite cerrar con la tecla Escape
    });

    // Pasa al modal los datos del perfil que se va a editar
    modalRef.componentInstance.registro_selected = fila;
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
        const index = this.perfilModel.findIndex(
          registro => registro.id === response.id
        );
        // Si lo encuentra (índice válido)
        if (index !== -1) {
          // Actualiza el arreglo local con los datos nuevos (respuesta del backend)
          this.perfilModel[index] = response;
          // Obtiene la referencia a la fila correspondiente en el grid (ag-Grid)
          const rowNode = this.gridApi.getRowNode(index.toString());
          // Actualiza los datos de esa fila con la respuesta (refresca el grid)
          rowNode?.setData(response);
        }
      } catch (error) {
        // Captura cualquier error o la cancelación del usuario (cierra sin guardar)
        console.error('Error o cancelación en edición:', error);
      }
    })();
  }



  viewProfile(fila: any) {
    // Abre el modal del formulario de perfiles en modo vista (solo lectura)
    const modalRef = this.modal.open(Save2ProfileComponent, {
      centered: true,      // Centra el modal en la pantalla
      size: 'xl',          // Tamaño extra grande (para el grid de accesos)
      backdrop: 'static',  // No permite cerrar haciendo clic fuera del modal
      keyboard: false      // No permite cerrar con la tecla Escape
    });

    // Pasa al modal los datos del perfil que se va a visualizar
    modalRef.componentInstance.registro_selected = fila;
    // Indica al modal que la acción es 'view' (modo solo lectura, sin botones de guardar)
    modalRef.componentInstance.accion = 'view';
  }



  deleteProfile(fila: any) {
    // Abre el modal de confirmación de eliminación
    const modalRef = this.modal.open(DeleteProfileComponent, {
      centered: true,      // Centrado en pantalla
      size: 'md',          // Tamaño mediano
      backdrop: 'static',  // No cierra al hacer clic fuera
      keyboard: true       // Permite cerrar con tecla Escape
    });

    // Pasa al modal los datos del perfil a eliminar
    modalRef.componentInstance.registro_selected = fila;

    
    // Usamos una función asíncrona autoinvocada (IIFE) para usar async/await
    // Usamos firstValueFrom para convertir el observable en promesa y evitar suscripciones manuales
    // Con esto, no se necesita desuscribirse en ngOnDestroy.
    // Esto simplifica el manejo de la respuesta del modal.
    (async () => {
      try {
        // Espera la confirmación del modal (emite cuando el usuario confirma la eliminación)
        await firstValueFrom(modalRef.componentInstance.registrosE);

        // Datos del perfil que se está eliminando
        const perfilAEliminar = fila;
        const perfilId = perfilAEliminar.id;

        // Busca el índice del perfil en el arreglo local (perfilModel)
        const index = this.perfilModel.findIndex(
          registro => registro.id === perfilId
        );

        if (index !== -1) {
          // Elimina el perfil del arreglo local
          this.perfilModel.splice(index, 1);
          // Elimina la fila del grid usando applyTransaction
          this.gridApi.applyTransaction({ remove: [perfilAEliminar] });
        }
      } catch (error) {
        // Si el usuario cancela la eliminación o hay error, solo se registra
        console.error('Error o cancelación en eliminación:', error);
      }
    })();
  }


  // ================================================================
  // EL MENÚ DEL BOTÓN DERECHO
  // ================================================================

  /**
   * Clic derecho sobre la rejilla.
   *
   * Mismo planteamiento que en Menús: se escucha el `contextmenu` del
   * contenedor y la fila se resuelve con la API pública. El evento
   * `cellContextMenu` de ag-Grid no llega —comprobado contra la librería—,
   * así que no se usa.
   *
   * LO PRIMERO ES ELEGIR LA FILA: el menú actúa sobre «la fila», y si no se
   * marcara se vería resaltada una y el menú trabajaría sobre otra.
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


  /** Qué se ofrece para esta fila, según el perfil de quien mira. */
  private opcionesPara(fila: any): OpcionContextual[] {
    return [
      { id: 'ver',    texto: 'Ver el perfil',   icono: 'fa-eye',
        visible: this.accesoModel?.ver !== false },
      { id: 'editar', texto: 'Modificar',       icono: 'fa-pen',
        visible: this.accesoModel?.editar === true },
      { id: 'clonar', texto: 'Clonar',          icono: 'fa-clone',
        visible: this.accesoModel?.crear === true,
        ayuda: 'Crear un perfil nuevo copiando los accesos de éste' },
      { id: 'eliminar', texto: 'Enviar a la papelera', icono: 'fa-trash',
        peligro: true, separadorAntes: true,
        visible: this.accesoModel?.eliminar === true,
        ayuda: 'Conserva sus accesos; se puede restaurar' },
      { id: 'auditoria', texto: 'Ver auditoría', icono: 'fa-user-secret',
        separadorAntes: true,
        visible: this.accesoModel?.auditar === true,
        ayuda: 'Quién tocó este perfil y cuándo' },
      { id: 'papelera', texto: 'Abrir la papelera', icono: 'fa-trash-can',
        visible: this.accesoModel?.papelera === true,
        ayuda: 'Los perfiles eliminados, para restaurarlos' },
    ];
  }

  /** Se eligió una opción del menú contextual. */
  alElegirContextual(id: string): void {
    const fila = this.selectedRow as any;
    if (!fila) { return; }

    switch (id) {
      case 'ver':       this.viewProfile(fila); break;
      case 'editar':    this.editProfile(fila); break;
      case 'clonar':    this.clonProfile(fila); break;
      case 'eliminar':  this.deleteProfile(fila); break;
      case 'auditoria': this.auditoria(); break;
      case 'papelera':  this.abrirPapelera(); break;
    }
  }

  auditoria() {
    if (!this.selectedRow) return;
    
    if (!this._seguridadService.isexpired()) {    
      const modalRef = this.modal.open(AuditoriaModalComponent, { 
        centered: true, 
        size: "xl", 
        windowClass: "modal-fullscreen",
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
// Con la columna ACCIONES plegada (parent.accionesPlegadas) cada celda muestra
// un único botón-icono que vuelve a desplegarla; si no, los botones de acción.
// Así el usuario siempre tiene algo pulsable en la columna, sin depender de
// saber que la cabecera también responde.
@Component({
  selector: 'app-button-accion',
  standalone: true,
  imports: [ActionButtonsComponent],
  template: `
    @if (AllProfilesComponent.accionesPlegadas) {
      <button type="button"
              class="btn btn-sm btn-outline-primary acciones-desplegar"
              title="Mostrar los botones de acción"
              aria-label="Mostrar los botones de acción"
              (click)="AllProfilesComponent.toggleActionsColumn()">
        <i class="fas fa-bars"></i>
      </button>
    } @else {
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
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
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
  `]
})

export class ButtonAccionProfile {

  public params: any;

  constructor(
      private modalService: NgbModal, 
      public AllProfilesComponent: AllProfilesComponent
  ){}


  agInit(params: any): void {
    this.params = params;
  }


  // Las cuatro acciones viven en AllProfilesComponent: las comparten estos
  // botones y el menú del botón derecho. Aquí sólo se les pasa la fila.
  clonProfile()   { this.AllProfilesComponent.clonProfile(this.params.data); }
  editProfile()   { this.AllProfilesComponent.editProfile(this.params.data); }
  viewProfile()   { this.AllProfilesComponent.viewProfile(this.params.data); }
  deleteProfile() { this.AllProfilesComponent.deleteProfile(this.params.data); }

}
