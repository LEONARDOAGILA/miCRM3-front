import { Component, EventEmitter, Input, OnDestroy, OnInit, Output, ChangeDetectionStrategy } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { Subject, firstValueFrom } from 'rxjs';

import { SeguridadService } from '../../../../../seguridad/services/seguridad.service';
import { LoadingService } from '../../../../../../service/loading.service';
import { GrupoClienteService } from '../../../../services/grupoCliente.service';
import { GrupoClienteModel, FORMAS_PAGO_GRUPO } from '../../../../interfaces/grupoClienteModel';
import { CommonModule } from '@angular/common';
import { PanelComponent } from '../../../../../../components/panel/panel.component';
import { ModalHeaderComponent } from '../../../../../../components/modal/modal-header/modal-header.component';
import { ModalFooterComponent } from '../../../../../../components/modal/modal-footer/modal-footer.component';
import { ComboComponent } from '../../../../../../components/campos/combo/combo.component';
import { CampoTextoComponent } from '../../../../../../components/campos/campoTexto/campoTexto.component';
import { CampoTextoAreaComponent } from '../../../../../../components/campos/campoTextoArea/campoTextoArea.component';
import { CampoNumeroEnteroComponent } from '../../../../../../components/campos/campoNumeroEntero/campoNumeroEntero.component';
import { CheckboxComponent } from '../../../../../../components/campos/checkbox/checkbox.component';
import { CampoIconoComponent } from '../../../../../../components/campos/campoIcono/campoIcono.component';

/** Acciones con las que se abre el modal desde allGruposClientes. */
type AccionGrupoCliente = 'add' | 'edit' | 'clon' | 'view';

/**
 * Alta, modificación, clonación y vista de un grupo
 * (ventas.grupos_clientes).
 *
 * EL PADRE NO SE ELIGE AQUÍ. Al crear llega decidido —«Nueva» cuelga de la
 * raíz, «Nuevo subgrupo» cuelga de la fila marcada— y al modificar NO SE
 * PUEDE CAMBIAR: mover una rama es otra cosa (hay que mirar ciclos, el nivel
 * de todo lo que cuelga y renumerar hermanos) y se hace arrastrando en la
 * rejilla, que además enseña dónde va a caer. Un combo de padres escondido
 * en un formulario reordena el árbol sin que nadie lo vea.
 */
@Component({
  selector: 'app-saveGrupoCliente',
  templateUrl: './saveGrupoCliente.component.html',
  styleUrls: ['./saveGrupoCliente.component.css'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    CommonModule, ReactiveFormsModule, PanelComponent, ModalHeaderComponent,
    ModalFooterComponent, ComboComponent, CampoTextoComponent,
    CampoTextoAreaComponent, CampoNumeroEnteroComponent, CheckboxComponent,
    CampoIconoComponent,
  ],
})
export class SaveGrupoClienteComponent implements OnInit, OnDestroy {

  /** Registro a editar / clonar / ver, o 0 al crear. */
  @Input() registro_selected: any = {};
  @Input() accion: AccionGrupoCliente = 'add';
  /** De quién va a colgar la nueva; null para un grupo de primer nivel. */
  @Input() padre: GrupoClienteModel | null = null;
  @Output() registrosE: EventEmitter<any> = new EventEmitter();

