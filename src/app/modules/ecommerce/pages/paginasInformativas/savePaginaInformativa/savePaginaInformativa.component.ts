import { Component, Input, OnDestroy, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators,
} from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';

import { PaginaInformativaService } from '../../../services/paginaInformativa.service';
import {
  ContenidoPagina, DesplegablePagina, LadoImagenPagina, PaginaInformativaModel,
} from '../../../interfaces/paginaInformativaModel';

import { CampoTextoComponent } from '../../../../../components/campos/campoTexto/campoTexto.component';
import { CampoNgxEditorComponent } from '../../../../../components/campos/campoNgxEditor/campoNgxEditor.component';
import { CheckboxComponent } from '../../../../../components/campos/checkbox/checkbox.component';
import { PanelComponent } from '../../../../../components/panel/panel.component';

/**
 * El EDITOR de una página de texto de la tienda.
 *
 * Una página es un título, un texto con formato y una imagen opcional. Lo
 * escribe legal, no sistemas, así que todo lo que se pueda explicar en la
 * propia pantalla se explica ahí y no en un manual que nadie abre.
 *
 * DOS COLUMNAS. A la izquierda la ficha —título, dirección, estado, imagen—,
 * que ocupa lo que ocupa; a la derecha el texto solo, en su panel y con el
 * botón de expandir. Antes la ficha se comía la fila de arriba y el editor
 * entraba debajo con pestañas, y en una pantalla ancha quedaba medio modal en
 * blanco al lado del estado.
 *
 * LA DIRECCIÓN (la clave) NO SE TOCA. Se fija al crear, sacada del título, y
 * ya no cambia. La tienda pide la página por ahí y el menú del encabezado
 * guarda esa misma clave en sus enlaces; fuera hay enlaces que no
 * controlamos. Se enseña, en gris, para que se sepa cuál es.
 *
 * LA IMAGEN SE SUBE AL ELEGIRLA, no al guardar. Es al revés que el logo de
 * una marca, y por un motivo: aquella necesita el id del registro y ésta no
 * —se guarda sola, con nombre propio, y lo que la pega a esta página es el
 * guardado normal—. Subirla ya permite enseñar la de verdad y no una copia
 * local, que es lo que acaba viendo el visitante.
 *
 * Si se elige una imagen y luego se cierra sin guardar, el fichero se queda
 * suelto en el servidor. Es menos malo que lo contrario: que la página
 * apunte a algo que el usuario no llegó a confirmar.
 *
 * LOS DESPLEGABLES YA NO SE EDITAN (desde el 07/11/2026). Eran hasta seis
 * bloques que se abrían al final de la página, y de aquí desapareció todo:
 * la pestaña, los campos y el poder añadirlos, quitarlos y moverlos.
 *
 * PERO LOS QUE HAY SE CONSERVAN, igual que el PDF: se guardan al cargar y se
 * devuelven tal cual al guardar. No es por nostalgia: el servidor reescribe el
 * contenido entero en cada guardado, así que no mandarlos sería borrarlos al
 * guardar cualquier otra cosa de la página.
 *
 * Y todavía se ven en la tienda: el acordeón de «Garantía extendida» se quitó
 * el 08/11/2026, pero las tarjetas de «Conócenos» y los planes de «Beneficios
 * empresa» siguen saliendo de aquí. Si también se van, entonces sí se puede
 * dejar de mandarlos y limpiar la base.
 *
 * EL PDF SE SUBE COMO LA IMAGEN (desde el 08/11/2026). Antes venía heredado
 * del CRM viejo: se enseñaba el que había —con su nombre de disco, que no le
 * dice nada a nadie— y se devolvía tal cual, sin poder cambiarlo ni quitarlo.
 * Ahora se adjunta, se cambia y se quita desde aquí, y la tienda saca un botón
 * para descargarlo.
 *
 * SE GUARDA TAMBIÉN CÓMO SE LLAMABA (`pdf_nombre`). El del disco lleva la
 * fecha y seis caracteres al azar, para que dos páginas no se pisen y para que
 * el navegador se entere al cambiarlo; el que se enseña y el que se descarga
 * es el original. De las páginas que ya tenían PDF no se sabe cuál era, y
 * entonces se dice «Documento.pdf».
 *
 * Y UNA FRASE PROPIA (`pdf_texto`): «Para mayor información, ver el PDF». Con
 * ella, la tienda pinta esa frase y un icono que abre el documento; sin ella,
 * el botón «Descargar PDF» de siempre. Las dos cosas acompañan al documento,
 * así que al quitarlo se van con él.
 */
