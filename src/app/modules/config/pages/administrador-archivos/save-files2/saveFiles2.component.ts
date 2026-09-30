import { Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpEventType } from '@angular/common/http';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { Subject, firstValueFrom } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import Swal from 'sweetalert2';

import { ArchivoService } from '../../../services/archivo.service';
import { SeguridadService } from '../../../../seguridad/services/seguridad.service';
import { PanelModule } from '../../../../../components/panel/panel.module';
import { ModalHeaderComponent } from '../../../../../components/modal/modal-header/modal-header.component';
import { CampoTextoComponent } from '../../../../../components/campos/campoTexto/campoTexto.component';
import { ArchivoModel } from '../../../interfaces/archivoModel';
import { MAX_MB_ARCHIVO, TipoArchivo, extensionDe, formatoTamano, iconoPorExtension, tipoArchivoDeExtension } from '../../../interfaces/tipoArchivo';

/** Estado de cada fichero de la cola. */
type EstadoSubida = 'pendiente' | 'subiendo' | 'guardando' | 'ok' | 'error';

/** Un fichero en la cola de subida, con lo que se deduce de él. */
export interface FilaSubida {
  clave: number;
  fichero: File;
  /** Nombre del registro: el original sin extensión; el usuario puede retocarlo. */
  nombre: string;
  extension: string;
  tipo: TipoArchivo;
  icono: string;
  color: string;
  tamano: number;
  /** Secuencial a partir del siguiente orden libre de la carpeta. */
  orden: number;
  estado: EstadoSubida;
  /** 0-100 mientras sube. */
  progreso: number;
  error?: string;
  /** Miniatura (object URL) si es imagen. */
  vistaPrevia: string | null;
  /** id del registro creado (estado ok). */
  registroId?: number;
}

/**
 * Subida masiva de archivos a una carpeta del administrador.
 *
 * Diferencias con saveFile (que crea UN archivo o enlace con todos sus
 * datos): aquí se sueltan varios ficheros a la vez y el sistema rellena
 * por cada uno lo que puede deducir del propio fichero:
 *   - nombre: el original sin extensión (editable en la fila),
 *   - icono y color: los que más se parecen a su extensión
 *     (iconoPorExtension: zip, PowerPoint, CSV, código… o los del tipo),
 *   - tipo / extensión / tamaño: los de la subida,
 *   - orden: secuencial desde el siguiente orden libre de la carpeta.
 * Lo que el usuario decide una sola vez, para todos: descripción, activo,
 * color (opcional: si no elige, cada uno lleva el de su tipo) y el panel
 * Acceso (proteger la URL / ventana nueva).
 *
 * Se sube de uno en uno (subirArchivo → addArchivo): así el orden queda
 * bien, el servidor no recibe N ficheros a la vez y cada fila muestra su
 * progreso. Un fallo no detiene al resto: la fila queda en error con el
 * motivo y se puede reintentar sólo lo fallido.
 */
@Component({
  selector: 'app-saveFiles2',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, PanelModule, ModalHeaderComponent, CampoTextoComponent],
  templateUrl: './saveFiles2.component.html',
  styleUrls: ['./saveFiles2.component.css'],
})
export class SaveFiles2Component implements OnInit, OnDestroy {

  /** Carpeta destino (registro del árbol: id, nombre, nivel). */
  @Input() registro_selected: any = {};
  /** Siguiente número de orden libre entre los hermanos (lo calcula quien abre el modal). */
  @Input() maxOrder2 = 1;
  /** Ficheros ya elegidos (p. ej. soltados sobre la grilla del administrador). */
  @Input() ficherosIniciales: File[] = [];

  /** Cada registro creado, según se va guardando (por si quien abre quiere refrescar en vivo). */
  @Output() registrosE = new EventEmitter<any>();

  @ViewChild('input') input!: ElementRef<HTMLInputElement>;

  public title = 'Subir varios archivos';
  public form!: FormGroup;
  public filas: FilaSubida[] = [];
  public arrastrando = false;
  public subiendo = false;
  /** Petición de parar al terminar el fichero en curso. */
  private cancelar = false;
  private clave = 0;
  private readonly destroy$ = new Subject<void>();

  /** 0 = sin límite propio (manda php.ini). */
  readonly maxMb = MAX_MB_ARCHIVO;
  /** Colores de acceso rápido (los del tema), como en saveFile. */
  readonly coloresRapidos = ['#F0B13B', '#348fe2', '#00acac', '#727cb6', '#ff5b57', '#f59c1a', '#A6A09B', '#2d353c'];

