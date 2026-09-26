import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormControl, ReactiveFormsModule, ValidationErrors, ValidatorFn } from '@angular/forms';
import { Subscription } from 'rxjs';

import { ValidacionCedulaRucService } from '../../../service/validacionCedulaRucService';

/** Lo que guarda la columna tipo_identificacion. */
export type TipoIdentificacion = 'CC' | 'RUC' | 'PAS' | string | null | undefined;

/** Lo que devuelve el control cuando el número no cuadra. */
export interface FalloIdentificacion {
  /** Para distinguirlos desde fuera si hiciera falta: 'largo', 'provincia', 'verificador'… */
  clave: string;
  /** El texto que ve el operador. */
  mensaje: string;
}

/** Cuántos dígitos pide cada documento. */
export const LARGO_CEDULA = 10;
export const LARGO_RUC = 13;
/** El pasaporte no tiene un formato único: se acepta entre estos dos límites. */
export const LARGO_MIN_PASAPORTE = 5;
export const LARGO_MAX_PASAPORTE = 20;

/**
 * Revisa un número de identificación ecuatoriano según el tipo elegido.
 *
 * Devuelve null si está bien, o el fallo con un mensaje ya escrito. El vacío se
 * considera correcto: de que el campo sea obligatorio se encarga
 * Validators.required, no esto.
 */
export function revisarIdentificacion(valor: any, tipo: TipoIdentificacion): FalloIdentificacion | null {
  const texto = (valor ?? '').toString().trim();
  if (!texto) { return null; }

  switch ((tipo ?? '').toString().toUpperCase()) {
    case 'CC':
    case 'CEDULA':
    case 'CÉDULA':
      return revisarCedula(texto);

    case 'RUC':
      return revisarRuc(texto);

    case 'PAS':
    case 'PASAPORTE':
      return revisarPasaporte(texto);

    // Sin tipo elegido no se sabe qué pedir: se acepta lo que valga como
    // cédula o como RUC, que es lo que hacía el validador de siempre.
    default:
      return ValidacionCedulaRucService.esIdentificacionValida(texto)
        ? null
        : { clave: 'identificacion', mensaje: 'El número de identificación no es válido.' };
  }
}

function revisarCedula(texto: string): FalloIdentificacion | null {
  if (!/^\d+$/.test(texto)) {
    return { clave: 'digitos', mensaje: 'La cédula solo admite números.' };
  }
  if (texto.length !== LARGO_CEDULA) {
    return { clave: 'largo', mensaje: `La cédula debe tener ${LARGO_CEDULA} dígitos.` };
  }
  if (!ValidacionCedulaRucService.esCodigoProvinciaValido(texto)) {
    return { clave: 'provincia', mensaje: 'Los dos primeros dígitos no son una provincia válida (01 a 24, o 30).' };
  }
  if (!ValidacionCedulaRucService.esTercerDigitoCedulaValido(Number(texto.charAt(2)))) {
    return { clave: 'tercerDigito', mensaje: 'El tercer dígito no corresponde a una cédula (debe ir de 0 a 6).' };
  }
  if (!ValidacionCedulaRucService.esCedulaValida(texto)) {
    return { clave: 'verificador', mensaje: 'El último dígito no coincide: revisa el número.' };
  }
  return null;
}

function revisarRuc(texto: string): FalloIdentificacion | null {
  if (!/^\d+$/.test(texto)) {
    return { clave: 'digitos', mensaje: 'El RUC solo admite números.' };
  }
  if (texto.length !== LARGO_RUC) {
    return { clave: 'largo', mensaje: `El RUC debe tener ${LARGO_RUC} dígitos.` };
  }
  if (!ValidacionCedulaRucService.esCodigoProvinciaValido(texto)) {
    return { clave: 'provincia', mensaje: 'Los dos primeros dígitos no son una provincia válida (01 a 24, o 30).' };
  }

  const tercero = Number(texto.charAt(2));
  if (!((tercero >= 0 && tercero <= 6) || tercero === 9)) {
    return { clave: 'tercerDigito', mensaje: 'El tercer dígito no corresponde a ningún tipo de RUC (0 a 6 o 9).' };
  }
  if (!ValidacionCedulaRucService.esCodigoEstablecimientoValido(texto)) {
    return { clave: 'establecimiento', mensaje: 'Los tres últimos dígitos son el establecimiento: 001 o mayor.' };
  }
  if (!ValidacionCedulaRucService.esRucValido(texto)) {
    return { clave: 'verificador', mensaje: 'El RUC no es válido: revisa el número.' };
  }
  return null;
}

