import { PerfilModel } from "../../seguridad/interfaces/perfilModel"; 


export interface UserModel {
  id: number;
  name: string; 
  surname: string;
  email: string;
  phone: string;
  login_user: string;
  password: string;
  avatar: string;
  type_user: number;
  isactive: boolean;
  isreset: boolean;
  islogin:  boolean;
  perfil_id?: number;
  perfil_nombre?: string;
  chorario_id?: number;
  chorario_nombre?: string;
  path?: string;
  created_at?: Date;
  updated_at?: Date;
  email_verified_at?: Date;
  user_verified_at?: Date;  
  updated_by?: string;
  create_by?: string; 
  perfil?: PerfilModel; // El ? indica que es opcional
}
