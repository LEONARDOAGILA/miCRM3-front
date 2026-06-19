import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { LoadingBarService } from '@ngx-loading-bar/core';

import { ReporteExternoService } from "../../../services/reporteExterno.service";


@Component({
  selector: 'app-deleteReporteExterno',
  templateUrl: './deleteReporteExterno.component.html',
  standalone: false,
})
export class DeleteReporteExternoComponent implements OnInit, OnDestroy {

  @Input() registro_selected: any = null;
  @Output() registrosE: EventEmitter<any> = new EventEmitter();

  public title: string;
  public isLoading: boolean;
  private unsubscribe$ = new Subject<void>();


  constructor(
      public modal: NgbActiveModal, 
      private loadingBar: LoadingBarService,
      public _reporteExternoService: ReporteExternoService, 
  ){ 
      this.title = 'Eliminar ReporteExterno';
      this.isLoading = false;
  }

  ngOnInit(): void {
  }

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

  deleteReporteExterno() {
    this.isLoading = true;
    this.loadingBar.start();
    this._reporteExternoService.deleteReporteExterno(this.registro_selected.id).pipe(takeUntil(this.unsubscribe$))
      .subscribe({
          next: (response: any) => {
              if (response.status == 'success') {
                this.modal.close();
                this.registrosE.emit(this.registro_selected);
                this.isLoading = false;
                this.loadingBar.complete();
              } else {
                this.modal.close();
                this.isLoading = false;
                this.loadingBar.complete();
              }
          },
          error: (error: any) => {
              this.modal.close();
              this.isLoading = false;
              this.loadingBar.complete();
              this.modal.close(); 
          },
          complete: () => {
            this.isLoading = false;
            this.loadingBar.complete();
          },
      });
  }

}
