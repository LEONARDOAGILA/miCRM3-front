import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { AgGridModule } from 'ag-grid-angular';
import { CellClickedEvent, CellKeyDownEvent, GridApi, GridReadyEvent, RowClassParams } from 'ag-grid-community';
import { firstValueFrom } from 'rxjs';

import { UserService } from '../../../services/user.service';
import { GrupoService } from '../../../services/grupo.service';
import { AppAgGridService } from '../../../../../service/app-agGrid.service';
import { LoadingService } from '../../../../../service/loading.service';
import { FileTreeNodeComponent, FileTreeNode } from '../../../../../components/file-tree-node/file-tree-node.component';
import { CampoBusquedaPaginacionComponent } from '../../../../../components/campos/campoBusquedaPaginacion/campoBusquedaPaginacion.component';
import { ModalArrastrableDirective } from '../../../../../components/modal/modal-arrastrable.directive';
import { buscarNodo, construirArbolGrupos, filtrarArbol, recorrer } from '../arbolGrupos';

/** El nodo «Todos», que no es un grupo de la tabla. */
const NODO_TODOS = -1;

/**
 * Elegir un usuario viendo a qué grupo pertenece.
 *
 * Es el mismo reparto que la pantalla de Usuarios y grupos —el árbol a la
 * izquierda, la gente a la derecha—, y por la misma razón: con cincuenta
 * usuarios, una lista plana de logins no dice quién es quién. Aquí hace falta
 * saber si «Carlos Mendoza» es el vendedor de Cuenca o el cobrador de la
 * supervisión 2, y eso sólo se ve con el grupo delante.
 *
 * No se reutilizó aquella pantalla porque no es un selector: no emite nada al
 * elegir y trae consigo crear, borrar, mover y la papelera, que en un diálogo
 * para escoger a alguien sobran y son peligrosas. Lo que sí se reutiliza es lo
 * que vale la pena: el árbol (app-file-tree-node), sus ayudas (arbolGrupos) y
 * el mismo endpoint usuariosPorGrupo.
 *
 * Mantiene el contrato del selector plano al que sustituye —mismas entradas y
 * el mismo @Output seleccionado— para que cambiar uno por otro sea una línea.
 */
@Component({
  selector: 'app-listUsuariosGrupos',
  standalone: true,
  imports: [CommonModule, FormsModule, AgGridModule, FileTreeNodeComponent,
    CampoBusquedaPaginacionComponent, ModalArrastrableDirective],
  templateUrl: './listUsuariosGrupos.component.html',
  styleUrls: ['./listUsuariosGrupos.component.css'],
})
export class ListUsuariosGruposComponent implements OnInit {

  /** El que ya está elegido: se marca en la grilla para no repetirlo por error. */
  @Input() usuarioSeleccionadoId?: number;
  /** Ids que no se pueden elegir (p. ej. quien ya ocupa otro papel). */
  @Input() usuariosExcluidos: number[] = [];
  /**
   * Si se indica, SÓLO estos ids se pueden elegir; el resto se ve pero queda
   * bloqueado, igual que los excluidos.
   *
   * Es para quien tiene una lista corta de candidatos y aun así quiere el
   * árbol de grupos y el buscador completos: el responsable de una gestión,
   * por ejemplo, sólo puede ser alguien del equipo de quien asigna o un
   * responsable del cliente. Vacío —lo normal— no restringe nada.
   */
  @Input() usuariosPermitidos: number[] = [];
  @Input() ayuda = 'Haz clic sobre un usuario para elegirlo.';

  @Output() seleccionado = new EventEmitter<any>();

  // ---------- el árbol ----------
  public nodos: FileTreeNode[] = [];
  private nodosTodos: FileTreeNode[] = [];
  public seleccionId: number = NODO_TODOS;
  public filtroGrupo = '';
  /**
   * Por defecto SÍ: quien abre «Cuenca» espera ver a sus vendedores, que están
   * en el subgrupo, no sólo al jefe zonal que está en el nodo.
   */
  public incluirSubgrupos = true;
  public cargandoArbol = false;

  // ---------- la grilla ----------
  public columnDefs: any[] = [];
  public filas: any[] = [];
  public paginaActual = 1;
  public ultimaPagina = 1;
  public totalRegistros = 0;
  public registrosPorPagina = 10;
  public busqueda = '';
  private gridApi?: GridApi;

  public rowClassRules = {
    'fila-actual': (p: RowClassParams) => !!this.usuarioSeleccionadoId && p.data?.id === this.usuarioSeleccionadoId,
    'fila-excluida': (p: RowClassParams) => this.estaExcluido(p.data?.id),
  };

  public isLoading$ = this._loadingService.isLoading$;

  constructor(
    public modal: NgbActiveModal,
    public _appAgGridService: AppAgGridService,
    private _userService: UserService,
    private _grupoService: GrupoService,
    private _loadingService: LoadingService,
  ) {}

  ngOnInit(): void {
    this.armarColumnas();
    this.cargarArbol();
    this.cargarUsuarios(1);
  }

  // ================================================================
  // EL ÁRBOL
  // ================================================================

  private async cargarArbol(): Promise<void> {
    try {
      this.cargandoArbol = true;
      const res: any = await firstValueFrom(this._grupoService.allGrupos(false));
      const grupos = (res?.data?.grupos) || res?.data || [];

      this.nodosTodos = [
        // Un nodo que no es un grupo: es la forma de volver a verlos a todos
        { id: NODO_TODOS, nombre: 'Todos', tipo: 0, escarpeta: true, icono: 'fa-users',
          isOpen: true, isSelected: true, badge: null, titulo: 'Todos los usuarios' },
        ...construirArbolGrupos(grupos),
      ];
      // Todo abierto de entrada: el árbol tiene tres niveles y en un diálogo de
      // elegir a alguien no se viene a desplegar carpetas
      recorrer(this.nodosTodos, n => { n.isOpen = true; });
      this.nodos = this.nodosTodos;
      this.marcarSeleccion();
    } catch (error) {
      console.error('Error al cargar los grupos:', error);
      this.nodosTodos = [];
      this.nodos = [];
    } finally {
      this.cargandoArbol = false;
    }
  }

