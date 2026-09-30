import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { LoadingBarService } from '@ngx-loading-bar/core';
import { ToastrService } from 'ngx-toastr';

import { EmpleadoService } from '../../../services/empleado.service';

/**
 * Confirmación de borrado de un empleado (mismo esquema que deleteUser).
 * El back rechaza con 409 si el empleado tiene empleados o historial; el
 * mensaje lo muestra el AuthInterceptor y el modal se queda abierto.
 */
@Component({
  selector: 'app-deleteEmpleado',
  templateUrl: './deleteEmpleado.component.html',
  styleUrls: ['./deleteEmpleado.component.css'],
  standalone: false,
})
export class DeleteEmpleadoComponent implements OnInit, OnDestroy {

  @Input() registro_selected: any = null;
  @Output() registrosE: EventEmitter<any> = new EventEmitter();

  public title: string;
  public isLoading: boolean;
  private unsubscribe$ = new Subject<void>();

  constructor(
    public modal: NgbActiveModal,
    private loadingBar: LoadingBarService,
    private _toastr: ToastrService,
    public _empleadoService: EmpleadoService,
  ) {
    this.title = 'Eliminar Empleado';
    this.isLoading = false;
  }

  ngOnInit(): void { }

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

  deleteEmpleado() {
    this.isLoading = true;
    this.loadingBar.start();

    this._empleadoService.deleteEmpleado(this.registro_selected.id)
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe({
        next: (response: any) => {
          this.isLoading = false;
          this.loadingBar.complete();

          if (response.status !== 'success') {
            this._toastr.error(response.message || 'No se pudo eliminar el empleado', 'Error');
            return;
          }

          // Emitir ANTES de cerrar (el padre corta la suscripción al resolverse modalRef.result)
          this.registrosE.emit(this.registro_selected);
          this._toastr.success(response.message, 'Éxito', { closeButton: true });
          this.modal.close();
        },
        error: (error: any) => {
          // El AuthInterceptor ya muestra el toast del error HTTP (409 con el motivo)
          console.error('Error en deleteEmpleado:', error);
          this.isLoading = false;
          this.loadingBar.complete();
        },
      });
  }
}
