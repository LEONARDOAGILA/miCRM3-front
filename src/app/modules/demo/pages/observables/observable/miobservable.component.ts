import { Component, OnInit } from '@angular/core';
import { Observable } from 'rxjs';
import { Midata } from '../../../interfaces/midata';
import { MidataService } from '../../../services/midata.service';

@Component({
  selector: 'app-miobservable',
  templateUrl: './miobservable.component.html',
  styleUrls: ['./miobservable.component.css'],
  standalone: false,
})
export class MiobservableComponent implements OnInit {

  public Dom_misubject: string = "";
  public miData$!: Observable<Midata>;
  public mimensaje$!: Observable<string>;

  constructor(private _midataService:MidataService) { 
      this.miData$ = this._midataService.fun_getMidata();
      this.mimensaje$ = this._midataService.fun_miMensaje;

  }
  actualizaSubject(){
    this._midataService.fun_editmiMensaje = this.Dom_misubject;

  }

  ngOnInit() {
  }

}
