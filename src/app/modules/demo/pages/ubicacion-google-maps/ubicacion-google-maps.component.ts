import { Location } from '@angular/common';
import { AfterViewInit, Component, ElementRef, HostListener, NgZone, OnDestroy, ViewChild } from '@angular/core';
import { ToastrService } from 'ngx-toastr';

import { environment } from '../../../../../environments/environment';
import { GoogleMapsLoaderService } from '../../../../service/google-maps-loader.service';

/** Lugar elegido en el buscador o pulsado en el mapa. */
interface LugarGm {
  nombre: string;
  direccion: string;
  lat: number;
  lng: number;
  /** Extensión del lugar (calles, ciudades…) para encuadrar */
  viewport?: any;
  /** Google Place ID (para enlaces) */
  placeId?: string;
  /** División política, sacada de los componentes de la dirección */
  provincia?: string;
  canton?: string;
  parroquia?: string;
  barrio?: string;
  postal?: string;
  /** Calles de la esquina: la principal y la que la cruza */
  callePrincipal?: string;
  calleSecundaria?: string;
  numero?: string;
  /** Campos que no venían en el punto y se tomaron del más cercano */
  aproximados?: string[];
}

/** Captura del mapa: pedida a la Maps Static API o tomada de la pantalla. */
interface CapturaMapa {
  id: number;
  /** Nombre con el que se guarda el archivo */
  nombre: string;
  titulo: string;
  hora: string;
  /** 'estatica' la cobra Google; 'pantalla' no cuesta nada */
  origen: 'estatica' | 'pantalla';
  /** 'mapa' es la vista de arriba; 'calle' es la foto de Street View */
  tipo: 'mapa' | 'calle';
  /** URL que se pinta y se descarga (blob: si se pudo bajar; si no, la de Google) */
  url: string;
  /** La imagen en memoria: permite descargar y copiar sin volver a pedirla */
  blob: Blob | null;
  ancho: number;
  alto: number;
  /** No se pudo traer la imagen (falta habilitar la Maps Static API) */
  fallo: boolean;
}

/** Sugerencia del autocompletado de Places. */
interface SugerenciaGm {
  placeId: string;
  principal: string;
  secundario: string;
  /** Objeto Place de la API (para pedir los campos al elegir) */
  place: any;
}

/**
 * Ubicación con Google Maps (demo).
 *
 * Mapa de Google (Maps JavaScript API) con buscador de direcciones y lugares
 * (Places API, autocompletado restringido a Ecuador): se escribe, salen las
 * sugerencias y al elegir una el mapa se encuadra en ella con un marcador y
 * su ficha. También se puede pulsar cualquier punto del mapa para saber su
 * dirección (geocodificación inversa) y ver la posición propia del
 * dispositivo con la distancia al lugar.
 *
 * La clave va en environment.GOOGLE_MAPS_API_KEY (Maps JavaScript API +
 * Places API (New) + Geocoding API habilitadas en Google Cloud). Sin clave la
 * pantalla lo avisa y no carga nada. La API se carga una sola vez
 * (GoogleMapsLoaderService) y sin @types/google.maps: se usa `any`.
 */
@Component({
  selector: 'app-ubicacion-google-maps',
  templateUrl: './ubicacion-google-maps.component.html',
  styleUrls: ['./ubicacion-google-maps.component.css'],
  standalone: false,
})
export class UbicacionGoogleMapsComponent implements AfterViewInit, OnDestroy {

  @ViewChild('mapContainer', { static: true }) mapContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('visorImg') visorImg?: ElementRef<HTMLImageElement>;
  @ViewChild('visorLienzo') visorLienzo?: ElementRef<HTMLDivElement>;

  // ---------- Estado ----------
  /** 'cargando' la API, 'listo', 'sin-clave' o 'error' */
  estadoApi: 'cargando' | 'listo' | 'sin-clave' | 'error' = 'cargando';
  errorApi = '';
  tipoMapa: 'roadmap' | 'satellite' | 'hybrid' | 'terrain' = 'roadmap';
  /** Pestaña visible en móvil: división política, info o mapa */
  pestanaMovil: 'mapa' | 'info' | 'capturas' = 'mapa';
  panelOculto = this.leer('miCRM3.gmaps.panelOculto') === '1';

  // ---------- Búsqueda ----------
  busqueda = '';
  sugerencias: SugerenciaGm[] = [];
  sugerenciaActiva = -1;
  buscando = false;
  lugar: LugarGm | null = null;
  resolviendoClic = false;

  // ---------- Mi posición ----------
  miPosicion: { lat: number; lng: number; precision: number | null } | null = null;
  obteniendoPosicion = false;

  // ---------- Compartir ----------
  /** Qué enlace se muestra en la caja de compartir */
  formatoEnlace: 'lugar' | 'vista' | 'pantalla' | 'insertar' = 'lugar';
  /** Enlace a esta misma pantalla, al día con lo que se ve (se copia de la barra del navegador) */
  urlPantalla = '';
  /** El navegador puede abrir el diálogo de compartir del sistema (móviles) */
  puedeCompartirNativo = typeof navigator !== 'undefined' && !!(navigator as any).share;

  // ---------- Visor de imágenes ----------
  /** Captura que se está viendo a pantalla completa (null: visor cerrado) */
  visor: CapturaMapa | null = null;
  escala = 1;
  giro = 0;
  private desplazamiento = { x: 0, y: 0 };
  private arrastrando = false;
  private arrastreInicio = { x: 0, y: 0, panX: 0, panY: 0 };
  private pellizcoInicial = 0;
  private escalaPellizco = 1;
  private readonly ESCALA_MIN = 0.2;
  private readonly ESCALA_MAX = 8;

  // ---------- Capturas del mapa ----------
  /**
   * Al pulsar un punto del mapa (o al buscar) se toma también la captura de
   * Google. Arranca SIEMPRE apagada —cada captura se factura—, aunque en una
   * sesión anterior se hubiera dejado encendida.
   */
  capturaAutomatica = false;
  /** Cuánto más ancho que la vista sale la captura: 0 = lo que veo, 1 = el doble… */
  areaCaptura = Number(this.leer('miCRM3.gmaps.areaCaptura') ?? 0) || 0;
  capturas: CapturaMapa[] = [];
  capturando = false;
  capturandoPantalla = false;
  /** El navegador sabe compartir pantalla (en iOS no) */
  puedeCapturarPantalla = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;
  private idCaptura = 0;

  // ---------- Google ----------
  private gm: any = null;                // google.maps
  private mapa: any = null;
  private marcador: any = null;          // lugar buscado / pulsado
  private infoVentana: any = null;
  private marcadorYo: any = null;
  private circuloYo: any = null;
  private geocoder: any = null;
  private places: any = null;            // google.maps.places
  private svServicio: any = null;        // StreetViewService: ¿hay panorama cerca?
  private capaCobertura: any = null;     // StreetViewCoverageLayer (calles azules)
  /** Street View abierto (el mapa queda detrás) */
  streetViewAbierto = false;
  /** Calles con Street View pintadas de azul sobre el mapa */
  coberturaVisible = false;
  private tokenSesion: any = null;       // AutocompleteSessionToken (abarata las consultas)
  private timerBusqueda: any = null;
  private ultimaBusqueda = 0;
  private idWatch: number | null = null;

  constructor(
    private zone: NgZone,
    private _toastr: ToastrService,
    private _loader: GoogleMapsLoaderService,
    private _location: Location,
  ) {}

