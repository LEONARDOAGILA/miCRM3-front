import { Component, OnInit } from '@angular/core';
import { Observable } from 'rxjs/internal/Observable';
import { MidataService } from '../../../services/midata.service';

@Component({
  selector: 'app-sub-observable',
  templateUrl: './sub-observable.component.html',
  styleUrls: ['./sub-observable.component.css'],
  standalone: false,
})
export class SubObservableComponent implements OnInit {

  public mimensaje$!: Observable<string>;

  constructor(
      private _midataService:MidataService
  ) 
  { 
      this.mimensaje$ = this._midataService.fun_miMensaje;
  }


  ngOnInit() {
  }

}