@Component({
  selector: 'app-savePaginaInformativa',
  templateUrl: './savePaginaInformativa.component.html',
  styleUrls: ['./savePaginaInformativa.component.css'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    CommonModule, ReactiveFormsModule,
    CampoTextoComponent, CampoNgxEditorComponent, CheckboxComponent,
    PanelComponent,
  ],
})
export class SavePaginaInformativaComponent implements OnInit, OnDestroy {

  /** La página que se abre; {} o 0 para una nueva. */
  @Input() registro_selected: any = {};
  @Input() accion: 'add' | 'edit' | 'view' = 'add';

  public form!: FormGroup;
  public pagina: PaginaInformativaModel | null = null;
  public cargando = false;
  public guardando = false;

  // ---------- La imagen ----------
  /** El nombre con el que quedó guardada en el servidor. */
  private imagen: string | null = null;
  /** Lo que se enseña: la dirección de la imagen o el `data:` de la recién elegida. */
  public imagenVista: string | null = null;
  public subiendoImagen = false;

  // ---------- El PDF ----------
  /** La dirección del PDF guardado, o la del recién subido. */
  private pdf: string | null = null;
  /** Cómo se llamaba el fichero; null en los que vienen del CRM viejo. */
  private pdfNombre: string | null = null;
  public subiendoPdf = false;

  /** Lo que todavía se conserva sin poder tocarlo (ver la cabecera). */
  private desplegables: DesplegablePagina[] = [];

  /** Los FileReader abiertos, para cortarlos si se cierra el modal a medias. */
  private readonly lectores = new Set<FileReader>();
  private destruido = false;

  private fb = inject(FormBuilder);
  private _paginaService = inject(PaginaInformativaService);
  private _toastr = inject(ToastrService);
  public activeModal = inject(NgbActiveModal);

  get esNueva(): boolean { return this.accion === 'add'; }
  get esView(): boolean { return this.accion === 'view'; }
  get titulo(): string {
    return this.esNueva ? 'Nueva página' : (this.esView ? 'Ver página' : 'Modificar página');
  }

  get ctrlActivo(): FormControl { return this.form.controls['activo'] as FormControl; }
  get ctrlTexto(): FormControl { return this.form.controls['texto'] as FormControl; }

  get hayImagen(): boolean { return !!this.imagenVista; }
  get lado(): LadoImagenPagina { return this.form.controls['imagen_lado'].value ?? 'derecha'; }

  get hayPdf(): boolean { return !!this.pdf; }
  get urlPdf(): string | null { return this.pdf; }

  /**
   * El nombre que se enseña.
   *
   * NO el del disco: ése es «pagina_20261108_a1b2c3.pdf» y no significa nada.
   * Las páginas que traen PDF del CRM viejo no guardaron el suyo, y para ésas
   * «Documento.pdf» dice más que el churro de letras que se veía antes.
   */
  get nombrePdf(): string { return this.pdfNombre || 'Documento.pdf'; }

  // ================================================================
  // CICLO DE VIDA
  // ================================================================

  async ngOnInit(): Promise<void> {
    this.form = this.fb.group({
      titulo:      [{ value: '', disabled: this.esView },
                    [Validators.required, Validators.minLength(2), Validators.maxLength(120)]],
      activo:      [{ value: true, disabled: this.esView }],
      imagen_alt:  [{ value: '', disabled: this.esView }, [Validators.maxLength(150)]],
      // Sin decir nada, a la derecha: se lee primero el texto, que es a lo
      // que se entra, y la foto acompaña.
      imagen_lado: [{ value: 'derecha' as LadoImagenPagina, disabled: this.esView }],
      // 100.000 porque lo que se guarda es HTML y las etiquetas ocupan: una
      // política de datos en texto plano pasa de 20.000 en cuanto lleva
      // listas y negritas.
      texto:       [{ value: '', disabled: this.esView },
                    [Validators.required, Validators.maxLength(100000)]],
      // Lo que se lee al lado del icono del documento en la tienda. Vacío, la
      // tienda saca el botón «Descargar PDF» de siempre.
      pdf_texto:   [{ value: '', disabled: this.esView }, [Validators.maxLength(150)]],
    });

    if (!this.esNueva && this.registro_selected?.id) {
      await this.cargar(this.registro_selected.id);
    }
  }

