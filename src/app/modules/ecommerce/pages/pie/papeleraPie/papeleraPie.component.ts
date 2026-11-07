import { Component, Input, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';

import { PieService } from '../../../services/pie.service';
import { FilaPapeleraPie } from '../../../interfaces/pieModel';

/**
 * La papelera del pie: columnas y enlaces en un solo cesto.
 *
 * Borrar una columna se lleva sus enlaces, así que aparecen juntos y
 * restaurar la columna los devuelve.
 *
 * UN ENLACE SUELTO NO SE PUEDE RESTAURAR SI SU COLUMNA SIGUE AQUÍ, y es
 * distinto del encabezado: allí un desplegable huérfano vuelve como enlace
 * principal, pero en el pie no existe «sin columna» —todo se pinta DENTRO de
 * una—, así que no habría dónde ponerlo. El botón sale desactivado y se dice
 * por qué, en vez de dejar que el servidor lo rechace después.
 */
@Component({
  selector: 'app-papeleraPie',
  templateUrl: './papeleraPie.component.html',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [CommonModule],
})
export class PapeleraPieComponent implements OnInit {

  @Input() puedeVaciar = false;

  public filas: FilaPapeleraPie[] = [];
  public cargando = true;
  public trabajando = false;
  public hubocambios = false;

  private _pieService = inject(PieService);
  private _toastr = inject(ToastrService);
  public activeModal = inject(NgbActiveModal);

  get vacia(): boolean { return !this.cargando && this.filas.length === 0; }

  get columnas(): FilaPapeleraPie[] { return this.filas.filter(f => f.tipo === 'columna'); }

  /** Los enlaces cuya columna NO está aquí: ésos sí se pueden devolver solos. */
  get sueltos(): FilaPapeleraPie[] {
    const aqui = new Set(this.columnas.map(c => c.id));
    return this.filas.filter(f => f.tipo === 'enlace' && !aqui.has(f.columna_id ?? -1));
  }

  enlacesDe(columna: FilaPapeleraPie): FilaPapeleraPie[] {
    return this.filas.filter(f => f.tipo === 'enlace' && f.columna_id === columna.id);
  }

  ngOnInit(): void { this.cargar(); }

  async cargar(): Promise<void> {
    this.cargando = true;
    try {
      const res: any = await firstValueFrom(this._pieService.papelera());
      this.filas = res?.data ?? [];
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo abrir la papelera', 'Error');
    } finally {
      this.cargando = false;
    }
  }

  async restaurar(fila: FilaPapeleraPie): Promise<void> {
    if (this.trabajando) { return; }
    this.trabajando = true;
    try {
      const res: any = await firstValueFrom(this._pieService.restaurar(fila.tipo, fila.id));
      this._toastr.success(res?.message ?? 'Restaurado', 'Listo');
      this.hubocambios = true;
      await this.cargar();
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo restaurar', 'Error',
                         { timeOut: 15000, closeButton: true });
    } finally {
      this.trabajando = false;
    }
  }

  async vaciar(): Promise<void> {
    if (this.trabajando || !this.puedeVaciar) { return; }
    if (!confirm('Se borrarán definitivamente todas las columnas y enlaces de la papelera.\n\n'
                 + 'Esto no se puede deshacer. ¿Seguir?')) {
      return;
    }

    this.trabajando = true;
    try {
      const res: any = await firstValueFrom(this._pieService.vaciarPapelera());
      this._toastr.success(res?.message ?? 'Papelera vaciada', 'Listo');
      this.hubocambios = true;
      await this.cargar();
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo vaciar la papelera', 'Error',
                         { timeOut: 15000, closeButton: true });
    } finally {
      this.trabajando = false;
    }
  }

  cerrar(): void { this.activeModal.close(this.hubocambios); }
}
