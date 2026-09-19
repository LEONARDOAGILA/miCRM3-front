import { MenuModel } from "./menuModel";


export interface AccesoModel {

    id?: number;
    perfil_id?: number;
    menu_id?: number;
    ver?: boolean;
    crear?: boolean;
    editar?: boolean;
    eliminar?: boolean;
    listar?: boolean;
    reporte?: boolean;
    auditar?: boolean;
    /** Puede abrir la papelera de reciclaje del componente */
    papelera?: boolean;
    ejecutar?: boolean;
    created_at?: Date;
    updated_at?: Date;
    created_by?: string;
    updated_by?: string;
    menu: MenuModel; 
}