import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';

import { ArchivoService } from '../../../services/archivo.service';
import { ModalHeaderComponent } from '../../../../../components/modal/modal-header/modal-header.component';

/** Nodo del árbol tal como lo da el administrador (sólo se usan estos campos). */
export interface NodoMover {
  id: number;
  nombre: string;
  escarpeta: boolean;
  icono?: string;
  color?: string;
  nivel?: number;
  children?: NodoMover[];
}

/** Carpeta del árbol de destino (vista plana con sangría por nivel). */
interface CarpetaDestino {
  id: number | null;         // null = raíz
  nombre: string;
  nivel: number;
  icono: string;
  color: string;
  ruta: string;              // "Unidad C / Reportes / 2026"
  /** No se puede elegir: es el propio elemento o cuelga de él. */
  bloqueada: boolean;
  /** Es la carpeta donde ya está. */
  actual: boolean;
  abierta: boolean;
  tieneHijas: boolean;
  padreId: number | null;
}

/**
 * Modal "Mover a…": elige la carpeta destino de un archivo o carpeta.
 *
 * Muestra sólo las carpetas (los archivos no pueden contener nada), más la
 * opción "Raíz". La carpeta que se está moviendo y todas sus subcarpetas
 * salen bloqueadas: moverla ahí crearía un ciclo (el back también lo
 * rechaza). La ubicación actual se marca y no se puede elegir.
 *
 * Al pulsar Mover llama al back y emite `movido` con la respuesta; quien
 * lo abre recarga el árbol.
 */
@Component({
  selector: 'app-mover-archivo',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalHeaderComponent],
  templateUrl: './moverArchivo.component.html',
  styleUrls: ['./moverArchivo.component.css'],
})
export class MoverArchivoComponent implements OnInit {

  /** Lo que se mueve (archivo o carpeta, con su subárbol si es carpeta). */
  @Input() elemento!: NodoMover & { padre?: number | null };
  /** Varios a la vez (multiselección): si viene, manda sobre `elemento`. */
  @Input() elementos: (NodoMover & { padre?: number | null })[] = [];
  /** Árbol completo del administrador (raíces con children). */
  @Input() arbol: NodoMover[] = [];

  @Output() movido = new EventEmitter<any>();

  carpetas: CarpetaDestino[] = [];
  seleccion: CarpetaDestino | null = null;
  filtro = '';
  moviendo = false;

  constructor(
    public modal: NgbActiveModal,
    private _archivoService: ArchivoService,
    private _toastr: ToastrService
  ) {}

  /** Lo que de verdad se mueve: la lista, o el único elemento. */
  get lote(): (NodoMover & { padre?: number | null })[] {
    return this.elementos.length ? this.elementos : (this.elemento ? [this.elemento] : []);
  }

  get esLote(): boolean { return this.lote.length > 1; }

  /** Todos los nombres, uno por línea (tooltip). Las plantillas no admiten arrow functions. */
  get nombresLote(): string { return this.lote.map(e => e.nombre).join('\n'); }

  /** Los tres primeros nombres y "…" si hay más. */
  get resumenLote(): string {
    const n = this.lote.slice(0, 3).map(e => e.nombre).join(', ');
    return this.lote.length > 3 ? `${n}…` : n;
  }

  ngOnInit(): void {
    if (!this.elemento && this.elementos.length) { this.elemento = this.elementos[0]; }
    // No se puede soltar dentro de ninguno de los que se mueven ni de sus subcarpetas
    const bloqueados = new Set<number>(this.lote.flatMap(e => this.idsDelSubarbol(e)));
    // "Actual" sólo si todos están en la misma carpeta
    const padres = new Set(this.lote.map(e => e.padre ?? null));
    const padreActual = padres.size === 1 ? [...padres][0] : undefined;

    // Raíz como primera opción
    this.carpetas = [{
      id: null, nombre: 'Raíz', nivel: 0, icono: 'fa fa-house', color: '#727cb6',
      ruta: 'Raíz', bloqueada: false, actual: padreActual === null,   // undefined (varios padres) → no marca
      abierta: true, tieneHijas: this.arbol.some(n => n.escarpeta), padreId: null,
    }];
    this.aplanar(this.arbol, 1, [], bloqueados, padreActual, null);

    // Se abre el camino hasta la carpeta actual, para verla sin buscar
    this.abrirHasta(padreActual ?? null);
  }

