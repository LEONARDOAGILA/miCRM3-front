import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { AgGridModule } from 'ag-grid-angular';
import { CellClickedEvent, GridApi, GridReadyEvent } from 'ag-grid-community';
import { firstValueFrom } from 'rxjs';

import { ModalHeaderComponent } from '../../../../../../components/modal/modal-header/modal-header.component';
import { AppAgGridService } from '../../../../../../service/app-agGrid.service';
import { MarcacionService } from '../../../../services/marcacion.service';
import { MarcacionModel } from '../../../../interfaces/marcacionModel';
import { FilasEstirablesDirective } from '../../../../../../core/directives/filasEstirables.directive';

/**
 * MIS MARCACIONES (modal).
 *
 * El historial del propio empleado, con filtro de fechas y paginación en el
 * servidor. Vive en un modal y no en la pantalla de marcar porque allí sólo
 * estorbaba: lo que se va a hacer en el teléfono es pulsar un botón, y el
 * historial se mira de vez en cuando.
 *
 * El empleado NO se manda: `misMarcaciones` lo saca de la sesión, así que
 * nadie ve las horas de un compañero cambiando un número en la petición.
 */
@Component({
  selector: 'app-mis-marcaciones',
  standalone: true,
  imports: [FormsModule, AgGridModule, FilasEstirablesDirective, ModalHeaderComponent],
  templateUrl: './misMarcaciones.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./misMarcaciones.component.css'],
})
export class MisMarcacionesComponent implements OnInit {

  public gridApi!: GridApi;
  public columnDefs: any[] = [];
  public marcaciones: MarcacionModel[] = [];

  public paginaActual = 1;
  public registrosPorPagina = 10;
  public totalRegistros = 0;
  public ultimaPagina = 1;
  public cargando = false;

  /** El rango que se está mirando (AAAA-MM-DD). */
  public desde = '';
  public hasta = '';

  constructor(
    public modal: NgbActiveModal,
    public _appAgGridService: AppAgGridService,
    private _marcacionService: MarcacionService,
  ) {}

  ngOnInit(): void {
    this.initializeGrid();
    this.rango('semana');
  }

  get desdeRegistro(): number {
    return this.totalRegistros === 0 ? 0 : (this.paginaActual - 1) * this.registrosPorPagina + 1;
  }
  get hastaRegistro(): number {
    return Math.min(this.paginaActual * this.registrosPorPagina, this.totalRegistros);
  }

  private initializeGrid(): void {
    // En un teléfono no caben cinco columnas: la fecha va corta («19/10», el
    // año entero en el título) y «Desde» se queda fuera, que es el dato que
    // menos se mira. En pantalla ancha salen todas.
    const estrecha = window.innerWidth < 576;

    this.columnDefs = [
      {
        headerName: 'Fecha', field: 'fecha',
        minWidth: estrecha ? 72 : 105, maxWidth: estrecha ? 100 : 130,
        cellStyle: { textAlign: 'center' },
        tooltipField: 'fecha',
        valueFormatter: (p: any) => {
          const f = String(p.value ?? '');
          if (!estrecha || f.length < 10) { return f; }
          return `${f.slice(8, 10)}/${f.slice(5, 7)}`;
        },
      },
      { headerName: 'Hora',  field: 'hora',
        minWidth: estrecha ? 76 : 90, maxWidth: 110, cellStyle: { textAlign: 'center' } },
      {
        headerName: 'Tipo', field: 'tipo',
        minWidth: estrecha ? 80 : 95, maxWidth: 120, cellStyle: { textAlign: 'center' },
        cellRenderer: (p: any) => p.value === 'ENTRADA'
          ? '<span class="mm-tipo is-entrada">Entrada</span>'
          : '<span class="mm-tipo is-salida">Salida</span>',
      },
      {
        // De dónde salió: el kiosco de la puerta o el propio teléfono
        headerName: 'Desde', field: 'origen', hide: estrecha,
        minWidth: 95, maxWidth: 130, cellStyle: { textAlign: 'center' },
        valueFormatter: (p: any) => p.value === 'MOVIL' ? 'Celular'
          : p.value === 'FACIAL' ? 'Kiosco'
          : p.value === 'MANUAL' ? 'A mano'
          : (p.value ?? ''),
        tooltipField: 'dispositivo',
      },
      {
        // El punto donde se registró. Sin ubicación no se pinta botón: uno
        // que no lleva a ningún sitio sólo hace perder el pulso.
        headerName: 'Dónde', field: 'link_ubicacion',
        minWidth: estrecha ? 46 : 70, maxWidth: 90,
        sortable: false, filter: false, cellStyle: { textAlign: 'center' },
        tooltipValueGetter: (p: any) => {
          if (!p.data?.coordenadas) { return 'Esta marcación no trae ubicación'; }
          const e = Number(p.data?.precision_m ?? 0);
          const error = !e ? '' : (e >= 1000 ? ` · ±${(e / 1000).toFixed(1)} km` : ` · ±${Math.round(e)} m`);
          return p.data.coordenadas + error;
        },
        cellRenderer: (p: any) => p.value
          ? '<span class="mm-mapa" data-accion="mapa" title="Ver en el mapa"><i class="fa fa-location-dot"></i></span>'
          : '<span class="mm-sin-mapa">—</span>',
      },
    ];
  }

