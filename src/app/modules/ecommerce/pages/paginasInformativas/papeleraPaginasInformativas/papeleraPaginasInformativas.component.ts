import { Component, Input, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';

import { PaginaInformativaService } from '../../../services/paginaInformativa.service';
import { FilaPapeleraPagina } from '../../../interfaces/paginaInformativaModel';

/**
 * La papelera de las páginas informativas.
 *
 * Una lista de páginas y nada más. Tuvo dos niveles mientras hubo carpetas
 * —la carpeta arriba y debajo las páginas que se habían ido con ella— y eso
 * se fue con ellas el 07/11/2026.
 *
 * VACIAR BORRA LOS FICHEROS. Las imágenes y los PDF de lo que se va se
 * quitan del disco, y eso no se deshace: por eso se pregunta y por eso el
 * permiso lo comprueba también el servidor.
 */
@Component({
  selector: 'app-papeleraPaginasInformativas',
  templateUrl: './papeleraPaginasInformativas.component.html',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [CommonModule],
})
export class PapeleraPaginasInformativasComponent implements OnInit {

  /** Si el perfil puede vaciarla; el servidor lo comprueba igual. */
  @Input() puedeVaciar = false;

  public filas: FilaPapeleraPagina[] = [];
  public cargando = true;
  public trabajando = false;
  /** true en cuanto se restaura o se vacía algo: la lista de atrás recarga. */
  public hubocambios = false;

  private _paginaService = inject(PaginaInformativaService);
  private _toastr = inject(ToastrService);
  public activeModal = inject(NgbActiveModal);

  get vacia(): boolean { return !this.cargando && this.filas.length === 0; }

  ngOnInit(): void { this.cargar(); }

  async cargar(): Promise<void> {
    this.cargando = true;
    try {
      const res: any = await firstValueFrom(this._paginaService.papelera());
      this.filas = res?.data ?? [];
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo abrir la papelera', 'Error');
    } finally {
      this.cargando = false;
    }
  }

  async restaurar(fila: FilaPapeleraPagina): Promise<void> {
    if (this.trabajando) { return; }
    this.trabajando = true;
    try {
      const res: any = await firstValueFrom(this._paginaService.restaurar([fila.id]));
      this._toastr.success(res?.message ?? 'Restaurada', 'Listo');
      this.hubocambios = true;
      await this.cargar();
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo restaurar', 'Error',
                         { timeOut: 15000, closeButton: true });
    } finally {
      this.trabajando = false;
    }
  }

  /**
   * Vaciar BORRA DE VERDAD y no se puede deshacer, así que se pregunta. El
   * permiso lo comprueba también el servidor: esconder el botón no impide la
   * llamada.
   */
  async vaciar(): Promise<void> {
    if (this.trabajando || !this.puedeVaciar) { return; }
    if (!confirm('Se borrarán definitivamente todas las páginas de la papelera, '
                 + 'con sus imágenes y sus PDF. Esto no se puede deshacer.\n\n¿Seguir?')) {
      return;
    }

    this.trabajando = true;
    try {
      const res: any = await firstValueFrom(this._paginaService.vaciarPapelera());
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

  cerrar(): void {
    this.activeModal.close(this.hubocambios);
  }
}
