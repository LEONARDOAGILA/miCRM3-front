import { Component, Input, OnInit } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-campoTelefono',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './campoTelefono.component.html',
  styleUrls: ['./campoTelefono.component.css']
})
export class CampoTelefonoComponent implements OnInit {
  @Input() control: FormControl;
  @Input() label: string = 'Teléfono';
  @Input() placeholder: string = 'Ej: 0987654321';
  @Input() maxLength: number = 15;
  @Input() required: boolean = true;
  @Input() trimEspacios: boolean = true;
  @Input() sinEspacios: boolean = true;
  @Input() pais: string = 'ecuador'; // 'ecuador', 'chile', 'colombia', 'peru', 'mexico', 'espana', 'argentina', 'ninguno'
  @Input() tipoTelefono: 'celular' | 'fijo' | 'ambos' = 'ambos';
  @Input() permitirInternacional: boolean = false; // Permitir formato internacional (+503 1234 5678)
  
  ngOnInit() {
    if (this.control) {
      const validators = [...(this.control.validator ? [this.control.validator] : [])];
      
      // Agregar validador de teléfono según país
      if (this.pais !== 'ninguno') {
        validators.push(this.telefonoValidator());
      }
      
      // Agregar validador maxLength
      validators.push(Validators.maxLength(this.maxLength));
      
      // Agregar validador required si es necesario
      if (this.required) {
        validators.push(Validators.required);
      }
      
      this.control.setValidators(validators);
      this.control.updateValueAndValidity();
    }
  }
  
  // Validador según país seleccionado
  telefonoValidator() {
    return (control: FormControl) => {
      let telefono = control.value;
      if (!telefono) {
        return null;
      }
      
      // Limpiar el teléfono
      let telefonoLimpio = telefono;
      
      if (this.trimEspacios) {
        telefonoLimpio = telefonoLimpio.trim();
      }
      
      if (this.sinEspacios) {
        telefonoLimpio = telefonoLimpio.replace(/\s/g, '');
      }
      
      // Eliminar guiones, paréntesis, etc. (pero mantener + para internacional)
      if (this.permitirInternacional) {
        telefonoLimpio = telefonoLimpio.replace(/[-\s\(\)]/g, '');
      } else {
        telefonoLimpio = telefonoLimpio.replace(/[-\s\(\)\+]/g, '');
      }
      
      // Validar según el país
      let isValid = false;
      
      switch (this.pais.toLowerCase()) {
        case 'ecuador':
          isValid = this.validarEcuador(telefonoLimpio);
          break;
        case 'chile':
          isValid = this.validarChile(telefonoLimpio);
          break;
        case 'colombia':
          isValid = this.validarColombia(telefonoLimpio);
          break;
        case 'peru':
          isValid = this.validarPeru(telefonoLimpio);
          break;
        case 'mexico':
          isValid = this.validarMexico(telefonoLimpio);
          break;
        case 'espana':
          isValid = this.validarEspana(telefonoLimpio);
          break;
        case 'argentina':
          isValid = this.validarArgentina(telefonoLimpio);
          break;
        default:
          isValid = true;
      }
      
      return isValid ? null : { telefonoInvalido: true };
    };
  }
  
  // Validadores por país
  
  private validarEcuador(telefono: string): boolean {
    // Celular: 10 dígitos, empieza con 09
    const celularRegex = /^09\d{8}$/;
    // Fijo: 7 dígitos o 9 dígitos (código provincia 2-7)
    const fijo9DigitosRegex = /^[2-7]\d{8}$/;
    const fijo7DigitosRegex = /^\d{7}$/;
    
    if (this.tipoTelefono === 'celular') {
      return celularRegex.test(telefono);
    } else if (this.tipoTelefono === 'fijo') {
      return fijo9DigitosRegex.test(telefono) || fijo7DigitosRegex.test(telefono);
    } else {
      return celularRegex.test(telefono) || fijo9DigitosRegex.test(telefono) || fijo7DigitosRegex.test(telefono);
    }
  }
  
