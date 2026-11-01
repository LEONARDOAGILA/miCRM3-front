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

/** El aviso de crédito directo, a la derecha de la barra roja del menú. */
export interface AvisoCredito {
  activo: boolean;
  texto?: string | null;
  boton_texto?: string | null;
  boton_enlace?: string | null;
  boton_nueva_pestana?: boolean;
}

export interface ConfigEncabezado {
  barra_superior: BarraSuperior;
  /** Las que van rotando dentro del buscador. Entre 1 y 5. */
  buscador_frases: string[];
  credito: AvisoCredito;
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
  orden: number;
  activo: boolean;
  hijos?: EnlaceEncabezadoModel[];
}

export interface EncabezadoModel {
  config: ConfigEncabezado;
  enlaces: EnlaceEncabezadoModel[];
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
