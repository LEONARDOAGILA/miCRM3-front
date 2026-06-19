import { Component, OnInit } from '@angular/core';

interface FileSystemItem {
  id: string;
  name: string;
  type: 'folder' | 'file';
  children?: FileSystemItem[];
  isOpen?: boolean;
  isEditing?: boolean;
}

@Component({
  selector: 'app-windows-explorer',
  templateUrl: './windows-explorer.component.html',
  styleUrls: ['./windows-explorer.component.css'],
   standalone: false,
})
export class WindowsExplorerComponent implements OnInit {
  fileSystem: FileSystemItem[] = [
    {
      id: '1',
      name: 'Documentos',
      type: 'folder',
      isOpen: false,
      children: [
        { id: '1-1', name: 'Proyecto Angular', type: 'folder' },
        { id: '1-2', name: 'Informe.docx', type: 'file' }
      ]
    },
    {
      id: '2',
      name: 'Imágenes',
      type: 'folder',
      isOpen: false,
      children: [
        { id: '2-1', name: 'Vacaciones.jpg', type: 'file' }
      ]
    },
    {
      id: '3',
      name: 'Música',
      type: 'folder',
      isOpen: false
    }
  ];

  selectedItem: FileSystemItem | null = null;
  newItemName: string = '';
  newItemType: 'folder' | 'file' = 'folder';
  contextMenu = {
    show: false,
    x: 0,
    y: 0,
    target: null as FileSystemItem | null
  };

  ngOnInit(): void {}

  toggleFolder(item: FileSystemItem): void {
    if (item.type === 'folder') {
      item.isOpen = !item.isOpen;
    }
    this.selectedItem = item;
  }

  startEditing(item: FileSystemItem, event?: MouseEvent): void {
    if (event) event.stopPropagation();
    item.isEditing = true;
    this.newItemName = item.name;
  }

  saveEditing(item: FileSystemItem): void {
    item.name = this.newItemName;
    item.isEditing = false;
  }

  cancelEditing(item: FileSystemItem): void {
    item.isEditing = false;
  }

  showContextMenu(event: MouseEvent, item: FileSystemItem): void {
    event.preventDefault();
    this.contextMenu = {
      show: true,
      x: event.clientX,
      y: event.clientY,
      target: item
    };
    this.selectedItem = item;
  }

  hideContextMenu(): void {
    this.contextMenu.show = false;
  }

  addNewItem(parent?: FileSystemItem): void {
    const newItem: FileSystemItem = {
      id: Date.now().toString(),
      name: this.newItemName,
      type: this.newItemType,
      isEditing: true
    };

    if (this.newItemType === 'folder') {
      newItem.children = [];
    }

    if (parent) {
      if (!parent.children) parent.children = [];
      parent.children.push(newItem);
      parent.isOpen = true;
    } else {
      this.fileSystem.push(newItem);
    }

    this.newItemName = '';
    this.hideContextMenu();
  }

  deleteItem(item: FileSystemItem, parentArray?: FileSystemItem[]): void {
    if (!parentArray) parentArray = this.fileSystem;
    const index = parentArray.indexOf(item);
    if (index !== -1) {
      parentArray.splice(index, 1);
    }
    this.hideContextMenu();
  }

  getParentArray(item: FileSystemItem): FileSystemItem[] | null {
    for (const parent of this.fileSystem) {
      if (parent.children && parent.children.includes(item)) {
        return parent.children;
      }
    }
    return null;
  }
}