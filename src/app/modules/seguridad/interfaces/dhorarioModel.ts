export interface DhorarioModel {
    id?: number;
    chorario_id?: number;
    /** 1 = lunes … 7 = domingo (ISO) */
    dia: number;
    dia_nombre?: string;
    /** 1 a 4 dentro del día, en orden de reloj */
    jornada?: number;
    /** «08:00» */
    hora_inicio: string;
    /** «12:00». Si es menor que hora_inicio, la franja termina al día siguiente. */
    hora_fin: string;
    /** Cuánto dura, ya contando el cruce de medianoche */
    minutos?: number;
    cruza_medianoche?: boolean;
    activo?: boolean;
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

/** El tope de franjas por día que admite la base (ck_dhorarios_jornada). */
export const MAX_JORNADAS_POR_DIA = 4;