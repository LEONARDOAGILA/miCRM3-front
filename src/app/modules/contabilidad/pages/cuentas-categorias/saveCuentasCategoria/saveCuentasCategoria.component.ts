import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnDestroy, OnInit, Output, ChangeDetectionStrategy } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { Subject, firstValueFrom } from 'rxjs';

import { PanelComponent } from '../../../../../components/panel/panel.component';
import { ModalHeaderComponent } from '../../../../../components/modal/modal-header/modal-header.component';
import { ModalFooterComponent } from '../../../../../components/modal/modal-footer/modal-footer.component';
import { ComboComponent } from '../../../../../components/campos/combo/combo.component';

import { SeguridadService } from '../../../../seguridad/services/seguridad.service';
import { LoadingService } from '../../../../../service/loading.service';
import { CuentaConfigService } from '../../../services/cuentaConfig.service';
import { PlanCuentaService } from '../../../services/planCuenta.service';
import { AmbitoContable, ConceptoConfigurado, NO_APLICA, ValorCuenta } from '../../../interfaces/cuentaConfigModel';
import { PlanCuentaModel } from '../../../interfaces/planCuentaModel';

/**
 * Las cuentas contables de una categoría (y, el día que haga falta, de un
 * cliente o una sucursal: lo único que cambia es el ámbito).
 *
 * LO QUE HAY QUE ENTENDER AL MIRAR ESTA FICHA es que cada concepto tiene dos
 * cuentas: la que se le ha puesto a ESTA categoría y la que se usaría de
 * verdad, que puede venir de una categoría de arriba o de la configuración
 * por omisión. El campo edita la primera; debajo se dice de dónde sale la
 * segunda, que es lo que contesta la pregunta «¿y entonces con qué cuenta se
 * va a asentar esto?».
 *
 * Dejar un campo en blanco NO es un error: es «la que diga la de arriba».
 *
 * En el desplegable sólo salen las cuentas que el concepto admite —el
 * ingreso, cuentas de ingreso— y sólo las DE MOVIMIENTO, que son las que
 * reciben asientos. El servidor lo vuelve a comprobar.
 *
 * Y arriba del todo está «No aplica», que es el tercer estado: aquí este
 * concepto NO EXISTE —un servicio no mueve inventario— y no se hereda nada.
 * Va dentro del mismo desplegable y no en un interruptor aparte: con tres
 * opciones en un sitio no hay forma de que dos mandos se contradigan.
 */
@Component({
  selector: 'app-saveCuentasCategoria',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, PanelComponent, ModalHeaderComponent, ModalFooterComponent, ComboComponent],
  templateUrl: './saveCuentasCategoria.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./saveCuentasCategoria.component.css'],
})
export class SaveCuentasCategoriaComponent implements OnInit, OnDestroy {

  /** De qué se configuran las cuentas. */
  @Input() ambito: AmbitoContable = 'CATEGORIA';
  @Input() ambitoId: number | null = null;
  /** Para el título, sin tener que esperar a la carga. */
  @Input() titulo = '';
  /** Sólo lectura: sin permiso de editar se mira pero no se guarda. */
  @Input() soloLectura = false;

  @Output() guardado: EventEmitter<any> = new EventEmitter();

  public form!: FormGroup;
  public isLoading$ = this._loadingService.isLoading$;
  public conceptos: ConceptoConfigurado[] = [];
  public donde: string = '';
  public isdisabled = false;

  /**
   * Las cuentas que puede elegir cada concepto, ya filtradas.
   *
   * A un campo y no a un getter: con un getter, `[items]` recibe un array
   * nuevo en cada ciclo y el ng-select pierde la selección.
   */
  public itemsPorConcepto: Record<string, any[]> = {};

