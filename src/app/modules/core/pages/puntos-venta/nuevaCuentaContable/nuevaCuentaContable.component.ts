import { Component, EventEmitter, Input, OnInit, Output, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';

import { ModalArrastrableDirective } from '../../../../../components/modal/modal-arrastrable.directive';
import { ComboComponent } from '../../../../../components/campos/combo/combo.component';
import { CampoTextoComponent } from '../../../../../components/campos/campoTexto/campoTexto.component';
import { PlanCuentaService } from '../../../../contabilidad/services/planCuenta.service';
import { PlanCuentaModel, TIPOS_CUENTA } from '../../../../contabilidad/interfaces/planCuentaModel';

/**
 * Crear una cuenta del plan SIN SALIR de donde se estaba.
 *
 * POR QUÉ EXISTE. Al configurar una caja hace falta «Caja Punto 2», que casi
 * nunca está creada todavía. Obligar al contador a irse al plan de cuentas,
 * crearla, volver y buscarla es el camino por el que se acaban reutilizando
 * cuentas que no tocan: si crear la correcta cuesta tres pantallas y
 * reutilizar una cuesta un clic, se reutiliza.
 *
 * Es una ventana CORTA a propósito: lo que no se puede deducir se pregunta y
 * lo demás se calcula.
 *
 *   · EL PADRE SE ELIGE, y de él sale todo lo demás. Sólo se ofrecen cuentas
 *     de grupo (las que no reciben asientos) y del tipo que admite el
 *     concepto: una cuenta de caja tiene que colgar de una rama de activo.
 *   · EL CÓDIGO LO PROPONE EL SERVIDOR (el siguiente libre dentro del
 *     padre). Se puede cambiar, pero casi nunca hay que hacerlo.
 *   · EL TIPO ES EL DE LA RAMA y no se pregunta: el servidor rechaza una
 *     subcuenta de otro tipo, así que preguntarlo sólo serviría para
 *     equivocarse.
 *   · ES DE MOVIMIENTO siempre: se está creando para que reciba asientos.
 *
 * El mantenimiento completo del plan —mover ramas, cuentas de grupo,
 * papelera— sigue estando en su pantalla; esto es el atajo, no un sustituto.
 */
@Component({
  selector: 'app-nuevaCuentaContable',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ModalArrastrableDirective, ComboComponent, CampoTextoComponent],
  templateUrl: './nuevaCuentaContable.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./nuevaCuentaContable.component.css'],
})
export class NuevaCuentaContableComponent implements OnInit {

  /** Para qué concepto se está creando (sólo para el texto de la cabecera). */
  @Input() concepto = '';
  @Input() conceptoNombre = '';
  /** Los tipos que admite ese concepto: ACTIVO, INGRESO… */
  @Input() tiposPermitidos: string[] = [];
  /** El nombre que se propone, si quien abre sabe cuál debería ser. */
  @Input() nombreSugerido = '';

  /** La cuenta recién creada, tal como la devuelve el servidor. */
  @Output() creada: EventEmitter<PlanCuentaModel> = new EventEmitter();

  public form: FormGroup;
  public guardando = false;

  /** Los padres posibles. Campo y no getter: `[items]` de ng-select. */
  public padres: Array<{ id: number; etiqueta: string; tipo: string; nivel: number }> = [];
  /** Todas las cuentas, para saber de dónde cuelga lo que se elige. */
  private todas: PlanCuentaModel[] = [];

  public cargando = true;

  constructor(
    private fb: FormBuilder,
    public modal: NgbActiveModal,
    private _toastr: ToastrService,
    private _planCuentaService: PlanCuentaService,
  ) {
    this.form = this.fb.group({
      padre_id: [null, [Validators.required]],
      codigo:   ['', [Validators.required]],
      nombre:   ['', [Validators.required, Validators.minLength(2)]],
    });
  }

  async ngOnInit(): Promise<void> {
    if (this.nombreSugerido) { this.form.patchValue({ nombre: this.nombreSugerido }); }
    await this.cargarPadres();

    // Al cambiar de padre, el código se vuelve a proponer: es el siguiente
    // libre DENTRO de esa rama, así que cambia con ella
    this.form.get('padre_id')!.valueChanges.subscribe(() => this.proponerCodigo());
  }

