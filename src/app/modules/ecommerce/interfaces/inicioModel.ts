/**
 * Una SECCIÓN de la portada de la tienda.
 *
 * La portada no es una página: es esta lista, que se enciende, se apaga y se
 * reordena.
 *
 * HAY DE DOS CLASES. Las CINCO DE FÁBRICA existen porque la tienda sabe
 * pintarlas —banner, destacadas, marcas— y no se crean ni se borran. Las demás
 * son SECCIONES DE PRODUCTOS que alguien armó en «Productos por sección»: se
 * crean y se borran allí, y aquí aparecen como una fila más, con su orden, su
 * rótulo, su alto y sus fechas como las otras. Por eso en esta pantalla no hay
 * «nueva» ni «borrar»: el sitio de crearlas es el otro.
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

  /**
   * A qué escaparate de «Productos por sección» apunta, si es uno.
   *
   * Las cinco de siempre traen null: existen porque la tienda sabe pintarlas y
   * no se crean ni se borran. Las demás son una sección de productos que
   * alguien armó, y aquí aparecen como una fila más de la portada.
   */
  producto_seccion_id: number | null;

  /**
   * A qué galería de imágenes apunta, si es un banner.
   *
   * UNA SECCIÓN CON GALERÍA ES UN BANNER. Se crean y se borran desde esta
   * misma pantalla —son imágenes con su sitio en la portada, nada más—, y por
   * eso son las únicas que sí se pueden crear aquí.
   */
  galeria_id: number | null;

  /** Lo mismo, dicho por el servidor para no repetir la regla aquí. */
  es_banner: boolean;

  /**
   * CÓMO SE ENSEÑA ESE BANNER: rotando (una imagen a la vez, la de siempre) o
   * en carteles (todas a la vez, como las categorías en promoción pero sin
   * texto ni botón).
   *
   * Llega siempre resuelto, nunca null: que la pantalla tenga que acordarse
   * de que «vacío es rotativo» es la manera de que un día se olvide. Sólo lo
   * miran las secciones con galería.
   */
  banner_vista: VistaBanner;

  /**
   * Si es una de las de fábrica.
   *
   * Lo decide el servidor y no la pantalla: «de fábrica» significa «sin
   * sección de productos detrás», y esa regla es suya.
   */
  fija: boolean;

  /** El fondo de los cuatro botones de la tarjeta. Sólo lo usan las de productos. */
  botones: BotonesColores;

  /**
   * El fondo y el borde de la tarjeta, y el cartel del descuento de su
   * esquina. Sólo lo usan las de productos, como los botones.
   */
  tarjeta: TarjetaColores;

  /** Cómo se enseña la sección y, si lleva, la imagen de al lado. */
  imagen: ImagenDeSeccion;
}

/** De qué manera se enseña una sección de productos. */
export type LadoImagen = 'sola' | 'izquierda' | 'derecha';

/** Y de qué manera se enseña un banner. */
export type VistaBanner = 'rotativo' | 'carteles';

export interface VistaDeBanner {
  valor: VistaBanner;
  texto: string;
  ayuda: string;
}

export const VISTAS_BANNER: VistaDeBanner[] = [
  { valor: 'rotativo', texto: 'Una que rota',
    ayuda: 'Una imagen a la vez, de borde a borde, cambiando sola. Es como se ve hoy' },
  { valor: 'carteles', texto: 'Todas en carteles',
    ayuda: 'Todas a la vez, en carteles verticales como las categorías en promoción. Sin texto ni botón: sólo la imagen, y cada una lleva a su enlace' },
];

/**
 * LA IMAGEN DE AL LADO de una sección de productos.
 *
 * SIN FICHERO, `lado` SIEMPRE LLEGA 'sola', y eso lo decide el servidor: con
 * «a la izquierda» y sin imagen, la tienda dejaría una columna vacía al lado
 * de los productos. Pero el resto —el texto, el enlace, incluso el lado
 * elegido— se guarda igual, así que subir la imagen después lo recupera todo.
 *
 * `archivo` es el nombre del fichero en el servidor y `url` la dirección para
 * verlo; la arma el servidor, porque en la base va sólo el nombre.
 */
