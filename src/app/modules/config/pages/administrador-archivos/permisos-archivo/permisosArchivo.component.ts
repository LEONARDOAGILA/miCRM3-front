import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { AgGridModule } from 'ag-grid-angular';
import { CellClickedEvent, GridApi, GridReadyEvent, RowClassParams } from 'ag-grid-community';
import { ToastrService } from 'ngx-toastr';
import { Subject, firstValueFrom, from, merge, of } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';
import Swal from 'sweetalert2';

import { ArchivoService } from '../../../services/archivo.service';
import { AppAgGridService } from '../../../../../service/app-agGrid.service';
import { LoadingService } from '../../../../../service/loading.service';
import { PanelModule } from '../../../../../components/panel/panel.module';
import { ModalHeaderComponent } from '../../../../../components/modal/modal-header/modal-header.component';
import { ModalFooterComponent } from '../../../../../components/modal/modal-footer/modal-footer.component';
import { CampoBusquedaComponent } from '../../../../../components/campos/campoBusqueda/campoBusqueda.component';
import { ListUsersComponent } from '../../../../seguridad/pages/users/listUsers/listUsers.component';

/** Banderas que se conceden; mismo orden que en el back (PermisoArchivo::BANDERAS). */
export const BANDERAS_PERMISO = [
  { id: 'ver',         etiqueta: 'Ver',         ayuda: 'Lo ve en su árbol y su lista' },
  { id: 'ejecutar',    etiqueta: 'Abrir',       ayuda: 'Lo abre en el visor' },
  { id: 'descargar',   etiqueta: 'Descargar',   ayuda: 'Puede descargarlo o abrirlo en otra pestaña (si la URL no está protegida)' },
  { id: 'crear',       etiqueta: 'Crear',       ayuda: 'Puede crear dentro (sólo carpetas)' },
  { id: 'editar',      etiqueta: 'Editar',      ayuda: 'Puede modificarlo' },
  { id: 'eliminar',    etiqueta: 'Eliminar',    ayuda: 'Puede enviarlo a la papelera' },
  { id: 'administrar', etiqueta: 'Administrar', ayuda: 'Puede dar permisos a otros sobre este elemento' },
  { id: 'restaurar',   etiqueta: 'Restaurar',   ayuda: 'Puede ver la papelera y restaurar lo que se eliminó de aquí' },
] as const;

export type BanderaPermiso = typeof BANDERAS_PERMISO[number]['id'];

/** Fila de la grilla: permiso de un usuario (directo o heredado). */
export interface FilaPermiso {
  user_id: number;
  login_user: string;
  name: string;
  surname: string;
  type_user: number;
  isactive: boolean;
  ver: boolean; ejecutar: boolean; descargar: boolean; crear: boolean;
  editar: boolean; eliminar: boolean; administrar: boolean; restaurar: boolean;
  hereda: boolean;
  denegar: boolean;
  vigente_hasta: string | null;
  caducado: boolean;
  origen: 'DIRECTO' | 'HEREDADO';
  desde: { id: number; nombre: string } | null;
  guardando?: boolean;
  nueva?: boolean;
  _original?: string;
}

interface Acceso {
  id: number; accion: 'EJECUTAR' | 'DESCARGAR'; usuario_login: string; name?: string; surname?: string;
  ip_address?: string; fecha: string;
}

/**
 * Modal "Permisos" de un archivo o carpeta. Mismo esquema que save2Profile:
 * panel de datos arriba y panel de permisos con ag-Grid debajo, casillas
 * que se activan con un clic en la celda (checkboxCellRenderer + onCellClicked)
 * y columna ACCIONES plegable a la derecha (como allProfiles).
 *
 * Filas DIRECTAS (de este nodo): editables, se guardan fila a fila o todas
 * con el pie. Filas HEREDADAS (de una carpeta de arriba con `hereda`): en
 * gris, sólo lectura, con "Ajustar aquí" para copiarlas como directas.
 * Los usuarios se añaden con el modal listUsers (misma pieza que usa
 * saveUser para el horario). El back es quien manda: aquí se pinta lo que
 * devuelve y se oculta lo que el que consulta no puede tocar.
 */
