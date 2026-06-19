import { Component, EventEmitter, HostListener, Input, OnInit, Output, ViewChild } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { AgGridAngular } from 'ag-grid-angular';
import { CellClickedEvent, GridApi, GridReadyEvent } from 'ag-grid-community';
import { AppAgGridService } from '../../../../../service/app-agGrid.service';
import { ClienteModel } from '../../../../clientes/interfaces/clienteModel';

@Component({
  selector: 'app-all-clientes',
  templateUrl: './all-clientes.component.html',
  styleUrls: ['./all-clientes.component.css'],
  standalone: false,
})

export class AllClientesComponent implements OnInit {
  titulo = 'Clientes';

  public isdisabled: boolean = false;

  @Input() registro_selected: any = {};
  @Input() listaClientes: ClienteModel[] = []; // Esta lista llega del componente de la factura (FacturaComponent)
  @Input() accion: any = {};
  @Output() registrosE: EventEmitter<any> = new EventEmitter();

  //   ******   AG-GRID   ******  //
  @ViewChild(AgGridAngular) agGrid!: AgGridAngular;
  public gridApi!: GridApi;
  public columnDefs: any[] = [];
  private touchStartTime = 0;
  private touchStartX = 0;
  private touchStartY = 0;
  @HostListener('window:resize', ['$event'])
  onResize(event: Event): void { this._appAgGridService.ajustarTamanoGrid(this.gridApi); }
  private resizeTimeoutId: any; // Almacena el ID del timeout 

  // Agrega esta propiedad a la clase
  public selectedRow: any | null = null;

  constructor(public modal: NgbActiveModal,
    public _appAgGridService: AppAgGridService,
  ) {
    this.isdisabled = false;
  }

  ngOnInit() {
    this.initializeGrid();
  }

  //   ******   FUNCIONES DE AG-GRID   ******  //
  initializeGrid(): void {
    this.columnDefs = [
      {
        headerName: 'Id',
        field: 'id',
        cellStyle: { textAlign: 'center' },
        minWidth: 70,
        maxWidth: 70,
        hide: true,
      },
      {
        headerName: 'Identificación',
        field: 'identificacion',
        cellStyle: { textAlign: 'left' },
        minWidth: 180,
        maxWidth: 180,
      },
      {
        headerName: 'Cliente',
        field: 'nombre_completo',
        cellStyle: { textAlign: 'left' },
        minWidth: 150,
        maxWidth: 500,
      },
    ];
  }

