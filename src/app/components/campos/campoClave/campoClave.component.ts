import { Component, Input, forwardRef, OnInit, OnDestroy } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, NG_VALIDATORS, Validator, AbstractControl, ValidationErrors, ReactiveFormsModule, FormControl } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-campoClave',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './campoClave.component.html',
  styleUrls: ['./campoClave.component.css'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CampoClaveComponent),
      multi: true
    },
    {
      provide: NG_VALIDATORS,
      useExisting: forwardRef(() => CampoClaveComponent),
      multi: true
    }
  ]
})
export class CampoClaveComponent implements ControlValueAccessor, Validator, OnInit, OnDestroy {
  
  @Input() mostrarRequisitos: boolean = true; 
  @Input() mostrarBarraFortaleza: boolean = true;  
  @Input() label: string = 'Contraseña';
  @Input() placeholder: string = 'Ingrese su contraseña';
  @Input() maxLength: number = 50;
  @Input() minLength: number = 8;
  @Input() autocomplete: string = 'off';
  
  @Input() requiereMayuscula: boolean = true;
  @Input() requiereMinuscula: boolean = true;
  @Input() requiereNumero: boolean = true;
  @Input() requiereEspecial: boolean = true;
  @Input() requiereMinLength: boolean = true;
  @Input() sinEspacios: boolean = true;
  @Input() trimEspacios: boolean = true;
  
  // NUEVO: Input para recibir FormControl
  @Input() set control(control: FormControl) {
    if (control) {
      // Limpiar suscripción anterior
      if (this.controlSubscription) {
        this.controlSubscription.unsubscribe();
      }
      
      this._control = control;
      
      // Suscribirse a cambios en el estado del control
      this.controlSubscription = control.valueChanges.subscribe(value => {
        if (value !== this.value) {
          this.writeValue(value);
        }
      });
      
      // Sincronizar estado touched del control padre
      this.sincronizarEstadoControl();
    }
  }
  
  public showPassword: boolean = false;
  public value: string = '';
  
  private _control: FormControl | null = null;
  private controlSubscription: Subscription | null = null;
  
  // Variables para feedback visual
  public cumpleMinLength: boolean = false;
  public cumpleMayuscula: boolean = false;
  public cumpleMinuscula: boolean = false;
  public cumpleNumero: boolean = false;
  public cumpleEspecial: boolean = false;
  public cumpleSinEspacios: boolean = true;
  
  public touched: boolean = false;
  public disabled: boolean = false;
  
  // ControlValueAccessor
  onChange: any = () => {};
  onTouched: any = () => {};
  
  ngOnInit() {
    // Pequeño delay para asegurar que el control esté disponible
    setTimeout(() => {
      this.sincronizarEstadoControl();
    });
  }
  
  ngOnDestroy() {
    if (this.controlSubscription) {
      this.controlSubscription.unsubscribe();
    }
  }
  
  // Sincronizar estado touched/dirty del control padre
  private sincronizarEstadoControl() {
    if (this._control) {
      this.touched = this._control.touched || this._control.dirty;
      
      // Observar cambios en el estado del control
      if (this._control.events) {
        // Opcional: suscribirse a eventos de estado
        const statusSubscription = this._control.statusChanges.subscribe(() => {
          this.touched = this._control.touched || this._control.dirty;
        });
        
        // Guardar para limpiar después
        setTimeout(() => statusSubscription.unsubscribe(), 1000);
      }
    }
  }
  
  writeValue(obj: any): void {
    this.value = obj || '';
    this.actualizarRequisitos(this.value);
    this.sincronizarEstadoControl();
  }
  