  async ngAfterViewInit(): Promise<void> {
    if (!this._loader.hayClave) { this.estadoApi = 'sin-clave'; return; }
    try {
      this.gm = await this._loader.cargar();
      await this.gm.importLibrary('maps');
      await this.gm.importLibrary('marker');
      this.places = await this.gm.importLibrary('places');
      await this.gm.importLibrary('geocoding');
      await this.gm.importLibrary('streetView');
      await this.gm.importLibrary('geometry');
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
    if (this.idWatch !== null) { navigator.geolocation.clearWatch(this.idWatch); }
    this.infoVentana?.close();
    this.capturas.forEach(c => this.soltarCaptura(c));
    this.mapa = null;
  }

  private leer(clave: string): string | null {
    try { return localStorage.getItem(clave); } catch { return null; }
  }

  // ================================================================
  // MAPA
  // ================================================================

  private inicializarMapa(): void {
    this.mapa = new this.gm.Map(this.mapContainer.nativeElement, {
      center: { lat: -1.8312, lng: -78.1834 },   // Ecuador
      zoom: 7,
      mapTypeId: this.tipoMapa,
      mapTypeControl: false,        // el tipo se cambia con nuestros botones
      streetViewControl: true,
      fullscreenControl: true,
      zoomControl: true,
      clickableIcons: true,
      gestureHandling: 'greedy',    // rueda del ratón sin Ctrl
    });
    this.geocoder = new this.gm.Geocoder();
    this.infoVentana = new this.gm.InfoWindow();
    this.tokenSesion = new this.places.AutocompleteSessionToken();
    this.svServicio = new this.gm.StreetViewService();

    // Street View: se entra arrastrando el muñeco o con el botón; al salir se vuelve al mapa
    const panorama = this.mapa.getStreetView();
    panorama.setOptions({ addressControl: true, enableCloseButton: true, fullscreenControl: true, motionTracking: false });
    panorama.addListener('visible_changed', () => this.zone.run(() => { this.streetViewAbierto = panorama.getVisible(); }));

    // Clic en el mapa: ¿qué hay aquí? (como en Google Maps)
    this.mapa.addListener('click', (ev: any) => {
      // Un clic en un POI trae su placeId: se usa para tener nombre y dirección
      if (ev.placeId) { ev.stop?.(); }
      const lat = ev.latLng.lat();
      const lng = ev.latLng.lng();
      this.zone.run(async () => {
        await this.resolverPunto(lat, lng, ev.placeId);
        // Con el punto ya resuelto, la captura sale con su nombre y su marcador
        this.capturarTrasEncuadre();
      });
    });

    // Al dejar de mover el mapa se rehace el enlace de esta pantalla (como la barra de Google Maps)
    this.mapa.addListener('idle', () => this.zone.run(() => this.sincronizarUrl()));

    this.estadoApi = 'listo';
    this.aplicarParametrosUrl();
  }

  // ================================================================
  // STREET VIEW
  // ================================================================

  /** Abre Street View en el lugar elegido, en mi posición o en el centro del mapa (el panorama más cercano, hasta 100 m). */
  abrirStreetView(): void {
    if (!this.mapa || !this.svServicio) { return; }
    const c = this.lugar ? { lat: this.lugar.lat, lng: this.lugar.lng }
            : (this.miPosicion ? { lat: this.miPosicion.lat, lng: this.miPosicion.lng } : this.mapa.getCenter().toJSON());
    // source 'google': sólo las fotos de calle de Google (no las esferas subidas por usuarios)
    this.svServicio.getPanorama({ location: c, radius: 100, source: 'google' }, (datos: any, estado: string) => {
      this.zone.run(() => {
        if (estado !== 'OK' || !datos?.location) {
          this._toastr.info('No hay Street View a menos de 100 m de ese punto. Activa «Calles con Street View» para ver dónde sí lo hay.', 'Street View', { timeOut: 5000 });
          return;
        }
        const panorama = this.mapa.getStreetView();
        panorama.setPano(datos.location.pano);
        // Mirar hacia el punto pedido desde el panorama encontrado
        const rumbo = this.gm.geometry?.spherical
          ? this.gm.geometry.spherical.computeHeading(datos.location.latLng, new this.gm.LatLng(c.lat, c.lng))
          : 0;
        panorama.setPov({ heading: rumbo, pitch: 0 });
        panorama.setVisible(true);
      });
    });
  }

  cerrarStreetView(): void {
    this.mapa?.getStreetView().setVisible(false);
  }

  /** Pinta / quita las calles azules con cobertura de Street View. */
  alternarCobertura(): void {
    if (!this.mapa) { return; }
    if (!this.capaCobertura) { this.capaCobertura = new this.gm.StreetViewCoverageLayer(); }
    this.coberturaVisible = !this.coberturaVisible;
    this.capaCobertura.setMap(this.coberturaVisible ? this.mapa : null);
  }

  cambiarTipo(t: 'roadmap' | 'satellite' | 'hybrid' | 'terrain'): void {
    this.tipoMapa = t;
    this.mapa?.setMapTypeId(t);
    this.sincronizarUrl();
  }

  /**
   * Botón de expandir del <panel>: al pasar a pantalla completa (y al volver)
   * el mapa cambia de tamaño, así que se le avisa y se recupera el centro.
   */
  alExpandirPanel(_expandido: boolean): void {
    const centro = this.mapa?.getCenter?.();
    setTimeout(() => {
      if (!this.mapa) { return; }
      this.gm?.event?.trigger(this.mapa, 'resize');
      if (centro) { this.mapa.setCenter(centro); }
    }, 300);
  }

  /**
   * Cambia de pestaña en móvil. Al volver al mapa hay que avisarle del cambio
   * de tamaño: mientras estuvo oculto no pudo medirse y saldría a medias.
   */
  cambiarPestana(pestana: 'mapa' | 'info' | 'capturas'): void {
    this.pestanaMovil = pestana;
    if (pestana !== 'mapa') { return; }
    const centro = this.mapa?.getCenter?.();
    setTimeout(() => {
      if (!this.mapa) { return; }
      this.gm?.event?.trigger(this.mapa, 'resize');
      if (centro) { this.mapa.setCenter(centro); }
    }, 200);
  }

  alternarPanel(): void {
    this.panelOculto = !this.panelOculto;
    try { localStorage.setItem('miCRM3.gmaps.panelOculto', this.panelOculto ? '1' : '0'); } catch { /* sin storage */ }
    // Google Maps no necesita invalidateSize, pero conviene re-centrar tras la transición
    const centro = this.mapa?.getCenter();
    setTimeout(() => { if (centro) { this.gm?.event?.trigger(this.mapa, 'resize'); this.mapa?.setCenter(centro); } }, 300);
  }

  /** Marcador + ventana de información en el lugar y encuadre. */
  private mostrarLugar(l: LugarGm): void {
    this.lugar = l;
    if (!this.mapa) { return; }
    const pos = { lat: l.lat, lng: l.lng };
    if (this.marcador) {
      this.marcador.setPosition(pos);
    } else {
      this.marcador = new this.gm.Marker({ map: this.mapa, position: pos, animation: this.gm.Animation.DROP, title: l.nombre });
      this.marcador.addListener('click', () => this.infoVentana.open({ map: this.mapa, anchor: this.marcador }));
    }
    this.infoVentana.setContent(`<div class="gm-info"><b>${this.escapar(l.nombre)}</b><br>${this.escapar(l.direccion)}<br><small>${l.lat.toFixed(6)}, ${l.lng.toFixed(6)}</small></div>`);
    this.infoVentana.open({ map: this.mapa, anchor: this.marcador });

    this.completarDivision(l);

    if (l.viewport) { this.mapa.fitBounds(l.viewport, 40); if (this.mapa.getZoom() > 17) { this.mapa.setZoom(17); } }
    else { this.mapa.panTo(pos); if (this.mapa.getZoom() < 16) { this.mapa.setZoom(16); } }

    this.sincronizarUrl();
  }

  /**
   * Traduce los componentes de la dirección de Google a la división política
   * del Ecuador. Vienen del geocodificador (`address_components`, con
   * `long_name`) o de Places (New) (`addressComponents`, con `longText`):
   *
   *   administrative_area_level_1 → provincia   (Pichincha, Azuay…)
   *   administrative_area_level_2 → cantón      (Quito, Cuenca…)
   *   administrative_area_level_3 → parroquia   (Iñaquito, El Batán…)
   *
   * No todos los puntos traen los tres niveles: si falta el cantón se usa la
   * ciudad, y si falta la parroquia, el sector o el barrio.
   */
  private divisionDe(componentes: any[] | undefined | null, direccion?: string): Partial<LugarGm> {
    const de = (...tipos: string[]): string | undefined => {
      for (const tipo of tipos) {
        const c = (componentes ?? []).find((x: any) => (x?.types ?? []).includes(tipo));
        const texto = c?.long_name ?? c?.longText ?? '';
        if (texto) { return texto; }
      }
      return undefined;
    };
    return {
      provincia: de('administrative_area_level_1'),
      canton: de('administrative_area_level_2', 'locality'),
      parroquia: de('administrative_area_level_3', 'sublocality_level_1', 'sublocality', 'neighborhood'),
      barrio: de('neighborhood', 'sublocality_level_2'),
      postal: de('postal_code') ?? this.postalDelTexto(direccion),
      numero: this.limpiarNumero(de('street_number')),
      ...this.callesDe(de('intersection'), de('route'), direccion),
    };
  }

  /** La numeración sólo vale si lleva cifras: Google a veces manda «&» o «y». */
  private limpiarNumero(texto?: string): string | undefined {
    const t = (texto ?? '').replace(/\s*(?:y|&)\s*$/i, '').trim();
    return /\d/.test(t) ? t : undefined;
  }

  /**
   * Código postal del punto cuando el lugar no lo trae: una geocodificación
   * inversa sobre sus coordenadas suele devolverlo. Es una consulta extra, así
   * que sólo se hace si falta.
   */
  private async postalDelPunto(lat: number, lng: number): Promise<string | undefined> {
    if (!this.geocoder) { return undefined; }
    try {
      const { results } = await this.geocoder.geocode({ location: { lat, lng } });
      return this.postalCercano(results ?? []);
    } catch {
      return undefined;
    }
  }

  /** Código postal escondido en la dirección con formato (6 dígitos en Ecuador). */
  private postalDelTexto(direccion?: string): string | undefined {
    const m = (direccion ?? '').match(/\b\d{6}\b/);
    return m ? m[0] : undefined;
  }

  /**
   * ¿Son la misma calle? Se comparan sin tildes ni «avenida», «calle», «vía»…
   * y se da por buena si un nombre contiene al otro: Google mezcla «Amazonas»
   * con «Avenida Río Amazonas» según el resultado.
   */
  private mismaCalle(a?: string, b?: string): boolean {
    const normal = (t?: string) => (t ?? '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\b(avenida|avda|av|calle|call|pasaje|psje|via|camino|sector)\b\.?/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
    const x = normal(a);
    const y = normal(b);
    if (!x || !y) { return false; }
    return x === y || x.includes(y) || y.includes(x);
  }

  /**
   * Calles que aparecen en los resultados, de la más cercana al punto a la más
   * lejana. El componente `intersection` nombra las dos calles en el orden que
   * Google quiera, así que para saber cuál es la principal —aquella sobre la
   * que cae el marcador— se mide la distancia de cada resultado.
   */
  private callesPorDistancia(lat: number, lng: number, resultados: any[]): string[] {
    const vistas: { calle: string; metros: number }[] = [];

    for (const r of resultados ?? []) {
      const loc = r?.geometry?.location;
      const metros = loc ? this.metrosEntre(lat, lng, loc.lat(), loc.lng()) : Number.MAX_VALUE;
      for (const c of r?.address_components ?? []) {
        const tipos: string[] = c?.types ?? [];
        const texto: string = c?.long_name ?? c?.longText ?? '';
        const partes = tipos.includes('intersection') ? texto.split(/\s+(?:&|y)\s+/i)
                     : (tipos.includes('route') ? [texto] : []);
        for (const parte of partes) {
          const calle = this.limpiarCalle(parte);
          if (!calle) { continue; }
          const ya = vistas.find(v => this.mismaCalle(v.calle, calle));
          if (!ya) { vistas.push({ calle, metros }); }
          else if (metros < ya.metros) { ya.metros = metros; }
        }
      }
    }

    return vistas.sort((a, b) => a.metros - b.metros).map(v => v.calle);
  }

  /** Código postal de los resultados vecinos, cuando el del punto no lo trae. */
  private postalCercano(resultados: any[]): string | undefined {
    for (const r of resultados ?? []) {
      for (const c of r?.address_components ?? []) {
        if ((c?.types ?? []).includes('postal_code')) {
          const t = (c.long_name ?? c.longText ?? '').trim();
          if (t) { return t; }
        }
      }
      const delTexto = this.postalDelTexto(r?.formatted_address);
      if (delTexto) { return delTexto; }
    }
    return undefined;
  }

  /**
   * Nombre de calle presentable. Google a veces manda etiquetas sueltas
   * («Calles:», «Sin nombre») o restos de la unión («… y»): eso no es una calle.
   */
  private limpiarCalle(texto?: string): string | undefined {
    const t = (texto ?? '')
      .replace(/^\s*calles?\s*:\s*/i, '')
      .replace(/\s+(?:y|&)\s*$/i, '')
      .replace(/^\s*(?:y|&)\s+/i, '')
      .trim();
    if (t.length < 3 || /^(sin nombre|unnamed road)$/i.test(t)) { return undefined; }
    return t;
  }

  /**
   * Calle principal y calle secundaria. Google devuelve las esquinas de dos
   * formas: como componente `intersection` («Av. Amazonas & Av. NN.UU.») o como
   * una `route` suelta; en Ecuador la secundaria suele venir sólo dentro de la
   * dirección con formato, detrás de una «y» («Núñez de Vela N36-123 y Japón»).
   */
  private callesDe(interseccion?: string, route?: string, direccion?: string): Partial<LugarGm> {
    const partir = (texto: string): string[] =>
      texto.split(/\s+(?:&|y)\s+/i)
        .map(t => this.limpiarCalle(t))
        .filter((t): t is string => !!t);

    let principal = this.limpiarCalle(route);
    let secundaria: string | undefined;

    if (interseccion) {
      const partes = partir(interseccion);
      principal = partes[0] || principal;
      secundaria = partes[1];
    }

    if (!secundaria && direccion) {
      // La primera parte de la dirección es la que lleva las calles
      const partes = partir(direccion.split(',')[0]);
      if (partes.length > 1) {
        principal = principal || partes[0];
        secundaria = partes.slice(1).join(' y ');
      }
    }
    secundaria = this.limpiarCalle(secundaria);

    if (this.mismaCalle(secundaria, principal)) { secundaria = undefined; }
    return { callePrincipal: principal || undefined, calleSecundaria: secundaria || undefined };
  }

  /**
   * El geocodificador inverso devuelve varios resultados, del más concreto al
   * más general. Las calles que no vengan en el resultado elegido se toman de
   * los demás: son los tramos más cercanos al punto marcado.
   */
  private callesCercanas(resultados: any[]): Partial<LugarGm> {
    const calles: string[] = [];
    const sumar = (texto?: string) => {
      const t = this.limpiarCalle(texto);
      if (t && !calles.some(c => c.toLowerCase() === t.toLowerCase())) { calles.push(t); }
    };

    for (const r of resultados ?? []) {
      for (const c of r?.address_components ?? []) {
        const tipos = c?.types ?? [];
        const texto = c?.long_name ?? c?.longText ?? '';
        if (tipos.includes('intersection')) {
          texto.split(/\s+(?:&|y)\s+/i).forEach((p: string) => sumar(p));
        } else if (tipos.includes('route')) {
          sumar(texto);
        }
      }
      if (calles.length >= 2) { break; }
    }
    return { callePrincipal: calles[0], calleSecundaria: calles[1] };
  }


  /** Distancia en metros entre dos coordenadas (fórmula del semiverseno). */
  private metrosEntre(aLat: number, aLng: number, bLat: number, bLng: number): number {
    const R = 6371000;
    const dLat = (bLat - aLat) * Math.PI / 180;
    const dLng = (bLng - aLng) * Math.PI / 180;
    const s = Math.sin(dLat / 2) ** 2
      + Math.cos(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  /**
   * Quita la morralla de las direcciones incompletas: el «Calles:» del
   * principio y las «y» o «&» que se quedan colgando antes de una coma.
   */
  private limpiarDireccion(texto?: string): string {
    return (texto ?? '')
      .replace(/^\s*calles:\s*/i, '')
      .replace(/\s+(?:y|&)\s*(?=,|$)/gi, '')
      .replace(/^\s*(?:y|&)\s+/i, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/,\s*Ecuador\s*$/i, '')
      .trim();
  }

  /** ¿Hay algo que mostrar en la tarjeta de división política? */
  get hayDivision(): boolean {
    return !!(this.lugar?.provincia || this.lugar?.canton || this.lugar?.parroquia);
  }

  /** Toda la tarjeta en texto, una fila por línea, tal como se ve. */
  get divisionTexto(): string {
    const l = this.lugar;
    if (!l) { return ''; }
    return [
      `Provincia: ${this.textoDivision('provincia')}`,
      `Cantón: ${this.textoDivision('canton')}`,
      `Parroquia: ${this.textoDivision('parroquia')}`,
      `Calle principal: ${this.textoDivision('callePrincipal')}`,
      `Calle secundaria: ${this.textoDivision('calleSecundaria')}`,
      `Numeración: ${this.textoDivision('numero')}`,
      `Ubicación: ${l.direccion || '—'}`,
      `Código postal: ${this.textoDivision('postal')}`,
    ].join('\n');
  }

  /** Copia la tarjeta entera; el aviso no repite el texto, que es largo. */
  async copiarDivision(): Promise<void> {
    const texto = this.divisionTexto;
    if (!texto) { return; }
    try {
      await navigator.clipboard.writeText(texto);
      this._toastr.success('División política copiada (8 líneas)', 'Copiado', { timeOut: 2500 });
    } catch {
      this._toastr.warning('No se pudo copiar: selecciona el texto y usa Ctrl+C', 'División política');
    }
  }

  /** Campos de la división política que se muestran siempre, en orden. */
  private readonly CAMPOS_DIVISION: (keyof LugarGm)[] =
    ['provincia', 'canton', 'parroquia', 'callePrincipal', 'calleSecundaria', 'numero', 'postal'];

  private faltaAlgo(l: Partial<LugarGm>): boolean {
    return this.CAMPOS_DIVISION.some(c => !l[c]);
  }

  /**
   * Completa la división política con lo más cercano que haya. Primero mira
   * todos los resultados del propio punto (una consulta) y, si aún falta algo,
   * sondea cuatro puntos a unos 40 m y se queda con el valor más próximo. Lo
   * que llega de esos sondeos se marca como aproximado.
   */
  private async completarDivision(l: LugarGm): Promise<void> {
    if (!this.geocoder || !this.faltaAlgo(l)) { return; }

    const sigueSiendoElMismo = () => this.lugar?.lat === l.lat && this.lugar?.lng === l.lng;
    let datos: Partial<LugarGm> = {};
    const aproximados = new Set<string>(l.aproximados ?? []);

    // 1. el propio punto: sus otros resultados suelen traer lo que falta
    const delPunto = await this.divisionCercana(l.lat, l.lng, false);
    const principalActual = l.callePrincipal;
    for (const campo of this.CAMPOS_DIVISION) {
      if (l[campo] || datos[campo] || !delPunto[campo]) { continue; }
      if (campo === 'calleSecundaria' && this.mismaCalle(delPunto[campo] as string, principalActual)) { continue; }
      (datos as any)[campo] = delPunto[campo];
      aproximados.add(campo as string);   // no es del lugar en sí, sino de un vecino
    }

    // 2. si todavía falta, se mira alrededor
    if (this.faltaAlgo({ ...l, ...datos })) {
      const evitar = datos.callePrincipal ?? l.callePrincipal ?? '';
      const delAnillo = await this.divisionCercana(l.lat, l.lng, true, evitar);
      for (const campo of this.CAMPOS_DIVISION) {
        if (l[campo] || datos[campo] || !delAnillo[campo]) { continue; }
        if (campo === 'calleSecundaria' && this.mismaCalle(delAnillo[campo] as string, evitar)) { continue; }
        (datos as any)[campo] = delAnillo[campo];
        aproximados.add(campo);
      }
    }

    if (Object.keys(datos).length && sigueSiendoElMismo()) {
      this.zone.run(() => { this.lugar = { ...this.lugar!, ...datos, aproximados: [...aproximados] }; });
    }
  }

  /**
   * Geocodifica el punto (o cuatro puntos a su alrededor) y devuelve, para cada
   * campo, el valor del resultado más cercano que lo tenga.
   */
  private async divisionCercana(lat: number, lng: number, anillo: boolean, evitarCalle = ''): Promise<Partial<LugarGm>> {
    const d = 0.00036;                       // ~40 m
    const puntos = anillo
      ? [{ lat: lat + d, lng }, { lat: lat - d, lng }, { lat, lng: lng + d }, { lat, lng: lng - d }]
      : [{ lat, lng }];

    const tandas = await Promise.all(puntos.map(async p => {
      try {
        const { results } = await this.geocoder.geocode({ location: p });
        return (results ?? []) as any[];
      } catch {
        return [] as any[];
      }
    }));

    const mejor: Record<string, { valor: string; metros: number }> = {};
    const guardar = (campo: string, valor: string | undefined, metros: number) => {
      if (!valor) { return; }
      if (!mejor[campo] || metros < mejor[campo].metros) { mejor[campo] = { valor, metros }; }
    };

    for (const resultados of tandas) {
      for (const r of resultados) {
        const loc = r?.geometry?.location;
        const metros = loc ? this.metrosEntre(lat, lng, loc.lat(), loc.lng()) : Number.MAX_VALUE;
        const comps: any[] = r?.address_components ?? [];
        const de = (...tipos: string[]): string | undefined => {
          for (const tipo of tipos) {
            const c = comps.find(x => (x?.types ?? []).includes(tipo));
            const texto = (c?.long_name ?? c?.longText ?? '').trim();
            if (texto) { return texto; }
          }
          return undefined;
        };

        guardar('provincia', de('administrative_area_level_1'), metros);
        guardar('canton', de('administrative_area_level_2', 'locality'), metros);
        guardar('parroquia', de('administrative_area_level_3', 'sublocality_level_1', 'sublocality', 'neighborhood'), metros);
        guardar('barrio', de('neighborhood', 'sublocality_level_2'), metros);
        guardar('postal', de('postal_code') ?? this.postalDelTexto(r?.formatted_address), metros);
        guardar('numero', this.limpiarNumero(de('street_number')), metros);

        // Calles: la más cercana es la principal; la siguiente distinta, la secundaria
        const calles = this.callesDe(de('intersection'), de('route'), this.limpiarDireccion(r?.formatted_address));
        guardar('callePrincipal', calles.callePrincipal, metros);
        const otra = [calles.callePrincipal, calles.calleSecundaria]
          .filter((c): c is string => !!c)
          .find(c => !this.mismaCalle(c, evitarCalle) && !this.mismaCalle(c, mejor['callePrincipal']?.valor));
        guardar('calleSecundaria', otra, metros);
      }
    }

    const salida: Partial<LugarGm> = {};
    for (const [campo, dato] of Object.entries(mejor)) { (salida as any)[campo] = dato.valor; }
    return salida;
  }

  /** Texto de cada fila: el valor tal cual, o «—» si no hay nada. */
  textoDivision(campo: keyof LugarGm): string {
    const valor = this.lugar?.[campo] as string | undefined;
    return valor || '—';
  }

  tituloDivision(campo: keyof LugarGm): string {
    const valor = this.lugar?.[campo] as string | undefined;
    if (!valor) { return 'Google no tiene este dato ni en el punto ni a su alrededor'; }
    return this.lugar?.aproximados?.includes(campo as string) ? 'Dato tomado del punto más cercano' : '';
  }


  private escapar(s: string): string {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ================================================================
  // BUSCADOR (Places API New: AutocompleteSuggestion + Place.fetchFields)
  // ================================================================

  onBusquedaCambia(): void {
    clearTimeout(this.timerBusqueda);
    const q = this.busqueda.trim();
    if (q.length < 3) { this.sugerencias = []; this.sugerenciaActiva = -1; return; }
    this.timerBusqueda = setTimeout(() => this.buscar(q), 300);
  }

  private async buscar(q: string): Promise<void> {
    if (!this.places) { return; }
    const marca = ++this.ultimaBusqueda;
    this.buscando = true;
    try {
      const peticion: any = {
        input: q,
        sessionToken: this.tokenSesion,
        includedRegionCodes: ['ec'],       // sólo Ecuador
        language: 'es',
        region: 'ec',
      };
      // Preferir lo cercano a lo que se ve
      const b = this.mapa?.getBounds();
      if (b) { peticion.locationBias = b; }

      const { suggestions } = await this.places.AutocompleteSuggestion.fetchAutocompleteSuggestions(peticion);
      if (marca !== this.ultimaBusqueda) { return; }   // llegó una más nueva
      this.zone.run(() => {
        this.sugerencias = (suggestions ?? [])
          .filter((s: any) => s.placePrediction)
          .map((s: any) => ({
            placeId: s.placePrediction.placeId,
            principal: s.placePrediction.mainText?.text ?? s.placePrediction.text?.text ?? '',
            secundario: (s.placePrediction.secondaryText?.text ?? '').replace(/,\s*Ecuador\s*$/i, ''),
            place: s.placePrediction.toPlace(),
          }));
        this.sugerenciaActiva = this.sugerencias.length ? 0 : -1;
      });
    } catch (e) {
      console.error('Error en el autocompletado de Places:', e);
      this.zone.run(() => {
        this.sugerencias = [];
        this._toastr.error('No se pudo buscar. ¿Está habilitada la Places API (New) para la clave?', 'Google Maps');
      });
    } finally {
      if (marca === this.ultimaBusqueda) { this.zone.run(() => { this.buscando = false; }); }
    }
  }

  onBusquedaTecla(ev: KeyboardEvent): void {
    if (!this.sugerencias.length) {
      if (ev.key === 'Enter') { ev.preventDefault(); this.geocodificarTexto(this.busqueda.trim()); }
      return;
    }
    if (ev.key === 'ArrowDown') { ev.preventDefault(); this.sugerenciaActiva = (this.sugerenciaActiva + 1) % this.sugerencias.length; }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); this.sugerenciaActiva = (this.sugerenciaActiva - 1 + this.sugerencias.length) % this.sugerencias.length; }
    else if (ev.key === 'Enter') { ev.preventDefault(); if (this.sugerenciaActiva >= 0) { this.elegir(this.sugerencias[this.sugerenciaActiva]); } }
    else if (ev.key === 'Escape') { this.sugerencias = []; this.sugerenciaActiva = -1; }
  }

  /** Sugerencia elegida: se piden sus campos (cierra la sesión de autocompletado) y se muestra. */
  async elegir(s: SugerenciaGm): Promise<void> {
    this.sugerencias = [];
    this.sugerenciaActiva = -1;
    this.busqueda = `${s.principal}${s.secundario ? ', ' + s.secundario : ''}`;
    try {
      this.buscando = true;
      await s.place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location', 'viewport', 'addressComponents'] });
      const p = s.place;
      this.zone.run(() => this.mostrarLugar({
        nombre: p.displayName ?? s.principal,
        direccion: this.limpiarDireccion(p.formattedAddress ?? s.secundario ?? ''),
        lat: p.location.lat(),
        lng: p.location.lng(),
        viewport: p.viewport ?? undefined,
        placeId: s.placeId,
        ...this.divisionDe(p.addressComponents, p.formattedAddress),
      }));
      this.zone.run(() => this.capturarTrasEncuadre());
    } catch (e) {
      console.error('Error al obtener el lugar:', e);
      this._toastr.error('No se pudo obtener el lugar', 'Google Maps');
    } finally {
      this.buscando = false;
      this.tokenSesion = new this.places.AutocompleteSessionToken();   // sesión nueva para la próxima búsqueda
    }
  }

  /** Enter sin sugerencias: se geocodifica el texto tal cual. */
  private geocodificarTexto(texto: string): void {
    if (!texto || !this.geocoder) { return; }
    this.buscando = true;
    this.geocoder.geocode({ address: texto, region: 'ec', componentRestrictions: { country: 'EC' } }, (res: any[], estado: string) => {
      this.zone.run(() => {
        this.buscando = false;
        if (estado !== 'OK' || !res?.length) { this._toastr.info(`Sin resultados para «${texto}»`, 'Google Maps'); return; }
        const r = res[0];
        const direccion = this.limpiarDireccion(r.formatted_address);
        const division = this.divisionDe(r.address_components, direccion);
        const cercanas = this.callesCercanas(res);
        this.mostrarLugar({
          nombre: direccion.split(',')[0],
          direccion,
          lat: r.geometry.location.lat(),
          lng: r.geometry.location.lng(),
          viewport: r.geometry.viewport,
          placeId: r.place_id,
          ...division,
          callePrincipal: division.callePrincipal ?? cercanas.callePrincipal,
          calleSecundaria: division.calleSecundaria ?? cercanas.calleSecundaria,
          postal: division.postal ?? this.postalCercano(res),
        });
        this.capturarTrasEncuadre();
      });
    });
  }

  /** Clic en el mapa: dirección del punto (o el lugar, si se pulsó un POI). */
  private async resolverPunto(lat: number, lng: number, placeId?: string): Promise<void> {
    this.resolviendoClic = true;
    try {
      if (placeId && this.places?.Place) {
        const p = new this.places.Place({ id: placeId });
        await p.fetchFields({ fields: ['displayName', 'formattedAddress', 'location', 'viewport', 'addressComponents'] });
        this.zone.run(() => this.mostrarLugar({
          nombre: p.displayName ?? 'Lugar',
          direccion: this.limpiarDireccion(p.formattedAddress ?? ''),
          lat: p.location?.lat() ?? lat, lng: p.location?.lng() ?? lng, placeId,
          ...this.divisionDe(p.addressComponents, p.formattedAddress),
        }));
        return;
      }
      const { results } = await this.geocoder.geocode({ location: { lat, lng } });
      const lista: any[] = results ?? [];
      // El primer resultado a veces viene a medias: se prefiere uno con dirección legible
      const r = lista.find(x => this.limpiarDireccion(x?.formatted_address).length > 3) ?? lista[0];
      const direccion = this.limpiarDireccion(r?.formatted_address);
      const division = this.divisionDe(r?.address_components, direccion);
      const porDistancia = this.callesPorDistancia(lat, lng, lista);
      const principal = porDistancia[0] ?? division.callePrincipal;
      const secundaria = porDistancia.find(c => !this.mismaCalle(c, principal))
        ?? (this.mismaCalle(division.calleSecundaria, principal) ? undefined : division.calleSecundaria);
      this.zone.run(() => this.mostrarLugar({
        nombre: direccion ? direccion.split(',')[0] : 'Punto en el mapa',
        direccion: direccion || 'Sin dirección conocida',
        lat, lng, placeId: r?.place_id,
        ...division,
        callePrincipal: principal,
        calleSecundaria: secundaria,
        postal: division.postal ?? this.postalCercano(lista),
      }));

    } catch (e) {
      console.error('Error al resolver el punto:', e);
      this.zone.run(() => this.mostrarLugar({ nombre: 'Punto en el mapa', direccion: 'Sin dirección conocida', lat, lng }));
    } finally {
      this.zone.run(() => { this.resolviendoClic = false; });
    }
  }

  limpiar(): void {
    clearTimeout(this.timerBusqueda);
    this.busqueda = '';
    this.sugerencias = [];
    this.sugerenciaActiva = -1;
    this.lugar = null;
    this.infoVentana?.close();
    if (this.marcador) { this.marcador.setMap(null); this.marcador = null; }
    this.sincronizarUrl();
  }

  // ================================================================
  // MI POSICIÓN
  // ================================================================

  miUbicacion(): void {
    if (!navigator.geolocation) { this._toastr.error('Este navegador no da la ubicación', 'Google Maps'); return; }
    this.obteniendoPosicion = true;
    navigator.geolocation.getCurrentPosition(
      pos => this.zone.run(() => {
        this.obteniendoPosicion = false;
        this.miPosicion = { lat: pos.coords.latitude, lng: pos.coords.longitude, precision: pos.coords.accuracy ?? null };
        this.pintarYo();
        this.mapa?.panTo({ lat: this.miPosicion.lat, lng: this.miPosicion.lng });
        if (this.mapa && this.mapa.getZoom() < 15) { this.mapa.setZoom(16); }
      }),
      err => this.zone.run(() => {
        this.obteniendoPosicion = false;
        const msg = err.code === 1 ? 'Permiso de ubicación denegado' : (err.code === 3 ? 'Tiempo de espera agotado' : 'Ubicación no disponible');
        this._toastr.error(msg, 'Google Maps');
      }),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  private pintarYo(): void {
    if (!this.mapa || !this.miPosicion) { return; }
    const pos = { lat: this.miPosicion.lat, lng: this.miPosicion.lng };
    if (!this.marcadorYo) {
      this.marcadorYo = new this.gm.Marker({
        map: this.mapa, position: pos, title: 'Mi ubicación', zIndex: 1000,
        icon: { path: this.gm.SymbolPath.CIRCLE, scale: 8, fillColor: '#4285F4', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 },
      });
    } else {
      this.marcadorYo.setPosition(pos);
    }
    const radio = this.miPosicion.precision ?? 0;
    if (!this.circuloYo) {
      this.circuloYo = new this.gm.Circle({ map: this.mapa, center: pos, radius: radio, fillColor: '#4285F4', fillOpacity: .12, strokeColor: '#4285F4', strokeWeight: 1 });
    } else {
      this.circuloYo.setCenter(pos);
      this.circuloYo.setRadius(radio);
    }
  }

  // ================================================================
  // ACCIONES SOBRE EL LUGAR
  // ================================================================

  get coordenadaTexto(): string {
    return this.lugar ? `${this.lugar.lat.toFixed(6)}, ${this.lugar.lng.toFixed(6)}` : '';
  }

  /** Distancia en línea recta desde mi posición al lugar. */
  get distanciaTexto(): string {
    if (!this.lugar || !this.miPosicion) { return ''; }
    const R = 6371000;
    const dLat = (this.lugar.lat - this.miPosicion.lat) * Math.PI / 180;
    const dLng = (this.lugar.lng - this.miPosicion.lng) * Math.PI / 180;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(this.miPosicion.lat * Math.PI / 180) * Math.cos(this.lugar.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    const m = 2 * R * Math.asin(Math.sqrt(s));
    return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
  }

  async copiar(): Promise<void> {
    if (!this.lugar) { return; }
    await this.copiarValor(this.coordenadaTexto, 'Coordenadas');
  }

  /** Copia un valor suelto (la coordenada entera, sólo la latitud, sólo la longitud…). */
  async copiarValor(texto: string, etiqueta: string): Promise<void> {
    if (!texto) { return; }
    try {
      await navigator.clipboard.writeText(texto);
      this._toastr.success(`${etiqueta}: ${texto}`, 'Copiado', { timeOut: 2000 });
    } catch {
      this._toastr.warning('No se pudo copiar: selecciona el texto y usa Ctrl+C', 'Google Maps');
    }
  }

  abrirEnGoogleMaps(): void {
    if (!this.lugar) { return; }
    window.open(this.urlLugar, '_blank', 'noopener');
  }

  // ================================================================
  // COMPARTIR
  // ================================================================

  /**
   * Enlace al lugar en Google Maps. Con Place ID abre su ficha (nombre, fotos,
   * reseñas); sin él, la coordenada. Es el formato oficial de enlaces de Maps
   * (developers.google.com/maps/documentation/urls).
   */
  get urlLugar(): string {
    if (!this.lugar) { return ''; }
    const coord = `${this.lugar.lat.toFixed(6)},${this.lugar.lng.toFixed(6)}`;
    const base = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coord)}`;
    return this.lugar.placeId ? `${base}&query_place_id=${this.lugar.placeId}` : base;
  }

  /** Enlace a la vista actual del mapa: mismo centro, mismo zoom y mismo tipo de mapa. */
  get urlVista(): string {
    const c = this.mapa?.getCenter?.();
    const lat = c ? c.lat() : (this.lugar?.lat ?? 0);
    const lng = c ? c.lng() : (this.lugar?.lng ?? 0);
    const zoom = Math.round(this.mapa?.getZoom?.() ?? 16);
    // La API de enlaces sólo entiende roadmap / satellite / terrain: el híbrido va como satélite
    const basemap = this.tipoMapa === 'hybrid' ? 'satellite' : this.tipoMapa;
    return `https://www.google.com/maps/@?api=1&map_action=map&center=${lat.toFixed(6)},${lng.toFixed(6)}&zoom=${zoom}&basemap=${basemap}`;
  }

  /** Código para incrustar el mapa en otra página (Maps Embed API). */
  get htmlInsertar(): string {
    const clave = (environment as any).GOOGLE_MAPS_API_KEY ?? 'TU_CLAVE';
    const q = this.lugar?.placeId
      ? `place_id:${this.lugar.placeId}`
      : (this.lugar ? `${this.lugar.lat.toFixed(6)},${this.lugar.lng.toFixed(6)}` : '');
    const zoom = Math.round(this.mapa?.getZoom?.() ?? 16);
    const src = `https://www.google.com/maps/embed/v1/place?key=${clave}&q=${encodeURIComponent(q)}&zoom=${zoom}&language=es&region=ec`;
    return `<iframe width="600" height="450" style="border:0" loading="lazy" allowfullscreen\n  referrerpolicy="no-referrer-when-downgrade"\n  src="${src}"></iframe>`;
  }

  /** Lo que se ve en la caja según la pestaña elegida. */
  get textoCompartir(): string {
    switch (this.formatoEnlace) {
      case 'lugar':    return this.urlLugar;
      case 'vista':    return this.urlVista;
      case 'pantalla': return this.urlPantalla;
      default:         return this.htmlInsertar;
    }
  }

  get ayudaCompartir(): string {
    switch (this.formatoEnlace) {
      case 'lugar':    return '';
      case 'vista':    return 'Abre Google Maps con el mismo encuadre y tipo de mapa que ves ahora.';
      case 'pantalla': return 'Vuelve a esta misma pantalla del sistema con el lugar ya cargado.';
      default:         return 'Pégalo en una página web. Necesita la Maps Embed API habilitada para la clave.';
    }
  }

  /** El enlace que se está compartiendo (en la pestaña «Insertar» se usa el del lugar). */
  get enlaceActivo(): string {
    return this.formatoEnlace === 'insertar' ? this.urlLugar : this.textoCompartir;
  }

  get textoBotonAbrir(): string {
    return this.formatoEnlace === 'pantalla' ? 'Abrir esta pantalla' : 'Ir a Google Maps';
  }

  abrirEnlace(): void {
    const url = this.enlaceActivo;
    if (url) { window.open(url, '_blank', 'noopener'); }
  }

  /** Mensaje que acompaña al enlace: nombre del lugar y dirección. */
  private get mensajeCompartir(): string {
    if (!this.lugar) { return 'Ubicación en el mapa'; }
    return this.lugar.direccion ? `${this.lugar.nombre} — ${this.lugar.direccion}` : this.lugar.nombre;
  }

  /** Abre la app o la web de la red elegida con el enlace ya puesto. */
  compartirEn(red: 'whatsapp' | 'telegram' | 'correo' | 'facebook' | 'x'): void {
    const url = this.enlaceActivo;
    if (!url) { return; }
    const texto = this.mensajeCompartir;
    const u = encodeURIComponent(url);
    const t = encodeURIComponent(texto);
    const todo = encodeURIComponent(`${texto}\n${url}`);

    const destinos: Record<string, string> = {
      whatsapp: `https://wa.me/?text=${todo}`,
      telegram: `https://t.me/share/url?url=${u}&text=${t}`,
      correo:   `mailto:?subject=${t}&body=${todo}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${u}`,
      x:        `https://twitter.com/intent/tweet?text=${t}&url=${u}`,
    };
    const ventana = window.open(destinos[red], '_blank', 'noopener');
    if (!ventana) {
      this._toastr.warning('El navegador bloqueó la ventana: permite las ventanas emergentes de este sitio.', 'Compartir', { timeOut: 7000, closeButton: true });
    }
  }

  /** Rehace el enlace a esta pantalla y lo deja también en la barra del navegador. */
  private sincronizarUrl(): void {
    const c = this.mapa?.getCenter?.();
    if (!c) { return; }
    const p = new URLSearchParams();
    if (this.lugar) {
      p.set('lat', this.lugar.lat.toFixed(6));
      p.set('lng', this.lugar.lng.toFixed(6));
      if (this.lugar.placeId) { p.set('pid', this.lugar.placeId); }
    } else {
      p.set('lat', c.lat().toFixed(6));
      p.set('lng', c.lng().toFixed(6));
    }
    p.set('z', String(Math.round(this.mapa.getZoom() ?? 16)));
    if (this.tipoMapa !== 'roadmap') { p.set('t', this.tipoMapa); }

    const ruta = window.location.pathname;
    this._location.replaceState(ruta, p.toString());
    this.urlPantalla = `${window.location.origin}${ruta}?${p.toString()}`;
  }

  /** Al entrar con un enlace compartido: mismo encuadre y mismo lugar. */
  private aplicarParametrosUrl(): void {
    const p = new URLSearchParams(window.location.search);
    const t = p.get('t');
    if (t && ['roadmap', 'satellite', 'hybrid', 'terrain'].includes(t)) { this.cambiarTipo(t as any); }

    const lat = parseFloat(p.get('lat') ?? '');
    const lng = parseFloat(p.get('lng') ?? '');
    const z = parseInt(p.get('z') ?? '', 10);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) { this.sincronizarUrl(); return; }

    this.mapa.setCenter({ lat, lng });
    this.mapa.setZoom(Number.isFinite(z) ? z : 16);
    this.resolverPunto(lat, lng, p.get('pid') ?? undefined);
  }

  async copiarEnlace(): Promise<void> {
    const texto = this.textoCompartir;
    if (!texto) { return; }
    try {
      await navigator.clipboard.writeText(texto);
      this._toastr.success(this.formatoEnlace === 'insertar' ? 'Código copiado' : 'Enlace copiado', 'Compartir', { timeOut: 2000 });
    } catch {
      this._toastr.warning('No se pudo copiar: selecciona el texto y usa Ctrl+C', 'Compartir');
    }
  }

  /** Botón de la barra: diálogo del sistema en el móvil, copiar en el escritorio. */
  async compartir(): Promise<void> {
    const url = this.lugar ? this.enlaceActivo || this.urlLugar : this.urlVista;
    const titulo = this.lugar?.nombre ?? 'Ubicación';
    if (this.puedeCompartirNativo) {
      try {
        await (navigator as any).share({ title: titulo, text: this.mensajeCompartir, url });
        return;
      } catch (e: any) {
        if (e?.name === 'AbortError') { return; }   // lo cerró el usuario
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      this._toastr.success('Enlace copiado al portapapeles', 'Compartir', { timeOut: 2500 });
    } catch {
      this._toastr.info(url, 'Enlace para compartir', { timeOut: 15000, closeButton: true });
    }
    if (this.panelOculto) { this.alternarPanel(); }
  }

  comoLlegar(): void {
    if (!this.lugar) { return; }
    const destino = `${this.lugar.lat},${this.lugar.lng}`;
    const origen = this.miPosicion ? `&origin=${this.miPosicion.lat},${this.miPosicion.lng}` : '';
    window.open(`https://www.google.com/maps/dir/?api=1${origen}&destination=${destino}`, '_blank', 'noopener');
  }

  centrarLugar(): void {
    if (!this.lugar || !this.mapa) { return; }
    this.mapa.panTo({ lat: this.lugar.lat, lng: this.lugar.lng });
    this.infoVentana?.open({ map: this.mapa, anchor: this.marcador });
  }

  // ================================================================
  // CAPTURAS DEL MAPA
  // ================================================================

  /**
   * Foto de lo que se ve ahora. El mapa se dibuja con imágenes de otro dominio,
   * así que no se puede volcar a un canvas: la imagen la pide la Maps Static
   * API con el mismo centro, zoom, tipo de mapa y marcadores. Hace falta tener
   * habilitada la «Maps Static API» para la clave.
   */
  async capturarMapa(centroPedido?: { lat: number; lng: number }): Promise<void> {
    if (!this.mapa || this.capturando) { return; }
    const c = this.mapa.getCenter?.();
    const centro = centroPedido ?? (c ? { lat: c.lat(), lng: c.lng() } : null);
    if (!centro) { return; }

    this.capturando = true;
    const remota = this.urlEstatica(centro.lat, centro.lng);
    const ahora = new Date();
    const captura: CapturaMapa = {
      id: ++this.idCaptura,
      nombre: this.nombreArchivo(ahora),
      titulo: this.lugar?.nombre ?? `${centro.lat.toFixed(5)}, ${centro.lng.toFixed(5)}`,
      hora: ahora.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      origen: 'estatica',
      tipo: 'mapa',
      url: remota,
      blob: null,
      ancho: this.tamanoCaptura().ancho,
      alto: this.tamanoCaptura().alto,
      fallo: false,
    };

    try {
      const r = await fetch(remota);
      if (!r.ok) { throw new Error('HTTP ' + r.status); }
      const blob = await r.blob();
      if (!blob.type.startsWith('image/')) { throw new Error('respuesta sin imagen'); }
      captura.blob = blob;
      captura.url = URL.createObjectURL(blob);
    } catch (e) {
      // Sin la Static API habilitada (o con la clave restringida) no se baja la
      // imagen: se deja la URL de Google, que al menos se puede abrir y guardar.
      console.error('No se pudo bajar la captura del mapa:', e);
      captura.fallo = true;
      this._toastr.warning('Habilita la «Maps Static API» para tu clave en Google Cloud y vuelve a intentarlo.', 'No se pudo capturar el mapa', { timeOut: 9000, closeButton: true });
    }

    this.guardarUnicaCaptura(captura);
    if (this.panelOculto) { this.alternarPanel(); }
    if (!captura.fallo) { this._toastr.success('Captura lista: ya puedes guardarla', 'Captura del mapa', { timeOut: 2500 }); }

    // Con Street View abierto se guarda además la foto de la calle que se ve
    if (this.streetViewAbierto) { await this.capturarCalle(); }
    this.capturando = false;
  }

  /**
   * Foto de lo que se ve en Street View, con el mismo panorama, rumbo,
   * inclinación y zoom. La pide la Street View Static API, que hay que
   * habilitar aparte en Google Cloud (y también se factura).
   */
  async capturarCalle(): Promise<void> {
    const panorama = this.mapa?.getStreetView?.();
    if (!panorama?.getVisible?.()) { return; }

    const remota = this.urlCalle(panorama);
    if (!remota) { return; }

    const ahora = new Date();
    const { ancho, alto } = this.tamanoCaptura();
    const captura: CapturaMapa = {
      id: ++this.idCaptura,
      nombre: this.nombreArchivo(ahora).replace(/\.png$/, '-calle.png'),
      titulo: `Vista de calle${this.lugar ? ' · ' + this.lugar.nombre : ''}`,
      hora: ahora.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      origen: 'estatica',
      tipo: 'calle',
      url: remota,
      blob: null,
      ancho,
      alto,
      fallo: false,
    };

    try {
      const r = await fetch(remota);
      if (!r.ok) { throw new Error('HTTP ' + r.status); }
      const blob = await r.blob();
      if (!blob.type.startsWith('image/')) { throw new Error('respuesta sin imagen'); }
      captura.blob = blob;
      captura.url = URL.createObjectURL(blob);
    } catch (e) {
      console.error('No se pudo bajar la foto de Street View:', e);
      captura.fallo = true;
      this._toastr.warning('Habilita la «Street View Static API» para tu clave en Google Cloud.', 'No se pudo capturar la calle', { timeOut: 9000, closeButton: true });
    }

    this.guardarUnicaCaptura(captura);
    if (!captura.fallo) { this._toastr.success('Foto de la calle lista', 'Captura de Street View', { timeOut: 2500 }); }
  }

  /** Dirección de la foto de Street View con la vista exacta del panorama. */
  private urlCalle(panorama: any): string | null {
    const { ancho, alto } = this.tamanoCaptura();
    const pov = panorama.getPov?.() ?? { heading: 0, pitch: 0 };
    const zoom = panorama.getZoom?.() ?? 1;
    const p = new URLSearchParams();

    const pano = panorama.getPano?.();
    if (pano) {
      p.set('pano', pano);
    } else {
      const pos = panorama.getPosition?.();
      if (!pos) { return null; }
      p.set('location', `${pos.lat().toFixed(6)},${pos.lng().toFixed(6)}`);
    }

    p.set('size', `${ancho}x${alto}`);
    p.set('scale', '2');
    p.set('heading', String(Math.round(pov.heading ?? 0)));
    p.set('pitch', String(Math.round(pov.pitch ?? 0)));
    // El zoom del panorama equivale a este campo de visión
    p.set('fov', String(Math.min(120, Math.max(10, Math.round(180 / Math.pow(2, zoom))))));
    p.set('return_error_code', 'true');
    p.set('key', (environment as any).GOOGLE_MAPS_API_KEY ?? '');
    return `https://maps.googleapis.com/maps/api/streetview?${p.toString()}`;
  }

  /**
   * Captura de la tarjeta del mapa tal como se ve en la pantalla, recortando el
   * trozo del mapa del fotograma compartido. No pasa por ninguna API de Google,
   * así que no cuesta nada; a cambio, el navegador pide permiso cada vez y hay
   * que elegir «esta pestaña» en el cuadro que sale.
   */
  async capturarCard(): Promise<void> {
    if (!this.puedeCapturarPantalla) {
      this._toastr.info('Este navegador no permite capturar la pantalla. Usa «Capturar» (Google) o la tecla Impr Pant.', 'Captura de la tarjeta');
      return;
    }
    if (this.capturandoPantalla) { return; }

    this.capturandoPantalla = true;
    let stream: MediaStream | null = null;
    const video = document.createElement('video');
    try {
      stream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: { displaySurface: 'browser' },
        audio: false,
        preferCurrentTab: true,          // Chrome / Edge: propone esta misma pestaña
        selfBrowserSurface: 'include',
      });

      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      // Un par de fotogramas para que la imagen llegue completa
      await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));

      const caja = this.mapContainer.nativeElement.getBoundingClientRect();
      const superficie = stream.getVideoTracks()[0]?.getSettings?.().displaySurface;
      const recortable = superficie === 'browser' || superficie === undefined;

      // El fotograma de la pestaña es la ventana entera: la escala saca los píxeles reales
      const escalaX = video.videoWidth / Math.max(1, window.innerWidth);
      const escalaY = video.videoHeight / Math.max(1, window.innerHeight);

      const lienzo = document.createElement('canvas');
      const ctx = lienzo.getContext('2d')!;
      if (recortable) {
        lienzo.width = Math.max(1, Math.round(caja.width * escalaX));
        lienzo.height = Math.max(1, Math.round(caja.height * escalaY));
        ctx.drawImage(video,
          Math.round(caja.left * escalaX), Math.round(caja.top * escalaY),
          lienzo.width, lienzo.height,
          0, 0, lienzo.width, lienzo.height);
      } else {
        // Compartió una ventana o la pantalla entera: no se puede recortar el mapa
        lienzo.width = video.videoWidth;
        lienzo.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        this._toastr.info('Se guardó todo lo compartido: para recortar sólo el mapa elige «Pestaña de Chrome».', 'Captura de la tarjeta', { timeOut: 6000 });
      }

      const blob = await new Promise<Blob | null>(res => lienzo.toBlob(res, 'image/png'));
      if (!blob) { throw new Error('el navegador no devolvió la imagen'); }

      const ahora = new Date();
      this.guardarUnicaCaptura({
        id: ++this.idCaptura,
        nombre: this.nombreArchivo(ahora).replace(/\.png$/, '-pantalla.png'),
        titulo: this.lugar?.nombre ?? 'Mapa en pantalla',
        hora: ahora.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        origen: 'pantalla',
        tipo: 'mapa',
        url: URL.createObjectURL(blob),
        blob,
        ancho: lienzo.width,
        alto: lienzo.height,
        fallo: false,
      });
      if (this.panelOculto) { this.alternarPanel(); }
      this._toastr.success('Captura lista: ya puedes guardarla', 'Captura de la tarjeta', { timeOut: 2500 });
    } catch (e: any) {
      if (e?.name !== 'NotAllowedError' && e?.name !== 'AbortError') {   // lo canceló el usuario
        console.error('No se pudo capturar la pantalla:', e);
        this._toastr.warning('No se pudo capturar la pantalla', 'Captura de la tarjeta');
      }
    } finally {
      stream?.getTracks().forEach(t => t.stop());
      video.srcObject = null;
      this.capturandoPantalla = false;
    }
  }

