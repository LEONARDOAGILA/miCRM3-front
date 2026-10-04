import { Component, ElementRef, EventEmitter, Input, OnDestroy, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpEventType } from '@angular/common/http';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';

import { ModalHeaderComponent } from '../../../../../components/modal/modal-header/modal-header.component';
import { ArchivoClienteService } from '../../../services/archivoCliente.service';
import {
  ArchivoCliente, FilaSubida, extensionDe, formatoTamano, pintaDeTipo, tipoPorExtension,
} from '../../../interfaces/archivoCliente';

/**
 * Subir uno o varios archivos a un cliente.
 *
 * La descripción se escribe UNA vez y vale para todos los de la tanda, que es
 * como se suben de verdad: las ocho fotos de una visita comparten el porqué.
 * El nombre sí es de cada uno —sale del fichero y se puede retocar en su fila—
 * porque es lo que luego se lee en la lista.
 *
 * Se sube de uno en uno (subirArchivo → addArchivo): así cada fila enseña su
 * progreso, el servidor no recibe ocho ficheros a la vez y un fallo no se lleva
 * por delante al resto —la fila queda en error con el motivo y se puede
 * reintentar sólo lo que falló—.
 */
@Component({
  selector: 'app-subirArchivos',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalHeaderComponent],
  templateUrl: './subirArchivos.component.html',
  styleUrls: ['./subirArchivos.component.css'],
})
export class SubirArchivosComponent implements OnDestroy {

  @Input() clienteId!: number;
  @Input() clienteNombre = '';

  /** Se emite al cerrar si se subió algo, para que la pestaña se refresque. */
  @Output() subidos = new EventEmitter<ArchivoCliente[]>();

  @ViewChild('selector') selector!: ElementRef<HTMLInputElement>;

  public filas: FilaSubida[] = [];
  public descripcion = '';
  public subiendo = false;
  public arrastrando = false;

  private clave = 0;
  private creados: ArchivoCliente[] = [];

  public readonly formatoTamano = formatoTamano;
  public readonly pintaDeTipo = pintaDeTipo;

  constructor(
    public modal: NgbActiveModal,
    private _toastr: ToastrService,
    private _archivoService: ArchivoClienteService,
  ) {}

  ngOnDestroy(): void {
    // Las miniaturas son object URLs: si no se sueltan, se quedan en memoria
    this.filas.forEach(f => { if (f.vistaPrevia) { URL.revokeObjectURL(f.vistaPrevia); } });
  }

  // ================================================================
  // LA COLA
  // ================================================================

  abrirSelector(): void { this.selector?.nativeElement.click(); }

  alElegir(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    this.encolar(Array.from(input.files ?? []));
    // Para poder volver a elegir el mismo fichero si se quitó de la cola
    input.value = '';
  }

  alSoltar(ev: DragEvent): void {
    ev.preventDefault();
    this.arrastrando = false;
    this.encolar(Array.from(ev.dataTransfer?.files ?? []));
  }

  alArrastrar(ev: DragEvent, entra: boolean): void {
    ev.preventDefault();
    this.arrastrando = entra;
  }

  private encolar(ficheros: File[]): void {
    for (const f of ficheros) {
      const extension = extensionDe(f.name);
      if (!extension) {
        this._toastr.warning(`«${f.name}» no tiene extensión, no se puede clasificar`, 'Archivo descartado');
        continue;
      }
      const tipo = tipoPorExtension(extension);
      this.filas = [...this.filas, {
        clave: ++this.clave,
        fichero: f,
        // El nombre original sin la extensión: es lo que la gente reconoce
        nombre: f.name.replace(/\.[^.]+$/, '').substring(0, 150),
        extension,
        tipo,
        tamano: f.size,
        estado: 'pendiente',
        progreso: 0,
        // La miniatura sólo para imágenes; para un video crearla costaría un
        // <video> oculto por cada fichero y no compensa
        vistaPrevia: tipo === 'imagen' ? URL.createObjectURL(f) : null,
      }];
    }
  }

