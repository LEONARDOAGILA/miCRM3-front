import { AfterViewInit, Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';
import Swal from 'sweetalert2';

import { PanelModule } from '../../../../../components/panel/panel.module';
import { AvisoComponent } from '../../../../../components/campos/aviso/aviso.component';
import { GoogleMapsLoaderService } from '../../../../../service/google-maps-loader.service';
import { LugaresGoogleService, SugerenciaLugar } from '../../../../../service/lugares-google.service';
import { AccesoModel } from '../../../../seguridad/interfaces/accesoModel';
import { ZonaService } from '../../../services/zona.service';
import { ClienteDeZona, PuntoZona, TipoZona, ZonaModel } from '../../../interfaces/zonaModel';

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
  imports: [CommonModule, FormsModule, PanelModule, AvisoComponent],
  templateUrl: './allZonas.component.html',
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

  // ---------- El formulario ----------
  public borrador: Borrador | null = null;

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

  /** Los colores que se ofrecen; el primero es el de la aplicación. */
  public readonly colores = ['#00ACAC', '#348FE2', '#F59C1A', '#FF5B57', '#8753DE', '#32A932', '#6C757D'];

  // ---------- Google Maps ----------
  private gm: any = null;
  private mapa: any = null;
  private geocoder: any = null;
  /** La figura de cada zona pintada, por id, para poder quitarla o resaltarla. */
  private figuras = new Map<number, any>();
  /** La figura que se está dibujando ahora, todavía sin guardar. */
  private figuraNueva: any = null;
  private marcadores: any[] = [];

  // Lo que vive sólo mientras se dibuja
  private trazo: any = null;              // la Polyline que va enseñando el camino
  private marcasTrazo: any[] = [];        // un puntito por esquina puesta
  private oyenteClic: any = null;
  private oyenteDobleClic: any = null;

  constructor(
    private _zonas: ZonaService,
    private _loader: GoogleMapsLoaderService,
    private _lugares: LugaresGoogleService,
    private _toastr: ToastrService,
    private zone: NgZone,
    private route: Router,
    private activeRoute: ActivatedRoute,
  ) {
    this.accesoModel = this.activeRoute.snapshot.data['access'];
  }

  ngOnInit(): void {
    this.cargarZonas();
  }

  async ngAfterViewInit(): Promise<void> {
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
    clearTimeout(this.timerBusqueda);
    this.soltarOyentes();
    this.limpiarTrazo();
    this.limpiarFiguras();
    this.quitarMarcadores();
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

    this.estadoApi = 'listo';
    this.pintarZonas();
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
    this.figuraNueva?.setMap(null);
    this.figuraNueva = null;
  }

  private alPulsarElMapa(lat: number, lng: number): void {
    if (this.dibujando === 'CIRCULO') { this.ponerCirculo(lat, lng); return; }
    this.ponerEsquina(lat, lng);
  }

  /** Una esquina más del polígono. */
  private ponerEsquina(lat: number, lng: number): void {
    this.puntos.push({ lat, lng });

    const color = this.borrador?.color || this.colores[0];
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

    const color = this.borrador?.color || this.colores[0];
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
    const color = this.borrador?.color || this.colores[0];

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
      color: this.borrador?.color ?? this.colores[0],
      tipo,
      vertices: null, centro_lat: null, centro_lng: null,
      radio_metros: this.borrador?.radio_metros ?? null,
      activo: this.borrador?.activo ?? true,
    };
  }

  /**
   * Rellena provincia y cantón si están vacíos.
   *
   * Sólo si están vacíos: al redibujar una zona que ya los tenía corregidos a
   * mano, lo que diga Google no debe pisarlos.
   */
  private rellenarTerritorio(): void {
    if (!this.borrador || (this.borrador.provincia && this.borrador.canton)) { return; }
    const c = this.centroDeLaFigura();
    if (c) { this.territorioDe(c.lat, c.lng); }
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

      this.pintarZonas();
      if (this.elegida) { this.cargarClientes(this.elegida); } else { this.clientes = []; }
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
      this.pintarClientes();
    } catch (e) {
      console.error('Error al cargar los clientes de la zona:', e);
      this.clientes = [];
    } finally {
      this.cargandoClientes = false;
    }
  }

  private quitarMarcadores(): void {
    this.marcadores.forEach(m => m.setMap(null));
    this.marcadores = [];
  }

  /** Un marcador por cliente de la zona elegida. */
  private pintarClientes(): void {
    this.quitarMarcadores();
    if (!this.mapa) { return; }

    for (const c of this.clientes) {
      this.marcadores.push(new this.gm.Marker({
        position: { lat: Number(c.lat), lng: Number(c.lng) },
        map: this.mapa,
        title: c.nombre_completo,
      }));
    }
  }

  // ================================================================
  // ELEGIR, CREAR, EDITAR
  // ================================================================

  elegir(z: ZonaModel): void {
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
    this.quitarMarcadores();
    this.resaltar();
    this.cancelarDibujo();
    this.borrador = {
      id: null, nombre: '', descripcion: '', pais: 'Ecuador', provincia: '', canton: '',
      color: this.colores[0],
      tipo: 'POLIGONO', vertices: null, centro_lat: null, centro_lng: null,
      radio_metros: null, activo: true,
    };
  }

  /**
   * Modifica la elegida.
   *
   * Lo que se cambia sin redibujar es el nombre, el color y si está activa.
   * Para cambiar la FORMA hay que volver a dibujarla: retocar un polígono
   * guardado vértice a vértice se puede, pero mezclarlo con el alta complica
   * el formulario para algo que se hace una vez.
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
      color: z.color || this.colores[0],
      tipo: z.tipo,
      vertices: z.vertices,
      centro_lat: z.centro_lat, centro_lng: z.centro_lng, radio_metros: z.radio_metros,
      activo: z.activo,
    };

    // Las zonas dibujadas antes de que existieran estos campos no los traen;
    // se preguntan al abrirlas para modificar, y sólo si faltan.
    this.rellenarTerritorio();
  }

  cancelar(): void {
    this.borrador = null;
    this.cancelarDibujo();
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
      if (this.elegida?.id === z.id) { this.elegida = null; this.clientes = []; this.quitarMarcadores(); }
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
