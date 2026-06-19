import { Component, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ColDef, GridReadyEvent, GridApi, ColumnApi } from 'ag-grid-community';
import { AgGridAngular } from 'ag-grid-angular';
import { FormBuilder, FormGroup, Validators, FormArray } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { firstValueFrom, Subject, takeUntil } from 'rxjs';

//   ******   SERVICIOS   ******  //
import { AppAgGridService } from '../../../../../service/app-agGrid.service';


//   ******   MODELOS   ******  //
import { SeguridadService } from '../../../../seguridad/services/seguridad.service';
import { AccesoModel } from '../../../../seguridad/interfaces/accesoModel';
import { ClienteModel } from '../../../../../modules/clientes/interfaces/clienteModel';
import { ProductoModel } from '../../../../../modules/inventarios/interfaces/productoModel';
import { LoadingService } from '../../../../../service/loading.service';
import { DatosPruebaService } from '../../../../../service/datos-prueba.service';

//   ******   COMPONENTES   ******  //
import { AllClientesComponent } from '../all-clientes/all-clientes.component';
import { AllProductosComponent } from '../all-productos/all-productos.component';
import { ClienteService } from '../../../../clientes/services/cliente.service';

@Component({
  selector: 'app-factura',
  templateUrl: './factura.component.html',
  styleUrls: ['./factura.component.css'],
  standalone: false
})
export class FacturaComponent implements OnInit, OnDestroy {
  //   ******   AG-GRID   ******  //
  @ViewChild(AgGridAngular) agGrid!: AgGridAngular;
  private gridApi!: GridApi;
  public columnDefs: ColDef[] = [];
  @HostListener('window:resize', ['$event'])
  onResize(event: Event): void { this._appAgGridService.ajustarTamanoGrid(this.gridApi); }
  private resizeTimeoutId: any; // Almacena el ID del timeout 
  public defaultColDef: ColDef = {
    flex: 1,
    minWidth: 100,
    editable: true,
    singleClickEdit: true,
  };
  private gridColumnApi!: ColumnApi;
  public filaSeleccionada: boolean = false;

  //   ******   PLANTILLA   ******  //
  private unsubscribe$ = new Subject<void>();
  public isLoading$ = this._loadingService.isLoading$;
  public title: string = 'Facturación';

  //   ******   MODELOS   ******  //  
  public accesoModel: AccesoModel;
  public filteredClientes: ClienteModel[] = [];
  public listaClientes: ClienteModel[] = [];
  // Productos de ejemplo
  private productosEjemplo: ProductoModel[];
  // Variables separadas para la configuración
  public rowData: ProductoModel[] = [];

  //   ******   AUTOCOMPLETADO CLIENTES   ******  //  
  public showClienteSuggestions: boolean = false;
  public clienteSeleccionado: boolean = false;
  public tieneProductos: boolean = false;

  //   ******   OTROS   ******  //  
  public form: FormGroup;
  public total: number = 0;

  constructor(
    private modal: NgbModal,
    private activeRoute: ActivatedRoute,
    private route: Router,

    public _appAgGridService: AppAgGridService,
    private _seguridadService: SeguridadService,
    private _loadingService: LoadingService,
    private _datosPruebaService: DatosPruebaService,
    private _clienteService: ClienteService,
    private _fb: FormBuilder,
  ) {
    this.accesoModel = this.activeRoute.snapshot.data.access;
    this.productosEjemplo = this._datosPruebaService.productosEjemplo;
  }

  //   ******   INIT  - DESTROY  ******  //
  ngOnInit(): void {
    this.listClientes();

    this.initializeForm();
    this.initializeGrid();
  }

