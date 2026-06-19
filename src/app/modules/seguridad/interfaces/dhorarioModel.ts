export interface DhorarioModel {
    id?: number;
    chorario_id?: number;
    dia: number;
    dia_nombre?: string;
    hora_inicio: string;
    hora_fin: string;
    activo?: boolean;
}