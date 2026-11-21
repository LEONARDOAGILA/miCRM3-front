import {
  Component, ElementRef, HostListener, OnInit, ViewChild, inject, ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  FormArray, FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators,
} from '@angular/forms';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';
import { AgGridAngular, AgGridModule } from 'ag-grid-angular';
import { CellClickedEvent, GridApi, GridReadyEvent } from 'ag-grid-community';

import { SeguridadService } from '../../../../seguridad/services/seguridad.service';
import { AccesoModel } from '../../../../seguridad/interfaces/accesoModel';
import { EncabezadoService } from '../../../services/encabezado.service';
import { BotonFranja, EncabezadoDeLaLista, EncabezadoModel, EnlaceEncabezadoModel } from '../../../interfaces/encabezadoModel';
import { COLOR_TIENDA, FUENTES_ROTULO, contrasteEntre, esColorClaro, tonosDelColor } from '../../../interfaces/inicioModel';

import { PanelComponent } from '../../../../../components/panel/panel.component';
import { CampoColorComponent } from '../../../../../components/campos/campoColor/campoColor.component';
import { CampoTextoComponent } from '../../../../../components/campos/campoTexto/campoTexto.component';
import { CheckboxComponent } from '../../../../../components/campos/checkbox/checkbox.component';
import { CampoBusquedaComponent } from '../../../../../components/campos/campoBusqueda/campoBusqueda.component';
import { svgDeIconoTienda } from '../../../../../components/campos/campoIconoTienda/iconoTienda.component';
import { ActionButtonsComponent } from '../../../../../components/botones/action-buttons/action-buttons.component';
import { FilasEstirablesDirective } from '../../../../../core/directives/filasEstirables.directive';
import { AppAgGridService } from '../../../../../service/app-agGrid.service';
import { SaveEnlaceEncabezadoComponent } from '../saveEnlaceEncabezado/saveEnlaceEncabezado.component';
import { PapeleraEncabezadoComponent } from '../papeleraEncabezado/papeleraEncabezado.component';

/**
 * LAS PARTES DEL BOCETO QUE SE PUEDEN TOCAR.
 *
 * Cada una abre su mando debajo de la previa. Son las partes que se VEN en
 * la tienda: lo que no se ve —el nombre y las fechas— no tiene pieza y vive
 * en la cabecera, siempre a la vista.
 */
export type PiezaEncabezado =
  | 'franja'          // su fondo, su tamaño y su letra (y encenderla)
  | 'franjaTexto'     // el texto y su color
  | 'franjaDestacado' // lo resaltado y su color
  | 'franjaBotones'   // los botones, su URL y sus dos colores
  | 'logo'            // subirlo o quitarlo
  | 'buscador'        // las frases que van rotando
  | 'filaLogo'        // el fondo y la letra de esa fila
  | 'tienda'          // el color de TODA la tienda
  | 'menu'            // la letra de TODA la barra
  | 'menuEnlace'      // y la de UN enlace suyo, si tiene que destacar
  | 'desplegable';    // el panel que se abre al pulsarlos

/**
 * EL ENCABEZADO DE LA TIENDA (ecommerce.encabezado + encabezado_enlaces).
 *
 * Es lo primero que ve cualquiera que entre, y lo que más se toca: la franja
 * de arriba cambia con cada promoción.
 *
 * DOS PESTAÑAS porque son dos cosas con ritmos distintos:
 *
 *  · CONTENIDO —la franja, el aviso de crédito y las frases del buscador— se
 *    edita como un formulario y se guarda con un botón: son textos que se
 *    revisan juntos antes de publicarlos.
 *  · MENÚ se guarda AL MOMENTO, acción por acción, porque es una lista que se
 *    arrastra: un botón de guardar encima de un arrastre obliga a recordar
 *    que había que darle, y se pierde el orden a la primera.
 *
 * EL ÁRBOL ES DE DOS NIVELES Y NO MÁS: un menú de tres no se puede usar en un
 * móvil y la tienda no sabría pintarlo. Se arrastra dentro de cada nivel; para
 * mover un enlace de un desplegable a otro hay que borrarlo y volver a
 * crearlo, que es lo que hacía el CRM viejo y pasa una vez al año.
 *
 * TODAS LAS LLAMADAS DEVUELVEN EL ENCABEZADO ENTERO y la pantalla lo pinta tal
 * cual. No se toca el array a mano después de guardar: cualquier cambio puede
 * mover el orden de otras ramas, y recomponerlo aquí es como se acaban viendo
 * dos cosas distintas en la pantalla y en la tienda.
 */
@Component({
  selector: 'app-editEncabezado',
  templateUrl: './editEncabezado.component.html',
  styleUrls: ['./editEncabezado.component.css'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    // FormsModule ADEMÁS de ReactiveFormsModule: el nombre del encabezado nuevo
    // y el buscador de la lista son [(ngModel)] sueltos, sin formulario detrás.
    // Sin él NO falla al compilar —NgControlStatus, que viene con el reactivo,
    // casa con [ngModel]— y revienta al pintar con NG0201: el bloque se queda
    // vacío y parece que el botón no hace nada
    CommonModule, RouterLink, FormsModule, ReactiveFormsModule, AgGridModule, FilasEstirablesDirective,
    PanelComponent, CampoColorComponent, CampoTextoComponent, CheckboxComponent,
    CampoBusquedaComponent,
  ],
})
export class EditEncabezadoComponent implements OnInit {

  public titulo = 'Encabezado de la tienda';
  public accesoModel!: AccesoModel;

  public modelo: EncabezadoModel | null = null;
  public form!: FormGroup;

  public cargando = true;
  public guardando = false;
  public trabajando = false;

  // ================================================================
  // EL TABLERO: DOS COLUMNAS
  // ================================================================
  //
  // A la izquierda los encabezados y en el centro el que se está editando.
  // La lista se pliega a una tira: en una pantalla de portátil, el boceto
  // agradece el ancho.
  //
  // HUBO UNA TERCERA, «Estilos», con siete paneles. Se fue el 20/11/2026:
  // todo lo que tenía se ve en el boceto, y buscar en cuál de los siete
  // paneles estaba el color de un texto era más trabajo que pulsar el texto.

  public listaPlegada = false;

  /** Qué se mira en el centro: la previa o el menú (que es uno solo). */
  public vistaCentro: 'previa' | 'menu' = 'previa';

  /** Para encontrar uno cuando ya hay quince campañas. */
  public buscarHeader = '';

  get encabezadosFiltrados(): EncabezadoDeLaLista[] {
    const busca = this.buscarHeader.trim().toLowerCase();
    return busca
      ? this.encabezados.filter(e => e.nombre.toLowerCase().includes(busca))
      : this.encabezados;
  }

  /**
   * LOS ENLACES QUE SALEN EN LA PREVIA: los de la barra, nada más.
   *
   * Los de dentro de un desplegable no se pintan en la barra, así que
   * enseñarlos aquí dibujaría una barra que la tienda no tiene. Los
   * apagados y los que están fuera de fecha tampoco: la previa enseña lo
   * que va a ver el cliente, no lo que hay guardado.
   */
  get enlacesDeLaPrevia(): EnlaceEncabezadoModel[] {
    return this.enlaces.filter(e => e.padre_id === null && e.estado === 'visible').slice(0, 6);
  }


  private _encabezadoService = inject(EncabezadoService);
  private _seguridadService = inject(SeguridadService);
  private _toastr = inject(ToastrService);
  private modal = inject(NgbModal);
  private fb = inject(FormBuilder);
  private activeRoute = inject(ActivatedRoute);
  /** Para encontrar los botones que pinta ag-Grid sin salir de esta pantalla. */
  private host: ElementRef<HTMLElement> = inject(ElementRef);
  public _appAgGridService = inject(AppAgGridService);

  get puedeEditar(): boolean { return this.accesoModel?.editar === true; }
  get puedeCrear(): boolean { return this.accesoModel?.crear === true; }
  get puedeEliminar(): boolean { return this.accesoModel?.eliminar === true; }
  get puedeVaciar(): boolean { return this.accesoModel?.vaciar === true; }

  get enlaces(): EnlaceEncabezadoModel[] { return this.modelo?.enlaces ?? []; }

  get barra(): FormGroup { return this.form.controls['barra_superior'] as FormGroup; }
  get frases(): FormArray { return this.form.controls['buscador_frases'] as FormArray; }
  get botones(): FormArray { return this.barra.controls['botones'] as FormArray; }
  get pintaEnlaces(): FormGroup { return this.form.controls['menu_enlaces'] as FormGroup; }

  // ================================================================
  // EL COLOR DE LA TIENDA
  // ================================================================
  //
  // NO ES SÓLO DEL ENCABEZADO: la barra de categorías, los botones, los
  // carteles de descuento, los círculos de las categorías, las flechas y el
  // pie leen la misma variable de la tienda (`--ae-rojo`). Por eso se elige
  // UNO y cambia todo a la vez, en vez de ir color por color y acabar con la
  // barra de un tono y los botones de otro.
  //
  // UN SOLO COLOR Y NO TRES: el del mouse encima y el de los fondos suaves
  // salen de él con la misma cuenta que hace la tienda (`tonosDelColor`).
  //
  // SE AVISA, NO SE PROHÍBE, igual que con los botones del inicio: la letra de
  // la barra y de los botones es BLANCA y está escrita en la hoja de estilos
  // de la tienda, así que un color claro la deja sin leerse. Puede ser justo
  // el color de la marca, y quien administra está mirando la muestra de al
  // lado; pero un texto que no se lee es un fallo que ve el cliente.

  /** El de siempre, el que usa la tienda cuando nadie ha elegido ninguno. */
  public readonly colorDeFabrica = COLOR_TIENDA;

  /** Colores de arranque: el de la casa y cinco que sí aguantan letra blanca. */
  public readonly paletaTienda = [COLOR_TIENDA, '#0A58CA', '#0F766E', '#7C3AED', '#B45309', '#1D1D1F'];

  // ===== Los desplegables de la barra =====
  //
  // El fondo del panel y su letra, para los tres iguales. De fábrica, blanco
  // con la letra de siempre, que es lo que hay en la hoja de estilos.
  public readonly MENU_FONDO_FABRICA = '#ffffff';
  public readonly MENU_TEXTO_FABRICA = '#1d1d1f';

  /** Fondos de arranque: el blanco, dos grises de papel y tres oscuros. */
  public readonly paletaMenuFondo = ['#ffffff', '#f7f7f7', '#1d1d1f', '#102a43', '#0f3d3a', '#2b1b3d'];
  /** Y letras: la de siempre, blanca y cuatro tonos que se leen sobre fondo claro. */
  public readonly paletaMenuTexto = ['#1d1d1f', '#ffffff', '#374151', '#0a58ca', '#0f766e', '#7c3aed'];

  get ctrlMenuFondo(): FormControl { return this.form.controls['desplegable_fondo'] as FormControl; }
  get ctrlMenuTexto(): FormControl { return this.form.controls['desplegable_texto'] as FormControl; }

