/**
 * Grupo de usuarios (seguridad.grupos): árbol al estilo de las unidades
 * organizativas de Active Directory. Cada usuario pertenece a un grupo y el
 * grupo lleva los valores por defecto que heredan sus usuarios.
 * Es lo que devuelven seguridad.fn_grupos_*.
 */
export interface GrupoModel {
  id: number;
  padre_id: number | null;
  padre_nombre?: string | null;
  nombre: string;
  descripcion?: string | null;
  orden: number;
  /** Perfil por defecto de los usuarios del grupo */
  perfil_id?: number | null;
  perfil_nombre?: string | null;
  /** Horario por defecto de los usuarios del grupo */
  chorario_id?: number | null;
  chorario_nombre?: string | null;
  /** Los usuarios del grupo administran (equivale a type_user 1/2) */
  es_administrador: boolean;
  /** SISTEMA (type_user 3) o WEB (type_user 4) */
  tipo_acceso: 'SISTEMA' | 'WEB';
  activo: boolean;
  /** 0 = raíz */
  nivel?: number;
  /** "Empresa / Sistemas / Soporte" */
  ruta?: string;
  /** Usuarios directamente en el grupo */
  num_usuarios?: number;
  /** Usuarios del grupo y de todos sus subgrupos */
  num_usuarios_total?: number;
  num_hijos?: number;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
  updated_by?: string;
}

export const TIPOS_ACCESO = [
  { id: 'SISTEMA', name: 'Usuario del sistema' },
  { id: 'WEB',     name: 'Usuario web' },
];

/**
 * type_user que corresponde a los valores del grupo (mientras type_user
 * siga existiendo en users): administrador → 2, sistema → 3, web → 4.
 */
export function typeUserDeGrupo(g: Pick<GrupoModel, 'es_administrador' | 'tipo_acceso'>): number {
  if (g.es_administrador) { return 2; }
  return g.tipo_acceso === 'WEB' ? 4 : 3;
}
