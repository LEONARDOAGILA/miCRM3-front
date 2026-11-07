import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

/**
 * La biblioteca de imágenes de la tienda.
 *
 * UNA SOLA CARPETA PARA TODA LA PÁGINA WEB. El fondo de España Motos, los
 * banners, las tarjetas del inicio y los logos del pie salen de aquí: se sube
 * una vez y se elige donde haga falta.
 *
 * LO QUE SE GUARDA EN CADA PANTALLA ES EL NOMBRE, no la dirección. El servidor
 * arma la dirección al leer, así que mover el CRM de máquina no obliga a
 * repasar nada.
 */
@Injectable({
  providedIn: 'root',
})
export class ImagenService {

  private URL_SERVICIOS: string;

  constructor(
    private _http: HttpClient,
  ) {
    this.URL_SERVICIOS = environment.URL_SERVICIOS + 'ecommerce/imagen/';
  }

  /**
   * Las imágenes de la carpeta, la última primero.
   *
   * VIENEN TODAS. Son ciento y pico y el selector las filtra en memoria:
   * volver a pedirlas en cada tecla haría parpadear la rejilla para enseñar lo
   * mismo recortado.
   */
  listImagenes(): Observable<any> {
    return this._http.get(this.URL_SERVICIOS + 'listar');
  }

  /**
   * Sube una imagen y devuelve su nombre y su dirección.
   *
   * SIN CABECERA `Content-Type` A MANO: el navegador tiene que ponerla él, con
   * el `boundary` del multipart. Escribirla aquí deja el boundary fuera y el
   * servidor recibe un cuerpo que no sabe partir.
   */
  subirImagen(archivo: File): Observable<any> {
    const cuerpo = new FormData();
    cuerpo.append('imagen', archivo, archivo.name);
    return this._http.post(this.URL_SERVICIOS + 'subir', cuerpo);
  }
}
