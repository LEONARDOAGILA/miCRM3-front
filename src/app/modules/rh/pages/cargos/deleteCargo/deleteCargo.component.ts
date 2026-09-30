import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { LoadingBarService } from '@ngx-loading-bar/core';
import { ToastrService } from 'ngx-toastr';

import { CargoService } from '../../../services/cargo.service';

/**
 * Confirmación de borrado de un cargo (mismo esquema que deleteUser).
 * El back rechaza con 409 si el cargo tiene empleados o historial; el
 * mensaje lo muestra el AuthInterceptor y el modal se queda abierto.
 */
@Component({
  selector: 'app-deleteCargo',
  templateUrl: './deleteCargo.component.html',
  styleUrls: ['./deleteCargo.component.css'],
  standalone: false,
})
export class DeleteCargoComponent implements OnInit, OnDestroy {

  @Input() registro_selected: any = null;
  @Output() registrosE: EventEmitter<any> = new EventEmitter();

  public title: string;
  public isLoading: boolean;
  private unsubscribe$ = new Subject<void>();

  constructor(
    public modal: NgbActiveModal,
    private loadingBar: LoadingBarService,
    private _toastr: ToastrService,
    public _cargoService: CargoService,
  ) {
    this.title = 'Eliminar Cargo';
    this.isLoading = false;
  }

  ngOnInit(): void { }

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

  /** Empleados con este cargo: si hay, el back no lo deja borrar (se avisa antes de intentarlo). */
  get numEmpleados(): number { return Number(this.registro_selected?.num_empleados ?? 0); }

  deleteCargo() {
    this.isLoading = true;
    this.loadingBar.start();

    this._cargoService.deleteCargo(this.registro_selected.id)
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe({
        next: (response: any) => {
          this.isLoading = false;
          this.loadingBar.complete();

          if (response.status !== 'success') {
            this._toastr.error(response.message || 'No se pudo eliminar el cargo', 'Error');
            return;
          }

          // Emitir ANTES de cerrar (el padre corta la suscripción al resolverse modalRef.result)
          this.registrosE.emit(this.registro_selected);
          this._toastr.success(response.message, 'Éxito', { closeButton: true });
          this.modal.close();
        },
        error: (error: any) => {
          // El AuthInterceptor ya muestra el toast del error HTTP (409 con el motivo)
          console.error('Error en deleteCargo:', error);
          this.isLoading = false;
          this.loadingBar.complete();
        },
      });
  }
}
