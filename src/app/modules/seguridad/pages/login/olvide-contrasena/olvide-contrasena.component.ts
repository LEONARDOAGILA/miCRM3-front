import { Component, EventEmitter, Output } from '@angular/core';
import { 
  FormBuilder, 
  FormGroup, 
  FormControl, 
  Validators 
} from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { firstValueFrom } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { LoadingService } from '../../../../../service/loading.service';
import { UserService } from '../../../services/user.service';

@Component({
  selector: 'app-olvide-contrasena',
  templateUrl: './olvide-contrasena.component.html',
  styleUrls: ['./olvide-contrasena.component.css'],
  standalone: false,
})
export class OlvideContrasenaComponent {
  @Output() passwordChanged = new EventEmitter<void>();
  @Output() canceled = new EventEmitter<void>();

  public isLoading$ = this._loadingService.isLoading$;
  public isdisabled: boolean;
  public step: number = 1; // 1: Solicitar usuario, 2: Verificar código, 3: Cambiar contraseña
  public userData: any = {};
  public tiempoReenvio: number = 0;
  private intervalRef: any;

  // Paso 1: Formulario de usuario
  formStep1: FormGroup<{
    login_user: FormControl<string | null>;
  }>;

  // Paso 2: Formulario de código
  formStep2: FormGroup<{
    codigo: FormControl<string | null>;
  }>;

  // Paso 3: Formulario de nueva contraseña
  formStep3: FormGroup<{
    new_password: FormControl<string | null>;
    new_password_confirmation: FormControl<string | null>;
  }>;

