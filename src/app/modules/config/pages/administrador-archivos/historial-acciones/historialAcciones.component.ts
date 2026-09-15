import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { AgGridModule } from 'ag-grid-angular';
import { GridApi, GridReadyEvent } from 'ag-grid-community';
import { firstValueFrom } from 'rxjs';
import moment from 'moment';
import {
  NgxDaterangepickerMd,
  LOCALE_CONFIG,
  LocaleService,
  DefaultLocaleConfig,
} from 'ngx-daterangepicker-material';

import { ArchivoService } from '../../../services/archivo.service';
import { AppAgGridService } from '../../../../../service/app-agGrid.service';
import { LoadingService } from '../../../../../service/loading.service';
import { PanelModule } from '../../../../../components/panel/panel.module';
import { CampoBusquedaComponent } from '../../../../../components/campos/campoBusqueda/campoBusqueda.component';

/** Extremo de un rango del picker (dayjs o moment: sólo se usa .format()). */
interface FechaLike { format(patron: string): string; }
interface FechaRango { startDate: FechaLike | null; endDate: FechaLike | null; }

/** Una fila de core.archivos_accesos con el usuario y el archivo resueltos. */
interface Accion {
  id: number;
  archivo_id: number;
  archivo_nombre: string;
  archivo_tipo: string;
  accion: 'EJECUTAR' | 'DESCARGAR';
  user_id: number | null;
  usuario_login: string | null;
  name?: string;
  surname?: string;
  ip_address?: string;
  user_agent?: string;
  fecha: string;
}

/**
 * Historial de acciones de un archivo o carpeta: quién lo abrió (EJECUTAR)
 * y quién lo descargó (DESCARGAR, suelto o dentro de un zip).
 *
 * Es el hermano de la Auditoría general (auditoria-modal, que registra los
 * cambios de datos): aquí sólo va el USO del archivo. Mismo esquema visual:
 * panel del tema, filtros arriba (rango de fechas + acción + buscador) y
 * el listado, que en este caso es un ag-Grid.
 *
 * Para una carpeta el back devuelve las acciones sobre todo lo que cuelga de
 * ella, por eso se muestra la columna Archivo.
 */
@Component({
  selector: 'app-historial-acciones',
  standalone: true,
  imports: [CommonModule, FormsModule, AgGridModule, PanelModule, CampoBusquedaComponent, NgxDaterangepickerMd],
  providers: [
    // Igual que en auditoria-modal: el picker no alcanza los providers de
    // NgxDaterangepickerMd.forRoot() desde un standalone abierto por NgbModal.
    { provide: LOCALE_CONFIG, useValue: DefaultLocaleConfig },
    { provide: LocaleService, useClass: LocaleService, deps: [LOCALE_CONFIG] },
  ],
  templateUrl: './historialAcciones.component.html',
  styleUrls: ['./historialAcciones.component.css'],
})
export class HistorialAccionesComponent implements OnInit {

  @Input() elemento!: { id: number; nombre: string; escarpeta: boolean; icono?: string; color?: string };

  public isLoading$ = this._loadingService.isLoading$;

  // ---------- Datos ----------
  public filas: Accion[] = [];
  public totales = { ejecutar: 0, descargar: 0 };
  /** Límite de filas que pide al back (los totales no lo tienen en cuenta). */
  public readonly LIMITE = 1000;

  // ---------- Filtros ----------
  public filtro = { accion: '', desde: '', hasta: '' };

  public selected: FechaRango | null = null;   // null = todo el historial
  public alwaysShowCalendars = true;

  public locale: any = {
    format: 'DD/MM/YYYY',
    displayFormat: 'DD/MM/YYYY',
    separator: ' - ',
    applyLabel: 'Aplicar',
    cancelLabel: 'Cancelar',
    clearLabel: 'Limpiar',
    customRangeLabel: 'Personalizado',
    daysOfWeek: ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'],
    monthNames: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
    firstDay: 1,
  };

