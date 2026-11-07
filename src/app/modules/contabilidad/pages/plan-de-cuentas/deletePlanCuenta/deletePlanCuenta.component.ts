import { Component, EventEmitter, Input, OnDestroy, OnInit, Output, ChangeDetectionStrategy } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { LoadingBarService } from '@ngx-loading-bar/core';
import { ToastrService } from 'ngx-toastr';

import { PlanCuentaService } from '../../../services/planCuenta.service';
import { CommonModule } from '@angular/common';
import { ModalArrastrableDirective } from '../../../../../components/modal/modal-arrastrable.directive';

/**
 * Confirmación de borrado de una cuenta (mismo esquema que deleteUser).
 * El back rechaza con 409 si la cuenta tiene subcuentas; el mensaje lo
 * muestra el AuthInterceptor y el modal se queda abierto.
 */
@Component({
  selector: 'app-deletePlanCuenta',
  templateUrl: './deletePlanCuenta.component.html',
  styleUrls: ['./deletePlanCuenta.component.css'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [CommonModule, ModalArrastrableDirective],
})
export class DeletePlanCuentaComponent implements OnInit, OnDestroy {

  @Input() registro_selected: any = null;
  @Output() registrosE: EventEmitter<any> = new EventEmitter();

  public title: string;
  public isLoading: boolean;
  private unsubscribe$ = new Subject<void>();

  constructor(
    public modal: NgbActiveModal,
    private loadingBar: LoadingBarService,
    private _toastr: ToastrService,
    public _planCuentaService: PlanCuentaService,
  ) {
    this.title = 'Eliminar Cuenta';
    this.isLoading = false;
  }

  ngOnInit(): void { }

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

  /** Subcuentas directas: si hay, el back no la deja borrar (se avisa antes de intentarlo). */
  get numHijos(): number { return Number(this.registro_selected?.num_hijos ?? 0); }

  /** El camino completo, que es lo que identifica a una cuenta fuera del árbol. */
  get ruta(): string { return this.registro_selected?.ruta || this.registro_selected?.nombre || '—'; }

  deletePlanCuenta() {
    this.isLoading = true;
    this.loadingBar.start();

    this._planCuentaService.deletePlanCuenta(this.registro_selected.id)
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe({
        next: (response: any) => {
          this.isLoading = false;
          this.loadingBar.complete();

          if (response.status !== 'success') {
            this._toastr.error(response.message || 'No se pudo eliminar la cuenta', 'Error');
            return;
          }

          // Emitir ANTES de cerrar (el padre corta la suscripción al resolverse modalRef.result)
          this.registrosE.emit(this.registro_selected);
          this._toastr.success(response.message, 'Éxito', { closeButton: true });
          this.modal.close();
        },
        error: (error: any) => {
          // El AuthInterceptor ya muestra el toast del error HTTP (409 con el motivo)
          console.error('Error en deletePlanCuenta:', error);
          this.isLoading = false;
          this.loadingBar.complete();
        },
      });
  }
}
