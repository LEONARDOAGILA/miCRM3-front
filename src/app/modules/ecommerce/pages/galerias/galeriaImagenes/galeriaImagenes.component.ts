import {
  Component, EventEmitter, Input, OnInit, Output, inject, ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';
import {
  CdkDrag, CdkDragDrop, CdkDragHandle, CdkDragPlaceholder, CdkDropList, moveItemInArray,
} from '@angular/cdk/drag-drop';

import { GaleriaService } from '../../../services/galeria.service';
import {
  GaleriaModel, ImagenGaleriaModel, ImagenEnPapelera, ESTADOS_IMAGEN, DONDE_SE_VE,
} from '../../../interfaces/galeriaModel';
import { SaveImagenGaleriaComponent } from '../saveImagenGaleria/saveImagenGaleria.component';

/**
 * EL CONTENIDO DE UNA GALERÍA.
 *
 * No es una pantalla: es el trozo que se mete dentro de otra. Hoy lo usan las
 * dos secciones de banner de la portada; las páginas de marca y España Motos
 * lo usarán igual, porque todas administran lo mismo —las imágenes de un
 * sitio del diseño— y repetirlo tres veces es la forma de que acaben
 * comportándose distinto.
 *
 * SE CARGA SOLA al abrirse, por su clave. Quien la mete dentro no tiene que
 * saber nada de galerías: le pasa la clave y escucha `cambiada` para
 * refrescar su propia cuenta.
 *
 * EL ORDEN SE GUARDA AL SOLTAR, sin botón: es un gesto, y pedir que además se
 * confirme convierte un gesto en dos pasos. Lo demás —encender, apagar,
 * borrar— también va solo, porque cada cosa es una sola decisión.
 */
@Component({
  selector: 'app-galeriaImagenes',
  templateUrl: './galeriaImagenes.component.html',
  styleUrls: ['./galeriaImagenes.component.css'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [CommonModule, CdkDropList, CdkDrag, CdkDragHandle, CdkDragPlaceholder],
})
export class GaleriaImagenesComponent implements OnInit {

  /** La clave de la galería: `inicio_banner`, `espana_motos_tarjetas`… */
  @Input({ required: true }) clave!: string;

  @Input() puedeCrear = false;
  @Input() puedeEditar = false;
  @Input() puedeEliminar = false;

  /** Para que quien la mete dentro refresque su cuenta. */
  @Output() cambiada = new EventEmitter<GaleriaModel>();

  public galeria: GaleriaModel | null = null;
  public cargando = true;
  public trabajando = false;

  public papelera: ImagenEnPapelera[] = [];
  public papeleraAbierta = false;

  public readonly estados = ESTADOS_IMAGEN;

  private _galeriaService = inject(GaleriaService);
  private _toastr = inject(ToastrService);
  private modal = inject(NgbModal);

  get imagenes(): ImagenGaleriaModel[] { return this.galeria?.imagenes ?? []; }

  /** Si ya no caben más: el tope es del diseño de la tienda. */
  get llena(): boolean {
    const tope = this.galeria?.maximo ?? null;
    return tope !== null && this.imagenes.length >= tope;
  }

  /**
   * Cuántas se ven HOY.
   *
   * Es la cuenta que importa: una galería con cinco imágenes de las que
   * cuatro están apagadas o fuera de fecha enseña una, y en la tienda se nota
   * antes que aquí.
   */
  get visibles(): number {
    return this.imagenes.filter(i => i.estado === 'visible').length;
  }

  /** Y de esas, cuántas llegan a verse: la tienda sólo pinta las primeras. */
  get recortadas(): number {
    const mostrar = this.galeria?.mostrar ?? null;
    return mostrar !== null && this.visibles > mostrar ? this.visibles - mostrar : 0;
  }

  async ngOnInit(): Promise<void> {
    await this.cargar();
  }

  async cargar(): Promise<void> {
    this.cargando = true;
    try {
      const res: any = await firstValueFrom(this._galeriaService.getGaleria(this.clave));
      this.pintar(res?.data);
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo cargar la galería', 'Error',
                         { timeOut: 15000, closeButton: true });
    } finally {
      this.cargando = false;
    }
  }

  private pintar(data: GaleriaModel | null | undefined): void {
    if (!data) { return; }
    this.galeria = data;
    this.cambiada.emit(data);

    // La papelera abierta se queda al día; cerrada no se pide
    if (this.papeleraAbierta) { this.cargarPapelera(); }
  }

  /** Dónde se ve, en palabras. */
  donde(i: ImagenGaleriaModel): string {
    return DONDE_SE_VE.find(d => d.id === i.mostrar_en)?.name ?? i.mostrar_en;
  }

  // ================================================================
  // LAS IMÁGENES
  // ================================================================

  anadir(): void { this.abrir(null); }
  editar(i: ImagenGaleriaModel): void { this.abrir(i); }

  private abrir(i: ImagenGaleriaModel | null): void {
    if (!this.galeria) { return; }
    if (!(i ? this.puedeEditar : this.puedeCrear)) { return; }

    if (!i && this.llena) {
      this._toastr.info(
        `«${this.galeria.nombre}» admite ${this.galeria.maximo} imágenes y ya están puestas: quita una antes.`,
        'No caben más', { timeOut: 15000, closeButton: true });
      return;
    }

    const ref = this.modal.open(SaveImagenGaleriaComponent,
                                { size: 'xl', backdrop: 'static', centered: true, scrollable: true });
    ref.componentInstance.galeria = this.galeria;
    ref.componentInstance.imagen = i;
    ref.result.then((data: any) => this.pintar(data), () => { /* se cerró sin guardar */ });
  }

  async alternar(i: ImagenGaleriaModel): Promise<void> {
    if (!this.puedeEditar) { return; }
    await this.accion(() => this._galeriaService.activarImagen(i.id));
  }

  async quitar(i: ImagenGaleriaModel): Promise<void> {
    if (!this.puedeEliminar || this.trabajando) { return; }
    if (!confirm(`¿Quitar esta imagen de «${this.galeria?.nombre}»?\n\n`
                 + 'El fichero no se borra: sigue en la biblioteca y se puede volver a poner.')) { return; }

    await this.accion(() => this._galeriaService.deleteImagen(i.id));
  }

  async soltar(evento: CdkDragDrop<ImagenGaleriaModel[]>): Promise<void> {
    if (!this.puedeEditar || evento.previousIndex === evento.currentIndex || !this.galeria) { return; }

    moveItemInArray(this.galeria.imagenes, evento.previousIndex, evento.currentIndex);
    await this.accion(() => this._galeriaService.ordenarImagenes(
      this.galeria!.imagenes.map(i => i.id)), false);
  }

  // ================================================================
  // LA PAPELERA, LA DE ESTA GALERÍA
  // ================================================================

  async alternarPapelera(): Promise<void> {
    this.papeleraAbierta = !this.papeleraAbierta;
    if (this.papeleraAbierta) { await this.cargarPapelera(); }
  }

  private async cargarPapelera(): Promise<void> {
    try {
      const res: any = await firstValueFrom(this._galeriaService.papelera(this.clave));
      this.papelera = res?.data ?? [];
    } catch {
      this.papelera = [];
    }
  }

  async restaurar(i: ImagenEnPapelera): Promise<void> {
    if (!this.puedeEditar || this.trabajando) { return; }
    await this.accion(() => this._galeriaService.restaurar([i.id]));
  }

  async vaciar(): Promise<void> {
    if (!this.puedeEliminar || this.trabajando || !this.papelera.length) { return; }
    if (!confirm(`¿Vaciar la papelera de «${this.galeria?.nombre}»?\n\n`
                 + `Se pierden ${this.papelera.length} configuración(es) de imagen y no se pueden recuperar. `
                 + 'Los ficheros siguen en la biblioteca.')) { return; }

    await this.accion(() => this._galeriaService.vaciarPapelera(this.clave));
  }

  // ================================================================

  /** Todas las acciones devuelven la galería entera y se repinta. */
  private async accion(llamada: () => any, avisar = true): Promise<void> {
    this.trabajando = true;
    try {
      const res: any = await firstValueFrom(llamada());
      if (avisar) { this._toastr.success(res?.message ?? 'Listo', 'Listo'); }
      this.pintar(res?.data);
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo completar la acción', 'Error',
                         { timeOut: 15000, closeButton: true });
      await this.cargar();
    } finally {
      this.trabajando = false;
    }
  }
}
