import { Component, OnDestroy, OnInit } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { ECHO_PUSHER } from "../../../../config/config";
import { Subject } from 'rxjs';
import { SeguridadService } from "../../../seguridad/services/seguridad.service";
import { WebsocketNotificationService } from '../../../../service/websocket-notification.service';


@Component({
  selector: 'app-websocket-recived',
  templateUrl: './websocket-recived.component.html',
  styleUrls: ['./websocket-recived.component.css'],
  standalone:false
})
export class WebsocketRecivedComponent implements OnInit, OnDestroy {

  public mensajes: string[] = [];
  private unsubscribe$ = new Subject<void>();

  constructor(
    private toastr: ToastrService,
    private _seguridadService: SeguridadService,
    private _wsNotifService: WebsocketNotificationService
  ) {}

  ngOnInit(): void {
    console.log('🟢 WebsocketRecivedComponent escuchando canal "trades"...');

    // Escuchar canal público 'trades' y evento 'NewTrade'
    ECHO_PUSHER(this._seguridadService.token)
      .channel('trades')
      .listen('NewTrade', (data: any) => {
        console.log('📩 Mensaje recibido:', data);
        const mensaje = data.trade || 'Mensaje vacío';
        this.mensajes.unshift(mensaje);

        // ✅ Incrementa el contador global
        this._wsNotifService.incrementarContador();

        // this.toastr.info(mensaje, 'Nuevo mensaje WebSocket', {
        //   timeOut: 6000,
        //   closeButton: true
        // });
      });

  }

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
    console.log('🔴 WebsocketRecivedComponent destruido');
  }
}