  ngOnDestroy(): void {
    if (this.resizeTimeoutId) { clearTimeout(this.resizeTimeoutId); } // Cancela el timeout cuando el componente se destruye
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

  //   ******   HOME DE MODULO  ******  //
  fun_home() {
    this.route.navigate(['/demo/home']);
  }

  //   ******   INICIALIZA FORMULARIO   ******  //
  initializeForm(): void {
    this.form = this._fb.group({
      // Cabecera de la factura
      cabecera: this._fb.group({
        id: [0, [Validators.required]],
        identificacion: ['', [Validators.required, Validators.maxLength(13)]],
        nombre_completo: ['', [Validators.required, Validators.maxLength(50)]],
      }),
      // Detalle de productos
      productos: this._fb.array([]),
      // Total de la factura
      total_factura: [0]
    });
  }

  // Getter para acceder al FormGroup de cabecera
  get cabecera(): FormGroup {
    return this.form.get('cabecera') as FormGroup;
  }

  // Getter para acceder al FormArray de productos
  get productos(): FormArray {
    return this.form.get('productos') as FormArray;
  }

  // Método para crear un FormGroup de producto
  private crearProductoFormGroup(producto: ProductoModel): FormGroup {
    return this._fb.group({
      id: [producto.id],
      codigo: [producto.codigo],
      nombre: [producto.nombre],
      descripcion: [producto.descripcion],
      cantidad: [1, [Validators.required, Validators.min(1)]],
      precio_unitario: [producto.precio_unitario, [Validators.required, Validators.min(0)]],
      subtotal: [0]
    });
  }

  // Método para agregar producto al FormArray
  private agregarProductoAlFormulario(producto: ProductoModel): void {
    const productoFormGroup = this.crearProductoFormGroup(producto);
    this.productos.push(productoFormGroup);
    this.actualizarTotalFormulario();
  }

  // Método para eliminar producto del FormArray
  private eliminarProductoDelFormulario(index: number): void {
    this.productos.removeAt(index);
    this.actualizarTotalFormulario();
  }

  // Método para actualizar el total en el formulario
  private actualizarTotalFormulario(): void {
    let total = 0;
    this.productos.controls.forEach(control => {
      const cantidad = control.get('cantidad')?.value || 0;
      const precio = control.get('precio_unitario')?.value || 0;
      const subtotal = cantidad * precio;
      control.get('subtotal')?.setValue(subtotal);
      total += subtotal;
    });
    this.form.get('total_factura')?.setValue(total);
    this.total = total;
  }

  //   ******   FUNCIONES DE AG-GRID   ******  //
  private initializeGrid(): void {
    this.columnDefs = [
      {
        headerName: 'Codigo',
        field: 'codigo',
        editable: false,
        minWidth: 200,
      },
      {
        headerName: 'Descripción',
        field: 'descripcion',
        editable: false,
        minWidth: 200,
      },
      {
        headerName: 'Cantidad',
        field: 'cantidad',
        type: 'numericColumn',
        editable: true,
        valueParser: this.cantidadParser.bind(this),
        cellClass: 'numeric-cell',
        minWidth: 120,
      },
      {
        headerName: 'Precio Unitario',
        field: 'precio_unitario',
        type: 'numericColumn',
        editable: true,
        valueParser: this.numberParser.bind(this),
        valueFormatter: this.currencyFormatter.bind(this),
        cellClass: 'numeric-cell',
        minWidth: 150,
      },
      {
        headerName: 'Subtotal',
        field: 'subtotal',
        editable: false,
        valueFormatter: this.currencyFormatter.bind(this),
        cellClass: 'subtotal-cell',
        minWidth: 150,
      },
    ];
  }

  // Manejador de eventos del grid
  onGridReady(params: GridReadyEvent): void {
    this.gridApi = params.api;
    this.gridColumnApi = params.columnApi;
    this.calcularTotal();

    // Ajustar automáticamente el tamaño de las columnas al contenido
    setTimeout(() => {
      this.gridApi.sizeColumnsToFit();
      // Inicializar la fila de totales si hay datos
      if (this.rowData.length > 0) {
        this.calcularTotalesDinamicos();
      }
    }, 100);
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

      this.gridApi.onFilterChanged(); // Notifica al grid que los filtros cambiaron
    }
  }

