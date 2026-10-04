import { Component, Input } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { CommonModule } from '@angular/common';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

import { PanelModule } from '../../../../../components/panel/panel.module';
import { NotaCliente, nombreDeColor, tinteDeNota } from '../../../interfaces/notaCliente';

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

  public readonly tinteDeNota = tinteDeNota;
  public readonly nombreDeColor = nombreDeColor;

  constructor(
    public modal: NgbActiveModal,
    private _toastr: ToastrService,
  ) {}

  get titulo(): string {
    return this.nota?.titulo || 'Nota';
  }

  /**
   * Imprime la nota.
   *
   * En una ventana aparte con sólo la hoja, no con un @media print sobre la
   * pantalla: aquí detrás hay un modal encima de la ficha del cliente encima
   * de la grilla, y esconder todo eso con css es una lista de excepciones que
   * se rompe en cuanto alguien toca una pantalla. Con el documento aparte, lo
   * que se ve en la vista previa es exactamente lo que va al papel, y el
   * «Guardar como PDF» del navegador da el PDF sin añadir nada al proyecto.
   *
   * Se espera a que cargue antes de llamar a imprimir: si no, las imágenes
   * salen en blanco porque el diálogo se abre antes de que lleguen.
   */
  imprimir(): void {
    const ventana = window.open('', '_blank', 'width=920,height=1000');
    if (!ventana) {
      this._toastr.warning('El navegador bloqueó la ventana de impresión. Permite las ventanas emergentes de este sitio.', 'No se pudo imprimir', { timeOut: 8000 });
      return;
    }

    ventana.document.write(this.documentoImprimible());
    ventana.document.close();

    const alCargar = () => { ventana.focus(); ventana.print(); };
    if (ventana.document.readyState === 'complete') { alCargar(); }
    else { ventana.onload = alCargar; }
  }

  /** Que un título con «<» no rompa el documento que se escribe. */
  private escapar(texto?: string | null): string {
    return String(texto ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** La hoja, sola, con lo justo para que salga bien en papel. */
  private documentoImprimible(): string {
    const n = this.nota;
    const pie = [
      this.escapar(n?.created_by),
      this.escapar(n?.created_at),
      this.clienteNombre ? 'Cliente: ' + this.escapar(this.clienteNombre) : '',
    ].filter(Boolean).join(' · ');

    return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>${this.escapar(n?.titulo)}</title>
<style>
  @page { margin: 18mm 16mm; }
  body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
         font-size: 11.5pt; line-height: 1.6; color: #212529; }
  .cab { display: flex; justify-content: space-between; align-items: baseline;
         padding-bottom: 6pt; margin-bottom: 14pt; border-bottom: 1px solid #ccc;
         font-size: 8.5pt; color: #666; }
  h1 { margin: 0 0 12pt; font-size: 17pt; line-height: 1.25; }
  p, ul, ol { margin: 0 0 9pt; }
  ul, ol { padding-left: 16pt; }
  ul { list-style: disc outside; } ol { list-style: decimal outside; }
  h2 { font-size: 13pt; } h3 { font-size: 12.5pt; } h4 { font-size: 12pt; }
  blockquote { margin: 9pt 0; padding-left: 10pt; border-left: 2pt solid #ddd; color: #666; }
  /* Que una imagen no se parta entre dos hojas */
  img { max-width: 100%; height: auto; margin: 9pt 0; page-break-inside: avoid; }
  pre, code { font-size: 9.5pt; background: #f5f5f5; }
  pre { padding: 6pt; white-space: pre-wrap; }
  /* Tablas: que la cabecera se repita si la tabla parte en dos hojas */
  table { width: 100%; margin: 9pt 0; border-collapse: collapse; table-layout: fixed; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  td, th { padding: 4pt 5pt; border: 0.5pt solid #999; vertical-align: top; }
  th { background: #f0f0f0; font-weight: 700; text-align: left; }
  td > p, th > p { margin: 0; }
</style></head><body>
  <div class="cab"><span>${this.escapar(this.nombreDeColor(n?.color))}</span><span>${pie}</span></div>
  <h1>${this.escapar(n?.titulo)}</h1>
  ${n?.contenido ?? ''}
</body></html>`;
  }
}