  constructor(
    private fb: FormBuilder,
    public modal: NgbActiveModal,
    private _archivoService: ArchivoService,
    private _seguridadService: SeguridadService,
    private _toastr: ToastrService,
  ) {}

  // ================================================================
  // CICLO DE VIDA
  // ================================================================

  ngOnInit(): void {
    if (this._seguridadService.isexpired()) { this.modal.close(); return; }
    this.form = this.fb.group({
      descripcion:   ['', [Validators.maxLength(100)]],
      activo:        [true],
      /** '' = cada archivo con el color de su tipo; un color = el mismo para todos. */
      color:         [''],
      proteger_url:  [true],
      nueva_ventana: [false],
    });
    this.sincronizarExclusion();
    if (this.ficherosIniciales?.length) { this.agregarFicheros(this.ficherosIniciales); }
  }

  ngOnDestroy(): void {
    this.filas.forEach(f => this.liberarVistaPrevia(f));
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ================================================================
  // ESTADO DERIVADO
  // ================================================================

  get nombrePadre(): string { return this.registro_selected?.nombre ?? ''; }
  get nivel(): number { return (this.registro_selected?.nivel ?? 0) + 1; }

  get ctrlActivo(): FormControl { return this.form.controls['activo'] as FormControl; }
  get ctrlProtegerUrl(): FormControl { return this.form.controls['proteger_url'] as FormControl; }
  get ctrlNuevaVentana(): FormControl { return this.form.controls['nueva_ventana'] as FormControl; }
  get colorComun(): string { return this.form?.controls['color']?.value || ''; }

  get pendientes(): FilaSubida[] { return this.filas.filter(f => f.estado === 'pendiente' || f.estado === 'error'); }
  get guardadas(): number { return this.filas.filter(f => f.estado === 'ok').length; }
  get fallidas(): number { return this.filas.filter(f => f.estado === 'error').length; }
  get tamanoTotal(): string { return formatoTamano(this.filas.reduce((s, f) => s + f.tamano, 0)); }

  /** Avance global: ficheros terminados + la parte del que está en curso. */
  get progresoGlobal(): number {
    if (!this.filas.length) { return 0; }
    const enCurso = this.filas.find(f => f.estado === 'subiendo' || f.estado === 'guardando');
    const hechas = this.filas.filter(f => f.estado === 'ok' || f.estado === 'error').length;
    const parcial = enCurso ? (enCurso.estado === 'guardando' ? 1 : enCurso.progreso / 100) : 0;
    return Math.round(100 * (hechas + parcial) / this.filas.length);
  }

  /** Texto del botón principal según el momento. */
  get textoBoton(): string {
    if (this.subiendo) { return `Subiendo ${this.guardadas + this.fallidas + 1} de ${this.filas.length}…`; }
    if (this.fallidas && this.guardadas + this.fallidas === this.filas.length) { return `Reintentar ${this.fallidas} con error`; }
    const n = this.pendientes.length;
    return n ? `Subir ${n} ${n === 1 ? 'archivo' : 'archivos'}` : 'Subir archivos';
  }

  formato(bytes: number): string { return formatoTamano(bytes); }

  // ================================================================
  // ENTRADA DE FICHEROS (zona + input múltiple)
  // ================================================================

  abrirSelector(): void {
    if (this.subiendo) { return; }
    this.input.nativeElement.click();
  }

  onInputChange(ev: Event): void {
    const lista = (ev.target as HTMLInputElement).files;
    if (lista?.length) { this.agregarFicheros(Array.from(lista)); }
    (ev.target as HTMLInputElement).value = '';   // permite volver a elegir los mismos
  }

  onDragOver(ev: DragEvent): void {
    ev.preventDefault();
    if (!this.subiendo) { this.arrastrando = true; }
  }

  onDragLeave(ev: DragEvent): void {
    const destino = ev.relatedTarget as Node | null;
    if (destino && (ev.currentTarget as HTMLElement).contains(destino)) { return; }
    this.arrastrando = false;
  }

  onDrop(ev: DragEvent): void {
    ev.preventDefault();
    this.arrastrando = false;
    if (this.subiendo) { return; }
    const lista = ev.dataTransfer?.files;
    if (lista?.length) { this.agregarFicheros(Array.from(lista)); }
  }

  /**
   * Añade ficheros a la cola: descarta repetidos (mismo nombre y tamaño) y
   * los que superen el límite; deduce nombre, icono, color y orden.
   */
  agregarFicheros(ficheros: File[]): void {
    let repetidos = 0, grandes = 0;
    for (const f of ficheros) {
      if (this.filas.some(x => x.fichero.name === f.name && x.fichero.size === f.size)) { repetidos++; continue; }
      if (this.maxMb > 0 && f.size > this.maxMb * 1024 * 1024) { grandes++; continue; }
      const extension = extensionDe(f.name);
      const def = iconoPorExtension(extension);
      this.filas.push({
        clave: ++this.clave,
        fichero: f,
        nombre: this.nombreDesdeFichero(f.name),
        extension,
        tipo: def.tipo,
        icono: def.icono,
        color: def.color,
        tamano: f.size,
        orden: 0,
        estado: 'pendiente',
        progreso: 0,
        vistaPrevia: f.type.startsWith('image/') ? URL.createObjectURL(f) : null,
      });
    }
    this.renumerar();
    if (repetidos) { this._toastr.info(`${repetidos} ${repetidos === 1 ? 'archivo ya estaba' : 'archivos ya estaban'} en la lista`, 'Subir archivos'); }
    if (grandes)   { this._toastr.warning(`${grandes} ${grandes === 1 ? 'archivo supera' : 'archivos superan'} el máximo de ${this.maxMb} MB`, 'Subir archivos'); }
  }

  /** Nombre propuesto: el original tal cual, sin la extensión (máximo 100, como la columna). */
  private nombreDesdeFichero(nombre: string): string {
    return (nombre.replace(/\.[^.]+$/, '').trim() || nombre).slice(0, 100);
  }

  /** Orden secuencial desde el siguiente libre de la carpeta, en el orden de la lista. */
  private renumerar(): void {
    this.filas.forEach((f, i) => f.orden = this.maxOrder2 + i);
  }

  quitar(fila: FilaSubida): void {
    if (this.subiendo || fila.estado === 'ok') { return; }
    this.liberarVistaPrevia(fila);
    this.filas = this.filas.filter(f => f.clave !== fila.clave);
    this.renumerar();
  }

  quitarTodos(): void {
    if (this.subiendo) { return; }
    this.filas.filter(f => f.estado !== 'ok').forEach(f => this.liberarVistaPrevia(f));
    this.filas = this.filas.filter(f => f.estado === 'ok');
    this.renumerar();
  }

  /** Mover una fila arriba / abajo en la cola (cambia el orden secuencial). */
  mover(fila: FilaSubida, delta: -1 | 1): void {
    if (this.subiendo) { return; }
    const i = this.filas.indexOf(fila);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= this.filas.length) { return; }
    [this.filas[i], this.filas[j]] = [this.filas[j], this.filas[i]];
    this.renumerar();
  }

