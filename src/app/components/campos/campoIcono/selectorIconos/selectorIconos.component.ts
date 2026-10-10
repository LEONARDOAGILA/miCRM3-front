import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

import { ModalHeaderComponent } from '../../../modal/modal-header/modal-header.component';
import { CampoBusquedaComponent } from '../../campoBusqueda/campoBusqueda.component';
import { IconosService } from '../iconos.service';
import {
  IconoFa, ICONOS_SUGERIDOS, NOMBRE_ESTILO, SINONIMOS,
  claseDeIcono, claseParaPintar, partesDeIcono,
} from '../iconos-fa';

/** Cuántos se pintan de una vez. Ver `TOPE`. */
const TOPE = 240;

/**
 * «Elegir icono»: la rejilla de iconos de Font Awesome.
 *
 * NO GUARDA NADA: devuelve la clase elegida —«fa-phone», «fab fa-whatsapp»— y
 * se cierra. Lo que se haga con ella es cosa de quien lo abrió.
 *
 * SE PINTAN COMO MUCHO 240. Son dos mil opciones, y dos mil botones en el DOM
 * dejan el modal pegajoso al desplazarlo. Se dice cuántas hay en total y que
 * se escriba para afinar, que es lo que se acaba haciendo igualmente: nadie
 * encuentra un icono mirando dos mil.
 */
@Component({
  selector: 'app-selectorIconos',
  standalone: true,
  imports: [CommonModule, ModalHeaderComponent, CampoBusquedaComponent],
  templateUrl: './selectorIconos.component.html',
  styleUrls: ['./selectorIconos.component.css'],
})
export class SelectorIconosComponent implements OnInit {

  /** Lo que ya estaba puesto, para abrirlo con ese marcado. */
  @Input() valor: string | null = null;

  public readonly tope = TOPE;
  public readonly nombreEstilo = NOMBRE_ESTILO;
  public readonly claseParaPintar = claseParaPintar;

  public cargando = true;
  public termino = '';
  public estilo: 's' | 'r' | 'b' | null = null;

  /** Todo el catálogo; se pide una vez y se queda en el servicio. */
  private todos: IconoFa[] = [];

  /** Lo que cumple el filtro, sin recortar. */
  public encontrados: IconoFa[] = [];

  /** Los que valen para un tipo de gestión; sólo cuando no se ha escrito. */
  public sugeridos: IconoFa[] = [];

  /** El que está marcado ahora mismo en la rejilla. */
  public elegido: IconoFa | null = null;

  constructor(public modal: NgbActiveModal, private _iconos: IconosService) {}

  ngOnInit(): void {
    this._iconos.catalogo().subscribe(lista => {
      this.todos = lista;
      this.cargando = false;

      // Los sugeridos, en el orden en que están escritos y sólo los que
      // existan de verdad en esta versión de Font Awesome
      this.sugeridos = ICONOS_SUGERIDOS
        .map(s => lista.find(i => i.nombre === s.nombre && i.estilo === s.estilo))
        .filter((i): i is IconoFa => !!i);

      // Si ya había uno puesto, se abre con él marcado y a la vista
      const partes = partesDeIcono(this.valor);
      if (partes) {
        this.elegido = lista.find(i => i.nombre === partes.nombre && i.estilo === partes.estilo) ?? null;
        if (this.elegido) { this.termino = this.elegido.nombre; }
      }

      this.filtrar();
    });
  }

  // ================================================================
  // BUSCAR
  // ================================================================

