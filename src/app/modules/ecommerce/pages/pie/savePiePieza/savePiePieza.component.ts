import { Component, Input, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';

import { PieService } from '../../../services/pie.service';
import { ColumnaPieModel, EnlacePieModel, ImagenColumnaPie, PieModel } from '../../../interfaces/pieModel';

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
  styleUrls: ['./savePiePieza.component.css'],
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
    // «Renombrar» se quedó corto: desde aquí se le pone también la imagen que
    // puede llevar en vez de sus enlaces
    if (!this.esNuevo) { return this.esEnlace ? 'Modificar enlace' : 'Modificar columna'; }
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
    } else {
      // La imagen que la columna puede llevar EN VEZ de sus enlaces. El texto y
      // la dirección se guardan con el título; el fichero va por su puerta
      this.imagen = p.imagen ?? null;
      this.form.addControl('imagen_alt',
        this.fb.control(p.imagen?.alt ?? '', [Validators.maxLength(120)]));
      this.form.addControl('imagen_enlace',
        this.fb.control(p.imagen?.enlace ?? '', [Validators.maxLength(250)]));
    }
  }

  // ================================================================
  // LA IMAGEN DE LA COLUMNA
  // ================================================================
  //
  // CON IMAGEN, LA TIENDA NO ENSEÑA LOS ENLACES de esta columna. No se borran:
  // quitar la imagen los devuelve tal cual, así que probar no cuesta nada.
  //
  // EL FICHERO SE SUBE AL MOMENTO y no con «Guardar»: necesita que la columna
  // exista para colgarse de ella, así que en una columna nueva el bloque no
  // sale hasta que se guarda por primera vez.

  public imagen: ImagenColumnaPie | null = null;
  public subiendo = false;
  /** El pie que devolvió la última subida, para que la pantalla no se quede vieja. */
  private pieActualizado: PieModel | null = null;

  get esColumnaGuardada(): boolean { return !this.esEnlace && !this.esNuevo; }

  get hayImagen(): boolean { return !!this.imagen?.url; }

  /** Lo que va a hacer la imagen al pincharla. */
  get avisoPestanaImagen(): string {
    const enlace: string = (this.form?.controls['imagen_enlace']?.value ?? '').trim();
    if (!enlace) { return ''; }
    return enlace.startsWith('https://')
      ? 'Va a otro sitio: se abrirá en una pestaña nueva.'
      : 'Es de la propia tienda: se abrirá en la misma pestaña.';
  }

  async elegirImagen(evento: Event): Promise<void> {
    const entrada = evento.target as HTMLInputElement;
    const archivo = entrada.files?.[0];
    // Se limpia siempre: sin esto, elegir DOS VECES el mismo fichero no
    // dispara el evento y parece que la pantalla se quedó colgada
    entrada.value = '';
    if (!archivo || this.subiendo) { return; }

    this.subiendo = true;
    try {
      const res: any = await firstValueFrom(
        this._pieService.subirImagenColumna((this.pieza as ColumnaPieModel).id, archivo));
      this.recogerPie(res);
      this._toastr.success(res?.message ?? 'Imagen guardada', 'Listo');
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo subir la imagen', 'Error',
                         { timeOut: 20000, closeButton: true });
    } finally {
      this.subiendo = false;
    }
  }

  async quitarImagen(): Promise<void> {
    if (this.subiendo || !this.hayImagen) { return; }

    this.subiendo = true;
    try {
      const res: any = await firstValueFrom(
        this._pieService.quitarImagenColumna((this.pieza as ColumnaPieModel).id));
      this.recogerPie(res);
      this._toastr.success(res?.message ?? 'Imagen quitada', 'Listo');
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo quitar la imagen', 'Error',
                         { timeOut: 20000, closeButton: true });
    } finally {
      this.subiendo = false;
    }
  }

  /** Del pie que devuelve el servidor, la imagen de ESTA columna. */
  private recogerPie(res: any): void {
    const pie: PieModel | null = res?.data ?? null;
    if (!pie) { return; }
    this.pieActualizado = pie;
    const id = (this.pieza as ColumnaPieModel).id;
    this.imagen = (pie.columnas ?? []).find(c => c.id === id)?.imagen ?? null;
  }

  /**
   * Cerrar sin guardar.
   *
   * SI SE SUBIÓ O SE QUITÓ UNA IMAGEN, eso YA está guardado: se cierra
   * devolviendo el pie para que la pantalla de detrás no enseñe lo de antes.
   */
  cerrar(): void {
    if (this.pieActualizado) {
      this.activeModal.close(this.pieActualizado);
    } else {
      this.activeModal.dismiss();
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
        const payload = {
          titulo: v.texto.trim(),
          activo: v.activo !== false,
          // El fichero NO va aquí: ya se subió por su puerta
          imagen_alt: (v.imagen_alt ?? '').trim() || null,
          imagen_enlace: (v.imagen_enlace ?? '').trim() || null,
        };
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
