import {
  AfterViewInit, Component, ElementRef, HostListener, Input, OnDestroy, OnInit, TemplateRef, ViewChild,
  forwardRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { Editor, NgxEditorModule, Toolbar } from 'ngx-editor';
import { keymap } from 'prosemirror-keymap';
import {
  addColumnAfter, addColumnBefore, addRowAfter, addRowBefore, deleteColumn, deleteRow,
  deleteTable, goToNextCell, mergeCells, splitCell, tableEditing, toggleHeaderRow,
} from 'prosemirror-tables';

import { ESQUEMA_NOTAS } from '../../../modules/ventas/interfaces/esquemaNotas';
import { GrupoHuecos } from '../../../modules/ventas/interfaces/huecosPlantilla';
import { HuecosPlantillaComponent } from '../huecosPlantilla/huecosPlantilla.component';
import {
  TAMANOS, TIPOGRAFIAS, aplicarMarca, nombreDeFamilia, normalizarFamilia, valorDeMarca,
} from '../../../modules/ventas/interfaces/marcasEditor';
import {
  AlmacenDeImagenes, avisoDeAjenas, pegarHtmlConImagenes, queSePega,
} from '../../../modules/ventas/interfaces/pegarEnEditor';

/**
 * Un editor de texto con formato, listo para usar en cualquier formulario.
 *
 * Esto estaba repetido en tres pantallas —las notas del cliente, «Qué se
 * habló» de la gestión y el mensaje de un asunto del catálogo—, cada una con
 * su barra, su esquema y su pegado. Aquí está una sola vez.
 *
 * Qué trae, y por qué cada cosa:
 *
 *   · LA BARRA COMPLETA, en grupos. <ngx-editor-menu> pinta una tira seguida y
 *     no sabe de grupos, así que va una barra por grupo y entre ellas un hilo.
 *   · LETRA Y TAMAÑO. ngx-editor no los trae: son marcas del esquema y el
 *     desplegable va a mano (ver marcasEditor.ts).
 *   · PEGAR SIN ROMPER NADA. Al pegar un correo o una página, las imágenes
 *     vienen en base64 o apuntando a otro servidor; con un `almacen` se suben
 *     y se cambia el src. Sin él se pega tal cual, que para un campo pequeño
 *     vale, pero engorda la fila (ver pegarEnEditor.ts).
 *   · HOJA. Con [hoja] se escribe sobre un papel blanco centrado sobre fondo
 *     gris, como en la pestaña Notas y como en el visor: se ve lo que se va a
 *     leer en vez de rellenar una caja y descubrir después cómo queda.
 *   · EXPANDIR. Con [expandible] hay un botón que lo lleva a pantalla
 *     completa. Un correo con formato no se escribe en un campo de 7rem.
 *
 * Vale con formControl y con ngModel: es un ControlValueAccessor.
 *
 *     <app-campoNgxEditor [control]="form.controls['nota']"></app-campoNgxEditor>
 *     <app-campoNgxEditor [(ngModel)]="texto" [hoja]="true"></app-campoNgxEditor>
 *
 * Los de si/no van atados —[hoja]="true"— y no sueltos: un atributo a secas
 * llega como cadena vacia, que es falso, y el campo sale sin la hoja sin que
 * nada avise.
 */
/** Las pestañas de la cinta. «tabla» es contextual: sólo dentro de una. */
export type PestanaCampo = 'archivo' | 'inicio' | 'insertar' | 'tabla';

@Component({
  selector: 'app-campoNgxEditor',
  standalone: true,
  imports: [CommonModule, FormsModule, NgxEditorModule, HuecosPlantillaComponent],
  templateUrl: './campoNgxEditor.component.html',
  styleUrls: ['./campoNgxEditor.component.css'],
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => CampoNgxEditorComponent),
    multi: true,
  }],
})
export class CampoNgxEditorComponent implements OnInit, AfterViewInit, OnDestroy, ControlValueAccessor {

  @Input() placeholder = 'Escribe aquí…';

