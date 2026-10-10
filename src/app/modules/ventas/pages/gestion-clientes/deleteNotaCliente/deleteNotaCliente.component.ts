import { Component, EventEmitter, Input, OnDestroy, Output } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { LoadingBarService } from '@ngx-loading-bar/core';
import { ToastrService } from 'ngx-toastr';

import { NotaClienteService } from '../../../services/notaCliente.service';
import { NotaCliente } from '../../../interfaces/notaCliente';

/**
 * Confirmación de borrado de una nota del cliente (mismo esquema que
 * deleteCliente).
 *
 * Lo que hace falta ver antes de pulsar es de qué nota se trata y cuánto hay
 * escrito: una nota de dos renglones y un acta de reunión se borran con el
 * mismo botón, y en un aviso de una línea las dos se parecían.
 */
@Component({
  selector: 'app-deleteNotaCliente',
  templateUrl: './deleteNotaCliente.component.html',
  styleUrls: ['./deleteNotaCliente.component.css'],
  standalone: false,
})
export class DeleteNotaClienteComponent implements OnDestroy {

  @Input() registro_selected: NotaCliente | any = null;
  @Output() registrosE: EventEmitter<any> = new EventEmitter();

  public title = 'Eliminar nota';
  public isLoading = false;
  private unsubscribe$ = new Subject<void>();

  constructor(
    public modal: NgbActiveModal,
    private loadingBar: LoadingBarService,
    private _toastr: ToastrService,
    public _notaService: NotaClienteService,
  ) {}

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

  /**
   * Cuánto hay escrito, en palabras.
   *
   * Del texto plano que guarda la nota (contenido_texto), no del HTML: medir
   * el HTML contaría las etiquetas y diría que una nota vacía con formato
   * tiene cincuenta palabras.
   */
  public get palabras(): number {
    const texto = (this.registro_selected?.contenido_texto ?? '').trim();
    return texto ? texto.split(/\s+/).length : 0;
  }

  /** Si lleva imágenes pegadas: ésas se quedan como archivos del cliente. */
  public get tieneImagenes(): boolean {
    return /<img\b/i.test(this.registro_selected?.contenido ?? '');
  }

  deleteNota(): void {
    this.isLoading = true;
    this.loadingBar.start();

    this._notaService.deleteNota(this.registro_selected.id)
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe({
        next: (response: any) => {
          this.isLoading = false;
          this.loadingBar.complete();

          if (response.status !== 'success') {
            this._toastr.error(response.message || 'No se pudo eliminar la nota', 'Error');
            return;
          }

          this.registrosE.emit(this.registro_selected);
          this._toastr.success(response.message, 'Notas', { closeButton: true });
          this.modal.close();
        },
        error: (error: any) => {
          console.error('Error en deleteNota:', error);
          this.isLoading = false;
          this.loadingBar.complete();
        },
      });
  }
}