  ngOnDestroy(): void {
    this.destruido = true;
    this.lectores.forEach(l => l.abort());
    this.lectores.clear();
  }

  private async cargar(id: number): Promise<void> {
    this.cargando = true;
    try {
      const res: any = await firstValueFrom(this._paginaService.findByIdPaginaInformativa(id));
      this.pagina = res?.data ?? null;
      const c: ContenidoPagina = this.pagina?.contenido ?? { texto: '' };

      this.imagen      = c.imagen ?? null;      // llega con la dirección entera
      this.imagenVista = c.imagen ?? null;
      this.pdf         = c.pdf ?? null;
      this.pdfNombre   = c.pdf_nombre ?? null;
      this.desplegables = c.desplegables ?? [];

      this.form.patchValue({
        titulo:      this.pagina?.titulo ?? '',
        activo:      this.pagina?.activo !== false,
        imagen_alt:  c.imagen_alt ?? '',
        imagen_lado: c.imagen_lado ?? 'derecha',
        texto:       c.texto ?? '',
        pdf_texto:   c.pdf_texto ?? '',
      });

    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo abrir la página', 'Error',
                         { timeOut: 15000, closeButton: true });
      this.activeModal.dismiss();
    } finally {
      this.cargando = false;
    }
  }

  // ================================================================
  // LA IMAGEN
  // ================================================================

  /**
   * Eligieron un fichero.
   *
   * Se valida aquí lo que se puede —que sea imagen de las que la tienda sabe
   * servir y que no pase de 10 MB— para no hacer subir diez megas y que el
   * servidor conteste que no. La validación del servidor sigue estando: ésta
   * es por comodidad, no por seguridad.
   */
  async onImagenElegida(evento: Event): Promise<void> {
    const input = evento.target as HTMLInputElement;
    const file = input.files?.[0];
    // El input se limpia siempre: si no, elegir dos veces el MISMO fichero no
    // dispara el evento la segunda vez
    input.value = '';
    if (!file || this.esView) { return; }

    if (!file.type.startsWith('image/')) {
      this._toastr.warning('El archivo debe ser una imagen', 'Imagen');
      return;
    }
    if (!/\.(jpe?g|png|webp)$/i.test(file.name)) {
      this._toastr.warning('La imagen debe ser jpg, png o webp', 'Imagen');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      this._toastr.warning('La imagen no puede superar los 10 MB', 'Imagen');
      return;
    }

    // La copia local primero: se ve al instante, mientras sube
    const lector = new FileReader();
    this.lectores.add(lector);
    lector.onloadend = () => {
      this.lectores.delete(lector);
      if (!this.destruido) { this.imagenVista = lector.result as string; }
    };
    lector.onerror = () => { this.lectores.delete(lector); };
    lector.readAsDataURL(file);

    await this.subir(file);
  }

  private async subir(file: File): Promise<void> {
    this.subiendoImagen = true;
    try {
      const datos = new FormData();
      datos.append('imagen_file', file);
      const res: any = await firstValueFrom(this._paginaService.addImagen(datos));

      if (res?.status !== 'success' || !res?.data?.imagen) {
        this._toastr.error(res?.message ?? 'No se pudo subir la imagen', 'Imagen');
        this.quitarImagen();
        return;
      }

      this.imagen = res.data.imagen;
      // La del servidor, no la copia local: es la que verá el visitante
      if (!this.destruido) { this.imagenVista = res.data.full_path ?? this.imagenVista; }

    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo subir la imagen', 'Imagen',
                         { timeOut: 15000, closeButton: true });
      this.quitarImagen();
    } finally {
      this.subiendoImagen = false;
    }
  }

  /**
   * Quita la imagen de la página.
   *
   * El fichero no se borra del servidor: puede estar en el texto de otra
   * página, y de limpiar los que no usa nadie se encarga vaciar la papelera.
   */
  quitarImagen(): void {
    if (this.esView) { return; }
    this.imagen = null;
    this.imagenVista = null;
    this.form.controls['imagen_alt'].setValue('');
  }

  ponerLado(lado: LadoImagenPagina): void {
    if (this.esView) { return; }
    this.form.controls['imagen_lado'].setValue(lado);
  }

  // ================================================================
  // EL PDF
  // ================================================================

  /**
   * Eligieron un documento.
   *
   * Los 15 MB y el que sea PDF se miran aquí por comodidad —para no subir
   * quince megas y que el servidor conteste que no—, no por seguridad: el
   * servidor lo vuelve a mirar, y es el suyo el que manda.
   */
  async onPdfElegido(evento: Event): Promise<void> {
    const input = evento.target as HTMLInputElement;
    const file = input.files?.[0];
    // Se limpia siempre: si no, elegir dos veces el MISMO fichero no dispara
    // el evento la segunda vez
    input.value = '';
    if (!file || this.esView) { return; }

    if (!/\.pdf$/i.test(file.name) || (file.type && file.type !== 'application/pdf')) {
      this._toastr.warning('El documento debe ser un PDF', 'Documento');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      this._toastr.warning('El documento no puede superar los 15 MB', 'Documento');
      return;
    }

    this.subiendoPdf = true;
    try {
      const datos = new FormData();
      datos.append('pdf_file', file);
      const res: any = await firstValueFrom(this._paginaService.addPdf(datos));

      if (res?.status !== 'success' || !res?.data?.pdf) {
        this._toastr.error(res?.message ?? 'No se pudo subir el documento', 'Documento');
        return;
      }

      if (!this.destruido) {
        // La dirección del servidor, no el nombre a secas: es la que abre el
        // enlace de «Ver» mientras todavía no se ha guardado la página
        this.pdf = res.data.full_path ?? res.data.pdf;
        this.pdfNombre = res.data.pdf_nombre ?? file.name;
        this.form.markAsDirty();
      }

    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo subir el documento', 'Documento',
                         { timeOut: 15000, closeButton: true });
    } finally {
      this.subiendoPdf = false;
    }
  }

  /**
   * Quita el documento de la página.
   *
   * El fichero no se borra del servidor, igual que con la imagen: puede estar
   * enlazado desde el texto de otra página.
   */
  quitarPdf(): void {
    if (this.esView || this.subiendoPdf) { return; }
    this.pdf = null;
    this.pdfNombre = null;
    // La frase acompaña al documento: sin documento no acompaña a nada. Se
    // borra aquí, igual que el alt con la imagen, y no sólo al guardar: si no,
    // el campo seguiría enseñando un texto que ya no se va a guardar.
    this.form.controls['pdf_texto'].setValue('');
    this.form.markAsDirty();
  }

  // ================================================================
  // GUARDAR
  // ================================================================

  async guardar(): Promise<void> {
    if (this.esView || this.guardando) { return; }

    if (this.subiendoImagen) {
      this._toastr.info('Espere a que termine de subir la imagen', 'Imagen');
      return;
    }
    if (this.subiendoPdf) {
      this._toastr.info('Espere a que termine de subir el documento', 'Documento');
      return;
    }

    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this._toastr.error('Revise los campos del formulario.', 'No se puede guardar',
                         { timeOut: 20000, closeButton: true });
      return;
    }

    const v = this.form.getRawValue();

    const payload = {
      titulo: v.titulo,
      activo: v.activo !== false,
      contenido: {
        texto:       v.texto,
        imagen:      this.imagen,
        // Los dos sólo tienen sentido con imagen; sin ella la base los tira
        imagen_alt:  this.imagen ? ((v.imagen_alt ?? '').trim() || null) : null,
        imagen_lado: this.imagen ? (v.imagen_lado ?? 'derecha') : null,
        pdf: this.pdf,
        // Los dos sólo tienen sentido con documento; sin él la base los tira
        pdf_nombre: this.pdf ? this.pdfNombre : null,
        pdf_texto:  this.pdf ? ((v.pdf_texto ?? '').trim() || null) : null,
        // Se devuelven tal cual vinieron: si no fueran, el servidor los daría
        // por borrados —reescribe el contenido entero— y las páginas que
        // tienen desplegables los perderían.
        desplegables: this.desplegables,
      },
    };

    this.guardando = true;
    try {
      const res: any = await firstValueFrom(
        this.esNueva ? this._paginaService.addPaginaInformativa(payload)
                     : this._paginaService.editPaginaInformativa(this.pagina!.id, payload));

      this._toastr.success(res?.message ?? 'Página guardada', 'Listo');
      this.activeModal.close(res?.data ?? true);

    } catch (e: any) {
      // El servidor es el que manda: revisa el HTML por dentro (etiquetas que
      // no se permiten, texto vacío de verdad) y eso no se repite aquí.
      this._toastr.error(e?.error?.message ?? 'No se pudo guardar la página', 'Error',
                         { timeOut: 20000, closeButton: true });
    } finally {
      this.guardando = false;
    }
  }
}
