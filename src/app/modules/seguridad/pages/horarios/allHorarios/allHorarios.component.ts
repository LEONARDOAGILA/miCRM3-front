import { Component, HostListener, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { Subject, firstValueFrom } from 'rxjs';
import { GridApi, GridReadyEvent, CellClickedEvent, RowNode } from 'ag-grid-community';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ActivatedRoute, Router } from '@angular/router';
import { AgGridAngular, AgGridModule } from 'ag-grid-angular';
import { MenuContextualComponent, OpcionContextual } from '../../../../../components/menuContextual/menuContextual.component';

//   ******   SERVICIOS   ******  //
import { AppPrintPdfService } from '../../../../../service/app-printPdf.service';
import { AppExportExcelService } from '../../../../../service/app-exportExcel.service';
import { AppExportCsvService } from '../../../../../service/app-exportCsv.service';
import { AppAgGridService } from '../../../../../service/app-agGrid.service';
import { LoadingService } from '../../../../../service/loading.service';
import { SeguridadService } from '../../../../seguridad/services/seguridad.service';
import { HorarioService } from '../../../services/horario.service';

//   ******   MODELOS   ******  //
import { AccesoModel } from '../../../interfaces/accesoModel';
import { ChorarioModel } from '../../../interfaces/chorarioModel';
import { AppDescargaService, PeticionDescarga, AccionDescarga }
  from '../../../../../service/app-descarga.service';

//   ******   COMPONENTES   ******  //
import { SaveHorarioComponent } from '../save-horario/save-horario.component';
import { DeleteHorarioComponent } from '../delete-horario/delete-horario.component';
import { PapeleraHorariosComponent } from '../papeleraHorarios/papeleraHorarios.component';
import { AuditoriaModalComponent } from '../../../../../components/auditoria-modal/auditoria-modal.component';
import { CampoBusquedaPaginacionComponent } from '../../../../../components/campos/campoBusquedaPaginacion/campoBusquedaPaginacion.component';
import { CommonModule } from '@angular/common';
import { PanelComponent } from '../../../../../components/panel/panel.component';
import { ActionButtonsComponent } from '../../../../../components/botones/action-buttons/action-buttons.component';

@Component({
  selector: 'app-allHorarios',
  templateUrl: './allHorarios.component.html',
  styleUrls: ['./allHorarios.component.css'],
  standalone: true,
  imports: [
    CommonModule, AgGridModule, PanelComponent, MenuContextualComponent,
    CampoBusquedaPaginacionComponent,
  ],
})
export class AllHorariosComponent implements OnInit, OnDestroy {

  /** Pregunta qué descargar (la página o todo) y trae las filas. */
  private readonly _appDescargaService = inject(AppDescargaService);
  
  // ****** AG-GRID ****** //
  @ViewChild(AgGridAngular) agGrid!: AgGridAngular;
  public gridApi!: GridApi;
  public columnDefs: any[] = [];
  private touchStartTime = 0;
  private touchStartX = 0;
  private touchStartY = 0;
  
  @HostListener('window:resize', ['$event'])
  onResize(event: Event): void { this._appAgGridService.ajustarTamanoGrid(this.gridApi); }
  private resizeTimeoutId: any;

  // ****** PLANTILLA ****** //
  public isLoading$ = this._loadingService.isLoading$;
  public titulo: string;

  // ****** MODELOS ****** //
  public accesoModel: AccesoModel;
  public chorarioModel: ChorarioModel[] = [];
  public selectedRow: ChorarioModel | null = null;
  /**
   * true mientras la columna ACCIONES está plegada (sólo se ve su cabecera).
   * El renderer de la celda lo usa para pintar un único botón que vuelve a
   * desplegarla: sin eso el usuario no sabe que puede pulsar la cabecera.
   */
  public accionesPlegadas = false;


