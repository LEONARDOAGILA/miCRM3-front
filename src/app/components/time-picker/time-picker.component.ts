import { Component, forwardRef, Input, ViewChild, ElementRef, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, NG_VALIDATORS, AbstractControl, ValidationErrors, Validator } from '@angular/forms';

@Component({
  selector: 'app-time-picker',
  templateUrl: './time-picker.component.html',
  styleUrls: ['./time-picker.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => TimePickerComponent),
      multi: true
    },
    {
      provide: NG_VALIDATORS,
      useExisting: forwardRef(() => TimePickerComponent),
      multi: true
    }
  ]
})
export class TimePickerComponent implements ControlValueAccessor, Validator, OnInit, OnDestroy {
  
  @Input() placeholder: string = 'HH:MM';
  @Input() format: '12h' | '24h' = '24h';
  @Input() minuteStep: number = 15;
  @Input() required: boolean = false;
  @Input() minTime: string = '00:00';
  @Input() maxTime: string = '23:59';
  @Input() control: any;
  
  @ViewChild('timeInput') timeInput!: ElementRef<HTMLInputElement>;
  @ViewChild('dropdownMenu') dropdownMenu!: ElementRef;
  
  // Variables de control
  value: string = '';
  displayValue: string = '';
  showDropdown: boolean = false;
  touched: boolean = false;
  disabled: boolean = false;
  
  // Variables para selección (valores reales)
  selectedHour: number = 0;
  selectedMinute: number = 0;
  period: 'AM' | 'PM' = 'AM';
  
  // Variables temporales (para el dropdown)
  tempHour: number = 0;
  tempMinute: number = 0;
  tempPeriod: 'AM' | 'PM' = 'AM';
  
  // Listas para el selector
  hours: number[] = [];
  minutes: number[] = [];
  periods: ('AM' | 'PM')[] = ['AM', 'PM'];
  
  // Callbacks
  onChangeFn: any = () => {};
  onTouchedFn: any = () => {};
  onValidatorChangeFn: any = () => {};
  
  // Manejador de click outside
  private clickOutsideHandler: any;
  
  constructor() {}
  
  ngOnInit() {
    this.initializeTimeLists();
  }
  
  ngOnDestroy() {
    this.removeClickOutsideListener();
  }
  
  initializeTimeLists() {
    this.minutes = [];
    for (let i = 0; i < 60; i += this.minuteStep) {
      this.minutes.push(i);
    }
    
    this.hours = [];
    if (this.format === '12h') {
      for (let i = 1; i <= 12; i++) {
        this.hours.push(i);
      }
      this.period = 'AM';
      this.tempPeriod = 'AM';
    } else {
      for (let i = 0; i <= 23; i++) {
        this.hours.push(i);
      }
    }
  }
  
  writeValue(value: string): void {
    if (value) {
      this.value = value;
      this.parseTime(value);
      this.updateDisplayValue();
    } else {
      this.value = '';
      this.displayValue = '';
      this.selectedHour = this.format === '12h' ? 12 : 0;
      this.selectedMinute = 0;
      this.period = 'AM';
    }
  }
  
  registerOnChange(fn: any): void {
    this.onChangeFn = fn;
  }
  
