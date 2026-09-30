import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common'; // 👈 necesario para ngClass
import { ModalArrastrableDirective } from '../modal-arrastrable.directive';

/**
 * Cabecera estándar de los modales.
 *
 * Lleva ModalArrastrableDirective como host directive: todo modal que use
 * esta cabecera se puede mover arrastrándola, sin añadir nada en cada uno.
 * (No hay que poner también el atributo appModalArrastrable en la etiqueta:
 * Angular lo aplicaría dos veces.)
 */
@Component({
  selector: 'app-modal-header',
  standalone: true,
  templateUrl: './modal-header.component.html',
  styleUrls: ['./modal-header.component.css'],
  imports: [CommonModule], // 👈 aquí lo importas
  hostDirectives: [ModalArrastrableDirective],
})
export class ModalHeaderComponent {
  @Input() title: string = '';
  @Input() bgClass: string = 'bg-gray-200';
  @Input() textClass: string = 'text-gray-800';
  @Output() onClose = new EventEmitter<void>();

  handleClose() {
    this.onClose.emit();
  }
}

