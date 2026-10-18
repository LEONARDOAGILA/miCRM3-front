import { Component, EventEmitter, Input, OnDestroy, Output } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { LoadingBarService } from '@ngx-loading-bar/core';
import { ToastrService } from 'ngx-toastr';

import { CaracteristicaService } from '../../../services/caracteristica.service';

/**
 * Confirmación de borrado de una característica de la plantilla (mismo
 * esquema que deleteMarca).
 *
 * Es borrado LÓGICO: la característica va a la papelera y deja de pedirse en
 * los productos nuevos. Lo que los productos ya tengan relleno NO se toca,
 * porque cada producto guardó el nombre con el que lo rellenó.
 */
@Component({
  selector: 'app-deleteCaracteristica',
  templateUrl: './deleteCaracteristica.component.html',
  styleUrls: ['./deleteCaracteristica.component.css'],
  standalone: false,
})
export class DeleteCaracteristicaComponent implements OnDestroy {

  @Input() registro_selected: any = null;
  @Output() registrosE: EventEmitter<any> = new EventEmitter();

  public title = 'Eliminar Característica';
  public isLoading = false;
  private unsubscribe$ = new Subject<void>();

  constructor(
    public modal: NgbActiveModal,
    private loadingBar: LoadingBarService,
    private _toastr: ToastrService,
    public _caracteristicaService: CaracteristicaService,
  ) {}

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

  /** Productos que la tienen rellena: lo suyo se conserva igualmente. */
  get numProductos(): number { return Number(this.registro_selected?.num_productos ?? 0); }

  deleteCaracteristica(): void {
    this.isLoading = true;
    this.loadingBar.start();

    this._caracteristicaService.deleteCaracteristica(this.registro_selected.id)
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe({
        next: (response: any) => {
          this.isLoading = false;
          this.loadingBar.complete();

          if (response.status !== 'success') {
            this._toastr.error(response.message || 'No se pudo eliminar la característica', 'Error');
            return;
          }

          // Emitir ANTES de cerrar (el padre corta la suscripción al resolverse modalRef.result)
          this.registrosE.emit(this.registro_selected);
          this._toastr.success(response.message, 'Éxito', { closeButton: true });
          this.modal.close();
        },
        error: (error: any) => {
          // El AuthInterceptor ya muestra el toast del error HTTP
          console.error('Error en deleteCaracteristica:', error);
          this.isLoading = false;
          this.loadingBar.complete();
        },
      });
  }
}
