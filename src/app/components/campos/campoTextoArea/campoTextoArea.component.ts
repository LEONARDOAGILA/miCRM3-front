import { Component, Input, Output, EventEmitter } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { DirectiveModule } from "../../../core/directives/directive.module";

@Component({
  selector: 'app-campoTextoArea',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DirectiveModule],
  templateUrl: './campoTextoArea.component.html',
  styleUrls: ['./campoTextoArea.component.css']
})
export class CampoTextoAreaComponent {
  @Input() control: FormControl; // Control del formulario
  @Input() label: string; // Etiqueta del campo
  @Input() placeholder: string; // Placeholder del textarea
  @Input() maxLength: number; // Longitud máxima del campo
  @Input() minLength: number; // Longitud mínima del campo
  @Output() valueChange = new EventEmitter<string>(); // Evento para cambios en el valor
  @Input() noEspacios: boolean = false; // Parámetro para activar/desactivar
  @Input() mayusculas: boolean = false; // Parámetro para activar/desactivar
  @Input() soloLetras: boolean = false; // Parámetro para activar/desactivar
  @Input() trimEspacios: boolean = false; // Parámetro para activar/desactivar

  onInputChange(value: string) {
    this.valueChange.emit(value); // Emite el nuevo valor
  }
}