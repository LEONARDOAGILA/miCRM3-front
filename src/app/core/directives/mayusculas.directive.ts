import { Directive, HostListener, Input } from '@angular/core';
import { NgControl } from '@angular/forms';

@Directive({
  selector: '[appMayusculas]',
  standalone: false,
})
export class MayusculasDirective {
 @Input('appMayusculas') activarValidacion: boolean = true; // Parámetro para activar/desactivar

  constructor(private ngControl: NgControl) {}

  @HostListener('input', ['$event.target.value'])
  onInput(value: string): void {
    if (this.activarValidacion) {
    this.ngControl.control?.setValue(value.toUpperCase(), { emitEvent: false });
    }
  }
}
