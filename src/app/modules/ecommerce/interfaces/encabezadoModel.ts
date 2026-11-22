/**
 * El encabezado de la tienda (ecommerce.encabezado + encabezado_enlaces).
 *
 * Dos cosas distintas bajo el mismo techo: la CONFIGURACIÓN —lo que se lee en
 * la franja superior— y el MENÚ, que es un árbol de dos niveles.
 */

/** Un botón de la franja superior, con su propia URL y su propia pinta. */
export interface BotonFranja {
  texto?: string | null;
  enlace?: string | null;
  /**
   * LO SUYO, cuando tiene que destacar sobre los de al lado («COMPRAR» junto
   * a «Ver condiciones»). Vacío —lo normal— y manda lo de la franja.
   *
   * `texto` es lo que DICE el botón y `letra` el color con el que se lee. El
   * TIPO de letra no está aquí: es de la franja entera.
   */
  fondo?: string | null;
  letra?: string | null;
  tamano?: number | null;
  /**
   * NO SE ESCRIBE A MANO: lo decide el servidor. Un enlace a otro sitio se
   * abre fuera; uno de la propia tienda, nunca.
   */
  nueva_pestana?: boolean;
}

/** La franja superior del todo, la del aviso de los meses sin intereses. */
export interface BarraSuperior {
  activo: boolean;
  texto?: string | null;
  /** La parte en rojo, que es la que se mira */
  destacado?: string | null;
  /**
   * CÓMO SE VE CADA PARTE DE ESTE MENSAJE (el primero), desde el
   * 21/11/2026.
   *
   * Las dos se leen seguidas en la misma línea, y lo que las distingue es
   * justamente esto: el destacado va más grande, en otro color y a veces
   * en otra letra. Antes el color era de la franja entera y el tamaño y la
   * letra, del mensaje entero, así que no se podía decir.
   *
   * Vacíos = los 14 px, la letra de la tienda y, en el destacado, el
   * brillo del color de la marca.
   */
  texto_color?: string | null;
  texto_tamano?: number | null;
  texto_fuente?: 'titulos' | 'texto' | 'deportiva' | 'serif' | null;
  destacado_color?: string | null;
  destacado_tamano?: number | null;
  destacado_fuente?: 'titulos' | 'texto' | 'deportiva' | 'serif' | null;
  /**
   * LOS BOTONES, en el orden en que se ven. Hasta el 20/11/2026 había uno
   * solo (`boton_texto` y `boton_enlace`); ahora se pueden crear hasta
   * cuatro, cada uno con su URL, y lo que había guardado ya viene convertido
   * en el primero de la lista.
   *
   * SIN TEXTO NO HAY BOTÓN: el servidor quita los que vayan en blanco, porque
   * una píldora vacía no se puede pulsar y deja un hueco en la franja.
   */
  botones?: BotonFranja[];
  /**
   * LOS MENSAJES QUE SE TURNAN, sin contar el primero.
   *
   * `texto` y `destacado` son el primero, el de siempre; éstos son los que
   * van detrás, hasta cuatro más. Vacío = una frase quieta.
   */
  mensajes?: MensajeFranja[];
  /** Qué se mueve. Vacío = nada, que es como ha ido la franja hasta hoy. */
  efectos?: EfectoFranja[];
}

/** Uno de los mensajes que se turnan en la franja. */
export interface MensajeFranja {
  texto?: string | null;
  destacado?: string | null;
  /** Los de cada parte, como en el primero. Vacíos = los de la tienda. */
  texto_color?: string | null;
  texto_tamano?: number | null;
  texto_fuente?: 'titulos' | 'texto' | 'deportiva' | 'serif' | null;
  destacado_color?: string | null;
  destacado_tamano?: number | null;
  destacado_fuente?: 'titulos' | 'texto' | 'deportiva' | 'serif' | null;
}

/** Las dos mitades de un mensaje de la franja. */
export type ParteDelMensaje = 'texto' | 'destacado';

/**
 * LOS EFECTOS DE LA FRANJA. Se eligen por separado y se suman.
 *
 *   destello  una luz cruza el destacado y las píldoras
 *   latido    las píldoras crecen y vuelven, muy poco, en bucle
 *   luz       un resplandor recorre el fondo de la franja
 */
