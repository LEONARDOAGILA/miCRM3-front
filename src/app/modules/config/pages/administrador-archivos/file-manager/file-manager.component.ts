import { Component, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CellClickedEvent, ColDef, GridApi, GridReadyEvent } from 'ag-grid-community';
import { firstValueFrom, Subject, takeUntil } from 'rxjs';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { AgGridAngular } from 'ag-grid-angular';

import { ArchivoModel } from '../../../interfaces/archivoModel';

import { AppAgGridService } from '../../../../../service/app-agGrid.service';
import { AppSettings } from '../../../../../service/app-settings.service';
import { ArchivoService } from "../../../services/archivo.service";
import { SeguridadService } from '../../../../seguridad/services/seguridad.service';

import { SaveFileComponent } from '../save-file/saveFile.component';
import { ModalReporteExternoComponent } from '../modalReporteExterno/modalReporteExterno.component';



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
  created_at?: string;
  updated_at?: string;
  created_at_formateado?: string;
  updated_at_formateado?: string;
}

@Component({
  selector: 'app-file-manager',
  templateUrl: './file-manager.component.html',
  styleUrls: ['./file-manager.component.css'],
  standalone: false,
  host: {
    'class': 'd-flex flex-column flex-1 h-100'
  }
})
export class FileManagerComponent implements OnInit, OnDestroy {
  @ViewChild(AgGridAngular) agGrid!: AgGridAngular;
  public gridApi!: GridApi;

  mobileSidebarToggled = false;
  searchQuery = '';
  nodes: FileTreeNode[] = [];
  originalNodes: FileTreeNode[] = [];
  selectedNode: FileTreeNode | null = null;
  selectedNodeChildren: FileTreeNode[] = [];
  private unsubscribe$ = new Subject<void>();
  public archivoModel: ArchivoModel[] = [];
  private expandedNodeIds: Set<number> = new Set();
  navigationHistory: FileTreeNode[] = [];
  currentHistoryIndex: number = -1;
  public title = 'File Manger';
  public ejecutar_esactivo: boolean = true;

  // AG-Grid configuration
  public columnDefs: ColDef[] = [
    {
      headerName: '',
      field: 'icono',
      width: 50,
      maxWidth: 50,
      cellRenderer: (params: any) => {
        if (params.data.icono) {
          return `<i class="${params.data.icono}" style="color: ${params.data.color || '#ffc107'}"></i>`;
        } else if (params.data.escarpeta) {
          return `<i class="fa fa-folder" style="color: ${params.data.color || '#ffc107'}"></i>`;
        } else {
          return '<i class="far fa-file-code fa-lg text-body text-opacity-50"></i>';
        }
      },
      cellStyle: { display: 'flex', justifyContent: 'center', alignItems: 'center' },
      suppressMenu: true,
      sortable: false,
      filter: false
    },
    {
      headerName: 'Nombre',
      field: 'nombre',
      flex: 2,
      minWidth: 150,
      cellStyle: { textAlign: 'left' },
      filter: 'agTextColumnFilter'
    },
    {
      headerName: 'Tamaño',
      field: 'size',
      width: 100,
      maxWidth: 100,
      valueGetter: () => '4 KB',
      cellStyle: { textAlign: 'right' },
      suppressMenu: true,
      sortable: false,
      filter: false
    },
    {
      headerName: 'Creación',
      field: 'created_at_formateado',
      width: 160,
      maxWidth: 160,
      // valueGetter: (params) => this.formatDate(params.data.created_at),
      cellStyle: { textAlign: 'center' },
      // filter: 'agDateColumnFilter'
    },
    {
      headerName: 'Modificación',
      field: 'updated_at_formateado',
      width: 160,
      maxWidth: 160,
      // valueGetter: (params) => this.formatDate(params.data.updated_at),
      cellStyle: { textAlign: 'center' },
      // filter: 'agDateColumnFilter'
    },
    {
      headerName: 'Tipo',
      field: 'escarpeta',
      width: 100,
      maxWidth: 100,
      valueGetter: (params) => params.data.escarpeta ? 'Carpeta' : 'Archivo',
      cellStyle: { textAlign: 'center' },
      filter: 'agTextColumnFilter'
    },
    {
      headerName: 'Permisos',
      field: 'permission',
      width: 100,
      maxWidth: 100,
      valueGetter: () => '0755',
      cellStyle: { textAlign: 'center' },
      suppressMenu: true,
      sortable: false,
      filter: false
    }
  ];

