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
 * ES UN SOLO CESTO para carpetas y páginas, a diferencia del resto de la casa,
 * donde va una papelera por entidad. El motivo es que aquí lo borrado viene
 * encadenado: al tirar una carpeta se van con ella sus páginas, y restaurarla
 * las devuelve. Partirlo en dos cestos obligaría a mirar en dos sitios para
 * entender por qué una página desapareció.
 *
 * Por eso cada fila dice de qué tipo es, y las páginas que se fueron con una
 * carpeta se pintan debajo de ella.
 *
 * RESTAURAR UNA PÁGINA SUELTA cuya carpeta sigue aquí la devuelve SIN carpeta:
 * lo decide el servidor, y es lo razonable —restaurarla a una carpeta que no
 * se ve sería restaurarla a ninguna parte—, pero conviene que la pantalla lo
 * cuente antes y no después.
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

  get carpetas(): FilaPapeleraPagina[] {
    return this.filas.filter(f => f.tipo === 'carpeta');
  }

  /** Las páginas que no venían de ninguna carpeta que esté también aquí. */
  get sueltas(): FilaPapeleraPagina[] {
    const enCesto = new Set(this.carpetas.map(c => c.id));
    return this.filas.filter(f => f.tipo === 'pagina' && !enCesto.has(f.grupo_id ?? -1));
  }

  paginasDe(carpeta: FilaPapeleraPagina): FilaPapeleraPagina[] {
    return this.filas.filter(f => f.tipo === 'pagina' && f.grupo_id === carpeta.id);
  }

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
      const res: any = await firstValueFrom(
        fila.tipo === 'carpeta' ? this._paginaService.restaurarGrupo(fila.id)
                                : this._paginaService.restaurar([fila.id]));
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

  /**
   * Vaciar BORRA DE VERDAD y no se puede deshacer, así que se pregunta. El
   * permiso lo comprueba también el servidor: esconder el botón no impide la
   * llamada.
   */
  async vaciar(): Promise<void> {
    if (this.trabajando || !this.puedeVaciar) { return; }
    if (!confirm('Se borrarán definitivamente todas las páginas y carpetas de la papelera, '
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
