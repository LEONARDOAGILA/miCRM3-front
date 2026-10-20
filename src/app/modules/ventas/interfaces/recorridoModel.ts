/**
 * Recorridos del cobrador: por dónde anduvo y dónde se paró.
 *
 * El celular manda posiciones durante la jornada y el servidor las convierte
 * en un recorrido. Las paradas NO están guardadas: las calcula el servidor con
 * el criterio que se le pase, así que cambiar «qué cuenta como parada» no
 * obliga a recalcular ninguna historia.
 */

/** Una lectura del GPS, tal como la devuelve el servidor para pintarla. */
export interface PuntoRecorrido {
  orden: number;
  lat: number;
  lng: number;
  /** «2026-10-19 08:15:00» */
  fecha_hora: string;
  /** «08:15», que es lo que se enseña */
  hora: string;
  /** Radio de error del GPS en metros */
  precision_m: number | null;
  altitud: number | null;
  /** Ya convertida: el aparato la da en m/s */
  velocidad_kmh: number | null;
  rumbo: number | null;
  bateria: number | null;
  /** Metros desde el punto anterior */
  tramo_m: number;
}

/** El cliente que le tocó a una parada, si había alguno cerca. */
export interface ClienteDeParada {
  id: number;
  nombre_completo: string;
  direccion: string | null;
  celular: string | null;
  /** A cuántos metros del centro de la parada */
  metros: number;
}

/**
 * Un sitio donde se quedó quieto el tiempo suficiente.
 *
 * `cliente` en null no significa que hiciera algo malo: pudo almorzar, cargar
 * gasolina o visitar a alguien sin coordenadas en la ficha. Es un dato, no un
 * veredicto.
 */
export interface ParadaRecorrido {
  orden: number;
  lat: number;
  lng: number;
  /** «09:12» */
  desde: string;
  hasta: string;
  minutos: number;
  /** Cuántas lecturas del GPS la sostienen */
  lecturas: number;
  /**
   * El peor error de GPS de la parada. Por encima de unos 50 m la parada
   * existe pero no prueba una visita: el aparato pudo estar «quieto» por no
   * tener señal.
   */
  peor_precision_m: number | null;
  cliente: ClienteDeParada | null;
}

export interface ResumenRecorrido {
  puntos: number;
  metros: number;
  km: number;
  /** «08:00», null si no hubo recorrido */
  inicio: string | null;
  fin: string | null;
  /** De la primera a la última lectura */
  minutos: number;
  paradas: number;
  minutos_parado: number;
  /** Sobre el tiempo de jornada, no sobre el tiempo en movimiento */
  velocidad_media_kmh: number;
  /** Lecturas con más de 50 m de error; si son muchas, el trazo es poco fiable */
  lecturas_imprecisas: number;
}

export interface UsuarioRecorrido {
  usuario_id: number;
  login_user: string;
  nombre: string;
  type_user: number | null;
}

/** Lo que devuelve «el recorrido de este día». */
export interface RecorridoDelDia {
  usuario: UsuarioRecorrido;
  /** «2026-10-19» */
  fecha: string;
  puntos: PuntoRecorrido[];
  paradas: ParadaRecorrido[];
  resumen: ResumenRecorrido;
}

/** Una fila del desplegable: quién tiene recorrido y cuánto. */
export interface CobradorConRecorrido extends UsuarioRecorrido {
  dias: number;
  puntos: number;
  primer_dia: string;
  ultimo_dia: string;
}

/** Un día con recorrido, para el selector de fechas. */
export interface DiaConRecorrido {
  fecha: string;
  puntos: number;
  metros: number;
  km: number;
}

/** Lo que contesta el servidor al recibir un lote del celular. */
export interface ResultadoCarga {
  recibidos: number;
  guardados: number;
  /** Ya estaban: reenviar un lote no duplica */
  repetidos: number;
  /** Imposibles o con demasiado error */
  descartados: number;
}
