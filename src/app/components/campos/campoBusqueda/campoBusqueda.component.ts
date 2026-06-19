
import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-campoBusqueda',
  standalone: true,
  templateUrl: './campoBusqueda.component.html',
  styleUrls: ['./campoBusqueda.component.css'],
  imports: [],
})
export class CampoBusquedaComponent {
    @Input() id: string = 'filter-text-box'; // ID por defecto
    @Input() placeholder: string = 'Buscar'; // Placeholder por defecto
    @Input() iconClass: string = 'fa fa-search fa-lg'; // Clases del icono por defecto
    @Output() searchChange = new EventEmitter<string>(); // Evento para cambios en el valor
    @Input() containerClass: string = '';

    onInputChange(event: Event) {
        const value = (event.target as HTMLInputElement).value;
        this.searchChange.emit(value);
    }
}