export interface ImagenDeSeccion {
  /** Lo que va a hacer la tienda. Sin fichero, siempre 'sola'. */
  lado: LadoImagen;
  /** Lo que se eligió, que puede no ser lo mismo mientras falte la imagen. */
  elegido: LadoImagen;
  archivo: string | null;
  url: string | null;
  alt: string | null;
  enlace: string | null;
  nueva_pestana: boolean;
}

/** Las tres maneras de enseñar una sección de productos, para la pantalla. */
export interface Disposicion {
  valor: LadoImagen;
  texto: string;
  ayuda: string;
}

export const DISPOSICIONES: Disposicion[] = [
  { valor: 'sola', texto: 'Sólo productos',
    ayuda: 'La fila de tarjetas ocupa todo el ancho, como hasta ahora' },
  { valor: 'izquierda', texto: 'Imagen a la izquierda',
    ayuda: 'La imagen a la izquierda y las tarjetas a su derecha' },
  { valor: 'derecha', texto: 'Imagen a la derecha',
    ayuda: 'Las tarjetas a la izquierda y la imagen al final' },
];

/**
 * LOS COLORES DE UN BOTÓN de la tarjeta de un producto.
 *
 * LOS DOS SON OPCIONALES Y NO SIGNIFICAN LO MISMO. `fondo` en null es «el de
 * la tienda»; `texto` en null es «el que se lea encima del fondo», que lo
 * calcula la tienda con `colorDeTextoSobre`.
 *
 * Por eso se puede elegir sólo la letra —el corazón rojo sobre el círculo
 * blanco de siempre— sin tener que elegir también un fondo.
 */
export interface BotonColores {
  fondo: string | null;
  texto: string | null;
}

export interface BotonesColores {
  favorito: BotonColores;
  carrito: BotonColores;
  whatsapp: BotonColores;
  tarjeta: BotonColores;
}

/**
 * LOS COLORES DE LA TARJETA ENTERA: su fondo, su borde y el cartel del
 * descuento de la esquina.
 *
 * OJO CON EL NOMBRE: `botones.tarjeta` es el BOTÓN de comprar con tarjeta de
 * crédito, y esto es LA TARJETA DEL PRODUCTO. Son dos cosas distintas en dos
 * niveles distintos; el choque viene de antes y en esta casa «la tarjeta»
 * siempre ha sido la del producto.
 *
 * NO HAY COLOR DE LETRA PARA LA TARJETA, y es a propósito: con un fondo
 * oscuro, el nombre del producto y los precios —que son gris oscuro—
 * desaparecerían, así que la tienda calcula la letra que se lea encima, igual
 * que ya hace con los botones. Nadie tiene que elegir dos colores para
 * cambiar uno.
 */
export interface TarjetaColores {
  fondo: string | null;
  borde: string | null;
  descuento: BotonColores;
  etiqueta: EtiquetaTarjeta;
}

/**
 * LA ETIQUETA DE LA TARJETA: la pastilla de encima del descuento.
 *
 * Se configura igual que el cartel de descuento —fondo y letra— PERO LLEVA
 * ADEMÁS SUS PALABRAS: el texto del descuento lo calcula la tienda de los dos
 * precios, y el de la etiqueta no sale de ningún dato, hay que escribirlo.
 *
 * SIN `rotulo` NO HAY ETIQUETA, y eso lo decide el servidor: un color elegido
 * y un texto que se borró después no pueden dejar una pastilla vacía en la
 * esquina de cada tarjeta.
 */
export interface EtiquetaTarjeta extends BotonColores {
  /** Lo que se lee dentro. Null = no hay etiqueta. */
  rotulo: string | null;
}

