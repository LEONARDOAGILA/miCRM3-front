import { Component, Input, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';

import { EncabezadoService } from '../../../services/encabezado.service';
import { EnlaceEncabezadoModel } from '../../../interfaces/encabezadoModel';

import { CampoTextoComponent } from '../../../../../components/campos/campoTexto/campoTexto.component';
import { CampoIconoTiendaComponent } from '../../../../../components/campos/campoIconoTienda/campoIconoTienda.component';
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
  styleUrls: ['./saveEnlaceEncabezado.component.css'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [CommonModule, ReactiveFormsModule, CampoTextoComponent, CampoIconoTiendaComponent, CheckboxComponent],
})
export class SaveEnlaceEncabezadoComponent implements OnInit {

  /** El enlace que se modifica; sin él, se crea uno nuevo. */
  @Input() enlace: EnlaceEncabezadoModel | null = null;
  /** De qué enlace cuelga el nuevo. Null = será uno de los principales. */
  @Input() padreId: number | null = null;
  /** El texto de ese padre, para decirlo en el título. */
  @Input() padreTexto = '';
  /**
   * En qué encabezado nace. Sólo cuenta al crear uno principal: si cuelga
   * de otro enlace, manda el encabezado del padre, y al modificar no se
   * mira —un enlace nace en uno y se queda en él—.
   */
  @Input() encabezadoId: number | null = null;

  public form!: FormGroup;
  public guardando = false;

  private fb = inject(FormBuilder);
  private _encabezadoService = inject(EncabezadoService);
  private _toastr = inject(ToastrService);
  public activeModal = inject(NgbActiveModal);

  get esNuevo(): boolean { return this.enlace === null; }

  /**
   * Cuelga de otro enlace, en vez de estar en la barra.
   *
   * YA NO HACE FALTA QUE SE LO DIGAN: la fila que llega trae su `padre_id`,
   * porque el menú viaja como una lista plana. Mientras fue un árbol anidado,
   * una fila sola era igual en los dos niveles y había que pasarle un
   * `esHijo` desde fuera.
   */
  get esDesplegable(): boolean {
    return this.esNuevo ? this.padreId !== null : this.enlace!.padre_id !== null;
  }

  get titulo(): string {
    if (!this.esNuevo) { return 'Modificar enlace'; }
    return this.esDesplegable ? `Nuevo enlace dentro de «${this.padreTexto}»` : 'Nuevo enlace del menú';
  }

  get ctrlActivo(): FormControl { return this.form.controls['activo'] as FormControl; }
  get ctrlDestacado(): FormControl { return this.form.controls['destacado'] as FormControl; }

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
      // OPCIONAL EN TODOS LOS NIVELES desde que el menú no tiene límite: un
      // enlace que va a tener hijos no la usa, y hasta que los tenga está a
      // medio montar. La rejilla avisa de los que se quedan sin dirección
      enlace: [this.enlace?.enlace ?? '', [Validators.maxLength(250)]],
      icono:  [this.enlace?.icono ?? ''],
      activo: [this.enlace?.activo !== false],
      // Sólo tiene sentido en los principales; en un hijo el campo ni se pinta
      // y va en false, que es lo que la base guardaría de todas formas
      destacado: [this.enlace?.destacado === true],
      // ENTRE QUÉ FECHAS SALE, dentro de las de su encabezado: «Regalos»
      // del 1 de diciembre al 6 de enero, y se apaga solo
      desde: [this.enlace?.desde ?? ''],
      hasta: [this.enlace?.hasta ?? ''],
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
      destacado: !this.esDesplegable && v.destacado === true,
      desde: (v.desde ?? '').trim() || null,
      hasta: (v.hasta ?? '').trim() || null,
    };
    if (this.esNuevo && this.padreId !== null) { payload.padre_id = this.padreId; }

    try {
      const res: any = await firstValueFrom(
        this.esNuevo ? this._encabezadoService.addEnlace(payload, this.encabezadoId)
                     : this._encabezadoService.editEnlace(this.enlace!.id, payload));

      this._toastr.success(res?.message ?? 'Enlace guardado', 'Listo');
      // Se devuelve el menú del encabezado: la pantalla lo pinta tal cual
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
