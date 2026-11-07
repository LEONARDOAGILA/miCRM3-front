import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

import { ModalHeaderComponent } from '../../../../../../components/modal/modal-header/modal-header.component';

/** Lo que el kiosco deja tocar. Es lo que entra y lo que sale del modal. */
export interface AjustesDelKiosco {
  umbral: number;
  confirmaciones: number;
  esperaSegundos: number;
  dispositivo: string;
  exigirParpadeo: boolean;
  guardarFoto: boolean;
}

/**
 * AJUSTES DEL KIOSCO (modal).
 *
 * Antes estaban siempre a la vista en el panel derecho, quitándole sitio a
 * las marcaciones del día. Se tocan una vez al montar el kiosco y casi nunca
 * más, así que viven detrás del engranaje de la barra.
 *
 * El modal trabaja sobre una COPIA: lo que se mueve aquí no toca al kiosco
 * hasta pulsar Guardar, y Salir lo deja como estaba.
 */
@Component({
  selector: 'app-ajustes-kiosco',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalHeaderComponent],
  templateUrl: './ajustesKiosco.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./ajustesKiosco.component.css'],
})
export class AjustesKioscoComponent {

  /** Los valores que tiene ahora el kiosco. */
  @Input() set ajustes(v: AjustesDelKiosco) { this.copia = { ...v }; }

  public copia: AjustesDelKiosco = {
    umbral: 0.5,
    confirmaciones: 6,
    esperaSegundos: 60,
    dispositivo: 'Kiosco',
    exigirParpadeo: true,
    guardarFoto: true,
  };

  constructor(public modal: NgbActiveModal) {}

  guardar(): void {
    this.copia.dispositivo = (this.copia.dispositivo ?? '').trim() || 'Kiosco';
    this.modal.close(this.copia);
  }
}
