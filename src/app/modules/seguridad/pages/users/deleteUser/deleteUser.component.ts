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
          if (response.status === 'success') {
            this.modal.close();
            this.registrosE.emit(this.registro_selected);
            this._toastr.success(response.message, 'Éxito', { closeButton: true });
            this.isLoading = false;
            this.loadingBar.complete();
          } else {
            this._toastr.error(response.message || 'Error al eliminar el usuario', 'Error');
            this.modal.close();
            this.isLoading = false;
            this.loadingBar.complete();
          }
        },
        error: (error: any) => {
          console.error('Error en deleteUser:', error);
          this._toastr.error(error.message || 'Error al eliminar el usuario', 'Error');
          this.modal.close();
          this.isLoading = false;
          this.loadingBar.complete();
        },
        complete: () => {
          this.isLoading = false;
          this.loadingBar.complete();
        },
      });
  }
}
