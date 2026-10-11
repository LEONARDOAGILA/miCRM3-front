/**
 * Zonas de clientes: áreas dibujadas en el mapa.
 *
 * Una zona es un polígono —o un círculo con su radio— con el que preguntar
 * qué clientes caen dentro. Lo que se guarda es la forma; a qué zona
 * pertenece cada cliente NO se guarda, se calcula, así que mover un punto de
 * la zona cambia la respuesta sin tener que tocar ningún cliente.
 */

/** Un punto del mapa, tal y como lo da Google Maps. */
export interface PuntoZona {
  lat: number;
  lng: number;
}

export type TipoZona = 'POLIGONO' | 'CIRCULO';

export interface ZonaModel {
  id: number;
  nombre: string;
  descripcion: string | null;

  /**
   * Dónde cae la zona.
   *
   * Texto libre, escrito igual que en la ficha del cliente —no hay catálogo
   * de provincias en esta base—. Lo rellena la pantalla preguntándole a
   * Google por el centro de la zona, y se puede corregir a mano.
   */
  pais: string | null;
  provincia: string | null;
  canton: string | null;

  /** Con qué color se pinta, en hexadecimal: «#00ACAC». */
  color: string;

  tipo: TipoZona;

  /** POLIGONO: los vértices en orden. No repite el primero al final. */
  vertices: PuntoZona[] | null;

  /** CIRCULO: centro y radio. */
  centro_lat: number | null;
  centro_lng: number | null;
  radio_metros: number | null;

  /**
   * La caja que envuelve la zona. La calcula el servidor al guardar.
   *
   * Sirve para encuadrar el mapa sobre la zona sin tener que recorrer sus
   * vértices, y es lo que usa la base para descartar clientes deprisa.
   */
  min_lat: number;
  max_lat: number;
  min_lng: number;
  max_lng: number;

  activo: boolean;

  /** Cuántos clientes caen dentro. Lo cuenta el servidor con cada lectura. */
  clientes: number;

  created_at: string | null;
  created_by: string | null;
  updated_at: string | null;
  updated_by: string | null;
}

/** Lo que se manda al guardar. Sin id es un alta. */
export interface ZonaParaGuardar {
  nombre: string;
  descripcion?: string | null;
  pais?: string | null;
  provincia?: string | null;
  canton?: string | null;
  color?: string | null;
  tipo: TipoZona;
  vertices?: PuntoZona[] | null;
  centro_lat?: number | null;
  centro_lng?: number | null;
  radio_metros?: number | null;
  activo?: boolean;
}

/** Un cliente de los que caen dentro, con lo justo para listarlo y pintarlo. */
export interface ClienteDeZona {
  id: number;
  nombre_completo: string;
  numero_identificacion: string | null;
  celular: string | null;
  telefono: string | null;
  direccion: string | null;
  provincia: string | null;
  canton: string | null;
  parroquia: string | null;
  estado: string | null;
  activo: boolean;
  lat: number;
  lng: number;
}
