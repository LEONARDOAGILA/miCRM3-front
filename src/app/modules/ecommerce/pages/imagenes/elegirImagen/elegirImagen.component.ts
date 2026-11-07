import { Component, Input, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';

import { ImagenService } from '../../../services/imagen.service';
import { ImagenTiendaModel } from '../../../interfaces/imagenModel';

/**
 * ELEGIR UNA IMAGEN DE LA TIENDA.
 *
 * No es una pantalla: es el selector que abren las demás. Vive en `pages`
 * porque en este front los componentes de un módulo cuelgan de ahí, y `pages`
 * es el único sitio del módulo donde ya hay componentes.
 *
 * LO USA MÁS DE UNA PANTALLA, y de ahí que esté aparte: el fondo de España
 * Motos lo necesita hoy, y las galerías —el banner del inicio, las tarjetas,
 * los logos del pie— lo necesitarán igual. Las imágenes son de una sola
 * carpeta compartida, así que el selector también es uno.
 *
 * SE ELIGE DE LAS QUE YA HAY, O SE SUBE UNA. Las dos cosas en el mismo sitio:
 * quien viene a poner un fondo no sabe de antemano si la foto está subida, y
 * mandarle a otra pantalla a subirla y volver sería un viaje de ida y vuelta
 * para nada.
 *
 * AQUÍ NO SE BORRA NINGÚN FICHERO. La misma imagen puede estar puesta en dos
 * pantallas y citada dentro del texto de una página, y no hay forma de
 * saberlo con certeza: borrarla dejaría huecos que nadie relaciona con este
 * botón. Quitarla de un sitio se hace en ese sitio.
 */
@Component({
  selector: 'app-elegirImagen',
  templateUrl: './elegirImagen.component.html',
  styleUrls: ['./elegirImagen.component.css'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [CommonModule],
})
export class ElegirImagenComponent implements OnInit {

  /** La que ya está puesta, para que salga marcada al abrir. */
  @Input() nombre: string | null = null;

  /** Lo que se enseña debajo del título, para saber para qué es. */
  @Input() paraQue = '';

  public imagenes: ImagenTiendaModel[] = [];
  public elegida: ImagenTiendaModel | null = null;

  public cargando = true;
  public subiendo = false;
  public filtro = '';

  private _imagenService = inject(ImagenService);
  private _toastr = inject(ToastrService);
  public activeModal = inject(NgbActiveModal);

  /**
   * Las que casan con lo escrito.
   *
   * SE FILTRA AQUÍ Y NO EN EL SERVIDOR: son ciento y pico, ya están en la
   * memoria, y volver a pedirlas en cada tecla haría parpadear la rejilla
   * para enseñar lo mismo recortado.
   */
  get visibles(): ImagenTiendaModel[] {
    const f = this.filtro.trim().toLowerCase();
    if (!f) { return this.imagenes; }
    return this.imagenes.filter(i => i.nombre.toLowerCase().includes(f));
  }

  async ngOnInit(): Promise<void> {
    await this.cargar();
  }

  async cargar(): Promise<void> {
    this.cargando = true;
    try {
      const res: any = await firstValueFrom(this._imagenService.listImagenes());
      this.imagenes = res?.data ?? [];
      // La que ya estaba puesta sale marcada, aunque esté abajo del todo
      this.elegida = this.imagenes.find(i => i.nombre === this.nombre) ?? null;

    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudieron cargar las imágenes', 'Error');
      this.imagenes = [];
    } finally {
      this.cargando = false;
    }
  }

  escribir(evento: Event): void {
    this.filtro = (evento.target as HTMLInputElement).value ?? '';
  }

  marcar(i: ImagenTiendaModel): void {
    this.elegida = i;
  }

  /** Doble clic: elegir y salir, que es lo que se espera de una rejilla así. */
  usarYa(i: ImagenTiendaModel): void {
    this.elegida = i;
    this.usar();
  }

  usar(): void {
    if (!this.elegida) {
      this._toastr.info('Pincha una imagen de la lista.', 'Falta elegir');
      return;
    }
    this.activeModal.close(this.elegida);
  }

  /**
   * Sube el fichero elegido y lo deja marcado arriba.
   *
   * SE LIMPIA EL `<input type=file>` AL TERMINAR: si no, subir dos veces el
   * mismo fichero no dispara el evento la segunda vez, porque su valor no ha
   * cambiado, y parece que el botón se ha roto.
   */
  async subir(evento: Event): Promise<void> {
    const input = evento.target as HTMLInputElement;
    const archivo = input.files?.[0];
    if (!archivo) { return; }

    this.subiendo = true;
    try {
      const res: any = await firstValueFrom(this._imagenService.subirImagen(archivo));
      const nueva: ImagenTiendaModel = {
        nombre: res.data.nombre,
        url: res.data.url,
        peso: archivo.size,
        subida: '',
        extension: res.data.extension,
      };
      this.imagenes = [nueva, ...this.imagenes];
      this.elegida = nueva;
      this.filtro = '';
      this._toastr.success(res?.message ?? 'Imagen subida', 'Listo');

    } catch (e: any) {
      // El servidor rechaza lo que no es imagen y lo que pasa de 4 MB
      this._toastr.error(e?.error?.message ?? 'No se pudo subir la imagen', 'Error',
                         { timeOut: 20000, closeButton: true });
    } finally {
      this.subiendo = false;
      input.value = '';
    }
  }

  /** El peso en algo que se lea de un vistazo. */
  peso(bytes: number): string {
    if (!bytes) { return ''; }
    return bytes < 1024 * 1024
      ? Math.round(bytes / 1024) + ' KB'
      : (bytes / 1048576).toFixed(1) + ' MB';
  }
}
