import { Component, EventEmitter, Input, OnDestroy, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { LoadingBarService } from '@ngx-loading-bar/core';
import { ToastrService } from 'ngx-toastr';

import { TipoUsuarioService } from '../../../services/tipoUsuario.service';
import { ModalArrastrableDirective } from '../../../../../components/modal/modal-arrastrable.directive';

/**
 * Confirmación para eliminar un tipo de usuario.
 *
 * Un tipo EN USO no se borra: lo rechaza la función de base y la pantalla ya
 * deshabilita el botón. Para retirar uno que se usa está «Activo» en la ficha,
 * que deja de ofrecerlo sin tocar a los usuarios que ya lo tienen. Aquí se
 * recuerda, porque es la duda que trae a esta ventana.
 */
@Component({
  selector: 'app-deleteTipoUsuario',
  standalone: true,
  imports: [CommonModule, ModalArrastrableDirective],
  templateUrl: './deleteTipoUsuario.component.html',
  styleUrls: ['./deleteTipoUsuario.component.css'],
})
export class DeleteTipoUsuarioComponent implements OnDestroy {
  @Input() registro_selected: any = null;
  @Output() registrosE: EventEmitter<any> = new EventEmitter();

  public title = 'Eliminar Tipo de Usuario';
  public isLoading = false;
  private unsubscribe$ = new Subject<void>();

  constructor(
    public modal: NgbActiveModal,
    private loadingBar: LoadingBarService,
    private _toastr: ToastrService,
    public _tipoUsuarioService: TipoUsuarioService,
  ) { }

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

  deleteTipoUsuario(): void {
    this.isLoading = true;
    this.loadingBar.start();

    this._tipoUsuarioService.deleteTipoUsuario(this.registro_selected.id)
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe({
        next: (response: any) => {
          if (response.status === 'success') {
            this.modal.close();
            this.registrosE.emit(this.registro_selected);
            this._toastr.success(response.message, 'Éxito', { closeButton: true });
          } else {
            // El mensaje de la base explica por qué no se pudo (por ejemplo,
            // que el tipo está en uso): se enseña y se deja la ventana abierta
            this._toastr.error(response?.message || 'No se pudo eliminar', 'Error', { closeButton: true });
          }
          this.isLoading = false;
          this.loadingBar.complete();
        },
        error: (error: any) => {
          console.error('Error en deleteTipoUsuario:', error);
          this.isLoading = false;
          this.loadingBar.complete();
        },
      });
  }
}
