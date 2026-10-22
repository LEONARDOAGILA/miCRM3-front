import { Component, ElementRef, EventEmitter, HostListener, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { firstValueFrom, from, merge, of, Observable, Subject } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { CellClickedEvent, CellValueChangedEvent, GridApi, GridReadyEvent, RowClassParams } from 'ag-grid-community';
import { AppAgGridService } from '../../../../../service/app-agGrid.service';
import { NgbActiveModal, NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';

// Servicios
import { EmpleadoService } from '../../../services/empleado.service';
import { CargoService } from '../../../services/cargo.service';
import { DepartamentoService } from '../../../services/departamento.service';
import { SeguridadService } from '../../../../seguridad/services/seguridad.service';
import { LoadingService } from '../../../../../service/loading.service';
import { ComprimirImagen } from '../../../../../service/comprimirImagen';

// Modelos y selectores
import { ContactoEmergencia, EmpleadoModel, ESTADOS_EMPLEADO, GENEROS, PARENTESCOS, TIPOS_CONTRATO, TIPOS_IDENTIFICACION } from '../../../interfaces/empleadoModel';
import { ListCargosComponent } from '../../cargos/listCargos/listCargos.component';
import { ListDepartamentosComponent } from '../../departamentos/listDepartamentos/listDepartamentos.component';
import { ListEmpleadosComponent } from '../listEmpleados/listEmpleados.component';
import { ListSucursalComponent } from '../../../../ventas/pages/sucursales/listSucursal/listSucursal.component';
import { SucursalService } from '../../../../ventas/services/sucursal.service';
import {
  SeleccionarUbicacionComponent, UbicacionElegida,
} from '../../../../../components/ubicacion-google-maps/seleccionarUbicacion.component';
import { ImagenVisor, VisorImagenesComponent } from '../../../../../components/visorImagenes/visorImagenes.component';

type AccionEmpleado = 'add' | 'edit' | 'clon' | 'view';

/**
 * Alta, modificación, clonación y vista de un empleado (rh.empleados), con
 * foto. Mismo esquema que saveUser:
 *   - columna izquierda: la foto (arrastrar, galería, cámara, pegar, ampliar);
 *   - derecha: paneles de datos personales, laborales y de contacto.
 * El cargo, el departamento y el jefe se eligen como el perfil y el horario
 * en saveUser: campo ID + nombre de sólo lectura + lupa que abre el selector
 * (listCargos / listDepartamentos / listEmpleados); escribir el ID y salir
 * del campo también lo resuelve.
 * La foto se sube DESPUÉS de guardar el registro (necesita el id), igual
 * que el avatar del usuario.
 */
@Component({
  selector: 'app-saveEmpleado',
  templateUrl: './saveEmpleado.component.html',
  styleUrls: ['./saveEmpleado.component.css'],
  standalone: false,
})
export class SaveEmpleadoComponent implements OnInit, OnDestroy {
  @Input() registro_selected: any = {};
  @Input() accion: AccionEmpleado = 'add';
  @Output() registrosE: EventEmitter<any> = new EventEmitter();

  public form: FormGroup;
  public isLoading$ = this._loadingService.isLoading$;
  public response: any;
  public isdisabled = false;
  public titulo = '';
  public textoClon = '';
  public empleadoId: any;
  public esNuevo = false;
  public esClon = false;
  public esView = false;

  public empleadoModel: EmpleadoModel | null = null;

  // Controles independientes (sólo lectura) con el nombre de lo elegido
  public cargoNombreControl = new FormControl({ value: '', disabled: true });
  public departamentoNombreControl = new FormControl({ value: '', disabled: true });
  public jefeNombreControl = new FormControl({ value: '', disabled: true });
  public sucursalNombreControl = new FormControl({ value: '', disabled: true });

  public tiposIdentificacion = TIPOS_IDENTIFICACION;
  public generos = GENEROS;
  public tiposContrato = TIPOS_CONTRATO;
  public estados = ESTADOS_EMPLEADO;

  // ---------- Foto (mismo mecanismo que el avatar de saveUser) ----------
  public imagen_file: any = null;
  public imagen_paste: any = null;
  public imagen_previzualiza: any = null;
  public comprimirImagen: ComprimirImagen = new ComprimirImagen();
  public cambioImagen = false;
  public nuevaFoto = '';
  public isDragOver = false;
  public showFullscreenImage = false;

  // Cámara
  public showCameraModal = false;
  public cameraError = '';
  public isUsingFrontCamera = true;
  private mediaStream: MediaStream | null = null;

  private destroy$ = new Subject<void>();
  /** true en cuanto corre ngOnDestroy: ningún callback pendiente debe escribir. */
  private destruido = false;
  private readonly lectores = new Set<FileReader>();
  private readonly imagenesEnVuelo = new Set<HTMLImageElement>();

  @ViewChild('galleryInput') private galleryInput?: ElementRef<HTMLInputElement>;
  @ViewChild('pasteInput') private pasteInput?: ElementRef<HTMLInputElement>;

  private videoCamara: HTMLVideoElement | null = null;
  @ViewChild('cameraPreview')
  set cameraPreviewRef(ref: ElementRef<HTMLVideoElement> | undefined) {
    this.videoCamara = ref?.nativeElement ?? null;
    if (this.videoCamara) { this.videoCamara.srcObject = this.mediaStream; }
  }

  constructor(
    private fb: FormBuilder,
    private _toastr: ToastrService,
    public activeModal: NgbActiveModal,
    private modalService: NgbModal,
    private _loadingService: LoadingService,
    private _seguridadService: SeguridadService,
    private _empleadoService: EmpleadoService,
    private _cargoService: CargoService,
    private _departamentoService: DepartamentoService,
    /** Para traer el nombre de la sucursal cuando se escribe su id a mano. */
    private _sucursalService: SucursalService,
    public _appAgGridService: AppAgGridService,
  ) {}

  // ================================================================
  // CONTACTOS DE EMERGENCIA (grilla editable, al estilo de permisos-archivo)
  // Las celdas de texto se editan con un clic (singleClickEdit); Activo se
  // alterna pulsando la casilla (onCellClicked, como save2Profile); ACCIONES
  // plegable con clic en su cabecera. Se guardan TODOS con el empleado
  // (guardarContactos sincroniza: inserta, actualiza y borra los quitados).
  // ================================================================

  public contactos: ContactoEmergencia[] = [];
  /** Copia de lo cargado, para saber si hay cambios que mandar. */
  private contactosOriginal = '[]';
  public gridApi!: GridApi;
  public columnDefsContactos: any[] = [];
  public accionesPlegadas = false;
  private readonly ANCHO_ACCIONES_ABIERTA = 70;
  private readonly ANCHO_ACCIONES_PLEGADA = 50;
  private claveContacto = 0;
  public parentescos = PARENTESCOS;

  public rowClassRulesContactos = {
    'fila-inactiva': (p: RowClassParams) => p.data?.activo === false,
    'fila-incompleta': (p: RowClassParams) => !!p.data && !this.contactoCompleto(p.data),
  };

  /** Cada fila necesita nombres, parentesco y teléfono para poder guardarse. */
  contactoCompleto(c: ContactoEmergencia): boolean {
    return !!(c.nombres?.trim() && c.parentesco?.trim() && c.telefono?.trim());
  }

  get hayContactosIncompletos(): boolean { return this.contactos.some(c => !this.contactoCompleto(c)); }
  get contactosCambiados(): boolean { return JSON.stringify(this.normalizarContactos()) !== this.contactosOriginal; }

  /** Casilla (misma que permisos): el clic lo gestiona onCellClicked, por eso el input no es interactivo. */
  private checkboxCellRenderer(params: any): string {
    const marcado = params.value === true ? 'checked' : '';
    const soloLectura = this.esView ? 'disabled' : '';
    return `<div class="permiso-check"><input class="form-check-input" type="checkbox" ${marcado} ${soloLectura} /></div>`;
  }

  initializeGridContactos(): void {
    const editable = !this.esView;
    const texto = (field: string, headerName: string, minWidth: number, maxWidth?: number, extra: any = {}) => ({
      field, headerName, minWidth, maxWidth, editable, sortable: false, filter: false,
      cellStyle: { textAlign: 'left' },
      cellClass: (p: any) => (['nombres', 'parentesco', 'telefono'].includes(field) && !String(p.value ?? '').trim()) ? 'celda-obligatoria' : '',
      ...extra,
    });

    this.columnDefsContactos = [
      {
        headerName: '#', field: 'prioridad', headerTooltip: 'Orden en que se debe llamar (1 = primero)',
        minWidth: 60, maxWidth: 60, editable, sortable: false, filter: false,
        cellStyle: { textAlign: 'center', fontWeight: '600' },
        cellEditor: 'agTextCellEditor',
        valueSetter: (p: any) => {
          const n = parseInt(p.newValue, 10);
          if (!n || n < 1) { this._toastr.warning('La prioridad debe ser 1 o mayor', 'Contactos'); return false; }
          p.data.prioridad = n; return true;
        },
      },
      texto('nombres', 'Nombres y apellidos', 200),
      {
        ...texto('parentesco', 'Parentesco', 130, 150),
        cellEditor: 'agSelectCellEditor',
        cellEditorParams: { values: this.parentescos },
      },
      texto('telefono', 'Teléfono', 120, 140),
      texto('telefono_alterno', 'Tel. alterno', 120, 140),
      texto('email', 'Correo', 180),
      {
        headerName: 'Activo', field: 'activo', minWidth: 76, maxWidth: 76, sortable: false, filter: false,
        cellStyle: { textAlign: 'center' },
        cellRenderer: (p: any) => this.checkboxCellRenderer(p),
      },
      {
        headerName: 'ACCIONES', field: 'actions', pinned: 'right',
        minWidth: this.ANCHO_ACCIONES_ABIERTA, maxWidth: this.ANCHO_ACCIONES_ABIERTA,
        suppressMenu: true, sortable: false, filter: false, resizable: false,
        cellStyle: { display: 'flex', justifyContent: 'center', alignItems: 'center' },
        headerComponentParams: { template: this.plantillaCabeceraAcciones(false) },
        cellRenderer: () => this.botonesAccionContacto(),
        hide: this.esView,
      },
    ];
  }

  private plantillaCabeceraAcciones(plegada: boolean): string {
    return plegada
      ? `<div style="display:flex;align-items:center;justify-content:center;" title="Mostrar los botones de acción"><i class="fas fa-bars"></i></div>`
      : `<div style="display:flex;align-items:center;justify-content:center;gap:5px;" title="Ocultar los botones de acción"><span>ACCIONES</span><i class="fas fa-arrow-right"></i></div>`;
  }

  private botonesAccionContacto(): string {
    if (this.accionesPlegadas) {
      return `<button type="button" class="btn btn-sm btn-outline-primary acciones-desplegar" data-accion="desplegar" title="Mostrar los botones de acción"><i class="fas fa-bars"></i></button>`;
    }
    return `<div class="permiso-acciones">
              <button type="button" class="btn-icon btn-subir" data-accion="subir" title="Subir en la prioridad"><i class="fa fa-chevron-up"></i></button>
              <button type="button" class="btn-icon btn-quitar" data-accion="quitar" title="Quitar de la lista"><i class="fa fa-times"></i></button>
            </div>`;
  }

  navegarConTeclado = this._appAgGridService.navegacionConFlechas();

  onGridContactosReady(params: GridReadyEvent): void {
    this.gridApi = params.api;
    this._appAgGridService.ajustarTamanoGrid(this.gridApi);
  }

  toggleActionsColumn(): void {
    const columnDefs = this.gridApi.getColumnDefs() as any[];
    const actionsCol = columnDefs.find(col => col.field === 'actions');
    if (!actionsCol) { return; }
    this.accionesPlegadas = !this.accionesPlegadas;
    const ancho = this.accionesPlegadas ? this.ANCHO_ACCIONES_PLEGADA : this.ANCHO_ACCIONES_ABIERTA;
    actionsCol.minWidth = ancho;
    actionsCol.maxWidth = ancho;
    actionsCol.headerComponentParams = { template: this.plantillaCabeceraAcciones(this.accionesPlegadas) };
    this.gridApi.setColumnDefs(columnDefs);
    this.gridApi.refreshHeader();
    this.gridApi.refreshCells({ force: true, columns: ['actions'] });
  }

  /** Clic en la cabecera de ACCIONES (se mira el target, como en permisos). */
  onHeaderContactosClicked(ev: MouseEvent): void {
    const th = (ev.target as HTMLElement).closest('.ag-header-cell') as HTMLElement | null;
    if (th?.getAttribute('col-id') === 'actions') { this.toggleActionsColumn(); }
  }

  onCellContactoClicked(e: CellClickedEvent): void {
    const c: ContactoEmergencia = e.data;
    const field = e.column.getColId();
    if (!c) { return; }
    if (field === 'actions') {
      const accion = ((e.event?.target as HTMLElement)?.closest('[data-accion]') as HTMLElement)?.dataset['accion'];
      switch (accion) {
        case 'desplegar': this.toggleActionsColumn(); break;
        case 'subir':     this.subirContacto(c); break;
        case 'quitar':    this.quitarContacto(c); break;
      }
      return;
    }
    if (field === 'activo' && !this.esView) {
      c.activo = !c.activo;
      this.refrescarContacto(c);
    }
  }

  onCellContactoChanged(_e: CellValueChangedEvent): void {
    this.refrescarContacto(_e.data);
  }

  private refrescarContacto(c: ContactoEmergencia): void {
    const nodo = this.gridApi?.getRowNode(String((c as any)._clave));
    if (nodo) {
      this.gridApi.refreshCells({ force: true, rowNodes: [nodo] });
      this.gridApi.redrawRows({ rowNodes: [nodo] });
    }
  }

  getRowIdContacto = (p: any) => String(p.data._clave);

  /** Fila nueva al final; entra directamente en edición del nombre. */
  agregarContacto(): void {
    if (this.esView) { return; }
    const nuevo: ContactoEmergencia & { _clave: number } = {
      _clave: ++this.claveContacto, id: null, nombres: '', parentesco: '', telefono: '', telefono_alterno: '', email: '',
      prioridad: this.contactos.length + 1, activo: true,
    };
    this.contactos = [...this.contactos, nuevo];
    this.gridApi?.setRowData(this.contactos);
    setTimeout(() => {
      const idx = this.contactos.length - 1;
      this.gridApi?.ensureIndexVisible(idx);
      this.gridApi?.startEditingCell({ rowIndex: idx, colKey: 'nombres' });
    });
  }

  quitarContacto(c: ContactoEmergencia): void {
    if (this.esView) { return; }
    this.contactos = this.contactos.filter(x => x !== c);
    this.renumerarPrioridad();
    this.gridApi?.setRowData(this.contactos);
  }

  /** Lo mueve un puesto arriba en la prioridad (intercambia con el anterior). */
  subirContacto(c: ContactoEmergencia): void {
    const i = this.contactos.indexOf(c);
    if (i <= 0) { return; }
    [this.contactos[i - 1], this.contactos[i]] = [this.contactos[i], this.contactos[i - 1]];
    this.contactos = [...this.contactos];
    this.renumerarPrioridad();
    this.gridApi?.setRowData(this.contactos);
  }

  private renumerarPrioridad(): void {
    this.contactos.forEach((c, i) => c.prioridad = i + 1);
  }

  /** Lista tal como se manda al back (sin la clave interna, vacíos a null). */
  private normalizarContactos(): any[] {
    return this.contactos.map(c => ({
      id: c.id ?? null,
      nombres: (c.nombres ?? '').trim(),
      parentesco: (c.parentesco ?? '').trim(),
      telefono: (c.telefono ?? '').trim(),
      telefono_alterno: (c.telefono_alterno ?? '').trim() || null,
      email: (c.email ?? '').trim() || null,
      prioridad: c.prioridad || 1,
      activo: c.activo !== false,
    }));
  }

  private cargarContactos(lista: any[]): void {
    // Al clonar se copian sin id: se crean para el empleado nuevo
    this.contactos = (lista ?? []).map((c: any) => ({ ...c, id: this.esClon ? null : c.id, _clave: ++this.claveContacto }));
    this.contactosOriginal = this.esClon ? '[]' : JSON.stringify(this.normalizarContactos());
    this.gridApi?.setRowData(this.contactos);
  }

  // ================================================================
  // DÓNDE MÁS PUEDE MARCAR (rh.empleados_marcacion_sucursal)
  // ================================================================
  //
  // La sucursal de arriba dice dónde trabaja; éstas son las OTRAS donde
  // también se le acepta la marcación. Un cobrador, un jefe de zona o un
  // gerente pasan por varios locales, y con una sola sucursal el perímetro
  // los dejaba fuera de todos menos uno.
  //
  // Se mandan TODAS juntas al guardar y el servidor sincroniza, igual que
  // los contactos de emergencia.

  public sucursalesMarcacion: any[] = [];
  /** Copia de lo cargado, para saber si hay algo que mandar. */
  private sucursalesMarcacionOriginal = '[]';
  public gridApiSucursales!: GridApi;
  public columnDefsSucursales: any[] = [];
  private claveSucursalMarcacion = 0;

  get sucursalesMarcacionCambiadas(): boolean {
    return JSON.stringify(this.normalizarSucursalesMarcacion()) !== this.sucursalesMarcacionOriginal;
  }

  /** La fila de una sucursal que ya no sirve se ve apagada. */
  public rowClassRulesSucursales = {
    'fila-inactiva': (p: any) => p.data?.sucursal_activa === false,
  };

  initializeGridSucursales(): void {
    this.columnDefsSucursales = [
      {
        headerName: 'Código', field: 'codigo', minWidth: 90, maxWidth: 120,
        sortable: false, filter: false,
        cellStyle: { textAlign: 'left', fontWeight: '600' },
      },
      {
        headerName: 'Sucursal', field: 'nombre', minWidth: 180,
        sortable: false, filter: false,
        cellStyle: { textAlign: 'left' },
      },
      {
        // Lo que de verdad decide si allí se controla la ubicación
        headerName: 'Perímetro', field: 'tiene_perimetro', minWidth: 130, maxWidth: 150,
        sortable: false, filter: false,
        cellStyle: { textAlign: 'center' },
        cellRenderer: (p: any) => {
          if (!p.data?.tiene_perimetro) {
            return '<span class="suc-perim suc-perim--no">Sin perímetro</span>';
          }
          const detalle = p.data?.tipo === 'CIRCULO'
            ? `${Math.round(Number(p.data?.radio_metros ?? 0))} m`
            : `${p.data?.num_vertices} esquinas`;
          return `<span class="suc-perim suc-perim--si">${detalle}</span>`;
        },
      },
      {
        headerName: 'Por qué', field: 'observacion', minWidth: 180,
        headerTooltip: 'Para qué se le autorizó: «cobra en esta zona», «cubre los sábados»…',
        editable: !this.esView, sortable: false, filter: false,
        cellStyle: { textAlign: 'left' },
      },
      {
        headerName: 'Activo', field: 'activo', minWidth: 76, maxWidth: 76,
        sortable: false, filter: false,
        cellStyle: { textAlign: 'center' },
        cellRenderer: (p: any) => this.checkboxCellRenderer(p),
      },
      {
        headerName: '', field: 'actions', pinned: 'right',
        minWidth: 50, maxWidth: 50,
        suppressMenu: true, sortable: false, filter: false, resizable: false,
        cellStyle: { display: 'flex', justifyContent: 'center', alignItems: 'center' },
        cellRenderer: () =>
          `<button type="button" class="btn-icon btn-quitar" data-accion="quitar"
                   title="Quitar esta sucursal"><i class="fa fa-times"></i></button>`,
        hide: this.esView,
      },
    ];
  }

  onGridSucursalesReady(params: GridReadyEvent): void {
    this.gridApiSucursales = params.api;
    this._appAgGridService.ajustarTamanoGrid(this.gridApiSucursales);
  }

  getRowIdSucursal = (p: any) => String(p.data._clave);

  onCellSucursalClicked(e: CellClickedEvent): void {
    const fila = e.data;
    if (!fila) { return; }

    const campo = e.column.getColId();
    if (campo === 'actions') {
      const accion = ((e.event?.target as HTMLElement)?.closest('[data-accion]') as HTMLElement)?.dataset['accion'];
      if (accion === 'quitar') { this.quitarSucursalMarcacion(fila); }
      return;
    }
    if (campo === 'activo' && !this.esView) {
      fila.activo = !fila.activo;
      // setData y no refreshCells: en ag-Grid 28 es lo único que repinta
      this.gridApiSucursales?.getRowNode(String(fila._clave))?.setData({ ...fila });
    }
  }

  /**
   * Añade una sucursal con el mismo selector que usa el campo de arriba.
   *
   * No se deja repetir ni añadir la suya: en las dos la marcación ya está
   * permitida y la línea no diría nada nuevo.
   */
  agregarSucursalMarcacion(): void {
    if (this.esView) { return; }

    const modalRef = this.modalService.open(ListSucursalComponent, { size: 'lg', centered: true, backdrop: 'static' });
    modalRef.componentInstance.ayuda = 'Haz clic sobre otra sucursal donde esta persona pueda marcar.';
    modalRef.componentInstance.seleccionado
      .pipe(takeUntil(this.hastaQueCierre(modalRef)))
      .subscribe((sucursal: any) => {
        const principal = Number(this.form.get('sucursal_id')?.value ?? 0);
        if (principal && Number(sucursal.id) === principal) {
          this._toastr.info('Ésa ya es su sucursal: allí puede marcar sin añadirla aquí', 'Sucursales');
          return;
        }
        if (this.sucursalesMarcacion.some(s => Number(s.sucursal_id) === Number(sucursal.id))) {
          this._toastr.info(`«${sucursal.nombre}» ya está en la lista`, 'Sucursales');
          return;
        }

        this.sucursalesMarcacion = [...this.sucursalesMarcacion, {
          _clave: ++this.claveSucursalMarcacion,
          id: null,
          sucursal_id: sucursal.id,
          codigo: sucursal.codigo,
          nombre: sucursal.nombre,
          tipo: sucursal.tipo,
          radio_metros: sucursal.radio_metros,
          num_vertices: sucursal.num_vertices,
          tiene_perimetro: sucursal.tiene_perimetro,
          sucursal_activa: true,
          observacion: '',
          activo: true,
        }];
        this.gridApiSucursales?.setRowData(this.sucursalesMarcacion);
      });
  }

  quitarSucursalMarcacion(fila: any): void {
    if (this.esView) { return; }
    this.sucursalesMarcacion = this.sucursalesMarcacion.filter(s => s !== fila);
    this.gridApiSucursales?.setRowData(this.sucursalesMarcacion);
  }

  private normalizarSucursalesMarcacion(): any[] {
    return this.sucursalesMarcacion.map(s => ({
      id: s.id ?? null,
      sucursal_id: Number(s.sucursal_id),
      observacion: (s.observacion ?? '').trim() || null,
      activo: s.activo !== false,
    }));
  }

  private cargarSucursalesMarcacion(lista: any[]): void {
    // Al clonar se copian sin id: se crean para el empleado nuevo
    this.sucursalesMarcacion = (lista ?? []).map((s: any) => ({
      ...s, id: this.esClon ? null : s.id, _clave: ++this.claveSucursalMarcacion,
    }));
    this.sucursalesMarcacionOriginal = this.esClon ? '[]' : JSON.stringify(this.normalizarSucursalesMarcacion());
    this.gridApiSucursales?.setRowData(this.sucursalesMarcacion);
  }

  private async guardarSucursalesMarcacion(): Promise<void> {
    if (!this.empleadoId) { return; }
    if (!this.sucursalesMarcacionCambiadas) { return; }

    const res: any = await firstValueFrom(
      this._empleadoService.guardarSucursalesMarcacion(this.empleadoId, this.normalizarSucursalesMarcacion()));
    if (res?.status === 'success') {
      this.cargarSucursalesMarcacion(res.data);
    }
  }

  private async guardarContactos(): Promise<void> {
    if (!this.empleadoId) { return; }
    if (!this.contactosCambiados) { return; }
    const res: any = await firstValueFrom(this._empleadoService.guardarContactos(this.empleadoId, this.normalizarContactos()));
    if (res?.status === 'success') {
      this.cargarContactos(res.data);
    }
  }

  // ================================================================
  // CICLO DE VIDA
  // ================================================================

  async ngOnInit(): Promise<void> {
    if (this._seguridadService.isexpired()) {
      this.activeModal.close();
      return;
    }

    this.esView = this.accion === 'view';
    this.esNuevo = this.accion === 'add';
    this.esClon = this.accion === 'clon';
    this.isdisabled = this.esView;
    this.initializeForm();
    this.initializeGridContactos();
    this.initializeGridSucursales();

    switch (this.accion) {
      case 'add':
        this.titulo = 'Nuevo Empleado';
        break;
      case 'edit':
        this.titulo = 'Modificar Empleado';
        this.empleadoId = this.registro_selected.id;
        await this.findByIdEmpleado(this.registro_selected.id);
        break;
      case 'clon':
        this.titulo = 'Clonar Empleado';
        this.textoClon = '_CLON';
        this.esNuevo = true;
        this.empleadoId = this.registro_selected.id;
        await this.findByIdEmpleado(this.registro_selected.id);
        break;
      case 'view':
        this.titulo = 'Ver Empleado';
        this.empleadoId = this.registro_selected.id;
        await this.findByIdEmpleado(this.registro_selected.id);
        break;
    }
  }

  ngOnDestroy(): void {
    this.soltarUrlesDeFotos();
    this.destruido = true;
    this.destroy$.next();
    this.destroy$.complete();
    this.closeCamera();
    this.lectores.forEach(l => l.abort());
    this.lectores.clear();
    this.imagenesEnVuelo.forEach(img => { img.onload = null; img.onerror = null; img.src = ''; });
    this.imagenesEnVuelo.clear();
    document.body.style.overflow = '';
    this.imagen_previzualiza = null;
    this.imagen_paste = null;
    this.imagen_file = null;
  }

  //   ******   INICIALIZA FORMULARIO   ******  //
  initializeForm(): void {
    const d = this.isdisabled;
    this.form = this.fb.group({
      numero_identificacion: [{ value: '', disabled: d }, [Validators.required, Validators.maxLength(20)]],
      tipo_identificacion:   [{ value: 'CC', disabled: d }, [Validators.required]],
      nombres:               [{ value: '', disabled: d }, [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
      apellidos:             [{ value: '', disabled: d }, [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
      email:                 [{ value: '', disabled: d }, [Validators.required, Validators.maxLength(150)]],
      email_personal:        [{ value: '', disabled: d }, [Validators.maxLength(150)]],
      telefono:              [{ value: '', disabled: d }, [Validators.maxLength(20)]],
      celular:               [{ value: '', disabled: d }, [Validators.maxLength(20)]],
      fecha_nacimiento:      [{ value: '', disabled: d }],
      genero:                [{ value: null, disabled: d }],
      direccion:             [{ value: '', disabled: d }, [Validators.maxLength(1000)]],
      cargo_id:              [{ value: null, disabled: d }, [Validators.required]],
      departamento_id:       [{ value: null, disabled: d }, [Validators.required]],
      jefe_id:               [{ value: null, disabled: d }],
      // Dónde trabaja. Vacío = sin sucursal, y entonces puede marcar
      // asistencia desde cualquier lugar.
      sucursal_id:           [{ value: null, disabled: d }],
      fecha_ingreso:         [{ value: this.hoyIso(), disabled: d }, [Validators.required]],
      fecha_salida:          [{ value: '', disabled: d }],
      estado:                [{ value: 'ACTIVO', disabled: d }, [Validators.required]],
      tipo_contrato:         [{ value: 'INDEFINIDO', disabled: d }, [Validators.required]],
      salario:               [{ value: null, disabled: d }, [Validators.min(0), Validators.max(999999999)]],
      activo:                [{ value: true, disabled: d }],
      foto:                  [{ value: '', disabled: true }],
    });
  }

  private hoyIso(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  get ctrlActivo(): FormControl { return this.form.controls['activo'] as FormControl; }

  /** El tipo manda sobre la validación del número: cédula, RUC o pasaporte. */
  get ctrlTipoIdentificacion(): FormControl { return this.form.controls['tipo_identificacion'] as FormControl; }

  /** Nombre para el resumen bajo la foto. */
  get nombreCompleto(): string {
    return `${this.form?.controls['nombres']?.value ?? ''} ${this.form?.controls['apellidos']?.value ?? ''}`.trim();
  }

  /** Emite cuando el modal hijo se cierra o cuando este componente muere. */
  private hastaQueCierre(modalRef: NgbModalRef): Observable<unknown> {
    return merge(this.destroy$, from(modalRef.result).pipe(catchError(() => of(null))));
  }

  // ================================================================
  // CARGO / DEPARTAMENTO / JEFE (como perfil y horario en saveUser)
  // ================================================================

  async cargarCargoPorId() {
    const id = this.form.get('cargo_id')?.value;
    if (!id) { this.cargoNombreControl.setValue(''); return; }
    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._cargoService.findByIdCargo(id));
      if (res?.status === 'success') {
        this.cargoNombreControl.setValue(res.data.nombre);
      } else {
        this.cargoNombreControl.setValue('');
        this.form.patchValue({ cargo_id: null });
        this._toastr.warning('Cargo no encontrado');
      }
    } catch (error) {
      this.form.patchValue({ cargo_id: null });
      this.cargoNombreControl.setValue('');
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  /**
   * Vacía el cargo: el id y el nombre a la vez.
   *
   * El cargo es OBLIGATORIO, así que quitarlo deja el formulario inválido y
   * el campo en rojo hasta que se elija otro. Eso es lo que se quiere: el
   * botón sirve para cambiarlo, y verlo vacío avisa mejor que un id viejo
   * que ya no corresponde.
   */
  limpiarCargo(): void {
    if (this.isdisabled) { return; }
    this.form.patchValue({ cargo_id: null });
    this.cargoNombreControl.setValue('');
  }

  abrirModalCargos() {
    if (this.isdisabled) return;
    const modalRef = this.modalService.open(ListCargosComponent, { size: 'lg', centered: true, backdrop: 'static' });
    modalRef.componentInstance.cargoSeleccionadoId = this.form.get('cargo_id')?.value;
    modalRef.componentInstance.ayuda = 'Haz clic sobre el cargo del empleado.';
    modalRef.componentInstance.seleccionado
      .pipe(takeUntil(this.hastaQueCierre(modalRef)))
      .subscribe((cargo: any) => {
        this.form.patchValue({ cargo_id: cargo.id });
        this.cargoNombreControl.setValue(cargo.nombre);
      });
  }

  async cargarDepartamentoPorId() {
    const id = this.form.get('departamento_id')?.value;
    if (!id) { this.departamentoNombreControl.setValue(''); return; }
    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._departamentoService.findByIdDepartamento(id));
      if (res?.status === 'success') {
        this.departamentoNombreControl.setValue(res.data.nombre);
      } else {
        this.departamentoNombreControl.setValue('');
        this.form.patchValue({ departamento_id: null });
        this._toastr.warning('Departamento no encontrado');
      }
    } catch (error) {
      this.form.patchValue({ departamento_id: null });
      this.departamentoNombreControl.setValue('');
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  /** Vacía el departamento. También es obligatorio (ver limpiarCargo). */
  limpiarDepartamento(): void {
    if (this.isdisabled) { return; }
    this.form.patchValue({ departamento_id: null });
    this.departamentoNombreControl.setValue('');
  }

  abrirModalDepartamentos() {
    if (this.isdisabled) return;
    const modalRef = this.modalService.open(ListDepartamentosComponent, { size: 'lg', centered: true, backdrop: 'static' });
    modalRef.componentInstance.departamentoSeleccionadoId = this.form.get('departamento_id')?.value;
    modalRef.componentInstance.ayuda = 'Haz clic sobre el departamento del empleado.';
    modalRef.componentInstance.seleccionado
      .pipe(takeUntil(this.hastaQueCierre(modalRef)))
      .subscribe((dep: any) => {
        this.form.patchValue({ departamento_id: dep.id });
        this.departamentoNombreControl.setValue(dep.nombre);
      });
  }

  // ================================================================
  // LA SUCURSAL (id + nombre + lupa)
  // ================================================================
  //
  // El mismo trío que el cargo, y que la marca en saveProducto. No es un
  // dato más de la ficha: de él depende DESDE DÓNDE puede marcar asistencia
  // esta persona —sólo dentro del perímetro de su sucursal—, así que al
  // elegirla se dice en qué queda.

  async cargarSucursalPorId(): Promise<void> {
    const id = this.form.get('sucursal_id')?.value;
    if (!id) { this.sucursalNombreControl.setValue(''); return; }

    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._sucursalService.findByIdSucursal(id));

      if (res?.status === 'success' && res.data) {
        this.sucursalNombreControl.setValue(res.data.nombre ?? '');

        // Una sucursal en la papelera no vale: el selector no la ofrece y el
        // servidor la rechaza, así que mejor cortarlo aquí que al guardar.
        if (res.data.deleted_at) {
          this.limpiarSucursal();
          this._toastr.warning('Esa sucursal está en la papelera de reciclaje',
                               'Sucursal no disponible', { timeOut: 4000 });
          return;
        }
        if (res.data.activo === false) {
          this.limpiarSucursal();
          this._toastr.warning(
            `«${res.data.nombre}» está inactiva: actívela desde Sucursales para poder usarla`,
            'Sucursal no disponible', { timeOut: 4000 });
        }
      } else {
        this.limpiarSucursal();
        this._toastr.warning('Sucursal no encontrada');
      }
    } catch (error) {
      console.error('Error al cargar la sucursal:', error);
      this.limpiarSucursal();
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  abrirModalSucursales(): void {
    if (this.isdisabled) { return; }

    const modalRef = this.modalService.open(ListSucursalComponent, { size: 'lg', centered: true, backdrop: 'static' });
    modalRef.componentInstance.sucursalSeleccionadaId = this.form.get('sucursal_id')?.value;
    modalRef.componentInstance.ayuda = 'Haz clic sobre la sucursal donde trabaja. Sólo podrá marcar asistencia dentro de su perímetro.';
    modalRef.componentInstance.seleccionado
      .pipe(takeUntil(this.hastaQueCierre(modalRef)))
      .subscribe((sucursal: any) => {
        this.form.patchValue({ sucursal_id: sucursal.id });
        this.sucursalNombreControl.setValue(sucursal.nombre ?? '');

        // Lo que de verdad cambia al elegirla; una sucursal sin perímetro no
        // controla nada y conviene saberlo antes de guardar.
        this._toastr.info(
          sucursal.tiene_perimetro
            ? `Sólo podrá marcar asistencia dentro del perímetro de «${sucursal.nombre}»`
            : `«${sucursal.nombre}» no tiene perímetro: podrá marcar desde cualquier lugar`,
          'Sucursal', { timeOut: 5000 });
      });
  }

  /** Sin sucursal: se vacían los dos campos a la vez. */
  limpiarSucursal(): void {
    this.form.patchValue({ sucursal_id: null });
    this.sucursalNombreControl.setValue('');
  }

  async cargarJefePorId() {
    const id = this.form.get('jefe_id')?.value;
    if (!id) { this.jefeNombreControl.setValue(''); return; }
    if (this.empleadoId && Number(id) === Number(this.empleadoId) && this.accion !== 'clon') {
      this._toastr.warning('Un empleado no puede ser su propio jefe');
      this.form.patchValue({ jefe_id: null });
      this.jefeNombreControl.setValue('');
      return;
    }
    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._empleadoService.findByIdEmpleado(id));
      if (res?.status === 'success') {
        this.jefeNombreControl.setValue(res.data.nombre_completo);
      } else {
        this.jefeNombreControl.setValue('');
        this.form.patchValue({ jefe_id: null });
        this._toastr.warning('Empleado no encontrado');
      }
    } catch (error) {
      this.form.patchValue({ jefe_id: null });
      this.jefeNombreControl.setValue('');
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  abrirModalJefes() {
    if (this.isdisabled) return;
    const modalRef = this.modalService.open(ListEmpleadosComponent, { size: 'lg', centered: true, backdrop: 'static' });
    modalRef.componentInstance.empleadoSeleccionadoId = this.form.get('jefe_id')?.value;
    modalRef.componentInstance.ayuda = 'Haz clic sobre el jefe directo del empleado.';
    modalRef.componentInstance.seleccionado
      .pipe(takeUntil(this.hastaQueCierre(modalRef)))
      .subscribe((jefe: any) => {
        if (this.empleadoId && jefe.id === this.empleadoId && this.accion !== 'clon') {
          this._toastr.warning('Un empleado no puede ser su propio jefe');
          return;
        }
        this.form.patchValue({ jefe_id: jefe.id });
        this.jefeNombreControl.setValue(jefe.nombre_completo);
      });
  }

  limpiarJefe() {
    if (this.isdisabled) return;
    this.form.patchValue({ jefe_id: null });
    this.jefeNombreControl.setValue('');
  }

  // ================================================================
  // CARGA DEL REGISTRO
  // ================================================================

  private async findByIdEmpleado(id: number) {
    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._empleadoService.findByIdEmpleado(id));

      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo obtener el empleado', 'Error');
        this.imagen_previzualiza = null;
        return;
      }
      this.empleadoModel = res.data;
      const m = this.empleadoModel!;

      this.form.patchValue({
        // Al clonar, identificación y correo son únicos: se dejan vacíos
        numero_identificacion: this.esClon ? '' : m.numero_identificacion,
        tipo_identificacion:   m.tipo_identificacion || 'CC',
        nombres:               m.nombres,
        apellidos:             m.apellidos + (this.esClon ? this.textoClon : ''),
        email:                 this.esClon ? '' : m.email,
        email_personal:        m.email_personal ?? '',
        telefono:              m.telefono ?? '',
        celular:               m.celular ?? '',
        fecha_nacimiento:      m.fecha_nacimiento ?? '',
        genero:                m.genero ?? null,
        direccion:             m.direccion ?? '',
        cargo_id:              m.cargo_id,
        departamento_id:       m.departamento_id,
        jefe_id:               m.jefe_id ?? null,
        sucursal_id:           m.sucursal_id ?? null,
        fecha_ingreso:         m.fecha_ingreso ?? this.hoyIso(),
        fecha_salida:          m.fecha_salida ?? '',
        estado:                m.estado || 'ACTIVO',
        tipo_contrato:         m.tipo_contrato || 'INDEFINIDO',
        salario:               m.salario != null ? Number(m.salario) : null,
        activo:                m.activo !== false,
        foto:                  m.foto ?? '',
      });

      // La dirección que vino del mapa: se enseña bajo el campo y sirve de
      // punto de partida si se vuelve a abrir el mapa
      this.ubicacionGuardada = {
        provincia: m.provincia, canton: m.canton, parroquia: m.parroquia,
        calle_principal: m.calle_principal, calle_secundaria: m.calle_secundaria,
        numeracion: m.numeracion, ubicacion: m.ubicacion,
        codigo_postal: m.codigo_postal, coordenadas: m.coordenadas,
        link_coordenadas: m.link_coordenadas,
        url_foto_mapa: m.url_foto_mapa, url_foto_casa: m.url_foto_casa,
      };
      this.refrescarFotos();

      this.cargoNombreControl.setValue(m.cargo_nombre || '');
      this.departamentoNombreControl.setValue(m.departamento_nombre || '');
      this.jefeNombreControl.setValue(m.jefe_nombre || '');
      this.sucursalNombreControl.setValue(m.sucursal_nombre || '');

      // Contactos de emergencia del empleado
      try {
        const rc: any = await firstValueFrom(this._empleadoService.listContactos(id));
        this.cargarContactos(rc?.status === 'success' ? rc.data : []);
      } catch (e) {
        console.error('Error al cargar contactos:', e);
      }

      // Las otras sucursales donde puede marcar
      try {
        const rs: any = await firstValueFrom(this._empleadoService.listSucursalesMarcacion(id));
        this.cargarSucursalesMarcacion(rs?.status === 'success' ? rs.data : []);
      } catch (e) {
        console.error('Error al cargar las sucursales de marcación:', e);
      }

      if (m.foto) {
        this.imagen_previzualiza = this._empleadoService.getEmpleadoImage(id, true);
        if (this.esClon) {
          await this.convertImageUrlToFile(this._empleadoService.getEmpleadoImage(id, true));
          this.form.patchValue({ foto: null });
        }
        if (!(await this.checkImageExists(this.imagen_previzualiza))) {
          this.imagen_previzualiza = null;
        }
      } else {
        this.imagen_previzualiza = null;
      }
    } catch (error: any) {
      console.error('Error al cargar el empleado:', error);
      this.imagen_previzualiza = null;
      this.activeModal.close();
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  // ================================================================
  // GUARDAR
  // ================================================================

  // ================================================================
  // DIRECCIÓN (la que trae Google Maps)
  // ================================================================

  /** Lo último que devolvió el mapa; se guarda después del empleado. */
  public ubicacion: UbicacionElegida | null = null;

  /** Los campos de la dirección que ya tenía el empleado. */
  public ubicacionGuardada: Partial<EmpleadoModel> = {};

  /**
   * Las miniaturas del cuadro.
   *
   * Recién elegidas son object URL de los blobs que devolvió el mapa; hay que
   * soltarlas a mano o se quedan en memoria hasta recargar la página. Las ya
   * guardadas se piden al servidor por su url.
   */
  private urlesTemporales: string[] = [];

  /**
   * Las direcciones de las miniaturas.
   *
   * Se calculan una sola vez, cuando cambia la ubicación: en un getter se
   * crearía un object URL nuevo en cada ciclo de Angular y acabarían miles
   * colgando en memoria.
   */
  public urlFotoMapa: string | null = null;
  public urlFotoCasa: string | null = null;

  private refrescarFotos(): void {
    this.soltarUrlesDeFotos();
    this.urlFotoMapa = this.urlDeLaFoto('mapa');
    this.urlFotoCasa = this.urlDeLaFoto('casa');
  }

  private urlDeLaFoto(campo: 'mapa' | 'casa'): string | null {
    const blob = campo === 'mapa' ? this.ubicacion?.fotoMapa : this.ubicacion?.fotoCasa;
    if (blob) {
      const url = URL.createObjectURL(blob);
      this.urlesTemporales.push(url);
      return url;
    }

    // Sin nada recién elegido, la que ya tuviera guardada el empleado
    const guardada = campo === 'mapa' ? this.ubicacionGuardada?.url_foto_mapa : this.ubicacionGuardada?.url_foto_casa;
    return guardada && this.empleadoId ? this._empleadoService.getFotoUbicacion(this.empleadoId, campo, true) : null;
  }

  private soltarUrlesDeFotos(): void {
    this.urlesTemporales.forEach(u => { try { URL.revokeObjectURL(u); } catch { /* ya no estaba */ } });
    this.urlesTemporales = [];
  }

  /**
   * Abre las fotos del lugar en el visor, no en otra pestaña.
   *
   * Es el mismo visor del mapa —ampliar, girar, arrastrar—, ahora suelto en
   * components/visorImagenes. Se pasan las dos, así que desde una se llega a
   * la otra con las flechas.
   */
  public verFoto(cual: 'mapa' | 'casa'): void {
    const imagenes: ImagenVisor[] = [];
    if (this.urlFotoMapa) { imagenes.push({ url: this.urlFotoMapa, titulo: 'Vista del mapa', nombre: 'ubicacion-mapa.png' }); }
    if (this.urlFotoCasa) { imagenes.push({ url: this.urlFotoCasa, titulo: 'Vista de la calle', nombre: 'ubicacion-fachada.jpg' }); }
    if (!imagenes.length) { return; }

    const modalRef = this.modalService.open(VisorImagenesComponent, {
      size: 'xl', centered: true, backdrop: true, keyboard: true, windowClass: 'visor-modal',
    });
    modalRef.componentInstance.imagenes = imagenes;
    // Si sólo hay una, el índice que toca es el 0
    modalRef.componentInstance.indice = cual === 'casa' && imagenes.length > 1 ? 1 : 0;
  }

  /** El enlace a Google Maps, venga de donde venga. */
  get enlaceMapa(): string | null {
    return this.ubicacion?.link_coordenadas ?? this.ubicacionGuardada?.link_coordenadas ?? null;
  }

  /** ¿Hay algo que enseñar debajo del campo? */
  get hayUbicacion(): boolean {
    return !!(this.ubicacion || this.ubicacionGuardada?.coordenadas);
  }

  /** Lo que se muestra en el resumen: primero lo recién elegido. */
  get resumenUbicacion(): { ubicacion: string; coordenadas: string; division: string; calles: string } {
    const u = this.ubicacion;
    const g = this.ubicacionGuardada ?? {};
    const division = [
      u ? u.provincia : g.provincia,
      u ? u.canton : g.canton,
      u ? u.parroquia : g.parroquia,
    ].filter(Boolean).join(' · ');

    // Las calles con su numeración: «Los Naranjos 609 y 1º Pasaje 33»
    const principal = u ? u.calle_principal : g.calle_principal;
    const secundaria = u ? u.calle_secundaria : g.calle_secundaria;
    const numero = u ? u.numeracion : g.numeracion;
    const calles = [
      [principal, numero].filter(Boolean).join(' '),
      secundaria,
    ].filter(Boolean).join(' y ');

    return {
      ubicacion:   (u ? u.ubicacion : g.ubicacion) ?? '',
      coordenadas: (u ? u.coordenadas : g.coordenadas) ?? '',
      division,
      calles,
    };
  }

  /**
   * Abre el mapa para elegir la dirección.
   *
   * Si el empleado ya tenía coordenadas, el mapa se abre ahí; si no, en el
   * país. Lo que se elija no se guarda todavía: viaja con el formulario.
   */
  public elegirDireccionEnElMapa(): void {
    if (this.isdisabled) { return; }

    const modalRef = this.modalService.open(SeleccionarUbicacionComponent, {
      size: 'xl', centered: true, backdrop: 'static', keyboard: true, scrollable: true,
    });

    const nombre = [this.form.get('nombres')?.value, this.form.get('apellidos')?.value].filter(Boolean).join(' ');
    modalRef.componentInstance.titulo = nombre ? `Dirección de ${nombre}` : 'Elegir la dirección en el mapa';
    modalRef.componentInstance.lugarInicial = this.coordenadasDeLoGuardado();

    modalRef.result.then((elegida: UbicacionElegida) => {
      if (!elegida) { return; }
      this.ubicacion = elegida;
      this.refrescarFotos();
      // La dirección del formulario se rellena con la de Google
      this.form.get('direccion')?.setValue(elegida.ubicacion ?? '');
      this.form.get('direccion')?.markAsDirty();
      this._toastr.success('Dirección tomada del mapa', 'Dirección', { timeOut: 2500 });
    }, () => { /* lo cerró sin elegir */ });
  }

  /** «-2.170900, -79.922400» → punto del mapa. */
  private coordenadasDeLoGuardado(): { lat: number; lng: number } | null {
    const texto = this.ubicacion?.coordenadas ?? this.ubicacionGuardada?.coordenadas;
    if (!texto) { return null; }
    const [lat, lng] = String(texto).split(',').map((n: string) => parseFloat(n.trim()));
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  }

  /** Quita la dirección del mapa (el texto escrito se queda). */
  public quitarUbicacion(): void {
    if (this.isdisabled) { return; }
    this.ubicacion = {
      provincia: null, canton: null, parroquia: null, calle_principal: null,
      calle_secundaria: null, numeracion: null, ubicacion: null, codigo_postal: null,
      coordenadas: null, link_coordenadas: null, fotoMapa: null, fotoCasa: null,
      lugar: null as any,
    };
    this.ubicacionGuardada = {};
    this.refrescarFotos();
    this._toastr.info('Se quitará al guardar', 'Dirección del mapa', { timeOut: 2500 });
  }

  public abrirEnGoogleMaps(): void {
    const enlace = this.ubicacion?.link_coordenadas ?? this.ubicacionGuardada?.link_coordenadas;
    if (enlace) { window.open(enlace, '_blank', 'noopener,noreferrer'); }
  }

  public async onSubmitForm($ev?: any) {
    $ev?.preventDefault?.();
    this._toastr.clear();
    Object.values(this.form.controls).forEach(control => control.markAsTouched());

    if (!this.form.get('cargo_id')?.value) {
      this._toastr.error('Debe seleccionar un Cargo', 'Error');
      return;
    }
    if (!this.form.get('departamento_id')?.value) {
      this._toastr.error('Debe seleccionar un Departamento', 'Error');
      return;
    }
    if (this.form.invalid) {
      // Sin esto los campos que nunca se tocaron no se ponen en rojo y el aviso
      // manda a 'revisar el formulario' sin decir dónde
      this.form.markAllAsTouched();

      const falloIdentificacion = this.form.controls['numero_identificacion'].getError('identificacion');
      if (falloIdentificacion) {
        this._toastr.error(falloIdentificacion.mensaje, 'Identificación no válida', { timeOut: 20000, closeButton: true });
      } else {
        this._toastr.error('Revise los campos del formulario.', 'No se puede Guardar', { timeOut: 20000, closeButton: true });
      }
      return;
    }
    this.gridApi?.stopEditing();
    if (this.hayContactosIncompletos) {
      this._toastr.error('Cada contacto de emergencia necesita nombres, parentesco y teléfono (o quítelo de la lista).', 'Contactos de emergencia', { timeOut: 8000, closeButton: true });
      return;
    }

    const payload = this.form.getRawValue();
    delete payload.foto;   // la foto va aparte (addImagen)
    payload.salario = (payload.salario === '' || payload.salario === null || payload.salario === undefined) ? null : Number(payload.salario);
    for (const k of ['email_personal', 'telefono', 'celular', 'fecha_nacimiento', 'fecha_salida', 'direccion', 'genero', 'jefe_id', 'sucursal_id']) {
      if (payload[k] === '' || payload[k] === undefined) { payload[k] = null; }
    }
    await this.saveRecord(payload);
  }

  private async saveRecord(data: Partial<EmpleadoModel>) {
    try {
      this._loadingService.setLoading(true);
      this.isdisabled = true;

      if (this.accion === 'edit') {
        this.response = await firstValueFrom(this._empleadoService.editEmpleado(this.registro_selected.id, data));
      } else {
        this.response = await firstValueFrom(
          this.accion === 'clon' ? this._empleadoService.clonEmpleado(data) : this._empleadoService.addEmpleado(data)
        );
      }

      if (this.response?.status !== 'success') {
        this.isdisabled = false;
        return;
      }

      if (this.accion !== 'edit') {
        this.empleadoId = this.response.data.id;
      }

      // 2) La foto, ya con id
      if (this.cambioImagen && this.imagen_file) {
        await this.grabarImagen();
        this.response.data.foto = this.nuevaFoto || this.response.data.foto;
      }

      // 3) La dirección del mapa y sus dos fotos (necesitan el id)
      if (this.ubicacion) {
        try {
          await this.guardarUbicacion();
        } catch (e) {
          console.error('Error al guardar la ubicación:', e);
          this._toastr.warning('El empleado se guardó, pero la dirección del mapa no. Vuelva a abrirlo e inténtelo de nuevo.', 'Dirección', { timeOut: 8000, closeButton: true });
        }
      }

      // 4) Las otras sucursales donde puede marcar (la lista completa)
      try {
        await this.guardarSucursalesMarcacion();
      } catch (e) {
        console.error('Error al guardar las sucursales de marcación:', e);
        this._toastr.warning('El empleado se guardó, pero las otras sucursales donde puede marcar no. Vuelva a abrirlo e inténtelo de nuevo.',
                             'Sucursales', { timeOut: 8000, closeButton: true });
      }

      // 5) Contactos de emergencia (la lista completa; el back sincroniza)
      try {
        await this.guardarContactos();
      } catch (e) {
        // El interceptor ya avisó; el empleado quedó guardado, se informa y se sigue
        console.error('Error al guardar contactos:', e);
        this._toastr.warning('El empleado se guardó, pero los contactos de emergencia no. Vuelva a abrirlo e inténtelo de nuevo.', 'Contactos', { timeOut: 8000, closeButton: true });
      }

      this.registrosE.emit(this.response.data);
      this._toastr.success(this.response.message, 'Éxito', { closeButton: true });
      this.activeModal.close(this.response.data);
    } catch (error: any) {
      // El AuthInterceptor ya notificó el error HTTP (422 / 409 con el motivo)
      console.error('Error al guardar el empleado:', error);
      this.isdisabled = false;
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  /**
   * Guarda los campos de la dirección y sube las dos capturas.
   *
   * Las fotos van después del empleado porque el nombre del archivo lleva su
   * id; si alguna falla, la dirección ya quedó guardada.
   */
  private async guardarUbicacion(): Promise<void> {
    const u = this.ubicacion;
    if (!u || !this.empleadoId) { return; }

    await firstValueFrom(this._empleadoService.guardarUbicacion(this.empleadoId, {
      provincia:        u.provincia,
      canton:           u.canton,
      parroquia:        u.parroquia,
      calle_principal:  u.calle_principal,
      calle_secundaria: u.calle_secundaria,
      numeracion:       u.numeracion,
      ubicacion:        u.ubicacion,
      codigo_postal:    u.codigo_postal,
      coordenadas:      u.coordenadas,
      link_coordenadas: u.link_coordenadas,
    }));

    await this.subirFotoUbicacion('mapa', u.fotoMapa);
    await this.subirFotoUbicacion('casa', u.fotoCasa);
  }

  /** Una captura del mapa; si no hay, no se toca lo que estuviera guardado. */
  private async subirFotoUbicacion(campo: 'mapa' | 'casa', blob: Blob | null): Promise<void> {
    if (!blob || !this.empleadoId) { return; }

    const extension = (blob.type || '').includes('jpeg') ? 'jpg' : 'png';
    const fd = new FormData();
    fd.append('EmpleadoId', String(this.empleadoId));
    fd.append('campo', campo);
    fd.append('imagen_file', blob, `${this.empleadoId}_emp${campo}.${extension}`);

    try {
      await firstValueFrom(this._empleadoService.addFotoUbicacion(fd));
    } catch (e) {
      // Una foto que falla no debe tumbar el guardado de la dirección
      console.error(`No se pudo subir la foto de ${campo}:`, e);
    }
  }

  // ================================================================
  // FOTO (calcado del avatar de saveUser)
  // ================================================================

  async grabarImagen() {
    try {
      if (!this.imagen_file || !this.empleadoId) { return null; }
      const formData = new FormData();
      formData.append('EmpleadoId', this.empleadoId.toString());
      formData.append('imagen_file', this.imagen_file);

      const response = await firstValueFrom(this._empleadoService.addImagen(formData));
      if (response.status === 'success') {
        this.nuevaFoto = response.data.foto;
        return response;
      }
      this._toastr.error('No se pudo subir la foto');
      return null;
    } catch (error: any) {
      console.error('Error al subir la foto:', error);
      return null;
    }
  }

  private leerComoDataUrl(blob: Blob): Promise<string | null> {
    return new Promise((resolve) => {
      if (this.destruido) { resolve(null); return; }
      const lector = new FileReader();
      this.lectores.add(lector);
      const terminar = (valor: string | null) => {
        this.lectores.delete(lector);
        lector.onloadend = null; lector.onerror = null; lector.onabort = null;
        resolve(this.destruido ? null : valor);
      };
      lector.onloadend = () => terminar(typeof lector.result === 'string' ? lector.result : null);
      lector.onerror = () => terminar(null);
      lector.onabort = () => terminar(null);
      lector.readAsDataURL(blob);
    });
  }

  /** Punto único de entrada tras seleccionar / pegar / capturar una imagen. */
  private async mostrarImagenSeleccionada(archivo: File): Promise<boolean> {
    this.imagen_file = archivo;
    this.cambioImagen = true;
    const dataUrl = await this.leerComoDataUrl(archivo);
    if (dataUrl === null) { return false; }
    this.imagen_previzualiza = dataUrl;
    this.prepara_imagen_antes_grabar();
    return true;
  }

  async processFile($event: any) {
    const inputElement: HTMLInputElement = $event.target;
    const archivo: File | undefined = inputElement.files?.[0];
    if (!archivo || archivo.type.indexOf('image') < 0) { inputElement.value = ''; return; }
    this.imagen_paste = null;
    await this.mostrarImagenSeleccionada(archivo);
    inputElement.value = '';
  }

  @HostListener('paste', ['$event'])
  onPaste(event: ClipboardEvent): void {
    if (this.esView) return;
    const items = Array.from(event.clipboardData?.items || []);
    const item = items.find(i => i.type.indexOf('image') !== -1);
    if (!item) { return; }   // texto: que el input lo reciba con normalidad
    event.preventDefault();
    const blob = item.getAsFile();
    if (blob) { this.handleImagePaste(blob); }
  }

  async handleImagePaste(imageBlob: Blob): Promise<void> {
    const file = new File([imageBlob], `pasted-image-${Date.now()}.png`, { type: imageBlob.type });
    const ok = await this.mostrarImagenSeleccionada(file);
    if (ok) { this.imagen_paste = this.imagen_previzualiza; }
  }

  clearImage() {
    this.imagen_previzualiza = null;
    this.imagen_paste = '';
    this.imagen_file = null;
    this.form.get('foto')?.setValue(null);
    this.cambioImagen = false;
  }

  @HostListener('document:dragover', ['$event'])
  onDocumentDragOver(event: DragEvent) {
    if (!this.imagen_previzualiza) { event.preventDefault(); }
  }

  onDragOver(event: DragEvent): void { event.preventDefault(); event.stopPropagation(); this.isDragOver = true; }
  onDragLeave(event: DragEvent): void { event.preventDefault(); event.stopPropagation(); this.isDragOver = false; }

  onDrop(event: DragEvent): void {
    if (this.esView) { return; }
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) { this.handleDroppedFile(files[0]); }
  }

  private async handleDroppedFile(file: File): Promise<void> {
    if (!file.type.match('image.*')) {
      this._toastr.error('El archivo debe ser una imagen', 'Error');
      return;
    }
    this.imagen_paste = null;
    await this.mostrarImagenSeleccionada(file);
  }

  async triggerPaste(): Promise<void> {
    try {
      const clipboardItems = await navigator.clipboard.read();
      for (const clipboardItem of clipboardItems) {
        for (const type of clipboardItem.types) {
          if (type.startsWith('image/')) {
            const blob = await clipboardItem.getType(type);
            this.handleImagePaste(blob);
            return;
          }
        }
      }
      this._toastr.info('No se encontró una imagen en el portapapeles', 'Información', { timeOut: 3000 });
    } catch (error) {
      this._toastr.info('No se pudo acceder al portapapeles, use la opción de galería', 'Información', { timeOut: 4000, closeButton: true });
      this.pasteInput?.nativeElement.focus();
    }
  }

  prepara_imagen_antes_grabar() {
    this.cambioImagen = true;
    if (!this.imagen_file) { return; }
    this.comprimirImagen.comprimirImagen(this.imagen_file)
      .then((compressedFile: File) => { if (!this.destruido) { this.imagen_file = compressedFile; } })
      .catch((error: any) => console.error('Error en comprimir la imagen, se usará la original', error));
  }

  handleImageError(_event: any) { this.imagen_previzualiza = null; }

  private async convertImageUrlToFile(imageUrl: string): Promise<void> {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      if (this.destruido) { return; }
      const file = new File([blob], `cloned_photo_${Date.now()}.png`, { type: blob.type });
      await this.mostrarImagenSeleccionada(file);
    } catch (error) {
      if (this.destruido) { return; }
      this.imagen_previzualiza = null;
    }
  }

  private checkImageExists(url: string, timeoutMs = 8000): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.destruido) { resolve(false); return; }
      const img = new Image();
      let resuelto = false;
      const terminar = (existe: boolean) => {
        if (resuelto) { return; }
        resuelto = true;
        clearTimeout(temporizador);
        this.imagenesEnVuelo.delete(img);
        img.onload = null; img.onerror = null; img.src = '';
        resolve(existe);
      };
      const temporizador = setTimeout(() => terminar(false), timeoutMs);
      this.imagenesEnVuelo.add(img);
      img.onload = () => terminar(true);
      img.onerror = () => terminar(false);
      img.src = url;
    });
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.showCameraModal) { this.closeCamera(); return; }
    if (this.showFullscreenImage) { this.closeFullscreen(); }
  }

  openFullscreen(): void {
    if (this.imagen_previzualiza) {
      this.showFullscreenImage = true;
      document.body.style.overflow = 'hidden';
    }
  }

  closeFullscreen(): void {
    this.showFullscreenImage = false;
    document.body.style.overflow = '';
  }

  openGallery(): void {
    if (this.esView) return;
    this.galleryInput?.nativeElement.click();
  }

  async openCamera(): Promise<void> {
    if (this.esView) return;
    this.showCameraModal = true;
    this.cameraError = '';
    this.isUsingFrontCamera = true;
    try {
      await this.startCamera('user');
    } catch (error: any) {
      this.cameraError = 'No se pudo acceder a la cámara. Asegúrate de dar los permisos necesarios.';
      this._toastr.error(this.cameraError);
      this.closeCamera();
    }
  }

  async startCamera(facingMode: 'user' | 'environment'): Promise<void> {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    if (this.destruido || !this.showCameraModal) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
      return;
    }
    this.isUsingFrontCamera = facingMode === 'user';
    if (this.videoCamara) { this.videoCamara.srcObject = this.mediaStream; }
  }

  async switchCamera(): Promise<void> {
    try {
      await this.startCamera(this.isUsingFrontCamera ? 'environment' : 'user');
    } catch (error: any) {
      this.cameraError = 'No se pudo cambiar a la otra cámara.';
      this._toastr.error(this.cameraError);
    }
  }

  capturePhoto(): void {
    const videoElement = this.videoCamara;
    if (!videoElement) return;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return;
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    if (this.isUsingFrontCamera) { context.translate(canvas.width, 0); context.scale(-1, 1); }
    context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    if (this.isUsingFrontCamera) { context.setTransform(1, 0, 0, 1, 0, 0); }
    canvas.toBlob(async (blob) => {
      if (!blob || this.destruido) { return; }
      const file = new File([blob], `camera-capture-${Date.now()}.jpg`, { type: 'image/jpeg' });
      this.imagen_paste = null;
      const ok = await this.mostrarImagenSeleccionada(file);
      if (!ok) { return; }
      this.closeCamera();
      this._toastr.success('Foto capturada correctamente');
    }, 'image/jpeg', 0.8);
  }

  closeCamera(): void {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    if (this.videoCamara) { this.videoCamara.srcObject = null; }
    this.showCameraModal = false;
    this.cameraError = '';
  }
}
