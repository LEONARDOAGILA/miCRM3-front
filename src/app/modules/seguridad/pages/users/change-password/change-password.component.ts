import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
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
  selector: 'app-change-password',
  templateUrl: './change-password.component.html',
  styleUrls: ['./change-password.component.css'],
  standalone: false,
})
export class ChangePasswordComponent implements OnInit {
  @Input() registro_selected: any = {};
  @Input() userId!: number;
  @Input() view_reset: boolean;
  @Output() passwordChanged = new EventEmitter<void>();

  public isLoading$ = this._loadingService.isLoading$;
  public isdisabled: boolean;

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

    try {
      await navigator.clipboard.writeText(clave);
      this._toastr.success('Contraseña copiada al portapapeles');
    } catch (error) {
      this._toastr.info('No se pudo copiar automáticamente, cópiela manualmente');
    }
  }

  ngOnInit(): void {
    this.form.get('login_user')?.setValue(this.registro_selected.login_user);
    this.form.get('name')?.setValue(this.registro_selected.name);
    this.form.get('surname')?.setValue(this.registro_selected.surname);
    this.form.get('email')?.setValue(this.registro_selected.email);
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
    
    if (response.status === 'success') {
      this._loadingService.setLoading(false);
      this._toastr.success('Contraseña cambiada con éxito');
      this.passwordChanged.emit();
      this.modal.close();
    }else{
      this._loadingService.setLoading(false);
      this.isdisabled = false;

    }
  } catch (error: any) {
    this._loadingService.setLoading(false);
    this.isdisabled = false;
    this._toastr.error(error.error?.message || 'Error al cambiar la contraseña');
  }
}


// Opción 1: Palabra + Número + Especial (Formato: Palabra123!)
// Ejemplo: Casa123! , Perro456? , Gato789$
generateEasyPassword(): string {
  // Palabras comunes en mayúscula (primera letra mayúscula, resto minúscula)
  const palabras = [
    'Casa', 'Carro', 'Foco', 'Sol', 'Luna', 'Mar', 'Mesa', 'Agua',
    'Rio', 'Montana', 'Play', 'Ciudad', 'Algo', 'Paz', 'Sill', 'Grand'
  ];
  
  // Números de 2 dígitos (10-99)
  const numero = Math.floor(Math.random() * 90) + 10;
  
  // Caracteres especiales permitidos
  const especiales = ['!', '@', '#', '$', '%', '.', '&', '*'];
  const especial = especiales[Math.floor(Math.random() * especiales.length)];
  
  // Palabra con primera letra mayúscula y resto minúscula
  let palabra = palabras[Math.floor(Math.random() * palabras.length)];
  palabra = palabra.charAt(0).toUpperCase() + palabra.slice(1).toLowerCase();
  
  // Contraseña: Palabra + Número + Especial
  const password = palabra + numero + especial;
  
  // Verificar longitud mínima de 8 caracteres
  if (password.length < 8) {
    return this.generateEasyPassword(); // Regenerar si es muy corta
  }
  
  return password;
}

// Opción 2: Dos palabras + Número (Formato: CasaPerro123!)
// Ejemplo: CasaPerro123! , SolLuna456? , GatoFlor789$
generateTwoWordsPassword(): string {
  const palabras = ['Casa', 'Carro', 'Foco', 'Sol', 'Luna', 'Mesa'];
  const especiales = ['!', '@', '#', '$', '%', '.', '&', '*'];
  
  let palabra1 = palabras[Math.floor(Math.random() * palabras.length)];
  let palabra2 = palabras[Math.floor(Math.random() * palabras.length)];
  const numero = Math.floor(Math.random() * 90) + 10;
  const especial = especiales[Math.floor(Math.random() * especiales.length)];
  
  // Asegurar formato correcto
  palabra1 = palabra1.charAt(0).toUpperCase() + palabra1.slice(1).toLowerCase();
  palabra2 = palabra2.charAt(0).toUpperCase() + palabra2.slice(1).toLowerCase();
  
  const password = palabra1 + palabra2 + numero + especial;
  
  return password;
}