function revisarPasaporte(texto: string): FalloIdentificacion | null {
  if (texto.length < LARGO_MIN_PASAPORTE || texto.length > LARGO_MAX_PASAPORTE) {
    return {
      clave: 'largo',
      mensaje: `El pasaporte debe tener entre ${LARGO_MIN_PASAPORTE} y ${LARGO_MAX_PASAPORTE} caracteres.`,
    };
  }
  if (!/^[A-Za-z0-9-]+$/.test(texto)) {
    return { clave: 'formato', mensaje: 'El pasaporte solo admite letras, números y guiones.' };
  }
  return null;
}

/**
 * Validador suelto, para los formularios que quieran la comprobación sin el
 * campo. El tipo puede ser fijo o una función, para cuando lo elige el usuario:
 *
 *   control.addValidators(validadorIdentificacion(() => this.form.value.tipo_identificacion));
 */
export function validadorIdentificacion(tipo: TipoIdentificacion | (() => TipoIdentificacion)): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const cual = typeof tipo === 'function' ? tipo() : tipo;
    const fallo = revisarIdentificacion(control.value, cual);
    return fallo ? { identificacion: fallo } : null;
  };
}

/**
 * Campo de número de identificación, hermano de app-campoTexto.
 *
 * Comprueba cédula y RUC con el algoritmo del SRI (ValidacionCedulaRucService)
 * y deja pasar el pasaporte, que no tiene dígito verificador. Qué se exige
 * depende del tipo de documento, que llega de dos maneras:
 *
 *   <!-- el tipo lo elige otro control del mismo formulario -->
 *   <app-campoIdentificacion
 *     [control]="form.controls['numero_identificacion']"
 *     [tipoControl]="form.controls['tipo_identificacion']"
 *     label="Nº identificación">
 *   </app-campoIdentificacion>
 *
 *   <!-- o es siempre el mismo -->
 *   <app-campoIdentificacion [control]="ctrl" tipo="RUC" label="RUC"></app-campoIdentificacion>
 *
 * El componente ENGANCHA su validador al control que recibe, así que el
 * formulario del padre queda inválido mientras el número no cuadre —no hace
 * falta comprobar nada a mano antes de guardar— y lo suelta al destruirse.
 */
@Component({
  selector: 'app-campoIdentificacion',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './campoIdentificacion.component.html',
  styleUrls: ['./campoIdentificacion.component.css'],
})
export class CampoIdentificacionComponent implements OnInit, OnChanges, OnDestroy {

  @Input() control: FormControl;

  /** Tipo fijo, cuando la pantalla siempre pide el mismo documento. */
  @Input() tipo: TipoIdentificacion = 'CC';

  /**
   * Control que guarda el tipo de documento. Si viene, manda sobre [tipo] y el
   * campo se revalida solo cada vez que el usuario cambia el combo.
   */
  @Input() tipoControl: FormControl | null = null;

  @Input() label: string = 'Nº identificación';
  @Input() placeholder: string = '';
  @Input() limpiable: boolean = true;
  /** Tope para el pasaporte; cédula y RUC llevan el suyo (10 y 13). */
  @Input() maxLength: number = LARGO_MAX_PASAPORTE;
  /** Deja ver debajo qué documento se reconoció. Se puede apagar. */
  @Input() mostrarPista: boolean = true;

  @Output() valueChange = new EventEmitter<string>();

  private validador: ValidatorFn | null = null;
  private suscripcion: Subscription | null = null;

  // ================================================================
  // ENGANCHE Y DESENGANCHE DEL VALIDADOR
  // ================================================================

  ngOnInit(): void {
    if (!this.control) { return; }

    this.validador = validadorIdentificacion(() => this.tipoActual);
    this.control.addValidators(this.validador);
    this.control.updateValueAndValidity({ emitEvent: false });

    // Al cambiar de documento cambia lo que se exige: hay que volver a mirar
    // el número que ya estaba escrito.
    this.suscripcion = this.tipoControl?.valueChanges.subscribe(() => {
      this.control.updateValueAndValidity({ emitEvent: false });
    }) ?? null;
  }

  ngOnChanges(cambios: SimpleChanges): void {
    // El tipo puede venir atado con [tipo]="..." en vez de por control
    if (cambios['tipo'] && !cambios['tipo'].firstChange && this.validador) {
      this.control?.updateValueAndValidity({ emitEvent: false });
    }
  }

  ngOnDestroy(): void {
    this.suscripcion?.unsubscribe();

    // El control es del formulario del padre y le sobrevive: si no se quita,
    // el validador seguiría ahí (y apuntando a este componente muerto).
    if (this.control && this.validador) {
      this.control.removeValidators(this.validador);
      this.control.updateValueAndValidity({ emitEvent: false });
    }
  }

