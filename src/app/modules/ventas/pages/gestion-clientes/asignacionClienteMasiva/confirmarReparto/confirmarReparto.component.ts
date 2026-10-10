import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

import { ModalHeaderComponent } from '../../../../../../components/modal/modal-header/modal-header.component';

/** Cuántos clientes le tocan a cada persona, ya calculado por la pantalla. */
export interface RepartoPrevisto {
  etiqueta: string;
  cuantos: number;
}

/**
 * «¿Seguro que reparto estos clientes?».
 *
 * Es el paso de decisión del reparto en bloque. Antes vivía dentro de la
 * propia pantalla, cambiando lo que se veía: se iba la rejilla, aparecía el
 * resumen y había que dar a «Volver» para seguir mirando. Como modal no se
 * pierde de vista lo que hay detrás y la decisión se toma —o se cancela— sin
 * mover la pantalla.
 *
 * NO HACE EL REPARTO: sólo contesta sí o no. El trabajo lo sigue haciendo la
 * pantalla, que es la que tiene lo marcado, el aviso de carga y el resultado.
 * Un modal que además guardara tendría que devolver errores y recargar listas
 * que no son suyas.
 */
@Component({
  selector: 'app-confirmarReparto',
  standalone: true,
  imports: [CommonModule, ModalHeaderComponent],
  templateUrl: './confirmarReparto.component.html',
  styleUrls: ['./confirmarReparto.component.css'],
})
export class ConfirmarRepartoComponent {

  /** Cuántos clientes se van a mover. */
  @Input() clientes = 0;

  /** «Vendedor», «Cobrador»… el papel que se reparte. */
  @Input() rolNombre = 'Responsable';

  /** Cómo quedaría repartido; vacío si se les quita el responsable. */
  @Input() reparto: RepartoPrevisto[] = [];

  /** Sin nadie elegido, lo que se hace es quitarles el responsable. */
  @Input() quitaResponsable = false;

  /** La agenda sólo viaja con el vendedor. */
  @Input() laAgendaCuenta = false;
  @Input() moverAgenda = true;

  constructor(public modal: NgbActiveModal) {}

  get rolEnMinuscula(): string {
    return (this.rolNombre || '').toLowerCase();
  }
}
