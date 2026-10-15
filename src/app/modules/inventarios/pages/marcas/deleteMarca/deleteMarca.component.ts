import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { LoadingBarService } from '@ngx-loading-bar/core';
import { ToastrService } from 'ngx-toastr';

import { MarcaService } from '../../../services/marca.service';

/**
 * Confirmación de borrado de un marca (mismo esquema que deleteUser).
 * El back rechaza con 409 si la marca tiene productos; el
 * mensaje lo muestra el AuthInterceptor y el modal se queda abierto.
 */
@Component({
  selector: 'app-deleteMarca',
  templateUrl: './deleteMarca.component.html',
  styleUrls: ['./deleteMarca.component.css'],
  standalone: false,
})
export class DeleteMarcaComponent implements OnInit, OnDestroy {

  @Input() registro_selected: any = null;
  @Output() registrosE: EventEmitter<any> = new EventEmitter();

  public title: string;
  public isLoading: boolean;
  private unsubscribe$ = new Subject<void>();

  constructor(
    public modal: NgbActiveModal,
    private loadingBar: LoadingBarService,
    private _toastr: ToastrService,
    public _marcaService: MarcaService,
  ) {
    this.title = 'Eliminar Marca';
    this.isLoading = false;
  }

  ngOnInit(): void { }

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

  /** Productos de esta marca: si hay, el back no la deja borrar (se avisa antes de intentarlo). */
  get numProductos(): number { return Number(this.registro_selected?.num_productos ?? 0); }

  deleteMarca() {
    this.isLoading = true;
    this.loadingBar.start();

    this._marcaService.deleteMarca(this.registro_selected.id)
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe({
        next: (response: any) => {
          this.isLoading = false;
          this.loadingBar.complete();

          if (response.status !== 'success') {
            this._toastr.error(response.message || 'No se pudo eliminar el marca', 'Error');
            return;
          }

          // Emitir ANTES de cerrar (el padre corta la suscripción al resolverse modalRef.result)
          this.registrosE.emit(this.registro_selected);
          this._toastr.success(response.message, 'Éxito', { closeButton: true });
          this.modal.close();
        },
        error: (error: any) => {
          // El AuthInterceptor ya muestra el toast del error HTTP (409 con el motivo)
          console.error('Error en deleteMarca:', error);
          this.isLoading = false;
          this.loadingBar.complete();
        },
      });
  }
}