  /** Alto del área de escritura cuando NO está en hoja ni expandido. */
  @Input() alto = '9rem';

  /** Sobre papel blanco y fondo gris, como la pestaña Notas. */
  @Input() hoja = false;

  /** Enseña el botón de pantalla completa. */
  @Input() expandible = false;

  /**
   * La barra, al estilo de la cinta de Word: pestañas y grupos con nombre.
   *
   * La tira corrida vale para un campo de dos líneas; para escribir un correo
   * entero no, porque con veinte botones seguidos encontrar «justificado» es
   * ir probando. Con [cinta] salen agrupados y con la etiqueta debajo, que es
   * lo que permite buscar por el nombre del grupo en vez de por el icono.
   */
  @Input() cinta = false;

  /**
   * Lo que va en la pestaña «Archivo» de la cinta.
   *
   * Lo pone quien usa el campo, no el campo: guardar, imprimir o exportar
   * son de cada pantalla —el editor no sabe dónde se guarda lo que se
   * escribe—. Sin plantilla, la pestaña no sale.
   *
   * Va de <ng-template> y no de <ng-content> porque la pestaña aparece y
   * desaparece: el contenido proyectado se crea una sola vez, y dentro de
   * un @switch eso da sorpresas.
   *
   * Los botones de dentro se escriben con las clases de la cinta
   * (.cinta__grupo, .cinta__btn…), así que la pantalla que la aporta tiene
   * que traerse cinta.css con un @import: el css de un componente no
   * alcanza a lo que proyecta en otro.
   */
  @Input() archivo: TemplateRef<unknown> | null = null;

  /**
   * Los huecos —{cliente}, {telefono}…— que se ofrecen en «Insertar».
   *
   * Sin esto no sale el grupo: en un campo donde el texto no es una
   * plantilla —«Qué se habló» de una gestión ya ocurrida— un {cliente} no
   * lo iba a cambiar nadie y quedaría escrito así para siempre.
   */
  @Input() huecos: GrupoHuecos[] | null = null;

  /** Sin barra: para un campo donde sólo se quiere texto con negritas. */
  @Input() barraCorta = false;

  @Input() soloLectura = false;

  /**
   * Dónde van a parar las imágenes que se peguen.
   *
   * Sin esto una imagen pegada se queda incrustada en base64 dentro del valor,
   * que para un correo de plantilla acaba pesando más que todo lo demás.
   */
  @Input() almacen: AlmacenDeImagenes | null = null;

  /** Para avisar de las imágenes que no se pudieron traer. */
  @Input() avisar: ((mensaje: string, titulo: string) => void) | null = null;

  public editor!: Editor;
  public valor = '';
  public expandido = false;
  public subiendoImagen = false;

  public readonly tipografias = TIPOGRAFIAS;
  public readonly tamanos = TAMANOS;

