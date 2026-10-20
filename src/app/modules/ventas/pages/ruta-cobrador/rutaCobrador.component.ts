import { AfterViewInit, Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';

import { PanelModule } from '../../../../components/panel/panel.module';
import { AvisoComponent } from '../../../../components/campos/aviso/aviso.component';
import { GoogleMapsLoaderService } from '../../../../service/google-maps-loader.service';
import { AccesoModel } from '../../../seguridad/interfaces/accesoModel';
import { RecorridoService } from '../../services/recorrido.service';
import {
  CobradorConRecorrido,
  DiaConRecorrido,
  ParadaRecorrido,
  RecorridoDelDia,
} from '../../interfaces/recorridoModel';

/**
 * RUTA DEL COBRADOR
 *
 * Se elige un cobrador y un día y se ve por dónde anduvo: el trazo, dónde se
 * paró, cuánto rato y si en esa parada había un cliente de la cartera.
 *
 * DE DÓNDE SALEN LOS DATOS. Del celular del propio cobrador, que va mandando
 * posiciones a ventas.recorrido_puntos. No se lee ningún archivo: un archivo
 * que el controlado puede editar antes de enseñarlo no sirve para controlar.
 *
 * LAS PARADAS NO ESTÁN GUARDADAS. Las calcula el servidor con el criterio que
 * se le mande, y por eso los tres controles de arriba —metros, minutos y
 * radio de cliente— recargan. «Parado» con 60 m y 5 minutos es una visita;
 * con 200 m y 20 minutos es un almuerzo. Las dos preguntas son legítimas y la
 * respuesta no se puede dejar congelada en una tabla.
 *
 * QUÉ NO DICE ESTA PANTALLA. Que una parada no tenga cliente al lado no
 * prueba nada: el cobrador pudo almorzar, cargar gasolina o visitar a alguien
 * cuya ficha no tiene coordenadas. Se enseña el dato y quien mira decide; la
 * pantalla no reparte culpas.
 *
 * El mapa es propio y no `app-ubicacion-google-maps`, por lo mismo que en
 * zonas: aquél sirve para elegir UN punto. Lo que se comparte es
 * GoogleMapsLoaderService, que carga la clave y el script una sola vez.
 */
@Component({
  selector: 'app-ruta-cobrador',
  standalone: true,
  imports: [CommonModule, FormsModule, PanelModule, AvisoComponent],
  templateUrl: './rutaCobrador.component.html',
  styleUrls: ['./rutaCobrador.component.css'],
})
export class RutaCobradorComponent implements OnInit, AfterViewInit, OnDestroy {

  @ViewChild('mapa') mapaDiv!: ElementRef<HTMLDivElement>;

  public accesoModel: AccesoModel;

  // ---------- Estado de la API de Google ----------
  public estadoApi: 'cargando' | 'listo' | 'sin-clave' | 'sin-permiso' | 'error' = 'cargando';
  public errorApi = '';

  /** El origen tal y como hay que pegarlo en Google Cloud, sin tener que deducirlo. */
  public readonly origenActual = window.location.origin;

  /**
   * El gm_authFailure que hubiera antes, para devolverlo al salir.
   *
   * Es el ÚNICO aviso que da Google cuando la clave no autoriza este origen:
   * el script carga con un 200 y el callback se dispara igual, así que la
   * pantalla creería que todo fue bien y enseñaría un mapa en blanco sin
   * decir por qué. Se engancha aquí y no en GoogleMapsLoaderService para no
   * tocar un servicio que usan las demás pantallas.
   */
  private authFailurePrevio: unknown = undefined;
  private engancheAuth = false;

  // ---------- Filtros ----------
  public cobradorId: number | null = null;
  public fecha = '';

  /**
   * El criterio de parada. Son los valores de «una visita a un cliente»: un
   * semáforo largo no llega a cinco minutos y un almuerzo se ve como una
   * parada de cuarenta, que es justo lo que se quiere poder distinguir.
   */
  public radioParada = 60;
  public minutosParada = 5;
  public radioCliente = 80;

  // ---------- Datos ----------
  public cobradores: CobradorConRecorrido[] = [];
  public dias: DiaConRecorrido[] = [];
  public recorrido: RecorridoDelDia | null = null;

  public cargandoCobradores = false;
  public cargandoDias = false;
  public cargando = false;

  /** La parada resaltada, para que la tabla y el mapa vayan juntos. */
  public paradaElegida: number | null = null;

  // ---------- Google Maps ----------
  private gm: any = null;
  private mapa: any = null;
  private globo: any = null;
  /** El trazo del recorrido */
  private trazo: any = null;
  /** Inicio, fin y paradas, como capa de datos */
  private capa: any = null;

  /** Ancho de la columna del mapa, en %. */
  public anchoIzquierda = 62;

  constructor(
    private _recorridos: RecorridoService,
    private _loader: GoogleMapsLoaderService,
    private _toastr: ToastrService,
    private activeRoute: ActivatedRoute,
    private router: Router,
    private zone: NgZone,
  ) {
    this.accesoModel = this.activeRoute.snapshot.data['access'];
    this.fecha = this.hoy();
  }

  /** La fecha de hoy como «AAAA-MM-DD», en la hora del equipo. */
  private hoy(): string {
    const d = new Date();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mes}-${dia}`;
  }

  ngOnInit(): void {
    this.cargarCobradores();
  }

  async ngAfterViewInit(): Promise<void> {
    if (!this._loader.hayClave) { this.estadoApi = 'sin-clave'; return; }

    // Antes de construir el mapa: el rechazo llega al construirlo, que es
    // después de que cargar() haya resuelto tan contento.
    const w = window as any;
    this.authFailurePrevio = w.gm_authFailure;
    this.engancheAuth = true;
    w.gm_authFailure = () => {
      this.zone.run(() => {
        this.estadoApi = 'sin-permiso';
        this.errorApi = `Google no autoriza la clave para ${this.origenActual}`;
      });
      // Se respeta el que hubiera, por si otra pantalla ya escuchaba
      if (typeof this.authFailurePrevio === 'function') { (this.authFailurePrevio as () => void)(); }
    };

    try {
      this.gm = await this._loader.cargar();
      await this.gm.importLibrary('maps');
      this.zone.run(() => this.inicializarMapa());
    } catch (e: any) {
      this.zone.run(() => {
        this.estadoApi = e?.message === 'SIN_CLAVE' ? 'sin-clave' : 'error';
        this.errorApi = e?.message ?? 'No se pudo cargar Google Maps';
      });
    }
  }

  ngOnDestroy(): void {
    if (this.engancheAuth) {
      (window as any).gm_authFailure = this.authFailurePrevio;
      this.engancheAuth = false;
    }
    this.limpiarMapa();
  }

  fun_home(): void {
    this.router.navigate(['/ventas']);
  }

  // ================================================================
  // DATOS
  // ================================================================

  /**
   * Quiénes tienen recorrido en el último mes.
   *
   * Si sólo hay uno, se elige solo: obligar a abrir un desplegable de un
   * elemento es trabajo para nada.
   */
  async cargarCobradores(): Promise<void> {
    this.cargandoCobradores = true;
    try {
      const r = await firstValueFrom(this._recorridos.cobradores());
      this.cobradores = r?.data ?? [];

      if (this.cobradores.length === 1) {
        this.cobradorId = this.cobradores[0].usuario_id;
        await this.cambiarCobrador();
      }
    } catch {
      // El AuthInterceptor ya enseñó el error HTTP
      this.cobradores = [];
    } finally {
      this.cargandoCobradores = false;
    }
  }

  /**
   * Al cambiar de cobrador se traen sus días y se salta al último.
   *
   * Dejar la fecha de hoy puesta cuando el cobrador no salió hoy enseña un
   * mapa vacío y parece que la pantalla está rota.
   */
  async cambiarCobrador(): Promise<void> {
    this.recorrido = null;
    this.paradaElegida = null;
    this.limpiarDibujo();
    this.dias = [];

    if (!this.cobradorId) { return; }

    this.cargandoDias = true;
    try {
      const r = await firstValueFrom(this._recorridos.dias(this.cobradorId));
      this.dias = r?.data ?? [];

      if (this.dias.length > 0) {
        // Vienen de más reciente a más antigua
        this.fecha = this.dias[0].fecha;
        await this.cargarRecorrido();
      } else {
        this._toastr.info('Este usuario no tiene recorridos registrados');
      }
    } catch {
      this.dias = [];
    } finally {
      this.cargandoDias = false;
    }
  }

  /** El recorrido del día elegido, con el criterio de parada de los controles. */
  async cargarRecorrido(): Promise<void> {
    if (!this.cobradorId || !this.fecha) { return; }

    this.cargando = true;
    this.paradaElegida = null;
    try {
      const r = await firstValueFrom(this._recorridos.delDia(this.cobradorId, this.fecha, {
        radioParada: this.radioParada,
        minutosParada: this.minutosParada,
        radioCliente: this.radioCliente,
      }));
      this.recorrido = r?.data ?? null;
      this.pintar();

      if (this.recorrido && this.recorrido.resumen.puntos === 0) {
        this._toastr.info('Sin recorrido ese día');
      }
    } catch {
      this.recorrido = null;
      this.limpiarDibujo();
    } finally {
      this.cargando = false;
    }
  }

  /** Los kilómetros de un día, para pintarlos junto a la fecha en el selector. */
  kmDelDia(fecha: string): number | null {
    return this.dias.find(d => d.fecha === fecha)?.km ?? null;
  }

  /**
   * Si el trazo se puede creer.
   *
   * Un recorrido donde más de un tercio de las lecturas traen un error de GPS
   * grande se dibuja igual, pero no sirve para afirmar dónde estuvo nadie, y
   * hay que decirlo antes de que alguien lo use para reclamar.
   */
  get trazoDudoso(): boolean {
    const r = this.recorrido?.resumen;
    if (!r || r.puntos === 0) { return false; }
    return r.lecturas_imprecisas / r.puntos > 0.33;
  }

  /** Minutos a «2 h 15 min», que es como se lee una jornada. */
  comoDuracion(minutos: number | null | undefined): string {
    if (minutos == null) { return '—'; }
    const m = Math.round(minutos);
    if (m < 60) { return `${m} min`; }
    return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
  }

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
    });

    this.globo = new this.gm.InfoWindow();

    // Capa de datos, igual que en zonas: una sola capa con todos los hitos y
    // el estilo decidido por las propiedades de cada uno. Es menos objetos que
    // mantener que un marcador suelto por parada.
    this.capa = new this.gm.Data({ map: this.mapa });
    this.capa.setStyle((f: any) => this.estiloHito(f));
    this.capa.addListener('click', (ev: any) => this.zone.run(() => this.alPulsarHito(ev)));

    this.estadoApi = 'listo';

    // El recorrido pudo llegar antes que el mapa: las dos cosas se piden a la
    // vez y la red no garantiza el orden.
    if (this.recorrido) { this.pintar(); }
  }

  /**
   * Cómo se pinta cada hito.
   *
   * Inicio en verde y fin en rojo, que es la convención que no hay que
   * explicar. Las paradas llevan su número dentro y el círculo crece con los
   * minutos, con un tope: una parada de cuatro horas no puede tapar el barrio.
   */
  private estiloHito(f: any): any {
    const tipo = f.getProperty('tipo');

    if (tipo === 'inicio' || tipo === 'fin') {
      return {
        icon: {
          path: this.gm.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: tipo === 'inicio' ? '#00ACAC' : '#FF5B57',
          fillOpacity: 1,
          strokeColor: '#FFFFFF',
          strokeWeight: 2,
        },
        title: tipo === 'inicio' ? 'Inicio de la jornada' : 'Fin de la jornada',
        zIndex: 30,
      };
    }

    const minutos = Number(f.getProperty('minutos') ?? 0);
    const elegida = f.getProperty('orden') === this.paradaElegida;
    // Sin cliente cerca se pinta en ambar: no es una acusacion, es lo que hay
    // que mirar antes que lo demas.
    const color = f.getProperty('tiene_cliente') ? '#348FE2' : '#F59C1A';

    return {
      icon: {
        path: this.gm.SymbolPath.CIRCLE,
        scale: Math.min(10 + minutos / 6, 22),
        fillColor: color,
        fillOpacity: elegida ? 0.95 : 0.7,
        strokeColor: elegida ? '#212837' : '#FFFFFF',
        strokeWeight: elegida ? 3 : 2,
      },
      label: {
        text: String(f.getProperty('orden')),
        color: '#FFFFFF',
        fontSize: '11px',
        fontWeight: 'bold',
      },
      title: `Parada ${f.getProperty('orden')} de ${minutos} min`,
      zIndex: elegida ? 40 : 20,
    };
  }

  /** Dibuja el recorrido entero: trazo, inicio, fin y paradas. */
  private pintar(): void {
    if (!this.mapa || !this.gm) { return; }
    this.limpiarDibujo();

    const puntos = this.recorrido?.puntos ?? [];
    if (puntos.length === 0) { return; }

    const camino = puntos.map(p => ({ lat: Number(p.lat), lng: Number(p.lng) }));

    this.trazo = new this.gm.Polyline({
      path: camino,
      map: this.mapa,
      strokeColor: '#348FE2',
      strokeOpacity: 0.85,
      strokeWeight: 4,
      // Las flechas ensenan hacia donde iba. Sin ellas, un recorrido de ida y
      // vuelta por la misma calle es una raya que no dice nada.
      icons: [{
        icon: { path: this.gm.SymbolPath.FORWARD_CLOSED_ARROW, scale: 2.5, fillOpacity: 1, strokeWeight: 1 },
        offset: '0',
        repeat: '120px',
      }],
    });

    this.capa.add({
      geometry: new this.gm.Data.Point(camino[0]),
      properties: { tipo: 'inicio', hora: puntos[0].hora },
    });
    this.capa.add({
      geometry: new this.gm.Data.Point(camino[camino.length - 1]),
      properties: { tipo: 'fin', hora: puntos[puntos.length - 1].hora },
    });

    for (const p of this.recorrido?.paradas ?? []) {
      this.capa.add({
        geometry: new this.gm.Data.Point({ lat: Number(p.lat), lng: Number(p.lng) }),
        properties: {
          tipo: 'parada',
          orden: p.orden,
          minutos: p.minutos,
          tiene_cliente: !!p.cliente,
        },
      });
    }

    this.encuadrar();
  }

  /** Encaja el mapa sobre todo el recorrido. */
  encuadrar(): void {
    const puntos = this.recorrido?.puntos ?? [];
    if (!this.mapa || puntos.length === 0) { return; }

    const caja = new this.gm.LatLngBounds();
    for (const p of puntos) { caja.extend({ lat: Number(p.lat), lng: Number(p.lng) }); }
    this.mapa.fitBounds(caja, 40);
  }

  /** Centra el mapa en una parada y la resalta. La llaman el mapa y la tabla. */
  enfocarParada(p: ParadaRecorrido): void {
    this.paradaElegida = this.paradaElegida === p.orden ? null : p.orden;

    // setStyle otra vez es lo que vuelve a pintar la capa con el resaltado
    this.capa?.setStyle((f: any) => this.estiloHito(f));

    if (this.paradaElegida === null) { this.globo?.close(); return; }
    if (!this.mapa) { return; }

    const centro = { lat: Number(p.lat), lng: Number(p.lng) };
    this.mapa.panTo(centro);
    if (this.mapa.getZoom() < 16) { this.mapa.setZoom(17); }

    this.globo.setContent(this.globoDeParada(p));
    this.globo.setPosition(centro);
    this.globo.open(this.mapa);
  }

  /** Lo que se lee al pulsar un hito del mapa. */
  private alPulsarHito(ev: any): void {
    const tipo = ev.feature.getProperty('tipo');

    if (tipo === 'inicio' || tipo === 'fin') {
      this.globo.setContent(
        `<div style="font-size:12px"><b>${tipo === 'inicio' ? 'Inicio' : 'Fin'} de la jornada</b>`
        + `<br><span style="color:#6c757d">${ev.feature.getProperty('hora')}</span></div>`);
      this.globo.setPosition(ev.latLng);
      this.globo.open(this.mapa);
      return;
    }

    const parada = this.recorrido?.paradas.find(p => p.orden === ev.feature.getProperty('orden'));
    if (parada) { this.enfocarParada(parada); }
  }

  /**
   * El contenido del globo de una parada.
   *
   * El texto se escapa: el nombre y la direccion del cliente los escribio
   * alguien en una ficha y aqui se meten crudos en el HTML del globo.
   */
  private globoDeParada(p: ParadaRecorrido): string {
    const mapa: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
    const esc = (s: string | null | undefined) => String(s ?? '').replace(/[&<>"]/g, c => mapa[c]);

    const cliente = p.cliente
      ? `<br><b>${esc(p.cliente.nombre_completo)}</b>`
        + `<br><span style="color:#6c757d">a ${p.cliente.metros} m`
        + `${p.cliente.direccion ? ' · ' + esc(p.cliente.direccion) : ''}</span>`
      : `<br><span style="color:#F59C1A">Ningún cliente a menos de ${this.radioCliente} m</span>`;

    return `<div style="font-size:12px;max-width:240px">`
      + `<b>Parada ${p.orden}</b> · ${p.minutos} min`
      + `<br><span style="color:#6c757d">${p.desde} a ${p.hasta}</span>`
      + cliente
      + `</div>`;
  }

  /** Quita el trazo y los hitos, pero deja el mapa vivo. */
  private limpiarDibujo(): void {
    this.trazo?.setMap(null);
    this.trazo = null;
    this.globo?.close();
    this.capa?.forEach((f: any) => this.capa.remove(f));
  }

  /** Al destruir el componente: tambien el mapa. */
  private limpiarMapa(): void {
    this.limpiarDibujo();
    this.capa?.setMap(null);
    this.capa = null;
    this.mapa = null;
  }
}