  constructor(
    public appSettings: AppSettings,
    private _archivoService: ArchivoService,
    private _seguridadService: SeguridadService,
    private modal: NgbModal,
    public _appAgGridService: AppAgGridService
  ) {
    this.appSettings.appSidebarMinified = true;
    this.appSettings.appHeaderInverse = true;
    this.appSettings.appContentFullHeight = true;
    this.appSettings.appContentClass = 'd-flex flex-column';
  }

  ngOnInit() {
    this.selectedNodeChildren = [];
    this.loaddata();
  }

  ngOnDestroy() {
    this.appSettings.appSidebarMinified = false;
    this.appSettings.appHeaderInverse = false;
    this.appSettings.appContentFullHeight = false;
    this.appSettings.appContentClass = '';
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }



  async loaddata() {
    const previouslyExpanded = this.getExpandedNodeIds(this.nodes);
    const selectedNodeId = this.selectedNode?.id;

    await this.getArchivoTree();
    // await this.allArchivos();

    this.restoreExpandedState(this.nodes, previouslyExpanded);

    if (selectedNodeId) {
      this.restoreSelection(this.nodes, selectedNodeId);
    }
  }

  async allArchivos() {
    try {
      let res: any = await firstValueFrom(this._archivoService.allArchivos());
      if (res?.status === 'success') {
        this.archivoModel = res.data;
      } else {
        this.archivoModel = [];
        console.error('response -> Error: Respuesta sin status success', res.message);
      }
    } catch (error: any) {
      this.archivoModel = [];
      console.error('response -> Error en la petición', error);
    }
  }

  async getArchivoTree() {
    try {
      const res = await firstValueFrom(this._archivoService.getArchivoTree());
      if (res?.status === 'success') {
        this.nodes = this.processNodes(res.data);
        this.originalNodes = JSON.parse(JSON.stringify(this.nodes));
      }
    } catch (error) {
      console.error('Error loading files:', error);
      this.nodes = [];
    }
  }

  add(tipoAdd: string) {
    if (!this._seguridadService.isexpired()) {
      const expandedNodes = this.getExpandedNodeIds(this.nodes);
      const selectedNodeId = this.selectedNode?.id;

      const modalRef = this.modal.open(SaveFileComponent, {
        centered: true,
        size: "xs",
        backdrop: "static",
        keyboard: false,
      });

      modalRef.componentInstance.registro_selected = this.selectedNode;
      modalRef.componentInstance.accion = tipoAdd;
      const maxOrder2 = this.getMaxOrder2ByParent(this.selectedNode.id);
      modalRef.componentInstance.maxOrder2 = maxOrder2 + 1;
      let tieneHijos = this.archivoModel.some(item => item.padre === this.selectedNode.id);
      modalRef.componentInstance.tieneHijos = tieneHijos;

      modalRef.result.then((result) => {
        this.loaddata().then(() => {
          if (selectedNodeId) {
            this.restoreExpandedState(this.nodes, expandedNodes);
            this.restoreSelection(this.nodes, selectedNodeId);
          }
        });
      }).catch((error) => {
        if (error !== 'Close click' && error !== 'Escape key press') {
          console.error('Error al cerrar el modal:', error);
        }
      });
    }
  }

  addRaiz() {
    if (!this._seguridadService.isexpired()) {
      const expandedNodes = this.getExpandedNodeIds(this.nodes);

      const modalRef = this.modal.open(SaveFileComponent, {
        centered: true,
        size: "xs",
        backdrop: "static",
        keyboard: false,
      });

      modalRef.componentInstance.registro_selected = 0;
      modalRef.componentInstance.accion = 'addNuevaRaiz';
      const maxOrder2 = this.getMaxOrder2Root();
      modalRef.componentInstance.maxOrder2 = maxOrder2 + 1;

      modalRef.result.then((result) => {
        this.loaddata().then(() => {
          this.restoreExpandedState(this.nodes, expandedNodes);
        });
      }).catch((error) => {
        if (error !== 'Close click' && error !== 'Escape key press') {
          console.error('Error al cerrar el modal:', error);
        }
      });

      modalRef.componentInstance.registrosE.pipe(takeUntil(this.unsubscribe$)).subscribe({
        next: (response: any) => { this.archivoModel = response; },
        error: (error: any) => { console.error(error.message); },
      });
    }
  }

