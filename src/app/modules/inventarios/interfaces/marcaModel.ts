/** Marca (inventarios.marcas): lo que devuelven inventarios.fn_marcas_* */
export interface MarcaModel {
  id: number;
  nombre: string;
  descripcion?: string | null;
  pais_origen?: string | null;
  sitio_web?: string | null;
  /** Nombre del fichero del logo en storage; la url la arma MarcaService.urlLogo() */
  logo?: string | null;
  activo: boolean;
  /** Productos de esta marca (informativo: con productos no se puede eliminar) */
  num_productos?: number;
  /** Cuándo se envió a la papelera; null mientras la marca está vigente */
  deleted_at?: string | null;
  /** Quién la envió a la papelera */
  deleted_by?: string | null;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
  updated_by?: string;
}

/**
 * Países que más salen en el combo del formulario.
 *
 * Es una ayuda para escribir rápido, no una lista cerrada: la columna admite
 * cualquier texto, así que el combo deja escribir uno que no esté.
 */
export const PAISES_MARCA: { id: string; name: string }[] = [
  { id: 'Ecuador',        name: 'Ecuador' },
  { id: 'Corea del Sur',  name: 'Corea del Sur' },
  { id: 'Japón',          name: 'Japón' },
  { id: 'China',          name: 'China' },
  { id: 'Estados Unidos', name: 'Estados Unidos' },
  { id: 'México',         name: 'México' },
  { id: 'Colombia',       name: 'Colombia' },
  { id: 'Brasil',         name: 'Brasil' },
  { id: 'Alemania',       name: 'Alemania' },
  { id: 'Italia',         name: 'Italia' },
  { id: 'España',         name: 'España' },
  { id: 'Taiwán',         name: 'Taiwán' },
];
