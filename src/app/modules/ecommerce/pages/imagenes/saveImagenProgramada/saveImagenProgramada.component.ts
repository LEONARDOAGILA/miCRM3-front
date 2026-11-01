import { Component, Input, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';

import { CategoriaWebService } from '../../../services/categoriaWeb.service';
import { MarcaWebService } from '../../../services/marcaWeb.service';
import { ImagenProgramadaModel } from '../../../interfaces/imagenProgramadaModel';

import { CampoTextoComponent } from '../../../../../components/campos/campoTexto/campoTexto.component';
import { CheckboxComponent } from '../../../../../components/campos/checkbox/checkbox.component';

/**
 * PROGRAMAR UNA IMAGEN, de una categoría o de una marca.
 *
 * ES EL MISMO MODAL PARA LAS DOS porque se administran igual: un fichero y
 * entre qué fechas se ve. Lo único que cambia es a quién se le guarda, y eso
 * llega en `tipo`. Dos copias de esto acabarían comportándose distinto.
 *
 * Se sube el fichero y se dice entre qué fechas se ve. SIN FECHAS ES
 * ILIMITADA —«desde siempre» y «para siempre»—, que es el caso normal y por
 * eso no hay que escribir nada para conseguirlo.
 *
 * AL MODIFICAR, EL FICHERO ES OPCIONAL: cambiar las fechas o el nombre no
 * debería obligar a volver a subir la misma foto.
 *
 * SE VE ANTES DE SUBIRLA. El navegador la pinta desde el disco sin pasar por
 * el servidor, y así se descubre aquí que uno se equivocó de fichero y no
 * tres pantallas después, mirando la tienda.
 */
@Component({
  selector: 'app-saveImagenProgramada',
  templateUrl: './saveImagenProgramada.component.html',
  styleUrls: ['./saveImagenProgramada.component.css'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [CommonModule, ReactiveFormsModule, CampoTextoComponent, CheckboxComponent],
})
export class SaveImagenProgramadaComponent implements OnInit {

  /** De quién es la imagen: decide a qué servicio se le guarda. */
  @Input() tipo: 'categoria' | 'marca' = 'categoria';

  /** El id de esa categoría o marca. Hace falta siempre. */
  @Input() duenioId!: number;
  /** Su nombre, para la cabecera del modal. */
  @Input() duenioNombre = '';

  /** La imagen que se modifica; sin ella, se programa una nueva. */
  @Input() imagen: ImagenProgramadaModel | null = null;

  public form!: FormGroup;
  public guardando = false;

  /** El fichero elegido, fuera del formulario: no es un campo que se escriba. */
  public fichero: File | null = null;
  /** Lo que se enseña: la del disco si se acaba de elegir, si no la guardada. */
  public vistaPrevia: string | null = null;

  private fb = inject(FormBuilder);
  private _categoriaService = inject(CategoriaWebService);
  private _marcaService = inject(MarcaWebService);
  private _toastr = inject(ToastrService);
  public activeModal = inject(NgbActiveModal);

  get esNueva(): boolean { return this.imagen === null; }
  get titulo(): string { return this.esNueva ? 'Programar una imagen' : 'Modificar la imagen'; }
  get ctrlActivo(): FormControl { return this.form.controls['activo'] as FormControl; }

  /** Sin fechas, se ve siempre: decirlo evita que se rellenen «por si acaso». */
  get esIlimitada(): boolean {
    const v = this.form?.value ?? {};
    return !(v.desde || '').trim() && !(v.hasta || '').trim();
  }

  ngOnInit(): void {
    const i = this.imagen;
    this.vistaPrevia = i?.imagen_url ?? null;

    this.form = this.fb.group({
      nombre: [i?.nombre ?? '', [Validators.maxLength(100)]],
      desde:  [i?.desde ?? ''],
      hasta:  [i?.hasta ?? ''],
      activo: [i?.activo !== false],
    });
  }

  /**
   * Guarda el fichero elegido y lo pinta desde el disco.
   *
   * SE LIMPIA EL `<input type=file>` SÓLO SI NO VALE: si no, elegir dos veces
   * el mismo fichero no dispara el evento la segunda vez, porque su valor no
   * ha cambiado, y parece que el botón se ha roto.
   */
  elegir(evento: Event): void {
    const input = evento.target as HTMLInputElement;
    const archivo = input.files?.[0] ?? null;
    if (!archivo) { return; }

    // El servidor lo comprueba de verdad leyendo la cabecera; esto es para
    // no hacer el viaje con un .docx renombrado
    if (!/\.(jpe?g|png|webp|gif)$/i.test(archivo.name)) {
      this._toastr.error('Sólo se aceptan imágenes jpg, png, webp o gif.', 'Ese fichero no vale',
                         { timeOut: 15000, closeButton: true });
      input.value = '';
      return;
    }
    if (archivo.size > 4 * 1024 * 1024) {
      this._toastr.error(`Pesa ${(archivo.size / 1048576).toFixed(1)} MB y el máximo son 4 MB.`,
                         'Demasiado grande', { timeOut: 15000, closeButton: true });
      input.value = '';
      return;
    }

    this.fichero = archivo;
    this.vistaPrevia = URL.createObjectURL(archivo);
  }

  quitarFichero(): void {
    this.fichero = null;
    this.vistaPrevia = this.imagen?.imagen_url ?? null;
  }

  /** Vacía las dos fechas: vuelve a ser ilimitada. */
  sinFechas(): void {
    this.form.patchValue({ desde: '', hasta: '' });
  }

  async guardar(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.guardando) { return; }

    if (this.esNueva && !this.fichero) {
      this._toastr.error('Elige la imagen: es lo único imprescindible.', 'Falta la imagen',
                         { timeOut: 15000, closeButton: true });
      return;
    }
    if (this.form.invalid) { return; }

    const v = this.form.value;
    const limpio = (x: any) => (x ?? '').toString().trim();

    if (limpio(v.desde) && limpio(v.hasta) && limpio(v.hasta) < limpio(v.desde)) {
      this._toastr.error('La fecha «hasta» es anterior a la de «desde».', 'Las fechas van al revés',
                         { timeOut: 15000, closeButton: true });
      return;
    }

    const cuerpo = new FormData();
    if (this.fichero) { cuerpo.append('imagen', this.fichero, this.fichero.name); }
    cuerpo.append('nombre', limpio(v.nombre));
    cuerpo.append('desde', limpio(v.desde));
    cuerpo.append('hasta', limpio(v.hasta));
    cuerpo.append('activo', v.activo !== false ? '1' : '0');

    this.guardando = true;
    try {
      // El servicio sale del tipo: el resto del modal no sabe de quién es
      const servicio: any = this.tipo === 'marca' ? this._marcaService : this._categoriaService;
      const res: any = await firstValueFrom(
        this.esNueva ? servicio.addImagen(this.duenioId, cuerpo)
                     : servicio.editImagen(this.duenioId, this.imagen!.id, cuerpo));

      this._toastr.success(res?.message ?? 'Imagen guardada', 'Listo');
      // Vuelven las imágenes enteras: la pantalla las pinta tal cual
      this.activeModal.close(res?.data ?? true);

    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo guardar la imagen', 'Error',
                         { timeOut: 20000, closeButton: true });
    } finally {
      this.guardando = false;
    }
  }
}
