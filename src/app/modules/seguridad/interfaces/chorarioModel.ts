  import { DhorarioModel } from "./dhorarioModel";

  export interface ChorarioModel {
    id?: number;
    nombre: string;
    /** Para qué sirve este horario y a quién se le pone */
    descripcion?: string | null;
    activo?: boolean;

    /** Días con alguna franja activa */
    num_dias?: number;
    /** Franjas activas en total (hasta 4 por día) */
    num_jornadas?: number;
    /** Horas de acceso a la semana */
    horas_semana?: number;
    /** Usuarios y grupos que lo tienen puesto; con gente no se puede borrar */
    num_usuarios?: number;
    num_grupos?: number;

    created_at?: string;
    updated_at?: string;
    created_by?: string;
    updated_by?: string;
    deleted_at?: string | null;
    deleted_by?: string | null;

    /**
     * Las franjas. Se sigue llamando `dhorario` porque es lo que manda y
     * espera el controlador; `fn_horarios_json` las devuelve además como
     * `jornadas`, que es el nombre que usa el formulario.
     */
    dhorario?: DhorarioModel[];
    jornadas?: DhorarioModel[];
}

