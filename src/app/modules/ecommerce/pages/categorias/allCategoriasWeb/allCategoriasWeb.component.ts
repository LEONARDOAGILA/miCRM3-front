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
import { CategoriaWebService } from '../../../services/categoriaWeb.service';
import { CategoriaWebModel, ESTADOS_CATEGORIA } from '../../../interfaces/categoriaWebModel';
import {
  CategoriaImagenModel, ImagenesDeCategoria, ImagenCategoriaEnPapelera,
  CuentaImagenes, ESTADOS_IMAGEN_CATEGORIA,
} from '../../../interfaces/categoriaImagenModel';
import { SaveImagenCategoriaComponent } from '../saveImagenCategoria/saveImagenCategoria.component';

/**
 * Una categoría visible en la tienda con las suyas debajo.
 *
 * Cada rama es su propia lista arrastrable: el orden se decide entre
 * hermanas, porque es así como lo pinta la tienda. Mover una categoría a
 * otra rama es cambiar el árbol, y eso es de Inventarios.
 */
interface RamaTienda {
  categoria: CategoriaWebModel;
  hijos: RamaTienda[];
}

import { PanelComponent } from '../../../../../components/panel/panel.component';
import { FileTreeNode, FileTreeNodeComponent } from '../../../../../components/file-tree-node/file-tree-node.component';
import { filtrarArbol, recorrer } from '../../../../seguridad/pages/grupos/arbolGrupos';

/**
 * LAS CATEGORÍAS DE LA TIENDA: EL ÁRBOL A LA IZQUIERDA, SUS IMÁGENES A LA
 * DERECHA.
 *
 * Misma estructura que Inventarios → Características, que a su vez la sacó
 * del administrador de archivos. Se trabaja categoría por categoría, así que
 * el árbol se queda a la vista en vez de esconderse en un modal.
 *
 * LO QUE SE ADMINISTRA AQUÍ:
 *
 *   · si la categoría sale en la tienda y con qué nombre
 *   · SUS IMÁGENES, cada una con sus fechas
 *
 * UNA CATEGORÍA PUEDE TENER VARIAS IMÁGENES PREPARADAS: la de siempre, la de
 * navidad del 1 al 26 de diciembre, la del día de la madre. La tienda enseña
 * la que toque hoy, sola. Por eso la lista dice de cada una en qué estado
 * está —en fecha, programada, terminada, apagada— y marca cuál es LA que se
 * está viendo ahora mismo: dos vigentes a la vez no es un error, manda la
 * primera por orden, y sin decirlo nadie entendería por qué sale una y no la
 * otra.
 *
 * PROGRAMAR UNA IMAGEN ES ADEMÁS LO QUE METE LA CATEGORÍA EN EL MOSAICO DE LA
 * PORTADA. Una sola decisión, no dos: si tiene imagen vigente, sale.
 *
 * EL ÁRBOL ES DE INVENTARIOS: aquí no se crea, ni se borra, ni se reordena
 * una categoría. Mezclarlo daría dos sitios para cambiar el árbol y dos
 * formas de dejarlo inconsistente.
 */
@Component({
  selector: 'app-allCategoriasWeb',
  templateUrl: './allCategoriasWeb.component.html',
  styleUrls: ['./allCategoriasWeb.component.css'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    CommonModule, FormsModule, RouterLink, NgScrollbarModule,
    PanelComponent, FileTreeNodeComponent,
    CdkDropList, CdkDrag, CdkDragHandle, CdkDragPlaceholder,
  ],
})
export class AllCategoriasWebComponent implements OnInit {

  public titulo = 'Categorías de la tienda';
  public accesoModel!: AccesoModel;

  // ---------- El árbol ----------
  public categorias: CategoriaWebModel[] = [];
  public nodes: FileTreeNode[] = [];
  public originalNodes: FileTreeNode[] = [];
  public searchQuery = '';
  public recargandoArbol = false;

  /** Qué ramas están abiertas, para que no se cierren al recargar. */
  private abiertos = new Set<number>();

  /** Cuántas imágenes tiene cada categoría y si alguna sale hoy. */
  private cuentas = new Map<number, CuentaImagenes>();

  // ---------- La elegida ----------
  public seleccionId: number | null = null;
  public contenido: ImagenesDeCategoria | null = null;
  public cargandoImagenes = false;

  public papelera: ImagenCategoriaEnPapelera[] = [];
  public papeleraAbierta = false;

