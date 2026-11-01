import { Component, Input, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';

import { CategoriaWebService } from '../../../services/categoriaWeb.service';
import { CategoriaWebModel } from '../../../interfaces/categoriaWebModel';
import { CampoTextoComponent } from '../../../../../components/campos/campoTexto/campoTexto.component';

/**
 * El NOMBRE CON EL QUE UNA CATEGORÍA SE ENSEÑA EN LA TIENDA.
 *
 * El del catálogo responde a cómo se organiza el inventario («Línea Blanca»);
 * el de la tienda, a cómo lo busca quien compra («Electrodomésticos»). Son dos
 * cosas distintas y por eso se guardan aparte: renombrar aquí no toca el
 * catálogo, y renombrar en el catálogo no pisa lo que se puso aquí.
 *
 * DEJARLO VACÍO ES VOLVER AL DEL CATÁLOGO, y entonces no se guarda nada: así,
 * si mañana la categoría se renombra en Inventarios, la tienda la sigue sola.
 */
@Component({
  selector: 'app-saveCategoriaWeb',
  templateUrl: './saveCategoriaWeb.component.html',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [CommonModule, ReactiveFormsModule, CampoTextoComponent],
})
export class SaveCategoriaWebComponent implements OnInit {

  @Input() categoria!: CategoriaWebModel;

  public form!: FormGroup;
  public guardando = false;

  private fb = inject(FormBuilder);
  private _categoriaService = inject(CategoriaWebService);
  private _toastr = inject(ToastrService);
  public activeModal = inject(NgbActiveModal);

  /** Lo que se verá al final: lo escrito, o el del catálogo si se deja vacío. */
  get comoSeVera(): string {
    const v = (this.form?.controls['nombre_web'].value ?? '').trim();
    return v || this.categoria.nombre_catalogo;
  }

  get usaElDelCatalogo(): boolean {
    return !(this.form?.controls['nombre_web'].value ?? '').trim();
  }

  ngOnInit(): void {
    this.form = this.fb.group({
      nombre_web: [this.categoria.nombre_web ?? '', [Validators.maxLength(80)]],
    });
  }

  limpiar(): void { this.form.controls['nombre_web'].setValue(''); }

  async guardar(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.guardando) { return; }

    this.guardando = true;
    try {
      const res: any = await firstValueFrom(this._categoriaService.editCategoriaWeb(
        this.categoria.id,
        {
          oculta: this.categoria.oculta,
          nombre_web: (this.form.value.nombre_web ?? '').trim() || null,
        }));

      this._toastr.success(res?.message ?? 'Guardado', 'Listo');
      // Devuelve el árbol entero; la pantalla lo pinta tal cual
      this.activeModal.close(res?.data ?? null);

    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo guardar', 'Error',
                         { timeOut: 20000, closeButton: true });
    } finally {
      this.guardando = false;
    }
  }
}
