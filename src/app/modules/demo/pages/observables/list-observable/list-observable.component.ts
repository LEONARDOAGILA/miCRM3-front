import { HttpClient } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { catchError, EMPTY, empty, Observable } from 'rxjs';
import { Midata, PokemonResults } from '../../../interfaces/midata';
import { PokemonService } from '../../../services/pokemon.service';


@Component({
  selector: 'app-list-observable',
  templateUrl: './list-observable.component.html',
  styleUrls: ['./list-observable.component.css'],
  standalone: false,
})
export class ListObservableComponent implements OnInit {

  public errorMessage!: string;
  public PokemonResults$!: Observable<PokemonResults>;

  
  constructor(
    private _PokemonService:PokemonService,
  ){ 
      this.PokemonResults$ = this._PokemonService.fun_getPokemonList().pipe(catchError((error:string)=>{
          this.errorMessage = error;
          return EMPTY;

      }));
  }


  ngOnInit() {
  }

}
