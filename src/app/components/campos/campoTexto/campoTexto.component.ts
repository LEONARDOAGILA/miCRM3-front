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

  /**
   * Icono decorativo opcional a la derecha del campo, con las clases de Font
   * Awesome (por ejemplo 'fa-user' o 'fa-envelope').
   *
   * Vacío por defecto: los campos que no lo indiquen se ven igual que siempre.
   */
  @Input() icono: string = '';

  /**
   * Impide que el navegador y los gestores de contraseñas ofrezcan valores
   * guardados sobre este campo.
   *
   * Hace falta en formularios que tienen un campo de clave al lado: Chrome los
   * interpreta como un login y despliega las credenciales guardadas del
   * operador sobre el campo de usuario, que es justo lo que no queremos cuando
   * se está dando de alta a OTRA persona.
   *
   * Emite la misma combinación que ya usa app-campoClave, que es la que
   * funciona: autocomplete="new-password" (Chrome/Firefox), data-lpignore
   * (LastPass) y data-form-type="other" (Dashlane, 1Password).
   *
   * Por defecto false, para no cambiar el comportamiento del resto de pantallas.
   */
  @Input() sinAutocompletado: boolean = false;
  onInputChange(value: string) {
    this.valueChange.emit(value); // Emite el nuevo valor
  }
}
