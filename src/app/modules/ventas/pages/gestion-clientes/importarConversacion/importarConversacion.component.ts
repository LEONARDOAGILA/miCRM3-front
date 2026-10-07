import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';

import { PanelModule } from '../../../../../components/panel/panel.module';
import { ModalFooterComponent } from '../../../../../components/modal/modal-footer/modal-footer.component';
import { GestionService } from '../../../services/gestion.service';
import { ClienteModel } from '../../../interfaces/clienteModel';
import { AsuntoGestion } from '../../../interfaces/catalogoGestion';
import { abrirWhatsapp } from '../../../interfaces/plantillasWhatsapp';
import {
  ConversacionLeida, MensajeImportado, comoHtmlConversacion, leerExportacion,
} from '../../../interfaces/conversacionWhatsapp';

/**
 * Traer una conversación de WhatsApp al historial del cliente.
 *
 * SE IMPORTA UN FICHERO, no se lee la ventana de WhatsApp. Lo segundo no se
 * puede: el texto de los mensajes vive dentro del WebView2 que aloja la
 * aplicación y Windows no lo expone —su árbol de accesibilidad sólo se
 * construye si un lector de pantalla lo pide al arrancar, y a WhatsApp lo
 * lanza la Store, no nosotros—. Meterse en su almacén cifrado, que es la otra
 * forma de hacerlo «solo», se rompe en cada actualización y no es algo que
 * deba hacer un CRM.
 *
 * Así que lo hace WhatsApp, que ya sabe: «Exportar chat» > «Sin archivos
 * adjuntos» deja un .txt con la conversación ENTERA —no sólo lo que se ve en
 * pantalla—, con la fecha y el autor de cada mensaje. Son tres clics del
 * vendedor y a cambio no hay nada que se rompa cuando WhatsApp cambie de
 * aspecto.
 *
 * Queda como una gestión de tipo WhatsApp: entra en el historial, cuenta en
 * las estadísticas del vendedor y se lee donde se lee todo lo demás.
 */
@Component({
  selector: 'app-importarConversacion',
  standalone: true,
  imports: [CommonModule, FormsModule, PanelModule, ModalFooterComponent],
  templateUrl: './importarConversacion.component.html',
  styleUrls: ['./importarConversacion.component.css'],
})
export class ImportarConversacionComponent {

  @Input() cliente!: ClienteModel;
  /** El número con el que se habló; va al teléfono de la gestión. */
  @Input() numero = '';
  /** Los asuntos activos de WhatsApp, para elegir de qué fue la conversación. */
  @Input() asuntos: AsuntoGestion[] = [];

  @Output() guardado = new EventEmitter<any>();

  public leida: ConversacionLeida | null = null;
  public nombreFichero = '';
  public asuntoId: number | null = null;
  public conAvisos = false;
  public guardando = false;
  public error = '';

  /**
   * El tope del servidor para la nota de una gestión.
   *
   * Una conversación de dos años no cabe, y partirla en varias gestiones sería
   * inventarse un historial que no pasó. Se guardan los mensajes MÁS NUEVOS
   * que quepan, que son los que se consultan, y se dice cuántos quedaron
   * fuera: callarlo sería peor que no importar.
   */
  private readonly TOPE = 100000;

  constructor(
    public modal: NgbActiveModal,
    private _toastr: ToastrService,
    private _gestionService: GestionService,
  ) {}

  get titulo(): string {
    return 'Importar conversación de WhatsApp';
  }

  /** Abre el chat de ese número, para exportarlo sin buscarlo a mano. */
  abrirChat(): void {
    const r = abrirWhatsapp(this.numero, '');
    if (r === 'sin-numero') {
      this._toastr.info('Este cliente no tiene un número con WhatsApp', 'WhatsApp');
    }
  }

  alElegirFichero(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (f) { this.leerFichero(f); }
  }

  alSoltar(ev: DragEvent): void {
    ev.preventDefault();
    const f = ev.dataTransfer?.files?.[0];
    if (f) { this.leerFichero(f); }
  }

  private leerFichero(f: File): void {
    this.error = '';
    this.leida = null;
    this.nombreFichero = f.name;

    if (!/\.txt$/i.test(f.name)) {
      this.error = 'Tiene que ser el .txt que deja «Exportar chat». Si exportaste con archivos, dentro del .zip está el .txt.';
      return;
    }

    const lector = new FileReader();
    lector.onload = () => {
      const leida = leerExportacion(String(lector.result ?? ''));
      if (!leida.mensajes.length) {
        this.error = 'No encontré ningún mensaje en ese fichero. ¿Es el que deja «Exportar chat»?';
        return;
      }
      this.leida = leida;
      // Si sólo hay un asunto de WhatsApp no tiene sentido preguntarlo
      if (!this.asuntoId && this.asuntos.length === 1) { this.asuntoId = this.asuntos[0].id; }
    };
    lector.onerror = () => { this.error = 'No se pudo leer el fichero'; };
    lector.readAsText(f, 'utf-8');
  }