  /**
   * Se conserva una captura de cada clase (la del mapa y la de la calle): la
   * nueva sustituye a la anterior de su misma clase y suelta su imagen. Si el
   * visor estaba abierto, pasa a mostrar la recién llegada.
   */
  private guardarUnicaCaptura(captura: CapturaMapa): void {
    const visorAbierto = !!this.visor;
    this.capturas.filter(c => c.tipo === captura.tipo).forEach(c => this.soltarCaptura(c));
    this.capturas = [captura, ...this.capturas.filter(c => c.tipo !== captura.tipo)];
    if (visorAbierto) {
      this.visor = captura.fallo ? null : captura;
      this.ajustarVisor();
    }
  }

  /**
   * Captura automática después de que el mapa termine de encuadrar el lugar
   * (al pulsar un punto o al buscar una dirección). Se espera al «idle» para
   * que la imagen salga con el mismo centro y zoom que se ven; si el mapa ya
   * estaba quieto, dispara igual a los 1,2 s.
   */
  private capturarTrasEncuadre(): void {
    if (!this.capturaAutomatica || !this.mapa) { return; }
    let hecha = false;
    const disparar = () => {
      if (hecha) { return; }
      hecha = true;
      this.zone.run(() => this.capturarMapa());
    };
    this.gm?.event?.addListenerOnce?.(this.mapa, 'idle', disparar);
    setTimeout(disparar, 1200);
  }

