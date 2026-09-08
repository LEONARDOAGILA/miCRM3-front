import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-modal-footer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './modal-footer.component.html',
  styleUrls: ['./modal-footer.component.css']
})
export class ModalFooterComponent {

  /**
   * Muestra el botón de guardar.
   *
   * OJO con el nombre: no deshabilita nada, decide si el botón aparece.
   * Se conserva porque lo usan 26 llamadas en 13 pantallas; renombrarlo
   * sería un cambio aparte.
   */
  @Input() isDisabled = false;

  /**
   * Operación en curso: bloquea ambos botones y convierte el de guardar en
   * un indicador de progreso. Evita el doble envío por doble clic, que antes
   * cada modal tenía que resolver por su cuenta (y varios no lo hacían).
   */
  @Input() cargando = false;

  /** Textos configurables, por si un modal necesita otro verbo. */
  @Input() textoCerrar = 'Salir';
  @Input() textoGuardar = 'Guardar';

  @Output() onClose = new EventEmitter<void>();
  @Output() onSubmit = new EventEmitter<void>();

  handleClose() {
    this.onClose.emit();
  }

  handleSubmit(event: Event) {
    this.onSubmit.emit();
  }
}