  // ****** PAGINACIÓN Y BÚSQUEDA ****** //
  public paginaActual: number = 1;
  public totalRegistros: number = 0;
  public registrosPorPagina: number = 3;
  public ultimaPagina: number = 1;
  public searchTerm: string = '';

  @ViewChild(CampoBusquedaPaginacionComponent) campoBusquedaPaginacion!: CampoBusquedaPaginacionComponent;

  @ViewChild('menuCtx') menuCtx!: MenuContextualComponent;

  /** Lo que se ofrece para la fila sobre la que se pulso. */
  public opcionesContextuales: OpcionContextual[] = [];

  // ================================================================
  // LAS ACCIONES DE UNA FILA
  // ================================================================
  //
  // Viven aqui y no en el renderizador de la columna ACCIONES porque las usan
  // DOS sitios: esos botones y el menu del boton derecho. Tenerlas duplicadas
  // era garantizar que acabaran distintas.

  clonHorario(fila: any) {
    const modalRef = this.modal.open(SaveHorarioComponent, {
      centered: true,
      size: 'lg',
      backdrop: 'static',
      keyboard: false
    });
    modalRef.componentInstance.registro_selected = fila;
    modalRef.componentInstance.accion = 'clon';

    (async () => {
      try {
        const nuevoHorario = await firstValueFrom(modalRef.componentInstance.registrosE) as any;

        // Verificar que el nuevo horario tiene datos válidos
        if (nuevoHorario && nuevoHorario.id) {
          // Agregar al principio del array y actualizar grid
          this.chorarioModel.unshift(nuevoHorario);
          this.gridApi.setRowData(this.chorarioModel);
        } else {
          console.error('Respuesta inválida en clonación:', nuevoHorario);
        }
      } catch (error) {
        console.error('Error o cancelación en clonación:', error);
      }
    })();
  }

  editHorario(fila: any) {
    const modalRef = this.modal.open(SaveHorarioComponent, {
      centered: true,
      size: 'lg',
      backdrop: 'static',
      keyboard: false
    });
    modalRef.componentInstance.registro_selected = fila;
    modalRef.componentInstance.accion = 'edit';

    (async () => {
      try {
        const response = await firstValueFrom(modalRef.componentInstance.registrosE) as any;
        const index = this.chorarioModel.findIndex(
          registro => registro.id === response.id
        );
        if (index !== -1) {
          this.chorarioModel[index] = response;
          const rowNode = this.gridApi.getRowNode(index.toString());
          rowNode?.setData(response);
        }
      } catch (error) {
        console.error('Error o cancelación en edición:', error);
      }
    })();
  }

  viewHorario(fila: any) {
    const modalRef = this.modal.open(SaveHorarioComponent, {
      centered: true,
      size: 'lg',
      backdrop: 'static',
      keyboard: true
    });
    modalRef.componentInstance.registro_selected = fila;
    modalRef.componentInstance.accion = 'view';
  }

  deleteHorario(fila: any) {
    const modalRef = this.modal.open(DeleteHorarioComponent, {
      centered: true,
      size: 'md',
      backdrop: 'static',
      keyboard: true
    });
    modalRef.componentInstance.registro_selected = fila;

    (async () => {
      try {
        await firstValueFrom(modalRef.componentInstance.registrosE);
        const horarioAEliminar = fila;
        const index = this.chorarioModel.findIndex(
          registro => registro.id === horarioAEliminar.id
        );
        if (index !== -1) {
          this.chorarioModel.splice(index, 1);
          this.gridApi.applyTransaction({ remove: [horarioAEliminar] });
        }
      } catch (error) {
        console.error('Error o cancelación en eliminación:', error);
      }
    })();
  }

  // ================================================================
  // EL MENU DEL BOTON DERECHO
  // ================================================================
  //
  // Las mismas acciones que la columna ACCIONES, pero sin tener que llegar al
  // final de la fila ni desplegar la columna cuando esta plegada.