  onGridReady(params: GridReadyEvent): void {
    this.gridApi = params.api;

    // Agregar eventos para desktop y móvil
    setTimeout(() => {
      const headerElement = document.querySelector('.ag-header-cell[col-id="actions"]');
      if (headerElement) {
        // Evento para desktop
        headerElement.addEventListener('click', this.handleHeaderAction.bind(this));

        // Eventos para móvil
        headerElement.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: true });
        headerElement.addEventListener('touchend', this.handleTouchEnd.bind(this));
      }
    }, 500);

    this._appAgGridService.ajustarTamanoGrid(this.gridApi);
    this.ajustarAlturaGrid();
  }

  handleTouchStart(e: TouchEvent) {
    this.touchStartTime = Date.now();
    this.touchStartX = e.touches[0].clientX;
    this.touchStartY = e.touches[0].clientY;
  }

  handleTouchEnd(e: TouchEvent) {
    const touchDuration = Date.now() - this.touchStartTime;
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const distX = Math.abs(touchEndX - this.touchStartX);
    const distY = Math.abs(touchEndY - this.touchStartY);

    // Consideramos como "tap" si fue breve y con poco movimiento
    if (touchDuration < 300 && distX < 10 && distY < 10) {
      this.toggleActionsColumn();
      e.preventDefault(); // Prevenir comportamiento por defecto
    }
  }

  handleHeaderAction() {
    //console.log('Acción de header detectada');
    this.toggleActionsColumn();
  }

  toggleActionsColumn() {
    const columnDefs = this.gridApi.getColumnDefs() as any[];
    const actionsCol = columnDefs.find(col => col.field === 'actions');

    if (actionsCol) {
      const isCollapsed = actionsCol.minWidth === 50;

      actionsCol.minWidth = isCollapsed ? 110 : 50;
      actionsCol.maxWidth = isCollapsed ? 110 : 50;
      actionsCol.cellStyle = isCollapsed ?
        { display: 'flex', justifyContent: 'center', alignItems: 'center' } :
        { display: 'none', justifyContent: 'left', alignItems: 'left' };

      actionsCol.headerComponentParams = {
        template: isCollapsed ?
          `<div style="display: flex; align-items: center; justify-content: center; gap: 5px;">
              <span>ACCIONES</span>
              <i class="fas fa-arrow-right"></i>
            </div>` :
          `<div style="display: flex; align-items: center; justify-content: center;">
              <i class="fas fa-bars"></i>
            </div>`
      };

      //actionsCol.headerName = isCollapsed ? 'ACCIONES' : '☰';
      // ☰ ⠿ ☷

      // Optimización para móviles
      if (window.innerWidth <= 768) {
        actionsCol.minWidth = isCollapsed ? 110 : 50; // Ancho menor en móviles
        actionsCol.maxWidth = isCollapsed ? 110 : 50;
      }

      this.gridApi.setColumnDefs(columnDefs);
      this.gridApi.sizeColumnsToFit();

      // Asegurar redimensionado en móviles
      setTimeout(() => {
        this.gridApi.sizeColumnsToFit();
      }, 100);
    }
  }

  ajustarTamanoGrid() {
    if (this.gridApi) {
      if (this.resizeTimeoutId) { clearTimeout(this.resizeTimeoutId); }    // Cancela el timeout anterior si existe    
      this.resizeTimeoutId = setTimeout(() => {
        this._appAgGridService.ajustarTamanoGrid(this.gridApi);
        this.ajustarAlturaGrid();
      }, 100); // Esperar 100ms para asegurar que el DOM se haya actualizado
    }
  }

  ajustarAlturaGrid() {
    // Obtener el contenedor del grid
    const gridElement = document.querySelector('.ag-theme-alpine') as HTMLElement;

    if (gridElement) {
      // Calcular altura disponible
      const windowHeight = window.innerHeight;
      const gridPosition = gridElement.getBoundingClientRect().top;
      const marginBottom = 20; // Margen inferior

      // Establecer nueva altura
      const newHeight = windowHeight - gridPosition - marginBottom;
      gridElement.style.height = `${newHeight}px`;

      // Notificar al grid del cambio de tamaño
      this.gridApi.sizeColumnsToFit();
    }
  }

  onCellClicked(e: CellClickedEvent): void {
    this.selectedRow = e.data;

    if (this.selectedRow) {
      this.isdisabled = true;
    } else {
      this.isdisabled = false;
    }

    //this.id = e.data.id;
    //this.nombre = e.data.nombre;
  }

  onFilterTextBoxChanged() {
    this.gridApi.setQuickFilter((document.getElementById('filter-text-box') as HTMLInputElement).value);
  }

  clearAllFilters() {
    if (this.gridApi) {
      this.gridApi.setFilterModel(null); // Esto elimina todos los filtros
      const quickFilterInput = document.getElementById('filter-text-box') as HTMLInputElement;
      if (quickFilterInput) {
        quickFilterInput.value = '';
      }
      this.onFilterTextBoxChanged();
      this.gridApi.onFilterChanged(); // Notifica al grid que los filtros cambiaron
    }
  }

  clearSelection(): void {
    this._appAgGridService.limpiarSeleccion(this.gridApi); // Usa el método del servicio
  }

  seleccionarCliente() {
    this.registrosE.emit(this.selectedRow);
    this.modal.close();
  }

}
