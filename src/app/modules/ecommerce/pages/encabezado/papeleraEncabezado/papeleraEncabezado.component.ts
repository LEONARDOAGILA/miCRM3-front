import { Component, Input, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';

import { EncabezadoService } from '../../../services/encabezado.service';
import { FilaPapeleraEnlace } from '../../../interfaces/encabezadoModel';

/**
 * La papelera de los enlaces del menú del encabezado.
 *
 * Borrar un principal se lleva su desplegable entero, así que aquí pueden
 * aparecer juntos. Restaurar el principal los devuelve a todos.
 *
 * RESTAURAR UN DESPLEGABLE SUELTO cuyo principal sigue en la papelera lo
 * devuelve COMO PRINCIPAL: lo decide el servidor, porque bajo un padre que no
 * se ve sería restaurarlo a ninguna parte. La pantalla lo avisa antes.
 */
@Component({
  selector: 'app-papeleraEncabezado',
  templateUrl: './papeleraEncabezado.component.html',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [CommonModule],
})
export class PapeleraEncabezadoComponent implements OnInit {

  @Input() puedeVaciar = false;

  public filas: FilaPapeleraEnlace[] = [];
  public cargando = true;
  public trabajando = false;
  public hubocambios = false;

  private _encabezadoService = inject(EncabezadoService);
  private _toastr = inject(ToastrService);
  public activeModal = inject(NgbActiveModal);

  get vacia(): boolean { return !this.cargando && this.filas.length === 0; }

  /** Los que eran principales. */
  get principales(): FilaPapeleraEnlace[] { return this.filas.filter(f => !f.padre_id); }

  /** Los de un desplegable cuyo principal NO está aquí: se restauran solos. */
  get sueltos(): FilaPapeleraEnlace[] {
    const aqui = new Set(this.principales.map(p => p.id));
    return this.filas.filter(f => f.padre_id && !aqui.has(f.padre_id));
  }

  hijosDe(padre: FilaPapeleraEnlace): FilaPapeleraEnlace[] {
    return this.filas.filter(f => f.padre_id === padre.id);
  }

  ngOnInit(): void { this.cargar(); }

  async cargar(): Promise<void> {
    this.cargando = true;
    try {
      const res: any = await firstValueFrom(this._encabezadoService.papelera());
      this.filas = res?.data ?? [];
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo abrir la papelera', 'Error');
    } finally {
      this.cargando = false;
    }
  }

  async restaurar(fila: FilaPapeleraEnlace): Promise<void> {
    if (this.trabajando) { return; }
    this.trabajando = true;
    try {
      const res: any = await firstValueFrom(this._encabezadoService.restaurar([fila.id]));
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
    if (!confirm('Se borrarán definitivamente todos los enlaces de la papelera.\n\n'
                 + 'Esto no se puede deshacer. ¿Seguir?')) {
      return;
    }

    this.trabajando = true;
    try {
      const res: any = await firstValueFrom(this._encabezadoService.vaciarPapelera());
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
