/**
 * Boletines (core.boletines): avisos con imágenes que se muestran al usuario
 * al entrar al sistema.
 */

/** Qué es cada lámina del carrusel: lo decide la extensión del fichero. */
export type TipoLamina = 'IMAGEN' | 'VIDEO' | 'AUDIO';

/** Una lámina del carrusel: una imagen, un video mp4 o un audio mp3. */
export interface BoletinImagen {
  tipo?: TipoLamina;
  /** Sin id todavía: imagen recién subida que aún no se ha guardado */
  id?: number | string | null;
  /** Nombre del fichero en el servidor (lo devuelve subirImagen) */
  archivo?: string;
  titulo?: string | null;
  descripcion?: string | null;
  orden?: number;
  /**
   * Lo que la imagen se queda en pantalla en el carrusel (1 a 120 s).
   * El video y el audio no lo usan: duran lo que dure su reproducción.
   */
  segundos?: number | null;
}

/** Destinatario añadido uno a uno. */
export interface BoletinUsuario {
  user_id: number;
  login_user: string;
  name: string;
  surname: string;
  isactive: boolean;
}

/** Destinatario por grupo de usuarios. */
export interface BoletinGrupo {
  grupo_id: number;
  nombre: string;
  incluir_subgrupos: boolean;
}

/** Usuario que verá el boletín, ya resuelto (directo o por grupo). */
export interface BoletinDestinatario {
  user_id: number;
  login_user: string;
  name: string;
  surname: string;
  isactive: boolean;
  origen: 'DIRECTO' | 'GRUPO';
  /** Nombre del grupo por el que le llega (null si es directo) */
  desde: string | null;
  visto_at: string | null;
  no_mostrar: boolean;
}

export type EstadoBoletin = 'VIGENTE' | 'PROGRAMADO' | 'CADUCADO' | 'INACTIVO';

export interface BoletinModel {
  id: number;
  titulo: string;
  descripcion: string | null;
  /** Vigencia */
  desde: string;
  hasta: string;
  /** Orden en el carrusel: mayor primero */
  prioridad: number;
  /** Hay que confirmar la lectura para poder cerrarlo */
  obligatorio: boolean;
  activo: boolean;
  vigente: boolean;
  estado: EstadoBoletin;
  en_papelera: boolean;
  imagenes: BoletinImagen[];
  usuarios: BoletinUsuario[];
  grupos: BoletinGrupo[];
  num_imagenes: number;
  num_usuarios: number;
  num_grupos: number;
  num_vistos: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

/** Lo que se manda al guardar (crear o modificar). */
export interface BoletinGuardar {
  titulo?: string;
  descripcion?: string | null;
  desde?: string;
  hasta?: string;
  prioridad?: number;
  obligatorio?: boolean;
  activo?: boolean;
  imagenes?: BoletinImagen[];
  /** Ids de los usuarios destinatarios */
  usuarios?: number[];
  grupos?: { grupo_id: number; incluir_subgrupos: boolean }[];
}

/** Estados para el filtro de la grilla. */
export const ESTADOS_BOLETIN: { id: string; name: string }[] = [
  { id: 'TODOS',      name: 'Todos' },
  { id: 'VIGENTE',    name: 'Vigentes' },
  { id: 'PROGRAMADO', name: 'Programados' },
  { id: 'CADUCADO',   name: 'Caducados' },
  { id: 'INACTIVO',   name: 'Inactivos' },
];
