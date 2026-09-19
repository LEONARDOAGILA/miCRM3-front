/** Empleado (rh.empleados): lo que devuelven rh.fn_empleados_* */
export interface EmpleadoModel {
  id: number;
  numero_identificacion: string;
  /** CC (cédula), RUC, PAS (pasaporte) */
  tipo_identificacion: string;
  nombres: string;
  apellidos: string;
  /** "Nombres Apellidos" (lo arma el back) */
  nombre_completo?: string;
  email: string;
  email_personal?: string | null;
  telefono?: string | null;
  celular?: string | null;
  /** AAAA-MM-DD */
  fecha_nacimiento?: string | null;
  /** M, F, O */
  genero?: string | null;
  direccion?: string | null;
  cargo_id: number;
  cargo_nombre?: string;
  departamento_id: number;
  departamento_nombre?: string;
  jefe_id?: number | null;
  jefe_nombre?: string | null;
  /** AAAA-MM-DD */
  fecha_ingreso: string;
  fecha_salida?: string | null;
  /** ACTIVO, INACTIVO, VACACIONES, LICENCIA, RETIRADO */
  estado: string;
  /** INDEFINIDO, TEMPORAL, PRACTICAS, CONSULTORIA (check de la tabla) */
  tipo_contrato: string;
  salario?: number | null;
  /** Nombre del fichero de la foto (storage/img/empleados); null sin foto */
  foto?: string | null;
  activo: boolean;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
  updated_by?: string;
}

export const TIPOS_IDENTIFICACION = [
  { id: 'CC',  name: 'Cédula' },
  { id: 'RUC', name: 'RUC' },
  { id: 'PAS', name: 'Pasaporte' },
];

export const GENEROS = [
  { id: 'M', name: 'Masculino' },
  { id: 'F', name: 'Femenino' },
  { id: 'O', name: 'Otro' },
];

/** Valores admitidos por ck_empleados_tipo_contrato. */
export const TIPOS_CONTRATO = [
  { id: 'INDEFINIDO',  name: 'Indefinido' },
  { id: 'TEMPORAL',    name: 'Temporal' },
  { id: 'PRACTICAS',   name: 'Prácticas' },
  { id: 'CONSULTORIA', name: 'Consultoría' },
];

export const ESTADOS_EMPLEADO = [
  { id: 'ACTIVO',     name: 'Activo' },
  { id: 'VACACIONES', name: 'Vacaciones' },
  { id: 'LICENCIA',   name: 'Licencia' },
  { id: 'INACTIVO',   name: 'Inactivo' },
  { id: 'RETIRADO',   name: 'Retirado' },
];

/** Contacto de emergencia (rh.contactos_emergencia). id null = fila nueva aún sin guardar. */
export interface ContactoEmergencia {
  id?: number | null;
  empleado_id?: number;
  nombres: string;
  parentesco: string;
  telefono: string;
  telefono_alterno?: string | null;
  email?: string | null;
  prioridad: number;
  activo: boolean;
  created_at?: string;
  updated_at?: string;
}

export const PARENTESCOS = ['Cónyuge', 'Pareja', 'Madre', 'Padre', 'Hijo/a', 'Hermano/a', 'Abuelo/a', 'Tío/a', 'Primo/a', 'Amigo/a', 'Otro'];
