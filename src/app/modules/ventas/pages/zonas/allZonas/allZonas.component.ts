import { AfterViewInit, Component, ElementRef, HostListener, NgZone, OnDestroy, OnInit, ViewChild, ChangeDetectionStrategy } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { AgGridModule, ICellRendererAngularComp } from 'ag-grid-angular';
import { CellClickedEvent, GridApi, GridReadyEvent, RowClassParams } from 'ag-grid-community';
import { ActivatedRoute, Router } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';
import Swal from 'sweetalert2';

import { PanelComponent } from '../../../../../components/panel/panel.component';
import { ActionButtonsComponent } from '../../../../../components/botones/action-buttons/action-buttons.component';
import { AvisoComponent } from '../../../../../components/campos/aviso/aviso.component';
import { AsignacionClienteMasivaComponent } from '../../gestion-clientes/asignacionClienteMasiva/asignacionClienteMasiva.component';
import { AppAgGridService } from '../../../../../service/app-agGrid.service';
import { GoogleMapsLoaderService } from '../../../../../service/google-maps-loader.service';
import { LugaresGoogleService, SugerenciaLugar } from '../../../../../service/lugares-google.service';
import { AccesoModel } from '../../../../seguridad/interfaces/accesoModel';
import { ZonaService } from '../../../services/zona.service';
import { ClienteDeZona, ClienteUbicado, PuntoZona, TipoZona, ZonaModel } from '../../../interfaces/zonaModel';
import { FilasEstirablesDirective } from '../../../../../core/directives/filasEstirables.directive';
import { CommonModule } from '@angular/common';

/** Lo que se está editando en el formulario de la derecha. */
interface Borrador {
  id: number | null;
  nombre: string;
  descripcion: string;
  pais: string;
  provincia: string;
  canton: string;
  color: string;
  tipo: TipoZona;
  vertices: PuntoZona[] | null;
  centro_lat: number | null;
  centro_lng: number | null;
  radio_metros: number | null;
  activo: boolean;
}

/** Radio con el que nace un círculo al pulsar el mapa; después se ajusta. */
const RADIO_INICIAL = 1000;

/**
 * ZONAS DE CLIENTES
 *
 * Se dibuja un área en el mapa —un polígono o un círculo— y el servidor dice
 * qué clientes caen dentro. Sirve para repartir carteras por territorio,
 * planear una ruta de visitas o ver dónde no se está llegando.
 *
 * A QUÉ ZONA PERTENECE UN CLIENTE NO SE GUARDA: se calcula cada vez. Por eso
 * mover un vértice cambia la respuesta sin tocar ni un cliente, y por eso dos
 * zonas pueden solaparse sin que nada se contradiga.
 *
 * LA GEOMETRÍA LA RESUELVE LA BASE y no el navegador: aquí sólo se dibuja y
 * se manda la forma. Si la contara el navegador habría que traerse los
 * ochenta mil clientes para preguntar por cada uno.
 *
 * EL DIBUJO ES A MANO, NO CON DrawingManager. Esa herramienta de Google
 * —la que daba los botones de polígono y círculo— está RETIRADA desde la
 * versión 3.65 de la Maps JavaScript API, y el cargador de la aplicación pide
 * `v=weekly`: la clase todavía aparece, pero construirla lanza una excepción
 * y la pantalla no llega a abrirse. Comprobado contra la API de verdad.
 * Lo que sigue funcionando —y es lo que se usa aquí— son los clics en el mapa,
 * `Polyline` para ir enseñando el trazo, y `Polygon`/`Circle` con
 * `editable: true`, que son los que traen los tiradores para corregir.
 *
 * El mapa es propio y no `app-ubicacion-google-maps`: aquél sirve para elegir
 * UN punto y trae buscador, Street View y capturas. Lo que se comparte es lo
 * que vale la pena, que es GoogleMapsLoaderService —la clave y la carga del
 * script, una sola vez para toda la aplicación—.
 */
@Component({
  selector: 'app-allZonas',
  standalone: true,
  imports: [
    CommonModule,FormsModule, AgGridModule, FilasEstirablesDirective, PanelComponent, AvisoComponent],
  templateUrl: './allZonas.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./allZonas.component.css'],
})
export class AllZonasComponent implements OnInit, AfterViewInit, OnDestroy {

  @ViewChild('mapa') mapaDiv!: ElementRef<HTMLDivElement>;

  public accesoModel: AccesoModel;

  // ---------- Estado de la API ----------
  public estadoApi: 'cargando' | 'listo' | 'sin-clave' | 'error' = 'cargando';
  public errorApi = '';

  // ---------- Datos ----------
  public zonas: ZonaModel[] = [];
  public elegida: ZonaModel | null = null;
  public clientes: ClienteDeZona[] = [];
  public cargando = false;
  public cargandoClientes = false;
  public guardando = false;

  // ---------- Los clientes, como puntos en el mapa ----------
  /**
   * TODOS los que tienen coordenadas, no sólo los de la zona elegida: para
   * dibujar un polígono alrededor de un grupo hay que ver antes dónde están.
   */
  public ubicados: ClienteUbicado[] = [];
  public ubicadosRecortado = false;
  public verClientes = true;

  /** Los que caen en la zona elegida, para pintarlos distinto. */
  private idsEnZona = new Set<number>();

  /**
   * De qué color se pintan los clientes.
   *
   * Se elige porque depende del mapa que se tenga debajo: sobre satélite el
   * azul se pierde y sobre callejero el amarillo no se ve. Se recuerda en el
   * navegador —es una comodidad de quien mira, no un dato del sistema—, y si
   * el navegador no deja guardar, se usa el de por defecto y ya está.
   */
  /** Mientras se le pregunta a Google en qué provincia cae la zona. */
  public buscandoTerritorio = false;

  public colorPuntos = '#E53935';
  public paletaAbierta = false;

  /**
   * LA paleta. La misma para el color de una zona y para el de los puntos.
   *
   * Era una de siete para cada cosa, y mantener dos listas de colores en la
   * misma pantalla sólo sirve para que acaben distintas. Son diecinueve tonos
   * elegidos para distinguirse entre sí sobre un mapa: los claros de más se
   * pierden sobre el callejero y los oscuros de más, sobre el satélite.
   *
   * El orden importa: el primero es el que se pone por defecto a una zona
   * nueva, y es el color de la aplicación.
   */
  public readonly colores: { color: string; nombre: string }[] = [
    { color: '#00ACAC', nombre: 'Turquesa' },
    { color: '#0E8C8C', nombre: 'Verde azulado' },
    { color: '#348FE2', nombre: 'Azul' },
    { color: '#1B5FBF', nombre: 'Azul marino' },
    { color: '#00A3E0', nombre: 'Celeste' },
    { color: '#8753DE', nombre: 'Morado' },
    { color: '#5B3FA8', nombre: 'Índigo' },
    { color: '#C837AB', nombre: 'Magenta' },
    { color: '#E91E63', nombre: 'Rosa' },
    { color: '#E53935', nombre: 'Rojo' },
    { color: '#FF5B57', nombre: 'Coral' },
    { color: '#F59C1A', nombre: 'Naranja' },
    { color: '#C87F0A', nombre: 'Ámbar' },
    { color: '#32A932', nombre: 'Verde' },
    { color: '#0E7A4B', nombre: 'Verde oscuro' },
    { color: '#7CB342', nombre: 'Lima' },
    { color: '#795548', nombre: 'Marrón' },
    { color: '#6C757D', nombre: 'Gris' },
    { color: '#212529', nombre: 'Negro' },
  ];

  /**
   * La de los puntos es la misma lista.
   *
   * Se deja el nombre para no tener que tocar la plantilla ni el guardado del
   * color elegido; apunta al mismo sitio, así que añadir un color lo añade en
   * los dos sitios a la vez.
   */
  public readonly coloresPunto = this.colores;

  /** Dónde se recuerda el color elegido. */
  private static readonly CLAVE_COLOR = 'miCRM3.zonas.colorPuntos';

  // ---------- El divisor entre las dos columnas ----------
  /**
   * Qué porcentaje del ancho se lleva el mapa.
   *
   * Se arrastra porque según lo que se esté haciendo manda una cosa u otra:
   * dibujando, el mapa; repasando qué zonas hay, la rejilla. Un reparto fijo
   * obliga siempre a uno de los dos a trabajar incómodo.
   */
  public anchoIzquierda = 58;
  public arrastrando = false;

