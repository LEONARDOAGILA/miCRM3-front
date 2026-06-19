import { Injectable } from '@angular/core';
import { ColDef, GridApi, SideBarDef } from 'ag-grid-community';

@Injectable({
  providedIn: 'root', // Proporciona el servicio a nivel de raíz
})
export class AppAgGridService {
  public defaultColDef: ColDef = {
    sortable: true,
    filter: true,
    editable: false,
    resizable: true,
    cellStyle: {  fontSize: '11px', }, 
    headerClass: 'aggrid-custom-header', // Clase CSS para las cabeceras
  };

  public sideBar: SideBarDef | string | string[] | boolean | null = 'filters';
  public rowHeight: number = 30;  // Altura de fila en píxeles
  public headerHeight: number = 30; // Altura del encabezado en píxeles 
  public tamanoAgGrid: string = 'calc(75vh - 170px)';
  public localeText: { [key: string]: string; } = {
      // Textos generales
      loadingOoo: 'Cargando datos...', 
      noRowsToShow: 'No hay registros',
      
      // Paginación
      page: 'Pag',
      to: 'a',
      of: 'de',
      nextPage: 'Siguiente',
      lastPage: 'Última',
      firstPage: 'Primera',
      previousPage: 'Anterior',
      
      // Filtros
      applyFilter: 'Aplicar',
      cancelFilter: 'Cancelar',
      resetFilter: 'Limpiar filtro',
      clearFilter: 'Limpiar filtro',
      equals: 'Igual a',
      notEqual: 'Diferente a',
      lessThan: 'Menor que',
      greaterThan: 'Mayor que',
      lessThanOrEqual: 'Menor o igual que',
      greaterThanOrEqual: 'Mayor o igual que',
      inRange: 'En rango',
      contains: 'Contiene',
      notContains: 'No contiene',
      startsWith: 'Comienza con',
      endsWith: 'Termina con',
      searchOoo: 'Buscar...',
      selectAll: 'Seleccionar todo',
      blank: 'Vacío',
      notBlank: 'No vacío',
      filterOoo: 'Filtrar...',

      // Operadores lógicos en filtros
      andCondition: 'Y',
      orCondition: 'O',
      
      // Textos adicionales para filtros compuestos
      filterAnd: 'Y',
      filterOr: 'O',
      addFilter: 'Agregar filtro',
      removeFilter: 'Eliminar filtro',
            
      
      // Menú contextual
      copy: 'Copiar',
      paste: 'Pegar',
      export: 'Exportar',
      csvExport: 'Exportar a CSV',
      excelExport: 'Exportar a Excel',
      
      // Columnas
      pinColumn: 'Fijar columna',
      pinLeft: 'Fijar a la izquierda',
      pinRight: 'Fijar a la derecha',
      noPin: 'No fijar',
      valueAggregation: 'Agregación',
      autosizeThiscolumn: 'Autoajustar esta columna',
      autosizeAllColumns: 'Autoajustar todas las columnas',
      groupBy: 'Agrupar por',
      ungroupBy: 'Desagrupar por',
      resetColumns: 'Reiniciar columnas',
      expandAll: 'Expandir todo',
      collapseAll: 'Colapsar todo',
      
      // Panel lateral
      columns: 'Columnas',
      filters: 'Filtros',
      rowGroupColumns: 'Columnas de agrupación',
      rowGroupColumnsEmptyMessage: 'Arrastra aquí para agrupar',
      valueColumns: 'Columnas de valores',
      pivotMode: 'Modo pivote',
      groups: 'Grupos',
      values: 'Valores',
      pivots: 'Pivotes',
      toolPanel: 'Panel de herramientas'
  };



  constructor() {}

  
  ajustarTamanoGrid(gridApi: GridApi): void {
    if (gridApi) {
      gridApi.sizeColumnsToFit();
    }
  }
  
  aplicarFiltro(gridApi: GridApi, filterValue: string): void {
    gridApi.setQuickFilter(filterValue);
  }

  limpiarSeleccion(gridApi: GridApi): void {
    gridApi.deselectAll();
  }

  getDefaultColDef(): ColDef {
    return this.defaultColDef;
  }

  getSideBar(): SideBarDef | string | string[] | boolean | null {
    return this.sideBar;
  }


}