  /** El nombre para la tienda, mientras se escribe. */
  public nombreWeb = '';

  public trabajando = false;

  // ---------- El lateral ----------
  public mobileSidebarToggled = false;
  public redimensionando = false;
  public readonly ANCHO_LATERAL_DEFECTO = 300;
  private readonly ANCHO_LATERAL_MIN = 200;
  private readonly ANCHO_LATERAL_MAX = 640;
  private readonly CLAVE_ANCHO_LATERAL = 'miCRM3.allCategoriasWeb.anchoLateral';
  public anchoLateral = this.leerAnchoLateral();

  public readonly estadosCategoria = ESTADOS_CATEGORIA;
  public readonly estadosImagen = ESTADOS_IMAGEN_CATEGORIA;

  private _categoriaService = inject(CategoriaWebService);
  private _seguridadService = inject(SeguridadService);
  private _toastr = inject(ToastrService);
  private modal = inject(NgbModal);
  private activeRoute = inject(ActivatedRoute);

  get puedeEditar(): boolean { return this.accesoModel?.editar === true; }
  get puedeCrear(): boolean { return this.accesoModel?.crear === true; }
  get puedeEliminar(): boolean { return this.accesoModel?.eliminar === true; }

  get seleccionada(): CategoriaWebModel | null {
    return this.categorias.find(c => c.id === this.seleccionId) ?? null;
  }

  get imagenes(): CategoriaImagenModel[] { return this.contenido?.imagenes ?? []; }

  /** La que se está viendo ahora mismo en la tienda, si hay alguna. */
  get laQueSale(): CategoriaImagenModel | null {
    return this.imagenes.find(i => i.sale_ahora) ?? null;
  }

  /** Cuántas categorías saldrían hoy en el mosaico de la portada. */
  get cuantasEnLaPortada(): number {
    let n = 0;
    for (const c of this.categorias) {
      if (c.estado === 'visible' && this.cuentas.get(c.id)?.sale_alguna) { n++; }
    }
    return n;
  }

  /**
   * Las destacadas, EN EL ORDEN EN QUE SALEN en la portada.
   *
   * VA EN UN CAMPO y no en un getter: es la lista que se arrastra, y un
   * array nuevo en cada ciclo de detección de cambios deja al cdkDropList
   * sin saber qué movió.
   */
  public destacadas: CategoriaWebModel[] = [];

  /** Rehace la lista de la derecha a partir del árbol. */
  private ordenarDestacadasEnPantalla(): void {
    this.destacadas = this.categorias
      .filter(c => c.destacada)
      .sort((a, b) => {
        // Las recién marcadas (sin orden) van al final, como en la tienda
        const oa = a.destacada_orden ?? Number.MAX_SAFE_INTEGER;
        const ob = b.destacada_orden ?? Number.MAX_SAFE_INTEGER;
        if (oa !== ob) { return oa - ob; }
        return a.orden - b.orden || a.nombre.localeCompare(b.nombre);
      });
  }

  /** Una destacada que no se ve en la tienda no sale en los círculos. */
  noSaleAunqueDestacada(c: CategoriaWebModel): boolean {
    return c.estado !== 'visible';
  }

  /**
   * Las que SÍ se ven en la tienda, como ramas, para la última columna.
   *
   * VA EN UN CAMPO y no en un getter: cada rama es su propia lista
   * arrastrable, y un array nuevo en cada ciclo de detección de cambios deja
   * al cdkDropList sin saber qué movió.
   */
  public enLaTienda: RamaTienda[] = [];

  /** Cuántas llevan encendido «Se ve en la tienda». */
  public cuantasEnLaTienda = 0;