  private static readonly ANCHO_POR_DEFECTO = 58;
  /** Lo que se deja respirar debajo del panel, en píxeles. */
  private static readonly MARGEN_ABAJO = 12;

  /** Lo ultimo que se calculo, para no reescribir la variable en cada resize. */
  private altoCajas = 0;

  private static readonly ANCHO_MIN = 25;
  private static readonly ANCHO_MAX = 75;
  private static readonly CLAVE_ANCHO = 'miCRM3.zonas.anchoIzquierda';

  /** Los oyentes del arrastre viven en el documento: el ratón se sale de la barra. */
  private alMover = (e: MouseEvent) => this.moviendo(e);
  private alSoltar = () => this.terminarArrastre();

  // ---------- El formulario ----------
  public borrador: Borrador | null = null;

  // ---------- La rejilla de zonas ----------
  /**
   * AQUÍ LOS FILTROS SÍ LOS APLICA ag-Grid, y no el servidor.
   *
   * Es al revés que en los listados de clientes o gestiones: aquéllos paginan
   * en el servidor y la rejilla sólo tiene las filas de la página, así que
   * filtrar en el navegador buscaría dentro de quince. Las zonas llegan TODAS
   * de una vez —son decenas, no miles—, así que el filtro nativo de la
   * cabecera es el correcto y además no hay que ir al servidor por cada letra.
   */
  public gridApi!: GridApi;
  public columnDefs: any[] = [];

  /** Las desactivadas, atenuadas y tachadas, como en el resto de listados. */
  public rowClassRules = {
    'fila-inactiva': (p: RowClassParams) => p.data?.activo === false,
  };

  navegarConTeclado = this._appAgGridService.navegacionConFlechas();

  /** Qué se está dibujando ahora mismo, si es que se está dibujando algo. */
  public dibujando: TipoZona | null = null;

  /** Los puntos puestos hasta ahora en el polígono que se está dibujando. */
  public puntos: PuntoZona[] = [];

  // ---------- Buscar un sitio en el mapa ----------
  /**
   * Esto NO dibuja nada: sólo lleva el mapa a donde se le diga.
   *
   * Dibujar un área sobre Manta obligaba a arrastrar y acercar el mapa hasta
   * encontrarla, partiendo de todo Ecuador. Se escribe «Manta», se pulsa, y
   * el mapa se planta encima con el encuadre que da Google.
   */
  public busqueda = '';
  public sugerencias: SugerenciaLugar[] = [];
  public sugerenciaActiva = -1;
  public buscando = false;

  private timerBusqueda: any = null;
  /** Cada búsqueda lleva número: si llega una vieja después, se descarta. */
  private ultimaBusqueda = 0;

  // ---------- Google Maps ----------
  private gm: any = null;
  private mapa: any = null;
  private geocoder: any = null;
  /** La figura de cada zona pintada, por id, para poder quitarla o resaltarla. */
  private figuras = new Map<number, any>();
  /**
   * La figura que se está dibujando o retocando ahora.
   *
   * Puede ser una recién dibujada o LA DE UNA ZONA GUARDADA, puesta editable
   * para arrastrar sus puntos. En los dos casos es de aquí de donde sale lo
   * que se guarda, así que `formaDeLaFigura()` no tiene que distinguirlas.
   */
  private figuraNueva: any = null;

  /** Si la figura editable es la de una zona guardada (no una nueva). */
  private editandoLaDeLaZona = false;

  /**
   * Los puntos de los clientes, en una capa de datos y no en mil marcadores.
   *
   * `google.maps.Data` está hecha para esto: mil puntos entran en 9 ms y se
   * quitan en 4 (comprobado contra la API real). Mil `Marker` se notan al
   * arrastrar el mapa.
   */
  private capaClientes: any = null;
  private globo: any = null;        // InfoWindow: quién es el punto pulsado

  // Lo que vive sólo mientras se dibuja
  private trazo: any = null;              // la Polyline que va enseñando el camino
  private marcasTrazo: any[] = [];        // un puntito por esquina puesta
  private oyenteClic: any = null;
  private oyenteDobleClic: any = null;

  constructor(
    private host: ElementRef<HTMLElement>,
    private _zonas: ZonaService,
    private _loader: GoogleMapsLoaderService,
    public _appAgGridService: AppAgGridService,
    private _lugares: LugaresGoogleService,
    private _toastr: ToastrService,
    private _modal: NgbModal,
    private zone: NgZone,
    private route: Router,
    private activeRoute: ActivatedRoute,
  ) {
    this.accesoModel = this.activeRoute.snapshot.data['access'];
  }

  ngOnInit(): void {
    this.leerColorGuardado();
    this.leerAnchoGuardado();
    this.armarColumnas();
    this.cargarZonas();
  }

  // ================================================================
  // EL DIVISOR
  // ================================================================

  private leerAnchoGuardado(): void {
    try {
      const guardado = Number(localStorage.getItem(AllZonasComponent.CLAVE_ANCHO));
      if (Number.isFinite(guardado) && guardado >= AllZonasComponent.ANCHO_MIN
          && guardado <= AllZonasComponent.ANCHO_MAX) {
        this.anchoIzquierda = guardado;
      }
    } catch {
      // Ventana privada o almacenamiento bloqueado: se queda el reparto normal
    }
  }

  private guardarAncho(): void {
    try { localStorage.setItem(AllZonasComponent.CLAVE_ANCHO, String(Math.round(this.anchoIzquierda))); }
    catch { /* da igual */ }
  }

  empezarArrastre(e: MouseEvent): void {
    e.preventDefault();          // o el navegador intenta seleccionar texto
    this.arrastrando = true;
    document.addEventListener('mousemove', this.alMover);
    document.addEventListener('mouseup', this.alSoltar);
  }

  /**
   * Mientras se arrastra.
   *
   * Fuera de la zona de Angular: son decenas de eventos por segundo y cada
   * uno dispararía un repaso entero de la pantalla. Lo único que cambia es
   * una variable CSS, que se escribe a mano; al soltar se vuelve a entrar.
   */
  private moviendo(e: MouseEvent): void {
    const caja = this.mapaDiv?.nativeElement?.closest('.zon-paneles') as HTMLElement | null;
    if (!caja) { return; }

    const r = caja.getBoundingClientRect();
    if (r.width < 1) { return; }

    const pct = ((e.clientX - r.left) / r.width) * 100;
    this.anchoIzquierda = Math.min(AllZonasComponent.ANCHO_MAX,
                          Math.max(AllZonasComponent.ANCHO_MIN, pct));
    caja.style.setProperty('--zon-izq', this.anchoIzquierda + '%');
  }

  private terminarArrastre(): void {
    if (!this.arrastrando) { return; }
    document.removeEventListener('mousemove', this.alMover);
    document.removeEventListener('mouseup', this.alSoltar);

    this.zone.run(() => {
      this.arrastrando = false;
      this.guardarAncho();
      // La rejilla reparte el ancho de sus columnas al montarse: si no se le
      // dice, al estrechar la columna se queda con las de antes y aparece
      // una barra de desplazamiento donde no hacía falta.
      setTimeout(() => this.gridApi?.sizeColumnsToFit(), 0);
    });
  }

  /** Con el teclado: flechas de 2 en 2, Inicio/Fin a los topes. */
  moverDivisorConTeclado(e: KeyboardEvent): void {
    const paso = e.shiftKey ? 10 : 2;
    let nuevo = this.anchoIzquierda;

    if (e.key === 'ArrowLeft')       { nuevo -= paso; }
    else if (e.key === 'ArrowRight') { nuevo += paso; }
    else if (e.key === 'Home')       { nuevo = AllZonasComponent.ANCHO_MIN; }
    else if (e.key === 'End')        { nuevo = AllZonasComponent.ANCHO_MAX; }
    else { return; }

    e.preventDefault();
    this.anchoIzquierda = Math.min(AllZonasComponent.ANCHO_MAX,
                          Math.max(AllZonasComponent.ANCHO_MIN, nuevo));
    this.guardarAncho();
    setTimeout(() => this.gridApi?.sizeColumnsToFit(), 0);
  }

