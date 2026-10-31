import { Component, EventEmitter, Input, OnDestroy, Output, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { LoadingBarService } from '@ngx-loading-bar/core';
import { ToastrService } from 'ngx-toastr';

import { ModalArrastrableDirective } from '../../../../../components/modal/modal-arrastrable.directive';
import { SucursalService } from '../../../services/sucursal.service';

/**
 * Confirmación de borrado de una sucursal (mismo esquema que deleteMarca).
 *
 * El back rechaza con 409 si la sucursal tiene empleados asignados; el
 * mensaje lo muestra el AuthInterceptor y el modal se queda abierto.
 *
 * SE AVISA DE LO QUE PASA CON LA MARCACIÓN: a quien trabaja en esta sucursal
 * el perímetro deja de aplicársele, así que podría marcar desde cualquier
 * sitio. No es algo que se adivine borrando una ficha de direcciones.
 */
@Component({
  selector: 'app-deleteSucursal',
  standalone: true,
  imports: [CommonModule, ModalArrastrableDirective],
  templateUrl: './deleteSucursal.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./deleteSucursal.component.css'],
})
export class DeleteSucursalComponent implements OnDestroy {

  @Input() registro_selected: any = null;
  @Output() registrosE: EventEmitter<any> = new EventEmitter();

  public title: string;
  public isLoading: boolean;
  private unsubscribe$ = new Subject<void>();

  constructor(
    public modal: NgbActiveModal,
    private loadingBar: LoadingBarService,
    private _toastr: ToastrService,
    public _sucursalService: SucursalService,
  ) {
    this.title = 'Eliminar Sucursal';
    this.isLoading = false;
  }

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

  /** Empleados asignados: si hay, el back no la deja borrar (se avisa antes). */
  get numEmpleados(): number { return Number(this.registro_selected?.num_empleados ?? 0); }

  /** El perímetro en una línea, para el detalle. */
  get textoPerimetro(): string {
    const s = this.registro_selected;
    if (!s?.tiene_perimetro) { return 'Sin perímetro'; }
    return s.tipo === 'CIRCULO'
      ? `Círculo de ${Math.round(Number(s.radio_metros ?? 0))} m`
      : `Área de ${s.num_vertices} esquinas`;
  }

  deleteSucursal(): void {
    this.isLoading = true;
    this.loadingBar.start();

    this._sucursalService.deleteSucursal(this.registro_selected.id)
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe({
        next: (response: any) => {
          this.isLoading = false;
          this.loadingBar.complete();

          if (response.status !== 'success') {
            this._toastr.error(response.message || 'No se pudo eliminar la sucursal', 'Error');
            return;
          }

          // Emitir ANTES de cerrar (el padre corta la suscripción al resolverse modalRef.result)
          this.registrosE.emit(this.registro_selected);
          this._toastr.success(response.message, 'Éxito', { closeButton: true });
          this.modal.close();
        },
        error: (error: any) => {
          // El AuthInterceptor ya muestra el toast del error HTTP (409 con el motivo)
          console.error('Error en deleteSucursal:', error);
          this.isLoading = false;
          this.loadingBar.complete();
        },
      });
  }
}
