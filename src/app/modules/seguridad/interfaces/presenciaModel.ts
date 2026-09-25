/**
 * Presencia: el «En línea / Fuera de línea» de la cabecera.
 *
 * Son dos cosas distintas y conviene no mezclarlas:
 *   · EstadoElegido  — lo que el usuario decide publicar
 *   · EstadoEfectivo — lo que los demás ven, cruzando eso con su última señal
 *     de vida. Por eso aparecen AUSENTE y DESCONECTADO, que nadie elige.
 */

/** Lo que el usuario puede elegir en el menú. */
export type EstadoElegido = 'DISPONIBLE' | 'OCUPADO' | 'NO_MOLESTAR' | 'INVISIBLE';

/** Lo que se acaba mostrando, ya cruzado con el latido. */
export type EstadoEfectivo = EstadoElegido | 'AUSENTE' | 'DESCONECTADO';

export interface PresenciaModel {
  user_id: number;
  login_user: string;
  nombre: string;
  /** Lo que eligió; a uno mismo se le dice la verdad */
  estado: EstadoElegido;
  /** Lo que se muestra: puede ser AUSENTE o DESCONECTADO aunque él eligiera otra cosa */
  efectivo: EstadoEfectivo;
  mensaje: string | null;
  /** Minutos desde la última señal de vida; null si nunca hubo */
  visto_hace_min: number | null;
  ultimo_latido_at: string | null;
}

/** Cómo se pinta y se llama cada estado. */
export interface EstiloPresencia {
  nombre: string;
  icono: string;
  /** Clase de color del tema, para el punto y el icono */
  color: string;
  ayuda: string;
}

export const ESTILOS_PRESENCIA: Record<EstadoEfectivo, EstiloPresencia> = {
  DISPONIBLE: {
    nombre: 'Disponible', icono: 'fa-circle-check', color: 'text-success',
    ayuda: 'Estás trabajando y te pueden escribir',
  },
  OCUPADO: {
    nombre: 'Ocupado', icono: 'fa-circle-minus', color: 'text-danger',
    ayuda: 'Estás, pero prefieres que no te interrumpan',
  },
  NO_MOLESTAR: {
    // El que además silencia la campana
    nombre: 'No molestar', icono: 'fa-bell-slash', color: 'text-danger',
    ayuda: 'Como ocupado y, además, la campana no suena ni avisa el navegador',
  },
  INVISIBLE: {
    nombre: 'Fuera de línea', icono: 'fa-circle', color: 'text-secondary',
    ayuda: 'Sigues trabajando, pero los demás te ven desconectado',
  },
  AUSENTE: {
    nombre: 'Ausente', icono: 'fa-clock', color: 'text-warning',
    ayuda: 'Lo pone el sistema solo cuando llevas un rato sin tocar nada',
  },
  DESCONECTADO: {
    nombre: 'Desconectado', icono: 'fa-circle', color: 'text-secondary',
    ayuda: 'No tiene el sistema abierto',
  },
};

/** Los cuatro que salen en el menú, en el orden en que se ofrecen. */
export const ESTADOS_ELEGIBLES: EstadoElegido[] = ['DISPONIBLE', 'OCUPADO', 'NO_MOLESTAR', 'INVISIBLE'];

export function estiloDePresencia(estado: EstadoEfectivo | null | undefined): EstiloPresencia {
  return ESTILOS_PRESENCIA[(estado ?? 'DESCONECTADO') as EstadoEfectivo] ?? ESTILOS_PRESENCIA.DESCONECTADO;
}
