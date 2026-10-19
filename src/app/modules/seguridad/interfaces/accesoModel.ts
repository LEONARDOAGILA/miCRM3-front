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
    /** Puede abrir la papelera de reciclaje del componente y restaurar */
    papelera?: boolean;
    /**
     * Dentro de la papelera, puede ELIMINAR DEFINITIVAMENTE y vaciarla.
     *
     * Va aparte de `papelera` a propósito: restaurar se puede deshacer y
     * esto no, y con el registro se va lo que cuelga de él (los accesos de
     * un perfil, las imágenes de un producto, los ficheros de un cliente).
     */
    vaciar?: boolean;
    ejecutar?: boolean;
    created_at?: Date;
    updated_at?: Date;
    created_by?: string;
    updated_by?: string;
    menu: MenuModel; 
}