  private validarChile(telefono: string): boolean {
    // Celular: 9 dígitos, empieza con 9
    const celularRegex = /^9\d{8}$/;
    // Fijo: 8 dígitos, empieza con 2
    const fijoRegex = /^2\d{7}$/;
    
    if (this.tipoTelefono === 'celular') {
      return celularRegex.test(telefono);
    } else if (this.tipoTelefono === 'fijo') {
      return fijoRegex.test(telefono);
    } else {
      return celularRegex.test(telefono) || fijoRegex.test(telefono);
    }
  }
  
  private validarColombia(telefono: string): boolean {
    // Celular: 10 dígitos, empieza con 3
    const celularRegex = /^3\d{9}$/;
    // Fijo: 7 dígitos o 10 dígitos (código de ciudad 1-8)
    const fijo10DigitosRegex = /^[1-8]\d{9}$/;
    const fijo7DigitosRegex = /^\d{7}$/;
    
    if (this.tipoTelefono === 'celular') {
      return celularRegex.test(telefono);
    } else if (this.tipoTelefono === 'fijo') {
      return fijo10DigitosRegex.test(telefono) || fijo7DigitosRegex.test(telefono);
    } else {
      return celularRegex.test(telefono) || fijo10DigitosRegex.test(telefono) || fijo7DigitosRegex.test(telefono);
    }
  }
  
  private validarPeru(telefono: string): boolean {
    // Celular: 9 dígitos, empieza con 9
    const celularRegex = /^9\d{8}$/;
    // Fijo: 7 dígitos o 9 dígitos (código de ciudad 1)
    const fijoRegex = /^1\d{8}$|^\d{7}$/;
    
    if (this.tipoTelefono === 'celular') {
      return celularRegex.test(telefono);
    } else if (this.tipoTelefono === 'fijo') {
      return fijoRegex.test(telefono);
    } else {
      return celularRegex.test(telefono) || fijoRegex.test(telefono);
    }
  }
  
  private validarMexico(telefono: string): boolean {
    // Celular: 10 dígitos, empieza con 1, 2, 3, 4, 5, 6, 7, 8, 9
    const celularRegex = /^[1-9]\d{9}$/;
    // Fijo: 10 dígitos (código de área 2 dígitos)
    const fijoRegex = /^\d{10}$/;
    
    if (this.tipoTelefono === 'celular') {
      return celularRegex.test(telefono);
    } else if (this.tipoTelefono === 'fijo') {
      return fijoRegex.test(telefono);
    } else {
      return celularRegex.test(telefono) || fijoRegex.test(telefono);
    }
  }
  
  private validarEspana(telefono: string): boolean {
    // Celular: 9 dígitos, empieza con 6, 7
    const celularRegex = /^[67]\d{8}$/;
    // Fijo: 9 dígitos, empieza con 8, 9
    const fijoRegex = /^[89]\d{8}$/;
    
    if (this.tipoTelefono === 'celular') {
      return celularRegex.test(telefono);
    } else if (this.tipoTelefono === 'fijo') {
      return fijoRegex.test(telefono);
    } else {
      return celularRegex.test(telefono) || fijoRegex.test(telefono);
    }
  }
  
  private validarArgentina(telefono: string): boolean {
    // Celular: 10 dígitos, empieza con 9 seguido de 1-9
    const celularRegex = /^9[1-9]\d{8}$/;
    // Fijo: 10 dígitos (código de área 2-3 dígitos)
    const fijoRegex = /^\d{10}$/;
    
    if (this.tipoTelefono === 'celular') {
      return celularRegex.test(telefono);
    } else if (this.tipoTelefono === 'fijo') {
      return fijoRegex.test(telefono);
    } else {
      return celularRegex.test(telefono) || fijoRegex.test(telefono);
    }
  }
  
  // Método para limpiar espacios
  limpiarEspacios(valor: string): string {
    if (!valor) return '';
    
    let valorLimpio = valor;
    
    if (this.trimEspacios) {
      valorLimpio = valorLimpio.trim();
    }
    
    if (this.sinEspacios) {
      valorLimpio = valorLimpio.replace(/\s/g, '');
    }
    
    return valorLimpio;
  }
  