  /**
   * El panel se maximizó (o volvió a su sitio).
   *
   * El mapa se adapta solo —la API de Google observa el tamaño de su caja—,
   * pero la rejilla reparte el ancho de sus columnas al montarse y se queda
   * con el de antes. Se le dice después del repintado, que es cuando la caja
   * ya tiene su tamaño nuevo.
   *
   * Y al VOLVER de maximizado hay que medir otra vez: mientras estaba
   * maximizado mandaba el flex y la medida de antes se quedó vieja.
   */
  alExpandirPanel(): void {
    setTimeout(() => {
      this.gridApi?.sizeColumnsToFit();
      this.ajustarAlto();
    }, 0);
  }

  /** Al cambiar la ventana, el hueco de debajo del panel cambia con ella. */
  @HostListener('window:resize')
  alCambiarVentana(): void { this.ajustarAlto(); }

  /**
   * El alto de las cajas, MEDIDO.
   *
   * No se calcula restando una cifra a `100vh`: lo que hay encima del panel
   * —miga de pan en una línea o en dos, el aviso de recorte, la cabecera, los
   * márgenes del tema— cambia, y cualquier número que se ponga aquí se queda
   * corto o se pasa en alguna pantalla. Lo que sí se puede medir es dónde
   * EMPIEZA la caja y qué pone el panel por debajo de ella.
   *
   * SE SUMA EL SCROLL para quedarse con la posición en el documento: medida
   * con la página bajada, `top` ya no es lo que hay encima, y las cajas
   * crecerían de más. Así el resultado no depende de por dónde vaya la
   * página, y no hace falta llamar a esto dos veces para que converja.
   *
   * MAXIMIZADO NO SE TOCA: ahí manda la cadena de flex del CSS, que ya estira
   * hasta el fondo. Y la medida va en una variable del host, no en un estilo
   * del elemento: un estilo en línea ganaría a esa cadena y rompería lo otro.
   */
  private ajustarAlto(): void {
    const raiz  = this.host.nativeElement;
    const panel = raiz.querySelector('.panel') as HTMLElement | null;
    const caja  = raiz.querySelector('.zon-caja') as HTMLElement | null;
    if (!panel || !caja) { return; }
    if (panel.classList.contains('panel-expand')) { return; }

    const rCaja  = caja.getBoundingClientRect();
    const rPanel = panel.getBoundingClientRect();

    const arriba = rCaja.top + window.scrollY;          // dónde empieza la caja
    const debajo = rPanel.bottom - rCaja.bottom;        // lo que el panel pone bajo ella
    const alto   = Math.round(window.innerHeight - arriba - debajo
                              - AllZonasComponent.MARGEN_ABAJO);

    if (alto === this.altoCajas) { return; }
    this.altoCajas = alto;
    raiz.style.setProperty('--zon-alto', `${alto}px`);
  }

  repartirPorDefecto(): void {
    this.anchoIzquierda = AllZonasComponent.ANCHO_POR_DEFECTO;
    this.guardarAncho();
    setTimeout(() => this.gridApi?.sizeColumnsToFit(), 0);
  }

  // ================================================================
  // LOS CLIENTES DE LA ZONA, EN SU VENTANA
  // ================================================================

  /**
   * Abre el reparto en bloque, acotado a la zona elegida.
   *
   * Es EL MISMO componente de Ventas > Reparto de Clientes, no una copia:
   * mil setecientas líneas entre plantilla, estilos y lógica que no tiene
   * sentido duplicar para cambiarles un filtro. Se le pasan dos cosas —la
   * zona y que viene en modal— y lo demás es idéntico, así que lo que se
   * arregle allí se arregla aquí.
   *
   * Y así de una vez se reparte: se dibuja el área, se ve quién cae dentro y
   * se les pone vendedor, cobrador, asistente o postventa sin salir del mapa.
   */
  abrirClientes(): void {
    if (!this.elegida) { return; }

    const ref = this._modal.open(AsignacionClienteMasivaComponent, {
      size: 'xl', centered: true, scrollable: true, backdrop: 'static',
    });
    ref.componentInstance.zonaId = this.elegida.id;
    ref.componentInstance.zonaNombre = this.elegida.nombre;
    ref.componentInstance.enModal = true;

    // Repartir no cambia quién cae en la zona —eso lo decide la coordenada,
    // no el responsable—, así que no hay nada que recargar aquí al cerrar.
    ref.result.catch(() => { /* se cerró sin más */ });
  }

  // ================================================================
  // LA REJILLA
  // ================================================================

  private armarColumnas(): void {
    this.columnDefs = [
      {
        headerName: 'Zona', field: 'nombre', minWidth: 120, flex: 2, floatingFilter: true,
        tooltipField: 'nombre',
        // La pastilla del color va con el nombre y no en su propia columna:
        // es como se reconoce la zona en el mapa, no un dato que se filtre.
        cellRenderer: (p: any) =>
          `<span class="zon-celda-zona">`
          + `<span class="zon-celda-zona__color" style="background-color:${p.data?.color || '#00ACAC'}"></span>`
          + `<span class="zon-celda-zona__texto">${p.value ?? ''}</span></span>`,
      },
      { headerName: 'Provincia', field: 'provincia', minWidth: 92, flex: 1, tooltipField: 'provincia', floatingFilter: true },
      { headerName: 'Cantón',    field: 'canton',    minWidth: 92, flex: 1, tooltipField: 'canton', floatingFilter: true },
      {
        headerName: 'Forma', field: 'tipo', minWidth: 75, maxWidth: 110, floatingFilter: true,
        // Se filtra por «Círculo» o «Polígono», que es lo que se ve; el
        // detalle (cuántos puntos, cuántos km) va en el tooltip.
        valueGetter: (p: any) => p.data?.tipo === 'CIRCULO' ? 'Círculo' : 'Polígono',
        tooltipValueGetter: (p: any) => p.data ? this.formaLegible(p.data) : '',
      },
      {
        headerName: 'Clientes', field: 'clientes', minWidth: 68, maxWidth: 90,
        filter: 'agNumberColumnFilter', floatingFilter: true,
        cellStyle: { textAlign: 'center' },
      },
      {
        // La misma columna que el resto de rejillas: botones de
        // <app-action-buttons> y cabecera que la pliega.
        //
        // Antes los botones se escribían a mano con `class="btn-icon"`, y esa
        // clase vive DENTRO de action-buttons.component.scss: es CSS con
        // alcance de ese componente, así que aquí no llegaba y los botones
        // salían pelados. Usando el componente de verdad vienen con su
        // estilo, sus colores por acción y su `disabled` según el perfil.
        headerName: 'ACCIONES',
        field: 'actions',
        cellStyle: { display: 'flex', justifyContent: 'center', alignItems: 'center' },
        cellRenderer: ButtonAccionZona,
        // La pantalla va POR PARAMETRO y no por inyeccion, que es como lo
        // resuelve allClientes. Alli el renderer se declara en un NgModule;
        // esta pantalla es standalone y seria la primera en pedirle a
        // ag-Grid que le inyecte el componente de acogida. Eso depende de
        // con que inyector cree la celda, y una suposicion que falla no se
        // ve hasta que alguien abre la pantalla. Pasarla a mano no depende
        // de nada de eso.
        cellRendererParams: { pantalla: this },
        pinned: 'right',
        minWidth: AllZonasComponent.ANCHO_ACCIONES_ABIERTA,
        maxWidth: AllZonasComponent.ANCHO_ACCIONES_ABIERTA,
        suppressHeaderMenuButton: true,
        sortable: false,
        filter: false,
        resizable: false,
        suppressMovable: true,
        headerComponentParams: {
          template: `
            <div style="display: flex; align-items: center; justify-content: center; gap: 5px;" title="Ocultar los botones de acción">
              <span>ACCIONES</span>
              <i class="fas fa-arrow-right"></i>
            </div>
          `
        }
      },
    ];
  }

  // ================================================================
  // PLEGAR LA COLUMNA ACCIONES
  // ================================================================
  //
  // Igual que en el listado de clientes: pulsando su cabecera la columna se
  // encoge a un botón, para dejarle el ancho a los datos en pantallas
  // estrechas. El oyente va en el DOM y no en la plantilla porque la cabecera
  // la dibuja ag-Grid.

