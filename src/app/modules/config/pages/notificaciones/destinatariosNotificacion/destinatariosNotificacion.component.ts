import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { AgGridModule } from 'ag-grid-angular';
import { GridApi, GridReadyEvent } from 'ag-grid-community';
import { firstValueFrom } from 'rxjs';

import { NotificacionService } from '../../../services/notificacion.service';
import { DestinatarioNotificacion, NotificacionModel } from '../../../interfaces/notificacionModel';
import { AppAgGridService } from '../../../../../service/app-agGrid.service';
import { LoadingService } from '../../../../../service/loading.service';
import { PanelModule } from '../../../../../components/panel/panel.module';
import { CampoBusquedaComponent } from '../../../../../components/campos/campoBusqueda/campoBusqueda.component';

/** Situación de cada destinatario en la lista. */
type Estado = '' | 'LEIDA' | 'PENDIENTE' | 'QUITADA';

/**
 * Destinatarios de una notificación: a quién llegó y quién la ha leído.
 *
 * Hermano de las Vistas del boletín, con el mismo esquema: panel del tema,
 * la notificación arriba con sus totales en fichas que filtran, un buscador
 * y el listado.
 *
 * «Quitada» es la que el usuario sacó de su campana: la leyera o no, ya no la
 * tiene delante. Es lo que permite responder a «¿a quién le falta enterarse?».
 */
@Component({
  selector: 'app-destinatariosNotificacion',
  standalone: true,
  imports: [CommonModule, FormsModule, AgGridModule, PanelModule, CampoBusquedaComponent],
  templateUrl: './destinatariosNotificacion.component.html',
  styleUrls: ['./destinatariosNotificacion.component.css'],
})
export class DestinatariosNotificacionComponent implements OnInit {

  /** La notificación de la que se miran los destinatarios. */
  @Input() registro_selected!: NotificacionModel;

  public isLoading$ = this._loadingService.isLoading$;

  /** Todos los destinatarios, tal como vienen del servidor. */
  public todos: DestinatarioNotificacion[] = [];
  public filas: DestinatarioNotificacion[] = [];

  public filtro: { estado: Estado } = { estado: '' };

  public gridApi!: GridApi;
  public columnDefs: any[] = [];

  constructor(
    public activeModal: NgbActiveModal,
    private _notificacionService: NotificacionService,
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

  get leidas(): number { return this.todos.filter(d => !!d.leida_at).length; }

  get pendientes(): number { return this.todos.filter(d => !d.leida_at).length; }

  get quitadas(): number { return this.todos.filter(d => d.archivada).length; }

  /** Cuántos la leyeron, en porcentaje: el dato que se mira primero. */
  get porcentajeLeido(): number {
    return this.total ? Math.round((this.leidas / this.total) * 100) : 0;
  }

  get hayFiltro(): boolean { return this.filtro.estado !== ''; }

  // ================================================================
  // DATOS
  // ================================================================

  async cargar(): Promise<void> {
    if (!this.registro_selected?.id) { return; }
    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._notificacionService.destinatarios(this.registro_selected.id));
      this.todos = res?.status === 'success' ? (res.data ?? []) : [];
      this.aplicarFiltro();
    } catch (e) {
      console.error('Error al cargar los destinatarios de la notificación:', e);
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

  /**
   * En qué situación está cada uno. «Quitada» manda sobre las demás: es la que
   * explica por qué alguien ya no la tiene en la campana.
   */
  estadoDe(d: DestinatarioNotificacion): Estado {
    if (d.archivada) { return 'QUITADA'; }
    return d.leida_at ? 'LEIDA' : 'PENDIENTE';
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
            ? ' <span class="dn-inactivo" title="Usuario inactivo">inactivo</span>'
            : '';
          return `<b>${this.escapar(p.value ?? '')}</b>${inactivo}`;
        },
      },
      {
        headerName: 'Nombre', width: 240, cellStyle: { textAlign: 'left' },
        valueGetter: (p: any) => [p.data?.surname, p.data?.name].filter(Boolean).join(' '),
      },
      {
        headerName: 'Situación', width: 130, maxWidth: 150, cellStyle: { textAlign: 'center' },
        valueGetter: (p: any) => this.estadoDe(p.data),
        cellRenderer: (p: any) => {
          const textos: Record<string, string> = { LEIDA: 'Leída', PENDIENTE: 'Pendiente', QUITADA: 'Quitada' };
          const clases: Record<string, string> = { LEIDA: 'es-leida', PENDIENTE: 'es-pendiente', QUITADA: 'es-quitada' };
          const ayuda = p.value === 'QUITADA' ? ' title="La sacó de su campana"' : '';
          return `<span class="dn-estado ${clases[p.value] ?? ''}"${ayuda}>${textos[p.value] ?? ''}</span>`;
        },
      },
      {
        headerName: 'La leyó', field: 'leida_at', width: 180, maxWidth: 200, cellStyle: { textAlign: 'center' },
        headerTooltip: 'Cuándo la abrió',
        valueFormatter: (p: any) => p.value || '—',
      },
    ];
  }

  private escapar(s: string): string {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