  onCellValueChanged(event: any): void {
    // Actualizar el subtotal cuando cambian cantidad o precio
    if (event.colDef.field === 'cantidad' || event.colDef.field === 'precio_unitario') {
      const data = event.data;

      // Validar que la cantidad sea al menos 1
      if (event.colDef.field === 'cantidad' && (data.cantidad < 1 || isNaN(data.cantidad))) {
        data.cantidad = 1;
        // Actualizar el valor en el grid inmediatamente
        this.gridApi.applyTransaction({ update: [data] });
      }

      // Validar que el precio no sea negativo
      if (event.colDef.field === 'precio_unitario' && (data.precio_unitario < 0 || isNaN(data.precio_unitario))) {
        data.precio_unitario = 0;
        // Actualizar el valor en el grid inmediatamente
        this.gridApi.applyTransaction({ update: [data] });
      }

      // Calcular subtotal
      const cantidad = parseFloat(data.cantidad) || 0;
      const precio = parseFloat(data.precio_unitario) || 0;
      data.subtotal = cantidad * precio;

      // Actualizar la fila en el grid
      this.gridApi.applyTransaction({ update: [data] });

      // Actualizar también en rowData
      const rowIndex = this.rowData.findIndex(item => item.id === data.id);
      if (rowIndex >= 0) {
        this.rowData[rowIndex] = { ...data };
      }

      // Actualizar el FormArray correspondiente
      if (rowIndex >= 0 && rowIndex < this.productos.length) {
        const productoControl = this.productos.at(rowIndex);
        productoControl.patchValue({
          cantidad: cantidad,
          precio_unitario: precio,
          subtotal: data.subtotal
        });
      }

      this.calcularTotal();
      this.actualizarTotalFormulario();
    }
  }

  // Metodo que se usa para activar o desactivar el boton quitar fila del producto
  onSelectionChanged(event: any): void {
    this.filaSeleccionada = this.gridApi.getSelectedRows().length > 0;
  }

  //   ******   SECCION DETALLE - PRODUCTOS   ******  //
  // Agregar producto
  agregarProducto(): void {
    if (!this._seguridadService.isexpired()) {
      const modalRef = this.modal.open(AllProductosComponent, { centered: true, size: "lg", backdrop: "static", keyboard: false, });

      modalRef.componentInstance.registrosE.pipe(takeUntil(this.unsubscribe$)).subscribe({
        next: (response: any) => {

          console.log('producto agregado: ....   ', response);

          const cantidad = 1;
          const precio = parseFloat(response.precio_unitario) || 0;
          const subtotal = cantidad * precio;

          const nuevaFila: any = {
            id: response.id,
            codigo: response.codigo,
            nombre: response.nombre,
            descripcion: response.descripcion,
            cantidad: cantidad,
            precio_unitario: precio,
            subtotal: subtotal
          };

          // Agregar al array de datos primero
          this.rowData.push(nuevaFila);

          // Agregar al grid
          if (this.gridApi) {
            this.gridApi.applyTransaction({ add: [nuevaFila] });
          }

          // Agregar al FormArray
          this.agregarProductoAlFormulario(nuevaFila);
          this.calcularTotal();

        },
        error: (error: any) => {
          console.error(error.message);
        },
      });
    }
  }

  // Eliminar producto seleccionado
  eliminarProducto(): void {
    const selectedNodes = this.gridApi.getSelectedNodes();
    if (selectedNodes.length > 0) {
      const selectedData = selectedNodes.map(node => node.data);

      // Eliminar del grid
      this.gridApi.applyTransaction({ remove: selectedData });

      // Eliminar del FormArray
      selectedData.forEach(data => {
        const index = this.rowData.findIndex(item => item.id === data.id);
        if (index >= 0) {
          this.eliminarProductoDelFormulario(index);
          this.rowData.splice(index, 1);
        }
      });

      this.filaSeleccionada = false;
      this.calcularTotal();
    }
  }

