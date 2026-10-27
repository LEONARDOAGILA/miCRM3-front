import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { LoadingBarService } from '@ngx-loading-bar/core';
import { ToastrService } from 'ngx-toastr';

import { GrupoClienteService } from '../../../../services/grupoCliente.service';
import { CommonModule } from '@angular/common';
import { ModalArrastrableDirective } from '../../../../../../components/modal/modal-arrastrable.directive';

/**
 * Confirmación de borrado de un grupo (mismo esquema que deleteUser).
 * El back rechaza con 409 si el grupo tiene subgrupos o clientes; el
 * mensaje lo muestra el AuthInterceptor y el modal se queda abierto.
 */
@Component({
  selector: 'app-deleteGrupoCliente',
  templateUrl: './deleteGrupoCliente.component.html',
  styleUrls: ['./deleteGrupoCliente.component.css'],
  standalone: true,
  imports: [CommonModule, ModalArrastrableDirective],
})
export class DeleteGrupoClienteComponent implements OnInit, OnDestroy {

  @Input() registro_selected: any = null;
  @Output() registrosE: EventEmitter<any> = new EventEmitter();

  public title: string;
  public isLoading: boolean;
  private unsubscribe$ = new Subject<void>();

  constructor(
    public modal: NgbActiveModal,
    private loadingBar: LoadingBarService,
    private _toastr: ToastrService,
    public _grupoClienteService: GrupoClienteService,
  ) {
    this.title = 'Eliminar Grupo';
    this.isLoading = false;
  }

  ngOnInit(): void { }

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

  /** Subgrupos directos: si hay, el back no la deja borrar (se avisa antes de intentarlo). */
  get numHijos(): number { return Number(this.registro_selected?.num_hijos ?? 0); }

  /** Clientes en este grupo: lo mismo. */
  get numClientes(): number { return Number(this.registro_selected?.num_clientes ?? 0); }

  /** El camino completo, que es lo que identifica a un grupo fuera del árbol. */
  get ruta(): string { return this.registro_selected?.ruta || this.registro_selected?.nombre || '—'; }

  deleteGrupoCliente() {
    this.isLoading = true;
    this.loadingBar.start();

    this._grupoClienteService.deleteGrupoCliente(this.registro_selected.id)
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe({
        next: (response: any) => {
          this.isLoading = false;
          this.loadingBar.complete();

          if (response.status !== 'success') {
            this._toastr.error(response.message || 'No se pudo eliminar el grupo', 'Error');
            return;
          }

          // Emitir ANTES de cerrar (el padre corta la suscripción al resolverse modalRef.result)
          this.registrosE.emit(this.registro_selected);
          this._toastr.success(response.message, 'Éxito', { closeButton: true });
          this.modal.close();
        },
        error: (error: any) => {
          // El AuthInterceptor ya muestra el toast del error HTTP (409 con el motivo)
          console.error('Error en deleteGrupoCliente:', error);
          this.isLoading = false;
          this.loadingBar.complete();
        },
      });
  }
}
