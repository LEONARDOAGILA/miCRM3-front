/** Departamento (rh.departamentos): lo que devuelven rh.fn_departamentos_* */
export interface DepartamentoModel {
  id: number;
  nombre: string;

  // ---------- El árbol ----------
  /** De quién cuelga; null en los de primer nivel */
  padre_id?: number | null;
  padre_nombre?: string | null;
  /** Posición entre sus hermanos */
  orden?: number;
  /** Profundidad 0..3; es lo que la rejilla usa para la sangría */
  nivel?: number;
  /** El camino completo: «Gerencia > Ventas». Lo que se enseña en los combos */
  ruta?: string;
  /** Subdepartamentos directos (con subdepartamentos no se puede eliminar) */
  num_hijos?: number;
  /**
   * Empleados de TODA la rama: los suyos más los de sus subdepartamentos.
   *
   * Lo calcula la pantalla del listado, no el servidor: así una rama
   * contraída sigue diciendo cuánta gente cuelga de ella. Para la regla de
   * «con empleados no se puede eliminar» vale `num_empleados`.
   */
  empleados_rama?: number;

  // ---------- La papelera ----------
  /** NULL mientras el departamento está vigente */
  deleted_at?: string | null;
  deleted_by?: string | null;
  /** Lo manda la papelera: su padre sigue eliminado, así que no puede volver */
  padre_en_papelera?: boolean;
  /** Código corto (se guarda en mayúsculas, único) */
  codigo?: string | null;
  descripcion?: string | null;
  /** Empleado responsable (rh.empleados.id) */
  empleado_id?: number | null;
  /** Nombre completo del responsable (sólo lectura, lo arma el back) */
  responsable?: string | null;
  activo: boolean;
  /** Empleados del departamento (informativo: con empleados no se puede eliminar) */
  num_empleados?: number;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
  updated_by?: string;
}

/** Opción del combo "Responsable" (rh.fn_departamentos_responsables). */
export interface ResponsableOpcion {
  id: number;
  nombre: string;
  cargo?: string | null;
  departamento_id?: number | null;
}
