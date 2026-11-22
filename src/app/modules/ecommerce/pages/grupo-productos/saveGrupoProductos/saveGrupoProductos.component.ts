import { Component, Input, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';

import { GrupoProductosService } from '../../../services/grupoProductos.service';
import { GrupoProductosModel } from '../../../interfaces/grupoProductosModel';
import { CampoTextoComponent } from '../../../../../components/campos/campoTexto/campoTexto.component';

/**
 * EL NOMBRE Y LA VIGENCIA DE UNA SECCIÓN DE PRODUCTOS.
 *
 * Un grupo no tiene más que eso: su nombre, entre qué fechas se ve, y los
 * productos que lleva dentro. Los productos se eligen en la pantalla —la
 * rejilla del medio— porque son cientos y no caben en un diálogo; aquí queda
 * lo que sí es un formulario.
 *
 * Sirve para crear y para renombrar; la diferencia es si llega `grupo`.
 *
 * LA VIGENCIA ES EL MOTIVO DE QUE HAYA FECHAS AQUÍ: el grupo de navidad se
 * arma en noviembre y tiene que apagarse sola el 7 de enero. Con sólo la
 * palanca de encendido, alguien tiene que acordarse de volver a apagarla.
 */
@Component({
  selector: 'app-saveGrupoProductos',
  templateUrl: './saveGrupoProductos.component.html',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [CommonModule, ReactiveFormsModule, CampoTextoComponent],
})
export class SaveGrupoProductosComponent implements OnInit {

  /** El grupo que se modifica; sin ella, se crea una nueva. */
  @Input() grupo: GrupoProductosModel | null = null;

  public form!: FormGroup;
  public guardando = false;

  private fb = inject(FormBuilder);
  private _grupoService = inject(GrupoProductosService);
  private _toastr = inject(ToastrService);
  public activeModal = inject(NgbActiveModal);

  get esNueva(): boolean { return this.grupo === null; }
  get titulo(): string { return this.esNueva ? 'Nueva grupo' : 'Modificar grupo'; }

  ngOnInit(): void {
    this.form = this.fb.group({
      nombre: [this.grupo?.nombre ?? '',
               [Validators.required, Validators.minLength(2), Validators.maxLength(80)]],
      desde:  [this.grupo?.desde ?? ''],
      hasta:  [this.grupo?.hasta ?? ''],
    });
  }

  /** Lo que se lee debajo de las fechas, en palabras. */
  get queVigencia(): string {
    const d = this.form?.value?.desde;
    const h = this.form?.value?.hasta;
    if (!d && !h) { return 'Sin fechas: se ve mientras esté encendida.'; }
    if (d && !h)  { return 'Se empieza a ver en esa fecha y no se apaga sola.'; }
    if (!d && h)  { return 'Se ve desde ya y se apaga sola en esa fecha.'; }
    return 'Se ve sólo entre esas dos fechas.';
  }

  async guardar(): Promise<void> {
    this.form.controls['nombre'].markAsTouched();
    if (this.form.invalid || this.guardando) { return; }

    // El vacío del <input type="datetime-local"> es '', y el servidor espera
    // null para «sin fecha»: '' llegaría a la base como un timestamp inválido.
    const datos = {
      nombre: String(this.form.value.nombre).trim(),
      desde:  this.form.value.desde || null,
      hasta:  this.form.value.hasta || null,
    };

    this.guardando = true;
    try {
      // Si el nombre choca con otro lo dice el servidor: compara sin tildes ni
      // mayúsculas, y repetir esa regla aquí es separarlas a la primera.
      const res: any = await firstValueFrom(
        this.esNueva ? this._grupoService.addGrupo(datos)
                     : this._grupoService.editGrupo(this.grupo!.id, datos));

      this._toastr.success(res?.message ?? 'Grupo guardada', 'Listo');
      this.activeModal.close(res?.data ?? true);

    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo guardar el grupo', 'Error',
                         { timeOut: 15000, closeButton: true });
    } finally {
      this.guardando = false;
    }
  }
}
