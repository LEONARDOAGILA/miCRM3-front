/**
 * Tipos de "archivo" del administrador de archivos (columna `tipo` de la
 * tabla archivo). Un enlace apunta a una url externa; el resto son ficheros
 * subidos al servidor (storage/img/file-manager).
 *
 * El usuario no elige el tipo de un fichero: se deduce de la EXTENSIÓN del
 * nombre (tipoPorExtension), aquí para el icono y la vista previa, y en el
 * back (ArchivoController::tipoPorExtension) para grabarlo en `tipo`, que es
 * quien manda. Las listas de extensiones tienen que coincidir con las del
 * back; lo que no esté en ninguna se guarda como 'otro', no se rechaza.
 *
 * Es la única lista: la usan saveFile (dropzone y chip "detectado"), el
 * visor (cómo abrir cada uno) y la grilla del administrador (icono y etiqueta).
 */
export type TipoArchivo = 'link' | 'imagen' | 'pdf' | 'excel' | 'word' | 'video' | 'audio' | 'otro';

export interface DefTipoArchivo {
  id: TipoArchivo;
  etiqueta: string;
  /** Icono Font Awesome por defecto para el registro. */
  icono: string;
  /** Color por defecto del icono. */
  color: string;
  /** Extensiones que caen en este tipo (vacío en enlace y en "otro"). */
  extensiones: string[];
  /** Cómo lo abre el visor. */
  visor: 'iframe' | 'imagen' | 'video' | 'audio' | 'descarga';
  descripcion: string;
}

export const TIPOS_ARCHIVO: DefTipoArchivo[] = [
  { id: 'link',   etiqueta: 'Enlace',  icono: 'fa fa-link',        color: '#348fe2',
    extensiones: [], visor: 'iframe',   descripcion: 'Una dirección web (reporte externo, página…)' },
  { id: 'imagen', etiqueta: 'Imagen',  icono: 'fa fa-file-image',  color: '#00acac',
    extensiones: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'tif', 'tiff', 'ico'],
    visor: 'imagen', descripcion: 'JPG, PNG, GIF, WEBP, SVG…' },
  { id: 'pdf',    etiqueta: 'PDF',     icono: 'fa fa-file-pdf',    color: '#ff5b57',
    extensiones: ['pdf'], visor: 'iframe',   descripcion: 'Documento PDF' },
  { id: 'excel',  etiqueta: 'Excel',   icono: 'fa fa-file-excel',  color: '#1d6f42',
    extensiones: ['xls', 'xlsx', 'xlsm', 'csv', 'ods'], visor: 'descarga', descripcion: 'XLS, XLSX, CSV u ODS' },
  { id: 'word',   etiqueta: 'Word',    icono: 'fa fa-file-word',   color: '#2b579a',
    extensiones: ['doc', 'docx', 'rtf', 'odt'], visor: 'descarga', descripcion: 'DOC, DOCX, RTF u ODT' },
  { id: 'video',  etiqueta: 'Video',   icono: 'fa fa-file-video',  color: '#727cb6',
    extensiones: ['mp4', 'webm', 'ogv', 'mov', 'avi', 'mkv', 'wmv', 'm4v', '3gp'],
    visor: 'video',   descripcion: 'MP4, WEBM, MOV, AVI, MKV…' },
  { id: 'audio',  etiqueta: 'Audio',   icono: 'fa fa-file-audio',  color: '#f59c1a',
    extensiones: ['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'wma', 'opus', 'weba'],
    visor: 'audio',   descripcion: 'MP3, WAV, OGG, M4A, FLAC…' },
  { id: 'otro',   etiqueta: 'Otro',    icono: 'fa fa-file',        color: '#A6A09B',
    extensiones: [], visor: 'descarga', descripcion: 'Cualquier otro fichero (ZIP, TXT, PPT…)' },
];

/**
 * Tamaño máximo por fichero, en MB. 0 = sin límite propio: manda el de
 * php.ini del servidor (upload_max_filesize / post_max_size).
 */
export const MAX_MB_ARCHIVO = 0;

/**
 * Valores que se graban en la columna `tipo` de core.archivos:
 *   - carpetas:  'UNIDAD' (raíz) o 'CARPETA'
 *   - enlaces:   'LINK'
 *   - ficheros:  'ARCHIVO <EXT>' → 'ARCHIVO PDF', 'ARCHIVO XLSX', 'ARCHIVO MP4'…
 * Aquí (front) se trabaja con la CATEGORÍA (imagen, pdf, excel…), que sale
 * de la extensión; estas funciones traducen en los dos sentidos.
 */
export const TIPO_LINK = 'LINK';
export const TIPO_UNIDAD = 'UNIDAD';
export const TIPO_CARPETA = 'CARPETA';

/** 'ARCHIVO PDF', 'ARCHIVO MP4'… a partir de la extensión (sin punto). */
export function tipoArchivoDeExtension(extension?: string | null): string {
  const ext = (extension ?? '').trim().replace(/^\./, '').toUpperCase();
  return ext ? `ARCHIVO ${ext}` : 'ARCHIVO';
}

/**
 * Definición (categoría) de un registro a partir de su `tipo` y, si hace
 * falta, de su `url`. Entiende todos los formatos que ha habido:
 *   - 'ARCHIVO <EXT>' (actual): categoría por la extensión
 *   - 'link' / 'LINK' / sin tipo (registros antiguos): enlace
 *   - 'imagen', 'pdf', 'excel'… (categorías, formato intermedio)
 *   - 'otro' o desconocido: se intenta por la extensión de la url
 */
export function defTipo(tipo?: string | null, url?: string | null): DefTipoArchivo {
  const t = (tipo ?? '').trim().toLowerCase();

  // Formato actual: "ARCHIVO <EXT>"
  if (t.startsWith('archivo')) {
    const ext = t.slice('archivo'.length).trim();
    if (ext) { return defTipo(categoriaDeExtension(ext)); }
  }

  const def = TIPOS_ARCHIVO.find(x => x.id === t);
  if (def && def.id !== 'otro') { return def; }

  if (url) {
    const porExtension = tipoPorExtension(url.split(/[?#]/)[0]);
    if (porExtension !== 'otro') { return defTipo(porExtension); }
  }
  return def ?? TIPOS_ARCHIVO[0];
}

/** Categoría (imagen, pdf, excel…) de una extensión sin punto; 'otro' si no se reconoce. */
export function categoriaDeExtension(extension?: string | null): TipoArchivo {
  const ext = (extension ?? '').trim().replace(/^\./, '').toLowerCase();
  return TIPOS_ARCHIVO.find(t => t.extensiones.includes(ext))?.id ?? 'otro';
}

/** Extensión en minúsculas de un nombre de fichero ('' si no tiene). */
export function extensionDe(nombre?: string | null): string {
  const n = (nombre ?? '').trim();
  const punto = n.lastIndexOf('.');
  return punto > 0 && punto < n.length - 1 ? n.slice(punto + 1).toLowerCase() : '';
}

/** Tipo que corresponde a un nombre de fichero por su extensión ('otro' si no se reconoce). */
export function tipoPorExtension(nombre?: string | null): TipoArchivo {
  return categoriaDeExtension(extensionDe(nombre));
}

/** "1,2 MB", "340 KB", "—" */
export function formatoTamano(bytes?: number | null): string {
  if (bytes == null || isNaN(bytes)) { return '—'; }
  if (bytes < 1024) { return `${bytes} B`; }
  if (bytes < 1024 * 1024) { return `${(bytes / 1024).toFixed(0)} KB`; }
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}