  private static readonly ANCHO_ACCIONES_ABIERTA = 80;
  private static readonly ANCHO_ACCIONES_PLEGADA = 50;

  /** true mientras la columna está plegada; lo mira el renderer de la celda. */
  public accionesPlegadas = false;

  /** Pliega o despliega la columna ACCIONES. */
  toggleActionsColumn(): void {
    if (!this.gridApi) { return; }
    const columnDefs = this.gridApi.getColumnDefs() as any[];
    const actionsCol = columnDefs.find(c => c.field === 'actions');
    if (!actionsCol) { return; }

    const estabaPlegada = actionsCol.minWidth === AllZonasComponent.ANCHO_ACCIONES_PLEGADA;
    this.accionesPlegadas = !estabaPlegada;

    const ancho = estabaPlegada ? AllZonasComponent.ANCHO_ACCIONES_ABIERTA
                                : AllZonasComponent.ANCHO_ACCIONES_PLEGADA;
    actionsCol.minWidth = ancho;
    actionsCol.maxWidth = ancho;
    actionsCol.headerComponentParams = {
      template: estabaPlegada
        ? `<div style="display: flex; align-items: center; justify-content: center; gap: 5px;" title="Ocultar los botones de acción">
            <span>ACCIONES</span>
            <i class="fas fa-arrow-right"></i>
          </div>`
        : `<div style="display: flex; align-items: center; justify-content: center;" title="Mostrar los botones de acción">
            <i class="fas fa-bars"></i>
          </div>`
    };

    this.gridApi.setGridOption('columnDefs', columnDefs);
    // La cabecera se vuelve a dibujar, así que el oyente de antes se va con
    // ella y hay que ponerlo en la nueva.
    setTimeout(() => this.montarListenerCabecera(), 100);
  }

  /** Referencias estables, para poder quitar lo que se puso. */
  private cabeceraAcciones: Element | null = null;
  private readonly alPulsarCabecera: EventListener = () => this.toggleActionsColumn();
  private readonly alTocarCabecera: EventListener = (e) => { this.toggleActionsColumn(); e.preventDefault(); };

  private montarListenerCabecera(): void {
    this.quitarListenerCabecera();
    this.cabeceraAcciones = this.host.nativeElement.querySelector('.ag-header-cell[col-id="actions"]');
    if (!this.cabeceraAcciones) { return; }
    this.cabeceraAcciones.addEventListener('click', this.alPulsarCabecera);
    this.cabeceraAcciones.addEventListener('touchend', this.alTocarCabecera);
  }

  private quitarListenerCabecera(): void {
    if (!this.cabeceraAcciones) { return; }
    this.cabeceraAcciones.removeEventListener('click', this.alPulsarCabecera);
    this.cabeceraAcciones.removeEventListener('touchend', this.alTocarCabecera);
    this.cabeceraAcciones = null;
  }

  onGridReady(params: GridReadyEvent): void {
    this.gridApi = params.api;
    this.gridApi.setGridOption('rowData', this.zonas);
    // Medio segundo: la cabecera no está en el DOM en el mismo momento en que
    // la rejilla avisa de que está lista.
    setTimeout(() => this.montarListenerCabecera(), 500);
  }

  /**
   * Un clic en la fila elige la zona.
   *
   * Los botones de ACCIONES no pasan por aquí: los dibuja
   * <app-action-buttons> y avisa por sus propias salidas. Lo único que hace
   * falta es no elegir la zona cuando se pulsó en esa columna —`eliminar`
   * abre una confirmación, y mover el mapa por debajo del aviso despista—.
   */
  onCellClicked(e: CellClickedEvent): void {
    const z = e.data as ZonaModel;
    if (!z) { return; }
    if (e.column?.getColId() === 'actions') { return; }

    this.elegir(z);
  }

  /** El color que se dejó elegido la última vez, si el navegador lo guardó. */
  private leerColorGuardado(): void {
    try {
      const guardado = localStorage.getItem(AllZonasComponent.CLAVE_COLOR);
      // Sólo si sigue estando en la paleta: si mañana se cambia la lista, lo
      // guardado no puede dejar los puntos de un color que ya no se ofrece.
      if (guardado && this.coloresPunto.some(c => c.color === guardado)) {
        this.colorPuntos = guardado;
      }
    } catch {
      // Ventana privada o almacenamiento bloqueado: se queda el de por defecto
    }
  }

  /** Cambia el color de los puntos y lo recuerda. */
  elegirColorPuntos(color: string): void {
    this.colorPuntos = color;
    this.paletaAbierta = false;
    try { localStorage.setItem(AllZonasComponent.CLAVE_COLOR, color); } catch { /* da igual */ }
    this.repintarPuntos();
  }

  alternarPaleta(): void {
    this.paletaAbierta = !this.paletaAbierta;
  }

  async ngAfterViewInit(): Promise<void> {
    // Lo primero, y fuera del camino del mapa: el alto no depende de que
    // Google conteste, y si no hay clave la pantalla se queda corta igual.
    setTimeout(() => this.ajustarAlto(), 0);

    if (!this._loader.hayClave) { this.estadoApi = 'sin-clave'; return; }
    try {
      this.gm = await this._loader.cargar();
      await this.gm.importLibrary('maps');
      await this.gm.importLibrary('marker');
      await this.gm.importLibrary('geometry');
      // Para saber en qué provincia y cantón cae la zona dibujada
      await this.gm.importLibrary('geocoding');
      // El buscador de ciudades y cantones de encima del mapa
      this._lugares.usar(await this.gm.importLibrary('places'));
      // Nada de importLibrary('drawing'): su DrawingManager está retirado
      // desde la 3.65 y aquí se dibuja a mano.
      this.zone.run(() => this.inicializarMapa());
    } catch (e: any) {
      this.zone.run(() => {
        this.estadoApi = e?.message === 'SIN_CLAVE' ? 'sin-clave' : 'error';
        this.errorApi = e?.message ?? 'No se pudo cargar Google Maps';
      });
    }
  }

  ngOnDestroy(): void {
    this.quitarListenerCabecera();
    // Los del arrastre viven en el documento: si la pantalla se va sin
    // soltarlos, se quedan ahí llamando a un componente que ya no existe.
    document.removeEventListener('mousemove', this.alMover);
    document.removeEventListener('mouseup', this.alSoltar);

    clearTimeout(this.timerBusqueda);
    this.soltarOyentes();
    this.limpiarTrazo();
    this.limpiarFiguras();
    this.vaciarCapa();
    this.globo?.close();
    this.mapa = null;
  }

  fun_home(): void { this.route.navigate(['/ventas']); }

  // ================================================================
  // EL MAPA
  // ================================================================

  private inicializarMapa(): void {
    this.mapa = new this.gm.Map(this.mapaDiv.nativeElement, {
      center: { lat: -1.8312, lng: -78.1834 },   // Ecuador
      zoom: 6,
      mapTypeId: 'roadmap',
      mapTypeControl: true,
      streetViewControl: false,
      fullscreenControl: true,
      gestureHandling: 'greedy',                 // rueda del ratón sin Ctrl
      disableDoubleClickZoom: false,
    });

    this.geocoder = new this.gm.Geocoder();
    this.globo = new this.gm.InfoWindow();

    this.capaClientes = new this.gm.Data({ map: this.mapa });
    this.capaClientes.setStyle((f: any) => this.estiloPunto(f));

    // Pulsar un punto dice de quién es. No se abre al pasar por encima: con
    // los puntos pegados unos a otros, el globo iría saltando sin parar.
    this.capaClientes.addListener('click', (ev: any) => this.zone.run(() => {
      this.globo.setContent(
        `<div style="font-size:12px"><b>${ev.feature.getProperty('nombre')}</b>`
        + `<br><span style="color:#6c757d">Cliente ${ev.feature.getProperty('id')}</span></div>`);
      this.globo.setPosition(ev.latLng);
      this.globo.open(this.mapa);
    }));

    this.estadoApi = 'listo';
    this.pintarZonas();
    this.cargarUbicados();
  }

  /** Cómo se pinta una zona. `editable` sólo para la que se está dibujando. */
  private estilo(color: string, editable = false): any {
    return {
      strokeColor: color,
      strokeOpacity: 0.9,
      strokeWeight: 2,
      fillColor: color,
      fillOpacity: 0.18,
      editable,
      draggable: false,
      clickable: true,
    };
  }

