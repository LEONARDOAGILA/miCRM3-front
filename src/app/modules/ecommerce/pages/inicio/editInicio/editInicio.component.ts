import { Component, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';
import {
  CdkDrag, CdkDragDrop, CdkDragHandle, CdkDragPlaceholder, CdkDropList, moveItemInArray,
} from '@angular/cdk/drag-drop';

import { SeguridadService } from '../../../../seguridad/services/seguridad.service';
import { AccesoModel } from '../../../../seguridad/interfaces/accesoModel';
import { InicioService } from '../../../services/inicio.service';
import {
  SeccionInicioModel, VistaSeccion, ESTADOS_SECCION, VISTA_SECCIONES, VISTA_POR_DEFECTO,
  vistaDeProductos,
  TAMANOS_ROTULO, FUENTES_ROTULO, COLORES_ROTULO, ROTULO_BASE_PX, ROTULO_COLOR_TIENDA,
  BOTONES_TARJETA, BotonTarjeta, colorDeTextoSobre,
  ALTOS_SECCION, AIRE_BASE_PX,
} from '../../../interfaces/inicioModel';

import { PanelComponent } from '../../../../../components/panel/panel.component';
import { CampoTextoComponent } from '../../../../../components/campos/campoTexto/campoTexto.component';
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
 * las OCHO DE FÁBRICA existen porque la tienda sabe pintarlas, y las de
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
  selector: 'app-editInicio',
  templateUrl: './editInicio.component.html',
  styleUrls: ['./editInicio.component.css'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    CommonModule, RouterLink, ReactiveFormsModule,
    PanelComponent, CampoTextoComponent, GaleriaImagenesComponent,
    CdkDropList, CdkDrag, CdkDragHandle, CdkDragPlaceholder,
  ],
})
export class EditInicioComponent implements OnInit {

  public titulo = 'Inicio de la tienda';
  public accesoModel!: AccesoModel;

  public secciones: SeccionInicioModel[] = [];
  public cargando = true;
  public trabajando = false;
  public guardando: string | null = null;

  /** La abierta, por clave. Sólo una: el acordeón es la lista de la tienda. */
  public abierta: string | null = null;

  /**
   * Las que ya se abrieron alguna vez.
   *
   * El cuerpo de una sección se PINTA UNA VEZ Y SE ESCONDE, no se destruye:
   * dentro va una galería que se carga sola, y destruirla al cerrar la haría
   * pedir sus imágenes otra vez a cada clic. Pero sólo se monta la que se
   * abre: montarlas todas de entrada pediría galerías que nadie va a mirar.
   */
  public vistas = new Set<string>();

  public formularios: Record<string, FormGroup> = {};

  public readonly estados = ESTADOS_SECCION;
  public readonly tamanos = TAMANOS_ROTULO;
  public readonly altos = ALTOS_SECCION;
  public readonly fuentes = FUENTES_ROTULO;
  public readonly colores = COLORES_ROTULO;
  public readonly colorTienda = ROTULO_COLOR_TIENDA;

  private _inicioService = inject(InicioService);
  private _seguridadService = inject(SeguridadService);
  private _toastr = inject(ToastrService);
  private fb = inject(FormBuilder);
  private activeRoute = inject(ActivatedRoute);

  get puedeEditar(): boolean { return this.accesoModel?.editar === true; }
  get puedeCrear(): boolean { return this.accesoModel?.crear === true; }
  get puedeEliminar(): boolean { return this.accesoModel?.eliminar === true; }

  /** Cuántas se ven hoy de verdad: encendidas, en fecha y con algo que enseñar. */
  get enLaPortada(): number {
    return this.secciones.filter(s => s.estado === 'visible' && s.con_contenido).length;
  }

  async ngOnInit(): Promise<void> {
    this.accesoModel = this.activeRoute.snapshot.data['access'];
    this.pedirLetrasDeLaTienda();
    await this.cargar();
    this.abrirLaQuePiden();
  }

  /**
   * Si se llega desde el modelado, con `?seccion=`, se abre esa.
   *
   * Allí se elige una sección en el dibujo y se pulsa «configurar»; llegar
   * aquí a la lista cerrada y tener que buscarla otra vez sería perder el
   * sitio en el camino.
   */
  private abrirLaQuePiden(): void {
    const clave = this.activeRoute.snapshot.queryParamMap.get('seccion');
    if (!clave || !this.secciones.some(s => s.clave === clave)) { return; }

    this.abierta = clave;
    this.vistas.add(clave);
    // Después de pintarla, que si no todavía no existe en el documento
    setTimeout(() => document.getElementById('seccion-caja-' + clave)
                             ?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 150);
  }