  get hayMenuFondoPropio(): boolean { return !!(this.ctrlMenuFondo?.value ?? ''); }
  get hayMenuTextoPropio(): boolean { return !!(this.ctrlMenuTexto?.value ?? ''); }

  get menuFondoQueSeVe(): string { return (this.ctrlMenuFondo?.value ?? '') || this.MENU_FONDO_FABRICA; }
  get menuTextoQueSeVe(): string { return (this.ctrlMenuTexto?.value ?? '') || this.MENU_TEXTO_FABRICA; }

  ponerMenuFondo(color: string): void {
    if (!this.puedeEditar) { return; }
    this.ctrlMenuFondo.setValue(color || '');
    this.ctrlMenuFondo.markAsDirty();
  }

  ponerMenuTexto(color: string): void {
    if (!this.puedeEditar) { return; }
    this.ctrlMenuTexto.setValue(color || '');
    this.ctrlMenuTexto.markAsDirty();
  }

  /** Cuánto contrasta la letra elegida sobre el fondo elegido (WCAG, de 1 a 21). */
  get contrasteMenu(): number { return contrasteEntre(this.menuFondoQueSeVe, this.menuTextoQueSeVe); }

  get contrasteMenuTexto(): string { return this.contrasteMenu.toFixed(1).replace('.', ','); }

  /** Por debajo del 4,5:1 de la WCAG el nombre de una categoría no se lee. */
  get menuIlegible(): boolean { return this.contrasteMenu < 4.5; }

  // ================================================================
  // LOS COLORES DEL ENCABEZADO
  // ================================================================
  //
  // DOS FRANJAS, cada una con su fondo y su letra: la DE ARRIBA —la del aviso—
  // y la DEL LOGO con el buscador. Son dos y no una porque se usan para cosas
  // distintas: la de arriba es una cinta de promoción, que es donde apetece un
  // color fuerte, y la del logo es la que tiene que dejar leer el buscador.
  //
  // LA BARRA ROJA NO ESTÁ AQUÍ: ésa va del color de la tienda, que la pinta
  // junto con los botones y el pie.
  //
  // CUATRO COLORES, UNOS CUANTOS CAMPOS IGUALES: en vez de ocho getters
  // copiados, los campos se piden por su nombre. Así añadir un color es una
  // línea en la lista de abajo y no cuatro métodos más.
  //
  // LO QUE NO SIGUE A ESTOS COLORES: la caja de buscar es una píldora gris con
  // su propio fondo, el círculo de la cuenta es blanco y el carrito va del
  // color de la tienda. Los tres se leen igual sobre un encabezado claro y
  // sobre uno oscuro; teñirlos dejaría la caja de buscar invisible en la mitad
  // de los casos. La píldora del aviso sí se da la vuelta sola en la tienda
  // cuando la franja es oscura, porque es negra y desaparecería.

  /** Los de fábrica, los que tiene escritos la hoja de estilos de la tienda. */
  public readonly coloresDeFabrica: Record<string, string> = {
    franja_fondo:     '#ffffff',
    franja_texto:     '#374151',
    // Los tres de dentro de la franja: el destacado va con el color de la
    // tienda, y la píldora, negra sobre claro (la tienda la da la vuelta sola
    // cuando la franja es oscura)
    franja_destacado:   COLOR_TIENDA,
    franja_boton_fondo: '#1d1d1f',
    franja_boton_texto: '#ffffff',
    encabezado_fondo: '#ffffff',
    encabezado_texto: '#1d1d1f',
    // El menú: su letra es blanca en la hoja de estilos de la tienda. El
    // fondo no está aquí porque no se elige: la barra va del color de la
    // tienda, junto con los botones y el pie.
    menu_texto: '#ffffff',
  };

  /** Fondos de arranque: el blanco, un gris de papel, tres oscuros y un crema. */
  public readonly paletaFondoEncabezado = ['#ffffff', '#f7f7f7', '#1d1d1f', '#102a43', '#0f3d3a', '#fdf6e3'];
  /** Y letras: la de siempre, la de los títulos, blanca y tres tonos oscuros. */
  public readonly paletaLetraEncabezado = ['#374151', '#1d1d1f', '#ffffff', '#0a58ca', '#0f766e', '#7c2d12'];

  ctrlColorDe(campo: string): FormControl { return this.form.controls[campo] as FormControl; }

  hayColorPropioDe(campo: string): boolean { return !!(this.ctrlColorDe(campo)?.value ?? ''); }

  /** El que se va a ver: el elegido, o el de fábrica. */
  colorQueSeVeDe(campo: string): string {
    return (this.ctrlColorDe(campo)?.value ?? '') || this.coloresDeFabrica[campo];
  }

  ponerColorDe(campo: string, color: string): void {
    if (!this.puedeEditar) { return; }
    const control = this.ctrlColorDe(campo);
    control.setValue(color || '');
    control.markAsDirty();
  }

  /** Cuánto contrasta la letra de una franja sobre su propio fondo (WCAG, de 1 a 21). */
  contrasteDe(campoFondo: string, campoTexto: string): number {
    return contrasteEntre(this.colorQueSeVeDe(campoFondo), this.colorQueSeVeDe(campoTexto));
  }

  contrasteTextoDe(campoFondo: string, campoTexto: string): string {
    return this.contrasteDe(campoFondo, campoTexto).toFixed(1).replace('.', ',');
  }

  /** Por debajo del 4,5:1 de la WCAG ese texto no se lee. */
  ilegible(campoFondo: string, campoTexto: string): boolean {
    return this.contrasteDe(campoFondo, campoTexto) < 4.5;
  }

  /**
   * La píldora del botón de la franja: negra con letra blanca mientras la
   * franja sea clara, y al revés cuando es oscura.
   *
   * LA VUELTA LA DA LA TIENDA SOLA, no se guarda: una píldora negra sobre una
   * franja negra no se ve, y pedir un quinto color para eso sería un color más
   * que acertar. Aquí sale la misma cuenta para que la muestra no mienta.
   */
  get pildoraDeLaFranja(): { fondo: string; texto: string } {
    const fondo = this.colorQueSeVeDe('franja_fondo');
    return esColorClaro(fondo)
      ? { fondo: '#1d1d1f', texto: '#ffffff' }
      : { fondo: '#ffffff', texto: fondo };
  }

  // ================================================================
  // EL LOGO DE LA TIENDA
  // ================================================================
  //
  // Hasta el 14/11/2026 iba dibujado dentro de la tienda y cambiarlo era
  // cambiar código. Ahora se sube aquí.
  //
  // SE SUBE AL MOMENTO y no con «Guardar contenido»: es un fichero, vive en su
  // columna y no en el `config`, y aquel botón reescribe el `config` entero.
  //
  // QUITARLO NO DEJA LA TIENDA SIN MARCA: vuelve el que trae dibujado, así que
  // probar no cuesta nada.

  /** La dirección del que hay subido, o null para el de la tienda. */
  public logoUrl: string | null = null;
  public subiendoLogo = false;

  get hayLogo(): boolean { return !!this.logoUrl; }

