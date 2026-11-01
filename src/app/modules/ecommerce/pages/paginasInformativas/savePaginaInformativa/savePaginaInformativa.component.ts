import { Component, Input, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators,
} from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';

import { PaginaInformativaService } from '../../../services/paginaInformativa.service';
import {
  ContenidoPagina, DesplegablePagina, GrupoPaginaModel, PaginaInformativaModel,
} from '../../../interfaces/paginaInformativaModel';

import { CampoTextoComponent } from '../../../../../components/campos/campoTexto/campoTexto.component';
import { CampoNgxEditorComponent } from '../../../../../components/campos/campoNgxEditor/campoNgxEditor.component';
import { CheckboxComponent } from '../../../../../components/campos/checkbox/checkbox.component';
import { ComboComponent } from '../../../../../components/campos/combo/combo.component';
import { PanelComponent } from '../../../../../components/panel/panel.component';
import { TabPanelComponent, PestanaTab } from '../../../../../components/campos/tabPanel/tabPanel.component';

/**
 * El EDITOR de una página de texto de la tienda.
 *
 * Una página es un título, un texto con formato y —opcionalmente— hasta seis
 * desplegables al final, del tipo «preguntas frecuentes». Lo escribe legal, no
 * sistemas, así que todo lo que se pueda explicar en la propia pantalla se
 * explica ahí y no en un manual que nadie abre.
 *
 * DOS COSAS QUE NO SE TOCAN AQUÍ Y CONVIENE SABER POR QUÉ:
 *
 *  · LA DIRECCIÓN (la clave). Se fija al crear, sacada del título, y ya no
 *    cambia. La tienda pide la página por ahí y el menú del encabezado guarda
 *    esa misma clave en sus enlaces; fuera hay enlaces que no controlamos.
 *    Se enseña, en gris, para que se sepa cuál es.
 *
 *  · LA IMAGEN Y EL PDF. Se conservan tal cual vinieron pero todavía no se
 *    pueden cambiar: subir ficheros es la siguiente tajada del traslado y no
 *    hay a dónde subirlos. Se enseña el que hay con un enlace para abrirlo, y
 *    se manda de vuelta sin tocar: dejar el campo fuera del formulario
 *    borraría la imagen de las páginas que ya la tienen.
 *
 * Las páginas FIJAS (las que la tienda tiene en dirección propia) no admiten
 * carpeta: el selector sale bloqueado y dice por qué.
 */
@Component({
  selector: 'app-savePaginaInformativa',
  templateUrl: './savePaginaInformativa.component.html',
  styleUrls: ['./savePaginaInformativa.component.css'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    CommonModule, ReactiveFormsModule,
    CampoTextoComponent, CampoNgxEditorComponent, CheckboxComponent, ComboComponent,
    PanelComponent, TabPanelComponent,
  ],
})
export class SavePaginaInformativaComponent implements OnInit {

  /** La página que se abre; 0 o null para una nueva. */
  @Input() registro_selected: any = {};
  @Input() accion: 'add' | 'edit' | 'view' = 'add';
  /** Las carpetas donde puede ir, ya cargadas por la pantalla de la lista. */
  @Input() grupos: GrupoPaginaModel[] = [];

  public form!: FormGroup;
  public pagina: PaginaInformativaModel | null = null;
  public cargando = false;
  public guardando = false;

  /** Lo que se conserva sin poder tocarlo todavía (ver la cabecera). */
  private imagen: string | null = null;
  private imagenAlt: string | null = null;
  private pdf: string | null = null;

  public readonly pestanas: PestanaTab[] = [
    { id: 'texto',        texto: 'Texto',        icono: 'fa-solid fa-align-left' },
    { id: 'desplegables', texto: 'Desplegables', icono: 'fa-solid fa-chevron-down' },
  ];
  public pestana: 'texto' | 'desplegables' = 'texto';

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
  get desplegables(): FormArray { return this.form.controls['desplegables'] as FormArray; }

  /** Las fijas no van en carpeta: la tienda las busca por su dirección. */
  get carpetaBloqueada(): boolean { return this.pagina?.fija === true; }

  /** Seis como mucho; es lo que cabe en la página sin volverse un índice. */
  get puedeAnadirDesplegable(): boolean {
    return !this.esView && this.desplegables.length < 6;
  }

  /** Para el combo de carpetas; la primera opción es «sin carpeta». */
  get opcionesGrupo(): { id: any; name: string }[] {
    return [{ id: null, name: 'Sin carpeta' },
            ...this.grupos.map(g => ({ id: g.id, name: g.nombre }))];
  }

  async ngOnInit(): Promise<void> {
    this.form = this.fb.group({
      titulo:   [{ value: '', disabled: this.esView },
                 [Validators.required, Validators.minLength(2), Validators.maxLength(120)]],
      grupo_id: [{ value: null, disabled: this.esView }],
      activo:   [{ value: true, disabled: this.esView }],
      // 100.000 porque lo que se guarda es HTML y las etiquetas ocupan: una
      // política de datos en texto plano pasa de 20.000 en cuanto lleva
      // listas y negritas.
      texto:    [{ value: '', disabled: this.esView },
                 [Validators.required, Validators.maxLength(100000)]],
      desplegables: this.fb.array([]),
    });

    if (!this.esNueva && this.registro_selected?.id) {
      await this.cargar(this.registro_selected.id);
    }
  }