  async cargar(): Promise<void> {
    this.cargando = true;
    try {
      const res: any = await firstValueFrom(this._inicioService.allInicio());
      this.pintar(res?.data, true);
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo cargar la portada', 'Error',
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
      if (rehacer || !this.formularios[s.clave]) {
        this.formularios[s.clave] = this.formularioDe(s);
      }
    }

    if (!this.puedeEditar) {
      Object.values(this.formularios).forEach(f => f.disable());
    }
  }

  private formularioDe(s: SeccionInicioModel): FormGroup {
    return this.fb.group({
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
    });
  }

  // ================================================================
  // LA CARA DE CADA SECCIÓN
  // ================================================================

  vista(s: SeccionInicioModel): VistaSeccion {
    // Las de productos no pueden estar en el catálogo de claves: la suya la
    // fabrica el servidor al crearlas, así que su cara se arma con su nombre.
    if (s.producto_seccion_id) { return vistaDeProductos(s.nombre); }
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
    const escrito = (this.formularios[s.clave]?.value?.titulo ?? '').toString().trim();
    return escrito || this.vista(s).rotuloDeFabrica || 'Sin rótulo';
  }

  /** En píxeles, como se vería en computadora. En celular la tienda lo encoge sola. */
  tamanoMuestra(s: SeccionInicioModel): number {
    const elegido = this.formularios[s.clave]?.value?.tamano;
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
    const elegido = this.formularios[s.clave]?.value?.alto;
    const alto = this.altos.find(a => a.valor === elegido) ?? this.altos[1];
    return Math.round(AIRE_BASE_PX * alto.escala);
  }

  fuenteMuestra(s: SeccionInicioModel) {
    const elegida = this.formularios[s.clave]?.value?.fuente;
    return this.fuentes.find(f => f.valor === elegida) ?? this.fuentes[0];
  }

  /** El color elegido, o el de la tienda mientras no se elija ninguno. */
  colorMuestra(s: SeccionInicioModel): string {
    return (this.formularios[s.clave]?.value?.color ?? '').toString().trim() || this.colorTienda;
  }

  /** Si se eligió uno a mano: mientras no, manda la tienda y se puede cambiar de idea sin romper nada. */
  colorPropio(s: SeccionInicioModel): boolean {
    return ((this.formularios[s.clave]?.value?.color ?? '').toString().trim()) !== '';
  }

  elegirColor(s: SeccionInicioModel, color: string): void {
    if (!this.puedeEditar) { return; }
    this.formularios[s.clave].patchValue({ color });
    this.formularios[s.clave].markAsDirty();
  }

  colorDelSelector(s: SeccionInicioModel, evento: Event): void {
    this.elegirColor(s, (evento.target as HTMLInputElement).value);
  }

