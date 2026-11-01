import { Component, Input, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';

import { PaginaInformativaService } from '../../../services/paginaInformativa.service';
import { GrupoPaginaModel } from '../../../interfaces/paginaInformativaModel';
import { CampoTextoComponent } from '../../../../../components/campos/campoTexto/campoTexto.component';

/**
 * El nombre de una CARPETA de páginas informativas.
 *
 * Una carpeta no tiene más que un nombre y un orden, y el orden se cambia
 * arrastrando en la lista: por eso esto es un diálogo de un solo campo y no
 * una pantalla. Sirve para crear y para renombrar; la diferencia es si llega
 * `grupo`.
 *
 * La carpeta agrupa las páginas que salen juntas en /documentos de la tienda
 * («Protección de datos», «Términos»). Las páginas FIJAS —las que la tienda
 * tiene en una dirección propia— no van en ninguna.
 */
@Component({
  selector: 'app-grupoPagina',
  templateUrl: './grupoPagina.component.html',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [CommonModule, ReactiveFormsModule, CampoTextoComponent],
})
export class GrupoPaginaComponent implements OnInit {

  /** La carpeta que se renombra; sin ella, se crea una nueva. */
  @Input() grupo: GrupoPaginaModel | null = null;

  public form!: FormGroup;
  public guardando = false;

  private fb = inject(FormBuilder);
  private _paginaService = inject(PaginaInformativaService);
  private _toastr = inject(ToastrService);
  public activeModal = inject(NgbActiveModal);

  get esNueva(): boolean { return this.grupo === null; }
  get titulo(): string { return this.esNueva ? 'Nueva carpeta' : 'Renombrar carpeta'; }

  ngOnInit(): void {
    this.form = this.fb.group({
      nombre: [this.grupo?.nombre ?? '',
               [Validators.required, Validators.minLength(2), Validators.maxLength(60)]],
    });
  }

  async guardar(): Promise<void> {
    this.form.controls['nombre'].markAsTouched();
    if (this.form.invalid || this.guardando) { return; }

    this.guardando = true;
    const nombre: string = this.form.value.nombre.trim();

    try {
      // El servidor es quien decide si el nombre choca con otro: compara sin
      // tildes ni mayúsculas, y eso no se puede repetir aquí sin que se
      // separen las dos reglas a la primera.
      const res: any = await firstValueFrom(
        this.esNueva ? this._paginaService.addGrupo(nombre)
                     : this._paginaService.editGrupo(this.grupo!.id, nombre));

      this._toastr.success(res?.message ?? 'Carpeta guardada', 'Listo');
      this.activeModal.close(res?.data ?? true);

    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo guardar la carpeta', 'Error',
                         { timeOut: 15000, closeButton: true });
    } finally {
      this.guardando = false;
    }
  }
}