@Component({
  selector: 'app-permisos-archivo',
  standalone: true,
  imports: [CommonModule, FormsModule, AgGridModule, PanelModule, ModalHeaderComponent, ModalFooterComponent, CampoBusquedaComponent],
  templateUrl: './permisosArchivo.component.html',
  styleUrls: ['./permisosArchivo.component.css'],
})
export class PermisosArchivoComponent implements OnInit, OnDestroy {

  /** Nodo (id y nombre bastan; el resto se pide al back). */
  @Input() elemento!: { id: number; nombre: string; escarpeta: boolean; icono?: string; color?: string };
  /** Algo cambió (público o filas): el administrador puede refrescar. */
  @Output() cambio = new EventEmitter<void>();

  readonly banderas = BANDERAS_PERMISO;
  public isLoading$ = this._loadingService.isLoading$;
  public title = 'Permisos';

  puedeAdministrar = false;
  archivo: { id: number; nombre: string; escarpeta: boolean; publico: boolean; padre: number | null;
             propietario: { id: number; login_user: string; name: string; surname: string } | null } | null = null;
  /** Filas de la grilla: directas primero, heredadas después. */
  filas: FilaPermiso[] = [];
  guardandoPublico = false;

  // ---------- ag-Grid permisos ----------
  public gridApi!: GridApi;
  public columnDefs: any[] = [];
  /** Columna ACCIONES plegada (sólo el botón ☰ en cada celda), como allProfiles. */
  public accionesPlegadas = false;
  private readonly ANCHO_ACCIONES_ABIERTA = 130;
  private readonly ANCHO_ACCIONES_PLEGADA = 50;
  public rowClassRules = {
    'fila-heredada': (p: RowClassParams) => p.data?.origen === 'HEREDADO',
    'fila-cambiada': (p: RowClassParams) => p.data?.origen === 'DIRECTO' && this.cambiada(p.data),
    'fila-denegada': (p: RowClassParams) => !!p.data?.denegar,
    'fila-caducada': (p: RowClassParams) => !!p.data?.caducado,
  };

  // ---------- ag-Grid accesos ----------
  accesos: Acceso[] = [];
  accesosCargados = false;
  public columnDefsAccesos: any[] = [];

  private readonly destroy$ = new Subject<void>();

  constructor(
    public modal: NgbActiveModal,
    private modalService: NgbModal,
    private _archivoService: ArchivoService,
    private _toastr: ToastrService,
    private _loadingService: LoadingService,
    public _appAgGridService: AppAgGridService
  ) {}

