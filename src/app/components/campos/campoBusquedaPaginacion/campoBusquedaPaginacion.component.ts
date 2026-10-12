import { ChangeDetectorRef, Component, Input, Output, EventEmitter, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Campo de búsqueda de los listados que paginan en el servidor.
 *
 * A diferencia de app-campoBusqueda (que filtra mientras se teclea sobre lo
 * que ya está en pantalla), este NO consulta por cada letra: emite al pulsar
 * Enter o la lupa. Con ochenta mil clientes, buscar por letra es una consulta
 * por pulsación.
 *
 * Trae la × de app-campoTexto para vaciarlo: al pulsarla se emite una
 * búsqueda vacía —que devuelve el listado completo— y, aparte, el aviso
 * `limpiado` por si la pantalla quiere hacer algo más (gestión de clientes,
 * por ejemplo, aprovecha para soltar el cliente que se estaba mirando).
 */
@Component({
  selector: 'app-campoBusquedaPaginacion',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './campoBusquedaPaginacion.component.html',
  styleUrls: ['./campoBusquedaPaginacion.component.css'],
})
export class CampoBusquedaPaginacionComponent {
  @Input() id: string = 'filter-text-box';
  @Input() placeholder: string = 'Buscar';
  @Input() iconClass: string = 'fa fa-search fa-lg';
  @Input() containerClass: string = '';

  /** Por si en alguna pantalla la × estorba. */
  @Input() limpiable: boolean = true;

  // ================================================================
  // EL BOTÓN DE QUITAR FILTROS
  // ================================================================
  // Iba suelto al lado del campo en catorce pantallas, con el mismo marcado
  // copiado una y otra vez. Aquí dentro se escribe una vez y se pide con un
  // atributo.

  /** Si se enseña el botón de quitar filtros a la izquierda del campo. */
  @Input() conLimpiarFiltros = false;

  /**
   * Si hay algo que quitar, para encender el botón.
   *
   * Lo dice la pantalla porque es la única que sabe de sus filtros de
   * columna. Si no se pasa nada, el componente se apaña con lo que sí sabe:
   * si hay texto escrito. Así una pantalla puede pedir el botón sin tocar su
   * TypeScript y aun así se enciende cuando toca.
   */
  @Input() hayFiltro: boolean | null = null;

  /**
   * Cuántas columnas llevan filtro. Sólo para el rótulo.
   *
   * Importa decirlo: con veinte columnas filtrables es fácil dejarse una
   * puesta en otra que no se está mirando y no entender por qué faltan filas.
   */
  @Input() columnasFiltradas = 0;

  /** Se pulsó el botón. La pantalla limpia lo suyo; el campo se vacía solo. */
  @Output() limpiarFiltros = new EventEmitter<void>();

  /** Lo que de verdad decide si el botón va encendido. */
  get filtroActivo(): boolean {
    return this.hayFiltro === null ? !!this.valor : this.hayFiltro;
  }

  /** Qué dice el botón al pasar por encima. */
  get tituloLimpiar(): string {
    if (!this.filtroActivo) { return 'No hay filtros que quitar'; }

    const partes: string[] = [];
    if (this.valor) { partes.push('la búsqueda'); }
    if (this.columnasFiltradas === 1) { partes.push('1 columna'); }
    else if (this.columnasFiltradas > 1) { partes.push(this.columnasFiltradas + ' columnas'); }

    return partes.length ? 'Quitar ' + partes.join(' y ') : 'Quitar los filtros';
  }

  /**
   * El botón: vacía el campo SIN pedir el listado y avisa a la pantalla.
   *
   * No se usa reset(), que emite una búsqueda vacía: la pantalla va a
   * recargar de todas formas al atender `limpiarFiltros`, y dos avisos son
   * dos consultas para lo mismo.
   */
  alLimpiarFiltros(): void {
    this.valor = '';
    if (this.inputElement) { this.inputElement.nativeElement.value = ''; }
    this.cd.detectChanges();
    this.limpiarFiltros.emit();
  }

  /** Texto de partida, cuando se vuelve a una pantalla con la búsqueda puesta. */
  @Input() set valorInicial(valor: string | null | undefined) {
    this.valor = valor ?? '';
  }

  // Evento para búsqueda manual (cuando el usuario quiere buscar)
  @Output() buscar = new EventEmitter<string>();

  /** Se pulsó la ×: la búsqueda ya se emitió vacía; esto es el aviso aparte. */
  @Output() limpiado = new EventEmitter<void>();

  /** Lo escrito; de aquí sale que se vea o no la ×. */
  public valor: string = '';

  @ViewChild('inputElement') inputElement!: ElementRef<HTMLInputElement>;

  constructor(private cd: ChangeDetectorRef) {}

  /**
   * Mientras se teclea no se busca: sólo se anota, para mostrar u ocultar la ×.
   *
   * El detectChanges() no es un adorno: `valor` se actualizaba bien pero la
   * vista no se volvía a pintar al teclear, así que la × no aparecía hasta que
   * algo más forzaba un repaso —pulsar Enter, por ejemplo—. Comprobado en el
   * navegador: con el campo escrito, comp.valor = 'tobar' y la × sin estar en
   * el DOM. Refrescando aquí sale a la primera letra.
   */
  onInput(event: Event): void {
    this.valor = (event.target as HTMLInputElement).value;
    this.cd.detectChanges();
  }

  /**
   * Evento que se dispara cuando el input pierde el foco
   */
  onBlur(event: FocusEvent) {
    // const value = (event.target as HTMLInputElement).value;
    // this.buscar.emit(value);
  }

  /**
   * Método público para limpiar el campo desde fuera
   */
  reset() {
    if (this.inputElement) {
      this.valor = '';
      this.inputElement.nativeElement.value = '';
      // Opcional: también podrías emitir búsqueda vacía
      this.buscar.emit('');
    }
  }

  /**
   * La ×: vacía el campo, pide el listado completo y avisa de que se limpió.
   *
   * Se borra el input del DOM antes de emitir porque algunas pantallas leen
   * su valor por id dentro del propio manejador.
   */
  limpiar(): void {
    if (!this.valor) { return; }

    this.valor = '';
    if (this.inputElement) { this.inputElement.nativeElement.value = ''; }

    this.buscar.emit('');
    this.limpiado.emit();

    this.inputElement?.nativeElement.focus();
  }

  /**
   * Evento que se dispara al presionar Enter
   * Emite el valor y quita el foco del input
   */
  onKeyupEnter(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      const input = event.target as HTMLInputElement;
      const value = input.value;

      this.valor = value;

      // Emitir el valor de búsqueda
      this.buscar.emit(value);

      // Quitar el foco del input (esto hará que se pierda el foco y se ejecute onBlur si está configurado)
      input.blur();
    }
  }

  /**
   * Evento al hacer clic en el botón de lupa
   */
  onButtonClick() {
    const input = document.getElementById(this.id) as HTMLInputElement;
    if (input) {
      this.valor = input.value;
      this.buscar.emit(input.value);
      input.blur(); // También quita el foco al hacer clic en la lupa
    }
  }
}
