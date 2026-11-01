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
  /** Cómo se llama la sección aquí dentro. Es fija, para reconocerla. */
  nombre: string;
  /**
   * CÓMO SE LLAMA EN LA TIENDA: lo que lee el cliente encima de la sección.
   *
   * Esto sí se cambia, y es lo que sale en la página web. Vacío, la tienda
   * pone el que trae de fábrica —o ninguno—, que es cómo se ve hoy.
   */
  titulo: string | null;
  subtitulo: string | null;
  /** De qué tamaño, de qué color y con qué letra se lee ese rótulo. */
  estilo: EstiloRotulo;
  /** Cuánto espacio ocupa la sección en la portada. */
  alto: AltoSeccion;
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
 * LA PINTA DEL RÓTULO.
 *
 * SON CLAVES, NO CSS. «grande» y «deportiva» las traduce la tienda a sus
 * propias clases, y la base sólo admite las de su lista. Si por aquí viajara
 * CSS, quien pueda editar la portada estaría escribiendo en la hoja de
 * estilos de la tienda.
 *
 * EL TAMAÑO ES UNA ESCALA, no una medida. La tienda encoge sus títulos en
 * tablet y en celular; guardar «32px» rompería eso y el rótulo saldría
 * gigante en un teléfono.
 *
 * El color es lo único libre, y va en `#rrggbb`. Null = el que la tienda use
 * en esa sección, que no siempre es el mismo.
 */
export interface EstiloRotulo {
  tamano: TamanoRotulo;
  color: string | null;
  fuente: FuenteRotulo;
}

export type TamanoRotulo = 'pequeno' | 'normal' | 'grande' | 'enorme';
export type FuenteRotulo = 'titulos' | 'texto' | 'deportiva' | 'serif';

/**
 * Los tamaños, con la escala que les aplica la tienda.
 *
 * LA ESCALA ESTÁ TAMBIÉN EN `_home.scss` de la tienda (`.ae-rotulo--grande`),
 * que es quien manda: ésta es para que la muestra de esta pantalla enseñe lo
 * mismo que se va a ver. Si allá se cambia, aquí también.
 */
export const TAMANOS_ROTULO: { valor: TamanoRotulo; texto: string; escala: number }[] = [
  { valor: 'pequeno', texto: 'Pequeño', escala: 0.75 },
  { valor: 'normal',  texto: 'Normal',  escala: 1 },
  { valor: 'grande',  texto: 'Grande',  escala: 1.35 },
  { valor: 'enorme',  texto: 'Enorme',  escala: 1.75 },
];

/** El tamaño de los títulos de la tienda en computadora, del que sale la escala. */
export const ROTULO_BASE_PX = 28;

/**
 * Las letras, con cómo se escriben en CSS para la muestra.
 *
 * SÓLO ESTÁN LAS QUE LA TIENDA CARGA DE VERDAD —Poppins, Inter y Barlow
 * Condensed— más una con serifa que ya traen todos los equipos. Ofrecer
 * cualquier otra sería enseñar aquí una letra que el cliente no va a ver.
 */
export const FUENTES_ROTULO: {
  valor: FuenteRotulo; texto: string; pista: string; css: string; cursiva: boolean; versalitas: boolean;
}[] = [
  { valor: 'titulos',   texto: 'La de los títulos', pista: 'Poppins, la de toda la tienda',
    css: "'Poppins', sans-serif",            cursiva: false, versalitas: false },
  { valor: 'texto',     texto: 'La del texto',      pista: 'Inter, más sobria',
    css: "'Inter', sans-serif",              cursiva: false, versalitas: false },
  { valor: 'deportiva', texto: 'Deportiva',         pista: 'estrecha y en cursiva, como España Motos',
    css: "'Barlow Condensed', sans-serif",   cursiva: true,  versalitas: true },
  { valor: 'serif',     texto: 'Con serifa',        pista: 'clásica, para algo elegante',
    css: "Georgia, 'Times New Roman', serif", cursiva: false, versalitas: false },
];

/** El color con el que la tienda pinta sus títulos: lo de fábrica, y con lo que se compara. */
export const ROTULO_COLOR_TIENDA = '#1d1d1f';

/**
 * La paleta rápida, la misma que la del administrador de archivos
 * (`core/pages/administrador-archivos/save-file`).
 *
 * SE REPITE LA DE ALLÁ A PROPÓSITO: es la paleta que ya se usa en el CRM para
 * elegir un color, y quien la conoce de las carpetas la reconoce aquí. El
 * selector de al lado sigue admitiendo cualquier otro.
 */
