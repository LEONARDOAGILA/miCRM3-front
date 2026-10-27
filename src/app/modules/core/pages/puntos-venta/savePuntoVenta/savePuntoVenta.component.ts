import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { Subject, firstValueFrom } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { PanelComponent } from '../../../../../components/panel/panel.component';
import { ModalHeaderComponent } from '../../../../../components/modal/modal-header/modal-header.component';
import { ModalFooterComponent } from '../../../../../components/modal/modal-footer/modal-footer.component';
import { ComboComponent } from '../../../../../components/campos/combo/combo.component';
import { CampoTextoComponent } from '../../../../../components/campos/campoTexto/campoTexto.component';
import { CampoTextoAreaComponent } from '../../../../../components/campos/campoTextoArea/campoTextoArea.component';
import { CampoNumeroEnteroComponent } from '../../../../../components/campos/campoNumeroEntero/campoNumeroEntero.component';
import { CheckboxComponent } from '../../../../../components/campos/checkbox/checkbox.component';

import { SeguridadService } from '../../../../seguridad/services/seguridad.service';
import { LoadingService } from '../../../../../service/loading.service';
import { PuntoVentaService } from '../../../services/puntoVenta.service';
import { CuentaConfigService } from '../../../../contabilidad/services/cuentaConfig.service';
import { PlanCuentaService } from '../../../../contabilidad/services/planCuenta.service';
import { ConceptoConfigurado, NO_APLICA, ValorCuenta } from '../../../../contabilidad/interfaces/cuentaConfigModel';
import { PlanCuentaModel } from '../../../../contabilidad/interfaces/planCuentaModel';
import { AYUDA_CUENTAS_PUNTO_VENTA, PuntoVentaModel } from '../../../interfaces/puntoVentaModel';
import { NuevaCuentaContableComponent } from '../nuevaCuentaContable/nuevaCuentaContable.component';

/** Con qué se abre el modal desde allPuntosVenta. */
type AccionPuntoVenta = 'add' | 'edit' | 'clon' | 'view';

/**
 * La ficha de un punto de venta: la caja y SUS CUENTAS, en la misma ventana.
 *
 * Están juntas a propósito. Una caja sin cuenta de efectivo no puede asentar
 * nada, así que dejar las cuentas en otra pantalla es garantizar que la mitad
 * se queden a medias: el contador crea la caja, se va, y nadie vuelve.
 *
 * LAS CUENTAS SE GUARDAN APARTE, detrás de la caja, porque el servicio que
 * las guarda necesita el id —que al crear no existe hasta después— y porque
 * es el mismo mecanismo de las categorías y los grupos de clientes
 * (CuentaConfigService con ámbito PUNTO_VENTA). Si algo falla ahí, la caja ya
 * quedó creada y se dice: es un dato que se puede volver a poner.
 *
 * LO QUE SE DEJA EN BLANCO SE HEREDA. La cadena es
 * punto de venta → su sucursal → lo que valga para todos, y debajo de cada
 * campo se dice qué saldría si se deja vacío. En la práctica sólo la cuenta
 * de efectivo es de cada caja; lo demás se pone una vez.
 *
 * Y si la cuenta que hace falta no existe todavía, se crea desde aquí mismo
 * (NuevaCuentaContableComponent): obligar a ir al plan de cuentas y volver es
 * el camino por el que se acaban reutilizando cuentas que no tocan.
 */
@Component({
  selector: 'app-savePuntoVenta',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, PanelComponent,
    ModalHeaderComponent, ModalFooterComponent,
    ComboComponent, CampoTextoComponent, CampoTextoAreaComponent,
    CampoNumeroEnteroComponent, CheckboxComponent,
  ],
  templateUrl: './savePuntoVenta.component.html',
  styleUrls: ['./savePuntoVenta.component.css'],
})
export class SavePuntoVentaComponent implements OnInit, OnDestroy {

