import { Component, Input, Output, EventEmitter, forwardRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';

import { IconoTiendaComponent } from './iconoTienda.component';
import { SelectorIconosTiendaComponent } from './selectorIconosTienda/selectorIconosTienda.component';
import { existeIcono } from './iconos-tienda';

/**
 * Campo para elegir uno de los iconos que dibuja la TIENDA.
 *
 * EL HERMANO DE app-campoIcono, para el otro juego de dibujos. Aquél elige
 * entre los dos mil de Font Awesome, que son los del CRM; éste, entre los
 * ochenta y pico SVG que la tienda lleva dentro, que son los únicos que la
 * tienda puede pintar.
 *
 * AQUÍ NO SE ESCRIBE A MANO, y en aquél sí. La diferencia no es un descuido:
 * la lista es corta y cerrada, el selector la enseña entera, y un nombre
 * escrito que no esté en ella no da error en ninguna parte — simplemente deja
 * el hueco vacío en la tienda y nadie se entera hasta que lo ve un cliente.
 *
 * Guarda el nombre tal cual: «facebook», «telefono», «ubicacion».
 *
 * Vale con [(ngModel)] y con [formControl]: lleva ControlValueAccessor.
 */
@Component({
  selector: 'app-campoIconoTienda',
  standalone: true,
  imports: [CommonModule, IconoTiendaComponent],
  templateUrl: './campoIconoTienda.component.html',
  styleUrls: ['./campoIconoTienda.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => CampoIconoTiendaComponent),
    multi: true,
  }],
})
export class CampoIconoTiendaComponent implements ControlValueAccessor {

  /** Qué se pinta cuando no hay nada elegido. */
  @Input() iconoPorDefecto = 'etiqueta';

  @Input()
  set disabled(v: boolean) { this.deshabilitado = !!v; }

  /** Por si la pantalla quiere enterarse aparte del formulario. */
  @Output() elegido = new EventEmitter<string>();

  public valor = '';
  public deshabilitado = false;

  constructor(private _modal: NgbModal) {}

  // ================================================================
  // ControlValueAccessor
  // ================================================================
  private alCambiar: (v: string) => void = () => {};
  private alTocar: () => void = () => {};

  writeValue(v: string | null): void { this.valor = (v ?? '').trim(); }
  registerOnChange(fn: (v: string) => void): void { this.alCambiar = fn; }
  registerOnTouched(fn: () => void): void { this.alTocar = fn; }
  setDisabledState(v: boolean): void { this.deshabilitado = v; }

  private avisar(): void {
    this.alCambiar(this.valor);
    this.alTocar();
    this.elegido.emit(this.valor);
  }

  // ================================================================
  // El campo
  // ================================================================

  /** Lo que se pinta: lo elegido, o el de por defecto apagado. */
  get vistaPrevia(): string {
    return this.valor || this.iconoPorDefecto;
  }

  /**
   * Si lo guardado sigue existiendo en la tienda.
   *
   * PUEDE DEJAR DE EXISTIR SIN QUE NADIE TOQUE ESTA PANTALLA: basta con que la
   * tienda le cambie el nombre a un icono. Entonces aquí se avisa en rojo, que
   * es mejor que enseñar un hueco igual que el de «sin icono».
   */
  get seEntiende(): boolean {
    return !this.valor || existeIcono(this.valor);
  }

  limpiar(): void {
    if (this.deshabilitado || !this.valor) { return; }
    this.valor = '';
    this.avisar();
  }

  /**
   * Abre la rejilla.
   *
   * `backdrop: 'static'` a propósito: se está eligiendo dentro de un
   * formulario a medio escribir, y cerrar el modal con un clic fuera por
   * error no cuesta nada pero despista.
   */
  abrirSelector(): void {
    if (this.deshabilitado) { return; }

    const ref = this._modal.open(SelectorIconosTiendaComponent, {
      size: 'lg',
      centered: true,
      backdrop: 'static',
      scrollable: true,
    });
    ref.componentInstance.valor = this.valor;

    ref.result.then(
      (nombre: string) => {
        this.valor = (nombre ?? '').trim();
        this.avisar();
      },
      // Cancelar no es un error: se deja como estaba
      () => {},
    );
  }
}
