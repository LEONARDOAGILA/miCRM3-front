import { Component, Input, Output, EventEmitter } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { DirectiveModule } from "../../../core/directives/directive.module";

@Component({
  selector: 'app-campoTexto',
  standalone: true, // Marca el componente como standalone
  imports: [CommonModule, ReactiveFormsModule,DirectiveModule], // Importa los módulos necesarios  
  templateUrl: './campoTexto.component.html',
  styleUrls: ['./campoTexto.component.css']
})
export class CampoTextoComponent   {
  @Input() control: FormControl; // Control del formulario
  @Input() label: string; // Etiqueta del campo
  @Input() placeholder: string; // Placeholder del input
  @Input() type: string = 'text'; // Tipo de input (text, email, etc.)
  @Input() maxLength: number; // Longitud máxima del campo
  @Input() minLength: number; // Longitud máxima del campo
  @Output() valueChange = new EventEmitter<string>(); // Evento para cambios en el valor
  @Input() noEspacios: boolean = false; // Parámetro para activar/desactivar
  @Input() mayusculas: boolean = false; // Parámetro para activar/desactivar
  @Input() soloLetras: boolean = false; // Parámetro para activar/desactivar
  @Input() trimEspacios: boolean = false; // Parámetro para activar/desactivar
  onInputChange(value: string) {
    this.valueChange.emit(value); // Emite el nuevo valor
  }
}
