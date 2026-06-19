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
  @Output() nodeSelected = new EventEmitter<FileTreeNode>();
  @Output() nodeToggled = new EventEmitter<FileTreeNode>();

  toggleNode(event: Event): void {
    event.stopPropagation();
    
    if (this.node.children) {
      this.node.isOpen = !this.node.isOpen;
      this.nodeToggled.emit(this.node);
    }
    
    this.nodeSelected.emit(this.node);
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
}