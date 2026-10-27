import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { LoadingBarService } from '@ngx-loading-bar/core';
import { ToastrService } from 'ngx-toastr';

import { ProductoService } from '../../../services/producto.service';
import { CommonModule } from '@angular/common';
import { ModalArrastrableDirective } from '../../../../../components/modal/modal-arrastrable.directive';

/**
 * Confirmación de borrado de un producto (mismo esquema que deleteUser).
 * Se lleva por delante su galería: el ON DELETE CASCADE borra las filas y
 * el controlador los ficheros. Por eso el aviso lo dice.
 */
@Component({
  selector: 'app-deleteProducto',
  templateUrl: './deleteProducto.component.html',
  styleUrls: ['./deleteProducto.component.css'],
  standalone: true,
  imports: [CommonModule, ModalArrastrableDirective],
})
export class DeleteProductoComponent implements OnInit, OnDestroy {

  @Input() registro_selected: any = null;
  @Output() registrosE: EventEmitter<any> = new EventEmitter();

  public title: string;
  public isLoading: boolean;
  private unsubscribe$ = new Subject<void>();

  constructor(
    public modal: NgbActiveModal,
    private loadingBar: LoadingBarService,
    private _toastr: ToastrService,
    public _productoService: ProductoService,
  ) {
    this.title = 'Eliminar Producto';
    this.isLoading = false;
  }

  ngOnInit(): void { }

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

  /** Imágenes que se van con él. */
  get numImagenes(): number { return Number(this.registro_selected?.num_imagenes ?? 0); }

  deleteProducto() {
    this.isLoading = true;
    this.loadingBar.start();

    this._productoService.deleteProducto(this.registro_selected.id)
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe({
        next: (response: any) => {
          this.isLoading = false;
          this.loadingBar.complete();

          if (response.status !== 'success') {
            this._toastr.error(response.message || 'No se pudo eliminar el producto', 'Error');
            return;
          }

          // Emitir ANTES de cerrar (el padre corta la suscripción al resolverse modalRef.result)
          this.registrosE.emit(this.registro_selected);
          this._toastr.success(response.message, 'Éxito', { closeButton: true });
          this.modal.close();
        },
        error: (error: any) => {
          // El AuthInterceptor ya muestra el toast del error HTTP (409 con el motivo)
          console.error('Error en deleteProducto:', error);
          this.isLoading = false;
          this.loadingBar.complete();
        },
      });
  }
}