  private limpiarFiguras(): void {
    this.figuras.forEach(f => f.setMap(null));
    this.figuras.clear();
    this.figuraNueva?.setMap(null);
    this.figuraNueva = null;
  }

  /** Pinta todas las zonas guardadas. */
  private pintarZonas(): void {
    if (!this.mapa) { return; }
    this.limpiarFiguras();

    for (const z of this.zonas) {
      const color = z.color || '#00ACAC';
      let figura: any;

      if (z.tipo === 'CIRCULO' && z.centro_lat != null && z.centro_lng != null) {
        figura = new this.gm.Circle({
          ...this.estilo(color),
          center: { lat: Number(z.centro_lat), lng: Number(z.centro_lng) },
          radius: Number(z.radio_metros ?? 0),
          map: this.mapa,
        });
      } else if (z.vertices?.length) {
        figura = new this.gm.Polygon({
          ...this.estilo(color),
          paths: z.vertices.map(v => ({ lat: Number(v.lat), lng: Number(v.lng) })),
          map: this.mapa,
        });
      } else {
        continue;
      }

      // Pulsar la zona en el mapa es lo mismo que pulsarla en la lista. Pero
      // no mientras se dibuja: ahí el clic es para poner una esquina.
      figura.addListener('click', () => this.zone.run(() => {
        if (!this.dibujando) { this.elegir(z); }
      }));
      this.figuras.set(z.id, figura);
    }

    this.resaltar();
  }

  /** La elegida se ve más marcada que las demás. */
  private resaltar(): void {
    this.figuras.forEach((f, id) => {
      const esta = this.elegida?.id === id;
      f.setOptions({ fillOpacity: esta ? 0.35 : 0.1, strokeWeight: esta ? 3 : 1.5 });
    });
  }

  /** Encuadra el mapa sobre una zona, usando la caja que da el servidor. */
  private encuadrar(z: ZonaModel): void {
    if (!this.mapa) { return; }
    const caja = new this.gm.LatLngBounds(
      { lat: Number(z.min_lat), lng: Number(z.min_lng) },
      { lat: Number(z.max_lat), lng: Number(z.max_lng) },
    );
    this.mapa.fitBounds(caja, 48);
  }

  // ================================================================
  // BUSCAR UN SITIO (sólo mueve el mapa)
  // ================================================================

  onBusquedaCambia(): void {
    clearTimeout(this.timerBusqueda);
    const q = this.busqueda.trim();
    if (q.length < 3) { this.sugerencias = []; this.sugerenciaActiva = -1; return; }
    // Se espera a que deje de teclear: cada consulta se paga
    this.timerBusqueda = setTimeout(() => this.buscarLugar(q), 300);
  }

  private async buscarLugar(q: string): Promise<void> {
    if (!this._lugares.listo) { return; }
    const marca = ++this.ultimaBusqueda;
    this.buscando = true;
    try {
      // `(cities)`: lo que se quiere ubicar aquí son ciudades y cantones, no
      // portales. Buscar «Manta» no debe traer «Calle Manta 123».
      const lista = await this._lugares.sugerencias(q, this.mapa, ['(cities)']);
      if (marca !== this.ultimaBusqueda) { return; }   // llegó una más nueva
      this.zone.run(() => {
        this.sugerencias = lista;
        this.sugerenciaActiva = lista.length ? 0 : -1;
      });
    } catch (e) {
      console.error('Error al buscar el lugar:', e);
      this.zone.run(() => {
        this.sugerencias = [];
        this._toastr.error('No se pudo buscar. ¿Está habilitada la Places API (New) para la clave?', 'Google Maps');
      });
    } finally {
      if (marca === this.ultimaBusqueda) { this.zone.run(() => { this.buscando = false; }); }
    }
  }

