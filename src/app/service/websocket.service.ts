import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class WebSocketService {

  private apiUrl = environment.URL_SERVICIOS;

  constructor(private http: HttpClient, private toastr: ToastrService) {}

  sendTradeMessage(message: string) {
    return this.http.post(`${this.apiUrl}api/send-trade`, { trade: message });
  }
}
