import { Component, Input, Output, EventEmitter, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';

import { SelectorIconosComponent } from './selectorIconos/selectorIconos.component';
import { claseParaPintar, partesDeIcono } from './iconos-fa';

/**
 * Campo para elegir un icono de Font Awesome.
 *
 * ANTES SE ESCRIBÍA A MANO: «fa-phone», «fab fa-whatsapp». Eso pide saberse
 * los nombres de memoria y acertar con el prefijo, y una errata no avisa: el
 * icono simplemente no sale. Ahora se abre una rejilla y se elige.
 *
 * SE PUEDE SEGUIR ESCRIBIENDO. El campo de texto se queda, porque quien ya se
 * sabe el nombre va más rápido tecleándolo, y porque si algún día hace falta
 * una clase que el selector no ofrezca se puede poner igual.
 *
 * GUARDA LO MISMO QUE ANTES —«fa-phone», «fab fa-whatsapp»—, que es lo que ya
 * hay en ventas.gestiones_tipos y lo que entiende `iconoDelTipo`. No cambia el
 * formato: cambia cómo se escribe.
 *
 * Vale con [(ngModel)] y con [formControl]: lleva ControlValueAccessor.
 */
@Component({
  selector: 'app-campoIcono',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './campoIcono.component.html',
  styleUrls: ['./campoIcono.component.css'],
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => CampoIconoComponent),
    multi: true,
  }],
})
export class CampoIconoComponent implements ControlValueAccessor {

  @Input() placeholder = 'fa-phone';
  @Input() maxlength = 40;

  /** Qué se pinta cuando no hay nada elegido. */
  @Input() iconoPorDefecto = 'fa-comment-dots';

  @Input()
  set disabled(v: boolean) { this.deshabilitado = !!v; }

  /** Por si la pantalla quiere enterarse aparte del ngModel. */
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

  /** Lo que se le pone al <i> de la izquierda: lo elegido o el de por defecto. */
  get vistaPrevia(): string {
    return claseParaPintar(this.valor || this.iconoPorDefecto);
  }

  /** Si lo escrito se entiende como un icono; si no, se avisa sin estorbar. */
  get seEntiende(): boolean {
    return !this.valor || partesDeIcono(this.valor) !== null;
  }

  alEscribir(e: Event): void {
    this.valor = (e.target as HTMLInputElement).value.trim();
    this.avisar();
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

    const ref = this._modal.open(SelectorIconosComponent, {
      size: 'lg',
      centered: true,
      backdrop: 'static',
      scrollable: true,
    });
    ref.componentInstance.valor = this.valor;

    ref.result.then(
      (clase: string) => {
        this.valor = (clase ?? '').trim();
        this.avisar();
      },
      // Cancelar no es un error: se deja como estaba
      () => {},
    );
  }
}