/**
 * UNA COSA DE LA TARJETA QUE SE PUEDE PINTAR: un botón, el cartel del
 * descuento, o la tarjeta entera.
 *
 * Todas se configuran igual —misma muestra, misma paleta, mismo «Quitar»—,
 * así que la pantalla recorre listas de esto y no tiene un juego de métodos
 * por cada una.
 */
export interface ColorDeTarjeta {
  /** El campo del fondo que viaja al servidor. */
  campo: string;
  /** El de su letra, o null cuando esa cosa no tiene letra que elegir. */
  campoTexto: string | null;
  /**
   * El campo de SUS PALABRAS, cuando las tiene.
   *
   * Sólo la etiqueta: lo demás que se pinta en la tarjeta o no lleva texto
   * —el fondo, el borde— o lo saca de un dato —el descuento, de los precios—.
   * Va aquí y no como un caso aparte en la plantilla para que la lista siga
   * describiendo del todo lo que hay que enseñar.
   */
  campoRotulo?: string;
  texto: string;
  /** El icono de la muestra, o null cuando la muestra no es un botón. */
  icono: string | null;
  /**
   * El que usa la tienda hoy, para enseñarlo cuando no se eligió ninguno.
   *
   * ESTÁ TAMBIÉN EN LA TIENDA (_base.scss y _seccion-productos.scss). Son dos
   * sitios porque son dos proyectos; si allí cambia el rojo de la casa, aquí
   * hay que cambiarlo también o la muestra mentirá.
   */
  deLaTienda: string;
  /** Y la letra que usa hoy, para lo mismo. */
  textoDeLaTienda: string;
  ayuda: string;
}

/** Un botón de la tarjeta, tal como se configura y como lo pinta la tienda. */
export interface BotonTarjeta extends ColorDeTarjeta {
  campo: 'boton_favorito_color' | 'boton_carrito_color' | 'boton_whatsapp_color' | 'boton_tarjeta_color';
  campoTexto: 'boton_favorito_texto' | 'boton_carrito_texto' | 'boton_whatsapp_texto' | 'boton_tarjeta_texto';
  /** La clave dentro de `botones`. */
  clave: keyof BotonesColores;
  icono: string;
}

export const BOTONES_TARJETA: BotonTarjeta[] = [
  { campo: 'boton_favorito_color', campoTexto: 'boton_favorito_texto', clave: 'favorito',
    texto: 'Favorito', icono: 'fa-heart',
    deLaTienda: '#ffffff', textoDeLaTienda: '#df1122',
    ayuda: 'El círculo del corazón, arriba de la foto. La «letra» es el corazón; marcado se rellena y sin marcar va hueco' },
  { campo: 'boton_carrito_color', campoTexto: 'boton_carrito_texto', clave: 'carrito',
    texto: 'Agregar', icono: 'fa-cart-shopping',
    deLaTienda: '#df1122', textoDeLaTienda: '#ffffff',
    ayuda: 'El botón ancho de agregar al carrito' },
  { campo: 'boton_whatsapp_color', campoTexto: 'boton_whatsapp_texto', clave: 'whatsapp',
    texto: 'WhatsApp', icono: 'fa-whatsapp',
    deLaTienda: '#118645', textoDeLaTienda: '#ffffff',
    ayuda: 'El de comprar por WhatsApp' },
  { campo: 'boton_tarjeta_color', campoTexto: 'boton_tarjeta_texto', clave: 'tarjeta',
    texto: 'Tarjeta', icono: 'fa-credit-card',
    deLaTienda: '#ffffff', textoDeLaTienda: '#df1122',
    ayuda: 'El de comprar con tarjeta. Sin fondo propio va de contorno, y el borde toma este color' },
];

