import { Component, Input, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgbActiveModal, NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { AuditoriaService } from '../../service/auditoria.service';
import { FormsModule } from '@angular/forms';
import { LoadingService } from '../../service/loading.service';
import { firstValueFrom } from 'rxjs';
import { PanelModule } from '../../components/panel/panel.module';
import moment from 'moment';

@Component({
  selector: 'app-auditoria-modal',
  standalone: true,
  imports: [CommonModule, NgbModule, FormsModule, PanelModule],
  templateUrl: './auditoria-modal.component.html',
  styleUrls: ['./auditoria-modal.component.scss']
})
export class AuditoriaModalComponent implements OnInit {
  @Input() tablaNombre!: string;
  @Input() registroId!: number;

  public isLoading$ = this._loadingService.isLoading$;
  public auditoriaData: any[] = [];
  public selectedAuditoria: any = null;
  public selectedIndex: number = -1;

  // ===================== FILTROS =====================
  public filtro = {
    tipoOperacion: '',
    fechaDesde: '',
    fechaHasta: ''
  };

  // ===================== DATE RANGE =====================
  public fechaInicio: string = '';
  public fechaFin: string = '';
  public prevDate: string = '';

  // ===================== PAGINACIÓN =====================
  public paginaActual: number = 1;
  public totalRegistros: number = 0;
  public registrosPorPagina: number = 3;
  public ultimaPagina: number = 1;

  constructor(
    public activeModal: NgbActiveModal,
    private auditoriaService: AuditoriaService,
    private _loadingService: LoadingService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    // Fechas por defecto: últimos 7 días
    const hoy = moment();
    const hace7Dias = moment().subtract(7, 'days');
    
    this.fechaInicio = hace7Dias.format('YYYY-MM-DD');
    this.fechaFin = hoy.format('YYYY-MM-DD');
    this.filtro.fechaDesde = this.fechaInicio;
    this.filtro.fechaHasta = this.fechaFin;
    
    this.actualizarPrevDate();
    this.cargarAuditoria();
  }

  // ===================== DATE RANGE METHODS =====================

  actualizarPrevDate(): void {
    if (this.fechaInicio && this.fechaFin) {
      const inicio = moment(this.fechaInicio);
      const fin = moment(this.fechaFin);
      const diff = fin.diff(inicio, 'days');
      
      const prevInicio = moment(inicio).subtract(diff + 1, 'days');
      const prevFin = moment(inicio).subtract(1, 'days');
      
      this.prevDate = prevInicio.format('D MMMM') + ' - ' + prevFin.format('D MMMM YYYY');
    }
  }

  aplicarRango(dias: number): void {
    const hoy = moment();
    const inicio = moment().subtract(dias, 'days');
    
    this.fechaInicio = inicio.format('YYYY-MM-DD');
    this.fechaFin = hoy.format('YYYY-MM-DD');
    this.filtro.fechaDesde = this.fechaInicio;
    this.filtro.fechaHasta = this.fechaFin;
    
    this.actualizarPrevDate();
    this.aplicarFiltros();
  }

  onFechaChange(): void {
    this.filtro.fechaDesde = this.fechaInicio;
    this.filtro.fechaHasta = this.fechaFin;
    this.actualizarPrevDate();
  }

  // ===================== OPERACIONES =====================

  public operacionInfo(operacion: string): { texto: string; icono: string; clase: string } {
    switch ((operacion || '').toUpperCase()) {
      case 'INSERT':
        return { texto: 'Creación', icono: 'fa-solid fa-plus', clase: 'badge-insert' };
      case 'UPDATE':
        return { texto: 'Actualización', icono: 'fa-solid fa-arrows-rotate', clase: 'badge-update' };
      default:
        return { texto: 'Eliminación', icono: 'fa-solid fa-trash', clase: 'badge-delete' };
    }
  }

  public etiquetaEstado(estado: string): string {
    switch (estado) {
      case 'added':    return 'Campo agregado';
      case 'removed':  return 'Campo eliminado';
      case 'modified': return 'Campo modificado';
      default:         return 'Sin cambios';
    }
  }

  // ===================== FORMATEO =====================

  formatearValor(valor: any): string {
    if (valor === null || valor === undefined) return '—';
    if (typeof valor === 'string') return valor;
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

  // ===================== COMPARACIÓN =====================

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

  // ===================== SELECCIÓN =====================

  seleccionarRegistro(registro: any, index: number): void {
    this.selectedAuditoria = registro;
    this.selectedIndex = index;
    this.cdr.detectChanges();
  }

  private limpiarSeleccion(): void {
    this.selectedAuditoria = null;
    this.selectedIndex = -1;
  }

  // ===================== CAMBIOS FORMATEADOS =====================

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
    
    const cambiosCompletos = this.compararProfundoConMenus(objAnterior, objNuevo);
    const cambiosAplanados = this.aplanarCambios(cambiosCompletos);
    const cambiosFiltrados = this.obtenerSoloCambios(cambiosAplanados);
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

  private limpiarYFormatearPaths(cambios: any[]): any[] {
    return cambios.map(cambio => {
      let campo = cambio.campo;
      
      if (campo.includes('.')) {
        const partes = campo.split('.');
        let partesFiltradas = partes.filter(p => p && p.trim() !== '');
        
        if (partesFiltradas.length >= 3) {
          campo = partesFiltradas.join(' | ');
        } else if (partesFiltradas.length === 2) {
          campo = partesFiltradas.join(' | ');
        } else {
          campo = partesFiltradas[0] || campo;
        }
      }
      
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

  private compararProfundoConMenus(obj1: any, obj2: any, path: string = '', nombreActual: string | null = null): any[] {
    const cambios: any[] = [];
    
    if (obj1 === null && obj2 === null) return cambios;
    if (obj1 === undefined && obj2 === undefined) return cambios;
    if (obj1 === null && obj2 === undefined) return cambios;
    if (obj1 === undefined && obj2 === null) return cambios;
    
    if (this.esPrimitivo(obj1) || this.esPrimitivo(obj2)) {
      if (obj1 !== obj2) {
        let campoFormateado = path || 'valor';
        
        if (nombreActual) {
          if (campoFormateado === 'acceso') {
            campoFormateado = `acceso.${nombreActual}`;
          } else if (campoFormateado.startsWith('acceso.')) {
            if (!campoFormateado.includes(nombreActual)) {
              campoFormateado = `acceso.${nombreActual}`;
            }
          } else if (campoFormateado.includes('permisos')) {
            campoFormateado = campoFormateado.replace('permisos', nombreActual);
          } else if (campoFormateado === '' || campoFormateado === 'valor') {
            campoFormateado = `acceso.${nombreActual}`;
          } else if (campoFormateado.includes('.')) {
            const partes = campoFormateado.split('.');
            if (partes.length >= 2) {
              partes[partes.length - 1] = nombreActual;
              campoFormateado = partes.join('.');
            }
          } else {
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
    
    if (typeof obj1 === 'object' || typeof obj2 === 'object') {
      const keys = new Set([...Object.keys(obj1 || {}), ...Object.keys(obj2 || {})]);
      
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
      
      for (const key of keys) {
        if (key === 'menu_id' || key === 'menu_nombre' || key === 'id' || key === 'perfil_id' || key.endsWith('_id') || key.endsWith('_nombre')) {
          continue;
        }
        
        const val1 = obj1?.[key];
        const val2 = obj2?.[key];
        
        if (val1 === undefined && val2 === undefined) continue;
        if (val1 === null && val2 === null) continue;
        
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

  private esPrimitivo(valor: any): boolean {
    return valor === null || 
           valor === undefined || 
           typeof valor === 'string' || 
           typeof valor === 'number' || 
           typeof valor === 'boolean';
  }

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

  private obtenerSoloCambios(cambios: any[]): any[] {
    return cambios.filter(cambio => 
      cambio.valorAnterior !== cambio.valorNuevo ||
      cambio.estado === 'added' ||
      cambio.estado === 'removed'
    );
  }

  // ===================== PAGINACIÓN =====================

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

  // ===================== FILTROS =====================

  limpiarFiltros(): void {
    this.filtro = {
      tipoOperacion: '',
      fechaDesde: '',
      fechaHasta: ''
    };
    // También reseteamos las fechas del selector
    const hoy = moment();
    const hace7Dias = moment().subtract(7, 'days');
    this.fechaInicio = hace7Dias.format('YYYY-MM-DD');
    this.fechaFin = hoy.format('YYYY-MM-DD');
    this.filtro.fechaDesde = this.fechaInicio;
    this.filtro.fechaHasta = this.fechaFin;
    this.actualizarPrevDate();
    this.paginaActual = 1;
    this.cargarAuditoria(1);
  }

  aplicarFiltros(): void {
    this.paginaActual = 1;
    this.cargarAuditoria(1);
  }

  // ===================== CARGA =====================

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
        
        if (this.auditoriaData.length > 0) {
          this.seleccionarRegistro(this.auditoriaData[0], 0);
        } else {
          this.limpiarSeleccion();
        }
      } else {
        this.auditoriaData = [];
        this.limpiarSeleccion();
      }
    } catch (error: any) {
      console.error('Error en la petición', error);
      this.auditoriaData = [];
      this.limpiarSeleccion();
    } finally {
      this._loadingService.setLoading(false);
    }
  }
}