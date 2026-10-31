import { Component, EventEmitter, Input, Output, ChangeDetectionStrategy } from '@angular/core';


/**
 * STANDALONE, como el panel: se importa el componente, y el
 * `action-buttons.module.ts` que sólo servía para re-exportarlo se borró.
 *
 * De la plantilla sólo sale *ngIf: con CommonModule basta.
 */
@Component({
  selector: 'app-action-buttons',
  standalone: true,
  imports: [],
  templateUrl: './action-buttons.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./action-buttons.component.scss'],
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