  async elegirLogo(evento: Event): Promise<void> {
    const entrada = evento.target as HTMLInputElement;
    const archivo = entrada.files?.[0];
    // Se limpia siempre: sin esto, elegir DOS VECES el mismo fichero no
    // dispara el evento y parece que la pantalla se quedó colgada
    entrada.value = '';
    if (!archivo || this.subiendoLogo || !this.puedeEditar) { return; }

    this.subiendoLogo = true;
    try {
      const res: any = await firstValueFrom(this._encabezadoService.subirLogo(archivo, this.encabezadoId));
      this._toastr.success(res?.message ?? 'Logo guardado', 'Listo');
      this.recogerLogo(res);
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo subir el logo', 'Error',
                         { timeOut: 20000, closeButton: true });
    } finally {
      this.subiendoLogo = false;
    }
  }

  async quitarLogo(): Promise<void> {
    if (this.subiendoLogo || !this.hayLogo || !this.puedeEditar) { return; }
    if (!confirm('¿Quitar el logo? La tienda vuelve a enseñar el que trae dibujado.')) { return; }

    this.subiendoLogo = true;
    try {
      const res: any = await firstValueFrom(this._encabezadoService.quitarLogo(this.encabezadoId));
      this._toastr.success(res?.message ?? 'Logo quitado', 'Listo');
      this.recogerLogo(res);
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo quitar el logo', 'Error',
                         { timeOut: 20000, closeButton: true });
    } finally {
      this.subiendoLogo = false;
    }
  }

  /**
   * De la respuesta del logo, SÓLO el logo.
   *
   * Las dos puertas devuelven el encabezado entero, como todas, pero aquí no
   * se vuelve a pintar el formulario: quien sube un logo puede llevar un rato
   * cambiando los colores sin haberle dado a «Guardar contenido», y pintar lo
   * guardado le borraría lo que lleva escrito.
   */
  private recogerLogo(res: any): void {
    this.logoUrl = res?.data?.logo_url ?? null;
    if (this.modelo) {
      this.modelo.logo = res?.data?.logo ?? null;
      this.modelo.logo_url = this.logoUrl;
    }
  }

  get ctrlColor(): FormControl { return this.form.controls['color_principal'] as FormControl; }

  /** Lo elegido a mano, o vacío. */
  get colorElegido(): string { return (this.ctrlColor?.value ?? '').toString(); }

  get hayColorPropio(): boolean { return !!this.colorElegido; }

  /** El que se va a ver: el elegido o el de siempre. */
  get colorQueSeVe(): string { return this.colorElegido || COLOR_TIENDA; }

  /** Los dos que salen de él: el del mouse encima y el de los fondos suaves. */
  get tonos(): { oscuro: string; claro: string } { return tonosDelColor(this.colorQueSeVe); }

  ponerColor(color: string): void {
    if (!this.puedeEditar) { return; }
    this.ctrlColor.setValue(color || '');
    this.ctrlColor.markAsDirty();
  }

  /** Cuánto contrasta la letra blanca encima de ese color (WCAG, de 1 a 21). */
  get contrasteConBlanco(): number { return contrasteEntre(this.colorQueSeVe, '#ffffff'); }

  get contrasteTexto(): string { return this.contrasteConBlanco.toFixed(1).replace('.', ','); }

  /** Si la letra blanca no llega al 4,5:1 que pide la WCAG para texto normal. */
  get colorIlegible(): boolean { return this.contrasteConBlanco < 4.5; }

  get ctrlBarraActiva(): FormControl { return this.barra.controls['activo'] as FormControl; }

  /** Entre una y cinco: con ninguna el buscador se queda mudo; más no se ven. */
  get puedeAnadirFrase(): boolean { return this.puedeEditar && this.frases.length < 5; }
  get puedeQuitarFrase(): boolean { return this.puedeEditar && this.frases.length > 1; }

  /**
   * CUATRO BOTONES COMO MUCHO, y es el mismo límite que mira el servidor: la
   * franja es una línea, y en un teléfono cinco píldoras no caben. Ninguno
   * también vale: la franja es una frase y el botón es la excepción.
   */
  get puedeAnadirBoton(): boolean { return this.puedeEditar && this.botones.length < 4; }

  ngOnInit(): void {
    this.accesoModel = this.activeRoute.snapshot.data['access'];
    this.construirFormulario();
    this.construirRejilla();
    this.leerPlegados();      // el árbol se abre como se dejó
    this.cargar();
  }

  private construirFormulario(): void {
    this.form = this.fb.group({
      barra_superior: this.fb.group({
        activo:       [true],
        texto:        ['', [Validators.maxLength(80)]],
        destacado:    ['', [Validators.maxLength(60)]],
        // Los botones, hasta cuatro. Se llenan en `pintarFormulario`, como las
        // frases: son una lista y no un campo.
        botones:      this.fb.array([]),
      }),
      buscador_frases: this.fb.array([]),
      // El color de TODA la tienda. Vacío = el rojo de siempre
      color_principal: [''],
      // Los desplegables de la barra. Vacíos = blanco y la letra de siempre
      desplegable_fondo: [''],
      desplegable_texto: [''],
      // Y las dos franjas del encabezado, por lo mismo
      franja_fondo: [''],
      franja_destacado: [''],
      franja_boton_fondo: [''],
      franja_boton_texto: [''],
      // En píxeles, entre 8 y 48. Vacío = los 14 de la tienda
      franja_tamano: [null, [Validators.min(8), Validators.max(48)]],
      franja_fuente: ['titulos'],
      franja_texto: [''],
      // El menú: color, tamaño (en píxeles) y tipo de letra. El fondo no se
      // elige: la barra va del color de la tienda
      menu_texto: [''],
      menu_tamano: [null, [Validators.min(8), Validators.max(48)]],
      menu_fuente: [''],
      // Y LA PINTA DE CADA ENLACE, por id. Vacío casi siempre: un grupo se
      // crea la primera vez que se toca ese enlace, no al cargar, porque lo
      // normal es que ninguno lleve nada suyo.
      menu_enlaces: this.fb.group({}),
      encabezado_fondo: [''],
      encabezado_texto: [''],
    });
  }

  // ================================================================
  // CARGA
  // ================================================================

  /**
   * CUÁL SE ESTÁ EDITANDO. null mientras no ha llegado nada: entonces el
   * servidor manda el predeterminado, que es el que abre la pantalla.
   */
  public encabezadoId: number | null = null;

  /** Todos, para la tira de arriba. */
  public encabezados: EncabezadoDeLaLista[] = [];

  /** Si se está creando uno: el nombre que se está escribiendo, o null. */
  public nombreNuevo: string | null = null;

  async cargar(id?: number | null): Promise<void> {
    this.cargando = true;
    try {
      const res: any = await firstValueFrom(
        this._encabezadoService.getEncabezado(id === undefined ? this.encabezadoId : id));
      this.pintar(res?.data);
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo cargar el encabezado', 'Error',
                         { timeOut: 15000, closeButton: true });
    } finally {
      this.cargando = false;
    }
  }

  // ================================================================
  // LOS ENCABEZADOS DE CAMPAÑA
  // ================================================================
  //
  // Hay los que hagan falta, cada uno con sus fechas. El PREDETERMINADO es
  // el que se ve cuando no hay ninguna campaña en fecha; no se apaga ni se
  // borra, y aquí ni se ofrece: la base lo impide y repetir la regla en dos
  // sitios es la manera de que un día digan cosas distintas.

  /** Su nombre y sus fechas. La pinta va por su propio botón. */
  public datosForm: FormGroup = this.fb.group({
    nombre: ['', [Validators.required, Validators.maxLength(60)]],
    desde:  [''],
    hasta:  [''],
    activo: [true],
  });

  /** El de la tira que se está editando. */
  esElQueEdito(e: EncabezadoDeLaLista): boolean {
    return e.id === this.encabezadoId;
  }

  /** Cómo se lee su estado, con sus fechas. */
  cuandoSeVe(e: EncabezadoDeLaLista): string {
    if (!e.activo) { return 'Apagado'; }
    if (!e.desde && !e.hasta) { return e.principal ? 'Siempre, si no hay campaña' : 'Siempre'; }
    const desde = e.desde ? e.desde.replace('T', ' ') : null;
    const hasta = e.hasta ? e.hasta.replace('T', ' ') : null;
    if (desde && hasta) { return 'Del ' + desde + ' al ' + hasta; }
    return desde ? 'Desde el ' + desde : 'Hasta el ' + hasta;
  }

  /** Cambiar de encabezado: se piden sus cosas y se pinta. */
  async elegirEncabezado(e: EncabezadoDeLaLista): Promise<void> {
    if (e.id === this.encabezadoId || this.cargando) { return; }

    // Lo que haya a medio escribir en la pinta se perdería sin avisar
    if (this.form.dirty && !confirm('Tienes cambios sin guardar en este encabezado. ¿Cambiar de todas formas?')) {
      return;
    }

    await this.cargar(e.id);
  }

  /** Uno nuevo, copiando la pinta del que se está editando. */
  async crearEncabezado(): Promise<void> {
    if (this._seguridadService.isexpired() || !this.puedeCrear || this.trabajando) { return; }

    const nombre = (this.nombreNuevo ?? '').trim();
    if (!nombre) { return; }

    this.trabajando = true;
    try {
      const res: any = await firstValueFrom(
        this._encabezadoService.addEncabezado(nombre, this.encabezadoId));
      this._toastr.success(res?.message ?? 'Encabezado creado', 'Listo');
      this.nombreNuevo = null;
      this.pintar(res?.data);
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo crear el encabezado', 'Error',
                         { timeOut: 20000, closeButton: true });
    } finally {
      this.trabajando = false;
    }
  }

  /** Encenderlo o apagarlo desde la tira. */
  async alternarEncabezado(e: EncabezadoDeLaLista): Promise<void> {
    if (this._seguridadService.isexpired() || !this.puedeEditar || this.trabajando) { return; }

    this.trabajando = true;
    try {
      const res: any = await firstValueFrom(this._encabezadoService.activarEncabezado(e.id));
      this._toastr.success(res?.message ?? 'Listo', 'Listo');
      await this.cargar();
    } catch (err: any) {
      this._toastr.error(err?.error?.message ?? 'No se pudo cambiar el estado', 'Error',
                         { timeOut: 20000, closeButton: true });
    } finally {
      this.trabajando = false;
    }
  }

  /** Éste pasa a ser el predeterminado. */
  async hacerPredeterminado(e: EncabezadoDeLaLista): Promise<void> {
    if (this._seguridadService.isexpired() || !this.puedeEditar || this.trabajando || e.principal) { return; }

    if (!confirm('«' + e.nombre + '» pasará a ser el predeterminado: el que se ve cuando no hay '
                 + 'ninguna campaña en fecha. ¿Seguir?')) { return; }

    this.trabajando = true;
    try {
      const res: any = await firstValueFrom(this._encabezadoService.predeterminado(e.id));
      this._toastr.success(res?.message ?? 'Listo', 'Listo');
      await this.cargar();
    } catch (err: any) {
      this._toastr.error(err?.error?.message ?? 'No se pudo cambiar el predeterminado', 'Error',
                         { timeOut: 20000, closeButton: true });
    } finally {
      this.trabajando = false;
    }
  }

  async borrarEncabezado(e: EncabezadoDeLaLista): Promise<void> {
    if (this._seguridadService.isexpired() || !this.puedeEliminar || this.trabajando || e.principal) { return; }

    if (!confirm('¿Borrar «' + e.nombre + '»?' + String.fromCharCode(10) + String.fromCharCode(10)
                 + 'No hay papelera: sus colores y su logo se pierden. El menú no se toca, '
                 + 'que es uno solo para todos.')) { return; }

    this.trabajando = true;
    try {
      const res: any = await firstValueFrom(this._encabezadoService.deleteEncabezado(e.id));
      this._toastr.success(res?.message ?? 'Encabezado borrado', 'Listo');
      // Si se borró el que se estaba editando, el servidor devuelve el predeterminado
      this.encabezadoId = null;
      this.pintar(res?.data);
    } catch (err: any) {
      this._toastr.error(err?.error?.message ?? 'No se pudo borrar', 'Error',
                         { timeOut: 20000, closeButton: true });
    } finally {
      this.trabajando = false;
    }
  }

  // ---------- El tamaño y la letra de la franja ----------
  //
  // Las mismas cuatro letras que ofrece el rótulo de una sección de la
  // portada: quien eligió «deportiva» allá sabe lo que va a ver aquí. Los
  // píxeles no están: los pone la tienda.


  public readonly fuentesFranja = FUENTES_ROTULO;

  /** La letra elegida para la franja, para dibujarla en la previa. */
  fuenteDeLaFranja() {
    const elegida = this.form.controls['franja_fuente']?.value;
    return this.fuentesFranja.find(f => f.valor === elegida) ?? this.fuentesFranja[0];
  }

  /**
   * Y lo que mide: LOS PÍXELES DE VERDAD.
   *
   * La previa es más estrecha que la tienda, así que una frase larga con 30
   * px aquí se parte antes que allá; el tamaño de la letra, en cambio, es el
   * mismo, y es lo que se está eligiendo. Vacío o fuera de rango, los 14 de
   * la tienda.
   */
  tamanoDeLaFranja(): number {
    const px = Number(this.form.controls['franja_tamano']?.value);
    return Number.isFinite(px) && px >= 8 && px <= 48 ? px : 14;
  }

  /** La letra elegida para el menú, para dibujarlo en el boceto. */
  fuenteDelMenu() {
    const elegida = this.form.controls['menu_fuente']?.value;
    return this.fuentesFranja.find(f => f.valor === elegida) ?? this.fuentesFranja[0];
  }

  /** Y lo que mide: los píxeles de verdad. Vacío, los 12 de la tienda. */
  tamanoDelMenu(): number {
    const px = Number(this.form.controls['menu_tamano']?.value);
    return Number.isFinite(px) && px >= 8 && px <= 48 ? px : 12;
  }

  /** Lo que llega del servidor, al formulario y al árbol. */
  private pintar(data: any): void {
    if (!data) { return; }

    // LAS LLAMADAS DEL MENÚ DEVUELVEN SÓLO { enlaces }, y es a propósito: el
    // menú es uno solo y los encabezados son varios, así que repintar «el
    // encabezado» con lo que devuelve un enlace le cambiaría los colores a
    // quien está editando el de Navidad.
    if (!data.config) {
      this.modelo = { ...this.modelo, enlaces: data.enlaces ?? [] } as EncabezadoModel;
      this.refrescarArbol();
      return;
    }

    this.modelo = data;
    this.encabezadoId = data.id ?? null;
    this.encabezados = data.encabezados ?? [];

    // Su nombre y sus fechas, que van en su propio formulario: se guardan
    // con su botón y no con el de la pinta, porque son dos decisiones
    this.datosForm.patchValue({
      nombre: data.nombre ?? '',
      desde:  data.desde ?? '',
      hasta:  data.hasta ?? '',
      activo: data.activo !== false,
    }, { emitEvent: false });
    this.datosForm.markAsPristine();

    // El menú viene aplanado: la rejilla pinta las filas que no estén dentro
    // de una rama plegada
    this.refrescarArbol();

    const c = data.config ?? ({} as any);
    this.form.patchValue({
      barra_superior: {
        activo:       c.barra_superior?.activo !== false,
        texto:        c.barra_superior?.texto ?? '',
        destacado:    c.barra_superior?.destacado ?? '',
      },
      color_principal: c.color_principal ?? '',
      desplegable_fondo: c.desplegable_fondo ?? '',
      desplegable_texto: c.desplegable_texto ?? '',
      franja_fondo: c.franja_fondo ?? '',
      franja_destacado: c.franja_destacado ?? '',
      franja_boton_fondo: c.franja_boton_fondo ?? '',
      franja_boton_texto: c.franja_boton_texto ?? '',
      franja_tamano: c.franja_tamano ?? null,
      franja_fuente: c.franja_fuente ?? 'titulos',
      franja_texto: c.franja_texto ?? '',
      menu_texto: c.menu_texto ?? '',
      menu_tamano: c.menu_tamano ?? null,
      menu_fuente: c.menu_fuente ?? '',
      encabezado_fondo: c.encabezado_fondo ?? '',
      encabezado_texto: c.encabezado_texto ?? '',
    });

    // El logo no está en el `config`: va en su columna y la dirección la arma
    // el servidor
    this.logoUrl = data.logo_url ?? null;

    // LOS BOTONES, uno por grupo. Igual que las frases: `patchValue` no toca
    // una lista que no tiene los mismos elementos, hay que rehacerla.
    this.botones.clear();
    for (const b of (c.barra_superior?.botones ?? [])) {
      this.botones.push(this.grupoDeBoton(b));
    }

    this.frases.clear();
    for (const f of (c.buscador_frases ?? [])) {
      this.frases.push(this.fb.control(f, [Validators.required, Validators.maxLength(60)]));
    }
    if (this.frases.length === 0) { this.anadirFrase(); }

    // LA PINTA DE CADA ENLACE: se rehace entera. Los controles se llaman
    // como el id del enlace, así que los del encabezado anterior serían de
    // otra campaña.
    for (const clave of Object.keys(this.pintaEnlaces.controls)) {
      this.pintaEnlaces.removeControl(clave);
    }
    for (const [clave, p] of Object.entries((c.menu_enlaces ?? {}) as Record<string, any>)) {
      this.grupoNuevoDeEnlace(clave).patchValue({
        fondo:  p?.fondo ?? '',
        color:  p?.color ?? '',
        tamano: p?.tamano ?? null,
        fuente: p?.fuente ?? '',
      });
    }

    // Y si el enlace que se estaba tocando ya no está en la barra —se borró,
    // se apagó, se cambió de campaña—, el mando se cierra: estaría mandando
    // sobre algo que no se ve.
    if (this.pieza === 'menuEnlace'
        && !this.enlacesDeLaPrevia.some(e => e.id === this.enlaceTocado)) {
      this.cerrarPieza();
    }

    if (!this.puedeEditar) { this.form.disable(); }
  }

  // ================================================================
  // CONTENIDO
  // ================================================================

  anadirFrase(): void {
    if (this.frases.length >= 5) { return; }
    this.frases.push(this.fb.control('', [Validators.required, Validators.maxLength(60)]));
  }

  quitarFrase(indice: number): void {
    if (!this.puedeQuitarFrase) { return; }
    this.frases.removeAt(indice);
  }

  /** El control, no la posición: con track $index los campos enseñan el valor del vecino. */
  controlFrase(indice: number): FormControl { return this.frases.at(indice) as FormControl; }

  /**
   * UN BOTÓN DE LA FRANJA: lo que dice, a dónde lleva y su pinta.
   *
   * Los tres de la pinta vacíos —lo normal— y manda la de la franja. Se
   * llenan cuando uno tiene que destacar sobre los otros.
   */
  private grupoDeBoton(b: BotonFranja = {}): FormGroup {
    return this.fb.group({
      texto:  [b.texto ?? '', [Validators.maxLength(40)]],
      enlace: [b.enlace ?? '', [Validators.maxLength(250)]],
      fondo:  [b.fondo ?? ''],
      letra:  [b.letra ?? ''],
      tamano: [b.tamano ?? null, [Validators.min(8), Validators.max(48)]],
    });
  }

  /** El color de un botón, o el de la franja si no tiene el suyo. */
  colorDelBoton(indice: number, campo: 'fondo' | 'letra'): string {
    const propio = (this.grupoBoton(indice).controls[campo]?.value ?? '') as string;
    return propio || this.colorQueSeVeDe(campo === 'fondo' ? 'franja_boton_fondo' : 'franja_boton_texto');
  }

  hayColorPropioDelBoton(indice: number, campo: 'fondo' | 'letra'): boolean {
    return !!(this.grupoBoton(indice).controls[campo]?.value ?? '');
  }

  ponerColorDelBoton(indice: number, campo: 'fondo' | 'letra', color: string): void {
    if (!this.puedeEditar) { return; }
    const control = this.grupoBoton(indice).controls[campo];
    control.setValue(color || '');
    control.markAsDirty();
  }

  anadirBoton(): void {
    if (!this.puedeAnadirBoton) { return; }
    this.botones.push(this.grupoDeBoton());
  }

  quitarBoton(indice: number): void {
    if (!this.puedeEditar) { return; }
    this.botones.removeAt(indice);
  }

  /** El grupo, no la posición, por lo mismo que en las frases. */
  grupoBoton(indice: number): FormGroup { return this.botones.at(indice) as FormGroup; }

  // ================================================================
  // TOCAR EL BOCETO PARA CAMBIARLO
  // ================================================================
  //
  // EL BOCETO ES EL EDITOR. Se pulsa una parte y debajo sale su mando, con
  // lo suyo y nada más: el color del texto de la franja se elige pulsando
  // ese texto, no buscándolo entre siete paneles de una columna aparte.
  //
  // DEBAJO Y NO FLOTANDO ENCIMA: lo que se está mirando es justo lo que
  // taparía un cuadro flotante.
  //
  // Y EL MANDO LO LLEVA TODO, no es un atajo: desde que la columna de
  // estilos se fue, no hay otro sitio donde esté.

  /** Qué parte se está tocando, o null. */
  public pieza: PiezaEncabezado | null = null;

  /** Cómo se llama, para la cabecera del mando. */
  public piezaNombre = "";

  /** Abre (o cierra, si ya estaba) el mando de una parte. */
  tocar(cual: PiezaEncabezado, nombre: string): void {
    if (this.pieza === cual) { this.cerrarPieza(); return; }
    this.pieza = cual;
    this.piezaNombre = nombre;

    // El texto y el destacado se escriben EN el boceto: el campo aparece
    // donde estaba el texto y hay que llevarle el cursor, o habría que
    // pulsar dos veces para escribir en lo que se acaba de pulsar
    if (cual === 'franjaTexto' || cual === 'franjaDestacado') {
      setTimeout(() => {
        const campo = this.host.nativeElement.querySelector('.enc-previa__escribir') as HTMLInputElement | null;
        campo?.focus();
        campo?.select();
      });
    }
  }

  /**
   * QUÉ ENLACE DE LA BARRA se está tocando, o null.
   *
   * Va aparte de `pieza` porque la pieza es la misma para todos —son enlaces
   * de la misma barra— y lo que cambia es cuál.
   */
  public enlaceTocado: number | null = null;

  /**
   * SE PULSA UN ENLACE DE LA BARRA y abajo sale lo suyo: su color, su tamaño
   * y su letra, para cuando uno tiene que destacar sobre los de al lado.
   *
   * Pulsar OTRO con el mando abierto cambia de enlace en vez de cerrarlo,
   * que es lo que hace falta para ir comparando dos vecinos. Cerrar se
   * cierra pulsando el mismo otra vez, como el resto de piezas.
   */
  tocarEnlace(e: EnlaceEncabezadoModel): void {
    if (this.pieza === 'menuEnlace' && this.enlaceTocado === e.id) { this.cerrarPieza(); return; }
    this.grupoNuevoDeEnlace(String(e.id));   // la primera vez no existe todavía
    this.enlaceTocado = e.id;
    this.pieza = 'menuEnlace';
    this.piezaNombre = '«' + e.texto + '», en la barra';
  }

  /** Si ES ESE el enlace que se está tocando. */
  tocandoEnlace(id: number): boolean {
    return this.pieza === 'menuEnlace' && this.enlaceTocado === id;
  }

  /**
   * EL GRUPO DE UN ENLACE, creándolo si no estaba.
   *
   * SE LLAMA DESDE UN CLIC Y DESDE LA CARGA, nunca desde la plantilla: crear
   * un control mientras Angular pinta deja el formulario cambiando durante
   * su propia comprobación (NG0100). Para leer está `grupoEnlace`.
   */
  private grupoNuevoDeEnlace(clave: string): FormGroup {
    let grupo = this.pintaEnlaces.controls[clave] as FormGroup | undefined;
    if (!grupo) {
      grupo = this.fb.group({
        fondo:  [''],
        color:  [''],
        tamano: [null as number | null, [Validators.min(8), Validators.max(48)]],
        fuente: [''],
      });
      this.pintaEnlaces.addControl(clave, grupo);
      // El `disable()` de la carga no alcanza a los que nacen después
      if (!this.puedeEditar) { grupo.disable(); }
    }
    return grupo;
  }

  /** El de un enlace que ya se tocó: es el que lee el mando. */
  grupoEnlace(id: number): FormGroup {
    return this.pintaEnlaces.controls[String(id)] as FormGroup;
  }

  /** Lo que lleva puesto, sin crear nada: para el boceto. */
  private pintaDeEnlace(id: number): { fondo: string; color: string; tamano: number | null; fuente: string } {
    const p = (this.pintaEnlaces.getRawValue() as Record<string, any>)[String(id)] ?? {};
    return { fondo: p.fondo ?? '', color: p.color ?? '', tamano: p.tamano ?? null, fuente: p.fuente ?? '' };
  }

  /**
   * SI ESE ENLACE SALE COMO PÍLDORA BLANCA al final de la barra.
   *
   * Importa para el color: un destacado no lleva la letra del menú —que es
   * blanca— porque encima de su píldora blanca no se vería. Lleva el color
   * de la tienda, igual que cualquier botón, hasta que se le elija uno.
   */
  private esDestacado(id: number): boolean {
    return this.enlaces.find(e => e.id === id)?.destacado === true;
  }

  /**
   * CÓMO SE VE UN ENLACE EN LA BARRA: lo suyo, y lo que no tenga, lo del
   * menú entero. Es la misma cuenta que hace la tienda.
   *
   * El color sale en null cuando es un destacado sin color propio: así la
   * píldora se queda con el suyo en vez de recibir el blanco del menú.
   */
  estiloDelEnlace(id: number): { fondo: string | null; color: string | null; tamano: number; fuente: string; cursiva: boolean } {
    const propio = this.pintaDeEnlace(id);
    const fuente = this.fuentesFranja.find(f => f.valor === propio.fuente) ?? this.fuenteDelMenu();
    const px = Number(propio.tamano);
    return {
      // Sin fondo propio no se pinta ninguno: el enlace se lee sobre la barra,
      // y el destacado se queda con su píldora blanca
      fondo:   propio.fondo || null,
      color:   propio.color || (this.esDestacado(id) ? null : this.colorQueSeVeDe('menu_texto')),
      tamano:  Number.isFinite(px) && px >= 8 && px <= 48 ? px : this.tamanoDelMenu(),
      fuente:  fuente.css,
      cursiva: !!fuente.cursiva,
    };
  }

  /**
   * SU FONDO, o el que lleva hoy si no eligió ninguno: la píldora blanca si
   * es destacado y, si no, el de la barra, que es el color de la tienda.
   */
  fondoDelEnlace(id: number): string {
    return this.pintaDeEnlace(id).fondo
        || (this.esDestacado(id) ? '#ffffff' : this.colorQueSeVe);
  }

  hayFondoPropioDelEnlace(id: number): boolean {
    return !!this.pintaDeEnlace(id).fondo;
  }

  ponerFondoDelEnlace(id: number, color: string): void {
    if (!this.puedeEditar) { return; }
    const control = this.grupoEnlace(id)?.controls['fondo'];
    if (!control) { return; }
    control.setValue(color || '');
    control.markAsDirty();
  }

  /** Y cómo se llama su fondo de hoy en el mando. */
  get porDefectoDelFondo(): string {
    return this.enlaceTocado !== null && this.esDestacado(this.enlaceTocado)
      ? 'La píldora blanca' : 'El de la barra';
  }

  /**
   * SI ESE ENLACE NO SE VA A LEER encima de lo que tiene debajo.
   *
   * Sólo se avisa cuando se eligió algo —el fondo, el color o los dos—: la
   * barra de siempre con la letra de siempre no la decidió nadie aquí, y un
   * aviso por algo que no se ha tocado es ruido.
   */
  ilegibleElEnlace(id: number): boolean {
    const propio = this.pintaDeEnlace(id);
    if (!propio.fondo && !propio.color) { return false; }
    return this.contrasteDelEnlace(id) < 4.5;
  }

  contrasteDelEnlace(id: number): number {
    return contrasteEntre(this.fondoDelEnlace(id), this.colorDelEnlace(id));
  }

  contrasteTextoDelEnlace(id: number): string {
    return this.contrasteDelEnlace(id).toFixed(1).replace('.', ',');
  }

  /** Su color, o el que lleva hoy: el del menú, o el de la tienda si es destacado. */
  colorDelEnlace(id: number): string {
    return this.pintaDeEnlace(id).color
        || (this.esDestacado(id) ? this.colorQueSeVe : this.colorQueSeVeDe('menu_texto'));
  }

  /** Y cómo se llama eso en el mando, que no es lo mismo en los dos casos. */
  get porDefectoDelEnlace(): string {
    return this.enlaceTocado !== null && this.esDestacado(this.enlaceTocado)
      ? 'El de la tienda' : 'El del menú';
  }

  hayColorPropioDelEnlace(id: number): boolean {
    return !!this.pintaDeEnlace(id).color;
  }

  ponerColorDelEnlace(id: number, color: string): void {
    if (!this.puedeEditar) { return; }
    const control = this.grupoEnlace(id)?.controls['color'];
    if (!control) { return; }
    control.setValue(color || '');
    control.markAsDirty();
  }

  /** Y el texto del que se está tocando, para nombrarlo en el mando. */
  get textoDelEnlaceTocado(): string {
    return this.enlaces.find(e => e.id === this.enlaceTocado)?.texto ?? '';
  }

  cerrarPieza(): void {
    this.pieza = null;
    this.piezaNombre = "";
    this.enlaceTocado = null;
  }

  /** Si esa parte es la que se está tocando. */
  tocando(cual: PiezaEncabezado): boolean { return this.pieza === cual; }

  /** Escape cierra el mando, como cualquier cuadro de esta casa. */
  @HostListener('document:keydown.escape')
  alPulsarEscape(): void {
    if (this.pieza) { this.cerrarPieza(); }
  }

  /** Los enlaces no son un color: viven en su pestaña. */
  verMenu(): void {
    this.vistaCentro = 'menu';
    this.cerrarPieza();
  }

  /**
   * QUÉ PARTE DEL BOCETO TIENE EL CAMPO QUE ESTÁ MAL.
   *
   * Al guardar con algo inválido hay que abrirla: el campo está dentro de un
   * mando cerrado, y un aviso que manda a revisar algo que no se ve es peor
   * que no avisar. Devuelve también cómo se llama, para decirlo en el aviso.
   */
  private dondeEstaLoQueFalla(): { pieza: PiezaEncabezado; nombre: string } | null {
    if (this.barra.controls['texto']?.invalid) { return { pieza: 'franjaTexto', nombre: 'el texto de la franja' }; }
    if (this.barra.controls['destacado']?.invalid) { return { pieza: 'franjaDestacado', nombre: 'el destacado' }; }
    if (this.botones.invalid) { return { pieza: 'franjaBotones', nombre: 'los botones de la franja' }; }
    if (this.frases.invalid) { return { pieza: 'buscador', nombre: 'las frases del buscador' }; }
    if (this.form.controls['franja_tamano']?.invalid || this.form.controls['franja_fuente']?.invalid) {
      return { pieza: 'franja', nombre: 'el tamaño de la franja' };
    }
    if (this.form.controls['menu_tamano']?.invalid) {
      return { pieza: 'menu', nombre: 'el tamaño del menú' };
    }
    // Y el de un enlace suelto: hay que decir DE CUÁL, que es lo que no se
    // ve con el mando cerrado
    if (this.pintaEnlaces.invalid) {
      const clave = Object.keys(this.pintaEnlaces.controls)
        .find(k => this.pintaEnlaces.controls[k].invalid);
      if (clave) {
        this.enlaceTocado = Number(clave);
        const enlace = this.enlaces.find(e => e.id === Number(clave));
        return { pieza: 'menuEnlace', nombre: 'el tamaño de «' + (enlace?.texto ?? 'ese enlace') + '»' };
      }
    }
    return null;
  }

  /**
   * LOS BOTONES QUE SE VEN EN LA PREVIA: los que tienen texto, que son los que
   * va a guardar el servidor. Uno en blanco se está escribiendo todavía y
   * pintarlo dejaría una píldora vacía moviéndose en el boceto.
   */
  botonesDeLaPrevia(): { texto: string; fondo: string; letra: string; tamano: number | null }[] {
    return (this.botones.getRawValue() as any[])
      .map(b => ({
        texto: (b.texto ?? '').trim(),
        // Lo suyo, o lo de la franja: es lo que va a ver el cliente
        fondo: (b.fondo ?? '') || this.colorQueSeVeDe('franja_boton_fondo'),
        letra: (b.letra ?? '') || this.colorQueSeVeDe('franja_boton_texto'),
        tamano: b.tamano ? Number(b.tamano) : null,
      }))
      .filter(b => !!b.texto);
  }

  /**
   * UN SOLO BOTÓN GUARDA TODO: el nombre, las fechas y la pinta.
   *
   * Por dentro son dos llamadas —el nombre y las fechas viven en columnas de
   * la tabla y la pinta en el `config`, y el servidor las escribe por puertas
   * distintas—, pero eso es cosa suya: quien administra toca una pantalla y
   * le da a guardar una vez. Dos botones obligaban a acordarse de cuál
   * guardaba qué, y a descubrirlo perdiendo lo escrito en el otro.
   *
   * El de los datos va PRIMERO: si falla —fechas al revés, nombre vacío— no
   * se guarda nada, y la pantalla sigue enseñando lo que se intentó.
   */
  async guardarContenido(): Promise<void> {
    if (!this.puedeEditar || this.guardando) { return; }

    this.form.markAllAsTouched();
    this.datosForm.markAllAsTouched();

    if (this.datosForm.invalid) {
      this._toastr.error('Ponle un nombre al encabezado.', 'No se puede guardar',
                         { timeOut: 20000, closeButton: true });
      return;
    }

    if (this.form.invalid) {
      // SE ABRE LA PARTE QUE FALLA: el campo vive dentro de un mando, y
      // cerrado no se ve. Un aviso que manda a revisar algo invisible es
      // peor que no avisar.
      const falla = this.dondeEstaLoQueFalla();
      if (falla) {
        this.vistaCentro = 'previa';
        this.pieza = null;           // para que `tocar` no lo cierre si ya estaba abierto
        this.tocar(falla.pieza, falla.nombre.charAt(0).toUpperCase() + falla.nombre.slice(1));
      }
      this._toastr.error(falla ? 'Revisa ' + falla.nombre + '.' : 'Revise los campos del formulario.',
                         'No se puede guardar',
                         { timeOut: 20000, closeButton: true });
      return;
    }

    const v = this.form.getRawValue();
    const limpio = (x: any) => (x ?? '').toString().trim() || null;

    const config = {
      barra_superior: {
        activo:       v.barra_superior.activo !== false,
        texto:        limpio(v.barra_superior.texto),
        destacado:    limpio(v.barra_superior.destacado),
        // SIN TEXTO NO HAY BOTÓN: el servidor los quita igual, pero mandarlos
        // haría que una fila a medio escribir gastara uno de los cuatro sitios
        botones: ((v.barra_superior.botones ?? []) as any[])
          .map(b => ({
            texto: limpio(b.texto), enlace: limpio(b.enlace),
            // Su pinta, si la tiene. El 0 y el vacío son lo mismo: «el de la franja»
            fondo: limpio(b.fondo), letra: limpio(b.letra),
            tamano: b.tamano ? Number(b.tamano) : null,
          }))
          .filter(b => !!b.texto),
      },
      buscador_frases: (v.buscador_frases ?? []).map((f: string) => (f ?? '').trim()).filter(Boolean),
      color_principal: limpio(v.color_principal),
      desplegable_fondo: limpio(v.desplegable_fondo),
      desplegable_texto: limpio(v.desplegable_texto),
      franja_fondo: limpio(v.franja_fondo),
      franja_destacado: limpio(v.franja_destacado),
      franja_boton_fondo: limpio(v.franja_boton_fondo),
      franja_boton_texto: limpio(v.franja_boton_texto),
      // Un número o nada: el 0 y el vacío son lo mismo aquí, «el de siempre»
      franja_tamano: v.franja_tamano ? Number(v.franja_tamano) : null,
      franja_fuente: limpio(v.franja_fuente),
      franja_texto: limpio(v.franja_texto),
      menu_texto: limpio(v.menu_texto),
      // Un número o nada: el 0 y el vacío son lo mismo aquí, «el de siempre»
      menu_tamano: v.menu_tamano ? Number(v.menu_tamano) : null,
      menu_fuente: limpio(v.menu_fuente),
      // LA PINTA DE CADA ENLACE: sólo los que llevan algo. Abrir el mando de
      // uno y no tocar nada no tiene por qué dejarle una entrada.
      menu_enlaces: Object.fromEntries(
        (Object.entries(v.menu_enlaces ?? {}) as [string, any][])
          .map(([id, p]) => [id, {
            fondo:  limpio(p?.fondo),
            color:  limpio(p?.color),
            tamano: p?.tamano ? Number(p.tamano) : null,
            fuente: limpio(p?.fuente),
          }])
          .filter(([, p]: any) => p.fondo || p.color || p.tamano || p.fuente)),
      encabezado_fondo: limpio(v.encabezado_fondo),
      encabezado_texto: limpio(v.encabezado_texto),
    };

    this.guardando = true;
    try {
      // Sólo si cambió algo: guardar el nombre y las fechas que ya estaban
      // dejaría una línea en la auditoría cada vez que se toca un color
      if (this.datosForm.dirty) {
        await firstValueFrom(this._encabezadoService.editDatos(this.encabezadoId!, this.datosForm.value));
      }

      const res: any = await firstValueFrom(this._encabezadoService.editEncabezado(config, this.encabezadoId));
      this._toastr.success(res?.message ?? 'Encabezado guardado', 'Listo');
      this.pintar(res?.data);
      this.form.markAsPristine();
    } catch (e: any) {
      // El servidor valida de verdad: que la franja encendida tenga texto, que
      // las direcciones sean direcciones. Aquí no se repite para que no divagen.
      this._toastr.error(e?.error?.message ?? 'No se pudo guardar el encabezado', 'Error',
                         { timeOut: 20000, closeButton: true });
    } finally {
      this.guardando = false;
    }
  }

  // ================================================================
  // EL MENÚ: EL ÁRBOL EN UNA REJILLA
  // ================================================================
  //
  // AG-GRID, como el resto de listados de la casa —Seguridad → Menús es el
  // modelo—, y no la lista arrastrable que hubo aquí hasta el 15/11/2026:
  // aquélla sabía pintar dos niveles y ni uno más.
  //
  // EL ÁRBOL SE PINTA A MANO: ag-Grid Community no trae `treeData` —eso es de
  // la versión de pago—, así que la rejilla recibe SÓLO las filas visibles, y
  // una fila lo es cuando ninguno de sus antepasados está plegado. El
  // servidor manda el árbol ya aplanado, en orden y con el `nivel` de cada
  // uno, que es justo lo que come una rejilla.
  //
  // Y SIN LÍMITE DE NIVELES: el menú de la tienda se despliega hacia un lado,
  // así que lo hondo que pueda ir es cosa del diseño y no de la pantalla. El
  // de Seguridad para en el nivel 3 porque allí se pinta en una barra lateral.

  @ViewChild(AgGridAngular) agGrid?: AgGridAngular;
  public gridApi?: GridApi;
  public columnDefs: any[] = [];

  /** Lo que de verdad recibe la rejilla: el árbol menos las ramas cerradas. */
  public filasVisibles: EnlaceEncabezadoModel[] = [];

  /** Los ids plegados; sus descendientes no se pintan. */
  private readonly plegados = new Set<number>();

  /** El plegado de antes de buscar: buscar abre el árbol y luego lo devuelve. */
  private plegadosFueraDeBusqueda = new Set<number>();

  public searchTerm = '';

  /** true mientras la columna ACCIONES está plegada (sólo se ve su cabecera). */
  public accionesPlegadas = false;

  /** Dónde se recuerda el árbol entre visitas. */
  private static readonly CLAVE_PLEGADOS = 'ecommerce.encabezado.menu.plegados';

  /** La fila sobre la que se pulsó, para los avisos. */
  public selectedRow: EnlaceEncabezadoModel | null = null;

  private readonly claseNivel = (params: any): string =>
    'celda-nivel nivel-' + Math.min(Math.max(Number(params?.data?.nivel ?? 0), 0), 3);

  /** ↑ / ↓ seleccionan la fila como un clic, igual que en el resto. */
  navegarConTeclado = this._appAgGridService.navegacionConFlechas(fila => this.selectedRow = fila);

  private construirRejilla(): void {
    this.columnDefs = [
      {
        headerName: 'Id', field: 'id',
        cellStyle: { textAlign: 'left' }, minWidth: 70, maxWidth: 70, sortable: false,
      },
      {
        headerName: 'Enlace', field: 'texto',
        cellClass: this.claseNivel, cellStyle: { textAlign: 'left' },
        // Sangría por `nivel`, el asa de plegar y el texto
        cellRenderer: (params: any) => this.celdaTexto(params),
        // Los botones de contraer y desplegar todo, en la cabecera de la
        // columna del árbol
        headerComponentParams: this.cabeceraArbol(),
        minWidth: 240, maxWidth: 420, sortable: false,
        // Arrastrar la fila para moverla de padre o de sitio
        dndSource: this.puedeEditar,
        dndSourceOnRowDrag: (params: any) => this.alEmpezarArrastre(params.rowNode.data, params.dragEvent),
      },
      {
        headerName: 'A dónde va', field: 'enlace',
        cellClass: this.claseNivel, cellStyle: { textAlign: 'left' },
        cellRenderer: (params: any) => this.celdaDestino(params),
        minWidth: 200, maxWidth: 600, sortable: false,
      },
      {
        headerName: 'Icono', field: 'icono',
        cellClass: this.claseNivel, cellStyle: { textAlign: 'left' },
        // DIBUJADO, no por su nombre: se eligen viéndolos (app-campoIconoTienda),
        // así que la lista tiene que enseñar lo mismo que se eligió
        cellRenderer: (params: any) => this.celdaIcono(params),
        minWidth: 130, maxWidth: 160, sortable: false,
      },
      {
        headerName: 'Nivel', field: 'nivel',
        cellClass: this.claseNivel, cellStyle: { textAlign: 'center' },
        minWidth: 80, maxWidth: 80, sortable: false,
      },
      {
        headerName: 'Orden', field: 'orden',
        cellClass: this.claseNivel, cellStyle: { textAlign: 'center' },
        minWidth: 80, maxWidth: 80, sortable: false,
      },
      {
        // ENTRE QUÉ FECHAS SALE. El menú es uno solo para todos los
        // encabezados, así que lo que se programa es cada enlace
        headerName: 'Cuándo se ve', field: 'desde',
        cellStyle: { textAlign: 'center' },
        cellRenderer: (params: any) => this.celdaFechas(params),
        minWidth: 150, sortable: false,
      },
      {
        headerName: 'Estado', field: 'activo',
        cellStyle: { textAlign: 'center' },
        cellRenderer: (params: any) => this.celdaEstado(params),
        minWidth: 130, maxWidth: 160, sortable: false,
      },
      {
        headerName: 'ACCIONES', field: 'actions',
        cellStyle: { display: 'flex', justifyContent: 'center', alignItems: 'center' },
        cellRenderer: BotonAccionEnlace,
        pinned: 'right', minWidth: 130, maxWidth: 130,
        suppressHeaderMenuButton: true, sortable: false, resizable: false,
        headerComponentParams: {
          template: `
            <div style="display: flex; align-items: center; justify-content: center; gap: 5px;" title="Ocultar los botones de acción">
              <span>ACCIONES</span>
              <i class="fas fa-arrow-right"></i>
            </div>`,
        },
      },
    ];
  }

  /** Lo escrito por un usuario acaba dentro de una cadena de HTML. */
  private escapar(texto: unknown): string {
    return String(texto ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /** La celda del texto: sangría + asa de plegar + el texto. */
  private celdaTexto(params: any): string {
    const d = params.data as EnlaceEncabezadoModel;
    const nivel = Math.max(0, Number(d?.nivel ?? 0));
    const hijos = Number(d?.hijos ?? 0);
    const plegado = this.plegados.has(Number(d?.id));

    // La sangría va en PÍXELES y no en espacios: con espacios el ancho depende
    // de la letra y las columnas dejan de alinearse al cambiar de tema
    const sangria = `<span class="menu-sangria" style="width:${nivel * 16}px"></span>`;

    const asa = hijos > 0
      ? `<button type="button" class="menu-asa" data-accion="plegar"
                 title="${plegado ? 'Desplegar' : 'Contraer'} esta rama"
                 aria-label="${plegado ? 'Desplegar' : 'Contraer'}">
           <i class="fa fa-${plegado ? 'plus' : 'minus'}"></i>
         </button>`
      : `<span class="menu-asa menu-asa--hueco"></span>`;

    const destacado = d?.destacado
      ? ` <i class="fa-solid fa-star enc-estrella" title="Sale como botón al final de la barra"></i>`
      : '';

    return `<span class="menu-nombre">${sangria}${asa}<span>${this.escapar(d?.texto)}</span>${destacado}</span>`;
  }

  /**
   * La celda de «A dónde va»: lo que el enlace hace de verdad en la tienda.
   *
   * Con hijos sólo abre su desplegable, y entonces su dirección no se usa.
   * Sin hijos y sin dirección no se enseña, y eso hay que decirlo aquí: es el
   * descuido más fácil de cometer ahora que la dirección es opcional.
   */
  private celdaDestino(params: any): string {
    const d = params.data as EnlaceEncabezadoModel;
    if (Number(d?.hijos ?? 0) > 0) {
      return `<span class="enc-chip enc-chip--abre"><i class="fa fa-chevron-down"></i> Abre su desplegable</span>`;
    }
    if (!d?.enlace) {
      return `<span class="enc-chip enc-chip--aviso"><i class="fa fa-triangle-exclamation"></i> Sin dirección: no se verá</span>`;
    }
    return `<code class="enc-destino">${this.escapar(d.enlace)}</code>`;
  }

  /**
   * La celda del icono: el dibujo y su nombre.
   *
   * Y SI LA TIENDA NO TIENE ESE DIBUJO, se avisa en vez de dejar el hueco
   * vacío: puede quedar algún nombre guardado de cuando esto era un campo de
   * texto, y en la tienda no se vería sin que nadie supiera por qué.
   */
  private celdaIcono(params: any): string {
    const nombre = String(params.value ?? '').trim();
    if (!nombre) { return ''; }

    const svg = svgDeIconoTienda(nombre);
    return svg
      ? `<span class="enc-icono">${svg}</span><span class="enc-icono__nombre">${this.escapar(nombre)}</span>`
      : `<span class="enc-chip enc-chip--aviso" title="La tienda no tiene este dibujo">`
        + `<i class="fa fa-triangle-exclamation"></i> ${this.escapar(nombre)}</span>`;
  }

  /**
   * CUÁNDO SE VE ESE ENLACE, con sus fechas.
   *
   * Sin fechas no se escribe «siempre» en cada fila: serían veinte filas
   * diciendo lo mismo. Se deja en blanco, que es lo que significa.
   */
  private celdaFechas(params: any): string {
    const d = params.data as EnlaceEncabezadoModel;
    const desde = (d?.desde ?? '').replace('T', ' ');
    const hasta = (d?.hasta ?? '').replace('T', ' ');
    if (!desde && !hasta) { return ''; }

    const texto = desde && hasta ? desde + ' → ' + hasta
                : desde ? 'desde ' + desde
                : 'hasta ' + hasta;
    return `<span class="enc-fechas">${this.escapar(texto)}</span>`;
  }

  /**
   * EL ESTADO LO RESUELVE EL SERVIDOR (`estado`), no esta pantalla: comparar
   * fechas con el reloj del navegador es la manera de decir «se ve» cuando el
   * servidor cree que no. Aquí sólo se elige el chip.
   */
  private celdaEstado(params: any): string {
    const d = params.data as EnlaceEncabezadoModel;
    const estado = d?.estado ?? (d?.activo ? 'visible' : 'oculto');

    switch (estado) {
      case 'programado':
        return `<span class="enc-chip enc-chip--info"><i class="fa fa-clock"></i> Programado</span>`;
      case 'terminado':
        return `<span class="enc-chip enc-chip--aviso"><i class="fa fa-hourglass-end"></i> Terminado</span>`;
      case 'oculto':
        return `<span class="enc-chip enc-chip--no"><i class="fa fa-eye-slash"></i> Oculto</span>`;
      default:
        return `<span class="enc-chip enc-chip--si"><i class="fa fa-eye"></i> Se ve</span>`;
    }
  }

  /**
   * Cabecera de la columna del árbol: los botones de plegar y el título.
   *
   * Es una plantilla de ag-Grid, no de Angular: el clic lo atiende
   * `alClicarCabecera` y el encendido lo pone `actualizarBotonesArbol`.
   */
  private cabeceraArbol(): any {
    return {
      template: `
        <div class="ag-cell-label-container" role="presentation">
          <span ref="eMenu" class="ag-header-icon ag-header-cell-menu-button"></span>
          <div ref="eLabel" class="ag-header-cell-label cabecera-arbol" role="presentation">
            <span class="cabecera-arbol__botones btn-group" role="group" aria-label="Plegar el árbol">
              <button type="button" class="btn" data-arbol="contraer" title="Contraer todas las ramas">
                <i class="fa fa-minus"></i>
              </button>
              <button type="button" class="btn" data-arbol="desplegar" title="Desplegar todas las ramas">
                <i class="fa fa-plus"></i>
              </button>
            </span>
            <span ref="eText" class="ag-header-cell-text"></span>
          </div>
        </div>`,
    };
  }

  private actualizarBotonesArbol(): void {
    const botones = this.host?.nativeElement?.querySelectorAll?.('[data-arbol]');
    botones?.forEach((b: HTMLButtonElement) => {
      b.disabled = b.dataset['arbol'] !== 'contraer' && !this.hayPlegados;
    });
  }

  alClicarCabecera(ev: MouseEvent): void {
    const boton = (ev.target as HTMLElement).closest('[data-arbol]') as HTMLButtonElement | null;
    if (!boton) { return; }

    ev.stopPropagation();
    if (boton.disabled) { return; }
    if (boton.dataset['arbol'] === 'contraer') { this.contraerTodo(); } else { this.desplegarTodo(); }
  }

  alternarPlegado(fila: EnlaceEncabezadoModel | null): void {
    const id = Number(fila?.id ?? 0);
    if (!id || Number(fila?.hijos ?? 0) === 0) { return; }

    if (this.plegados.has(id)) { this.plegados.delete(id); } else { this.plegados.add(id); }
    this.guardarPlegados();
    this.recalcularVisibles();
  }

  contraerTodo(): void {
    this.plegados.clear();
    this.enlaces.forEach(e => { if (Number(e.hijos ?? 0) > 0) { this.plegados.add(Number(e.id)); } });
    this.guardarPlegados();
    this.recalcularVisibles();
  }

  desplegarTodo(): void {
    this.plegados.clear();
    this.guardarPlegados();
    this.recalcularVisibles();
  }

  get hayPlegados(): boolean { return this.plegados.size > 0; }
  get plegadosCuantos(): number { return this.plegados.size; }

  /** Tras cargar o cambiar el menú: limpia el estado y repinta. */
  private refrescarArbol(): void {
    const existen = new Set(this.enlaces.map(e => Number(e.id)));
    [...this.plegados].forEach(id => { if (!existen.has(id)) { this.plegados.delete(id); } });
    [...this.plegadosFueraDeBusqueda].forEach(id => { if (!existen.has(id)) { this.plegadosFueraDeBusqueda.delete(id); } });
    this.recalcularVisibles();
  }

  /**
   * Rehace la lista que ve la rejilla.
   *
   * Se esconde la RAMA ENTERA y no sólo los hijos directos: por eso se sube
   * por los antepasados en vez de mirar únicamente `padre_id`.
   */
  private recalcularVisibles(): void {
    const enlaces = this.enlaces;

    if (this.plegados.size === 0) {
      this.filasVisibles = [...enlaces];
    } else {
      const padres = new Map<number, number | null>();
      enlaces.forEach(e => padres.set(Number(e.id), e.padre_id ?? null));

      this.filasVisibles = enlaces.filter(e => {
        let p = padres.get(Number(e.id)) ?? null;
        while (p != null) {
          if (this.plegados.has(Number(p))) { return false; }
          p = padres.get(Number(p)) ?? null;
        }
        return true;
      });
    }

    this.gridApi?.setGridOption('rowData', this.filasVisibles);
    this.actualizarBotonesArbol();
  }

  private guardarPlegados(): void {
    try {
      const aGuardar = this.searchTerm ? this.plegadosFueraDeBusqueda : this.plegados;
      localStorage.setItem(EditEncabezadoComponent.CLAVE_PLEGADOS, JSON.stringify([...aGuardar]));
    } catch {
      // Ventana privada o almacenamiento bloqueado: se pierde al salir y ya
    }
  }

  private leerPlegados(): void {
    try {
      const guardado = localStorage.getItem(EditEncabezadoComponent.CLAVE_PLEGADOS);
      if (!guardado) { return; }
      const ids = JSON.parse(guardado);
      if (Array.isArray(ids)) {
        ids.forEach((id: any) => { if (Number.isFinite(Number(id))) { this.plegados.add(Number(id)); } });
      }
    } catch {
      // Lo guardado no sirve: se empieza con el árbol abierto
    }
  }

  // ----- La rejilla -----

  onGridReady(params: GridReadyEvent): void {
    this.gridApi = params.api;
    this.gridApi.setGridOption('rowData', this.filasVisibles);

    setTimeout(() => {
      // La cabecera con los botones de plegar la pinta ag-Grid: si el árbol
      // llegó antes que ella, su estado se pone aquí
      this.actualizarBotonesArbol();
      this._appAgGridService.ajustarTamanoGrid(this.gridApi);
    }, 300);
  }

  onCellClicked(e: CellClickedEvent): void {
    this.selectedRow = e.data;

    // El asa +/- vive dentro de la celda del texto, junto a él
    const origen = e.event?.target as HTMLElement | null;
    if (origen?.closest('[data-accion="plegar"]')) {
      this.alternarPlegado(e.data);
    }
  }

  onFilterTextBoxChanged(): void {
    const texto = (document.getElementById('filtro-enlaces') as HTMLInputElement)?.value ?? '';
    const buscabaAntes = !!this.searchTerm;
    this.searchTerm = texto;

    // Al EMPEZAR a buscar se abre el árbol entero: una coincidencia dentro de
    // una rama cerrada no saldría y parecería que el buscador no la encuentra.
    // Lo plegado se aparta y vuelve al limpiar el buscador
    if (!buscabaAntes && this.searchTerm) {
      this.plegadosFueraDeBusqueda = new Set(this.plegados);
      this.plegados.clear();
      this.recalcularVisibles();
    } else if (buscabaAntes && !this.searchTerm) {
      this.plegados.clear();
      this.plegadosFueraDeBusqueda.forEach(id => this.plegados.add(id));
      this.plegadosFueraDeBusqueda.clear();
      this.recalcularVisibles();
    }

    this.gridApi?.setGridOption('quickFilterText', this.searchTerm);
  }

  /** La columna ACCIONES se pliega para dejar sitio; se vuelve por su cabecera. */
  toggleActionsColumn(): void {
    this.accionesPlegadas = !this.accionesPlegadas;
    this.gridApi?.setColumnWidths([{ key: 'actions', newWidth: this.accionesPlegadas ? 44 : 130 }]);
    this.gridApi?.refreshCells({ force: true, columns: ['actions'] });
  }

  // ----- La paginación, la de la casa -----

  public paginaActual = 1;
  public ultimaPagina = 1;
  public totalRegistros = 0;
  public registrosPorPagina = 0;

  get desde(): number {
    return this.totalRegistros === 0 ? 0 : (this.paginaActual - 1) * this.registrosPorPagina + 1;
  }

  get hasta(): number {
    return Math.min(this.paginaActual * this.registrosPorPagina, this.totalRegistros);
  }

  onPaginationChanged(): void {
    if (!this.gridApi) { return; }
    this.paginaActual = this.gridApi.paginationGetCurrentPage() + 1;
    this.ultimaPagina = Math.max(this.gridApi.paginationGetTotalPages(), 1);
    this.totalRegistros = this.gridApi.paginationGetRowCount();
    this.registrosPorPagina = this.gridApi.paginationGetPageSize();
  }

  firstPage(): void { this.gridApi?.paginationGoToFirstPage(); }
  prevPage(): void { this.gridApi?.paginationGoToPreviousPage(); }
  nextPage(): void { this.gridApi?.paginationGoToNextPage(); }
  lastPage(): void { this.gridApi?.paginationGoToLastPage(); }

  // ================================================================
  // ARRASTRAR Y SOLTAR: cambiar de padre y de sitio
  // ================================================================
  //
  // Igual que en Seguridad → Menús: el tercio de arriba o el de abajo de una
  // fila son «antes de» y «después de» —hermano de esa fila—, y el centro es
  // «dentro de». Los ciclos y la renumeración los decide el servidor
  // (fn_encabezado_enlaces_mover); aquí sólo se marca el sitio.

  private arrastrando: EnlaceEncabezadoModel | null = null;
  private filaDestino: HTMLElement | null = null;

  alEmpezarArrastre(enlace: EnlaceEncabezadoModel, ev: DragEvent): void {
    this.arrastrando = enlace;
    if (ev.dataTransfer) {
      ev.dataTransfer.effectAllowed = 'move';
      ev.dataTransfer.setData('text/plain', enlace?.texto ?? '');
    }
  }

  @HostListener('document:dragend')
  alTerminarArrastre(): void {
    this.arrastrando = null;
    this.quitarFilaDestino();
  }

  private destinoBajo(ev: DragEvent): { el: HTMLElement; data: any; zona: 'antes' | 'dentro' | 'despues' } | null {
    if (!this.arrastrando) { return null; }
    const el = (ev.target as HTMLElement).closest('.ag-row') as HTMLElement | null;
    if (!el) { return null; }

    const data = this.gridApi?.getDisplayedRowAtIndex(Number(el.getAttribute('row-index')))?.data;
    if (!data || data.id === this.arrastrando.id || this.esDescendiente(data.id, this.arrastrando.id)) { return null; }

    const r = el.getBoundingClientRect();
    const y = (ev.clientY - r.top) / r.height;
    return { el, data, zona: y < .3 ? 'antes' : (y > .7 ? 'despues' : 'dentro') };
  }

  /** true si `id` cuelga —a cualquier profundidad— de `ancestroId`. */
  private esDescendiente(id: number, ancestroId: number): boolean {
    let actual = this.enlaces.find(e => e.id === id);
    while (actual?.padre_id != null) {
      if (actual.padre_id === ancestroId) { return true; }
      actual = this.enlaces.find(e => e.id === actual!.padre_id);
    }
    return false;
  }

  onDragOverGrilla(ev: DragEvent): void {
    if (!this.arrastrando) { return; }
    ev.preventDefault();
    if (ev.dataTransfer) { ev.dataTransfer.dropEffect = 'move'; }

    const d = this.destinoBajo(ev);
    const clase = d ? ({ antes: 'fila-insertar-antes', dentro: 'fila-destino', despues: 'fila-insertar-despues' })[d.zona] : '';
    if (!d || this.filaDestino !== d.el || !d.el.classList.contains(clase)) {
      this.quitarFilaDestino();
      if (d) { d.el.classList.add(clase); this.filaDestino = d.el; }
    }
  }

  onDragLeaveGrilla(ev: DragEvent): void {
    const a = ev.relatedTarget as Node | null;
    if (a && (ev.currentTarget as HTMLElement).contains(a)) { return; }
    this.quitarFilaDestino();
  }

  onDropGrilla(ev: DragEvent): void {
    ev.preventDefault();
    const enlace = this.arrastrando;
    const d = this.destinoBajo(ev);
    this.alTerminarArrastre();
    if (!enlace || !d) { return; }

    let padreId: number | null;
    let antesDe: number | null;
    if (d.zona === 'dentro') {
      padreId = d.data.id;
      antesDe = null;                                    // al final de sus hijos
    } else {
      padreId = d.data.padre_id ?? null;                 // hermano de la fila destino
      antesDe = d.zona === 'antes' ? d.data.id : this.siguienteHermano(d.data, enlace.id);
    }

    // Soltado donde ya estaba: nada que hacer
    if (padreId === (enlace.padre_id ?? null) && antesDe === this.siguienteHermano(enlace, enlace.id)) { return; }
    this.moverEnlace(enlace, padreId, antesDe);
  }

  /** id del hermano que sigue a `e` (sin contar `excluir`); null si es el último. */
  private siguienteHermano(e: any, excluir: number): number | null {
    const hermanos = this.enlaces
      .filter(x => (x.padre_id ?? null) === (e.padre_id ?? null) && x.id !== excluir)
      .sort((a, b) => (a.orden - b.orden) || a.id - b.id);
    const i = hermanos.findIndex(x => x.id === e.id);
    return i >= 0 ? (hermanos[i + 1]?.id ?? null) : null;
  }

  private quitarFilaDestino(): void {
    this.filaDestino?.classList.remove('fila-destino', 'fila-insertar-antes', 'fila-insertar-despues');
    this.filaDestino = null;
  }

  private async moverEnlace(enlace: EnlaceEncabezadoModel, padreId: number | null,
                            antesDe: number | null): Promise<void> {
    if (this._seguridadService.isexpired() || !this.puedeEditar || this.trabajando) { return; }

    this.trabajando = true;
    try {
      const res: any = await firstValueFrom(
        this._encabezadoService.moverEnlace(enlace.id, padreId, antesDe));
      this._toastr.success(res?.message ?? 'Enlace movido', 'Menú', { timeOut: 2500 });
      this.pintar(res?.data);
    } catch (e: any) {
      // El servidor es el que manda: no deja meter un enlace dentro de su
      // propia rama, y lo dice con sus palabras
      this._toastr.error(e?.error?.message ?? 'No se pudo mover el enlace', 'Error',
                         { timeOut: 20000, closeButton: true });
      await this.cargar();   // lo de la pantalla ya no es lo que hay guardado
    } finally {
      this.trabajando = false;
    }
  }

  // ================================================================
  // LAS ACCIONES DE UNA FILA
  // ================================================================
  //
  // Viven aquí y no en el renderizador de la columna ACCIONES porque las usa
  // también la barra de arriba. Tenerlas duplicadas era garantizar que
  // acabaran distintas.

  nuevoPrincipal(): void { this.abrirEnlace(null, null, ''); }

  /** Cuelga uno nuevo DENTRO de la fila, al nivel que sea. */
  nuevoHijo(padre: EnlaceEncabezadoModel): void {
    if (!padre) { return; }
    this.abrirEnlace(null, padre.id, padre.texto);
  }

  editarEnlace(enlace: EnlaceEncabezadoModel): void {
    if (!enlace) { return; }
    this.abrirEnlace(enlace, null, '');
  }

  private abrirEnlace(enlace: EnlaceEncabezadoModel | null, padreId: number | null,
                      padreTexto: string): void {
    if (this._seguridadService.isexpired()) { return; }
    if (!(enlace ? this.puedeEditar : this.puedeCrear)) { return; }

    const ref = this.modal.open(SaveEnlaceEncabezadoComponent,
                                { size: 'md', backdrop: 'static', centered: true });
    ref.componentInstance.enlace = enlace;
    ref.componentInstance.padreId = padreId;
    ref.componentInstance.padreTexto = padreTexto;

    ref.result.then((data: any) => this.pintar(data), () => { /* se cerró sin guardar */ });
  }

  async alternarEnlace(enlace: EnlaceEncabezadoModel): Promise<void> {
    if (this._seguridadService.isexpired() || !this.puedeEditar || this.trabajando) { return; }

    this.trabajando = true;
    try {
      const res: any = await firstValueFrom(this._encabezadoService.activarEnlace(enlace.id));
      this._toastr.success(res?.message ?? 'Listo', 'Listo');
      this.pintar(res?.data);
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo cambiar el estado', 'Error',
                         { timeOut: 15000, closeButton: true });
    } finally {
      this.trabajando = false;
    }
  }

  async borrarEnlace(enlace: EnlaceEncabezadoModel): Promise<void> {
    if (!enlace || this._seguridadService.isexpired() || !this.puedeEliminar || this.trabajando) { return; }

    // LA RAMA ENTERA se va con él, no sólo sus hijos directos: por eso se
    // cuentan también los nietos, que es lo que de verdad se está borrando
    const rama = this.enlaces.filter(e => this.esDescendiente(e.id, enlace.id)).length;
    const aviso = rama === 0
      ? `¿Enviar «${enlace.texto}» a la papelera?`
      : `«${enlace.texto}» tiene ${rama === 1 ? '1 enlace' : rama + ' enlaces'} colgando, `
        + 'y se van con él.\n\nRestaurarlo los devuelve. ¿Seguir?';

    if (!confirm(aviso)) { return; }

    this.trabajando = true;
    try {
      const res: any = await firstValueFrom(this._encabezadoService.deleteEnlace(enlace.id));
      this._toastr.success(res?.message ?? 'Enviado a la papelera', 'Listo');
      this.pintar(res?.data);
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo eliminar el enlace', 'Error',
                         { timeOut: 15000, closeButton: true });
    } finally {
      this.trabajando = false;
    }
  }

  // ================================================================
  // PAPELERA
  // ================================================================

  abrirPapelera(): void {
    if (this._seguridadService.isexpired()) { return; }

    const ref = this.modal.open(PapeleraEncabezadoComponent,
                                { size: 'lg', backdrop: 'static', centered: true });
    ref.componentInstance.puedeVaciar = this.puedeVaciar;
    ref.result.then((hubo: boolean) => { if (hubo) { this.cargar(); } }, () => { /* cerrada */ });
  }
}


