/**
 * El catálogo de tipos y asuntos de gestión.
 *
 * El asunto de una gestión se elige de aquí, nunca se escribe: era la única
 * forma de que un informe por asunto no saliera partido entre «Cobranza» y
 * «cobranzas». Las dos tablas viven en ventas.gestiones_tipos y
 * ventas.gestiones_asuntos, y se mantienen desde la pantalla de catálogo.
 */

export interface AsuntoGestion {
  id: number;
  tipo_id?: number;
  /** El nombre del tipo; sólo viene al listarlos para el mantenimiento */
  tipo_nombre?: string;
  nombre: string;
  orden?: number;
  activo?: boolean;
  /** Cuántas gestiones lo usan. Decide si se puede borrar o sólo desactivar */
  en_uso?: number;
}

export interface TipoGestion {
  id: number;
  /** El que se guarda en ventas.gestiones.tipo: LLAMADA, WHATSAPP… */
  codigo: string;
  nombre: string;
  /** Clase de Font Awesome, p. ej. 'fa-phone' o 'fab fa-whatsapp' */
  icono?: string | null;
  orden?: number;
  activo?: boolean;
  /** Cuántas gestiones son de este tipo */
  en_uso?: number;
  /**
   * Los asuntos del tipo.
   *
   * Vienen dentro cuando se pide el catálogo para el formulario (una sola
   * petición, porque el combo de asuntos tiene que estar lleno antes de que el
   * usuario elija el tipo). Al listarlos para el mantenimiento llega en su
   * lugar `asuntos` como número.
   */
  asuntos?: AsuntoGestion[] | number;
}

/** Los asuntos de un tipo, venga como lista o como contador. */
export function asuntosDe(tipo: TipoGestion | null | undefined): AsuntoGestion[] {
  return Array.isArray(tipo?.asuntos) ? tipo!.asuntos as AsuntoGestion[] : [];
}

/** El icono de un tipo, con uno de reserva para los que se den de alta sin él. */
export function iconoDelTipo(tipo: TipoGestion | null | undefined): string {
  const i = (tipo?.icono ?? '').trim();
  if (!i) { return 'fa fa-comment-dots'; }
  // Los de marca vienen con su familia («fab fa-whatsapp»); el resto es sólida
  return i.startsWith('fa-') ? 'fa ' + i : i;
}
