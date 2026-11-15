import { Component, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators,
} from '@angular/forms';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';
import {
  CdkDrag, CdkDragDrop, CdkDragHandle, CdkDragPlaceholder, CdkDropList, moveItemInArray,
} from '@angular/cdk/drag-drop';

import { SeguridadService } from '../../../../seguridad/services/seguridad.service';
import { AccesoModel } from '../../../../seguridad/interfaces/accesoModel';
import { EncabezadoService } from '../../../services/encabezado.service';
import { EncabezadoModel, EnlaceEncabezadoModel } from '../../../interfaces/encabezadoModel';
import { COLOR_TIENDA, contrasteEntre, esColorClaro, tonosDelColor } from '../../../interfaces/inicioModel';

import { PanelComponent } from '../../../../../components/panel/panel.component';
import { TabPanelComponent, PestanaTab } from '../../../../../components/campos/tabPanel/tabPanel.component';
import { CampoColorComponent } from '../../../../../components/campos/campoColor/campoColor.component';
import { CampoTextoComponent } from '../../../../../components/campos/campoTexto/campoTexto.component';
import { CheckboxComponent } from '../../../../../components/campos/checkbox/checkbox.component';
import { SaveEnlaceEncabezadoComponent } from '../saveEnlaceEncabezado/saveEnlaceEncabezado.component';
import { PapeleraEncabezadoComponent } from '../papeleraEncabezado/papeleraEncabezado.component';

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
    CommonModule, RouterLink, ReactiveFormsModule,
    PanelComponent, TabPanelComponent, CampoColorComponent, CampoTextoComponent, CheckboxComponent,
    CdkDropList, CdkDrag, CdkDragHandle, CdkDragPlaceholder,
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

  public readonly pestanas: PestanaTab[] = [
    { id: 'contenido', texto: 'Contenido', icono: 'fa-solid fa-bullhorn' },
    { id: 'menu',      texto: 'Menú',      icono: 'fa-solid fa-bars' },
  ];
  public pestana: 'contenido' | 'menu' = 'contenido';

  private _encabezadoService = inject(EncabezadoService);
  private _seguridadService = inject(SeguridadService);
  private _toastr = inject(ToastrService);
  private modal = inject(NgbModal);
  private fb = inject(FormBuilder);
  private activeRoute = inject(ActivatedRoute);

  get puedeEditar(): boolean { return this.accesoModel?.editar === true; }
  get puedeCrear(): boolean { return this.accesoModel?.crear === true; }
  get puedeEliminar(): boolean { return this.accesoModel?.eliminar === true; }
  get puedeVaciar(): boolean { return this.accesoModel?.vaciar === true; }

  get enlaces(): EnlaceEncabezadoModel[] { return this.modelo?.enlaces ?? []; }

  get barra(): FormGroup { return this.form.controls['barra_superior'] as FormGroup; }
  get frases(): FormArray { return this.form.controls['buscador_frases'] as FormArray; }

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
    encabezado_fondo: '#ffffff',
    encabezado_texto: '#1d1d1f',
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
      const res: any = await firstValueFrom(this._encabezadoService.subirLogo(archivo));
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
      const res: any = await firstValueFrom(this._encabezadoService.quitarLogo());
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

  ngOnInit(): void {
    this.accesoModel = this.activeRoute.snapshot.data['access'];
    this.construirFormulario();
    this.cargar();
  }

  private construirFormulario(): void {
    this.form = this.fb.group({
      barra_superior: this.fb.group({
        activo:       [true],
        texto:        ['', [Validators.maxLength(80)]],
        destacado:    ['', [Validators.maxLength(60)]],
        boton_texto:  ['', [Validators.maxLength(40)]],
        boton_enlace: ['', [Validators.maxLength(250)]],
      }),
      buscador_frases: this.fb.array([]),
      // El color de TODA la tienda. Vacío = el rojo de siempre
      color_principal: [''],
      // Los desplegables de la barra. Vacíos = blanco y la letra de siempre
      desplegable_fondo: [''],
      desplegable_texto: [''],
      // Y las dos franjas del encabezado, por lo mismo
      franja_fondo: [''],
      franja_texto: [''],
      encabezado_fondo: [''],
      encabezado_texto: [''],
    });
  }

  // ================================================================
  // CARGA
  // ================================================================

  async cargar(): Promise<void> {
    this.cargando = true;
    try {
      const res: any = await firstValueFrom(this._encabezadoService.getEncabezado());
      this.pintar(res?.data);
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo cargar el encabezado', 'Error',
                         { timeOut: 15000, closeButton: true });
    } finally {
      this.cargando = false;
    }
  }

  /** Lo que llega del servidor, al formulario y al árbol. */
  private pintar(data: EncabezadoModel | null | undefined): void {
    if (!data) { return; }
    this.modelo = data;

    const c = data.config ?? ({} as any);
    this.form.patchValue({
      barra_superior: {
        activo:       c.barra_superior?.activo !== false,
        texto:        c.barra_superior?.texto ?? '',
        destacado:    c.barra_superior?.destacado ?? '',
        boton_texto:  c.barra_superior?.boton_texto ?? '',
        boton_enlace: c.barra_superior?.boton_enlace ?? '',
      },
      color_principal: c.color_principal ?? '',
      desplegable_fondo: c.desplegable_fondo ?? '',
      desplegable_texto: c.desplegable_texto ?? '',
      franja_fondo: c.franja_fondo ?? '',
      franja_texto: c.franja_texto ?? '',
      encabezado_fondo: c.encabezado_fondo ?? '',
      encabezado_texto: c.encabezado_texto ?? '',
    });

    // El logo no está en el `config`: va en su columna y la dirección la arma
    // el servidor
    this.logoUrl = data.logo_url ?? null;

    this.frases.clear();
    for (const f of (c.buscador_frases ?? [])) {
      this.frases.push(this.fb.control(f, [Validators.required, Validators.maxLength(60)]));
    }
    if (this.frases.length === 0) { this.anadirFrase(); }

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

  async guardarContenido(): Promise<void> {
    if (!this.puedeEditar || this.guardando) { return; }

    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.pestana = 'contenido';
      this._toastr.error('Revise los campos del formulario.', 'No se puede guardar',
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
        boton_texto:  limpio(v.barra_superior.boton_texto),
        boton_enlace: limpio(v.barra_superior.boton_enlace),
      },
      buscador_frases: (v.buscador_frases ?? []).map((f: string) => (f ?? '').trim()).filter(Boolean),
      color_principal: limpio(v.color_principal),
      desplegable_fondo: limpio(v.desplegable_fondo),
      desplegable_texto: limpio(v.desplegable_texto),
      franja_fondo: limpio(v.franja_fondo),
      franja_texto: limpio(v.franja_texto),
      encabezado_fondo: limpio(v.encabezado_fondo),
      encabezado_texto: limpio(v.encabezado_texto),
    };

    this.guardando = true;
    try {
      const res: any = await firstValueFrom(this._encabezadoService.editEncabezado(config));
      this._toastr.success(res?.message ?? 'Encabezado guardado', 'Listo');
      this.pintar(res?.data);
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
  // EL MENÚ
  // ================================================================

  nuevoPrincipal(): void { this.abrirEnlace(null, null, ''); }

  nuevoHijo(padre: EnlaceEncabezadoModel): void { this.abrirEnlace(null, padre.id, padre.texto); }

  editarEnlace(enlace: EnlaceEncabezadoModel, esHijo: boolean): void {
    this.abrirEnlace(enlace, null, '', esHijo);
  }

  private abrirEnlace(enlace: EnlaceEncabezadoModel | null, padreId: number | null,
                      padreTexto: string, esHijo = false): void {
    if (this._seguridadService.isexpired()) { return; }
    if (!(enlace ? this.puedeEditar : this.puedeCrear)) { return; }

    const ref = this.modal.open(SaveEnlaceEncabezadoComponent,
                                { size: 'md', backdrop: 'static', centered: true });
    ref.componentInstance.enlace = enlace;
    ref.componentInstance.padreId = padreId;
    ref.componentInstance.padreTexto = padreTexto;
    ref.componentInstance.esHijo = esHijo;

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
    if (this._seguridadService.isexpired() || !this.puedeEliminar || this.trabajando) { return; }

    const hijos = enlace.hijos?.length ?? 0;
    const aviso = hijos === 0
      ? `¿Enviar «${enlace.texto}» a la papelera?`
      : `«${enlace.texto}» tiene ${hijos === 1 ? '1 enlace' : hijos + ' enlaces'} en su desplegable, `
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

  /** Los principales entre sí. */
  async soltarPrincipal(evento: CdkDragDrop<EnlaceEncabezadoModel[]>): Promise<void> {
    if (!this.puedeEditar || evento.previousIndex === evento.currentIndex || !this.modelo) { return; }

    // En pantalla primero: esperar al servidor hace que la fila salte de vuelta
    moveItemInArray(this.modelo.enlaces, evento.previousIndex, evento.currentIndex);
    await this.guardarOrden(this.modelo.enlaces.map(e => e.id));
  }

  /** Y los de un desplegable entre ellos. */
  async soltarHijo(padre: EnlaceEncabezadoModel, evento: CdkDragDrop<EnlaceEncabezadoModel[]>): Promise<void> {
    if (!this.puedeEditar || evento.previousIndex === evento.currentIndex || !padre.hijos) { return; }

    moveItemInArray(padre.hijos, evento.previousIndex, evento.currentIndex);
    // Sólo los de ESTE desplegable: el orden es por rama, y mandar los de
    // todas haría que la última pisara a las demás.
    await this.guardarOrden(padre.hijos.map(h => h.id));
  }

  private async guardarOrden(ids: number[]): Promise<void> {
    this.trabajando = true;
    try {
      // Sin aviso de éxito: ver que se queda donde se soltó ya lo confirma, y
      // un toast por cada arrastre es ruido.
      const res: any = await firstValueFrom(this._encabezadoService.ordenarEnlaces(ids));
      this.pintar(res?.data);
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo guardar el orden', 'Error',
                         { timeOut: 15000, closeButton: true });
      await this.cargar();   // lo de la pantalla ya no es lo que hay guardado
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

  /** Lo que va a hacer el enlace en la tienda, para la ayuda de la fila. */
  destinoDe(enlace: EnlaceEncabezadoModel): string {
    if (enlace.hijos?.length) { return 'Abre su desplegable'; }
    return enlace.enlace ?? 'Sin dirección: no se verá';
  }
}
