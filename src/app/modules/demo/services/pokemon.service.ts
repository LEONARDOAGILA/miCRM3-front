import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Midata, PokemonResults } from '../interfaces/midata';
import { BehaviorSubject, catchError, Observable, throwError } from 'rxjs';



@Injectable({
  providedIn: 'root'
})
export class PokemonService {

constructor(    
  private httpclient: HttpClient
) { }

fun_getPokemonList():Observable<PokemonResults> {
  return this.httpclient.get<PokemonResults>('https://pokeapi.co/api/v2/pokemon?limit=10&offset=0');
}


}
