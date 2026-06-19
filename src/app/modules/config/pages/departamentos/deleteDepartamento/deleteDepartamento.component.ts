import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { LoadingBarService } from '@ngx-loading-bar/core';

import { DepartamentoService } from "../../../services/departamento.service";


@Component({
  selector: 'app-deleteDepartamento',
  templateUrl: './deleteDepartamento.component.html',
  standalone: false,
})
export class DeleteDepartamentoComponent implements OnInit, OnDestroy {

  @Input() registro_selected: any = null;
  @Output() registrosE: EventEmitter<any> = new EventEmitter();

  public title: string;
  public isLoading: boolean;
  private unsubscribe$ = new Subject<void>();


  constructor(
      public modal: NgbActiveModal, 
      private loadingBar: LoadingBarService,
      public _departamentoService: DepartamentoService, 
  ){ 
      this.title = 'Eliminar Departamento';
      this.isLoading = false;
  }

  ngOnInit(): void {
  }

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

  deleteDepartamento() {
    this.isLoading = true;
    this.loadingBar.start();
    this._departamentoService.deleteDepartamento(this.registro_selected.id).pipe(takeUntil(this.unsubscribe$))
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