  private liberarVistaPrevia(f: FilaSubida): void {
    if (f.vistaPrevia) { URL.revokeObjectURL(f.vistaPrevia); f.vistaPrevia = null; }
  }

  // ================================================================
  // OPCIONES COMUNES
  // ================================================================

  elegirColor(color: string): void {
    this.form.controls['color'].setValue(this.colorComun.toLowerCase() === color.toLowerCase() ? '' : color);
  }

  /** Color con el que se guardará una fila: el común si se eligió; si no, el de su tipo. */
  colorDe(f: FilaSubida): string { return this.colorComun || f.color; }

  onCambioProtegerUrl(activo: boolean): void {
    if (activo && this.ctrlNuevaVentana.value) { this.ctrlNuevaVentana.setValue(false); }
    this.sincronizarExclusion();
  }

  onCambioNuevaVentana(activo: boolean): void {
    if (activo && this.ctrlProtegerUrl.value) { this.ctrlProtegerUrl.setValue(false); }
    this.sincronizarExclusion();
  }

  /** Proteger la url y abrir en otra pestaña se excluyen (como en saveFile). */
  private sincronizarExclusion(): void {
    const proteger = this.ctrlProtegerUrl, ventana = this.ctrlNuevaVentana;
    proteger.value ? ventana.disable({ emitEvent: false })  : ventana.enable({ emitEvent: false });
    ventana.value  ? proteger.disable({ emitEvent: false }) : proteger.enable({ emitEvent: false });
  }

  // ================================================================
  // SUBIR
  // ================================================================

