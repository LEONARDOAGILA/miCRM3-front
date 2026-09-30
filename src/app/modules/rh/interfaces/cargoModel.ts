/** Cargo (rh.cargos): lo que devuelven rh.fn_cargos_* */
export interface CargoModel {
  id: number;
  nombre: string;
  descripcion?: string | null;
  /** Ejecutivo, Jefatura, Senior, Junior, Analista… (texto acotado por el combo del formulario) */
  nivel?: string | null;
  salario_base?: number | null;
  activo: boolean;
  /** Empleados que tienen este cargo (informativo: con empleados no se puede eliminar) */
  num_empleados?: number;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
  updated_by?: string;
}

/** Niveles jerárquicos ofrecidos en el combo del formulario (columna rh.cargos.nivel). */
export const NIVELES_CARGO: { id: string; name: string }[] = [
  { id: 'Ejecutivo',   name: 'Ejecutivo' },
  { id: 'Gerencial',   name: 'Gerencial' },
  { id: 'Jefatura',    name: 'Jefatura' },
  { id: 'Supervisión', name: 'Supervisión' },
  { id: 'Senior',      name: 'Senior' },
  { id: 'Semi Senior', name: 'Semi Senior' },
  { id: 'Junior',      name: 'Junior' },
  { id: 'Analista',    name: 'Analista' },
  { id: 'Asistente',   name: 'Asistente' },
  { id: 'Operativo',   name: 'Operativo' },
  { id: 'Practicante', name: 'Practicante' },
];
