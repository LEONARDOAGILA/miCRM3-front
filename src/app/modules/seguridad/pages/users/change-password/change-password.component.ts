import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  FormControl,
  Validators
} from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { firstValueFrom, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ToastrService } from 'ngx-toastr';
import { LoadingService } from '../../../../../service/loading.service';
import { GeneradorClaveService } from '../../../../../service/generador-clave.service';
import { UserService } from '../../../services/user.service';

@Component({
  selector: 'app-change-password',
  templateUrl: './change-password.component.html',
  styleUrls: ['./change-password.component.css'],
  standalone: false,
})
export class ChangePasswordComponent implements OnInit, OnDestroy {
  @Input() registro_selected: any = {};
  @Input() userId!: number;
  @Input() view_reset: boolean;
  @Output() passwordChanged = new EventEmitter<void>();

  public isLoading$ = this._loadingService.isLoading$;
  public isdisabled: boolean;

  /** Corta toda suscripción viva al destruir el componente. */
  private readonly unsubscribe$ = new Subject<void>();

  form: FormGroup<{
    login_user: FormControl<string | null>;
    name: FormControl<string | null>;
    surname: FormControl<string | null>;
    email: FormControl<string | null>;
    new_password: FormControl<string | null>;
    new_password_confirmation: FormControl<string | null>;
    isreset:FormControl<boolean | false>;
  }>;

  constructor(
    public modal: NgbActiveModal,
    private fb: FormBuilder,
    private _toastr: ToastrService,
    private _loadingService: LoadingService,
    private _generadorClave: GeneradorClaveService,
    private _userService: UserService
  ) {
    
    this.isdisabled = false;
    this.form = this.fb.group(
    {
        login_user: this.fb.control({ value: '', disabled: true }),
        name: this.fb.control({ value: '', disabled: true }),
        surname: this.fb.control({ value: '', disabled: true }),
        email: [{ value: '', disabled: false }, [Validators.required, Validators.maxLength(100)]],
        isreset: [{ value: true, disabled: false }],

        new_password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(30) ]],
        new_password_confirmation: ['', Validators.required]}, { validators: this.passwordMatchValidator }
    );


  }

// En tu componente
passwordMatchValidator(formGroup: FormGroup) {
  const password = formGroup.get('new_password');
  const confirmPassword = formGroup.get('new_password_confirmation');

  if (!password || !confirmPassword) return null;

  // Solo validar si ambos campos tienen valores
  if (password.pristine || confirmPassword.pristine) {
    return null;
  }

  if (password.value !== confirmPassword.value) {
    confirmPassword.setErrors({ ...confirmPassword.errors, passwordMismatch: true });
    return { passwordMismatch: true };
  } else {
    // Limpiar el error si ahora coinciden
    if (confirmPassword.hasError('passwordMismatch')) {
      const errors = { ...confirmPassword.errors };
      delete errors['passwordMismatch'];
      confirmPassword.setErrors(Object.keys(errors).length ? errors : null);
    }
    return null;
  }
}



  /** Avatar del usuario (misma imagen que muestra el modal de usuarios) */
  public avatarUrl: string | null = null;
  public avatarError = false;

  /**
   * Contraseña creada con el botón «Generar». Se muestra en claro para
   * poder dictársela al usuario y se oculta en cuanto se edita a mano.
   */
  public claveGenerada: string | null = null;

  private readonly TIPOS_USUARIO: { [id: number]: string } = {
    1: 'SUPER USUARIO',
    2: 'ADMINISTRADOR',
    3: 'USUARIO SISTEMA',
    4: 'USUARIO WEB',
  };

  /** Nombre del tipo de usuario, para el chip de la ficha */
  public get tipoUsuarioNombre(): string {
    return this.TIPOS_USUARIO[this.registro_selected?.type_user] || '';
  }

  public handleAvatarError(): void {
    this.avatarError = true;
  }

  /** Nombre y apellidos del usuario, para la ficha de cabecera */
  public get nombreCompleto(): string {
    const nombre = this.registro_selected?.name || '';
    const apellido = this.registro_selected?.surname || '';
    return `${nombre} ${apellido}`.trim();
  }

  /** Iniciales para el avatar de la ficha */
  public get iniciales(): string {
    const base = this.nombreCompleto || this.registro_selected?.login_user || '';
    const partes = base.split(/\s+/).filter((p: string) => !!p);
    if (partes.length === 0) return '?';
    if (partes.length === 1) return partes[0].substring(0, 2).toUpperCase();
    return (partes[0][0] + partes[1][0]).toUpperCase();
  }

  /** Ambas claves escritas y coincidentes */
  public get clavesCoinciden(): boolean {
    const clave = this.form.get('new_password')?.value;
    const confirmacion = this.form.get('new_password_confirmation')?.value;
    return !!clave && !!confirmacion && clave === confirmacion;
  }

  /** Copia la contraseña generada para poder entregarla al usuario */
  public async copiarContrasena(): Promise<void> {
    const clave = this.form.get('new_password')?.value;
    if (!clave) return;

    if (await this._generadorClave.copiar(clave)) {
      this._toastr.success('Contraseña copiada al portapapeles');
    } else {
      this._toastr.info('No se pudo copiar automáticamente, cópiela manualmente');
    }
  }

  ngOnInit(): void {
    this.form.get('login_user')?.setValue(this.registro_selected.login_user);
    this.form.get('name')?.setValue(this.registro_selected.name);
    this.form.get('surname')?.setValue(this.registro_selected.surname);
    this.form.get('email')?.setValue(this.registro_selected.email);

    if (this.registro_selected?.avatar && this.userId) {
      this.avatarUrl = this._userService.getUserImage(this.userId, true);
    }

    // Si la clave se edita a mano, deja de mostrarse la generada
    this.form.get('new_password')?.valueChanges
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe(valor => {
        if (this.claveGenerada && valor !== this.claveGenerada) {
          this.claveGenerada = null;
        }
      });
  }

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

