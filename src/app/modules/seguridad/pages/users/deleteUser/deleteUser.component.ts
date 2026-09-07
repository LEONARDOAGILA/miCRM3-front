import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { LoadingBarService } from '@ngx-loading-bar/core';
import { ToastrService } from 'ngx-toastr';

import { UserService } from "../../../../seguridad/services/user.service";

@Component({
  selector: 'app-deleteUser',
  templateUrl: './deleteUser.component.html',
  styleUrls: ['./deleteUser.component.css'],
  standalone: false,
})
export class DeleteUserComponent implements OnInit, OnDestroy {

  @Input() registro_selected: any = null;
  @Output() registrosE: EventEmitter<any> = new EventEmitter();

  public title: string;
  public isLoading: boolean;
  private unsubscribe$ = new Subject<void>();

  constructor(
    public modal: NgbActiveModal,
    private loadingBar: LoadingBarService,
    private _toastr: ToastrService,
    public _userService: UserService,
  ) {
    this.title = 'Eliminar Usuario';
    this.isLoading = false;
  }

  ngOnInit(): void {
    //console.log('registro selected', this.registro_selected);
  }

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

  deleteUser() {
    this.isLoading = true;
    this.loadingBar.start();
    
    this._userService.deleteUser(this.registro_selected.id)
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe({
        next: (response: any) => {
          this.isLoading = false;
          this.loadingBar.complete();

          if (response.status !== 'success') {
            // No cerramos el modal: el usuario debe poder reintentar
            this._toastr.error(response.message || 'No se pudo eliminar el usuario', 'Error');
            return;
          }

          // Emitir ANTES de cerrar. El padre corta la suscripción cuando se
          // resuelve modalRef.result, así que cerrar primero dejaba la fila en
          // la grilla si el orden llegaba a cambiar.
          this.registrosE.emit(this.registro_selected);
          this._toastr.success(response.message, 'Éxito', { closeButton: true });
          this.modal.close();
        },
        error: (error: any) => {
          // El AuthInterceptor ya muestra el toast del error HTTP: aquí solo
          // reactivamos el modal para poder reintentar.
          console.error('Error en deleteUser:', error);
          this.isLoading = false;
          this.loadingBar.complete();
        },
      });
  }
}
