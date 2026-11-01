/**
 * Una SECCIÓN de la portada de la tienda.
 *
 * La portada no es una página: es esta lista, que se enciende, se apaga y se
 * reordena. Las secciones no se crean ni se borran desde el CRM —cada una
 * existe porque la tienda sabe pintarla—, así que aquí no hay «nueva».
 */
export interface SeccionInicioModel {
  id: number;
  /** La que conoce la tienda. No se cambia: está en su código. */
  clave: string;
  nombre: string;
  titulo: string | null;
  subtitulo: string | null;
  orden: number;
  activo: boolean;
  /** 'YYYY-MM-DDTHH:mm', como lo quiere un <input type="datetime-local">. */
  desde: string | null;
  hasta: string | null;
  updated_at: string | null;
  updated_by: string | null;
  estado: EstadoSeccion;
  fuente: FuenteSeccion;
  /** Cuántas cosas tiene hoy, cuando se puede saber. */
  cuantas: number | null;
  /** Si hoy tiene algo que enseñar. Sin contenido, la tienda se la salta. */
  con_contenido: boolean;
}

export type EstadoSeccion = 'visible' | 'oculta' | 'programada' | 'terminada';

/**
 * De dónde saca sus datos la sección.
 *
 *   galeria     las imágenes de una galería, aquí mismo
 *   categorias  el mosaico: cualquier categoría con imagen vigente
 *   destacadas  los círculos de arriba: sólo las marcadas a dedo
 *   pendiente   todavía no tiene fuente, y `falta` dice cuál
 *
 * Lo decide el servidor —la tienda, la portada pública y el CRM tienen que
 * estar de acuerdo en esto— y la pantalla sólo lo enseña.
 */
export interface FuenteSeccion {
  tipo: 'galeria' | 'categorias' | 'destacadas' | 'pendiente';
  /** Con `galeria`: su clave. */
  galeria?: string;
  /** Con `categorias` y `destacadas`: la pantalla donde se llena. */
  pantalla?: string;
  /** Con `pendiente`: qué falta. */
  falta?: string;
}

export const ESTADOS_SECCION: Record<EstadoSeccion, { texto: string; clase: string; icono: string }> = {
  visible:    { texto: 'En la portada', clase: 'chip-ok',    icono: 'fa-eye' },
  oculta:     { texto: 'Oculta',        clase: 'chip-muted', icono: 'fa-eye-slash' },
  programada: { texto: 'Programada',    clase: 'chip-info',  icono: 'fa-clock' },
  terminada:  { texto: 'Terminada',     clase: 'chip-warn',  icono: 'fa-hourglass-end' },
};

/**
 * Lo que se enseña de cada sección: su icono, para qué sirve y si la tienda
 * pinta un rótulo encima.
 *
 * Vive en el front porque es cómo se explica, no cómo funciona. La clave y la
 * fuente las manda el servidor; esto es sólo la cara.
 *
 * `rotulo` dice qué campos tiene sentido enseñar: la tienda sólo pinta título
 * encima de dos secciones, y ofrecerlo en las otras seis serían seis casillas
 * que se rellenan y no salen en ninguna parte.
 */
export interface VistaSeccion {
  icono: string;
  descripcion: string;
  rotulo: 'ninguno' | 'titulo' | 'titulo_subtitulo';
}

export const VISTA_SECCIONES: Record<string, VistaSeccion> = {
  banner_principal: {
    icono: 'fa-panorama',
    descripcion: 'Las imágenes grandes que rotan arriba del todo.',
    rotulo: 'ninguno',
  },
  categorias_destacadas: {
    icono: 'fa-star',
    descripcion: 'Las categorías marcadas como destacadas, con su imagen.',
    rotulo: 'ninguno',
  },
  ofertas_flash: {
    icono: 'fa-bolt',
    descripcion: 'Productos en oferta con cuenta regresiva. La fecha «hasta» es la cuenta que ve el cliente.',
    rotulo: 'titulo_subtitulo',
  },
  banner_simple: {
    icono: 'fa-image',
    descripcion: 'Una franja de imágenes entre dos secciones.',
    rotulo: 'ninguno',
  },
  mosaico: {
    icono: 'fa-table-cells-large',
    descripcion: 'Categorías con su imagen y su nombre, de cuatro en cuatro.',
    rotulo: 'ninguno',
  },
  grilla: {
    icono: 'fa-grip',
    descripcion: 'Productos de todas las marcas, uno al lado del otro.',
    rotulo: 'titulo',
  },
  bloques: {
    icono: 'fa-layer-group',
    descripcion: 'Cada bloque enseña los productos destacados de una categoría y, al lado, sus promociones.',
    rotulo: 'ninguno',
  },
  marcas: {
    icono: 'fa-copyright',
    descripcion: 'Los logos de las marcas, en el orden de Marcas de la tienda.',
    rotulo: 'ninguno',
  },
};

/** Por si llega una clave que esta pantalla todavía no conoce. */
export const VISTA_POR_DEFECTO: VistaSeccion = {
  icono: 'fa-puzzle-piece',
  descripcion: 'Una sección de la tienda.',
  rotulo: 'ninguno',
};
