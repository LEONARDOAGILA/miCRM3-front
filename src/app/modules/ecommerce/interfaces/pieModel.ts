/**
 * El pie de la tienda (ecommerce.pie + pie_columnas + pie_enlaces).
 *
 * Se parece al encabezado pero no es lo mismo: allí el segundo nivel es un
 * desplegable que se abre al pasar por encima y un enlace principal puede no
 * llevar dirección. Aquí la COLUMNA es un título, nunca un enlace, y todos
 * los enlaces de dentro necesitan dirección.
 */

/**
 * Un enlace de la sección de redes del pie.
 *
 * YA NO ES «UNA RED DE UNA LISTA CERRADA». Antes la fila era {tipo, enlace,
 * activo} y el `tipo` hacía de todo —era la red, el nombre y el dibujo—, así
 * que sólo cabían las siete que la tienda sabía pintar. Ahora el dibujo se
 * elige aparte y caben las que haga falta: Threads, Telegram, un teléfono.
 */
export interface RedSocial {
  /** El nombre del dibujo en la tienda: 'facebook', 'telefono', 'ubicacion'. */
  icono?: string | null;
  /** Lo que se lee en voz alta sobre un enlace que por pantalla es un dibujo. */
  nombre?: string | null;
  enlace?: string | null;
  activo: boolean;
}

/**
 * Cómo se pinta el título de las redes.
 *
 * LOS TRES PUEDEN IR EN NULO, y eso no es «sin estilo»: es «el que la tienda
 * le dé». Lo que no se toca sigue acompañando al diseño cuando el diseño
 * cambie, en vez de quedarse clavado en el valor de hoy.
 */
export interface EstiloTituloRedes {
  /** En píxeles, entre 10 y 60. */
  tamano?: number | null;
  /** '#rrggbb'. */
  color?: string | null;
  /** Una de las TRES letras que la tienda carga, no un nombre cualquiera. */
  fuente?: FuenteTienda | null;
}

export type FuenteTienda = 'titulos' | 'texto' | 'deportiva';

/**
 * En qué franja del pie sale una columna.
 *
 * «arriba» son las de siempre; «abajo» las de la franja de debajo, donde
 * hasta el 08/11/2026 había dos galerías de medios de pago escritas en el
 * código de la tienda. Es la misma columna: lo único que cambia es dónde sale.
 */
export type ZonaPie = 'arriba' | 'abajo';

/**
 * La línea de abajo del todo: «Todos los derechos reservados…».
 *
 * {anio} lo cambia la tienda por el año que sea, así que no hay que volver
 * cada enero a corregir el pie. El enlace es opcional y sale a la derecha.
 */
export interface BarraInferiorPie {
  texto?: string | null;
  enlace_texto?: string | null;
  enlace?: string | null;
  /** No se escribe a mano: lo decide el servidor por la dirección */
  nueva_pestana?: boolean;
}

export interface ConfigPie {
  /**
   * El título de la sección, que la tienda pinta ENCIMA de los iconos, en el
   * sitio donde hasta el 07/11/2026 iba el logotipo.
   */
  titulo_redes?: string | null;
  titulo_redes_estilo?: EstiloTituloRedes | null;
  redes: RedSocial[];
  barra_inferior?: BarraInferiorPie | null;
}

/**
 * Las letras entre las que se puede elegir.
 *
 * SON LAS TRES QUE LA TIENDA CARGA (ver su index.html) y no una lista de
 * nombres: poner aquí «Georgia» sería pedirle al navegador del cliente una
 * letra que nadie le ha mandado, y saldría la que tuviera a mano.
 *
 * El CRM no las trae de serie; las pide al abrir la pestaña para que la
 * muestra enseñe la letra de verdad (ver cargarLetrasDeLaTienda).
 */
export const FUENTES_TIENDA: { id: FuenteTienda; nombre: string; css: string }[] = [
  { id: 'titulos',   nombre: 'Títulos',   css: "'Poppins', sans-serif" },
  { id: 'texto',     nombre: 'Texto',     css: "'Inter', sans-serif" },
  { id: 'deportiva', nombre: 'Deportiva', css: "'Barlow Condensed', sans-serif" },
];

