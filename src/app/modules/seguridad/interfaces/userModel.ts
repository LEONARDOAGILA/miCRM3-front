import { PerfilModel } from "../../seguridad/interfaces/perfilModel";
import { TipoUsuarioDeUsuario } from "./tipoUsuarioModel";


export interface UserModel {
  id: number;
  name: string; 
  surname: string;
  email: string;
  phone: string;
  login_user: string;
  password: string;
  avatar: string;
  /** Clase de usuario (seguridad.tipos_usuarios). No da permisos */
  type_user: number;
  /** El tipo ya resuelto, para enseñarlo sin repetir la lista en cada pantalla */
  type_user_tipo?: TipoUsuarioDeUsuario | null;
  isactive: boolean;
  isreset: boolean;
  islogin:  boolean;
  perfil_id?: number;
  perfil_nombre?: string;
  chorario_id?: number;
  chorario_nombre?: string;
  /** Grupo (seguridad.grupos) al que pertenece; null = sin grupo */
  grupo_id?: number | null;
  grupo_nombre?: string | null;
  /** En la papelera de reciclaje (borrado lógico); null = vigente */
  deleted_at?: string | null;
  deleted_by?: string | null;
  path?: string;
  created_at?: Date;
  updated_at?: Date;
  email_verified_at?: Date;
  user_verified_at?: Date;  
  updated_by?: string;
  create_by?: string; 
  perfil?: PerfilModel; // El ? indica que es opcional
}
