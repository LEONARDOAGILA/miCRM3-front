/**
 * Una imagen de la carpeta compartida de la tienda.
 *
 * `nombre` es lo que se guarda en la base; `url` la arma el servidor al leer,
 * y no se guarda en ninguna parte: cambiar el CRM de máquina sólo cambia
 * APP_URL.
 */
export interface ImagenTiendaModel {
  nombre: string;
  url: string;
  /** En bytes. */
  peso: number;
  /** 'YYYY-MM-DD HH:mm:ss'; vacío en la que se acaba de subir. */
  subida: string;
  extension: string;
}
