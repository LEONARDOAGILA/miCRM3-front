import { Component, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { GridApi, GridReadyEvent, CellClickedEvent } from 'ag-grid-community';
import { AgGridModule, AgGridAngular } from 'ag-grid-angular';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ActivatedRoute, Router } from '@angular/router';

//   ******   SERVICIOS   ******  //
import { AppPrintPdfService } from '../../../../../service/app-printPdf.service';
import { AppExportExcelService } from '../../../../../service/app-exportExcel.service';
import { AppExportCsvService } from '../../../../../service/app-exportCsv.service';
import { AppAgGridService } from '../../../../../service/app-agGrid.service';
import { LoadingService } from '../../../../../service/loading.service';
import { SeguridadService } from '../../../services/seguridad.service';
import { TipoUsuarioService } from '../../../services/tipoUsuario.service';

//   ******   MODELOS   ******  //
import { AccesoModel } from '../../../interfaces/accesoModel';
import { TipoUsuarioModel } from '../../../interfaces/tipoUsuarioModel';

//   ******   COMPONENTES   ******  //
import { PanelModule } from '../../../../../components/panel/panel.module';
import { CampoBusquedaPaginacionComponent } from '../../../../../components/campos/campoBusquedaPaginacion/campoBusquedaPaginacion.component';
import { AuditoriaModalComponent } from '../../../../../components/auditoria-modal/auditoria-modal.component';
import { SaveTipoUsuarioComponent } from '../saveTipoUsuario/saveTipoUsuario.component';
import { DeleteTipoUsuarioComponent } from '../deleteTipoUsuario/deleteTipoUsuario.component';

/**
 * Tipos de usuario: la clase de cada usuario —del sistema, de la página web,
 * freelance, temporal…— con su vigencia.
 *
 * NO DA PERMISOS, y la pantalla lo dice: lo que un usuario puede hacer lo
 * deciden su grupo y su perfil. Lo que sí hace este catálogo es cortar el
 * acceso cuando un tipo deja de estar vigente.
 *
 * Mismo molde que allHorarios (rejilla + búsqueda + paginación propia +
 * auditoría + exportar), pero standalone y con los botones de acción en HTML
 * con `data-accion`, que es el patrón de ag-Grid de la casa.
 */
@Component({
  selector: 'app-allTiposUsuario',
  standalone: true,
  imports: [CommonModule, AgGridModule, PanelModule, CampoBusquedaPaginacionComponent],
  templateUrl: './allTiposUsuario.component.html',
  styleUrls: ['./allTiposUsuario.component.css'],
})
export class AllTiposUsuarioComponent implements OnInit, OnDestroy {

  // ****** AG-GRID ****** //
  @ViewChild(AgGridAngular) agGrid!: AgGridAngular;
  public gridApi!: GridApi;
  public columnDefs: any[] = [];
  private resizeTimeoutId: any;

  @HostListener('window:resize', ['$event'])
  onResize(event: Event): void { this.ajustarTamanoGrid(); }

  // ****** PLANTILLA ****** //
  public isLoading$ = this._loadingService.isLoading$;
  public titulo: string;

  // ****** MODELOS ****** //
  public accesoModel: AccesoModel;
  public tiposUsuario: TipoUsuarioModel[] = [];
  public selectedRow: TipoUsuarioModel | null = null;

  // ****** PAGINACIÓN Y BÚSQUEDA ****** //
  public paginaActual: number = 1;
  public totalRegistros: number = 0;
  public registrosPorPagina: number = 10;
  public ultimaPagina: number = 1;
  public searchTerm: string = '';