  // ---------- Árbol plano ----------

  private aplanar(nodos: NodoMover[], nivel: number, camino: string[], bloqueados: Set<number>,
                  padreActual: number | null | undefined, padreId: number | null): void {
    for (const n of nodos) {
      if (!n.escarpeta) { continue; }
      const hijas = (n.children ?? []).filter(h => h.escarpeta);
      const ruta = [...camino, n.nombre];
      this.carpetas.push({
        id: n.id,
        nombre: n.nombre,
        nivel,
        icono: n.icono || 'fa fa-folder',
        color: n.color || '#F0B13B',
        ruta: 'Raíz / ' + ruta.join(' / '),
        bloqueada: bloqueados.has(n.id),
        actual: n.id === padreActual,
        abierta: false,
        tieneHijas: hijas.length > 0,
        padreId,
      });
      this.aplanar(hijas, nivel + 1, ruta, bloqueados, padreActual, n.id);
    }
  }

  private idsDelSubarbol(n: NodoMover): number[] {
    const ids = [n.id];
    (n.children ?? []).forEach(h => ids.push(...this.idsDelSubarbol(h)));
    return ids;
  }

  private abrirHasta(id: number | null): void {
    let actual = this.carpetas.find(c => c.id === id);
    while (actual) {
      actual.abierta = true;
      const padre = actual.padreId;
      actual = padre === null ? undefined : this.carpetas.find(c => c.id === padre);
      if (actual === undefined && padre === null) { this.carpetas[0].abierta = true; }
    }
  }

  /** Visibles: con filtro, todas las que coinciden; sin filtro, sólo las de ramas abiertas. */
  get visibles(): CarpetaDestino[] {
    const f = this.filtro.trim().toLowerCase();
    if (f) {
      return this.carpetas.filter(c => c.nombre.toLowerCase().includes(f) || c.ruta.toLowerCase().includes(f));
    }
    return this.carpetas.filter(c => this.ancestrosAbiertos(c));
  }

  private ancestrosAbiertos(c: CarpetaDestino): boolean {
    if (c.id === null) { return true; }
    let padre = this.carpetas.find(x => x.id === c.padreId) ?? this.carpetas[0];
    while (padre) {
      if (!padre.abierta) { return false; }
      if (padre.id === null) { return true; }
      padre = this.carpetas.find(x => x.id === padre!.padreId) ?? this.carpetas[0];
    }
    return true;
  }

  toggle(c: CarpetaDestino, ev: Event): void {
    ev.stopPropagation();
    c.abierta = !c.abierta;
  }

  elegir(c: CarpetaDestino): void {
    if (c.bloqueada || c.actual) { return; }
    this.seleccion = c;
  }

  get puedeMover(): boolean {
    return !!this.seleccion && !this.moviendo;
  }

  // ---------- Mover ----------

  async mover(): Promise<void> {
    if (!this.puedeMover) { return; }
    this.moviendo = true;
    try {
      const res = await firstValueFrom(this.esLote
        ? this._archivoService.moverArchivos(this.lote.map(e => e.id), this.seleccion!.id)
        : this._archivoService.moverArchivo(this.elemento.id, this.seleccion!.id));
      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo mover', 'Mover');
        return;
      }
      this._toastr.success(res.message, 'Movido', { closeButton: true });
      this.movido.emit(res.data);
      this.modal.close(res.data);
    } catch (e) {
      // el interceptor ya mostró el error HTTP
      console.error('Error al mover:', e);
    } finally {
      this.moviendo = false;
    }
  }
}
