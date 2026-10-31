import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, firstValueFrom } from 'rxjs';
import { GridApi, GridReadyEvent } from 'ag-grid-community';
import { AgGridModule } from 'ag-grid-angular';
import { NgSelectModule } from '@ng-select/ng-select';
import { NgApexchartsModule } from 'ng-apexcharts';
import { ToastrService } from 'ngx-toastr';

///   SERVICIOS    ///
import { VentaDemoService } from '../../services/ventaDemo.service';
import { AppAgGridService } from '../../../../service/app-agGrid.service';
import { AppPrintPdfService } from '../../../../service/app-printPdf.service';
import { AppExportExcelService } from '../../../../service/app-exportExcel.service';
import { AppExportCsvService } from '../../../../service/app-exportCsv.service';
import { LoadingService } from '../../../../service/loading.service';

///   MODELOS    ///
import {
  FiltrosVentaDemo, GRAFICOS_REPORTE, OpcionReporte, OpcionesVentaDemo,
  PivoteVentaDemo, TipoGrafico, VentaDemoModel,
} from '../../interfaces/ventaDemoModel';
import { AccesoModel } from '../../../seguridad/interfaces/accesoModel';

///   COMPONENTES    ///
import { PanelComponent } from '../../../../components/panel/panel.component';
import { FilasEstirablesDirective } from '../../../../core/directives/filasEstirables.directive';

/**
 * TABLERO DE VENTAS (DEMO).
 *
 * Un armador de reportes al estilo de una tabla dinámica: se elige qué va en
 * las FILAS, qué en las COLUMNAS, qué se MIDE y con qué OPERACIÓN, y la misma
 * respuesta pinta la tabla y el gráfico.
 *
 * TODA LA AGREGACIÓN LA HACE PostgreSQL. Agrupar y pivotar dentro de ag-Grid
 * es de la edición Enterprise —aquí está la Community— y, aunque se comprara,
 * pivotar en el navegador obliga a bajarse TODAS las filas: con 3.000 da
 * igual, con 500.000 no. El servidor manda las doce celdas que se ven.
 *
 * LAS COLUMNAS SE ARMAN EN CALIENTE: no hay `columnDefs` fijos, porque las
 * columnas SON los datos (los meses que haya, las categorías que haya). Eso
 * obliga a dos cosas que no se ven al leer el código: que el total de cada
 * fila venga del servidor —no se suman las celdas, que con un promedio daría
 * mal— y que la fila de totales sea `pinnedBottomRowData`, no una fila más.
 *
 * Los datos son INVENTADOS (reportes.ventas_demo): no hay nada real aquí.
 */
@Component({
  selector: 'app-ventasDemo',
  templateUrl: './ventasDemo.component.html',
  styleUrls: ['./ventasDemo.component.css'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    CommonModule, FormsModule, AgGridModule, NgSelectModule, NgApexchartsModule,
    PanelComponent, FilasEstirablesDirective,
  ],
})
export class VentasDemoComponent implements OnInit, OnDestroy {

  public titulo = 'Ventas (demo)';
  public accesoModel: AccesoModel;
  public isLoading$ = this._loadingService.isLoading$;

  /** 'pivote' | 'detalle' */
  public pestana: 'pivote' | 'detalle' = 'pivote';

  // ---------- Lo que se puede elegir (lo manda el servidor) ----------
  public opciones: OpcionesVentaDemo | null = null;
  public dimensiones: OpcionReporte[] = [];
  /** Las mismas más «(ninguna)», para el desplegable de columnas. */
  public dimensionesConNinguna: OpcionReporte[] = [];
  public medidas: OpcionReporte[] = [];
  public agregaciones: OpcionReporte[] = [];
  public readonly graficos = GRAFICOS_REPORTE;

  // ---------- El armado ----------
  public filas = 'categoria';
  public columnas = 'mes';
  public medida = 'total';
  public agregacion = 'SUM';
  public orden: 'valor' | 'etiqueta' = 'valor';
  public tipoGrafico: TipoGrafico = 'apiladas';
  public verGrafico = true;

  // ---------- Los filtros ----------
  public filtros: FiltrosVentaDemo = { desde: null, hasta: null, buscar: null,
                                       region: [], categoria: [], canal: [], vendedor: [] };

