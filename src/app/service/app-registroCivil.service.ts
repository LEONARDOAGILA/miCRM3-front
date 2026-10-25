import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { ValidacionCedulaRucService } from './validacionCedulaRucService';

/** Por qué no se pudo traer el nombre. */
export type MotivoRegistroCivil =
  | 'NO_ENCONTRADO'           // no hay nadie con esa cédula
  | 'IDENTIFICACION_INVALIDA' // ni cédula ni RUC de persona
  | 'ES_EMPRESA'              // RUC de sociedad: el Registro Civil no da razones sociales
  | 'SERVICIO_NO_DISPONIBLE'  // la página de terceros se cayó o tardó demasiado
  | 'DESCONOCIDO';

/** Lo que devuelve la consulta cuando encuentra a la persona. */
export interface PersonaRegistroCivil {
  identificacion: string;
  /** Los diez dígitos que se consultaron (de un RUC se usan los diez primeros) */
  cedula: string;
  /** Tal como lo devuelve el Registro Civil, ya con mayúsculas y minúsculas normales */
  nombre_completo: string;
  apellidos: string;
  nombres: string;
  /**
   * Si el corte entre apellidos y nombres es fiable.
   *
   * El Registro Civil manda UN SOLO texto. Con cuatro palabras —lo normal en
   * Ecuador— el corte es dos y dos y no hay duda; con tres o con más de
   * cuatro hay varias lecturas posibles y esto viene en `false` para que la
   * pantalla pida que lo revisen.
   */
  seguro: boolean;
  /** Qué revisar, cuando `seguro` es false */
  aviso: string | null;
  /** Las palabras ya agrupadas («De los Santos», «de Jesús»…), por si hay que mover el corte */
  partes: string[];
  /** De dónde salió: la página o la caché del servidor */
  fuente: string;
}

/**
 * La respuesta de la consulta: o se encontró, o se dice por qué no.
 *
 * Un solo tipo con campos opcionales y no una unión de dos: el proyecto
 * compila con `strict: false` y así TypeScript no estrecha por el booleano,
 * de modo que `r.motivo` dentro de un `if (!r.encontrado)` daría error.
 */
export interface RespuestaRegistroCivil {
  encontrado: boolean;
  /** Sólo cuando `encontrado` */
  persona?: PersonaRegistroCivil;
  /** Sólo cuando NO se encontró */
  motivo?: MotivoRegistroCivil;
  mensaje?: string;
}

/**
 * Los nombres de una cédula ecuatoriana, para no teclearlos a mano.
 *
 * NUNCA FALLA HACIA ARRIBA. La fuente es una página de terceros
 * (ecuadorlegalonline, la misma que se consulta a mano) y se puede caer,
 * tardar o cambiar; cuando eso pasa se devuelve `encontrado: false` con su
 * motivo y la pantalla sigue como estaba, dejando escribir a mano. De ahí que
 * el observable no lance errores: quien lo usa no tiene que poner un
 * `catchError` para no romperse.
 *
 * VA POR EL SERVIDOR, no por el navegador: esa página no manda cabeceras CORS
 * —el navegador cortaría la llamada antes de salir— y además el back la
 * cachea un mes por cédula, que es lo que hace esto usable: la primera
 * consulta tarda unos diez segundos y las siguientes van en milisegundos.
 *
 * NO VALIDA LA IDENTIFICACIÓN POR SU CUENTA para rechazar: eso ya lo hace
 * ValidacionCedulaRucService y el servidor lo vuelve a mirar. Aquí sólo se
 * evita salir a la red con algo que no puede ser una cédula.
 */
@Injectable({
  providedIn: 'root',
})
export class AppRegistroCivilService {

  private readonly URL_SERVICIOS: string;

  /**
   * Lo ya preguntado en esta pantalla.
   *
   * El servidor cachea de verdad; esto sólo evita repetir la llamada cuando
   * se entra y se sale del campo sin tocarlo, que es lo más normal del mundo.
   */
  private readonly enMemoria = new Map<string, Observable<RespuestaRegistroCivil>>();

  constructor(private _http: HttpClient) {
    this.URL_SERVICIOS = environment.URL_SERVICIOS + 'config/registroCivil/';
  }

  /**
   * El nombre de una cédula (o del RUC de una persona natural).
   *
   * Tarda: la fuente responde en unos diez segundos la primera vez que se
   * pregunta por una cédula. Quien llame debe avisar de que está consultando
   * y NO bloquear el formulario.
   */
  consultarCedula(identificacion: string | null | undefined): Observable<RespuestaRegistroCivil> {
    const limpia = String(identificacion ?? '').replace(/\D/g, '');

    // Ni siquiera se sale a la red mientras todavía están tecleando
    if (limpia.length !== 10 && limpia.length !== 13) {
      return of(this.no('IDENTIFICACION_INVALIDA', 'Escribe una cédula de 10 dígitos o un RUC de 13'));
    }
    if (!ValidacionCedulaRucService.esIdentificacionValida(limpia)) {
      return of(this.no('IDENTIFICACION_INVALIDA', 'La identificación no es válida'));
    }

    const cacheada = this.enMemoria.get(limpia);
    if (cacheada) { return cacheada; }

    const peticion = this._http.get<any>(this.URL_SERVICIOS + 'consultarCedula/' + limpia).pipe(
      map(res => this.traducir(res)),
      // Se corta aquí: un fallo de red no tiene por qué llegar a la pantalla
      catchError(() => of(this.no('SERVICIO_NO_DISPONIBLE',
                                  'No se pudo consultar el Registro Civil ahora mismo'))),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    this.enMemoria.set(limpia, peticion);
    return peticion;
  }

  /** Olvida lo preguntado (para un botón de «volver a consultar»). */
  olvidar(identificacion?: string | null): void {
    if (identificacion == null) { this.enMemoria.clear(); return; }
    this.enMemoria.delete(String(identificacion).replace(/\D/g, ''));
  }

  // ================================================================
  // AYUDANTES
  // ================================================================

  private traducir(res: any): RespuestaRegistroCivil {
    const d = res?.data;
    if (res?.status !== 'success' || !d) {
      return this.no('DESCONOCIDO', 'No se pudo consultar el Registro Civil');
    }
    if (d.encontrado !== true) {
      return this.no((d.motivo ?? 'DESCONOCIDO') as MotivoRegistroCivil,
                     d.mensaje ?? 'No se encontró esa cédula');
    }
    return { encontrado: true, persona: d as PersonaRegistroCivil };
  }

  private no(motivo: MotivoRegistroCivil, mensaje: string): RespuestaRegistroCivil {
    return { encontrado: false, motivo, mensaje };
  }
}
