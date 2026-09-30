import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { LoadingBarService } from '@ngx-loading-bar/core';
import { ToastrService } from 'ngx-toastr';

import { ClienteService } from '../../../services/cliente.service';

/**
 * Confirmación de borrado de un cliente (mismo esquema que deleteUser).
 * El borrado es lógico: el cliente va a la papelera de reciclaje
 * (deleted_at / deleted_by), desde donde se restaura o se borra de verdad.
 * El mensaje de un rechazo lo muestra el AuthInterceptor y el modal se
 * queda abierto.
 */
@Component({
  selector: 'app-deleteCliente',
  templateUrl: './deleteCliente.component.html',
  styleUrls: ['./deleteCliente.component.css'],
  standalone: false,
})
export class DeleteClienteComponent implements OnInit, OnDestroy {

  @Input() registro_selected: any = null;
  @Output() registrosE: EventEmitter<any> = new EventEmitter();

  public title: string;
  public isLoading: boolean;
  private unsubscribe$ = new Subject<void>();

  constructor(
    public modal: NgbActiveModal,
    private loadingBar: LoadingBarService,
    private _toastr: ToastrService,
    public _clienteService: ClienteService,
  ) {
    this.title = 'Enviar cliente a la papelera';
    this.isLoading = false;
  }

  ngOnInit(): void { }

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

  deleteCliente() {
    this.isLoading = true;
    this.loadingBar.start();

    this._clienteService.deleteCliente(this.registro_selected.id)
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe({
        next: (response: any) => {
          this.isLoading = false;
          this.loadingBar.complete();

          if (response.status !== 'success') {
            this._toastr.error(response.message || 'No se pudo enviar el cliente a la papelera', 'Error');
            return;
          }

          // Emitir ANTES de cerrar (el padre corta la suscripción al resolverse modalRef.result)
          this.registrosE.emit(this.registro_selected);
          this._toastr.success(response.message, 'Éxito', { closeButton: true });
          this.modal.close();
        },
        error: (error: any) => {
          // El AuthInterceptor ya muestra el toast del error HTTP (409 con el motivo)
          console.error('Error en deleteCliente:', error);
          this.isLoading = false;
          this.loadingBar.complete();
        },
      });
  }
}
