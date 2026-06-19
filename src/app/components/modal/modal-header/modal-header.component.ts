import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common'; // 👈 necesario para ngClass

@Component({
  selector: 'app-modal-header',
  standalone: true,
  templateUrl: './modal-header.component.html',
  styleUrls: ['./modal-header.component.css'],
  imports: [CommonModule], // 👈 aquí lo importas
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