  onBusquedaTecla(ev: KeyboardEvent): void {
    if (!this.sugerencias.length) { return; }
    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      this.sugerenciaActiva = (this.sugerenciaActiva + 1) % this.sugerencias.length;
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      this.sugerenciaActiva = (this.sugerenciaActiva - 1 + this.sugerencias.length) % this.sugerencias.length;
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      if (this.sugerenciaActiva >= 0) { this.irAlLugar(this.sugerencias[this.sugerenciaActiva]); }
    } else if (ev.key === 'Escape') {
      this.limpiarBusqueda();
    }
  }

  /**
   * Lleva el mapa al sitio elegido.
   *
   * Con el `viewport` que da Google, que es la caja del sitio: un cantón se
   * ve entero y una esquina de calle no se queda a vista de país. Si no
   * viniera, se centra y se acerca a mano.
   */
  async irAlLugar(s: SugerenciaLugar): Promise<void> {
    this.sugerencias = [];
    this.sugerenciaActiva = -1;
    this.busqueda = `${s.principal}${s.secundario ? ', ' + s.secundario : ''}`;

    try {
      this.buscando = true;
      await s.place.fetchFields({ fields: ['displayName', 'location', 'viewport'] });
      this.zone.run(() => {
        if (s.place.viewport) { this.mapa?.fitBounds(s.place.viewport, 24); }
        else if (s.place.location) {
          this.mapa?.setCenter({ lat: s.place.location.lat(), lng: s.place.location.lng() });
          this.mapa?.setZoom(13);
        }
      });
    } catch (e) {
      console.error('Error al ir al lugar:', e);
      this._toastr.error('No se pudo ir a ese sitio', 'Google Maps');
    } finally {
      this.buscando = false;
      // Pedir los campos CIERRA la sesión de autocompletado: la siguiente
      // búsqueda tiene que empezar una nueva o se factura mal.
      this._lugares.nuevaSesion();
    }
  }

  limpiarBusqueda(): void {
    clearTimeout(this.timerBusqueda);
    this.busqueda = '';
    this.sugerencias = [];
    this.sugerenciaActiva = -1;
  }

  // ================================================================
  // DIBUJAR A MANO
  // ================================================================

  /**
   * Arranca el modo dibujo.
   *
   * Polígono: cada clic pone una esquina y el trazo se va viendo; se cierra
   * con «Terminar» o con doble clic.
   * Círculo: el clic pone el centro y nace con un radio de un kilómetro, que
   * se ajusta arrastrando el tirador o escribiéndolo en el formulario.
   */
  dibujar(tipo: TipoZona): void {
    if (!this.mapa || this.accesoModel?.crear === false) { return; }

    // Si se estaba retocando una zona guardada, su figura SE QUITA del mapa:
    // dibujar encima de la vieja es justo lo que hacía esto incómodo. Sigue
    // en la base; si se cancela, se vuelve a pintar tal cual estaba.
    if (this.editandoLaDeLaZona && this.figuraNueva) {
      const id = this.borrador?.id ?? null;
      this.figuraNueva.setMap(null);
      if (id !== null) { this.figuras.delete(id); }
      this.editandoLaDeLaZona = false;
      this.figuraNueva = null;
    }

    this.cancelarDibujo();
    this.dibujando = tipo;

    this.oyenteClic = this.mapa.addListener('click', (ev: any) =>
      this.zone.run(() => this.alPulsarElMapa(ev.latLng.lat(), ev.latLng.lng())));

    if (tipo === 'POLIGONO') {
      // Doble clic para cerrar. Se quita el zoom por doble clic mientras
      // tanto, o cerrar el polígono acercaría el mapa de golpe.
      this.mapa.setOptions({ disableDoubleClickZoom: true });
      this.oyenteDobleClic = this.mapa.addListener('dblclick', () =>
        this.zone.run(() => this.terminarPoligono()));
    }
  }

  private soltarOyentes(): void {
    this.oyenteClic?.remove?.();
    this.oyenteDobleClic?.remove?.();
    this.oyenteClic = null;
    this.oyenteDobleClic = null;
    this.mapa?.setOptions({ disableDoubleClickZoom: false });
  }

  /** Quita el trazo a medias (la línea y los puntitos). */
  private limpiarTrazo(): void {
    this.trazo?.setMap(null);
    this.trazo = null;
    this.marcasTrazo.forEach(m => m.setMap(null));
    this.marcasTrazo = [];
    this.puntos = [];
  }

  cancelarDibujo(): void {
    this.dibujando = null;
    this.soltarOyentes();
    this.limpiarTrazo();

    // La de una zona guardada NO se borra aquí: de eso se encarga
    // `soltarEdicion`, que la repinta desde los datos. Si se borrara, cancelar
    // el formulario haría desaparecer una zona que sigue existiendo.
    if (!this.editandoLaDeLaZona) {
      this.figuraNueva?.setMap(null);
      this.figuraNueva = null;
    }
  }

  private alPulsarElMapa(lat: number, lng: number): void {
    if (this.dibujando === 'CIRCULO') { this.ponerCirculo(lat, lng); return; }
    this.ponerEsquina(lat, lng);
  }

  /** Una esquina más del polígono. */
  private ponerEsquina(lat: number, lng: number): void {
    this.puntos.push({ lat, lng });

    const color = this.borrador?.color || this.colores[0].color;
    const camino = this.puntos.map(p => ({ lat: p.lat, lng: p.lng }));

    if (!this.trazo) {
      this.trazo = new this.gm.Polyline({
        path: camino, map: this.mapa,
        strokeColor: color, strokeOpacity: 0.9, strokeWeight: 2,
      });
    } else {
      this.trazo.setPath(camino);
    }

    // Un puntito por esquina: sin esto no se sabe dónde se ha pulsado
    this.marcasTrazo.push(new this.gm.Marker({
      position: { lat, lng }, map: this.mapa, clickable: false,
      icon: {
        path: this.gm.SymbolPath.CIRCLE,
        scale: 4, fillColor: color, fillOpacity: 1,
        strokeColor: '#fff', strokeWeight: 1.5,
      },
    }));
  }

  /** Quita la última esquina puesta. */
  deshacerPunto(): void {
    if (!this.puntos.length) { return; }
    this.puntos.pop();
    this.marcasTrazo.pop()?.setMap(null);
    this.trazo?.setPath(this.puntos.map(p => ({ lat: p.lat, lng: p.lng })));
  }

  /** Cierra el polígono y lo deja editable para retocarlo antes de guardar. */
  terminarPoligono(): void {
    if (this.puntos.length < 3) {
      this._toastr.warning('Un área necesita al menos tres esquinas', 'Zonas');
      return;
    }

    const color = this.borrador?.color || this.colores[0].color;
    const camino = this.puntos.map(p => ({ lat: p.lat, lng: p.lng }));

    this.soltarOyentes();
    this.limpiarTrazo();
    this.dibujando = null;

    this.figuraNueva = new this.gm.Polygon({
      ...this.estilo(color, true),
      paths: camino,
      map: this.mapa,
    });

    this.prepararBorrador('POLIGONO');
    this.rellenarTerritorio();
    this._toastr.info('Área dibujada. Arrastra los puntos para corregirla y ponle nombre.', 'Zonas', { timeOut: 4000 });
  }

  /** El centro del círculo; nace con un kilómetro y se ajusta después. */
  private ponerCirculo(lat: number, lng: number): void {
    const color = this.borrador?.color || this.colores[0].color;

    this.soltarOyentes();
    this.dibujando = null;
    this.figuraNueva?.setMap(null);

    this.figuraNueva = new this.gm.Circle({
      ...this.estilo(color, true),
      center: { lat, lng },
      radius: this.borrador?.radio_metros || RADIO_INICIAL,
      map: this.mapa,
    });

    // Arrastrar el tirador cambia el radio: se refleja en el formulario para
    // poder afinarlo escribiéndolo.
    this.figuraNueva.addListener('radius_changed', () => this.zone.run(() => {
      if (this.borrador) { this.borrador.radio_metros = Math.round(this.figuraNueva.getRadius()); }
    }));

    this.prepararBorrador('CIRCULO');
    if (this.borrador) { this.borrador.radio_metros = Math.round(this.figuraNueva.getRadius()); }
    this.rellenarTerritorio();

    this._toastr.info('Círculo puesto. Ajusta el radio y ponle nombre.', 'Zonas', { timeOut: 4000 });
  }

  /**
   * En qué provincia y cantón cae un punto, según Google.
   *
   * Los mismos tipos de componente que usa el selector de dirección de la
   * ficha del cliente (`administrative_area_level_1` y `_2`), para que una
   * zona y sus clientes escriban «Manabí» igual y se puedan comparar: en esta
   * base no hay catálogo de provincias, son texto libre en los dos sitios.
   *
   * Si Google no contesta no pasa nada: los campos se quedan vacíos y se
   * escriben a mano. No se bloquea el guardado por esto.
   */
  private async territorioDe(lat: number, lng: number): Promise<void> {
    if (!this.geocoder || !this.borrador) { return; }
    this.buscandoTerritorio = true;
    try {
      const { results } = await this.geocoder.geocode({ location: { lat, lng }, language: 'es' });
      const comp: any[] = results?.[0]?.address_components ?? [];

      const de = (...tipos: string[]): string => {
        for (const t of tipos) {
          const c = comp.find((x: any) => (x?.types ?? []).includes(t));
          const texto = c?.long_name ?? c?.longText ?? '';
          if (texto) { return texto; }
        }
        return '';
      };

      this.zone.run(() => {
        if (!this.borrador) { return; }
        this.borrador.pais      = de('country') || 'Ecuador';
        this.borrador.provincia = de('administrative_area_level_1');
        this.borrador.canton    = de('administrative_area_level_2', 'locality');
      });
    } catch (e) {
      // Que no se sepa la provincia no impide guardar la zona
      console.warn('No se pudo averiguar el territorio de la zona:', e);
      this.zone.run(() => this._toastr.warning(
        'No se pudo averiguar la provincia. Prueba con el botón de recalcular.', 'Zonas', { timeOut: 4000 }));
    } finally {
      this.zone.run(() => { this.buscandoTerritorio = false; });
    }
  }

  /**
   * El centro de lo que se va a guardar, para preguntar por él.
   *
   * Si no hay nada a medio dibujar se usa el de la zona elegida, que sale de
   * la caja que calcula el servidor: así una zona dibujada antes de que
   * existieran estos campos se rellena al editarla, sin redibujarla.
   */
  private centroDeLaFigura(): { lat: number; lng: number } | null {
    if (!this.figuraNueva) {
      const z = this.elegida;
      if (!z) { return null; }
      return {
        lat: (Number(z.min_lat) + Number(z.max_lat)) / 2,
        lng: (Number(z.min_lng) + Number(z.max_lng)) / 2,
      };
    }

    if (this.figuraNueva.getRadius) {
      const c = this.figuraNueva.getCenter();
      return { lat: c.lat(), lng: c.lng() };
    }

    // En un polígono, el centro de su caja: no es el centroide exacto, pero
    // para saber la provincia sobra y no hay que recorrer nada dos veces.
    const camino = this.figuraNueva.getPath();
    const caja = new this.gm.LatLngBounds();
    for (let i = 0; i < camino.getLength(); i++) { caja.extend(camino.getAt(i)); }
    const c = caja.getCenter();
    return { lat: c.lat(), lng: c.lng() };
  }

  /** Abre (o actualiza) el formulario con el tipo recién dibujado. */
  private prepararBorrador(tipo: TipoZona): void {
    this.borrador = {
      id: this.borrador?.id ?? null,
      nombre: this.borrador?.nombre ?? '',
      descripcion: this.borrador?.descripcion ?? '',
      pais: this.borrador?.pais ?? 'Ecuador',
      provincia: this.borrador?.provincia ?? '',
      canton: this.borrador?.canton ?? '',
      color: this.borrador?.color ?? this.colores[0].color,
      tipo,
      vertices: null, centro_lat: null, centro_lng: null,
      radio_metros: this.borrador?.radio_metros ?? null,
      activo: this.borrador?.activo ?? true,
    };
  }

  /**
   * Pregunta al mapa en qué provincia y cantón cae la zona.
   *
   * Normalmente SÓLO SI ESTÁN VACÍOS: al abrir una zona que ya los tiene, no
   * hay por qué gastar una consulta ni arriesgarse a cambiar lo que ya estaba
   * bien.
   *
   * Con `forzar` se vuelve a preguntar aunque estén puestos. Es lo que hace
   * el botón de recalcular: los campos no se pueden escribir, así que si
   * Google no contestó la primera vez tiene que haber una segunda.
   */
  rellenarTerritorio(forzar = false): void {
    if (!this.borrador) { return; }
    if (!forzar && this.borrador.provincia && this.borrador.canton) { return; }

    const c = this.centroDeLaFigura();
    if (!c) {
      if (forzar) { this._toastr.info('Dibuja primero el área en el mapa', 'Zonas', { timeOut: 3000 }); }
      return;
    }
    this.territorioDe(c.lat, c.lng);
  }

  /** El radio escrito a mano se lleva al círculo del mapa. */
  alCambiarElRadio(): void {
    const r = Number(this.borrador?.radio_metros ?? 0);
    if (this.figuraNueva?.setRadius && r > 0) { this.figuraNueva.setRadius(r); }
  }

  /** Lee la forma del mapa en el momento de guardar. */
  private formaDeLaFigura(): Partial<Borrador> | null {
    if (!this.figuraNueva) { return null; }

    // Sólo el círculo tiene getRadius; es como se distinguen (comprobado)
    if (this.figuraNueva.getRadius) {
      const c = this.figuraNueva.getCenter();
      return {
        tipo: 'CIRCULO',
        centro_lat: c.lat(), centro_lng: c.lng(),
        radio_metros: Math.round(this.figuraNueva.getRadius()),
        vertices: null,
      };
    }

    const camino = this.figuraNueva.getPath();
    const vertices: PuntoZona[] = [];
    for (let i = 0; i < camino.getLength(); i++) {
      const p = camino.getAt(i);
      vertices.push({ lat: p.lat(), lng: p.lng() });
    }
    return { tipo: 'POLIGONO', vertices, centro_lat: null, centro_lng: null, radio_metros: null };
  }

  // ================================================================
  // CARGA
  // ================================================================

  async cargarZonas(elegirId: number | null = null): Promise<void> {
    try {
      this.cargando = true;
      const res: any = await firstValueFrom(this._zonas.allZonas(true));
      this.zonas = res?.status === 'success' ? (res.data ?? []) : [];

      // La elegida puede haber cambiado de forma o haberse ido
      const id = elegirId ?? this.elegida?.id ?? null;
      this.elegida = id ? (this.zonas.find(z => z.id === id) ?? null) : null;

      this.gridApi?.setGridOption('rowData', this.zonas);
      this.pintarZonas();
      if (this.elegida) { this.cargarClientes(this.elegida); } else { this.clientes = []; this.repintarPuntos(); }
    } catch (e) {
      console.error('Error al cargar las zonas:', e);
      this.zonas = [];
    } finally {
      this.cargando = false;
    }
  }

  async cargarClientes(z: ZonaModel): Promise<void> {
    try {
      this.cargandoClientes = true;
      const res: any = await firstValueFrom(this._zonas.clientesDeZona(z.id));
      this.clientes = res?.status === 'success' ? (res.data?.data ?? []) : [];
      this.repintarPuntos();
    } catch (e) {
      console.error('Error al cargar los clientes de la zona:', e);
      this.clientes = [];
      this.repintarPuntos();
    } finally {
      this.cargandoClientes = false;
    }
  }

  /** Trae todos los clientes con coordenadas y los pinta. */
  async cargarUbicados(): Promise<void> {
    try {
      const res: any = await firstValueFrom(this._zonas.clientesUbicados());
      if (res?.status !== 'success') { return; }
      this.ubicados = res.data?.data ?? [];
      this.ubicadosRecortado = !!res.data?.meta?.recortado;
      this.pintarUbicados();

      // Ese aviso es una franja más encima de las cajas: hay que volver a
      // medir o se sale por abajo justo lo que ocupa.
      if (this.ubicadosRecortado) { setTimeout(() => this.ajustarAlto(), 0); }
    } catch (e) {
      console.error('Error al cargar los clientes ubicados:', e);
    }
  }

  private vaciarCapa(): void {
    if (!this.capaClientes) { return; }
    const fuera: any[] = [];
    this.capaClientes.forEach((f: any) => fuera.push(f));
    fuera.forEach(f => this.capaClientes.remove(f));
  }

  /** Vuelca los puntos en la capa, en GeoJSON. */
  private pintarUbicados(): void {
    if (!this.capaClientes) { return; }
    this.vaciarCapa();
    if (!this.verClientes || !this.ubicados.length) { return; }

    this.capaClientes.addGeoJson({
      type: 'FeatureCollection',
      features: this.ubicados.map(c => ({
        type: 'Feature',
        properties: { id: c.id, nombre: c.nombre, activo: c.activo },
        // GeoJSON va [lng, lat], al revés que Google. Es el error clásico:
        // si se invierte, Ecuador se va a la India.
        geometry: { type: 'Point', coordinates: [Number(c.lng), Number(c.lat)] },
      })),
    });
  }

  /**
   * Cómo se pinta cada punto.
   *
   * Los de la zona elegida, más gordos y del color de la zona; los demás,
   * discretos. Un cliente desactivado sale en gris: sigue estando ahí, pero
   * no es con quien se cuenta al repartir.
   */
  private estiloPunto(f: any): any {
    const enZona = this.idsEnZona.has(Number(f.getProperty('id')));
    const activo = f.getProperty('activo') !== false;
    // El gris de los desactivados NO se elige: es un dato, no un gusto. Lo
    // que se elige es el color de los que sí cuentan.
    const color = enZona ? (this.elegida?.color || '#00ACAC')
                         : (activo ? this.colorPuntos : '#ADB5BD');

    return {
      icon: {
        path: this.gm.SymbolPath.CIRCLE,
        scale: enZona ? 6 : 3.5,
        fillColor: color,
        fillOpacity: enZona ? 1 : 0.75,
        strokeColor: '#fff',
        strokeWeight: enZona ? 1.5 : 1,
      },
      // Los de la zona, por encima de los demás
      zIndex: enZona ? 2 : 1,
    };
  }

  /** Vuelve a mirar el estilo de cada punto (cambió la zona elegida). */
  private repintarPuntos(): void {
    this.idsEnZona = new Set(this.clientes.map(c => Number(c.id)));
    this.capaClientes?.setStyle((f: any) => this.estiloPunto(f));
  }

  /** El interruptor de «ver los clientes». */
  alternarClientes(): void {
    this.verClientes = !this.verClientes;
    this.pintarUbicados();
    this.repintarPuntos();
  }

  // ================================================================
  // ELEGIR, CREAR, EDITAR
  // ================================================================

  elegir(z: ZonaModel): void {
    // Veníamos de retocar otra: se deja como estaba antes de cambiar
    if (this.editandoLaDeLaZona) { this.soltarEdicion(); }

    this.elegida = z;
    this.borrador = null;
    this.cancelarDibujo();
    this.resaltar();
    this.encuadrar(z);
    this.cargarClientes(z);
  }

  /** Empieza una zona nueva: primero el formulario, después se dibuja. */
  nueva(): void {
    if (this.accesoModel?.crear === false) { return; }
    this.elegida = null;
    this.clientes = [];
    this.repintarPuntos();
    this.resaltar();
    this.cancelarDibujo();
    this.borrador = {
      id: null, nombre: '', descripcion: '', pais: 'Ecuador', provincia: '', canton: '',
      color: this.colores[0].color,
      tipo: 'POLIGONO', vertices: null, centro_lat: null, centro_lng: null,
      radio_metros: null, activo: true,
    };
  }

  /**
   * Modifica la elegida.
   *
   * LA FORMA SE RETOCA EN EL SITIO: la figura de la zona se pone editable y
   * se arrastran sus puntos (y los del medio de cada lado, que Google añade
   * para partirlo). Antes había que redibujarla entera, y encima la vieja
   * seguía pintada estorbando.
   *
   * Si lo que se quiere es empezar de cero, está «Redibujar», que la quita
   * del mapa antes de nada.
   */
  editar(z: ZonaModel): void {
    if (this.accesoModel?.editar === false) { return; }
    this.elegir(z);
    this.borrador = {
      id: z.id,
      nombre: z.nombre,
      descripcion: z.descripcion ?? '',
      pais: z.pais ?? 'Ecuador',
      provincia: z.provincia ?? '',
      canton: z.canton ?? '',
      color: z.color || this.colores[0].color,
      tipo: z.tipo,
      vertices: z.vertices,
      centro_lat: z.centro_lat, centro_lng: z.centro_lng, radio_metros: z.radio_metros,
      activo: z.activo,
    };

    this.ponerEditableLaZona(z);

    // Las zonas dibujadas antes de que existieran estos campos no los traen;
    // se preguntan al abrirlas para modificar, y sólo si faltan.
    this.rellenarTerritorio();
  }

  /**
   * Pone la figura de la zona en modo retoque.
   *
   * Las DEMÁS zonas dejan de responder al clic mientras tanto: pulsar una por
   * error cambiaría de zona y se perdería lo que se llevara retocado.
   *
   * El círculo va además `draggable` para poder mover el centro, que es la
   * única forma; el polígono no, o arrastrar por dentro lo movería entero
   * cuando lo que se quería era desplazar el mapa.
   */
  private ponerEditableLaZona(z: ZonaModel): void {
    const figura = this.figuras.get(z.id);
    if (!figura) { return; }

    this.figuraNueva = figura;
    this.editandoLaDeLaZona = true;

    const esCirculo = !!figura.getRadius;
    figura.setOptions({ editable: true, draggable: esCirculo, zIndex: 3 });

    // El radio se refleja en el formulario para poder afinarlo escribiéndolo
    if (esCirculo) {
      figura.addListener('radius_changed', () => this.zone.run(() => {
        if (this.borrador) { this.borrador.radio_metros = Math.round(figura.getRadius()); }
      }));
    }

    this.figuras.forEach((f, id) => { if (id !== z.id) { f.setOptions({ clickable: false }); } });
  }

  /**
   * Deja de retocar: las figuras vuelven a ser lo que dice el servidor.
   *
   * Se repintan todas en vez de deshacer a mano lo arrastrado: los puntos
   * movidos no se guardan en ninguna parte hasta que se pulsa Guardar, así
   * que volver a pintarlas desde los datos es exacto y es una línea.
   */
  private soltarEdicion(): void {
    this.editandoLaDeLaZona = false;
    this.figuraNueva = null;
    this.pintarZonas();
  }

  cancelar(): void {
    this.borrador = null;
    this.cancelarDibujo();
    // Lo arrastrado y no guardado se deshace volviendo a pintar desde los datos
    this.soltarEdicion();
  }

  /** Si hay forma que guardar: la recién dibujada o la que ya tenía. */
  get hayForma(): boolean {
    if (this.figuraNueva) { return true; }
    if (!this.borrador) { return false; }
    return this.borrador.tipo === 'CIRCULO'
      ? this.borrador.centro_lat != null && this.borrador.radio_metros != null
      : !!this.borrador.vertices?.length;
  }

  async guardar(): Promise<void> {
    if (!this.borrador || this.guardando) { return; }

    const nombre = (this.borrador.nombre ?? '').trim();
    if (nombre.length < 3) {
      this._toastr.warning('Ponle un nombre de al menos tres letras', 'Zonas');
      return;
    }
    if (!this.hayForma) {
      this._toastr.warning('Dibuja el área en el mapa', 'Zonas');
      return;
    }

    // Lo que se manda es lo que hay AHORA en el mapa, no lo que se dibujó:
    // entre medias se pueden haber movido vértices o el radio.
    const forma = this.formaDeLaFigura() ?? {
      tipo: this.borrador.tipo,
      vertices: this.borrador.vertices,
      centro_lat: this.borrador.centro_lat,
      centro_lng: this.borrador.centro_lng,
      radio_metros: this.borrador.radio_metros,
    };

    try {
      this.guardando = true;
      const res: any = await firstValueFrom(this._zonas.saveZona({
        nombre,
        descripcion: (this.borrador.descripcion ?? '').trim() || null,
        pais: (this.borrador.pais ?? '').trim() || null,
        provincia: (this.borrador.provincia ?? '').trim() || null,
        canton: (this.borrador.canton ?? '').trim() || null,
        color: this.borrador.color,
        tipo: forma.tipo as TipoZona,
        vertices: forma.vertices ?? null,
        centro_lat: forma.centro_lat ?? null,
        centro_lng: forma.centro_lng ?? null,
        radio_metros: forma.radio_metros ?? null,
        activo: this.borrador.activo,
      }, this.borrador.id));

      if (res?.status !== 'success') {
        this._toastr.error(res?.message ?? 'No se pudo guardar la zona', 'Zonas');
        return;
      }

      this._toastr.success(res.message, 'Zonas', { timeOut: 2500 });
      const id = res.data?.id ?? null;
      this.borrador = null;
      this.editandoLaDeLaZona = false;
      this.cancelarDibujo();
      await this.cargarZonas(id);
      if (this.elegida) { this.encuadrar(this.elegida); }

    } catch (e: any) {
      // El AuthInterceptor ya enseña el toast del error HTTP
      console.error('Error al guardar la zona:', e);
    } finally {
      this.guardando = false;
    }
  }

  async eliminar(z: ZonaModel): Promise<void> {
    if (this.accesoModel?.eliminar === false) { return; }

    const r = await Swal.fire({
      title: `¿Eliminar «${z.nombre}»?`,
      html: 'La zona se borra del todo. <b>Los clientes no se tocan</b>: a la zona '
          + 'no pertenecen, simplemente caían dentro.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc3545',
    });
    if (!r.isConfirmed) { return; }

    try {
      const res: any = await firstValueFrom(this._zonas.deleteZona(z.id));
      if (res?.status !== 'success') {
        this._toastr.error(res?.message ?? 'No se pudo eliminar', 'Zonas');
        return;
      }
      this._toastr.success(res.message, 'Zonas', { timeOut: 2500 });
      if (this.elegida?.id === z.id) { this.elegida = null; this.clientes = []; this.repintarPuntos(); }
      await this.cargarZonas();
    } catch (e) {
      console.error('Error al eliminar la zona:', e);
    }
  }

  // ================================================================
  // PARA LA PLANTILLA
  // ================================================================

  /** El radio en una unidad que se lea: metros por debajo del kilómetro. */
  radioLegible(z: ZonaModel): string {
    const m = Number(z.radio_metros ?? 0);
    return m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km` : `${Math.round(m)} m`;
  }

  /** Cómo se describe la forma en la lista. */
  formaLegible(z: ZonaModel): string {
    return z.tipo === 'CIRCULO'
      ? `Círculo de ${this.radioLegible(z)}`
      : `Polígono de ${z.vertices?.length ?? 0} puntos`;
  }

  /** «Azuay · Cuenca», o lo que haya. Vacío si no se sabe. */
  territorioLegible(z: ZonaModel): string {
    return [z.provincia, z.canton].filter(Boolean).join(' · ');
  }

  clave(_: number, z: ZonaModel): number { return z.id; }
}


// ================================================================
// RENDERER DE LA COLUMNA ACCIONES
// ================================================================
// Simple delegador, como ButtonAccionCliente: toda la lógica vive en
// AllZonasComponent. Standalone porque la pantalla también lo es.
@Component({
  selector: 'app-button-accion-zona',
  standalone: true,
  imports: [ActionButtonsComponent],
  template: `
    @if (parent?.accionesPlegadas) {
      <button type="button"
              class="btn btn-sm btn-outline-primary acciones-desplegar"
              title="Mostrar los botones de acción"
              aria-label="Mostrar los botones de acción"
              (click)="parent?.toggleActionsColumn()">
        <i class="fas fa-bars"></i>
      </button>
    } @else {
      <app-action-buttons
        [accesoModel]="$safeNavigationMigration(parent?.accesoModel)"
        [buttonEdit]="true"
        [buttonDelete]="true"
        (edit)="parent?.editar(params.data)"
        (delete)="parent?.eliminar(params.data)">
      </app-action-buttons>
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .acciones-desplegar {
      width: 28px;
      height: 24px;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: .25rem;
    }
  `],
})
export class ButtonAccionZona implements ICellRendererAngularComp {
  public params: any;

  /** La pantalla, que llega en los parámetros de la celda. */
  public parent?: AllZonasComponent;

  agInit(params: any): void {
    this.params = params;
    this.parent = params?.pantalla;
  }

  refresh(params: any): boolean {
    this.params = params;
    this.parent = params?.pantalla;
    return true;
  }
}