  /**
   * Arma el árbol de las ENCENDIDAS, en el orden de la tienda.
   *
   * ENTRAN LAS QUE TIENEN EL CHECK «Se ve en la tienda», no sólo las que de
   * verdad acaban saliendo. Son cosas distintas: una categoría encendida
   * puede no salir porque está inactiva en el catálogo o porque no tiene
   * ninguna de producto debajo. Ésas también se ordenan —el día que se
   * arreglen saldrán donde se las dejó— y se marcan con un aviso.
   *
   * APAGAR UN PADRE APAGA LA RAMA, así que una hija encendida bajo un padre
   * apagado tampoco entra: en la tienda no está, y dejarla aquí suelta la
   * sacaría de donde cuelga.
   *
   * El servidor ya las devuelve en el orden de la tienda —`orden_web`
   * primero y el del catálogo de reserva—, así que aquí sólo hay que
   * colgarlas de su padre sin reordenar nada: ordenarlo otra vez sería
   * repetir la regla y acabar enseñando algo distinto de lo que ve el
   * cliente.
   */
  private armarEnLaTienda(): void {
    const porId = new Map<number, RamaTienda>();
    const raices: RamaTienda[] = [];

    // El servidor las manda por nivel, así que un padre siempre se mira
    // antes que sus hijas y basta con una pasada.
    for (const c of this.categorias) {
      if (c.oculta) { continue; }
      if (c.padre_id && !porId.has(c.padre_id)) { continue; }

      const rama: RamaTienda = { categoria: c, hijos: [] };
      porId.set(c.id, rama);

      const padre = c.padre_id ? porId.get(c.padre_id) : undefined;
      if (padre) { padre.hijos.push(rama); } else { raices.push(rama); }
    }

    this.enLaTienda = raices;
    this.cuantasEnLaTienda = porId.size;
  }

  /**
   * Encendida pero sin llegar a salir en la tienda.
   *
   * No es lo mismo que apagarla: el check está puesto y aun así no sale,
   * porque está inactiva en el catálogo o porque no tiene ninguna categoría
   * de producto debajo. Las dos se arreglan en Inventarios.
   */
  encendidaPeroNoSale(c: CategoriaWebModel): boolean {
    return !c.oculta && c.estado !== 'visible';
  }

