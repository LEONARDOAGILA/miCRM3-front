import { Component, EventEmitter, Input, OnDestroy, Output } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { LoadingBarService } from '@ngx-loading-bar/core';
import { ToastrService } from 'ngx-toastr';

import { MarcacionService } from '../../../services/marcacion.service';
import { MarcacionModel } from '../../../interfaces/marcacionModel';

/** Confirmación de borrado de una marcación (mismo esquema que deleteCargo). */
@Component({
  selector: 'app-deleteMarcacion',
  templateUrl: './deleteMarcacion.component.html',
  styleUrls: ['./deleteMarcacion.component.css'],
  standalone: false,
})
export class DeleteMarcacionComponent implements OnDestroy {

  @Input() registro_selected: MarcacionModel | null = null;
  @Output() registrosE: EventEmitter<any> = new EventEmitter();

  public title = 'Eliminar marcación';
  public isLoading = false;
  private unsubscribe$ = new Subject<void>();

  constructor(
    public modal: NgbActiveModal,
    private loadingBar: LoadingBarService,
    private _toastr: ToastrService,
    private _marcacionService: MarcacionService,
  ) {}

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

  get fotoUrl(): string | null {
    return this.registro_selected?.foto ? this._marcacionService.getImagenMarcacion(this.registro_selected.id) : null;
  }

  deleteMarcacion(): void {
    if (!this.registro_selected) { return; }
    this.isLoading = true;
    this.loadingBar.start();

    this._marcacionService.deleteMarcacion(this.registro_selected.id)
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe({
        next: (response: any) => {
          this.isLoading = false;
          this.loadingBar.complete();
          if (response.status !== 'success') {
            this._toastr.error(response.message || 'No se pudo eliminar la marcación', 'Error');
            return;
          }
          this.registrosE.emit(this.registro_selected);
          this._toastr.success(response.message, 'Éxito', { closeButton: true });
          this.modal.close();
        },
        error: (error: any) => {
          console.error('Error en deleteMarcacion:', error);   // el interceptor ya avisó
          this.isLoading = false;
          this.loadingBar.complete();
        },
      });
  }
}
