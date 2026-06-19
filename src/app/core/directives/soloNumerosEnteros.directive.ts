import { Directive, HostListener } from '@angular/core';
import { NgControl } from '@angular/forms';

@Directive({
  selector: '[appSoloNumerosEnteros]',
  standalone: false,
})
export class SoloNumerosEnterosDirective {
  constructor(private ngControl: NgControl) {}

  @HostListener('input', ['$event'])
  onInput(event: Event): void {
    const inputElement = event.target as HTMLInputElement;
    let value = inputElement.value;

    // Reemplaza cualquier carácter que no sea un número
    const filteredValue = value.replace(/[^0-9]/g, '');

    if (value !== filteredValue) {
      // Actualiza el valor del input y del FormControl sin disparar eventos innecesarios
      inputElement.value = filteredValue;
      this.ngControl.control?.setValue(filteredValue, { emitEvent: false });
    }

    // Validación de error personalizado
    const erroresExistentes = this.ngControl.control?.errors || {};
    if (value !== filteredValue) {
      this.ngControl.control?.setErrors({ ...erroresExistentes, soloNumerosEnteros: true });
    } else {
      delete erroresExistentes['soloNumerosEnteros'];
      this.ngControl.control?.setErrors(Object.keys(erroresExistentes).length ? erroresExistentes : null);
    }
  }
}
