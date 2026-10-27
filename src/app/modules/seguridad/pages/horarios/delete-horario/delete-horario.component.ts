import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { LoadingBarService } from '@ngx-loading-bar/core';
import { HorarioService } from '../../../services/horario.service';
import { CommonModule } from '@angular/common';
import { ModalArrastrableDirective } from '../../../../../components/modal/modal-arrastrable.directive';

@Component({
  selector: 'app-delete-horario',
  templateUrl: './delete-horario.component.html',
  styleUrls: ['./delete-horario.component.css'],
  standalone: true,
  imports: [CommonModule, ModalArrastrableDirective],
})
export class DeleteHorarioComponent implements OnInit, OnDestroy {
  @Input() registro_selected: any = null;

  /** Quién depende de él: la base no deja mandarlo a la papelera si hay alguien. */
  get usuarios(): number { return Number(this.registro_selected?.num_usuarios ?? 0); }
  get grupos(): number { return Number(this.registro_selected?.num_grupos ?? 0); }
  @Output() registrosE: EventEmitter<any> = new EventEmitter();

  public title: string;
  public isLoading: boolean;
  private unsubscribe$ = new Subject<void>();

  constructor(
    public modal: NgbActiveModal,
    private loadingBar: LoadingBarService,
    public _horarioService: HorarioService,
  ) {
    this.title = 'Eliminar Horario';
    this.isLoading = false;
  }

  ngOnInit(): void {
    //console.log('registro selected', this.registro_selected);
  }

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

  deleteHorario() {
    this.isLoading = true;
    this.loadingBar.start();
    
    this._horarioService.deleteHorario(this.registro_selected.id)
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe({
        next: (response: any) => {
          if (response.status === 'success') {
            this.modal.close();
            this.registrosE.emit(this.registro_selected);
          } else {
            this.modal.close();
          }
          this.isLoading = false;
          this.loadingBar.complete();
        },
        error: (error: any) => {
          console.error('Error en deleteHorario:', error);
          this.modal.close();
          this.isLoading = false;
          this.loadingBar.complete();
        },
        complete: () => {
          this.isLoading = false;
          this.loadingBar.complete();
        },
      });
  }
}