import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Midata } from '../interfaces/midata';

@Injectable({
  providedIn: 'root'
})
export class MidataService {

private var_message: BehaviorSubject<string> = new BehaviorSubject<string>('Hola');

constructor(
    private httpclient: HttpClient
) { }

fun_getMidata():Observable<Midata> {
  return this.httpclient.get<Midata>('https://jsonplaceholder.typicode.com/posts/1');
}

fun_getMidata_list():Observable<Midata> {
  return this.httpclient.get<Midata>('https://jsonplaceholder.typicode.com/posts');
}


get fun_miMensaje():Observable<string> {
    return this.var_message.asObservable();

}

set fun_editmiMensaje(newValue: string) {
  this.var_message.next(newValue);

}

}