  refresh(): void {
    this.loaddata();
  }

  viewReporteExterno() {
    const modalRef = this.modal.open(ModalReporteExternoComponent, {
      centered: true,
      size: 'xxl',
      backdrop: 'static',
      keyboard: true,
      windowClass: "my-class", // JGSJ LPAA CLASE PARA HACER EL MODAL QUE OCUPE TODA LA PANTALLA
    });

    modalRef.componentInstance.registro_selected = this.selectedNode;


  }








  private processNodes(nodes: FileTreeNode[]): FileTreeNode[] {
    return nodes.map(node => ({
      ...node,
      isOpen: false,
      isSelected: false,
      children: node.children ? this.processNodes(node.children) : undefined
    }));
  }

  onGridReady(params: GridReadyEvent): void {
    this.gridApi = params.api;
    this._appAgGridService.ajustarTamanoGrid(this.gridApi);
  }

  onCellClicked(event: CellClickedEvent): void {
    const node = event.data as FileTreeNode;
    if (!node.escarpeta) {
      this.selectNodeFromTable(node);
      this.ejecutar_esactivo = false;
    } else {
      this.ejecutar_esactivo = true;
    }
  }

  onCellDoubleClicked(event: CellClickedEvent): void {
    const node = event.data as FileTreeNode;
    if (node.escarpeta) {
      this.selectNodeFromTable(node);
    } else {
      this.viewReporteExterno();
    }
  }