  // Calcular total general
  calcularTotal(): void {
    let total = 0;
    let cantidadProductos = 0;

    if (this.gridApi) {
      this.gridApi.forEachNode((node) => {
        const data = node.data;
        total += ((data.cantidad || 0) * (data.precio_unitario || 0));
        cantidadProductos++;
      });
    } else {
      total = this.rowData.reduce((sum, item: any) => {
        return sum + ((item.cantidad || 0) * (item.precio_unitario || 0));
      }, 0);
      cantidadProductos = this.rowData.length;
    }

    this.total = total;
    this.tieneProductos = cantidadProductos > 0;

    // Llamar a calcular totales dinámicos después de actualizar el total
    if (this.gridApi && cantidadProductos > 0) {
      setTimeout(() => {
        this.calcularTotalesDinamicos();
      }, 10);
    } else if (this.gridApi && cantidadProductos === 0) {
      this.gridApi.setPinnedBottomRowData([]);
    }
  }

  // Parser para números
  private numberParser(params: any): number {
    const value = Number(params.newValue);
    return isNaN(value) ? 0 : value;
  }

  // Parser específico para cantidad (mínimo 1)
  private cantidadParser(params: any): number {
    const value = Number(params.newValue);
    if (isNaN(value) || value < 1) {
      return 1;
    }
    return value;
  }