/** De dónde las pide el CRM. La misma línea que tiene la tienda en su index.html. */
export const URL_LETRAS_TIENDA =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700'
  + '&family=Poppins:wght@500;600;700;800'
  + '&family=Barlow+Condensed:ital,wght@1,600;1,700&display=swap';

export interface EnlacePieModel {
  id: number;
  texto: string;
  /** Siempre la tiene: en el pie no hay enlaces que sólo desplieguen */
  enlace: string;
  icono?: string | null;
  /** No se escribe a mano: lo decide el servidor por la dirección */
  nueva_pestana: boolean;
  orden: number;
  activo: boolean;
  /**
   * Lleva a una página informativa que no se puede ver: apagada, en la
   * papelera o que ya no existe.
   *
   * Lo calcula el servidor al leer; no se guarda ni se manda. El enlace
   * conserva su propio , pero la tienda no lo enseña mientras esto
   * sea true: un enlace a una página oculta llevaría a un error.
   */
  pagina_oculta?: boolean;
}

/**
 * LA IMAGEN DE UNA COLUMNA, la que se pone en vez de la lista de enlaces.
 *
 * Con fichero, la tienda enseña la imagen y NO los enlaces; sin él, la lista
 * de siempre. Los enlaces no se borran: quitar la imagen los devuelve, así que
 * probar no cuesta nada.
 *
 * Llega siempre, también vacía: el texto y el enlace se pueden escribir antes
 * de subir el fichero y se guardan igual.
 */
export interface ImagenColumnaPie {
  /** El nombre del fichero en la base; null si no hay ninguna. */
  archivo: string | null;
  /** La dirección para verla, armada por el servidor. */
  url?: string | null;
  /** Qué se ve en ella, para quien no ve la pantalla. */
  alt: string | null;
  /** A dónde lleva al pincharla; null = no lleva a ningún sitio. */
  enlace: string | null;
  /** No se escribe a mano: lo decide el servidor por la dirección. */
  nueva_pestana: boolean;
}

export interface ColumnaPieModel {
  /** En qué franja sale. Las que ya existían son todas de «arriba». */
  zona?: ZonaPie;
  id: number;
  titulo: string;
  orden: number;
  activo: boolean;
  imagen: ImagenColumnaPie;
  enlaces: EnlacePieModel[];
}

export interface PieModel {
  config: ConfigPie;
  columnas: ColumnaPieModel[];
  updated_at?: string;
  updated_by?: string | null;
}

/** Una fila de la papelera del pie: columnas y enlaces en el mismo cesto. */
export interface FilaPapeleraPie {
  tipo: 'columna' | 'enlace';
  id: number;
  texto: string;
  /** La dirección, en los enlaces */
  detalle?: string | null;
  /** De qué columna venía */
  columna_id?: number | null;
  deleted_at: string;
  deleted_by?: string | null;
}

/**
 * Lo que se propone al añadir una fila nueva.
 *
 * NO ES UNA LISTA CERRADA —de ahí la palabra «sugeridas»—: son las siete de
 * toda la vida puestas a mano de un clic, porque son las que se ponen el
 * noventa por ciento de las veces. Cualquier otra se añade en blanco y se le
 * elige el dibujo entre los que la tienda tiene.
 */
export const REDES_SUGERIDAS: { icono: string; nombre: string }[] = [
  { icono: 'facebook',  nombre: 'Facebook' },
  { icono: 'x',         nombre: 'X' },
  { icono: 'instagram', nombre: 'Instagram' },
  { icono: 'linkedin',  nombre: 'LinkedIn' },
  { icono: 'tiktok',    nombre: 'TikTok' },
  { icono: 'youtube',   nombre: 'YouTube' },
  { icono: 'whatsapp',  nombre: 'WhatsApp' },
];
