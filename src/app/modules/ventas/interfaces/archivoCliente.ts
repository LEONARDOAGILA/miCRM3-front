/**
 * Un archivo del cliente: fotos del local, el RUC escaneado, el contrato, un
 * video de la visita.
 *
 * El fichero vive en storage/app/public/img/clientes (la misma carpeta que la
 * foto y el mapa del cliente) y aquí sólo viaja su nombre. Para verlo se usa
 * siempre la url del servicio, nunca `archivo` a pelo: así cambiar de dominio
 * o de servidor no obliga a tocar nada.
 */
export interface ArchivoCliente {
  id: number;
  cliente_id?: number;
  /** Lo que se lee en la lista */
  nombre: string;
  /** Para qué es. Es el motivo de que esto exista: un archivo sin contexto no sirve */
  descripcion?: string | null;
  /** Nombre del fichero en disco; no se muestra, se usa para construir la url */
  archivo?: string;
  /** imagen, pdf, video, excel, word, audio, otro */
  tipo: string;
  extension?: string | null;
  mime?: string | null;
  /** Bytes */
  tamano?: number | null;
  orden?: number;
  activo?: boolean;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}

/** Lo que se ve mientras un fichero está en la cola de subida. */
export type EstadoSubida = 'pendiente' | 'subiendo' | 'guardando' | 'ok' | 'error';

export interface FilaSubida {
  clave: number;
  fichero: File;
  /** El original sin extensión; se puede retocar antes de subir */
  nombre: string;
  extension: string;
  tipo: string;
  tamano: number;
  estado: EstadoSubida;
  /** 0-100 mientras sube */
  progreso: number;
  error?: string;
  /** Miniatura (object URL) si es imagen */
  vistaPrevia: string | null;
  registroId?: number;
}

/** 1,2 MB en vez de 1258291. */
export function formatoTamano(bytes?: number | null): string {
  const n = Number(bytes ?? 0);
  if (!n) { return ''; }
  if (n < 1024) { return n + ' B'; }
  if (n < 1024 * 1024) { return (n / 1024).toFixed(1).replace('.', ',') + ' KB'; }
  if (n < 1024 * 1024 * 1024) { return (n / 1024 / 1024).toFixed(1).replace('.', ',') + ' MB'; }
  return (n / 1024 / 1024 / 1024).toFixed(2).replace('.', ',') + ' GB';
}

/** La extensión en minúsculas, sin el punto. */
export function extensionDe(nombre?: string | null): string {
  const n = (nombre ?? '').trim();
  const i = n.lastIndexOf('.');
  return i > 0 ? n.substring(i + 1).toLowerCase() : '';
}

/**
 * Qué es, deducido de la extensión.
 *
 * Mismo vocabulario que usa el back (ArchivoController::tipoPorExtension), para
 * que lo que decide el icono aquí y lo que se guarda allí no se separen. Se
 * mira la extensión y no el mime porque un .xlsx o un .docx son ZIP por dentro.
 */
export function tipoPorExtension(extension?: string | null): string {
  const e = (extension ?? '').toLowerCase().replace(/^\./, '');
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'avif', 'heic'].includes(e)) { return 'imagen'; }
  if (e === 'pdf') { return 'pdf'; }
  if (['xls', 'xlsx', 'xlsm', 'csv', 'ods'].includes(e)) { return 'excel'; }
  if (['doc', 'docx', 'odt', 'rtf', 'txt'].includes(e)) { return 'word'; }
  if (['mp4', 'webm', 'mov', 'avi', 'mkv', 'wmv', 'mpg', 'mpeg', '3gp'].includes(e)) { return 'video'; }
  if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes(e)) { return 'audio'; }
  return 'otro';
}

/** El icono y el color de cada tipo. */
export function pintaDeTipo(tipo?: string | null): { icono: string; color: string } {
  switch ((tipo ?? '').toLowerCase()) {
    case 'imagen': return { icono: 'fa fa-image',            color: '#2f80ed' };
    case 'pdf':    return { icono: 'fa fa-file-pdf',         color: '#dc3545' };
    case 'excel':  return { icono: 'fa fa-file-excel',       color: '#198754' };
    case 'word':   return { icono: 'fa fa-file-word',        color: '#2b579a' };
    case 'video':  return { icono: 'fa fa-file-video',       color: '#6f42c1' };
    case 'audio':  return { icono: 'fa fa-file-audio',       color: '#fd7e14' };
    default:       return { icono: 'fa fa-file',             color: '#6c757d' };
  }
}
