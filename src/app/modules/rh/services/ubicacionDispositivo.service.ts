import { Injectable, NgZone, inject } from '@angular/core';

/** Dónde está el aparato, con el error que declara el GPS. */
export interface UbicacionDispositivo {
  lat: number;
  lng: number;
  /** Error declarado, en metros. Grande = orientativo. */
  precision: number | null;
  /** Cuándo se leyó (epoch ms). */
  t: number;
}

/**
 * LA UBICACIÓN DEL APARATO, para las marcaciones.
 *
 * La usan las dos pantallas que marcan: el kiosco de la puerta (una lectura
 * vale para todo el día, el equipo no se mueve) y «Registro de marcaciones»,
 * que el empleado abre en su celular (ahí interesa la de ese momento).
 *
 * NUNCA LANZA: si el usuario no da permiso, si el aparato no tiene GPS o si
 * tarda demasiado, devuelve null y la marcación se registra igual pero sin
 * ubicación. Perder la marcación por no tener señal sería peor que no saber
 * desde dónde se hizo.
 */
@Injectable({ providedIn: 'root' })
export class UbicacionDispositivoService {

  private readonly zone = inject(NgZone);

  /** La última lectura buena, para no pedirle el GPS al aparato cada vez. */
  private ultima: UbicacionDispositivo | null = null;
  /** Una petición en vuelo: si llegan dos a la vez, comparten la respuesta. */
  private enVuelo: Promise<UbicacionDispositivo | null> | null = null;

  /** El último motivo por el que no se pudo (para enseñarlo si hace falta). */
  public motivo = '';

  /**
   * Devuelve dónde está el aparato.
   *
   * @param maxEdadMs  Si la última lectura es más nueva que esto, se reutiliza.
   * @param timeoutMs  Lo que se espera al GPS antes de rendirse.
   */
  async donde(maxEdadMs = 60000, timeoutMs = 8000): Promise<UbicacionDispositivo | null> {
    if (this.ultima && Date.now() - this.ultima.t < maxEdadMs) { return this.ultima; }
    if (this.enVuelo) { return this.enVuelo; }

    this.enVuelo = this.preguntar(timeoutMs).finally(() => { this.enVuelo = null; }) as Promise<UbicacionDispositivo | null>;
    return this.enVuelo;
  }

  /** La última lectura conocida, sin pedir nada. */
  get conocida(): UbicacionDispositivo | null { return this.ultima; }

  /** Olvida lo leído: la próxima vez se vuelve a preguntar al GPS. */
  olvidar(): void { this.ultima = null; }

  private preguntar(timeoutMs: number): Promise<UbicacionDispositivo | null> {
    return new Promise<UbicacionDispositivo | null>(resolve => {
      if (!('geolocation' in navigator)) {
        this.motivo = 'Este aparato no da la ubicación';
        resolve(null);
        return;
      }

      // Fuera de la zona de Angular: el callback del GPS no tiene que
      // disparar una ronda de detección de cambios por sí solo.
      this.zone.runOutsideAngular(() => {
        navigator.geolocation.getCurrentPosition(
          pos => {
            this.ultima = {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              precision: Number.isFinite(pos.coords.accuracy) ? Math.round(pos.coords.accuracy) : null,
              t: Date.now(),
            };
            this.motivo = '';
            resolve(this.ultima);
          },
          err => {
            this.motivo = err?.code === 1 ? 'Permiso de ubicación denegado'
              : err?.code === 2 ? 'No se pudo obtener la ubicación'
              : err?.code === 3 ? 'El GPS tardó demasiado'
              : (err?.message ?? 'No se pudo obtener la ubicación');
            resolve(null);
          },
          { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
        );
      });
    });
  }
}
