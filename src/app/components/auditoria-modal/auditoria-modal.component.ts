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
import { PanelModule } from '../../components/panel/panel.module'; // <-- Importa el PanelModule


@Component({
  selector: 'app-auditoria-modal',
  standalone: true,
  imports: [CommonModule, NgbModule, FormsModule, AgGridModule,    PanelModule ],
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
  // Forzar actualización de columnas responsive
  if (this.gridApi) {
    //this.gridApi.setColumnDefs(this.columnDefsResponsive);
    setTimeout(() => {
      this.gridApi.sizeColumnsToFit();
    }, 100);
  }
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

  // Función para formatear valores - MUESTRA JSON ORIGINAL SIN TRUNCAR
  formatearValor(valor: any): string {
    if (valor === null || valor === undefined) return '—';
    if (typeof valor === 'string') {
      return valor;
    }
    if (typeof valor === 'number') return valor.toString();
    if (typeof valor === 'boolean') return valor ? 'Sí' : 'No';
    
    if (Array.isArray(valor)) {
      if (valor.length === 0) return '[]';
      try {
        return JSON.stringify(valor, null, 2);
      } catch (e) {
        return `[${valor.length} elementos]`;
      }
    }
    
    if (typeof valor === 'object') {
      try {
        return JSON.stringify(valor, null, 2);
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
    
    // Usar la nueva función de comparación con nombres de menú
    const cambiosCompletos = this.compararProfundoConMenus(objAnterior, objNuevo);
    
    // Aplanar cambios anidados
    const cambiosAplanados = this.aplanarCambios(cambiosCompletos);
    
    // Filtrar solo cambios significativos
    const cambiosFiltrados = this.obtenerSoloCambios(cambiosAplanados);
    
    // Limpiar y formatear paths
    const cambiosLimpios = this.limpiarYFormatearPaths(cambiosFiltrados);
    
    if (cambiosLimpios.length === 0) {
      return {
        cambios: [],
        resumen: 'Sin cambios detectados',
        total: 0,
        added: 0,
        removed: 0,
        modified: 0
      };
    }
    
    const addedCount = cambiosLimpios.filter(c => c.estado === 'added').length;
    const removedCount = cambiosLimpios.filter(c => c.estado === 'removed').length;
    const modifiedCount = cambiosLimpios.filter(c => c.estado === 'modified').length;
    
    return {
      cambios: cambiosLimpios,
      resumen: `${cambiosLimpios.length} cambios detectados`,
      total: cambiosLimpios.length,
      added: addedCount,
      removed: removedCount,
      modified: modifiedCount
    };
  }

  // Función para extraer el nombre del menú de un objeto
  private extraerNombreMenu(obj: any): string | null {
    if (!obj || typeof obj !== 'object') return null;
    
    // Si el objeto tiene menu_nombre, usarlo
    if (obj.menu_nombre) {
      return obj.menu_nombre;
    }
    
    // Si tiene permisos, buscar menu_nombre en el objeto padre
    if (obj.permisos && typeof obj.permisos === 'object') {
      return null;
    }
    
    return null;
  }



// Función para limpiar y formatear paths de forma genérica
private limpiarYFormatearPaths(cambios: any[]): any[] {
  return cambios.map(cambio => {
    let campo = cambio.campo;
    
    // Si el campo tiene puntos, formatearlo
    if (campo.includes('.')) {
      const partes = campo.split('.');
      // Filtrar partes vacías
      let partesFiltradas = partes.filter(p => p && p.trim() !== '');
      
      // Identificar si hay un objeto padre (como "acceso", "perfil", "usuario", etc.)
      // y mantenerlo como parte del path
      if (partesFiltradas.length >= 3) {
        // Ejemplo: acceso.menu_nombre.permiso -> acceso > menu_nombre > permiso
        campo = partesFiltradas.join(' | ');
      } else if (partesFiltradas.length === 2) {
        // Ejemplo: perfil.nombre -> perfil > nombre
        campo = partesFiltradas.join(' | ');
      } else {
        campo = partesFiltradas[0] || campo;
      }
    }
    
    // Eliminar .permisos y otros sufijos comunes
    campo = campo.replace(/\.permisos\./, ' > ');
    campo = campo.replace(/\.permisos$/, '');
    campo = campo.replace(/\.data\./, ' > ');
    campo = campo.replace(/\.data$/, '');
    
    return {
      ...cambio,
      campo: campo
    };
  }).filter(c => c !== null);
}

// // Función para limpiar y formatear paths de forma genérica
// private limpiarYFormatearPaths(cambios: any[]): any[] {
//   return cambios.map(cambio => {
//     let campo = cambio.campo;
    
//     // Si el campo tiene puntos, formatearlo
//     if (campo.includes('.')) {
//       const partes = campo.split('.');
//       // Filtrar partes vacías
//       let partesFiltradas = partes.filter(p => p && p.trim() !== '');
      
//       // Eliminar el primer nodo siempre (cualquiera que sea)
//       if (partesFiltradas.length >= 2) {
//         partesFiltradas = partesFiltradas.slice(1);
//       }
      
//       // Identificar si hay un objeto padre y mantenerlo como parte del path
//       if (partesFiltradas.length >= 3) {
//         campo = partesFiltradas.join(' | ');
//       } else if (partesFiltradas.length === 2) {
//         campo = partesFiltradas.join(' | ');
//       } else {
//         campo = partesFiltradas[0] || campo;
//       }
//     }
    
//     // Eliminar .permisos y otros sufijos comunes
//     campo = campo.replace(/\.permisos\./, ' > ');
//     campo = campo.replace(/\.permisos$/, '');
//     campo = campo.replace(/\.data\./, ' > ');
//     campo = campo.replace(/\.data$/, '');
    
//     return {
//       ...cambio,
//       campo: campo
//     };
//   }).filter(c => c !== null);
// }

// NUEVA FUNCIÓN: Comparar objetos con nombres de menú de forma genérica
private compararProfundoConMenus(obj1: any, obj2: any, path: string = '', nombreActual: string | null = null): any[] {
  const cambios: any[] = [];
  
  // Si ambos son null o undefined, no hay cambios
  if (obj1 === null && obj2 === null) return cambios;
  if (obj1 === undefined && obj2 === undefined) return cambios;
  if (obj1 === null && obj2 === undefined) return cambios;
  if (obj1 === undefined && obj2 === null) return cambios;
  
  // Si son primitivos, comparar directamente
  if (this.esPrimitivo(obj1) || this.esPrimitivo(obj2)) {
    if (obj1 !== obj2) {
      let campoFormateado = path || 'valor';
      
      // Si tenemos nombre, construir el path correcto
      if (nombreActual) {
        // Si el path es "acceso" o empieza con "acceso."
        if (campoFormateado === 'acceso') {
          campoFormateado = `acceso.${nombreActual}`;
        } else if (campoFormateado.startsWith('acceso.')) {
          if (!campoFormateado.includes(nombreActual)) {
            campoFormateado = `acceso.${nombreActual}`;
          }
        } else if (campoFormateado.includes('permisos')) {
          campoFormateado = campoFormateado.replace('permisos', nombreActual);
        } else if (campoFormateado === '' || campoFormateado === 'valor') {
          // Si está vacío, construir con acceso y menú
          campoFormateado = `acceso.${nombreActual}`;
        } else if (campoFormateado.includes('.')) {
          // Para otros casos con puntos, reemplazar la última parte
          const partes = campoFormateado.split('.');
          if (partes.length >= 2) {
            // Si la última parte es un nombre de campo, mantener la estructura
            partes[partes.length - 1] = nombreActual;
            campoFormateado = partes.join('.');
          }
        } else {
          // Para casos simples, agregar el nombre
          campoFormateado = `${campoFormateado}.${nombreActual}`;
        }
      }
      
      cambios.push({
        campo: campoFormateado,
        valorAnterior: this.formatearValor(obj1),
        valorNuevo: this.formatearValor(obj2),
        estado: obj1 === undefined || obj1 === null ? 'added' : 
                obj2 === undefined || obj2 === null ? 'removed' : 'modified'
      });
    }
    return cambios;
  }
  
  // Si son arrays, comparar elemento por elemento
  if (Array.isArray(obj1) || Array.isArray(obj2)) {
    const arr1 = Array.isArray(obj1) ? obj1 : [];
    const arr2 = Array.isArray(obj2) ? obj2 : [];
    
    const maxLen = Math.max(arr1.length, arr2.length);
    const cambiosArray: any[] = [];
    
    for (let i = 0; i < maxLen; i++) {
      const val1 = i < arr1.length ? arr1[i] : undefined;
      const val2 = i < arr2.length ? arr2[i] : undefined;
      
      if (JSON.stringify(val1) !== JSON.stringify(val2)) {
        let nuevoPath = path;
        let nuevoNombre = nombreActual;
        
        // Si el elemento tiene menu_nombre, usarlo
        if (val1 && typeof val1 === 'object' && val1.menu_nombre) {
          nuevoNombre = val1.menu_nombre;
          if (path === 'acceso' || path === '' || path === 'valor') {
            nuevoPath = `acceso.${nuevoNombre}`;
          } else if (path.startsWith('acceso.')) {
            const partes = path.split('.');
            if (partes.length >= 2) {
              nuevoPath = `acceso.${nuevoNombre}`;
            } else {
              nuevoPath = `acceso.${nuevoNombre}`;
            }
          } else {
            nuevoPath = `acceso.${nuevoNombre}`;
          }
        } else if (val2 && typeof val2 === 'object' && val2.menu_nombre) {
          nuevoNombre = val2.menu_nombre;
          if (path === 'acceso' || path === '' || path === 'valor') {
            nuevoPath = `acceso.${nuevoNombre}`;
          } else if (path.startsWith('acceso.')) {
            nuevoPath = `acceso.${nuevoNombre}`;
          } else {
            nuevoPath = `acceso.${nuevoNombre}`;
          }
        } else {
          // Buscar cualquier campo que termine en "_nombre" para usarlo como nombre
          if (val1 && typeof val1 === 'object') {
            for (const key of Object.keys(val1)) {
              if (key.endsWith('_nombre') && val1[key]) {
                nuevoNombre = val1[key];
                const padreKey = key.replace('_nombre', '');
                if (path.includes(padreKey) || path === '') {
                  nuevoPath = padreKey;
                }
                break;
              }
            }
          } else if (val2 && typeof val2 === 'object') {
            for (const key of Object.keys(val2)) {
              if (key.endsWith('_nombre') && val2[key]) {
                nuevoNombre = val2[key];
                const padreKey = key.replace('_nombre', '');
                if (path.includes(padreKey) || path === '') {
                  nuevoPath = padreKey;
                }
                break;
              }
            }
          }
        }
        
        const cambiosItem = this.compararProfundoConMenus(val1, val2, nuevoPath, nuevoNombre);
        cambiosArray.push(...cambiosItem);
      }
    }
    
    if (cambiosArray.length > 0) {
      cambios.push(...cambiosArray);
    }
    return cambios;
  }
  
  // Si son objetos, comparar propiedades
  if (typeof obj1 === 'object' || typeof obj2 === 'object') {
    const keys = new Set([...Object.keys(obj1 || {}), ...Object.keys(obj2 || {})]);
    
    // Si el objeto tiene menu_nombre, actualizar el nombre del menú
    if (obj1 && obj1.menu_nombre) {
      nombreActual = obj1.menu_nombre;
      if (path === '' || path === 'acceso' || path === 'valor') {
        path = `acceso.${nombreActual}`;
      }
    } else if (obj2 && obj2.menu_nombre) {
      nombreActual = obj2.menu_nombre;
      if (path === '' || path === 'acceso' || path === 'valor') {
        path = `acceso.${nombreActual}`;
      }
    } else {
      // Buscar cualquier campo que termine en "_nombre"
      for (const key of keys) {
        if (key.endsWith('_nombre')) {
          const val = obj1?.[key] || obj2?.[key];
          if (val && typeof val === 'string') {
            nombreActual = val;
            const padreKey = key.replace('_nombre', '');
            if (path === '' || path === 'valor' || path === padreKey) {
              path = padreKey || 'objeto';
            }
            break;
          }
        }
      }
    }
    
    // Procesamiento normal de objetos
    for (const key of keys) {
      // Saltar keys que no queremos mostrar
      if (key === 'menu_id' || key === 'menu_nombre' || key === 'id' || key === 'perfil_id' || key.endsWith('_id') || key.endsWith('_nombre')) {
        continue;
      }
      
      const val1 = obj1?.[key];
      const val2 = obj2?.[key];
      
      if (val1 === undefined && val2 === undefined) continue;
      if (val1 === null && val2 === null) continue;
      
      // Si la clave es 'permisos', tratarla especialmente
      if (key === 'permisos' && (typeof val1 === 'object' || typeof val2 === 'object')) {
        let menuPath = path;
        if (nombreActual) {
          if (path === 'acceso' || path === '' || path === 'valor') {
            menuPath = `acceso.${nombreActual}`;
          } else if (path.startsWith('acceso.') && !path.includes(nombreActual)) {
            menuPath = `acceso.${nombreActual}`;
          } else if (!path.startsWith('acceso.')) {
            menuPath = `acceso.${nombreActual}`;
          }
        }
        const cambiosItem = this.compararProfundoConMenus(val1, val2, menuPath, nombreActual);
        cambios.push(...cambiosItem);
        continue;
      }
      
      // Si son objetos o arrays, recursión
      if ((typeof val1 === 'object' && val1 !== null) || (typeof val2 === 'object' && val2 !== null)) {
        let nuevoPath = path;
        
        if (nombreActual) {
          if (path === 'acceso' || path === '' || path === 'valor') {
            nuevoPath = `acceso.${nombreActual}.${key}`;
          } else if (path.startsWith('acceso.') && !path.includes(nombreActual)) {
            nuevoPath = `acceso.${nombreActual}.${key}`;
          } else if (!path.startsWith('acceso.')) {
            nuevoPath = `acceso.${nombreActual}.${key}`;
          } else {
            nuevoPath = path ? `${path}.${key}` : key;
          }
        } else {
          nuevoPath = path ? `${path}.${key}` : key;
        }
        
        const cambiosItem = this.compararProfundoConMenus(val1, val2, nuevoPath, nombreActual);
        cambios.push(...cambiosItem);
      } else {
        // Primitivos
        if (val1 !== val2) {
          let campoFormateado = path;
          
          if (nombreActual) {
            if (path === 'acceso' || path === '' || path === 'valor') {
              campoFormateado = `acceso.${nombreActual}.${key}`;
            } else if (path.startsWith('acceso.') && !path.includes(nombreActual)) {
              campoFormateado = `acceso.${nombreActual}.${key}`;
            } else if (!path.startsWith('acceso.')) {
              campoFormateado = `acceso.${nombreActual}.${key}`;
            } else {
              campoFormateado = path ? `${path}.${key}` : key;
            }
          } else {
            campoFormateado = path ? `${path}.${key}` : key;
          }
          
          cambios.push({
            campo: campoFormateado,
            valorAnterior: this.formatearValor(val1),
            valorNuevo: this.formatearValor(val2),
            estado: val1 === undefined || val1 === null ? 'added' : 
                    val2 === undefined || val2 === null ? 'removed' : 'modified'
          });
        }
      }
    }
  }
  
  return cambios;
}




// Función para extraer el path completo con el nombre del menú
private extraerPathConMenu(path: string, menuNombre: string | null): string {
  if (!menuNombre) return path;
  
  // Si el path tiene "acceso.", mantenerlo
  if (path.startsWith('acceso.')) {
    return `acceso.${menuNombre}`;
  }
  
  // Si el path tiene "permisos.", reemplazar con el nombre del menú
  if (path.includes('permisos.')) {
    return path.replace('permisos.', `${menuNombre}.`);
  }
  
  return path;
}

  // Helper para verificar si es primitivo
  private esPrimitivo(valor: any): boolean {
    return valor === null || 
           valor === undefined || 
           typeof valor === 'string' || 
           typeof valor === 'number' || 
           typeof valor === 'boolean';
  }

  // Función para aplanar cambios anidados
  private aplanarCambios(cambios: any[], prefix: string = ''): any[] {
    const resultado: any[] = [];
    
    for (const cambio of cambios) {
      if (cambio.cambiosDetalle) {
        const aplanados = this.aplanarCambios(cambio.cambiosDetalle, cambio.campo);
        resultado.push(...aplanados);
      } else {
        resultado.push({
          ...cambio,
          campo: prefix ? `${prefix}.${cambio.campo}` : cambio.campo
        });
      }
    }
    
    return resultado;
  }

  // Función para obtener solo los cambios significativos
  private obtenerSoloCambios(cambios: any[]): any[] {
    return cambios.filter(cambio => 
      cambio.valorAnterior !== cambio.valorNuevo ||
      cambio.estado === 'added' ||
      cambio.estado === 'removed'
    );
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
            <span class="d-inline-block py-1 px-2 rounded-1 ${clase}" style="width: 100%;">
                <i class="${icono}"></i> ${texto}
            </span>
        `;
    }
},
{
    headerName: 'Fecha',
    field: 'fecha_operacion',
    cellStyle: { textAlign: 'center' },
    minWidth: 150,
    maxWidth: 150,
},
{
    headerName: 'Usuario',
    field: 'usuario_login',
    cellStyle: { 
        textAlign: 'left',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis'
    },
    minWidth: 100,
    maxWidth: 220,
    flex: 1,
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
        minWidth: 100,
        maxWidth: 120,
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

public get columnDefsResponsive(): any[] {
  const isMobile = window.innerWidth < 768;
  const isTablet = window.innerWidth >= 768 && window.innerWidth < 992;
  
  return [
    {
      headerName: 'ID',
      field: 'id',
      cellStyle: { textAlign: 'center' },
      minWidth: isMobile ? 50 : 70,
      maxWidth: isMobile ? 50 : 70,
      hide: isMobile
    },
    {
      headerName: 'Operación',
      field: 'operacion',
      cellStyle: { textAlign: 'center' },
      minWidth: isMobile ? 70 : 120,
      maxWidth: isMobile ? 80 : 120,
      cellRenderer: (params: any) => {
        const operacion = params.value;
        let clase = '';
        let icono = '';
        let texto = '';
        
        if (operacion === 'INSERT') {
          clase = 'badge-insert';
          icono = 'bi bi-plus-circle';
          texto = isMobile ? 'Crear' : 'Creación';
        } else if (operacion === 'UPDATE') {
          clase = 'badge-update';
          icono = 'bi bi-arrow-repeat';
          texto = isMobile ? 'Actual' : 'Actualización';
        } else {
          clase = 'badge-delete';
          icono = 'bi bi-trash';
          texto = isMobile ? 'Elim' : 'Eliminación';
        }
        
        return `
          <span class="d-inline-block py-1 px-2 rounded-1 ${clase}" style="width: 100%; font-size: ${isMobile ? '8px' : 'inherit'};">
            <i class="${icono}"></i> ${texto}
          </span>
        `;
      }
    },
    {
      headerName: 'Fecha',
      field: 'fecha_operacion', // Campo principal
      cellStyle: { textAlign: 'center' },
      minWidth: isMobile ? 80 : 150,
      maxWidth: isMobile ? 90 : 150,
      // Value getter que intenta múltiples nombres de campo
      valueGetter: (params: any) => {
        // Intentar diferentes nombres de campo
        const fecha = params.data.fecha_operacion || 
                     params.data.fechaOperacion || 
                     params.data.fecha || 
                     params.data.created_at || 
                     params.data.updated_at;
        
        if (!fecha) return isMobile ? '--' : 'Sin fecha';
        
        try {
          const date = new Date(fecha);
          if (isNaN(date.getTime())) {
            return isMobile ? fecha.substring(0, 10) : fecha;
          }
          
          if (isMobile) {
            // Formato corto en móvil: DD/MM/YY
            return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getFullYear()).slice(-2)}`;
          } else if (isTablet) {
            // Formato medio en tablet: DD/MM/YYYY HH:MM
            return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
          } else {
            // Formato completo en desktop: DD/MM/YYYY HH:MM:SS
            return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
          }
        } catch (e) {
          return isMobile ? fecha.substring(0, 10) : fecha;
        }
      }
    },
    {
      headerName: 'Usuario',
      field: 'usuario_login',
      cellStyle: { 
        textAlign: 'left',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis'
      },
      minWidth: isMobile ? 60 : 100,
      maxWidth: isMobile ? 100 : 220,
      flex: isMobile ? 0 : 1,
      valueGetter: (params: any) => {
        const login = params.data.usuario_login || 
                     params.data.usuario || 
                     params.data.user_login || 
                     params.data.user || '';
        const nombre = params.data.usuario_nombre || 
                      params.data.usuarioNombre || 
                      params.data.user_name || 
                      params.data.nombre || '';
        
        if (isMobile) {
          return login || nombre || 'N/A';
        }
        return login ? `${login}${nombre ? ' - ' + nombre : ''}` : (nombre || 'N/A');
      }
    },
    {
      headerName: 'IP',
      field: 'ip_address',
      cellStyle: { textAlign: 'left' },
      minWidth: isMobile ? 60 : 100,
      maxWidth: isMobile ? 70 : 120,
      hide: isMobile,
      valueGetter: (params: any) => {
        return params.data.ip_address || 
               params.data.ip || 
               params.data.direccion_ip || 
               '--';
      }
    }
  ];
}



}
