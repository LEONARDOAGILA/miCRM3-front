import { Component, EventEmitter, Input, OnDestroy, Output } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { LoadingBarService } from '@ngx-loading-bar/core';
import { ToastrService } from 'ngx-toastr';

import { GrupoService } from '../../../services/grupo.service';
import { GrupoModel } from '../../../interfaces/grupoModel';

/** Confirmación de borrado de un grupo (mismo esquema que deleteUser). */
@Component({
  selector: 'app-deleteGrupo',
  templateUrl: './deleteGrupo.component.html',
  styleUrls: ['./deleteGrupo.component.css'],
  standalone: false,
})
export class DeleteGrupoComponent implements OnDestroy {

  @Input() registro_selected: GrupoModel | null = null;
  @Output() registrosE: EventEmitter<any> = new EventEmitter();

  public title = 'Eliminar grupo';
  public isLoading = false;
  private unsubscribe$ = new Subject<void>();

  constructor(
    public modal: NgbActiveModal,
    private loadingBar: LoadingBarService,
    private _toastr: ToastrService,
    private _grupoService: GrupoService,
  ) {}

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

  /** No se puede borrar con usuarios o subgrupos: el botón se deshabilita y el back lo vuelve a comprobar. */
  get bloqueado(): boolean {
    return (this.registro_selected?.num_usuarios ?? 0) > 0 || (this.registro_selected?.num_hijos ?? 0) > 0;
  }

  deleteGrupo(): void {
    if (!this.registro_selected) { return; }
    this.isLoading = true;
    this.loadingBar.start();

    this._grupoService.deleteGrupo(this.registro_selected.id)
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe({
        next: (response: any) => {
          this.isLoading = false;
          this.loadingBar.complete();
          if (response.status !== 'success') {
            this._toastr.error(response.message || 'No se pudo eliminar el grupo', 'Error');
            return;
          }
          this.registrosE.emit(this.registro_selected);
          this._toastr.success(response.message, 'Éxito', { closeButton: true });
          this.modal.close();
        },
        error: (error: any) => {
          // El AuthInterceptor ya muestra el toast (409 con usuarios / subgrupos)
          console.error('Error en deleteGrupo:', error);
          this.isLoading = false;
          this.loadingBar.complete();
        },
      });
  }
}
