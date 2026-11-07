import { Component, EventEmitter, Input, OnDestroy, Output, ChangeDetectionStrategy } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { LoadingBarService } from '@ngx-loading-bar/core';
import { ToastrService } from 'ngx-toastr';

import { CaracteristicaNombreService } from '../../../services/caracteristicaNombre.service';
import { CommonModule } from '@angular/common';
import { ModalArrastrableDirective } from '../../../../../components/modal/modal-arrastrable.directive';

/**
 * Confirmación de borrado de un nombre del diccionario (mismo esquema que
 * deleteCaracteristica).
 *
 * Es borrado LÓGICO: va a la papelera y deja de poderse escoger. Pero sólo si
 * NO está en uso: el servidor se niega mientras alguna categoría lo apunte,
 * porque esas categorías se quedarían enseñando un nombre que está en la
 * papelera. Aquí se avisa antes para que no haya que leer un error.
 */
@Component({
  selector: 'app-deleteCaracteristicaNombre',
  templateUrl: './deleteCaracteristicaNombre.component.html',
  styleUrls: ['./deleteCaracteristicaNombre.component.css'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [CommonModule, ModalArrastrableDirective],
})
export class DeleteCaracteristicaNombreComponent implements OnDestroy {

  @Input() registro_selected: any = null;
  @Output() registrosE: EventEmitter<any> = new EventEmitter();

  public title = 'Eliminar Nombre de Característica';
  public isLoading = false;
  private unsubscribe$ = new Subject<void>();

  constructor(
    public modal: NgbActiveModal,
    private loadingBar: LoadingBarService,
    private _toastr: ToastrService,
    public _caracteristicaNombreService: CaracteristicaNombreService,
  ) {}

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

  /** En cuántas categorías se está pidiendo ahora mismo. */
  get numCategorias(): number { return Number(this.registro_selected?.num_categorias ?? 0); }

  /** Y en cuántos productos está relleno. */
  get numProductos(): number { return Number(this.registro_selected?.num_productos ?? 0); }

  /** En uso: el servidor no va a dejar, así que el botón ni se ofrece. */
  get enUso(): boolean { return this.numCategorias > 0 || this.numProductos > 0; }

  deleteCaracteristicaNombre(): void {
    if (this.enUso) { return; }

    this.isLoading = true;
    this.loadingBar.start();

    this._caracteristicaNombreService.deleteCaracteristicaNombre(this.registro_selected.id)
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe({
        next: (response: any) => {
          this.isLoading = false;
          this.loadingBar.complete();

          if (response.status !== 'success') {
            this._toastr.error(response.message || 'No se pudo eliminar el nombre', 'Error');
            return;
          }

          // Emitir ANTES de cerrar (el padre corta la suscripción al resolverse modalRef.result)
          this.registrosE.emit(this.registro_selected);
          this._toastr.success(response.message, 'Éxito', { closeButton: true });
          this.modal.close();
        },
        error: (error: any) => {
          // El AuthInterceptor ya muestra el toast del error HTTP
          console.error('Error en deleteCaracteristicaNombre:', error);
          this.isLoading = false;
          this.loadingBar.complete();
        },
      });
  }
}