  /**
   * Clic derecho sobre la rejilla.
   *
   * LO PRIMERO ES ELEGIR LA FILA: el menu actua sobre la fila pulsada, y si
   * no se marcara se veria resaltada una y el menu trabajaria sobre otra.
   */
  onContextMenuGrilla(e: MouseEvent): void {
    const fila = this._appAgGridService.filaDeEventoEnGrilla(e, this.gridApi);
    if (!fila) { return; }          // fuera de las filas: el menu del navegador

    e.preventDefault();

    this.selectedRow = fila;
    this._appAgGridService.marcarFila(this.gridApi, fila);

    this.opcionesContextuales = this.opcionesPara();
    this.menuCtx?.abrir(e);
  }

  /** Que se ofrece, segun lo que permita el perfil de quien mira. */
  private opcionesPara(): OpcionContextual[] {
    return [
      { id: 'ver',      texto: 'Ver el horario', icono: 'fa-eye',
        visible: this.accesoModel?.ver !== false },
      { id: 'editar',   texto: 'Modificar',      icono: 'fa-pen',
        visible: this.accesoModel?.editar === true },
      { id: 'clonar',   texto: 'Clonar',         icono: 'fa-clone',
        visible: this.accesoModel?.crear === true,
        ayuda: 'Crear un horario nuevo copiando los datos de este' },
      { id: 'eliminar', texto: 'Enviar a la papelera', icono: 'fa-trash',
        peligro: true, separadorAntes: true,
        visible: this.accesoModel?.eliminar === true,
        ayuda: 'Conserva sus días; se puede restaurar' },
      { id: 'auditoria', texto: 'Ver auditoria', icono: 'fa-user-secret',
        separadorAntes: true,
        visible: this.accesoModel?.auditar === true,
        ayuda: 'Quien toco este horario y cuando' },
      { id: 'papelera', texto: 'Abrir la papelera', icono: 'fa-trash-can',
        visible: this.accesoModel?.papelera === true,
        ayuda: 'Los horarios eliminados, para restaurarlos' },
    ];
  }

  /** Se eligio una opcion del menu contextual. */
  alElegirContextual(id: string): void {
    const fila = this.selectedRow as any;
    if (!fila) { return; }

    switch (id) {
      case 'ver':       this.viewHorario(fila); break;
      case 'editar':    this.editHorario(fila); break;
      case 'clonar':    this.clonHorario(fila); break;
      case 'eliminar':  this.deleteHorario(fila); break;
      case 'auditoria': this.auditoria(); break;
      case 'papelera':  this.abrirPapelera(); break;
    }
  }


  constructor(
    private modal: NgbModal,
    private activeRoute: ActivatedRoute,
    private route: Router,
    private _appExportExcelService: AppExportExcelService,
    private _appExportCsvService: AppExportCsvService,
    private _appPrintPdfService: AppPrintPdfService,
    public _appAgGridService: AppAgGridService,
    private _loadingService: LoadingService,
    private _seguridadService: SeguridadService,
    private _horarioService: HorarioService,
  ) {
    this.titulo = "Horarios";
    this.accesoModel = this.activeRoute.snapshot.data.access;
  }

  // ****** INIT - DESTROY ****** //
  ngOnInit(): void {
    this.allHorarios();
    this.initializeGrid();
  }