export const COLORES_ROTULO = [
  '#F0B13B', '#348fe2', '#00acac', '#727cb6', '#ff5b57', '#f59c1a', '#A6A09B', '#2d353c',
];

/**
 * EL ALTO DE LA SECCIÓN: cuánto espacio ocupa en la portada.
 *
 * ES EL AIRE, NO EL CONTENIDO. Lo que crece o se encoge es el espacio que la
 * sección deja a su alrededor; las fotos, las tarjetas y los logos siguen
 * midiendo lo que miden. Estirarlos los sacaría aplastados o recortados.
 *
 * Como el tamaño del rótulo, es una escala y no una medida: la tienda da 56
 * px de aire en computadora y 40 en el teléfono, y cada uno se multiplica por
 * lo suyo. Un «120px» guardado aquí dejaría el teléfono con tres dedos de
 * nada entre dos secciones.
 */
export type AltoSeccion = 'compacta' | 'normal' | 'amplia' | 'extra';

/** El aire de una sección en computadora, del que sale la escala. */
export const AIRE_BASE_PX = 56;

/** LAS ESCALAS ESTÁN TAMBIÉN EN `_home.scss` de la tienda, que es quien manda. */
export const ALTOS_SECCION: { valor: AltoSeccion; texto: string; escala: number }[] = [
  { valor: 'compacta', texto: 'Compacta', escala: 0.5 },
  { valor: 'normal',   texto: 'Normal',   escala: 1 },
  { valor: 'amplia',   texto: 'Amplia',   escala: 1.5 },
  { valor: 'extra',    texto: 'Muy amplia', escala: 2 },
];

/**
 * De dónde saca sus datos la sección.
 *
 *   galeria     las imágenes de una galería, aquí mismo
 *   promocion   las tarjetas grandes: las categorías marcadas «En promoción»
 *   destacadas  los círculos de arriba: las marcadas «Destacada»
 *   marcas      «Nuestras marcas»: las encendidas para la tienda, en su orden
 *   pendiente   todavía no tiene fuente, y `falta` dice cuál
 *
 * Lo decide el servidor —la tienda, la portada pública y el CRM tienen que
 * estar de acuerdo en esto— y la pantalla sólo lo enseña.
 */