  public form: FormGroup;
  public isLoading$ = this._loadingService.isLoading$;
  public response: any;
  public isdisabled = false;
  public titulo = '';
  public textoClon = '';
  public grupoModel: GrupoClienteModel | null = null;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    public modal: NgbActiveModal,
    private _toastr: ToastrService,
    private _loadingService: LoadingService,
    private _seguridadService: SeguridadService,
    private _grupoClienteService: GrupoClienteService,
  ) {}

  // ================================================================
  // ESTADO DERIVADO
  // ================================================================

  get esView(): boolean { return this.accion === 'view'; }
  get esNuevo(): boolean { return this.accion === 'add' || this.accion === 'clon'; }
  get ctrlActivo(): FormControl { return this.form.controls['activo'] as FormControl; }
  get ctrlIcono(): FormControl { return this.form.controls['icono'] as FormControl; }

  /** Las formas de pago, con la opción de heredar delante. */
  public readonly formasPago = FORMAS_PAGO_GRUPO;

  /**
   * Lo que saldría del grupo de arriba en cada condición, ya formateado.
   *
   * Se calcula una vez (no es un getter) porque va a `@if` y a texto del
   * formulario: recalcularlo en cada ciclo de pintado no aporta nada y el
   * padre no cambia mientras el modal está abierto.
   */
  public heredado: Record<string, { valor: string; de: string }> = {};

  /** Las cuatro, con su etiqueta, para no repetirlas en cada sitio. */
  public static readonly CONDICIONES = ['forma_pago', 'limite_credito', 'dias_credito', 'descuento'];

  /** Subgrupos directos (sólo informativo, viene del back). */
  get numHijos(): number {
    return Number(this.grupoModel?.num_hijos ?? this.registro_selected?.num_hijos ?? 0);
  }

  /** Clientes en este grupo (sólo informativo). */
  get numClientes(): number {
    return Number(this.grupoModel?.num_clientes ?? this.registro_selected?.num_clientes ?? 0);
  }

  /** Dónde va a quedar: la ruta del padre, o «Primer nivel» si no tiene. */
  get dondeVa(): string {
    if (this.accion === 'add' || this.accion === 'clon') {
      return this.padre ? (this.padre.ruta || this.padre.nombre) : 'Primer nivel (raíz)';
    }
    const ruta = this.grupoModel?.ruta ?? '';
    const corte = ruta.lastIndexOf(' > ');
    return corte > 0 ? ruta.slice(0, corte) : 'Primer nivel (raíz)';
  }

  /** El nivel que va a tener: el del padre más uno. */
  get nivelResultante(): number {
    if (this.accion === 'add' || this.accion === 'clon') {
      return this.padre ? Number(this.padre.nivel ?? 0) + 1 : 0;
    }
    return Number(this.grupoModel?.nivel ?? 0);
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
        this.titulo = this.padre ? 'Nuevo Subgrupo' : 'Nuevo Grupo';
        // Las cuatro se quedan vacías a propósito: así el nuevo hereda del
        // padre y sólo se escribe lo que de verdad cambia.
        this.calcularHeredado();
        break;
      case 'edit':
        this.titulo = 'Modificar Grupo';
        await this.findByIdGrupoCliente(this.registro_selected.id);
        break;
      case 'clon':
        this.titulo = 'Clonar Grupo';
        this.textoClon = '_CLON';
        await this.findByIdGrupoCliente(this.registro_selected.id);
        break;
      case 'view':
        this.titulo = 'Ver Grupo';
        await this.findByIdGrupoCliente(this.registro_selected.id);
        break;
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  //   ******   INICIALIZA FORMULARIO   ******  //
  initializeForm(): void {
    this.form = this.fb.group({
      nombre:      [{ value: '', disabled: this.isdisabled }, [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
      icono:       [{ value: '', disabled: this.isdisabled }, [Validators.maxLength(50)]],
      descripcion: [{ value: '', disabled: this.isdisabled }, [Validators.maxLength(2000)]],
      activo:      [{ value: true, disabled: this.isdisabled }],

      // LAS CUATRO CONDICIONES, VACÍAS POR OMISIÓN. Vacío no es cero: es
      // «lo que diga el grupo de arriba». Un cero escrito a mano sí es un
      // cero, y por eso no se rellenan con 0 como en la ficha del cliente.
      forma_pago:     [{ value: '', disabled: this.isdisabled }],
      limite_credito: [{ value: '', disabled: this.isdisabled }, [Validators.min(0), Validators.max(9999999999)]],
      dias_credito:   [{ value: '', disabled: this.isdisabled }, [Validators.min(0), Validators.max(3650)]],
      descuento:      [{ value: '', disabled: this.isdisabled }, [Validators.min(0), Validators.max(100)]],
    });
  }

  //   ******   CARGA EL REGISTRO   ******  //
  async findByIdGrupoCliente(id: number): Promise<void> {
    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._grupoClienteService.findByIdGrupoCliente(id));
      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo obtener el grupo', 'Error');
        return;
      }
      this.grupoModel = res.data;
      this.form.patchValue({
        nombre:      (this.grupoModel!.nombre ?? '') + this.textoClon,
        icono:       this.grupoModel!.icono ?? '',
        descripcion: this.grupoModel!.descripcion ?? '',
        activo:      this.grupoModel!.activo !== false,
        // Lo PROPIO del grupo, no lo heredado: si se copiara lo heredado,
        // guardar lo convertiría en propio y el grupo dejaría de seguir a su
        // padre sin que nadie lo haya pedido.
        forma_pago:     this.grupoModel!.forma_pago ?? '',
        limite_credito: this.grupoModel!.limite_credito ?? '',
        dias_credito:   this.grupoModel!.dias_credito ?? '',
        descuento:      this.grupoModel!.descuento ?? '',
      });

      this.calcularHeredado();

    } catch (error) {
      // El AuthInterceptor ya muestra el toast del error HTTP
      console.error('Error al cargar el grupo:', error);
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  /** Igual que en la rejilla: el cupo y el descuento con dos decimales. */
  private formatear(campo: string, valor: any): string {
    if (campo === 'forma_pago') { return String(valor); }
    const n = Number(valor);
    if (!Number.isFinite(n)) { return String(valor); }
    if (campo === 'dias_credito') { return String(n); }
    return n.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /**
   * Lo que saldría del grupo de arriba en cada condición.
   *
   * Sale de las CONDICIONES RESUELTAS DEL PADRE, que ya traen lo heredado de
   * más arriba: con «Cadenas» dentro de «Mayoristas», lo que hereda no es lo
   * que tenga escrito Mayoristas sino lo que Mayoristas usa de verdad.
   */
  private calcularHeredado(): void {
    const arriba = (this.padre as any)?.condiciones ?? null;
    this.heredado = {};
    if (!arriba) { return; }

    const etiquetas: Record<string, string> = {
      forma_pago:     'Forma de pago',
      limite_credito: 'Cupo de crédito',
      dias_credito:   'Días de crédito',
      descuento:      'Descuento',
    };

    for (const campo of SaveGrupoClienteComponent.CONDICIONES) {
      const c = arriba[campo];
      if (!c || c.efectivo === null || c.efectivo === undefined) { continue; }
      this.heredado[campo] = {
        valor: this.formatear(campo, c.efectivo),
        de: c.origen_id === this.padre?.id
              ? `${etiquetas[campo]} de «${this.padre?.nombre}»`
              : String(c.origen_etiqueta ?? '').replace(/^Hereda[dos]*\s+de\s+/i, 'De «') + '»',
      };
    }
  }

  // El icono lo lleva <app-campoIcono>, que ya trae el selector: se elige de
  // una lista y no se escribe a mano porque `fa-snowflake` mal escrito no da
  // ningun error, simplemente no se ve nada y nadie sabe por que.

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

    const payload: any = this.form.getRawValue();
    payload.icono       = (payload.icono ?? '').trim() || null;
    payload.descripcion = (payload.descripcion ?? '').trim() || null;

    // VACÍO VIAJA COMO NULL, que en la tabla significa «lo que diga el grupo
    // de arriba». Un 0 escrito a mano es un 0 de verdad y se manda tal cual:
    // de ahí que no valga un `|| null`, que convertiría el cero en nulo.
    payload.forma_pago = (payload.forma_pago ?? '').toString().trim() || null;
    for (const campo of ['limite_credito', 'dias_credito', 'descuento']) {
      const v = payload[campo];
      payload[campo] = (v === '' || v === null || v === undefined) ? null : Number(v);
    }

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
        this.response = await firstValueFrom(this._grupoClienteService.editGrupoCliente(this.registro_selected.id, data));
      } else {
        this.response = await firstValueFrom(
          this.accion === 'clon' ? this._grupoClienteService.clonGrupoCliente(data) : this._grupoClienteService.addGrupoCliente(data)
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
      console.error('Error al guardar el grupo:', error);
      this.isdisabled = false;
    } finally {
      this._loadingService.setLoading(false);
    }
  }
}