  registerOnTouched(fn: any): void {
    this.onTouchedFn = fn;
  }
  
  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
    if (isDisabled) {
      this.hideDropdown();
    }
  }
  hideDropdown() {
    throw new Error('Method not implemented.');
  }
  
  validate(control: AbstractControl): ValidationErrors | null {
    const errors: ValidationErrors = {};
    
    if (this.required && !this.value) {
      errors['required'] = true;
    }
    
    if (this.value && !this.isValidTime(this.value)) {
      errors['invalidTime'] = true;
    }
    
    return Object.keys(errors).length ? errors : null;
  }
  
  registerOnValidatorChange(fn: () => void): void {
    this.onValidatorChangeFn = fn;
  }
  
  parseTime(time: string) {
    if (!time) return;
    
    let hours: number, minutes: number;
    
    if (this.format === '12h' && time.includes(' ')) {
      const [timePart, periodPart] = time.split(' ');
      [hours, minutes] = timePart.split(':').map(Number);
      this.period = periodPart as 'AM' | 'PM';
      
      if (this.period === 'PM' && hours !== 12) hours += 12;
      if (this.period === 'AM' && hours === 12) hours = 0;
    } else {
      [hours, minutes] = time.split(':').map(Number);
      
      if (this.format === '12h') {
        this.period = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12 || 12;
      }
    }
    
    this.selectedHour = hours;
    this.selectedMinute = minutes || 0;
  }
  
  updateDisplayValue() {
    if (!this.value && this.value !== '') {
      this.displayValue = '';
      return;
    }
    
    if (this.format === '12h') {
      let displayHour = this.selectedHour;
      let period = this.period;
      
      if (this.value) {
        const hours24 = this.getHours24();
        period = hours24 >= 12 ? 'PM' : 'AM';
        displayHour = hours24 % 12 || 12;
      }
      
      const displayHours = displayHour.toString().padStart(2, '0');
      const displayMinutes = this.selectedMinute.toString().padStart(2, '0');
      this.displayValue = `${displayHours}:${displayMinutes} ${period}`;
    } else {
      const hours = this.selectedHour.toString().padStart(2, '0');
      const minutes = this.selectedMinute.toString().padStart(2, '0');
      this.displayValue = `${hours}:${minutes}`;
    }
  }
  
  private getHours24(): number {
    let hours24 = this.selectedHour;
    if (this.format === '12h') {
      if (this.period === 'PM' && hours24 !== 12) hours24 += 12;
      if (this.period === 'AM' && hours24 === 12) hours24 = 0;
    }
    return hours24;
  }
  
  updateValue() {
    let finalValue: string;
    const hours24 = this.getHours24();
    
    if (this.format === '12h') {
      const hours = hours24.toString().padStart(2, '0');
      const minutes = this.selectedMinute.toString().padStart(2, '0');
      finalValue = `${hours}:${minutes}`;
      
      const displayHour = hours24 % 12 || 12;
      const period = hours24 >= 12 ? 'PM' : 'AM';
      this.displayValue = `${displayHour.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${period}`;
    } else {
      const hours = this.selectedHour.toString().padStart(2, '0');
      const minutes = this.selectedMinute.toString().padStart(2, '0');
      finalValue = `${hours}:${minutes}`;
      this.displayValue = finalValue;
    }
    
    if (this.value !== finalValue) {
      this.value = finalValue;
      this.onChangeFn(this.value);
      this.onValidatorChangeFn();
    }
  }
  
  isValidTime(time: string): boolean {
    const timeRegex = this.format === '12h' 
      ? /^(0[1-9]|1[0-2]):[0-5][0-9] (AM|PM)$/
      : /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
    return timeRegex.test(time);
  }
  
  // ABRIR DROPDOWN
  openDropdown(event: Event) {
    event.stopPropagation();
    if (!this.disabled) {
      // Copiar valores actuales a temporales
      this.tempHour = this.selectedHour;
      this.tempMinute = this.selectedMinute;
      this.tempPeriod = this.period;
      
      this.showDropdown = true;
      this.updateTempDisplayValue();
      this.updateDropdownPosition();
      this.addClickOutsideListener();
    }
  }
  
  // CERRAR DROPDOWN SIN GUARDAR
  closeDropdown() {
    this.showDropdown = false;
    this.removeClickOutsideListener();
  }
  
  // CONFIRMAR Y GUARDAR
  confirmSelection() {
    // Aplicar valores temporales a los reales
    this.selectedHour = this.tempHour;
    this.selectedMinute = this.tempMinute;
    this.period = this.tempPeriod;
    this.updateValue();
    this.closeDropdown();
  }
  
  // CANCELAR (restaurar valores originales)
  cancelSelection() {
    this.closeDropdown();
  }
  
  updateTempDisplayValue() {
    setTimeout(() => {
      const currentTimeElem = document.querySelector('.current-time');
      if (!currentTimeElem) return;
      
      if (this.format === '12h') {
        let hour24 = this.tempHour;
        if (this.tempPeriod === 'PM' && this.tempHour !== 12) hour24 = this.tempHour + 12;
        if (this.tempPeriod === 'AM' && this.tempHour === 12) hour24 = 0;
        
        const period = hour24 >= 12 ? 'PM' : 'AM';
        const displayHour = hour24 % 12 || 12;
        const displayMinutes = this.tempMinute.toString().padStart(2, '0');
        currentTimeElem.textContent = `${displayHour.toString().padStart(2, '0')}:${displayMinutes} ${period}`;
      } else {
        const hours = this.tempHour.toString().padStart(2, '0');
        const minutes = this.tempMinute.toString().padStart(2, '0');
        currentTimeElem.textContent = `${hours}:${minutes}`;
      }
    });
  }
  
  // private updateDropdownPosition() {
  //   if (this.showDropdown && this.timeInput && this.dropdownMenu) {
  //     setTimeout(() => {
  //       const rect = this.timeInput.nativeElement.getBoundingClientRect();
  //       const dropdown = this.dropdownMenu.nativeElement;
        
  //       dropdown.style.position = 'fixed';
  //       dropdown.style.top = `${rect.bottom + window.scrollY}px`;
  //       dropdown.style.left = `${rect.left + window.scrollX}px`;
  //       dropdown.style.width = `${rect.width}px`;
        
  //       const dropdownRect = dropdown.getBoundingClientRect();
  //       if (dropdownRect.bottom > window.innerHeight) {
  //         dropdown.style.top = `${rect.top + window.scrollY - dropdownRect.height - 5}px`;
  //       }
  //     });
  //   }
  // }
  
  private updateDropdownPosition() {
  if (this.showDropdown && this.timeInput && this.dropdownMenu) {
    setTimeout(() => {
      const rect = this.timeInput.nativeElement.getBoundingClientRect();
      const dropdown = this.dropdownMenu.nativeElement;
      const isMobile = window.innerWidth <= 768;
      
      if (isMobile) {
        // En móvil, el dropdown se ancla abajo
        dropdown.style.position = 'fixed';
        dropdown.style.top = 'auto';
        dropdown.style.bottom = '0';
        dropdown.style.left = '0';
        dropdown.style.right = '0';
        dropdown.style.width = '100%';
      } else {
        // En desktop, posicionamiento normal
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
        
        dropdown.style.position = 'fixed';
        dropdown.style.top = `${rect.bottom + scrollTop}px`;
        dropdown.style.left = `${rect.left + scrollLeft}px`;
        dropdown.style.width = `${rect.width}px`;
        dropdown.style.bottom = 'auto';
        dropdown.style.right = 'auto';
        
        const dropdownRect = dropdown.getBoundingClientRect();
        if (dropdownRect.bottom > window.innerHeight) {
          dropdown.style.top = `${rect.top + scrollTop - dropdownRect.height - 5}px`;
        }
      }
    });
  }
}


  private addClickOutsideListener() {
    setTimeout(() => {
      this.clickOutsideHandler = (event: MouseEvent) => {
        const isClickOutside = this.dropdownMenu && 
                               !this.dropdownMenu.nativeElement.contains(event.target as Node) &&
                               this.timeInput && 
                               !this.timeInput.nativeElement.contains(event.target as Node);
        
        if (isClickOutside && this.showDropdown) {
          this.cancelSelection();
          this.onTouched();
        }
      };
      document.addEventListener('click', this.clickOutsideHandler);
    });
  }
  
  private removeClickOutsideListener() {
    if (this.clickOutsideHandler) {
      document.removeEventListener('click', this.clickOutsideHandler);
      this.clickOutsideHandler = null;
    }
  }
  
  // SELECCIÓN DE VALORES (SOLO TEMPORALES)
  selectHour(hour: number) {
    this.tempHour = hour;
    this.updateTempDisplayValue();
  }
  
  selectMinute(minute: number) {
    this.tempMinute = minute;
    this.updateTempDisplayValue();
  }
  
  selectPeriod(period: 'AM' | 'PM') {
    this.tempPeriod = period;
    this.updateTempDisplayValue();
  }
  
  setCurrentTime() {
    const now = new Date();
    let hours = now.getHours();
    const minutes = now.getMinutes();
    
    const roundedMinutes = Math.round(minutes / this.minuteStep) * this.minuteStep;
    this.tempMinute = Math.min(roundedMinutes, 59);
    
    if (this.format === '12h') {
      this.tempPeriod = hours >= 12 ? 'PM' : 'AM';
      this.tempHour = hours % 12 || 12;
    } else {
      this.tempHour = hours;
    }
    
    this.updateTempDisplayValue();
  }
  
  clearTime() {
    this.value = '';
    this.displayValue = '';
    this.selectedHour = this.format === '12h' ? 12 : 0;
    this.selectedMinute = 0;
    this.period = 'AM';
    this.onChangeFn('');
    this.onValidatorChangeFn();
    this.closeDropdown();
    
    if (this.timeInput) {
      this.timeInput.nativeElement.value = '';
    }
  }
  
  onTouched() {
    if (!this.touched) {
      this.touched = true;
      this.onTouchedFn();
    }
  }


  
}