  registerOnChange(fn: any): void {
    this.onChange = fn;
  }
  
  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }
  
  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }
  
  // Validator
  validate(control: AbstractControl): ValidationErrors | null {
    const password = control.value;
    const errors: ValidationErrors = {};
    
    if (this.requiereMinLength && (!password || password.length < this.minLength)) {
      errors['minlength'] = true;
    }
    if (this.requiereMayuscula && password && !/[A-Z]/.test(password)) {
      errors['requiereMayuscula'] = true;
    }
    if (this.requiereMinuscula && password && !/[a-z]/.test(password)) {
      errors['requiereMinuscula'] = true;
    }
    if (this.requiereNumero && password && !/\d/.test(password)) {
      errors['requiereNumero'] = true;
    }
    if (this.requiereEspecial && password && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errors['requiereEspecial'] = true;
    }
    if (this.sinEspacios && password && /\s/.test(password)) {
      errors['sinEspacios'] = true;
    }
    
    return Object.keys(errors).length ? errors : null;
  }
  
  registerOnValidatorChange(fn: () => void): void {
    this.onValidatorChange = fn;
  }
  private onValidatorChange: () => void = () => {};
  
  // Evento cuando el usuario escribe
  // onInput(event: Event) {
  //   const input = event.target as HTMLInputElement;
  //   let value = input.value;
    
  //   if (this.trimEspacios) {
  //     value = value.replace(/\s/g, '');
  //     input.value = value;
  //   }
    
  //   this.value = value;
  //   this.onChange(this.value);
  //   this.actualizarRequisitos(this.value);
  //   this.onValidatorChange();
    
  //   // Marcar como touched y dirty en el control padre
  //   if (this._control && !this._control.dirty) {
  //     this._control.markAsDirty();
  //   }
  // }
  
  onInput(event: Event) {
  const input = event.target as HTMLInputElement;
  let value = input.value;

  if (this.trimEspacios) {
    value = value.replace(/\s/g, '');
    input.value = value;
  }

  this.value = value;

  // 🔥 ESTO ES LO IMPORTANTE
  if (this._control) {
    this._control.setValue(this.value);   // 👈 ACTUALIZA EL FORM
    this._control.markAsDirty();
    this._control.markAsTouched();
  }

  this.onChange(this.value); // opcional en tu caso
  this.actualizarRequisitos(this.value);
  this.onValidatorChange();
}


  onBlur() {
    this.touched = true;
    this.onTouched();
    
    // Marcar como touched en el control padre
    if (this._control && !this._control.touched) {
      this._control.markAsTouched();
    }
  }
  
  togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
  }
  
  private actualizarRequisitos(password: string) {
    this.cumpleMinLength = password && password.length >= this.minLength;
    this.cumpleMayuscula = password && /[A-Z]/.test(password);
    this.cumpleMinuscula = password && /[a-z]/.test(password);
    this.cumpleNumero = password && /\d/.test(password);
    this.cumpleEspecial = password && /[!@#$%^&*(),.?":{}|<>]/.test(password);
    this.cumpleSinEspacios = !password || !/\s/.test(password);
  }
  
  get fortalezaPorcentaje(): number {
    if (!this.value) return 0;
    let puntos = 0;
    let totalRequisitos = 1; // minLength siempre cuenta
    
    if (this.sinEspacios) totalRequisitos++;
    if (this.requiereMayuscula) totalRequisitos++;
    if (this.requiereMinuscula) totalRequisitos++;
    if (this.requiereNumero) totalRequisitos++;
    if (this.requiereEspecial) totalRequisitos++;
    
    if (this.cumpleMinLength) puntos += (100 / totalRequisitos);
    if (this.sinEspacios && this.cumpleSinEspacios) puntos += (100 / totalRequisitos);
    if (this.requiereMayuscula && this.cumpleMayuscula) puntos += (100 / totalRequisitos);
    if (this.requiereMinuscula && this.cumpleMinuscula) puntos += (100 / totalRequisitos);
    if (this.requiereNumero && this.cumpleNumero) puntos += (100 / totalRequisitos);
    if (this.requiereEspecial && this.cumpleEspecial) puntos += (100 / totalRequisitos);
    
    return Math.min(puntos, 100);
  }
  
  get fortalezaColor(): string {
    const porcentaje = this.fortalezaPorcentaje;
    if (porcentaje === 100) return 'success';
    if (porcentaje >= 60) return 'warning';
    return 'danger';
  }
  
  get fortalezaTexto(): string {
    const porcentaje = this.fortalezaPorcentaje;
    if (porcentaje === 100) return '✓ Contraseña fuerte';
    if (porcentaje >= 60) return '⚠️ Contraseña media';
    return '❌ Contraseña débil';
  }
  
  get isInvalid(): boolean {
    // Usar touched del control padre o el interno
    const estaTouched = this.touched || (this._control && (this._control.touched || this._control.dirty));
    
    if (!estaTouched || this.disabled) return false;
    
    return (this.cumpleMinLength === false ||
            (this.sinEspacios && !this.cumpleSinEspacios) ||
            (this.requiereMayuscula && !this.cumpleMayuscula) ||
            (this.requiereMinuscula && !this.cumpleMinuscula) ||
            (this.requiereNumero && !this.cumpleNumero) ||
            (this.requiereEspecial && !this.cumpleEspecial));
  }
  
  get isValid(): boolean {
    const estaTouched = this.touched || (this._control && (this._control.touched || this._control.dirty));
    return estaTouched && !this.disabled && !this.isInvalid && this.value?.length > 0;
  }
}
