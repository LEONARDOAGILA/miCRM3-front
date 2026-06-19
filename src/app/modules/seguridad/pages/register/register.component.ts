import { Component, OnInit } from '@angular/core';
import { FormGroup, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import Swal from 'sweetalert2';
import { SeguridadService } from '../../services/seguridad.service';

@Component({
  selector: 'app-register',
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.css'],
  standalone: false,
})
export class RegisterComponent {
  loginForm!: FormGroup;
  hasError: boolean = false;
  hasErrorText: string = '';

  hasSuccess: boolean = false;
  hasSuccessText: string = '';

  constructor(
    private fb: FormBuilder,
    private _seguridadService: SeguridadService,
    private route: Router,
    private router: ActivatedRoute
  ) {
    if (this._seguridadService.isLoggin()) {
      this.route.navigate(['/']);
    }
  }

  ngOnInit(): void {
    this.loginForm = this.fb.group({
      email: [
        null,
        Validators.compose([
          Validators.required,
          Validators.email,
          Validators.minLength(3),
          Validators.maxLength(250),
        ]),
      ],
      name: [
        null,
        Validators.compose([
          Validators.required,
          Validators.minLength(3),
          Validators.maxLength(250),
        ]),
      ],
      surname: [
        null,
        Validators.compose([
          Validators.required,
          Validators.minLength(3),
          Validators.maxLength(250),
        ]),
      ],
      password: [
        null,
        Validators.compose([
          Validators.required,
          Validators.minLength(6),
          Validators.maxLength(100),
        ]),
      ],
      password_confirmation: [
        null,
        Validators.compose([
          Validators.required,
          Validators.minLength(6),
          Validators.maxLength(100),
        ]),
      ],
    });
  }

  verifyPassword(password: string, password_confirmation: string) {
    return password !== password_confirmation;
  }
  submit() {
    this.hasError = false;
    if(this.verifyPassword(this.loginForm.value.password, this.loginForm.value.password_confirmation)){
      Swal.fire({
        title: 'Error!',
        text: 'La contraseñas no son iguales',
        icon: 'error',
        confirmButtonText: 'Cool'
      })
    }
    this._seguridadService.registro(this.loginForm.value).subscribe((resp:any)=>{
      if(!resp.error && resp){
        Swal.fire({
          title: 'Exito',
          text: 'Datos guardados con exito',
          icon: 'success',
          confirmButtonText: 'Ok'
        });
        setTimeout(()=>{
          this.route.navigate(['seguridad/login']);
        }, 2000);

      }else{
        this.hasError = true;
          this.hasErrorText='USUARIO O CONTRASEÑA INCORRECTOS';
      }
    },error => {
      Swal.fire({
        title: 'Error',
        text: 'No SV: ',
        icon: 'error',
        confirmButtonText: 'Ok'
      })
    }
    );
  }
}
