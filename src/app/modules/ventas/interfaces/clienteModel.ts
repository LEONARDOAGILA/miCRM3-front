/** Cliente (ventas.clientes): lo que devuelven ventas.fn_clientes_* */
export interface ClienteModel {
  id: number;
  /** PERSONA o EMPRESA: decide si manda la razón social o los nombres */
  tipo_cliente: string;
  numero_identificacion: string;
  /** CC (cédula), RUC, PAS (pasaporte) */
  tipo_identificacion: string;

  razon_social?: string | null;
  nombre_comercial?: string | null;
  nombres?: string | null;
  apellidos?: string | null;
  /** Razón social o «Nombres Apellidos»; lo calcula la base */
  nombre_completo?: string;

  email?: string | null;
  email_alterno?: string | null;
  telefono?: string | null;
  celular?: string | null;
  sitio_web?: string | null;
  /** AAAA-MM-DD */
  fecha_nacimiento?: string | null;
  /** M, F, O */
  genero?: string | null;
  direccion?: string | null;

  /** La dirección tal como vino de Google Maps (ver fn_clientes_ubicacion) */
  provincia?: string | null;
  canton?: string | null;
  parroquia?: string | null;
  calle_principal?: string | null;
  calle_secundaria?: string | null;
  numeracion?: string | null;
  /** La dirección completa que devuelve Google; «direccion» es la escrita */
  ubicacion?: string | null;
  codigo_postal?: string | null;
  /** «-2.170900, -79.922400» */
  coordenadas?: string | null;
  link_coordenadas?: string | null;
  /** Nombres de archivo en storage/app/public/img/clientes */
  url_foto_mapa?: string | null;
  url_foto_casa?: string | null;

  /** Empleado que lo atiende (rh.empleados) */
  vendedor_id?: number | null;
  vendedor_nombre?: string | null;
  /** EFECTIVO, TRANSFERENCIA, TARJETA, CHEQUE, CREDITO */
  forma_pago: string;
  limite_credito?: number | null;
  dias_credito?: number | null;
  /** % de descuento habitual (0 a 100) */
  descuento?: number | null;
  /** ACTIVO, INACTIVO, SUSPENDIDO, MOROSO */
  estado: string;
  observaciones?: string | null;

  /** Nombre del fichero de la foto (storage/img/clientes); null sin foto */
  foto?: string | null;
  activo: boolean;
  num_contactos?: number;

  /** Papelera de reciclaje: con fecha, el cliente está eliminado (borrado lógico) */
  deleted_at?: string | null;
  deleted_by?: string | null;

  created_at?: string;
  updated_at?: string;
  created_by?: string;
  updated_by?: string;

  // ---- Alias que espera la demo de facturas (modules/demo/pages/facturas) ----
  // Los devuelve fn_clientes_listar para no tener que tocar esa pantalla.
  identificacion?: string;
  nombre?: string;
  apellido?: string;
}

export const TIPOS_CLIENTE = [
  { id: 'PERSONA', name: 'Persona natural' },
  { id: 'EMPRESA', name: 'Empresa' },
];

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

/** Valores admitidos por ck_clientes_forma_pago. */
export const FORMAS_PAGO = [
  { id: 'EFECTIVO',      name: 'Efectivo' },
  { id: 'TRANSFERENCIA', name: 'Transferencia' },
  { id: 'TARJETA',       name: 'Tarjeta' },
  { id: 'CHEQUE',        name: 'Cheque' },
  { id: 'CREDITO',       name: 'Crédito' },
];

/** Valores admitidos por ck_clientes_estado. */
export const ESTADOS_CLIENTE = [
  { id: 'ACTIVO',     name: 'Activo' },
  { id: 'INACTIVO',   name: 'Inactivo' },
  { id: 'SUSPENDIDO', name: 'Suspendido' },
  { id: 'MOROSO',     name: 'Moroso' },
];

/** Persona de contacto del cliente (ventas.contactos_clientes). id null = fila nueva aún sin guardar. */
export interface ContactoCliente {
  id?: number | null;
  cliente_id?: number;
  nombres: string;
  cargo?: string | null;
  telefono: string;
  telefono_alterno?: string | null;
  email?: string | null;
  prioridad: number;
  activo: boolean;
  created_at?: string;
  updated_at?: string;
}

/** Sugerencias para la columna Cargo de la grilla de contactos. */
export const CARGOS_CONTACTO = [
  'Gerente', 'Compras', 'Pagos', 'Bodega', 'Contabilidad', 'Ventas', 'Técnico', 'Asistente', 'Otro',
];