  constructor(
    public modal: NgbActiveModal,
    private fb: FormBuilder,
    private _toastr: ToastrService,
    private _loadingService: LoadingService,
    private _userService: UserService
  ) {
    this.isdisabled = false;

    // Paso 1: Solo usuario
    this.formStep1 = this.fb.group({
      login_user: ['', [Validators.required, Validators.maxLength(100)]]
    });

    // Paso 2: Código de verificación (ahora 6 dígitos para mayor seguridad)
    this.formStep2 = this.fb.group({
      codigo: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(6), Validators.pattern('^[0-9]*$')]]
    });

    // Paso 3: Nueva contraseña
    this.formStep3 = this.fb.group({
      new_password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(30)]],
      new_password_confirmation: ['', Validators.required]
    }, { validators: this.passwordMatchValidator });
  }

  // Validador de coincidencia de contraseñas
  passwordMatchValidator(formGroup: FormGroup) {
    const password = formGroup.get('new_password');
    const confirmPassword = formGroup.get('new_password_confirmation');

    if (!password || !confirmPassword) return null;

    if (password.pristine || confirmPassword.pristine) {
      return null;
    }

    if (password.value !== confirmPassword.value) {
      confirmPassword.setErrors({ ...confirmPassword.errors, passwordMismatch: true });
      return { passwordMismatch: true };
    } else {
      if (confirmPassword.hasError('passwordMismatch')) {
        const errors = { ...confirmPassword.errors };
        delete errors['passwordMismatch'];
        confirmPassword.setErrors(Object.keys(errors).length ? errors : null);
      }
      return null;
    }
  }

  // Iniciar contador para reenvío (60 segundos)
  iniciarContadorReenvio() {
    this.tiempoReenvio = 60;
    if (this.intervalRef) clearInterval(this.intervalRef);
    this.intervalRef = setInterval(() => {
      if (this.tiempoReenvio > 0) {
        this.tiempoReenvio--;
      } else {
        clearInterval(this.intervalRef);
      }
    }, 1000);
  }

  // Paso 1: Solicitar recuperación (el backend genera y guarda el código)
  async enviarCodigo() {
    if (this.formStep1.invalid) {
      this._toastr.warning('Por favor ingrese su nombre de usuario');
      return;
    }

    try {
      this._loadingService.setLoading(true);
      this.isdisabled = true;

      const login_user = this.formStep1.get('login_user')?.value;
      
      // El backend verifica el usuario, genera el código, lo guarda y lo envía por correo
      const response = await firstValueFrom(
        this._userService.solicitarRecuperacion(login_user)
      );

      if (response.status === 'success') {
        this.userData = {
          login_user: login_user,
          email: response.data.email
        };
        this.step = 2;
        this.iniciarContadorReenvio();
        this._toastr.success(`Se ha enviado un código de verificación a ${this.userData.email}`, 'Revisa tu correo', {
          timeOut: 5000,
          closeButton: true
        });
      } else {
        this._toastr.error(response.message || 'Usuario no encontrado o inactivo');
      }
      
      this._loadingService.setLoading(false);
      this.isdisabled = false;
    } catch (error: any) {
      this._loadingService.setLoading(false);
      this.isdisabled = false;
      this._toastr.error(error.error?.message || 'Error al procesar la solicitud');
    }
  }

  // Reenviar código (el backend genera uno nuevo)
  async reenviarCodigo() {
    if (this.tiempoReenvio > 0) {
      this._toastr.warning(`Espera ${this.tiempoReenvio} segundos para reenviar el código`);
      return;
    }

    try {
      this._loadingService.setLoading(true);
      
      // Solicitar nuevo código al backend
      const response = await firstValueFrom(
        this._userService.solicitarRecuperacion(this.userData.login_user)
      );

      if (response.status === 'success') {
        this.iniciarContadorReenvio();
        this._toastr.success('Se ha reenviado un nuevo código a tu correo', 'Código reenviado', {
          timeOut: 5000,
          closeButton: true
        });
      } else {
        this._toastr.error(response.message || 'Error al reenviar el código');
      }
      
      this._loadingService.setLoading(false);
    } catch (error: any) {
      this._loadingService.setLoading(false);
      this._toastr.error(error.error?.message || 'Error al reenviar el código');
    }
  }

  // Paso 2: Verificar código (validación en backend)
  async verificarCodigo() {
    if (this.formStep2.invalid) {
      this._toastr.warning('Por favor ingrese el código de 6 dígitos');
      return;
    }

    try {
      this._loadingService.setLoading(true);
      
      const codigo = this.formStep2.get('codigo')?.value;
      
      // Verificar el código en el backend
      const response = await firstValueFrom(
        this._userService.verificarRecuperacion(this.userData.login_user, codigo)
      );

      if (response.status === 'success') {
        this.userData = {
          ...this.userData,
          id: response.data.id,
          name: response.data.name,
          email: response.data.email
        };
        this.step = 3;
        this._toastr.success('Código verificado correctamente. Ahora puede cambiar su contraseña');
      } else {
        this._toastr.error(response.message || 'Código incorrecto o expirado');
      }
      
      this._loadingService.setLoading(false);
    } catch (error: any) {
      this._loadingService.setLoading(false);
      this._toastr.error(error.error?.message || 'Error al verificar el código');
    }
  }

  // Generar contraseña aleatoria (solo frontend, para ayudar al usuario)
  generateRandomPassword(): string {
    const palabras = ['Casa', 'Carro', 'Foco', 'Sol', 'Luna', 'Mar', 'Mesa', 'Agua'];
    const numero = Math.floor(Math.random() * 90) + 10;
    const especiales = ['!', '@', '#', '$', '%', '.', '&', '*'];
    const especial = especiales[Math.floor(Math.random() * especiales.length)];
    
    let palabra = palabras[Math.floor(Math.random() * palabras.length)];
    palabra = palabra.charAt(0).toUpperCase() + palabra.slice(1).toLowerCase();
    
    const password = palabra + numero + especial;
    
    // Validar requisitos
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || 
        !/[0-9]/.test(password) || !/[!@#$%-.&*]/.test(password)) {
      return this.generateRandomPassword();
    }
    
    return password;
  }

  generarYEstablecerContrasena(): void {
    const nuevaPassword = this.generateRandomPassword();
    this.formStep3.get('new_password')?.setValue(nuevaPassword);
    this.formStep3.get('new_password_confirmation')?.setValue(nuevaPassword);
    this.formStep3.get('new_password')?.markAsTouched();
    this.formStep3.get('new_password_confirmation')?.markAsTouched();
    this.formStep3.get('new_password')?.updateValueAndValidity();
    this.formStep3.get('new_password_confirmation')?.updateValueAndValidity();
  }

  // Paso 3: Cambiar contraseña
  async cambiarContrasena() {
    if (this.formStep3.invalid) {
      this._toastr.warning('Por favor complete todos los campos correctamente');
      return;
    }

    if (this.formStep3.value.new_password !== this.formStep3.value.new_password_confirmation) {
      this._toastr.warning('Las contraseñas no coinciden');
      return;
    }

    try {
      this._loadingService.setLoading(true);
      this.isdisabled = true;

      const response = await firstValueFrom(
        this._userService.cambiarPasswordRecuperacion({
          login_user: this.userData.login_user,
          email: this.userData.email,
          password: this.formStep3.value.new_password,
          codigo: this.formStep2.get('codigo')?.value
        })
      );

      if (response.status === 'success') {
        this._loadingService.setLoading(false);
        this._toastr.success('Contraseña cambiada con éxito. Ya puedes iniciar sesión', 'Éxito', {
          timeOut: 5000,
          closeButton: true
        });
        this.passwordChanged.emit();
        this.modal.close();
      } else {
        this._loadingService.setLoading(false);
        this.isdisabled = false;
        this._toastr.error(response.message || 'Error al cambiar la contraseña');
      }
    } catch (error: any) {
      this._loadingService.setLoading(false);
      this.isdisabled = false;
      this._toastr.error(error.error?.message || 'Error al cambiar la contraseña');
    }
  }

  volverPasoAnterior() {
    if (this.step > 1) {
      this.step--;
      // Limpiar el código del paso 2 al volver
      if (this.step === 1) {
        this.formStep2.get('codigo')?.setValue('');
      }
    }
  }

  cerrar() {
    if (this.intervalRef) clearInterval(this.intervalRef);
    this.canceled.emit();
    this.modal.close();
  }

  // Método para permitir solo números en el campo de código
soloNumeros(event: KeyboardEvent): void {
  const charCode = event.which ? event.which : event.keyCode;
  // Permitir solo números (códigos ASCII 48-57)
  if (charCode < 48 || charCode > 57) {
    event.preventDefault();
  }
}

}

