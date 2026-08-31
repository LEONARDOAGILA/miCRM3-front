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


  // ****** GENERACIÓN DE CLAVE TEMPORAL ****** //

  /** Longitud de la clave generada. Entra en el maxLength(30) del formulario. */
  private readonly LONGITUD_CLAVE = 16;

  /**
   * Alfabetos sin caracteres ambiguos: fuera las mayúsculas I/O, las minúsculas
   * l/o y los dígitos 0/1, que se confunden entre sí al dictar la clave por
   * teléfono o al teclearla desde un papel.
   *
   * Los símbolos salen del conjunto que acepta app-campoClave
   * (/[!@#$%^&*(),.?":{}|<>]/) descartando los que dan problemas al pegarlos en
   * una consola, un CSV o una URL: comillas, coma, paréntesis, llaves, dos
   * puntos, barra vertical y los signos de mayor/menor.
   *
   * 24 + 24 + 8 + 8 = 64 símbolos, es decir 6 bits exactos por carácter.
   */
  private readonly MAYUSCULAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  private readonly MINUSCULAS = 'abcdefghijkmnpqrstuvwxyz';
  private readonly DIGITOS = '23456789';
  private readonly SIMBOLOS = '!@#$%&*?';

  /**
   * Entero uniforme en [0, max) con el CSPRNG del navegador.
   * Descarta el rango sobrante para no introducir sesgo de módulo.
   * Math.random() no sirve aquí: no es criptográfico y es predecible.
   */
  private aleatorio(max: number): number {
    const limite = Math.floor(0xFFFFFFFF / max) * max;
    const buffer = new Uint32Array(1);
    let valor: number;
    do {
      crypto.getRandomValues(buffer);
      valor = buffer[0];
    } while (valor >= limite);
    return valor % max;
  }

  /** Un carácter al azar del alfabeto indicado. */
  private elegir(alfabeto: string): string {
    return alfabeto.charAt(this.aleatorio(alfabeto.length));
  }

  /**
   * Fisher-Yates con el mismo CSPRNG. Sin barajar, la posición de cada clase de
   * carácter sería fija y el atacante podría descartar medio espacio de búsqueda.
   */
  private barajar(caracteres: string[]): string[] {
    for (let i = caracteres.length - 1; i > 0; i--) {
      const j = this.aleatorio(i + 1);
      [caracteres[i], caracteres[j]] = [caracteres[j], caracteres[i]];
    }
    return caracteres;
  }

  /** ¿Tiene la clave las cuatro clases que exige app-campoClave? */
  private cumpleRequisitos(clave: string): boolean {
    return /[A-Z]/.test(clave)
        && /[a-z]/.test(clave)
        && /\d/.test(clave)
        && /[!@#$%^&*(),.?":{}|<>]/.test(clave);
  }

  /**
   * Reparto alternativo: fuerza un carácter de cada clase y baraja.
   * Siempre produce una clave válida, pero sobrerrepresenta dígitos y símbolos
   * (sus pools son de 8 frente a los 24 de las letras). Solo se usa como red de
   * seguridad si el muestreo por rechazo agotara los intentos.
   */
  private generarConCuotas(): string {
    const alfabeto = this.MAYUSCULAS + this.MINUSCULAS + this.DIGITOS + this.SIMBOLOS;
    const caracteres: string[] = [
      this.elegir(this.MAYUSCULAS),
      this.elegir(this.MINUSCULAS),
      this.elegir(this.DIGITOS),
      this.elegir(this.SIMBOLOS),
    ];
    while (caracteres.length < this.LONGITUD_CLAVE) {
      caracteres.push(this.elegir(alfabeto));
    }
    return this.barajar(caracteres).join('');
  }

  /**
   * Clave temporal de 16 caracteres sobre un alfabeto de 64 símbolos.
   *
   * Usa muestreo por rechazo: sortea los 16 caracteres uniformemente y repite
   * si falta alguna clase. Así la distribución es *exactamente* uniforme sobre
   * el conjunto de claves válidas, sin el sesgo que introduce reservar
   * posiciones por clase.
   *
   *   Entropía = log2(64^16) + log2(P(válida)) = 96 - 0,38 = 95,6 bits
   *   P(válida) ~= 0,77  ->  1,3 intentos de media
   *
   * Historial: el generador original daba 11.520 combinaciones (~13 bits) con
   * Math.random(); se recorría entero en segundos.
   */
  generarYEstablecerContrasena(): void {
    const alfabeto = this.MAYUSCULAS + this.MINUSCULAS + this.DIGITOS + this.SIMBOLOS;
    const MAX_INTENTOS = 50;   // agotarlos tiene probabilidad ~10^-32

    let nuevaPassword = '';
    for (let intento = 0; intento < MAX_INTENTOS; intento++) {
      let candidata = '';
      for (let i = 0; i < this.LONGITUD_CLAVE; i++) {
        candidata += this.elegir(alfabeto);
      }
      if (this.cumpleRequisitos(candidata)) {
        nuevaPassword = candidata;
        break;
      }
    }

    // Inalcanzable en la práctica; evita devolver una clave inválida
    if (!nuevaPassword) {
      nuevaPassword = this.generarConCuotas();
    }

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