  @Input() registro_selected: any = 0;
  @Input() accion: AccionPuntoVenta = 'add';
  /**
   * DE QUÉ SUCURSAL ES LA CAJA. Llega decidida desde el listado —allí se
   * elige la tienda y después se añade— y aquí NO SE PUEDE CAMBIAR.
   *
   * No es una limitación: mover una caja de tienda le cambia el número
   * dentro de su sucursal, el código y, sobre todo, las cuentas que hereda.
   * Eso no puede pasar por tocar un desplegable escondido en un formulario;
   * si hace falta, se crea la caja en la tienda que toca.
   */
  @Input() sucursalInicial: number | null = null;
  /** El nombre, para enseñarlo sin tener que ir a buscarlo. */
  @Input() sucursalNombre = '';
  /**
   * Y SU CÓDIGO, que es media parte del código de la caja: el de un punto de
   * venta se compone con el de su tienda más el número de la caja (la 501 de
   * la sucursal 01 es «01-501»). Con esto la ficha lo rehace mientras se
   * teclea el número, sin ir a preguntarle nada al servidor.
   *
   * Si llega vacío se usa el que venga en la sugerencia; y si tampoco, el
   * código se queda como lo mande el servidor.
   */
  @Input() sucursalCodigo = '';
  @Output() registrosE: EventEmitter<any> = new EventEmitter();

  public form: FormGroup;
  /** Los conceptos contables, cada uno con su control en este FormGroup. */
  public formCuentas: FormGroup;

  public isLoading$ = this._loadingService.isLoading$;
  public titulo = '';
  public guardando = false;

  public puntoVenta: PuntoVentaModel | null = null;

  public conceptos: ConceptoConfigurado[] = [];
  public itemsPorConcepto: Record<string, any[]> = {};

  /** Las cuentas de movimiento, para rehacer las listas al crear una nueva. */
  private cuentasMovimiento: Array<{ id: number; etiqueta: string; tipo: string }> = [];