  private async cargar(id: number): Promise<void> {
    this.cargando = true;
    try {
      const res: any = await firstValueFrom(this._paginaService.findByIdPaginaInformativa(id));
      this.pagina = res?.data ?? null;
      const c: ContenidoPagina = this.pagina?.contenido ?? { texto: '' };

      // Lo que todavía no se puede editar, guardado para devolverlo igual
      this.imagen    = c.imagen ?? null;
      this.imagenAlt = c.imagen_alt ?? null;
      this.pdf       = c.pdf ?? null;

      this.form.patchValue({
        titulo:   this.pagina?.titulo ?? '',
        grupo_id: this.pagina?.grupo_id ?? null,
        activo:   this.pagina?.activo !== false,
        texto:    c.texto ?? '',
      });

      for (const d of (c.desplegables ?? [])) {
        this.desplegables.push(this.nuevoDesplegable(d));
      }

      // Una página fija no admite carpeta, y decirlo con el campo apagado se
      // entiende mejor que un error al guardar.
      if (this.carpetaBloqueada) { this.form.controls['grupo_id'].disable(); }

    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo abrir la página', 'Error',
                         { timeOut: 15000, closeButton: true });
      this.activeModal.dismiss();
    } finally {
      this.cargando = false;
    }
  }

  private nuevoDesplegable(d?: DesplegablePagina): FormGroup {
    return this.fb.group({
      titulo: [{ value: d?.titulo ?? '', disabled: this.esView },
               [Validators.required, Validators.maxLength(100)]],
      texto:  [{ value: d?.texto ?? '', disabled: this.esView },
               [Validators.required, Validators.maxLength(20000)]],
      // Igual que la imagen de la página: se conserva, no se edita todavía
      pdf:    [d?.pdf ?? null],
      boton:  [d?.boton ?? null],
    });
  }

  anadirDesplegable(): void {
    if (!this.puedeAnadirDesplegable) { return; }
    this.desplegables.push(this.nuevoDesplegable());
    this.pestana = 'desplegables';
  }

  quitarDesplegable(indice: number): void {
    if (this.esView) { return; }
    this.desplegables.removeAt(indice);
  }

  moverDesplegable(indice: number, direccion: -1 | 1): void {
    const destino = indice + direccion;
    if (this.esView || destino < 0 || destino >= this.desplegables.length) { return; }
    // Se mueve el CONTROL, no su valor: así el campo que se está editando
    // viaja con lo que tiene dentro, incluido si está tocado o en rojo.
    const control = this.desplegables.at(indice);
    this.desplegables.removeAt(indice);
    this.desplegables.insert(destino, control);
  }

  /** El que se está editando, para que @for no lo siga por la posición. */
  controlDesplegable(indice: number): FormGroup {
    return this.desplegables.at(indice) as FormGroup;
  }

  async guardar(): Promise<void> {
    if (this.esView || this.guardando) { return; }

    this.form.markAllAsTouched();
    if (this.form.invalid) {
      // Si lo que falta está en la otra pestaña, el aviso a secas no dice
      // dónde mirar: se abre la pestaña del primer campo en rojo.
      if (this.desplegables.invalid && this.pestana !== 'desplegables') {
        this.pestana = 'desplegables';
      } else if (this.ctrlTexto.invalid || this.form.controls['titulo'].invalid) {
        this.pestana = 'texto';
      }
      this._toastr.error('Revise los campos del formulario.', 'No se puede guardar',
                         { timeOut: 20000, closeButton: true });
      return;
    }

    const v = this.form.getRawValue();

    const payload = {
      titulo:   v.titulo,
      grupo_id: v.grupo_id ?? null,
      activo:   v.activo !== false,
      contenido: {
        texto:      v.texto,
        // Se devuelven tal cual vinieron: si no fueran, el servidor los
        // daría por borrados y las páginas que tienen imagen la perderían.
        imagen:     this.imagen,
        imagen_alt: this.imagenAlt,
        pdf:        this.pdf,
        desplegables: (v.desplegables ?? []).map((d: any) => ({
          titulo: d.titulo, texto: d.texto, pdf: d.pdf ?? null, boton: d.boton ?? null,
        })),
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

  // ---------- Lo que se enseña de los ficheros que aún no se editan ----------
  get hayImagen(): boolean { return !!this.imagen; }
  get hayPdf(): boolean { return !!this.pdf; }
  get urlImagen(): string | null { return this.imagen; }
  get urlPdf(): string | null { return this.pdf; }
  get nombrePdf(): string { return (this.pdf ?? '').split('/').pop() ?? ''; }
}
