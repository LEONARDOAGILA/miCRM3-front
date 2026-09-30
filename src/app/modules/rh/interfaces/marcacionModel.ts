/** Marcación (rh.marcaciones): lo que devuelven rh.fn_marcaciones_* */
export interface MarcacionModel {
  id: number;
  empleado_id: number;
  /** "Nombres Apellidos" (lo arma el back) */
  empleado: string;
  identificacion?: string;
  cargo?: string | null;
  departamento?: string | null;
  /** Fichero de la foto del empleado (rh.empleados.foto) */
  empleado_foto?: string | null;
  tipo: 'ENTRADA' | 'SALIDA';
  /** AAAA-MM-DD HH:MM:SS */
  fecha_hora: string;
  /** AAAA-MM-DD */
  fecha: string;
  /** HH:MM:SS */
  hora: string;
  /** FACIAL, MANUAL, WEB, MOVIL */
  origen: string;
  /** Parecido con la plantilla facial (0-100); null si se registró a mano */
  similitud?: number | null;
  dispositivo?: string | null;
  latitud?: number | null;
  longitud?: number | null;
  /** Fichero de la foto del momento (storage/img/marcaciones) */
  foto?: string | null;
  observacion?: string | null;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
  updated_by?: string;
}

/** Una fila del resumen: un empleado en un día. */
export interface ResumenDia {
  empleado_id: number;
  empleado: string;
  identificacion?: string;
  departamento?: string | null;
  fecha: string;
  primera_entrada?: string | null;
  ultima_salida?: string | null;
  marcaciones: number;
  /** Horas trabajadas (decimal) */
  horas: number;
  /** Las mismas horas como HH:MM */
  horas_texto: string;
  /** Falta la entrada o la salida del día */
  incompleto: boolean;
}

/** Plantillas faciales de un empleado (rh.rostros_empleados). */
export interface RostroEmpleado {
  empleado_id: number;
  empleado: string;
  identificacion?: string;
  cargo?: string | null;
  departamento?: string | null;
  foto?: string | null;
  activo: boolean;
  muestras: { id: number; descriptor: number[]; origen: string; created_at: string; created_by?: string }[];
  num_muestras: number;
}

export const TIPOS_MARCACION = [
  { id: 'ENTRADA', name: 'Entrada' },
  { id: 'SALIDA',  name: 'Salida' },
];

export const ORIGENES_MARCACION = [
  { id: 'FACIAL', name: 'Reconocimiento facial' },
  { id: 'MANUAL', name: 'Registro manual' },
  { id: 'WEB',    name: 'Web' },
  { id: 'MOVIL',  name: 'Móvil' },
];
