import { Component, OnInit, HostListener, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';
import {
  CdkDrag, CdkDragDrop, CdkDragPlaceholder, CdkDropList, CdkDropListGroup, moveItemInArray,
} from '@angular/cdk/drag-drop';

import { SeguridadService } from '../../../seguridad/services/seguridad.service';
import { AccesoModel } from '../../../seguridad/interfaces/accesoModel';
import { InicioService } from '../../services/inicio.service';
import {
  SeccionInicioModel, VistaSeccion, AltoSeccion, Dispositivo,
  ESTADOS_SECCION, VISTA_SECCIONES, VISTA_POR_DEFECTO,
  ALTOS_SECCION, PAGINA, ALTO_CONTENIDO, CONTENIDO_DESCONOCIDO,
} from '../../interfaces/inicioModel';

import { PanelComponent } from '../../../../components/panel/panel.component';

/** Lo que dura un estirón, mientras no se suelta el ratón. */
interface Estiron {
  clave: string;
  /** Dónde empezó, en píxeles de la pantalla. */
  desdeY: number;
  /** El aire que tenía al empezar, en píxeles de la tienda. */
  aire: number;
  /** El alto al que ha llegado ahora mismo. */
  alto: AltoSeccion;
}

/**
 * EL MODELADO DE LA PORTADA: la tienda dibujada a escala.
 *
 * La misma portada que la pantalla de «Inicio de la tienda», pero vista por
 * fuera: una columna con las secciones en su orden, CADA UNA DEL ALTO QUE
 * OCUPA DE VERDAD. Se arrastran para cambiarlas de sitio y se estiran por
 * abajo para darles más o menos aire.
 *
 * POR QUÉ UN DIBUJO Y NO UNA LISTA: la pregunta que se hace quien monta una
 * portada no es «¿en qué posición está el mosaico?», es «¿qué ve el cliente
 * antes de bajar?» y «¿no es demasiado largo esto?». Una lista de ocho
 * nombres no la responde, porque esconde que una sección ocupa cuatro veces
 * más que otra. Aquí se ve, y además se ve la raya de hasta dónde llega la
 * pantalla del cliente.
 *
 * LAS ALTURAS DEL CONTENIDO ESTÁN MEDIDAS EN LA TIENDA, no calculadas (ver
 * ALTO_CONTENIDO). Es un boceto y lo dice: el contenido es el que medía el
 * día que se tomó, y el aire —lo único que se decide aquí— es exacto, porque
 * sale de una regla.
 *
 * NO SE PUEDE ESTIRAR LO QUE NO ES AIRE. Una foto o una tarjeta miden lo que
 * miden; forzarlas a otro alto las sacaría aplastadas o recortadas. Por eso
 * el estirón va por los cuatro pasos de siempre —compacta, normal, amplia,
 * muy amplia— en vez de dar píxeles libres que la tienda no podría respetar.
 *
 * CADA GESTO GUARDA SOLO, como en el resto del módulo: soltar una sección
 * guarda el orden, soltar el estirón guarda el alto, y cruzarla al banquillo
 * la apaga. No hay botón de guardar porque no hay nada a medio escribir.
 */
@Component({
  selector: 'app-modelado',
  templateUrl: './modelado.component.html',
  styleUrls: ['./modelado.component.css'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    CommonModule, RouterLink, PanelComponent,
    CdkDropList, CdkDropListGroup, CdkDrag, CdkDragPlaceholder,
  ],
})
export class ModeladoComponent implements OnInit {

  public titulo = 'Modelado de la portada';
  public accesoModel!: AccesoModel;

  /** Todas, en el orden guardado. Es de donde sale el orden que se manda. */
  public secciones: SeccionInicioModel[] = [];

  /**
   * Las dos columnas del dibujo.
   *
   * SON CAMPOS Y NO GETTERS a propósito: el arrastre del cdk mueve elementos
   * DENTRO del array que le das, y un getter devolvería uno nuevo en cada
   * ciclo, así que el cambio se perdería al repintar.
   */
  public enLaPortada: SeccionInicioModel[] = [];
  public fuera: SeccionInicioModel[] = [];

  public cargando = true;
  public trabajando = false;
  public elegida: string | null = null;

  public dispositivo: Dispositivo = 'computadora';
  /** 1 es el tamaño de trabajo; los otros dos para caber o para ver de cerca. */
  public zoom = 1;
  public readonly zooms = [
    { valor: 0.7, texto: 'Toda la página' },
    { valor: 1,   texto: 'Normal' },
    { valor: 1.4, texto: 'De cerca' },
  ];

  public estiron: Estiron | null = null;

  public readonly estados = ESTADOS_SECCION;
  public readonly altos = ALTOS_SECCION;
  public readonly pagina = PAGINA;
  public readonly dispositivos: Dispositivo[] = ['computadora', 'celular'];

  /** El ancho con el que se dibuja la página, antes del zoom. */
  private readonly ANCHO_DIBUJO: Record<Dispositivo, number> = {
    computadora: 470,
    celular: 240,
  };

  private _inicioService = inject(InicioService);
  private _seguridadService = inject(SeguridadService);
  private _toastr = inject(ToastrService);
  private activeRoute = inject(ActivatedRoute);
  private router = inject(Router);

  get puedeEditar(): boolean { return this.accesoModel?.editar === true; }

  async ngOnInit(): Promise<void> {
    this.accesoModel = this.activeRoute.snapshot.data['access'];
    await this.cargar();
  }

  async cargar(): Promise<void> {
    this.cargando = true;
    try {
      const res: any = await firstValueFrom(this._inicioService.allInicio());
      this.pintar(res?.data);
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo cargar la portada', 'Error',
                         { timeOut: 15000, closeButton: true });
    } finally {
      this.cargando = false;
    }
  }

  private pintar(data: SeccionInicioModel[] | null | undefined): void {
    if (!data) { return; }
    this.secciones = data;
    this.enLaPortada = data.filter(s => s.activo);
    this.fuera = data.filter(s => !s.activo);
  }

  // ================================================================
  // LA ESCALA
  // ================================================================

  get medidas() { return this.pagina[this.dispositivo]; }

  /** De píxeles de la tienda a píxeles de esta pantalla. */
  get escala(): number {
    return (this.ANCHO_DIBUJO[this.dispositivo] / this.medidas.ancho) * this.zoom;
  }

  get anchoPagina(): number {
    return Math.round(this.ANCHO_DIBUJO[this.dispositivo] * this.zoom);
  }

  vista(s: SeccionInicioModel): VistaSeccion {
    return VISTA_SECCIONES[s.clave] ?? VISTA_POR_DEFECTO;
  }

  comoSeLlama(s: SeccionInicioModel): string {
    return (s.titulo ?? '').trim() || s.nombre;
  }

  private contenidoDe(s: SeccionInicioModel) {
    return ALTO_CONTENIDO[s.clave] ?? CONTENIDO_DESCONOCIDO;
  }

  /** Si su alto está medido en la tienda o es una estimación. */
  medido(s: SeccionInicioModel): boolean {
    return this.contenidoDe(s).medido;
  }

  private escalaDelAlto(alto: AltoSeccion): number {
    return (this.altos.find(a => a.valor === alto) ?? this.altos[1]).escala;
  }

  /** El alto que se está enseñando: el del estirón si se está estirando. */
  altoDe(s: SeccionInicioModel): AltoSeccion {
    return this.estiron?.clave === s.clave ? this.estiron.alto : (s.alto ?? 'normal');
  }

  /**
   * El aire de arriba, en píxeles de la tienda.
   *
   * El banner principal no tiene: va pegado al encabezado, porque no está
   * dentro de `.ae-seccion`. Es la tienda la que es así, no una excepción
   * inventada aquí.
   */
  aireArriba(s: SeccionInicioModel): number {
    if (s.clave === 'banner_principal') { return 0; }
    return Math.round(this.medidas.aireBase * this.escalaDelAlto(this.altoDe(s)));
  }

  /** El de abajo: sólo el que sobra de «normal», que es como está la tienda hoy. */
  aireAbajo(s: SeccionInicioModel): number {
    return Math.max(0, Math.round(this.medidas.aireBase * (this.escalaDelAlto(this.altoDe(s)) - 1)));
  }

  contenido(s: SeccionInicioModel): number {
    return this.contenidoDe(s)[this.dispositivo];
  }

  /** Lo que ocupa entera, en píxeles de la tienda. */
  altoTotal(s: SeccionInicioModel): number {
    return this.aireArriba(s) + this.contenido(s) + this.aireAbajo(s);
  }

  // Y los mismos, ya en píxeles de esta pantalla
  px(pixelesDeLaTienda: number): number { return Math.round(pixelesDeLaTienda * this.escala); }

  /** El cuerpo nunca baja de 26 px dibujados: por debajo no se puede ni agarrar. */
  cuerpoPx(s: SeccionInicioModel): number {
    return Math.max(26, this.px(this.contenido(s)));
  }

  cajaPx(s: SeccionInicioModel): number {
    return this.px(this.aireArriba(s)) + this.cuerpoPx(s) + this.px(this.aireAbajo(s));
  }

  /** Dónde empieza cada sección en la página, contando el encabezado. */
  desdeArriba(s: SeccionInicioModel): number {
    let y = this.medidas.cabecera;
    for (const otra of this.enLaPortada) {
      if (otra.clave === s.clave) { break; }
      y += this.altoTotal(otra);
    }
    return y;
  }

  /** Lo que mide la portada entera. */
  get altoDeLaPagina(): number {
    return this.enLaPortada.reduce((suma, s) => suma + this.altoTotal(s), this.medidas.cabecera);
  }

  /**
   * Si esta sección queda por debajo de lo que se ve sin bajar.
   *
   * Es la pregunta que trae a esta pantalla: lo que está debajo de la raya
   * sólo lo ve quien se moleste en bajar.
   */
  bajoLaRaya(s: SeccionInicioModel): boolean {
    return this.desdeArriba(s) >= this.medidas.ventana;
  }

  /** La raya, en píxeles de esta pantalla; null si la página no llega. */
  get rayaPx(): number | null {
    return this.altoDeLaPagina > this.medidas.ventana ? this.px(this.medidas.ventana) : null;
  }

  /** Si hoy sale de verdad: encendida, en fecha y con algo que enseñar. */
  sale(s: SeccionInicioModel): boolean {
    return s.estado === 'visible' && s.con_contenido;
  }

  /** Por qué una encendida no sale. */
  porQueNoSale(s: SeccionInicioModel): string {
    if (s.estado === 'programada') { return 'Todavía no: está programada'; }
    if (s.estado === 'terminada') { return 'Ya pasó su fecha'; }
    if (!s.con_contenido) {
      return s.fuente.tipo === 'pendiente' ? 'Falta ' + (s.fuente.falta ?? 'su fuente') : 'Está vacía';
    }
    return '';
  }

  elegir(clave: string): void {
    this.elegida = this.elegida === clave ? null : clave;
  }

  configurar(s: SeccionInicioModel): void {
    this.router.navigate(['/ecommerce/editInicio'], { queryParams: { seccion: s.clave } });
  }

  // ================================================================
  // ARRASTRAR
  // ================================================================

  /**
   * Soltar una sección.
   *
   * Dentro de la página es un cambio de orden. De una columna a la otra es
   * encenderla o apagarla, que es lo que significa estar en la portada.
   */
  async soltar(evento: CdkDragDrop<SeccionInicioModel[]>): Promise<void> {
    if (!this.puedeEditar || this.trabajando) { await this.cargar(); return; }

    const mismaColumna = evento.previousContainer === evento.container;
    const aLaPortada = evento.container.id === 'portada';
    const s = evento.previousContainer.data[evento.previousIndex];

    if (mismaColumna) {
      if (evento.previousIndex === evento.currentIndex) { return; }
      if (!aLaPortada) { return; }   // el banquillo no tiene orden: no se ven
      moveItemInArray(this.enLaPortada, evento.previousIndex, evento.currentIndex);
      await this.guardarOrden(s.clave);
      return;
    }

    // Se mueve a mano en lugar de con transferArrayItem porque detrás hay dos
    // llamadas que pueden fallar, y entonces se recarga y manda el servidor
    const destino = aLaPortada ? this.enLaPortada : this.fuera;
    evento.previousContainer.data.splice(evento.previousIndex, 1);
    destino.splice(evento.currentIndex, 0, s);

    await this.encender(s, aLaPortada);
  }

  private async encender(s: SeccionInicioModel, activo: boolean): Promise<void> {
    if (this._seguridadService.isexpired()) { return; }

    this.trabajando = true;
    try {
      const res: any = await firstValueFrom(this._inicioService.activarSeccion(s.clave, activo));
      this._toastr.success(res?.message ?? 'Listo', 'Listo');

      // Encender no dice dónde: el sitio es donde se soltó, así que va detrás
      if (activo) {
        const claves = this.ordenConLaMovida(s.clave);
        const orden: any = await firstValueFrom(this._inicioService.ordenarSecciones(claves));
        this.pintar(orden?.data);
      } else {
        this.pintar(res?.data);
      }
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo mover la sección', 'Error',
                         { timeOut: 15000, closeButton: true });
      await this.cargar();
    } finally {
      this.trabajando = false;
    }
  }

  private async guardarOrden(clave: string): Promise<void> {
    if (this._seguridadService.isexpired()) { return; }

    this.trabajando = true;
    try {
      const res: any = await firstValueFrom(
        this._inicioService.ordenarSecciones(this.ordenConLaMovida(clave)));
      this.pintar(res?.data);
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo guardar el orden', 'Error',
                         { timeOut: 15000, closeButton: true });
      await this.cargar();
    } finally {
      this.trabajando = false;
    }
  }

  /**
   * El orden de las OCHO con una sección puesta donde se acaba de soltar.
   *
   * El orden va entero al servidor, y aquí sólo se ven las encendidas: hay que
   * devolver también las apagadas, Y EN SU SITIO. Si se mandaran al final,
   * apagar una la echaría del lugar que le guardaron, y al volver a encenderla
   * aparecería abajo del todo sin que nadie lo haya pedido.
   *
   * Por eso se mira QUIÉN QUEDÓ DETRÁS de la movida y se la cuela justo
   * delante: las demás no se tocan.
   */
  private ordenConLaMovida(clave: string): string[] {
    const i = this.enLaPortada.findIndex(s => s.clave === clave);
    const siguiente = i >= 0 && i + 1 < this.enLaPortada.length ? this.enLaPortada[i + 1].clave : null;

    const resto = this.secciones.map(s => s.clave).filter(c => c !== clave);
    const donde = siguiente ? resto.indexOf(siguiente) : resto.length;
    resto.splice(donde < 0 ? resto.length : donde, 0, clave);
    return resto;
  }

  // ================================================================
  // ESTIRAR
  // ================================================================

  /**
   * Empieza el estirón.
   *
   * `setPointerCapture` hace que el ratón siga siendo de este tirador aunque
   * se salga de él, que es lo que pasa en cuanto se arrastra deprisa. Va en
   * un try porque no es imprescindible —y en algún navegador puede fallar—,
   * y si se cayera dejaría el estirón sin empezar, que es peor que estirar
   * sólo mientras el ratón esté encima.
   */
  empezarEstiron(s: SeccionInicioModel, evento: PointerEvent): void {
    if (!this.puedeEditar || this.trabajando) { return; }

    this.estiron = {
      clave: s.clave,
      desdeY: evento.clientY,
      aire: this.aireArriba(s) + this.aireAbajo(s),
      alto: s.alto ?? 'normal',
    };

    try { (evento.target as HTMLElement).setPointerCapture(evento.pointerId); } catch { /* da igual */ }
  }

  /**
   * Soltar el ratón en cualquier parte acaba el estirón.
   *
   * El `pointerup` del tirador es el camino normal, pero si el puntero se
   * escapó —sin captura, o soltando fuera de la ventana— no llegaría nunca y
   * la sección se quedaría estirándose para siempre: con el estirón a medias
   * no se puede arrastrar nada, así que la pantalla parecería colgada.
   */
  @HostListener('document:pointerup')
  @HostListener('document:pointercancel')
  async alSoltarEnCualquierParte(): Promise<void> {
    if (!this.estiron) { return; }
    const s = this.secciones.find(x => x.clave === this.estiron!.clave);
    if (s) { await this.soltarEstiron(s); } else { this.estiron = null; }
  }

  /**
   * Mientras se estira: se busca el paso más cercano a donde está el ratón.
   *
   * No da píxeles libres porque la tienda no podría respetarlos: el alto es
   * una escala sobre el aire de cada pantalla, no una medida.
   */
  estirando(evento: PointerEvent): void {
    if (!this.estiron) { return; }

    const base = this.medidas.aireBase;
    const esElBanner = this.estiron.clave === 'banner_principal';
    const aireDe = (alto: AltoSeccion) => {
      const e = this.escalaDelAlto(alto);
      return (esElBanner ? 0 : base * e) + Math.max(0, base * (e - 1));
    };

    const quiere = this.estiron.aire + (evento.clientY - this.estiron.desdeY) / this.escala;

    let elegido = this.altos[0].valor;
    let mejor = Infinity;
    for (const a of this.altos) {
      const distancia = Math.abs(aireDe(a.valor) - quiere);
      if (distancia < mejor) { mejor = distancia; elegido = a.valor; }
    }
    this.estiron.alto = elegido;
  }

  async soltarEstiron(s: SeccionInicioModel): Promise<void> {
    const estiron = this.estiron;
    this.estiron = null;
    if (!estiron || estiron.clave !== s.clave) { return; }
    if (estiron.alto === (s.alto ?? 'normal')) { return; }

    await this.guardarAlto(s, estiron.alto);
  }

  /** Con el teclado, para quien no pueda arrastrar. */
  async conElTeclado(s: SeccionInicioModel, paso: number): Promise<void> {
    if (!this.puedeEditar || this.trabajando) { return; }

    const i = this.altos.findIndex(a => a.valor === (s.alto ?? 'normal'));
    const siguiente = this.altos[Math.min(this.altos.length - 1, Math.max(0, i + paso))];
    if (!siguiente || siguiente.valor === s.alto) { return; }

    await this.guardarAlto(s, siguiente.valor);
  }

  private async guardarAlto(s: SeccionInicioModel, alto: AltoSeccion): Promise<void> {
    if (this._seguridadService.isexpired()) { return; }

    this.trabajando = true;
    try {
      const res: any = await firstValueFrom(this._inicioService.altoSeccion(s.clave, alto));
      this._toastr.success(res?.message ?? 'Listo', 'Listo');
      this.pintar(res?.data);
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo cambiar el alto', 'Error',
                         { timeOut: 15000, closeButton: true });
      await this.cargar();
    } finally {
      this.trabajando = false;
    }
  }

  textoDelAlto(s: SeccionInicioModel): string {
    const alto = this.altoDe(s);
    return (this.altos.find(a => a.valor === alto) ?? this.altos[1]).texto;
  }
}
