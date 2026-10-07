import { Component, Input } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { CommonModule } from '@angular/common';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

import { PanelModule } from '../../../../../components/panel/panel.module';
import { NotaCliente, nombreDeColor, tinteDeNota } from '../../../interfaces/notaCliente';
import { DatosDocumentoNota, descargarNotaWord, imprimirNota } from '../../../interfaces/notaDocumento';
import { ClienteModel } from '../../../interfaces/clienteModel';
import {
  aplicarHuecos, datosDeHuecos,
} from '../../../interfaces/huecosPlantilla';

/**
 * Leer una nota entera.
 *
 * En la lista, el cuerpo de cada nota se recorta a seis renglones para que una
 * larga no deje a las demás fuera de pantalla; aquí se lee completa, con sus
 * imágenes a tamaño normal.
 *
 * Sólo se lee: no hay nada que guardar ni que perder al cerrar. Para corregir
 * una nota está su botón en la tarjeta de la lista.
 *
 * Va dentro de un <panel>, como el modal de auditoría: así trae la misma barra
 * de título y el mismo botón de expandir del resto de la aplicación en vez de
 * una cabecera propia que se parezca pero no sea igual. Expandido ocupa la
 * pantalla entera, que es justo lo que hace falta cuando la nota lleva una
 * captura.
 *
 * Imprimir y exportar a Word salen de notaDocumento.ts, compartido con el
 * editor: la hoja tiene que ser la misma se mande a imprimir desde donde se
 * mande.
 */
@Component({
  selector: 'app-verNota',
  standalone: true,
  imports: [CommonModule, PanelModule],
  templateUrl: './verNota.component.html',
  styleUrls: ['./verNota.component.css'],
})
export class VerNotaComponent {

  @Input() nota!: NotaCliente;
  @Input() clienteNombre = '';
  /** La ficha entera: sin ella no se pueden resolver {telefono} y los demás. */
  @Input() cliente: ClienteModel | null = null;

  public readonly tinteDeNota = tinteDeNota;
  public readonly nombreDeColor = nombreDeColor;

  /** Mientras se arma el .docx: evita que dos clics generen dos ficheros. */
  public exportando = false;

  constructor(
    public modal: NgbActiveModal,
    private _toastr: ToastrService,
  ) {}

  get titulo(): string {
    return this.resolver(this.nota?.titulo) || 'Nota';
  }

  /**
   * La nota con los huecos cambiados por los datos de este cliente.
   *
   * Se guarda el hueco y se cambia aquí: así la nota dice el teléfono que el
   * cliente tiene hoy, y no el que tenía el día que se escribió.
   */
  get contenido(): string {
    return this.resolver(this.nota?.contenido);
  }

  private resolver(texto?: string | null): string {
    return aplicarHuecos(texto ?? '', datosDeHuecos(this.cliente));
  }

  /** Lo que necesita el documento, venga de aquí o del editor. */
  private get datos(): DatosDocumentoNota {
    return {
      titulo: this.titulo,
      contenido: this.contenido,
      color: this.nota?.color,
      autor: this.nota?.created_by,
      fecha: this.nota?.created_at,
      cliente: this.clienteNombre,
    };
  }

  imprimir(): void {
    if (!imprimirNota(this.datos)) {
      this._toastr.warning(
        'El navegador bloqueó la ventana de impresión. Permite las ventanas emergentes de este sitio.',
        'No se pudo imprimir', { timeOut: 8000 });
    }
  }

  /** Baja la nota como documento de Word. */
  async exportarWord(): Promise<void> {
    if (this.exportando) { return; }

    try {
      this.exportando = true;
      const perdidas = await descargarNotaWord(this.datos);

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
}