  @ViewChild(CampoBusquedaPaginacionComponent) campoBusquedaPaginacion!: CampoBusquedaPaginacionComponent;

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
    private _tipoUsuarioService: TipoUsuarioService,
  ) {
    this.titulo = 'Tipos de usuario';
    this.accesoModel = this.activeRoute.snapshot.data['access'];
  }

  // ****** INIT - DESTROY ****** //
  ngOnInit(): void {
    this.allTiposUsuario();
    this.initializeGrid();
  }

  ngOnDestroy(): void {
    if (this.resizeTimeoutId) { clearTimeout(this.resizeTimeoutId); }
  }

  // ****** HOME DE MODULO ****** //
  fun_home() {
    this.route.navigate(['/seguridad/home-seguridad']);
  }

  // ****** LISTADO DE DATOS PAGINADO ****** //
  async allTiposUsuario(page: number = 1) {
    try {
      this._loadingService.setLoading(true);

      const res = await firstValueFrom(
        this._tipoUsuarioService.allTiposUsuario(page, this.registrosPorPagina, this.searchTerm)
      ) as any;

      this.tiposUsuario = res.body?.data?.data || [];

      if (res.body?.data?.meta) {
        this.totalRegistros = res.body.data.meta.total;
        this.registrosPorPagina = res.body.data.meta.per_page;
        this.paginaActual = res.body.data.meta.current_page;
        this.ultimaPagina = res.body.data.meta.last_page;
      }

      if (this.gridApi) { this.gridApi.setRowData(this.tiposUsuario); }
      this._loadingService.setLoading(false);

    } catch (error: any) {
      this._loadingService.setLoading(false);
      console.error('Error en allTiposUsuario:', error);
    }
  }

  // ****** FUNCIONES DE BÚSQUEDA ****** //
  async onFilterTextBoxChanged(term?: string) {
    if (term !== undefined) { this.searchTerm = term; }
    this.paginaActual = 1;
    await this.allTiposUsuario(1);
  }

  clearAllFilters() {
    this.campoBusquedaPaginacion?.reset();
    this.searchTerm = '';
    this.allTiposUsuario(1);
  }

  // ****** FUNCIONES DE PAGINACIÓN ****** //
  /** Primer registro mostrado; 0 sin resultados. */
  public get desde(): number {
    return this.totalRegistros === 0 ? 0 : (this.paginaActual - 1) * this.registrosPorPagina + 1;
  }

  /** Último registro mostrado, sin pasarse del total. */
  public get hasta(): number {
    return Math.min(this.paginaActual * this.registrosPorPagina, this.totalRegistros);
  }

  firstPage(): void { if (this.paginaActual !== 1) { this.goToPage(1); } }
  ultimaPagina2(): void { if (this.paginaActual !== this.ultimaPagina) { this.goToPage(this.ultimaPagina); } }
  nextPage(): void { this.goToPage(this.paginaActual + 1); }
  prevPage(): void { this.goToPage(this.paginaActual - 1); }

  goToPage(page: number): void {
    if (page < 1 || page > this.ultimaPagina) { return; }
    this.paginaActual = page;
    this.allTiposUsuario(this.paginaActual);
  }

  // ****** FUNCIONES DE AG-GRID ****** //
  initializeGrid(): void {
    this.columnDefs = [
      {
        headerName: 'Id',
        field: 'id',
        cellStyle: { textAlign: 'center' },
        minWidth: 70,
        maxWidth: 70,
      },
      {
        headerName: 'Código',
        field: 'codigo',
        cellStyle: { textAlign: 'left' },
        minWidth: 120,
        maxWidth: 160,
      },
      {
        headerName: 'Nombre',
        field: 'nombre',
        cellStyle: { textAlign: 'left' },
        minWidth: 180,
        maxWidth: 1500,
        // Con su icono y su color, que son los que se ven en las rejillas de
        // usuarios: así se comprueba aquí mismo cómo va a quedar
        cellRenderer: (p: any) => {
          const icono = p.data?.icono ? `<i class="${p.data.icono} me-1"></i>` : '';
          return `<span class="badge ${p.data?.color || 'bg-secondary'} fs-10px">${icono}${p.value ?? ''}</span>`;
        },
      },
      {
        headerName: 'Vigencia',
        field: 'fecha_inicio',
        cellStyle: { textAlign: 'center' },
        minWidth: 190,
        maxWidth: 220,
        sortable: false,
        // Las dos fechas en una columna: separadas ocupan el doble y casi
        // siempre están vacías (un tipo normal no caduca)
        cellRenderer: (p: any) => {
          const desde = p.data?.fecha_inicio;
          const hasta = p.data?.fecha_fin;
          if (!desde && !hasta) { return `<span class="text-muted">Sin límite</span>`; }
          const f = (x: string | null) => x ? x.split('-').reverse().join('/') : '—';
          return `${f(desde)} <i class="fa fa-arrow-right fa-xs text-muted mx-1"></i> ${f(hasta)}`;
        },
      },
      {
        headerName: 'Estado',
        field: 'vigente',
        cellStyle: { textAlign: 'center' },
        minWidth: 120,
        maxWidth: 140,
        // Vigente no es lo mismo que activo: `activo` lo apaga un
        // administrador, la vigencia la decide el calendario. Se distingue,
        // porque «no vigente» y «de baja» se arreglan de maneras distintas.
        cellRenderer: (p: any) => {
          if (!p.data?.activo) { return `<span class="badge bg-secondary fs-10px">De baja</span>`; }
          return p.value
            ? `<span class="badge bg-success fs-10px">Vigente</span>`
            : `<span class="badge bg-danger fs-10px" title="Activo, pero fuera de sus fechas">Fuera de fecha</span>`;
        },
      },
      {
        headerName: 'Usuarios',
        field: 'en_uso',
        cellStyle: { textAlign: 'center' },
        minWidth: 100,
        maxWidth: 110,
        cellRenderer: (p: any) =>
          p.value > 0
            ? `<span class="badge bg-light text-dark fs-10px">${p.value}</span>`
            : `<span class="text-muted">—</span>`,
      },
      {
        headerName: 'Orden',
        field: 'orden',
        cellStyle: { textAlign: 'center' },
        minWidth: 90,
        maxWidth: 90,
      },
      {
        headerName: 'ACCIONES',
        field: 'actions',
        cellStyle: { display: 'flex', justifyContent: 'center', alignItems: 'center' },
        pinned: 'right',
        minWidth: 120,
        maxWidth: 120,
        suppressMenu: true,
        sortable: false,
        resizable: false,
        // Botones en HTML con data-accion y un único manejador en
        // onCellClicked, que es el patrón de ag-Grid de la casa
        cellRenderer: (p: any) => {
          const botones: string[] = [
            `<button type="button" class="btn-icon btn-ver" data-accion="ver" title="Ver"><i class="fa fa-eye"></i></button>`
          ];
          if (this.accesoModel?.editar) {
            botones.push(`<button type="button" class="btn-icon btn-editar" data-accion="editar" title="Modificar"><i class="fa fa-pen"></i></button>`);
          }
          if (this.accesoModel?.eliminar) {
            // Un tipo en uso no se puede borrar (lo rechaza la base): se avisa
            // aquí en vez de dejar que lo intente
            const enUso = (p.data?.en_uso ?? 0) > 0;
            botones.push(`<button type="button" class="btn-icon btn-eliminar" data-accion="eliminar"
                            title="${enUso ? 'En uso: desactívelo en vez de borrarlo' : 'Eliminar'}"
                            ${enUso ? 'disabled' : ''}><i class="fa fa-trash"></i></button>`);
          }
          return `<span class="tu-acciones">${botones.join('')}</span>`;
        },
      },
    ];
  }

  onGridReady(params: GridReadyEvent): void {
    this.gridApi = params.api;
    this._appAgGridService.ajustarTamanoGrid(this.gridApi);
  }

  ajustarTamanoGrid() {
    if (!this.gridApi) { return; }
    if (this.resizeTimeoutId) { clearTimeout(this.resizeTimeoutId); }
    this.resizeTimeoutId = setTimeout(() => this._appAgGridService.ajustarTamanoGrid(this.gridApi), 100);
  }

  /** ↑ / ↓ seleccionan la fila como un clic. */
  navegarConTeclado = this._appAgGridService.navegacionConFlechas((fila: any) => this.selectedRow = fila);

  /** Un único manejador para toda la columna de acciones (ver data-accion). */
  onCellClicked(e: CellClickedEvent): void {
    this.selectedRow = e.data;

    const boton = (e.event?.target as HTMLElement)?.closest('[data-accion]') as HTMLButtonElement | null;
    if (!boton || boton.disabled) { return; }

    switch (boton.dataset['accion']) {
      case 'ver':      this.abrirFicha(e.data, 'view'); break;
      case 'editar':   this.abrirFicha(e.data, 'edit'); break;
      case 'eliminar': this.eliminar(e.data); break;
    }
  }

  // ****** ACCIONES ****** //
  addTipoUsuario(): void {
    this.abrirFicha(0, 'add');
  }

  /**
   * La ficha, en sus cuatro modos.
   *
   * Al crear y al clonar la fila nueva se mete arriba de la rejilla sin volver
   * a pedir la página; al modificar se reemplaza en su sitio. Es lo que hace el
   * resto de los CRUD y evita el salto visual de recargar.
   */
  private abrirFicha(registro: any, accion: 'add' | 'edit' | 'view' | 'clon'): void {
    if (this._seguridadService.isexpired()) { return; }

    const modalRef = this.modal.open(SaveTipoUsuarioComponent, {
      centered: true,
      size: 'lg',
      backdrop: 'static',
      keyboard: accion === 'view',
    });
    modalRef.componentInstance.registro_selected = registro;
    modalRef.componentInstance.accion = accion;

    if (accion === 'view') { return; }

    (async () => {
      try {
        const guardado = await firstValueFrom(modalRef.componentInstance.registrosE) as any;
        if (!guardado?.id) { return; }

        const i = this.tiposUsuario.findIndex(t => t.id === guardado.id);
        if (i !== -1) {
          this.tiposUsuario[i] = guardado;
        } else {
          this.tiposUsuario.unshift(guardado);
          this.totalRegistros++;
        }
        this.gridApi?.setRowData(this.tiposUsuario);
      } catch (error) {
        console.error('Error o cancelación al guardar:', error);
      }
    })();
  }

  private eliminar(registro: any): void {
    if (this._seguridadService.isexpired()) { return; }

    const modalRef = this.modal.open(DeleteTipoUsuarioComponent, {
      centered: true,
      size: 'md',
      backdrop: 'static',
      keyboard: true,
    });
    modalRef.componentInstance.registro_selected = registro;

    (async () => {
      try {
        await firstValueFrom(modalRef.componentInstance.registrosE);
        const i = this.tiposUsuario.findIndex(t => t.id === registro.id);
        if (i !== -1) {
          this.tiposUsuario.splice(i, 1);
          this.totalRegistros--;
          this.gridApi?.applyTransaction({ remove: [registro] });
        }
      } catch (error) {
        console.error('Error o cancelación al eliminar:', error);
      }
    })();
  }

  // ****** AUDITORIA ****** //
  auditoria(): void {
    if (!this.selectedRow || this._seguridadService.isexpired()) { return; }

    const modalRef = this.modal.open(AuditoriaModalComponent, {
      centered: true,
      size: 'xl',
      backdrop: 'static',
      keyboard: true,
    });
    modalRef.componentInstance.tablaNombre = 'tipos_usuarios';
    modalRef.componentInstance.registroId = this.selectedRow.id;
  }

  // ****** IMPRESIÓN Y EXPORTACIÓN ****** //
  /** Las mismas filas para las tres salidas, en el orden en que se ven. */
  private filasParaReporte(): any[][] {
    return this.tiposUsuario.map(t => [
      t.id,
      t.codigo,
      t.nombre,
      t.fecha_inicio || '—',
      t.fecha_fin || '—',
      t.activo === false ? 'De baja' : (t.vigente ? 'Vigente' : 'Fuera de fecha'),
      t.en_uso ?? 0,
    ]);
  }

  private readonly cabecerasReporte = ['ID', 'Código', 'Nombre', 'Desde', 'Hasta', 'Estado', 'Usuarios'];

  async printPdf() {
    this._appPrintPdfService.generarReporte({
      tamanoPapel: 'A4',
      orientacion: 'p',
      title: 'Reporte de Tipos de Usuario',
      titleTable: 'Listado de Tipos de Usuario',
      headers: this.cabecerasReporte,
      data: this.filasParaReporte(),
      piePagina: 'Pie de página - Mi Empresa en Desarrollo S.A....'
    });
  }

  async exportExcel() {
    this._appExportExcelService.generarReporteExcel({
      tamanoPapel: 'A4',
      orientacion: 'p',
      title: 'Reporte de Tipos de Usuario',
      titleTable: 'Listado de Tipos de Usuario',
      headers: this.cabecerasReporte,
      data: this.filasParaReporte(),
      piePagina: 'Pie de página - Mi Empresa en Desarrollo S.A....'
    });
  }

  async exportCsv() {
    this._appExportCsvService.generarReporteCSV({
      headers: this.cabecerasReporte,
      data: this.filasParaReporte(),
    });
  }
}
