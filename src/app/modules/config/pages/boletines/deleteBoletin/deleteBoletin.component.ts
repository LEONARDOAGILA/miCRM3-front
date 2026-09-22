import { Component, EventEmitter, Input, OnDestroy, Output } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { LoadingBarService } from '@ngx-loading-bar/core';
import { ToastrService } from 'ngx-toastr';

import { BoletinService } from '../../../services/boletin.service';
import { BoletinModel } from '../../../interfaces/boletinModel';

/**
 * Enviar un boletín a la papelera (borrado lógico: deleted_at / deleted_by).
 * Deja de mostrarse a los usuarios y se puede restaurar desde la papelera.
 */
@Component({
  selector: 'app-deleteBoletin',
  templateUrl: './deleteBoletin.component.html',
  styleUrls: ['./deleteBoletin.component.css'],
  standalone: false,
})
export class DeleteBoletinComponent implements OnDestroy {

  @Input() registro_selected: BoletinModel | null = null;
  @Output() registrosE: EventEmitter<BoletinModel> = new EventEmitter();

  public title = 'Enviar boletín a la papelera';
  public isLoading = false;
  private unsubscribe$ = new Subject<void>();

  constructor(
    public modal: NgbActiveModal,
    private loadingBar: LoadingBarService,
    private _toastr: ToastrService,
    public _boletinService: BoletinService,
  ) {}

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

  deleteBoletin(): void {
    if (!this.registro_selected) { return; }
    this.isLoading = true;
    this.loadingBar.start();

    this._boletinService.deleteBoletin(this.registro_selected.id)
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe({
        next: (response: any) => {
          this.isLoading = false;
          this.loadingBar.complete();

          if (response.status !== 'success') {
            this._toastr.error(response.message || 'No se pudo eliminar el boletín', 'Error');
            return;
          }

          this.registrosE.emit(this.registro_selected!);
          this._toastr.success(response.message, 'Éxito', { closeButton: true });
          this.modal.close();
        },
        error: (error: any) => {
          console.error('Error en deleteBoletin:', error);
          this.isLoading = false;
          this.loadingBar.complete();
        },
      });
  }
}
