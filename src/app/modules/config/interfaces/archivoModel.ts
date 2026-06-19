export interface ArchivoModel {
  id?: number;
  padre?: number;
  orden?: number;
  nivel?: number;
  nombre?: string;
  descripcion?: string;
  modulo?: string;
  url?: string;
  icono?: string;
  color?: string;
  tipo?: string;
  escarpeta?:boolean;
  activo?:boolean;
  created_at_formateado?: Date;
  updated_at_formateado?: Date;

}
