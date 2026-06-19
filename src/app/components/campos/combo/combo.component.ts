import { Component, Input, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NG_VALUE_ACCESSOR, ControlValueAccessor, NG_VALIDATORS, Validator, AbstractControl, ValidationErrors } from '@angular/forms';
import { NgSelectModule } from '@ng-select/ng-select';

@Component({
  selector: 'app-combo',
  standalone: true,
  imports: [CommonModule, FormsModule, NgSelectModule],
  templateUrl: './combo.component.html',
  styleUrls: ['./combo.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ComboComponent),
      multi: true
    },
    {
      provide: NG_VALIDATORS,
      useExisting: forwardRef(() => ComboComponent),
      multi: true
    }
  ]
})
export class ComboComponent implements ControlValueAccessor, Validator {
  
  @Input() items: any[];
  @Input() bindLabel: string = 'name';
  @Input() bindValue: string = 'id';
  @Input() label: string = 'Seleccionar';
  @Input() required: boolean = false;
  
  value: any;
  control: AbstractControl | null = null;

  disabled: boolean = false;
  isFloating: boolean = false;
  isFocused: boolean = false;
  isDropdownOpen: boolean = false;

  // ControlValueAccessor implementation
  onChange: any = () => {};
  onTouched: any = () => {};

  writeValue(obj: any): void {
    this.value = obj;
    this.isFloating = !!obj;
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

  // Validator implementation
  validate(control: AbstractControl): ValidationErrors | null {
    this.control = control;
    if (this.required && !control.value) {
      return { required: true };
    }
    return null;
  }

  onValueChange(value: any) {
    this.value = value;
    this.isFloating = !!value || this.isFocused || this.isDropdownOpen;
    this.onChange(value);
    this.onTouched();

    
    if (this.control) {
      this.control.markAsTouched();
    }
  }

    onFocus() {
      this.isFloating = true;
      // Fuerza la detección de cambios en el próximo ciclo de eventos
      setTimeout(() => this.isFloating = true);
    }

    onBlur() {
      this.isFloating = !!this.value;
      this.onTouched();
      if (this.control) {
        this.control.markAsTouched();
      }
      setTimeout(() => this.isFloating = !!this.value);
    }

    onDropdownOpen() {
      this.isDropdownOpen = true;
      this.isFloating = true;
    }

    onDropdownClose() {
      this.isDropdownOpen = false;
      // Si no está enfocado y no hay valor, bajamos el label
      if (!this.isFocused && !this.value) {
        this.isFloating = false;
      }
    }


}