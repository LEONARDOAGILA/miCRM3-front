import { Component, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { NgScrollbarModule } from 'ngx-scrollbar';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';
import {
  CdkDrag, CdkDragDrop, CdkDragHandle, CdkDragPlaceholder, CdkDropList, moveItemInArray,
} from '@angular/cdk/drag-drop';

import { SeguridadService } from '../../../../seguridad/services/seguridad.service';
import { AccesoModel } from '../../../../seguridad/interfaces/accesoModel';
import { MarcaWebService } from '../../../services/marcaWeb.service';
import {
  MarcaWebModel, ImagenesDeMarca, CuentaImagenesMarca, ESTADOS_MARCA,
} from '../../../interfaces/marcaWebModel';
import {
  ImagenProgramadaModel, ImagenProgramadaEnPapelera, ESTADOS_IMAGEN_PROGRAMADA,
} from '../../../interfaces/imagenProgramadaModel';
import { SaveImagenProgramadaComponent } from '../../imagenes/saveImagenProgramada/saveImagenProgramada.component';

import { PanelComponent } from '../../../../../components/panel/panel.component';

/**
 * LAS MARCAS DE LA TIENDA: LA LISTA A LA IZQUIERDA, SUS IMÁGENES A LA
 * DERECHA.
 *
 * Lo mismo que las categorías, con una diferencia: una marca no cuelga de
 * nadie, así que a la izquierda hay una LISTA y no un árbol.
 *
 * LO QUE SE ADMINISTRA AQUÍ:
 *
 *   · si la marca sale en la tienda y con qué nombre
 *   · su sitio en «Nuestras marcas», en la tercera columna
 *   · SUS IMÁGENES, cada una con sus fechas
 *
 * LA IMAGEN PROGRAMADA MANDA SOBRE EL LOGO DEL CATÁLOGO, y sólo mientras
 * esté en fecha. Una marca ya tiene su logo en Inventarios y con eso sale;
 * lo de aquí es para la campaña —el logo de navidad, el del aniversario—.
 * Sin ninguna programada se usa el de siempre, así que nadie tiene que
 * volver a subir lo que ya está.
 *
 * EL CATÁLOGO ES DE INVENTARIOS: aquí no se crea, ni se borra, ni se
 * renombra una marca.
 */
@Component({
  selector: 'app-allMarcasWeb',
  templateUrl: './allMarcasWeb.component.html',
  styleUrls: ['./allMarcasWeb.component.css'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    CommonModule, FormsModule, RouterLink, NgScrollbarModule, PanelComponent,
    CdkDropList, CdkDrag, CdkDragHandle, CdkDragPlaceholder,
  ],
})
export class AllMarcasWebComponent implements OnInit {

  public titulo = 'Marcas de la tienda';
  public accesoModel!: AccesoModel;

  // ---------- La lista ----------
  public marcas: MarcaWebModel[] = [];
  public busqueda = '';
  public recargando = false;

  /** Cuántas imágenes tiene cada marca y si alguna sale hoy. */
  private cuentas = new Map<number, CuentaImagenesMarca>();

  // ---------- La elegida ----------
  public seleccionId: number | null = null;
  public contenido: ImagenesDeMarca | null = null;
  public cargandoImagenes = false;

  public papelera: ImagenProgramadaEnPapelera[] = [];
  public papeleraAbierta = false;

  /** El nombre para la tienda, mientras se escribe. */
  public nombreWeb = '';

  public trabajando = false;

  // ---------- El lateral ----------
  public mobileSidebarToggled = false;
  public redimensionando = false;
  public readonly ANCHO_LATERAL_DEFECTO = 280;
  private readonly ANCHO_LATERAL_MIN = 200;
  private readonly ANCHO_LATERAL_MAX = 560;
  private readonly CLAVE_ANCHO_LATERAL = 'miCRM3.allMarcasWeb.anchoLateral';
  public anchoLateral = this.leerAnchoLateral();

  public readonly estadosMarca = ESTADOS_MARCA;
  public readonly estadosImagen = ESTADOS_IMAGEN_PROGRAMADA;

  private _marcaService = inject(MarcaWebService);
  private _seguridadService = inject(SeguridadService);
  private _toastr = inject(ToastrService);
  private modal = inject(NgbModal);
  private activeRoute = inject(ActivatedRoute);

  get puedeEditar(): boolean { return this.accesoModel?.editar === true; }
  get puedeCrear(): boolean { return this.accesoModel?.crear === true; }
  get puedeEliminar(): boolean { return this.accesoModel?.eliminar === true; }

  get seleccionada(): MarcaWebModel | null {
    return this.marcas.find(m => m.id === this.seleccionId) ?? null;
  }

  get imagenes(): ImagenProgramadaModel[] { return this.contenido?.imagenes ?? []; }

  /** La que se está viendo ahora mismo en la tienda, si hay alguna. */
  get laQueSale(): ImagenProgramadaModel | null {
    return this.imagenes.find(i => i.sale_ahora) ?? null;
  }

  /** Las que casan con lo escrito. Son catorce: se filtra en memoria. */
  get visibles(): MarcaWebModel[] {
    const f = this.busqueda.trim().toLowerCase();
    if (!f) { return this.marcas; }
    return this.marcas.filter(m => m.nombre.toLowerCase().includes(f)
                                || m.nombre_catalogo.toLowerCase().includes(f));
  }

  /**
   * Las que salen en la tienda, EN SU ORDEN. Es la tercera columna.
   *
   * VA EN UN CAMPO y no en un getter: es la lista que se arrastra, y un
   * array nuevo en cada ciclo de detección de cambios deja al cdkDropList
   * sin saber qué movió.
   */
  public enLaTienda: MarcaWebModel[] = [];

  /** Cuántas salen hoy con alguna imagen (programada o el logo del catálogo). */
  get conImagen(): number {
    return this.enLaTienda.filter(m => this.cuentas.get(m.id)?.sale_alguna || m.logo).length;
  }

  async ngOnInit(): Promise<void> {
    this.accesoModel = this.activeRoute.snapshot.data['access'];
    await this.cargar();
  }

  // ================================================================
  // LA LISTA
  // ================================================================

  /**
   * Trae las marcas y cuántas imágenes tiene cada una.
   *
   * Son dos llamadas y no una por marca: catorce marcas serían catorce
   * viajes para pintar unos contadores.
   */
  async cargar(): Promise<void> {
    this.recargando = true;
    try {
      const [lista, cuentas]: any[] = await Promise.all([
        firstValueFrom(this._marcaService.allMarcasWeb()),
        firstValueFrom(this._marcaService.imagenesCuentas()),
      ]);

      this.marcas = lista?.data ?? [];
      this.cuentas = new Map((cuentas?.data ?? []).map((c: CuentaImagenesMarca) => [c.marca_id, c]));
      this.armarEnLaTienda();

      // Al abrir, la primera que de verdad se vea en la tienda: la pantalla
      // arranca enseñando algo en vez de un «elige una marca».
      if (this.seleccionId === null) {
        const primera = this.marcas.find(m => m.estado === 'visible');
        if (primera) { await this.seleccionar(primera.id); }
      }
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudieron cargar las marcas', 'Error',
                         { timeOut: 15000, closeButton: true });
      this.marcas = [];
      this.armarEnLaTienda();
    } finally {
      this.recargando = false;
    }
  }

  /** El servidor ya las manda en el orden de la tienda: aquí sólo se filtra. */
  private armarEnLaTienda(): void {
    this.enLaTienda = this.marcas.filter(m => m.estado === 'visible');
  }

  async seleccionar(id: number): Promise<void> {
    this.seleccionId = id;
    this.papeleraAbierta = false;
    this.papelera = [];
    this.mobileSidebarToggled = false;

    this.nombreWeb = this.seleccionada?.nombre_web ?? '';
    await this.cargarImagenes();
  }

  limpiarBusqueda(): void { this.busqueda = ''; }

  toggleMobileSidebar(): void { this.mobileSidebarToggled = !this.mobileSidebarToggled; }

  /** Cuántas imágenes tiene una marca, para la chapita de la lista. */
  cuentaDe(id: number): CuentaImagenesMarca | undefined {
    return this.cuentas.get(id);
  }

  // ---------- El divisor ----------

  iniciarRedimension(ev: PointerEvent): void {
    if (ev.button !== 0) { return; }
    ev.preventDefault();
    const divisor = ev.currentTarget as HTMLElement;
    const xInicial = ev.clientX;
    const anchoInicial = this.anchoLateral;
    this.redimensionando = true;
    divisor.setPointerCapture(ev.pointerId);

    const mover = (e: PointerEvent) => {
      const nuevo = anchoInicial + (e.clientX - xInicial);
      this.anchoLateral = Math.min(this.ANCHO_LATERAL_MAX,
                                   Math.max(this.ANCHO_LATERAL_MIN, Math.round(nuevo)));
    };
    const soltar = (e: PointerEvent) => {
      divisor.removeEventListener('pointermove', mover);
      divisor.removeEventListener('pointerup', soltar);
      divisor.removeEventListener('pointercancel', soltar);
      divisor.releasePointerCapture(e.pointerId);
      this.redimensionando = false;
      this.guardarAnchoLateral();
    };
    divisor.addEventListener('pointermove', mover);
    divisor.addEventListener('pointerup', soltar);
    divisor.addEventListener('pointercancel', soltar);
  }

  guardarAnchoLateral(): void {
    try { localStorage.setItem(this.CLAVE_ANCHO_LATERAL, String(this.anchoLateral)); }
    catch { /* ventana privada o almacenamiento bloqueado */ }
  }

  private leerAnchoLateral(): number {
    try {
      const guardado = Number(localStorage.getItem('miCRM3.allMarcasWeb.anchoLateral'));
      return Number.isFinite(guardado) && guardado >= 200 && guardado <= 560 ? guardado : 280;
    } catch { return 280; }
  }

  // ================================================================
  // LA MARCA ELEGIDA
  // ================================================================

  async cargarImagenes(): Promise<void> {
    if (this.seleccionId === null) { return; }

    this.cargandoImagenes = true;
    try {
      const res: any = await firstValueFrom(this._marcaService.imagenes(this.seleccionId));
      this.contenido = res?.data ?? null;
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudieron cargar las imágenes', 'Error',
                         { timeOut: 15000, closeButton: true });
      this.contenido = null;
    } finally {
      this.cargandoImagenes = false;
    }
  }

  async alternarVisible(): Promise<void> {
    const m = this.seleccionada;
    if (!m || !this.puedeEditar || this.trabajando) { return; }
    if (this._seguridadService.isexpired()) { return; }

    await this.accionMarca(() => this._marcaService.editMarcaWeb(m.id, {
      oculta: !m.oculta,
      nombre_web: m.nombre_web ?? null,
    }));
  }

  async guardarNombreWeb(): Promise<void> {
    const m = this.seleccionada;
    if (!m || !this.puedeEditar || this.trabajando) { return; }
    if (this._seguridadService.isexpired()) { return; }

    await this.accionMarca(() => this._marcaService.editMarcaWeb(m.id, {
      oculta: m.oculta,
      nombre_web: this.nombreWeb.trim() || null,
    }));
  }

  private async accionMarca(llamada: () => any): Promise<void> {
    this.trabajando = true;
    try {
      const res: any = await firstValueFrom(llamada());
      this._toastr.success(res?.message ?? 'Guardado', 'Listo');
      this.marcas = res?.data ?? this.marcas;
      this.armarEnLaTienda();
      this.nombreWeb = this.seleccionada?.nombre_web ?? '';
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo guardar', 'Error',
                         { timeOut: 20000, closeButton: true });
      await this.cargar();
    } finally {
      this.trabajando = false;
    }
  }

  /**
   * Se soltó una marca en otro sitio: ése es el orden de «Nuestras marcas».
   *
   * SE GUARDA AL SOLTAR, sin botón: es un gesto, y pedir que además se
   * confirme convierte un gesto en dos pasos.
   */
  async soltarEnLaTienda(evento: CdkDragDrop<MarcaWebModel[]>): Promise<void> {
    if (!this.puedeEditar || evento.previousIndex === evento.currentIndex) { return; }
    if (this._seguridadService.isexpired()) { return; }

    moveItemInArray(this.enLaTienda, evento.previousIndex, evento.currentIndex);
    const ids = this.enLaTienda.map(m => m.id);

    this.trabajando = true;
    try {
      const res: any = await firstValueFrom(this._marcaService.ordenarMarcas(ids));
      this.marcas = res?.data ?? this.marcas;
      this.armarEnLaTienda();
      this._toastr.success(res?.message ?? 'Orden guardado', 'Listo');
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo guardar el orden', 'Error',
                         { timeOut: 15000, closeButton: true });
      await this.cargar();
    } finally {
      this.trabajando = false;
    }
  }

  // ================================================================
  // LAS IMÁGENES
  // ================================================================

  programar(): void { this.abrirImagen(null); }
  editarImagen(i: ImagenProgramadaModel): void { this.abrirImagen(i); }

  private abrirImagen(i: ImagenProgramadaModel | null): void {
    const m = this.seleccionada;
    if (!m) { return; }
    if (!(i ? this.puedeEditar : this.puedeCrear)) { return; }
    if (this._seguridadService.isexpired()) { return; }

    const ref = this.modal.open(SaveImagenProgramadaComponent,
                                { size: 'lg', backdrop: 'static', centered: true });
    ref.componentInstance.tipo = 'marca';
    ref.componentInstance.duenioId = m.id;
    ref.componentInstance.duenioNombre = m.nombre;
    ref.componentInstance.imagen = i;

    ref.result.then((data: ImagenesDeMarca) => this.pintar(data),
                    () => { /* se cerró sin guardar */ });
  }

  async alternarImagen(i: ImagenProgramadaModel): Promise<void> {
    if (!this.puedeEditar || this.trabajando) { return; }
    await this.accionImagen(() => this._marcaService.activarImagen(i.id));
  }

  async quitarImagen(i: ImagenProgramadaModel): Promise<void> {
    if (!this.puedeEliminar || this.trabajando) { return; }
    if (!confirm(`¿Quitar esta imagen de «${this.seleccionada?.nombre}»?\n\n`
                 + 'Va a la papelera de esta marca: desde ahí se puede devolver.')) { return; }

    await this.accionImagen(() => this._marcaService.deleteImagen(i.id));
  }

  async soltarImagen(evento: CdkDragDrop<ImagenProgramadaModel[]>): Promise<void> {
    if (!this.puedeEditar || evento.previousIndex === evento.currentIndex || !this.contenido) { return; }

    moveItemInArray(this.contenido.imagenes, evento.previousIndex, evento.currentIndex);
    await this.accionImagen(
      () => this._marcaService.ordenarImagenes(this.contenido!.imagenes.map(i => i.id)), false);
  }

  // ---------- La papelera, la de esta marca ----------

  async alternarPapelera(): Promise<void> {
    this.papeleraAbierta = !this.papeleraAbierta;
    if (this.papeleraAbierta) { await this.cargarPapelera(); }
  }

  private async cargarPapelera(): Promise<void> {
    if (this.seleccionId === null) { return; }
    try {
      const res: any = await firstValueFrom(this._marcaService.papeleraImagenes(this.seleccionId));
      this.papelera = res?.data ?? [];
    } catch {
      this.papelera = [];
    }
  }

  async restaurarImagen(p: ImagenProgramadaEnPapelera): Promise<void> {
    if (!this.puedeEditar || this.trabajando) { return; }
    await this.accionImagen(() => this._marcaService.restaurarImagenes([p.id]));
  }

  async vaciarPapelera(): Promise<void> {
    if (!this.puedeEliminar || this.trabajando || !this.papelera.length) { return; }
    if (this.seleccionId === null) { return; }
    if (!confirm(`¿Vaciar la papelera de «${this.seleccionada?.nombre}»?\n\n`
                 + `Se borran ${this.papelera.length} imagen(es) del disco y no se pueden recuperar.`)) { return; }

    await this.accionImagen(() => this._marcaService.vaciarImagenes(this.seleccionId!));
  }

  // ================================================================

  private async accionImagen(llamada: () => any, avisar = true): Promise<void> {
    this.trabajando = true;
    try {
      const res: any = await firstValueFrom(llamada());
      if (avisar) { this._toastr.success(res?.message ?? 'Listo', 'Listo'); }
      this.pintar(res?.data);
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo completar la acción', 'Error',
                         { timeOut: 15000, closeButton: true });
      await this.cargarImagenes();
    } finally {
      this.trabajando = false;
    }
  }

  /**
   * Pinta lo que devolvió el servidor y pone al día la chapita de la lista.
   *
   * SIN VOLVER A PEDIR LAS MARCAS: la cuenta de ésta se sabe de la propia
   * respuesta, y recargarlas movería el foco justo después de cada clic.
   */
  private pintar(data: ImagenesDeMarca | null | undefined): void {
    if (!data) { return; }
    this.contenido = data;

    this.cuentas.set(data.marca_id, {
      marca_id: data.marca_id,
      cuantas: data.imagenes.length,
      sale_alguna: data.imagenes.some(i => i.sale_ahora),
    });

    if (this.papeleraAbierta) { this.cargarPapelera(); }
  }

  /** Las fechas en una línea legible. */
  vigencia(i: ImagenProgramadaModel): string {
    const bonita = (f: string | null) => (f ?? '').replace('T', ' ');
    if (!i.desde && !i.hasta) { return 'Siempre'; }
    if (i.desde && i.hasta) { return `${bonita(i.desde)} → ${bonita(i.hasta)}`; }
    if (i.desde) { return `Desde ${bonita(i.desde)}`; }
    return `Hasta ${bonita(i.hasta)}`;
  }

  /** Qué imagen está viendo el cliente: la programada o el logo de siempre. */
  laDeLaTienda(m: MarcaWebModel): string | null {
    const programada = this.contenido?.marca_id === m.id ? this.laQueSale?.imagen_url : null;
    return programada ?? m.logo_url;
  }
}
