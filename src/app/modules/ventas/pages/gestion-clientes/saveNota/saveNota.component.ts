import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import {
  AlmacenDeImagenes, avisoDeAjenas, pegarHtmlConImagenes,
} from '../../../interfaces/pegarEnEditor';
import { aplicarMarca, valorDeMarca } from '../../../interfaces/marcasEditor';
import { Editor, NgxEditorModule, Toolbar } from 'ngx-editor';
import { keymap } from 'prosemirror-keymap';
import {
  addColumnAfter, addColumnBefore, addRowAfter, addRowBefore, deleteColumn, deleteRow,
  deleteTable, goToNextCell, mergeCells, splitCell, tableEditing, toggleHeaderRow,
} from 'prosemirror-tables';
import { ESQUEMA_NOTAS } from '../../../interfaces/esquemaNotas';
import {
  GRUPOS_HUECOS, aplicarHuecos, datosDeHuecos,
} from '../../../interfaces/huecosPlantilla';
import { firstValueFrom } from 'rxjs';

import { PanelModule } from '../../../../../components/panel/panel.module';
import { HuecosPlantillaComponent } from '../../../../../components/campos/huecosPlantilla/huecosPlantilla.component';
import { NotaClienteService } from '../../../services/notaCliente.service';
import { COLORES_NOTA, ColorNota, NotaCliente, tinteDeNota } from '../../../interfaces/notaCliente';
import { ClienteModel } from '../../../interfaces/clienteModel';
import { DatosDocumentoNota, descargarNotaWord, imprimirNota, wordAHtml } from '../../../interfaces/notaDocumento';

/** Las pestañas de la cinta. «tabla» es contextual: sólo dentro de una. */
export type PestanaCinta = 'archivo' | 'inicio' | 'insertar' | 'tabla';

/**
 * Escribir o corregir una nota del cliente.
 *
 * El editor es ngx-editor, que ya estaba en el proyecto (lo declara
 * demo.module) y está hecho sobre ProseMirror: produce HTML limpio, se integra
 * con los formularios de Angular y no arrastra jQuery como las alternativas
 * clásicas. No hacía falta traer otra librería sólo para esto.
 *
 * Se parece a Word a propósito, y sin una sola dependencia de más: lo que falta
 * en ngx-editor son las tablas (prosemirror-tables) y la tipografía (dos marcas
 * del esquema, ver esquemaNotas.ts); el resto —negrita, títulos, listas,
 * sangría, alineado, super/subíndice, color, deshacer— ya lo traía y sólo había
 * que ponerlo en la barra.
 *
 * Lo que no se ve en la barra y también funciona, porque ngx-editor lo trae de
 * serie (buildInputRules + su keymap):
 *
 *   · Ctrl+B / I / U, Ctrl+Z, Ctrl+Y
 *   · «## » al empezar el renglón lo vuelve título; «1. » y «- », listas;
 *     «> », cita; «``` », bloque de código
 *   · las comillas se vuelven tipográficas, «--» se vuelve raya y «...» puntos
 *     suspensivos
 *   · Tabulador: sangra la lista, y dentro de una tabla pasa a la celda
 *     siguiente (igual que Word)
 */
@Component({
  selector: 'app-saveNota',
  standalone: true,
  imports: [CommonModule, FormsModule, NgxEditorModule, PanelModule, HuecosPlantillaComponent],
  templateUrl: './saveNota.component.html',
  styleUrls: ['./saveNota.component.css'],
})
export class SaveNotaComponent implements OnInit, AfterViewInit, OnDestroy {

  @Input() clienteId!: number;
  @Input() clienteNombre = '';
  /**
   * La ficha entera, para rellenar los huecos.
   *
   * Con el nombre solo no se puede resolver {telefono} ni {direccion}, y una
   * nota que los lleve escritos saldría con los huecos en blanco al
   * imprimirla.
   */
  @Input() cliente: ClienteModel | null = null;
  /** Si viene, se está corrigiendo; si no, es una nota nueva. */
  @Input() nota: NotaCliente | null = null;

