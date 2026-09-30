import { Component, EventEmitter, Input, Output } from '@angular/core';

/**
 * Campo de búsqueda de las grillas: la lupa a la izquierda y, en cuanto se
 * escribe algo, una × a la derecha para vaciarlo.
 *
 * La × hacía falta porque las pantallas que lo usan filtran mientras se
 * teclea: para ver otra vez la lista completa había que borrar a mano letra
 * por letra. Al pulsarla se vacía el campo y se avisa igual que si se hubiera
 * borrado el texto, así que el filtro del padre se restablece solo.
 *
 * El campo sigue sin formControl a propósito: varias pantallas leen su valor
 * con document.getElementById(id).value, así que al limpiar se vacía también
 * el elemento del DOM ANTES de emitir el aviso.
 */
@Component({
  selector: 'app-campoBusqueda',
  standalone: true,
  templateUrl: './campoBusqueda.component.html',
  styleUrls: ['./campoBusqueda.component.css'],
  imports: [],
})
export class CampoBusquedaComponent {

  @Input() id: string = 'filter-text-box';
  @Input() placeholder: string = 'Buscar';
  @Input() iconClass: string = 'fa fa-search fa-lg';
  @Input() containerClass: string = '';

  /** Por si en alguna pantalla la × estorba. */
  @Input() limpiable: boolean = true;

  /** Texto de partida: útil cuando se vuelve a una pantalla con filtro puesto. */
  @Input() set valorInicial(valor: string | null | undefined) {
    this.valor = valor ?? '';
  }

  /** Lo que ya escuchaban todas las pantallas; al limpiar llega con ''. */
  @Output() searchChange = new EventEmitter<string>();

  /** Aviso aparte de que se pulsó la ×, por si el padre quiere hacer algo más. */
  @Output() limpiado = new EventEmitter<void>();

  /** Lo que hay escrito; de aquí sale que se vea o no la ×. */
  public valor: string = '';

  onInputChange(event: Event): void {
    this.valor = (event.target as HTMLInputElement).value;
    this.searchChange.emit(this.valor);
  }

  /**
   * Vacía el campo y restablece el filtro.
   *
   * El orden importa: primero se borra el input del DOM y después se emite,
   * porque quien escucha suele leer el valor del propio input (por id) dentro
   * del manejador; si se emitiera antes, seguiría leyendo el texto viejo.
   */
  limpiar(input: HTMLInputElement): void {
    if (!this.valor) { return; }

    this.valor = '';
    input.value = '';

    this.searchChange.emit('');
    this.limpiado.emit();

    // Se devuelve el foco: lo normal tras limpiar es escribir otra cosa
    input.focus();
  }
}
