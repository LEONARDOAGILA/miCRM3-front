import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

/**
 * Carga la API de Google Maps (Maps JavaScript API) una sola vez y bajo
 * demanda, con la clave de environment.GOOGLE_MAPS_API_KEY. Devuelve el
 * objeto global `google.maps`; las librerías (places, marker, geocoding…)
 * se piden después con google.maps.importLibrary().
 *
 * Sin tipos de @types/google.maps: se trabaja con `any` para no añadir
 * dependencias; los componentes documentan lo que usan.
 */
@Injectable({ providedIn: 'root' })
export class GoogleMapsLoaderService {

  private carga: Promise<any> | null = null;

  get hayClave(): boolean {
    return !!(environment as any).GOOGLE_MAPS_API_KEY;
  }

  /** Resuelve con `google.maps` cuando la API está lista (o rechaza si no hay clave / falla la carga). */
  cargar(): Promise<any> {
    const w = window as any;
    if (w.google?.maps?.importLibrary) { return Promise.resolve(w.google.maps); }
    if (this.carga) { return this.carga; }
    if (!this.hayClave) { return Promise.reject(new Error('SIN_CLAVE')); }

    // Cargador oficial en línea (Dynamic Library Import): define google.maps.importLibrary
    this.carga = new Promise<any>((resolve, reject) => {
      const script = document.createElement('script');
      const params = new URLSearchParams({
        key: (environment as any).GOOGLE_MAPS_API_KEY,
        v: 'weekly',
        language: 'es',
        region: 'EC',
        loading: 'async',
        callback: '__miCRM3GoogleMapsListo',
      });
      w.__miCRM3GoogleMapsListo = () => {
        delete w.__miCRM3GoogleMapsListo;
        w.google?.maps ? resolve(w.google.maps) : reject(new Error('Google Maps no se inicializó'));
      };
      script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
      script.async = true;
      script.onerror = () => { this.carga = null; reject(new Error('No se pudo cargar la API de Google Maps (¿clave o red?)')); };
      document.head.appendChild(script);
    });
    return this.carga;
  }
}