  public readonly NO_APLICA = NO_APLICA;
  public readonly ayuda = AYUDA_CUENTAS_PUNTO_VENTA;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    public modal: NgbActiveModal,
    private otroModal: NgbModal,
    private _toastr: ToastrService,
    private _loadingService: LoadingService,
    private _seguridadService: SeguridadService,
    private _puntoVentaService: PuntoVentaService,
    private _cuentaConfigService: CuentaConfigService,
    private _planCuentaService: PlanCuentaService,
  ) {
    this.form = this.fb.group({
      sucursal_id: [null, [Validators.required]],
      nombre:      ['', [Validators.required, Validators.minLength(2)]],
      codigo:      [''],
      numero:      [''],
      descripcion: [''],
      activo:      [true],
    });
    this.formCuentas = this.fb.group({});

    // EL CÓDIGO NO SE TECLEA: se compone con el de la sucursal y el número de
    // la caja. Apagado, no por capricho: si se pudiera escribir habría cajas
    // cuyo código no dice ni en qué tienda están ni qué número llevan, que es
    // justo lo único para lo que sirve un código.
    this.form.controls['codigo'].disable({ emitEvent: false });

    // Y se rehace cada vez que cambia el número
    this.form.controls['numero'].valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.recomponerCodigo());
  }

  // ================================================================
  // ESTADO DERIVADO
  // ================================================================

  get esView(): boolean { return this.accion === 'view'; }
  get esNuevo(): boolean { return this.accion === 'add' || this.accion === 'clon'; }
  get ctrlActivo(): FormControl { return this.form.controls['activo'] as FormControl; }

  /**
   * La tienda, con el código delante: «02 Sucursal Norte».
   *
   * Igual que en el listado. Entre ellos las tiendas se llaman por el número,
   * y leer el mismo texto en los dos sitios ahorra el «¿es ésta?».
   */
  get sucursalEtiqueta(): string {
    return [String(this.sucursalCodigo ?? '').trim(), String(this.sucursalNombre ?? '').trim()]
      .filter(Boolean).join(' ');
  }

  /**
   * EL CÓDIGO DE LA CAJA = CÓDIGO DE LA TIENDA + NÚMERO DE LA CAJA.
   *
   * Dos cifras como mínimo —la caja 1 de la tienda 01 es «01-01»— pero sin
   * recortar las que tengan más: la 501 es «01-501». Es la misma regla que
   * `core.fn_puntos_venta_codigo_componer`, y está escrita dos veces a
   * propósito: aquí para que se vea mientras se teclea, allí porque es el
   * servidor el que decide lo que se graba.
   *
   * Sin código de tienda no se toca nada: vale más el que haya puesto el
   * servidor que uno inventado a medias.
   */
  private recomponerCodigo(): void {
    const suc = String(this.sucursalCodigo ?? '').trim().toUpperCase();
    if (!suc) { return; }

    const bruto = this.form.get('numero')?.value;
    const n = Math.trunc(Number(bruto));

    if (bruto === '' || bruto == null || !Number.isFinite(n) || n < 1) {
      // Sin número no hay código. Se deja vacío y el servidor pondrá el de la
      // siguiente caja libre, en vez de enseñar un código a medio hacer.
      this.form.controls['codigo'].setValue('', { emitEvent: false });
      return;
    }

    const num = String(n);
    this.form.controls['codigo'].setValue(
      `${suc}-${num.length < 2 ? '0' + num : num}`, { emitEvent: false });
  }

  ctrl(concepto: string): FormControl {
    return this.formCuentas.controls[concepto] as FormControl;
  }

  /** Si en este concepto se eligió «no aplica». */
  esNoAplica(c: ConceptoConfigurado): boolean {
    return this.ctrl(c.concepto)?.value === NO_APLICA;
  }

  /** Si lo que hay puesto es propio de esta caja. */
  esPropia(c: ConceptoConfigurado): boolean {
    return this.ctrl(c.concepto)?.value != null;
  }

  /** Lo que se hereda es un «no aplica» de más arriba. */
  heredaNoAplica(c: ConceptoConfigurado): boolean {
    return !this.esPropia(c) && (c.heredada?.no_aplica ?? c.efectiva?.no_aplica) === true;
  }

  /**
   * Lo que se usaría si el campo se deja en blanco.
   *
   * Sale de `heredada` y no de `efectiva`: cuando hay una cuenta propia la
   * efectiva es esa misma, y al vaciar el campo el aviso diría que se hereda
   * justo la que se acaba de quitar.
   */
  heredada(c: ConceptoConfigurado): string {
    const h = c.heredada ?? c.efectiva;
    if (h?.no_aplica) { return `No aplica (${h.origen_etiqueta})`; }
    if (!h?.cuenta_id) { return 'Sin cuenta: no se podrá asentar este concepto'; }
    return `${h.codigo} · ${h.nombre} (${h.origen_etiqueta})`;
  }

  /** Cuántas tiene puestas ella; el resto se heredan. */
  get cuantasPropias(): number {
    return this.conceptos.filter(c => this.ctrl(c.concepto)?.value != null).length;
  }

  /**
   * Cuántos conceptos se quedarían SIN RESOLVER.
   *
   * Es el número que de verdad importa: mientras no sea cero, hay asientos
   * que esta caja no va a poder hacer. Se calcula con lo que hay en pantalla
   * —no con lo que trajo el servidor— para que cambie mientras se rellena.
   */
  get cuantasSinResolver(): number {
    return this.conceptos.filter(c => {
      const v = this.ctrl(c.concepto)?.value;
      if (v != null) { return false; }                       // propia o «no aplica»
      const h = c.heredada ?? c.efectiva;
      return !h?.cuenta_id && !h?.no_aplica;
    }).length;
  }

  // ================================================================
  // CICLO DE VIDA
  // ================================================================

  async ngOnInit(): Promise<void> {
    if (this._seguridadService.isexpired()) { this.modal.close(); return; }

    this.titulo = this.accion === 'add'  ? 'Nuevo punto de venta'
                : this.accion === 'clon' ? 'Copiar punto de venta'
                : this.accion === 'view' ? 'Punto de venta'
                : 'Modificar punto de venta';

    if (this.esNuevo) {
      // La tienda viene decidida del listado (o de la caja que se clona)
      const sucursal = this.accion === 'clon'
        ? (this.registro_selected?.sucursal_id ?? null)
        : this.sucursalInicial;

      if (!sucursal) {
        // No debería pasar: el botón de añadir está apagado sin tienda
        // elegida. Si pasa, se dice en vez de dejar un formulario que no se
        // va a poder guardar.
        this._toastr.warning('Elija primero la sucursal en la lista de la izquierda',
                             'Falta la sucursal', { closeButton: true });
        this.modal.close();
        return;
      }

      this.form.patchValue({ sucursal_id: sucursal });
      if (this.accion === 'clon') {
        this.sucursalNombre = this.sucursalNombre || (this.registro_selected?.sucursal_nombre ?? '');
        this.sucursalCodigo = this.sucursalCodigo || (this.registro_selected?.sucursal_codigo ?? '');
        this.form.patchValue({ descripcion: this.registro_selected?.descripcion ?? '' });
      }
      await this.proponerCodigoYNumero(sucursal);

      // Una caja nueva todavía no tiene id: se enseñan los conceptos con lo
      // que heredaría de su sucursal (y de lo global), que es lo que va a
      // tener si no se toca nada
      await this.cargarCuentas(null);

    } else {
      await this.cargar(Number(this.registro_selected?.id ?? this.registro_selected));
    }

    if (this.esView) {
      this.form.disable({ emitEvent: false });
      this.formCuentas.disable({ emitEvent: false });
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ================================================================
  // DATOS
  // ================================================================

  /** El siguiente código y número libres de esa sucursal. */
  private async proponerCodigoYNumero(sucursalId: number): Promise<void> {
    try {
      const res: any = await firstValueFrom(this._puntoVentaService.sugerencia(sucursalId));
      const s = res?.data;
      if (!s) { return; }
      // Si la ficha se abrió sin el código de la tienda, aquí viene
      this.sucursalCodigo = this.sucursalCodigo || (s.sucursal_codigo ?? '');
      this.form.patchValue({
        numero: s.numero,
        // El nombre sólo si todavía no se escribió: lo que teclea el usuario
        // manda siempre sobre lo que propone el sistema
        nombre: this.form.get('nombre')?.value || s.nombre,
      });
      // El código, detrás del número y SIN emitir: con el número ya puesto, el
      // suscriptor lo habrá compuesto igual; esto es para cuando no se pudo
      // (ficha abierta sin código de tienda) y manda el del servidor.
      if (!this.form.controls['codigo'].value) {
        this.form.controls['codigo'].setValue(s.codigo, { emitEvent: false });
      }
    } catch (e) {
      console.error('No se pudo proponer el código:', e);
    }
  }

  private async cargar(id: number): Promise<void> {
    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._puntoVentaService.findByIdPuntoVenta(id));
      if (res?.status !== 'success' || !res?.data) {
        this._toastr.error(res?.message || 'No se pudo abrir el punto de venta', 'Error');
        this.modal.close();
        return;
      }

      const p: PuntoVentaModel = res.data;
      this.puntoVenta = p;
      this.sucursalNombre = p.sucursal_nombre ?? this.sucursalNombre;
      this.sucursalCodigo = p.sucursal_codigo ?? this.sucursalCodigo;
      this.form.patchValue({
        sucursal_id: p.sucursal_id,
        nombre:      p.nombre,
        codigo:      p.codigo,
        numero:      p.numero,
        descripcion: p.descripcion ?? '',
        activo:      p.activo,
      }, { emitEvent: false });

      await this.cargarCuentas(p.id);

    } catch (e) {
      console.error('Error al abrir el punto de venta:', e);
      this.modal.close();
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  /**
   * Los conceptos contables y las cuentas que se pueden elegir.
   *
   * Con `id` nulo —una caja que todavía no existe— se pregunta por el ámbito
   * de su SUCURSAL: así se ve lo que va a heredar antes de crearla, que es
   * justo lo que el contador necesita para saber qué le falta poner.
   */
  private async cargarCuentas(id: number | null): Promise<void> {
    const sucursal = this.form.get('sucursal_id')?.value;
    if (!id && !sucursal) { return; }

    try {
      this._loadingService.setLoading(true);

      const [config, cuentas]: any[] = await Promise.all([
        firstValueFrom(id
          ? this._cuentaConfigService.obtener('PUNTO_VENTA', id)
          : this._cuentaConfigService.obtener('SUCURSAL', Number(sucursal))),
        firstValueFrom(this._planCuentaService.listPlanCuentas(true)),
      ]);

      if (config?.status !== 'success') {
        this._toastr.error(config?.message || 'No se pudo obtener la configuración contable', 'Error');
        return;
      }

      // Con el ámbito SUCURSAL vienen TODOS los conceptos de ese ámbito (que
      // hoy no hay ninguno propio), así que se filtran a los de la caja
      this.conceptos = (config.data?.conceptos ?? [])
        .filter((c: ConceptoConfigurado) => !!this.ayuda[c.concepto] || c.ambito_natural === 'PUNTO_VENTA');

      // SÓLO LAS DE MOVIMIENTO: las de grupo agrupan y no reciben asientos
      this.cuentasMovimiento = ((cuentas?.data ?? []) as PlanCuentaModel[])
        .filter(c => c.es_movimiento === true && c.activo !== false)
        .map(c => ({ id: c.id, etiqueta: `${c.codigo} · ${c.nombre}`, tipo: c.tipo as string }));

      this.rehacerListas();

      const controles: Record<string, FormControl> = {};
      this.conceptos.forEach(c => {
        // En una caja nueva no hay nada propio: todo se hereda
        const propia = id ? c.propia : null;
        controles[c.concepto] = new FormControl({
          value: propia?.no_aplica ? NO_APLICA : (propia?.cuenta_id ?? null),
          disabled: this.esView,
        });
      });
      this.formCuentas = this.fb.group(controles);

    } catch (e) {
      console.error('Error al cargar la configuración contable:', e);
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  /** Las opciones de cada concepto, filtradas por los tipos que admite. */
  private rehacerListas(): void {
    const lista: Record<string, any[]> = {};
    this.conceptos.forEach(c => {
      lista[c.concepto] = [
        // «No aplica» la primera, para que se vea sin desplegar
        { id: NO_APLICA, etiqueta: 'No aplica · aquí no se usa esta cuenta', tipo: null },
        ...this.cuentasMovimiento.filter(x => (c.tipos_permitidos || []).includes(x.tipo)),
      ];
    });
    this.itemsPorConcepto = lista;
  }

  // ================================================================
  // CREAR UNA CUENTA SIN SALIR DE AQUÍ
  // ================================================================

  /**
   * Abre la ventana corta de «nueva cuenta» y, al crearla, la deja elegida
   * en el concepto desde el que se pidió.
   */
  nuevaCuenta(c: ConceptoConfigurado): void {
    if (this.esView) { return; }

    const ref = this.otroModal.open(NuevaCuentaContableComponent, {
      centered: true, size: 'lg', backdrop: 'static', keyboard: true,
    });
    ref.componentInstance.concepto = c.concepto;
    ref.componentInstance.conceptoNombre = c.nombre;
    ref.componentInstance.tiposPermitidos = c.tipos_permitidos ?? [];
    // Un nombre de partida que casi siempre vale: «Caja del punto de venta —
    // Caja 2»
    ref.componentInstance.nombreSugerido =
      `${c.nombre} ${this.form.get('nombre')?.value ?? ''}`.trim();

    ref.componentInstance.creada.subscribe((cuenta: PlanCuentaModel) => {
      if (!cuenta?.id) { return; }
      // Entra en la lista y queda elegida, sin recargar nada más
      this.cuentasMovimiento = [
        ...this.cuentasMovimiento,
        { id: cuenta.id, etiqueta: `${cuenta.codigo} · ${cuenta.nombre}`, tipo: cuenta.tipo as string },
      ].sort((a, b) => a.etiqueta.localeCompare(b.etiqueta));
      this.rehacerListas();
      this.ctrl(c.concepto)?.setValue(cuenta.id);
    });
  }

  // ================================================================
  // GUARDAR
  // ================================================================

  /** Lo que impide guardar, dicho en una frase. */
  get problema(): string | null {
    if (!this.form.get('sucursal_id')?.value) { return 'Falta decir de qué sucursal es'; }
    const nombre = String(this.form.get('nombre')?.value ?? '').trim();
    if (nombre.length < 2) { return 'Falta el nombre del punto de venta'; }
    // Si se escribió un número, que sea uno de los que acepta el servidor; si
    // no se escribió ninguno, él pone el de la siguiente caja libre
    const n = this.form.get('numero')?.value;
    if (n !== '' && n != null && (Number(n) < 1 || Number(n) > 999)) {
      return 'El número del punto de venta va del 1 al 999';
    }
    return null;
  }

  async onSubmitForm($ev?: any): Promise<void> {
    $ev?.preventDefault?.();
    if (this.esView || this.guardando) { return; }

    const problema = this.problema;
    if (problema) {
      this._toastr.warning(problema, 'Falta algo');
      this.form.markAllAsTouched();
      return;
    }

    const d = this.form.getRawValue();
    const datos = {
      sucursal_id: Number(d.sucursal_id),
      nombre:      String(d.nombre).trim(),
      codigo:      String(d.codigo ?? '').trim() || null,
      numero:      d.numero === '' || d.numero == null ? null : Number(d.numero),
      descripcion: String(d.descripcion ?? '').trim() || null,
      activo:      !!d.activo,
    };

    try {
      this.guardando = true;
      this._loadingService.setLoading(true);

      const res: any = await firstValueFrom(
        this.esNuevo
          ? this._puntoVentaService.addPuntoVenta(datos)
          : this._puntoVentaService.editPuntoVenta(this.puntoVenta!.id, datos)
      );

      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo guardar el punto de venta', 'Error');
        return;
      }

      const guardado: PuntoVentaModel = res.data;

      // Y detrás, sus cuentas: necesitan el id, que al crear no existe hasta
      // ahora. Si fallan, la caja ya quedó creada y se dice.
      const cuentasOk = await this.guardarCuentas(guardado.id);

      this._toastr.success(res.message, 'Listo');
      // Lo que se devuelve lleva el resumen de cuentas al día
      this.registrosE.emit(cuentasOk ? (await this.releer(guardado.id)) ?? guardado : guardado);
      this.modal.close(guardado);

    } catch (e) {
      // El AuthInterceptor ya enseñó el error HTTP (409 con su motivo)
      console.error('Error al guardar el punto de venta:', e);
    } finally {
      this.guardando = false;
      this._loadingService.setLoading(false);
    }
  }

  /**
   * Las cuentas de la caja, por el mecanismo común.
   *
   * Se mandan TODAS, también las vacías: un nulo es lo que quita la cuenta
   * propia y devuelve el concepto a la de arriba.
   */
  private async guardarCuentas(id: number): Promise<boolean> {
    if (!this.conceptos.length) { return true; }

    const cuentas: Record<string, ValorCuenta> = {};
    this.conceptos.forEach(c => {
      const v = this.ctrl(c.concepto)?.value;
      if (v === NO_APLICA) { cuentas[c.concepto] = NO_APLICA; }
      else { cuentas[c.concepto] = v == null || v === '' ? null : Number(v); }
    });

    try {
      const res: any = await firstValueFrom(this._cuentaConfigService.guardar('PUNTO_VENTA', id, cuentas));
      return res?.status === 'success';
    } catch (e) {
      console.error('Error al guardar las cuentas del punto de venta:', e);
      this._toastr.warning(
        'El punto de venta se guardó, pero sus cuentas no. Vuelva a abrirlo y revise la parte contable.',
        'Cuentas', { timeOut: 9000, closeButton: true });
      return false;
    }
  }

  /** Vuelve a leer la caja para devolver el resumen de cuentas al día. */
  private async releer(id: number): Promise<PuntoVentaModel | null> {
    try {
      const res: any = await firstValueFrom(this._puntoVentaService.findByIdPuntoVenta(id));
      return res?.status === 'success' ? res.data : null;
    } catch {
      return null;
    }
  }
}