  quitarColor(s: SeccionInicioModel): void {
    this.elegirColor(s, '');
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
  colorBoton(s: SeccionInicioModel, b: BotonTarjeta): string {
    return this.valorBoton(s, b.campo) || b.deLaTienda;
  }

  /** Si se eligió fondo a mano; mientras no, manda la tienda. */
  botonPropio(s: SeccionInicioModel, b: BotonTarjeta): boolean {
    return this.valorBoton(s, b.campo) !== '';
  }

  /**
   * La letra del botón: la elegida, o la que la tienda va a poner.
   *
   * Y lo que la tienda pone depende de si hay fondo propio: con fondo propio
   * calcula la que se lea encima, y sin él usa la suya de siempre. Esta
   * pantalla tiene que decir lo mismo, o la muestra miente.
   */
  textoBoton(s: SeccionInicioModel, b: BotonTarjeta): string {
    const elegida = this.valorBoton(s, b.campoTexto);
    if (elegida) { return elegida; }
    return this.botonPropio(s, b) ? colorDeTextoSobre(this.colorBoton(s, b)) : b.textoDeLaTienda;
  }

  /** Si se eligió letra a mano. */
  textoPropio(s: SeccionInicioModel, b: BotonTarjeta): boolean {
    return this.valorBoton(s, b.campoTexto) !== '';
  }

  ponerColorBoton(s: SeccionInicioModel, b: BotonTarjeta, color: string): void {
    this.ponerCampo(s, b.campo, color);
  }

  ponerTextoBoton(s: SeccionInicioModel, b: BotonTarjeta, color: string): void {
    this.ponerCampo(s, b.campoTexto, color);
  }

  colorBotonDelSelector(s: SeccionInicioModel, b: BotonTarjeta, evento: Event): void {
    this.ponerColorBoton(s, b, (evento.target as HTMLInputElement).value);
  }

  textoBotonDelSelector(s: SeccionInicioModel, b: BotonTarjeta, evento: Event): void {
    this.ponerTextoBoton(s, b, (evento.target as HTMLInputElement).value);
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
   */
  botonFlojo(s: SeccionInicioModel, b: BotonTarjeta): boolean {
    return this.contrasteBoton(s, b) < 4.5;
  }

  contrasteBotonTexto(s: SeccionInicioModel, b: BotonTarjeta): string {
    return this.contrasteBoton(s, b).toFixed(1).replace('.', ',');
  }

  private contrasteBoton(s: SeccionInicioModel, b: BotonTarjeta): number {
    return this.contrasteEntre(this.colorBoton(s, b), this.textoBoton(s, b));
  }

  private ponerCampo(s: SeccionInicioModel, campo: string, color: string): void {
    if (!this.puedeEditar) { return; }
    this.formularios[s.clave].patchValue({ [campo]: color });
    this.formularios[s.clave].markAsDirty();
  }

  private valorBoton(s: SeccionInicioModel, campo: string): string {
    return (this.formularios[s.clave]?.value?.[campo] ?? '').toString().trim();
  }

  /** Si esta sección pinta tarjetas con botones: sólo las de productos. */
  conBotones(s: SeccionInicioModel): boolean {
    return s.fuente.tipo === 'productos';
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

  /** El contraste entre dos colores, como lo define la WCAG: de 1 a 21. */
  private contrasteEntre(uno: string, otro: string): number {
    const a = this.luz(uno);
    const b = this.luz(otro);
    if (a === null || b === null) { return 21; }
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }

  /** La luminancia de un «#rrggbb»; null si no es un color. */
  private luz(hex: string): number | null {
    const n = parseInt((hex || '').replace('#', ''), 16);
    if (isNaN(n)) { return null; }

    const canal = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    return 0.2126 * canal(((n >> 16) & 255) / 255)
         + 0.7152 * canal(((n >> 8) & 255) / 255)
         + 0.0722 * canal((n & 255) / 255);
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

  alternarSeccion(clave: string): void {
    this.abierta = this.abierta === clave ? null : clave;
    if (this.abierta) { this.vistas.add(this.abierta); }
  }

  // ================================================================
  // GUARDAR
  // ================================================================

  async alternarActivo(s: SeccionInicioModel, evento: Event): Promise<void> {
    evento.stopPropagation();
    if (!this.puedeEditar || this.trabajando) { return; }
    if (this._seguridadService.isexpired()) { return; }

    await this.accion(() => this._inicioService.activarSeccion(s.clave));
  }

  async guardarSeccion(s: SeccionInicioModel): Promise<void> {
    if (!this.puedeEditar || this.guardando) { return; }
    if (this._seguridadService.isexpired()) { return; }

    const f = this.formularios[s.clave];
    f.markAllAsTouched();
    if (f.invalid) {
      this._toastr.error('Revise los campos.', 'No se puede guardar',
                         { timeOut: 15000, closeButton: true });
      return;
    }

    const v = f.getRawValue();
    const limpio = (x: any) => (x ?? '').toString().trim() || null;

    const desde = limpio(v.desde);
    const hasta = limpio(v.hasta);
    if (desde && hasta && hasta < desde) {
      this._toastr.error('La fecha «hasta» es anterior a la de «desde».', 'Las fechas van al revés',
                         { timeOut: 15000, closeButton: true });
      return;
    }

    this.guardando = s.clave;
    try {
      const conRotulo = this.vista(s).rotulo !== 'ninguno';

      const res: any = await firstValueFrom(this._inicioService.editSeccion(s.clave, {
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
        activo:        s.activo,
        desde,
        hasta,
      }));

      this._toastr.success(res?.message ?? 'Guardado', 'Listo');
      this.pintar(res?.data);
      this.ponerAlDia(s.clave, res?.data);

    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo guardar', 'Error',
                         { timeOut: 20000, closeButton: true });
    } finally {
      this.guardando = null;
    }
  }

  /** El formulario de la sección que se acaba de guardar, con lo que quedó. */
  private ponerAlDia(clave: string, data: SeccionInicioModel[] | null | undefined): void {
    const s = (data ?? []).find(x => x.clave === clave);
    if (!s) { return; }

    this.formularios[clave].patchValue({
      titulo:    s.titulo ?? '',
      subtitulo: s.subtitulo ?? '',
      tamano:    s.estilo?.tamano ?? 'normal',
      color:     s.estilo?.color ?? '',
      fuente:    s.estilo?.fuente ?? 'titulos',
      alto:      s.alto ?? 'normal',
      desde:     s.desde ?? '',
      hasta:     s.hasta ?? '',
    });
  }

  async soltar(evento: CdkDragDrop<SeccionInicioModel[]>): Promise<void> {
    if (!this.puedeEditar || evento.previousIndex === evento.currentIndex) { return; }

    moveItemInArray(this.secciones, evento.previousIndex, evento.currentIndex);
    await this.accion(() => this._inicioService.ordenarSecciones(this.secciones.map(s => s.clave)), false);
  }

  /** Una galería de dentro cambió: la cuenta de su sección ya no vale. */
  async galeriaCambiada(): Promise<void> {
    try {
      const res: any = await firstValueFrom(this._inicioService.allInicio());
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