  @Output() guardado = new EventEmitter<NotaCliente>();

  public editor!: Editor;
  public titulo = '';
  public contenido = '';
  public color: ColorNota = 'gris';
  public fijada = false;
  public guardando = false;
  /** Mientras sube una imagen: bloquea guardar para no dejarla a medias. */
  public subiendoImagen = false;
  /** Mientras se arma el .docx: evita que dos clics generen dos ficheros. */
  public exportando = false;
  /** Mientras se lee un .docx y se suben sus imágenes. */
  public importando = false;

  @ViewChild('selectorImagen') selectorImagen!: ElementRef<HTMLInputElement>;
  @ViewChild('selectorWord') selectorWord!: ElementRef<HTMLInputElement>;
  @ViewChild('cajaEdicion') cajaEdicion!: ElementRef<HTMLElement>;

  public readonly colores = COLORES_NOTA;
  /** El color de la etiqueta elegida, para el punto del membrete. */
  public readonly tinteDe = tinteDeNota;

  /**
   * La barra de ngx-editor va partida en varias, una por grupo de la cinta.
   *
   * Su <ngx-editor-menu> pinta una tira seguida y no sabe de grupos, así que la
   * única forma de tener los recuadros con su etiqueta debajo —Fuente, Párrafo,
   * Estilos, como en Word— es montar una barra por grupo. Todas apuntan al
   * mismo editor, así que entre ellas no se pelean: cada una es una vista.
   *
   * Sin 'image': el de ngx-editor pide una URL a mano, y aquí la imagen se sube
   * al servidor con el botón propio de la pestaña Insertar.
   */
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
  public readonly tbInsertar: Toolbar = [['link'], ['horizontal_rule']];

  // ---------- Las pestañas de la cinta ----------

  private _pestanaCinta: PestanaCinta = 'inicio';

  /**
   * La pestaña que se está viendo.
   *
   * La de «Tabla» es contextual, como las de Word: sólo existe con el cursor
   * dentro de una tabla. Si uno se sale mientras la tiene abierta, la pestaña
   * desaparece y hay que devolverlo a una que exista, o se quedaría mirando una
   * cinta vacía.
   */
  get pestanaCinta(): PestanaCinta {
    return (this._pestanaCinta === 'tabla' && !this.enTabla) ? 'inicio' : this._pestanaCinta;
  }
  set pestanaCinta(valor: PestanaCinta) { this._pestanaCinta = valor; }

  /**
   * Las letras del desplegable.
   *
   * Todas están en cualquier Windows, que es donde se trabaja: una tipografía
   * bonita que haya que descargar se vería distinta en cada puesto y en el
   * papel. Cada una lleva su familia de respaldo por si la nota se abre desde
   * un móvil.
   */
  public readonly tipografias = [
    // Corto porque el desplegable mide 130 px y el grupo ya se llama
    // «Fuente»: «Letra de la nota» salía cortado en «Letra de la no»
    { valor: '', nombre: 'Letra' },
    { valor: "Arial, Helvetica, sans-serif", nombre: 'Arial' },
    { valor: "Calibri, Candara, Segoe UI, sans-serif", nombre: 'Calibri' },
    { valor: "Cambria, Georgia, serif", nombre: 'Cambria' },
    { valor: "'Courier New', Courier, monospace", nombre: 'Courier New' },
    { valor: "Georgia, 'Times New Roman', serif", nombre: 'Georgia' },
    { valor: "'Segoe UI', Roboto, sans-serif", nombre: 'Segoe UI' },
    { valor: "Tahoma, Verdana, sans-serif", nombre: 'Tahoma' },
    { valor: "'Times New Roman', Times, serif", nombre: 'Times New Roman' },
    { valor: "'Trebuchet MS', Tahoma, sans-serif", nombre: 'Trebuchet MS' },
    { valor: "Verdana, Geneva, sans-serif", nombre: 'Verdana' },
  ];