  /**
   * Se soltó una categoría dentro de su rama: ése es el orden de la tienda.
   *
   * SE MANDA LA RAMA ENTERA, no sólo la que se movió: el servidor exige que
   * todas sean del mismo padre, y es lo que se acaba de ver en pantalla.
   */
  async soltarEnLaTienda(evento: CdkDragDrop<RamaTienda[]>, lista: RamaTienda[]): Promise<void> {
    if (!this.puedeEditar || evento.previousIndex === evento.currentIndex) { return; }
    if (this._seguridadService.isexpired()) { return; }

    moveItemInArray(lista, evento.previousIndex, evento.currentIndex);
    const ids = lista.map(r => r.categoria.id);

    this.trabajando = true;
    try {
      const res: any = await firstValueFrom(this._categoriaService.ordenarCategorias(ids));
      this.categorias = res?.data ?? this.categorias;
      this.construirArbol();
      this._toastr.success(res?.message ?? 'Orden guardado', 'Listo');
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo guardar el orden', 'Error',
                         { timeOut: 15000, closeButton: true });
      await this.cargarArbol();
    } finally {
      this.trabajando = false;
    }
  }

  /** Cuántas imágenes tiene una categoría, para la lista de la derecha. */
  cuentaDe(id: number): CuentaImagenes | undefined {
    return this.cuentas.get(id);
  }

  /** La ruta completa de la elegida, para saber de qué rama es. */
  get rutaSeleccionada(): string {
    if (!this.seleccionada) { return ''; }

    const porId = new Map(this.categorias.map(c => [c.id, c]));
    const tramos: string[] = [];
    let actual: CategoriaWebModel | undefined = this.seleccionada;
    const vistos = new Set<number>();

    while (actual && !vistos.has(actual.id)) {
      vistos.add(actual.id);
      tramos.unshift(actual.nombre);
      actual = actual.padre_id ? porId.get(actual.padre_id) : undefined;
    }
    return tramos.join(' > ');
  }

  async ngOnInit(): Promise<void> {
    this.accesoModel = this.activeRoute.snapshot.data['access'];
    await this.cargarArbol();
  }

  // ================================================================
  // EL ÁRBOL
  // ================================================================

  /**
   * Trae el árbol y cuántas imágenes tiene cada rama.
   *
   * Son dos llamadas y no una por categoría: treinta y tres categorías
   * serían treinta y tres viajes para pintar unos contadores.
   */
  async cargarArbol(): Promise<void> {
    this.recargandoArbol = true;
    try {
      const [arbol, cuentas]: any[] = await Promise.all([
        firstValueFrom(this._categoriaService.allCategoriasWeb()),
        firstValueFrom(this._categoriaService.imagenesCuentas()),
      ]);

      this.categorias = arbol?.data ?? [];
      this.cuentas = new Map((cuentas?.data ?? []).map((c: CuentaImagenes) => [c.categoria_id, c]));
      this.construirArbol();

      // Al abrir, la primera que de verdad se vea en la tienda: la pantalla
      // arranca enseñando algo en vez de un «elige una categoría».
      if (this.seleccionId === null) {
        const primera = this.categorias.find(c => c.estado === 'visible');
        if (primera) { await this.seleccionar(primera.id); }
      }
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo cargar el árbol de categorías', 'Error',
                         { timeOut: 15000, closeButton: true });
      this.categorias = [];
      this.construirArbol();
    } finally {
      this.recargandoArbol = false;
    }
  }

  /** Lista plana (padre antes que hijo) -> árbol. */
  private construirArbol(): void {
    const nodos = new Map<number, FileTreeNode>();
    const raices: FileTreeNode[] = [];

    for (const c of this.categorias) {
      const cuenta = this.cuentas.get(c.id);
      const cuantas = cuenta?.cuantas ?? 0;
      const sale = cuenta?.sale_alguna === true;
      const estado = this.estadosCategoria[c.estado];

      nodos.set(c.id, {
        id: c.id,
        nombre: c.nombre,
        tipo: 0,
        escarpeta: true,
        // La que tiene imagen saliendo hoy se marca con la foto; el resto,
        // con el icono de rama o de producto.
        icono: sale ? 'fa fa-image'
                    : (c.es_transaccion ? 'fa fa-box' : 'fa fa-layer-group'),
        // Las que no salen en la tienda, en gris: aquí se administra lo que
        // ve el cliente, y una categoría apagada no lo es.
        color: c.estado === 'visible'
          ? (sale ? 'var(--bs-app-theme, #00acac)' : undefined)
          : 'var(--bs-secondary-color, #6c757d)',
        badge: cuantas || undefined,
        titulo: [c.nombre,
                 estado ? estado.texto : c.estado,
                 cuantas ? `${cuantas} imagen(es)` + (sale ? ', una saliendo hoy' : ', ninguna hoy') : 'sin imágenes',
                 c.destacada ? 'destacada' : '',
                ].filter(Boolean).join(' — '),
        isOpen: this.abiertos.has(c.id),
        isSelected: this.seleccionId === c.id,
      });
    }

    for (const c of this.categorias) {
      const n = nodos.get(c.id)!;
      const padre = c.padre_id ? nodos.get(c.padre_id) : undefined;
      if (padre) { (padre.children ??= []).push(n); } else { raices.push(n); }
    }

    this.originalNodes = raices;
    this.nodes = filtrarArbol(this.originalNodes, this.searchQuery);
    this.ordenarDestacadasEnPantalla();
    this.armarEnLaTienda();
  }

  /**
   * Se soltó una destacada en otro sitio: ése es el orden de la portada.
   *
   * SE GUARDA AL SOLTAR, sin botón: es un gesto, y pedir que además se
   * confirme convierte un gesto en dos pasos.
   */
  async soltarDestacada(evento: CdkDragDrop<CategoriaWebModel[]>): Promise<void> {
    if (!this.puedeEditar || evento.previousIndex === evento.currentIndex) { return; }
    if (this._seguridadService.isexpired()) { return; }

    moveItemInArray(this.destacadas, evento.previousIndex, evento.currentIndex);
    const ids = this.destacadas.map(c => c.id);

    this.trabajando = true;
    try {
      const res: any = await firstValueFrom(this._categoriaService.ordenarDestacadas(ids));
      this.categorias = res?.data ?? this.categorias;
      this.construirArbol();
      this._toastr.success(res?.message ?? 'Orden guardado', 'Listo');
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo guardar el orden', 'Error',
                         { timeOut: 15000, closeButton: true });
      await this.cargarArbol();
    } finally {
      this.trabajando = false;
    }
  }

  onNodeSelect(node: FileTreeNode): void {
    this.seleccionar(node.id);
    this.mobileSidebarToggled = false;
  }

  async seleccionar(id: number): Promise<void> {
    this.seleccionId = id;
    this.papeleraAbierta = false;
    this.papelera = [];

    recorrer(this.originalNodes, n => { n.isSelected = n.id === id; });
    this.nodes = filtrarArbol(this.originalNodes, this.searchQuery);

    this.nombreWeb = this.seleccionada?.nombre_web ?? '';
    await this.cargarImagenes();
  }

  onNodeToggle(node: FileTreeNode): void {
    if (node.isOpen) { this.abiertos.add(node.id); } else { this.abiertos.delete(node.id); }
  }

  expandirTodo(): void {
    recorrer(this.originalNodes, n => { n.isOpen = true; this.abiertos.add(n.id); });
    this.nodes = filtrarArbol(this.originalNodes, this.searchQuery);
  }

  contraerTodo(): void {
    recorrer(this.originalNodes, n => { n.isOpen = false; });
    this.abiertos.clear();
    this.nodes = filtrarArbol(this.originalNodes, this.searchQuery);
  }

  filterNodes(): void { this.nodes = filtrarArbol(this.originalNodes, this.searchQuery); }

  limpiarBusquedaArbol(): void { this.searchQuery = ''; this.filterNodes(); }

  toggleMobileSidebar(): void { this.mobileSidebarToggled = !this.mobileSidebarToggled; }

  // ---------- El divisor ----------

  /**
   * Arrastrar el divisor cambia el ancho del árbol.
   *
   * Con captura del puntero: si no, al mover deprisa el ratón se sale del
   * divisor y el arrastre se queda a medias.
   */
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
      const guardado = Number(localStorage.getItem('miCRM3.allCategoriasWeb.anchoLateral'));
      return Number.isFinite(guardado) && guardado >= 200 && guardado <= 640 ? guardado : 300;
    } catch { return 300; }
  }

  // ================================================================
  // LA CATEGORÍA ELEGIDA
  // ================================================================

  async cargarImagenes(): Promise<void> {
    if (this.seleccionId === null) { return; }

    this.cargandoImagenes = true;
    try {
      const res: any = await firstValueFrom(this._categoriaService.imagenes(this.seleccionId));
      this.contenido = res?.data ?? null;
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudieron cargar las imágenes', 'Error',
                         { timeOut: 15000, closeButton: true });
      this.contenido = null;
    } finally {
      this.cargandoImagenes = false;
    }
  }

  /** Enciende o apaga la categoría en la tienda. */
  async alternarVisible(): Promise<void> {
    const c = this.seleccionada;
    if (!c || !this.puedeEditar || this.trabajando) { return; }
    if (this._seguridadService.isexpired()) { return; }

    await this.accionCategoria(() => this._categoriaService.editCategoriaWeb(c.id, {
      oculta: !c.oculta,
      nombre_web: c.nombre_web ?? null,
    }));
  }

  /**
   * La marca de «destacada»: los círculos de arriba de la portada.
   *
   * ES DISTINTA DEL MOSAICO, que se llena solo con cualquier categoría que
   * tenga imagen vigente. Ésta se elige a dedo, y por eso es una marca.
   */
  async alternarDestacada(): Promise<void> {
    const c = this.seleccionada;
    if (!c || !this.puedeEditar || this.trabajando) { return; }
    if (this._seguridadService.isexpired()) { return; }

    await this.accionCategoria(() => this._categoriaService.editCategoriaWeb(c.id, {
      oculta: c.oculta,
      nombre_web: c.nombre_web ?? null,
      destacada: !c.destacada,
    }));
  }

  /** Guarda el nombre con el que se enseña en la tienda. */
  async guardarNombreWeb(): Promise<void> {
    const c = this.seleccionada;
    if (!c || !this.puedeEditar || this.trabajando) { return; }
    if (this._seguridadService.isexpired()) { return; }

    await this.accionCategoria(() => this._categoriaService.editCategoriaWeb(c.id, {
      oculta: c.oculta,
      nombre_web: this.nombreWeb.trim() || null,
      destacada: c.destacada,
    }));
  }

  /** El árbol entero cambia: apagar una rama apaga lo que cuelga de ella. */
  private async accionCategoria(llamada: () => any): Promise<void> {
    this.trabajando = true;
    try {
      const res: any = await firstValueFrom(llamada());
      this._toastr.success(res?.message ?? 'Guardado', 'Listo');
      this.categorias = res?.data ?? this.categorias;
      this.construirArbol();
      this.nombreWeb = this.seleccionada?.nombre_web ?? '';
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo guardar', 'Error',
                         { timeOut: 20000, closeButton: true });
      await this.cargarArbol();
    } finally {
      this.trabajando = false;
    }
  }

  // ================================================================
  // LAS IMÁGENES
  // ================================================================

  programar(): void { this.abrirImagen(null); }
  editarImagen(i: CategoriaImagenModel): void { this.abrirImagen(i); }

  private abrirImagen(i: CategoriaImagenModel | null): void {
    const c = this.seleccionada;
    if (!c) { return; }
    if (!(i ? this.puedeEditar : this.puedeCrear)) { return; }
    if (this._seguridadService.isexpired()) { return; }

    const ref = this.modal.open(SaveImagenCategoriaComponent,
                                { size: 'lg', backdrop: 'static', centered: true });
    ref.componentInstance.categoriaId = c.id;
    ref.componentInstance.categoriaNombre = this.rutaSeleccionada;
    ref.componentInstance.imagen = i;

    ref.result.then((data: ImagenesDeCategoria) => this.pintar(data),
                    () => { /* se cerró sin guardar */ });
  }

  async alternarImagen(i: CategoriaImagenModel): Promise<void> {
    if (!this.puedeEditar || this.trabajando) { return; }
    await this.accionImagen(() => this._categoriaService.activarImagen(i.id));
  }

  async quitarImagen(i: CategoriaImagenModel): Promise<void> {
    if (!this.puedeEliminar || this.trabajando) { return; }
    if (!confirm(`¿Quitar esta imagen de «${this.seleccionada?.nombre}»?\n\n`
                 + 'Va a la papelera de esta categoría: desde ahí se puede devolver.')) { return; }

    await this.accionImagen(() => this._categoriaService.deleteImagen(i.id));
  }

  async soltarImagen(evento: CdkDragDrop<CategoriaImagenModel[]>): Promise<void> {
    if (!this.puedeEditar || evento.previousIndex === evento.currentIndex || !this.contenido) { return; }

    moveItemInArray(this.contenido.imagenes, evento.previousIndex, evento.currentIndex);
    await this.accionImagen(
      () => this._categoriaService.ordenarImagenes(this.contenido!.imagenes.map(i => i.id)), false);
  }

  // ---------- La papelera, la de esta categoría ----------

  async alternarPapelera(): Promise<void> {
    this.papeleraAbierta = !this.papeleraAbierta;
    if (this.papeleraAbierta) { await this.cargarPapelera(); }
  }

  private async cargarPapelera(): Promise<void> {
    if (this.seleccionId === null) { return; }
    try {
      const res: any = await firstValueFrom(this._categoriaService.papeleraImagenes(this.seleccionId));
      this.papelera = res?.data ?? [];
    } catch {
      this.papelera = [];
    }
  }

  async restaurarImagen(p: ImagenCategoriaEnPapelera): Promise<void> {
    if (!this.puedeEditar || this.trabajando) { return; }
    await this.accionImagen(() => this._categoriaService.restaurarImagenes([p.id]));
  }

  async vaciarPapelera(): Promise<void> {
    if (!this.puedeEliminar || this.trabajando || !this.papelera.length) { return; }
    if (this.seleccionId === null) { return; }
    if (!confirm(`¿Vaciar la papelera de «${this.seleccionada?.nombre}»?\n\n`
                 + `Se borran ${this.papelera.length} imagen(es) del disco y no se pueden recuperar.`)) { return; }

    await this.accionImagen(() => this._categoriaService.vaciarImagenes(this.seleccionId!));
  }

  // ================================================================

  /** Todas las acciones devuelven las imágenes enteras y se repinta. */
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
   * Pinta lo que devolvió el servidor y pone al día la chapita del árbol.
   *
   * SIN VOLVER A PEDIR EL ÁRBOL: la cuenta de esta categoría se sabe de la
   * propia respuesta, y recargarlo entero cerraría las ramas abiertas y
   * movería el foco justo después de cada clic.
   */
  private pintar(data: ImagenesDeCategoria | null | undefined): void {
    if (!data) { return; }
    this.contenido = data;

    this.cuentas.set(data.categoria_id, {
      categoria_id: data.categoria_id,
      cuantas: data.imagenes.length,
      sale_alguna: data.imagenes.some(i => i.sale_ahora),
    });
    this.construirArbol();

    if (this.papeleraAbierta) { this.cargarPapelera(); }
  }

  /** Las fechas en una línea legible. */
  vigencia(i: CategoriaImagenModel): string {
    const bonita = (f: string | null) => (f ?? '').replace('T', ' ');
    if (!i.desde && !i.hasta) { return 'Siempre'; }
    if (i.desde && i.hasta) { return `${bonita(i.desde)} → ${bonita(i.hasta)}`; }
    if (i.desde) { return `Desde ${bonita(i.desde)}`; }
    return `Hasta ${bonita(i.hasta)}`;
  }
}
