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

/** Cómo se pinta cada tipo. */
export const ESTILOS_NOTIFICACION: Record<TipoNotificacion, { nombre: string; icono: string; clase: string }> = {
  INFO:  { nombre: 'Información', icono: 'fa-circle-info',           clase: 'es-info' },
  EXITO: { nombre: 'Éxito',       icono: 'fa-circle-check',          clase: 'es-exito' },
  AVISO: { nombre: 'Aviso',       icono: 'fa-triangle-exclamation',  clase: 'es-aviso' },
  ERROR: { nombre: 'Problema',    icono: 'fa-circle-exclamation',    clase: 'es-error' },
};
