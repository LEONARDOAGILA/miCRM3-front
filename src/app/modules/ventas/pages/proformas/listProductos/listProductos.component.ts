import { Component, EventEmitter, Input, OnInit, Output, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { firstValueFrom } from 'rxjs';
import { AgGridModule } from 'ag-grid-angular';
import { CellClickedEvent, CellKeyDownEvent, GridApi, GridReadyEvent, RowClassParams } from 'ag-grid-community';

import { ModalArrastrableDirective } from '../../../../../components/modal/modal-arrastrable.directive';
import { CampoBusquedaPaginacionComponent }
  from '../../../../../components/campos/campoBusquedaPaginacion/campoBusquedaPaginacion.component';
import { AppAgGridService } from '../../../../../service/app-agGrid.service';
import { LoadingService } from '../../../../../service/loading.service';
import { ProformaService } from '../../../services/proforma.service';
import { ProductoParaLinea } from '../../../interfaces/proformaModel';

/**
 * El listado de productos, para cotizar (modal).
 *
 * Es el hermano de listClientes, con dos diferencias que vienen de para qué
 * se usa:
 *
 *   · ENSEÑA LO QUE IMPORTA AL COTIZAR —precio e IVA— y no el costo. Esta
 *     pantalla la abre quien vende, y el costo no tiene por qué estar a un
 *     clic de distancia en el sitio donde se hace la oferta.
 *
 *   · DEJA ELEGIR VARIOS DE UNA VEZ (`permiteVarios`). Cotizar diez cosas no
 *     debería ser abrir diez veces el mismo listado: se van marcando y al
 *     final se añaden todas. Con uno solo, un clic elige y cierra, como en el
 *     selector de clientes.
 *
 * Las filas vienen YA CON LA FORMA DE UNA LÍNEA de proforma
 * (ventas.fn_proformas_productos_paginado), así que lo que se emite se
 * puede volcar en la rejilla tal cual.
 */
@Component({
  selector: 'app-listProductos',
  standalone: true,
  imports: [CommonModule, AgGridModule, ModalArrastrableDirective, CampoBusquedaPaginacionComponent],
  templateUrl: './listProductos.component.html',
  styleUrls: ['./listProductos.component.css'],
})
export class ListProductosComponent implements OnInit {

  /** Lo que ya se había escrito en la celda del código: se busca al abrir. */
  @Input() busquedaInicial = '';
  /** true: se marcan varios y se añaden juntos. false: un clic elige y cierra. */
  @Input() permiteVarios = false;
  @Input() ayuda = 'Haz clic en un producto para añadirlo a la proforma.';

  /** Lo elegido, siempre como lista (con uno solo, una lista de uno). */
  @Output() seleccionados = new EventEmitter<ProductoParaLinea[]>();

  public readonly _appAgGridService = inject(AppAgGridService);

  public gridApi!: GridApi;
  public columnDefs: any[] = [];
  public rowData: ProductoParaLinea[] = [];

  /** Lo marcado, por producto_id, mientras se eligen varios. */
  public elegidos = new Map<number, ProductoParaLinea>();

  public rowClassRules = {
    'fila-actual': (p: RowClassParams) => this.elegidos.has(p.data?.producto_id),
  };

  @ViewChild(CampoBusquedaPaginacionComponent) campoBusqueda!: CampoBusquedaPaginacionComponent;
  public searchTerm = '';

  public paginaActual = 1;
  public totalRegistros = 0;
  public registrosPorPagina = 10;
  public ultimaPagina = 1;

  public isLoading$ = this._loadingService.isLoading$;

  constructor(
    public modal: NgbActiveModal,
    private _proformaService: ProformaService,
    private _loadingService: LoadingService,
  ) {}

  ngOnInit(): void {
    this.searchTerm = String(this.busquedaInicial ?? '').trim();
    if (this.permiteVarios) {
      this.ayuda = 'Marca los productos que quieras y pulsa «Añadir». Un doble clic añade sólo ése.';
    }
    this.armarColumnas();
    this.cargar(1);
  }

  get desde(): number {
    return this.totalRegistros === 0 ? 0 : (this.paginaActual - 1) * this.registrosPorPagina + 1;
  }

  get hasta(): number {
    return Math.min(this.paginaActual * this.registrosPorPagina, this.totalRegistros);
  }

  get cuantosElegidos(): number { return this.elegidos.size; }

  // ================================================================
  // AG-GRID
  // ================================================================

  private armarColumnas(): void {
    this.columnDefs = [
      ...(this.permiteVarios ? [{
        headerName: '', field: 'marca_elegido',
        width: 44, minWidth: 44, maxWidth: 44,
        sortable: false, resizable: false, suppressMenu: true,
        cellStyle: { textAlign: 'center' },
        cellRenderer: (p: any) => this.elegidos.has(p.data?.producto_id)
          ? '<i class="fa-solid fa-square-check text-primary"></i>'
          : '<i class="fa-regular fa-square text-muted"></i>',
      }] : []),
      {
        headerName: 'Código', field: 'codigo',
        minWidth: 110, maxWidth: 150,
        cellStyle: { textAlign: 'center', fontWeight: '600' },
      },
      {
        headerName: 'Producto', field: 'descripcion',
        minWidth: 240, flex: 2,
        cellStyle: { textAlign: 'left' },
      },
      {
        headerName: 'Marca', field: 'marca',
        minWidth: 110, maxWidth: 160,
      },
      {
        headerName: 'Categoría', field: 'categoria',
        minWidth: 130, maxWidth: 200,
      },
      {
        headerName: 'Unidad', field: 'unidad',
        minWidth: 80, maxWidth: 100,
        cellStyle: { textAlign: 'center' },
      },
      {
        headerName: 'Precio', field: 'precio_unitario',
        type: 'numericColumn', minWidth: 100, maxWidth: 130,
        valueFormatter: (p: any) => this.importe(p.value),
        cellStyle: { fontWeight: '600' },
      },
      {
        headerName: 'IVA', field: 'iva_porcentaje',
        headerTooltip: 'La tarifa que llevará la línea',
        minWidth: 70, maxWidth: 90,
        cellStyle: { textAlign: 'center' },
        cellRenderer: (p: any) => Number(p.value ?? 0) > 0
          ? `<span class="badge bg-secondary bg-opacity-25 text-body fs-10px">${Number(p.value).toFixed(0)} %</span>`
          : '<span class="badge bg-teal fs-10px">0 %</span>',
      },
      {
        headerName: 'Añadir', field: 'elegir',
        pinned: 'right', minWidth: 70, maxWidth: 70,
        sortable: false, resizable: false, suppressMenu: true,
        cellStyle: { display: 'flex', justifyContent: 'center', alignItems: 'center' },
        cellRenderer: () => '<span class="lista-ir" title="Añadir a la proforma"><i class="fas fa-plus"></i></span>',
      },
    ];
  }

  importe(v: any): string {
    if (v === null || v === undefined || v === '') { return ''; }
    const n = Number(v);
    if (isNaN(n)) { return String(v); }
    return n.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  onGridReady(e: GridReadyEvent): void {
    this.gridApi = e.api;
    this.gridApi.setRowData(this.rowData);
    this._appAgGridService.ajustarTamanoGrid(this.gridApi);
  }

  /** ↑ / ↓ resaltan la fila; Enter la elige. */
  navegarConTeclado = this._appAgGridService.navegacionConFlechas();

  onCellKeyDown(e: CellKeyDownEvent): void {
    if ((e.event as KeyboardEvent)?.key === 'Enter') {
      this.onCellClicked(e as unknown as CellClickedEvent);
    }
  }

  /**
   * Un clic en la fila.
   *
   * Con uno solo, elige y cierra. Eligiendo varios, marca y desmarca —salvo
   * la columna «Añadir», que añade ése y cierra: es el atajo para cuando se
   * entró a buscar uno y ya se encontró.
   */
  onCellClicked(e: CellClickedEvent): void {
    const fila = e.data as ProductoParaLinea;
    if (!fila) { return; }

    if (!this.permiteVarios || e.colDef.field === 'elegir') {
      this.devolver([fila]);
      return;
    }

    if (this.elegidos.has(fila.producto_id)) { this.elegidos.delete(fila.producto_id); }
    else                                     { this.elegidos.set(fila.producto_id, fila); }

    // La marca Y el resaltado de la fila. redrawRows y no setData con una
    // copia: lo segundo le cambiaría al nodo el objeto que `elegidos` ya
    // tiene guardado, y lo que se devolvería no sería la misma fila que se
    // marcó. Aquí no se edita ninguna celda, así que redrawRows no tiene el
    // problema de dejarla en blanco.
    this.gridApi?.redrawRows({ rowNodes: [e.node] });
  }

  /** Añade todo lo marcado. */
  anadirElegidos(): void {
    if (!this.elegidos.size) { return; }
    this.devolver([...this.elegidos.values()]);
  }

  private devolver(productos: ProductoParaLinea[]): void {
    this.seleccionados.emit(productos);
    this.modal.close(productos);
  }

  // ================================================================
  // DATOS
  // ================================================================

  async cargar(page: number = 1): Promise<void> {
    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(
        this._proformaService.productos(page, this.registrosPorPagina, this.searchTerm)
      );

      this.rowData = res.body?.data?.data ?? [];

      const meta = res.body?.data?.meta;
      if (meta) {
        this.totalRegistros = meta.total;
        this.registrosPorPagina = meta.per_page;
        this.paginaActual = meta.current_page;
        this.ultimaPagina = meta.last_page;
      }

      this.gridApi?.setRowData(this.rowData);

    } catch (e) {
      // El AuthInterceptor ya enseñó el error HTTP
      console.error('Error al cargar los productos:', e);
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  // ================================================================
  // BÚSQUEDA Y PAGINACIÓN
  // ================================================================

  async onSearch(term?: string): Promise<void> {
    if (term !== undefined) { this.searchTerm = term; }
    this.paginaActual = 1;
    await this.cargar(1);
  }

  limpiarBusqueda(): void {
    this.searchTerm = '';
    this.paginaActual = 1;
    this.campoBusqueda?.reset();
    this.cargar(1);
  }

  irA(page: number): void {
    if (page < 1 || page > this.ultimaPagina) { return; }
    this.paginaActual = page;
    this.cargar(page);
  }

  firstPage(): void { this.irA(1); }
  prevPage(): void  { this.irA(this.paginaActual - 1); }
  nextPage(): void  { this.irA(this.paginaActual + 1); }
  lastPage(): void  { this.irA(this.ultimaPagina); }
}
