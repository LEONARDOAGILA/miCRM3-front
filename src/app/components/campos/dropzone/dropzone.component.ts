import { Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Zona para soltar o elegir UN fichero, con validación de extensión y
 * tamaño, vista previa (miniatura si es imagen) y barra de progreso.
 *
 * No sube nada: sólo entrega el File elegido por `archivoSeleccionado`.
 * Quien lo usa decide cuándo subirlo y le va pasando `[progreso]`.
 *
 * Uso:
 *   <app-dropzone
 *     [accept]="'.pdf'" [extensiones]="['pdf']" [maxMb]="20"   (maxMb 0 = sin límite)
 *     [archivoActual]="'informe.pdf'"          (en edición: lo que ya hay)
 *     [progreso]="porcentaje"                    (null = sin subida en curso)
 *     (archivoSeleccionado)="onFichero($event)"> (null al quitarlo)
 *   </app-dropzone>
 */
@Component({
  selector: 'app-dropzone',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dropzone.component.html',
  styleUrls: ['./dropzone.component.css']
})
export class DropzoneComponent implements OnChanges, OnDestroy {

  /** Atributo accept del <input type="file"> (filtra el diálogo del navegador). */
  @Input() accept = '';
  /** Extensiones admitidas, en minúsculas y sin punto. Vacío = cualquiera. */
  @Input() extensiones: string[] = [];
  /** Tamaño máximo en MB. 0 (o menos) = sin límite propio. */
  @Input() maxMb = 0;
  /** Nombre del fichero ya guardado (edición), para mostrarlo como actual. */
  @Input() archivoActual: string | null = null;
  /** 0-100 mientras se sube; null si no hay subida en curso. */
  @Input() progreso: number | null = null;
  @Input() disabled = false;
  /** Texto principal de la zona vacía. */
  @Input() texto = 'Arrastra el archivo aquí o haz clic para elegirlo';
  /**
   * Icono y color del tipo de fichero (los pone quien lo usa, que sabe qué
   * tipo detectó). Sin icono se muestra la extensión en un recuadro.
   */
  @Input() icono = '';
  @Input() color = '';

  @Output() archivoSeleccionado = new EventEmitter<File | null>();

  @ViewChild('input') input!: ElementRef<HTMLInputElement>;

  archivo: File | null = null;
  /** Miniatura (object URL) cuando el fichero es una imagen. */
  vistaPrevia: string | null = null;
  arrastrando = false;
  error = '';

  ngOnChanges(changes: SimpleChanges): void {
    // Si cambian las extensiones (el usuario cambió de tipo), el fichero que
    // había puede dejar de ser válido: se descarta para no subir algo que el
    // back va a rechazar.
    if (changes['extensiones'] && !changes['extensiones'].firstChange && this.archivo) {
      const err = this.validar(this.archivo);
      if (err) { this.quitar(); this.error = err; }
    }
  }

  ngOnDestroy(): void {
    this.liberarVistaPrevia();
  }

  // ---------- Entrada del fichero ----------

  abrirSelector(): void {
    if (this.disabled) { return; }
    this.input.nativeElement.click();
  }

  onInputChange(ev: Event): void {
    const f = (ev.target as HTMLInputElement).files?.[0] ?? null;
    if (f) { this.aceptar(f); }
    // Sin esto, elegir el mismo fichero dos veces seguidas no dispara change
    (ev.target as HTMLInputElement).value = '';
  }

  onDragOver(ev: DragEvent): void {
    ev.preventDefault();
    if (!this.disabled) { this.arrastrando = true; }
  }

  onDragLeave(): void {
    this.arrastrando = false;
  }

  onDrop(ev: DragEvent): void {
    ev.preventDefault();
    this.arrastrando = false;
    if (this.disabled) { return; }
    const f = ev.dataTransfer?.files?.[0] ?? null;
    if (f) { this.aceptar(f); }
  }

  private aceptar(f: File): void {
    const err = this.validar(f);
    if (err) {
      this.error = err;
      return;
    }
    this.error = '';
    this.liberarVistaPrevia();
    this.archivo = f;
    this.vistaPrevia = f.type.startsWith('image/') ? URL.createObjectURL(f) : null;
    this.archivoSeleccionado.emit(f);
  }

  /** Vacía la zona (y avisa con null para que el padre olvide el fichero). */
  quitar(ev?: Event): void {
    ev?.stopPropagation();
    this.liberarVistaPrevia();
    this.archivo = null;
    this.error = '';
    this.archivoSeleccionado.emit(null);
  }

  // ---------- Validación ----------

  private validar(f: File): string {
    const ext = (f.name.split('.').pop() ?? '').toLowerCase();
    if (this.extensiones.length && !this.extensiones.includes(ext)) {
      return `Sólo se admiten archivos ${this.extensiones.map(e => e.toUpperCase()).join(', ')}`;
    }
    if (this.maxMb > 0 && f.size > this.maxMb * 1024 * 1024) {
      return `El archivo pesa ${this.formato(f.size)}; el máximo es ${this.maxMb} MB`;
    }
    return '';
  }

  // ---------- Utilidades para la plantilla ----------

  get extension(): string {
    return (this.archivo?.name.split('.').pop() ?? '').toUpperCase();
  }

  formato(bytes: number): string {
    if (bytes < 1024) { return `${bytes} B`; }
    if (bytes < 1024 * 1024) { return `${(bytes / 1024).toFixed(0)} KB`; }
    return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
  }

  private liberarVistaPrevia(): void {
    if (this.vistaPrevia) {
      URL.revokeObjectURL(this.vistaPrevia);   // si no, el blob se queda en memoria
      this.vistaPrevia = null;
    }
  }
}