  private formatDate(dateString: string): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleString('es-ES', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  getMaxOrder2ByParent(parentId: number): number {
    const children = this.archivoModel.filter((item: any) => item.padre === parentId);
    if (children.length === 0) {
      return 0;
    }
    return Math.max(...children.map((item: any) => item.orden));
  }

  getMaxOrder2Root(): number {
    const rootItems = this.archivoModel.filter((item: any) => item.padre === 0);
    if (rootItems.length === 0) {
      return 0;
    }
    return Math.max(...rootItems.map((item: any) => item.orden));
  }


  @HostListener('window:resize', ['$event'])
  onResize(event: Event): void {
    if (this.gridApi) {
      this.gridApi.sizeColumnsToFit();
    }
  }

  private getExpandedNodeIds(nodes: FileTreeNode[]): Set<number> {
    const ids = new Set<number>();
    nodes.forEach(node => {
      if (node.isOpen) {
        ids.add(node.id);
        if (node.children) {
          this.getExpandedNodeIds(node.children).forEach(id => ids.add(id));
        }
      }
    });
    return ids;
  }

  private restoreExpandedState(nodes: FileTreeNode[], expandedIds: Set<number>) {
    nodes.forEach(node => {
      node.isOpen = expandedIds.has(node.id);
      if (node.children) {
        this.restoreExpandedState(node.children, expandedIds);
      }
    });
  }

  private restoreSelection(nodes: FileTreeNode[], nodeId: number): boolean {
    for (const node of nodes) {
      if (node.id === nodeId) {
        this.onNodeSelect(node);
        return true;
      }
      if (node.children) {
        const found = this.restoreSelection(node.children, nodeId);
        if (found) {
          node.isOpen = true;
          return true;
        }
      }
    }
    return false;
  }

  toggleMobileSidebar(): void {
    this.mobileSidebarToggled = !this.mobileSidebarToggled;
  }

  selectNodeFromTable(childNode: FileTreeNode): void {
    if (childNode.escarpeta) {
      this.findAndSelectNode(this.nodes, childNode.id);
    } else {
      this.deselectAllNodes(this.nodes);
      childNode.isSelected = true;
      this.selectedNode = childNode;
    }
  }

  private findAndSelectNode(nodes: FileTreeNode[], nodeId: number): boolean {
    for (const node of nodes) {
      if (node.id === nodeId) {
        this.onNodeSelect(node);
        return true;
      }
      if (node.children) {
        const found = this.findAndSelectNode(node.children, nodeId);
        if (found) {
          node.isOpen = true;
          return true;
        }
      }
    }
    return false;
  }

  private deselectAllNodes(nodes: FileTreeNode[]): void {
    nodes.forEach(node => {
      node.isSelected = false;
      if (node.children) {
        this.deselectAllNodes(node.children);
      }
    });
  }

  filterNodes(): void {
    if (!this.searchQuery.trim()) {
      this.nodes = JSON.parse(JSON.stringify(this.originalNodes));
      this.collapseAllNodes(this.nodes);
      return;
    }

    const query = this.searchQuery.toLowerCase();
    this.nodes = this.originalNodes
      .map(node => this.filterNode(node, query))
      .filter(node => node !== null) as FileTreeNode[];
  }

  private filterNode(node: FileTreeNode, query: string): FileTreeNode | null {
    const matches = node.nombre.toLowerCase().includes(query);

    if (matches) {
      return { ...node, isOpen: true };
    }

    if (node.children) {
      const filteredChildren = node.children
        .map(child => this.filterNode(child, query))
        .filter(child => child !== null) as FileTreeNode[];

      if (filteredChildren.length > 0) {
        return { ...node, children: filteredChildren, isOpen: true };
      }
    }

    return null;
  }

  private collapseAllNodes(nodes: FileTreeNode[]): void {
    nodes.forEach(node => {
      node.isOpen = false;
      if (node.children) {
        this.collapseAllNodes(node.children);
      }
    });
  }

  toggleNodeExpand(node: FileTreeNode, event: Event): void {
    event.stopPropagation();
    node.isOpen = !node.isOpen;

    if (node.isOpen) {
      this.expandedNodeIds.add(node.id);
    } else {
      this.expandedNodeIds.delete(node.id);
    }
  }

  onNodeToggle(node: FileTreeNode): void {
    if (node.isOpen) {
      this.expandedNodeIds.add(node.id);
    } else {
      this.expandedNodeIds.delete(node.id);
    }
  }

  onNodeSelect(node: FileTreeNode): void {
    this.deselectAllNodes(this.nodes);
    node.isSelected = true;
    this.selectedNode = node;

    if (!this.navigationHistory[this.currentHistoryIndex] ||
      this.navigationHistory[this.currentHistoryIndex].id !== node.id) {
      this.navigationHistory = this.navigationHistory.slice(0, this.currentHistoryIndex + 1);
      this.navigationHistory.push(node);
      this.currentHistoryIndex = this.navigationHistory.length - 1;
    }

    if (node.escarpeta) {
      this.ejecutar_esactivo = true;
      this.selectedNodeChildren = node.children || [];
    } else {
      this.ejecutar_esactivo = false;
      this.selectedNodeChildren = [node];
    }

    if (node.isOpen) {
      this.expandedNodeIds.add(node.id);
    } else {
      this.expandedNodeIds.delete(node.id);
    }

    if (this.gridApi) {
      this.gridApi.setRowData(this.selectedNodeChildren);
    }
  }

  goToRoot(): void {
    this.deselectAllNodes(this.nodes);
    this.selectedNode = null;
    this.selectedNodeChildren = [];
    if (this.gridApi) {
      this.gridApi.setRowData([]);
    }
  }

  goUpOneLevel(): void {
    if (!this.selectedNode) return;

    const findParent = (nodes: FileTreeNode[], targetId: number): FileTreeNode | null => {
      for (const node of nodes) {
        if (node.children) {
          const found = node.children.find(child => child.id === targetId);
          if (found) return node;
          const parent = findParent(node.children, targetId);
          if (parent) return parent;
        }
      }
      return null;
    };

    const parentNode = findParent(this.nodes, this.selectedNode.id);
    if (parentNode) {
      this.onNodeSelect(parentNode);
    } else {
      this.goToRoot();
    }
  }

  goBack(): void {
    if (this.currentHistoryIndex > 0) {
      this.currentHistoryIndex--;
      const node = this.navigationHistory[this.currentHistoryIndex];
      this.findAndSelectNode(this.nodes, node.id);
    }
  }

  goForward(): void {
    if (this.currentHistoryIndex < this.navigationHistory.length - 1) {
      this.currentHistoryIndex++;
      const node = this.navigationHistory[this.currentHistoryIndex];
      this.findAndSelectNode(this.nodes, node.id);
    }
  }


  selectAll(): void {
    if (this.gridApi) {
      this.gridApi.selectAll();
    }
  }

  unselectAll(): void {
    if (this.gridApi) {
      this.gridApi.deselectAll();
    }
  }

}