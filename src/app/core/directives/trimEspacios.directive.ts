
import { Directive, HostListener, Input, Optional, Host } from '@angular/core';
import { NgControl } from '@angular/forms';

@Directive({
  selector: '[appTrimEspacios]',
  standalone: false,
})
export class TrimEspaciosDirective {
  @Input('appTrimEspacios') trimActivo: boolean = true; // Permite activar/desactivar

  constructor(@Optional() @Host() private ngControl: NgControl) {}

  @HostListener('blur')
  onBlur(): void {
    if (!this.trimActivo) {
      return; // Si está desactivado, no hace nada
    }

    const control = this.ngControl?.control;
    if (control) {
      const trimmedValue = control.value?.trim(); // Quita espacios de inicio y fin
      control.setValue(trimmedValue, { emitEvent: false }); // Actualiza el valor sin disparar eventos
    }
  }
}


// import { Directive, HostListener } from '@angular/core';
// import { NgControl } from '@angular/forms';

// @Directive({
//   selector: '[appTrimEspacios]',
// })
// export class TrimEspaciosDirective {
//   constructor(private ngControl: NgControl) {}

//   @HostListener('blur')
//   onBlur(): void {
//     const control = this.ngControl.control;
//     if (control) {
//       const trimmedValue = control.value?.trim(); // Quita espacios de inicio y fin
//       control.setValue(trimmedValue, { emitEvent: false }); // Actualiza el valor sin disparar eventos
//     }
//   }
// }