  quitar(f: FilaSubida): void {
    if (f.estado === 'subiendo' || f.estado === 'guardando') { return; }
    if (f.vistaPrevia) { URL.revokeObjectURL(f.vistaPrevia); }
    this.filas = this.filas.filter(x => x.clave !== f.clave);
  }

  get pendientes(): FilaSubida[] {
    return this.filas.filter(f => f.estado === 'pendiente' || f.estado === 'error');
  }

  get hechos(): number { return this.filas.filter(f => f.estado === 'ok').length; }

  get fallidos(): number { return this.filas.filter(f => f.estado === 'error').length; }

  // ================================================================
  // SUBIR
  // ================================================================

  async subirTodo(): Promise<void> {
    if (this.subiendo) { return; }
    const cola = this.pendientes;
    if (!cola.length) {
      this._toastr.warning('Elige al menos un archivo', 'Nada que subir');
      return;
    }
    if (!this.clienteId) {
      this._toastr.error('No se sabe a qué cliente', 'Error');
      return;
    }

    this.subiendo = true;
    for (const fila of cola) {
      await this.subirUno(fila);
    }
    this.subiendo = false;

    if (this.fallidos) {
      this._toastr.warning(`${this.hechos} subido(s), ${this.fallidos} con error. Revisa las filas en rojo.`, 'Terminado');
    } else {
      this._toastr.success(`${this.hechos} archivo(s) guardado(s)`, 'Listo', { closeButton: true });
      this.cerrar();
    }
  }

  /** Reintenta sólo una fila que falló. */
  async reintentar(fila: FilaSubida): Promise<void> {
    if (this.subiendo) { return; }
    this.subiendo = true;
    await this.subirUno(fila);
    this.subiendo = false;
  }

  private async subirUno(fila: FilaSubida): Promise<void> {
    fila.estado = 'subiendo';
    fila.progreso = 0;
    fila.error = undefined;

    try {
      // 1. El fichero al disco, viendo el progreso
      const subida = await new Promise<any>((resolver, rechazar) => {
        this._archivoService.subirArchivo(this.clienteId, fila.fichero).subscribe({
          next: (ev: any) => {
            if (ev.type === HttpEventType.UploadProgress && ev.total) {
              fila.progreso = Math.round((ev.loaded / ev.total) * 100);
            }
            if (ev.type === HttpEventType.Response) { resolver(ev.body); }
          },
          error: e => rechazar(e),
        });
      });

      if (subida?.status !== 'success') {
        throw new Error(subida?.message || 'No se pudo subir');
      }

      // 2. La fila, con la descripción de la tanda
      fila.estado = 'guardando';
      const d = subida.data;
      const res: any = await firstValueFrom(this._archivoService.addArchivo({
        cliente_id: this.clienteId,
        nombre: (fila.nombre ?? '').trim() || d.nombre_original,
        descripcion: (this.descripcion ?? '').trim() || null,
        archivo: d.archivo,
        tipo: d.tipo,
        extension: d.extension,
        mime: d.mime,
        tamano: d.tamano,
      }));

      if (res?.status !== 'success') {
        throw new Error(res?.message || 'No se pudo guardar el registro');
      }

      fila.estado = 'ok';
      fila.progreso = 100;
      fila.registroId = res.data?.id;
      this.creados.push(res.data);

    } catch (e: any) {
      fila.estado = 'error';
      // El AuthInterceptor ya saca el toast del error HTTP; aquí lo que hace
      // falta es que la fila diga qué le pasó, para poder reintentarla
      fila.error = e?.error?.message || e?.message || 'Error al subir';
      console.error('Error al subir el archivo del cliente:', e);
    }
  }

  // ================================================================
  // SALIR
  // ================================================================

  cerrar(): void {
    if (this.creados.length) { this.subidos.emit(this.creados); }
    this.modal.close(this.creados);
  }

  cancelar(): void {
    if (this.subiendo) { return; }
    // Lo que ya subió se queda: borrarlo aquí sería una sorpresa
    if (this.creados.length) { this.subidos.emit(this.creados); }
    this.modal.dismiss('cancelar');
  }
}
