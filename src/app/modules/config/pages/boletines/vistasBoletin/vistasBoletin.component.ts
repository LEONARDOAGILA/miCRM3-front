import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { AgGridModule } from 'ag-grid-angular';
import { GridApi, GridReadyEvent } from 'ag-grid-community';
import { firstValueFrom } from 'rxjs';

import { BoletinService } from '../../../services/boletin.service';
import { BoletinDestinatario, BoletinModel } from '../../../interfaces/boletinModel';
import { AppAgGridService } from '../../../../../service/app-agGrid.service';
import { LoadingService } from '../../../../../service/loading.service';
import { PanelModule } from '../../../../../components/panel/panel.module';
import { CampoBusquedaComponent } from '../../../../../components/campos/campoBusqueda/campoBusqueda.component';

/** Estado de cada destinatario en la lista. */
type Estado = '' | 'VISTO' | 'PENDIENTE' | 'OCULTO';

/**
 * Vistas de un boletín: quién lo vio, cuándo y cuántas veces.
 *
 * Hermano del Historial de Acciones de los archivos, con el mismo esquema:
 * panel del tema, el elemento arriba con sus totales en fichas que filtran,
 * un buscador y el listado.
 *
 * La lista no es sólo de quien lo vio: son todos los destinatarios —los
 * añadidos uno a uno y los que entran por un grupo—, y de cada uno se dice si
 * ya lo vio, si está pendiente o si pidió no volver a verlo. Eso es lo que
 * permite responder a «¿a quién le falta?».
 */
@Component({
  selector: 'app-vistasBoletin',
  standalone: true,
  imports: [CommonModule, FormsModule, AgGridModule, PanelModule, CampoBusquedaComponent],
  templateUrl: './vistasBoletin.component.html',
  styleUrls: ['./vistasBoletin.component.css'],
})
export class VistasBoletinComponent implements OnInit {

  /** El boletín del que se miran las vistas. */
  @Input() registro_selected!: BoletinModel;

  public isLoading$ = this._loadingService.isLoading$;

  /** Todos los destinatarios, tal como vienen del servidor. */
  public todos: BoletinDestinatario[] = [];
  public filas: BoletinDestinatario[] = [];

  public filtro: { estado: Estado } = { estado: '' };

  public gridApi!: GridApi;
  public columnDefs: any[] = [];

  constructor(
    public activeModal: NgbActiveModal,
    private _boletinService: BoletinService,
    public _appAgGridService: AppAgGridService,
    private _loadingService: LoadingService,
  ) {}

  ngOnInit(): void {
    this.initializeGrid();
    this.cargar();
  }

  // ================================================================
  // TOTALES
  // ================================================================

  get total(): number { return this.todos.length; }

  get vistos(): number {
    return this.todos.filter(d => !!d.visto_at).length;
  }

  get pendientes(): number {
    return this.todos.filter(d => !d.visto_at).length;
  }

  get ocultos(): number {
    return this.todos.filter(d => d.no_mostrar).length;
  }

  /** Cuántos lo abrieron más de una vez: dice si de verdad lo leyeron. */
  get repetidores(): number {
    return this.todos.filter(d => ((d as any).veces ?? 0) > 1).length;
  }

  get hayFiltro(): boolean {
    return this.filtro.estado !== '';
  }

  // ================================================================
  // DATOS
  // ================================================================

  async cargar(): Promise<void> {
    if (!this.registro_selected?.id) { return; }
    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._boletinService.destinatarios(this.registro_selected.id));
      this.todos = res?.status === 'success' ? (res.data ?? []) : [];
      this.aplicarFiltro();
    } catch (e) {
      console.error('Error al cargar las vistas del boletín:', e);
      this.todos = [];
      this.aplicarFiltro();
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  filtrarEstado(estado: Estado): void {
    this.filtro.estado = this.filtro.estado === estado ? '' : estado;
    this.aplicarFiltro();
  }

  limpiarFiltros(): void {
    this.filtro.estado = '';
    this.gridApi?.setQuickFilter('');
    this.aplicarFiltro();
  }

  private aplicarFiltro(): void {
    const e = this.filtro.estado;
    this.filas = !e ? [...this.todos] : this.todos.filter(d => this.estadoDe(d) === e);
    this.gridApi?.setRowData(this.filas);
  }

  /** En qué situación está cada destinatario. */
  estadoDe(d: BoletinDestinatario): Estado {
    if (d.no_mostrar) { return 'OCULTO'; }
    return d.visto_at ? 'VISTO' : 'PENDIENTE';
  }

  onFilterTextBoxChanged(texto: string): void {
    this.gridApi?.setQuickFilter(texto ?? '');
  }

  // ================================================================
  // GRILLA
  // ================================================================

  initializeGrid(): void {
    this.columnDefs = [
      {
        headerName: 'Usuario', field: 'login_user', width: 160, cellStyle: { textAlign: 'left' },
        cellRenderer: (p: any) => {
          const inactivo = p.data?.isactive === false
            ? ' <span class="vb-inactivo" title="Usuario inactivo">inactivo</span>'
            : '';
          return `<b>${this.escapar(p.value ?? '')}</b>${inactivo}`;
        },
      },
      {
        headerName: 'Nombre', width: 220, cellStyle: { textAlign: 'left' },
        valueGetter: (p: any) => [p.data?.surname, p.data?.name].filter(Boolean).join(' '),
      },
      {
        headerName: 'Le llega', width: 160, cellStyle: { textAlign: 'left' },
        headerTooltip: 'Añadido uno a uno o por pertenecer a un grupo',
        valueGetter: (p: any) => p.data?.origen === 'GRUPO' ? `Grupo ${p.data?.desde ?? ''}`.trim() : 'Directo',
      },
      {
        headerName: 'Situación', width: 130, maxWidth: 150, cellStyle: { textAlign: 'center' },
        valueGetter: (p: any) => this.estadoDe(p.data),
        cellRenderer: (p: any) => {
          const textos: Record<string, string> = { VISTO: 'Visto', PENDIENTE: 'Pendiente', OCULTO: 'Ocultado' };
          const clases: Record<string, string> = { VISTO: 'es-visto', PENDIENTE: 'es-pendiente', OCULTO: 'es-oculto' };
          const ayuda = p.value === 'OCULTO' ? ' title="Pidió no volver a mostrarlo"' : '';
          return `<span class="vb-estado ${clases[p.value] ?? ''}"${ayuda}>${textos[p.value] ?? ''}</span>`;
        },
      },
      {
        headerName: 'Lo vio', field: 'visto_at', width: 170, maxWidth: 190, cellStyle: { textAlign: 'center' },
        headerTooltip: 'La última vez que lo abrió',
        valueFormatter: (p: any) => p.value || '—',
      },
      {
        headerName: 'Veces', field: 'veces', width: 90, maxWidth: 100, cellStyle: { textAlign: 'center' },
        headerTooltip: 'Cuántas veces lo abrió',
        valueFormatter: (p: any) => (p.value ?? 0) || '—',
      },
    ];
  }

  private escapar(s: string): string {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  onGridReady(params: GridReadyEvent): void {
    this.gridApi = params.api;
    this.gridApi.setRowData(this.filas);
    this.ajustarTamanoGrid();
  }

  navegarConTeclado = this._appAgGridService.navegacionConFlechas(() => {});

  ajustarTamanoGrid(): void {
    setTimeout(() => this.gridApi?.sizeColumnsToFit(), 150);
  }
}
