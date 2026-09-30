import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';

/** Un mensaje de la conversación (ventas.mensajes_whatsapp). */
export interface MensajeWhatsapp {
  id: number;
  /** ENTRANTE lo escribió el cliente; SALIENTE, el vendedor */
  direccion: 'ENTRANTE' | 'SALIENTE';
  /** TEXTO, IMAGEN, AUDIO, VIDEO, DOCUMENTO, UBICACION, OTRO */
  tipo: string;
  cuerpo?: string | null;
  archivo?: string | null;
  autor?: string | null;
  vendedor?: string | null;
  numero: string;
  /** AAAA-MM-DD HH:mm */
  enviado_at: string;
}

export interface ResumenWhatsapp {
  total: number;
  entrantes: number;
  salientes: number;
  ultimo_at: string | null;
  /** Mensajes del cliente posteriores a la última respuesta del vendedor */
  sin_responder: number;
}

/**
 * Las conversaciones de WhatsApp que guarda el CRM.
 *
 * Quien las alimenta es el servicio miCRM3-wa (enlazado a la cuenta de
 * WhatsApp como un dispositivo más, sólo escucha); desde el navegador esto
 * sólo lee, salvo la asignación manual de un número a un cliente.
 */
@Injectable({ providedIn: 'root' })
export class WhatsappService {

  private readonly URL_SERVICIOS: string;

  constructor(private _http: HttpClient) {
    this.URL_SERVICIOS = environment.URL_SERVICIOS + 'ventas/whatsapp/';
  }

  /** Lo hablado con un cliente, del más viejo al más nuevo. */
  conversacion(clienteId: number, limite: number = 200): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'conversacion/' + clienteId, {
      params: new HttpParams().set('limite', String(limite)),
    });
  }

  /** Cuántos hay, cuándo fue el último y si quedó algo sin responder. */
  resumen(clienteId: number): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'resumen/' + clienteId);
  }

  /** Números que escribieron y no casan con ningún cliente. */
  sinAsignar(limite: number = 50): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'sinAsignar', {
      params: new HttpParams().set('limite', String(limite)),
    });
  }

  /** Ata a un cliente todos los mensajes sueltos de un número. */
  asignar(numero: string, clienteId: number): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'asignar', { numero, cliente_id: clienteId });
  }
}