  // ================================================================
  // QUÉ DOCUMENTO ES
  // ================================================================

  get tipoActual(): TipoIdentificacion {
    return this.tipoControl ? this.tipoControl.value : this.tipo;
  }

  private get clave(): string {
    return (this.tipoActual ?? '').toString().toUpperCase();
  }

  get esCedula(): boolean { return this.clave === 'CC' || this.clave.startsWith('CED') || this.clave.startsWith('CÉD'); }
  get esRuc(): boolean { return this.clave === 'RUC'; }
  get esPasaporte(): boolean { return this.clave === 'PAS' || this.clave.startsWith('PASAP'); }

  /** Solo números en cédula y RUC; el pasaporte lleva letras. */
  get soloNumeros(): boolean { return this.esCedula || this.esRuc; }

  get largoMaximo(): number {
    if (this.esCedula) { return LARGO_CEDULA; }
    if (this.esRuc) { return LARGO_RUC; }
    return this.maxLength || LARGO_MAX_PASAPORTE;
  }

  /** Lo que se pone de ejemplo si el padre no dio placeholder. */
  get textoEjemplo(): string {
    if (this.placeholder) { return this.placeholder; }
    if (this.esCedula) { return 'Ej: 0102030405'; }
    if (this.esRuc) { return 'Ej: 0102030405001'; }
    if (this.esPasaporte) { return 'Ej: AB123456'; }
    return 'Número de identificación';
  }

  get icono(): string {
    if (this.esRuc) { return 'fa-building'; }
    if (this.esPasaporte) { return 'fa-passport'; }
    return 'fa-id-card';
  }

  // ================================================================
  // MENSAJES
  // ================================================================

  get valor(): string {
    return (this.control?.value ?? '').toString();
  }

  /**
   * Con el número ya completo no hay que esperar a que salga del campo: el
   * error sale en cuanto se escribe el último dígito. A medias solo se avisa
   * cuando ya lo dejó (touched), para no ir regañando mientras teclea.
   */
  get mostrarError(): boolean {
    if (!this.control || this.control.valid) { return false; }
    return this.control.touched || (this.soloNumeros && this.valor.length >= this.largoMaximo);
  }

  get mostrarValido(): boolean {
    return !!this.control && this.control.valid && !!this.valor && (this.control.touched || this.control.dirty);
  }

  get fallo(): FalloIdentificacion | null {
    return this.control?.getError('identificacion') ?? null;
  }

  /** Qué documento se reconoció, para que se vea que la validación corrió. */
  get pista(): string {
    if (!this.mostrarPista || !this.valor) { return ''; }

    if (this.esPasaporte) {
      return this.control?.valid ? 'Pasaporte: no lleva dígito verificador, se guarda tal cual.' : '';
    }
    if (!this.control?.valid) { return ''; }

    if (this.esCedula) {
      return this.valor.substring(0, 2) === '30' ? 'Cédula de extranjero residente' : 'Cédula válida';
    }
    if (this.esRuc) {
      const tercero = Number(this.valor.charAt(2));
      if (tercero === 9) { return 'RUC de sociedad privada'; }
      if (tercero === 6 && !ValidacionCedulaRucService.esRucPersonaNaturalValido(this.valor)) {
        return 'RUC de sociedad pública';
      }
      return 'RUC de persona natural';
    }
    return '';
  }

  /** Neutro (gris) para el pasaporte, verde para lo que sí se comprobó. */
  get pistaEsAviso(): boolean { return this.esPasaporte; }

  // ================================================================
  // ESCRITURA
  // ================================================================

  onInputChange(valor: string): void {
    const limpio = this.normalizar(valor);
    if (limpio !== valor) {
      // setValue repinta el input, así que el carácter que sobraba ni se ve
      this.control.setValue(limpio, { emitEvent: false });
    }
    this.valueChange.emit(limpio);
  }

  /** Quita lo que ese documento no admite y corta por el largo máximo. */
  private normalizar(valor: string): string {
    let texto = (valor ?? '').replace(/\s+/g, '');

    if (this.soloNumeros) {
      texto = texto.replace(/[^0-9]/g, '');
    } else if (this.esPasaporte) {
      texto = texto.replace(/[^A-Za-z0-9-]/g, '').toUpperCase();
    }

    return texto.slice(0, this.largoMaximo);
  }

  limpiar(): void {
    this.control.setValue('');
    this.control.markAsDirty();
    this.valueChange.emit('');
  }
}
