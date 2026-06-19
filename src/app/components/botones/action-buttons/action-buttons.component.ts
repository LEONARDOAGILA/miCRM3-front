import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-action-buttons',
  templateUrl: './action-buttons.component.html',
  styleUrls: ['./action-buttons.component.scss'],
  standalone: false,
})
export class ActionButtonsComponent {

  @Input() buttonCambioClave: boolean = false; // Agrega esta línea
  @Input() buttonAdd: boolean = false; // Agrega esta línea
  @Input() buttonAdd2: boolean = false; // Agrega esta línea
  @Input() buttonView: boolean = false; // Agrega esta línea
  @Input() buttonEdit: boolean = false; // Agrega esta línea
  @Input() buttonClone: boolean = false; // Agrega esta línea
  @Input() buttonDelete: boolean = false; // Agrega esta línea
  @Input() accesoModel: any;
  @Output() cambioClave = new EventEmitter<void>();
  @Output() add = new EventEmitter<void>();
  @Output() view = new EventEmitter<void>();
  @Output() edit = new EventEmitter<void>();
  @Output() clone = new EventEmitter<void>();
  @Output() delete = new EventEmitter<void>();

  onCambioClave() { this.cambioClave.emit(); }
  onAdd() { this.add.emit(); }
  onView() { this.view.emit(); }
  onEdit() { this.edit.emit(); }
  onClone() { this.clone.emit(); }
  onDelete() { this.delete.emit(); }
}
