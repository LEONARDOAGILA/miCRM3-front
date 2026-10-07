import { Component, Input, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';

import { CatalogoGestionService } from '../../../services/catalogoGestion.service';
import { AsuntoGestion, TipoGestion } from '../../../interfaces/catalogoGestion';
import {
  GRUPOS_HUECOS, aplicarHuecos, datosDeHuecos,
} from '../../../interfaces/huecosPlantilla';
import { imprimirNota } from '../../../interfaces/notaDocumento';
import { PanelModule } from '../../../../../components/panel/panel.module';
import { CampoNgxEditorComponent } from '../../../../../components/campos/campoNgxEditor/campoNgxEditor.component';
import { HuecosPlantillaComponent } from '../../../../../components/campos/huecosPlantilla/huecosPlantilla.component';
import { ModalFooterComponent } from '../../../../../components/modal/modal-footer/modal-footer.component';

/**
 * El mensaje de un asunto del catálogo.
 *
 * Es lo que se le manda al cliente cuando se usa ese asunto: por WhatsApp, el
 * texto del chat; por correo, el cuerpo con formato. Vivía en una tabla aparte
 * —ventas.whatsapp_plantillas— que guardaba el nombre del asunto como texto
 * para saber a cuál pertenecía; ahora es un campo del asunto y no hay pareja
 * que se pueda romper al renombrar.
 *
 * EL EDITOR CAMBIA SEGÚN EL TIPO, y no es un capricho: WhatsApp no entiende
 * HTML. Si ahí se escribiera con el editor rico, al cliente le llegarían las
 * etiquetas escritas. Así que WhatsApp va con un campo de texto a secas y el
 * resto —correo, sobre todo— con el mismo editor de la pestaña Notas.
 */
@Component({
  selector: 'app-saveMensajeAsunto',
  standalone: true,
  imports: [
    CommonModule, FormsModule, PanelModule,
    CampoNgxEditorComponent, HuecosPlantillaComponent, ModalFooterComponent,
  ],
  templateUrl: './saveMensajeAsunto.component.html',
  styleUrls: ['./saveMensajeAsunto.component.css'],
})
export class SaveMensajeAsuntoComponent implements OnInit {

  @Input() asunto!: AsuntoGestion;
  @Input() tipo!: TipoGestion;
  /** Sin permiso de editar se abre para leer */
  @Input() soloLectura = false;

  public contenido = '';
  public guardando = false;

  public readonly grupos = GRUPOS_HUECOS;

  @ViewChild('areaTexto') areaTexto?: ElementRef<HTMLTextAreaElement>;
  @ViewChild('campo') campo?: CampoNgxEditorComponent;

  constructor(
    public modal: NgbActiveModal,
    private _toastr: ToastrService,
    private _catalogoService: CatalogoGestionService,
  ) {}

  /** WhatsApp no admite formato: ahí el editor sobra y además estorba. */
  get esTextoPlano(): boolean {
    return (this.tipo?.codigo ?? '').toUpperCase() === 'WHATSAPP';
  }

  get titulo(): string {
    return (this.soloLectura ? 'Mensaje de ' : 'Mensaje de ') + (this.asunto?.nombre ?? 'el asunto');
  }

  ngOnInit(): void {
    this.contenido = this.asunto?.mensaje ?? '';
  }

  /**
   * Mete un hueco donde esté el cursor.
   *
   * Donde está el cursor y no al final: pegarlo al final obliga a cortarlo y
   * llevarlo a su sitio, que es más trabajo que escribirlo a mano, y entonces
   * el botón no sirve de nada.
   */
  insertarHueco(clave: string): void {
    if (this.soloLectura) { return; }

    if (!this.esTextoPlano) { this.campo?.insertarTexto(clave); return; }

    const area = this.areaTexto?.nativeElement;
    if (!area) { this.contenido = (this.contenido + ' ' + clave).trim(); return; }

    const desde = area.selectionStart ?? this.contenido.length;
    const hasta = area.selectionEnd ?? desde;
    this.contenido = this.contenido.substring(0, desde) + clave + this.contenido.substring(hasta);

    // Devolver el cursor detrás de lo insertado, que es donde se sigue
    // escribiendo; sin esto salta al principio y hay que buscarlo
    setTimeout(() => {
      area.focus();
      area.setSelectionRange(desde + clave.length, desde + clave.length);
    });
  }

  /** Cómo le queda al cliente, con datos de ejemplo. */
  get vistaPrevia(): string {
    return aplicarHuecos(this.contenido ?? '', {
      // Los del cliente son inventados a propósito: un asunto del catálogo no
      // cuelga de ninguno. Los de quien escribe y la fecha sí son los de verdad.
      ...datosDeHuecos(null),
      cliente:          'María Fernanda Pérez',
      nombre:           'María',
      identificacion:   '0912345678',
      email:            'maria.perez@ejemplo.com',
      telefono:         '042 345 678',
      celular:          '0991234567',
      direccion:        'Av. Las Monjas 123 y Rumichaca',
      ciudad:           'Guayaquil',
      vendedor_cliente: this.nombreDeQuienEdita,
    });
  }

  private get nombreDeQuienEdita(): string {
    try {
      const u = JSON.parse(localStorage.getItem('user') ?? '{}');
      return u?.name || u?.login_user || 'el vendedor';
    } catch { return 'el vendedor'; }
  }

  /**
   * Saca el mensaje en una hoja, con los huecos ya rellenos.
   *
   * Hace de muestra: es lo que antes enseñaba el recuadro de «Así le llega
   * al cliente», pero a tamaño de papel y con el formato de verdad —en el
   * recuadro una tabla o una imagen grande no cabían—. De paso, el «Guardar
   * como PDF» del navegador sirve para enseñárselo a alguien.
   */
  imprimir(): void {
    const salio = imprimirNota({
      titulo:    this.asunto?.nombre ?? 'Mensaje',
      contenido: this.vistaPrevia,
      rotulo:    'Ejemplo de cómo le llega al cliente',
      autor:     this.nombreDeQuienEdita,
      fecha:     new Date().toLocaleDateString('es-EC'),
    });
    if (!salio) {
      this._toastr.warning('El navegador bloqueó la ventana de impresión', 'Imprimir');
    }
  }

  async guardar(): Promise<void> {
    if (this.soloLectura || this.guardando) { return; }

    try {
      this.guardando = true;
      const res: any = await firstValueFrom(this._catalogoService.editAsunto(this.asunto.id, {
        tipo_id: this.asunto.tipo_id ?? this.tipo?.id,
        nombre:  this.asunto.nombre,
        orden:   this.asunto.orden,
        activo:  this.asunto.activo,
        // Vacío borra el mensaje: es como se quita una respuesta del menú sin
        // tener que borrar el asunto, que el historial sigue usando.
        mensaje: (this.contenido ?? '').trim(),
      }));

      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo guardar el mensaje', 'Error');
        return;
      }
      this._catalogoService.olvidar();
      this._toastr.success(res.message, 'Catálogo', { closeButton: true });
      this.modal.close(res.data);
    } catch (error) {
      console.error('Error al guardar el mensaje del asunto:', error);
    } finally {
      this.guardando = false;
    }
  }
}