  ngOnInit(): void {
    this.title = `Permisos de «${this.elemento?.nombre ?? ''}»`;
    this.initializeGrid();
    this.cargar();
    this.cargarAccesos();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ================================================================
  // AG-GRID
  // ================================================================

  /**
   * Casilla de permiso para la grilla (misma que save2Profile). El clic lo
   * gestiona onCellClicked, por eso el input no es interactivo.
   */
  private checkboxCellRenderer(params: any): string {
    const soloLectura = (!this.puedeAdministrar || params.data?.origen === 'HEREDADO' || params.data?.denegar) ? 'disabled' : '';
    const marcado = params.value === true ? 'checked' : '';
    return `<div class="permiso-check">
              <input class="form-check-input" type="checkbox" ${marcado} ${soloLectura} />
            </div>`;
  }

  initializeGrid(): void {
    const colBandera = (id: BanderaPermiso, etiqueta: string, ayuda: string) => ({
      headerName: etiqueta,
      field: id,
      headerTooltip: ayuda,
      cellStyle: { textAlign: 'center' },
      minWidth: 88,
      maxWidth: 88,
      sortable: false,
      filter: false,
      cellRenderer: (params: any) => this.checkboxCellRenderer(params),
    });

    this.columnDefs = [
      {
        headerName: 'Usuario',
        field: 'login_user',
        cellStyle: { textAlign: 'left' },
        minWidth: 220,
        maxWidth: 320,
        // login en negrita + nombre; los heredados dicen de qué carpeta vienen
        cellRenderer: (params: any) => {
          const f: FilaPermiso = params.data;
          const nombre = `${f.name ?? ''} ${f.surname ?? ''}`.trim();
          const etiquetas =
            (f.nueva ? ' <span class="badge bg-primary fs-9px">nuevo</span>' : '') +
            (f.caducado ? ' <span class="badge bg-danger fs-9px">caducado</span>' : '') +
            (f.isactive === false ? ' <span class="badge bg-secondary fs-9px">inactivo</span>' : '');
          const origen = f.origen === 'HEREDADO'
            ? `<span class="permiso-usuario__origen"><i class="fa fa-arrow-turn-up fa-flip-horizontal me-1"></i>heredado de «${f.desde?.nombre ?? ''}»</span>`
            : '';
          return `<div class="permiso-usuario">
                    <span class="permiso-usuario__login">${f.login_user ?? ''}${etiquetas}</span>
                    <span class="permiso-usuario__nombre">${nombre}</span>
                    ${origen}
                  </div>`;
        }
      },
      ...this.banderas.map(b => colBandera(b.id, b.etiqueta, b.ayuda)),
      {
        headerName: 'Hereda',
        field: 'hereda',
        headerTooltip: 'En carpetas: el permiso vale para todo el subárbol',
        cellStyle: { textAlign: 'center' },
        minWidth: 80, maxWidth: 80, sortable: false, filter: false,
        cellRenderer: (params: any) => this.elemento.escarpeta
          ? this.checkboxCellRenderer(params)
          : '<span class="text-muted">—</span>',
      },
      {
        headerName: 'Denegar',
        field: 'denegar',
        headerTooltip: 'Bloquea todo cuando esta fila es la que manda (la más cercana al elemento)',
        cellStyle: { textAlign: 'center' },
        minWidth: 84, maxWidth: 84, sortable: false, filter: false,
        cellRenderer: (params: any) => {
          const soloLectura = (!this.puedeAdministrar || params.data?.origen === 'HEREDADO') ? 'disabled' : '';
          const marcado = params.value === true ? 'checked' : '';
          return `<div class="permiso-check permiso-check--denegar">
                    <input class="form-check-input" type="checkbox" ${marcado} ${soloLectura} />
                  </div>`;
        },
      },
      {
        headerName: 'Vence',
        field: 'vigente_hasta',
        headerTooltip: 'Caducidad del permiso (AAAA-MM-DD; vacío = sin caducidad). Doble clic para editar',
        cellStyle: { textAlign: 'center' },
        minWidth: 110, maxWidth: 110, sortable: false, filter: false,
        editable: (p: any) => this.puedeAdministrar && p.data?.origen === 'DIRECTO',
        valueFormatter: (p: any) => p.value || '—',
        valueSetter: (p: any) => {
          const v = String(p.newValue ?? '').trim();
          if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
            this._toastr.warning('Fecha en formato AAAA-MM-DD', 'Vence');
            return false;
          }
          p.data.vigente_hasta = v || null;
          return true;
        },
      },
      {
        headerName: 'ACCIONES',
        field: 'actions',
        cellStyle: { display: 'flex', justifyContent: 'center', alignItems: 'center' },
        pinned: 'right',
        minWidth: this.ANCHO_ACCIONES_ABIERTA,
        maxWidth: this.ANCHO_ACCIONES_ABIERTA,
        suppressMenu: true,
        sortable: false,
        filter: false,
        resizable: false,
        headerComponentParams: { template: this.plantillaCabeceraAcciones(false) },
        // HTML en cadena (no plantilla Angular): el clic se resuelve en onCellClicked
        cellRenderer: (params: any) => this.botonesAccion(params.data),
      },
    ];

    this.columnDefsAccesos = [
      { headerName: 'Fecha', field: 'fecha', minWidth: 150, maxWidth: 160, cellStyle: { textAlign: 'center' } },
      {
        headerName: 'Usuario', minWidth: 200, cellStyle: { textAlign: 'left' },
        valueGetter: (p: any) => `${p.data?.name ?? ''} ${p.data?.surname ?? ''}`.trim() + ` (${p.data?.usuario_login ?? ''})`,
      },
      {
        headerName: 'Acción', field: 'accion', minWidth: 110, maxWidth: 110,
        cellStyle: { display: 'flex', justifyContent: 'center', alignItems: 'center' },
        cellRenderer: (p: any) => p.value === 'DESCARGAR'
          ? '<span class="badge bg-primary fs-10px"><i class="fa fa-download me-1"></i>Descargó</span>'
          : '<span class="badge bg-teal fs-10px"><i class="fa fa-play me-1"></i>Abrió</span>',
      },
      { headerName: 'IP', field: 'ip_address', minWidth: 120, maxWidth: 140, cellStyle: { textAlign: 'center' } },
    ];
  }

