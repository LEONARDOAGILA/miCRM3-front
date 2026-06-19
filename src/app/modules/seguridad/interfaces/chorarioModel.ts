  import { DhorarioModel } from "./dhorarioModel";

  export interface ChorarioModel {
    id?: number;
    nombre: string;
    activo?: boolean;
    created_at?: string;
    updated_at?: string;
    created_by?: string;
    updated_by?: string;
    dhorario?: DhorarioModel[];
}