  ngOnDestroy(): void {
    if (this.resizeTimeoutId) { 
      clearTimeout(this.resizeTimeoutId); 
    }
    if (this.limpiandoTimeoutId) {
      clearTimeout(this.limpiandoTimeoutId);
    }
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

  // ****** HOME DE MODULO ****** //
  fun_home() {
    this.route.navigate(['/config/home']);
  }

  // ****** LISTADO DE DATOS PAGINADO ****** //
  async allHorarios(page: number = 1) {
    try {
      this._loadingService.setLoading(true);
      
      const res = await firstValueFrom(
        this._horarioService.allHorarios(page, this.registrosPorPagina, this.searchTerm,
                                         this.filtrosColumna)
      ) as any;
      
      this.chorarioModel = res.body?.data?.data || [];
      
      if (res.body?.data?.meta) {
        this.totalRegistros = res.body.data.meta.total;
        this.registrosPorPagina = res.body.data.meta.per_page;
        this.paginaActual = res.body.data.meta.current_page;
        this.ultimaPagina = res.body.data.meta.last_page;
      }
      
      if (this.gridApi) this.gridApi.setRowData(this.chorarioModel);
      this._loadingService.setLoading(false);
      
    } catch (error: any) {
      this._loadingService.setLoading(false);
      console.error('Error en allHorarios:', error);
    }
  }

  // ****** FUNCIONES DE BÚSQUEDA ****** //
  async onFilterTextBoxChanged(term?: string) {
    if (term !== undefined) this.searchTerm = term;
    this.paginaActual = 1;
    await this.allHorarios(1);
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
    this.allHorarios(1);
  }


  // ****** FUNCIONES DE PAGINACIÓN ****** //
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

  goToPage(page: number): void {
    if (page < 1 || page > this.ultimaPagina) return;
    this.paginaActual = page;
    this.allHorarios(this.paginaActual);
  }

  nextPage(): void {
    this.goToPage(this.paginaActual + 1);
  }

  prevPage(): void {
    this.goToPage(this.paginaActual - 1);
  }

  // ****** FUNCIONES DE AG-GRID ****** //
  /**
   * La papelera de reciclaje.
   *
   * Lo que se «elimina» no se borra: va aquí CON SUS DÍAS, y desde aquí se
   * restaura tal cual o se borra de verdad. Un horario son siete franjas con
   * sus horas, y rehacerlas a mano es un rato.
   */
  abrirPapelera(): void {
    const modalRef = this.modal.open(PapeleraHorariosComponent, {
      centered: true, size: 'xl', backdrop: 'static', keyboard: true
    });
    // Los permisos viajan con el modal: allí hay auditoría, y borrar de
    // verdad pide «vaciar», que es otro permiso distinto de «papelera».
    modalRef.componentInstance.puedeAuditar = this.accesoModel?.auditar === true;
    modalRef.componentInstance.puedeVaciar  = this.accesoModel?.vaciar === true;
    modalRef.componentInstance.cambio.subscribe(() => this.allHorarios(this.paginaActual));
  }
  // ================================================================
  // FILTROS DE LA CABECERA
  // ================================================================
  //
  // Los aplica el SERVIDOR, no la rejilla: esta pantalla pagina, así que
  // ag-Grid sólo tiene las filas de la página y filtrar ahí buscaría dentro
  // de diez. La cabecera sólo recoge lo que el usuario pidió.

  /**
   * Las columnas que llevan filtro, y de qué tipo.
   *
   * Tiene que decir lo mismo que la lista blanca de HorarioController: lo que
   * no esté allí se tira en el servidor, así que ponerlo sólo aquí sería
   * pintar una caja que no filtra. `activo` se queda fuera: es una casilla, y
   * escribir texto para filtrarla no se entiende.
   */
  private readonly COLUMNAS_FILTRABLES: { [campo: string]: 'texto' | 'numero' } = {
    id: 'numero',
    num_dias: 'numero', num_jornadas: 'numero', num_usuarios: 'numero',
    nombre: 'texto', descripcion: 'texto',
    // Las fechas, como texto sobre lo que se ve: «2026-10» busca el mes
    created_at: 'texto', updated_at: 'texto',
  };

  /** Lo que haya pedido la cabecera, tal cual lo da ag-Grid. */
  public filtrosColumna: any = {};

  /** Para no recargar mientras se limpian los filtros de golpe. */
  private limpiando = false;
  /** El temporizador que la baja; se limpia al salir, como el del resize. */
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
    this.allHorarios(1);
  }