  /** Cabecera de ACCIONES: con flecha (abierta) o sólo ☰ (plegada). Clic = plegar/desplegar. */
  private plantillaCabeceraAcciones(plegada: boolean): string {
    return plegada
      ? `<div style="display:flex;align-items:center;justify-content:center;" title="Mostrar los botones de acción"><i class="fas fa-bars"></i></div>`
      : `<div style="display:flex;align-items:center;justify-content:center;gap:5px;" title="Ocultar los botones de acción"><span>ACCIONES</span><i class="fas fa-arrow-right"></i></div>`;
  }

  /** Botones de la celda ACCIONES; los data-accion los lee onCellClicked. */
  private botonesAccion(f: FilaPermiso): string {
    if (!this.puedeAdministrar) { return ''; }
    if (this.accionesPlegadas) {
      return `<button type="button" class="btn btn-sm btn-outline-primary acciones-desplegar" data-accion="desplegar" title="Mostrar los botones de acción"><i class="fas fa-bars"></i></button>`;
    }
    if (f.origen === 'HEREDADO') {
      return `<button type="button" class="btn-icon btn-ajustar" data-accion="ajustar" title="Copiar aquí para ajustarlo en este elemento"><i class="fa fa-sliders"></i></button>`;
    }
    const cambiada = this.cambiada(f);
    return `<div class="permiso-acciones">
              <button type="button" class="btn-icon btn-todo"    data-accion="todo"    title="Marcar todo"    ${f.denegar ? 'disabled' : ''}><i class="fa fa-check-double"></i></button>
              <button type="button" class="btn-icon btn-nada"    data-accion="nada"    title="Desmarcar todo" ${f.denegar ? 'disabled' : ''}><i class="fa fa-eraser"></i></button>
              <button type="button" class="btn-icon btn-guardar" data-accion="guardar" title="Guardar esta fila" ${cambiada && !f.guardando ? '' : 'disabled'}><i class="fa ${f.guardando ? 'fa-spinner fa-spin' : 'fa-floppy-disk'}"></i></button>
              <button type="button" class="btn-icon btn-quitar"  data-accion="quitar"  title="Quitar el permiso"><i class="fa fa-trash"></i></button>
            </div>`;
  }

  onGridReady(params: GridReadyEvent): void {
    this.gridApi = params.api;
    this._appAgGridService.ajustarTamanoGrid(this.gridApi);
  }

  ajustarTamanoGrid(): void {
    this._appAgGridService.ajustarTamanoGrid(this.gridApi);
  }

  onFilterTextBoxChanged(): void {
    this.gridApi?.setQuickFilter((document.getElementById('filter-text-box-permisos') as HTMLInputElement)?.value ?? '');
  }

