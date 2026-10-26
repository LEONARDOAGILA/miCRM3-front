import { Component, EventEmitter, Input, OnDestroy, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { LoadingBarService } from '@ngx-loading-bar/core';
import { ToastrService } from 'ngx-toastr';

import { ModalArrastrableDirective } from '../../../../../components/modal/modal-arrastrable.directive';
import { PuntoVentaService } from '../../../services/puntoVenta.service';

/**
 * Confirmación de borrado de un punto de venta.
 *
 * Es un borrado LÓGICO: la caja queda en la papelera y puede volver CON SUS
 * CUENTAS, que no se tocan hasta que se borra de verdad. Eso es lo que hay
 * que decir aquí: lo que se pierde y lo que no.
 */
@Component({
  selector: 'app-deletePuntoVenta',
  standalone: true,
  imports: [CommonModule, ModalArrastrableDirective],
  templateUrl: './deletePuntoVenta.component.html',
  styleUrls: ['./deletePuntoVenta.component.css'],
})
export class DeletePuntoVentaComponent implements OnDestroy {

  @Input() registro_selected: any = null;
  @Output() registrosE: EventEmitter<any> = new EventEmitter();

  public title = 'Eliminar punto de venta';
  public isLoading = false;

  private unsubscribe$ = new Subject<void>();

  constructor(
    public modal: NgbActiveModal,
    private loadingBar: LoadingBarService,
    private _toastr: ToastrService,
    public _puntoVentaService: PuntoVentaService,
  ) {}

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

  /** Cuentas puestas en esta caja (las que se irían con ella al borrarla de verdad). */
  get cuentasPropias(): number {
    return Number(this.registro_selected?.cuentas?.propias ?? 0);
  }

  deletePuntoVenta(): void {
    this.isLoading = true;
    this.loadingBar.start();

    this._puntoVentaService.deletePuntoVenta(this.registro_selected.id)
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe({
        next: (response: any) => {
          this.isLoading = false;
          this.loadingBar.complete();

          if (response.status !== 'success') {
            this._toastr.error(response.message || 'No se pudo eliminar el punto de venta', 'Error');
            return;
          }

          // Emitir ANTES de cerrar (el padre corta la suscripción al
          // resolverse modalRef.result)
          this.registrosE.emit(this.registro_selected);
          this._toastr.success(response.message, 'Éxito', { closeButton: true });
          this.modal.close();
        },
        error: (error: any) => {
          // El AuthInterceptor ya enseñó el toast del error HTTP
          console.error('Error en deletePuntoVenta:', error);
          this.isLoading = false;
          this.loadingBar.complete();
        },
      });
  }
}
