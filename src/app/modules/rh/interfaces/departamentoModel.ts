/** Departamento (rh.departamentos): lo que devuelven rh.fn_departamentos_* */
export interface DepartamentoModel {
  id: number;
  nombre: string;
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
