import { DepartamentoModel } from "../../config/interfaces/departamentoModel";

export interface ReporteExternoModel {
    id: number,
    nombre: string,
    descripcion: string,
    url: string,
    activo: boolean,
    departamento?: DepartamentoModel;
    created_at_formateado?: Date;
    updated_at_formateado?: Date;
  }