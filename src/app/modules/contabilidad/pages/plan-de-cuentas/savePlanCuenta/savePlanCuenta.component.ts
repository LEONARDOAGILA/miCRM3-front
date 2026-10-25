import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { Subject, firstValueFrom } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { SeguridadService } from '../../../../seguridad/services/seguridad.service';
import { LoadingService } from '../../../../../service/loading.service';
import { PlanCuentaService } from '../../../services/planCuenta.service';
import { PlanCuentaModel, NaturalezaCuenta, NATURALEZAS_CUENTA, TipoCuenta, TIPOS_CUENTA }
  from '../../../interfaces/planCuentaModel';

/** Acciones con las que se abre el modal desde allPlanCuentas. */
type AccionPlanCuenta = 'add' | 'edit' | 'clon' | 'view';

/**
 * Alta, modificación, clonación y vista de una cuenta contable
 * (contabilidad.plan_cuentas).
 *
 * EL PADRE NO SE ELIGE AQUÍ. Al crear llega decidido —«Nueva» cuelga de la
 * raíz, «Nueva subcuenta» cuelga de la fila marcada— y al modificar NO SE
 * PUEDE CAMBIAR: mover una rama es otra cosa (hay que mirar ciclos, el nivel
 * de todo lo que cuelga y renumerar hermanas) y se hace arrastrando en la
 * rejilla, que además enseña dónde va a caer. Un combo de padres escondido en
 * un formulario reordena el plan sin que nadie lo vea.
 *
 * LO PROPIO DE UNA CUENTA CONTABLE, frente a una categoría de inventarios:
 *
 *  · EL CÓDIGO SE PROPONE, no se inventa. Al abrir en modo alta se pide al
 *    servidor el siguiente libre bajo ese padre (1.1.01.02 → 1.1.01.03), que
 *    es lo que se iba a teclear mirando el árbol y contando.
 *  · EL TIPO SE HEREDA Y NO SE TOCA en una subcuenta: es el de su rama, y de
 *    él sale en qué informe aparece. Sólo se elige en una cuenta raíz, y al
 *    cambiarlo ahí baja a toda la rama (lo hace el servidor).
 *  · LA NATURALEZA SÍ SE PUEDE CAMBIAR aunque venga propuesta por el tipo:
 *    las cuentas de valuación van al revés —«(-) Depreciación acumulada» es
 *    de activo y acreedora—, y son justo las que hay que poder registrar.
 */
@Component({
  selector: 'app-savePlanCuenta',
  templateUrl: './savePlanCuenta.component.html',
  styleUrls: ['./savePlanCuenta.component.css'],
  standalone: false,
})
export class SavePlanCuentaComponent implements OnInit, OnDestroy {

  /** Registro a editar / clonar / ver, o 0 al crear. */
  @Input() registro_selected: any = {};
  @Input() accion: AccionPlanCuenta = 'add';
  /** De quién va a colgar la nueva; null para una cuenta raíz. */
  @Input() padre: PlanCuentaModel | null = null;
  @Output() registrosE: EventEmitter<any> = new EventEmitter();

  public form: FormGroup;
  public isLoading$ = this._loadingService.isLoading$;
  public response: any;
  public isdisabled = false;
  public titulo = '';
  public textoClon = '';
  public planCuentaModel: PlanCuentaModel | null = null;