  public ranges: any = {
    'Hoy': [moment(), moment()],
    'Ayer': [moment().subtract(1, 'days'), moment().subtract(1, 'days')],
    'Últimos 7 días': [moment().subtract(6, 'days'), moment()],
    'Últimos 15 días': [moment().subtract(14, 'days'), moment()],
    'Últimos 30 días': [moment().subtract(29, 'days'), moment()],
    'Este mes': [moment().startOf('month'), moment().endOf('month')],
    'Mes pasado': [moment().subtract(1, 'month').startOf('month'), moment().subtract(1, 'month').endOf('month')],
  };

  // ---------- ag-Grid ----------
  public gridApi!: GridApi;
  public columnDefs: any[] = [];

  constructor(
    public activeModal: NgbActiveModal,
    private _archivoService: ArchivoService,
    public _appAgGridService: AppAgGridService,
    private _loadingService: LoadingService,
  ) {}

  ngOnInit(): void {
    moment.locale('es');
    this.initializeGrid();
    this.cargar();
  }

  public get total(): number { return this.totales.ejecutar + this.totales.descargar; }

  /** Usuarios distintos en lo cargado. */
  public get usuariosDistintos(): number {
    return new Set(this.filas.map(f => f.user_id ?? f.usuario_login)).size;
  }

  public get hayFiltro(): boolean {
    return !!(this.filtro.accion || this.filtro.desde || this.filtro.hasta);
  }

  // ================================================================
  // AG-GRID
  // ================================================================

  initializeGrid(): void {
    this.columnDefs = [
      {
        headerName: 'Fecha', field: 'fecha',
        minWidth: 150, maxWidth: 150, cellStyle: { textAlign: 'center' },
        sort: 'desc',
        cellRenderer: (p: any) => {
          const m = moment(p.value, 'YYYY-MM-DD HH:mm:ss');
          if (!m.isValid()) { return p.value ?? ''; }
          return `<span class="hist-fecha"><b>${m.format('DD/MM/YYYY')}</b> <span class="hist-fecha__hora">${m.format('HH:mm:ss')}</span></span>`;
        },
      },
      {
        headerName: 'Usuario', field: 'usuario_login',
        minWidth: 220, cellStyle: { textAlign: 'left' },
        valueGetter: (p: any) => `${p.data?.usuario_login ?? ''} ${p.data?.name ?? ''} ${p.data?.surname ?? ''}`.trim(),
        cellRenderer: (p: any) => {
          const d: Accion = p.data;
          const nombre = `${d.name ?? ''} ${d.surname ?? ''}`.trim();
          return `<div class="hist-usuario">
                    <span class="hist-usuario__login">${d.usuario_login ?? '—'}${d.user_id == null ? ' <span class="badge bg-secondary fs-9px">eliminado</span>' : ''}</span>
                    <span class="hist-usuario__nombre">${nombre || '&nbsp;'}</span>
                  </div>`;
        },
      },
      {
        headerName: 'Acción', field: 'accion',
        minWidth: 120, maxWidth: 120,
        cellStyle: { display: 'flex', justifyContent: 'center', alignItems: 'center' },
        valueFormatter: (p: any) => p.value === 'DESCARGAR' ? 'Descargó' : 'Abrió',
        cellRenderer: (p: any) => p.value === 'DESCARGAR'
          ? '<span class="badge bg-primary fs-10px"><i class="fa fa-download me-1"></i>Descargó</span>'
          : '<span class="badge bg-teal fs-10px"><i class="fa fa-play me-1"></i>Abrió</span>',
      },
      {
        headerName: 'Archivo', field: 'archivo_nombre',
        minWidth: 220, cellStyle: { textAlign: 'left' },
        hide: !this.elemento?.escarpeta,   // en un archivo suelto sobra
        cellRenderer: (p: any) => {
          const d: Accion = p.data;
          return `<div class="hist-usuario">
                    <span class="hist-usuario__login">${d.archivo_nombre ?? ''}</span>
                    <span class="hist-usuario__nombre">${d.archivo_tipo ?? ''}</span>
                  </div>`;
        },
      },
      {
        headerName: 'IP', field: 'ip_address',
        minWidth: 130, maxWidth: 130, cellStyle: { textAlign: 'center' },
      },
      {
        headerName: 'Navegador', field: 'user_agent',
        minWidth: 170, maxWidth: 200, cellStyle: { textAlign: 'center' },
        valueFormatter: (p: any) => this.resumenNavegador(p.value),
        tooltipField: 'user_agent',
      },
    ];
  }

