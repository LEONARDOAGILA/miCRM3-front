/** Una franja de trabajo dentro de un día (rh.horarios_empleados_jornadas). */
export interface JornadaModel {
  id?: number;
  horario_id?: number;
  /** 1 = lunes … 7 = domingo (ISO) */
  dia: number;
  dia_nombre?: string;
  /** 1 a 4 dentro del día, en orden de reloj */
  jornada: number;
  /** «08:00» */
  hora_inicio: string;
  /** «12:00». Si es menor que hora_inicio, la jornada termina al día siguiente. */
  hora_fin: string;
  /** Cuánto dura, ya contando el cruce de medianoche */
  minutos?: number;
  cruza_medianoche?: boolean;
  activo?: boolean;
}

/** Horario de trabajo del personal (rh.horarios_empleados). */
export interface HorarioEmpleadoModel {
  id: number;
  nombre: string;
  descripcion?: string | null;
  /** Minutos de gracia desde la hora de inicio antes de contar atraso */
  tolerancia_min: number;
  activo: boolean;

  /** Días con alguna jornada activa */
  num_dias?: number;
  /** Jornadas activas en total */
  num_jornadas?: number;
  /** Horas de trabajo a la semana */
  horas_semana?: number;
  /** Empleados vigentes que lo tienen puesto; con gente no se puede borrar */
  num_empleados?: number;
  jornadas?: JornadaModel[];

  created_at?: string;
  updated_at?: string;
  created_by?: string;
  updated_by?: string;
  /** Cuándo se envió a la papelera; sólo lo traen las filas de la papelera */
  deleted_at?: string | null;
  /** Quién lo envió a la papelera */
  deleted_by?: string | null;
}

/** Lo que devuelve `evaluar`: qué jornada tocaba y cuánto atraso hubo. */
export interface EvaluacionAtrasoModel {
  horario_id?: number;
  dia: number;
  dia_nombre: string;
  jornada: number | null;
  hora_inicio?: string;
  hora_fin?: string;
  hora_marcada?: string;
  tolerancia_min?: number;
  /** Minutos de atraso YA descontada la tolerancia; nunca negativo */
  atraso_min: number;
  /** Minutos de diferencia con la hora de entrada, sin descontar nada */
  diferencia_min?: number;
  estado: 'A TIEMPO' | 'EN TOLERANCIA' | 'ATRASO' | 'SIN JORNADA';
}

/** Los días de la semana, en el orden y con los números de la base (ISO). */
export const DIAS_SEMANA: { id: number; nombre: string; corto: string }[] = [
  { id: 1, nombre: 'Lunes',     corto: 'Lun' },
  { id: 2, nombre: 'Martes',    corto: 'Mar' },
  { id: 3, nombre: 'Miércoles', corto: 'Mié' },
  { id: 4, nombre: 'Jueves',    corto: 'Jue' },
  { id: 5, nombre: 'Viernes',   corto: 'Vie' },
  { id: 6, nombre: 'Sábado',    corto: 'Sáb' },
  { id: 7, nombre: 'Domingo',   corto: 'Dom' },
];

/** El tope de jornadas por día que admite la base (ck_hej_jornada). */
export const MAX_JORNADAS_POR_DIA = 4;
