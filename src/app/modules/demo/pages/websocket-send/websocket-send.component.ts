import { Component, OnInit } from '@angular/core';
import { WebSocketService } from '../../../../service/websocket.service';
import { ToastrService } from 'ngx-toastr';


@Component({
  selector: 'app-websocket-send',
  templateUrl: './websocket-send.component.html',
  styleUrls: ['./websocket-send.component.css'],
  standalone:false
})
export class WebsocketSendComponent{

 message: string = '';

  constructor(
    private wsService: WebSocketService,
    private toastr: ToastrService
  ) {}

  sendMessage() {
    if (!this.message.trim()) {
      this.toastr.warning('Ingrese un mensaje antes de enviar.');
      return;
    }

    this.wsService.sendTradeMessage(this.message).subscribe({
      next: (res) => {
        this.toastr.success('Mensaje enviado correctamente.');
        console.log('Respuesta del servidor:', res);
        this.message = '';
      },
      error: (err) => {
        console.error('Error al enviar mensaje:', err);
        this.toastr.error('Error al enviar mensaje al servidor.');
      }
    });
  }
}