/**
 * LOS BOTONES DE LA COLUMNA ACCIONES.
 *
 * Las cuatro acciones viven en la pantalla: éstos sólo le pasan su fila. Con
 * la columna plegada se pinta un único botón que la devuelve, que si no nadie
 * sabría que se puede volver a abrir.
 */
@Component({
  selector: 'app-boton-accion-enlace',
  standalone: true,
  imports: [ActionButtonsComponent],
  template: `
    @if (pantalla.accionesPlegadas) {
      <button type="button" class="btn btn-sm btn-outline-primary acciones-desplegar"
              title="Mostrar los botones de acción"
              aria-label="Mostrar los botones de acción"
              (click)="pantalla.toggleActionsColumn()">
        <i class="fas fa-bars"></i>
      </button>
    } @else {
      <span class="enc-acciones">
        <button type="button" class="enc-ojo"
                [title]="params.data?.activo ? 'Ocultar del menú' : 'Mostrar en el menú'"
                [disabled]="pantalla.accesoModel?.editar !== true || pantalla.trabajando"
                (click)="alternar()">
          <i class="fa" [class.fa-eye-slash]="params.data?.activo" [class.fa-eye]="!params.data?.activo"></i>
        </button>

        <app-action-buttons
          [accesoModel]="pantalla.accesoModel"
          [buttonAdd]="true"
          [buttonEdit]="true"
          [buttonDelete]="true"
          (add)="anadir()"
          (edit)="editar()"
          (delete)="borrar()">
        </app-action-buttons>
      </span>
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .acciones-desplegar {
      width: 28px; height: 24px; padding: 0;
      display: inline-flex; align-items: center; justify-content: center;
      border-radius: .25rem;
    }
    .enc-acciones { display: inline-flex; align-items: center; }
    /* Del mismo tamaño y aire que los de app-action-buttons, que están en su
       propia hoja y no llegan hasta aquí */
    .enc-ojo {
      width: 24px; height: 24px; padding: 0; margin-right: .25rem;
      display: inline-flex; align-items: center; justify-content: center;
      border: 0; border-radius: .25rem;
      background: none; color: var(--bs-secondary-color, #6c757d);
      cursor: pointer;
    }
    .enc-ojo:hover:not(:disabled) { color: var(--bs-app-theme, #00acac); }
    .enc-ojo:disabled { opacity: .4; cursor: default; }
  `],
})
export class BotonAccionEnlace {

  public params: any;

  constructor(public pantalla: EditEncabezadoComponent) { }

  agInit(params: any): void { this.params = params; }

  anadir(): void { this.pantalla.nuevoHijo(this.params.data); }
  editar(): void { this.pantalla.editarEnlace(this.params.data); }
  borrar(): void { this.pantalla.borrarEnlace(this.params.data); }
  alternar(): void { this.pantalla.alternarEnlace(this.params.data); }
}