  guardarCapturaAutomatica(): void {
    try { localStorage.setItem('miCRM3.gmaps.capturaAuto', this.capturaAutomatica ? '1' : '0'); } catch { /* sin storage */ }
  }

  /** Tamaño de la imagen, con la forma del mapa que se ve (la API permite hasta 640 px por lado). */
  private tamanoCaptura(): { ancho: number; alto: number } {
    const caja = this.mapContainer?.nativeElement?.getBoundingClientRect();
    const ancho = Math.min(640, Math.max(320, Math.round(caja?.width ?? 640)));
    const alto = Math.min(640, Math.max(240, Math.round(caja?.height ?? 480)));
    return { ancho, alto };
  }

  private urlEstatica(lat: number, lng: number): string {
    const { ancho, alto } = this.tamanoCaptura();
    const p = new URLSearchParams();
    p.set('center', `${lat.toFixed(6)},${lng.toFixed(6)}`);
    p.set('zoom', String(this.zoomEstatico()));
    p.set('size', `${ancho}x${alto}`);
    p.set('scale', '2');                       // el doble de píxeles: se ve bien al imprimir
    p.set('maptype', this.tipoMapa);
    p.set('language', 'es');
    p.set('region', 'ec');
    if (this.lugar) { p.set('markers', `color:red|${this.lugar.lat.toFixed(6)},${this.lugar.lng.toFixed(6)}`); }
    if (this.miPosicion) { p.append('markers', `color:blue|label:Y|${this.miPosicion.lat.toFixed(6)},${this.miPosicion.lng.toFixed(6)}`); }
    p.set('key', (environment as any).GOOGLE_MAPS_API_KEY ?? '');
    // La API quiere las barras verticales sin codificar
    return `https://maps.googleapis.com/maps/api/staticmap?${p.toString().replace(/%7C/g, '|')}`;
  }