  /**
   * Los tamaños, en puntos y con los números de Word.
   *
   * En puntos y no en píxeles porque son los que la gente tiene en la cabeza
   * («ponlo en 12») y porque son los que valen en el papel: la hoja de
   * impresión del visor también está en puntos.
   */
  public readonly tamanos = [
    { valor: '', nombre: 'Tam.' },
    ...[8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72]
      .map(n => ({ valor: `${n}pt`, nombre: String(n) })),
  ];

  constructor(
    public modal: NgbActiveModal,
    private _toastr: ToastrService,
    private _notaService: NotaClienteService,
  ) {}

  ngOnInit(): void {
    this.editor = new Editor({
      // El esquema de ngx-editor más las tablas (ver esquemaNotas.ts)
      schema: ESQUEMA_NOTAS,
      plugins: [
        // Lo que hace que una tabla se pueda usar: seleccionar celdas
        // arrastrando, moverse por ellas y arrastrar el borde para el ancho
        tableEditing(),
        // Tabulador de celda en celda, como en Word. Va antes que el resto
        // para que dentro de una tabla gane al Tab de las listas.
        keymap({
          Tab: goToNextCell(1),
          'Shift-Tab': goToNextCell(-1),
        }),
      ],
    });

    if (this.nota) {
      this.titulo = this.nota.titulo ?? '';
      this.contenido = this.nota.contenido ?? '';
      this.color = this.nota.color ?? 'gris';
      this.fijada = !!this.nota.fijada;
    }
  }

  /**
   * Las escuchas de pegar y soltar van EN CAPTURA, puestas a mano.
   *
   * Con un (paste) de plantilla la escucha es de burbujeo: el evento llega
   * primero al área de escritura, ProseMirror lo atiende y mete el HTML tal
   * cual —imágenes en base64 o apuntando a otro servidor incluidas—, y para
   * cuando llega aquí ya es tarde: el preventDefault no deshace lo hecho. El
   * resultado era que la nota se veía bien al pegar y al guardar perdía las
   * fotos, porque el servidor tira esas imágenes.
   *
   * En captura se atiende antes de que ProseMirror lo vea, que es el único
   * momento en el que se puede cambiar lo que se va a pegar.
   */
  ngAfterViewInit(): void {
    const caja = this.cajaEdicion?.nativeElement;
    if (!caja) { return; }
    caja.addEventListener('paste', this.alPegar, true);
    caja.addEventListener('drop', this.alSoltarImagen, true);
  }

  ngOnDestroy(): void {
    const caja = this.cajaEdicion?.nativeElement;
    if (caja) {
      caja.removeEventListener('paste', this.alPegar, true);
      caja.removeEventListener('drop', this.alSoltarImagen, true);
    }

    // ProseMirror deja escuchas y un estado vivo: sin esto, abrir y cerrar el
    // modal veinte veces deja veinte editores en memoria
    this.editor?.destroy();
  }

  get titulo_modal(): string {
    const que = this.nota ? 'Modificar nota' : 'Nueva nota';
    return que + (this.clienteNombre ? ' · ' + this.clienteNombre : '');
  }

