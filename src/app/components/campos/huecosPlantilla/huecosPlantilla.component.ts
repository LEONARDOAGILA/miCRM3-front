import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

import { GRUPOS_HUECOS, GrupoHuecos } from '../../../modules/ventas/interfaces/huecosPlantilla';

/**
 * Los botones para meter un hueco —{cliente}, {telefono}…— en el texto.
 *
 * Un desplegable por grupo y no quince botones seguidos: quince se leen peor
 * que cuatro nombres, y quien busca el teléfono del cliente ya sabe que está
 * en «Cliente». Al elegir uno se avisa con (elegido) y el desplegable vuelve
 * a su sitio, para poder meter el mismo dos veces seguidas.
 *
 * No inserta nada: no sabe dónde. Quien lo use mete el texto donde esté el
 * cursor, que es justo lo que cambia entre un <textarea> y el editor.
 *
 * Usa las clases de la cinta, así que quien lo pinta tiene que traerse
 * cinta.css con un @import (el css de un componente no alcanza a otro).
 */
@Component({
  selector: 'app-huecosPlantilla',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './huecosPlantilla.component.html',
  styleUrls: ['./huecosPlantilla.component.css'],
})
export class HuecosPlantillaComponent {

  /** Qué grupos se ofrecen. Por defecto, todos. */
  @Input() grupos: GrupoHuecos[] = GRUPOS_HUECOS;

  @Input() desactivado = false;

  /** El hueco elegido, con sus llaves: «{telefono}». */
  @Output() elegido = new EventEmitter<string>();

  alElegir(ev: Event): void {
    const select = ev.target as HTMLSelectElement;
    const clave = select.value;
    // Vuelve al rótulo del grupo: si se quedara en lo elegido, meter el mismo
    // hueco dos veces no dispararía el (change) la segunda
    select.selectedIndex = 0;
    if (clave) { this.elegido.emit(clave); }
  }
}
