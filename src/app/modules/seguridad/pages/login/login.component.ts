import { Component, OnDestroy, OnInit, ViewChild } from "@angular/core";
import { FormBuilder,  FormGroup } from "@angular/forms";
import { Router } from "@angular/router";
import { firstValueFrom, Subject, takeUntil} from "rxjs";
import { Validators } from "ngx-editor";
import { ToastrService } from 'ngx-toastr';
import { NgbModal } from "@ng-bootstrap/ng-bootstrap";


import { AppSettings } from "../../../../service/app-settings.service";
import { Notificaciones } from "../../../../core/shared/notificaciones";
import { InactivityService } from '../../../seguridad/services/InactivityService';

import { SeguridadService } from "../../services/seguridad.service";
import { UserService } from "../../services/user.service";
import { PerfilModel } from "../../interfaces/perfilModel";
import { UserModel } from "../../interfaces/userModel";

import { AppComponent } from "../../../../app.component";
import { ChangePasswordLoginComponent } from '../login/change-password-login/change-password-login.component';
import { OlvideContrasenaComponent } from './olvide-contrasena/olvide-contrasena.component';


@Component({
  selector: "app-login",
  templateUrl: "./login.component.html",
  styleUrls: ["./login.component.css"],
  standalone: false,
})


export class LoginComponent implements OnInit, OnDestroy{

  @ViewChild(AppComponent) rootComponent: AppComponent;

  private notificaciones: Notificaciones = new Notificaciones();
  private unsubscribe$ = new Subject<void>();
  public loginForm: FormGroup;
  public isLoading: boolean;

  public perfil: PerfilModel;
  public user: UserModel;

  

  public isreset:boolean = false;
  public vuserid: number=0;
  public vloginUserValue: String = '';
  public vpassword : String = '';
  public vemail : String = '';

  /** Alterna entre <input type="password"> y type="text" */
  public mostrarPassword = false;

  /** Marca el intento de envío para no señalar en rojo un formulario intacto */
  private enviado = false;

    
  constructor(
      private fb: FormBuilder,
      private route: Router,
      private appSettings: AppSettings,
      private _toastr: ToastrService,
      private modalService: NgbModal, 

      private _seguridadService: SeguridadService,
      public  _userService: UserService,
      private _inactivityService: InactivityService,
  ){
      this.appSettings.appEmpty = true;
      this.appSettings.appThemePanelNone = true;
      
      this.isLoading = false;
    }

    ngOnInit(): void {
      this.initializeForm();
    }
    ngAfterViewInit(): void {
      
      //  ECHO_PUSHER("").channel('trades')
      //       .listen('NewTrade', (e: any) => {
      //           console.log(e);
      //           this._toastr.info(e.trade, 'Mensaje de sistema por websockets', {timeOut: 9000,closeButton: true } );
      //       })
      
    }

    ngOnDestroy(): void {          
      this.unsubscribe$.next();
      this.unsubscribe$.complete();
    }

    initializeForm(): void {
      this.loginForm = this.fb.group({
          login_user:     ["", Validators.required],
          password:       ["", Validators.required],
      });
    }    







