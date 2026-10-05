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
 *
 * Se puede parar. Un video de 300 MB por una conexión de oficina son varios
 * minutos, y hasta ahora no había forma de arrepentirse: ni cancelar uno que se
 * eligió por error, ni parar la tanda entera. Ahora hay las dos.
 *
 * Lo que NO hay es pausar y continuar donde iba, y no es un olvido: eso exige
 * cortar el fichero en trozos y que el servidor los vaya pegando, porque HTTP
 * no sabe reanudar una subida a medias. Es otro trabajo, en el back también.
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

  /**
   * Corta la subida que está en curso, si la hay.
   *
   * Se guarda como función y no como Subscription porque hacen falta las dos
   * cosas a la vez: desuscribirse —que es lo que aborta el XHR— y cerrar la
   * promesa que está esperando, que si no se queda colgada para siempre (un
   * observable cancelado no llama ni a next, ni a error, ni a complete).
   */
  private abortar: (() => void) | null = null;

  /** Lo puso el usuario: al terminar el fichero en curso, no se sigue. */
  private detenido = false;

  public readonly formatoTamano = formatoTamano;
  public readonly pintaDeTipo = pintaDeTipo;

  constructor(
    public modal: NgbActiveModal,
    private _toastr: ToastrService,
    private _archivoService: ArchivoClienteService,
  ) {}

  ngOnDestroy(): void {
    // Cerrar el modal con un fichero a medio viajar lo dejaba subiendo igual:
    // el navegador no para un XHR porque se quite de la pantalla quien lo pidió
    this.detenido = true;
    this.abortar?.();

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
    // La cancelada cuenta como pendiente: pararla no es descartarla, es dejarla
    // para luego. Se vuelve a intentar con el mismo botón de «Subir».
    return this.filas.filter(f =>
      f.estado === 'pendiente' || f.estado === 'error' || f.estado === 'cancelado');
  }

  get hechos(): number { return this.filas.filter(f => f.estado === 'ok').length; }

  get fallidos(): number { return this.filas.filter(f => f.estado === 'error').length; }

  get cancelados(): number { return this.filas.filter(f => f.estado === 'cancelado').length; }

  /** La que está viajando ahora, para enseñar su avance en el pie. */
  get filaEnCurso(): FilaSubida | undefined {
    return this.filas.find(f => f.estado === 'subiendo' || f.estado === 'guardando');
  }

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
    this.detenido = false;
    for (const fila of cola) {
      // Se mira antes de cada uno: parar en medio de la tanda deja los que
      // faltan como estaban, listos para seguir cuando quiera
      if (this.detenido) { break; }
      await this.subirUno(fila);
    }
    this.subiendo = false;

    if (this.detenido) {
      const faltan = this.pendientes.length;
      this._toastr.info(
        `Subida detenida. ${this.hechos} archivo(s) guardado(s)` +
        (faltan ? `, ${faltan} sin subir: siguen en la lista.` : '.'),
        'Detenida', { timeOut: 7000, closeButton: true });
      return;
    }

    if (this.fallidos) {
      this._toastr.warning(`${this.hechos} subido(s), ${this.fallidos} con error. Revisa las filas en rojo.`, 'Terminado');
    } else {
      this._toastr.success(`${this.hechos} archivo(s) guardado(s)`, 'Listo', { closeButton: true });
      this.cerrar();
    }
  }

  /** Reintenta sólo una fila que falló o que se canceló. */
  async reintentar(fila: FilaSubida): Promise<void> {
    if (this.subiendo) { return; }
    this.subiendo = true;
    this.detenido = false;
    await this.subirUno(fila);
    this.subiendo = false;
  }

  // ---------------- PARAR ----------------

  /**
   * Para la tanda entera.
   *
   * Corta el fichero que está viajando y no empieza los que faltan. Lo que ya
   * se guardó se queda guardado: deshacerlo sería una sorpresa, y además es lo
   * que uno quiere cuando para por haberse equivocado con el siguiente.
   *
   * Si el corte llega mientras se está guardando la fila en la base —el paso
   * corto de después de la subida—, se le deja terminar. Abortar ahí dejaría el
   * fichero en el disco del servidor sin ninguna fila que lo nombre, o sea
   * basura invisible; esperar un instante sale mucho más barato.
   */
  detener(): void {
    if (!this.subiendo) { return; }
    this.detenido = true;
    this.abortar?.();
  }

  /**
   * Cancela sólo el que está subiendo y sigue con los demás.
   *
   * Es el caso de «me equivoqué de archivo» o «éste pesa demasiado y no era
   * urgente»: no hay por qué tirar abajo toda la tanda.
   */
  cancelarFila(fila: FilaSubida): void {
    if (fila.estado !== 'subiendo') { return; }
    this.abortar?.();
  }

  /** ¿Se puede cortar ya mismo, o está en el paso que no se interrumpe? */
  get sePuedeCortar(): boolean { return !!this.abortar; }

  private async subirUno(fila: FilaSubida): Promise<void> {
    fila.estado = 'subiendo';
    fila.progreso = 0;
    fila.error = undefined;

    try {
      // 1. El fichero al disco, viendo el progreso
      const subida = await this.subirFichero(fila);

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
      // Pararlo no es un fallo: ni se pinta en rojo, ni se escribe un motivo,
      // ni se manda a la consola. La fila se queda lista para volver a
      // intentarlo cuando quiera.
      if (e instanceof SubidaCancelada) {
        fila.estado = 'cancelado';
        fila.progreso = 0;
        return;
      }

      fila.estado = 'error';
      // El AuthInterceptor ya saca el toast del error HTTP; aquí lo que hace
      // falta es que la fila diga qué le pasó, para poder reintentarla
      fila.error = e?.error?.message || e?.message || 'Error al subir';
      console.error('Error al subir el archivo del cliente:', e);
    }
  }

  /**
   * Manda el fichero y deja preparada la forma de cortarlo.
   *
   * Angular aborta la petición de verdad al desuscribirse —el navegador deja de
   * mandar bytes—, pero la promesa que envuelve al observable hay que cerrarla
   * aparte: un observable cancelado no llama a next, ni a error, ni a complete,
   * así que sin el rechazo a mano el `await` de arriba se quedaría esperando
   * para siempre y la cola no avanzaría nunca.
   */
  private subirFichero(fila: FilaSubida): Promise<any> {
    return new Promise<any>((resolver, rechazar) => {
      const sub = this._archivoService.subirArchivo(this.clienteId, fila.fichero).subscribe({
        next: (ev: any) => {
          if (ev.type === HttpEventType.UploadProgress && ev.total) {
            fila.progreso = Math.round((ev.loaded / ev.total) * 100);
          }
          if (ev.type === HttpEventType.Response) { resolver(ev.body); }
        },
        error: e => rechazar(e),
      });

      this.abortar = () => {
        sub.unsubscribe();
        rechazar(new SubidaCancelada());
      };
    }).finally(() => {
      // Mientras no haya una subida viva no hay nada que cortar, y el botón de
      // parar tiene que notarlo
      this.abortar = null;
    });
  }

  // ================================================================
  // SALIR
  // ================================================================

  cerrar(): void {
    if (this.creados.length) { this.subidos.emit(this.creados); }
    this.modal.close(this.creados);
  }

  cancelar(): void {
    // Antes esto no hacía nada mientras subía, así que la X de la cabecera se
    // quedaba muerta justo cuando más falta hacía. Ahora corta primero: cerrar
    // el modal sin parar dejaría el fichero viajando y al usuario creyendo que
    // lo había parado.
    if (this.subiendo) { this.detener(); }

    // Lo que ya subió se queda: borrarlo aquí sería una sorpresa
    if (this.creados.length) { this.subidos.emit(this.creados); }
    this.modal.dismiss('cancelar');
  }
}

/**
 * Lo que se lanza al cortar una subida.
 *
 * Es una clase y no un string suelto para poder distinguirlo de un error de
 * verdad con un instanceof: si no, habría que comparar mensajes, que es
 * exactamente lo que se rompe el día que alguien cambia el texto.
 */
class SubidaCancelada extends Error {
  constructor() {
    super('Subida cancelada por el usuario');
    this.name = 'SubidaCancelada';
  }
}
