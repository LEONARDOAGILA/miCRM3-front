import { AccesoModel } from "../../seguridad/interfaces/accesoModel";

export class PerfilModel {
  id?: number;
  nombre?: string;
  activo?: boolean;
  inactividad?: number;
  created_at?: Date;
  updated_at?: Date;
  created_by?: string;
  updated_by?: string;
  acceso?: AccesoModel[];
}
