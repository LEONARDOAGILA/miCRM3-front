import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { ToastrService } from 'ngx-toastr';
//import axios from 'axios';

import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import Swal from 'sweetalert2';



import { environment } from '../../../../environments/environment';
import { Router } from '@angular/router';


@Injectable({
  providedIn: "root",
})

export class SeguridadService {

  private URL_SERVICIOS: string;  
  public token: any;
  public user: any;

  constructor(
      private http: HttpClient, 
      private router: Router,
      private toastr: ToastrService,
      private modal: NgbModal,
  ){
      this.URL_SERVICIOS =  environment.URL_SERVICIOS + "auth/";
      this.token = "";
      this.user = null;
      this.loadLocalStorage();
  }

  loginUser(data: any) {
      return this.http.post(this.URL_SERVICIOS + "login", data).pipe(
        map((auth: any) => { 
          return auth.access_token ? this.storeLocalStorageToken(auth):  of(undefined); }),
        catchError((error) => { return of(error); })
      );
  }

  postlogout() {
    return this.http.post(this.URL_SERVICIOS + 'logout', {})
    }

  eliminaStorage(){
    this.token = "";
    this.user = "";
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("accesos");
    Swal.close();  // Cerrar SweetAlert2 si está abierto
    this.modal.dismissAll();


    this.router.navigate(['seguridad/login']);       
  }

  async logout(){
    try {
        if(this.isLoggin()){
            let res: any = await firstValueFrom(this.postlogout());
            if (res?.status === 'success') {
                this.eliminaStorage();
              }else{
                this.eliminaStorage();          
                console.error('Error: Respuesta sin status success', res);
              }          
        }
        return false;
    } catch (error: any) {
        this.eliminaStorage();
        console.error('Error en la petición', error.message);
        return false;
    }
  }
    
  isLoggin(){  
      return localStorage.getItem("token") !== null;  
  }
  
  getUserLogin(){   
      return JSON.parse( localStorage.getItem("user"));    
  }

  registro(data: any){
      return this.http.post( this.URL_SERVICIOS + "register" , data );  
  }

  isexpired (){
    if (this.token != null) {
        let expirado = (JSON.parse(atob(this.token.split('.')[1]))).exp;
        if(Math.floor((new Date).getTime()/1000) >= expirado){ 
            this.toastr.error("Error",'La sesion ha Expirado.',{closeButton: true});
            this.logout();
            return true; 
        }
    }
    return false;
  }

  loadLocalStorage() {
      if (localStorage.getItem("token") && localStorage.getItem("user")) {
        this.token = localStorage.getItem("token");
        this.user = JSON.parse(localStorage.getItem("user") ?? "");
      } else {
        this.token = null;
        this.user = null;
      }
  }

  storeLocalStorageToken(auth: any) {
    if (auth.access_token) {
      localStorage.setItem("token", auth.access_token);
      localStorage.setItem("user", JSON.stringify(auth.user));
      localStorage.setItem("accesos", JSON.stringify(auth.accesos));
      this.token = auth.access_token;
      this.user = auth.user;
      return true;
    } else {
      return false;
    }
  }











  // login2(data: any) {
  //   try {
  //     const datos = axios
  //       .post(this.URL_SERVICIOS + "/login",data )
  //       .then((response) => {
  //         return response.data;
  //       })
  //       .catch((error) => {
  //         return error;
  //       });
  //     return datos;
  //   } catch (error) {
  //     return error;
  //   }
  // }







}
