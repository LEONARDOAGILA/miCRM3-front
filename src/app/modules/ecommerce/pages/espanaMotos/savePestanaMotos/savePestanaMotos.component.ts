import { Component, Input, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';

import { EspanaMotosService } from '../../../services/espanaMotos.service';
import { CategoriaService } from '../../../../inventarios/services/categoria.service';
import { PestanaMotosModel } from '../../../interfaces/espanaMotosModel';

import { CampoTextoComponent } from '../../../../../components/campos/campoTexto/campoTexto.component';
import { CheckboxComponent } from '../../../../../components/campos/checkbox/checkbox.component';
import { ComboMultiSeleccionComponent }
  from '../../../../../components/campos/combo-multi-seleccion/combo-multi-seleccion.component';

/**
 * Una PESTAÑA del catálogo de España Motos.
 *
 * Una pestaña es un nombre («A gasolina», «Eléctricas») y las categorías del
 * catálogo que agrupa. Al pincharla en la tienda, el catálogo se limita a esas
 * categorías.
 *
 * SIN CATEGORÍAS NO SE DEJA GUARDAR: sería un botón que no enseña nada. El
 * servidor se niega igual, pero decirlo aquí evita el viaje.
 *
 * Las categorías se eligen con el combo de selección múltiple de la casa, que
 * enseña TODAS las elegidas en vez de un «+3»: lo que se está agrupando tiene
 * que poder leerse sin pasar el ratón por encima de un número.
 */
@Component({
  selector: 'app-savePestanaMotos',
  templateUrl: './savePestanaMotos.component.html',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    CommonModule, ReactiveFormsModule,
    CampoTextoComponent, CheckboxComponent, ComboMultiSeleccionComponent,
  ],
})
export class SavePestanaMotosComponent implements OnInit {

  /** La pestaña que se modifica; sin ella, se crea. */
  @Input() pestana: PestanaMotosModel | null = null;

  public form!: FormGroup;
  public guardando = false;
  public cargandoCategorias = true;

  /**
   * Las categorías del catálogo.
   *
   * VA EN UN CAMPO y no en un getter: si el array es nuevo en cada ciclo de
   * detección de cambios, ng-select pierde lo elegido.
   */
  public categorias: any[] = [];

  private fb = inject(FormBuilder);
  private _motosService = inject(EspanaMotosService);
  private _categoriaService = inject(CategoriaService);
  private _toastr = inject(ToastrService);
  public activeModal = inject(NgbActiveModal);

  get esNueva(): boolean { return this.pestana === null; }
  get titulo(): string { return this.esNueva ? 'Nueva pestaña' : 'Modificar pestaña'; }
  get ctrlActivo(): FormControl { return this.form.controls['activo'] as FormControl; }
  get ctrlCategorias(): FormControl { return this.form.controls['categorias'] as FormControl; }

  get cuantas(): number { return (this.ctrlCategorias?.value ?? []).length; }

  async ngOnInit(): Promise<void> {
    this.form = this.fb.group({
      nombre:     [this.pestana?.nombre ?? '', [Validators.required, Validators.maxLength(30)]],
      categorias: [this.pestana?.categorias ?? [], [Validators.required, Validators.minLength(1)]],
      activo:     [this.pestana?.activo !== false],
    });

    await this.cargarCategorias();
  }

  private async cargarCategorias(): Promise<void> {
    this.cargandoCategorias = true;
    try {
      const res: any = await firstValueFrom(this._categoriaService.listCategorias(true));
      // Se enseña la ruta completa si viene: fuera del árbol, «Accesorios» a
      // secas no dice de qué.
      this.categorias = (res?.data ?? []).map((c: any) => ({
        id: c.id,
        nombre: c.ruta ?? c.nombre,
      }));
    } catch {
      this._toastr.error('No se pudo cargar el catálogo de categorías', 'Error');
      this.categorias = [];
    } finally {
      this.cargandoCategorias = false;
    }
  }

  async guardar(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.guardando) { return; }

    if (!this.cuantas) {
      this._toastr.error('Elige al menos una categoría: una pestaña sin categorías no enseña nada.',
                         'Falta algo', { timeOut: 15000, closeButton: true });
      return;
    }
    if (this.form.controls['nombre'].invalid) { return; }

    this.guardando = true;
    const v = this.form.value;
    const payload = {
      nombre: v.nombre.trim(),
      categorias: v.categorias ?? [],
      activo: v.activo !== false,
    };

    try {
      const res: any = await firstValueFrom(
        this.esNueva ? this._motosService.addPestana(payload)
                     : this._motosService.editPestana(this.pestana!.id, payload));

      this._toastr.success(res?.message ?? 'Pestaña guardada', 'Listo');
      // Vuelve la configuración entera: la pantalla la pinta tal cual
      this.activeModal.close(res?.data ?? true);

    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo guardar la pestaña', 'Error',
                         { timeOut: 20000, closeButton: true });
    } finally {
      this.guardando = false;
    }
  }
}