  /** Plegar / desplegar la columna ACCIONES (mismo mecanismo que allProfiles). */
  toggleActionsColumn(): void {
    const columnDefs = this.gridApi.getColumnDefs() as any[];
    const actionsCol = columnDefs.find(col => col.field === 'actions');
    if (!actionsCol) { return; }
    this.accionesPlegadas = !this.accionesPlegadas;
    const ancho = this.accionesPlegadas ? this.ANCHO_ACCIONES_PLEGADA : this.ANCHO_ACCIONES_ABIERTA;
    actionsCol.minWidth = ancho;
    actionsCol.maxWidth = ancho;
    actionsCol.headerComponentParams = { template: this.plantillaCabeceraAcciones(this.accionesPlegadas) };
    this.gridApi.setColumnDefs(columnDefs);
    this.gridApi.refreshHeader();
    this.gridApi.refreshCells({ force: true, columns: ['actions'] });
  }

  /** Clic en la cabecera de ACCIONES (ag-Grid no lo expone por columna: se mira el target). */
  onHeaderClicked(ev: MouseEvent): void {
    const th = (ev.target as HTMLElement).closest('.ag-header-cell') as HTMLElement | null;
    if (th?.getAttribute('col-id') === 'actions') { this.toggleActionsColumn(); }
  }

  /**
   * Clic en una celda: en las columnas de banderas alterna la casilla (como
   * save2Profile); en ACCIONES ejecuta el botón pulsado (data-accion).
   */
  onCellClicked(e: CellClickedEvent): void {
    const f: FilaPermiso = e.data;
    const field = e.column.getColId();
    if (!f) { return; }

    if (field === 'actions') {
      const accion = ((e.event?.target as HTMLElement)?.closest('[data-accion]') as HTMLElement)?.dataset['accion'];
      switch (accion) {
        case 'desplegar': this.toggleActionsColumn(); break;
        case 'ajustar':   this.ajustarAqui(f); break;
        case 'todo':      this.todo(f, true); break;
        case 'nada':      this.todo(f, false); break;
        case 'guardar':   this.guardar(f); break;
        case 'quitar':    this.quitar(f); break;
      }
      return;
    }

    if (!this.puedeAdministrar || f.origen === 'HEREDADO') { return; }

    const banderas = this.banderas.map(b => b.id as string);
    if (banderas.includes(field)) {
      if (f.denegar) { return; }
      const b = field as BanderaPermiso;
      f[b] = !f[b];
      if (b !== 'ver' && f[b]) { f.ver = true; }                 // cualquier permiso implica verlo
      if (b === 'ver' && !f.ver) { this.banderas.forEach(x => f[x.id] = false); }   // sin ver, nada
    } else if (field === 'hereda' && this.elemento.escarpeta) {
      f.hereda = !f.hereda;
    } else if (field === 'denegar') {
      f.denegar = !f.denegar;
      if (f.denegar) { this.banderas.forEach(x => f[x.id] = false); }
      else { f.ver = true; f.ejecutar = true; }
    } else {
      return;
    }
    this.refrescarFila(f);
  }

  private refrescarFila(f: FilaPermiso): void {
    const nodo = this.gridApi?.getRowNode(String(f.user_id));
    if (nodo) {
      this.gridApi.refreshCells({ force: true, rowNodes: [nodo] });
      this.gridApi.redrawRows({ rowNodes: [nodo] });   // para que rowClassRules (fila-cambiada) se recalculen
    }
  }

  /** getRowId: el usuario identifica la fila (así refrescamos por nodo). */
  getRowId = (p: any) => String(p.data.user_id);

  // ================================================================
  // DATOS
  // ================================================================

