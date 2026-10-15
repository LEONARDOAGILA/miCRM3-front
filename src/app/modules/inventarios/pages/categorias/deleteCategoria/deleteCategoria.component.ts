import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { LoadingBarService } from '@ngx-loading-bar/core';
import { ToastrService } from 'ngx-toastr';

import { CategoriaService } from '../../../services/categoria.service';

/**
 * Confirmación de borrado de un categoria (mismo esquema que deleteUser).
 * El back rechaza con 409 si la categoría tiene subcategorías o productos; el
 * mensaje lo muestra el AuthInterceptor y el modal se queda abierto.
 */
@Component({
  selector: 'app-deleteCategoria',
  templateUrl: './deleteCategoria.component.html',
  styleUrls: ['./deleteCategoria.component.css'],
  standalone: false,
})
export class DeleteCategoriaComponent implements OnInit, OnDestroy {

  @Input() registro_selected: any = null;
  @Output() registrosE: EventEmitter<any> = new EventEmitter();

  public title: string;
  public isLoading: boolean;
  private unsubscribe$ = new Subject<void>();

  constructor(
    public modal: NgbActiveModal,
    private loadingBar: LoadingBarService,
    private _toastr: ToastrService,
    public _categoriaService: CategoriaService,
  ) {
    this.title = 'Eliminar Categoria';
    this.isLoading = false;
  }

  ngOnInit(): void { }

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

  /** Subcategorías directas: si hay, el back no la deja borrar (se avisa antes de intentarlo). */
  get numHijos(): number { return Number(this.registro_selected?.num_hijos ?? 0); }

  /** Productos en esta categoría: lo mismo. */
  get numProductos(): number { return Number(this.registro_selected?.num_productos ?? 0); }

  /** El camino completo, que es lo que identifica a una categoría fuera del árbol. */
  get ruta(): string { return this.registro_selected?.ruta || this.registro_selected?.nombre || '—'; }

  deleteCategoria() {
    this.isLoading = true;
    this.loadingBar.start();

    this._categoriaService.deleteCategoria(this.registro_selected.id)
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe({
        next: (response: any) => {
          this.isLoading = false;
          this.loadingBar.complete();

          if (response.status !== 'success') {
            this._toastr.error(response.message || 'No se pudo eliminar el categoria', 'Error');
            return;
          }

          // Emitir ANTES de cerrar (el padre corta la suscripción al resolverse modalRef.result)
          this.registrosE.emit(this.registro_selected);
          this._toastr.success(response.message, 'Éxito', { closeButton: true });
          this.modal.close();
        },
        error: (error: any) => {
          // El AuthInterceptor ya muestra el toast del error HTTP (409 con el motivo)
          console.error('Error en deleteCategoria:', error);
          this.isLoading = false;
          this.loadingBar.complete();
        },
      });
  }
}
