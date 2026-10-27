import {
  AfterViewInit, Component, ElementRef, EventEmitter, HostListener,
  Input, OnDestroy, OnInit, Output, inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { Subject, firstValueFrom } from 'rxjs';
import { AgGridModule } from 'ag-grid-angular';
import { CellValueChangedEvent, GridApi, GridReadyEvent, CellKeyDownEvent } from 'ag-grid-community';

import { PanelModule } from '../../../../../components/panel/panel.module';
import { ModalHeaderComponent } from '../../../../../components/modal/modal-header/modal-header.component';
import { ModalFooterComponent } from '../../../../../components/modal/modal-footer/modal-footer.component';
import { ModalArrastrableDirective } from '../../../../../components/modal/modal-arrastrable.directive';
import { ComboComponent } from '../../../../../components/campos/combo/combo.component';
import { CampoTextoComponent } from '../../../../../components/campos/campoTexto/campoTexto.component';
import { CampoTextoAreaComponent } from '../../../../../components/campos/campoTextoArea/campoTextoArea.component';
import { CampoNumeroEnteroComponent } from '../../../../../components/campos/campoNumeroEntero/campoNumeroEntero.component';

import { SeguridadService } from '../../../../seguridad/services/seguridad.service';
import { LoadingService } from '../../../../../service/loading.service';
import { AppAgGridService } from '../../../../../service/app-agGrid.service';
import { ProformaService } from '../../../services/proforma.service';
import { SucursalService } from '../../../../core/services/sucursal.service';
import { ListClientesComponent } from '../../clientes/listClientes/listClientes.component';
import { ListProductosComponent } from '../listProductos/listProductos.component';

import { FORMAS_PAGO } from '../../../interfaces/clienteModel';
import {
  CondicionesDeCliente, LineaProformaModel, ProformaModel,
  calcularLinea, calcularTotales, claseEstado, etiquetaEstado,
} from '../../../interfaces/proformaModel';

/** Con qué se abre el modal desde allProformas. */
type AccionProforma = 'add' | 'edit' | 'clon' | 'view';

/**
 * La proforma: cabecera y líneas (ventas.proformas).
 *
 * LA REJILLA SE ESCRIBE, no se rellena con un formulario aparte. Se teclea el
 * código en la celda y la línea se completa sola con la descripción, la
 * unidad, el precio y el IVA del catálogo; si el código no existe se abre el
 * listado de productos con lo escrito ya buscado. Para lo que no está en el
 * catálogo —un servicio, un flete— se escribe la descripción a mano y se pone
 * el precio: eso es una línea válida y el producto queda vacío a propósito.
 *
 * Siempre hay una ÚLTIMA FILA EN BLANCO esperando un código. Así cotizar diez
 * cosas son diez códigos y diez cantidades, sin pulsar «añadir» entre medias.
 * Esa fila no cuenta para nada mientras no se escriba en ella.
 *
 * LOS IMPORTES SE CALCULAN DOS VECES, y es a propósito: aquí para que el
 * usuario vea el total mientras escribe, y en la base al guardar, que es la
 * que manda. Las dos cuentas hacen lo mismo en el mismo orden
 * (calcularLinea ↔ ventas.fn_proformas_linea_calcular); si un día dejan de
 * coincidir, lo que se guarda sigue estando bien y lo que estaría mal es lo
 * que se vio, que es el lado barato de equivocarse.
 */
@Component({
  selector: 'app-saveProforma',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, AgGridModule, PanelModule,
    ModalHeaderComponent, ModalFooterComponent, ModalArrastrableDirective,
    ComboComponent, CampoTextoComponent, CampoTextoAreaComponent, CampoNumeroEnteroComponent,
  ],
  templateUrl: './saveProforma.component.html',
  styleUrls: ['./saveProforma.component.css'],
})
export class SaveProformaComponent implements OnInit, AfterViewInit, OnDestroy {

  /** La proforma a abrir, o 0 al crear. */
  @Input() registro_selected: any = 0;
  @Input() accion: AccionProforma = 'add';
  /** Si llega, la nueva proforma arranca con este cliente ya puesto. */
  @Input() clienteInicial: number | null = null;
  @Output() registrosE: EventEmitter<any> = new EventEmitter();

  public readonly _appAgGridService = inject(AppAgGridService);

  public form: FormGroup;
  public isLoading$ = this._loadingService.isLoading$;
  public titulo = '';
  public guardando = false;

  /** La proforma tal como la tiene el servidor (null al crear). */
  public proforma: ProformaModel | null = null;

  /** El cliente elegido y con qué condiciones se le vende. */
  public cliente: CondicionesDeCliente['cliente'] | null = null;
  public avisosCliente: string[] = [];

