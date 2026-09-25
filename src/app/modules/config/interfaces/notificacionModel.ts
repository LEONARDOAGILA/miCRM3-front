/**
 * Notificaciones (core.notificaciones): avisos breves que cuelgan de la
 * campana de cada usuario.
 */

/** El tipo da el color y el icono por defecto. */
export type TipoNotificacion = 'INFO' | 'EXITO' | 'AVISO' | 'ERROR';

/** La generó una persona desde la pantalla o el propio sistema. */
export type OrigenNotificacion = 'MANUAL' | 'SISTEMA';

export interface NotificacionModel {
  id: number;
  titulo: string;
  mensaje: string | null;
  tipo: TipoNotificacion;
  /** Icono propio (clase de Font Awesome); si va vacío, manda el tipo */
  icono: string | null;
  /** Ruta del front a la que lleva al pulsarla */
  url: string | null;
  url_texto: string | null;
  origen: OrigenNotificacion;
  modulo: string | null;
  referencia_tabla: string | null;
  referencia_id: number | null;
  caduca_at: string | null;
  caducada: boolean;
  created_at: string;
  created_by: string | null;
  /** Cuántos la recibieron y cuántos la han leído */
  destinatarios: number;
  leidas: number;

  // ---------- sólo en «mis notificaciones» ----------
  /** Este usuario ya la leyó */
  leida?: boolean;
  leida_at?: string | null;
}

/** Quién recibió una notificación, para el administrador. */
export interface DestinatarioNotificacion {
  user_id: number;
  login_user: string;
  name: string;
  surname: string;
  isactive: boolean;
  leida_at: string | null;
  archivada: boolean;
}

/** Lo que se manda al enviar una notificación. */
export interface NotificacionEnviar {
  titulo: string;
  mensaje?: string | null;
  tipo?: TipoNotificacion;
  icono?: string | null;
  url?: string | null;
  url_texto?: string | null;
  caduca_at?: string | null;
  modulo?: string | null;
  referencia_tabla?: string | null;
  referencia_id?: number | null;
  /** Destinatarios: sueltos, por grupo, o todo el mundo */
  usuarios?: number[];
  grupos?: { grupo_id: number; incluir_subgrupos: boolean }[];
  todos?: boolean;
}

/** La campana: lo que el usuario tiene ahora mismo. */
export interface MisNotificaciones {
  data: NotificacionModel[];
  no_leidas: number;
  total: number;
}

/** A dónde lleva una notificación al pulsarla. */
export interface DestinoNotificacion {
  /** «interna» va por el router; «externa» abre otra pestaña del navegador */
  tipo: 'interna' | 'externa';
  destino: string;
}

/**
 * Decide si la url de una notificación es del sistema o sale fuera.
 *
 * Todo lo que empieza por http(s), por «//» o por «www.» es un sitio de
 * internet y tiene que abrirse en otra pestaña: pasárselo al router hacía que
 * Angular lo buscara entre sus rutas y acabara en la página 404.
 *
 * Devuelve null si no hay nada que abrir, y también para `javascript:` y
 * compañía: son formas de colar código en la sesión de quien recibe la
 * notificación, y aquí nunca hace falta.
 */
export function destinoDeNotificacion(url: string | null | undefined): DestinoNotificacion | null {
  const u = (url ?? '').trim();
  if (!u) { return null; }

  if (/^\s*(javascript|data|vbscript|file|blob):/i.test(u)) { return null; }

  // http://… https://… //dominio… mailto:… tel:…
  if (/^(https?:)?\/\//i.test(u) || /^(mailto|tel):/i.test(u)) {
    return { tipo: 'externa', destino: u };
  }

  // «www.algo.com», tal como se escribe a mano; le falta el protocolo
  if (/^www\./i.test(u)) {
    return { tipo: 'externa', destino: 'https://' + u };
  }

  return { tipo: 'interna', destino: u.startsWith('/') ? u : '/' + u };
}

/** Cómo se pinta cada tipo. */
export const ESTILOS_NOTIFICACION: Record<TipoNotificacion, { nombre: string; icono: string; clase: string }> = {
  INFO:  { nombre: 'Información', icono: 'fa-circle-info',           clase: 'es-info' },
  EXITO: { nombre: 'Éxito',       icono: 'fa-circle-check',          clase: 'es-exito' },
  AVISO: { nombre: 'Aviso',       icono: 'fa-triangle-exclamation',  clase: 'es-aviso' },
  ERROR: { nombre: 'Problema',    icono: 'fa-circle-exclamation',    clase: 'es-error' },
};
