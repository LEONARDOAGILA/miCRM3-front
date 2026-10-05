/**
 * Una nota sobre el cliente.
 *
 * No es la nota de una gestión: aquélla cuenta qué pasó en una llamada concreta
 * y se queda clavada en su fecha. Éstas describen al cliente —cómo le gusta que
 * le llamen, que el gerente de compras sólo atiende los martes, el acuerdo
 * verbal del precio— y se mantienen al día.
 */
export interface NotaCliente {
  id: number;
  cliente_id?: number;
  titulo: string;
  /** HTML del editor. Se pinta con [innerHTML], que Angular sanea */
  contenido?: string | null;
  /** Lo mismo sin etiquetas: lo calcula el back y es lo que se busca */
  contenido_texto?: string | null;
  /** Las primeras líneas del texto plano, para la tarjeta de la lista */
  resumen?: string | null;
  color: ColorNota;
  /** Las que siempre hay que tener delante van arriba del todo */
  fijada: boolean;
  /** La nota lleva al menos una imagen incrustada */
  tiene_imagen?: boolean;
  /** Si alguien la tocó después de escribirla (más de un minuto después) */
  editada?: boolean;
  created_by?: string;
  updated_by?: string;
  created_at?: string;
  updated_at?: string;
}

export type ColorNota = 'gris' | 'azul' | 'verde' | 'amarillo' | 'rojo' | 'morado';

/**
 * Los colores de etiqueta.
 *
 * Seis y no más: la etiqueta sirve para distinguir de un vistazo, y con quince
 * colores deja de distinguirse nada. El nombre explica para qué suele usarse
 * cada uno, que si no acaban puestos al azar.
 */
export const COLORES_NOTA: { id: ColorNota; nombre: string; tinte: string }[] = [
  { id: 'gris',     nombre: 'Sin etiqueta', tinte: '#6c757d' },
  { id: 'azul',     nombre: 'Información',  tinte: '#2f80ed' },
  { id: 'verde',    nombre: 'Acuerdo',      tinte: '#198754' },
  { id: 'amarillo', nombre: 'Ojo con esto', tinte: '#f0ad4e' },
  { id: 'rojo',     nombre: 'Problema',     tinte: '#dc3545' },
  { id: 'morado',   nombre: 'Interno',      tinte: '#6f42c1' },
];

export function tinteDeNota(color?: string | null): string {
  return COLORES_NOTA.find(c => c.id === color)?.tinte ?? '#6c757d';
}

export function nombreDeColor(color?: string | null): string {
  return COLORES_NOTA.find(c => c.id === color)?.nombre ?? 'Sin etiqueta';
}
