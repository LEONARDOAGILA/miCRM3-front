import { Component, EventEmitter, Input, OnDestroy, Output } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { LoadingBarService } from '@ngx-loading-bar/core';
import { ToastrService } from 'ngx-toastr';

import { GestionService } from '../../../services/gestion.service';
import { GestionModel } from '../../../interfaces/gestionModel';

/**
 * Confirmación de borrado de una gestión (mismo esquema que deleteCliente).
 *
 * Aquí había un Swal de una línea. No es lo mismo: una gestión se reconoce por
 * su asunto, su fecha y de quién es, y el aviso de una ventana de sistema no
 * deja ver nada de eso —ni que el borrado es DEFINITIVO, que es lo que de
 * verdad hay que leer antes de pulsar—.
 *
 * El mensaje de un rechazo lo muestra el AuthInterceptor y el modal se queda
 * abierto.
 */
@Component({
  selector: 'app-deleteGestion',
  templateUrl: './deleteGestion.component.html',
  styleUrls: ['./deleteGestion.component.css'],
  standalone: false,
})
export class DeleteGestionComponent implements OnDestroy {

  @Input() registro_selected: GestionModel | any = null;
  @Output() registrosE: EventEmitter<any> = new EventEmitter();

  public title = 'Eliminar gestión';
  public isLoading = false;
  private unsubscribe$ = new Subject<void>();

  constructor(
    public modal: NgbActiveModal,
    private loadingBar: LoadingBarService,
    private _toastr: ToastrService,
    public _gestionService: GestionService,
  ) {}

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

  /** Cuándo pasó o cuándo toca, según esté hecha o pendiente. */
  public get cuando(): string {
    return this.registro_selected?.fecha_realizada
        ?? this.registro_selected?.fecha_programada
        ?? '—';
  }

  public get adjuntos(): number {
    return this.registro_selected?.num_adjuntos ?? 0;
  }

  deleteGestion(): void {
    this.isLoading = true;
    this.loadingBar.start();

    this._gestionService.deleteGestion(this.registro_selected.id)
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe({
        next: (response: any) => {
          this.isLoading = false;
          this.loadingBar.complete();

          if (response.status !== 'success') {
            this._toastr.error(response.message || 'No se pudo eliminar la gestión', 'Error');
            return;
          }

          // Emitir ANTES de cerrar: el padre corta la suscripción cuando se
          // resuelve modalRef.result
          this.registrosE.emit(this.registro_selected);
          this._toastr.success(response.message, 'Eliminada', { closeButton: true });
          this.modal.close();
        },
        error: (error: any) => {
          // El AuthInterceptor ya muestra el toast del error HTTP
          console.error('Error en deleteGestion:', error);
          this.isLoading = false;
          this.loadingBar.complete();
        },
      });
  }
}