  /** ↑ / ↓ seleccionan la fila como un clic (ver AppAgGridService.navegacionConFlechas). */
  navegarConTeclado = this._appAgGridService.navegacionConFlechas();

  onGridReady(params: GridReadyEvent): void {
    this.gridApi = params.api;
    this._appAgGridService.ajustarTamanoGrid(this.gridApi);
  }

  ajustarTamanoGrid(): void {
    if (this.gridApi) { this._appAgGridService.ajustarTamanoGrid(this.gridApi); }
  }

  onFilterTextBoxChanged(): void {
    const input = document.getElementById('filter-text-box-historial') as HTMLInputElement | null;
    this.gridApi?.setQuickFilter(input?.value ?? '');
  }

  // ================================================================
  // DATOS
  // ================================================================

  async cargar(): Promise<void> {
    try {
      this._loadingService.setLoading(true);
      const res = await firstValueFrom(this._archivoService.accesosArchivo(this.elemento.id, {
        accion: this.filtro.accion,
        desde:  this.filtro.desde,
        hasta:  this.filtro.hasta,
        limit:  this.LIMITE,
      }));
      if (res?.status === 'success') {
        this.filas   = res.data?.filas ?? [];
        this.totales = res.data?.totales ?? { ejecutar: 0, descargar: 0 };
      } else {
        this.filas = [];
        this.totales = { ejecutar: 0, descargar: 0 };
      }
      this.gridApi?.setRowData(this.filas);
    } catch (e) {
      console.error('Error al cargar el historial:', e);   // el interceptor ya avisó
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  // ================================================================
  // FILTROS
  // ================================================================

  /** Rango del picker -> desde / hasta (YYYY-MM-DD, día completo). "Limpiar" emite null. */
  onRangoChange(rango: FechaRango | null): void {
    if (!rango?.startDate || !rango?.endDate) {
      this.filtro.desde = '';
      this.filtro.hasta = '';
    } else {
      // .format() del propio objeto (dayjs o moment), nunca moment(obj): ver auditoria-modal
      this.filtro.desde = rango.startDate.format('YYYY-MM-DD');
      this.filtro.hasta = rango.endDate.format('YYYY-MM-DD');
    }
    this.cargar();
  }

  /** Chips de acción: Todas / Abrió / Descargó. */
  filtrarAccion(accion: '' | 'EJECUTAR' | 'DESCARGAR'): void {
    if (this.filtro.accion === accion) { return; }
    this.filtro.accion = accion;
    this.cargar();
  }

  limpiarFiltros(): void {
    this.selected = null;
    this.filtro = { accion: '', desde: '', hasta: '' };
    const input = document.getElementById('filter-text-box-historial') as HTMLInputElement | null;
    if (input) { input.value = ''; }
    this.gridApi?.setQuickFilter('');
    this.cargar();
  }

  // ================================================================
  // UTILIDADES
  // ================================================================

  /** "Chrome · Windows" a partir del user agent; vacío si no se conoce. */
  resumenNavegador(ua?: string): string {
    if (!ua) { return '—'; }
    let nav = 'Otro';
    if (/Edg\//.test(ua)) { nav = 'Edge'; }
    else if (/OPR\//.test(ua)) { nav = 'Opera'; }
    else if (/Chrome\//.test(ua)) { nav = 'Chrome'; }
    else if (/Firefox\//.test(ua)) { nav = 'Firefox'; }
    else if (/Safari\//.test(ua)) { nav = 'Safari'; }

    let so = '';
    if (/Windows/.test(ua)) { so = 'Windows'; }
    else if (/iPhone|iPad/.test(ua)) { so = 'iOS'; }
    else if (/Android/.test(ua)) { so = 'Android'; }
    else if (/Mac OS/.test(ua)) { so = 'macOS'; }
    else if (/Linux/.test(ua)) { so = 'Linux'; }

    return so ? `${nav} · ${so}` : nav;
  }
}
