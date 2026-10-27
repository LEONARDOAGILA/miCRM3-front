import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { LoadingBarService } from '@ngx-loading-bar/core';
import { ToastrService } from 'ngx-toastr';

import { HorarioEmpleadoService } from '../../../services/horarioEmpleado.service';
import { CommonModule } from '@angular/common';
import { ModalArrastrableDirective } from '../../../../../components/modal/modal-arrastrable.directive';

/**
 * Confirmación de borrado de un horario de trabajo (mismo esquema que
 * deleteCargo).
 *
 * No borra: es un borrado lógico. El horario va a la papelera CON SUS
 * JORNADAS y desde allí se restaura tal cual.
 */
@Component({
  selector: 'app-deleteHorarioEmpleado',
  templateUrl: './deleteHorarioEmpleado.component.html',
  styleUrls: ['./deleteHorarioEmpleado.component.css'],
  standalone: true,
  imports: [CommonModule, ModalArrastrableDirective],
})
export class DeleteHorarioEmpleadoComponent implements OnInit, OnDestroy {

  @Input() registro_selected: any = null;
  @Output() registrosE: EventEmitter<any> = new EventEmitter();

  public title: string;
  public isLoading: boolean;
  private unsubscribe$ = new Subject<void>();

  constructor(
    public modal: NgbActiveModal,
    private loadingBar: LoadingBarService,
    private _toastr: ToastrService,
    public _horarioService: HorarioEmpleadoService,
  ) {
    this.title = 'Eliminar Horario';
    this.isLoading = false;
  }

  ngOnInit(): void { }

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

  /** Las jornadas que se van con él a la papelera (y vuelven al restaurarlo). */
  get numJornadas(): number { return Number(this.registro_selected?.num_jornadas ?? 0); }

  /** Los días con jornada, para decirle al usuario qué es lo que se lleva. */
  get numDias(): number { return Number(this.registro_selected?.num_dias ?? 0); }

  /**
   * Empleados que lo tienen puesto. Con alguno, el servidor lo rechaza:
   * se avisa aquí para no tener que intentarlo y leer el error.
   */
  get numEmpleados(): number { return Number(this.registro_selected?.num_empleados ?? 0); }

  deleteHorario() {
    this.isLoading = true;
    this.loadingBar.start();

    this._horarioService.deleteHorario(this.registro_selected.id)
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe({
        next: (response: any) => {
          this.isLoading = false;
          this.loadingBar.complete();

          if (response.status !== 'success') {
            this._toastr.error(response.message || 'No se pudo eliminar el horario', 'Error');
            return;
          }

          // Emitir ANTES de cerrar (el padre corta la suscripción al resolverse modalRef.result)
          this.registrosE.emit(this.registro_selected);
          this._toastr.success(response.message, 'Éxito', { closeButton: true });
          this.modal.close();
        },
        error: (error: any) => {
          // El AuthInterceptor ya muestra el toast del error HTTP
          console.error('Error en deleteHorarioEmpleado:', error);
          this.isLoading = false;
          this.loadingBar.complete();
        },
      });
  }
}