/**
 * LO DEMÁS QUE SE PINTA EN LA TARJETA: su fondo, su borde y el cartel del
 * descuento.
 *
 * Van en una lista aparte de los botones porque no son botones y no se
 * enseñan igual: los cuatro botones llevan cada uno su muestra, y estos tres
 * se ven todos juntos en una tarjeta de mentira, que es donde se nota si el
 * fondo y el borde pegan.
 *
 * EL FONDO Y EL BORDE NO TIENEN LETRA (`campoTexto` en null): la de la
 * tarjeta la calcula la tienda para que se lea encima del fondo.
 */
export const COLORES_TARJETA: ColorDeTarjeta[] = [
  { campo: 'tarjeta_fondo_color', campoTexto: null, texto: 'Fondo de la tarjeta', icono: null,
    deLaTienda: '#ffffff', textoDeLaTienda: '#374151',
    ayuda: 'El fondo de toda la tarjeta. Con uno oscuro, la tienda aclara sola el nombre y los precios' },
  { campo: 'tarjeta_borde_color', campoTexto: null, texto: 'Borde de la tarjeta', icono: null,
    deLaTienda: '#ececec', textoDeLaTienda: '#374151',
    ayuda: 'La raya de alrededor. Sin elegir ninguno desaparece al pasar el mouse; elegido, se queda' },
  { campo: 'descuento_color', campoTexto: 'descuento_texto', texto: 'Cartel de descuento', icono: 'fa-tag',
    deLaTienda: '#df1122', textoDeLaTienda: '#ffffff',
    ayuda: 'El «-12%» de arriba a la izquierda. Sólo sale en los productos que tengan descuento' },
  { campo: 'etiqueta_color', campoTexto: 'etiqueta_texto', campoRotulo: 'etiqueta',
    texto: 'Etiqueta', icono: 'fa-bookmark',
    deLaTienda: '#1d1d1f', textoDeLaTienda: '#ffffff',
    ayuda: 'La pastilla de encima del descuento. Sale en todas las tarjetas de la sección; sin texto no sale ninguna' },
];

/**
 * El color de letra que se lee encima de ese fondo: blanco o casi negro.
 *
 * LA TIENDA HACE ESTO MISMO (shared/utils/boton-color.util.ts) y tiene que dar
 * el mismo resultado: aquí es la muestra que se mira al elegir y allí es lo
 * que ve el cliente. Si las dos no coinciden, se elige un color mirando una
 * muestra que no es la verdad.
 *
 * Se compara el contraste contra blanco y contra negro y gana el mayor, que es
 * lo que dice la WCAG; no un umbral de luminancia, que falla justo en los
 * colores medios donde más falta hace acertar.
 */
