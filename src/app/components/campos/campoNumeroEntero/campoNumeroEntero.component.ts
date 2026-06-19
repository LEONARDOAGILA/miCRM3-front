import { Component, Input, Output, EventEmitter } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { DirectiveModule } from "../../../core/directives/directive.module";
import { ValidacionCedulaRucService } from "../../../service/validacionCedulaRucService";

@Component({
  selector: 'app-campoNumeroEntero',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DirectiveModule],  
  templateUrl: './campoNumeroEntero.component.html',
  styleUrls: ['./campoNumeroEntero.component.css']
})
export class CampoNumeroEnteroComponent {
  @Input() control: FormControl;
  @Input() label: string;
  @Input() placeholder: string;
  @Input() type: number = 0;
  @Input() maxLength: number;
  @Input() validaCedula: boolean = false;
  @Output() valueChange = new EventEmitter<string>();
  @Output() blur = new EventEmitter<string>(); // ← NUEVO: emitir el valor al perder foco

  esCedulaValida: boolean = true;

  onInputChange(value: string) {
    this.valueChange.emit(value);
  }

  onBlur(event: FocusEvent) {
    const value = (event.target as HTMLInputElement).value;
    this.valueChange.emit(value);
    this.blur.emit(value); // ← EMITIR EL VALOR EN EL BLUR

    if (this.validaCedula) {
      this.esCedulaValida = ValidacionCedulaRucService.esIdentificacionValida(value);
      if (!this.esCedulaValida) {
        this.control.setErrors({ cedulaInvalida: true });
      } else {
        this.control.setErrors(null);
      }
    }
  }
}