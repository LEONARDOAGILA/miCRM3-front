import { Component, Input, OnInit } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-campoEmail',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './campoEmail.component.html',
  styleUrls: ['./campoEmail.component.css']
})
export class CampoEmailComponent implements OnInit {
  @Input() control: FormControl;
  @Input() label: string = 'Correo Electrónico';
  @Input() placeholder: string = 'ejemplo';
  @Input() maxLength: number = 255;
  @Input() required: boolean = true;
  @Input() trimEspacios: boolean = true; // Elimina espacios al inicio y final
  @Input() sinEspacios: boolean = true; // Elimina TODOS los espacios (incluyendo internos)
  
  public mostrarSugerencias: boolean = false;
  public parteLocal: string = '';
  
  public dominios: string[] = [
    '@gmail.com',
    '@hotmail.com',
    '@outlook.com',
    '@yahoo.com',
    '@icloud.com',
    '@me.com',
    '@protonmail.com',
    '@live.com',
    '@hotmail.es',
    '@yahoo.es'
  ];
  
  ngOnInit() {
    if (this.control) {
      const validators = [...(this.control.validator ? [this.control.validator] : [])];
      
      // Agregar validador de email
      validators.push(this.emailValidator());
      
      // Agregar validador required si es necesario
      if (this.required) {
        validators.push(Validators.required);
      }
      
      this.control.setValidators(validators);
      this.control.updateValueAndValidity();
    }
  }
  
  // Validador personalizado de email
  emailValidator() {
    return (control: FormControl) => {
      let email = control.value;
      if (!email) {
        return null;
      }
      
      // Aplicar trim y sinEspacios según configuración (solo para validar)
      let emailLimpio = email;
      
      if (this.trimEspacios) {
        emailLimpio = emailLimpio.trim();
      }
      
      if (this.sinEspacios) {
        emailLimpio = emailLimpio.replace(/\s/g, '');
      }
      
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      const isValid = emailRegex.test(emailLimpio);
      
      return isValid ? null : { emailInvalido: true };
    };
  }
  
  // Método para limpiar espacios según configuración
  limpiarEspacios(valor: string): string {
    if (!valor) return '';
    
    let valorLimpio = valor;
    
    // Primero trim (eliminar espacios al inicio y final)
    if (this.trimEspacios) {
      valorLimpio = valorLimpio.trim();
    }
    
    // Luego eliminar todos los espacios internos si está activado
    if (this.sinEspacios) {
      valorLimpio = valorLimpio.replace(/\s/g, '');
    }
    
    return valorLimpio;
  }
  
  // Método para actualizar las sugerencias
  actualizarSugerencias() {
    let email = this.control?.value || '';
    
    // Limpiar espacios para las sugerencias
    email = this.limpiarEspacios(email);
    
    if (!email || email.includes('@')) {
      this.mostrarSugerencias = false;
      this.parteLocal = '';
    } else {
      this.parteLocal = email;
      this.mostrarSugerencias = email.length > 0;
    }
  }
  
  onInputChange(value: string) {
    let nuevoValor = value;
    
    // Limpiar espacios en tiempo real según configuración
    if (this.trimEspacios || this.sinEspacios) {
      nuevoValor = this.limpiarEspacios(value);
      
      // Actualizar el control si se modificó el valor
      if (nuevoValor !== value) {
        this.control.setValue(nuevoValor, { emitEvent: false });
      }
    }
    
    this.actualizarSugerencias();
  }
  
  onBlur() {
    // Al perder el foco, limpiar espacios según configuración
    if ((this.trimEspacios || this.sinEspacios) && this.control?.value) {
      const valorLimpio = this.limpiarEspacios(this.control.value);
      if (valorLimpio !== this.control.value) {
        this.control.setValue(valorLimpio);
        this.control.markAsDirty();
        this.actualizarSugerencias();
      }
    }
    
    setTimeout(() => {
      this.mostrarSugerencias = false;
    }, 200);
  }
  
  seleccionarSugerencia(dominio: string) {
    const nuevoEmail = this.parteLocal + dominio;
    const emailLimpio = this.limpiarEspacios(nuevoEmail);
    this.control.setValue(emailLimpio);
    this.control.markAsTouched();
    this.control.markAsDirty();
    this.mostrarSugerencias = false;
    this.control.updateValueAndValidity();
    this.actualizarSugerencias();
  }
  
  validarEmail(email: string): boolean {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email);
  }
}