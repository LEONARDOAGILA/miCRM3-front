import { Component, EventEmitter, Input, OnDestroy, Output } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { LoadingBarService } from '@ngx-loading-bar/core';
import { ToastrService } from 'ngx-toastr';

import { ArchivoService } from '../../../services/archivo.service';

/**
 * Confirmación de borrado de un archivo o carpeta del administrador.
 * Mismo esquema que deleteUser: emite `registrosE` con el registro borrado
 * ANTES de cerrar, para que quien lo abrió refresque el árbol.
 *
 * El back rechaza borrar una carpeta con contenido (409); aquí sólo se
 * muestra el mensaje y se deja el modal abierto.
 */
@Component({
  selector: 'app-deleteFile',
  templateUrl: './deleteFile.component.html',
  styleUrls: ['./deleteFile.component.css'],
  standalone: false,
})
export class DeleteFileComponent implements OnDestroy {

  @Input() registro_selected: any = null;
  @Output() registrosE: EventEmitter<any> = new EventEmitter();

  public isLoading = false;
  private unsubscribe$ = new Subject<void>();

  constructor(
    public modal: NgbActiveModal,
    private loadingBar: LoadingBarService,
    private _toastr: ToastrService,
    private _archivoService: ArchivoService,
  ) {}

  get esCarpeta(): boolean {
    return !!this.registro_selected?.escarpeta;
  }

  get title(): string {
    return this.esCarpeta ? 'Eliminar carpeta' : 'Eliminar archivo';
  }

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

  eliminar(): void {
    this.isLoading = true;
    this.loadingBar.start();

    this._archivoService.deleteArchivo(this.registro_selected.id)
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe({
        next: (response: any) => {
          this.isLoading = false;
          this.loadingBar.complete();

          if (response.status !== 'success') {
            // No se cierra: el usuario debe poder leer el motivo y reintentar
            this._toastr.error(response.message || 'No se pudo eliminar', 'Error');
            return;
          }

          this.registrosE.emit(this.registro_selected);
          this._toastr.success(response.message, 'Éxito', { closeButton: true });
          this.modal.close();
        },
        error: (error: any) => {
          // El AuthInterceptor ya muestra el toast del error HTTP (incluido el
          // 409 de "carpeta con contenido"); aquí sólo se reactiva el modal.
          console.error('Error en deleteArchivo:', error);
          this.isLoading = false;
          this.loadingBar.complete();
        },
      });
  }
}
