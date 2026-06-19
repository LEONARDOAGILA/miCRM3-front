
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'app-checkbox',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule],
    templateUrl: './checkbox.component.html',
    styleUrls: ['./checkbox.component.css']    
})
export class CheckboxComponent {
    @Input() control: FormControl; // Control del formulario
    @Input() label: string; // Etiqueta del checkbox
    @Input() id: string; // ID único para el checkbox
    @Output() valueChange = new EventEmitter<boolean>(); // Evento para cambios en el valor

    onChange(event: Event) {
        const isChecked = (event.target as HTMLInputElement).checked;
        this.valueChange.emit(isChecked);
    }
}