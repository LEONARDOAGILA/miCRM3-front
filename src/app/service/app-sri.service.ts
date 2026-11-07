import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';
import { environment } from '../../environments/environment';

/** Por qué no se pudo traer el contribuyente. */
export type MotivoSri =
  | 'NO_ENCONTRADO'           // el SRI no tiene ese RUC
  | 'IDENTIFICACION_INVALIDA' // no tiene forma de RUC
  | 'SERVICIO_NO_DISPONIBLE'  // el SRI no contestó
  | 'DESCONOCIDO';

/** El representante legal de una sociedad, tal como lo da el SRI. */
export interface RepresentanteSri {
  identificacion: string | null;
  nombre: string | null;
}

/** Lo que el SRI sabe de un RUC. */
export interface ContribuyenteSri {
  ruc: string;
  /**
   * EN MAYÚSCULAS, como consta en el RUC.
   *
   * No se le dan mayúsculas y minúsculas a propósito: «S.A.» acabaría en
   * «S.a.», y la razón social se imprime como está registrada.
   */
  razon_social: string;
  /**
   * ACTIVO · SUSPENDIDO · PASIVO. Nulo cuando el dato vino por el respaldo:
   * el Registro Civil da el nombre, no el estado tributario.
   */
  estado: string | null;
  /** Sólo con ACTIVO se le factura con tranquilidad; nulo si no se sabe */
  activo: boolean | null;
  /**
   * El SRI no contestó y esto viene del Registro Civil: sólo el nombre.
   *
   * No se guarda con el cliente —sería hacer pasar por datos del SRI algo
   * que el SRI no dijo— y conviene volver a consultar más tarde.
   */
  degradado?: boolean;
  motivo_suspension: string | null;
  /** PERSONA NATURAL · SOCIEDAD */
  tipo_contribuyente: string | null;
  /** GENERAL · RIMPE */
  regimen: string | null;
  categoria: string | null;
  actividad: string | null;
  obligado_contabilidad: boolean;
  agente_retencion: boolean;
  contribuyente_especial: boolean;
  /** Dos banderas del SRI que conviene ver ANTES de facturarle a alguien */
  fantasma: boolean;
  transacciones_inexistentes: boolean;
  fecha_inicio: string | null;
  fecha_cese: string | null;
  fecha_actualizacion: string | null;
  /* ---- SÓLO EN PERSONAS NATURALES ----
     La «razón social» de una persona son sus apellidos y nombres de una
     pieza; el servidor los parte para la ficha, que los pide separados. */
  apellidos?: string | null;
  nombres?: string | null;
  /** false cuando el corte entre apellidos y nombres es dudoso */
  nombre_seguro?: boolean | null;
  nombre_aviso?: string | null;

  /** El primero suelto, que es el que firma (igual que en lo guardado) */
  representante_identificacion?: string | null;
  representante_nombre?: string | null;
  representantes: RepresentanteSri[];  /** De dónde salió: el SRI o la caché del servidor */
  fuente: string;
}

/** La respuesta: o se encontró, o se dice por qué no. */
export interface RespuestaSri {
  encontrado: boolean;
  /** Sólo cuando `encontrado` */
  contribuyente?: ContribuyenteSri;
  /** Sólo cuando NO se encontró */
  motivo?: MotivoSri;
  mensaje?: string;
}

/**
 * La razón social de un RUC, del SRI.
 *
 * ES EL HERMANO DE AppRegistroCivilService: aquél da los nombres de una
 * cédula (personas) y éste la razón social de un RUC (empresas, y también
 * personas naturales con RUC). Mismas reglas:
 *
 *   · NUNCA FALLA HACIA ARRIBA: si el SRI no contesta se devuelve
 *     `encontrado: false` con su motivo y la pantalla sigue dejando escribir
 *     a mano;
 *   · VA POR EL SERVIDOR, que además cachea un día por RUC.
 *
 * Trae de paso el ESTADO del contribuyente —ACTIVO, SUSPENDIDO, PASIVO— y
 * las banderas de fantasma y transacciones inexistentes, que es lo que hay
 * que mirar antes de facturarle a alguien.
 */
@Injectable({
  providedIn: 'root',
})
export class AppSriService {

  private readonly URL_SERVICIOS: string;

  /** Lo ya preguntado en esta pantalla, para no repetir la vuelta al servidor. */
  private readonly enMemoria = new Map<string, Observable<RespuestaSri>>();

  constructor(private _http: HttpClient) {
    this.URL_SERVICIOS = environment.URL_SERVICIOS + 'config/registroCivil/';
  }

  /** Los datos de un RUC. Contesta rápido: el SRI tarda una décima de segundo. */
  consultarRuc(ruc: string | null | undefined): Observable<RespuestaSri> {
    const limpio = String(ruc ?? '').replace(/\D/g, '');

    if (limpio.length !== 13) {
      return of(this.no('IDENTIFICACION_INVALIDA', 'El RUC tiene 13 dígitos'));
    }

    const cacheada = this.enMemoria.get(limpio);
    if (cacheada) { return cacheada; }

    const peticion = this._http.get<any>(this.URL_SERVICIOS + 'consultarRuc/' + limpio).pipe(
      map(res => this.traducir(res)),
      catchError(() => of(this.no('SERVICIO_NO_DISPONIBLE', 'No se pudo consultar el SRI ahora mismo'))),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    this.enMemoria.set(limpio, peticion);
    return peticion;
  }

  /** Olvida lo preguntado (para un botón de «volver a consultar»). */
  olvidar(ruc?: string | null): void {
    if (ruc == null) { this.enMemoria.clear(); return; }
    this.enMemoria.delete(String(ruc).replace(/\D/g, ''));
  }

  // ================================================================

  private traducir(res: any): RespuestaSri {
    const d = res?.data;
    if (res?.status !== 'success' || !d) {
      return this.no('DESCONOCIDO', 'No se pudo consultar el SRI');
    }
    if (d.encontrado !== true) {
      return this.no((d.motivo ?? 'DESCONOCIDO') as MotivoSri, d.mensaje ?? 'El SRI no tiene ese RUC');
    }
    return { encontrado: true, contribuyente: d as ContribuyenteSri };
  }

  private no(motivo: MotivoSri, mensaje: string): RespuestaSri {
    return { encontrado: false, motivo, mensaje };
  }
}
