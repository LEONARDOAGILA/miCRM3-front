/** Gestión con un cliente (ventas.gestiones): lo que devuelven ventas.fn_gestiones_* */
export interface GestionModel {
  id: number;
  cliente_id: number;
  cliente_nombre?: string;
  /** Empleado que la hace o la tiene pendiente (rh.empleados) */
  empleado_id?: number | null;
  empleado_nombre?: string | null;
  /** Persona de contacto del cliente con la que se habló */
  contacto_id?: number | null;
  contacto_nombre?: string | null;

  /** LLAMADA, WHATSAPP, CORREO, VISITA, REUNION, OTRO */
  tipo: string;
  /** PENDIENTE (programada), REALIZADA, CANCELADA */
  estado: string;
  /** ALTA, MEDIA, BAJA */
  prioridad: string;

  asunto: string;
  nota?: string | null;
  telefono?: string | null;

  /** AAAA-MM-DD HH:mm */
  fecha_programada?: string | null;
  fecha_realizada?: string | null;
  duracion_minutos?: number | null;
  /** Cómo terminó; sólo cuando está REALIZADA */
  resultado?: string | null;
  /**
   * El asunto del catálogo (ventas.gestiones_asuntos) al que apunta.
   *
   * Para agrupar en informes se usa esto; `asunto` guarda el texto tal como
   * se vio el día que se registró, que es lo que se lee en el historial.
   */
  asunto_id?: number | null;
  /** Cómo se registró: AHORA, YA_HECHA o PROGRAMADA. Vacío en lo anterior a octubre de 2026. */
  modo_registro?: ModoRegistro | null;

  /** La gestión que la generó, cuando es un seguimiento */
  gestion_origen_id?: number | null;
  /** Pendiente cuya hora ya pasó (lo calcula la base) */
  vencida?: boolean;

  created_at?: string;
  updated_at?: string;
  created_by?: string;
  updated_by?: string;
}

/** Contadores del cliente (ventas.fn_gestiones_resumen). */
/**
 * Cómo se registró la gestión, para poder medirlo después.
 *
 * Dice cómo NACIÓ, no en qué estado está: una PROGRAMADA que luego se
 * cierra sigue siendo PROGRAMADA, y así se puede ver qué parte del trabajo
 * sale de la agenda. Va vacío en lo registrado antes de octubre de 2026.
 */
export type ModoRegistro = 'AHORA' | 'YA_HECHA' | 'PROGRAMADA';

export const MODOS_REGISTRO: { id: ModoRegistro; name: string; ayuda: string }[] = [
  { id: 'AHORA',      name: 'En este momento', ayuda: 'Se escribió mientras se hablaba con el cliente' },
  { id: 'YA_HECHA',   name: 'Ya la hice',      ayuda: 'Se anotó después, con la hora que puso el vendedor' },
  { id: 'PROGRAMADA', name: 'Programada',      ayuda: 'Salió de la agenda: se dejó pendiente para una fecha' },
];

export interface ResumenGestiones {
  cliente_id: number;
  total: number;
  realizadas: number;
  pendientes: number;
  vencidas: number;
  canceladas: number;
  llamadas: number;
  minutos: number;
  ultima?: GestionModel | null;
  proxima?: GestionModel | null;
}

/** Un cambio de vendedor (ventas.asignaciones_clientes). */
export interface AsignacionCliente {
  id: number;
  cliente_id: number;
  empleado_anterior_id?: number | null;
  empleado_anterior?: string | null;
  empleado_nuevo_id?: number | null;
  empleado_nuevo?: string | null;
  motivo?: string | null;
  asignado_at?: string;
  created_by?: string;
}

export const TIPOS_GESTION = [
  { id: 'LLAMADA',  name: 'Llamada',  icono: 'fa-phone' },
  { id: 'WHATSAPP', name: 'WhatsApp', icono: 'fab fa-whatsapp' },
  { id: 'CORREO',   name: 'Correo',   icono: 'fa-envelope' },
  { id: 'VISITA',   name: 'Visita',   icono: 'fa-person-walking' },
  { id: 'REUNION',  name: 'Reunión',  icono: 'fa-handshake' },
  { id: 'OTRO',     name: 'Otro',     icono: 'fa-comment-dots' },
];