  /** Cuántas columnas llevan filtro; el buscador lo enseña y se pone rojo. */
  get cuantasColumnasFiltradas(): number {
    return Object.keys(this.filtrosColumna || {}).length;
  }

  /** Si hay algo que quitar: lo escrito arriba o un filtro de columna. */
  get hayFiltro(): boolean {
    return !!this.searchTerm || this.cuantasColumnasFiltradas > 0;
  }

  initializeGrid(): void {
    this.columnDefs = this.conFiltros([
      {
        headerName: 'Id',
        field: 'id',
        cellStyle: { textAlign: 'center' },
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
        cellStyle: { textAlign: 'left', fontWeight: '600' },
        minWidth: 180,
        maxWidth: 400,
      },
      {
        // El cuadro de la semana: una casilla por día, encendida si ese día
        // tiene franjas. Es lo que se quiere saber de un vistazo —quién puede
        // entrar en sábado— sin abrir la ficha.
        //
        // El `field` es `num_dias` y no `jornadas` para que la caja de filtro
        // busque por número de días; el dibujo no cambia, porque el renderer
        // lee las franjas de params.data.
        headerName: 'Semana',
        field: 'num_dias',
        headerTooltip: 'Los días con acceso; el número pequeño es cuántas franjas tiene ese día. '
                     + 'Se puede filtrar por cuántos días se abre',
        cellStyle: { textAlign: 'center' },
        minWidth: 210,
        maxWidth: 230,
        sortable: false,
        cellRenderer: (params: any) => this.cuadroSemana(params),
      },
      {
        headerName: 'Jornadas',
        field: 'num_jornadas',
        headerTooltip: 'Franjas de acceso en toda la semana (hasta 4 por día)',
        cellStyle: { textAlign: 'center' },
        minWidth: 100,
        maxWidth: 110,
      },
      {
        headerName: 'Horas/semana',
        field: 'horas_semana',
        headerTooltip: 'Cuántas horas a la semana está abierto el acceso',
        cellStyle: { textAlign: 'right' },
        minWidth: 120,
        maxWidth: 130,
        valueFormatter: (params: any) => this.formatoHoras(params.value),
      },
      {
        headerName: 'Usuarios',
        field: 'num_usuarios',
        headerTooltip: 'Usuarios que tienen este horario; con gente no se puede eliminar',
        cellStyle: { textAlign: 'center' },
        minWidth: 100,
        maxWidth: 110,
        cellRenderer: (params: any) => {
          const n = Number(params.value ?? 0);
          return n
            ? `<span class="badge bg-secondary bg-opacity-25 text-body fs-10px"><i class="fa fa-user me-1"></i>${n}</span>`
            : '<span class="text-muted fs-10px">0</span>';
        },
      },
      {
        headerName: 'Descripción',
        field: 'descripcion',
        cellStyle: { textAlign: 'left' },
        minWidth: 200,
        maxWidth: 600,
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
        headerName: 'ACCIONES',
        field: 'actions',
        cellStyle: { display: 'flex', justifyContent: 'center', alignItems: 'center' },
        cellRenderer: ButtonAccionHorario,
        pinned: 'right',
        minWidth: 110,
        maxWidth: 110,
        suppressMenu: true,
        sortable: false,
        resizable: false,
        headerComponentParams: {
          template: `
            <div style="display: flex; align-items: center; justify-content: center; gap: 5px;" title="Ocultar los botones de acción">
              <span>ACCIONES</span>
              <i class="fas fa-arrow-right"></i>
            </div>
          `
        }
      },
    ]);
  }

  /** 40 → "40 h"; 37.5 → "37,5 h". Vacío si no hay nada que mostrar. */
  formatoHoras(valor: any): string {
    if (valor === null || valor === undefined || valor === '') { return ''; }
    const n = Number(valor);
    if (isNaN(n)) { return String(valor); }
    return n.toLocaleString('es-EC', { maximumFractionDigits: 2 }) + ' h';
  }

