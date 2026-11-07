import { Component, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';
import {
  CdkDrag, CdkDragDrop, CdkDragHandle, CdkDragPlaceholder, CdkDropList, moveItemInArray,
} from '@angular/cdk/drag-drop';

import { SeguridadService } from '../../../../seguridad/services/seguridad.service';
import { AccesoModel } from '../../../../seguridad/interfaces/accesoModel';
import { EspanaMotosService } from '../../../services/espanaMotos.service';
import { MarcaService } from '../../../../inventarios/services/marca.service';
import {
  EspanaMotosModel, MarcaMotosModel, PestanaMotosModel,
} from '../../../interfaces/espanaMotosModel';
import { ImagenTiendaModel } from '../../../interfaces/imagenModel';
import { ElegirImagenComponent } from '../../imagenes/elegirImagen/elegirImagen.component';

import { PanelComponent } from '../../../../../components/panel/panel.component';
import { TabPanelComponent, PestanaTab } from '../../../../../components/campos/tabPanel/tabPanel.component';
import { CampoTextoComponent } from '../../../../../components/campos/campoTexto/campoTexto.component';
import { CheckboxComponent } from '../../../../../components/campos/checkbox/checkbox.component';
import { ComboComponent } from '../../../../../components/campos/combo/combo.component';
import { SavePestanaMotosComponent } from '../savePestanaMotos/savePestanaMotos.component';

/**
 * ESPAÑA MOTOS: un micro-sitio dentro de la tienda.
 *
 * Tiene su portada (/espana-motos) y su catálogo (/espana-motos/catalogo), que
 * es la misma pantalla de /shop limitada a unas categorías.
 *
 * SE PUBLICA APARTE, y esa palanca va arriba del todo y separada del resto.
 * Mientras está apagada la tienda responde 404, así que se puede montar
 * entera —banner, fondo, pestañas, marcas— y encenderla cuando esté lista, en
 * vez de armarla a la vista de cualquiera.
 *
 * TRES PESTAÑAS porque son tres trabajos distintos: cómo se ve la portada, qué
 * agrupa el catálogo, y qué marcas se enseñan.
 *
 * LAS CATEGORÍAS Y LAS MARCAS SALEN DEL CATÁLOGO DE VERDAD
 * (inventarios.categorias e inventarios.marcas). El CRM viejo guardaba aquí
 * ids de otro ERP, y cuando ese ERP dejó de estar detrás quedaron apuntando a
 * nada. Ahora hay clave ajena: lo que se elige existe, y si alguien borra la
 * marca en Inventarios, la base lo impide.
 */
@Component({
  selector: 'app-editEspanaMotos',
  templateUrl: './editEspanaMotos.component.html',
  styleUrls: ['./editEspanaMotos.component.css'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    CommonModule, RouterLink, ReactiveFormsModule,
    PanelComponent, TabPanelComponent, CampoTextoComponent, CheckboxComponent, ComboComponent,
    CdkDropList, CdkDrag, CdkDragHandle, CdkDragPlaceholder,
  ],
})
export class EditEspanaMotosComponent implements OnInit {

  public titulo = 'España Motos';
  public accesoModel!: AccesoModel;

  public modelo: EspanaMotosModel | null = null;
  public form!: FormGroup;

  public cargando = true;
  public guardando = false;
  public trabajando = false;

  /** Las del catálogo, para el combo de añadir. Campo, no getter. */
  public marcasCatalogo: { id: number; name: string }[] = [];
  public marcaElegida = new FormControl<number | null>(null);

  /**
   * La imagen de fondo, FUERA DEL FORMULARIO.
   *
   * No es un campo que se escriba: se elige en un selector aparte, y mientras
   * no se guarda la portada hay que recordar la elección sin tocar lo que
   * devolvió el servidor. Se guarda el nombre, que es lo que va a la base, y
   * la dirección sólo para enseñarla.
   */
  public fondoImagen: string | null = null;
  public fondoImagenUrl: string | null = null;

  public readonly pestanas: PestanaTab[] = [
    { id: 'portada',  texto: 'Portada',  icono: 'fa-solid fa-image' },
    { id: 'catalogo', texto: 'Catálogo', icono: 'fa-solid fa-folder-tree' },
    { id: 'marcas',   texto: 'Marcas',   icono: 'fa-solid fa-award' },
  ];
  public pestana: 'portada' | 'catalogo' | 'marcas' = 'portada';

  private _motosService = inject(EspanaMotosService);
  private _marcaService = inject(MarcaService);
  private _seguridadService = inject(SeguridadService);
  private _toastr = inject(ToastrService);
  private modal = inject(NgbModal);
  private fb = inject(FormBuilder);
  private activeRoute = inject(ActivatedRoute);

  get puedeEditar(): boolean { return this.accesoModel?.editar === true; }
  get puedeCrear(): boolean { return this.accesoModel?.crear === true; }
  get puedeEliminar(): boolean { return this.accesoModel?.eliminar === true; }

  get pestanasCatalogo(): PestanaMotosModel[] { return this.modelo?.pestanas ?? []; }
  get marcas(): MarcaMotosModel[] { return this.modelo?.marcas ?? []; }

  get ctrlPublicada(): FormControl { return this.form.controls['publicada'] as FormControl; }
  get ctrlBanner(): FormControl { return this.form.controls['banner_visible'] as FormControl; }
  get ctrlFondo(): FormControl { return this.form.controls['fondo_visible'] as FormControl; }
  get ctrlTarjetas(): FormControl { return this.form.controls['tarjetas_visible'] as FormControl; }
  get ctrlMarcasVisible(): FormControl { return this.form.controls['marcas_visible'] as FormControl; }

  /** Sin imagen, el fondo encendido deja una franja en blanco con el título flotando. */
  get fondoSinImagen(): boolean {
    return this.ctrlFondo?.value === true && !this.fondoImagen;
  }

  /** Las que aún no están añadidas: repetir una no tiene sentido. */
  get marcasDisponibles(): { id: number; name: string }[] {
    const puestas = new Set(this.marcas.map(m => m.marca_id));
    return this.marcasCatalogo.filter(m => !puestas.has(m.id));
  }

  async ngOnInit(): Promise<void> {
    this.accesoModel = this.activeRoute.snapshot.data['access'];

    this.form = this.fb.group({
      publicada:        [false],
      banner_visible:   [true],
      fondo_visible:    [true],
      fondo_titulo:     ['', [Validators.maxLength(60)]],
      fondo_subtitulo:  ['', [Validators.maxLength(120)]],
      tarjetas_visible: [false],
      marcas_visible:   [true],
    });

    await Promise.all([this.cargar(), this.cargarMarcas()]);
  }

  async cargar(): Promise<void> {
    this.cargando = true;
    try {
      const res: any = await firstValueFrom(this._motosService.getEspanaMotos());
      this.pintar(res?.data);
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo cargar España Motos', 'Error',
                         { timeOut: 15000, closeButton: true });
    } finally {
      this.cargando = false;
    }
  }

  private async cargarMarcas(): Promise<void> {
    try {
      const res: any = await firstValueFrom(this._marcaService.listMarcas(true));
      this.marcasCatalogo = (res?.data ?? []).map((m: any) => ({ id: m.id, name: m.nombre }));
    } catch {
      this._toastr.error('No se pudo cargar el catálogo de marcas', 'Error');
      this.marcasCatalogo = [];
    }
  }

  private pintar(data: EspanaMotosModel | null | undefined): void {
    if (!data) { return; }
    this.modelo = data;

    this.fondoImagen = data.fondo_imagen ?? null;
    this.fondoImagenUrl = data.fondo_imagen_url ?? null;

    this.form.patchValue({
      publicada:        data.publicada === true,
      banner_visible:   data.banner_visible !== false,
      fondo_visible:    data.fondo_visible !== false,
      fondo_titulo:     data.fondo_titulo ?? '',
      fondo_subtitulo:  data.fondo_subtitulo ?? '',
      tarjetas_visible: data.tarjetas_visible === true,
      marcas_visible:   data.marcas_visible !== false,
    });

    if (!this.puedeEditar) { this.form.disable(); }
  }

  // ================================================================
  // PORTADA
  // ================================================================

  /**
   * Elige la imagen de fondo de la biblioteca de la tienda, o sube una.
   *
   * NO SE GUARDA SOLA: se queda elegida y sale con «Guardar portada», como el
   * título y el subtítulo que la acompañan. Guardar la imagen por su cuenta
   * dejaría media portada puesta si luego se sale sin guardar.
   */
  elegirFondo(): void {
    if (this._seguridadService.isexpired() || !this.puedeEditar) { return; }

    const ref = this.modal.open(ElegirImagenComponent,
                                { size: 'xl', backdrop: 'static', centered: true, scrollable: true });
    ref.componentInstance.nombre = this.fondoImagen;
    ref.componentInstance.paraQue = 'el fondo de España Motos';

    ref.result.then((i: ImagenTiendaModel) => {
      this.fondoImagen = i.nombre;
      this.fondoImagenUrl = i.url;
    }, () => { /* se cerró sin elegir */ });
  }

  quitarFondo(): void {
    if (!this.puedeEditar) { return; }
    this.fondoImagen = null;
    this.fondoImagenUrl = null;
    // Sin imagen el fondo no se puede enseñar, y el servidor se negaría a
    // guardarlo: se apaga aquí para que la pantalla diga la verdad.
    this.ctrlFondo.setValue(false);
  }

  async guardarPortada(): Promise<void> {
    if (!this.puedeEditar || this.guardando) { return; }

    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.pestana = 'portada';
      this._toastr.error('Revise los campos.', 'No se puede guardar',
                         { timeOut: 20000, closeButton: true });
      return;
    }

    // El servidor se niega igual, pero decirlo aquí evita el viaje y señala
    // los dos arreglos posibles
    if (this.fondoSinImagen) {
      this.pestana = 'portada';
      this._toastr.error('Elige la imagen del fondo, o apaga el fondo.', 'Falta la imagen',
                         { timeOut: 20000, closeButton: true });
      return;
    }

    const v = this.form.getRawValue();
    const limpio = (x: any) => (x ?? '').toString().trim() || null;

    this.guardando = true;
    try {
      const res: any = await firstValueFrom(this._motosService.editEspanaMotos({
        publicada:        v.publicada === true,
        banner_visible:   v.banner_visible === true,
        fondo_visible:    v.fondo_visible === true,
        fondo_imagen:     this.fondoImagen,
        fondo_titulo:     limpio(v.fondo_titulo),
        fondo_subtitulo:  limpio(v.fondo_subtitulo),
        tarjetas_visible: v.tarjetas_visible === true,
        marcas_visible:   v.marcas_visible === true,
      }));

      this._toastr.success(res?.message ?? 'Guardado', 'Listo');
      this.pintar(res?.data);

    } catch (e: any) {
      // El servidor exige imagen si el fondo está encendido, entre otras
      this._toastr.error(e?.error?.message ?? 'No se pudo guardar', 'Error',
                         { timeOut: 20000, closeButton: true });
    } finally {
      this.guardando = false;
    }
  }

  // ================================================================
  // PESTAÑAS DEL CATÁLOGO
  // ================================================================

  nuevaPestana(): void { this.abrirPestana(null); }
  editarPestana(p: PestanaMotosModel): void { this.abrirPestana(p); }

  private abrirPestana(p: PestanaMotosModel | null): void {
    if (this._seguridadService.isexpired()) { return; }
    if (!(p ? this.puedeEditar : this.puedeCrear)) { return; }

    const ref = this.modal.open(SavePestanaMotosComponent,
                                { size: 'lg', backdrop: 'static', centered: true });
    ref.componentInstance.pestana = p;
    ref.result.then((data: any) => this.pintar(data), () => { /* se cerró sin guardar */ });
  }

  async quitarPestana(p: PestanaMotosModel): Promise<void> {
    if (this._seguridadService.isexpired() || !this.puedeEliminar || this.trabajando) { return; }
    if (!confirm(`¿Quitar la pestaña «${p.nombre}» del catálogo de España Motos?\n\n`
                 + 'Las categorías no se tocan: siguen en el catálogo.')) { return; }

    await this.accion(() => this._motosService.deletePestana(p.id));
  }

  async soltarPestana(evento: CdkDragDrop<PestanaMotosModel[]>): Promise<void> {
    if (!this.puedeEditar || evento.previousIndex === evento.currentIndex || !this.modelo) { return; }

    moveItemInArray(this.modelo.pestanas, evento.previousIndex, evento.currentIndex);
    await this.accion(() => this._motosService.ordenarPestanas(this.modelo!.pestanas.map(p => p.id)), false);
  }

  // ================================================================
  // MARCAS
  // ================================================================

  async anadirMarca(): Promise<void> {
    if (this._seguridadService.isexpired() || !this.puedeCrear || this.trabajando) { return; }

    const id = this.marcaElegida.value;
    if (!id) {
      this._toastr.info('Elige una marca del catálogo.', 'Falta algo');
      return;
    }

    await this.accion(() => this._motosService.addMarca(id));
    this.marcaElegida.setValue(null);
  }

  async quitarMarca(m: MarcaMotosModel): Promise<void> {
    if (this._seguridadService.isexpired() || !this.puedeEliminar || this.trabajando) { return; }
    if (!confirm(`¿Quitar «${m.nombre}» de España Motos?\n\nLa marca sigue en el catálogo.`)) { return; }

    await this.accion(() => this._motosService.deleteMarca(m.id));
  }

  async soltarMarca(evento: CdkDragDrop<MarcaMotosModel[]>): Promise<void> {
    if (!this.puedeEditar || evento.previousIndex === evento.currentIndex || !this.modelo) { return; }

    moveItemInArray(this.modelo.marcas, evento.previousIndex, evento.currentIndex);
    await this.accion(() => this._motosService.ordenarMarcas(this.modelo!.marcas.map(m => m.id)), false);
  }

  // ================================================================

  /** Todas las acciones devuelven la configuración entera y se repinta. */
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
