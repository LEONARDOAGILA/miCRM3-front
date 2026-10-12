import { Injectable, inject } from '@angular/core';
import { CellPosition, ColDef, GridApi, NavigateToNextCellParams, RowClassParams, RowNode, SideBarDef } from 'ag-grid-community';
import { Observable, take, takeUntil } from 'rxjs';
import { ToastrService } from 'ngx-toastr';

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
  // LA CASILLA DE «ACTIVO»
  // ================================================================
  //
  // Nueve pantallas tienen una columna con una casilla que activa o desactiva
  // la fila sin abrir el formulario. El dibujo y el flujo eran los mismos en
  // todas, así que viven aquí; de cada pantalla sólo quedan sus datos: qué
  // columna es, qué servicio llama y cómo se llama lo que hay en la fila.

  /** El aviso de «guardado» y el de «no se pudo» salen de aquí. */
  private readonly _toastr = inject(ToastrService);

  /**
   * Las filas desactivadas, apagadas y tachadas.
   *
   * Para saber de un vistazo cuáles ya no están en juego sin tener que leer la
   * casilla fila por fila. El CSS de la clase `fila-inactiva` está en
   * styles.css, global: las filas las dibuja ag-Grid fuera de la
   * encapsulación de cualquier componente.
   *
   * `=== false` y no `!activo`: así una fila a la que todavía no le ha llegado
   * el dato —`undefined` mientras carga— no se pinta tachada para luego
   * destacharse.
   *
   * Se pasa el campo porque en las dos pantallas de usuarios la columna se
   * llama `isactive` y no `activo`.
   */
  reglasFilaInactiva(campo = 'activo'): { [clase: string]: (p: RowClassParams) => boolean } {
    return { 'fila-inactiva': (p: RowClassParams) => (p.data as any)?.[campo] === false };
  }

  /**
   * La casilla de la columna «Activo», como HTML.
   *
   * ES HTML Y NO UN COMPONENTE de Angular porque el clic se atiende en el
   * `onCellClicked` de la pantalla por `data-accion`, igual que el botón de
   * llamar de la columna Celular. Un componente por celda se paga en cada
   * repintado de la rejilla y aquí no hay nada que lo justifique.
   *
   * Sin permiso de modificar sale `disabled`: se sigue viendo el dato, que es
   * para lo que servía esta columna antes, pero no se puede tocar.
   */
  casillaActivo(params: any, op: { puede: boolean; enVuelo: Set<number>; que: string }): string {
    if (op.enVuelo.has(params.data?.id)) {
      return `<div class="celda-activo">
                <span class="spinner-border spinner-border-sm text-secondary"
                      role="status" aria-label="Guardando"></span>
              </div>`;
    }

    const marcada = params.value === true;
    const que     = op.que;
    const Que     = que.charAt(0).toUpperCase() + que.slice(1);
    const titulo  = op.puede ? `${marcada ? 'Desactivar' : 'Activar'} este ${que}`
                             : `${Que} ${marcada ? 'activo' : 'inactivo'}`;

    return `<div class="celda-activo" title="${titulo}">
              <input type="checkbox"
                     class="form-check-input${op.puede ? ' celda-activo__check' : ''}"
                     ${marcada ? 'checked' : ''}
                     ${op.puede ? 'data-accion="activo"' : 'disabled'}
                     aria-label="${titulo}" />
            </div>`;
  }

  /**
   * Activar o desactivar la fila desde su casilla.
   *
   * NO PASA POR EL FORMULARIO: cada entidad tiene en el servidor una función
   * que escribe sólo esa columna. Guardar la ficha entera para bajar una
   * casilla la revalidaba toda, y un registro que hoy no cumpliría alguna
   * regla —cargado antes de que existiera— no se podría desactivar hasta
   * arreglarle todo lo demás.
   *
   * SE MANDA EL VALOR QUE SE QUIERE, no «lo contrario de lo que hay»: si dos
   * personas pulsan a la vez, las dos acaban donde querían llegar.
   *
   * LA CASILLA NO DECIDE. La marca que pone el navegador al pulsar es sólo un
   * acuse de recibo; quien dice cómo queda la fila es el servidor, y la celda
   * se vuelve a dibujar con lo que contesta. Si la llamada falla, la marca
   * vuelve donde estaba.
   */
  alternarActivo(op: {
    /** La rejilla donde está la fila. */
    gridApi: GridApi | null | undefined;
    /** El array que alimenta la rejilla: hay que cambiarlo también. */
    filas: any[];
    /** La fila que se pulsó (el `data` del evento). */
    fila: any;
    /** Su nodo, que lo trae el evento del clic. */
    nodo?: RowNode | null;
    /** Cómo se llama la columna: `activo` en casi todas, `isactive` en usuarios. */
    campo: string;
    /** Los ids que se están guardando, los mismos que mira casillaActivo. */
    enVuelo: Set<number>;
    /** Si el perfil permite modificar. */
    puede: boolean;
    /** Qué es la fila, para los avisos: «usuario», «cargo»… */
    que: string;
    /** La llamada al servidor. */
    llamar: (id: number, activo: boolean) => Observable<any>;
    /** Cómo se llama esto, para el título del aviso. */
    nombre?: (fila: any) => string;
    /** El ngOnDestroy de la pantalla, para no tocar una rejilla ya muerta. */
    hasta?: Observable<any>;
    /** Si la pantalla tiene que enterarse (refrescar un contador, por ejemplo). */
    alCambiar?: (fila: any) => void;
  }): void {
    const id = op.fila?.id;
    if (!id) { return; }

    if (!op.puede) {
      this._toastr.warning(`Tu perfil no permite modificar este ${op.que}`, 'Sin permiso');
      return;
    }
    if (op.enVuelo.has(id)) { return; }        // ya se está guardando

    const quiero = op.fila[op.campo] !== true;
    const nodo   = op.nodo ?? this.nodoDe(op.gridApi, id);

    op.enVuelo.add(id);
    this.repintarCelda(op.gridApi, nodo, op.campo);

    const peticion = op.hasta
      ? op.llamar(id, quiero).pipe(takeUntil(op.hasta))
      : op.llamar(id, quiero).pipe(take(1));

    peticion.subscribe({
      next: (res: any) => {
        op.enVuelo.delete(id);

        // Lo que quedó escrito, no lo que se pidió. Se copia TODO lo que
        // devuelva el servidor menos el id: en boletines ahí viene además el
        // `estado` recalculado, que la rejilla también pinta.
        const d = res?.data ?? {};
        const actualizado = { ...op.fila, ...d, id };

        this.ponerFila(op.gridApi, op.filas, actualizado, op.campo);
        op.alCambiar?.(actualizado);

        this._toastr.success(res?.message ?? '',
                             op.nombre?.(actualizado) || op.que, { timeOut: 2500 });
      },
      error: (err: any) => {
        op.enVuelo.delete(id);
        this.repintarCelda(op.gridApi, nodo, op.campo);
        this._toastr.error(err?.error?.message ?? 'No se pudo cambiar el estado',
                           'No se guardó');
      },
    });
  }

  /** Repinta una sola celda: entrar en el giro de «guardando» y salir de él. */
  repintarCelda(gridApi: GridApi | null | undefined, nodo: RowNode | null | undefined, campo: string): void {
    if (!gridApi) { return; }
    gridApi.refreshCells(nodo
      ? { rowNodes: [nodo], columns: [campo], force: true }
      : { columns: [campo], force: true });
  }

  /**
   * Cambia la fila por la que contestó el servidor.
   *
   * `setData` y no `refreshCells`: al cambiar la casilla cambian también
   * «Actualizado» y «Actualizado por», y donde hay `rowClassRules` —el tachado
   * de los inactivos en clientes— ésas se evalúan al asentar la fila y no al
   * refrescar sus celdas. Tampoco `redrawRows`, que suena a lo que hace falta
   * y no lo hace: comprobado contra la librería, no vuelve a llamar al dibujo
   * de la celda y la deja VACÍA, sin casilla que pulsar.
   *
   * SE CAMBIA TAMBIÉN EN EL ARRAY de la pantalla: si sólo se cambiara en el
   * nodo, la próxima vez que ag-Grid lea las filas volvería el valor viejo.
   */
  ponerFila(gridApi: GridApi | null | undefined, filas: any[], fila: any, campo = 'activo'): void {
    const i = (filas ?? []).findIndex(f => f?.id === fila.id);
    if (i !== -1) { filas[i] = fila; }

    const nodo = this.nodoDe(gridApi, fila.id);
    if (nodo) { nodo.setData(fila); }
    else { this.repintarCelda(gridApi, null, campo); }
  }

  /**
   * El nodo de la rejilla de una fila, por el `id` del dato.
   *
   * No con `getRowNode`: estas rejillas no fijan `getRowId`, así que los nodos
   * van numerados por posición y ese número no sirve para buscar un registro
   * concreto —ordenando o cambiando de página deja de coincidir—.
   */
  nodoDe(gridApi: GridApi | null | undefined, id: number): RowNode | null {
    let encontrado: RowNode | null = null;
    gridApi?.forEachNode(nodo => {
      if ((nodo.data as any)?.id === id) { encontrado = nodo as RowNode; }
    });
    return encontrado;
  }

  // ================================================================
  // EL CLIC DERECHO SOBRE UNA FILA
  // ================================================================

  /**
   * De un clic del ratón a la fila de la rejilla sobre la que cayó.
   *
   * NO SE USA EL EVENTO `cellContextMenu` DE ag-Grid: se probó contra la
   * librería de verdad y no llega —el clic alcanza el contenedor de filas
   * pero la rejilla lo descarta antes de emitirlo—. Lo que sí funciona es
   * escuchar el `contextmenu` del contenedor y resolver la fila desde el
   * DOM con la API pública, que está documentada y no cambia de versión a
   * versión.
   *
   * SE BUSCA POR `row-id` Y NO POR EL ÍNDICE VISIBLE: ordenando o filtrando
   * dejan de coincidir, y el menú acabaría actuando sobre otra fila. El
   * índice queda de respaldo para las rejillas que no fijan un id propio.
   *
   * Devuelve null si el clic cayó fuera de las filas —la cabecera, el fondo—,
   * y entonces quien llama NO debe hacer preventDefault: ahí el menú del
   * navegador es lo que toca.
   */
  filaDeEventoEnGrilla(e: MouseEvent, gridApi: GridApi | null | undefined): any | null {
    const fila = (e.target as HTMLElement)?.closest?.('.ag-row') as HTMLElement | null;
    if (!fila || !gridApi) { return null; }

    const id = fila.getAttribute('row-id');
    if (id) {
      const nodo = gridApi.getRowNode(id);
      if (nodo?.data) { return nodo.data; }
    }

    const indice = Number(fila.getAttribute('row-index'));
    if (Number.isFinite(indice)) {
      return gridApi.getDisplayedRowAtIndex(indice)?.data ?? null;
    }
    return null;
  }

  /**
   * Marca esa fila en la rejilla.
   *
   * El menú contextual actúa sobre «la fila»: si no se marcara, se vería
   * resaltada una y el menú trabajaría sobre otra. Es el error clásico de
   * los menús contextuales sobre tablas.
   *
   * Se compara por `id` y no por identidad del objeto: la fila que devuelve
   * `filaDeEventoEnGrilla` sale de la rejilla, pero quien llama puede haberla
   * sustituido por una copia suya.
   */
  marcarFila(gridApi: GridApi | null | undefined, fila: any): void {
    if (!gridApi || !fila) { return; }
    gridApi.forEachNode(nodo => {
      if ((nodo.data as any)?.id === fila.id) { nodo.setSelected(true); }
    });
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