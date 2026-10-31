import { Component, Input, forwardRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NG_VALUE_ACCESSOR, ControlValueAccessor } from '@angular/forms';
import { NgSelectModule } from '@ng-select/ng-select';

/**
 * Combo de SELECCIÓN MÚLTIPLE.
 *
 * Nació como el filtro de marcas del catálogo de productos: «ver las Samsung
 * Y las LG» es una pregunta normal, y con un combo de uno en uno hay que
 * mirar dos veces y sumar a mano. Se sacó aquí para poder usarlo en el resto
 * de pantallas.
 *
 * Es un ControlValueAccessor sobre un ARRAY, así que vale con `[(ngModel)]`
 * y con `formControlName` igual que los demás campos de la casa. Vacío
 * significa «todos»: es lo que esperan los filtros, y así quitar la última
 * elección no deja la pantalla sin datos.
 *
 *     <app-combo-multi-seleccion
 *       [items]="marcas" bindLabel="nombre" bindValue="id"
 *       placeholder="Todas las marcas"
 *       [(ngModel)]="marcaFiltro" (cambiado)="recargar()">
 *     </app-combo-multi-seleccion>
 *
 * DOS COSAS QUE NO SON EVIDENTES:
 *
 *  · `items` tiene que venir de un CAMPO, no de un getter. Si el array es
 *    nuevo en cada ciclo de detección de cambios, ng-select pierde lo
 *    elegido.
 *  · Con `compacto` se pinta para una barra de herramientas (sin etiqueta
 *    flotante y más bajo); sin él, como un campo de formulario.
 */
@Component({
  selector: 'app-combo-multi-seleccion',
  standalone: true,
  imports: [CommonModule, FormsModule, NgSelectModule],
  templateUrl: './combo-multi-seleccion.component.html',
  styleUrls: ['./combo-multi-seleccion.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => ComboMultiSeleccionComponent),
    multi: true,
  }],
})
export class ComboMultiSeleccionComponent implements ControlValueAccessor {

  /** Lo que se puede elegir. Que venga de un campo, no de un getter. */
  @Input() items: any[] = [];
  /** Qué propiedad se enseña y cuál se guarda. */
  @Input() bindLabel = 'nombre';
  @Input() bindValue = 'id';

  /** El texto de cuando no hay nada elegido. */
  @Input() placeholder = 'Todos';
  /** La etiqueta de encima. Vacía en modo compacto. */
  @Input() label = '';
  /** Lo que dice al pasar por encima. */
  @Input() ayuda = '';

  /** Para una barra de herramientas: más bajo y sin etiqueta flotante. */
  @Input() compacto = false;

  /**
   * Cuántas elegidas se enseñan antes de resumir en «+N».
   *
   * CERO —lo normal— las enseña TODAS: lo que se está filtrando tiene que
   * poder leerse sin pasar el ratón por encima de un número. Se sube sólo
   * donde el sitio mande, como una barra de herramientas estrecha; ahí seis
   * chapas empujan fuera lo que venga detrás.
   *
   * Aunque se enseñen todas, la caja no crece sin fin: pasada su altura, las
   * chapas se desplazan dentro del propio campo.
   */
  @Input() maximoVisible = 0;

  /** Las que se pintan como chapa: todas, salvo que haya tope. */
  visibles(items: any[]): any[] {
    return this.maximoVisible > 0 ? items.slice(0, this.maximoVisible) : items;
  }

  /** Normalmente false: se eligen varias de una pasada. */
  @Input() cerrarAlElegir = false;

  /** Para los listados largos (categorías, clientes…). */
  @Input() buscable = true;

  public valor: any[] = [];
  public deshabilitado = false;

  // ---------- ControlValueAccessor ----------
  private alCambiar: (v: any) => void = () => {};
  private alTocar: () => void = () => {};

  writeValue(v: any): void { this.valor = Array.isArray(v) ? v : (v == null ? [] : [v]); }
  registerOnChange(fn: any): void { this.alCambiar = fn; }
  registerOnTouched(fn: any): void { this.alTocar = fn; }
  setDisabledState(d: boolean): void { this.deshabilitado = d; }

  /** Avisa de que cambió la selección. */
  seleccionCambiada(): void {
    this.alCambiar(this.valor ?? []);
    this.alTocar();
  }

  /** Cuántas hay elegidas, para el resumen «+N». */
  get cuantas(): number { return this.valor?.length ?? 0; }
}
