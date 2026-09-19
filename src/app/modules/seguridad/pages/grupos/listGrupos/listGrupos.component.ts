import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { firstValueFrom } from 'rxjs';
import { ToastrService } from 'ngx-toastr';

import { GrupoService } from '../../../services/grupo.service';
import { GrupoModel } from '../../../interfaces/grupoModel';
import { FileTreeNode } from '../../../../../components/file-tree-node/file-tree-node.component';
import { construirArbolGrupos, filtrarArbol } from '../arbolGrupos';

/**
 * Selector de grupo (modal): el árbol de grupos, se pulsa uno y se emite.
 * Lo usan saveUser (grupo del usuario) y saveGrupo (grupo padre).
 *
 *   grupoSeleccionadoId  el que ya está asignado (se marca)
 *   excluirId            grupo que no se puede elegir ni él ni sus
 *                        descendientes (al elegir el padre de un grupo)
 *   permitirNinguno      muestra la opción «Sin grupo» (emite null)
 */
@Component({
  selector: 'app-listGrupos',
  templateUrl: './listGrupos.component.html',
  styleUrls: ['./listGrupos.component.css'],
  standalone: false,
})
export class ListGruposComponent implements OnInit {

  @Input() grupoSeleccionadoId?: number | null;
  @Input() excluirId?: number | null;
  @Input() permitirNinguno = false;
  @Input() titulo = 'Seleccionar grupo';
  /** Muestra el interruptor «Incluir subgrupos» (quien abre el modal lee incluirSubgrupos al recibir el grupo). */
  @Input() opcionSubgrupos = false;
  public incluirSubgrupos = true;
  @Output() seleccionado = new EventEmitter<GrupoModel | null>();

  public grupos: GrupoModel[] = [];
  public nodes: FileTreeNode[] = [];
  private originalNodes: FileTreeNode[] = [];
  public searchQuery = '';
  public cargando = false;
  public actual: GrupoModel | null = null;

  constructor(
    public activeModal: NgbActiveModal,
    private _grupoService: GrupoService,
    private _toastr: ToastrService,
  ) {}

  async ngOnInit(): Promise<void> {
    await this.cargar();
  }

  async cargar(): Promise<void> {
    this.cargando = true;
    try {
      const res: any = await firstValueFrom(this._grupoService.allGrupos(false));
      this.grupos = res?.status === 'success' ? (res.data?.grupos ?? []) : [];
      this.actual = this.grupos.find(g => g.id === this.grupoSeleccionadoId) ?? null;
      // Al elegir el padre de un grupo, ni él ni lo que cuelga de él sirven
      const excluidos = this.excluirId ? this.descendientes(this.excluirId) : new Set<number>();
      this.originalNodes = construirArbolGrupos(this.grupos.filter(g => !excluidos.has(g.id)), {
        abiertos: new Set(this.grupos.map(g => g.id)),   // todo abierto: es para elegir
        seleccionadoId: this.grupoSeleccionadoId ?? null,
      });
      this.nodes = filtrarArbol(this.originalNodes, this.searchQuery);
    } catch (e) {
      console.error('Error al cargar los grupos:', e);
      this._toastr.error('No se pudieron cargar los grupos', 'Grupos');
    } finally {
      this.cargando = false;
    }
  }

  /** El grupo y todos los que cuelgan de él. */
  private descendientes(id: number): Set<number> {
    const out = new Set<number>([id]);
    let creció = true;
    while (creció) {
      creció = false;
      for (const g of this.grupos) {
        if (g.padre_id !== null && out.has(g.padre_id) && !out.has(g.id)) { out.add(g.id); creció = true; }
      }
    }
    return out;
  }

  filterNodes(): void { this.nodes = filtrarArbol(this.originalNodes, this.searchQuery); }
  limpiarBusqueda(): void { this.searchQuery = ''; this.filterNodes(); }

  onNodeSelect(node: FileTreeNode): void {
    const g = this.grupos.find(x => x.id === node.id);
    if (!g) { return; }
    this.seleccionado.emit(g);
    this.activeModal.close(g);
  }

  ninguno(): void {
    this.seleccionado.emit(null);
    this.activeModal.close(null);
  }
}
