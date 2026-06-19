import { Component, HostListener, Input, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgbActiveModal, NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { AuditoriaService } from '../../service/auditoria.service';
import { FormsModule } from '@angular/forms';
import { LoadingService } from '../../service/loading.service';
import { firstValueFrom } from 'rxjs';
import { GridApi, GridReadyEvent } from 'ag-grid-community';
import { AgGridAngular } from 'ag-grid-angular';
import { AgGridModule } from 'ag-grid-angular';

@Component({
  selector: 'app-auditoria-modal',
  standalone: true,
  imports: [CommonModule, NgbModule, FormsModule, AgGridModule],
  templateUrl: './auditoria-modal.component.html',
  styleUrls: ['./auditoria-modal.component.scss']
})
export class AuditoriaModalComponent implements OnInit {
  @Input() tablaNombre!: string;
  @Input() registroId!: number;
  public isLoading$ = this._loadingService.isLoading$;

  public auditoriaData: any[] = [];

  public filtro = {
    tipoOperacion: '',
    fechaDesde: '',
    fechaHasta: ''
  };

  public paginaActual: number = 1;
  public totalRegistros: number = 0;
  public registrosPorPagina: number = 3;
  public ultimaPagina: number = 1;

  @ViewChild(AgGridAngular) agGrid!: AgGridAngular;
  public gridApi!: GridApi;
  public columnDefs: any[] = [];
// En tu defaultColDef
public defaultColDef: any = {
  sortable: true,
  resizable: true,
  filter: false,
  floatingFilter: false,
  enableCellTextSelection: true,
  ensureDomOrder: true,
  // Añadir estas opciones
  cellClass: 'ag-cell-custom',
  headerClass: 'ag-header-custom'
};

  private resizeTimeoutId: any;

  @HostListener('window:resize', ['$event'])
  onResize(event: Event): void {
    this.ajustarTamanoGrid();
  }

  constructor(
    public activeModal: NgbActiveModal,
    private auditoriaService: AuditoriaService,
    private _loadingService: LoadingService,
  ) {}

  ngOnInit(): void {
    this.initializeGrid();
    this.cargarAuditoria();
  }

  escapeHtml(text: string): string {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  initializeGrid(): void {
    const self = this;
    this.columnDefs = [
      {
        headerName: 'ID',
        field: 'id',
        cellStyle: { textAlign: 'center' },
        minWidth: 70,
        maxWidth: 70,
      },
      {
        headerName: 'Operación',
        field: 'operacion',
        cellStyle: { textAlign: 'center' },
        minWidth: 100,
        maxWidth: 120,
        cellRenderer: (params: any) => {
          const operacion = params.value;
          let clase = '';
          let icono = '';
          let texto = '';
          
          if (operacion === 'INSERT') {
            clase = 'badge-insert';
            icono = 'bi bi-plus-circle';
            texto = 'Creación';
          } else if (operacion === 'UPDATE') {
            clase = 'badge-update';
            icono = 'bi bi-arrow-repeat';
            texto = 'Actualización';
          } else {
            clase = 'badge-delete';
            icono = 'bi bi-trash';
            texto = 'Eliminación';
          }
          
          return `
            <span class="d-inline-block py-1 px-2 rounded-1 ${clase}">
              <p class="d-flex align-items-center gap-1 mb-0">
                <i class="${icono}"></i>
                ${texto}
              </p>
            </span>
          `;
        }
      },
      {
        headerName: 'Fecha',
        field: 'fecha_operacion',
        cellStyle: { textAlign: 'center' },
        minWidth: 160,
        maxWidth: 180,
        cellRenderer: (params: any) => {
          if (!params.value) return 'N/A';
          const partes = params.value.split(' ');
          return `
            <span class="small">${partes[0]}</span>
            <br>
            <span class="text-muted small">${partes[1]}</span>
          `;
        }
      },
{
  headerName: 'Usuario_login',
  field: 'usuario_login',
  cellStyle: { 
    textAlign: 'left', 
    whiteSpace: 'normal',
    wordBreak: 'break-word',
    lineHeight: '1.3'
  },
  minWidth: 180,
  flex: 1,
  autoHeight: true,  // Permite que la celda crezca verticalmente
},      
{
  headerName: 'Usuario_nombre',
  field: 'usuario_nombre',
  cellStyle: { 
    textAlign: 'left', 
    whiteSpace: 'normal',
    wordBreak: 'break-word',
    lineHeight: '1.3'
  },
  minWidth: 180,
  flex: 1,
  autoHeight: true,  // Permite que la celda crezca verticalmente
},
      {
        headerName: 'Direccion IP',
        field: 'ip_address',
        cellStyle: { textAlign: 'left' },
        minWidth: 120,
        maxWidth: 140,
      },
{
  headerName: 'Programa',
  field: 'user_agent',
  cellStyle: { 
    textAlign: 'left', 
    whiteSpace: 'normal',
    wordBreak: 'break-word',
    lineHeight: '1.3'
  },
  minWidth: 180,
  flex: 1,
  autoHeight: true,  // Permite que la celda crezca verticalmente
},


{
  headerName: 'Datos Anteriores',
  field: 'datos_anteriores',
  cellStyle: { textAlign: 'left', whiteSpace: 'normal' },
  minWidth: 300,
  flex: 2,
  cellRenderer: (params: any) => {
    if (!params.value) return 'N/A';
    try {
      let jsonStr: string;
      if (typeof params.value === 'string') {
        jsonStr = params.value;
      } else {
        // Usar indentación de 1 espacio para reducir espacio
        jsonStr = JSON.stringify(params.value, null, 1);
      }
      const escapedJson = self.escapeHtml(jsonStr);
      return `<pre class="mb-0 p-2 bg-light rounded-2 small pre-formatted" style="white-space: pre-wrap; word-break: break-all; max-height: 100px; overflow: auto; line-height: 1.2; font-size: 10px;">${escapedJson}</pre>`;
    } catch (e) {
      return 'Error al mostrar JSON';
    }
  }
},
{
  headerName: 'Datos Nuevos',
  field: 'datos_nuevos',
  cellStyle: { textAlign: 'left', whiteSpace: 'normal' },
  minWidth: 300,
  flex: 2,
  cellRenderer: (params: any) => {
    if (!params.value) return 'N/A';
    try {
      let jsonStr: string;
      if (typeof params.value === 'string') {
        jsonStr = params.value;
      } else {
        // Usar indentación de 1 espacio para reducir espacio
        jsonStr = JSON.stringify(params.value, null, 1);
      }
      const escapedJson = self.escapeHtml(jsonStr);
      return `<pre class="mb-0 p-2 bg-light rounded-2 small pre-formatted" style="white-space: pre-wrap; word-break: break-all; max-height: 100px; overflow: auto; line-height: 1.2; font-size: 10px;">${escapedJson}</pre>`;
    } catch (e) {
      return 'Error al mostrar JSON';
    }
  }
}

    ];
  }

  onGridReady(params: GridReadyEvent): void {
    this.gridApi = params.api;
    this.ajustarTamanoGrid();
  }

  ajustarTamanoGrid() {
    if (this.gridApi) {
      if (this.resizeTimeoutId) {
        clearTimeout(this.resizeTimeoutId);
      }
      this.resizeTimeoutId = setTimeout(() => {
        this.gridApi.sizeColumnsToFit();
      }, 100);
    }
  }

  async cargarAuditoria(page: number = 1) {
    try {
      this._loadingService.setLoading(true);
      
      // Convertir tipoOperacion a mayúsculas para que coincida con la BD
      const operacion = this.filtro.tipoOperacion ? this.filtro.tipoOperacion.toUpperCase() : '';
      
      let res: any = await firstValueFrom(this.auditoriaService.getAuditoriaByRegistro(
        this.tablaNombre,
        this.registroId,
        operacion,
        this.filtro.fechaDesde,
        this.filtro.fechaHasta,
        page,
        this.registrosPorPagina
      ));

      if (res?.status === 'success' && res?.data) {
        this.auditoriaData = res.data.data || [];
        
        if (res.data.meta) {
          this.totalRegistros = res.data.meta.total;
          this.paginaActual = res.data.meta.current_page;
          this.ultimaPagina = res.data.meta.last_page;
        }
        
        if (this.gridApi) {
          this.gridApi.setRowData(this.auditoriaData);
        }
      } else {
        this.auditoriaData = [];
        if (this.gridApi) {
          this.gridApi.setRowData([]);
        }
      }
    } catch (error: any) {
      console.error('Error en la petición', error);
      this.auditoriaData = [];
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  // Funciones de paginación
  firstPage(): void {
    if (this.paginaActual !== 1) {
      this.goToPage(1);
    }
  }

  lastPage(): void {
    if (this.paginaActual !== this.ultimaPagina) {
      this.goToPage(this.ultimaPagina);
    }
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.ultimaPagina) return;
    this.paginaActual = page;
    this.cargarAuditoria(this.paginaActual);
  }

  nextPage(): void {
    this.goToPage(this.paginaActual + 1);
  }

  prevPage(): void {
    this.goToPage(this.paginaActual - 1);
  }

  limpiarFiltros(): void {
    this.filtro = {
      tipoOperacion: '',
      fechaDesde: '',
      fechaHasta: ''
    };
    this.paginaActual = 1;
    this.cargarAuditoria(1);
  }

  aplicarFiltros(): void {
    this.paginaActual = 1;
    this.cargarAuditoria(1);
  }
}