export type EfectoFranja = 'destello' | 'latido' | 'luz';

/**
 * LA PINTA DE UN ENLACE DE LA BARRA, cuando tiene que destacar sobre los
 * de al lado («MOTOS» en campaña, al lado de «PRODUCTOS»).
 *
 * Vacíos —lo normal— y manda la letra del menú entero.
 *
 * EL FONDO ES DE ESTE ENLACE, no de la barra: la barra entera va del color
 * de la tienda, junto con los botones y el pie. Vacío, el enlace no lleva
 * píldora y se lee directamente sobre ella. El tono del mouse encima no se
 * guarda: lo calcula la tienda a partir de éste.
 */
export interface PintaEnlaceMenu {
  fondo?: string | null;
  color?: string | null;
  tamano?: number | null;
  fuente?: 'titulos' | 'texto' | 'deportiva' | 'serif' | null;
}

export interface ConfigEncabezado {
  barra_superior: BarraSuperior;
  /** Las que van rotando dentro del buscador. Entre 1 y 5. */
  buscador_frases: string[];

  /**
   * EL COLOR DE TODA LA TIENDA, no sólo del encabezado.
   *
   * La barra de categorías, los botones, los carteles de descuento, los
   * círculos de las categorías, las flechas y el pie leen la misma variable
   * (`--ae-rojo`), así que con un color cambia todo a la vez.
   *
   * Vive en el encabezado porque la tienda ya lo pide en su PRIMERA llamada,
   * antes de pintar nada: así el color llega con lo que ya se pedía.
   *
   * null = el rojo de siempre. Los tonos de hover y de fondo suave los calcula
   * la tienda a partir de éste (`tonosDelColor`), no se guardan.
   */
  color_principal?: string | null;

  /**
   * EL FONDO Y LA LETRA DE LOS DESPLEGABLES de la barra.
   *
   * Los tres se pintan igual —el de categorías, el de marcas y los que cuelgan
   * de un enlace del menú—, así que son dos colores y no seis.
   *
   * null = blanco con la letra de siempre. Los dos tonos de al lado —el del
   * mouse encima y el del borde— los calcula la tienda a partir del fondo, como
   * con el color principal: guardarlos sería acertar cuatro colores que van
   * juntos, y es donde se acaba viendo un hover que no pega.
   */
  desplegable_fondo?: string | null;
  desplegable_texto?: string | null;

  /**
   * EL FONDO Y LA LETRA DE LAS DOS FRANJAS DEL ENCABEZADO: la de arriba —la
   * del aviso— y la del logo con el buscador.
   *
   * Son dos franjas distintas porque se usan para cosas distintas: la de
   * arriba es una cinta de promoción, que es donde apetece un color fuerte, y
   * la del logo es la que tiene que dejar leer el buscador.
   *
   * null = los blancos de siempre. LA BARRA ROJA NO ESTÁ AQUÍ: ésa va del
   * color de la tienda, junto con los botones y el pie.
   */
  franja_fondo?: string | null;
  /**
   * Y CADA TROZO DE LA FRANJA: el destacado —la parte que se mira— y la
   * píldora del botón, con su fondo y su letra. null = lo de siempre, que
   * es el color de la tienda en el destacado y la píldora que la tienda
   * calcula del fondo de la franja.
   */
  franja_destacado?: string | null;
  franja_boton_fondo?: string | null;
  franja_boton_texto?: string | null;
  /**
   * El tamaño y la letra de la franja ENTERA, no de cada trozo: es una sola
   * línea, y tres tipografías en una línea no es una opción.
   *
   * EL TAMAÑO VA EN PÍXELES, entre 8 y 48, al revés que el rótulo de una
   * sección: la franja es una frase y se elige mirándola, así que se escribe
   * el número. Vacío = los 14 de siempre.
   */
  // El tamaño y la letra YA NO ESTÁN AQUÍ (20/11/2026): son de cada
  // mensaje —barra_superior.tamano/fuente y los de cada entrada de
  // barra_superior.mensajes—, porque es lo que cambia cuando se turnan.
  franja_texto?: string | null;
  encabezado_fondo?: string | null;
  encabezado_texto?: string | null;