  // ================================================================
  // ESTADO DERIVADO
  // ================================================================

  /** La cuenta padre elegida. */
  get padre(): PlanCuentaModel | null {
    const id = this.form.get('padre_id')?.value;
    return id ? (this.todas.find(c => c.id === Number(id)) ?? null) : null;
  }

  /** El tipo que va a tener: el de la rama. */
  get tipo(): string | null {
    return this.padre?.tipo ?? null;
  }

  /** La naturaleza que le corresponde al tipo (deudora o acreedora). */
  get naturaleza(): string | null {
    return TIPOS_CUENTA.find(t => t.valor === this.tipo)?.naturaleza ?? null;
  }

  get etiquetaTipo(): string {
    return TIPOS_CUENTA.find(t => t.valor === this.tipo)?.etiqueta ?? '—';
  }

  get puedeGuardar(): boolean {
    return !this.guardando && this.form.valid && !!this.tipo;
  }

  // ================================================================
  // DATOS
  // ================================================================

  /**
   * Los padres posibles.
   *
   * Sólo cuentas DE GRUPO: una cuenta de movimiento no puede tener hijas
   * —recibe asientos ella misma— y colgarle una es lo que descuadra un plan.
   * Y sólo de los tipos que admite el concepto.
   */
  private async cargarPadres(): Promise<void> {
    try {
      this.cargando = true;
      const res: any = await firstValueFrom(this._planCuentaService.listPlanCuentas(true));
      this.todas = (res?.data ?? []) as PlanCuentaModel[];

      const tipos = this.tiposPermitidos?.length ? this.tiposPermitidos : TIPOS_CUENTA.map(t => t.valor);

      this.padres = this.todas
        .filter(c => c.es_movimiento === false && c.activo !== false && tipos.includes(c.tipo as string))
        .map(c => ({
          id: c.id,
          // La sangría deja ver la rama de un vistazo en el desplegable
          etiqueta: ' '.repeat(Math.max(0, (c.nivel ?? 0) * 2)) + `${c.codigo} · ${c.nombre}`,
          tipo: c.tipo as string,
          nivel: c.nivel ?? 0,
        }));

      // Si sólo hay una rama posible, se elige sola
      if (this.padres.length === 1) {
        this.form.patchValue({ padre_id: this.padres[0].id });
      }

    } catch (e) {
      console.error('Error al cargar el plan de cuentas:', e);
    } finally {
      this.cargando = false;
    }
  }

  /** El siguiente código libre dentro del padre elegido. */
  private async proponerCodigo(): Promise<void> {
    const padreId = this.form.get('padre_id')?.value;
    if (!padreId) { this.form.patchValue({ codigo: '' }); return; }

    try {
      const res: any = await firstValueFrom(this._planCuentaService.codigoSugerido(Number(padreId)));
      const sugerido = res?.data?.codigo ?? res?.data ?? '';
      if (sugerido) { this.form.patchValue({ codigo: sugerido }); }
    } catch (e) {
      // Sin sugerencia se escribe a mano: no es motivo para parar
      console.error('No se pudo proponer el código:', e);
    }
  }

  // ================================================================
  // GUARDAR
  // ================================================================

  async guardar(): Promise<void> {
    if (!this.puedeGuardar) {
      this.form.markAllAsTouched();
      return;
    }

    const d = this.form.getRawValue();

    try {
      this.guardando = true;
      const res: any = await firstValueFrom(this._planCuentaService.addPlanCuenta({
        padre_id:      Number(d.padre_id),
        codigo:        String(d.codigo).trim(),
        nombre:        String(d.nombre).trim(),
        tipo:          this.tipo,
        naturaleza:    this.naturaleza,
        // Se crea para recibir asientos: si fuera de grupo no se podría
        // elegir en ningún concepto
        es_movimiento: true,
        activo:        true,
      }));

      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo crear la cuenta', 'Error');
        return;
      }

      this._toastr.success(res.message, 'Cuenta creada', { closeButton: true });
      this.creada.emit(res.data);
      this.modal.close(res.data);

    } catch (e) {
      // El AuthInterceptor ya enseñó el error HTTP (código repetido, etc.)
      console.error('Error al crear la cuenta:', e);
    } finally {
      this.guardando = false;
    }
  }
}
