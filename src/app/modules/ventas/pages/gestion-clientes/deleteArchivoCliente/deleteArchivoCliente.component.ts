import { Component, EventEmitter, Input, OnDestroy, Output } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { LoadingBarService } from '@ngx-loading-bar/core';
import { ToastrService } from 'ngx-toastr';

import { ArchivoClienteService } from '../../../services/archivoCliente.service';
import { ArchivoCliente, formatoTamano } from '../../../interfaces/archivoCliente';

/**
 * Confirmación de borrado de un archivo del cliente (mismo esquema que
 * deleteCliente).
 *
 * Éste es el borrado más definitivo de la pantalla: el fichero se va del
 * servidor con `@unlink`, que no usa papelera. La auditoría guarda la fila,
 * no el fichero —así que lo que se borra aquí no se recupera de ningún sitio—,
 * y eso es exactamente lo que el aviso de una línea no decía.
 */
@Component({
  selector: 'app-deleteArchivoCliente',
  templateUrl: './deleteArchivoCliente.component.html',
  styleUrls: ['./deleteArchivoCliente.component.css'],
  standalone: false,
})
export class DeleteArchivoClienteComponent implements OnDestroy {

  @Input() registro_selected: ArchivoCliente | any = null;
  @Output() registrosE: EventEmitter<any> = new EventEmitter();

  public title = 'Eliminar archivo';
  public isLoading = false;
  private unsubscribe$ = new Subject<void>();

  public formatoTamano = formatoTamano;

  constructor(
    public modal: NgbActiveModal,
    private loadingBar: LoadingBarService,
    private _toastr: ToastrService,
    public _archivoService: ArchivoClienteService,
  ) {}

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

  /** De dónde salió, en palabras: es lo que dice si algo más lo está usando. */
  public get deDonde(): string {
    switch (this.registro_selected?.origen) {
      case 'nota':    return 'Pegado en una nota';
      case 'gestion': return 'Adjunto de una gestión';
      default:        return 'Subido a la pestaña Archivos';
    }
  }

  /**
   * Si está enganchado a otra cosa (una nota o una gestión).
   *
   * Importa: borrar el fichero deja a la nota con una imagen rota o a la
   * gestión con un clip que no abre nada.
   */
  public get estaEnUso(): boolean {
    return this.registro_selected?.origen === 'nota'
        || this.registro_selected?.origen === 'gestion';
  }

  deleteArchivo(): void {
    this.isLoading = true;
    this.loadingBar.start();

    this._archivoService.deleteArchivo(this.registro_selected.id)
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe({
        next: (response: any) => {
          this.isLoading = false;
          this.loadingBar.complete();

          if (response.status !== 'success') {
            this._toastr.error(response.message || 'No se pudo eliminar el archivo', 'Error');
            return;
          }

          this.registrosE.emit(this.registro_selected);
          this._toastr.success(response.message, 'Archivos', { closeButton: true });
          this.modal.close();
        },
        error: (error: any) => {
          console.error('Error en deleteArchivo:', error);
          this.isLoading = false;
          this.loadingBar.complete();
        },
      });
  }
}