  /**
   * LA LETRA DEL MENÚ: la barra de enlaces entera. El fondo no está, por lo
   * mismo que la barra roja no está en `franja_fondo`: va del color de la
   * tienda. null en los tres = blanco, 12 px y la letra de siempre.
   */
  /**
   * SI SE ENSEÑAN «CATEGORÍAS» Y «MARCAS» en la barra.
   *
   * No son enlaces del menú —los arma la tienda con el catálogo—, así que
   * hasta el 21/11/2026 salían siempre. Lo que no venga se entiende
   * encendido: se guarda lo que se apaga.
   */
  mostrar_menu_categorias?: boolean;
  mostrar_menu_marcas?: boolean;
  menu_texto?: string | null;
  menu_tamano?: number | null;
  menu_fuente?: 'titulos' | 'texto' | 'deportiva' | 'serif' | null;

  /**
   * Y LA DE CADA ENLACE, POR ID: { "12": { color, tamano, fuente } }.
   *
   * VIVE AQUÍ Y NO EN LA TABLA DE ENLACES a propósito. El menú es UNO SOLO
   * para todos los encabezados, pero la pinta es de la campaña: el de
   * Navidad pinta «REGALOS» de dorado y el de siempre lo deja como los
   * demás. En una columna del enlace, el dorado saldría también en enero.
   *
   * Casi siempre está vacío: lo normal es que todos vayan con la letra del
   * menú. Un enlace borrado deja su entrada, y eso se quiere: si vuelve de
   * la papelera, vuelve con su color.
   */
  menu_enlaces?: Record<string, PintaEnlaceMenu> | null;
}

/**
 * Un enlace del menú, EN UNA LISTA PLANA.
 *
 * Y no un árbol anidado, que es como venía hasta el 15/11/2026: lo pinta una
 * rejilla, y una rejilla come filas. El servidor manda el árbol aplanado y en
 * su orden —cada rama detrás de su padre—, y cada fila trae su `nivel` para la
 * sangría y cuántos `hijos` cuelgan de ella para el +/-.
 *
 * EL ÁRBOL NO TIENE LÍMITE DE NIVELES. Lo tuvo —dos— mientras el menú de la
 * tienda se pintaba a dos niveles escritos a mano; ahora la tienda lo recorre
 * como venga.
 */
export interface EnlaceEncabezadoModel {
  id: number;
  /** De quién cuelga. null = es uno de los principales de la barra. */
  padre_id: number | null;
  /** Y su texto, para decir de dónde cuelga sin ir a buscarlo. */
  padre?: string | null;
  /** 0 los principales, 1 sus hijos, 2 los nietos… Lo calcula el servidor. */
  nivel: number;
  /** CUÁNTOS cuelgan de él, no quiénes: es lo que necesita la rejilla. */
  hijos: number;
  texto: string;
  /**
   * LA DIRECCIÓN ES OPCIONAL EN CUALQUIER NIVEL: un enlace con hijos no la
   * usa —sólo abre su desplegable— y uno que todavía no tiene hijos puede
   * estar a medio montar. Sin hijos y sin dirección no se enseña en la
   * tienda, y la rejilla lo dice en su fila.
   */
  enlace?: string | null;
  icono?: string | null;
  nueva_pestana: boolean;
  /**
   * Sale como píldora blanca al final de la barra roja, separado del resto.
   *
   * SÓLO LOS PRINCIPALES SIN DESPLEGABLE: dentro de un desplegable no hay
   * barra donde ponerla, y uno que abre desplegable no lleva a ningún sitio.
   * Lo apaga la base en los dos casos, no haga falta acordarse aquí.
   *
   * Sustituye al «aviso de crédito» que el encabezado tenía aparte hasta el
   * 13/11/2026: era un segundo sitio para poner un enlace con otro nombre.
   */
  destacado: boolean;
  orden: number;
  activo: boolean;
  /**
   * ENTRE QUÉ FECHAS SALE EN EL MENÚ.
   *
   * El menú es UNO SOLO para todos los encabezados —añadir una categoría se
   * hace una vez—, y lo que se programa es cada enlace: «Regalos» aparece el
   * 1 de diciembre y se va solo el 6 de enero. Vacías, sale siempre.
   */
  desde?: string | null;
  hasta?: string | null;
  /** Resuelto por el servidor, como en las secciones de la portada. */
  estado: EstadoProgramado;
}

