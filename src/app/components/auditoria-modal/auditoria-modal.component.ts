import { Component, HostListener, Input, OnInit, ViewChild, AfterViewInit, ChangeDetectorRef } from '@angular/core';
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
export class AuditoriaModalComponent implements OnInit, AfterViewInit {
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

  public selectedAuditoria: any = null;
  public selectedIndex: number = -1;

  public defaultColDef: any = {
    sortable: true,
    resizable: true,
    filter: false,
    floatingFilter: false,
    enableCellTextSelection: true,
    ensureDomOrder: true,
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
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.initializeGrid();
    this.cargarAuditoria();
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      if (this.auditoriaData.length > 0) {
        this.seleccionarRegistro(this.auditoriaData[0], 0);
      }
    }, 500);
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

  // Función para formatear valores - MUESTRA JSON ORIGINAL
  formatearValor(valor: any): string {
    if (valor === null || valor === undefined) return '—';
    if (typeof valor === 'string') {
      // Si es muy largo, truncar
      if (valor.length > 500) {
        return valor.substring(0, 500) + '...';
      }
      return valor;
    }
    if (typeof valor === 'number') return valor.toString();
    if (typeof valor === 'boolean') return valor ? 'Sí' : 'No';
    
    if (Array.isArray(valor)) {
      if (valor.length === 0) return '[]';
      // Mostrar el JSON original del array
      try {
        let jsonStr = JSON.stringify(valor, null, 2);
        if (jsonStr.length > 500) {
          return jsonStr.substring(0, 500) + '...\n[Array truncado]';
        }
        return jsonStr;
      } catch (e) {
        return `[${valor.length} elementos]`;
      }
    }
    
    if (typeof valor === 'object') {
      // Mostrar el JSON original del objeto
      try {
        let jsonStr = JSON.stringify(valor, null, 2);
        if (jsonStr.length > 500) {
          return jsonStr.substring(0, 500) + '...\n[Objeto truncado]';
        }
        return jsonStr;
      } catch (e) {
        return '[Objeto]';
      }
    }
    
    return String(valor);
  }

  private compararObjetos(obj1: any, obj2: any): { [key: string]: 'added' | 'removed' | 'modified' | 'same' } {
    const resultado: { [key: string]: 'added' | 'removed' | 'modified' | 'same' } = {};
    
    if (!obj1 && !obj2) return resultado;
    if (!obj1) {
      Object.keys(obj2 || {}).forEach(key => resultado[key] = 'added');
      return resultado;
    }
    if (!obj2) {
      Object.keys(obj1 || {}).forEach(key => resultado[key] = 'removed');
      return resultado;
    }

    const todasKeys = new Set([...Object.keys(obj1), ...Object.keys(obj2)]);
    
    for (const key of todasKeys) {
      const val1 = obj1[key];
      const val2 = obj2[key];
      
      if (key in obj1 && !(key in obj2)) {
        resultado[key] = 'removed';
      } else if (!(key in obj1) && key in obj2) {
        resultado[key] = 'added';
      } else if (JSON.stringify(val1) !== JSON.stringify(val2)) {
        resultado[key] = 'modified';
      } else {
        resultado[key] = 'same';
      }
    }
    
    return resultado;
  }

  seleccionarRegistro(registro: any, index: number): void {
    this.selectedAuditoria = registro;
    this.selectedIndex = index;
    
    if (this.gridApi) {
      this.gridApi.deselectAll();
      
      this.gridApi.forEachNode((node: any) => {
        if (node.rowIndex === index) {
          node.setSelected(true);
          this.gridApi.ensureNodeVisible(node, 'middle');
        }
      });
      
      this.gridApi.refreshCells();
    }
    
    this.cdr.detectChanges();
  }

  obtenerCambiosFormateados(registro: any): any {
    if (!registro) return null;
    
    const datosAnteriores = registro.datos_anteriores || {};
    const datosNuevos = registro.datos_nuevos || {};
    
    let objAnterior = datosAnteriores;
    let objNuevo = datosNuevos;
    
    try {
      if (typeof datosAnteriores === 'string') {
        objAnterior = JSON.parse(datosAnteriores);
      }
      if (typeof datosNuevos === 'string') {
        objNuevo = JSON.parse(datosNuevos);
      }
    } catch (e) {
      // Si no se puede parsear, usar los valores originales
    }
    
    const diferencias = this.compararObjetos(objAnterior, objNuevo);
    const keysConCambios = Object.keys(diferencias).filter(key => diferencias[key] !== 'same');
    
    if (keysConCambios.length === 0) {
      return {
        cambios: [],
        resumen: 'Sin cambios detectados',
        total: 0,
        added: 0,
        removed: 0,
        modified: 0
      };
    }
    
    const cambios = keysConCambios.map(key => {
      const valorAnt = objAnterior?.[key];
      const valorNue = objNuevo?.[key];
      
      let valorAnteriorFormateado = '—';
      let valorNuevoFormateado = '—';
      
      if (valorAnt !== undefined && valorAnt !== null) {
        valorAnteriorFormateado = this.formatearValor(valorAnt);
      }
      
      if (valorNue !== undefined && valorNue !== null) {
        valorNuevoFormateado = this.formatearValor(valorNue);
      }
      
      return {
        campo: key,
        estado: diferencias[key],
        valorAnterior: valorAnteriorFormateado,
        valorNuevo: valorNuevoFormateado
      };
    });
    
    const addedCount = keysConCambios.filter(key => diferencias[key] === 'added').length;
    const removedCount = keysConCambios.filter(key => diferencias[key] === 'removed').length;
    const modifiedCount = keysConCambios.filter(key => diferencias[key] === 'modified').length;
    
    return {
      cambios,
      resumen: `${keysConCambios.length} cambios detectados`,
      total: keysConCambios.length,
      added: addedCount,
      removed: removedCount,
      modified: modifiedCount
    };
  }

  onRowClicked(event: any): void {
    const rowIndex = event.rowIndex;
    const data = event.data;
    if (data) {
      this.seleccionarRegistro(data, rowIndex);
    }
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
        minWidth: 120,
        maxWidth: 150,
        cellRenderer: (params: any) => {
          const operacion = params.value;
          const data = params.data;
          
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
          
          const datosAnteriores = data.datos_anteriores || {};
          const datosNuevos = data.datos_nuevos || {};
          
          let objAnterior = datosAnteriores;
          let objNuevo = datosNuevos;
          
          try {
            if (typeof datosAnteriores === 'string') {
              objAnterior = JSON.parse(datosAnteriores);
            }
            if (typeof datosNuevos === 'string') {
              objNuevo = JSON.parse(datosNuevos);
            }
          } catch (e) {}
          
          const diferencias = self.compararObjetos(objAnterior, objNuevo);
          const keysConCambios = Object.keys(diferencias).filter(key => diferencias[key] !== 'same');
          const totalCambios = keysConCambios.length;
          
          let html = `
            <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
              <span class="d-inline-block py-1 px-2 rounded-1 ${clase}" style="width: 100%;">
                <p class="d-flex align-items-center justify-content-center gap-1 mb-0">
                  <i class="${icono}"></i>
                  ${texto}
                </p>
              </span>
          `;
          
          if (totalCambios > 0) {
            html += `
              <span style="font-size: 10px; color: #6c757d; font-weight: 500;">
                ${totalCambios} cambio${totalCambios > 1 ? 's' : ''}
              </span>
            `;
          } else {
            html += `
              <span style="font-size: 10px; color: #6c757d; font-weight: 500;">
                Sin cambios
              </span>
            `;
          }
          
          html += `</div>`;
          
          return html;
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
        headerName: 'Usuario',
        field: 'usuario_login',
        cellStyle: { 
          textAlign: 'left', 
          whiteSpace: 'normal',
          wordBreak: 'break-word',
          lineHeight: '1.3'
        },
        minWidth: 150,
        flex: 1,
        autoHeight: true,
        valueGetter: (params: any) => {
          const login = params.data.usuario_login || '';
          const nombre = params.data.usuario_nombre || '';
          return login ? `${login}${nombre ? ' - ' + nombre : ''}` : 'N/A';
        }
      },
      {
        headerName: 'IP',
        field: 'ip_address',
        cellStyle: { textAlign: 'left' },
        minWidth: 120,
        maxWidth: 140,
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
          
          if (this.auditoriaData.length > 0) {
            this.seleccionarRegistro(this.auditoriaData[0], 0);
          } else {
            this.selectedAuditoria = null;
            this.selectedIndex = -1;
          }
        }
      } else {
        this.auditoriaData = [];
        if (this.gridApi) {
          this.gridApi.setRowData([]);
        }
        this.selectedAuditoria = null;
        this.selectedIndex = -1;
      }
    } catch (error: any) {
      console.error('Error en la petición', error);
      this.auditoriaData = [];
    } finally {
      this._loadingService.setLoading(false);
    }
  }

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