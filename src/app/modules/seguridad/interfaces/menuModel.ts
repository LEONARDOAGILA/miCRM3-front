export interface MenuModel {

    id?: number;
    padre_id?: number;
    orden?: number;
    nivel?: number;
    nombre?: string;
    url?: string;
    descripcion?: string;
    etiqueta?: string;
    icono?: string;
    path?: string;
    created_at_formateado?: Date;
    updated_at_formateado?: Date;
    created_by?: string;
    updated_by?: string;
}