    /** ¿Hay que pintar el campo en rojo y mostrar su mensaje? */
    campoInvalido(campo: string): boolean {
      const control = this.loginForm?.get(campo);
      if (!control) { return false; }
      return control.invalid && (control.touched || this.enviado);
    }


  
  async submit() {
      this.enviado = true;

      if (this.loginForm.valid) {
          try {
              // Antes se ponía a true e inmediatamente a false en la línea
              // siguiente, así que el spinner no llegaba a verse nunca.
              this.isLoading = true;
              let response: any = await firstValueFrom(this._seguridadService.loginUser(this.loginForm.value));
              this.vloginUserValue = this.loginForm.get('login_user')?.value;
              this.vpassword = this.loginForm.get('password')?.value;
              
              if (response==true) { 
                this.user = this._seguridadService.getUserLogin();
                //console.log('Usuario Logueado: ', this.user); 


                //console.log('Tiempo de Inactividad: ',this.user);
                
                if(this.user.isreset){
                  this.isreset = true;
                  this.vemail = this.user.email;
                  this.vuserid = this.user.id;

                  const modalRef = this.modalService.open(ChangePasswordLoginComponent, { centered: true, size: 'md',  backdrop: 'static',  keyboard: true });
                  modalRef.componentInstance.registro_selected = this.user;

                  modalRef.componentInstance.userId = this.vuserid;
                  modalRef.componentInstance.login_user = this.vloginUserValue
                  modalRef.componentInstance.email = this.vemail;
                  modalRef.componentInstance.view_reset = false;
                  
                  // Manejar cuando se guarda (cambia la contraseña)
                  modalRef.componentInstance.passwordChanged.pipe(takeUntil(this.unsubscribe$)).subscribe({
                      next: () => {
                          this._toastr.success('Contraseña cambiada con éxito');
                          this._inactivityService.deactivate();
                          this._seguridadService.logout();
                          this.route.navigate(['/seguridad/login']); 
                          this.loginForm.get('password')?.setValue('');
                      },
                      error: (error: any) => {
                          console.error(error.message);
                      }
                  });

                  // Manejar cuando se cancela
                  modalRef.componentInstance.canceled.pipe(takeUntil(this.unsubscribe$)).subscribe({
                    next: () => {
                      this._toastr.info('Cambio de contraseña cancelado');
                      this._seguridadService.logout();
                      this.route.navigate(['/seguridad/login']); 
                      modalRef.close();
                    }
                  });
                  
                }else{
                    if(this.user.perfil.activo){  
                        if(this.user.perfil.inactividad===0){  
                          this._inactivityService.deactivate();                      
                        }else{
                            this._inactivityService.activate(this.user.perfil.inactividad);  // Activa el servicio para 50 segudos de inactividad, luego cierra sesion.
                        } 
                        this.appSettings.appEmpty = false;
                        this.route.navigate(['/home']); 
                    }else{
                      this._toastr.error(`Perfil desactivo`, this.user.perfil.nombre, {timeOut: 3000,closeButton: true });
                      console.log('Error en Perfil: ', this.user.perfil.inactividad);
                    }
                }  



              }else{
                console.log('Error en Usuario');
                this._inactivityService.deactivate();
                this.loginForm.get('password')?.setValue('');
              }
          } catch (error) {
            console.error('Error durante el login:', error);
            this._inactivityService.deactivate();
            this.loginForm.get('password')?.setValue('');
          } finally {
            // Se apaga siempre: si no, un login fallido dejaba el botón
            // bloqueado y el overlay puesto para siempre.
            this.isLoading = false;
          }
      }else{
        //this.notificaciones.error('El formulario no puede estar vacio');
        this._toastr.error(`El formulario no puede estar vacio`, 'Error', {timeOut: 2000,closeButton: true });
        this.loginForm.get('password')?.setValue('');

      }
  }



// Agrega este método en la clase LoginComponent
abrirOlvideContrasena() {
  const modalRef = this.modalService.open(OlvideContrasenaComponent, { 
    centered: true, 
    size: 'md', 
    backdrop: 'static', 
    keyboard: true 
  });
  
  modalRef.componentInstance.passwordChanged.pipe(takeUntil(this.unsubscribe$)).subscribe({
    next: () => {
      this._toastr.success('Contraseña cambiada con éxito. Ahora puede iniciar sesión');
      // Opcional: Limpiar el formulario
      this.loginForm.reset();
    }
  });
  
  modalRef.componentInstance.canceled.pipe(takeUntil(this.unsubscribe$)).subscribe({
    next: () => {
      // Solo cerrar el modal
      modalRef.close();
    }
  });
}



}