  /**
   * El cuadro de la semana de una fila: L M X J V S D.
   *
   * El día con franjas sale encendido y con cuántas tiene; el que no,
   * apagado. Se pinta aquí y no con un componente por celda porque no hace
   * nada: sólo se mira.
   */
  private cuadroSemana(params: any): string {
    const jornadas = (params.data?.jornadas ?? []) as any[];
    const letras = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
    const nombres = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

    return '<span class="semana">' + letras.map((letra, i) => {
      const delDia = jornadas.filter(j => j.dia === i + 1 && j.activo !== false);
      if (!delDia.length) {
        return `<span class="semana-dia semana-dia--libre" title="${nombres[i]}: sin acceso">${letra}</span>`;
      }
      const horas = delDia
        .sort((a, b) => (a.jornada ?? 0) - (b.jornada ?? 0))
        .map(j => `${j.hora_inicio}-${j.hora_fin}`)
        .join(' · ');
      const cuantas = delDia.length > 1 ? `<sup>${delDia.length}</sup>` : '';
      return `<span class="semana-dia semana-dia--trabaja" title="${nombres[i]}: ${horas}">${letra}${cuantas}</span>`;
    }).join('') + '</span>';
  }

  onGridReady(params: GridReadyEvent): void {
    this.gridApi = params.api;
    
    setTimeout(() => {
      const headerElement = document.querySelector('.ag-header-cell[col-id="actions"]');
      if (headerElement) {
        headerElement.addEventListener('click', this.handleHeaderAction.bind(this));
        headerElement.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: true });
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
    
    if (touchDuration < 300 && distX < 10 && distY < 10) {
      this.toggleActionsColumn();
      e.preventDefault();
    }
  }

  handleHeaderAction() {
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
      
      actionsCol.minWidth = isCollapsed ? 110 : 50;
      actionsCol.maxWidth = isCollapsed ? 110 : 50;
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
      
      if (window.innerWidth <= 768) {
        actionsCol.minWidth = isCollapsed ? 110 : 50;
        actionsCol.maxWidth = isCollapsed ? 110 : 50;
      }
      
      this.gridApi.setColumnDefs(columnDefs);
      this.gridApi.sizeColumnsToFit();
      
      setTimeout(() => {
        this.gridApi.sizeColumnsToFit();
      }, 100);
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
      que: 'horario',
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
  cambiarActivo(fila: ChorarioModel | null, nodo?: RowNode | null): void {
    if (!fila) { return; }
    if (this._seguridadService.isexpired()) { return; }

    this._appAgGridService.alternarActivo({
      gridApi: this.gridApi,
      filas: this.chorarioModel,
      fila, nodo,
      campo: 'activo',
      enVuelo: this.activoEnVuelo,
      puede: this.accesoModel?.editar === true,
      que: 'horario',
      llamar: (id, activo) => this._horarioService.activarHorario(id, activo),
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

  // ****** ACCIONES ****** //
  // addHorario() {
  //   if (!this._seguridadService.isexpired()) {
  //     const modalRef = this.modal.open(SaveHorarioComponent, {
  //       centered: true,
  //       size: "lg",
  //       backdrop: "static",
  //       keyboard: false
  //     });
  //     modalRef.componentInstance.registro_selected = 0;
  //     modalRef.componentInstance.accion = 'add';
      
  //     (async () => {
  //       try {
  //         const nuevoHorario = await firstValueFrom(modalRef.componentInstance.registrosE) as any;
  //         this.chorarioModel.unshift(nuevoHorario);
  //         this.gridApi.setRowData(this.chorarioModel);
  //       } catch (error) {
  //         console.error('Error o cancelación en creación:', error);
  //       }
  //     })();
  //   }
  // }

addHorario() {
  if (!this._seguridadService.isexpired()) {
    const modalRef = this.modal.open(SaveHorarioComponent, {
      centered: true,
      size: "lg",
      backdrop: "static",
      keyboard: false
    });
    modalRef.componentInstance.registro_selected = 0;
    modalRef.componentInstance.accion = 'add';
    
    (async () => {
      try {
        // Recibir la respuesta directamente (response es el objeto emitido por el modal)
        const nuevoHorario = await firstValueFrom(modalRef.componentInstance.registrosE) as any;
        
        // Agregar al principio del array y actualizar grid
        this.chorarioModel.unshift(nuevoHorario);
        this.gridApi.setRowData(this.chorarioModel);
      } catch (error) {
        console.error('Error o cancelación en creación:', error);
      }
    })();
  }
}


  // ****** IMPRESIÓN ****** //
  /**
   * Trae TODOS los que cumplen el filtro, para exportar.
   *
   * La pantalla pagina en el servidor, así que `chorarioModel` es sólo la
   * página: hasta ahora el reporte salía con esas filas aunque dijera
   * «Listado». Se pide una página del tamaño del total.
   */
  private async obtenerTodosParaExportar(): Promise<any[]> {
    if (this.totalRegistros === 0) { return []; }
    try {
      this._loadingService.setLoading(true);
      const res = await firstValueFrom(
        this._horarioService.allHorarios(1, this.totalRegistros, this.searchTerm,
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
  private readonly CABECERAS_REPORTE = ['ID', 'Nombre', 'Estado', 'Creado', 'Modificado'];

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
      nombrePlural: 'horarios',
      tituloBase: 'Listado de Horarios',
      gridApi: this.gridApi,
      filasDePagina: this.chorarioModel,
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
      title: 'Reporte de Horarios',
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
      title: 'Reporte de Horarios',
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

  // ****** AUDITORIA ****** //
  auditoria() {
    if (!this.selectedRow) return;
    if (!this._seguridadService.isexpired()) {
      const modalRef = this.modal.open(AuditoriaModalComponent, {
        centered: true,
        size: "xl",
        backdrop: "static",
        keyboard: true
      });
      modalRef.componentInstance.tablaNombre = 'chorarios';
      modalRef.componentInstance.registroId = this.selectedRow.id;
    }
  }
}

// ****** COMPONENTE QUE CONTIENE LOS BOTONES DEL AG GRID ****** //
@Component({
  selector: 'app-button-accion-horario',
  standalone: true,
  imports: [ActionButtonsComponent],
  template: `
    @if (AllHorariosComponent.accionesPlegadas) {
      <button type="button"
              class="btn btn-sm btn-outline-primary acciones-desplegar"
              title="Mostrar los botones de acción"
              aria-label="Mostrar los botones de acción"
              (click)="AllHorariosComponent.toggleActionsColumn()">
        <i class="fas fa-bars"></i>
      </button>
    } @else {
    <app-action-buttons 
      [accesoModel]="AllHorariosComponent.accesoModel"
      [buttonView]="true"
      [buttonEdit]="true"
      [buttonClone]="true"
      [buttonDelete]="true"
      (view)="viewHorario()"
      (edit)="editHorario()"
      (clone)="clonHorario()"
      (delete)="deleteHorario()">
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
export class ButtonAccionHorario {
  private params: any;

  constructor(
    private modalService: NgbModal,
    public AllHorariosComponent: AllHorariosComponent
  ) { }

  agInit(params: any): void {
    this.params = params;
  }

  // Las cuatro acciones viven en AllHorariosComponent: las comparten estos
  // botones y el menu del boton derecho. Aqui solo se les pasa la fila.
  clonHorario()   { this.AllHorariosComponent.clonHorario(this.params.data); }
  editHorario()   { this.AllHorariosComponent.editHorario(this.params.data); }
  viewHorario()   { this.AllHorariosComponent.viewHorario(this.params.data); }
  deleteHorario() { this.AllHorariosComponent.deleteHorario(this.params.data); }

}