export interface ArchivoModel {
  id?: number;
  /** Carpeta que lo contiene; null = raíz */
  padre?: number | null;
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
  /** Extensión del fichero subido en minúsculas (xlsx, pdf, mp4…); null en enlaces y carpetas. Para reportería. */
  extension_archivo?: string | null;
  escarpeta?:boolean;
  activo?:boolean;
  /** true = Ejecutar abre el enlace/fichero en otra pestaña del navegador */
  nueva_ventana?: boolean;
  /** true = no se ofrece "abrir en pestaña" ni descargar: la url no sale del visor */
  proteger_url?: boolean;
  created_at_formateado?: Date;
  updated_at_formateado?: Date;

}