  async cargar(): Promise<void> {
    try {
      this._loadingService.setLoading(true);
      const res = await firstValueFrom(this._archivoService.permisosArchivo(this.elemento.id));
      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudieron cargar los permisos', 'Permisos');
        return;
      }
      this.archivo = res.data.archivo;
      this.puedeAdministrar = !!res.data.puedeAdministrar;
      const directos: FilaPermiso[] = (res.data.directos ?? []).map((f: FilaPermiso) => this.conOriginal(f));
      const heredados: FilaPermiso[] = res.data.heredados ?? [];
      this.filas = [...directos, ...heredados];
      this.gridApi?.setRowData(this.filas);
    } catch (e) {
      console.error('Error al cargar permisos:', e);
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  private conOriginal(f: FilaPermiso): FilaPermiso {
    f._original = this.firma(f);
    return f;
  }

  private firma(f: FilaPermiso): string {
    return JSON.stringify([...this.banderas.map(b => !!f[b.id]), !!f.hereda, !!f.denegar, f.vigente_hasta ?? null]);
  }

  cambiada(f: FilaPermiso): boolean {
    return !!f.nueva || this.firma(f) !== f._original;
  }

  get directos(): FilaPermiso[] { return this.filas.filter(f => f.origen === 'DIRECTO'); }
  get heredados(): FilaPermiso[] { return this.filas.filter(f => f.origen === 'HEREDADO'); }
  get hayCambios(): boolean { return this.directos.some(f => this.cambiada(f)); }
  get numCambios(): number { return this.directos.filter(f => this.cambiada(f)).length; }

  // ---------- Público ----------

  async cambiarPublico(valor: boolean): Promise<void> {
    if (!this.archivo || this.guardandoPublico) { return; }
    this.guardandoPublico = true;
    const anterior = this.archivo.publico;
    this.archivo.publico = valor;
    try {
      const res = await firstValueFrom(this._archivoService.editArchivo(this.archivo.id, { nombre: this.archivo.nombre, publico: valor })) as any;
      if (res?.status !== 'success') { throw new Error(res?.message); }
      this._toastr.success(valor ? 'Ahora lo ven todos los usuarios' : 'Ya no es público', 'Permisos');
      this.cambio.emit();
    } catch (e) {
      this.archivo.publico = anterior;
      console.error('Error al cambiar público:', e);
    } finally {
      this.guardandoPublico = false;
    }
  }

  // ---------- Añadir usuario (modal listUsers, como saveUser con el horario) ----------

  agregarUsuario(): void {
    if (!this.puedeAdministrar) { return; }
    const modalRef = this.modalService.open(ListUsersComponent, {
      size: 'lg',
      centered: true,
      backdrop: 'static',
      keyboard: true,
    });
    modalRef.componentInstance.usuariosExcluidos = this.filas.map(f => f.user_id);
    modalRef.componentInstance.ayuda = 'Haz clic sobre un usuario para darle permiso sobre este elemento.';

    // takeUntil con el cierre del modal: `seleccionado` no completa nunca
    modalRef.componentInstance.seleccionado
      .pipe(takeUntil(merge(this.destroy$, from(modalRef.result).pipe(catchError(() => of(null))))))
      .subscribe((u: any) => this.agregarFila(u));
  }

  /** Fila nueva (aún sin guardar) con Ver + Abrir, el default de la tabla. */
  private agregarFila(u: any): void {
    if (this.filas.some(f => f.user_id === u.id)) { return; }
    const fila: FilaPermiso = {
      user_id: u.id, login_user: u.login_user, name: u.name, surname: u.surname, type_user: u.type_user, isactive: u.isactive !== false,
      ver: true, ejecutar: true, descargar: false, crear: false, editar: false, eliminar: false, administrar: false, restaurar: false,
      hereda: true, denegar: false, vigente_hasta: null, caducado: false,
      origen: 'DIRECTO', desde: null, nueva: true,
    };
    this.filas = [fila, ...this.filas];
    this.gridApi?.setRowData(this.filas);
    if (u.type_user === 1 || u.type_user === 2) {
      this._toastr.info('Los administradores ya lo ven todo; la fila sólo sirve para dejarlo explícito.', 'Permisos', { timeOut: 4000 });
    }
  }

  /** Una fila heredada se "baja" a este nodo para ajustarla aquí. */
  ajustarAqui(h: FilaPermiso): void {
    const fila: FilaPermiso = { ...h, origen: 'DIRECTO', desde: null, nueva: true };
    this.filas = [fila, ...this.filas.filter(x => x.user_id !== h.user_id)];
    this.gridApi?.setRowData(this.filas);
  }

  // ---------- Edición ----------

  todo(f: FilaPermiso, valor: boolean): void {
    if (!this.puedeAdministrar || f.denegar) { return; }
    this.banderas.forEach(x => f[x.id] = valor);
    this.refrescarFila(f);
  }

  async guardar(f: FilaPermiso): Promise<void> {
    if (!this.puedeAdministrar || f.guardando || !this.cambiada(f)) { return; }
    f.guardando = true;
    this.refrescarFila(f);
    try {
      const datos: any = { user_id: f.user_id, hereda: f.hereda, denegar: f.denegar, vigente_hasta: f.vigente_hasta || null };
      this.banderas.forEach(b => datos[b.id] = !!f[b.id]);
      const res = await firstValueFrom(this._archivoService.guardarPermisoArchivo(this.elemento.id, datos));
      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo guardar', 'Permisos');
        return;
      }
      f.nueva = false;
      f.caducado = !!f.vigente_hasta && new Date(f.vigente_hasta) < new Date(new Date().toDateString());
      f._original = this.firma(f);
      this._toastr.success(`Permisos de ${f.name} ${f.surname} guardados`, 'Permisos', { timeOut: 2500 });
      this.cambio.emit();
    } catch (e) {
      console.error('Error al guardar permiso:', e);
    } finally {
      f.guardando = false;
      this.refrescarFila(f);
    }
  }

