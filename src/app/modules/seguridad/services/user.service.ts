import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

interface ApiResponse {
    code: number;
    status: 'success' | 'error';
    message: string;
    icon: string;
    color: string;
    data: {
        avatar: string;
        full_path: string;
    };
}

@Injectable({
  providedIn: 'root',
})
export class UserService {

  private URL_SERVICIOS: string;  

  constructor(
    private _http: HttpClient,
  ){
    this.URL_SERVICIOS = environment.URL_SERVICIOS + 'auth/user/';
  }
  
  //   ******   LISTADO CON PAGINACIÓN   ******  //
allUsers(page: number = 1, perPage: number = 10, search: string = ''): Observable<any> {
  let params = new HttpParams()
    .set('page', page.toString())
    .set('per_page', perPage.toString());
  
  if (search) {
    params = params.set('search', search);
  }
  
  // Especifica el tipo de retorno con observe: 'response'
  return this._http.get<any>(this.URL_SERVICIOS + 'allUsers', { params, observe: 'response' });
}


  //   ******   LISTADO SIMPLE (SIN PAGINACIÓN)   ******  //
  listUsers(): Observable<any> { 
    return this._http.get(this.URL_SERVICIOS + 'listUsers'); 
  }
  
  //   ******   CREAR   ******  //
  addUser(data: any): Observable<any> { 
    return this._http.post(this.URL_SERVICIOS + "addUser", data); 
  }
  //   ******   CLONAR   ******  //
  clonUser(data: any): Observable<any> { 
    return this._http.post(this.URL_SERVICIOS + "addUser", data); 
  }

  

  //   ******   EDITAR   ******  //
  editUser(id: any, data: any): Observable<any> { 
    //console.log("user data:", data);
    return this._http.post(this.URL_SERVICIOS + "editUser/" + id, data); 
  }

  //   ******   EDITAR EN LÍNEA   ******  //
  editEnLineaUser(id: any, data: any): Observable<any> { 
    return this._http.post(this.URL_SERVICIOS + "editUser/" + id, data); 
  }

  //   ******   ELIMINAR   ******  //
  deleteUser(id: any): Observable<any> { 
    return this._http.delete(this.URL_SERVICIOS + "deleteUser/" + id); 
  }


  //   ******   BUSCAR POR ID   ******  //
  findByIdUser(id: any): Observable<any> { 
    return this._http.get(this.URL_SERVICIOS + 'findByIdUser/' + id); 
  }  

  //   ******   BUSCAR POR LOGIN   ******  //
  findByLoginUser(login: any): Observable<any> { 
    return this._http.get(this.URL_SERVICIOS + 'findByLoginUser/' + login); 
  }  

  //   ******   AGREGAR IMAGEN   ******  //
  addImagen(data: FormData): Observable<ApiResponse> { 
    return this._http.post<ApiResponse>(this.URL_SERVICIOS + 'addImagen', data);
  }

  //   ******   OBTENER URL DE IMAGEN   ******  //
  getUserImage(userId: number, avoidCache = false): string {
    let url = `${this.URL_SERVICIOS}getImagenUsuario/${userId}`;
    if (avoidCache) {
      url += `?t=${Date.now()}`;
    }
    return url;
  }

  //   ******   CAMBIAR CONTRASEÑA   ******  //
  changePassword(userId: number, data: { password: string, email: string, isreset: boolean }): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'changePassword/' + userId, data);
  }

  //   ******   CAMBIAR CONTRASEÑA POR LOGIN   ******  //
  changePasswordLogin(userId: number, data: { password: string, email: string, isreset: boolean }): Observable<any> {
    return this._http.post(this.URL_SERVICIOS + 'changePasswordLogin/' + userId, data);
  }






// Agrega estos métodos a tu UserService

// Solicitar recuperación - Genera código y lo envía al correo
solicitarRecuperacion(login_user: string): Observable<any> {
  return this._http.post(`${this.URL_SERVICIOS}solicitar-recuperacion`, { login_user });
}

// Verificar código de recuperación
verificarRecuperacion(login_user: string, codigo: string): Observable<any> {
  return this._http.post(`${this.URL_SERVICIOS}verificar-recuperacion`, { login_user, codigo });
}

// Cambiar contraseña después de verificar código
cambiarPasswordRecuperacion(data: { 
  login_user: string, 
  email: string, 
  password: string, 
  codigo: string 
}): Observable<any> {
  return this._http.post(`${this.URL_SERVICIOS}cambiar-password-recuperacion`, data);
}





}

