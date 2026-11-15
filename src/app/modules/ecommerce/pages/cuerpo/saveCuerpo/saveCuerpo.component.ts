import { Component, Input, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';

import { CuerpoService } from '../../../services/cuerpo.service';
import { CategoriaWebService } from '../../../services/categoriaWeb.service';
import { MarcaWebService } from '../../../services/marcaWeb.service';
import { ProductoSeccionService } from '../../../services/productoSeccion.service';
import { CuerpoModel, DESTINOS, DestinoCuerpo } from '../../../interfaces/cuerpoModel';
import { contrasteEntre } from '../../../interfaces/inicioModel';

import { CampoTextoComponent } from '../../../../../components/campos/campoTexto/campoTexto.component';
import { CampoTextoAreaComponent } from '../../../../../components/campos/campoTextoArea/campoTextoArea.component';
import { CheckboxComponent } from '../../../../../components/campos/checkbox/checkbox.component';
import { ComboComponent } from '../../../../../components/campos/combo/combo.component';
import { CampoColorComponent } from '../../../../../components/campos/campoColor/campoColor.component';

/** Una categoría o una marca, ya aplanada para el desplegable. */
interface Opcion { id: number; nombre: string; }

/** Un escaparate de «Productos por sección», con lo que hace falta decir de él. */
interface OpcionEscaparate extends Opcion { etiqueta: string; }

/**
 * UN CUERPO DE LA TIENDA: crear y modificar, en el mismo diálogo.
 *
 * LA DIRECCIÓN ES LO QUE SE VE EN LA BARRA del navegador, así que se escribe
 * y se enseña entera mientras se escribe. Se propone sola a partir del
 * nombre, y deja de proponerse en cuanto se toca: «Línea Blanca» da
 * «linea-blanca», que es lo que se quiere el 90% de las veces, pero quien
 * necesite otra la escribe y nadie se la cambia después.
 *
 * A QUÉ APUNTA ES LO QUE HACE QUE LOS ENLACES SALGAN SOLOS. Si el cuerpo dice
 * «yo soy la categoría Movilidad», el clic en Movilidad —en el menú, en las
 * destacadas, en el mosaico— lleva aquí en vez de al catálogo filtrado, sin
 * tener que enlazarlo a mano en cada sitio.
 *
 * EL PRINCIPAL NO APUNTA A NADA Y NO SE APAGA: es la entrada de la tienda. Se
 * dice en la pantalla y además lo prohíbe la base, así que aquí se esconden
 * los dos campos en vez de enseñarlos y rechazarlos luego.
 *
 * QUÉ PRODUCTOS ENSEÑA, y que no haya que acordarse después:
 *
 *  · Apuntando a una categoría o a una marca, el CATÁLOGO nace ENCENDIDO: una
 *    página de «Línea Blanca» sin un solo producto de línea blanca no es lo
 *    que nadie quería, y hasta el 15/11/2026 había que acordarse de bajar
 *    hasta la casilla. Se puede apagar, y apagarlo no borra lo que se le haya
 *    puesto a esa sección.
 *  · Sin categoría ni marca no hay nada que filtrar, así que ahí lo que se
 *    ofrece es un ESCAPARATE —una lista armada a mano en «Productos por
 *    sección»— con el que la página nace. Sólo al crearla: después, los
 *    escaparates se ponen y se quitan en el editor de la página, y tenerlo en
 *    dos sitios es tener dos sitios donde mirar.
 *
 * EL CATÁLOGO DE UNA PÁGINA SUELTA es el catálogo ENTERO, no uno filtrado: es
 * lo que es /shop, que es una página suelta con su catálogo encendido. Por eso
 * la casilla sale también ahí y no sólo con categoría o marca: esconderla hacía
 * que guardar /shop desde este formulario apagara su catálogo sin avisar.
 */
@Component({
  selector: 'app-saveCuerpo',
  templateUrl: './saveCuerpo.component.html',
  styleUrls: ['./saveCuerpo.component.css'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    CommonModule, ReactiveFormsModule,
    CampoTextoComponent, CampoTextoAreaComponent, CheckboxComponent, ComboComponent, CampoColorComponent,
  ],
})
export class SaveCuerpoComponent implements OnInit {

  /** El que se modifica; sin él, se crea. */
  @Input() cuerpo: CuerpoModel | null = null;

  /**
   * A qué apunta uno NUEVO, ya elegido.
   *
   * Lo manda quien llega desde «Categorías de la tienda» o «Marcas de la
   * tienda» con su botón «Hacerle una página»: allí ya se sabe de qué
   * categoría se habla, y volver a buscarla en el desplegable es pedir que se
   * equivoque de rama.
   */
  @Input() categoriaInicial: number | null = null;
  @Input() marcaInicial: number | null = null;

  public form!: FormGroup;
  public guardando = false;

  public readonly destinos = DESTINOS;
  /** Campos y no getters: con `[items]` de un getter, ng-select pierde lo elegido. */
  public categorias: Opcion[] = [];
  public marcas: Opcion[] = [];
  /** Los de «Productos por sección», para que la página pueda nacer con uno. */
  public escaparates: OpcionEscaparate[] = [];
  public cargandoListas = true;

  /**
   * Mientras no se toque la casilla del catálogo, la pone el destino.
   *
   * Es lo mismo que hace la dirección con el nombre: se propone sola hasta que
   * alguien decide. Quien apaga el catálogo y luego cambia de categoría no
   * quiere que se le vuelva a encender a su espalda.
   */
  private catalogoAMano = false;

  /** Mientras no se toque, la dirección se propone del nombre. */
  private rutaAMano = false;

  private fb = inject(FormBuilder);
  private _cuerpoService = inject(CuerpoService);
  private _categoriaService = inject(CategoriaWebService);
  private _marcaService = inject(MarcaWebService);
  private _seccionService = inject(ProductoSeccionService);
  private _toastr = inject(ToastrService);
  public activeModal = inject(NgbActiveModal);

  get esNuevo(): boolean { return this.cuerpo === null; }
  get esPrincipal(): boolean { return this.cuerpo?.principal === true; }

  get titulo(): string {
    if (this.esNuevo) { return 'Nuevo cuerpo'; }
    return this.esPrincipal ? 'El cuerpo principal' : 'Modificar cuerpo';
  }

  get ctrlCatalogo(): FormControl { return this.form.controls['catalogo'] as FormControl; }
  get ctrlActivo(): FormControl { return this.form.controls['activo'] as FormControl; }

  // ================================================================
  // QUÉ PRODUCTOS ENSEÑA
  // ================================================================

  /** El nombre de a lo que apunta, para decirlo en la casilla. */
  get nombreDelDestino(): string {
    if (this.destino === 'categoria') {
      const id = this.form?.value?.categoria_id;
      return (this.categorias.find(c => c.id === id)?.nombre ?? '').trim();
    }
    if (this.destino === 'marca') {
      const id = this.form?.value?.marca_id;
      return (this.marcas.find(m => m.id === id)?.nombre ?? '').trim();
    }
    return '';
  }

  /** Lo que dice la casilla, que no es lo mismo con categoría que sin ella. */
  get rotuloCatalogo(): string {
    const encendido = this.ctrlCatalogo?.value === true;

    if (this.destino === 'libre') {
      return encendido ? 'Enseña el catálogo entero de la tienda'
                       : 'Sin catálogo: sólo las secciones';
    }

    const nombre = this.nombreDelDestino;
    if (!encendido) { return 'Sin productos: sólo las secciones'; }
    return nombre ? 'Enseña todos los productos de «' + nombre + '»'
                  : 'Enseña todos sus productos';
  }

  /** El escaparate sólo se ofrece al crear una página suelta. */
  get ofreceEscaparate(): boolean {
    return this.esNuevo && this.destino === 'libre';
  }

  /** Alguien tocó la casilla: a partir de ahí manda él, no el destino. */
  catalogoTocado(): void { this.catalogoAMano = true; }

  get destino(): DestinoCuerpo {
    return (this.form?.value?.destino ?? 'libre') as DestinoCuerpo;
  }

  /** La dirección entera, como se va a ver. */
  get direccion(): string {
    if (this.esPrincipal) { return '/'; }
    const ruta = (this.form?.value?.ruta ?? '').toString().trim();
    return ruta ? '/' + ruta : '/…';
  }

  /** Lo que hace el destino elegido, para decirlo debajo. */
  get ayudaDestino(): string {
    return this.destinos.find(d => d.valor === this.destino)?.ayuda ?? '';
  }

  // ================================================================
  // EL FONDO DE LA PÁGINA
  // ================================================================
  //
  // ES DE ESTA PÁGINA, NO DE LA TIENDA: el rojo de los botones y del
  // encabezado se elige una sola vez en «Encabezado» y vale para todas. Aquí
  // se cambia el papel sobre el que se pinta ESTA, que hasta hoy era blanco.
  //
  // UN FONDO OSCURO NO SE PROHÍBE, SE AVISA. Los rótulos de las secciones se
  // escriben en negro, así que sobre un fondo oscuro desaparecen; pero puede
  // ser justo lo que se busca para una campaña, y entonces se le pone a cada
  // rótulo su color. Lo mismo que hace el color del rótulo en las secciones.

  /** Fondos que se ven bien, para no tener que buscarlos. */
  public readonly paletaFondo = ['#f7f7f7', '#f8f5ef', '#eef4ff', '#f1f7f1', '#fdf2f2', '#1d1d1f'];

  /** El color del texto de la tienda: es contra el que tiene que leerse el fondo. */
  private readonly NEGRO_TIENDA = '#1d1d1f';

  get fondoElegido(): string {
    return (this.form?.value?.fondo ?? '').toString().trim();
  }

  get hayFondoPropio(): boolean { return this.fondoElegido !== ''; }

  /** El que se va a ver: el elegido, o el blanco de siempre. */
  get fondoQueSeVe(): string { return this.fondoElegido || '#ffffff'; }

  ponerFondo(color: string): void {
    this.form.patchValue({ fondo: (color ?? '').trim() });
    this.form.markAsDirty();
  }

  get contrasteFondo(): number {
    return contrasteEntre(this.fondoQueSeVe, this.NEGRO_TIENDA);
  }

  /** Como se escribe aquí: con coma. */
  get contrasteTexto(): string {
    return this.contrasteFondo.toFixed(1).replace('.', ',');
  }

  /** Con menos de 4,5:1 los rótulos en negro no se leen encima. */
  get fondoIlegible(): boolean { return this.contrasteFondo < 4.5; }

  ngOnInit(): void {
    const c = this.cuerpo;

    // Uno nuevo que llega con su categoría o su marca ya elegida nace
    // apuntando ahí; si no, a una categoría, que es lo más habitual
    const destino: DestinoCuerpo = c
      ? (c.destino === 'inicio' ? 'libre' : c.destino)
      : this.marcaInicial ? 'marca' : 'categoria';

    this.form = this.fb.group({
      nombre:       [c?.nombre ?? '', [Validators.required, Validators.maxLength(100)]],
      ruta:         [c?.ruta ?? '',   [Validators.required, Validators.maxLength(60)]],
      destino:      [destino],
      categoria_id: [c?.categoria_id ?? this.categoriaInicial ?? null],
      marca_id:     [c?.marca_id ?? this.marcaInicial ?? null],
      titulo:       [c?.titulo ?? '', [Validators.maxLength(120)]],
      descripcion:  [c?.descripcion ?? '', [Validators.maxLength(4000)]],
      // El fondo de ESTA página; vacío, blanco
      fondo:        [c?.fondo ?? ''],
      // UNA PÁGINA NUEVA DE UNA CATEGORÍA O DE UNA MARCA NACE CON SUS
      // PRODUCTOS: es a lo que va. Una suelta no, que ahí el catálogo es el
      // entero y eso se pide a propósito
      catalogo:     [c?.catalogo ?? (destino !== 'libre')],
      // Con el que nace, si se elige. Sólo al crear una página suelta
      escaparate_id: [null],
      activo:       [c?.activo ?? true],
    });

    // Modificando, la dirección ya está puesta: no se toca sola
    this.rutaAMano = !this.esNuevo;

    // Escribir el nombre propone la dirección, hasta que se toque la
    // dirección. `dirty` es lo que distingue teclearla de ponerla aquí:
    // `patchValue` no marca el control, y el campo del formulario sí.
    this.form.controls['nombre'].valueChanges.subscribe((nombre: string) => {
      if (this.rutaAMano || this.form.controls['ruta'].dirty) { return; }
      this.form.controls['ruta'].setValue(this.comoDireccion(nombre ?? ''),
                                          { emitEvent: false });
    });

    this.cargarListas();
  }

  /**
   * Las categorías y las marcas de la TIENDA, no las del catálogo entero.
   *
   * Amarrar un cuerpo a una categoría que la tienda no enseña sería hacer una
   * página a la que nadie puede llegar.
   */
  private async cargarListas(): Promise<void> {
    try {
      // Los escaparates sólo hacen falta al crear: es cuando se ofrecen
      const [cats, marcas, escaparates]: any[] = await Promise.all([
        firstValueFrom(this._categoriaService.allCategoriasWeb()),
        firstValueFrom(this._marcaService.allMarcasWeb()),
        this.esNuevo ? firstValueFrom(this._seccionService.allSecciones()) : Promise.resolve(null),
      ]);

      // El árbol llega plano y en su orden: la sangría de `nivel` es lo que
      // permite distinguir «Refrigeración» de Línea Blanca de la de Vehículos
      this.categorias = (cats?.data ?? [])
        .filter((c: any) => c.estado === 'visible')
        .map((c: any) => ({
          id: c.id,
          nombre: ' '.repeat(Math.max(0, ((c.nivel ?? 1) - 1) * 4)) + c.nombre,
        }));

      this.marcas = (marcas?.data ?? [])
        .filter((m: any) => !m.oculta && m.activo)
        .map((m: any) => ({ id: m.id, nombre: m.nombre }));

      // Con cuántos productos tiene cada uno y si está apagado: uno vacío se
      // puede elegir, pero la tienda se lo salta y no se vería nada
      this.escaparates = (escaparates?.data ?? []).map((s: any) => ({
        id: s.id,
        nombre: s.nombre,
        etiqueta: s.nombre
          + ' · ' + ((s.productos ?? 0) === 1 ? '1 producto' : (s.productos ?? 0) + ' productos')
          + (s.visible === false ? ' · apagado' : ''),
      }));

      this.proponerNombre();

    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudieron cargar las categorías y las marcas',
                         'Error', { timeOut: 15000, closeButton: true });
    } finally {
      this.cargandoListas = false;
    }
  }

  /**
   * Llegando desde una categoría o una marca, el nombre se propone solo.
   *
   * Quien pulsa «Hacerle una página» en Movilidad quiere una página de
   * Movilidad: escribirlo otra vez —y la dirección detrás— es trabajo que ya
   * estaba hecho. Se puede cambiar antes de guardar.
   */
  private proponerNombre(): void {
    if (!this.esNuevo || this.form.value.nombre) { return; }

    const lista = this.marcaInicial ? this.marcas : this.categorias;
    const id = this.marcaInicial ?? this.categoriaInicial;
    if (!id) { return; }

    // De las categorías se quita la sangría del desplegable
    const nombre = (lista.find(o => o.id === id)?.nombre ?? '').replace(/ /g, '').trim();
    if (!nombre) { return; }

    this.form.patchValue({ nombre });
    this.form.controls['ruta'].setValue(this.comoDireccion(nombre), { emitEvent: false });
  }

  /** «Línea Blanca» → «linea-blanca». Sin tildes, ni mayúsculas, ni espacios. */
  private comoDireccion(texto: string): string {
    return texto.toString()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')   // fuera las tildes
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
  }

  ponerDestino(valor: DestinoCuerpo): void {
    this.form.patchValue({ destino: valor });

    // Mientras nadie haya tocado la casilla, la pone el destino: con categoría
    // o con marca, encendida. Es lo mismo que hace la dirección con el nombre
    if (this.esNuevo && !this.catalogoAMano) {
      this.ctrlCatalogo.setValue(valor !== 'libre');
    }

    this.form.markAsDirty();
  }

  async guardar(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.guardando) { return; }

    const v = this.form.value;
    const destino: DestinoCuerpo = this.esPrincipal ? 'libre' : v.destino;

    if (destino === 'categoria' && !v.categoria_id) {
      this._toastr.warning('Elige la categoría a la que apunta', 'Falta algo');
      return;
    }
    if (destino === 'marca' && !v.marca_id) {
      this._toastr.warning('Elige la marca a la que apunta', 'Falta algo');
      return;
    }

    const payload: any = {
      nombre:       (v.nombre ?? '').trim(),
      ruta:         this.comoDireccion(v.ruta ?? ''),
      // Una u otra, nunca las dos: lo que no es el destino elegido se manda
      // vacío a propósito, para que cambiar de destino lo suelte de verdad
      categoria_id: destino === 'categoria' ? v.categoria_id : null,
      marca_id:     destino === 'marca'     ? v.marca_id     : null,
      titulo:       (v.titulo ?? '').trim() || null,
      descripcion:  (v.descripcion ?? '').trim() || null,
      // Vacío es blanco: el que no elige nada no cambia nada
      fondo:        (v.fondo ?? '').trim() || null,
      // En una página suelta el catálogo es el ENTERO, que es lo que es
      // /shop: por eso se manda lo que diga la casilla y no un false fijo,
      // que apagaba el catálogo de /shop con sólo abrir y guardar
      catalogo:     v.catalogo === true,
      // El escaparate con el que nace. Sólo al crear una página suelta: en una
      // que ya existe, los escaparates se ponen en el editor de la página
      escaparate_id: this.ofreceEscaparate ? (v.escaparate_id ?? null) : null,
      activo:       this.esPrincipal ? true : v.activo !== false,
    };

    this.guardando = true;
    try {
      const res: any = await firstValueFrom(this.esNuevo
        ? this._cuerpoService.addCuerpo(payload)
        : this._cuerpoService.editCuerpo(this.cuerpo!.id, payload));

      this._toastr.success(res?.message ?? 'Guardado', 'Listo');
      // Vuelve el cuerpo entero: la pantalla lo pinta tal cual
      this.activeModal.close(res?.data ?? true);

    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo guardar', 'Error',
                         { timeOut: 20000, closeButton: true });
    } finally {
      this.guardando = false;
    }
  }
}
