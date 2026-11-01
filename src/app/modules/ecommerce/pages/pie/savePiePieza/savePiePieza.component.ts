import { Component, Input, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';

import { PieService } from '../../../services/pie.service';
import { ColumnaPieModel, EnlacePieModel } from '../../../interfaces/pieModel';

import { CampoTextoComponent } from '../../../../../components/campos/campoTexto/campoTexto.component';
import { CheckboxComponent } from '../../../../../components/campos/checkbox/checkbox.component';

/**
 * Una COLUMNA o un ENLACE del pie, en el mismo diálogo.
 *
 * Van juntos a propósito: una columna es un título y una palanca, y un enlace
 * es eso más la dirección. Dos diálogos para esa diferencia serían dos
 * ficheros casi iguales que luego se separan al tocar uno y olvidar el otro.
 * Lo que cambia se ve de un vistazo en `esEnlace`.
 *
 * LA DIRECCIÓN ES OBLIGATORIA EN LOS ENLACES. En el pie no hay desplegables:
 * una línea sin dirección parecería pinchable y no llevaría a ninguna parte.
 *
 * NO HAY CASILLA DE «ABRIR EN OTRA PESTAÑA», igual que en el encabezado: la
 * decide el servidor por la dirección. Aquí sólo se dice qué va a pasar.
 */
@Component({
  selector: 'app-savePiePieza',
  templateUrl: './savePiePieza.component.html',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [CommonModule, ReactiveFormsModule, CampoTextoComponent, CheckboxComponent],
})
export class SavePiePiezaComponent implements OnInit {

  /** 'columna' o 'enlace'. */
  @Input() tipo: 'columna' | 'enlace' = 'columna';
  /** Lo que se modifica; sin ello, se crea. */
  @Input() pieza: ColumnaPieModel | EnlacePieModel | null = null;
  /** En qué columna nace el enlace nuevo. */
  @Input() columnaId: number | null = null;
  /** El título de esa columna, para decirlo en la cabecera. */
  @Input() columnaTitulo = '';

  public form!: FormGroup;
  public guardando = false;

  private fb = inject(FormBuilder);
  private _pieService = inject(PieService);
  private _toastr = inject(ToastrService);
  public activeModal = inject(NgbActiveModal);

  get esEnlace(): boolean { return this.tipo === 'enlace'; }
  get esNuevo(): boolean { return this.pieza === null; }

  get titulo(): string {
    if (!this.esNuevo) { return this.esEnlace ? 'Modificar enlace' : 'Renombrar columna'; }
    return this.esEnlace ? `Nuevo enlace en «${this.columnaTitulo}»` : 'Nueva columna';
  }

  get ctrlActivo(): FormControl { return this.form.controls['activo'] as FormControl; }

  /** Lo que va a hacer al pincharlo, en vez de esconderlo tras una casilla. */
  get avisoPestana(): string {
    if (!this.esEnlace) { return ''; }
    const enlace: string = (this.form?.controls['enlace']?.value ?? '').trim();
    if (!enlace) { return ''; }
    return enlace.startsWith('https://')
      ? 'Va a otro sitio: se abrirá en una pestaña nueva.'
      : 'Es de la propia tienda: se abrirá en la misma pestaña.';
  }

  ngOnInit(): void {
    const p: any = this.pieza ?? {};

    this.form = this.fb.group({
      // La columna tiene «titulo»; el enlace, «texto». Se usa un solo control
      // y se traduce al mandar: así el formulario no se duplica.
      texto:  [this.esEnlace ? (p.texto ?? '') : (p.titulo ?? ''),
               [Validators.required, Validators.maxLength(60)]],
      activo: [p.activo !== false],
    });

    if (this.esEnlace) {
      this.form.addControl('enlace',
        this.fb.control(p.enlace ?? '', [Validators.required, Validators.maxLength(250)]));
      this.form.addControl('icono', this.fb.control(p.icono ?? ''));
    }
  }

  async guardar(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.guardando) { return; }

    this.guardando = true;
    const v = this.form.value;

    try {
      let res: any;

      if (this.esEnlace) {
        const payload: any = {
          texto:  v.texto.trim(),
          enlace: (v.enlace ?? '').trim(),
          icono:  (v.icono ?? '').trim() || null,
          activo: v.activo !== false,
        };
        if (this.esNuevo) { payload.columna_id = this.columnaId; }

        res = await firstValueFrom(this.esNuevo
          ? this._pieService.addEnlace(payload)
          : this._pieService.editEnlace((this.pieza as EnlacePieModel).id, payload));

      } else {
        const payload = { titulo: v.texto.trim(), activo: v.activo !== false };
        res = await firstValueFrom(this.esNuevo
          ? this._pieService.addColumna(payload)
          : this._pieService.editColumna((this.pieza as ColumnaPieModel).id, payload));
      }

      this._toastr.success(res?.message ?? 'Guardado', 'Listo');
      // Vuelve el pie entero: la pantalla lo pinta tal cual
      this.activeModal.close(res?.data ?? true);

    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo guardar', 'Error',
                         { timeOut: 20000, closeButton: true });
    } finally {
      this.guardando = false;
    }
  }
}
