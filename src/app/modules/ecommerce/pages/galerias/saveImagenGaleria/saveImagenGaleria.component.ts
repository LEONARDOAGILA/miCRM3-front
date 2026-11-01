import { Component, Input, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';

import { GaleriaService } from '../../../services/galeria.service';
import { GaleriaModel, ImagenGaleriaModel, DONDE_SE_VE } from '../../../interfaces/galeriaModel';
import { ImagenTiendaModel } from '../../../interfaces/imagenModel';
import { ElegirImagenComponent } from '../../imagenes/elegirImagen/elegirImagen.component';

import { CampoTextoComponent } from '../../../../../components/campos/campoTexto/campoTexto.component';
import { CheckboxComponent } from '../../../../../components/campos/checkbox/checkbox.component';
import { ComboComponent } from '../../../../../components/campos/combo/combo.component';

/**
 * UNA IMAGEN DE UNA GALERÍA.
 *
 * El fichero NO se sube aquí: se elige de la biblioteca compartida, que es la
 * misma para toda la página web. Lo que se guarda es su nombre.
 *
 * LA IMAGEN DE CELULAR ES APARTE Y OPCIONAL. Un banner apaisado recortado a
 * pantalla de teléfono deja fuera justo lo que importa, así que se puede
 * poner otra versión; sin ella se usa la misma.
 *
 * EL TEXTO ENCIMA DE LA IMAGEN —título, subtítulo, color y botón— SÓLO SALE
 * EN LOS BANNERS, porque es lo único que la tienda pinta con texto encima. En
 * una galería de logos esos campos serían cuatro casillas que no hacen nada.
 *
 * LA VIGENCIA ES LA PIEZA ÚTIL de verdad: deja preparada la promoción del
 * viernes y se enciende y se apaga sola, sin que nadie tenga que acordarse.
 */
@Component({
  selector: 'app-saveImagenGaleria',
  templateUrl: './saveImagenGaleria.component.html',
  styleUrls: ['./saveImagenGaleria.component.css'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    CommonModule, ReactiveFormsModule,
    CampoTextoComponent, CheckboxComponent, ComboComponent,
  ],
})
export class SaveImagenGaleriaComponent implements OnInit {

  /** La galería donde va. Hace falta siempre. */
  @Input() galeria!: GaleriaModel;

  /** La imagen que se modifica; sin ella, se añade una. */
  @Input() imagen: ImagenGaleriaModel | null = null;

  public form!: FormGroup;
  public guardando = false;

  /** El fichero elegido, fuera del formulario: no es un campo que se escriba. */
  public fichero: string | null = null;
  public ficheroUrl: string | null = null;
  public ficheroMovil: string | null = null;
  public ficheroMovilUrl: string | null = null;

  public readonly dondeSeVe = DONDE_SE_VE;

  private fb = inject(FormBuilder);
  private _galeriaService = inject(GaleriaService);
  private _toastr = inject(ToastrService);
  private modal = inject(NgbModal);
  public activeModal = inject(NgbActiveModal);

  get esNueva(): boolean { return this.imagen === null; }
  get titulo(): string { return this.esNueva ? 'Añadir una imagen' : 'Modificar la imagen'; }
  get ctrlActivo(): FormControl { return this.form.controls['activo'] as FormControl; }
  get ctrlPestana(): FormControl { return this.form.controls['nueva_pestana'] as FormControl; }

  /** El texto encima sólo lo pinta la tienda en los banners. */
  get conTexto(): boolean { return this.galeria?.tipo === 'banner'; }

  /**
   * «Abrir en otra pestaña» sólo tiene sentido saliendo del sitio.
   *
   * A una ruta propia se va en la misma pestaña: abrir la tienda dentro de la
   * tienda deja al cliente con dos y perdido. El servidor lo fuerza igual.
   */
  get enlaceEsExterno(): boolean {
    return (this.form?.controls['enlace']?.value ?? '').trim().startsWith('https://');
  }

  ngOnInit(): void {
    const i = this.imagen;

    this.fichero = i?.imagen ?? null;
    this.ficheroUrl = i?.imagen_url ?? null;
    this.ficheroMovil = i?.imagen_movil ?? null;
    this.ficheroMovilUrl = i?.imagen_movil_url ?? null;

    this.form = this.fb.group({
      nombre:        [i?.nombre ?? '', [Validators.maxLength(100)]],
      enlace:        [i?.enlace ?? '', [Validators.maxLength(250)]],
      nueva_pestana: [i?.nueva_pestana === true],
      mostrar_en:    [i?.mostrar_en ?? 'todos'],
      titulo:        [i?.titulo ?? '', [Validators.maxLength(40)]],
      subtitulo:     [i?.subtitulo ?? '', [Validators.maxLength(80)]],
      color:         [i?.color ?? ''],
      boton:         [i?.boton ?? '', [Validators.maxLength(20)]],
      desde:         [i?.desde ?? ''],
      hasta:         [i?.hasta ?? ''],
      activo:        [i?.activo !== false],
    });
  }

  // ================================================================
  // EL FICHERO
  // ================================================================

  elegir(movil: boolean): void {
    const ref = this.modal.open(ElegirImagenComponent,
                                { size: 'xl', backdrop: 'static', centered: true, scrollable: true });
    ref.componentInstance.nombre = movil ? this.ficheroMovil : this.fichero;
    ref.componentInstance.paraQue = movil
      ? 'la versión para celular de «' + this.galeria.nombre + '»'
      : this.galeria.nombre;

    ref.result.then((x: ImagenTiendaModel) => {
      if (movil) {
        this.ficheroMovil = x.nombre;
        this.ficheroMovilUrl = x.url;
      } else {
        this.fichero = x.nombre;
        this.ficheroUrl = x.url;
      }
    }, () => { /* se cerró sin elegir */ });
  }

  quitarMovil(): void {
    this.ficheroMovil = null;
    this.ficheroMovilUrl = null;
  }

  // ================================================================

  async guardar(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.guardando) { return; }

    if (!this.fichero) {
      this._toastr.error('Elige la imagen: es lo único imprescindible.', 'Falta la imagen',
                         { timeOut: 15000, closeButton: true });
      return;
    }
    if (this.form.invalid) { return; }

    const v = this.form.value;
    const limpio = (x: any) => (x ?? '').toString().trim() || null;

    const desde = limpio(v.desde);
    const hasta = limpio(v.hasta);
    if (desde && hasta && hasta < desde) {
      this._toastr.error('La fecha «hasta» es anterior a la de «desde».', 'Las fechas van al revés',
                         { timeOut: 15000, closeButton: true });
      return;
    }

    const payload: any = {
      imagen:        this.fichero,
      imagen_movil:  this.ficheroMovil,
      nombre:        limpio(v.nombre),
      enlace:        limpio(v.enlace),
      nueva_pestana: v.nueva_pestana === true,
      mostrar_en:    v.mostrar_en || 'todos',
      desde,
      hasta,
      activo:        v.activo !== false,
    };

    // En una galería sin texto no se mandan esos campos: así no se quedan
    // guardados a escondidas si alguien cambia el tipo de la galería.
    if (this.conTexto) {
      payload.titulo = limpio(v.titulo);
      payload.subtitulo = limpio(v.subtitulo);
      payload.color = limpio(v.color);
      payload.boton = limpio(v.boton);
    }

    this.guardando = true;
    try {
      const res: any = await firstValueFrom(
        this.esNueva ? this._galeriaService.addImagen(this.galeria.clave, payload)
                     : this._galeriaService.editImagen(this.galeria.clave, this.imagen!.id, payload));

      this._toastr.success(res?.message ?? 'Imagen guardada', 'Listo');
      // Vuelve la galería entera: la pantalla la pinta tal cual
      this.activeModal.close(res?.data ?? true);

    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo guardar la imagen', 'Error',
                         { timeOut: 20000, closeButton: true });
    } finally {
      this.guardando = false;
    }
  }
}
