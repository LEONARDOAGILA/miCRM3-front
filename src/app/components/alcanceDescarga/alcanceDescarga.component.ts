import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

import { ModalHeaderComponent } from '../modal/modal-header/modal-header.component';

/** Qué se lleva el usuario: lo que tiene delante o todo lo que cumple el filtro. */
export type AlcanceDescarga = 'pagina' | 'todo';

/** Para qué botón se pregunta; sólo cambia cómo se llaman las cosas. */
export type AccionDescarga = 'imprimir' | 'excel' | 'csv';

/**
 * El menú del botón derecho tiene opciones; esto tiene dos. Lo que necesita
 * saber quien lo abre.
 */
export interface DatosAlcanceDescarga {
  accion: AccionDescarga;
  /** Cómo se llama lo que se descarga, en plural: «marcas», «usuarios». */
  nombrePlural: string;
  /** Cuántas filas hay delante del usuario ahora mismo. */
  enLaPagina: number;
  /** Cuántas cumplen el filtro en total. */
  enTotal: number;
  /** Los filtros puestos, ya en castellano. Vacío = ninguno. */
  filtros?: string[];
  /** Qué viene marcado al abrir. Sin poner, la página. */
  porOmision?: AlcanceDescarga;
}

/**
 * Pregunta qué descargar: la página o todo.
 *
 * POR QUÉ PREGUNTAR. Las dos respuestas son razonables y ninguna es la
 * correcta siempre: quien está mirando una página concreta quiere ESA, y
 * quien acaba de filtrar quiere TODO lo que cumple el filtro. Decidirlo por
 * él significa que la mitad de las veces se descarga algo que no esperaba, y
 * en un PDF de doscientas páginas eso se nota tarde.
 *
 *     const ref = modal.open(AlcanceDescargaComponent, { centered: true, size: 'sm' });
 *     ref.componentInstance.datos = { accion: 'excel', nombrePlural: 'marcas', … };
 *     const alcance = await ref.result;      // 'pagina' | 'todo'; si cancela, lanza
 *
 * NO DESCARGA NADA: devuelve lo que se eligió y se cierra.
 *
 * Quien lo abre debería ahorrarse la pregunta cuando no hay nada que
 * preguntar —si la página YA es todo lo que hay, las dos respuestas dan el
 * mismo fichero— y llamar directamente a su exportación.
 */
@Component({
  selector: 'app-alcance-descarga',
  standalone: true,
  imports: [CommonModule, ModalHeaderComponent],
  templateUrl: './alcanceDescarga.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./alcanceDescarga.component.css'],
})
export class AlcanceDescargaComponent {

  @Input() datos: DatosAlcanceDescarga = {
    accion: 'excel', nombrePlural: 'registros', enLaPagina: 0, enTotal: 0,
  };

  /** Lo marcado. Se fija en ngOnInit-less: el getter de abajo lo arranca. */
  public elegido: AlcanceDescarga | null = null;

  constructor(public modal: NgbActiveModal) {}

  /** Lo que está marcado ahora (la primera vez, lo que pidió quien abrió). */
  get alcance(): AlcanceDescarga {
    return this.elegido ?? this.datos.porOmision ?? 'pagina';
  }

  marcar(valor: AlcanceDescarga): void {
    this.elegido = valor;
  }

  // ---------- Textos ----------

  get titulo(): string {
    const nombre = this.datos.nombrePlural;
    switch (this.datos.accion) {
      case 'imprimir': return `Imprimir ${nombre}`;
      case 'csv':      return `Exportar ${nombre} a CSV`;
      default:         return `Exportar ${nombre} a Excel`;
    }
  }

  /** El botón de confirmar dice lo que va a pasar, no «Aceptar». */
  get textoConfirmar(): string {
    return this.datos.accion === 'imprimir' ? 'Imprimir' : 'Exportar';
  }

  get iconoConfirmar(): string {
    return this.datos.accion === 'imprimir' ? 'fa-print' : 'fa-download';
  }

  get hayFiltros(): boolean {
    return (this.datos.filtros?.length ?? 0) > 0;
  }

  /**
   * Si las dos opciones dan lo mismo no debería haberse abierto esto, pero si
   * pasa se avisa en lugar de hacer creer que se está eligiendo algo.
   */
  get mismaCosa(): boolean {
    return this.datos.enLaPagina >= this.datos.enTotal;
  }

  confirmar(): void {
    this.modal.close(this.alcance);
  }
}
