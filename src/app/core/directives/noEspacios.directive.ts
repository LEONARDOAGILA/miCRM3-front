import { Directive, HostListener, Input, Optional, Host } from '@angular/core';
import { NgControl } from '@angular/forms';

@Directive({
  selector: '[appNoEspacios]',
  standalone: false,
})
export class NoEspaciosDirective {
  @Input('appNoEspacios') noEspaciosActivo: boolean = true; // Permite activar/desactivar la validación

  constructor(@Optional() @Host() private ngControl: NgControl) {}

  @HostListener('blur')
  onBlur(): void {
    if (!this.noEspaciosActivo) {
      return; // Si está desactivado, no hace nada
    }

    const control = this.ngControl?.control;
    if (control) {
      const value = control.value?.trim(); // Elimina espacios al inicio y fin

      if (value === '') {
        //console.log('entro al blur espacios')
        control.setErrors({ noEspacios: true }); // Error si solo son espacios
      } else {
        control.setErrors(null); // Elimina el error si el valor no es solo espacios
      }
    }
  }
}



// import { Directive, Input } from '@angular/core';
// import { AbstractControl, NG_VALIDATORS, ValidationErrors, Validator, ValidatorFn } from '@angular/forms';

// // Función para crear el validador
// export function noSpacesValidator(): ValidatorFn {
//   return (control: AbstractControl): ValidationErrors | null => {
//     const value = control.value || '';
//     return value.trim().length === 0 ? { noEspacios: true } : null;
//   };
// }

// @Directive({
//   selector: '[appNoEspacios]',
//   providers: [
//     {
//       provide: NG_VALIDATORS,
//       useExisting: NoEspaciosDirective,
//       multi: true,
//     },
//   ],
// })
// export class NoEspaciosDirective implements Validator {
//   @Input('appNoEspacios') activarValidacion: boolean = true; // Parámetro para activar/desactivar

//   validate(control: AbstractControl): ValidationErrors | null {
//     if (!this.activarValidacion) {
//       return null; // Si la validación está desactivada, no aplicar el validador
//     }
//     return noSpacesValidator()(control);
//   }
// }
