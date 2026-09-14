import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface FileTreeNode {
  id: number;
  nombre: string;
  isOpen?: boolean;
  isSelected?: boolean;
  children?: FileTreeNode[];
  tipo: number;
  escarpeta: boolean;
  icono?: string;
  color?: string;
}

/** Evento de arrastre sobre un nodo: el nodo y el DragEvent nativo. */
export interface NodoDragEvent {
  node: FileTreeNode;
  event: DragEvent;
}

/**
 * Nodo recursivo del árbol de archivos.
 *
 * Arrastrar y soltar (nativo HTML5, sin librería): con `arrastrable`, cada
 * nodo se puede coger y las CARPETAS aceptan que se les suelte algo encima.
 * El componente no decide nada: emite nodeDragStart / nodeDrop y quien
 * escucha (el administrador) valida y llama al back. Mientras algo pasa por
 * encima de una carpeta se marca con .is-destino.
 */
@Component({
  selector: 'app-file-tree-node',
  templateUrl: './file-tree-node.component.html',
  styleUrls: ['./file-tree-node.component.css'],
  standalone: true,
  imports: [CommonModule],
})
export class FileTreeNodeComponent {
  @Input() node!: FileTreeNode;
  @Input() isSelected: boolean = false;
  /** Permite arrastrar los nodos y soltar sobre las carpetas. */
  @Input() arrastrable = false;

  @Output() nodeSelected = new EventEmitter<FileTreeNode>();
  @Output() nodeToggled = new EventEmitter<FileTreeNode>();
  /** Clic derecho sobre el nodo: quien escucha decide qué menú mostrar. */
  @Output() nodeContextMenu = new EventEmitter<{ node: FileTreeNode; event: MouseEvent }>();
  /** Se empezó a arrastrar este nodo. */
  @Output() nodeDragStart = new EventEmitter<NodoDragEvent>();
  /** Terminó el arrastre (se soltara o no). */
  @Output() nodeDragEnd = new EventEmitter<void>();
  /** Se soltó algo sobre esta carpeta. */
  @Output() nodeDrop = new EventEmitter<NodoDragEvent>();

  /** Algo está pasando por encima de esta carpeta. */
  esDestino = false;

  /**
   * +/−: sólo abre o cierra la rama. No selecciona: antes emitía también
   * nodeSelected, y quien escuchaba volvía a abrir la rama al seleccionar,
   * así que el "−" nunca llegaba a cerrarla. Seleccionar es pulsar el nombre.
   */
  toggleNode(event: Event): void {
    event.stopPropagation();

    if (this.node.children) {
      this.node.isOpen = !this.node.isOpen;
      this.nodeToggled.emit(this.node);
    }
  }

  onNodeContextMenu(event: MouseEvent): void {
    // No se cancela aquí el menú del navegador: lo hace quien escucha, si
    // decide mostrar el suyo.
    this.nodeContextMenu.emit({ node: this.node, event });
  }

  onChildNodeSelected(node: FileTreeNode): void {
    this.nodeSelected.emit(node);
  }

  onNodeClick(event: Event): void {
    // Solo emitir la selección si no se hizo clic en la flecha
    if (!(event.target as Element).closest('.file-arrow')) {
      this.nodeSelected.emit(this.node);
    }
  }

  // ---------- Arrastrar y soltar ----------

  onDragStart(event: DragEvent): void {
    if (!this.arrastrable) { event.preventDefault(); return; }
    event.stopPropagation();   // que no lo "coja" también el nodo padre
    this.nodeDragStart.emit({ node: this.node, event });
  }

  onDragEnd(): void {
    this.esDestino = false;
    this.nodeDragEnd.emit();
  }

  /**
   * Sólo las carpetas aceptan soltar; preventDefault es lo que habilita el
   * drop. Sobre un archivo se corta la propagación SIN preventDefault: así
   * ni se puede soltar ahí ni llega al fondo del árbol (que lo tomaría por
   * "mover a la raíz").
   */
  onDragOver(event: DragEvent): void {
    if (!this.arrastrable) { return; }
    event.stopPropagation();
    if (!this.node.escarpeta) { return; }
    event.preventDefault();
    if (event.dataTransfer) { event.dataTransfer.dropEffect = 'move'; }
    this.esDestino = true;
  }

  onDragLeave(event: DragEvent): void {
    // Al pasar a un hijo también salta dragleave: sólo se apaga si de verdad salimos del enlace
    const destino = event.relatedTarget as Node | null;
    if (destino && (event.currentTarget as HTMLElement).contains(destino)) { return; }
    this.esDestino = false;
  }

  onDrop(event: DragEvent): void {
    if (!this.arrastrable) { return; }
    event.stopPropagation();
    if (!this.node.escarpeta) { return; }
    event.preventDefault();
    this.esDestino = false;
    this.nodeDrop.emit({ node: this.node, event });
  }
}