  // Formateador de moneda
  private currencyFormatter(params: any): string {
    // Si es texto (como "TOTAL"), devolverlo tal como está
    if (typeof params.value === 'string' && isNaN(Number(params.value))) {
      return params.value;
    }
    if (params.value === undefined || params.value === null || params.value === '' || isNaN(params.value)) return '';
    const numericValue = Number(params.value);
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'USD'
    }).format(numericValue);
  }

  calcularTotalesDinamicos() {
    if (!this.gridApi) return;

    const filaTotales: any = {
      codigo: null,
      descripcion: null,
      cantidad: 0,
      precio_unitario: null,
      subtotal: 0
    };

    // Calcular totales de todas las filas
    this.gridApi.forEachNodeAfterFilter(node => {
      const data = node.data;
      filaTotales.cantidad += (data.cantidad || 0);
      filaTotales.subtotal += ((data.cantidad || 0) * (data.precio_unitario || 0));
    });

    // La fila de totales final - mostrar TOTAL en precio y valor en subtotal
    const filaTotalesFormateada = {
      codigo: '',
      descripcion: '',
      cantidad: '',
      precio_unitario: 'TOTAL', // Mostrar TOTAL en la columna precio
      subtotal: filaTotales.subtotal // Mostrar el valor total en la columna subtotal
    };

    this.gridApi.setPinnedBottomRowData([filaTotalesFormateada]);
  }

  //   ******   CLIENTE   ******  //

  //   ******   LISTADO DE DATOS   ******  //
  async listClientes() {
    try {
      this._loadingService.setLoading(true);
      let res: any = await firstValueFrom(this._clienteService.listClientes());

      if (res?.status === 'success') {
        this._loadingService.setLoading(false);
        this.listaClientes = res.data;
      } else {
        this._loadingService.setLoading(false);
        console.error('response -> Error: Respuesta sin status success', res);
      }

    } catch (error: any) {
      this._loadingService.setLoading(false);
      console.error('response -> Error en la petición', error);
    }
  }

  // Metodo que busca el cliente por identificacion en el input
  onIdentificacionChange(value: string) {
    if (value && value.length > 0) {
      this.filteredClientes = this.listaClientes.filter(cliente =>
        cliente.identificacion.toLowerCase().includes(value.toLowerCase())
      );
      this.showClienteSuggestions = this.filteredClientes.length > 0;

      // Solo resetear datos si no hay valor o si cambia la identificación
      // No auto-completar automáticamente
      if (this.cabecera.get('identificacion')?.value !== value) {
        this.cabecera.patchValue({
          id: 0,
          nombre_completo: '',
        });
        this.clienteSeleccionado = false;
      }
    } else {
      this.showClienteSuggestions = false;
      this.filteredClientes = [];
      this.clienteSeleccionado = false;
      this.cabecera.patchValue({
        id: 0,
        nombre_completo: '',
      });
    }
  }

  // Metodo que settea el cliente en cabecera 
  selectCliente(cliente: ClienteModel) {
    this.cabecera.patchValue({
      id: cliente.id,
      identificacion: cliente.identificacion,
      nombre_completo: cliente.nombre_completo,
    });
    this.showClienteSuggestions = false;
    this.filteredClientes = [];
    this.clienteSeleccionado = true;
  }

  // Boton para buscar un cliente
  buscarCliente() {
    if (!this._seguridadService.isexpired()) {
      const modalRef = this.modal.open(AllClientesComponent, { centered: true, size: "lg", backdrop: "static", keyboard: false, });
      modalRef.componentInstance.registro_selected = 0;
      modalRef.componentInstance.listaClientes = this.listaClientes;
      modalRef.componentInstance.registrosE.pipe(takeUntil(this.unsubscribe$)).subscribe({
        next: (response: any) => {

          this.cabecera.patchValue({
            id: response.id,
            identificacion: response.identificacion,
            nombre_completo: response.nombre_completo,
          });
          this.clienteSeleccionado = true;

        },
        error: (error: any) => {
          console.error(error.message);
        },
      });
    }
  }

  //   ******   GUARDAR FACTURA   ******  //
  // Método para sincronizar datos del grid con el FormArray
  private sincronizarGridConFormulario(): void {
    if (this.gridApi) {
      // Limpiar el FormArray actual
      while (this.productos.length > 0) {
        this.productos.removeAt(0);
      }

      let total = 0;

      // Agregar cada producto del grid al FormArray
      this.gridApi.forEachNode((node) => {
        const producto: any = {
          id: node.data.id,
          codigo: node.data.codigo,
          nombre: node.data.nombre,
          descripcion: node.data.descripcion,
          cantidad: node.data.cantidad,
          precio_unitario: node.data.precio_unitario,
          subtotal: node.data.subtotal
        };

        const productoFormGroup = this.crearProductoFormGroup(producto);
        this.productos.push(productoFormGroup);

        total += (node.data.subtotal || 0);
      });

      // Actualizar el total de la factura
      this.form.get('total_factura')?.setValue(total);
    }
  }

  // Métodos de validación para el formulario completo
  get formularioValido(): boolean {
    return this.form.valid && this.tieneProductos;
  }

  get cabeceraValida(): boolean {
    return this.cabecera.valid;
  }

  get productosValidos(): boolean {
    return this.productos.valid && this.productos.length > 0;
  }

  // Método para validar el formulario antes de guardar
  validarFormulario(): boolean {
    if (!this.cabeceraValida) {
      console.warn('Datos de cabecera incompletos o inválidos');
      return false;
    }

    if (!this.productosValidos) {
      console.warn('Debe agregar al menos un producto válido');
      return false;
    }

    return true;
  }

  guardar() {
    // Sincronizar datos del grid con el FormArray antes de guardar
    this.sincronizarGridConFormulario();

    // El formulario ya contiene toda la estructura completa
    const facturaCompleta = this.form.value;

    console.log('Factura completa:', facturaCompleta);

    return facturaCompleta;
  }

  // Método actualizado para guardar con validación
  guardarConValidacion() {
    if (this.validarFormulario()) {
      return this.guardar();
    } else {
      console.error('Formulario inválido. No se puede guardar.');
      return null;
    }
  }

}