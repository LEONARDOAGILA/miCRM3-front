import { Injectable } from '@angular/core';
import { CellPosition, ColDef, GridApi, NavigateToNextCellParams, RowNode, SideBarDef } from 'ag-grid-community';

@Injectable({
  providedIn: 'root', // Proporciona el servicio a nivel de raíz
})
export class AppAgGridService {
  public defaultColDef: ColDef = {
    sortable: true,
    filter: true,
    editable: false,
    resizable: true,
    // Sin cellStyle aquí: el tamaño de letra lo fija el skin de ag-Grid
    // (scss/angular.scss, --ag-font-size). Un cellStyle por defecto se
    // pierde en cuanto una columna define el suyo (textAlign, etc.), así
    // que unas celdas salían a 11px y otras a 12px.
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

  /**
   * Navegación con el teclado como en el explorador de Windows: al moverse
   * con ↑ / ↓ (también Inicio, Fin, Re Pág, Av Pág) la fila a la que se
   * llega queda SELECCIONADA, igual que con un clic; con Mayús se extiende
   * la selección (si la grilla es `rowSelection: 'multiple'`). ← / → sólo
   * mueven el foco entre celdas.
   *
   * Uso en el componente:
   *   navegarConTeclado = this._appAgGridService.navegacionConFlechas(fila => this.selectedRow = fila);
   * y en la plantilla:
   *   [navigateToNextCell]="navegarConTeclado"
   *
   * `alSeleccionar` recibe la fila (data) para que el componente haga lo
   * mismo que en su onCellClicked. Requiere `rowSelection` en la grilla.
   */
  navegacionConFlechas(alSeleccionar?: (fila: any, nodo: RowNode) => void): (p: NavigateToNextCellParams) => CellPosition | null {
    return (params: NavigateToNextCellParams): CellPosition | null => {
      const siguiente = params.nextCellPosition;
      if (!siguiente) { return null; }                                                          // ya en el borde
      if (siguiente.rowIndex === params.previousCellPosition?.rowIndex) { return siguiente; }  // ← / →: sólo el foco

      const nodo = params.api?.getDisplayedRowAtIndex(siguiente.rowIndex);
      if (!nodo?.data) { return siguiente; }

      const extender = !!params.event?.shiftKey;
      nodo.setSelected(true, !extender);   // sin Mayús: sólo esta fila
      params.api.ensureIndexVisible(siguiente.rowIndex);
      alSeleccionar?.(nodo.data, nodo);
      return siguiente;
    };
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

  // ================================================================
  // FILTROS DE CABECERA EN LAS REJILLAS QUE PAGINAN EN EL SERVIDOR
  // ================================================================
  //
  // POR QUÉ ESTO ESTÁ AQUÍ. Una rejilla que pide sus filas al servidor sólo
  // tiene las de la página: si ag-Grid filtrara por su cuenta, escribir
  // «Manta» daría dos de mil y parecería rota. Lo que se hace es dejar que la
  // cabecera recoja lo que el usuario pidió —el operador, el valor, el
  // modelo— y que el filtrado lo haga el servidor sobre el total.
  //
  // Estaba copiado en tres pantallas; cada una nueva era una cuarta copia.

  /**
   * Una operación de filtro que la rejilla NO aplica: siempre pasa.
   *
   * `predicate` es la pieza clave. No vale `textMatcher`: gobierna sólo las
   * comparaciones de texto, y «En blanco» se resuelve antes de llegar a él y
   * sí escondería filas.
   */
  private opcionQueNoFiltra(clave: string, nombre: string, entradas: 0 | 1 | 2 = 1): any {
    return { displayKey: clave, displayName: nombre, numberOfInputs: entradas, predicate: () => true };
  }

  /** Filtro de texto que no filtra aquí. Los nombres, en castellano: una
   *  operación propia no pasa por el localeText de la rejilla. */
  /**
   * Los parámetros del filtro de texto, sueltos.
   *
   * Lo normal es `filtrosDeServidor`, que los cuelga de una pasada. Esto es
   * para las pantallas que escriben `filter` y `filterParams` columna a
   * columna.
   */
  get filtroTextoDeServidor(): any {
    return {
      suppressAndOrCondition: true,
      debounceMs: 400,                 // sin esto hay que pulsar Enter y nadie lo pulsa
      filterOptions: [
        this.opcionQueNoFiltra('contains',    'Contiene'),
        this.opcionQueNoFiltra('notContains', 'No contiene'),
        this.opcionQueNoFiltra('equals',      'Es igual a'),
        this.opcionQueNoFiltra('notEqual',    'No es igual a'),
        this.opcionQueNoFiltra('startsWith',  'Empieza por'),
        this.opcionQueNoFiltra('endsWith',    'Termina en'),
        this.opcionQueNoFiltra('blank',       'En blanco', 0),
        this.opcionQueNoFiltra('notBlank',    'No en blanco', 0),
      ],
    };
  }

  /** Lo mismo para las columnas de números. */
  get filtroNumeroDeServidor(): any {
    return {
      suppressAndOrCondition: true,
      debounceMs: 400,
      filterOptions: [
        this.opcionQueNoFiltra('equals',             'Es igual a'),
        this.opcionQueNoFiltra('notEqual',           'No es igual a'),
        this.opcionQueNoFiltra('greaterThan',        'Mayor que'),
        this.opcionQueNoFiltra('greaterThanOrEqual', 'Mayor o igual que'),
        this.opcionQueNoFiltra('lessThan',           'Menor que'),
        this.opcionQueNoFiltra('lessThanOrEqual',    'Menor o igual que'),
        this.opcionQueNoFiltra('inRange',            'Entre', 2),
        this.opcionQueNoFiltra('blank',              'En blanco', 0),
        this.opcionQueNoFiltra('notBlank',           'No en blanco', 0),
      ],
    };
  }

  /**
   * Les cuelga el filtro a las columnas que lo admiten.
   *
   * Se hace de una pasada en vez de repetir `filter` y `filterParams` en
   * veinte definiciones: así la lista de qué se puede filtrar está en UN sitio
   * y no desperdigada. Lo que no esté en el mapa se queda sin filtro.
   *
   * La columna se busca por `field` y, si no tiene, por `colId`: las que se
   * calculan con valueGetter no tienen campo, y el modelo que manda ag-Grid
   * viene con el colId.
   *
   * @param columnas Las definiciones, tal cual.
   * @param mapa     { campo: 'texto' | 'numero' }, la misma lista blanca que
   *                 tenga el controlador: ofrecer aquí un filtro de más sería
   *                 prometer algo que el servidor no hace.
   */
  filtrosDeServidor(columnas: any[], mapa: { [campo: string]: 'texto' | 'numero' }): any[] {
    return columnas.map(c => {
      const tipo = mapa[c.field ?? c.colId];
      if (!tipo) { return { ...c, filter: false }; }
      return {
        ...c,
        filter: tipo === 'numero' ? 'agNumberColumnFilter' : 'agTextColumnFilter',
        filterParams: tipo === 'numero' ? this.filtroNumeroDeServidor : this.filtroTextoDeServidor,
        // AQUÍ, en la columna. `floatingFilter` NO es opción de rejilla: no
        // está en GridOptions ni entre las entradas de ag-grid-angular, y
        // ponerlo en la etiqueta hace que Angular corte el build con NG8002.
        // Las columnas sin filtro dejan su hueco en blanco en esa fila.
        floatingFilter: true,
      };
    });
  }


}