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
  /**
   * Los usuarios del grupo administran: es la señal con la que se decide todo
   * —clientes, agenda, tablero, visibilidad de datos y el gestor de archivos—.
   * No confundir con users.type_user, que es la clase de usuario.
   */
  es_administrador: boolean;
  /** Por dónde entran los usuarios del grupo */
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

/*
 * Aquí había typeUserDeGrupo(), que traducía el grupo a un users.type_user
 * (administrador → 2, sistema → 3, web → 4). Se quitó en octubre de 2026: las
 * dos cosas dejaron de significar lo mismo.
 *
 * El grupo dice qué PUEDE HACER (es_administrador, la jerarquía) y type_user
 * pasó a decir QUÉ CLASE DE USUARIO ES —del sistema, de la web, freelance,
 * temporal—, que vive en seguridad.tipos_usuarios y se elige a mano: un
 * freelance puede estar en cualquier grupo. Ni el front ni
 * seguridad.fn_grupos_modificar lo derivan ya del grupo.
 */
