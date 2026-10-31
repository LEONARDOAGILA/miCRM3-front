import { Component, EventEmitter, Input, OnDestroy, Output, ChangeDetectionStrategy } from '@angular/core';

import { Subject, takeUntil } from 'rxjs';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { LoadingBarService } from '@ngx-loading-bar/core';
import { ToastrService } from 'ngx-toastr';

import { ModalArrastrableDirective } from '../../../../../components/modal/modal-arrastrable.directive';
import { ProformaService } from '../../../services/proforma.service';
import { claseEstado, etiquetaEstado } from '../../../interfaces/proformaModel';

/**
 * Confirmación de borrado de una proforma (mismo esquema que deleteCliente).
 *
 * Es un borrado LÓGICO: la proforma queda en la papelera y puede volver. Lo
 * que no se puede borrar es una APROBADA —el back contesta 409 y el modal se
 * queda abierto—: eso es lo que el cliente aceptó, y si la operación se cayó
 * lo que corresponde es anularla, que deja constancia.
 */
@Component({
  selector: 'app-deleteProforma',
  standalone: true,
  imports: [ModalArrastrableDirective],
  templateUrl: './deleteProforma.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./deleteProforma.component.css'],
})
export class DeleteProformaComponent implements OnDestroy {

  @Input() registro_selected: any = null;
  @Output() registrosE: EventEmitter<any> = new EventEmitter();

  public title = 'Eliminar proforma';
  public isLoading = false;

  public readonly etiquetaEstado = etiquetaEstado;
  public readonly claseEstado = claseEstado;

  private unsubscribe$ = new Subject<void>();

  constructor(
    public modal: NgbActiveModal,
    private loadingBar: LoadingBarService,
    private _toastr: ToastrService,
    public _proformaService: ProformaService,
  ) {}

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

  /** Una aprobada no se borra: se avisa antes de intentarlo. */
  get esAprobada(): boolean { return this.registro_selected?.estado === 'APROBADA'; }

  get importe(): string {
    const n = Number(this.registro_selected?.total ?? 0);
    return isNaN(n) ? '—' : '$ ' + n.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  deleteProforma(): void {
    this.isLoading = true;
    this.loadingBar.start();

    this._proformaService.deleteProforma(this.registro_selected.id)
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe({
        next: (response: any) => {
          this.isLoading = false;
          this.loadingBar.complete();

          if (response.status !== 'success') {
            this._toastr.error(response.message || 'No se pudo eliminar la proforma', 'Error');
            return;
          }

          // Emitir ANTES de cerrar (el padre corta la suscripción al
          // resolverse modalRef.result)
          this.registrosE.emit(this.registro_selected);
          this._toastr.success(response.message, 'Éxito', { closeButton: true });
          this.modal.close();
        },
        error: (error: any) => {
          // El AuthInterceptor ya enseñó el toast del error HTTP (el 409 con
          // su motivo, por ejemplo)
          console.error('Error en deleteProforma:', error);
          this.isLoading = false;
          this.loadingBar.complete();
        },
      });
  }
}
