
import { Component, OnInit, ViewChild, Output, EventEmitter } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { AgGridAngular } from 'ag-grid-angular';
import { GridApi, GridReadyEvent, CellClickedEvent } from 'ag-grid-community';

import { ProfileService } from '../../../../seguridad/services/profile.service';
import { AppAgGridService } from '../../../../../service/app-agGrid.service';
import { LoadingService } from '../../../../../service/loading.service';
import { CampoBusquedaPaginacionComponent } from '../../../../../components/campos/campoBusquedaPaginacion/campoBusquedaPaginacion.component';

@Component({
  selector: 'app-listProfile',
  templateUrl: './listProfile.component.html',
  styleUrls: ['./listProfile.component.css'],
  standalone: false,
})
export class ListProfileComponent implements OnInit {
  


  @Output() seleccionado = new EventEmitter<any>();

  @ViewChild(AgGridAngular) agGrid!: AgGridAngular;
  public gridApi!: GridApi;
  public columnDefs: any[] = [];
  public rowData: any[] = [];
  
  @ViewChild(CampoBusquedaPaginacionComponent) campoBusquedaPaginacion!: CampoBusquedaPaginacionComponent;
  public searchTerm: string = '';
  
  // Variables de paginación
  public paginaActual: number = 1;
  public totalRegistros: number = 0;
  public registrosPorPagina: number = 5;
  public ultimaPagina: number = 1;
  
  public isLoading$ = this._loadingService.isLoading$;

  constructor(
    public modal: NgbActiveModal,
    private _profileService: ProfileService,
    public _appAgGridService: AppAgGridService,
    private _loadingService: LoadingService
  ) {}

  ngOnInit(): void {
    this.initializeGrid();
    this.cargarPerfiles();
  }

  initializeGrid(): void {
    this.columnDefs = [
      {
        headerName: 'ID',
        field: 'id',
        cellStyle: { textAlign: 'center' },
        minWidth: 70,
        maxWidth: 70,
      },
      {
        headerName: 'Nombre',
        field: 'nombre',
        cellStyle: { textAlign: 'left' },
        minWidth: 150,
        maxWidth: 450,
      },
      {
        headerName: 'Inactividad',
        field: 'inactividad',
        minWidth: 100,
        maxWidth: 100,
        cellStyle: { textAlign: 'center' }
      },
      // {
      //   headerName: 'Estado',
      //   field: 'activo',
      //   width: 80,
      //   cellStyle: { textAlign: 'center' },
      //   cellRenderer: (params: any) => {
      //     return params.value === true ? 
      //       '<span class="badge bg-success">Activo</span>' : 
      //       '<span class="badge bg-danger">Inactivo</span>';
      //   }
      // },
{
  headerName: 'Seleccionar',
  field: 'seleccionar',
  pinned: 'right',
  minWidth: 60,
  maxWidth: 60,
  cellStyle: { display: 'flex', justifyContent: 'center', alignItems: 'center' },
  sortable: false,
  resizable: false,
  headerComponentParams: {
    template: `
      <div style="display: flex; align-items: center; justify-content: center; gap: 5px;">
        <span>Ir</span>
      </div>
    `
  },
  cellRenderer: () => {
    return `<button class="btn btn-sm btn-outline-primary" style="padding: 4px 6px; border-radius: 4px;">
             <i class="fas fa-arrow-right"></i>
            </button>`;
  }
}


    ];
  }

  onGridReady(params: GridReadyEvent): void {
    this.gridApi = params.api;
    this._appAgGridService.ajustarTamanoGrid(this.gridApi);
  }

  onCellClicked(event: CellClickedEvent): void {
    if (event.colDef.field === 'seleccionar') {
      this.seleccionado.emit(event.data);
      this.modal.close();
    }
  }

  async cargarPerfiles(page: number = 1) {
    try {
      this._loadingService.setLoading(true);
      const res = await firstValueFrom(
        this._profileService.listProfiles(page, this.registrosPorPagina, this.searchTerm)        
      );
      //console.log('perfiles list',res)
      
      this.rowData = res.body?.data?.data || [];
      
      if (res.body?.data?.meta) {
        this.totalRegistros = res.body.data.meta.total;
        this.registrosPorPagina = res.body.data.meta.per_page;
        this.paginaActual = res.body.data.meta.current_page;
        this.ultimaPagina = res.body.data.meta.last_page;
      }
      
      if (this.gridApi) {
        this.gridApi.setRowData(this.rowData);
      }
    } catch (error) {
      console.error('Error al cargar perfiles:', error);
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  async onSearch(term?: string) {
    if (term !== undefined) this.searchTerm = term;
    this.paginaActual = 1;
    await this.cargarPerfiles(1);
  }

  limpiarBusqueda() {
    this.searchTerm = '';
    this.paginaActual = 1;
    this.campoBusquedaPaginacion.reset();
    this.cargarPerfiles(1);
  }

  // Funciones de paginación
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
    this.cargarPerfiles(page);
  }

  nextPage(): void {
    this.goToPage(this.paginaActual + 1);
  }

  prevPage(): void {
    this.goToPage(this.paginaActual - 1);
  }
}

