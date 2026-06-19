import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { LoadingBarService } from '@ngx-loading-bar/core';

import { MenuService } from "../../../services/menu.service";


@Component({
  selector: 'app-deleteMenu',
  templateUrl: './deleteMenu.component.html',
  styleUrls: ['./deleteMenu.component.css'],
  standalone: false,
})
export class DeleteMenuComponent implements OnInit {

  @Input() registro_selected: any = null;
  @Output() registrosE: EventEmitter<any> = new EventEmitter();

  public title: string;
  public isLoading: boolean;
  private unsubscribe$ = new Subject<void>();


  constructor(
      public modal: NgbActiveModal, 
      private loadingBar: LoadingBarService,
      public _menuService: MenuService, 
  ){ 
      this.title = 'Eliminar Registro';
      this.isLoading = false;
  }

  ngOnInit(): void {
    //this.notificaciones.error(Object.values(this.registro_selected)); 
    //console.log('registro selected', this.registro_selected.name);
  }

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

  deleteMenu() {
    this.isLoading = true;
    this.loadingBar.start();
    this._menuService.deleteMenu(this.registro_selected.id).pipe(takeUntil(this.unsubscribe$))
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
