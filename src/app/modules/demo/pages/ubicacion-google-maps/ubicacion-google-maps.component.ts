import { Location } from '@angular/common';
import { AfterViewInit, Component, ElementRef, NgZone, OnDestroy, ViewChild } from '@angular/core';
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

  // ---------- Estado ----------
  /** 'cargando' la API, 'listo', 'sin-clave' o 'error' */
  estadoApi: 'cargando' | 'listo' | 'sin-clave' | 'error' = 'cargando';
  errorApi = '';
  tipoMapa: 'roadmap' | 'satellite' | 'hybrid' | 'terrain' = 'roadmap';
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

  // ---------- Capturas del mapa ----------
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
      this.zone.run(() => this.resolverPunto(ev.latLng.lat(), ev.latLng.lng(), ev.placeId));
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

    if (l.viewport) { this.mapa.fitBounds(l.viewport, 40); if (this.mapa.getZoom() > 17) { this.mapa.setZoom(17); } }
    else { this.mapa.panTo(pos); if (this.mapa.getZoom() < 16) { this.mapa.setZoom(16); } }

    this.sincronizarUrl();
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
      await s.place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location', 'viewport'] });
      const p = s.place;
      this.zone.run(() => this.mostrarLugar({
        nombre: p.displayName ?? s.principal,
        direccion: (p.formattedAddress ?? s.secundario ?? '').replace(/,\s*Ecuador\s*$/i, ''),
        lat: p.location.lat(),
        lng: p.location.lng(),
        viewport: p.viewport ?? undefined,
        placeId: s.placeId,
      }));
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
        this.mostrarLugar({
          nombre: r.formatted_address.split(',')[0],
          direccion: r.formatted_address.replace(/,\s*Ecuador\s*$/i, ''),
          lat: r.geometry.location.lat(),
          lng: r.geometry.location.lng(),
          viewport: r.geometry.viewport,
          placeId: r.place_id,
        });
      });
    });
  }

  /** Clic en el mapa: dirección del punto (o el lugar, si se pulsó un POI). */
  private async resolverPunto(lat: number, lng: number, placeId?: string): Promise<void> {
    this.resolviendoClic = true;
    try {
      if (placeId && this.places?.Place) {
        const p = new this.places.Place({ id: placeId });
        await p.fetchFields({ fields: ['displayName', 'formattedAddress', 'location', 'viewport'] });
        this.zone.run(() => this.mostrarLugar({
          nombre: p.displayName ?? 'Lugar',
          direccion: (p.formattedAddress ?? '').replace(/,\s*Ecuador\s*$/i, ''),
          lat: p.location?.lat() ?? lat, lng: p.location?.lng() ?? lng, placeId,
        }));
        return;
      }
      const { results } = await this.geocoder.geocode({ location: { lat, lng } });
      const r = results?.[0];
      this.zone.run(() => this.mostrarLugar({
        nombre: r ? r.formatted_address.split(',')[0] : 'Punto en el mapa',
        direccion: r ? r.formatted_address.replace(/,\s*Ecuador\s*$/i, '') : 'Sin dirección conocida',
        lat, lng, placeId: r?.place_id,
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
    const url = this.lugar ? this.urlLugar : this.urlVista;
    const titulo = this.lugar?.nombre ?? 'Ubicación';
    if (this.puedeCompartirNativo) {
      try {
        await (navigator as any).share({ title: titulo, text: this.lugar?.direccion ?? titulo, url });
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
  async capturarMapa(): Promise<void> {
    if (!this.mapa || this.capturando) { return; }
    const centro = this.mapa.getCenter?.();
    if (!centro) { return; }

    this.capturando = true;
    const remota = this.urlEstatica(centro.lat(), centro.lng());
    const ahora = new Date();
    const captura: CapturaMapa = {
      id: ++this.idCaptura,
      nombre: this.nombreArchivo(ahora),
      titulo: this.lugar?.nombre ?? `${centro.lat().toFixed(5)}, ${centro.lng().toFixed(5)}`,
      hora: ahora.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      origen: 'estatica',
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

    this.capturas.unshift(captura);
    this.capturando = false;
    if (this.panelOculto) { this.alternarPanel(); }
    if (!captura.fallo) { this._toastr.success('Captura lista: ya puedes guardarla', 'Captura del mapa', { timeOut: 2500 }); }
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
      this.capturas.unshift({
        id: ++this.idCaptura,
        nombre: this.nombreArchivo(ahora).replace(/\.png$/, '-pantalla.png'),
        titulo: this.lugar?.nombre ?? 'Mapa en pantalla',
        hora: ahora.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        origen: 'pantalla',
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
    p.set('zoom', String(Math.round(this.mapa.getZoom() ?? 16)));
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

  /** Copia la imagen al portapapeles (para pegarla en un correo o un informe). */
  async copiarCaptura(c: CapturaMapa): Promise<void> {
    if (!c.blob || typeof ClipboardItem === 'undefined') {
      this._toastr.info('Este navegador no copia imágenes: usa «Descargar».', 'Captura del mapa');
      return;
    }
    try {
      await (navigator.clipboard as any).write([new ClipboardItem({ [c.blob.type]: c.blob })]);
      this._toastr.success('Imagen copiada', 'Captura del mapa', { timeOut: 2000 });
    } catch (e) {
      console.error('No se pudo copiar la imagen:', e);
      this._toastr.warning('No se pudo copiar la imagen', 'Captura del mapa');
    }
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