/**
 * EL ESTADO DE UN ENCABEZADO O DE UN ENLACE, resuelto por el servidor.
 *
 * Se calcula allá y no aquí a propósito: comparar fechas con el reloj del
 * navegador es la manera de que la pantalla diga «se ve» cuando el servidor
 * cree que no.
 */
export type EstadoProgramado = 'visible' | 'oculto' | 'programado' | 'terminado';

/**
 * UNO DE LOS ENCABEZADOS, en la lista de arriba.
 *
 * Hay los que hagan falta, cada uno con sus fechas: uno de Navidad, uno de
 * Black Friday y el de siempre debajo. Se encienden y se apagan solos.
 *
 * EL PREDETERMINADO (`principal`) es el que se ve cuando no hay ninguna
 * campaña en fecha. Hay exactamente uno, no se apaga ni se borra, y sólo se
 * cambia por otro.
 *
 * `manda` es otra cosa: es el que se está viendo AHORA MISMO en la tienda.
 * Con cuatro campañas, esa pregunta no se contesta mirando fechas.
 */
export interface EncabezadoDeLaLista {
  id: number;
  nombre: string;
  /** 'YYYY-MM-DDTHH:mm', como lo quiere un <input type="datetime-local">. */
  desde?: string | null;
  hasta?: string | null;
  activo: boolean;
  principal: boolean;
  manda: boolean;
  estado: EstadoProgramado;
  logo?: string | null;
  logo_url?: string | null;
  updated_at?: string | null;
  updated_by?: string | null;
}

export interface EncabezadoModel {
  /** El que se está editando. */
  id: number;
  nombre: string;
  desde?: string | null;
  hasta?: string | null;
  activo: boolean;
  principal: boolean;
  manda: boolean;
  /** TODOS, para poder cambiar de uno a otro sin otra llamada. */
  encabezados: EncabezadoDeLaLista[];
  config: ConfigEncabezado;
  enlaces: EnlaceEncabezadoModel[];
  /**
   * EL LOGO DE LA TIENDA: el fichero, tal como está guardado.
   *
   * VIVE EN SU COLUMNA Y NO EN EL `config`, y por eso se sube por su propia
   * puerta: guardar la pantalla reescribe el `config` entero, así que un logo
   * metido ahí se borraría al cambiar cualquier otra cosa.
   *
   * null = el que la tienda trae dibujado.
   */
  logo?: string | null;
  /** Y su dirección, que la arma el servidor: es la que se enseña. */
  logo_url?: string | null;
  updated_at?: string;
  updated_by?: string | null;
}

/** Una fila de la papelera de enlaces del encabezado. */
export interface FilaPapeleraEnlace {
  id: number;
  texto: string;
  /** La dirección, para reconocerlo */
  detalle?: string | null;
  /** De qué principal colgaba */
  padre_id?: number | null;
  deleted_at: string;
  deleted_by?: string | null;
}

/**
 * LOS ICONOS DEL MENÚ NO SE ESCRIBEN NI SE ELIGEN DE UNA LISTA DE SIETE.
 *
 * Aquí había una lista cerrada con siete nombres, que era lo que ofrecía el
 * desplegable de este CRUD. Desde el 15/11/2026 se eligen con
 * `app-campoIconoTienda` —el mismo selector que usa el pie—, que los enseña
 * DIBUJADOS y ofrece los 83 que la tienda lleva dentro.
 *
 * La lista sigue siendo cerrada, y tiene que serlo: la tienda los tiene
 * dibujados uno a uno (no carga Font Awesome), así que un nombre que ella no
 * conozca dejaría el enlace sin icono y sin aviso. Lo que cambió es que ya no
 * hay dos listas que mantener de acuerdo: la del selector es la única.
 */
