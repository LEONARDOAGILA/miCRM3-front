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
  tipo?: string | null;
  /** Peso en bytes del fichero subido; null en enlaces y carpetas */
  tamano?: number | null;
  escarpeta?:boolean;
  activo?:boolean;
  created_at_formateado?: Date;
  updated_at_formateado?: Date;

}
