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
