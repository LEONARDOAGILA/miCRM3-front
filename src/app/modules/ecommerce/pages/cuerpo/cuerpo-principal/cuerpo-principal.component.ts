import {
  Component, OnInit, AfterViewInit, OnDestroy, ElementRef, HostListener,
  inject, ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';
import {
  CdkDrag, CdkDragDrop, CdkDragHandle, CdkDragPlaceholder, CdkDropList,
} from '@angular/cdk/drag-drop';

import { NgbModal } from '@ng-bootstrap/ng-bootstrap';

import { SeguridadService } from '../../../../seguridad/services/seguridad.service';
import { AccesoModel } from '../../../../seguridad/interfaces/accesoModel';
import { InicioService } from '../../../services/inicio.service';
import { CuerpoService } from '../../../services/cuerpo.service';
import { CuerpoModel, ALCANCES, AlcanceSeccion, miraElAlcance } from '../../../interfaces/cuerpoModel';
import { SaveCuerpoComponent } from '../saveCuerpo/saveCuerpo.component';
import { PapeleraCuerposComponent } from '../papeleraCuerpos/papeleraCuerpos.component';
import {
  SeccionInicioModel, VistaSeccion, ESTADOS_SECCION, VISTA_SECCIONES, VISTA_POR_DEFECTO,
  vistaDeProductos, vistaDeBanner,
  TAMANOS_ROTULO, FUENTES_ROTULO, COLORES_ROTULO, ROTULO_BASE_PX, ROTULO_COLOR_TIENDA,
  BOTONES_TARJETA, COLORES_TARJETA, ColorDeTarjeta, colorDeTextoSobre, contrasteEntre,
  DISPOSICIONES, LadoImagen, llevaImagenAlLado, esPaginada, POR_PAGINA_DEFECTO,
  VISTAS_BANNER, VistaBanner,
  FORMAS_FICHA, FormaFicha,
  ALTOS_SECCION, AIRE_BASE_PX,
} from '../../../interfaces/inicioModel';

import { PanelComponent } from '../../../../../components/panel/panel.component';
import { CampoColorComponent } from '../../../../../components/campos/campoColor/campoColor.component';
import { CampoTextoComponent } from '../../../../../components/campos/campoTexto/campoTexto.component';
import { CheckboxComponent } from '../../../../../components/campos/checkbox/checkbox.component';
import { GaleriaImagenesComponent } from '../../galerias/galeriaImagenes/galeriaImagenes.component';

/**
 * LA PORTADA DE LA TIENDA.
 *
 * La portada no es una página con un formulario: es una LISTA DE SECCIONES en
 * el orden en que se ven. Por eso la pantalla es esa misma lista y se arrastra
 * para moverlas, en vez de un campo «orden» por sección, que obliga a
 * imaginarse el resultado.
 *
 * AQUÍ NO SE CREAN NI SE BORRAN SECCIONES, pero por dos motivos distintos:
 * las CINCO DE FÁBRICA existen porque la tienda sabe pintarlas, y las de
 * PRODUCTOS se crean y se borran en «Productos por sección», que es donde se
 * les meten los productos. Lo que se administra aquí es cuáles se ven, en qué
 * orden, CÓMO SE LLAMAN EN LA TIENDA y entre qué fechas.
 *
 * EL NOMBRE DE LA SECCIÓN ES DE AQUÍ; EL RÓTULO ES DEL CLIENTE. «Categorías
 * destacadas» es como la llamamos nosotros y no cambia, porque es como se
 * reconoce en esta lista. Lo que lee el cliente encima de ella se escribe, y
 * se puede cambiar para una campaña sin tocar el código de la tienda. Vacío,
 * la tienda pone el suyo de fábrica: así es como se ve hoy, y dejarlo así
 * sigue siendo una respuesta válida.
 *
 * CADA SECCIÓN DICE DE DÓNDE COME: las de banner, de su galería; las de
 * categorías y marcas, de sus pantallas. Las que todavía esperan a que se
 * traslade su fuente lo dicen con todas las letras, en vez de enseñar campos
 * que no hacen nada. La tienda, por su parte, ya se salta la sección que no
 * tenga qué enseñar: una encendida y vacía no deja un hueco con su título y
 * nada debajo.
 *
 * EL INTERRUPTOR GUARDA SOLO y el orden también, porque cada uno es una sola
 * decisión. El rótulo y las fechas llevan botón: son varios campos a la vez y
 * guardar a cada tecla sería guardar lo que se está escribiendo a medias.
 */
@Component({
  selector: 'app-cuerpo-principal',
  templateUrl: './cuerpo-principal.component.html',
  styleUrls: ['./cuerpo-principal.component.css'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    CommonModule, RouterLink, ReactiveFormsModule, FormsModule,
    PanelComponent, CampoColorComponent, CampoTextoComponent, CheckboxComponent,
    GaleriaImagenesComponent,
    CdkDropList, CdkDrag, CdkDragHandle, CdkDragPlaceholder,
  ],
})
export class CuerpoPrincipalComponent implements OnInit, AfterViewInit, OnDestroy {

  public titulo = 'Cuerpos de la tienda';
  public accesoModel!: AccesoModel;

  public secciones: SeccionInicioModel[] = [];
  public cargando = true;
  public trabajando = false;
  public guardando: number | null = null;

  /**
   * LA SECCIÓN ELEGIDA, por clave. Sólo una.
   *
   * La pantalla es de dos columnas, como el catálogo de productos o las
   * características: la lista a la izquierda y lo que se configura a la
   * derecha. ANTES ERA UN ACORDEÓN y cada sección desplegaba sus campos
   * debajo: con quince campos abiertos en medio de la lista no se sabía
   * dónde empezaba una sección y acababa la otra, y había que subir y bajar
   * para comparar dos.
   */
  public elegida: number | null = null;

  public formularios: Record<number, FormGroup> = {};

  public readonly estados = ESTADOS_SECCION;
  public readonly tamanos = TAMANOS_ROTULO;
  public readonly altos = ALTOS_SECCION;
  public readonly fuentes = FUENTES_ROTULO;
  public readonly colores = COLORES_ROTULO;
  public readonly colorTienda = ROTULO_COLOR_TIENDA;

  private _inicioService = inject(InicioService);
  private _cuerpoService = inject(CuerpoService);
  private _seguridadService = inject(SeguridadService);
  private _toastr = inject(ToastrService);
  private fb = inject(FormBuilder);
  private activeRoute = inject(ActivatedRoute);
  private modalService = inject(NgbModal);
  private host = inject(ElementRef) as ElementRef<HTMLElement>;

  get puedeEditar(): boolean { return this.accesoModel?.editar === true; }
  get puedeCrear(): boolean { return this.accesoModel?.crear === true; }
  get puedeEliminar(): boolean { return this.accesoModel?.eliminar === true; }

  /** Cuántas se ven hoy de verdad: activas, en fecha y con algo que enseñar. */
  get enLaPortada(): number {
    return this.secciones.filter(s => s.estado === 'visible' && s.con_contenido).length;
  }

  // ================================================================
  // LOS CUERPOS: LA PRIMERA COLUMNA
  // ================================================================
  //
  // Un cuerpo es una página hecha de secciones. UNO ES EL PRINCIPAL y sale al
  // abrir la tienda; los demás se llegan por su dirección, y si apuntan a una
  // categoría o a una marca, el clic en ella lleva ahí en vez de al catálogo.
  //
  // AL ENTRAR SE ELIGE EL PRINCIPAL: es la página que se toca todos los días,
  // y así esta pantalla sigue abriéndose en lo que enseñaba antes de que
  // hubiera varios.

  public cuerpos: CuerpoModel[] = [];
  public cuerpoElegido: number | null = null;
  public cargandoCuerpos = true;

  get elCuerpo(): CuerpoModel | null {
    return this.cuerpos.find(c => c.id === this.cuerpoElegido) ?? null;
  }

  /** La dirección del cuerpo elegido, para enseñarla y para abrirla. */
  get urlDelCuerpo(): string {
    return this.elCuerpo?.url ?? '/';
  }

  aDondeApunta(c: CuerpoModel): string {
    if (c.principal)  { return 'La entrada de la tienda'; }
    if (c.categoria)  { return c.categoria; }
    if (c.marca)      { return 'Marca: ' + c.marca; }
    return 'Página suelta';
  }

  iconoDe(c: CuerpoModel): string {
    if (c.principal) { return 'fa-house'; }
    if (c.categoria_id) { return 'fa-sitemap'; }
    if (c.marca_id) { return 'fa-tag'; }
    return 'fa-file';
  }

  /**
   * Los cuerpos, y de paso se elige uno.
   *
   * SE MANTIENE EL ELEGIDO si sigue estando: guardar un cuerpo o cambiar de
   * principal recarga la lista, y saltar al principal cada vez sacaría de la
   * página que se estaba montando.
   */
  async cargarCuerpos(): Promise<void> {
    this.cargandoCuerpos = true;
    try {
      const res: any = await firstValueFrom(this._cuerpoService.allCuerpos());
      this.cuerpos = res?.data ?? [];

      if (!this.cuerpos.some(c => c.id === this.cuerpoElegido)) {
        this.cuerpoElegido = (this.cuerpos.find(c => c.principal) ?? this.cuerpos[0])?.id ?? null;
      }
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudieron cargar los cuerpos', 'Error',
                         { timeOut: 15000, closeButton: true });
    } finally {
      this.cargandoCuerpos = false;
    }
  }

  /** Cambiar de cuerpo cambia la lista del medio y vacía la derecha. */
  async elegirCuerpo(c: CuerpoModel): Promise<void> {
    if (this.cuerpoElegido === c.id) { return; }
    this.cuerpoElegido = c.id;
    // La sección elegida era de otro cuerpo: su formulario no pinta nada aquí
    this.elegida = null;
    // Y la lista se vacía mientras llega la suya: dejar la del cuerpo anterior
    // sería invitar a tocar la sección de otra página
    this.secciones = [];
    await this.cargar();
  }

  async nuevoCuerpo(): Promise<void> {
    if (!this.puedeCrear) { return; }
    const ref = this.modalService.open(SaveCuerpoComponent, { size: 'lg', backdrop: 'static' });
    ref.componentInstance.cuerpo = null;

    const creado = await ref.result.catch(() => null);
    if (!creado) { return; }

    // Se entra en el nuevo: lo siguiente que se quiere es montarlo
    this.cuerpoElegido = creado?.id ?? this.cuerpoElegido;
    this.elegida = null;
    await this.cargarCuerpos();
    await this.cargar();
  }

  async editarCuerpo(c: CuerpoModel): Promise<void> {
    if (!this.puedeEditar) { return; }
    const ref = this.modalService.open(SaveCuerpoComponent, { size: 'lg', backdrop: 'static' });
    ref.componentInstance.cuerpo = c;

    const guardado = await ref.result.catch(() => null);
    if (!guardado) { return; }
    await this.cargarCuerpos();
  }

  /** El interruptor de la tarjeta. No cambia de cuerpo elegido. */
  async alternarActivoCuerpo(c: CuerpoModel, evento: Event): Promise<void> {
    evento.stopPropagation();
    evento.preventDefault();
    if (!this.puedeEditar || this.trabajando) { return; }

    await this.conCuerpos(() => this._cuerpoService.activarCuerpo(c.id));
  }

  async hacerPrincipal(c: CuerpoModel, evento: Event): Promise<void> {
    evento.stopPropagation();
    if (!this.puedeEditar || this.trabajando || c.principal) { return; }
    if (!confirm('«' + c.nombre + '» va a ser la página que sale al abrir la tienda, '
                 + 'y «' + (this.cuerpos.find(x => x.principal)?.nombre ?? 'la de ahora')
                 + '» pasará a verse sólo en su dirección.\n\n¿Seguir?')) {
      return;
    }

    await this.conCuerpos(() => this._cuerpoService.principalCuerpo(c.id));
  }

  async borrarCuerpo(c: CuerpoModel, evento: Event): Promise<void> {
    evento.stopPropagation();
    if (!this.puedeEliminar || this.trabajando) { return; }
    if (!confirm('«' + c.nombre + '» se va a la papelera con sus ' + c.secciones
                 + ' sección(es).\n\nSe puede restaurar después. ¿Seguir?')) {
      return;
    }

    await this.conCuerpos(() => this._cuerpoService.deleteCuerpo(c.id));
    // Si era el que se estaba mirando, se cae al principal
    if (this.cuerpoElegido === c.id) {
      this.cuerpoElegido = null;
      this.elegida = null;
      await this.cargarCuerpos();
      await this.cargar();
    }
  }

  async abrirPapelera(): Promise<void> {
    const ref = this.modalService.open(PapeleraCuerposComponent, { size: 'lg' });
    ref.componentInstance.puedeVaciar = this.puedeEliminar;

    const hubocambios = await ref.result.catch(() => false);
    if (hubocambios) { await this.cargarCuerpos(); }
  }

  /** Como `accion`, pero para la lista de cuerpos. */
  private async conCuerpos(llamada: () => any): Promise<void> {
    this.trabajando = true;
    try {
      const res: any = await firstValueFrom(llamada());
      this._toastr.success(res?.message ?? 'Listo', 'Listo');
      await this.cargarCuerpos();
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo completar la acción', 'Error',
                         { timeOut: 20000, closeButton: true });
      await this.cargarCuerpos();
    } finally {
      this.trabajando = false;
    }
  }

  // ================================================================
  // EL FILTRO DE LA LISTA
  // ================================================================
  //
  // ES SÓLO DE LA PANTALLA: no se pide nada al servidor ni se guarda en
  // ningún sitio. La lista son siete filas; filtrarlas aquí es inmediato y
  // volver a pedirlas sería esperar por algo que ya está en memoria.
  //
  // «ACTIVA» NO ES LO MISMO QUE «EN LA PORTADA», y el filtro va por lo
  // primero: una sección activa pero programada para diciembre, o activa y
  // vacía, no se ve en la tienda. Lo que dice la palanca es si está activa, y
  // es lo que se filtra; cuántas se ven de verdad lo cuenta la etiqueta de
  // arriba.
  //
  // SE ENTRA EN «ACTIVAS»: es lo que está pasando en la tienda, y lo apagado
  // suele ser lo que se dejó preparado para otro día. SALVO que el cuerpo no
  // tenga ninguna encendida —uno recién creado nace con todas apagadas—:
  // entonces se entra en «Todas», porque abrir una página nueva en una lista
  // vacía parece que no se creó bien.

  public filtro: 'todas' | 'activas' | 'inactivas' = 'activas';

  public readonly filtros = [
    { valor: 'todas' as const,     texto: 'Todas',      icono: 'fa-list' },
    { valor: 'activas' as const,   texto: 'Activas',    icono: 'fa-circle-check' },
    { valor: 'inactivas' as const, texto: 'Inactivas',  icono: 'fa-circle-minus' },
  ];

  /**
   * Las que se enseñan ahora mismo.
   *
   * Un getter y no una lista guardada: la palanca de una fila cambia
   * `s.activo` y con el filtro puesto esa fila tiene que salir de la lista en
   * el momento. Con una copia habría que acordarse de rehacerla en cada sitio
   * que toque el estado, y el día que se olvide la lista enseñaría una cosa y
   * la base otra. Son siete filas: el coste de filtrarlas no se nota.
   */
  /**
   * En qué filtro se abre un cuerpo: «Activas», o «Todas» si no tiene ninguna.
   *
   * Sólo al ENTRAR —la primera carga y cada cambio de cuerpo—, no en cada
   * respuesta: si no, apagar la última sección activa cambiaría el filtro
   * debajo del dedo de quien la acaba de apagar.
   */
  private filtroDeEntrada(): void {
    this.filtro = this.secciones.some(s => s.activo) ? 'activas' : 'todas';
  }

  get seccionesVisibles(): SeccionInicioModel[] {
    if (this.filtro === 'activas')   { return this.secciones.filter(s => s.activo); }
    if (this.filtro === 'inactivas') { return this.secciones.filter(s => !s.activo); }
    return this.secciones;
  }

  get cuantasActivas(): number {
    return this.secciones.filter(s => s.activo).length;
  }

  get cuantasInactivas(): number {
    return this.secciones.length - this.cuantasActivas;
  }

  /** Cuántas hay de cada clase, para el número de cada botón del filtro. */
  cuantasDe(valor: 'todas' | 'activas' | 'inactivas'): number {
    if (valor === 'activas')   { return this.cuantasActivas; }
    if (valor === 'inactivas') { return this.cuantasInactivas; }
    return this.secciones.length;
  }

  /** Si hay un filtro puesto. */
  get filtrando(): boolean {
    return this.filtro !== 'todas';
  }

  // ================================================================
  // LOS BANNERS
  // ================================================================
  //
  // SON LA ÚNICA SECCIÓN QUE SE CREA Y SE BORRA DESDE AQUÍ. Un banner es una
  // galería de imágenes con su sitio en la portada y nada más, y la tienda ya
  // sabe pintarlo: no hace falta código nuevo por cada uno. Las de fábrica
  // existen porque la tienda las sabe pintar y las de productos se arman en
  // «Productos por sección», así que ésas siguen sin crearse aquí.

  /** Si está abierto el renglón de «añadir banner». */
  public creandoBanner = false;
  public nombreNuevoBanner = '';
  /**
   * El id del banner en el que se está trabajando, o null.
   *
   * `NACIENDO` es el que todavía no tiene id: ocupa igual, porque mientras se
   * crea no se puede crear otro ni tocar los de al lado.
   */
  public bannerOcupado: number | null = null;
  public readonly NACIENDO = -1;

  abrirNuevoBanner(): void {
    this.creandoBanner = true;
    this.nombreNuevoBanner = '';
  }

  cerrarNuevoBanner(): void {
    this.creandoBanner = false;
    this.nombreNuevoBanner = '';
  }

  async crearBanner(): Promise<void> {
    const nombre = this.nombreNuevoBanner.trim();
    if (!this.puedeCrear || !nombre || this.bannerOcupado) { return; }

    // La clave del banner nuevo la fabrica el servidor, y la respuesta de la
    // casa sólo trae `message` y `data`: se reconoce porque antes no estaba.
    // Dos personas creando a la vez verían cada una la suya, que es lo que
    // hay que mirar.
    const antes = new Set(this.secciones.map(s => s.id));

    this.bannerOcupado = this.NACIENDO;
    try {
      // En el cuerpo que se está mirando, no en el principal
      const res: any = await firstValueFrom(
        this._inicioService.addBanner(nombre, this.cuerpoElegido));
      this._toastr.success(res?.message ?? 'Banner creado', 'Listo');
      // `true`: la lista trae una fila que antes no estaba y necesita su
      // formulario. Sin rehacerlos, al abrirla no habría dónde escribir
      this.pintar(res?.data, true);
      this.cerrarNuevoBanner();
      // Se abre sola: lo siguiente que hay que hacer es meterle imágenes
      const nueva = (res?.data ?? []).find((x: SeccionInicioModel) => !antes.has(x.id));
      if (nueva) { this.elegir(nueva.id); }
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo crear el banner', 'Error',
                         { timeOut: 20000, closeButton: true });
    } finally {
      this.bannerOcupado = null;
    }
  }

  // ================================================================
  // LOS ESCAPARATES DE OTRAS PANTALLAS
  // ================================================================
  //
  // Las secciones de «Productos por sección» se crean allí y nacen en el
  // cuerpo principal. AQUÍ SE DECIDE EN QUÉ PÁGINAS SALEN: el mismo
  // escaparate puede estar en varias, cada una con su rótulo, sus colores y
  // su sitio. Lo que se repite es la fila, no los productos.
  //
  // QUITARLO DE UNA PÁGINA NO LO BORRA. Por eso no es el botón de la
  // papelera: el escaparate y sus productos siguen en su pantalla, y volver a
  // ponerlo es elegirlo otra vez en esta lista.

  public anadiendoEscaparate = false;
  public escaparates: { id: number; nombre: string; cuantos: number; en_paginas: number }[] = [];
  public escaparateElegido: number | null = null;
  public cargandoEscaparates = false;

  async abrirAnadirEscaparate(): Promise<void> {
    this.anadiendoEscaparate = true;
    this.escaparateElegido = null;
    this.cargandoEscaparates = true;
    try {
      const res: any = await firstValueFrom(
        this._inicioService.escaparatesDisponibles(this.cuerpoElegido));
      this.escaparates = res?.data ?? [];
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudieron cargar los escaparates', 'Error',
                         { timeOut: 15000, closeButton: true });
      this.escaparates = [];
    } finally {
      this.cargandoEscaparates = false;
    }
  }

  cerrarAnadirEscaparate(): void {
    this.anadiendoEscaparate = false;
    this.escaparateElegido = null;
  }

  /** Cuántos productos tiene y en cuántas páginas sale ya, para el desplegable. */
  rotuloEscaparate(e: { nombre: string; cuantos: number; en_paginas: number }): string {
    const cuantos = e.cuantos === 1 ? '1 producto' : e.cuantos + ' productos';
    const donde = e.en_paginas === 0 ? 'en ninguna página'
                : e.en_paginas === 1 ? 'ya en 1 página'
                : 'ya en ' + e.en_paginas + ' páginas';
    return e.nombre + ' — ' + cuantos + ', ' + donde;
  }

  async anadirEscaparate(): Promise<void> {
    if (!this.puedeCrear || !this.escaparateElegido) { return; }

    await this.accion(() => this._inicioService.addEscaparate(
      Number(this.escaparateElegido), this.cuerpoElegido));
    this.cerrarAnadirEscaparate();
    await this.cargarCuerpos();   // cambió cuántas secciones tiene
  }

  async quitarEscaparate(s: SeccionInicioModel): Promise<void> {
    if (!this.puedeEliminar) { return; }
    if (!confirm('«' + s.nombre + '» dejará de salir en esta página.\n\n'
                 + 'NO se borra: sus productos siguen en «Productos por sección» y lo puedes '
                 + 'volver a añadir. ¿Seguir?')) {
      return;
    }

    if (this.elegida === s.id) { this.elegida = null; }
    await this.accion(() => this._inicioService.quitarEscaparate(s.id));
    await this.cargarCuerpos();
  }

  /** El nombre que se está escribiendo para ese banner. */
  nombreDe(s: SeccionInicioModel): string {
    return (this.formularios[s.id]?.value?.nombre ?? '').toString();
  }

  /** Si ese nombre se puede guardar: no está vacío y no es el que ya tiene. */
  puedeRenombrar(s: SeccionInicioModel): boolean {
    const nombre = this.nombreDe(s).trim();
    return this.puedeEditar && !!nombre && nombre !== s.nombre && this.bannerOcupado === null;
  }

  async renombrarBanner(s: SeccionInicioModel): Promise<void> {
    if (!this.puedeRenombrar(s)) { return; }

    this.bannerOcupado = s.id;
    try {
      const res: any = await firstValueFrom(
        this._inicioService.nombreBanner(s.id, this.nombreDe(s).trim()));
      this._toastr.success(res?.message ?? 'Nombre guardado', 'Listo');
      this.pintar(res?.data);
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo cambiar el nombre', 'Error',
                         { timeOut: 20000, closeButton: true });
    } finally {
      this.bannerOcupado = null;
    }
  }

  /**
   * Borra el banner CON SUS IMÁGENES.
   *
   * SE PREGUNTA DICIENDO CUÁNTAS SE VAN, y no es una pregunta de cortesía: no
   * hay papelera donde ir a buscarlas. La papelera de una galería vive dentro
   * de la galería, y aquí la galería también se borra.
   */
  async borrarBanner(s: SeccionInicioModel): Promise<void> {
    if (!this.puedeEliminar || !s.es_banner || this.bannerOcupado) { return; }

    const cuantas = s.cuantas ?? 0;
    const conQue = cuantas === 0
      ? 'No tiene ninguna imagen.'
      : `Se borran también sus ${cuantas} ${cuantas === 1 ? 'imagen' : 'imágenes'}.`;
    if (!confirm(`¿Borrar el banner «${s.nombre}»?\n\n${conQue}\nEsto no se puede deshacer.\n`)) {
      return;
    }

    this.bannerOcupado = s.id;
    try {
      const res: any = await firstValueFrom(this._inicioService.deleteBanner(s.id));
      this._toastr.success(res?.message ?? 'Banner borrado', 'Listo');
      if (this.elegida === s.id) { this.elegida = null; }
      this.pintar(res?.data, true);
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo borrar el banner', 'Error',
                         { timeOut: 20000, closeButton: true });
    } finally {
      this.bannerOcupado = null;
    }
  }

  async ngOnInit(): Promise<void> {
    this.accesoModel = this.activeRoute.snapshot.data['access'];
    this.pedirLetrasDeLaTienda();
    // Los cuerpos primero: hasta saber cuál es el principal no hay secciones
    // que pedir
    await this.cargarCuerpos();
    await this.elCuerpoQuePiden();
    await this.cargar();
    this.elegirLaQuePiden();
    // Hasta aqui no habia columnas pintadas: no habia nada que medir
    setTimeout(() => this.ajustarAlto());
  }

  // ================================================================
  // EL ALTO DE LAS COLUMNAS
  // ================================================================
  /**
   * LAS TRES COLUMNAS LLEGAN HASTA ABAJO DE LA PANTALLA.
   *
   * Aqui no hay quien las estire. En el catalogo de productos y en «Productos
   * por seccion» el alto se lo da la rejilla, que se mide a si misma; esta
   * pantalla no tiene rejilla, asi que el alto salia del contenido. Con las
   * dos columnas plegadas el contenido son dos tiras de 120 px, y el panel
   * entero se encogia a un sello.
   *
   * No vale un calc(100vh - X): al expandir el panel se va a pantalla completa
   * y la X cambia. Se mide donde empieza, como en las demas pantallas.
   */
  ngAfterViewInit(): void {
    this.ajustarAlto();

    // Expandir el panel no cambia el tamano de la ventana —no salta
    // window:resize— pero si el del panel: de ahi el observador.
    const panel = this.host.nativeElement.querySelector('.panel') as HTMLElement | null;
    if (panel && typeof ResizeObserver !== 'undefined') {
      this.observador = new ResizeObserver(() => this.ajustarAlto());
      this.observador.observe(panel);
    }
  }

  ngOnDestroy(): void {
    this.observador?.disconnect();
  }

  @HostListener('window:resize')
  alCambiarLaVentana(): void { this.ajustarAlto(); }

  private observador?: ResizeObserver;

  private ajustarAlto(): void {
    const el = this.host.nativeElement.querySelector('.inicio.file-manager') as HTMLElement | null;
    if (!el) { return; }

    const MARGEN_INFERIOR = 24;
    const alto = Math.max(320, Math.round(
      window.innerHeight - el.getBoundingClientRect().top - MARGEN_INFERIOR));

    // Poner el alto cambia el del panel, y el panel es a quien escucha el
    // observador: sin esta comparacion se llamarian el uno al otro sin parar.
    if (el.style.height === alto + 'px') { return; }
    el.style.height = alto + 'px';
  }

  /**
   * Si se llega desde otra pantalla, con `?cuerpo=`, `?categoria=` o `?marca=`.
   *
   * De «Categorías de la tienda» y de «Marcas de la tienda» se viene con una
   * pregunta hecha: «la página de ESTO». Si ya existe se entra en ella; si no,
   * se abre el diálogo de crearla con su categoría o su marca puesta, que es
   * lo que se iba a hacer de todas formas.
   */
  private async elCuerpoQuePiden(): Promise<void> {
    const p = this.activeRoute.snapshot.queryParamMap;
    const cuerpo = Number(p.get('cuerpo')) || null;
    const categoria = Number(p.get('categoria')) || null;
    const marca = Number(p.get('marca')) || null;

    if (cuerpo && this.cuerpos.some(c => c.id === cuerpo)) {
      this.cuerpoElegido = cuerpo;
      return;
    }
    if (!categoria && !marca) { return; }

    const suyo = this.cuerpos.find(c => (categoria && c.categoria_id === categoria)
                                     || (marca && c.marca_id === marca));
    if (suyo) {
      this.cuerpoElegido = suyo.id;
      return;
    }

    if (!this.puedeCrear) { return; }

    const ref = this.modalService.open(SaveCuerpoComponent, { size: 'lg', backdrop: 'static' });
    ref.componentInstance.cuerpo = null;
    ref.componentInstance.categoriaInicial = categoria;
    ref.componentInstance.marcaInicial = marca;

    const creado = await ref.result.catch(() => null);
    if (!creado) { return; }

    this.cuerpoElegido = creado?.id ?? this.cuerpoElegido;
    await this.cargarCuerpos();
  }

  /**
   * Si se llega desde el modelado, con `?seccion=`, se elige esa.
   *
   * Allí se elige una sección en el dibujo y se pulsa «configurar»; llegar
   * aquí a la lista cerrada y tener que buscarla otra vez sería perder el
   * sitio en el camino.
   */
  private elegirLaQuePiden(): void {
    const clave = this.activeRoute.snapshot.queryParamMap.get('seccion');
    // Llega la CLAVE porque el modelado dibuja el cuerpo principal y habla de
    // «la sección del banner»; aquí dentro se trabaja con el id
    const s = clave ? this.secciones.find(x => x.clave === clave) : null;
    if (!s) { return; }

    this.elegir(s.id);
    // Después de pintarla, que si no todavía no existe en el documento
    setTimeout(() => document.getElementById('seccion-caja-' + s.id)
                             ?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 150);
  }

  /** Las secciones del cuerpo elegido. */
  async cargar(): Promise<void> {
    this.cargando = true;
    try {
      const res: any = await firstValueFrom(this._inicioService.allInicio(this.cuerpoElegido));
      this.pintar(res?.data, true);
      this.filtroDeEntrada();
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudieron cargar las secciones', 'Error',
                         { timeOut: 15000, closeButton: true });
    } finally {
      this.cargando = false;
    }
  }

  /**
   * Pinta la lista que devolvió el servidor.
   *
   * LOS FORMULARIOS NO SE REHACEN a cada respuesta: guardar una sección
   * devuelve la lista entera, y rehacerlas todas borraría lo que se escribe
   * en otra. Se crea el que falte, y el de la sección guardada se pone al día
   * aparte.
   */
  private pintar(data: SeccionInicioModel[] | null | undefined, rehacer = false): void {
    if (!data) { return; }
    this.secciones = data;

    for (const s of data) {
      if (rehacer || !this.formularios[s.id]) {
        this.formularios[s.id] = this.formularioDe(s);
      }
    }

    if (!this.puedeEditar) {
      Object.values(this.formularios).forEach(f => f.disable());
    }
  }

  private formularioDe(s: SeccionInicioModel): FormGroup {
    return this.fb.group({
      // Sólo lo usan los banners: es su nombre de aquí dentro, y se guarda
      // por su propia puerta (no viaja con `editSeccion`)
      nombre:    [s.nombre ?? '', [Validators.maxLength(100)]],
      titulo:    [s.titulo ?? '', [Validators.maxLength(80)]],
      subtitulo: [s.subtitulo ?? '', [Validators.maxLength(80)]],
      tamano:    [s.estilo?.tamano ?? 'normal'],
      color:     [s.estilo?.color ?? ''],
      fuente:    [s.estilo?.fuente ?? 'titulos'],
      alto:      [s.alto ?? 'normal'],
      desde:     [s.desde ?? ''],
      hasta:     [s.hasta ?? ''],
      // Los cuatro botones de la tarjeta: fondo y letra. Vacío en el fondo es
      // «el de la tienda»; vacío en la letra, «la que se lea encima»
      boton_favorito_color: [s.botones?.favorito?.fondo ?? ''],
      boton_favorito_texto: [s.botones?.favorito?.texto ?? ''],
      boton_carrito_color:  [s.botones?.carrito?.fondo ?? ''],
      boton_carrito_texto:  [s.botones?.carrito?.texto ?? ''],
      boton_whatsapp_color: [s.botones?.whatsapp?.fondo ?? ''],
      boton_whatsapp_texto: [s.botones?.whatsapp?.texto ?? ''],
      boton_tarjeta_color:  [s.botones?.tarjeta?.fondo ?? ''],
      boton_tarjeta_texto:  [s.botones?.tarjeta?.texto ?? ''],
      // La tarjeta entera y su cartel de descuento. La LETRA de la tarjeta no
      // está aquí porque no se elige: la calcula la tienda
      tarjeta_fondo_color:  [s.tarjeta?.fondo ?? ''],
      tarjeta_borde_color:  [s.tarjeta?.borde ?? ''],
      descuento_color:      [s.tarjeta?.descuento?.fondo ?? ''],
      descuento_texto:      [s.tarjeta?.descuento?.texto ?? ''],
      // La etiqueta: sus palabras y sus dos colores
      etiqueta:             [s.tarjeta?.etiqueta?.rotulo ?? '', [Validators.maxLength(30)]],
      etiqueta_color:       [s.tarjeta?.etiqueta?.fondo ?? ''],
      etiqueta_texto:       [s.tarjeta?.etiqueta?.texto ?? ''],
      // Cómo se enseña la sección. Va `elegido` y no `lado`: sin imagen
      // subida, `lado` llega 'sola' aunque se haya elegido un lado, y el
      // formulario tiene que seguir enseñando lo que eligió quien administra
      disposicion:          [s.imagen?.elegido ?? 'sola'],
      // Sólo lo usan los banners. Viaja con el resto porque es un campo más
      banner_vista:         [s.banner_vista ?? 'rotativo'],
      segundos:             [s.segundos ?? null],
      // Cuántas tarjetas antes del botón «Ver más productos». Sólo la paginada
      por_pagina:           [s.por_pagina ?? null],
      forma:                [s.forma ?? 'circulo'],
      // De dónde saca lo que enseña: de toda la tienda o de la categoría o la
      // marca del cuerpo. Sólo lo miran las de categorías y de marcas
      alcance:              [s.alcance ?? 'tienda'],
      // Sólo para la pantalla: en una sección de productos, primero se decide
      // SI pasa sola y luego cada cuánto. Lo que se guarda es un número o nada
      mueve_sola:           [s.segundos !== null],
      imagen_alt:           [s.imagen?.alt ?? ''],
      imagen_enlace:        [s.imagen?.enlace ?? ''],
      imagen_nueva_pestana: [s.imagen?.nueva_pestana ?? true],
    });
  }

  // ================================================================
  // LA CARA DE CADA SECCIÓN
  // ================================================================

  vista(s: SeccionInicioModel): VistaSeccion {
    // Las de productos y los banners no pueden estar en el catálogo de claves:
    // las suyas las fabrica el servidor al crearlas.
    if (s.producto_seccion_id) { return vistaDeProductos(s.nombre); }
    if (s.es_banner) { return vistaDeBanner(); }
    return VISTA_SECCIONES[s.clave] ?? VISTA_POR_DEFECTO;
  }

  /**
   * Cómo se llama la sección en la cabecera de la lista.
   *
   * ES EL NOMBRE DE LA TIENDA EN CUANTO SE PONE UNO, no el de fábrica: lo que
   * se escribe arriba es lo que lee el cliente, y verlo aquí mismo es la
   * manera más corta de comprobar que se guardó.
   */
  comoSeLlama(s: SeccionInicioModel): string {
    return (s.titulo ?? '').trim() || s.nombre;
  }

  /** Si el nombre de la tienda tapa al de fábrica, para no perder de vista cuál es. */
  renombrada(s: SeccionInicioModel): boolean {
    return this.comoSeLlama(s) !== s.nombre;
  }

  /** Lo que la tienda pondría encima si el campo se deja vacío. */
  rotuloVacio(s: SeccionInicioModel): string {
    const deFabrica = this.vista(s).rotuloDeFabrica;
    return deFabrica
      ? 'Vacío, la tienda pone «' + deFabrica + '».'
      : 'Vacío, la sección sale sin nada escrito encima.';
  }

  /** El ejemplo que se ve en el campo mientras está vacío. */
  ejemploRotulo(s: SeccionInicioModel): string {
    return this.vista(s).rotuloDeFabrica ?? 'Lo que se lee encima de la sección';
  }

  // ================================================================
  // LA MUESTRA: CÓMO SE VA A LEER EN LA TIENDA
  // ================================================================
  //
  // Se pinta con lo que hay en el formulario, no con lo guardado: elegir un
  // color y tener que guardar para saber si queda bien es probar a ciegas, y
  // en la tienda eso se prueba en vivo delante de los clientes.

  /** Lo que se leería ahora mismo: lo escrito, o lo que pone la tienda si está vacío. */
  textoMuestra(s: SeccionInicioModel): string {
    const escrito = (this.formularios[s.id]?.value?.titulo ?? '').toString().trim();
    return escrito || this.vista(s).rotuloDeFabrica || 'Sin rótulo';
  }

  /** En píxeles, como se vería en computadora. En celular la tienda lo encoge sola. */
  tamanoMuestra(s: SeccionInicioModel): number {
    const elegido = this.formularios[s.id]?.value?.tamano;
    const tamano = this.tamanos.find(t => t.valor === elegido) ?? this.tamanos[1];
    return Math.round(ROTULO_BASE_PX * tamano.escala);
  }

  /**
   * El aire que va a dejar la sección, en píxeles de computadora.
   *
   * Se enseña el número porque «Amplia» no dice nada hasta que se ve: 84 px
   * sí se puede comparar con lo que ya hay en la portada.
   */
  aireMuestra(s: SeccionInicioModel): number {
    const elegido = this.formularios[s.id]?.value?.alto;
    const alto = this.altos.find(a => a.valor === elegido) ?? this.altos[1];
    return Math.round(AIRE_BASE_PX * alto.escala);
  }

  fuenteMuestra(s: SeccionInicioModel) {
    const elegida = this.formularios[s.id]?.value?.fuente;
    return this.fuentes.find(f => f.valor === elegida) ?? this.fuentes[0];
  }

  /** El color elegido, o el de la tienda mientras no se elija ninguno. */
  colorMuestra(s: SeccionInicioModel): string {
    return (this.formularios[s.id]?.value?.color ?? '').toString().trim() || this.colorTienda;
  }

  /** Si se eligió uno a mano: mientras no, manda la tienda y se puede cambiar de idea sin romper nada. */
  colorPropio(s: SeccionInicioModel): boolean {
    return ((this.formularios[s.id]?.value?.color ?? '').toString().trim()) !== '';
  }

  elegirColor(s: SeccionInicioModel, color: string): void {
    if (!this.puedeEditar) { return; }
    this.formularios[s.id].patchValue({ color });
    this.formularios[s.id].markAsDirty();
  }

  // ================================================================
  // EL COLOR DE LOS BOTONES DE LA TARJETA
  // ================================================================
  //
  // Los cuatro se configuran igual que el del rótulo —misma paleta, mismo
  // selector, mismo «quitar»— y por eso comparten estos métodos en vez de
  // tener cuatro juegos: la plantilla recorre `botones` y pasa cuál es.
  //
  // SÓLO SE ELIGE EL FONDO. La letra y el icono los calcula `colorDeTextoSobre`
  // y la tienda hace lo mismo con la misma fórmula, así que la muestra de aquí
  // es lo que se va a ver.

  public readonly botones = BOTONES_TARJETA;

  /** El fondo elegido para ese botón, o el que usa la tienda hoy. */
  colorBoton(s: SeccionInicioModel, b: ColorDeTarjeta): string {
    return this.valorBoton(s, b.campo) || b.deLaTienda;
  }

  /** Si se eligió fondo a mano; mientras no, manda la tienda. */
  botonPropio(s: SeccionInicioModel, b: ColorDeTarjeta): boolean {
    return this.valorBoton(s, b.campo) !== '';
  }

  /**
   * La letra del botón: la elegida, o la que la tienda va a poner.
   *
   * Y lo que la tienda pone depende de si hay fondo propio: con fondo propio
   * calcula la que se lea encima, y sin él usa la suya de siempre. Esta
   * pantalla tiene que decir lo mismo, o la muestra miente.
   */
  textoBoton(s: SeccionInicioModel, b: ColorDeTarjeta): string {
    const elegida = this.valorBoton(s, b.campoTexto);
    if (elegida) { return elegida; }
    return this.botonPropio(s, b) ? colorDeTextoSobre(this.colorBoton(s, b)) : b.textoDeLaTienda;
  }

  /** Si se eligió letra a mano. */
  textoPropio(s: SeccionInicioModel, b: ColorDeTarjeta): boolean {
    return this.valorBoton(s, b.campoTexto) !== '';
  }

  ponerColorBoton(s: SeccionInicioModel, b: ColorDeTarjeta, color: string): void {
    this.ponerCampo(s, b.campo, color);
  }

  ponerTextoBoton(s: SeccionInicioModel, b: ColorDeTarjeta, color: string): void {
    // El fondo y el borde de la tarjeta no tienen letra que elegir
    if (!b.campoTexto) { return; }
    this.ponerCampo(s, b.campoTexto, color);
  }

  /**
   * Si ese par de colores no se va a leer en la tienda.
   *
   * SE AVISA, NO SE PROHÍBE, igual que con el color del rótulo: la
   * combinación puede ser justo la de una campaña, y quien administra está
   * mirando la muestra de al lado. Pero un botón que se eligió por bonito y
   * resulta ilegible es un fallo que nadie ve hasta que lo ve un cliente.
   *
   * El 4,5:1 es el mínimo de la WCAG para texto normal, que es lo que son
   * estos botones: doce píxeles en mayúsculas.
   *
   * SÓLO SE AVISA DE LO QUE SE ELIGIÓ AQUÍ. Los colores de siempre de la
   * tienda no se deciden en esta pantalla —el corazón rojo sobre el círculo
   * blanco se queda en 4,0:1 y es el diseño de la casa—, así que avisar de
   * ellos ponía una advertencia permanente en todas las secciones. Un aviso
   * que sale siempre es un aviso que nadie lee, y el día que de verdad haga
   * falta pasará desapercibido.
   */
  botonFlojo(s: SeccionInicioModel, b: ColorDeTarjeta): boolean {
    if (!this.botonPropio(s, b) && !this.textoPropio(s, b)) { return false; }
    return this.contrasteBoton(s, b) < 4.5;
  }

  contrasteBotonTexto(s: SeccionInicioModel, b: ColorDeTarjeta): string {
    return this.contrasteBoton(s, b).toFixed(1).replace('.', ',');
  }

  private contrasteBoton(s: SeccionInicioModel, b: ColorDeTarjeta): number {
    return this.contrasteEntre(this.colorBoton(s, b), this.textoBoton(s, b));
  }

  private ponerCampo(s: SeccionInicioModel, campo: string, color: string): void {
    if (!this.puedeEditar) { return; }
    this.formularios[s.id].patchValue({ [campo]: color });
    this.formularios[s.id].markAsDirty();
  }

  /**
   * Lo que hay guardado en ese campo del formulario.
   *
   * Admite `null` porque hay cosas sin letra —el fondo y el borde de la
   * tarjeta—: ahí «no hay campo» y «el campo está vacío» llevan al mismo
   * sitio, y así quien pregunta no tiene que comprobarlo antes.
   */
  private valorBoton(s: SeccionInicioModel, campo: string | null): string {
    if (!campo) { return ''; }
    return (this.formularios[s.id]?.value?.[campo] ?? '').toString().trim();
  }

  /** Si esta sección pinta tarjetas con botones: sólo las de productos. */
  conBotones(s: SeccionInicioModel): boolean {
    return s.fuente.tipo === 'productos';
  }

  // ================================================================
  // EL COLOR DE LA TARJETA Y DE SU CARTEL
  // ================================================================
  //
  // El fondo, el borde y el cartel del descuento se eligen con los mismos
  // métodos que los botones —la lista es de lo mismo, `ColorDeTarjeta`—, así
  // que aquí abajo sólo está lo que los botones no necesitan: la letra que la
  // tienda va a calcular sola, para poder enseñarla en la muestra.

  public readonly coloresTarjeta = COLORES_TARJETA;

  /**
   * El cartel del descuento, suelto.
   *
   * La muestra de la tarjeta lo pinta aparte —va encima de la foto, no en la
   * lista de campos—, y sacarlo por su nombre es menos frágil que por su
   * puesto en la lista: el día que se añada un color más, un índice se
   * quedaría apuntando a otra cosa sin avisar.
   */
  public readonly cartel = COLORES_TARJETA.find(c => c.campo === 'descuento_color')!;

  /** Y la etiqueta, por lo mismo: va en la muestra, encima del descuento. */
  public readonly etiqueta = COLORES_TARJETA.find(c => c.campo === 'etiqueta_color')!;

  /** Lo que diría la etiqueta hoy. Vacío = no hay etiqueta que enseñar. */
  textoEtiqueta(s: SeccionInicioModel): string {
    return this.valorBoton(s, 'etiqueta');
  }

  /** El fondo elegido para la tarjeta, o el blanco de la tienda. */
  fondoTarjeta(s: SeccionInicioModel): string {
    return this.valorBoton(s, 'tarjeta_fondo_color') || '#ffffff';
  }

  /** El borde elegido, o el gris de siempre. */
  bordeTarjeta(s: SeccionInicioModel): string {
    return this.valorBoton(s, 'tarjeta_borde_color') || '#ececec';
  }

  /**
   * LA LETRA DE LA TARJETA, que no se elige: la calcula la tienda.
   *
   * Con un fondo oscuro, el nombre del producto y los precios —gris oscuro—
   * desaparecerían. La tienda pone la que se lea encima, y esta pantalla tiene
   * que decir lo mismo o la muestra miente. Sin fondo propio, el gris de
   * siempre.
   */
  letraTarjeta(s: SeccionInicioModel): string {
    const fondo = this.valorBoton(s, 'tarjeta_fondo_color');
    return fondo ? colorDeTextoSobre(fondo) : '#374151';
  }

  /** La de los textos secundarios: la misma, más apagada. */
  letraFlojaTarjeta(s: SeccionInicioModel): string {
    return this.conAlfa(this.letraTarjeta(s), 0.62);
  }

  /** Y la de las rayas de la caja de precios. */
  lineaTarjeta(s: SeccionInicioModel): string {
    return this.conAlfa(this.letraTarjeta(s), 0.22);
  }

  /**
   * El color de «Tarjeta Crédito» y «Crédito Directo».
   *
   * ES EL ROJO DE LA CASA, salvo que el fondo elegido no lo deje leer: con un
   * azul oscuro detrás, ese rojo se queda en nada y los dos rótulos
   * desaparecen. Ahí pasa a la letra de la tarjeta, que sí se lee. El 3:1 es
   * el mínimo de la WCAG para texto pequeño en negrita como ése.
   */
  acentoTarjeta(s: SeccionInicioModel): string {
    const fondo = this.valorBoton(s, 'tarjeta_fondo_color');
    if (!fondo) { return '#df1122'; }
    return this.contrasteEntre(fondo, '#df1122') >= 3 ? '#df1122' : this.letraTarjeta(s);
  }

  /**
   * Si el cartel del descuento se va a confundir con la tarjeta.
   *
   * No es cuestión de leer la letra —de eso avisa `botonFlojo`—, sino de que
   * el cartel entero se pierda: con el mismo color de fondo que la tarjeta,
   * el «-12%» queda flotando sin su pastilla y parece un fallo. 3:1 es lo que
   * pide la WCAG para algo que no es texto.
   */
  cartelSeConfunde(s: SeccionInicioModel, b: ColorDeTarjeta): boolean {
    if (b.campo !== 'descuento_color' || !this.botonPropio(s, b)) { return false; }
    return this.contrasteEntre(this.colorBoton(s, b), this.fondoTarjeta(s)) < 3;
  }

  /** Un «#rrggbb» con transparencia, para los textos apagados de la muestra. */
  private conAlfa(hex: string, alfa: number): string {
    const n = parseInt((hex || '').replace('#', ''), 16);
    if (isNaN(n)) { return hex; }
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alfa})`;
  }

  // ================================================================
  // CÓMO SE ENSEÑA LA SECCIÓN: SOLA, O CON UNA IMAGEN AL LADO
  // ================================================================
  //
  // EL FICHERO SE SUBE AL ELEGIRLO, como en las galerías, y no con el botón
  // de guardar: `editSeccion` escribe todos los campos de la sección, así que
  // la imagen tiene su propia puerta o un guardado normal la borraría. Lo
  // demás —el lado, el texto y el enlace— sí viaja con el resto.

  public readonly disposiciones = DISPOSICIONES;

  /** Las dos formas de enseñar un banner. */
  public readonly vistasBanner = VISTAS_BANNER;

  /** La vista elegida en el formulario para ese banner. */
  vistaDe(s: SeccionInicioModel): VistaBanner {
    return (this.formularios[s.id]?.value?.banner_vista ?? 'rotativo') as VistaBanner;
  }

  ponerVista(s: SeccionInicioModel, valor: VistaBanner): void {
    this.ponerCampo(s, 'banner_vista', valor);
  }

  /**
   * Si la sección es un banner: una galería de imágenes con su sitio.
   *
   * NO ES `es_banner`, que es más estrecho: ése dice «se creó aquí y se puede
   * borrar aquí», y deja fuera al banner principal, que es de fábrica. Para
   * los segundos manda la fuente, porque lo que rota son imágenes y las dos
   * clases las tienen.
   */
  tieneGaleria(s: SeccionInicioModel): boolean {
    return s.fuente?.tipo === 'galeria';
  }

  /**
   * Qué es lo que cambia cada tantos segundos en ese banner.
   *
   * Un banner se mueve siempre; lo que cambia es QUÉ. Rotando es la imagen; en
   * carteles, la página de carteles. El campo de los segundos es el mismo, y
   * sólo cambia cómo se explica.
   */
  queCambia(s: SeccionInicioModel): string {
    return this.tieneGaleria(s) && s.es_banner && this.vistaDe(s) === 'carteles'
      ? 'de página de carteles' : 'de imagen';
  }

  /** Si la palanca de «pasa sola» está encendida (sólo secciones de productos). */
  seMueveSola(s: SeccionInicioModel): boolean {
    return this.formularios[s.id]?.value?.mueve_sola === true;
  }

  // ================================================================
  // LA FORMA DE LAS FICHAS (hoy sólo las categorías destacadas)
  // ================================================================

  public readonly formasFicha = FORMAS_FICHA;

  /** Si es la sección que se puede pintar de dos formas. */
  esDestacadas(s: SeccionInicioModel): boolean {
    return s.fuente?.tipo === 'destacadas';
  }

  formaDe(s: SeccionInicioModel): FormaFicha {
    return (this.formularios[s.id]?.value?.forma ?? 'circulo') as FormaFicha;
  }

  ponerForma(s: SeccionInicioModel, valor: FormaFicha): void {
    this.ponerCampo(s, 'forma', valor);
  }

  // ================================================================
  // DE DÓNDE SACA LO QUE ENSEÑA
  // ================================================================
  //
  // «Categorías destacadas», «Categorías en promoción» y «Marcas» sacaban lo
  // de toda la tienda. En la página de Movilidad eso enseñaría categorías de
  // Línea Blanca, así que cada una dice si mira a la tienda o a su cuerpo.
  //
  // EN EL PRINCIPAL NO SE PREGUNTA: no apunta a ninguna categoría ni marca, así
  // que «lo de esta página» no querría decir nada. El campo se esconde y el
  // servidor devuelve lo de siempre.

  public readonly alcances = ALCANCES;

  miraElAlcance(s: SeccionInicioModel): boolean {
    return miraElAlcance(s.clave) && !!this.elCuerpo && !this.elCuerpo.principal
           && (!!this.elCuerpo.categoria_id || !!this.elCuerpo.marca_id);
  }

  alcanceDe(s: SeccionInicioModel): AlcanceSeccion {
    return (this.formularios[s.id]?.value?.alcance ?? 'tienda') as AlcanceSeccion;
  }

  ponerAlcance(s: SeccionInicioModel, valor: AlcanceSeccion): void {
    this.ponerCampo(s, 'alcance', valor);
  }

  /** Qué va a enseñar con el alcance que tiene puesto, dicho con sus nombres. */
  queEnsena(s: SeccionInicioModel): string {
    const c = this.elCuerpo;
    if (!c) { return ''; }
    if (this.alcanceDe(s) === 'tienda') {
      return s.clave === 'marcas' ? 'Todas las marcas que se ven en la tienda.'
           : s.clave === 'mosaico' ? 'Las categorías marcadas «en promoción».'
           : 'Las categorías marcadas «destacadas».';
    }
    if (c.categoria) {
      return s.clave === 'marcas'
        ? 'Las marcas que tienen productos en ' + c.categoria + '.'
        : 'Las categorías que cuelgan de ' + c.categoria + '.';
    }
    return s.clave === 'marcas'
      ? 'Sólo ' + c.marca + '.'
      : 'Las categorías que tienen productos de ' + c.marca + '.';
  }

  /** La clave de la sección cuya imagen se está subiendo, o null. */
  public subiendoImagen: number | null = null;

  /** El lado elegido en el formulario. */
  disposicionDe(s: SeccionInicioModel): LadoImagen {
    return (this.formularios[s.id]?.value?.disposicion ?? 'sola') as LadoImagen;
  }

  ponerDisposicion(s: SeccionInicioModel, valor: LadoImagen): void {
    this.ponerCampo(s, 'disposicion', valor);
  }

  /**
   * Si la manera elegida lleva imagen a un lado.
   *
   * NO ES «distinto de sola»: «en carteles» tampoco la lleva —ahí lo que
   * cambia es la forma de las tarjetas—, y con la comparación de antes la
   * pantalla pedía subir una imagen que no se iba a usar en ningún sitio.
   */
  conImagenAlLado(s: SeccionInicioModel): boolean {
    return llevaImagenAlLado(this.disposicionDe(s));
  }

  /**
   * SI LA SECCIÓN SE PAGINA en vez de ponerse en una fila.
   *
   * Las otras cuatro maneras son una fila que se mueve con las flechas —y que
   * puede pasar sola—; ésta las enseña TODAS en rejilla, de tantas en tantas,
   * con un botón debajo. Por eso aquí no se pregunta cada cuántos segundos
   * pasa: no pasa, se baja.
   */
  esPaginadaLa(s: SeccionInicioModel): boolean {
    return esPaginada(this.disposicionDe(s));
  }

  /** Cuántas tarjetas salen antes del botón, con el valor de siempre si no se eligió. */
  porPaginaDe(s: SeccionInicioModel): number {
    const escrito = Number(this.formularios[s.id]?.value?.por_pagina);
    return Number.isFinite(escrito) && escrito > 0 ? escrito : POR_PAGINA_DEFECTO;
  }

  /** Si hay fichero subido. */
  hayImagen(s: SeccionInicioModel): boolean {
    return !!s.imagen?.url;
  }

  /**
   * Si se eligió un lado pero todavía no hay imagen.
   *
   * SE AVISA Y SE GUARDA IGUAL: el lado elegido se conserva, así que subir la
   * imagen más tarde lo recupera. Pero mientras no esté, la tienda enseña la
   * sección sola, y eso hay que decirlo o parecerá que no se guardó.
   */
  faltaImagen(s: SeccionInicioModel): boolean {
    return this.conImagenAlLado(s) && !this.hayImagen(s);
  }

  /**
   * Si tiene sentido ofrecer «abrir en otra pestaña».
   *
   * SÓLO PARA LOS `https://`, que es la regla de la casa (fn_nueva_pestana en
   * la base): un enlace de la propia tienda nunca abre pestaña —sacaría al
   * cliente de la navegación— y un `http://` sin cifrar tampoco se puede
   * abrir en la ventana de dentro. Fuera de ese caso, la casilla no decide
   * nada y se apaga.
   */
  puedeAbrirPestana(s: SeccionInicioModel): boolean {
    return (this.formularios[s.id]?.value?.imagen_enlace ?? '')
      .toString().trim().toLowerCase().startsWith('https://');
  }

  async elegirImagen(s: SeccionInicioModel, evento: Event): Promise<void> {
    const input = evento.target as HTMLInputElement;
    const archivo = input.files?.[0];
    // El input se vacía siempre: sin esto, volver a elegir el MISMO fichero
    // no dispara «change» y parecería que no pasó nada
    input.value = '';
    if (!archivo || !this.puedeEditar) { return; }

    this.subiendoImagen = s.id;
    try {
      const res: any = await firstValueFrom(this._inicioService.subirImagenSeccion(s.id, archivo));
      this._toastr.success(res?.message ?? 'Imagen guardada', 'Listo');
      this.pintar(res?.data);
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo subir la imagen', 'Error',
                         { timeOut: 20000, closeButton: true });
    } finally {
      this.subiendoImagen = null;
    }
  }

  async quitarImagen(s: SeccionInicioModel): Promise<void> {
    if (!this.puedeEditar || !this.hayImagen(s)) { return; }

    this.subiendoImagen = s.id;
    try {
      const res: any = await firstValueFrom(this._inicioService.quitarImagenSeccion(s.id));
      this._toastr.success(res?.message ?? 'Imagen quitada', 'Listo');
      this.pintar(res?.data);
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo quitar la imagen', 'Error',
                         { timeOut: 20000, closeButton: true });
    } finally {
      this.subiendoImagen = null;
    }
  }

  /**
   * Si ese color se va a leer mal sobre el fondo blanco de la sección.
   *
   * SE AVISA, NO SE PROHÍBE: un amarillo sobre blanco puede ser justo lo que
   * se quiere para una franja de campaña, y quien administra está mirando la
   * muestra. Pero un color que se eligió por bonito en el selector y resulta
   * ilegible en la tienda es un fallo que nadie ve hasta que lo ve un cliente.
   *
   * El 3:1 es el mínimo de la WCAG para texto grande, que es lo que son estos
   * rótulos.
   */
  colorFlojo(s: SeccionInicioModel): boolean {
    return this.colorPropio(s) && this.contrasteConBlanco(this.colorMuestra(s)) < 3;
  }

  contraste(s: SeccionInicioModel): string {
    return this.contrasteConBlanco(this.colorMuestra(s)).toFixed(1).replace('.', ',');
  }

  private contrasteConBlanco(hex: string): number {
    return this.contrasteEntre(hex, '#ffffff');
  }

  /**
   * El contraste entre dos colores, como lo define la WCAG: de 1 a 21.
   *
   * La cuenta vive en `inicioModel` desde que también la usa «Encabezado»
   * para avisar si el color de la tienda deja la letra blanca sin leerse:
   * dos copias de esto son dos avisos que un día dejan de decir lo mismo.
   */
  private contrasteEntre(uno: string, otro: string): number {
    return contrasteEntre(uno, otro);
  }

  /**
   * Las letras de la tienda, para que la muestra enseñe las de verdad.
   *
   * SE PIDEN DESDE AQUÍ Y NO EN EL `index.html`: son tres tipografías que sólo
   * hacen falta en esta pantalla, y cargarlas en todo el CRM le costaría una
   * petición a cada pantalla para nada. Si no hay internet no pasa nada: la
   * muestra sale con la letra del sistema y los nombres siguen diciendo cuál
   * es cada una.
   */
  private pedirLetrasDeLaTienda(): void {
    const id = 'letras-de-la-tienda';
    if (document.getElementById(id)) { return; }

    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@700'
              + '&family=Poppins:wght@700&family=Barlow+Condensed:ital,wght@1,700&display=swap';
    document.head.appendChild(link);
  }

  /** Lo que se lee en la cabecera sin abrirla. */
  resumen(s: SeccionInicioModel): string {
    if (s.fuente.tipo === 'galeria') {
      if (!s.cuantas) { return 'Sin imágenes'; }
      return s.cuantas + (s.cuantas === 1 ? ' imagen' : ' imágenes');
    }
    if (s.fuente.tipo === 'promocion' || s.fuente.tipo === 'destacadas') {
      if (!s.cuantas) {
        return s.fuente.tipo === 'destacadas' ? 'Ninguna destacada' : 'Ninguna en promoción';
      }
      return s.cuantas + (s.cuantas === 1 ? ' categoría' : ' categorías');
    }
    if (s.fuente.tipo === 'marcas') {
      if (!s.cuantas) { return 'Ninguna marca en la tienda'; }
      return s.cuantas + (s.cuantas === 1 ? ' marca' : ' marcas');
    }
    if (s.fuente.tipo === 'productos') {
      if (!s.cuantas) { return 'Sin productos todavía'; }
      return s.cuantas + (s.cuantas === 1 ? ' producto' : ' productos');
    }
    return 'Falta ' + (s.fuente.falta ?? 'su fuente');
  }

  /** Si esta sección se llena en otra pantalla, cuál y con qué regla. */
  seLlenaEn(s: SeccionInicioModel):
      { ruta: string; pantalla: string; regla: string; params?: Record<string, any> } | null {
    if (s.fuente.tipo === 'productos') {
      return {
        ruta: '/ecommerce/' + (s.fuente.pantalla ?? 'producto-por-seccion'),
        pantalla: 'Productos por sección',
        // El enlace lleva la sección puesta: llegar a una lista de escaparates
        // y tener que buscar el que se estaba mirando es el paso que sobra.
        params: s.fuente.seccion_id ? { seccion: s.fuente.seccion_id } : undefined,
        regla: 'Salen aquí los productos que le metas a este escaparate, en el '
             + 'orden que tengan allí. Lo que aquí se decide es dónde va en la '
             + 'portada, qué se lee encima y entre qué fechas se ve.',
      };
    }
    if (s.fuente.tipo === 'promocion') {
      return {
        ruta: '/ecommerce/' + (s.fuente.pantalla ?? 'allCategoriasWeb'),
        pantalla: 'Categorías de la tienda',
        regla: 'Salen aquí las categorías que marques como «En promoción», con su '
             + 'imagen programada. Sin imagen, la tarjeta sale igual con su nombre.',
      };
    }
    if (s.fuente.tipo === 'destacadas') {
      return {
        ruta: '/ecommerce/' + (s.fuente.pantalla ?? 'allCategoriasWeb'),
        pantalla: 'Categorías de la tienda',
        regla: 'Salen aquí sólo las categorías que marques como «destacada», '
             + 'con su imagen programada. Sin imagen, la tienda pinta su inicial.',
      };
    }
    if (s.fuente.tipo === 'marcas') {
      return {
        ruta: '/ecommerce/' + (s.fuente.pantalla ?? 'allMarcasWeb'),
        pantalla: 'Marcas de la tienda',
        regla: 'Salen aquí las marcas encendidas para la tienda, en su orden, con su '
             + 'imagen programada o, si no tienen, con el logo del catálogo. La tienda '
             + 'sólo enseña las que tienen una de las dos.',
      };
    }
    return null;
  }

  /**
   * Lo que esta sección NO hace todavía en la tienda.
   *
   * Va aparte de la regla de arriba a propósito: una cosa es dónde se llena y
   * otra si el cliente la ve. Una sección de productos se administra entera
   * desde hoy —orden, rótulo, alto, fechas— pero la tienda todavía no sabe
   * pintarla, y callarlo sería dejar a alguien esperando a que aparezca.
   */
  avisoTienda(s: SeccionInicioModel): string | null {
    if (s.fuente.tipo !== 'productos') { return null; }
    return 'La tienda todavía no pinta estas secciones: le falta el diseño para '
         + 'ellas y la ficha del producto (existencias, «destacado» y el precio '
         + 'anterior). Lo que ordenes y escribas ahora vale igual cuando llegue.';
  }

  /**
   * Si la sección está encendida, se puede llenar, y está vacía.
   *
   * Es el aviso que más tiempo ahorra: la tienda se la salta, así que el
   * cambio «no sale» y no hay nada roto que buscar.
   *
   * SÓLO SE AVISA DE LAS QUE SE PUEDEN LLENAR. Una sección cuya fuente
   * todavía no está trasladada ya lo dice en su propia etiqueta, y repetirlo
   * con un aviso de peligro sería gritar por algo que nadie puede arreglar
   * hoy.
   */
  sinContenido(s: SeccionInicioModel): boolean {
    return s.fuente.tipo !== 'pendiente' && s.estado === 'visible' && !s.con_contenido;
  }

  /**
   * Elegir una sección: sus campos salen en la columna de la derecha.
   *
   * NO ALTERNA. Volver a pulsar la que ya está elegida la deja como está: en
   * dos columnas, «cerrarla» dejaría media pantalla en blanco sin que nadie
   * lo haya pedido.
   */
  elegir(id: number): void {
    this.elegida = id;
  }

  /** La sección elegida, o null. La columna de la derecha pinta la suya. */
  get laElegida(): SeccionInicioModel | null {
    return this.secciones.find(s => s.id === this.elegida) ?? null;
  }

  // ================================================================
  // LOS DOS DIVISORES
  // ================================================================
  //
  // El mismo divisor que el árbol del catálogo de productos y el de
  // características: se arrastra para cambiar el ancho, doble clic lo devuelve
  // al de siempre y el ancho se recuerda en este navegador.
  //
  // SON DOS PORQUE SON TRES COLUMNAS: cuerpos | secciones | campos. Cada uno
  // guarda su ancho con su clave, y el de los cuerpos es más estrecho porque
  // sus tarjetas son dos líneas.

  private readonly CLAVE_ANCHO = 'miCRM3.cuerpoPrincipal.anchoLateral';
  private readonly CLAVE_ANCHO_CUERPOS = 'miCRM3.cuerpoPrincipal.anchoCuerpos';
  public readonly ANCHO_DEFECTO = 360;
  public readonly ANCHO_CUERPOS_DEFECTO = 260;
  private readonly ANCHO_MIN = 260;
  private readonly ANCHO_MAX = 620;
  private readonly ANCHO_CUERPOS_MIN = 180;
  private readonly ANCHO_CUERPOS_MAX = 460;

  public anchoLateral = this.leerAncho();
  public anchoCuerpos = this.leerAnchoCuerpos();
  public lateralPlegado = false;
  public cuerposPlegado = false;
  public redimensionando = false;

  alternarLateral(): void {
    this.lateralPlegado = !this.lateralPlegado;
  }

  alternarCuerpos(): void {
    this.cuerposPlegado = !this.cuerposPlegado;
  }

  /**
   * Arrastrar un divisor cambia el ancho de su columna.
   *
   * Con captura del puntero: sin ella, al mover deprisa el ratón se sale del
   * divisor y el arrastre se queda a medias.
   */
  iniciarRedimension(ev: PointerEvent, cual: 'secciones' | 'cuerpos' = 'secciones'): void {
    if (ev.button !== 0) { return; }
    if (cual === 'secciones' && this.lateralPlegado) { return; }
    if (cual === 'cuerpos' && this.cuerposPlegado) { return; }
    ev.preventDefault();

    const divisor = ev.currentTarget as HTMLElement;
    const xInicial = ev.clientX;
    const deCuerpos = cual === 'cuerpos';
    const anchoInicial = deCuerpos ? this.anchoCuerpos : this.anchoLateral;
    const minimo = deCuerpos ? this.ANCHO_CUERPOS_MIN : this.ANCHO_MIN;
    const maximo = deCuerpos ? this.ANCHO_CUERPOS_MAX : this.ANCHO_MAX;
    this.redimensionando = true;
    divisor.setPointerCapture(ev.pointerId);

    const mover = (e: PointerEvent) => {
      const nuevo = Math.min(maximo, Math.max(minimo,
                              Math.round(anchoInicial + (e.clientX - xInicial))));
      if (deCuerpos) { this.anchoCuerpos = nuevo; } else { this.anchoLateral = nuevo; }
    };
    const soltar = (e: PointerEvent) => {
      divisor.removeEventListener('pointermove', mover);
      divisor.removeEventListener('pointerup', soltar);
      divisor.removeEventListener('pointercancel', soltar);
      divisor.releasePointerCapture(e.pointerId);
      this.redimensionando = false;
      this.guardarAncho();
    };

    divisor.addEventListener('pointermove', mover);
    divisor.addEventListener('pointerup', soltar);
    divisor.addEventListener('pointercancel', soltar);
  }

  anchoPorDefecto(cual: 'secciones' | 'cuerpos' = 'secciones'): void {
    if (cual === 'cuerpos') {
      this.anchoCuerpos = this.ANCHO_CUERPOS_DEFECTO;
    } else {
      this.anchoLateral = this.ANCHO_DEFECTO;
    }
    this.guardarAncho();
  }

  guardarAncho(): void {
    try {
      localStorage.setItem(this.CLAVE_ANCHO, String(this.anchoLateral));
      localStorage.setItem(this.CLAVE_ANCHO_CUERPOS, String(this.anchoCuerpos));
    } catch { /* ventana privada o almacenamiento bloqueado */ }
  }

  private leerAnchoCuerpos(): number {
    try {
      const guardado = Number(localStorage.getItem(this.CLAVE_ANCHO_CUERPOS));
      const vale = Number.isFinite(guardado)
        && guardado >= this.ANCHO_CUERPOS_MIN && guardado <= this.ANCHO_CUERPOS_MAX;
      return vale ? guardado : this.ANCHO_CUERPOS_DEFECTO;
    } catch { return this.ANCHO_CUERPOS_DEFECTO; }
  }

  private leerAncho(): number {
    try {
      const guardado = Number(localStorage.getItem(this.CLAVE_ANCHO));
      const vale = Number.isFinite(guardado)
        && guardado >= this.ANCHO_MIN && guardado <= this.ANCHO_MAX;
      return vale ? guardado : this.ANCHO_DEFECTO;
    } catch { return this.ANCHO_DEFECTO; }
  }

  // ================================================================
  // GUARDAR
  // ================================================================

  async alternarActivo(s: SeccionInicioModel, evento: Event): Promise<void> {
    evento.stopPropagation();
    if (!this.puedeEditar || this.trabajando) { return; }
    if (this._seguridadService.isexpired()) { return; }

    await this.accion(() => this._inicioService.activarSeccion(s.id));
  }

  async guardarSeccion(s: SeccionInicioModel): Promise<void> {
    if (!this.puedeEditar || this.guardando) { return; }
    if (this._seguridadService.isexpired()) { return; }

    const f = this.formularios[s.id];
    f.markAllAsTouched();
    if (f.invalid) {
      this._toastr.error('Revise los campos.', 'No se puede guardar',
                         { timeOut: 15000, closeButton: true });
      return;
    }

    const v = f.getRawValue();
    const limpio = (x: any) => (x ?? '').toString().trim() || null;
    // Un entero o null: los segundos y las tarjetas por página se guardan
    // igual, y lo que no sea un número se manda vacío, que la base entiende
    // como «lo de siempre»
    const enteroDe = (x: any) => {
      const n = Math.round(Number(limpio(x)));
      return Number.isFinite(n) && n > 0 ? n : null;
    };

    const desde = limpio(v.desde);
    const hasta = limpio(v.hasta);
    if (desde && hasta && hasta < desde) {
      this._toastr.error('La fecha «hasta» es anterior a la de «desde».', 'Las fechas van al revés',
                         { timeOut: 15000, closeButton: true });
      return;
    }

    this.guardando = s.id;
    try {
      const conRotulo = this.vista(s).rotulo !== 'ninguno';

      const res: any = await firstValueFrom(this._inicioService.editSeccion(s.id, {
        // El rótulo sólo se manda donde la tienda lo pinta: así no se queda
        // guardado a escondidas en una sección que no lo enseña.
        titulo:        conRotulo ? limpio(v.titulo) : null,
        subtitulo:     this.vista(s).rotulo === 'titulo_subtitulo' ? limpio(v.subtitulo) : null,
        rotulo_tamano: conRotulo ? limpio(v.tamano) : null,
        rotulo_color:  conRotulo ? limpio(v.color) : null,
        rotulo_fuente: conRotulo ? limpio(v.fuente) : null,
        // El alto sí lo llevan todas: hasta un banner sin rótulo ocupa su sitio
        alto:          limpio(v.alto),
        // Los botones sólo donde hay tarjetas que los pinten: guardarle un
        // color a un banner lo dejaría ahí, sin que nada lo enseñe y sin que
        // nadie pueda saber de dónde salió
        boton_favorito_color: this.conBotones(s) ? limpio(v.boton_favorito_color) : null,
        boton_favorito_texto: this.conBotones(s) ? limpio(v.boton_favorito_texto) : null,
        boton_carrito_color:  this.conBotones(s) ? limpio(v.boton_carrito_color)  : null,
        boton_carrito_texto:  this.conBotones(s) ? limpio(v.boton_carrito_texto)  : null,
        boton_whatsapp_color: this.conBotones(s) ? limpio(v.boton_whatsapp_color) : null,
        boton_whatsapp_texto: this.conBotones(s) ? limpio(v.boton_whatsapp_texto) : null,
        boton_tarjeta_color:  this.conBotones(s) ? limpio(v.boton_tarjeta_color)  : null,
        boton_tarjeta_texto:  this.conBotones(s) ? limpio(v.boton_tarjeta_texto)  : null,
        // Y lo mismo con la tarjeta y su cartel: sólo donde hay tarjetas
        tarjeta_fondo_color:  this.conBotones(s) ? limpio(v.tarjeta_fondo_color)  : null,
        tarjeta_borde_color:  this.conBotones(s) ? limpio(v.tarjeta_borde_color)  : null,
        descuento_color:      this.conBotones(s) ? limpio(v.descuento_color)      : null,
        descuento_texto:      this.conBotones(s) ? limpio(v.descuento_texto)      : null,
        etiqueta:             this.conBotones(s) ? limpio(v.etiqueta)             : null,
        etiqueta_color:       this.conBotones(s) ? limpio(v.etiqueta_color)       : null,
        etiqueta_texto:       this.conBotones(s) ? limpio(v.etiqueta_texto)       : null,
        // La disposición y la imagen, también sólo donde hay productos. El
        // FICHERO no va aquí: se sube al elegirlo, por su propia puerta
        disposicion:          this.conBotones(s) ? (limpio(v.disposicion) || 'sola') : null,
        // Y la vista sólo donde hay un banner que enseñar
        banner_vista:         s.es_banner ? (limpio(v.banner_vista) || 'rotativo') : null,
        // Vacío se manda como null, que es «lo que hace de siempre»: un banner
        // rota a su ritmo y una sección de productos se queda quieta. En las de
        // productos manda la palanca: apagada, null aunque haya un número
        // escrito, para que volver a encenderla lo recupere
        forma:                this.esDestacadas(s) ? (limpio(v.forma) || 'circulo') : null,
        // El alcance sólo donde se mira: en un banner o en un escaparate no
        // dice nada, y guardarlo ahí dejaría un campo que nadie lee
        alcance:              this.miraElAlcance(s) ? (limpio(v.alcance) || 'tienda') : null,
        // Sólo la paginada lo mira: en las demás se guardaría un número que
        // no enseña nadie
        por_pagina:           this.esPaginadaLa(s) ? enteroDe(v.por_pagina) : null,
        segundos:             this.tieneGaleria(s) ? enteroDe(v.segundos)
                            : this.conBotones(s)   ? (v.mueve_sola ? (enteroDe(v.segundos) ?? 5) : null)
                            : null,
        imagen_alt:           this.conBotones(s) ? limpio(v.imagen_alt)    : null,
        imagen_enlace:        this.conBotones(s) ? limpio(v.imagen_enlace) : null,
        imagen_nueva_pestana: this.conBotones(s) ? !!v.imagen_nueva_pestana : null,
        activo:        s.activo,
        desde,
        hasta,
      }));

      this._toastr.success(res?.message ?? 'Guardado', 'Listo');
      this.pintar(res?.data);
      this.ponerAlDia(s.id, res?.data);

    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo guardar', 'Error',
                         { timeOut: 20000, closeButton: true });
    } finally {
      this.guardando = null;
    }
  }

  /** El formulario de la sección que se acaba de guardar, con lo que quedó. */
  private ponerAlDia(id: number, data: SeccionInicioModel[] | null | undefined): void {
    const s = (data ?? []).find(x => x.id === id);
    if (!s) { return; }

    this.formularios[id].patchValue({
      titulo:    s.titulo ?? '',
      subtitulo: s.subtitulo ?? '',
      tamano:    s.estilo?.tamano ?? 'normal',
      color:     s.estilo?.color ?? '',
      fuente:    s.estilo?.fuente ?? 'titulos',
      alto:      s.alto ?? 'normal',
      desde:     s.desde ?? '',
      hasta:     s.hasta ?? '',
      alcance:   s.alcance ?? 'tienda',
      por_pagina: s.por_pagina ?? null,
    });
  }

  /**
   * Mover una sección de sitio.
   *
   * LAS POSICIONES QUE DA EL ARRASTRE SON LAS DE LA LISTA QUE SE VE, no las de
   * la portada: con un filtro puesto hay filas escondidas por el medio, y
   * aplicarlas tal cual movería la que no es. Por eso se traducen.
   *
   * LA REGLA ES LA QUE SE VE: la sección se coloca justo delante de aquella
   * encima de la que se soltó. Si se soltó la última, se coloca detrás de la
   * última que se ve. Nunca se la hace saltar por encima de filas escondidas,
   * porque su posición respecto a ellas no se podía ver al arrastrar y
   * cambiarla sería mover algo a ciegas.
   *
   * Sin filtro las dos listas son la misma y esto da exactamente lo de antes.
   */
  async soltar(evento: CdkDragDrop<SeccionInicioModel[]>): Promise<void> {
    if (!this.puedeEditar || evento.previousIndex === evento.currentIndex) { return; }

    const visibles = this.seccionesVisibles;
    const movida = visibles[evento.previousIndex];
    if (!movida) { return; }

    // La lista que se ve y la de verdad, las dos sin la que se está moviendo
    const restoVisible = visibles.filter(s => s !== movida);
    const todas = this.secciones.filter(s => s !== movida);

    const delante = restoVisible[evento.currentIndex];
    let destino: number;
    if (delante) {
      destino = todas.indexOf(delante);
    } else if (restoVisible.length) {
      // Se soltó al final: detrás de la última que se ve
      destino = todas.indexOf(restoVisible[restoVisible.length - 1]) + 1;
    } else {
      // Era la única visible: no hay contra qué moverla
      return;
    }

    todas.splice(destino, 0, movida);
    this.secciones = todas;

    await this.accion(() => this._inicioService.ordenarSecciones(
      this.secciones.map(s => s.id), this.cuerpoElegido), false);
  }

  /** Una galería de dentro cambió: la cuenta de su sección ya no vale. */
  async galeriaCambiada(): Promise<void> {
    try {
      const res: any = await firstValueFrom(this._inicioService.allInicio(this.cuerpoElegido));
      this.pintar(res?.data);
    } catch { /* la galería ya avisó de lo suyo */ }
  }

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
