import { AfterViewInit, Component, ElementRef, HostListener, NgZone, OnDestroy, ViewChild } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Geolocation, type Position } from '@capacitor/geolocation';
import { ToastrService } from 'ngx-toastr';
import * as L from 'leaflet';

// Íconos por defecto de Leaflet (los suyos apuntan a rutas que el bundle no sirve)
const DefaultIcon = L.icon({
  iconRetinaUrl: '/assets/leaflet/marker-icon-2x.png',
  iconUrl: '/assets/leaflet/marker-icon.png',
  shadowUrl: '/assets/leaflet/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

/** Una lectura del GPS, tal como la muestra la ficha y la guarda el recorrido. */
interface Lectura {
  lat: number;
  lng: number;
  /** Radio de error en metros */
  precision: number | null;
  altitud: number | null;
  /** m/s */
  velocidad: number | null;
  /** grados desde el norte */
  rumbo: number | null;
  fecha: Date;
}

type Estado = 'sin' | 'obteniendo' | 'ubicado' | 'siguiendo';

/** Resultado de la búsqueda de direcciones (Nominatim). */
interface Lugar {
  id: number;
  nombre: string;
  detalle: string;
  tipo: string;
  lat: number;
  lng: number;
  /** [sur, norte, oeste, este] para encuadrar */
  caja: [number, number, number, number] | null;
}

/**
 * Ubicación GPS (demo).
 *
 * Mapa Leaflet (OpenStreetMap / satélite / topográfico) con la posición del
 * dispositivo: obtenerla una vez o seguirla en vivo (watchPosition) dibujando
 * el recorrido y la distancia. En el navegador usa navigator.geolocation; en
 * la app nativa (Capacitor) el plugin de Geolocation con permisos.
 *
 * Muestra latitud, longitud, precisión (círculo en el mapa), altitud,
 * velocidad, rumbo y la dirección aproximada (Nominatim, sin clave). Se puede
 * copiar la coordenada, abrirla en Google Maps o compartirla.
 */
@Component({
  selector: 'app-ubicacion-gps',
  templateUrl: './ubicacion-gps.component.html',
  styleUrls: ['./ubicacion-gps.component.css'],
  standalone: false,
})
export class UbicacionGpsComponent implements AfterViewInit, OnDestroy {

  @ViewChild('mapContainer', { static: true }) mapContainer!: ElementRef<HTMLDivElement>;

  // ---------- Estado ----------
  estado: Estado = 'sin';
  error: string | null = null;
  actual: Lectura | null = null;
  /** Dirección aproximada de la última lectura (Nominatim) */
  direccion: string | null = null;
  buscandoDireccion = false;
  /** Puntos del recorrido mientras se sigue en vivo */
  recorrido: Lectura[] = [];
  /** Metros recorridos (suma de tramos) */
  distancia = 0;
  /** Centrar el mapa en cada lectura nueva mientras se sigue */
  seguirCentrado = true;
  capa: 'calles' | 'satelite' | 'topo' = 'calles';
  esNativo = Capacitor.isNativePlatform();
  /** Panel de información plegado (pestaña en el borde, como Google Maps); se recuerda por navegador. */
  panelOculto = this.leerPanelOculto();

  // ---------- Búsqueda de direcciones ----------
  busqueda = '';
  sugerencias: Lugar[] = [];
  buscando = false;
  /** Índice resaltado con las flechas */
  sugerenciaActiva = -1;
  /** Lugar elegido (marcador rojo en el mapa) */
  lugar: Lugar | null = null;
  private marcadorLugar: L.Marker | null = null;
  private timerBusqueda: any = null;
  private abortBusqueda: AbortController | null = null;
  private readonly CLAVE_PANEL = 'miCRM3.gps.panelOculto';

  // ---------- Mapa ----------
  private mapa: L.Map | null = null;
  private marcador: L.Marker | null = null;
  private circulo: L.Circle | null = null;
  private linea: L.Polyline | null = null;
  private capas: Record<string, L.TileLayer> = {};
  private idWatchNavegador: number | null = null;
  private idWatchNativo: string | null = null;
  private timeouts = new Set<any>();

  constructor(
    private zone: NgZone,
    private _toastr: ToastrService,
  ) {}

  ngAfterViewInit(): void {
    // El contenedor necesita su tamaño real (el panel se pinta después)
    this.programar(() => this.inicializarMapa(), 300);
  }

  ngOnDestroy(): void {
    this.detenerSeguimiento();
    clearTimeout(this.timerBusqueda);
    this.abortBusqueda?.abort();
    this.timeouts.forEach(t => clearTimeout(t));
    this.mapa?.remove();
    this.mapa = null;
  }

  private programar(fn: () => void, ms: number): void {
    const id = setTimeout(() => { this.timeouts.delete(id); fn(); }, ms);
    this.timeouts.add(id);
  }

  @HostListener('window:resize')
  onResize(): void { this.mapa?.invalidateSize(); }

  /** El panel se expande / recarga: el mapa recalcula su tamaño */
  ajustarMapa(): void { this.programar(() => this.mapa?.invalidateSize(true), 350); }

  /** Pliega / despliega el panel de información; el mapa ocupa el hueco (la transición dura 250 ms). */
  alternarPanel(): void {
    this.panelOculto = !this.panelOculto;
    try { localStorage.setItem(this.CLAVE_PANEL, this.panelOculto ? '1' : '0'); } catch { /* sin storage */ }
    this.programar(() => this.mapa?.invalidateSize(true), 300);
  }

  private leerPanelOculto(): boolean {
    try { return localStorage.getItem('miCRM3.gps.panelOculto') === '1'; } catch { return false; }
  }

  // ================================================================
  // MAPA
  // ================================================================

  private inicializarMapa(): void {
    if (this.mapa) { this.mapa.remove(); }

    this.capas = {
      calles: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '© OpenStreetMap',
      }),
      satelite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19, attribution: '© Esri, Maxar, Earthstar Geographics',
      }),
      topo: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        maxZoom: 17, attribution: '© OpenTopoMap (CC-BY-SA)',
      }),
    };

    this.mapa = L.map(this.mapContainer.nativeElement, {
      center: [-1.8312, -78.1834],   // Ecuador, hasta que haya una lectura
      zoom: 6,
      zoomControl: true,
      attributionControl: true,
      layers: [this.capas[this.capa]],
    });
    L.control.scale({ metric: true, imperial: false }).addTo(this.mapa);

    this.programar(() => this.mapa?.invalidateSize(true), 400);
  }

  cambiarCapa(capa: 'calles' | 'satelite' | 'topo'): void {
    if (!this.mapa || capa === this.capa) { return; }
    this.mapa.removeLayer(this.capas[this.capa]);
    this.capas[capa].addTo(this.mapa);
    this.capa = capa;
  }

  private pintar(l: Lectura): void {
    if (!this.mapa) { return; }
    const punto: L.LatLngExpression = [l.lat, l.lng];

    if (this.marcador) {
      this.marcador.setLatLng(punto);
    } else {
      this.marcador = L.marker(punto).addTo(this.mapa);
    }
    this.marcador.bindPopup(this.popupHtml(l));

    // Círculo de precisión
    if (l.precision) {
      if (this.circulo) {
        this.circulo.setLatLng(punto).setRadius(l.precision);
      } else {
        this.circulo = L.circle(punto, {
          radius: l.precision, color: '#00acac', weight: 1, fillColor: '#00acac', fillOpacity: .12,
        }).addTo(this.mapa);
      }
    }

    // Recorrido (sólo al seguir)
    if (this.estado === 'siguiendo' && this.recorrido.length > 1) {
      const puntos = this.recorrido.map(p => [p.lat, p.lng] as L.LatLngExpression);
      if (this.linea) { this.linea.setLatLngs(puntos); }
      else { this.linea = L.polyline(puntos, { color: '#348fe2', weight: 4, opacity: .8 }).addTo(this.mapa); }
    }

    if (this.estado !== 'siguiendo' || this.seguirCentrado) {
      const zoom = Math.max(this.mapa.getZoom(), this.zoomPorPrecision(l.precision));
      this.mapa.setView(punto, zoom, { animate: true });
    }
    if (this.estado !== 'siguiendo') { this.marcador.openPopup(); }
  }

  /** Cuanto más precisa la lectura, más cerca se mira. */
  private zoomPorPrecision(precision: number | null): number {
    if (!precision) { return 15; }
    if (precision < 30) { return 18; }
    if (precision < 150) { return 16; }
    if (precision < 1000) { return 14; }
    return 12;
  }

  private popupHtml(l: Lectura): string {
    return `<div class="gps-popup">
      <b>📍 ${l.lat.toFixed(6)}, ${l.lng.toFixed(6)}</b><br>
      ${l.precision ? `Precisión ± ${Math.round(l.precision)} m<br>` : ''}
      <small>${l.fecha.toLocaleTimeString()}</small>
    </div>`;
  }

  centrar(): void {
    if (!this.actual || !this.mapa) { return; }
    this.mapa.setView([this.actual.lat, this.actual.lng], Math.max(this.mapa.getZoom(), 16), { animate: true });
    this.marcador?.openPopup();
  }

  /** Encuadra todo el recorrido */
  verRecorrido(): void {
    if (!this.mapa || this.recorrido.length < 2) { return; }
    this.mapa.fitBounds(L.latLngBounds(this.recorrido.map(p => [p.lat, p.lng] as L.LatLngExpression)), { padding: [30, 30] });
  }

  // ================================================================
  // GPS
  // ================================================================

  private aLectura(pos: GeolocationPosition | Position): Lectura {
    const c = pos.coords;
    return {
      lat: c.latitude,
      lng: c.longitude,
      precision: c.accuracy ?? null,
      altitud: c.altitude ?? null,
      velocidad: c.speed ?? null,
      rumbo: c.heading ?? null,
      fecha: new Date(pos.timestamp),
    };
  }

  /** Una lectura, y a pintarla (y a buscar la dirección si se movió). */
  private recibir(pos: GeolocationPosition | Position): void {
    this.zone.run(() => {
      const l = this.aLectura(pos);
      const anterior = this.actual;
      this.actual = l;
      this.error = null;
      if (this.estado === 'siguiendo') {
        // Sólo se suma si se movió más que el error de la lectura (evita "temblor")
        const ultimo = this.recorrido[this.recorrido.length - 1];
        if (!ultimo || this.distanciaM(ultimo, l) > Math.min(l.precision ?? 10, 25)) {
          if (ultimo) { this.distancia += this.distanciaM(ultimo, l); }
          this.recorrido.push(l);
        }
      } else {
        this.estado = 'ubicado';
      }
      this.pintar(l);
      // Dirección: sólo si es la primera o se movió > 50 m (Nominatim pide moderación)
      if (!anterior || this.distanciaM(anterior, l) > 50) { this.buscarDireccion(l); }
    });
  }

  private fallo(err: any): void {
    this.zone.run(() => {
      console.error('Error de geolocalización:', err);
      const codigo = err?.code;
      const msg = String(err?.message ?? '').toLowerCase();
      if (codigo === 1 || msg.includes('denied') || msg.includes('permission')) {
        this.error = 'Permiso denegado. Permite el acceso a la ubicación en el navegador o en los ajustes del dispositivo.';
      } else if (codigo === 2 || msg.includes('unavailable')) {
        this.error = 'Ubicación no disponible. Activa el GPS o la ubicación del dispositivo e inténtalo de nuevo.';
      } else if (codigo === 3 || msg.includes('timeout')) {
        this.error = 'Se agotó el tiempo de espera. Prueba al aire libre o con el GPS activado.';
      } else if (!window.isSecureContext) {
        this.error = 'El navegador sólo da la ubicación en páginas seguras (https o localhost).';
      } else {
        this.error = 'No se pudo obtener la ubicación.';
      }
      if (this.estado === 'obteniendo') { this.estado = this.actual ? 'ubicado' : 'sin'; }
      if (this.estado === 'siguiendo') {
        // Siguiendo: un fallo puntual (sin señal, tiempo agotado) no corta el
        // seguimiento, el GPS vuelve a dar lecturas; sólo el permiso denegado lo para.
        if (codigo === 1) { this.detenerSeguimiento(); this._toastr.error(this.error, 'Ubicación'); }
        else { this._toastr.warning(this.error, 'Ubicación', { timeOut: 3000 }); }
        return;
      }
      this._toastr.error(this.error, 'Ubicación');
    });
  }

  /** Una sola lectura. */
  async obtenerUbicacion(): Promise<void> {
    if (this.estado === 'obteniendo') { return; }
    if (this.estado === 'siguiendo') { this.detenerSeguimiento(); }
    this.estado = 'obteniendo';
    this.error = null;

    const opciones = { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 };
    if (this.esNativo) {
      try {
        await Geolocation.requestPermissions();
        this.recibir(await Geolocation.getCurrentPosition(opciones));
      } catch (e) { this.fallo(e); }
      return;
    }
    if (!navigator.geolocation) {
      this.fallo({ message: 'unavailable' });
      return;
    }
    navigator.geolocation.getCurrentPosition(p => this.recibir(p), e => this.fallo(e), opciones);
  }

  /** Seguimiento en vivo: cada lectura nueva mueve el marcador y alarga el recorrido. */
  async iniciarSeguimiento(): Promise<void> {
    if (this.estado === 'siguiendo') { return; }
    this.estado = 'siguiendo';
    this.error = null;
    this.recorrido = this.actual ? [this.actual] : [];
    this.distancia = 0;
    if (this.linea) { this.mapa?.removeLayer(this.linea); this.linea = null; }

    const opciones = { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 };
    if (this.esNativo) {
      try {
        await Geolocation.requestPermissions();
        this.idWatchNativo = await Geolocation.watchPosition(opciones, (pos, err) => {
          if (err) { this.fallo(err); } else if (pos) { this.recibir(pos); }
        });
      } catch (e) { this.fallo(e); }
      return;
    }
    if (!navigator.geolocation) { this.fallo({ message: 'unavailable' }); return; }
    this.idWatchNavegador = navigator.geolocation.watchPosition(p => this.recibir(p), e => this.fallo(e), opciones);
    this._toastr.info('Siguiendo tu ubicación en vivo', 'Ubicación', { timeOut: 2500 });
  }

  detenerSeguimiento(): void {
    if (this.idWatchNavegador !== null) {
      navigator.geolocation.clearWatch(this.idWatchNavegador);
      this.idWatchNavegador = null;
    }
    if (this.idWatchNativo !== null) {
      Geolocation.clearWatch({ id: this.idWatchNativo }).catch(() => { /* ya cerrado */ });
      this.idWatchNativo = null;
    }
    if (this.estado === 'siguiendo') { this.estado = this.actual ? 'ubicado' : 'sin'; }
  }

  alternarSeguimiento(): void {
    if (this.estado === 'siguiendo') { this.detenerSeguimiento(); } else { this.iniciarSeguimiento(); }
  }

  limpiar(): void {
    this.detenerSeguimiento();
    this.limpiarBusqueda();
    this.actual = null;
    this.direccion = null;
    this.error = null;
    this.recorrido = [];
    this.distancia = 0;
    this.estado = 'sin';
    [this.marcador, this.circulo, this.linea].forEach(c => c && this.mapa?.removeLayer(c));
    this.marcador = this.circulo = this.linea = null;
  }

  // ================================================================
  // BUSCAR UNA DIRECCIÓN (Nominatim, sin clave). Como Google Maps: se
  // escribe y van saliendo sugerencias (con 400 ms de espera para no
  // saturar el servicio); al elegir una, el mapa se encuadra en ella.
  // ================================================================

  onBusquedaCambia(): void {
    clearTimeout(this.timerBusqueda);
    const q = this.busqueda.trim();
    if (q.length < 3) { this.sugerencias = []; this.sugerenciaActiva = -1; return; }
    this.timerBusqueda = setTimeout(() => this.buscarLugares(q), 400);
  }

  private async buscarLugares(q: string): Promise<void> {
    this.abortBusqueda?.abort();
    const ctrl = new AbortController();
    this.abortBusqueda = ctrl;
    this.buscando = true;
    try {
      // Se prefieren resultados cerca de lo que se ve en el mapa (viewbox, sin limitar)
      let cerca = '';
      if (this.mapa) {
        const b = this.mapa.getBounds();
        cerca = `&viewbox=${b.getWest()},${b.getNorth()},${b.getEast()},${b.getSouth()}`;
      }
      // Sólo Ecuador (countrycodes=ec): lo de fuera del país no sale
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=7&accept-language=es&countrycodes=ec&q=${encodeURIComponent(q)}${cerca}`;
      const r = await fetch(url, { headers: { 'Accept': 'application/json' }, signal: ctrl.signal });
      const lista: any[] = await r.json();
      this.zone.run(() => {
        this.sugerencias = (lista ?? []).map(x => this.aLugar(x));
        this.sugerenciaActiva = this.sugerencias.length ? 0 : -1;
      });
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        console.error('Error al buscar la dirección:', e);
        this.zone.run(() => { this.sugerencias = []; });
      }
    } finally {
      if (this.abortBusqueda === ctrl) { this.zone.run(() => { this.buscando = false; }); }
    }
  }

  private aLugar(x: any): Lugar {
    const nombre = x.name || x.display_name?.split(',')[0] || '';
    // Todo es Ecuador: el país al final sobra en el detalle
    if (typeof x.display_name === 'string') { x.display_name = x.display_name.replace(/,\s*Ecuador\s*$/i, ''); }
    // Sin el nombre al principio (display_name lo repite); se escapa para el RegExp
    const esc = nombre.replace(/[.*+?^${}()|[\]\\]/g, (c: string) => '\\' + c);
    const detalle = String(x.display_name ?? '').replace(new RegExp('^' + esc + ',?\\s*'), '');
    const bb = x.boundingbox?.map(Number);
    return {
      id: Number(x.place_id),
      nombre,
      detalle,
      tipo: String(x.type ?? x.category ?? '').replace(/_/g, ' '),
      lat: Number(x.lat),
      lng: Number(x.lon),
      caja: bb && bb.length === 4 ? [bb[0], bb[1], bb[2], bb[3]] : null,
    };
  }

  /** Teclado en el buscador: ↑ ↓ recorren, Enter elige, Esc cierra. */
  onBusquedaTecla(ev: KeyboardEvent): void {
    if (!this.sugerencias.length) {
      if (ev.key === 'Enter') { ev.preventDefault(); this.buscarLugares(this.busqueda.trim()); }
      return;
    }
    if (ev.key === 'ArrowDown') { ev.preventDefault(); this.sugerenciaActiva = (this.sugerenciaActiva + 1) % this.sugerencias.length; }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); this.sugerenciaActiva = (this.sugerenciaActiva - 1 + this.sugerencias.length) % this.sugerencias.length; }
    else if (ev.key === 'Enter') { ev.preventDefault(); if (this.sugerenciaActiva >= 0) { this.irALugar(this.sugerencias[this.sugerenciaActiva]); } }
    else if (ev.key === 'Escape') { this.sugerencias = []; this.sugerenciaActiva = -1; }
  }

  /** Muestra el lugar en el mapa (marcador rojo, encuadre por su caja) y lo deja en la ficha. */
  irALugar(l: Lugar): void {
    this.lugar = l;
    this.busqueda = l.nombre ? `${l.nombre}${l.detalle ? ', ' + l.detalle : ''}` : this.busqueda;
    this.sugerencias = [];
    this.sugerenciaActiva = -1;
    if (!this.mapa) { return; }

    const punto: L.LatLngExpression = [l.lat, l.lng];
    // Chincheta roja con Font Awesome (sin imágenes externas); la azul es «yo»
    const icono = L.divIcon({
      className: 'gps-pin-lugar',
      html: '<i class="fa fa-location-dot"></i>',
      iconSize: [30, 40], iconAnchor: [15, 38], popupAnchor: [0, -34],
    });
    if (this.marcadorLugar) { this.marcadorLugar.setLatLng(punto).setIcon(icono); }
    else { this.marcadorLugar = L.marker(punto, { icon: icono, zIndexOffset: 500 }).addTo(this.mapa); }
    this.marcadorLugar.bindPopup(`<div class="gps-popup"><b>${l.nombre}</b><br>${l.detalle}<br><small>${l.lat.toFixed(6)}, ${l.lng.toFixed(6)}</small></div>`).openPopup();

    if (l.caja) {
      // Calles y ciudades traen su extensión: se encuadra; un punto suelto se acerca
      const bounds = L.latLngBounds([l.caja[0], l.caja[2]], [l.caja[1], l.caja[3]]);
      this.mapa.fitBounds(bounds, { padding: [40, 40], maxZoom: 17, animate: true });
    } else {
      this.mapa.setView(punto, 16, { animate: true });
    }
  }

  limpiarBusqueda(): void {
    clearTimeout(this.timerBusqueda);
    this.abortBusqueda?.abort();
    this.busqueda = '';
    this.sugerencias = [];
    this.sugerenciaActiva = -1;
    this.buscando = false;
    this.lugar = null;
    if (this.marcadorLugar) { this.mapa?.removeLayer(this.marcadorLugar); this.marcadorLugar = null; }
  }

  /** Distancia en línea recta desde mi posición hasta el lugar buscado. */
  get distanciaAlLugar(): string {
    if (!this.actual || !this.lugar) { return ''; }
    const m = this.distanciaM(this.actual, { ...this.lugar, precision: null, altitud: null, velocidad: null, rumbo: null, fecha: new Date() });
    return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
  }

  /** Cómo llegar en Google Maps, desde mi posición si la hay. */
  abrirRutaEnMaps(): void {
    if (!this.lugar) { return; }
    const destino = `${this.lugar.lat},${this.lugar.lng}`;
    const url = this.actual
      ? `https://www.google.com/maps/dir/?api=1&origin=${this.actual.lat},${this.actual.lng}&destination=${destino}`
      : `https://www.google.com/maps/search/?api=1&query=${destino}`;
    window.open(url, '_blank', 'noopener');
  }

  // ================================================================
  // DIRECCIÓN (Nominatim, sin clave), COPIAR, ABRIR, COMPARTIR
  // ================================================================

  private async buscarDireccion(l: Lectura): Promise<void> {
    this.buscandoDireccion = true;
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${l.lat}&lon=${l.lng}&accept-language=es`, {
        headers: { 'Accept': 'application/json' },
      });
      const j = await r.json();
      this.zone.run(() => { this.direccion = (j?.display_name ?? null)?.replace(/,\s*Ecuador\s*$/i, '') ?? null; });
    } catch {
      this.zone.run(() => { this.direccion = null; });   // sin internet o bloqueado: no pasa nada
    } finally {
      this.zone.run(() => { this.buscandoDireccion = false; });
    }
  }

  get coordenadaTexto(): string {
    return this.actual ? `${this.actual.lat.toFixed(6)}, ${this.actual.lng.toFixed(6)}` : '';
  }

  get urlGoogleMaps(): string {
    return this.actual ? `https://www.google.com/maps?q=${this.actual.lat},${this.actual.lng}` : '';
  }

  async copiarCoordenada(): Promise<void> {
    if (!this.actual) { return; }
    try {
      await navigator.clipboard.writeText(this.coordenadaTexto);
      this._toastr.success('Coordenada copiada al portapapeles', 'Ubicación', { timeOut: 2000 });
    } catch {
      this._toastr.warning('No se pudo copiar; selecciona el texto y cópialo a mano', 'Ubicación');
    }
  }

  abrirEnMaps(): void {
    if (this.actual) { window.open(this.urlGoogleMaps, '_blank', 'noopener'); }
  }

  async compartir(): Promise<void> {
    if (!this.actual) { return; }
    const texto = `Mi ubicación: ${this.coordenadaTexto}${this.direccion ? ' — ' + this.direccion : ''}`;
    const nav: any = navigator;
    if (nav.share) {
      try { await nav.share({ title: 'Mi ubicación', text: texto, url: this.urlGoogleMaps }); } catch { /* cancelado */ }
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(texto + ' ' + this.urlGoogleMaps)}`, '_blank', 'noopener');
    }
  }

  // ================================================================
  // UTILIDADES DE PRESENTACIÓN
  // ================================================================

  /** Distancia en metros entre dos lecturas (haversine). */
  private distanciaM(a: Lectura, b: Lectura): number {
    const R = 6371000;
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLng = (b.lng - a.lng) * Math.PI / 180;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  get distanciaTexto(): string {
    return this.distancia >= 1000 ? `${(this.distancia / 1000).toFixed(2)} km` : `${Math.round(this.distancia)} m`;
  }

  get velocidadTexto(): string {
    const v = this.actual?.velocidad;
    return v === null || v === undefined || isNaN(v) ? '—' : `${(v * 3.6).toFixed(1)} km/h`;
  }

  get rumboTexto(): string {
    const r = this.actual?.rumbo;
    if (r === null || r === undefined || isNaN(r)) { return '—'; }
    const puntos = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
    return `${Math.round(r)}° ${puntos[Math.round(r / 45) % 8]}`;
  }

  get precisionTexto(): string {
    const p = this.actual?.precision;
    return p ? `± ${Math.round(p)} m` : '—';
  }

  /** Semáforo de la precisión: buena < 30 m, regular < 150 m, mala el resto */
  get calidadPrecision(): 'buena' | 'regular' | 'mala' | '' {
    const p = this.actual?.precision;
    if (!p) { return ''; }
    return p < 30 ? 'buena' : (p < 150 ? 'regular' : 'mala');
  }

  get altitudTexto(): string {
    const a = this.actual?.altitud;
    return a === null || a === undefined || isNaN(a) ? '—' : `${Math.round(a)} m`;
  }

  /** Coordenada en grados, minutos y segundos (para quien la prefiera así). */
  get coordenadaGms(): string {
    if (!this.actual) { return ''; }
    const gms = (v: number, pos: string, neg: string) => {
      const abs = Math.abs(v);
      const g = Math.floor(abs);
      const m = Math.floor((abs - g) * 60);
      const s = ((abs - g - m / 60) * 3600).toFixed(1);
      return `${g}° ${m}' ${s}" ${v >= 0 ? pos : neg}`;
    };
    return `${gms(this.actual.lat, 'N', 'S')}  ${gms(this.actual.lng, 'E', 'O')}`;
  }
}
