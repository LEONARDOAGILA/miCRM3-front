import { Component, Input, Output, EventEmitter, ViewChild, ElementRef } from '@angular/core';

@Component({
  selector: 'app-campoBusquedaPaginacion',
  standalone: true,
  templateUrl: './campoBusquedaPaginacion.component.html',
  styleUrls: ['./campoBusquedaPaginacion.component.css'],
})
export class CampoBusquedaPaginacionComponent {
  @Input() id: string = 'filter-text-box';
  @Input() placeholder: string = 'Buscar';
  @Input() iconClass: string = 'fa fa-search fa-lg';
  @Input() containerClass: string = '';

  // Evento para búsqueda manual (cuando el usuario quiere buscar)
  @Output() buscar = new EventEmitter<string>();

  @ViewChild('inputElement') inputElement!: ElementRef<HTMLInputElement>;

  /**
   * Evento que se dispara cuando el input pierde el foco
   */
  onBlur(event: FocusEvent) {
    // const value = (event.target as HTMLInputElement).value;
    // this.buscar.emit(value);
  }

  /**
   * Método público para limpiar el campo desde fuera
   */
  reset() {
    if (this.inputElement) {
      this.inputElement.nativeElement.value = '';
      // Opcional: también podrías emitir búsqueda vacía
      this.buscar.emit('');
    }
  }

  /**
   * Evento que se dispara al presionar Enter
   * Emite el valor y quita el foco del input
   */
  onKeyupEnter(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      const input = event.target as HTMLInputElement;
      const value = input.value;
      
      // Emitir el valor de búsqueda
      this.buscar.emit(value);
      
      // Quitar el foco del input (esto hará que se pierda el foco y se ejecute onBlur si está configurado)
      input.blur();
    }
  }

  /**
   * Evento al hacer clic en el botón de lupa
   */
  onButtonClick() {
    const input = document.getElementById(this.id) as HTMLInputElement;
    if (input) {
      this.buscar.emit(input.value);
      input.blur(); // También quita el foco al hacer clic en la lupa
    }
  }
}