/**
 * El encabezado de la tienda (ecommerce.encabezado + encabezado_enlaces).
 *
 * Dos cosas distintas bajo el mismo techo: la CONFIGURACIÓN —lo que se lee en
 * la franja de arriba— y el MENÚ, que es un árbol de dos niveles.
 */

/** La franja de arriba del todo, la del aviso de los meses sin intereses. */
export interface BarraSuperior {
  activo: boolean;
  texto?: string | null;
  /** La parte en rojo, que es la que se mira */
  destacado?: string | null;
  boton_texto?: string | null;
  boton_enlace?: string | null;
  /**
   * NO SE ESCRIBE A MANO: lo decide el servidor. Un enlace a otro sitio se
   * abre fuera; uno de la propia tienda, nunca.
   */
  boton_nueva_pestana?: boolean;
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
  franja_texto?: string | null;
  encabezado_fondo?: string | null;
  encabezado_texto?: string | null;
}

/** Un enlace del menú. Los principales traen sus `hijos`; los hijos, no. */
export interface EnlaceEncabezadoModel {
  id: number;
  texto: string;
  /**
   * Un principal CON desplegables no lleva dirección: en la tienda sólo
   * abre el desplegable. Un hijo siempre la necesita.
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
  hijos?: EnlaceEncabezadoModel[];
}

export interface EncabezadoModel {
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
 * Los iconos que la tienda sabe pintar al lado de un enlace del menú.
 *
 * ES UNA LISTA CERRADA y tiene que serlo: la tienda los tiene dibujados uno a
 * uno (no es Font Awesome), así que escribir aquí un nombre que ella no
 * conozca deja el enlace sin icono y sin aviso.
 */
export const ICONOS_MENU: { id: string; name: string }[] = [
  { id: '',         name: 'Sin icono' },
  { id: 'oferta',   name: 'Oferta' },
  { id: 'camion',   name: 'Camión' },
  { id: 'tienda',   name: 'Tienda' },
  { id: 'moto',     name: 'Moto' },
  { id: 'etiqueta', name: 'Etiqueta' },
  { id: 'estrella', name: 'Estrella' },
  { id: 'regalo',   name: 'Regalo' },
];