export interface FuenteSeccion {
  tipo: 'galeria' | 'promocion' | 'destacadas' | 'marcas' | 'pendiente';
  /** Con `galeria`: su clave. */
  galeria?: string;
  /** Con `promocion` y `destacadas`: la pantalla donde se llena. */
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
 * `rotulo` dice qué campos tiene sentido enseñar: ofrecer un título en una
 * sección que no lo pinta sería una casilla que se rellena y no sale en
 * ninguna parte. Por eso los dos banners no lo tienen: son imágenes de borde
 * a borde y encima de ellas no se lee nada.
 *
 * `rotuloDeFabrica` es lo que la tienda pone cuando el campo se deja vacío.
 * Importa decirlo: sin eso, «Categorías Destacadas» parece un texto que
 * aparece solo y nadie se atreve a borrarlo por miedo a que la sección se
 * quede sin nombre.
 */
export interface VistaSeccion {
  icono: string;
  descripcion: string;
  rotulo: 'ninguno' | 'titulo' | 'titulo_subtitulo';
  /** Con rótulo: lo que se lee si se deja vacío, o null si no se lee nada. */
  rotuloDeFabrica?: string | null;
  /** Sin rótulo: por qué esta sección no lleva título. */
  sinRotulo?: string;
}

export const VISTA_SECCIONES: Record<string, VistaSeccion> = {
  banner_principal: {
    icono: 'fa-panorama',
    descripcion: 'Las imágenes grandes que rotan arriba del todo.',
    rotulo: 'ninguno',
    sinRotulo: 'son imágenes de borde a borde y encima de ellas no se lee nada',
  },
  categorias_destacadas: {
    icono: 'fa-star',
    descripcion: 'Las categorías marcadas como destacadas, con su imagen.',
    rotulo: 'titulo',
    rotuloDeFabrica: 'Categorías Destacadas',
  },
  ofertas_flash: {
    icono: 'fa-bolt',
    descripcion: 'Productos en oferta con cuenta regresiva. La fecha «hasta» es la cuenta que ve el cliente.',
    rotulo: 'titulo_subtitulo',
    rotuloDeFabrica: null,
  },
  banner_simple: {
    icono: 'fa-image',
    descripcion: 'Una franja de imágenes entre dos secciones.',
    rotulo: 'ninguno',
    sinRotulo: 'es una franja de imágenes y encima de ella no se lee nada',
  },
  // La clave sigue siendo `mosaico` —es la que conoce la tienda y está en su
  // código—; el nombre con el que se habla de ella viene de la base.
  mosaico: {
    icono: 'fa-tags',
    descripcion: 'Las categorías marcadas «En promoción», en tarjetas grandes de cuatro en cuatro.',
    rotulo: 'titulo',
    rotuloDeFabrica: null,
  },
  grilla: {
    icono: 'fa-grip',
    descripcion: 'Productos de todas las marcas, uno al lado del otro.',
    rotulo: 'titulo',
    rotuloDeFabrica: null,
  },
  bloques: {
    icono: 'fa-layer-group',
    descripcion: 'Cada bloque enseña los productos destacados de una categoría y, al lado, sus promociones.',
    rotulo: 'ninguno',
    sinRotulo: 'el título lo lleva cada bloque, no la sección entera',
  },
  marcas: {
    icono: 'fa-copyright',
    descripcion: 'Los logos de las marcas, en el orden de Marcas de la tienda.',
    rotulo: 'titulo',
    rotuloDeFabrica: null,
  },
};

// ============================================================================
// LO QUE MIDE LA TIENDA
// ----------------------------------------------------------------------------
// Para dibujar la portada a escala en el modelado hace falta saber cuánto
// ocupa cada sección de verdad. No se puede calcular: el alto de un banner lo
// manda su imagen, el de los carteles su proporción y el de los círculos su
// CSS.
//
// ESTOS NÚMEROS ESTÁN MEDIDOS EN LA TIENDA (1/11/2026), abriéndola y midiendo
// cada bloque a 1482 px y a 390 px. Es lo que hace que el dibujo sirva para
// algo: un boceto con alturas inventadas enseñaría una portada que no existe.
//
// SON UNA FOTO, NO UNA FÓRMULA: si mañana el banner lleva otra imagen o las
// tarjetas cambian de proporción, estos números envejecen. Por eso el dibujo
// dice que es un boceto y enseña el aire —que sí es exacto, porque sale de
// una regla— aparte del contenido.
// ============================================================================

export type Dispositivo = 'computadora' | 'celular';

export const PAGINA: Record<Dispositivo, {
  ancho: number; aireBase: number; ventana: number; cabecera: number; texto: string; icono: string;
}> = {
  // ventana: lo que se ve sin bajar. cabecera: lo que ocupa el encabezado de
  // la tienda, que está siempre y empuja a la primera sección.
  computadora: { ancho: 1482, aireBase: 56, ventana: 848, cabecera: 211,
                 texto: 'Computadora', icono: 'fa-display' },
  celular:     { ancho: 390,  aireBase: 40, ventana: 844, cabecera: 198,
                 texto: 'Celular', icono: 'fa-mobile-screen' },
};

/**
 * El alto del CONTENIDO de cada sección, sin el aire, en píxeles de la tienda.
 *
 * `medido` dice si sale de la tienda de verdad o es una estimación: las tres
 * que todavía no se pintan —esperan al catálogo— no se pueden medir, y el
 * dibujo las marca para que nadie decida nada sobre un número inventado.
 */
export const ALTO_CONTENIDO: Record<string, { computadora: number; celular: number; medido: boolean }> = {
  banner_principal:      { computadora: 237, celular: 390, medido: true },
  categorias_destacadas: { computadora: 326, celular: 255, medido: true },
  ofertas_flash:         { computadora: 520, celular: 760, medido: false },
  banner_simple:         { computadora: 148, celular:  57, medido: true },
  mosaico:               { computadora: 548, celular: 429, medido: true },
  grilla:                { computadora: 860, celular: 1900, medido: false },
  bloques:               { computadora: 700, celular: 1400, medido: false },
  marcas:                { computadora: 183, celular: 141, medido: true },
};

export const CONTENIDO_DESCONOCIDO = { computadora: 300, celular: 300, medido: false };

/** Por si llega una clave que esta pantalla todavía no conoce. */
export const VISTA_POR_DEFECTO: VistaSeccion = {
  icono: 'fa-puzzle-piece',
  descripcion: 'Una sección de la tienda.',
  rotulo: 'ninguno',
  sinRotulo: 'esta pantalla todavía no sabe cómo se pinta',
};