  async subirTodo(): Promise<void> {
    if (this.subiendo) { return; }
    const cola = this.pendientes;
    if (!cola.length) {
      this._toastr.warning('Arrastra o elige los archivos que quieres subir', 'Subir archivos');
      return;
    }
    const sinNombre = cola.find(f => !f.nombre.trim());
    if (sinNombre) {
      this._toastr.error(`El archivo «${sinNombre.fichero.name}» no tiene nombre`, 'Subir archivos', { closeButton: true });
      return;
    }
    if (this.form.invalid) {
      this._toastr.error('Revise la descripción (máximo 100 caracteres)', 'Subir archivos', { closeButton: true });
      return;
    }

    this.subiendo = true;
    this.cancelar = false;
    const comun = this.form.getRawValue();

    for (const fila of cola) {
      if (this.cancelar) { break; }
      await this.subirUna(fila, comun);
    }

    this.subiendo = false;
    const ok = this.guardadas, err = this.fallidas;
    if (this.cancelar) {
      this._toastr.info(`Detenido: ${ok} ${ok === 1 ? 'archivo subido' : 'archivos subidos'}`, 'Subir archivos');
      return;
    }
    if (!err) {
      this._toastr.success(`${ok} ${ok === 1 ? 'archivo subido' : 'archivos subidos'} a «${this.nombrePadre}»`, 'Éxito', { closeButton: true });
      this.modal.close({ subidos: ok });
    } else {
      this._toastr.warning(`${ok} ${ok === 1 ? 'subido' : 'subidos'}, ${err} con error. Revisa los marcados y pulsa Reintentar.`, 'Subir archivos', { timeOut: 8000, closeButton: true });
    }
  }

  /** Sube el fichero de la fila y crea su registro; deja la fila en ok o en error. */
  private async subirUna(fila: FilaSubida, comun: any): Promise<void> {
    fila.estado = 'subiendo';
    fila.progreso = 0;
    fila.error = undefined;
    try {
      const subida = await this.subirFichero(fila);
      fila.estado = 'guardando';

      const datos: ArchivoModel = {
        padre:  this.registro_selected?.id ?? null,
        nivel:  this.nivel,
        orden:  fila.orden,
        nombre: fila.nombre.trim(),
        descripcion: comun.descripcion ?? '',
        modulo: '',
        url:    subida.url,
        tipo:   tipoArchivoDeExtension(subida.extension),   // 'ARCHIVO PDF', 'ARCHIVO MP4'…
        tamano: subida.tamano,
        extension_archivo: subida.extension || null,
        icono:  fila.icono,
        color:  this.colorDe(fila),
        escarpeta: false,
        activo: !!comun.activo,
        nueva_ventana: !!comun.nueva_ventana,
        proteger_url:  !!comun.proteger_url,
      };
      const res: any = await firstValueFrom(this._archivoService.addArchivo(datos));
      if (res?.status !== 'success') { throw new Error(res?.message || 'No se pudo guardar el registro'); }

      fila.estado = 'ok';
      fila.progreso = 100;
      fila.registroId = res.data?.id;
      this.registrosE.emit(res.data);
    } catch (e: any) {
      fila.estado = 'error';
      fila.error = e?.error?.message || e?.message || 'No se pudo subir';
      console.error('Error al subir', fila.fichero.name, e);
    }
  }

  private subirFichero(fila: FilaSubida): Promise<{ url: string; tamano: number; extension: string }> {
    return new Promise((resolve, reject) => {
      this._archivoService.subirArchivo(fila.fichero)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: ev => {
            if (ev.type === HttpEventType.UploadProgress && ev.total) {
              fila.progreso = Math.round(100 * ev.loaded / ev.total);
            } else if (ev.type === HttpEventType.Response) {
              const cuerpo: any = ev.body;
              if (cuerpo?.status !== 'success') { reject(new Error(cuerpo?.message || 'No se pudo subir el archivo')); return; }
              resolve({ url: cuerpo.data.url, tamano: cuerpo.data.tamano, extension: String(cuerpo.data.extension ?? '').toLowerCase() });
            }
          },
          error: err => reject(err),
        });
    });
  }

  /** Para tras el fichero en curso (lo ya subido queda guardado). */
  detener(): void {
    if (!this.subiendo) { return; }
    this.cancelar = true;
    this._toastr.info('Se detendrá al terminar el archivo en curso', 'Subir archivos');
  }

  // ================================================================
  // CERRAR
  // ================================================================

  async cerrar(): Promise<void> {
    if (this.subiendo) {
      this._toastr.warning('Hay una subida en curso: pulsa Detener antes de cerrar', 'Subir archivos');
      return;
    }
    if (this.pendientes.length) {
      const { isConfirmed } = await Swal.fire({
        title: '¿Cerrar sin subir?',
        text: `Hay ${this.pendientes.length} ${this.pendientes.length === 1 ? 'archivo' : 'archivos'} sin subir.`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Sí, cerrar',
        cancelButtonText: 'Seguir aquí',
        reverseButtons: true,
      });
      if (!isConfirmed) { return; }
    }
    // Si algo se subió, quien abre el modal recarga (result con subidos > 0)
    this.guardadas ? this.modal.close({ subidos: this.guardadas }) : this.modal.dismiss('Close click');
  }
}