async onSubmit() {
  // Verifica explícitamente el estado del formulario
  if (this.form.invalid) {
    this._toastr.warning('Por favor complete todos los campos correctamente');
    return;
  }
  
  // Verifica coincidencia de contraseñas (aunque ya lo hace el validador)
  if (this.form.value.new_password !== this.form.value.new_password_confirmation) {
    this._toastr.warning('Las contraseñas no coinciden');
    return;
  }
  
  
  try {
    this._loadingService.setLoading(true);
    this.isdisabled = true;
    const response = await firstValueFrom(
      this._userService.changePassword(
        this.userId, 
        {
          password: this.form.value.new_password,
          email: this.form.value.email,
          isreset: this.form.value.isreset
        }
    )
    );
    
    this._loadingService.setLoading(false);

    if (response.status !== 'success') {
      // Antes no mostraba nada: solo reactivaba el botón y el usuario no sabía
      // por qué no había pasado nada.
      this.isdisabled = false;
      this._toastr.error(response.message || 'No se pudo cambiar la contraseña', 'Error');
      return;
    }

    // El backend informa si la notificación por correo salió o no. La clave es
    // temporal y viaja en ese correo, así que si falla hay que decirlo: el
    // usuario no podría entrar.
    if (response.data?.email_enviado === false) {
      this._toastr.warning(
        'La contraseña se cambió, pero no se pudo enviar el correo con la clave temporal. Entrégasela directamente.',
        'Correo no enviado',
        { timeOut: 15000, closeButton: true }
      );
    } else {
      this._toastr.success('Contraseña cambiada con éxito');
    }

    this.passwordChanged.emit();
    this.modal.close();

  } catch (error: any) {
    // El AuthInterceptor ya muestra el toast del error HTTP
    console.error('Error al cambiar la contraseña:', error);
    this._loadingService.setLoading(false);
    this.isdisabled = false;
  }
}


  // ****** GENERACIÓN DE CLAVE TEMPORAL ****** //

  /** Longitud de la clave generada. Entra en el maxLength(30) del formulario. */
  private readonly LONGITUD_CLAVE = 16;

  /**
   * Clave temporal. El algoritmo vive en GeneradorClaveService para que el alta
   * de usuarios (saveUser) use exactamente el mismo: es lógica sensible y
   * duplicarla termina con una de las dos pantallas generando claves peores.
   */
  generarYEstablecerContrasena(): void {
    const nuevaPassword = this._generadorClave.generar(this.LONGITUD_CLAVE);

    this.form.get('new_password')?.setValue(nuevaPassword);
    this.form.get('new_password_confirmation')?.setValue(nuevaPassword);

    // Se muestra en claro para poder entregársela al usuario
    this.claveGenerada = nuevaPassword;

    this.form.get('new_password')?.markAsTouched();
    this.form.get('new_password_confirmation')?.markAsTouched();
    this.form.get('new_password')?.updateValueAndValidity();
    this.form.get('new_password_confirmation')?.updateValueAndValidity();
  }
}