  /**
   * Zoom de la imagen. La foto puede tener como mucho 640 px de lado, bastante
   * menos que el mapa en pantalla, así que al mismo zoom saldría un recorte más
   * pequeño de lo que se ve: se baja el zoom lo necesario para abarcar al menos
   * la vista, y `areaCaptura` baja uno más por cada paso de ampliación.
   */
  private zoomEstatico(): number {
    const zoomMapa = Math.round(this.mapa?.getZoom?.() ?? 16);
    const caja = this.mapContainer?.nativeElement?.getBoundingClientRect();
    const { ancho, alto } = this.tamanoCaptura();
    const veces = Math.max((caja?.width ?? ancho) / ancho, (caja?.height ?? alto) / alto);
    const niveles = Math.ceil(Math.log2(Math.max(1, veces)));
    return Math.min(21, Math.max(1, zoomMapa - niveles - this.areaCaptura));
  }

  guardarAreaCaptura(): void {
    this.areaCaptura = Number(this.areaCaptura) || 0;
    try { localStorage.setItem('miCRM3.gmaps.areaCaptura', String(this.areaCaptura)); } catch { /* sin storage */ }
  }

  private nombreArchivo(fecha: Date): string {
    const base = (this.lugar?.nombre ?? 'mapa')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')     // sin tildes
      .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 40);
    const s = (n: number) => String(n).padStart(2, '0');
    const sello = `${fecha.getFullYear()}${s(fecha.getMonth() + 1)}${s(fecha.getDate())}-${s(fecha.getHours())}${s(fecha.getMinutes())}${s(fecha.getSeconds())}`;
    return `${base || 'mapa'}-${sello}.png`;
  }

  descargarCaptura(c: CapturaMapa): void {
    if (!c.blob) { this.abrirCaptura(c); return; }   // de otro dominio: el navegador ignora «download»
    const a = document.createElement('a');
    a.href = c.url;
    a.download = c.nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  abrirCaptura(c: CapturaMapa): void {
    window.open(c.url, '_blank', 'noopener');
  }

  // ================================================================
  // VISOR DE IMÁGENES (ampliar, reducir, girar, arrastrar)
  // ================================================================

  abrirVisor(c: CapturaMapa): void {
    if (c.fallo) { return; }
    this.visor = c;
    this.ajustarVisor();
  }

  cerrarVisor(): void {
    this.visor = null;
    this.arrastrando = false;
  }

  /** Vuelve al tamaño y giro de partida. */
  ajustarVisor(): void {
    this.escala = 1;
    this.giro = 0;
    this.desplazamiento = { x: 0, y: 0 };
  }

  get escalaTexto(): string {
    return `${Math.round(this.escala * 100)}%`;
  }

  /** Lo que se aplica a la imagen del visor. */
  get transformVisor(): string {
    return `translate(${this.desplazamiento.x}px, ${this.desplazamiento.y}px) scale(${this.escala}) rotate(${this.giro}deg)`;
  }

  ampliar(paso = 0.25): void {
    this.escala = Math.min(this.ESCALA_MAX, +(this.escala + paso).toFixed(2));
  }

  reducir(paso = 0.25): void {
    this.escala = Math.max(this.ESCALA_MIN, +(this.escala - paso).toFixed(2));
    if (this.escala <= 1) { this.desplazamiento = { x: 0, y: 0 }; }
  }

  girar(grados: number): void {
    this.giro = (this.giro + grados) % 360;
    // Al ponerse de lado la imagen ya no entra: se ajusta al hueco, como al abrir
    this.escala = this.escalaQueEntra();
    this.desplazamiento = { x: 0, y: 0 };
  }

  /** Cuánto hay que reducir para que la imagen (girada o no) quepa en el visor. */
  private escalaQueEntra(): number {
    const img = this.visorImg?.nativeElement;
    const caja = this.visorLienzo?.nativeElement;
    if (!img || !caja || !img.offsetWidth || !img.offsetHeight) { return 1; }
    const deLado = Math.abs(this.giro % 180) === 90;
    const ancho = deLado ? img.offsetHeight : img.offsetWidth;
    const alto  = deLado ? img.offsetWidth  : img.offsetHeight;
    return +Math.min(1, (caja.clientWidth * 0.96) / ancho, (caja.clientHeight * 0.96) / alto).toFixed(2);
  }

  /** Rueda del ratón: acerca y aleja sobre el punto del cursor. */
  onVisorRueda(ev: WheelEvent): void {
    ev.preventDefault();
    const antes = this.escala;
    const despues = Math.min(this.ESCALA_MAX, Math.max(this.ESCALA_MIN, antes * (ev.deltaY < 0 ? 1.12 : 1 / 1.12)));
    if (despues === antes) { return; }

    // Mantener bajo el cursor el punto que se está mirando
    const caja = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    const cx = ev.clientX - (caja.left + caja.width / 2);
    const cy = ev.clientY - (caja.top + caja.height / 2);
    const factor = despues / antes;
    this.desplazamiento = {
      x: cx - (cx - this.desplazamiento.x) * factor,
      y: cy - (cy - this.desplazamiento.y) * factor,
    };
    this.escala = +despues.toFixed(2);
  }

  onVisorRatonAbajo(ev: MouseEvent): void {
    if (ev.button !== 0) { return; }
    ev.preventDefault();
    this.arrastrando = true;
    this.arrastreInicio = { x: ev.clientX, y: ev.clientY, panX: this.desplazamiento.x, panY: this.desplazamiento.y };
  }

  @HostListener('document:mousemove', ['$event'])
  onVisorRatonMueve(ev: MouseEvent): void {
    if (!this.arrastrando) { return; }
    this.desplazamiento = {
      x: this.arrastreInicio.panX + (ev.clientX - this.arrastreInicio.x),
      y: this.arrastreInicio.panY + (ev.clientY - this.arrastreInicio.y),
    };
  }

  @HostListener('document:mouseup')
  onVisorRatonArriba(): void {
    this.arrastrando = false;
  }

  /** Un dedo arrastra; dos dedos amplían o reducen. */
  onVisorDedosAbajo(ev: TouchEvent): void {
    if (ev.touches.length === 2) {
      this.pellizcoInicial = this.distanciaDedos(ev);
      this.escalaPellizco = this.escala;
      this.arrastrando = false;
    } else if (ev.touches.length === 1) {
      const t = ev.touches[0];
      this.arrastrando = true;
      this.arrastreInicio = { x: t.clientX, y: t.clientY, panX: this.desplazamiento.x, panY: this.desplazamiento.y };
    }
  }

  onVisorDedosMueve(ev: TouchEvent): void {
    if (ev.touches.length === 2 && this.pellizcoInicial > 0) {
      ev.preventDefault();
      const proporcion = this.distanciaDedos(ev) / this.pellizcoInicial;
      this.escala = +Math.min(this.ESCALA_MAX, Math.max(this.ESCALA_MIN, this.escalaPellizco * proporcion)).toFixed(2);
    } else if (this.arrastrando && ev.touches.length === 1) {
      ev.preventDefault();
      const t = ev.touches[0];
      this.desplazamiento = {
        x: this.arrastreInicio.panX + (t.clientX - this.arrastreInicio.x),
        y: this.arrastreInicio.panY + (t.clientY - this.arrastreInicio.y),
      };
    }
  }

  onVisorDedosArriba(): void {
    this.arrastrando = false;
    this.pellizcoInicial = 0;
  }

  private distanciaDedos(ev: TouchEvent): number {
    const [a, b] = [ev.touches[0], ev.touches[1]];
    return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
  }

  /** Pasar a la captura anterior o siguiente sin salir del visor. */
  moverVisor(paso: number): void {
    if (!this.visor || this.capturas.length < 2) { return; }
    const i = this.capturas.findIndex(c => c.id === this.visor!.id);
    const siguiente = this.capturas[(i + paso + this.capturas.length) % this.capturas.length];
    this.visor = siguiente;
    this.ajustarVisor();
  }

  @HostListener('document:keydown', ['$event'])
  onVisorTecla(ev: KeyboardEvent): void {
    if (!this.visor) { return; }
    switch (ev.key) {
      case 'Escape':     this.cerrarVisor(); break;
      case '+': case '=': this.ampliar(); break;
      case '-':          this.reducir(); break;
      case 'r': case 'R': this.girar(ev.shiftKey ? -90 : 90); break;
      case '0':          this.ajustarVisor(); break;
      case 'ArrowLeft':  this.moverVisor(-1); break;
      case 'ArrowRight': this.moverVisor(1); break;
      default: return;
    }
    ev.preventDefault();
  }

  /** Copia la imagen al portapapeles (para pegarla en un correo o un informe). */
  async copiarCaptura(c: CapturaMapa): Promise<void> {
    if (await this.copiarImagen(c)) {
      this._toastr.success('Imagen copiada', 'Captura del mapa', { timeOut: 2000 });
    } else {
      this._toastr.warning('Este navegador no copia imágenes: usa «Guardar».', 'Captura del mapa');
    }
  }

  /** Deja la imagen en el portapapeles. Devuelve si lo consiguió. */
  private async copiarImagen(c: CapturaMapa): Promise<boolean> {
    if (!c.blob || typeof ClipboardItem === 'undefined') { return false; }
    try {
      await (navigator.clipboard as any).write([new ClipboardItem({ [c.blob.type]: c.blob })]);
      return true;
    } catch (e) {
      console.error('No se pudo copiar la imagen:', e);
      return false;
    }
  }

  /**
   * Compartir la CAPTURA en una red concreta. Lo ideal es mandar el archivo
   * con el diálogo del sistema; cuando el navegador no sabe (o la red sólo
   * admite texto, como los enlaces de WhatsApp), se deja la imagen en el
   * portapapeles ANTES de abrir la red, para que sólo haya que pegarla.
   */
  async compartirCapturaEn(c: CapturaMapa, red: 'whatsapp' | 'telegram' | 'correo' | 'facebook' | 'x'): Promise<void> {
    // 1. ¿Se puede enviar el archivo tal cual? (móviles y Chrome con destinos)
    const nav = navigator as any;
    if (c.blob && nav.canShare && nav.share) {
      const archivo = new File([c.blob], c.nombre, { type: c.blob.type || 'image/png' });
      if (nav.canShare({ files: [archivo] })) {
        try {
          await nav.share({ files: [archivo], title: c.titulo, text: this.mensajeCompartir });
          return;
        } catch (e: any) {
          if (e?.name === 'AbortError') { return; }
          console.error('No se pudo compartir la imagen:', e);
        }
      }
    }

    // 2. Si no, la imagen va al portapapeles y se abre la red para pegarla
    const copiada = await this.copiarImagen(c);
    if (copiada) {
      this._toastr.success('Imagen copiada: pégala en el chat con Ctrl + V', 'Compartir la captura', { timeOut: 8000, closeButton: true });
    } else {
      this.descargarCaptura(c);
      this._toastr.info('La imagen se guardó: adjúntala desde tu carpeta de descargas.', 'Compartir la captura', { timeOut: 8000, closeButton: true });
    }
    this.compartirEn(red);
  }

  /**
   * Manda la imagen con el diálogo del sistema (WhatsApp, correo, Drive…).
   * Es la única forma de enviar el archivo en sí: los enlaces de WhatsApp o
   * Telegram sólo llevan texto. Si el navegador no sabe compartir archivos, la
   * descarga para adjuntarla a mano.
   */
  async compartirCaptura(c: CapturaMapa): Promise<void> {
    if (!c.blob) {
      this._toastr.info('Todavía no hay imagen que compartir', 'Compartir la captura');
      return;
    }
    const nav = navigator as any;
    const archivo = new File([c.blob], c.nombre, { type: c.blob.type || 'image/png' });
    if (nav.canShare?.({ files: [archivo] })) {
      try {
        await nav.share({ files: [archivo], title: c.titulo, text: this.mensajeCompartir });
        return;
      } catch (e: any) {
        if (e?.name === 'AbortError') { return; }   // lo cerró el usuario
        console.error('No se pudo compartir la imagen:', e);
      }
    }
    this.descargarCaptura(c);
    this._toastr.info('Este navegador no envía imágenes: se guardó para que la adjuntes.', 'Compartir la captura', { timeOut: 6000 });
  }

  quitarCaptura(c: CapturaMapa): void {
    this.soltarCaptura(c);
    this.capturas = this.capturas.filter(x => x.id !== c.id);
  }

  limpiarCapturas(): void {
    this.capturas.forEach(c => this.soltarCaptura(c));
    this.capturas = [];
  }

  private soltarCaptura(c: CapturaMapa): void {
    if (c.blob && c.url.startsWith('blob:')) { URL.revokeObjectURL(c.url); }
  }
}