  /** El texto sin etiquetas, para saber si hay algo escrito de verdad. */
  private get hayContenido(): boolean {
    // Una nota que es sólo una captura es una nota perfectamente válida, así
    // que la imagen cuenta aunque no haya una letra escrita
    if (/<img\b/i.test(this.contenido ?? '')) { return true; }

    const sinEtiquetas = (this.contenido ?? '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .trim();
    return sinEtiquetas.length > 0;
  }

  // ================================================================
  // TIPOGRAFÍA Y TAMAÑO
  // ================================================================

  /**
   * La letra de donde está el cursor, devuelta como la opción de la lista.
   *
   * No vale con devolver lo que guarda la marca: el navegador reescribe
   * «Georgia, 'Times New Roman', serif» con comillas dobles al pintarlo, así
   * que al volver a abrir la nota el valor ya no es idéntico al de ninguna
   * opción y el desplegable se quedaba en blanco aunque el texto sí estuviera
   * en Georgia. Se compara sin comillas ni espacios y se devuelve el valor de
   * la opción, que es lo que el <select> necesita para marcarla.
   */
  get tipografiaActual(): string {
    const guardada = valorDeMarca(this.editor, 'tipografia', 'familia');
    if (!guardada) { return ''; }

    const igual = this.normalizarFamilia(guardada);
    const deLaLista = this.tipografias
      .find(t => t.valor && this.normalizarFamilia(t.valor) === igual);

    // Si no es de la lista (viene de algo pegado), vale la suya tal cual:
    // tipografiasVisibles le añade su propia opción
    return deLaLista ? deLaLista.valor : guardada;
  }

  /** El tamaño de donde está el cursor. */
  get tamanoActual(): string {
    return valorDeMarca(this.editor, 'tamano', 'tamano');
  }

  /** Dos familias son la misma aunque cambien las comillas o los espacios. */
  private normalizarFamilia(familia: string): string {
    return familia.replace(/["']/g, '').replace(/\s*,\s*/g, ',').trim().toLowerCase();
  }

  private _extraFamilia = '\u0000';
  private _tipografiasVisibles = this.tipografias;

  /**
   * La lista del desplegable, con la letra de ahora añadida si no es de casa.
   *
   * Al pegar de una página o de Word llega cualquier familia. Sin esto el
   * desplegable se queda en blanco y parece que el texto no tiene letra
   * asignada; así se ve cuál es, como hace Word.
   */
  get tipografiasVisibles(): { valor: string; nombre: string }[] {
    const actual = this.tipografiaActual;
    if (actual === this._extraFamilia) { return this._tipografiasVisibles; }
    this._extraFamilia = actual;

    this._tipografiasVisibles = (!actual || this.tipografias.some(t => t.valor === actual))
      ? this.tipografias
      : [...this.tipografias, { valor: actual, nombre: this.nombreDeFamilia(actual) }];

    return this._tipografiasVisibles;
  }

  private _extraTamano = '\u0000';
  private _tamanosVisibles = this.tamanos;

  /** Lo mismo con el tamaño: un «11.5pt» pegado no está en la lista. */
  get tamanosVisibles(): { valor: string; nombre: string }[] {
    const actual = this.tamanoActual;
    if (actual === this._extraTamano) { return this._tamanosVisibles; }
    this._extraTamano = actual;

    this._tamanosVisibles = (!actual || this.tamanos.some(t => t.valor === actual))
      ? this.tamanos
      : [...this.tamanos, { valor: actual, nombre: actual }];

    return this._tamanosVisibles;
  }

  /** De «Georgia, 'Times New Roman', serif» se lee «Georgia». */
  private nombreDeFamilia(familia: string): string {
    return familia.split(',')[0].replace(/["']/g, '').trim() || familia;
  }

  cambiarTipografia(valor: string): void {
    aplicarMarca(this.editor, 'tipografia', valor ? { familia: valor } : null);
  }

  cambiarTamano(valor: string): void {
    aplicarMarca(this.editor, 'tamano', valor ? { tamano: valor } : null);
  }

  // ================================================================
  // LOS HUECOS
  // ================================================================

  public readonly grupos = GRUPOS_HUECOS;

  /**
   * Mete un hueco donde esté el cursor.
   *
   * En la nota se guarda el hueco tal cual, no el dato: así una nota de
   * seguimiento sirve para el cliente de hoy y para el de dentro de un mes,
   * y si el cliente cambia de teléfono la nota no se queda con el viejo. Se
   * cambia al leerla, al imprimirla y al exportarla.
   */
  insertarHueco(clave: string): void {
    this.editor?.commands.insertText(clave).focus().exec();
  }

  /** La nota con los huecos ya cambiados, que es como se lee y se imprime. */
  private get contenidoResuelto(): string {
    return aplicarHuecos(this.contenido ?? '', datosDeHuecos(this.cliente));
  }

  // ================================================================
  // CUENTA DE PALABRAS
  // ================================================================

  private _htmlContado = '\u0000';
  private _conteo = { palabras: 0, caracteres: 0 };

  /**
   * Palabras y caracteres, como la barra de estado de Word.
   *
   * Se calcula sobre el HTML y no sobre el documento de ProseMirror porque el
   * HTML es lo que ya está en `contenido`, y se guarda el último contado para
   * no repetir el trabajo en cada ciclo de detección de cambios de Angular
   * —que con el editor abierto son muchos—. El valor inicial es un carácter
   * imposible en un HTML para que la primera vez sí entre.
   */
  get conteo(): { palabras: number; caracteres: number } {
    const html = this.contenido ?? '';
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

  // ================================================================
  // TABLAS
  // ================================================================

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
    if (!vista) { return; }

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
    if (!vista) { return; }
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

  async quitarTabla(): Promise<void> {
    this.comandoTabla(deleteTable);
  }

  // ================================================================
  // IMÁGENES
  // ================================================================

  abrirSelectorImagen(): void { this.selectorImagen?.nativeElement.click(); }

  alElegirImagen(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (f) { this.insertarImagen(f); }
  }

  /**
   * Pegar en el editor.
   *
   * El portapapeles trae las imágenes de dos formas muy distintas y hay que
   * atender a las dos:
   *
   *   · Una captura sola (recortar la pantalla, copiar un fichero de imagen)
   *     llega como FICHERO en clipboardData.files.
   *   · Texto con imágenes dentro (copiar de Word, de un correo, de una página)
   *     llega como HTML en text/html, con cada imagen en base64 dentro del
   *     propio src o apuntando a otro servidor. Ahí no hay ningún fichero.
   *
   * Mirando sólo los ficheros, lo segundo se colaba hasta el servidor, que
   * tira esas imágenes al guardar —y hace bien: una en base64 engorda la fila y
   * una de fuera se rompe y encima rastrea—. El resultado era que al pegar
   * texto con una foto se guardaba sólo el texto.
   */
  alPegar = (ev: ClipboardEvent): void => {
    const datos = ev.clipboardData;
    if (!datos) { return; }

    const fichero = Array.from(datos.files ?? []).find(f => f.type.startsWith('image/'));
    if (fichero) {
      ev.preventDefault();
      this.insertarImagen(fichero);
      return;
    }

    const html = datos.getData('text/html');
    if (html && /<img\b/i.test(html)) {
      ev.preventDefault();
      ev.stopPropagation();
      this.pegarHtmlConImagenes(html);
    }
    // Texto sin imágenes: que lo pegue el editor como siempre
  };

  /**
   * Pega HTML subiendo antes sus imágenes.
   *
   * Cada imagen en base64 se convierte en fichero y se sube; el src se cambia
   * por el del servidor. Las que apuntan a otro sitio se quitan y se avisa: no
   * se pueden traer desde el navegador (lo impide el propio navegador), y
   * dejarlas sería guardar una nota que se rompe el día que ese servidor las
   * borre.
   */
  private async pegarHtmlConImagenes(html: string): Promise<void> {
    if (this.subiendoImagen) { return; }

    try {
      this.subiendoImagen = true;
      const { ajenas } = await pegarHtmlConImagenes(this.editor, this.almacenDeImagenes, html);
      if (ajenas) {
        this._toastr.warning(avisoDeAjenas(ajenas), 'Imágenes que faltan', { timeOut: 9000, closeButton: true });
      }
    } catch (error) {
      console.error('Error al pegar el contenido con imágenes:', error);
      this._toastr.error('No se pudo pegar el contenido', 'Error');
    } finally {
      this.subiendoImagen = false;
    }
  }

  /** Lo que el ayudante de pegado necesita del servicio de notas. */
  private get almacenDeImagenes(): AlmacenDeImagenes {
    return {
      subir: (f: File) => this.subirYDevolverUrl(f),
      traerDeFuera: (u: string) => this.traerDeFuera(u),
    };
  }
  /**
   * Se la pide al servidor, que sí puede ir a buscarla.
   *
   * Devuelve la url ya nuestra, o null si no se pudo —ese sitio la bloquea, no
   * es una imagen, pesa demasiado o apunta a la red interna, que el servidor
   * rechaza a propósito—.
   */
  private async traerDeFuera(url: string): Promise<string | null> {
    try {
      const res: any = await firstValueFrom(this._notaService.traerImagen(this.clienteId, url));
      if (res?.status !== 'success') { return null; }
      return this._notaService.urlDeImagen(res.data.url);
    } catch {
      // Es normal que alguna no se deje traer; no merece un toast por cada una
      return null;
    }
  }

  /** Sube una imagen y devuelve su url, o null si no se pudo. */
  private async subirYDevolverUrl(fichero: File): Promise<string | null> {
    try {
      const res: any = await firstValueFrom(this._notaService.subirImagen(this.clienteId, fichero));
      if (res?.status !== 'success') { return null; }
      return this._notaService.urlDeImagen(res.data.url);
    } catch (error) {
      console.error('Error al subir una imagen pegada:', error);
      return null;
    }
  }

  /** Lo mismo arrastrando: un fichero, o contenido de otra página. */
  alSoltarImagen = (ev: DragEvent): void => {
    const datos = ev.dataTransfer;
    if (!datos) { return; }

    const fichero = Array.from(datos.files ?? []).find(f => f.type.startsWith('image/'));
    if (fichero) {
      ev.preventDefault();
      this.insertarImagen(fichero);
      return;
    }

    const html = datos.getData('text/html');
    if (html && /<img\b/i.test(html)) {
      ev.preventDefault();
      ev.stopPropagation();
      this.pegarHtmlConImagenes(html);
    }
  };

  /**
   * Sube la imagen y la pone donde está el cursor.
   *
   * El nombre que se ve en la nota es el del fichero, para que al leerla se
   * sepa qué se está mirando aunque la imagen no cargue.
   */
  private async insertarImagen(fichero: File): Promise<void> {
    if (this.subiendoImagen) { return; }
    if (!this.clienteId) {
      this._toastr.error('No se sabe a qué cliente', 'Error');
      return;
    }

    try {
      this.subiendoImagen = true;
      const url = await this.subirYDevolverUrl(fichero);
      if (!url) {
        this._toastr.error('No se pudo subir la imagen', 'Error');
        return;
      }
      this.editor.commands.insertImage(url, { alt: fichero.name, title: fichero.name }).focus().exec();
    } finally {
      this.subiendoImagen = false;
    }
  }

  // ================================================================
  // IMPRIMIR Y WORD
  // ================================================================

  /**
   * Lo que va al documento es lo que hay EN PANTALLA, no lo guardado.
   *
   * Se imprime y se exporta mientras se escribe, así que tomar los datos de
   * `this.nota` daría la versión anterior y uno acabaría con un papel que no es
   * lo que está viendo.
   */
  private get datosDocumento(): DatosDocumentoNota {
    return {
      // Con los huecos cambiados: en el papel no pinta nada un «{cliente}»
      titulo: aplicarHuecos(this.titulo ?? '', datosDeHuecos(this.cliente)),
      contenido: this.contenidoResuelto,
      color: this.color,
      autor: this.nota?.created_by,
      fecha: this.nota?.created_at,
      cliente: this.clienteNombre,
    };
  }

  imprimir(): void {
    if (!imprimirNota(this.datosDocumento)) {
      this._toastr.warning(
        'El navegador bloqueó la ventana de impresión. Permite las ventanas emergentes de este sitio.',
        'No se pudo imprimir', { timeOut: 8000 });
    }
  }

  /** Baja lo escrito como documento de Word. */
  async exportarWord(): Promise<void> {
    if (this.exportando) { return; }

    try {
      this.exportando = true;
      const perdidas = await descargarNotaWord(this.datosDocumento);

      if (perdidas) {
        this._toastr.warning(
          `El documento se bajó, pero ${perdidas} imagen(es) no se pudieron incluir.`,
          'Imágenes que faltan', { timeOut: 8000 });
      } else {
        this._toastr.success('Documento de Word descargado', 'Notas', { closeButton: true });
      }
    } catch (error) {
      // El motivo va en el toast: un «no se pudo» a secas obliga a abrir la
      // consola del navegador para saber qué pasó, y eso no lo va a hacer nadie
      console.error('Error al exportar la nota a Word:', error);
      const motivo = (error as any)?.message ? ': ' + (error as any).message : '';
      this._toastr.error('No se pudo generar el documento de Word' + motivo, 'Error', { timeOut: 10000, closeButton: true });
    } finally {
      this.exportando = false;
    }
  }

  abrirSelectorWord(): void { this.selectorWord?.nativeElement.click(); }

  /**
   * Mete un documento de Word dentro de la nota.
   *
   * Lo traduce mammoth: el estilo «Título 1» de Word sale como <h1> y no como
   * un párrafo en negrita, así que el texto queda con la misma estructura que
   * si se hubiera escrito aquí —y por tanto se puede buscar y tabular—.
   *
   * Las imágenes del documento llegan en base64 dentro del HTML, así que se
   * pasan por el mismo camino que al pegar: se suben al servidor y el HTML se
   * queda apuntando a nuestras urls. Sin eso el servidor las tiraría al
   * guardar, como pasaba al pegar de una página.
   */
  async alElegirWord(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const fichero = input.files?.[0];
    input.value = '';
    if (!fichero) { return; }

    if (this.importando || this.subiendoImagen) { return; }

    try {
      this.importando = true;
      const { html, avisos } = await wordAHtml(fichero);

      if (!html.trim()) {
        this._toastr.warning('El documento no tiene texto que traer', 'Nada que importar');
        return;
      }

      // El mismo camino que al pegar: sube las imágenes y mete el resultado
      await this.pegarHtmlConImagenes(html);

      // Un documento recién traído suele ser la nota entera: si no hay título,
      // el del fichero es mejor que nada
      if (!this.titulo.trim()) {
        this.titulo = fichero.name.replace(/\.docx?$/i, '').slice(0, 150);
      }

      // Los avisos de mammoth son cosas que Word tiene y una nota no (cuadros
      // de texto, notas al pie…). No son un error, pero conviene decirlo.
      if (avisos.length) {
        console.warn('Al traer el documento de Word:', avisos);
        this._toastr.info(
          `Se trajo el documento. ${avisos.length} detalle(s) de formato no tienen equivalente en una nota.`,
          'Documento importado', { timeOut: 7000 });
      } else {
        this._toastr.success('Documento de Word importado', 'Notas', { closeButton: true });
      }
    } catch (error) {
      console.error('Error al importar un documento de Word:', error);
      this._toastr.error('No se pudo leer el documento. ¿Es un .docx?', 'Error');
    } finally {
      this.importando = false;
    }
  }

  // ================================================================
  // GUARDAR
  // ================================================================

  async guardar(): Promise<void> {
    if (this.guardando) { return; }
    if (this.subiendoImagen) {
      this._toastr.info('Espera a que termine de subir la imagen', 'Un momento');
      return;
    }

    const titulo = (this.titulo ?? '').trim();
    if (titulo.length < 3) {
      this._toastr.warning('El título necesita al menos 3 caracteres', 'Falta información');
      return;
    }
    // La comprobación de verdad está en el servidor; ésta es para no mandar un
    // viaje que ya se sabe que va a volver con un error
    if (!this.hayContenido) {
      this._toastr.warning('Escribe algo en la nota, no sólo el título', 'Falta información');
      return;
    }

    const datos: any = {
      titulo,
      contenido: this.contenido,
      color: this.color,
      fijada: this.fijada,
    };
    if (!this.nota) { datos.cliente_id = this.clienteId; }

    try {
      this.guardando = true;
      const res: any = await firstValueFrom(
        this.nota ? this._notaService.editNota(this.nota.id, datos) : this._notaService.addNota(datos));

      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo guardar la nota', 'Error');
        return;
      }

      this._toastr.success(res.message, 'Notas', { closeButton: true });
      this.guardado.emit(res.data);
      this.modal.close(res.data);
    } catch (error) {
      // El AuthInterceptor ya muestra el toast del error HTTP
      console.error('Error al guardar la nota:', error);
    } finally {
      this.guardando = false;
    }
  }
}