  /** Pie "Guardar": todas las filas con cambios, una a una. */
  async guardarTodo(): Promise<void> {
    for (const f of this.directos.filter(x => this.cambiada(x))) {
      await this.guardar(f);
    }
  }

  async quitar(f: FilaPermiso): Promise<void> {
    if (!this.puedeAdministrar) { return; }
    if (f.nueva) {
      this.filas = this.filas.filter(x => x !== f);
      this.gridApi?.setRowData(this.filas);
      return;
    }
    const { isConfirmed } = await Swal.fire({
      title: `¿Quitar el permiso de ${f.name} ${f.surname}?`,
      text: this.archivo?.escarpeta && f.hereda
        ? 'Dejará de verlo, y también todo lo que hay dentro (salvo que tenga otro permiso más abajo).'
        : 'Dejará de ver este elemento (salvo que lo herede de una carpeta de arriba o sea público).',
      icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí, quitar', cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc3545', reverseButtons: true,
    });
    if (!isConfirmed) { return; }
    try {
      const res = await firstValueFrom(this._archivoService.quitarPermisoArchivo(this.elemento.id, f.user_id));
      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo quitar', 'Permisos');
        return;
      }
      this._toastr.success(res.message, 'Permisos', { timeOut: 2500 });
      await this.cargar();   // puede reaparecer como heredado
      this.cambio.emit();
    } catch (e) {
      console.error('Error al quitar permiso:', e);
    }
  }

  // ---------- Accesos ----------

  async cargarAccesos(): Promise<void> {
    if (this.accesosCargados) { return; }
    try {
      const res = await firstValueFrom(this._archivoService.accesosArchivo(this.elemento.id));
      this.accesos = res?.status === 'success' ? res.data : [];
      this.accesosCargados = true;
    } catch (e) {
      console.error('Error al cargar accesos:', e);
    }
  }

  // ---------- Utilidades ----------

  nombreCompleto(f: { name?: string; surname?: string; login_user?: string } | null | undefined): string {
    if (!f) { return ''; }
    const n = `${f.name ?? ''} ${f.surname ?? ''}`.trim();
    return n || f.login_user || '';
  }

  cerrar(): void {
    if (this.hayCambios) {
      Swal.fire({
        title: 'Hay cambios sin guardar', text: '¿Salir y perderlos?', icon: 'warning',
        showCancelButton: true, confirmButtonText: 'Salir sin guardar', cancelButtonText: 'Seguir editando', reverseButtons: true,
      }).then(r => { if (r.isConfirmed) { this.modal.dismiss('Close click'); } });
      return;
    }
    this.modal.dismiss('Close click');
  }
}