  /**
   * EL SELECTOR DE CLIENTE, como el del cargo en la ficha del empleado: un
   * campo que se escribe, el nombre al lado bloqueado y una lupa.
   *
   * La diferencia es por dónde se busca. Ahí se teclea el ID; aquí la CÉDULA
   * O EL RUC, que es lo que el vendedor tiene delante —en un documento de
   * venta nadie se sabe el número interno del cliente—. Lo que se guarda en
   * la proforma sigue siendo `cliente_id`; esto es sólo la puerta de entrada.
   */
  public identificacionControl = new FormControl('');
  /** El nombre: se ve, no se escribe. Lo pone la búsqueda. */
  public clienteNombreControl = new FormControl({ value: '', disabled: true });
  /** De dónde salió cada condición propuesta, para poder decirlo. */
  public origenCondiciones: Record<string, string | null> = {};

  /** Las líneas de la rejilla, con la fila en blanco del final incluida. */
  public lineas: LineaProformaModel[] = [];

  public gridApi!: GridApi;
  public columnDefs: any[] = [];

  /**
   * Lo común a todas las columnas de la rejilla.
   *
   * `singleClickEdit`: un clic y ya se escribe. Son líneas de un documento,
   * no una tabla que se consulta; pedir doble clic en cada celda cansa a la
   * tercera línea.
   *
   * Sin menú de columna ni orden: el ORDEN DE LAS LÍNEAS ES EL DEL
   * DOCUMENTO. Si se pudiera ordenar por total, lo que se guarda dejaría de
   * ser lo que se ve.
   */
  public readonly defaultColDef = {
    editable: false,
    singleClickEdit: true,
    resizable: true,
    sortable: false,
    suppressMenu: true,
    suppressMovable: true,
  };

  /** `[items]` de los combos: campos, NO getters (un array nuevo en cada
   *  ciclo de pintado le borra la selección a ng-select). */
  public formasPago = FORMAS_PAGO;
  public sucursales: Array<{ id: number; name: string }> = [];

  public readonly etiquetaEstado = etiquetaEstado;
  public readonly claseEstado = claseEstado;

  // ================================================================
  // EL REPARTO DE LAS DOS COLUMNAS
  // ================================================================
  //
  // El divisor es el mismo del administrador de archivos: pointer events con
  // captura, para que siga recibiendo el movimiento aunque el cursor se salga
  // de él o de la ventana. El ancho se recuerda por navegador: quien prefiera
  // la rejilla grande no tiene que volver a arrastrar cada vez que abre una
  // proforma.

  /** Ancho por omisión de la columna izquierda, en px. */
  readonly ANCHO_IZQ_DEFECTO = 430;
  private readonly ANCHO_IZQ_MIN = 320;
  private readonly ANCHO_IZQ_MAX = 760;
  private readonly CLAVE_ANCHO_IZQ = 'miCRM3.proformas.anchoIzquierda';

  public anchoIzquierda = this.leerAnchoIzquierda();
  /** true mientras se arrastra (quita transiciones y selección de texto). */
  public redimensionando = false;

  @HostListener('window:resize')
  onResize(): void { this.ajustarAltoRejilla(); }

  private readonly destroy$ = new Subject<void>();

  constructor(
    private host: ElementRef<HTMLElement>,
    private fb: FormBuilder,
    public modal: NgbActiveModal,
    private otroModal: NgbModal,
    private _toastr: ToastrService,
    private _loadingService: LoadingService,
    private _seguridadService: SeguridadService,
    private _proformaService: ProformaService,
    private _sucursalService: SucursalService,
  ) {
    this.form = this.fb.group({
      cliente_id:           [null, [Validators.required]],
      fecha:                [this.hoy(), [Validators.required]],
      validez_dias:         [15, [Validators.required]],
      forma_pago:           [null],
      dias_credito:         [''],
      descuento_porcentaje: [0],
      sucursal_id:          [null],
      observaciones:        [''],
      condiciones:          ['Precios sujetos a cambio sin previo aviso. Valores en dólares de los Estados Unidos de América.'],
    });
  }

  // ================================================================
  // ESTADO DERIVADO
  // ================================================================

  get esView(): boolean { return this.accion === 'view'; }
  get esNuevo(): boolean { return this.accion === 'add' || this.accion === 'clon'; }

  /** Las líneas de verdad: sin la fila en blanco del final. */
  get lineasReales(): LineaProformaModel[] {
    return this.lineas.filter(l => !l._vacia);
  }

  /** Los totales de lo que hay ahora mismo en la rejilla. */
  get totales() {
    return calcularTotales(this.lineas);
  }

  /** Hasta cuándo vale, calculado como lo hace la base (fecha + validez). */
  get fechaVence(): string {
    const f = String(this.form.get('fecha')?.value ?? '');
    const d = Number(this.form.get('validez_dias')?.value ?? 0);
    if (!f) { return ''; }
    const fin = new Date(f + 'T00:00:00');
    fin.setDate(fin.getDate() + (isNaN(d) ? 0 : d));
    return fin.toISOString().slice(0, 10);
  }