  onGridReady(params: GridReadyEvent): void {
    this.gridApi = params.api;
    this._appAgGridService.ajustarTamanoGrid(this.gridApi);
  }

  /** Un toque en la celda del mapa abre el punto. */
  onCellClicked(e: CellClickedEvent): void {
    const boton = (e.event?.target as HTMLElement | null)?.closest('[data-accion="mapa"]');
    if (boton && e.data?.link_ubicacion) {
      window.open(e.data.link_ubicacion, '_blank', 'noopener');
    }
  }

  /** Hoy / esta semana / este mes, que es como se mira esto de verdad. */
  rango(que: 'hoy' | 'semana' | 'mes'): void {
    const hoy = new Date();
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    if (que === 'hoy') {
      this.desde = this.hasta = iso(hoy);
    } else if (que === 'semana') {
      const lunes = new Date(hoy);
      // getDay(): 0 es domingo; la semana se cuenta de lunes a domingo
      lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7));
      this.desde = iso(lunes);
      this.hasta = iso(hoy);
    } else {
      this.desde = iso(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
      this.hasta = iso(hoy);
    }
    this.cargar(1);
  }

  /** Pide una página de MIS marcaciones. */
  async cargar(page: number = 1): Promise<void> {
    this.cargando = true;
    try {
      const res: any = await firstValueFrom(this._marcacionService.misMarcaciones(
        page, this.registrosPorPagina, { desde: this.desde, hasta: this.hasta }));

      if (res?.status !== 'success') { throw new Error(res?.message || 'No se pudo cargar el listado'); }

      this.marcaciones = res.data?.data ?? [];
      const meta = res.data?.meta;
      if (meta) {
        this.totalRegistros = meta.total;
        this.registrosPorPagina = meta.per_page;
        this.paginaActual = meta.current_page;
        this.ultimaPagina = meta.last_page;
      }
      this.gridApi?.setGridOption('rowData', this.marcaciones);
      // Al cambiar de rango hay que volver a repartir el ancho, o la última
      // columna se sale del borde en una pantalla estrecha.
      if (this.gridApi) { this._appAgGridService.ajustarTamanoGrid(this.gridApi); }

    } catch (e: any) {
      console.error('Error al cargar las marcaciones:', e);
      this.marcaciones = [];
      this.totalRegistros = 0;
      this.ultimaPagina = 1;
      this.gridApi?.setGridOption('rowData', []);
    } finally {
      this.cargando = false;
    }
  }

  // Paginación: todas pasan por goToPage(), que es la que valida el rango
  firstPage(): void { if (this.paginaActual !== 1) { this.goToPage(1); } }
  prevPage(): void { this.goToPage(this.paginaActual - 1); }
  nextPage(): void { this.goToPage(this.paginaActual + 1); }
  lastPage(): void { if (this.paginaActual !== this.ultimaPagina) { this.goToPage(this.ultimaPagina); } }

  goToPage(page: number): void {
    if (page < 1 || page > this.ultimaPagina) { return; }
    this.cargar(page);
  }
}
