import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { LoadingBarService } from '@ngx-loading-bar/core';
import { HorarioService } from '../../../services/horario.service';

@Component({
  selector: 'app-delete-horario',
  templateUrl: './delete-horario.component.html',
  styleUrls: ['./delete-horario.component.css'],
  standalone: false,
})
export class DeleteHorarioComponent implements OnInit, OnDestroy {
  @Input() registro_selected: any = null;
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