  private hoy(): string {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  // ================================================================
  // CICLO DE VIDA
  // ================================================================

  async ngOnInit(): Promise<void> {
    if (this._seguridadService.isexpired()) { this.modal.close(); return; }

    this.titulo = this.accion === 'add'  ? 'Nueva proforma'
                : this.accion === 'clon' ? 'Copiar proforma'
                : this.accion === 'view' ? 'Proforma'
                : 'Modificar proforma';

    this.armarColumnas();
    this.cargarSucursales();

    if (this.accion === 'add') {
      this.lineas = [this.filaEnBlanco()];
      if (this.clienteInicial) { await this.elegirCliente(this.clienteInicial); }
      return;
    }

    await this.cargar(Number(this.registro_selected?.id ?? this.registro_selected));
  }

  ngAfterViewInit(): void {
    // El modal todavía se está colocando: se mide en el turno siguiente, que
    // es cuando la rejilla ya está donde va a quedarse
    setTimeout(() => this.ajustarAltoRejilla(), 0);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ================================================================
  // EL DIVISOR
  // ================================================================

  /**
   * Arrastre del divisor entre las dos columnas.
   *
   * Pointer events CON CAPTURA: el propio divisor recibe los movimientos
   * aunque el cursor se salga de él —o de la ventana— y suelta solo al
   * levantar el botón. Es el mismo mecanismo del administrador de archivos.
   */
  iniciarRedimension(ev: PointerEvent): void {
    if (ev.button !== 0) { return; }
    ev.preventDefault();

    const divisor = ev.currentTarget as HTMLElement;
    const xInicial = ev.clientX;
    const anchoInicial = this.anchoIzquierda;
    this.redimensionando = true;
    divisor.setPointerCapture(ev.pointerId);

    const mover = (e: PointerEvent) => {
      const nuevo = anchoInicial + (e.clientX - xInicial);
      this.anchoIzquierda = Math.min(this.ANCHO_IZQ_MAX, Math.max(this.ANCHO_IZQ_MIN, Math.round(nuevo)));
      // La rejilla reparte sus columnas con el ancho que le quede, pero en el
      // CUADRO SIGUIENTE: ahora mismo Angular todavía no ha aplicado el ancho
      // nuevo y mediría el de antes, dejando las columnas pasadas de ancho
      // —y la rejilla con desplazamiento horizontal— al soltar.
      requestAnimationFrame(() => this.gridApi?.sizeColumnsToFit());
    };
    const soltar = (e: PointerEvent) => {
      divisor.removeEventListener('pointermove', mover);
      divisor.removeEventListener('pointerup', soltar);
      divisor.removeEventListener('pointercancel', soltar);
      divisor.releasePointerCapture(e.pointerId);
      this.redimensionando = false;
      this.guardarAnchoIzquierda();
    };

    divisor.addEventListener('pointermove', mover);
    divisor.addEventListener('pointerup', soltar);
    divisor.addEventListener('pointercancel', soltar);
  }

  guardarAnchoIzquierda(): void {
    try { localStorage.setItem(this.CLAVE_ANCHO_IZQ, String(this.anchoIzquierda)); } catch { /* sin storage */ }
  }

  private leerAnchoIzquierda(): number {
    try {
      const v = Number(localStorage.getItem(this.CLAVE_ANCHO_IZQ));
      if (v >= this.ANCHO_IZQ_MIN && v <= this.ANCHO_IZQ_MAX) { return v; }
    } catch { /* sin storage */ }
    return this.ANCHO_IZQ_DEFECTO;
  }

  /**
   * La rejilla llega hasta el pie del modal.
   *
   * Se mide en lugar de ponerle un alto fijo porque el modal cambia de alto
   * con la ventana, y una rejilla de 290px dejaba medio hueco en blanco en
   * una pantalla grande y no cabía en un portátil.
   */
  ajustarAltoRejilla(): void {
    // En el CUADRO SIGUIENTE: cuando esto se llama tras cambiar el reparto de
    // las columnas (el doble clic del divisor), Angular todavía no ha
    // aplicado el ancho nuevo y se mediría el de antes.
    requestAnimationFrame(() => {
      const grilla = this.host.nativeElement.querySelector('.pf-grilla') as HTMLElement | null;
      if (!grilla) { return; }

      const ALTO_PIE = 86;          // el pie del modal, con sus botones
      const MARGEN = 18;
      const alto = window.innerHeight - grilla.getBoundingClientRect().top - ALTO_PIE - MARGEN;
      grilla.style.height = Math.max(220, Math.round(alto)) + 'px';
      this.gridApi?.sizeColumnsToFit();
    });
  }

  /** Trae el documento completo del servidor. */
  private async cargar(id: number): Promise<void> {
    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._proformaService.findByIdProforma(id));
      if (res?.status !== 'success' || !res?.data) {
        this._toastr.error(res?.message || 'No se pudo abrir la proforma', 'Error');
        this.modal.close();
        return;
      }

      const p: ProformaModel = res.data;
      this.proforma = p;

      this.form.patchValue({
        cliente_id:           p.cliente_id,
        fecha:                this.accion === 'clon' ? this.hoy() : p.fecha,
        validez_dias:         p.validez_dias,
        forma_pago:           p.forma_pago,
        dias_credito:         p.dias_credito ?? '',
        descuento_porcentaje: p.descuento_porcentaje ?? 0,
        sucursal_id:          p.sucursal_id,
        observaciones:        p.observaciones ?? '',
        condiciones:          p.condiciones ?? '',
      });

      // La foto que lleva el documento: se enseña sin volver a preguntar por
      // el cliente, que es lo que se le ofertó ese día. Al clonar sí se
      // vuelve a preguntar, porque la copia es un documento nuevo.
      this.cliente = {
        id: p.cliente_id,
        identificacion: p.cliente_identificacion ?? null,
        tipo_identificacion: null,
        nombre: p.cliente_nombre ?? null,
        direccion: p.cliente_direccion ?? null,
        telefono: p.cliente_telefono ?? null,
        email: p.cliente_email ?? null,
        estado: null,
        activo: true,
        vendedor_usuario_id: p.vendedor_usuario_id ?? null,
        vendedor_nombre: p.vendedor_nombre ?? null,
        grupo_cliente_id: p.grupo_cliente_id ?? null,
        grupo_nombre: p.grupo_nombre ?? null,
      };
      // Los dos campos del selector, con la foto que lleva el documento
      this.identificacionControl.setValue(p.cliente_identificacion ?? '');
      this.clienteNombreControl.setValue(p.cliente_nombre ?? '');

      if (this.accion === 'clon') { await this.elegirCliente(p.cliente_id); }

      this.lineas = (p.detalle ?? []).map(l => ({ ...l }));
      if (!this.esView) { this.lineas.push(this.filaEnBlanco()); }
      this.gridApi?.setRowData(this.lineas);

      if (this.esView) {
        this.form.disable({ emitEvent: false });
        // El campo de la identificación no está en el FormGroup, así que
        // hay que apagarlo aparte
        this.identificacionControl.disable({ emitEvent: false });
      }

    } catch (e) {
      // El AuthInterceptor ya enseñó el error HTTP
      console.error('Error al abrir la proforma:', e);
      this.modal.close();
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  private async cargarSucursales(): Promise<void> {
    try {
      const res: any = await firstValueFrom(this._sucursalService.listSucursales(true));
      const filas = res?.data ?? [];
      this.sucursales = filas.map((s: any) => ({ id: s.id, name: s.nombre ?? s.name }));
    } catch {
      // Sin sucursales el campo se queda vacío: no es obligatorio
      this.sucursales = [];
    }
  }

  // ================================================================
  // EL CLIENTE
  // ================================================================

  /** La lupa: el selector de clientes de siempre. */
  abrirModalClientes(): void {
    if (this.esView) { return; }
    const ref = this.otroModal.open(ListClientesComponent, {
      centered: true, size: 'xl', backdrop: 'static', keyboard: true,
    });
    ref.componentInstance.clienteSeleccionadoId = this.form.get('cliente_id')?.value ?? undefined;
    ref.componentInstance.soloActivos = false;   // se puede cotizar a uno inactivo, pero se avisa
    ref.componentInstance.ayuda = 'Haz clic sobre el cliente de la proforma.';
    ref.componentInstance.seleccionado.subscribe((c: any) => {
      if (c?.id) { this.elegirCliente(c.id); }
    });
  }

  /**
   * Se salió del campo de la identificación, o se pulsó Enter en él.
   *
   * Es el camino rápido: con la cédula delante se teclea y ya está, sin abrir
   * el listado. Que no haya ningún cliente con esa identificación NO es un
   * error —está mal tecleada, o todavía no está dado de alta—, así que se
   * avisa en amarillo y se deja lo escrito para corregirlo.
   */
  async buscarClientePorIdentificacion(): Promise<void> {
    if (this.esView) { return; }
    const texto = String(this.identificacionControl.value ?? '').trim();

    // Borrarla es quitar el cliente: no puede quedarse uno puesto con el
    // campo por el que se eligió vacío
    if (!texto) { this.limpiarCliente(); return; }
    // Si es la que ya está puesta, no se vuelve a preguntar
    if (this.cliente && texto === String(this.cliente.identificacion ?? '')) { return; }

    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._proformaService.clientePorIdentificacion(texto));

      if (res?.status !== 'success' || !res?.data?.encontrado) {
        this._toastr.warning(res?.data?.mensaje ?? 'No hay ningún cliente con esa identificación',
                             'Cliente no encontrado', { timeOut: 6000, closeButton: true });
        this.olvidarCliente();
        return;
      }

      this.ponerCliente(res.data);

    } catch (e) {
      // El AuthInterceptor ya enseñó el error HTTP
      console.error('Error al buscar el cliente por su identificación:', e);
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  /**
   * Quita el cliente: la identificación, el nombre y el id a la vez.
   *
   * El cliente es OBLIGATORIO, así que quitarlo deja el formulario sin poder
   * guardarse hasta que se elija otro. Eso es lo que se quiere: el botón
   * sirve para cambiarlo, y verlo vacío avisa mejor que una cédula vieja que
   * ya no corresponde.
   */
  limpiarCliente(): void {
    if (this.esView) { return; }
    this.identificacionControl.setValue('');
    this.olvidarCliente();
  }

  /** Olvida al cliente sin tocar lo que haya escrito el usuario. */
  private olvidarCliente(): void {
    this.form.patchValue({ cliente_id: null });
    this.clienteNombreControl.setValue('');
    this.cliente = null;
    this.avisosCliente = [];
    this.origenCondiciones = {};
  }

  /**
   * Pone el cliente por su id (lo que devuelve la lupa).
   *
   * Las condiciones se piden al servidor en lugar de copiarlas de la fila de
   * la rejilla porque hay herencia: lo que no tenga puesto el cliente lo pone
   * su grupo, y eso se resuelve subiendo por el árbol de grupos.
   */
  async elegirCliente(clienteId: number): Promise<void> {
    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._proformaService.condicionesCliente(clienteId));
      if (res?.status !== 'success' || !res?.data) {
        this._toastr.error(res?.message || 'No se pudo leer el cliente', 'Error');
        return;
      }
      this.ponerCliente(res.data);

    } catch (e) {
      console.error('Error al leer las condiciones del cliente:', e);
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  /**
   * Vuelca el cliente en la ficha y PROPONE sus condiciones.
   *
   * Da igual si se llegó por la lupa o tecleando la cédula: las dos acaban
   * aquí con el mismo contenido, así que la pantalla no tiene dos maneras de
   * quedar puesta.
   */
  private ponerCliente(d: CondicionesDeCliente): void {
    this.cliente = d.cliente;
    this.avisosCliente = d.avisos ?? [];

    this.identificacionControl.setValue(d.cliente.identificacion ?? '');
    this.clienteNombreControl.setValue(d.cliente.nombre ?? '');

    const c = d.condiciones;
    this.form.patchValue({
      cliente_id:           d.cliente.id,
      forma_pago:           c.forma_pago?.valor ?? null,
      dias_credito:         c.dias_credito?.valor ?? '',
      descuento_porcentaje: Number(c.descuento?.valor ?? 0),
    });

    // De dónde salió cada condición. Se dice con el nombre del grupo y no con
    // la etiqueta que manda el servidor —«Propios», «Heredado de X»—, que
    // está escrita para la pantalla de grupos: ahí se mira desde el grupo, y
    // aquí se mira desde el cliente, donde «Propios» no significa nada.
    const delGrupo = d.cliente.grupo_nombre
      ? `Lo pone su grupo (${d.cliente.grupo_nombre})`
      : 'Lo pone su grupo';

    this.origenCondiciones = {
      forma_pago:   c.forma_pago?.origen   === 'grupo' ? delGrupo : null,
      dias_credito: c.dias_credito?.origen === 'grupo' ? delGrupo : null,
      descuento:    c.descuento?.origen    === 'grupo' ? delGrupo : null,
    };

    // El descuento propuesto baja a las líneas. Si no, cambiar de cliente
    // dejaría los precios del anterior.
    this.aplicarDescuentoGeneral();

    for (const aviso of this.avisosCliente) {
      this._toastr.warning(aviso, 'Atención', { timeOut: 7000, closeButton: true });
    }
  }

  // ================================================================
  // LA REJILLA
  // ================================================================

  /** La fila en blanco del final: la que espera un código. */
  private filaEnBlanco(): LineaProformaModel {
    return {
      producto_id: null, codigo: '', descripcion: '', unidad: '',
      cantidad: 1, precio_unitario: 0,
      descuento_porcentaje: Number(this.form?.get('descuento_porcentaje')?.value ?? 0),
      iva_porcentaje: 0, observacion: '', _vacia: true,
    };
  }

  /** Un número escrito a mano: admite coma decimal, que es como se teclea aquí. */
  private aNumero(v: any, siNo: number = 0): number {
    if (v === null || v === undefined || v === '') { return siNo; }
    const n = Number(String(v).replace(/\s/g, '').replace(',', '.'));
    return isNaN(n) ? siNo : n;
  }

  private armarColumnas(): void {
    const editable = !this.esView;
    const numero = (campo: keyof LineaProformaModel, minimo = 0, maximo = Number.MAX_SAFE_INTEGER) => ({
      valueParser: (p: any) => {
        const n = this.aNumero(p.newValue, this.aNumero(p.oldValue));
        return Math.min(Math.max(n, minimo), maximo);
      },
    });

    this.columnDefs = [
      {
        headerName: '#', valueGetter: (p: any) => p.node?.rowIndex != null ? p.node.rowIndex + 1 : '',
        width: 40, minWidth: 40, maxWidth: 40, editable: false, sortable: false, resizable: false,
        cellStyle: { textAlign: 'center', color: 'var(--bs-secondary-color, #888)' },
      },
      {
        headerName: 'Código', field: 'codigo',
        headerTooltip: 'Escribe el código y pulsa Enter: la línea se completa sola',
        minWidth: 95, maxWidth: 150, editable,
        cellClass: 'celda-codigo',
      },
      {
        headerName: 'Descripción', field: 'descripcion',
        minWidth: 170, flex: 2, editable,
        cellRenderer: (p: any) => {
          if (p.data?._vacia) {
            return '<span class="linea-vacia">escribe un código o busca el producto…</span>';
          }
          // Lo que no sale del catálogo se marca: es una línea escrita a mano
          const libre = !p.data?.producto_id
            ? ' <i class="fa-solid fa-pen-nib linea-libre" title="Escrito a mano: no es un producto del catálogo"></i>'
            : '';
          return (p.value ?? '') + libre;
        },
      },
      {
        headerName: 'Unidad', field: 'unidad',
        minWidth: 62, maxWidth: 100, editable,
        cellStyle: { textAlign: 'center' },
      },
      {
        headerName: 'Cantidad', field: 'cantidad',
        type: 'numericColumn', minWidth: 80, maxWidth: 110, editable,
        ...numero('cantidad', 0),
        valueFormatter: (p: any) => this.numero(p.value, 2),
      },
      {
        headerName: 'P. unitario', field: 'precio_unitario',
        type: 'numericColumn', minWidth: 95, maxWidth: 130, editable,
        ...numero('precio_unitario', 0),
        valueFormatter: (p: any) => this.numero(p.value, 2),
      },
      {
        headerName: 'Dcto. %', field: 'descuento_porcentaje',
        headerTooltip: 'Descuento de esta línea. Lo propone el del cliente, y se puede cambiar',
        type: 'numericColumn', minWidth: 66, maxWidth: 100, editable,
        ...numero('descuento_porcentaje', 0, 100),
        valueFormatter: (p: any) => this.numero(p.value, 2),
      },
      {
        headerName: 'IVA %', field: 'iva_porcentaje',
        headerTooltip: 'Lo trae el producto. Se puede cambiar (0 para exento)',
        type: 'numericColumn', minWidth: 64, maxWidth: 95, editable,
        ...numero('iva_porcentaje', 0, 100),
        valueFormatter: (p: any) => this.numero(p.value, 2),
      },
      {
        // EL TOTAL DE LA LÍNEA, y no el descuento y el IVA en dinero por
        // separado: con esas dos columnas más, el total —que es lo único que
        // se mira al revisar una línea— se salía del ancho y había que
        // desplazar la rejilla para verlo. El desglose en dinero está abajo,
        // en los totales, que es donde se necesita.
        headerName: 'Total', field: 'total',
        headerTooltip: 'Cantidad × precio, menos el descuento, más el IVA',
        type: 'numericColumn', minWidth: 105, maxWidth: 150, editable: false,
        valueGetter: (p: any) => p.data?._vacia ? null : calcularLinea(p.data).total,
        valueFormatter: (p: any) => p.value == null ? '' : this.numero(p.value, 2),
        cellStyle: { fontWeight: '600' },
      },
      {
        headerName: '', field: 'acciones',
        width: 64, minWidth: 64, maxWidth: 64,
        editable: false, sortable: false, resizable: false, pinned: 'right',
        cellStyle: { textAlign: 'center' },
        cellRenderer: (p: any) => {
          if (this.esView) { return ''; }
          const buscar = `<button type="button" class="btn-celda" data-accion="buscar"
                                  title="Buscar el producto en el listado"><i class="fa fa-search"></i></button>`;
          const quitar = p.data?._vacia ? '' :
            `<button type="button" class="btn-celda btn-celda--peligro" data-accion="quitar"
                     title="Quitar esta línea"><i class="fa fa-trash"></i></button>`;
          return `<span class="celda-acciones">${buscar}${quitar}</span>`;
        },
      },
    ];
  }

  /** Dos decimales con coma, como se leen aquí los importes. */
  numero(v: any, dec = 2): string {
    if (v === null || v === undefined || v === '') { return ''; }
    const n = Number(v);
    if (isNaN(n)) { return String(v); }
    return n.toLocaleString('es-EC', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }

  onGridReady(e: GridReadyEvent): void {
    this.gridApi = e.api;
    this.gridApi.setRowData(this.lineas);
    this.ajustarAltoRejilla();
  }

  /**
   * Se escribió en una celda.
   *
   * El código es el único campo con efectos: se va a buscar el producto. Lo
   * demás sólo obliga a repintar la fila —los importes son columnas
   * calculadas— y a revisar si hay que añadir otra fila en blanco.
   */
  async onCellValueChanged(e: CellValueChangedEvent): Promise<void> {
    const fila = e.data as LineaProformaModel;

    if (e.colDef.field === 'codigo') {
      const texto = String(fila.codigo ?? '').trim();
      if (!texto) { this.repintar(e.node); return; }
      await this.rellenarDesdeCodigo(fila, e.node, texto);
      return;
    }

    // Escribir cualquier otra cosa en la fila en blanco la convierte en una
    // línea de verdad: alguien está cotizando algo que no está en el catálogo
    if (fila._vacia && (String(fila.descripcion ?? '').trim() || this.aNumero(fila.precio_unitario) > 0)) {
      fila._vacia = false;
      this.asegurarFilaEnBlanco();
    }

    this.repintar(e.node);
  }

  /**
   * Un clic en la celda de acciones.
   *
   * Se escucha aquí y no con botones de Angular porque la celda es HTML
   * plano: la rejilla pinta cientos de celdas y un componente por botón
   * cuesta más de lo que aporta.
   */
  onCellClicked(e: any): void {
    const destino = (e.event?.target as HTMLElement | null)?.closest('[data-accion]');
    if (!destino) { return; }

    const accion = destino.getAttribute('data-accion');
    if (accion === 'quitar') { this.quitarLinea(e.data); }
    if (accion === 'buscar') { this.buscarProducto(e.data, e.node); }
  }

  /**
   * Enter en la celda del código: igual que salir de ella, pero además baja
   * a la cantidad, que es lo siguiente que se escribe.
   */
  onCellKeyDown(e: CellKeyDownEvent): void {
    const ev = e.event as KeyboardEvent;
    if (!ev || ev.key !== 'Enter') { return; }
    if (e.colDef.field !== 'codigo') { return; }

    // La rejilla ya está terminando la edición; se espera un turno para que
    // el valor nuevo esté en la fila antes de mover el foco
    setTimeout(() => {
      const fila = e.data as LineaProformaModel;
      if (fila?.producto_id || String(fila?.descripcion ?? '').trim()) {
        this.gridApi.startEditingCell({ rowIndex: e.rowIndex!, colKey: 'cantidad' });
      }
    }, 0);
  }

  /**
   * El código escrito, resuelto contra el catálogo.
   *
   * Si hay uno exacto se rellena la línea y se sigue escribiendo. Si no, se
   * abre el listado de productos con lo escrito ya buscado: es lo que uno
   * quiere cuando se ha escrito media referencia.
   */
  private async rellenarDesdeCodigo(fila: LineaProformaModel, nodo: any, texto: string): Promise<void> {
    try {
      const res: any = await firstValueFrom(this._proformaService.buscarProducto(texto, 10));
      const data = res?.data ?? { exacto: false, productos: [] };

      if (data.exacto && data.productos?.length) {
        this.ponerProducto(fila, data.productos[0], nodo);
        return;
      }

      // Nada exacto: que elija. El listado se abre ya buscando lo escrito.
      this.buscarProducto(fila, nodo, texto);

    } catch (e) {
      console.error('Error al buscar el producto:', e);
    }
  }

  /** Abre el listado paginado de productos. */
  buscarProducto(fila: LineaProformaModel, nodo?: any, busqueda: string = ''): void {
    if (this.esView) { return; }

    const ref = this.otroModal.open(ListProductosComponent, {
      centered: true, size: 'xl', backdrop: 'static', keyboard: true,
    });
    ref.componentInstance.busquedaInicial = busqueda || String(fila?.codigo ?? '');
    // Varios de una vez: cotizar diez cosas no debería ser abrir diez veces
    // el mismo listado
    ref.componentInstance.permiteVarios = true;

    ref.componentInstance.seleccionados.subscribe((productos: any[]) => {
      if (!productos?.length) { return; }

      // El primero va en la fila desde la que se abrió; el resto, detrás
      this.ponerProducto(fila, productos[0], nodo);
      for (const p of productos.slice(1)) {
        const nueva = this.filaEnBlanco();
        nueva._vacia = false;
        this.ponerProducto(nueva, p);
        this.lineas.splice(this.lineas.length - 1, 0, nueva);
      }
      if (productos.length > 1) {
        this.gridApi?.setRowData(this.lineas);
      }
    });
  }

  /** Vuelca un producto del catálogo en una línea. */
  private ponerProducto(fila: LineaProformaModel, p: any, nodo?: any): void {
    fila.producto_id    = p.producto_id;
    fila.codigo         = p.codigo ?? '';
    fila.descripcion    = p.descripcion ?? '';
    fila.unidad         = p.unidad ?? 'UNIDAD';
    fila.precio_unitario = Number(p.precio_unitario ?? 0);
    fila.iva_porcentaje  = Number(p.iva_porcentaje ?? 0);
    if (!fila.cantidad || fila.cantidad <= 0) { fila.cantidad = 1; }
    // El descuento de la línea: el que se propuso para toda la proforma
    if (fila.descuento_porcentaje == null) {
      fila.descuento_porcentaje = Number(this.form.get('descuento_porcentaje')?.value ?? 0);
    }
    fila._vacia = false;

    this.asegurarFilaEnBlanco();
    if (nodo) { this.repintar(nodo); }
  }

  /**
   * Vuelve a dibujar una fila con lo que tiene ahora.
   *
   * SÓLO refreshCells, y NUNCA setData con una copia de la fila. Esto último
   * parece inofensivo y no lo es: `setData({...fila})` le pone al nodo de la
   * rejilla un objeto NUEVO, y a partir de ahí lo que se edita en la celda
   * cae en esa copia mientras `this.lineas` —que es lo que se manda al
   * guardar— se queda con el objeto viejo. La pantalla enseñaría la cantidad
   * nueva y se guardaría la anterior.
   *
   * Tampoco redrawRows: en ag-Grid 28 deja en blanco la celda que se acababa
   * de editar. refreshCells basta, porque los importes son columnas
   * calculadas (valueGetter) y se vuelven a pedir al repintar.
   */
  private repintar(nodo: any): void {
    if (!nodo) { return; }
    this.gridApi?.refreshCells({ rowNodes: [nodo], force: true });
  }

  /** Si la última fila ya tiene algo, se añade otra en blanco detrás. */
  private asegurarFilaEnBlanco(): void {
    if (this.esView) { return; }
    const ultima = this.lineas[this.lineas.length - 1];
    if (ultima && ultima._vacia) { return; }
    const nueva = this.filaEnBlanco();
    this.lineas.push(nueva);
    this.gridApi?.applyTransaction({ add: [nueva] });
  }

  quitarLinea(fila: LineaProformaModel): void {
    if (this.esView) { return; }
    const i = this.lineas.indexOf(fila);
    if (i === -1) { return; }
    this.lineas.splice(i, 1);
    this.gridApi?.applyTransaction({ remove: [fila] });
    this.asegurarFilaEnBlanco();
    // El número de línea (#) es la posición: al quitar una, las de abajo
    // cambian de número y hay que repintarlas
    this.gridApi?.refreshCells({ force: true });
  }

  /** Añade una línea en blanco a mano (para escribir algo que no está en el catálogo). */
  anadirLinea(): void {
    if (this.esView) { return; }
    const nueva = this.filaEnBlanco();
    nueva._vacia = false;
    // La unidad por omisión se pone aquí y no en la fila en blanco: en la
    // última fila sería ruido —todavía no hay línea—, y en una línea escrita
    // a mano es lo que va a acabar guardándose de todos modos.
    nueva.unidad = 'UNIDAD';
    this.lineas.splice(this.lineas.length - 1, 0, nueva);
    this.gridApi?.setRowData(this.lineas);
    const i = this.lineas.indexOf(nueva);
    setTimeout(() => this.gridApi?.startEditingCell({ rowIndex: i, colKey: 'descripcion' }), 0);
  }

  /**
   * El descuento de la cabecera baja a todas las líneas.
   *
   * Se pisa el de cada línea a propósito: es lo que significa cambiar el
   * descuento de la proforma. Para dejar una línea con otro descuento, se
   * cambia después en su celda.
   */
  aplicarDescuentoGeneral(): void {
    if (this.esView) { return; }
    const d = this.aNumero(this.form.get('descuento_porcentaje')?.value, 0);
    for (const l of this.lineas) { l.descuento_porcentaje = d; }
    this.gridApi?.refreshCells({ force: true });
  }

  // ================================================================
  // GUARDAR
  // ================================================================

  /** Lo que impide guardar, dicho en una frase. */
  get problema(): string | null {
    if (!this.form.get('cliente_id')?.value) { return 'Falta el cliente'; }
    if (!this.lineasReales.length)           { return 'Falta añadir al menos una línea'; }

    for (const [i, l] of this.lineasReales.entries()) {
      if (!String(l.descripcion ?? '').trim()) { return `La línea ${i + 1} no dice qué se cotiza`; }
      if (this.aNumero(l.cantidad) <= 0)       { return `La línea ${i + 1} no tiene cantidad`; }
    }
    return null;
  }

  async guardar(): Promise<void> {
    if (this.esView || this.guardando) { return; }
    if (this._seguridadService.isexpired()) { return; }

    const problema = this.problema;
    if (problema) {
      this._toastr.warning(problema, 'Falta algo');
      this.form.markAllAsTouched();
      return;
    }

    // Lo que se manda: la cabecera y TODAS las líneas. Los importes no van
    // —los calcula la base— y la fila en blanco del final tampoco.
    const datos: any = {
      ...this.form.getRawValue(),
      dias_credito: this.form.get('dias_credito')?.value === '' ? null : this.form.get('dias_credito')?.value,
      detalle: this.lineasReales.map(l => ({
        producto_id:          l.producto_id ?? null,
        codigo:               l.codigo ?? null,
        descripcion:          String(l.descripcion ?? '').trim(),
        unidad:               l.unidad ?? null,
        cantidad:             this.aNumero(l.cantidad, 1),
        precio_unitario:      this.aNumero(l.precio_unitario, 0),
        descuento_porcentaje: this.aNumero(l.descuento_porcentaje, 0),
        iva_porcentaje:       this.aNumero(l.iva_porcentaje, 0),
        observacion:          l.observacion ?? null,
      })),
    };

    try {
      this.guardando = true;
      this._loadingService.setLoading(true);

      const esNueva = this.accion === 'add' || this.accion === 'clon';
      const res: any = await firstValueFrom(
        esNueva ? this._proformaService.addProforma(datos)
                : this._proformaService.editProforma(this.proforma!.id, datos)
      );

      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo guardar la proforma', 'Error');
        return;
      }

      this._toastr.success(res.message, 'Listo');
      this.registrosE.emit(res.data);
      this.modal.close(res.data);

    } catch (e) {
      // El AuthInterceptor ya enseñó el error HTTP con su mensaje
      console.error('Error al guardar la proforma:', e);
    } finally {
      this.guardando = false;
      this._loadingService.setLoading(false);
    }
  }
}