  onNodeSelect(n: FileTreeNode): void {
    this.seleccionId = n.id;
    this.marcarSeleccion();
    this.cargarUsuarios(1);
  }

  onNodeToggle(n: FileTreeNode): void {
    n.isOpen = !n.isOpen;
  }

  private marcarSeleccion(): void {
    recorrer(this.nodos, n => { n.isSelected = n.id === this.seleccionId; });
  }

  filtrarGrupos(): void {
    const t = (this.filtroGrupo ?? '').trim();
    this.nodos = t ? filtrarArbol(this.nodosTodos, t) : this.nodosTodos;
    this.marcarSeleccion();
  }

  /** El rótulo del grupo abierto, para que se sepa qué se está mirando. */
  get nombreSeleccion(): string {
    if (this.seleccionId === NODO_TODOS) { return 'Todos los usuarios'; }
    return buscarNodo(this.nodos, this.seleccionId)?.nombre ?? 'Grupo';
  }

  /**
   * Si el grupo abierto tiene subgrupos, que es cuando la casilla de
   * «+ subgrupos» pinta algo.
   *
   * En «Todos» no sale: ahí no se filtra por grupo, así que incluirlos o no da
   * exactamente la misma lista.
   */
  get tieneSubgrupos(): boolean {
    if (this.seleccionId === NODO_TODOS) { return false; }
    return (buscarNodo(this.nodos, this.seleccionId)?.children?.length ?? 0) > 0;
  }

  // ================================================================
  // LA GRILLA
  // ================================================================

  private armarColumnas(): void {
    this.columnDefs = [
      { headerName: 'Usuario', field: 'login_user', minWidth: 130, maxWidth: 190,
        cellStyle: { textAlign: 'left', fontWeight: '600' } },
      { headerName: 'Nombre', minWidth: 170, cellStyle: { textAlign: 'left' },
        valueGetter: (p: any) => [p.data?.name, p.data?.surname].filter(Boolean).join(' ') },
      // La columna por la que se hizo todo esto
      { headerName: 'Grupo', field: 'grupo_nombre', minWidth: 150, cellStyle: { textAlign: 'left' },
        valueGetter: (p: any) => p.data?.grupo_nombre || 'Sin grupo' },
      { headerName: 'Perfil', field: 'perfil_nombre', minWidth: 110, maxWidth: 150,
        cellStyle: { textAlign: 'left' } },
    ];
  }

  onGridReady(e: GridReadyEvent): void {
    this.gridApi = e.api;
    this.gridApi.setRowData(this.filas);
  }

  estaExcluido(id?: number): boolean {
    if (!id) { return false; }
    // Con lista de permitidos, lo que no está en ella queda bloqueado
    if (this.usuariosPermitidos.length && !this.usuariosPermitidos.includes(id)) { return true; }
    return this.usuariosExcluidos.includes(id);
  }

  onCellKeyDown(e: CellKeyDownEvent): void {
    if ((e.event as KeyboardEvent)?.key === 'Enter') { this.onCellClicked(e as unknown as CellClickedEvent); }
  }

  onCellClicked(e: CellClickedEvent): void {
    if (!e.data || this.estaExcluido(e.data.id)) { return; }
    this.seleccionado.emit(e.data);
    this.modal.close(e.data);
  }

  async cargarUsuarios(page: number = 1): Promise<void> {
    try {
      this._loadingService.setLoading(true);
      const grupo = this.seleccionId === NODO_TODOS ? null : this.seleccionId;
      const res: any = await firstValueFrom(
        this._userService.usuariosPorGrupo(grupo, this.incluirSubgrupos, page, this.registrosPorPagina, this.busqueda)
      );

      this.filas = res.body?.data?.data ?? [];
      const meta = res.body?.data?.meta;
      if (meta) {
        this.totalRegistros = meta.total;
        this.registrosPorPagina = meta.per_page;
        this.paginaActual = meta.current_page;
        this.ultimaPagina = meta.last_page;
      }
      this.gridApi?.setRowData(this.filas);
    } catch (error) {
      // El AuthInterceptor ya saca el toast del error HTTP
      console.error('Error al cargar los usuarios del grupo:', error);
      this.filas = [];
      this.totalRegistros = 0;
      this.ultimaPagina = 1;
      this.gridApi?.setRowData(this.filas);
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  onSearch(texto: string): void {
    this.busqueda = (texto ?? '').trim();
    this.cargarUsuarios(1);
  }

  limpiarBusqueda(): void {
    this.busqueda = '';
    this.cargarUsuarios(1);
  }

  cambiarSubgrupos(): void {
    this.cargarUsuarios(1);
  }

  // ---------- paginación (la hace el servidor) ----------
  get desde(): number {
    return this.totalRegistros === 0 ? 0 : (this.paginaActual - 1) * this.registrosPorPagina + 1;
  }
  get hasta(): number {
    return Math.min(this.paginaActual * this.registrosPorPagina, this.totalRegistros);
  }
  irA(page: number): void {
    if (page < 1 || page > this.ultimaPagina || page === this.paginaActual) { return; }
    this.cargarUsuarios(page);
  }
}