  /** Sin tildes y en minúsculas, que es como se compara todo aquí. */
  private sinTildes(t: string): string {
    return (t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  }

  buscar(termino: string): void {
    this.termino = termino ?? '';
    this.filtrar();
  }

  filtrarPorEstilo(estilo: 's' | 'r' | 'b' | null): void {
    this.estilo = estilo;
    this.filtrar();
  }

  /** Cuántos hay de cada estilo, para los botones de arriba. */
  cuantos(estilo: 's' | 'r' | 'b' | null): number {
    return estilo === null ? this.todos.length : this.todos.filter(i => i.estilo === estilo).length;
  }

  /**
   * Lo cerca que queda un icono de lo que se buscó. Cuanto menos, antes sale.
   *
   * ESTO NO ES UN ADORNO. Sin ordenar por esto, el catálogo sale alfabético y
   * buscar «telefono» dejaba el teléfono en el puesto 21 de 30, y «visita» el
   * de la persona andando en el 76 de 92: la respuesta estaba ahí, pero nadie
   * baja hasta el 76. Comprobado sobre el catálogo de verdad.
   *
   * `peso` es el sitio que ocupa la palabra en la lista ampliada: para
   * «telefono» primero se prueba con «phone» y después con «mobile», y el
   * teléfono tiene que ganarle al móvil.
   */
  private puntos(icono: IconoFa, palabra: string, peso: number): number {
    const n = icono.nombre;
    if (n === palabra)                    { return 0 + peso; }   // justo ése
    if (n.startsWith(palabra + '-'))      { return 10 + peso; }  // phone-volume
    if (n.endsWith('-' + palabra))        { return 20 + peso; }  // square-phone
    if (n.includes(palabra))              { return 30 + peso; }
    if (icono.terminos.includes(palabra)) { return 40 + peso; }  // sólo por sinónimo
    return Infinity;                                             // no vale
  }

  private filtrar(): void {
    const q = this.sinTildes(this.termino);

    // Buscar en castellano: los términos de Font Awesome son todos ingleses,
    // así que la palabra escrita se amplía con lo que signifique en inglés.
    // Se busca por las dos, no en vez de: «star» sigue encontrando la estrella.
    const palabras = q ? q.split(/\s+/).filter(Boolean) : [];
    const ampliadas = palabras.flatMap(p => [p, ...(SINONIMOS[p] ?? '').split(/\s+/).filter(Boolean)]);

    const porEstilo = this.estilo
      ? this.todos.filter(i => i.estilo === this.estilo)
      : this.todos;

    if (!ampliadas.length) { this.encontrados = porEstilo; return; }

    // Vale con que coincida una palabra: escribir «factura» trae lo de factura
    // y lo de recibo, que es lo que se espera al buscar por una idea y no por
    // un nombre exacto. Lo que decide el orden es cuál coincide y cómo.
    const conNota = porEstilo
      .map(i => ({ i, nota: Math.min(...ampliadas.map((p, k) => this.puntos(i, p, k))) }))
      .filter(x => x.nota !== Infinity);

    // A igual nota, alfabético: que dos búsquedas parecidas no barajen la
    // rejilla de forma distinta cada vez.
    conNota.sort((a, b) => (a.nota - b.nota) || a.i.nombre.localeCompare(b.i.nombre));

    this.encontrados = conNota.map(x => x.i);
  }

  /** Los que se pintan de verdad. */
  get visibles(): IconoFa[] {
    return this.encontrados.slice(0, TOPE);
  }

  /** Si se están enseñando los sugeridos (sin escribir y sin filtro de estilo). */
  get muestraSugeridos(): boolean {
    return !this.termino.trim() && this.estilo === null && this.sugeridos.length > 0;
  }

  // ================================================================
  // ELEGIR
  // ================================================================

  /** Lo que hay que ponerle al <i> para verlo en la rejilla. */
  claseDe(icono: IconoFa): string {
    return claseParaPintar(claseDeIcono(icono));
  }

  marcar(icono: IconoFa): void {
    this.elegido = icono;
  }

  /** Doble clic: marcar y cerrar de una vez. */
  confirmar(icono?: IconoFa): void {
    if (icono) { this.elegido = icono; }
    if (!this.elegido) { return; }
    this.modal.close(claseDeIcono(this.elegido));
  }

  /** Devuelve vacío: el tipo se queda sin icono y se pinta el de por defecto. */
  sinIcono(): void {
    this.modal.close('');
  }

  /** La clase con la que se guardaría el marcado, para enseñarla abajo. */
  get claseDelElegido(): string {
    return this.elegido ? claseDeIcono(this.elegido) : '';
  }

  /** Para `track` en la rejilla: el nombre solo no basta, hay repetidos. */
  clave(_: number, i: IconoFa): string {
    return i.nombre + i.estilo;
  }
}