export const ESTADOS_GESTION = [
  { id: 'PENDIENTE', name: 'Programada' },
  { id: 'REALIZADA', name: 'Realizada' },
  { id: 'CANCELADA', name: 'Cancelada' },
];

export const PRIORIDADES_GESTION = [
  { id: 'ALTA',  name: 'Alta' },
  { id: 'MEDIA', name: 'Media' },
  { id: 'BAJA',  name: 'Baja' },
];

/** Cómo terminó la gestión (ck_gestiones_resultado). */
export const RESULTADOS_GESTION = [
  { id: 'CONTACTADO',      name: 'Contactado' },
  { id: 'NO_CONTESTA',     name: 'No contesta' },
  { id: 'BUZON',           name: 'Buzón de voz' },
  { id: 'NUMERO_ERRADO',   name: 'Número errado' },
  { id: 'VOLVER_A_LLAMAR', name: 'Volver a llamar' },
  { id: 'INTERESADO',      name: 'Interesado' },
  { id: 'NO_INTERESADO',   name: 'No interesado' },
  { id: 'COTIZACION',      name: 'Pide cotización' },
  { id: 'VENTA',           name: 'Cerró venta' },
  { id: 'RECLAMO',         name: 'Reclamo' },
  { id: 'OTRO',            name: 'Otro' },
];

/** Icono de Font Awesome del tipo de gestión. */
export function iconoDeTipo(tipo: string | null | undefined): string {
  return TIPOS_GESTION.find(t => t.id === tipo)?.icono ?? 'fa-comment-dots';
}

/** Etiqueta legible de cualquiera de los catálogos de arriba. */
export function nombreDe(lista: { id: string; name: string }[], id: string | null | undefined): string {
  return lista.find(x => x.id === id)?.name ?? (id ?? '');
}

/** Color del badge según el resultado: verde lo bueno, rojo lo que se perdió. */
export function claseDeResultado(resultado: string | null | undefined): string {
  switch (resultado) {
    case 'VENTA':
    case 'INTERESADO':      return 'bg-teal';
    case 'COTIZACION':
    case 'CONTACTADO':      return 'bg-info';
    case 'VOLVER_A_LLAMAR': return 'bg-warning';
    case 'NO_INTERESADO':
    case 'NUMERO_ERRADO':
    case 'RECLAMO':         return 'bg-danger';
    default:                return 'bg-secondary';
  }
}

// ============================================================
// QUIÉN ATIENDE AL CLIENTE
// ============================================================

/**
 * Los papeles con los que se puede atender a un cliente.
 *
 * La base NO los valida a propósito: la lista vive aquí y en el validador del
 * controlador, así que añadir un cuarto responsable no pide una migración.
 * Al añadirlo, acuérdate del `in:` de GestionController@reasignar.
 */
export type RolResponsable = 'VENDEDOR' | 'COBRADOR' | 'ASISTENTE';

export interface ResponsableCliente {
  rol: RolResponsable;
  empleado_id: number | null;
  empleado_nombre: string | null;
  /** Desde cuándo lo atiende; null si el puesto está vacío */
  desde: string | null;
}

/** Cómo se presenta cada papel: rótulo, icono y para qué sirve. */
export const ROLES_RESPONSABLE: { id: RolResponsable; name: string; icono: string; ayuda: string }[] = [
  { id: 'VENDEDOR',  name: 'Vendedor',  icono: 'fa-user-tie',   ayuda: 'Le vende y se lleva su agenda al cambiar' },
  { id: 'COBRADOR',  name: 'Cobrador',  icono: 'fa-hand-holding-dollar', ayuda: 'Le gestiona los pagos' },
  { id: 'ASISTENTE', name: 'Asistente', icono: 'fa-headset',    ayuda: 'Le llama y coordina' },
];