// Opción 3: Mes + Día + Especial (Formato: Enero23!)
// Ejemplo: Enero23! , Febrero15? , Marzo08$
generateDatePassword(): string {
  const meses = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  
  const especiales = ['!', '@', '#', '$', '%', '.', '&', '*'];
  
  const mes = meses[Math.floor(Math.random() * meses.length)];
  const dia = Math.floor(Math.random() * 28) + 1; // Día 1-28
  const diaFormateado = dia < 10 ? '0' + dia : dia.toString();
  const especial = especiales[Math.floor(Math.random() * especiales.length)];
  
  // Formato: Mes + Día + Especial
  const password = mes + diaFormateado + especial;
  
  return password;
}

// Opción 4: Color + Animal + Número + Especial (Formato: RojoLeon123!)
// Ejemplo: RojoLeon123! , AzulTigre456? , VerdeOso789$
generateColorAnimalPassword(): string {
  const colores = ['Rojo', 'Azul', 'Verde', 'Negro', 'Blanco', 'Amarillo'];
  const animales = ['Leon', 'Tigre', 'Oso', 'Lobo', 'Conejo', 'Mantarraya'];
  const especiales = ['!', '@', '#', '$', '%', '.', '&', '*'];
  
  const color = colores[Math.floor(Math.random() * colores.length)];
  const animal = animales[Math.floor(Math.random() * animales.length)];
  const numero = Math.floor(Math.random() * 90) + 10;
  const especial = especiales[Math.floor(Math.random() * especiales.length)];
  
  const password = color + animal + numero + especial;
  
  return password;
}

// Opción 5: Sigla + Año + Especial (Formato: ABC2024!)
// Ejemplo: ABC2024! , XYZ1985? , MNO2001$
generateInitialsPassword(): string {
  const consonantes = 'BCDFGHJKLMNPQRSTVWXYZ';
  const vocales = 'AEIOU';
  const especiales = ['-', '@', '#', '$', '%', '.', '_', '*'];
  
  // Generar sigla de 3 letras (mayúsculas)
  let sigla = '';
  sigla += consonantes[Math.floor(Math.random() * consonantes.length)];
  sigla += vocales[Math.floor(Math.random() * vocales.length)];
  sigla += consonantes[Math.floor(Math.random() * consonantes.length)];
  
  const año = Math.floor(Math.random() * (2024 - 1980 + 1) + 1980);
  const especial = especiales[Math.floor(Math.random() * especiales.length)];
  
  const password = sigla + año + especial;
  
  return password;
}

// Método principal que genera contraseña fácil y cumple TODAS las restricciones
generarYEstablecerContrasena(): void {
  // Elegir entre diferentes estilos de contraseñas fáciles
  const estilos = [
    this.generateEasyPassword.bind(this),           // Palabra + Número + Especial
    this.generateTwoWordsPassword.bind(this),       // Dos palabras + Número + Especial
    this.generateDatePassword.bind(this),           // Mes + Día + Especial
    this.generateColorAnimalPassword.bind(this),    // Color + Animal + Número + Especial
    this.generateInitialsPassword.bind(this)        // Sigla + Año + Especial
  ];
  
  // Seleccionar un estilo aleatorio
  const estiloSeleccionado = estilos[Math.floor(Math.random() * estilos.length)];
  let nuevaPassword = estiloSeleccionado();
  
  // VALIDACIÓN EXPLÍCITA de todos los requisitos
  const tieneMayuscula = /[A-Z]/.test(nuevaPassword);
  const tieneMinuscula = /[a-z]/.test(nuevaPassword);
  const tieneNumero = /[0-9]/.test(nuevaPassword);
  const tieneEspecial = /[!@#$%.&*]/.test(nuevaPassword);
  const tieneLongitud = nuevaPassword.length >= 8;
  const noTieneEspacios = !/\s/.test(nuevaPassword);
  
  // Si no cumple algún requisito, regenerar
  if (!tieneMayuscula || !tieneMinuscula || !tieneNumero || 
      !tieneEspecial || !tieneLongitud || !noTieneEspacios) {
    console.log('Regenerando contraseña - no cumplía requisitos:', nuevaPassword);
    nuevaPassword = this.generateEasyPassword(); // Regenerar con estilo básico
  }
  
  // Establecer la nueva contraseña
  this.form.get('new_password')?.setValue(nuevaPassword);
  this.form.get('new_password_confirmation')?.setValue(nuevaPassword);
  
  // Marcar campos como tocados
  this.form.get('new_password')?.markAsTouched();
  this.form.get('new_password_confirmation')?.markAsTouched();
  
  // Disparar validación
  this.form.get('new_password')?.updateValueAndValidity();
  this.form.get('new_password_confirmation')?.updateValueAndValidity();
  
}



}