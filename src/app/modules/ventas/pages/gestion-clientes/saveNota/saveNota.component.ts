import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { Editor, NgxEditorModule, Toolbar } from 'ngx-editor';
import { keymap } from 'prosemirror-keymap';
import {
  addColumnAfter, addColumnBefore, addRowAfter, addRowBefore, deleteColumn, deleteRow,
  deleteTable, goToNextCell, mergeCells, splitCell, tableEditing, toggleHeaderRow,
} from 'prosemirror-tables';
import { ESQUEMA_NOTAS } from '../../../interfaces/esquemaNotas';
import { firstValueFrom } from 'rxjs';

import { PanelModule } from '../../../../../components/panel/panel.module';
import { NotaClienteService } from '../../../services/notaCliente.service';
import { COLORES_NOTA, ColorNota, NotaCliente, tinteDeNota } from '../../../interfaces/notaCliente';

/**
 * Escribir o corregir una nota del cliente.
 *
 * El editor es ngx-editor, que ya estaba en el proyecto (lo declara
 * demo.module) y está hecho sobre ProseMirror: produce HTML limpio, se integra
 * con los formularios de Angular y no arrastra jQuery como las alternativas
 * clásicas. No hacía falta traer otra librería sólo para esto.
 *
 * La barra lleva lo que se usa escribiendo sobre un cliente —negrita, listas,
 * un título, un enlace, color— y deja fuera lo que no pinta nada aquí: imágenes
 * (para eso está la pestaña de Archivos, que las guarda de verdad en el
 * servidor en vez de incrustarlas en el HTML y engordar la fila).
 */
@Component({
  selector: 'app-saveNota',
  standalone: true,
  imports: [CommonModule, FormsModule, NgxEditorModule, PanelModule],
  templateUrl: './saveNota.component.html',
  styleUrls: ['./saveNota.component.css'],
})
export class SaveNotaComponent implements OnInit, AfterViewInit, OnDestroy {

  @Input() clienteId!: number;
  @Input() clienteNombre = '';
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

  @ViewChild('selectorImagen') selectorImagen!: ElementRef<HTMLInputElement>;
  @ViewChild('cajaEdicion') cajaEdicion!: ElementRef<HTMLElement>;

  public readonly colores = COLORES_NOTA;
  /** El color de la etiqueta elegida, para el punto del membrete. */
  public readonly tinteDe = tinteDeNota;

  /**
   * Lo que se ofrece al escribir.
   *
   * Sin imágenes a propósito: una foto pegada aquí se guardaría dentro del HTML
   * en base64 y una sola de 2 MB haría la fila ocho veces más grande que todas
   * las demás notas juntas. Para eso está la pestaña de Archivos.
   */
  public readonly toolbar: Toolbar = [
    ['bold', 'italic', 'underline', 'strike'],
    ['ordered_list', 'bullet_list'],
    [{ heading: ['h3', 'h4'] }],
    ['link'],
    ['text_color', 'background_color'],
    ['align_left', 'align_center', 'align_right'],
    ['blockquote', 'code'],
    ['horizontal_rule', 'format_clear'],
    ['undo', 'redo'],
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

      const doc = new DOMParser().parseFromString(html, 'text/html');
      const imagenes = Array.from(doc.querySelectorAll('img'));
      let ajenas = 0;

      for (const img of imagenes) {
        const src = img.getAttribute('src') ?? '';

        if (src.startsWith('data:image/')) {
          const f = await this.ficheroDesdeDataUri(src);
          const url = f ? await this.subirYDevolverUrl(f) : null;
          if (url) { img.setAttribute('src', url); } else { img.remove(); }
          continue;
        }

        // Las nuestras ya están donde tienen que estar
        if (src.includes('archivoCliente/ver/')) { continue; }

        // De fuera: las trae el servidor, porque el navegador no puede
        // (se lo impide el CORS del sitio de origen)
        if (/^https?:\/\//i.test(src)) {
          const url = await this.traerDeFuera(src);
          if (url) { img.setAttribute('src', url); } else { img.remove(); ajenas++; }
          continue;
        }

        img.remove();
        ajenas++;
      }

      this.editor.commands.insertHTML(doc.body.innerHTML).focus().exec();

      if (ajenas) {
        this._toastr.warning(
          `Se pegó el contenido, pero ${ajenas} imagen(es) no se pudieron traer: puede que ese sitio no las deje descargar. Guárdalas y úsalas con «Imagen».`,
          'Imágenes que faltan', { timeOut: 9000, closeButton: true });
      }
    } catch (error) {
      console.error('Error al pegar el contenido con imágenes:', error);
      this._toastr.error('No se pudo pegar el contenido', 'Error');
    } finally {
      this.subiendoImagen = false;
    }
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

  /** Una imagen en base64 convertida en fichero, para poder subirla. */
  private async ficheroDesdeDataUri(uri: string): Promise<File | null> {
    try {
      const blob = await (await fetch(uri)).blob();
      const ext = (blob.type.split('/')[1] || 'png').replace('+xml', '').split(';')[0];
      return new File([blob], `pegada-${Date.now()}.${ext}`, { type: blob.type });
    } catch {
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
