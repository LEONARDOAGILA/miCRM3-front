import { Component, Input, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

import { ModalHeaderComponent } from '../../../modal/modal-header/modal-header.component';
import { CampoBusquedaComponent } from '../../campoBusqueda/campoBusqueda.component';
import { IconoTiendaComponent } from '../iconoTienda.component';
import { ICONOS } from '../iconos-tienda';

/**
 * «Elegir icono de la tienda»: la rejilla con los dibujos que la tienda sabe
 * pintar.
 *
 * NO GUARDA NADA: devuelve el nombre elegido —«facebook», «telefono»— y se
 * cierra. Lo que se haga con él es cosa de quien lo abrió.
 *
 * SE PINTAN TODOS. Son ochenta y pico, no dos mil como los de Font Awesome:
 * caben de una vez y así se eligen mirando, que es como se elige un dibujo.
 * El buscador está para quien ya sabe el nombre.
 */
@Component({
  selector: 'app-selectorIconosTienda',
  standalone: true,
  imports: [CommonModule, ModalHeaderComponent, CampoBusquedaComponent, IconoTiendaComponent],
  templateUrl: './selectorIconosTienda.component.html',
  styleUrls: ['./selectorIconosTienda.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class SelectorIconosTiendaComponent implements OnInit {

  /** Lo que ya estaba puesto, para abrir la rejilla con ese marcado. */
  @Input() valor: string | null = null;

  /** El catálogo entero, en el orden en que está escrito. */
  public readonly todos: string[] = Object.keys(ICONOS);

  public termino = '';
  public encontrados: string[] = this.todos;
  public elegido: string | null = null;

  constructor(public modal: NgbActiveModal) {}

  ngOnInit(): void {
    this.elegido = (this.valor ?? '').trim() || null;
  }

  buscar(termino: string): void {
    this.termino = (termino ?? '').trim().toLowerCase();
    // Se busca por el nombre y nada más: los nombres ya están en castellano
    // («ubicacion», «camion») y son lo único que hay escrito de cada icono.
    this.encontrados = this.termino
      ? this.todos.filter(n => n.includes(this.termino))
      : this.todos;
  }

  marcar(nombre: string): void { this.elegido = nombre; }

  /** Un doble clic elige y cierra: es lo que se intenta en una rejilla. */
  confirmar(nombre?: string): void {
    const elegido = nombre ?? this.elegido;
    if (!elegido) { return; }
    this.modal.close(elegido);
  }

  sinIcono(): void { this.modal.close(''); }

}