  /** Los que se van a guardar: sin los avisos, salvo que se pidan. */
  get mensajesAGuardar(): MensajeImportado[] {
    const todos = this.leida?.mensajes ?? [];
    return this.conAvisos ? todos : todos.filter(m => !m.sistema);
  }

  /**
   * Lo que de verdad cabe, contando desde el final.
   *
   * Se recorta por mensajes enteros y no por caracteres: cortar a mitad de una
   * frase deja el historial diciendo algo que nadie dijo.
   */
  get mensajesQueCaben(): MensajeImportado[] {
    const todos = this.mensajesAGuardar;
    if (comoHtmlConversacion(todos, this.conAvisos).length <= this.TOPE) { return todos; }

    let desde = 0;
    while (desde < todos.length
           && comoHtmlConversacion(todos.slice(desde), this.conAvisos).length > this.TOPE) {
      desde += Math.max(1, Math.floor((todos.length - desde) / 20));
    }
    return todos.slice(desde);
  }

  get recortados(): number {
    return this.mensajesAGuardar.length - this.mensajesQueCaben.length;
  }

  get htmlFinal(): string {
    return comoHtmlConversacion(this.mensajesQueCaben, this.conAvisos);
  }

  /** Las primeras líneas, para que se vea qué se va a guardar antes de guardarlo. */
  get muestra(): MensajeImportado[] {
    return this.mensajesQueCaben.slice(0, 12);
  }

  get puedeGuardar(): boolean {
    return !!this.leida && !!this.asuntoId && !!this.mensajesQueCaben.length && !this.guardando;
  }

  get nombreDelAsunto(): string {
    return this.asuntos.find(a => a.id === Number(this.asuntoId))?.nombre ?? '';
  }

  /** La del último mensaje, salvo que caiga en el futuro: entonces, ahora. */
  private get fechaDeLaGestion(): string | null {
    const ultima = this.leida?.hasta ?? null;
    if (!ultima) { return null; }

    const d = new Date();
    const dd = (n: number) => String(n).padStart(2, '0');
    const ahora = d.getFullYear() + '-' + dd(d.getMonth() + 1) + '-' + dd(d.getDate())
      + ' ' + dd(d.getHours()) + ':' + dd(d.getMinutes());

    return ultima > ahora ? ahora : ultima;
  }

  async guardar(): Promise<void> {
    if (!this.puedeGuardar || !this.cliente?.id) { return; }

    try {
      this.guardando = true;

      const res: any = await firstValueFrom(this._gestionService.addGestion({
        cliente_id:    this.cliente.id,
        tipo:          'WHATSAPP',
        estado:        'REALIZADA',
        // Ya ocurrió: la fecha es la del último mensaje, no la de ahora. Si se
        // pusiera la de ahora, el historial diría que se habló hoy con alguien
        // con quien se habló hace tres semanas.
        modo_registro: 'YA_HECHA',
        asunto_id:     Number(this.asuntoId),
        asunto:        this.nombreDelAsunto || null,
        nota:          this.htmlFinal,
        usuario_id:    this.cliente.vendedor_id ?? null,
        telefono:      (this.numero ?? '').trim() || null,
        prioridad:     'MEDIA',
        // Nunca en el futuro: el servidor rechaza una gestión realizada con
        // fecha posterior a ahora, y basta con que el reloj del teléfono que
        // exportó vaya adelantado, o con que el chat sea de otra zona horaria,
        // para que el último mensaje caiga unas horas más allá.
        fecha_realizada: this.fechaDeLaGestion,
        resultado:     'CONTACTADO',
      }));

      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo importar la conversación', 'Error');
        return;
      }

      this.guardado.emit(res.data);
      this._toastr.success(
        `Se importaron ${this.mensajesQueCaben.length} mensajes`,
        'Conversación importada', { closeButton: true });
      this.modal.close(res.data);

    } catch (error) {
      // El AuthInterceptor ya saca el toast del error HTTP
      console.error('Error al importar la conversación:', error);
    } finally {
      this.guardando = false;
    }
  }
}
