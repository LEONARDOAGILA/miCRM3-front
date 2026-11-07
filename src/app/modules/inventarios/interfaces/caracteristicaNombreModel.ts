/**
 * Un nombre del diccionario de características
 * (inventarios.caracteristicas_nombres): lo que devuelven las
 * inventarios.fn_caracteristicas_nombres_*
 *
 * El nombre se escribe UNA vez aquí y las categorías lo escogen de un combo.
 * Antes se escribía a mano en cada categoría: 98 filas para 19 categorías pero
 * sólo 64 nombres distintos, y cada reescritura era una oportunidad de poner
 * «pezo» en vez de «peso».
 */
export interface CaracteristicaNombreModel {
  id: number;
  nombre: string;
  /** La unidad, SEPARADA del nombre: «Potencia» + «W», no «Potencia (W)» */
  unidad?: string | null;
  /** Lo que se enseña en el combo y en la ficha del producto: «Potencia (W)» */
  etiqueta?: string;
  tipo: TipoCaracteristica;
  /** El tipo en palabras, para la rejilla: «Número», «Sí / No»… */
  tipo_nombre?: string;
  descripcion?: string | null;
  activo: boolean;
  /** En cuántas categorías se está usando (informativo: en uso no se puede eliminar) */
  num_categorias?: number;
  /** Cuántos productos lo tienen relleno */
  num_productos?: number;
  /** Cuándo se envió a la papelera; null mientras está vigente */
  deleted_at?: string | null;
  deleted_by?: string | null;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
  updated_by?: string;
}

/** Los cuatro tipos que acepta la base (ck_caracteristicas_nombres_tipo). */
export type TipoCaracteristica = 'TEXTO' | 'NUMERO' | 'SI_NO' | 'LISTA';

/**
 * Los tipos para el combo del formulario.
 *
 * El tipo es la otra mitad del problema de la reportería: con el nombre
 * arreglado pero el valor en texto libre, logística sigue recibiendo «15»,
 * «15 kg» y «15,5». Con el tipo, la ficha del producto puede pintar el campo
 * que toca y validar.
 */
export const TIPOS_CARACTERISTICA: { id: TipoCaracteristica; name: string; ayuda: string }[] = [
  { id: 'TEXTO',  name: 'Texto',   ayuda: 'Cualquier texto: «Core i7», «No Frost»' },
  { id: 'NUMERO', name: 'Número',  ayuda: 'Sólo cifras, para poder sumar y comparar. Es el que lleva unidad' },
  { id: 'SI_NO',  name: 'Sí / No', ayuda: 'Lo tiene o no lo tiene' },
  { id: 'LISTA',  name: 'Lista',   ayuda: 'Se escoge de unas opciones, y las opciones las define cada categoría' },
];

/**
 * Unidades que más salen, para escribir rápido.
 *
 * Es una ayuda, no una lista cerrada: la columna admite cualquier texto de
 * hasta 20 caracteres, así que el combo deja escribir una que no esté.
 */
export const UNIDADES_CARACTERISTICA: { id: string; name: string }[] = [
  { id: 'W',        name: 'W — vatios' },
  { id: 'kW',       name: 'kW — kilovatios' },
  { id: 'V',        name: 'V — voltios' },
  { id: 'Hz',       name: 'Hz — hercios' },
  { id: 'kg',       name: 'kg — kilogramos' },
  { id: 'g',        name: 'g — gramos' },
  { id: 'litros',   name: 'litros' },
  { id: 'cm',       name: 'cm — centímetros' },
  { id: 'mm',       name: 'mm — milímetros' },
  { id: 'm²',       name: 'm² — metros cuadrados' },
  { id: 'm³',       name: 'm³ — metros cúbicos' },
  { id: 'pulgadas', name: 'pulgadas' },
  { id: 'BTU',      name: 'BTU' },
  { id: 'RPM',      name: 'RPM — revoluciones por minuto' },
  { id: 'mAh',      name: 'mAh — miliamperios hora' },
  { id: 'GB',       name: 'GB — gigabytes' },
  { id: 'TB',       name: 'TB — terabytes' },
  { id: 'MP',       name: 'MP — megapíxeles' },
  { id: 'DPI',      name: 'DPI — puntos por pulgada' },
  { id: 'ppm',      name: 'ppm — páginas por minuto' },
  { id: '°C',       name: '°C — grados centígrados' },
  { id: 'dB',       name: 'dB — decibelios' },
  { id: 'SEER',     name: 'SEER — eficiencia energética' },
  { id: '%',        name: '% — porcentaje' },
];