  public readonly tbDeshacer: Toolbar = [['undo', 'redo']];
  public readonly tbFuente: Toolbar = [
    ['bold', 'italic', 'underline', 'strike'],
    ['superscript', 'subscript'],
    ['text_color', 'background_color'],
    ['format_clear'],
  ];
  public readonly tbParrafo: Toolbar = [
    ['ordered_list', 'bullet_list'],
    ['indent', 'outdent'],
    ['align_left', 'align_center', 'align_right', 'align_justify'],
  ];
  public readonly tbEstilos: Toolbar = [
    [{ heading: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] }],
    ['blockquote', 'code'],
  ];
  public readonly tbInsertar: Toolbar = [['link'], ['image'], ['horizontal_rule']];
  /** Como tbInsertar pero sin el botón de imagen de ngx-editor: en la cinta
      la imagen es nuestra, porque el suyo pide una URL y lo que hace falta es
      coger un fichero del disco. */
  public readonly tbEnlaces: Toolbar = [['link'], ['horizontal_rule']];

  @ViewChild('caja') caja?: ElementRef<HTMLElement>;
  @ViewChild('selectorImagen') selectorImagen?: ElementRef<HTMLInputElement>;

  private alCambiar: (v: any) => void = () => { };
  private alTocar: () => void = () => { };
  private contenedor: Element | null = null;

  ngOnInit(): void {
    // Con el esquema de las notas: es el que trae las marcas de letra y tamaño
    // y los nodos de tabla, para que una tabla pegada no se pierda.
    this.editor = new Editor({
      schema: ESQUEMA_NOTAS,
      plugins: [
        // Lo que hace que una tabla se pueda usar: seleccionar celdas
        // arrastrando, moverse por ellas y arrastrar el borde para el ancho.
        // Va siempre, también sin cinta: una tabla pegada hay que poder
        // tocarla aunque no estén los botones.
        tableEditing(),
        // Tabulador de celda en celda, como en Word. Va antes que el resto
        // para que dentro de una tabla gane al Tab de las listas.
        keymap({
          Tab: goToNextCell(1),
          'Shift-Tab': goToNextCell(-1),
        }),
      ],
    });
  }

  /**
   * La escucha del pegado va a mano y EN CAPTURA.
   *
   * Con un (paste) de plantilla la escucha es de burbujeo: cuando el evento
   * llega, el editor ya ha metido lo suyo y cambiarlo es tarde.
   */
  ngAfterViewInit(): void {
    setTimeout(() => {
      this.contenedor = this.caja?.nativeElement.querySelector('.NgxEditor__Content') ?? null;
      this.contenedor?.addEventListener('paste', this.alPegar, true);
    });
  }

  ngOnDestroy(): void {
    this.contenedor?.removeEventListener('paste', this.alPegar, true);
    this.editor?.destroy();
  }

  // ---------- ControlValueAccessor ----------

  writeValue(v: any): void { this.valor = v ?? ''; }
  registerOnChange(fn: any): void { this.alCambiar = fn; }
  registerOnTouched(fn: any): void { this.alTocar = fn; }
  setDisabledState(desactivado: boolean): void { this.soloLectura = desactivado; }

  alEscribir(v: string): void {
    this.valor = v;
    this.alCambiar(v);
    this.alTocar();
  }

  // ---------- Pantalla completa ----------

  alternarExpandido(): void {
    this.expandido = !this.expandido;
  }

  /** Escape cierra la pantalla completa, no el modal que haya detrás. */
  @HostListener('document:keydown.escape', ['$event'])
  alEscape(ev: KeyboardEvent): void {
    if (this.expandido) {
      this.expandido = false;
      ev.stopPropagation();
      ev.preventDefault();
    }
  }

  // ---------- Letra y tamaño ----------

  get tipografiaActual(): string {
    const guardada = valorDeMarca(this.editor, 'tipografia', 'familia');
    if (!guardada) { return ''; }

    const igual = normalizarFamilia(guardada);
    const deLaLista = this.tipografias.find(t => t.valor && normalizarFamilia(t.valor) === igual);
    return deLaLista ? deLaLista.valor : guardada;
  }

  get tamanoActual(): string {
    return valorDeMarca(this.editor, 'tamano', 'tamano');
  }

  /** La lista, con la de ahora añadida si viene de algo pegado. */
  get tipografiasVisibles(): { valor: string; nombre: string }[] {
    const actual = this.tipografiaActual;
    if (!actual || this.tipografias.some(t => t.valor === actual)) { return this.tipografias; }
    return [...this.tipografias, { valor: actual, nombre: nombreDeFamilia(actual) }];
  }

  get tamanosVisibles(): { valor: string; nombre: string }[] {
    const actual = this.tamanoActual;
    if (!actual || this.tamanos.some(t => t.valor === actual)) { return this.tamanos; }
    return [...this.tamanos, { valor: actual, nombre: actual }];
  }

  cambiarTipografia(valor: string): void {
    aplicarMarca(this.editor, 'tipografia', valor ? { familia: valor } : null);
  }

  cambiarTamano(valor: string): void {
    aplicarMarca(this.editor, 'tamano', valor ? { tamano: valor } : null);
  }

  // ---------- Las pestañas de la cinta ----------

  private _pestana: PestanaCampo = 'inicio';

  /**
   * La pestaña que se está viendo.
   *
   * La de «Tabla» es contextual, como las de Word: sólo existe con el cursor
   * dentro de una tabla. Si uno se sale mientras la tiene abierta, la pestaña
   * desaparece y hay que devolverlo a una que exista, o se quedaría mirando una
   * cinta vacía.
   */
  get pestana(): PestanaCampo {
    if (this._pestana === 'tabla' && !this.enTabla) { return 'inicio'; }
    if (this._pestana === 'archivo' && !this.archivo) { return 'inicio'; }
    return this._pestana;
  }
  set pestana(valor: PestanaCampo) { this._pestana = valor; }

  // ---------- Cuenta de palabras ----------

  private _htmlContado = '\u0000';
  private _conteo = { palabras: 0, caracteres: 0 };

  /**
   * Palabras y caracteres, como la barra de estado de Word.
   *
   * Se calcula sobre el HTML porque es lo que ya está en `valor`, y se guarda
   * el último contado para no repetir el trabajo en cada ciclo de detección de
   * cambios de Angular —que con el editor abierto son muchos—. El valor inicial
   * es un carácter imposible en un HTML para que la primera vez sí entre.
   */
  get conteo(): { palabras: number; caracteres: number } {
    const html = this.valor ?? '';
    if (html === this._htmlContado) { return this._conteo; }
    this._htmlContado = html;

    const texto = html
      // Las celdas y los bloques se separan: si no, «</td><td>» pega dos
      // palabras y cuenta una
      .replace(/<(\/(td|th|tr|p|div|li|h[1-6]|blockquote)|br\s*\/?)>/gi, ' ')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&[a-z]+;|&#\d+;/gi, 'x')
      .replace(/\s+/g, ' ')
      .trim();

    this._conteo = {
      palabras: texto ? texto.split(' ').length : 0,
      caracteres: texto.length,
    };
    return this._conteo;
  }

  // ---------- Tablas ----------

  /** ¿El cursor está dentro de una tabla? Decide qué botones tienen sentido. */
  get enTabla(): boolean {
    const vista = this.editor?.view;
    if (!vista) { return false; }
    // deleteTable sólo se puede aplicar dentro de una tabla: preguntarle a él
    // evita repetir aquí el recorrido por los padres del nodo
    return deleteTable(vista.state);
  }

  /**
   * Mete una tabla donde está el cursor.
   *
   * Tres por tres con encabezado, que es lo que se pide el 90% de las veces;
   * filas y columnas se añaden después con los botones. Empezar preguntando
   * cuántas filas quiere uno es un paso de más para acertar poco.
   */
  insertarTabla(filas = 3, columnas = 3): void {
    const vista = this.editor?.view;
    if (!vista || this.soloLectura) { return; }

    const { table, table_row, table_cell, table_header } = vista.state.schema.nodes;
    const celda = (cabecera: boolean) =>
      (cabecera ? table_header : table_cell).createAndFill()!;

    const cuerpo = [];
    cuerpo.push(table_row.create(null, Array.from({ length: columnas }, () => celda(true))));
    for (let f = 1; f < filas; f++) {
      cuerpo.push(table_row.create(null, Array.from({ length: columnas }, () => celda(false))));
    }

    const tr = vista.state.tr.replaceSelectionWith(table.create(null, cuerpo));
    vista.dispatch(tr.scrollIntoView());
    vista.focus();
  }

  /** Ejecuta un comando de tabla sobre el editor y le devuelve el foco. */
  private comandoTabla(comando: any): void {
    const vista = this.editor?.view;
    if (!vista || this.soloLectura) { return; }
    comando(vista.state, vista.dispatch);
    vista.focus();
  }

  filaArriba(): void    { this.comandoTabla(addRowBefore); }
  filaAbajo(): void     { this.comandoTabla(addRowAfter); }
  columnaIzq(): void    { this.comandoTabla(addColumnBefore); }
  columnaDer(): void    { this.comandoTabla(addColumnAfter); }
  quitarFila(): void    { this.comandoTabla(deleteRow); }
  quitarColumna(): void { this.comandoTabla(deleteColumn); }
  unirCeldas(): void    { this.comandoTabla(mergeCells); }
  partirCelda(): void   { this.comandoTabla(splitCell); }
  alternarCabecera(): void { this.comandoTabla(toggleHeaderRow); }
  quitarTabla(): void   { this.comandoTabla(deleteTable); }

  // ---------- Meter texto donde está el cursor ----------

  /**
   * Mete un texto donde esté el cursor, sin tocar el resto.
   *
   * Es lo que hace falta para los huecos: pegarlos al final obliga a
   * cortarlos y llevarlos a su sitio, que es más trabajo que escribirlos.
   *
   * Si había algo seleccionado, lo sustituye —como hace cualquier editor—.
   */
  insertarTexto(texto: string): void {
    if (!texto || this.soloLectura) { return; }
    this.editor?.commands.insertText(texto).focus().exec();
  }

  // ---------- Imagen desde el disco ----------

  abrirSelectorImagen(): void { this.selectorImagen?.nativeElement.click(); }

  alElegirImagen(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const fichero = input.files?.[0];
    input.value = '';
    if (fichero) { this.insertarImagen(fichero); }
  }

  /**
   * Mete una imagen del disco.
   *
   * Con `almacen` se sube y en el HTML queda la URL. Sin él se incrusta en
   * base64: no hay dónde subirla —el mensaje de un asunto no cuelga de ningún
   * cliente— y es mejor eso que no poder poner una firma o un logotipo.
   */
  private async insertarImagen(fichero: File): Promise<void> {
    if (this.subiendoImagen || this.soloLectura) { return; }
    try {
      this.subiendoImagen = true;
      const url = this.almacen
        ? await this.almacen.subir(fichero)
        : await this.comoDataUri(fichero);
      if (!url) {
        this.avisar?.('No se pudo insertar la imagen', 'Error');
        return;
      }
      this.editor.commands.insertImage(url, { alt: fichero.name, title: fichero.name }).focus().exec();
    } finally {
      this.subiendoImagen = false;
    }
  }

  private comoDataUri(fichero: File): Promise<string | null> {
    return new Promise(resolver => {
      const lector = new FileReader();
      lector.onload = () => resolver(String(lector.result || '') || null);
      lector.onerror = () => resolver(null);
      lector.readAsDataURL(fichero);
    });
  }

  // ---------- Pegar ----------

  private alPegar = (ev: ClipboardEvent): void => {
    if (this.soloLectura || !this.almacen) { return; }

    const que = queSePega(ev);
    if (!que) { return; }   // texto a secas: que lo pegue el editor

    ev.preventDefault();
    ev.stopPropagation();

    if ('fichero' in que) { this.subirYPoner(que.fichero); }
    else { this.pegarConImagenes(que.html); }
  };

  private async subirYPoner(fichero: File): Promise<void> {
    if (this.subiendoImagen || !this.almacen) { return; }
    try {
      this.subiendoImagen = true;
      const url = await this.almacen.subir(fichero);
      if (!url) {
        this.avisar?.('No se pudo subir la imagen', 'Error');
        return;
      }
      this.editor.commands.insertImage(url, { alt: fichero.name, title: fichero.name }).focus().exec();
    } finally {
      this.subiendoImagen = false;
    }
  }

  private async pegarConImagenes(html: string): Promise<void> {
    if (this.subiendoImagen || !this.almacen) { return; }
    try {
      this.subiendoImagen = true;
      const { ajenas } = await pegarHtmlConImagenes(this.editor, this.almacen, html);
      if (ajenas) { this.avisar?.(avisoDeAjenas(ajenas), 'Imágenes que faltan'); }
    } catch (error) {
      console.error('Error al pegar el contenido con imágenes:', error);
      this.avisar?.('No se pudo pegar el contenido', 'Error');
    } finally {
      this.subiendoImagen = false;
    }
  }
}
