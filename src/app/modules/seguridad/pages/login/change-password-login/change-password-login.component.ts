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
  selector: 'app-change-password-login',
  templateUrl: './change-password-login.component.html',
  styleUrls: ['./change-password-login.component.css'],
  standalone: false,
})
export class ChangePasswordLoginComponent implements OnInit {
  @Input() registro_selected: any = {};
  @Input() userId!: number;
  @Input() view_reset: boolean;
  @Output() passwordChanged = new EventEmitter<void>();

  public isLoading$ = this._loadingService.isLoading$;
  public isdisabled: boolean;

  form: FormGroup<{
    login_user: FormControl<string | null>;
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
        email: [{ value: '', disabled: true }, [Validators.required, Validators.maxLength(100)]],
        isreset: [{ value: false, disabled: false }],

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



  ngOnInit(): void {
    this.form.get('login_user')?.setValue(this.registro_selected.login_user);
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
    this._userService.changePasswordLogin(
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



}