  private readonly destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    public modal: NgbActiveModal,
    private _toastr: ToastrService,
    private _loadingService: LoadingService,
    private _seguridadService: SeguridadService,
    private _cuentaConfigService: CuentaConfigService,
    private _planCuentaService: PlanCuentaService,
  ) {}

  async ngOnInit(): Promise<void> {
    if (this._seguridadService.isexpired()) {
      this.modal.close();
      return;
    }
    this.form = this.fb.group({});
    await this.cargar();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ================================================================
  // DATOS
  // ================================================================

  /** La configuración y las cuentas que se pueden elegir, a la vez. */
  private async cargar(): Promise<void> {
    try {
      this._loadingService.setLoading(true);

      const [config, cuentas]: any[] = await Promise.all([
        firstValueFrom(this._cuentaConfigService.obtener(this.ambito, this.ambitoId)),
        firstValueFrom(this._planCuentaService.listPlanCuentas(true)),
      ]);

      if (config?.status !== 'success') {
        this._toastr.error(config?.message || 'No se pudo obtener la configuración contable', 'Error');
        return;
      }

      this.conceptos = config.data?.conceptos ?? [];
      this.donde = config.data?.donde?.etiqueta ?? '';

      // SÓLO LAS DE MOVIMIENTO: las de grupo agrupan y no reciben asientos
      const deMovimiento = ((cuentas?.data ?? []) as PlanCuentaModel[])
        .filter(c => c.es_movimiento === true && c.activo !== false)
        .map(c => ({ id: c.id, etiqueta: `${c.codigo} · ${c.nombre}`, tipo: c.tipo }));

      const grupo: Record<string, any[]> = {};
      const controles: Record<string, FormControl> = {};
      this.conceptos.forEach(c => {
        // «No aplica» la primera, para que se vea sin desplegar la lista
        grupo[c.concepto] = [
          { id: NO_APLICA, etiqueta: 'No aplica · aquí no se usa esta cuenta', tipo: null },
          ...deMovimiento.filter(x => (c.tipos_permitidos || []).includes(x.tipo)),
        ];
        controles[c.concepto] = new FormControl({
          value: c.propia?.no_aplica ? NO_APLICA : (c.propia?.cuenta_id ?? null),
          disabled: this.soloLectura,
        });
      });
      this.itemsPorConcepto = grupo;
      this.form = this.fb.group(controles);

    } catch (error) {
      // El AuthInterceptor ya muestra el toast del error HTTP
      console.error('Error al cargar la configuración contable:', error);
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  // ================================================================
  // ESTADO DERIVADO
  // ================================================================

  ctrl(concepto: string): FormControl {
    return this.form.controls[concepto] as FormControl;
  }

  /** La opción «no aplica», para compararla en la plantilla. */
  public readonly NO_APLICA = NO_APLICA;

  /** Cuántas tiene puestas ella misma; el resto se heredan. */
  get cuantasPropias(): number {
    return this.conceptos.filter(c => this.ctrl(c.concepto)?.value != null).length;
  }

  /** Si en este concepto se eligió «no aplica». */
  esNoAplica(c: ConceptoConfigurado): boolean {
    return this.ctrl(c.concepto)?.value === NO_APLICA;
  }

  /**
   * Lo que se hereda, cuando lo heredado es un «no aplica» de más arriba.
   *
   * Se dice aparte porque no es lo mismo «nadie lo ha configurado» que
   * «arriba dijeron que aquí no existe»: lo segundo es una respuesta.
   */
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

  /** Si lo que hay puesto es propio de esta categoría. */
  esPropia(c: ConceptoConfigurado): boolean {
    return this.ctrl(c.concepto)?.value != null;
  }

  // ================================================================
  // GUARDAR
  // ================================================================

  public async onSubmitForm($ev?: any): Promise<void> {
    $ev?.preventDefault?.();
    if (this.soloLectura) { return; }
    this._toastr.clear();

    // Se mandan TODOS, también los vacíos: un nulo es lo que quita la cuenta
    // propia y devuelve el concepto a la de arriba
    const cuentas: Record<string, ValorCuenta> = {};
    this.conceptos.forEach(c => {
      const v = this.ctrl(c.concepto)?.value;
      if (v === NO_APLICA) { cuentas[c.concepto] = NO_APLICA; }
      else { cuentas[c.concepto] = v == null || v === '' ? null : Number(v); }
    });

    try {
      this._loadingService.setLoading(true);
      this.isdisabled = true;

      const res: any = await firstValueFrom(
        this._cuentaConfigService.guardar(this.ambito, this.ambitoId, cuentas));

      if (res?.status !== 'success') {
        this.isdisabled = false;
        return;
      }

      this.guardado.emit(res.data);
      this._toastr.success(res.message, 'Éxito', { closeButton: true });
      this.modal.close(res.data);

    } catch (error) {
      // El AuthInterceptor ya notificó el error HTTP (409 con el motivo)
      console.error('Error al guardar las cuentas contables:', error);
      this.isdisabled = false;
    } finally {
      this._loadingService.setLoading(false);
    }
  }
}