  // ---------- El resultado ----------
  public pivote: PivoteVentaDemo | null = null;
  public columnDefs: any[] = [];
  public filasGrid: any[] = [];
  public filaTotales: any[] = [];
  private gridApi: GridApi | null = null;

  // ---------- El gráfico ----------
  public grafico: any = null;

  // ---------- El detalle ----------
  public detalle: VentaDemoModel[] = [];
  public columnDefsDetalle: any[] = [];
  private gridDetalle: GridApi | null = null;
  public paginaDetalle = 1;
  public porPaginaDetalle = 25;
  public totalDetalle = 0;
  public ultimaPaginaDetalle = 1;
  public ordenarDetalle = 'fecha';
  public sentidoDetalle: 'ASC' | 'DESC' = 'DESC';

  private readonly destruir$ = new Subject<void>();
  private temporizador: any = null;

  @HostListener('window:resize')
  alRedimensionar(): void { this.ajustarGrid(); }

  constructor(
    private host: ElementRef<HTMLElement>,
    private route: Router,
    private activeRoute: ActivatedRoute,
    private _toastr: ToastrService,
    private _loadingService: LoadingService,
    private _ventaDemoService: VentaDemoService,
    public _appAgGridService: AppAgGridService,
    private _appPrintPdfService: AppPrintPdfService,
    private _appExportExcelService: AppExportExcelService,
    private _appExportCsvService: AppExportCsvService,
  ) {
    this.accesoModel = this.activeRoute.snapshot.data['access'];
  }

  async ngOnInit(): Promise<void> {
    this.armarColumnasDetalle();
    await this.cargarOpciones();
    await this.recargar();
  }

  ngOnDestroy(): void {
    this.destruir$.next();
    this.destruir$.complete();
    if (this.temporizador) { clearTimeout(this.temporizador); }
  }

  fun_home(): void { this.route.navigate(['/reportes']); }

  // ================================================================
  // DATOS
  // ================================================================

  private async cargarOpciones(): Promise<void> {
    try {
      const res: any = await firstValueFrom(this._ventaDemoService.opciones());
      if (res?.status !== 'success') { return; }
      this.opciones = res.data;
      this.dimensiones = res.data?.dimensiones ?? [];
      this.medidas = res.data?.medidas ?? [];
      this.agregaciones = res.data?.agregaciones ?? [];
      // «(ninguna)» en columnas convierte el pivote en una lista simple, que
      // es lo que se quiere la mitad de las veces.
      this.dimensionesConNinguna = [{ id: 'ninguna', name: '(ninguna)' }, ...this.dimensiones];

      // Las fechas arrancan en los últimos doce meses: el tablero tiene que
      // enseñar algo al abrirse, no una pantalla en blanco pidiendo filtros.
      const hasta = res.data?.rango?.hasta;
      if (hasta && !this.filtros.hasta) {
        const h = new Date(hasta + 'T00:00:00');
        const d = new Date(h.getFullYear(), h.getMonth() - 11, 1);
        this.filtros.hasta = hasta;
        this.filtros.desde = this.aTexto(d);
      }
    } catch (error) {
      // El AuthInterceptor ya enseña el error HTTP
      console.error('Error al cargar las opciones del tablero:', error);
    }
  }

  /** Vuelve a pedir lo que toque según la pestaña. */
  async recargar(): Promise<void> {
    if (this.pestana === 'pivote') { await this.cargarPivote(); }
    else { await this.cargarDetalle(1); }
  }

