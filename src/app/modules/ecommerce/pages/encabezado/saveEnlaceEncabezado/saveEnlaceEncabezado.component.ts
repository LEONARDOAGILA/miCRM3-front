import { Component, Input, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';

import { EncabezadoService } from '../../../services/encabezado.service';
import { EnlaceEncabezadoModel, ICONOS_MENU } from '../../../interfaces/encabezadoModel';

import { CampoTextoComponent } from '../../../../../components/campos/campoTexto/campoTexto.component';
import { ComboComponent } from '../../../../../components/campos/combo/combo.component';
import { CheckboxComponent } from '../../../../../components/campos/checkbox/checkbox.component';

/**
 * Un enlace del menú del encabezado.
 *
 * Sirve para los dos niveles y la diferencia importa:
 *
 *  · Un PRINCIPAL puede no tener dirección. Si tiene desplegables, en la
 *    tienda sólo los abre, y darle dirección además haría que un clic hiciera
 *    dos cosas distintas según dónde cayera.
 *  · Un DESPLEGABLE siempre necesita dirección: si no, sería una línea que
 *    parece pinchable y no lleva a ninguna parte.
 *
 * El icono sale de una lista cerrada porque la tienda los tiene dibujados uno
 * a uno: escribir uno que no conozca deja el enlace sin icono y sin aviso.
 *
 * Y NO HAY CASILLA DE «ABRIR EN OTRA PESTAÑA». La decide el servidor por la
 * dirección: fuera se abre fuera, dentro nunca. Aquí sólo se dice qué va a
 * pasar, para que no sorprenda.
 */
@Component({
  selector: 'app-saveEnlaceEncabezado',
  templateUrl: './saveEnlaceEncabezado.component.html',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [CommonModule, ReactiveFormsModule, CampoTextoComponent, ComboComponent, CheckboxComponent],
})
export class SaveEnlaceEncabezadoComponent implements OnInit {

  /** El enlace que se modifica; sin él, se crea uno nuevo. */
  @Input() enlace: EnlaceEncabezadoModel | null = null;
  /** De qué principal cuelga el nuevo. Null = será principal. */
  @Input() padreId: number | null = null;
  /** El texto del principal, para decirlo en el título. */
  @Input() padreTexto = '';
  /**
   * Al MODIFICAR hace falta saber de qué nivel es, y el enlace que llega no lo
   * dice: el árbol mete a los hijos dentro de `hijos` de su padre, así que la
   * fila por sí sola es igual en los dos niveles. Lo pone quien abre.
   */
  @Input() esHijo = false;

  public form!: FormGroup;
  public guardando = false;
  public readonly iconos = ICONOS_MENU;

  private fb = inject(FormBuilder);
  private _encabezadoService = inject(EncabezadoService);
  private _toastr = inject(ToastrService);
  public activeModal = inject(NgbActiveModal);

  get esNuevo(): boolean { return this.enlace === null; }

  /** Es de segundo nivel: el que se crea dentro de un principal, o el que ya lo era. */
  get esDesplegable(): boolean {
    return this.esNuevo ? this.padreId !== null : this.esHijo;
  }

  get titulo(): string {
    if (!this.esNuevo) { return 'Modificar enlace'; }
    return this.esDesplegable ? `Nuevo enlace dentro de «${this.padreTexto}»` : 'Nuevo enlace del menú';
  }

  get ctrlActivo(): FormControl { return this.form.controls['activo'] as FormControl; }

  /** Lo que va a pasar al pincharlo, para no esconderlo detrás de una casilla. */
  get avisoPestana(): string {
    const enlace: string = (this.form?.controls['enlace'].value ?? '').trim();
    if (!enlace) { return ''; }
    return enlace.startsWith('https://')
      ? 'Va a otro sitio: se abrirá en una pestaña nueva.'
      : 'Es de la propia tienda: se abrirá en la misma pestaña.';
  }

  ngOnInit(): void {
    this.form = this.fb.group({
      texto:  [this.enlace?.texto ?? '', [Validators.required, Validators.maxLength(60)]],
      // Obligatorio sólo en los desplegables (ver la cabecera)
      enlace: [this.enlace?.enlace ?? '',
               this.esDesplegable ? [Validators.required, Validators.maxLength(250)]
                                  : [Validators.maxLength(250)]],
      icono:  [this.enlace?.icono ?? ''],
      activo: [this.enlace?.activo !== false],
    });
  }

  async guardar(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.guardando) { return; }

    this.guardando = true;
    const v = this.form.value;
    const payload: any = {
      texto:  v.texto.trim(),
      enlace: (v.enlace ?? '').trim() || null,
      icono:  v.icono || null,
      activo: v.activo !== false,
    };
    if (this.esNuevo && this.padreId !== null) { payload.padre_id = this.padreId; }

    try {
      const res: any = await firstValueFrom(
        this.esNuevo ? this._encabezadoService.addEnlace(payload)
                     : this._encabezadoService.editEnlace(this.enlace!.id, payload));

      this._toastr.success(res?.message ?? 'Enlace guardado', 'Listo');
      // Se devuelve el encabezado entero: la pantalla lo pinta tal cual
      this.activeModal.close(res?.data ?? true);

    } catch (e: any) {
      // El servidor es el que manda: comprueba la forma de la dirección y que
      // el padre valga. Repetir esas reglas aquí sólo las haría divergir.
      this._toastr.error(e?.error?.message ?? 'No se pudo guardar el enlace', 'Error',
                         { timeOut: 20000, closeButton: true });
    } finally {
      this.guardando = false;
    }
  }
}