  /** Los combos: a un campo y no a un getter (ver ngselect-items-getter). */
  public readonly tipos = TIPOS_CUENTA;
  public readonly naturalezas = NATURALEZAS_CUENTA;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    public modal: NgbActiveModal,
    private _toastr: ToastrService,
    private _loadingService: LoadingService,
    private _seguridadService: SeguridadService,
    private _planCuentaService: PlanCuentaService,
  ) {}

  // ================================================================
  // ESTADO DERIVADO
  // ================================================================

  get esView(): boolean { return this.accion === 'view'; }
  get esNuevo(): boolean { return this.accion === 'add' || this.accion === 'clon'; }
  get ctrlActivo(): FormControl { return this.form.controls['activo'] as FormControl; }
  get ctrlEsMovimiento(): FormControl { return this.form.controls['es_movimiento'] as FormControl; }
  get ctrlTipo(): FormControl { return this.form.controls['tipo'] as FormControl; }
  get ctrlNaturaleza(): FormControl { return this.form.controls['naturaleza'] as FormControl; }

  /** Subcuentas directas (sólo informativo, viene del back). */
  get numHijos(): number {
    return Number(this.planCuentaModel?.num_hijos ?? this.registro_selected?.num_hijos ?? 0);
  }

  /**
   * El tipo de la rama, cuando no se puede elegir.
   *
   * Al crear una subcuenta es el del padre; al modificar una que no es raíz,
   * el de la propia cuenta (que es el de su padre).
   */
  get tipoHeredado(): string | null {
    if (this.esNuevo) { return this.padre ? (this.padre.tipo ?? null) : null; }
    return this.planCuentaModel?.padre_id != null ? (this.planCuentaModel?.tipo ?? null) : null;
  }

  /**
   * Si el tipo se puede elegir: sólo en las cuentas raíz.
   *
   * En una subcuenta el tipo es el de su rama y el servidor lo rechaza
   * (P0022), así que aquí se enseña apagado en lugar de ofrecer algo que va
   * a fallar al guardar.
   */
  get puedeElegirTipo(): boolean {
    if (this.esView) { return false; }
    return this.esNuevo ? !this.padre : this.planCuentaModel?.padre_id == null;
  }

  /** La etiqueta larga del tipo, para los textos de ayuda. */
  get etiquetaTipo(): string {
    return this.tipos.find(t => t.valor === this.ctrlTipo?.value)?.etiqueta ?? '—';
  }

  /** Dónde va a quedar: el padre con su código, o «Primer nivel» si no tiene. */
  get dondeVa(): string {
    if (this.esNuevo) {
      return this.padre ? `${this.padre.codigo} ${this.padre.nombre}` : 'Primer nivel (cuenta raíz)';
    }
    const c = this.planCuentaModel;
    if (!c?.padre_id) { return 'Primer nivel (cuenta raíz)'; }
    return `${c.padre_codigo ?? ''} ${c.padre_nombre ?? ''}`.trim() || '—';
  }

  /** El nivel que va a tener: el del padre más uno. Sin tope. */
  get nivelResultante(): number {
    if (this.esNuevo) { return this.padre ? Number(this.padre.nivel ?? 0) + 1 : 0; }
    return Number(this.planCuentaModel?.nivel ?? 0);
  }

  // ================================================================
  // CICLO DE VIDA
  // ================================================================

  async ngOnInit(): Promise<void> {
    if (this._seguridadService.isexpired()) {
      this.modal.close();
      return;
    }

    this.isdisabled = this.esView;
    this.initializeForm();

    switch (this.accion) {
      case 'add':
        this.titulo = this.padre ? 'Nueva Subcuenta' : 'Nueva Cuenta';
        this.prepararAlta();
        break;
      case 'edit':
        this.titulo = 'Modificar Cuenta';
        await this.findByIdPlanCuenta(this.registro_selected.id);
        break;
      case 'clon':
        this.titulo = 'Clonar Cuenta';
        this.textoClon = '_CLON';
        await this.findByIdPlanCuenta(this.registro_selected.id);
        // El código NO se clona: es único en todo el plan. Se propone el
        // siguiente libre de la misma rama.
        await this.proponerCodigo();
        break;
      case 'view':
        this.titulo = 'Ver Cuenta';
        await this.findByIdPlanCuenta(this.registro_selected.id);
        break;
    }

    // La naturaleza sigue al tipo, y el tipo sólo se cambia a mano en una
    // cuenta raíz. Se escucha AQUÍ, después de cargar la ficha: si se
    // escuchara antes, rellenar el formulario pisaría la naturaleza de una
    // cuenta de valuación con la del tipo, que es justo la que no vale.
    this.ctrlTipo.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.alCambiarTipo());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  //   ******   INICIALIZA FORMULARIO   ******  //
  initializeForm(): void {
    this.form = this.fb.group({
      // El mismo patrón que valida el back: letras, números y separadores,
      // sin empezar ni acabar en separador
      codigo: [{ value: '', disabled: this.isdisabled },
               [Validators.required, Validators.maxLength(30),
                Validators.pattern(/^[0-9A-Za-z]([0-9A-Za-z._-]*[0-9A-Za-z])?$/)]],
      nombre: [{ value: '', disabled: this.isdisabled },
               [Validators.required, Validators.minLength(2), Validators.maxLength(150)]],
      tipo:       [{ value: null, disabled: this.isdisabled }, [Validators.required]],
      naturaleza: [{ value: null, disabled: this.isdisabled }, [Validators.required]],
      descripcion: [{ value: '', disabled: this.isdisabled }, [Validators.maxLength(2000)]],
      activo:      [{ value: true, disabled: this.isdisabled }],
      // De movimiento por omisión: la mayoría de las que se crean son hojas.
      // En cuanto se le cuelgue una subcuenta, el servidor se lo quita.
      es_movimiento: [{ value: true, disabled: this.isdisabled }],
    });
  }

  /** Alta: el tipo del padre, la naturaleza que le toca y el código libre. */
  private prepararAlta(): void {
    // Una cuenta RAÍZ nace de grupo: encabeza un grupo del plan —ACTIVO,
    // PASIVO…— y de ésas no cuelgan asientos, cuelgan cuentas. Además, una
    // cuenta de movimiento no admite subcuentas, así que dejarla marcada
    // obligaría a volver a entrar en su ficha para desmarcarla antes de
    // colgarle la primera.
    if (!this.padre) { this.ctrlEsMovimiento.setValue(false); }

    const tipo = (this.padre?.tipo ?? null) as TipoCuenta | null;
    if (tipo) {
      this.form.patchValue({ tipo, naturaleza: this.naturalezaDe(tipo) });
      // Es el tipo de la rama: no se elige aquí
      this.ctrlTipo.disable();
    }
    this.proponerCodigo();
  }

  /**
   * La naturaleza que le corresponde a un tipo.
   *
   * Es una propuesta, no una regla: se puede cambiar, y hay que poder
   * hacerlo para registrar las cuentas de valuación, que van al revés.
   */
  private naturalezaDe(tipo: TipoCuenta | null): NaturalezaCuenta | null {
    return this.tipos.find(t => t.valor === tipo)?.naturaleza ?? null;
  }

  /**
   * El tipo cambió (sólo pasa en una cuenta raíz): la naturaleza le sigue.
   *
   * Se sobrescribe sin preguntar porque el tipo es lo que manda: si alguien
   * pasa una raíz de ACTIVO a PASIVO, dejar «deudora» puesta sería guardar
   * una incoherencia sin avisar. Después se puede volver a cambiar a mano.
   */
  alCambiarTipo(): void {
    const n = this.naturalezaDe(this.ctrlTipo.value);
    if (n) { this.ctrlNaturaleza.setValue(n); }
  }

  /** Si la naturaleza elegida NO es la del tipo (una cuenta de valuación). */
  get naturalezaAlRevesDelTipo(): boolean {
    const n = this.naturalezaDe(this.ctrlTipo?.value);
    return !!n && !!this.ctrlNaturaleza?.value && this.ctrlNaturaleza.value !== n;
  }

  /**
   * El siguiente código libre, que es con el que se abre el campo.
   *
   * Si el servidor no contesta no se para el alta: el campo se queda vacío y
   * se teclea a mano, que es lo que había antes de esto.
   */
  private async proponerCodigo(): Promise<void> {
    const padreId = this.esNuevo
      ? (this.padre?.id ?? null)
      : (this.planCuentaModel?.padre_id ?? null);
    try {
      const res: any = await firstValueFrom(this._planCuentaService.codigoSugerido(padreId));
      if (res?.status === 'success' && res?.data?.codigo) {
        this.form.patchValue({ codigo: res.data.codigo });
      }
    } catch (error) {
      console.error('No se pudo sugerir el código:', error);
    }
  }

  //   ******   CARGA EL REGISTRO   ******  //
  async findByIdPlanCuenta(id: number): Promise<void> {
    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._planCuentaService.findByIdPlanCuenta(id));
      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo obtener la cuenta', 'Error');
        return;
      }
      this.planCuentaModel = res.data;
      this.form.patchValue({
        codigo:        this.planCuentaModel!.codigo ?? '',
        nombre:        (this.planCuentaModel!.nombre ?? '') + this.textoClon,
        tipo:          this.planCuentaModel!.tipo ?? null,
        naturaleza:    this.planCuentaModel!.naturaleza ?? null,
        descripcion:   this.planCuentaModel!.descripcion ?? '',
        activo:        this.planCuentaModel!.activo !== false,
        es_movimiento: this.planCuentaModel!.es_movimiento !== false,
      });

      // EL TIPO DE UNA SUBCUENTA ES EL DE SU RAMA: el servidor lo rechaza
      // (P0022) y se cambia en la cuenta de arriba, que lo baja a todo lo que
      // cuelga. Se apaga aquí para no ofrecer algo que va a fallar.
      if (!this.puedeElegirTipo) { this.ctrlTipo.disable(); }

      // CON SUBCUENTAS NO RECIBE ASIENTOS: el saldo está en las hojas, y
      // contarlo también aquí lo duplicaría (fn_plan_cuentas_modificar lo
      // corta con P0021).
      if (this.accion === 'edit' && this.numHijos > 0) {
        this.ctrlEsMovimiento.setValue(false);
        this.ctrlEsMovimiento.disable();
      }
    } catch (error) {
      // El AuthInterceptor ya muestra el toast del error HTTP
      console.error('Error al cargar la cuenta:', error);
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  // ================================================================
  // GUARDAR
  // ================================================================

  //   ******   VALIDA FORMULARIO   ******  //
  public async onSubmitForm($ev?: any): Promise<void> {
    $ev?.preventDefault?.();
    this._toastr.clear();
    Object.values(this.form.controls).forEach(control => control.markAsTouched());

    if (this.form.invalid) {
      this._toastr.error('Revise los campos del formulario.', 'No se puede Guardar', { timeOut: 20000, closeButton: true });
      return;
    }

    // getRawValue trae también los campos apagados, que es lo que hace falta:
    // el tipo heredado va al servidor aunque no se pueda tocar
    const payload: any = this.form.getRawValue();
    payload.codigo      = (payload.codigo ?? '').trim();
    payload.descripcion = (payload.descripcion ?? '').trim() || null;

    // El padre sólo se manda al crear: al modificar, la rama no se toca
    if (this.esNuevo) {
      payload.padre_id = this.padre?.id ?? null;
    }

    await this.saveRecord(payload);
  }

  //   ******   GRABAR DATA  ******  //
  private async saveRecord(data: any): Promise<void> {
    try {
      this._loadingService.setLoading(true);
      this.isdisabled = true;

      if (this.accion === 'edit') {
        this.response = await firstValueFrom(this._planCuentaService.editPlanCuenta(this.registro_selected.id, data));
      } else {
        this.response = await firstValueFrom(
          this.accion === 'clon' ? this._planCuentaService.clonPlanCuenta(data) : this._planCuentaService.addPlanCuenta(data)
        );
      }

      if (this.response?.status !== 'success') {
        this.isdisabled = false;
        return;
      }

      this.registrosE.emit(this.response.data);
      this._toastr.success(this.response.message, 'Éxito', { closeButton: true });
      this.modal.close(this.response.data);
    } catch (error: any) {
      // El AuthInterceptor ya notificó el error HTTP (422 / 409 con el motivo)
      console.error('Error al guardar la cuenta:', error);
      this.isdisabled = false;
    } finally {
      this._loadingService.setLoading(false);
    }
  }
}