  async cargarPivote(): Promise<void> {
    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._ventaDemoService.pivote(
        this.filas, this.columnas, this.medida, this.agregacion, this.filtros, this.orden));

      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo armar el reporte', 'Error');
        return;
      }

      this.pivote = res.data;
      this.armarColumnas();
      this.armarFilas();
      this.armarGrafico();

    } catch (error: any) {
      // Un 422 es un error del usuario (demasiadas columnas, dimensión que no
      // existe): el interceptor ya lo enseña, aquí sólo se deja la tabla
      // vacía para que no quede lo de antes, que ya no corresponde.
      console.error('Error al armar el pivote:', error);
      this.pivote = null;
      this.columnDefs = [];
      this.filasGrid = [];
      this.filaTotales = [];
      this.grafico = null;
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  async cargarDetalle(pagina: number = 1): Promise<void> {
    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._ventaDemoService.detalle(
        pagina, this.porPaginaDetalle, this.filtros, this.ordenarDetalle, this.sentidoDetalle));

      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo obtener el detalle', 'Error');
        return;
      }

      this.detalle = res.data?.data ?? [];
      const meta = res.data?.meta;
      if (meta) {
        this.totalDetalle = meta.total;
        this.porPaginaDetalle = meta.per_page;
        this.paginaDetalle = meta.current_page;
        this.ultimaPaginaDetalle = meta.last_page;
      }
      this.gridDetalle?.setGridOption('rowData', this.detalle);

    } catch (error) {
      console.error('Error al cargar el detalle:', error);
      this.detalle = [];
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  // ================================================================
  // LA TABLA
  // ================================================================

  /** ¿La medida elegida es dinero? Decide el formato de toda la tabla. */
  public get esDinero(): boolean {
    return this.medidas.find(m => m.id === this.medida)?.dinero === true;
  }

  public get nombreMedida(): string {
    return this.medidas.find(m => m.id === this.medida)?.name ?? this.medida;
  }

  public get nombreFilas(): string {
    return this.dimensiones.find(d => d.id === this.filas)?.name ?? this.filas;
  }

  public get nombreColumnas(): string {
    return this.dimensionesConNinguna.find(d => d.id === this.columnas)?.name ?? this.columnas;
  }

  /** Un número como se lee aquí: 1.234,56 y con su símbolo si es plata. */
  public formatear(valor: any): string {
    const n = Number(valor);
    if (valor === null || valor === undefined || Number.isNaN(n)) { return ''; }
    const texto = new Intl.NumberFormat('es-EC', {
      minimumFractionDigits: this.esDinero ? 2 : 0,
      maximumFractionDigits: this.esDinero ? 2 : 0,
    }).format(n);
    return this.esDinero ? '$ ' + texto : texto;
  }

  /**
   * Las columnas, armadas con lo que vino.
   *
   * La primera —la dimensión de las filas— va FIJA a la izquierda y el total
   * fijo a la derecha: con doce meses la tabla se desplaza, y sin fijarlas se
   * pierde de vista qué fila se está leyendo y cuánto suma.
   */
  private armarColumnas(): void {
    if (!this.pivote) { this.columnDefs = []; return; }

    const columnas = this.pivote.columnas ?? [];
    const numerica = {
      type: 'numericColumn',
      cellStyle: { textAlign: 'right' },
      valueFormatter: (p: any) => this.formatear(p.value),
      minWidth: 110,
    };

    this.columnDefs = [
      {
        headerName: this.nombreFilas,
        field: 'grupo',
        pinned: 'left',
        minWidth: 180,
        maxWidth: 320,
        cellStyle: { fontWeight: '600' },
        tooltipField: 'grupo',
      },
      ...columnas.map(c => ({
        headerName: c,
        field: 'c_' + c,
        headerTooltip: this.nombreColumnas + ': ' + c,
        ...numerica,
      })),
      {
        headerName: 'Total',
        field: 'total',
        pinned: 'right',
        minWidth: 130,
        cellStyle: { textAlign: 'right', fontWeight: '700' },
        valueFormatter: (p: any) => this.formatear(p.value),
      },
    ];
  }

  /**
   * Las filas, y la de totales aparte.
   *
   * La de totales es `pinnedBottomRowData` y NO una fila más del modelo: si
   * fuera una fila normal, se ordenaría con las demás y acabaría en medio de
   * la tabla, y además contaría al exportar.
   */
  private armarFilas(): void {
    if (!this.pivote) { this.filasGrid = []; this.filaTotales = []; return; }

    this.filasGrid = (this.pivote.filas ?? []).map(f => {
      const fila: any = { grupo: f.grupo, total: f.total };
      (this.pivote!.columnas ?? []).forEach(c => { fila['c_' + c] = f.valores?.[c] ?? null; });
      return fila;
    });

    const totales: any = { grupo: 'TOTAL', total: this.pivote.gran_total };
    (this.pivote.columnas ?? []).forEach(c => { totales['c_' + c] = this.pivote!.totales?.[c] ?? null; });
    this.filaTotales = [totales];

    this.gridApi?.setGridOption('rowData', this.filasGrid);
    this.gridApi?.setPinnedBottomRowData(this.filaTotales);
    this.ajustarGrid();
  }

  onGridReady(e: GridReadyEvent): void {
    this.gridApi = e.api;
    this.gridApi.setPinnedBottomRowData(this.filaTotales);
    this.ajustarGrid();
  }

  onGridDetalleReady(e: GridReadyEvent): void {
    this.gridDetalle = e.api;
    this.gridDetalle.setGridOption('rowData', this.detalle);
    this._appAgGridService.ajustarTamanoGrid(this.gridDetalle);
  }

  /**
   * Reparte el ancho.
   *
   * `sizeColumnsToFit` con el `minWidth` de cada columna puesto: si las doce
   * columnas caben, se reparten el sitio; y si no caben, ag-Grid respeta el
   * mínimo y deja barra de desplazamiento, que es lo que se quiere. Forzarlas
   * a entrar dejaría celdas de 40px donde no se lee ninguna cifra, y la
   * columna de totales —fija a la derecha— se ve igual con scroll o sin él.
   */
  private ajustarGrid(): void {
    if (this.temporizador) { clearTimeout(this.temporizador); }
    this.temporizador = setTimeout(() => {
      this.gridApi?.sizeColumnsToFit();
      if (this.gridDetalle) { this._appAgGridService.ajustarTamanoGrid(this.gridDetalle); }
    }, 80);
  }

  // ================================================================
  // EL GRÁFICO
  // ================================================================

  /**
   * El gráfico sale de LO MISMO que la tabla, no de otra consulta.
   *
   * Y se queda en las doce primeras filas: con cuarenta series, la leyenda
   * ocupa más que el dibujo y no se distingue ningún color. Lo dice el pie
   * del gráfico cuando recorta.
   */
  public filasEnGrafico = 12;

  public get recortadoElGrafico(): boolean {
    return (this.pivote?.filas?.length ?? 0) > this.filasEnGrafico;
  }

  private armarGrafico(): void {
    if (!this.pivote || !this.pivote.filas?.length) { this.grafico = null; return; }

    const filas = this.pivote.filas.slice(0, this.filasEnGrafico);
    const columnas = this.pivote.columnas ?? [];
    const esPastel = this.tipoGrafico === 'pastel';
    const formatear = (v: any) => this.formatear(v);

    if (esPastel) {
      this.grafico = {
        series: filas.map(f => Number(f.total) || 0),
        labels: filas.map(f => f.grupo),
        chart: { type: 'donut', height: 320, toolbar: { show: false }, fontFamily: 'inherit' },
        legend: { position: 'bottom' },
        dataLabels: { enabled: true, formatter: (v: number) => v.toFixed(1) + '%' },
        tooltip: { y: { formatter: formatear } },
        stroke: { width: 1 },
      };
      return;
    }

    const apilado = this.tipoGrafico === 'apiladas';
    const tipo = this.tipoGrafico === 'lineas' ? 'line'
               : this.tipoGrafico === 'area' ? 'area' : 'bar';

    this.grafico = {
      series: filas.map(f => ({
        name: f.grupo,
        data: columnas.map(c => Number(f.valores?.[c] ?? 0)),
      })),
      chart: {
        type: tipo, height: 340, stacked: apilado,
        toolbar: { show: false }, fontFamily: 'inherit',
        animations: { enabled: true, speed: 300 },
      },
      xaxis: { categories: columnas, labels: { rotate: -45, rotateAlways: columnas.length > 8 } },
      yaxis: { labels: { formatter: formatear } },
      dataLabels: { enabled: false },
      stroke: { width: tipo === 'bar' ? 0 : 2, curve: 'smooth' },
      fill: { opacity: tipo === 'area' ? 0.25 : 1 },
      legend: { position: 'bottom' },
      tooltip: { y: { formatter: formatear } },
      plotOptions: { bar: { columnWidth: '70%', borderRadius: 3 } },
    };
  }

  // ================================================================
  // LA BARRA DE ARMADO
  // ================================================================

  /** Cambió algo del armado: se vuelve a pedir. */
  async alCambiarArmado(): Promise<void> {
    // Filas y columnas iguales no es un cruce, es una diagonal: se avisa y se
    // deja la de columnas en «(ninguna)», que es lo que de verdad se quería.
    if (this.filas === this.columnas) {
      this.columnas = 'ninguna';
      this._toastr.info('Las filas y las columnas no pueden ser lo mismo: se quitó el cruce',
                        'Reporte', { timeOut: 4000 });
    }
    await this.cargarPivote();
  }

  /** Cambió el tipo de gráfico: no hace falta volver al servidor. */
  alCambiarGrafico(): void { this.armarGrafico(); }

  async alCambiarFiltro(): Promise<void> { await this.recargar(); }

  async limpiarFiltros(): Promise<void> {
    this.filtros = { desde: this.filtros.desde, hasta: this.filtros.hasta, buscar: null,
                     region: [], categoria: [], canal: [], vendedor: [] };
    await this.recargar();
  }

  public get cuantosFiltros(): number {
    let n = 0;
    ['region', 'categoria', 'canal', 'vendedor'].forEach(k => {
      n += ((this.filtros as any)[k] ?? []).length ? 1 : 0;
    });
    if (this.filtros.buscar) { n++; }
    return n;
  }

  async irAPestana(cual: 'pivote' | 'detalle'): Promise<void> {
    if (this.pestana === cual) { return; }
    this.pestana = cual;
    await this.recargar();
  }

  // ---------- Paginación del detalle ----------
  async paginaAnterior(): Promise<void> { if (this.paginaDetalle > 1) { await this.cargarDetalle(this.paginaDetalle - 1); } }
  async paginaSiguiente(): Promise<void> { if (this.paginaDetalle < this.ultimaPaginaDetalle) { await this.cargarDetalle(this.paginaDetalle + 1); } }
  async primeraPagina(): Promise<void> { if (this.paginaDetalle !== 1) { await this.cargarDetalle(1); } }
  async ultimaPagina(): Promise<void> { if (this.paginaDetalle !== this.ultimaPaginaDetalle) { await this.cargarDetalle(this.ultimaPaginaDetalle); } }

  public get desdeDetalle(): number {
    return this.totalDetalle === 0 ? 0 : (this.paginaDetalle - 1) * this.porPaginaDetalle + 1;
  }
  public get hastaDetalle(): number {
    return Math.min(this.paginaDetalle * this.porPaginaDetalle, this.totalDetalle);
  }

  /** Ordenar el detalle: lo hace el SERVIDOR, que es quien tiene todas las filas. */
  onOrdenDetalle(): void {
    const estado = (this.gridDetalle as any)?.getColumnState?.() ?? [];
    const ordenada = estado.find((c: any) => c.sort);
    this.ordenarDetalle = ordenada?.colId ?? 'fecha';
    this.sentidoDetalle = (ordenada?.sort ?? 'desc').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    this.cargarDetalle(1);
  }

  private armarColumnasDetalle(): void {
    const dinero = (p: any) => {
      const n = Number(p.value);
      return Number.isNaN(n) ? '' : '$ ' + new Intl.NumberFormat('es-EC',
        { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
    };

    this.columnDefsDetalle = [
      { headerName: 'Fecha', field: 'fecha', minWidth: 110, maxWidth: 120 },
      { headerName: 'Región', field: 'region', minWidth: 100, maxWidth: 130 },
      { headerName: 'Ciudad', field: 'ciudad', minWidth: 110, maxWidth: 150 },
      { headerName: 'Canal', field: 'canal', minWidth: 100, maxWidth: 120 },
      { headerName: 'Categoría', field: 'categoria', minWidth: 130, maxWidth: 170 },
      { headerName: 'Producto', field: 'producto', minWidth: 200, tooltipField: 'producto' },
      { headerName: 'Cliente', field: 'cliente', minWidth: 160 },
      { headerName: 'Vendedor', field: 'vendedor', minWidth: 130 },
      { headerName: 'Pago', field: 'forma_pago', minWidth: 110, maxWidth: 130 },
      { headerName: 'Cant.', field: 'cantidad', type: 'numericColumn', minWidth: 80, maxWidth: 95 },
      { headerName: 'P. unit.', field: 'precio_unitario', type: 'numericColumn', minWidth: 100, maxWidth: 120, valueFormatter: dinero },
      { headerName: 'Descuento', field: 'descuento', type: 'numericColumn', minWidth: 110, maxWidth: 130, valueFormatter: dinero },
      { headerName: 'Total', field: 'total', type: 'numericColumn', minWidth: 110, maxWidth: 140, valueFormatter: dinero,
        cellStyle: { fontWeight: '600' } },
      { headerName: 'Margen', field: 'margen', type: 'numericColumn', minWidth: 110, maxWidth: 140, valueFormatter: dinero },
      { headerName: '% Margen', field: 'margen_pct', type: 'numericColumn', minWidth: 100, maxWidth: 120,
        valueFormatter: (p: any) => (p.value ?? '') === '' ? '' : Number(p.value).toFixed(1) + ' %',
        // El margen bajo se ve, no hay que buscarlo
        cellClassRules: { 'rep-margen-bajo': (p: any) => Number(p.value) < 10 } },
    ];
  }

  // ================================================================
  // EXPORTAR
  // ================================================================
  //
  // Lo que se exporta es LO QUE SE VE: la misma tabla cruzada, con sus
  // totales. Se usan los tres servicios de la casa, así que el PDF y el Excel
  // salen con el mismo formato que los demás reportes.

  private cabecerasReporte(): string[] {
    return [this.nombreFilas, ...(this.pivote?.columnas ?? []), 'Total'];
  }

  private filasReporte(): any[][] {
    const filas = (this.filasGrid ?? []).map(f => [
      f.grupo,
      ...(this.pivote?.columnas ?? []).map(c => this.formatear(f['c_' + c])),
      this.formatear(f.total),
    ]);
    const totales = this.filaTotales?.[0];
    if (totales) {
      filas.push(['TOTAL',
        ...(this.pivote?.columnas ?? []).map(c => this.formatear(totales['c_' + c])),
        this.formatear(totales.total)]);
    }
    return filas;
  }

  private get tituloReporte(): string {
    const cruce = this.columnas && this.columnas !== 'ninguna' ? ' × ' + this.nombreColumnas : '';
    return `${this.nombreMedida} por ${this.nombreFilas}${cruce}`;
  }

  private hayQueExportar(): boolean {
    if (!this.filasGrid?.length) {
      this._toastr.info('No hay nada que exportar: el reporte está vacío', 'Reportes');
      return false;
    }
    return true;
  }

  printPdf(): void {
    if (!this.hayQueExportar()) { return; }
    this._appPrintPdfService.generarReporte({
      tamanoPapel: 'A4',
      orientacion: (this.pivote?.columnas?.length ?? 0) > 4 ? 'l' : 'p',
      title: 'Ventas (demo)',
      titleTable: this.tituloReporte,
      headers: this.cabecerasReporte(),
      data: this.filasReporte(),
      piePagina: 'Datos de ejemplo — reportes.ventas_demo',
    });
  }

  exportExcel(): void {
    if (!this.hayQueExportar()) { return; }
    this._appExportExcelService.generarReporteExcel({
      tamanoPapel: 'A4',
      orientacion: 'l',
      title: 'Ventas (demo)',
      titleTable: this.tituloReporte,
      headers: this.cabecerasReporte(),
      data: this.filasReporte(),
      piePagina: 'Datos de ejemplo — reportes.ventas_demo',
    });
  }

  exportCsv(): void {
    if (!this.hayQueExportar()) { return; }
    this._appExportCsvService.generarReporteCSV({
      headers: this.cabecerasReporte(),
      data: this.filasReporte(),
    });
  }

  // ================================================================
  // AYUDANTES
  // ================================================================

  /** Una fecha como la quiere el <input type="date"> y el servidor. */
  private aTexto(f: Date): string {
    return f.getFullYear() + '-' + String(f.getMonth() + 1).padStart(2, '0')
         + '-' + String(f.getDate()).padStart(2, '0');
  }

  /** Atajos de rango, que es lo que de verdad se usa. */
  async rango(cual: 'mes' | 'trimestre' | 'anio' | 'todo'): Promise<void> {
    const hasta = this.opciones?.rango?.hasta;
    if (!hasta) { return; }
    const h = new Date(hasta + 'T00:00:00');

    if (cual === 'todo') {
      this.filtros.desde = this.opciones?.rango?.desde ?? null;
    } else {
      const meses = cual === 'mes' ? 0 : cual === 'trimestre' ? 2 : 11;
      this.filtros.desde = this.aTexto(new Date(h.getFullYear(), h.getMonth() - meses, 1));
    }
    this.filtros.hasta = hasta;
    await this.recargar();
  }
}
