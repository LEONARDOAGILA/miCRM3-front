import { Component, Input, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';

import { CuerpoService } from '../../../services/cuerpo.service';
import { CuerpoModel } from '../../../interfaces/cuerpoModel';

/**
 * La papelera de los cuerpos.
 *
 * UN CUERPO SE VA CON SUS SECCIONES y vuelve con ellas: mientras está aquí no
 * se borra nada, así que restaurarlo lo devuelve entero —su orden, sus
 * rótulos, sus banners y sus imágenes—.
 *
 * RESTAURAR PUEDE FALLAR, y es normal: mientras estaba en la papelera alguien
 * pudo coger su nombre, su dirección o su categoría. El servidor dice cuál es
 * el estorbo y la pantalla lo repite tal cual, en vez de adivinarlo aquí.
 *
 * VACIAR BORRA DE VERDAD, con las galerías de sus banners. No hay vuelta.
 */
@Component({
  selector: 'app-papeleraCuerpos',
  templateUrl: './papeleraCuerpos.component.html',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [CommonModule],
})
export class PapeleraCuerposComponent implements OnInit {

  @Input() puedeVaciar = false;

  public filas: CuerpoModel[] = [];
  public cargando = true;
  public trabajando = false;
  public hubocambios = false;

  private _cuerpoService = inject(CuerpoService);
  private _toastr = inject(ToastrService);
  public activeModal = inject(NgbActiveModal);

  get vacia(): boolean { return !this.cargando && this.filas.length === 0; }

  /** Cuántas secciones se llevaron por delante, para decirlo en la fila. */
  cuantas(c: CuerpoModel): string {
    const n = c.secciones ?? 0;
    return n === 1 ? '1 sección' : n + ' secciones';
  }

  aDondeApunta(c: CuerpoModel): string {
    if (c.categoria) { return 'Categoría: ' + c.categoria; }
    if (c.marca)     { return 'Marca: ' + c.marca; }
    return 'Página suelta';
  }

  ngOnInit(): void { this.cargar(); }

  async cargar(): Promise<void> {
    this.cargando = true;
    try {
      const res: any = await firstValueFrom(this._cuerpoService.papelera());
      this.filas = res?.data ?? [];
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo abrir la papelera', 'Error');
    } finally {
      this.cargando = false;
    }
  }

  async restaurar(c: CuerpoModel): Promise<void> {
    if (this.trabajando) { return; }
    this.trabajando = true;
    try {
      const res: any = await firstValueFrom(this._cuerpoService.restaurarCuerpo(c.id));
      this._toastr.success(res?.message ?? 'Restaurado', 'Listo');
      this.hubocambios = true;
      await this.cargar();
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo restaurar', 'Error',
                         { timeOut: 20000, closeButton: true });
    } finally {
      this.trabajando = false;
    }
  }

  async vaciar(): Promise<void> {
    if (this.trabajando || !this.puedeVaciar) { return; }
    if (!confirm('Se borrarán definitivamente los cuerpos de la papelera, con sus '
                 + 'secciones y las imágenes de sus banners.\n\n'
                 + 'Esto no se puede deshacer. ¿Seguir?')) {
      return;
    }

    this.trabajando = true;
    try {
      const res: any = await firstValueFrom(this._cuerpoService.vaciarPapelera());
      this._toastr.success(res?.message ?? 'Papelera vaciada', 'Listo');
      this.hubocambios = true;
      await this.cargar();
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo vaciar la papelera', 'Error',
                         { timeOut: 20000, closeButton: true });
    } finally {
      this.trabajando = false;
    }
  }

  cerrar(): void { this.activeModal.close(this.hubocambios); }
}
