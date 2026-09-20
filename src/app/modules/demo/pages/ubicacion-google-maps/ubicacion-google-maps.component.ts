import { AfterViewInit, Component, ElementRef, NgZone, OnDestroy, ViewChild } from '@angular/core';
import { ToastrService } from 'ngx-toastr';

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

    this.estadoApi = 'listo';
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
    try {
      await navigator.clipboard.writeText(this.coordenadaTexto);
      this._toastr.success('Coordenada copiada', 'Google Maps', { timeOut: 2000 });
    } catch {
      this._toastr.warning('No se pudo copiar', 'Google Maps');
    }
  }

  abrirEnGoogleMaps(): void {
    if (!this.lugar) { return; }
    const q = this.lugar.placeId
      ? `https://www.google.com/maps/search/?api=1&query=${this.lugar.lat},${this.lugar.lng}&query_place_id=${this.lugar.placeId}`
      : `https://www.google.com/maps/search/?api=1&query=${this.lugar.lat},${this.lugar.lng}`;
    window.open(q, '_blank', 'noopener');
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
}