  // Filtrar solo números
  filtrarNumeros(valor: string): string {
    if (!valor) return '';
    return valor.replace(/[^0-9]/g, '');
  }
  
  onInputChange(value: string) {
    let nuevoValor = value;
    
    // Filtrar solo números
    nuevoValor = this.filtrarNumeros(nuevoValor);
    
    // Limitar longitud máxima
    if (nuevoValor.length > this.maxLength) {
      nuevoValor = nuevoValor.substring(0, this.maxLength);
    }
    
    // Limpiar espacios
    if (this.trimEspacios || this.sinEspacios) {
      nuevoValor = this.limpiarEspacios(nuevoValor);
    }
    
    // Actualizar el control si se modificó el valor
    if (nuevoValor !== value) {
      this.control.setValue(nuevoValor, { emitEvent: false });
    }
  }
  
  onBlur() {
    if (this.control?.value) {
      let valorLimpio = this.filtrarNumeros(this.control.value);
      
      if (valorLimpio.length > this.maxLength) {
        valorLimpio = valorLimpio.substring(0, this.maxLength);
      }
      
      if (valorLimpio !== this.control.value) {
        this.control.setValue(valorLimpio);
        this.control.markAsDirty();
      }
    }
    
    if (this.control && !this.control.touched) {
      this.control.markAsTouched();
    }
  }
  
  // Método para obtener mensaje de error específico por país
  getErrorMessage(): string {
    if (!this.control?.touched && !this.control?.dirty) return '';
    
    if (this.control.hasError('required')) {
      return 'Es requerido.';
    }
    
    if (this.control.hasError('maxlength')) {
      return `No puede exceder los ${this.maxLength} dígitos.`;
    }
    
    if (this.control.hasError('telefonoInvalido')) {
      const mensajes: Record<string, string> = {
        ecuador: this.tipoTelefono === 'celular' 
          ? 'Ingrese un celular válido de Ecuador (10 dígitos, empieza con 09). Ej: 0987654321'
          : this.tipoTelefono === 'fijo'
          ? 'Ingrese un teléfono fijo válido de Ecuador (7 dígitos o 9 dígitos con código 2-7). Ej: 2345678 o 22345678'
          : 'Ingrese un teléfono válido de Ecuador (celular: 09xxxxxxxx, fijo: xxxxxxx o 2-7xxxxxxx)',
        chile: this.tipoTelefono === 'celular'
          ? 'Ingrese un celular válido de Chile (9 dígitos, empieza con 9). Ej: 912345678'
          : this.tipoTelefono === 'fijo'
          ? 'Ingrese un teléfono fijo válido de Chile (8 dígitos, empieza con 2). Ej: 21234567'
          : 'Ingrese un teléfono válido de Chile (celular: 9xxxxxxxx, fijo: 2xxxxxxx)',
        colombia: this.tipoTelefono === 'celular'
          ? 'Ingrese un celular válido de Colombia (10 dígitos, empieza con 3). Ej: 3123456789'
          : this.tipoTelefono === 'fijo'
          ? 'Ingrese un teléfono fijo válido de Colombia (7 dígitos o 10 dígitos). Ej: 1234567 o 1123456789'
          : 'Ingrese un teléfono válido de Colombia',
        peru: this.tipoTelefono === 'celular'
          ? 'Ingrese un celular válido de Perú (9 dígitos, empieza con 9). Ej: 912345678'
          : 'Ingrese un teléfono válido de Perú',
        mexico: 'Ingrese un teléfono válido de México (10 dígitos)',
        espana: this.tipoTelefono === 'celular'
          ? 'Ingrese un celular válido de España (9 dígitos, empieza con 6 o 7). Ej: 612345678'
          : 'Ingrese un teléfono válido de España (9 dígitos)',
        argentina: this.tipoTelefono === 'celular'
          ? 'Ingrese un celular válido de Argentina (10 dígitos, empieza con 9). Ej: 9123456789'
          : 'Ingrese un teléfono válido de Argentina (10 dígitos)',
      };
      
      return mensajes[this.pais.toLowerCase()] || 'Ingrese un número de teléfono válido.';
    }
    
    return '';
  }
}