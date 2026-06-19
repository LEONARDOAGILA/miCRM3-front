import { Directive, HostListener, Input, Optional, Host } from '@angular/core';
import { NgControl } from '@angular/forms';

@Directive({
  selector: '[appSoloLetras]',
  standalone: false,
})
export class SoloLetrasDirective {
  @Input('appSoloLetras') soloLetrasActivo: boolean = true;

  constructor(@Optional() @Host() private ngControl: NgControl) {}

  @HostListener('input', ['$event.target.value'])
  onInput(value: string): void {
    if (!this.soloLetrasActivo) {
      return;
    }

    const filteredValue = value.replace(/[^a-zA-ZÑñÁÉÍÓÚáéíóú\s ]/g, '');
    
    if (this.ngControl && this.ngControl.control) {
      this.ngControl.control.setValue(filteredValue, { emitEvent: false });

      // Agregar validación personalizada
      if (value !== filteredValue) {
        this.ngControl.control.setErrors({ 'soloLetras': true });
      } else {
        this.ngControl.control.setErrors(null);
      }
    }
  }
}


// import { Directive, HostListener } from '@angular/core';
// import { NgControl } from '@angular/forms';

// @Directive({
//   selector: '[appSoloLetras]'
// })
// export class SoloLetrasDirective {
//   constructor(private ngControl: NgControl) {}

//   @HostListener('input', ['$event.target.value'])
//   onInput(value: string): void {
//     const filteredValue = value.replace(/[^a-zA-ZÑñÁÉÍÓÚáéíóú\s ]/g, '');
//     this.ngControl.control?.setValue(filteredValue, { emitEvent: false });

//     // Agregar validación personalizada
//     if (value !== filteredValue) {
//       this.ngControl.control?.setErrors({ 'soloLetras': true });
//     } else {
//       this.ngControl.control?.setErrors(null);
//     }
//   }
// }