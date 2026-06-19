import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class WebsocketNotificationService {

  private _contadorMensajes = new BehaviorSubject<number>(0);
  contadorMensajes$ = this._contadorMensajes.asObservable();

  incrementarContador() {
    const actual = this._contadorMensajes.value;
    this._contadorMensajes.next(actual + 1);
  }

  reiniciarContador() {
    this._contadorMensajes.next(0);
  }

  obtenerValorActual(): number {
    return this._contadorMensajes.value;
  }
}