export function colorDeTextoSobre(fondo: string): string {
  const n = parseInt((fondo || '').replace('#', ''), 16);
  if (isNaN(n)) { return '#ffffff'; }

  const canal = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const lum = 0.2126 * canal(((n >> 16) & 255) / 255)
            + 0.7152 * canal(((n >> 8) & 255) / 255)
            + 0.0722 * canal((n & 255) / 255);

  const conBlanco = 1.05 / (lum + 0.05);
  const conNegro  = (lum + 0.05) / 0.05;
  return conBlanco >= conNegro ? '#ffffff' : '#1d1d1f';
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
  tipo: 'galeria' | 'promocion' | 'destacadas' | 'marcas' | 'productos' | 'pendiente';
  /** Con `galeria`: su clave. */
  galeria?: string;
  /** Con `promocion`, `destacadas` y `productos`: la pantalla donde se llena. */
  pantalla?: string;
  /** Con `productos`: cuál escaparate, para abrirlo ya elegido. */
  seccion_id?: number;
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
  marcas: {
    icono: 'fa-copyright',
    descripcion: 'Los logos de las marcas, en el orden de Marcas de la tienda.',
    rotulo: 'titulo',
    rotuloDeFabrica: null,
  },
  // Los MISMOS carteles que «Categorías en promoción», con marcas. Son dos
  // secciones distintas y una marca puede estar en ésta y en «Nuestras
  // marcas» a la vez.
  marcas_promocion: {
    icono: 'fa-tags',
    descripcion: 'Las marcas marcadas «En promoción», en tarjetas grandes de cuatro en cuatro.',
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
 * `medido` dice si sale de la tienda de verdad o es una estimación. Las de
 * aquí están todas medidas; las que no lo están son las de productos, cuyo
 * alto depende de lo que lleven (CONTENIDO_SECCION_PRODUCTOS), y el dibujo las
 * marca para que nadie decida nada sobre un número inventado.
 */
export const ALTO_CONTENIDO: Record<string, { computadora: number; celular: number; medido: boolean }> = {
  banner_principal:      { computadora: 237, celular: 390, medido: true },
  categorias_destacadas: { computadora: 326, celular: 255, medido: true },
  banner_simple:         { computadora: 148, celular:  57, medido: true },
  mosaico:               { computadora: 548, celular: 429, medido: true },
  marcas:                { computadora: 183, celular: 141, medido: true },
  // La misma pieza que el mosaico, con otros datos: ocupa lo mismo
  marcas_promocion:      { computadora: 548, celular: 429, medido: true },
};

export const CONTENIDO_DESCONOCIDO = { computadora: 300, celular: 300, medido: false };

/** Por si llega una clave que esta pantalla todavía no conoce. */
export const VISTA_POR_DEFECTO: VistaSeccion = {
  icono: 'fa-puzzle-piece',
  descripcion: 'Una sección de la tienda.',
  rotulo: 'ninguno',
  sinRotulo: 'esta pantalla todavía no sabe cómo se pinta',
};

/**
 * La cara de una sección de productos.
 *
 * No está en VISTA_SECCIONES y no puede estarlo: su clave la fabrica el
 * servidor al crearla (`seccion_7`), así que no hay una lista fija donde
 * apuntarla. Se arma con el nombre que traiga.
 *
 * LLEVA RÓTULO Y LÍNEA DE ABAJO, y de fábrica no dicen nada: lo que se lee
 * encima lo escribe quien arma el escaparate. Dejar el nombre interno como
 * rótulo de fábrica sacaría «pro1» en la tienda.
 *
 * La línea de abajo porque es lo que distingue un escaparate de una lista:
 * «Recomendados para ti» y, más pequeño, «Las mejores ofertas para tu hogar».
 */
export function vistaDeProductos(nombre: string): VistaSeccion {
  return {
    icono: 'fa-basket-shopping',
    descripcion: `Los productos de «${nombre}», en el orden que tengan ahí.`,
    rotulo: 'titulo_subtitulo',
    rotuloDeFabrica: null,
  };
}

/**
 * La cara de un banner.
 *
 * Tampoco están en el catálogo de claves: la de un banner es `banner_35`, que
 * la fabrica el servidor al crearlo. Todos se ven igual —son lo mismo—, así
 * que no hay una entrada por banner sino esta función.
 */
export function vistaDeBanner(): VistaSeccion {
  return {
    icono: 'fa-image',
    descripcion: 'Sus imágenes, rotando una a una o todas a la vez en carteles. Cada imagen con sus fechas.',
    rotulo: 'ninguno',
    sinRotulo: 'es una franja de imágenes y encima de ella no se lee nada',
  };
}

/**
 * Lo que ocupa una sección de productos en la portada.
 *
 * ESTIMADO, y seguirá estándolo: estas secciones SÍ se pintan, pero su alto
 * depende de cuántos productos lleve cada una y de si tiene imagen al lado,
 * así que no hay un número que medir una vez y guardar. Por eso se marca como
 * no medida y el modelado lo dice.
 */
export const CONTENIDO_SECCION_PRODUCTOS = { computadora: 860, celular: 1900, medido: false };
