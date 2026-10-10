/**
 * Clase de usuario (seguridad.tipos_usuarios): del sistema, de la página web,
 * freelance, temporal… Es lo que devuelve `seguridad.fn_tipos_usuarios_listar`
 * por `auth/user/tiposUsuario`.
 *
 * NO DA PERMISOS. Lo que un usuario puede hacer lo deciden su grupo
 * (`es_administrador`, la jerarquía) y su perfil (los accesos por menú y el
 * alcance sobre los datos del cliente). Este campo sólo dice qué clase de
 * usuario es, para poder filtrar y contar.
 *
 * Hasta octubre de 2026 era `users.type_user` con cuatro números escritos a
 * mano en cinco pantallas, y decidía los permisos del gestor de archivos.
 */
export interface TipoUsuarioModel {
  id: number;
  /** SISTEMA, WEB, FREELANCE, TEMPORAL… en mayúsculas */
  codigo: string;
  nombre: string;
  descripcion?: string | null;
  /** Clase de Font Awesome */
  icono?: string | null;
  /** Clase de color del tema: bg-primary, bg-info… */
  color?: string | null;
  orden?: number;
  /** Lo apaga un administrador: deja de ofrecerse y sus usuarios no entran */
  activo?: boolean;

  /**
   * Vigencia del tipo, en YYYY-MM-DD. NULL por los dos lados es «sin límite»:
   * sin inicio vale desde siempre y sin fin no caduca. El día de `fecha_fin`
   * cuenta entero.
   *
   * Mientras el tipo no esté vigente, sus usuarios NO entran al sistema (lo
   * comprueba el middleware en cada petición).
   */
  fecha_inicio?: string | null;
  fecha_fin?: string | null;
  /** Si está vigente HOY: activo y dentro de sus fechas. Lo calcula la base */
  vigente?: boolean;

  /** Cuántos usuarios vivos lo tienen (sólo lo trae el listado) */
  en_uso?: number;
}

/**
 * El tipo tal como viaja dentro de un usuario (`type_user_tipo`), que es el
 * mismo menos el id y el contador: el id ya está en `type_user`.
 */
export type TipoUsuarioDeUsuario = Pick<TipoUsuarioModel, 'codigo' | 'nombre' | 'icono' | 'color' | 'activo'>;

/** Color por omisión cuando el tipo no trae uno o el usuario no tiene tipo. */
export const COLOR_TIPO_POR_OMISION = 'bg-secondary';

/**
 * La etiqueta del tipo, lista para una celda de ag-Grid.
 *
 * Se le pasa el `type_user_tipo` del usuario. Si no viene —un listado viejo
 * que no lo traiga— devuelve el número tal cual, que es mejor que una celda
 * vacía y deja ver de dónde sale el hueco.
 */
export function etiquetaTipoUsuario(tipo: TipoUsuarioDeUsuario | null | undefined, id?: number | null): string {
  if (!tipo?.nombre) { return id != null ? String(id) : ''; }

  const color = tipo.color || COLOR_TIPO_POR_OMISION;
  const icono = tipo.icono ? `<i class="${tipo.icono} me-1"></i>` : '';
  // Un tipo retirado se sigue enseñando, pero se avisa de que ya no se asigna
  const retirado = tipo.activo === false ? ' title="Tipo retirado"' : '';

  return `<span class="badge ${color} fs-10px"${retirado}>${icono}${tipo.nombre}</span>`;
}
