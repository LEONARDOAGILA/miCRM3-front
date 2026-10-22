import { AfterViewInit, Component, ElementRef, EventEmitter, Input, NgZone, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../../../../environments/environment';

import { ModalHeaderComponent } from '../../../../../components/modal/modal-header/modal-header.component';
import { ModalFooterComponent } from '../../../../../components/modal/modal-footer/modal-footer.component';
import { PanelModule } from '../../../../../components/panel/panel.module';
import { CampoTextoComponent } from '../../../../../components/campos/campoTexto/campoTexto.component';
import { CampoTextoAreaComponent } from '../../../../../components/campos/campoTextoArea/campoTextoArea.component';
import { CampoEmailComponent } from '../../../../../components/campos/campoEmail/campoEmail.component';
import { CampoTelefonoComponent } from '../../../../../components/campos/campoTelefono/campoTelefono.component';
import { CampoNumeroEnteroComponent } from '../../../../../components/campos/campoNumeroEntero/campoNumeroEntero.component';
import { CheckboxComponent } from '../../../../../components/campos/checkbox/checkbox.component';
import { AvisoComponent } from '../../../../../components/campos/aviso/aviso.component';
import { ImagenVisor, VisorImagenesComponent } from '../../../../../components/visorImagenes/visorImagenes.component';
import { GoogleMapsLoaderService } from '../../../../../service/google-maps-loader.service';
import { LugaresGoogleService, SugerenciaLugar } from '../../../../../service/lugares-google.service';
import { LoadingService } from '../../../../../service/loading.service';
import { SucursalService, PuntoSucursal } from '../../../services/sucursal.service';

/**
 * ALTA / MODIFICACIÓN DE UNA SUCURSAL, CON SU PERÍMETRO.
 *
 * Los datos de la sucursal a la izquierda y el mapa a la derecha. El
 * perímetro se dibuja A MANO —pulsando esquina por esquina— y no con el
 * DrawingManager de Google, que está retirado desde la 3.65; es lo mismo que
 * hace la pantalla de Zonas.
 *
 * Dibujado el polígono se queda EDITABLE: los tiradores permiten corregirlo
 * antes de guardar. Lo que se manda al servidor son los vértices que tenga
 * la figura en ese momento, no los puntos con los que se empezó.
 *
 * El perímetro es lo que después deja o no marcar asistencia a la gente de
 * esta sucursal, así que el formulario avisa cuando se va a guardar sin él.
 *
 * EL CAMPO DIRECCIÓN BUSCA EN GOOGLE: se escribe la dirección, se elige de la
 * lista y el mapa se va allí con un alfiler, listo para dibujar el perímetro
 * alrededor. Es el mismo buscador de Places del selector de ubicación de los
 * clientes y del mapa de zonas (LugaresGoogleService), que además comparte el
 * token de sesión con el que Google factura el autocompletado.
 */
@Component({
  selector: 'app-save-sucursal',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule,
    ModalHeaderComponent, ModalFooterComponent, PanelModule,
    CampoTextoComponent, CampoTextoAreaComponent, CampoEmailComponent,
    CampoTelefonoComponent, CampoNumeroEnteroComponent, CheckboxComponent,
    AvisoComponent,
  ],
  templateUrl: './saveSucursal.component.html',
  styleUrls: ['./saveSucursal.component.css'],
})
export class SaveSucursalComponent implements OnInit, AfterViewInit, OnDestroy {

  /** La fila que se modifica o se clona; 0 al crear. */
  @Input() registro_selected: any = 0;
  /** 'add' | 'edit' | 'clon' | 'view' */
  @Input() accion: string = 'add';

  @Output() registrosE: EventEmitter<any> = new EventEmitter();

  @ViewChild('mapa', { static: false }) mapaDiv!: ElementRef<HTMLDivElement>;

  public form!: FormGroup;
  public titulo = 'Nueva Sucursal';
  public guardando = false;

  public isLoading$ = this._loadingService.isLoading$;

  // ---------- El mapa ----------
  public estadoApi: 'cargando' | 'listo' | 'sin-clave' | 'error' = 'cargando';
  public errorApi = '';
  private gm: any = null;
  private mapa: any = null;

  /** La figura que se está dibujando o la guardada, puesta editable. */
  private figura: any = null;
  /** Mientras se pulsan esquinas: la línea y los puntitos. */
  private trazo: any = null;
  private marcasTrazo: any[] = [];
  private puntos: PuntoSucursal[] = [];
  private oyenteMapa: any = null;

  /** 'POLIGONO' mientras se pulsan esquinas; null cuando no se dibuja. */
  public dibujando: 'POLIGONO' | null = null;
  /** Qué hay guardado en el formulario: POLIGONO o CIRCULO. */
  public tipo: 'POLIGONO' | 'CIRCULO' = 'POLIGONO';
  public radioCirculo = 150;

  /** Cuántas esquinas lleva el perímetro que se va a guardar. */
  public numVertices = 0;

  /** El resultado de «¿estoy dentro?», para enseñarlo bajo el mapa. */
  public prueba: { dentro: boolean; distancia: number | null; texto: string } | null = null;
  public probando = false;

  // ---------- El punto de la sucursal (la puerta) ----------
  /**
   * Lo que se guarda en latitud/longitud.
   *
   * Sale de la dirección buscada, de «usar mi ubicación» o de arrastrar el
   * alfiler. Si se deja vacío, el servidor lo deduce del perímetro: el centro
   * del círculo o el promedio de las esquinas del área.
   */
  public punto: { lat: number; lng: number } | null = null;

  // ---------- Las imágenes ----------
  /** Lo que se enseña: la guardada o la recién elegida. */
  public fotoVista: string | null = null;
  public mapaVista: string | null = null;
  /** Lo elegido, esperando a que haya id para subirse. */
  private fotoFile: File | null = null;
  private mapaFile: File | null = null;
  /** Imágenes ya guardadas que hay que quitar al guardar. */
  private quitarGuardada = { foto: false, mapa: false };
  public capturandoMapa = false;
  /** Las urls de objeto creadas, para soltarlas al cerrar. */
  private urlsTemporales: string[] = [];

  // ---------- Buscar la dirección en Google ----------
  /** Lo que ofrece Google para lo escrito en DIRECCIÓN. */
  public sugerencias: SugerenciaLugar[] = [];
  public sugerenciaActiva = -1;
  public buscandoLugar = false;
  /** Para no preguntar en cada tecla: cada consulta se paga. */
  private timerBusqueda: any = null;
  /** Descarta las respuestas que llegan tarde, después de otra más nueva. */
  private ultimaBusqueda = 0;
  private geocoder: any = null;
  /** La librería de Places, para resolver el negocio que se pulse en el mapa. */
  private places: any = null;
  /** El oyente del clic en el mapa que coloca la puerta. */
  private oyenteClicPunto: any = null;
  /** true mientras se le pregunta a Google qué hay en el punto pulsado. */
  public resolviendoPunto = false;
  /** El alfiler de la dirección encontrada. No es el perímetro. */
  private marcaDireccion: any = null;

  public readonly colores = ['#348FE2', '#00acac', '#f59c1a', '#dc3545', '#8f6ed5', '#6c757d'];

  constructor(
    public modal: NgbActiveModal,
    /** Para abrir el visor ENCIMA de este modal, sin cerrarlo. */
    private modalService: NgbModal,
    private fb: FormBuilder,
    private zone: NgZone,
    private _toastr: ToastrService,
    private _loadingService: LoadingService,
    private _loader: GoogleMapsLoaderService,
    private _lugares: LugaresGoogleService,
    private _sucursalService: SucursalService,
  ) {}

  get esNuevo(): boolean { return this.accion === 'add' || this.accion === 'clon'; }
  get esView(): boolean { return this.accion === 'view'; }
  get ctrlActivo(): FormControl { return this.form.controls['activo'] as FormControl; }
  get ctrlColor(): FormControl { return this.form.controls['color'] as FormControl; }

  get hayPerimetro(): boolean {
    return (this.tipo === 'POLIGONO' && this.numVertices >= 3)
        || (this.tipo === 'CIRCULO' && !!this.figura);
  }

  /** El formulario, ANTES de pintar: la plantilla lee form.controls. */
  ngOnInit(): void {
    this.initializeForm();

    switch (this.accion) {
      case 'add':  this.titulo = 'Nueva Sucursal'; break;
      case 'edit': this.titulo = 'Modificar Sucursal'; break;
      case 'clon': this.titulo = 'Clonar Sucursal'; break;
      case 'view': this.titulo = 'Ver Sucursal'; break;
    }
  }

  /** El mapa necesita el div ya en el DOM, así que va aquí. */
  async ngAfterViewInit(): Promise<void> {
    if (this.registro_selected) { await this.cargar(this.registro_selected.id); }

    // El mapa, después de los datos: así el perímetro guardado se pinta de una
    if (!this._loader.hayClave) { this.estadoApi = 'sin-clave'; return; }
    try {
      this.gm = await this._loader.cargar();
      await this.gm.importLibrary('maps');
      await this.gm.importLibrary('marker');

      // Para buscar por dirección. `places` da el autocompletado y
      // `geocoding` resuelve lo que se escribe entero sin elegir sugerencia.
      // No se pide `drawing`: su DrawingManager está retirado desde la 3.65 y
      // aquí se dibuja a mano.
      this.places = await this.gm.importLibrary('places');
      this._lugares.usar(this.places);
      await this.gm.importLibrary('geocoding');

      this.zone.run(() => {
        this.geocoder = new this.gm.Geocoder();
        this.inicializarMapa();
      });
    } catch (e: any) {
      this.zone.run(() => {
        this.estadoApi = e?.message === 'SIN_CLAVE' ? 'sin-clave' : 'error';
        this.errorApi = e?.message ?? 'No se pudo cargar Google Maps';
      });
    }
  }

  ngOnDestroy(): void {
    clearTimeout(this.timerBusqueda);
    this.oyenteClicPunto?.remove?.();
    this.oyenteClicPunto = null;
    this.soltarOyente();
    this.limpiarTrazo();
    this.figura?.setMap(null);
    this.marcaDireccion?.setMap(null);
    this.mapa = null;
    // Las imágenes elegidas viven en memoria hasta aquí
    this.urlsTemporales.forEach(u => URL.revokeObjectURL(u));
    this.urlsTemporales = [];
  }

  // ================================================================
  // EL FORMULARIO
  // ================================================================

  initializeForm(): void {
    const bloqueado = this.esView;

    this.form = this.fb.group({
      codigo:            [{ value: '', disabled: bloqueado }, [Validators.required, Validators.minLength(2), Validators.maxLength(20)]],
      nombre:            [{ value: '', disabled: bloqueado }, [Validators.required, Validators.minLength(3), Validators.maxLength(150)]],
      direccion:         [{ value: '', disabled: bloqueado }, [Validators.maxLength(250)]],
      // La de las referencias, escrita a mano: el buscador de Google NUNCA la
      // pisa, sólo escribe en `direccion`.
      direccion_completa: [{ value: '', disabled: bloqueado }, [Validators.maxLength(500)]],
      telefono:          [{ value: '', disabled: bloqueado }, [Validators.maxLength(50)]],
      email:             [{ value: '', disabled: bloqueado }, [Validators.email, Validators.maxLength(150)]],
      color:             [{ value: this.colores[0], disabled: bloqueado }],
      // El margen para el error del GPS; 50 m es lo razonable en la calle
      tolerancia_metros: [{ value: 50, disabled: bloqueado }, [Validators.min(0), Validators.max(5000)]],
      activo:            [{ value: true, disabled: bloqueado }],
    });
  }

  private async cargar(id: number): Promise<void> {
    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._sucursalService.findByIdSucursal(id));
      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo obtener la sucursal', 'Error');
        return;
      }

      const s = res.data;
      this.registro_selected = s;
      this.tipo = s.tipo === 'CIRCULO' ? 'CIRCULO' : 'POLIGONO';
      this.radioCirculo = Number(s.radio_metros ?? 150);
      this.numVertices = Number(s.num_vertices ?? 0);

      this.form.patchValue({
        // Al clonar, el código no se puede repetir: se marca para que lo cambien
        codigo:            (s.codigo ?? '') + (this.accion === 'clon' ? '-2' : ''),
        nombre:            (s.nombre ?? '') + (this.accion === 'clon' ? ' (copia)' : ''),
        direccion:         s.direccion ?? '',
        direccion_completa: s.direccion_completa ?? '',
        telefono:          s.telefono ?? '',
        email:             s.email ?? '',
        color:             s.color ?? this.colores[0],
        tolerancia_metros: Number(s.tolerancia_metros ?? 50),
        activo:            s.activo !== false,
      });

      // El punto guardado, para que se pueda mover sin volver a buscar
      if (s.latitud != null && s.longitud != null) {
        this.punto = { lat: Number(s.latitud), lng: Number(s.longitud) };
      }

      // LAS IMÁGENES DE LA FICHA NO SE CLONAN: viven bajo el id de la otra
      // sucursal, así que enseñarlas aquí sería prometer lo que no se va a
      // guardar. Al clonar se empieza sin imágenes.
      if (this.accion !== 'clon') {
        if (s.tiene_foto) { this.fotoVista = this._sucursalService.urlFoto(s.id, 'foto', true); }
        if (s.tiene_mapa) { this.mapaVista = this._sucursalService.urlFoto(s.id, 'mapa', true); }
      }
    } catch (error) {
      console.error('Error al cargar la sucursal:', error);
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  // ================================================================
  // EL MAPA
  // ================================================================

  private inicializarMapa(): void {
    const s = this.registro_selected;
    const centro = s?.centro_lat
      ? { lat: Number(s.centro_lat), lng: Number(s.centro_lng) }
      : (s?.vertices?.length
          ? { lat: Number(s.vertices[0].lat), lng: Number(s.vertices[0].lng) }
          : { lat: -2.9001285, lng: -79.0058965 });   // Cuenca, por empezar en algún sitio

    this.mapa = new this.gm.Map(this.mapaDiv.nativeElement, {
      center: centro,
      zoom: s?.vertices?.length || s?.centro_lat ? 16 : 13,
      mapTypeControl: true,
      streetViewControl: false,
      fullscreenControl: true,
      mapTypeId: 'roadmap',
    });

    this.estadoApi = 'listo';

    // PULSAR EL MAPA PONE LA PUERTA. Este oyente vive mientras el modal esté
    // abierto; cuando se está dibujando, el del dibujo manda y éste se aparta
    // (ver alPulsarElMapa). Va antes que los de dibujo a propósito: Google
    // llama a los oyentes en el orden en que se registraron, así que éste
    // puede decidir primero si le toca o no.
    if (!this.esView) {
      this.oyenteClicPunto = this.mapa.addListener('click',
        (e: any) => this.zone.run(() => this.alPulsarElMapa(e)));
    }

    // El perímetro guardado se pinta ya editable: entrar a modificar y poder
    // arrastrar una esquina es lo que se espera de esta pantalla.
    if (s?.vertices?.length >= 3) {
      this.figura = new this.gm.Polygon({
        ...this.estilo(true),
        paths: s.vertices.map((v: any) => ({ lat: Number(v.lat), lng: Number(v.lng) })),
        map: this.mapa,
      });
      this.escucharCambios();
      this.encuadrar();
    } else if (s?.centro_lat && s?.radio_metros) {
      this.figura = new this.gm.Circle({
        ...this.estilo(true),
        center: { lat: Number(s.centro_lat), lng: Number(s.centro_lng) },
        radius: Number(s.radio_metros),
        map: this.mapa,
      });
      this.escucharCambios();
      this.encuadrar();
    }

    // El punto guardado, con su alfiler: el mapa ya está encuadrado en el
    // perímetro, así que aquí sólo se pincha.
    if (this.punto) { this.ponerPunto(this.punto.lat, this.punto.lng, 'La puerta de la sucursal'); }
  }

  /** Cómo se pinta el perímetro. Editable salvo cuando sólo se mira. */
  private estilo(editable: boolean): any {
    const color = this.ctrlColor?.value || this.colores[0];
    return {
      strokeColor: color,
      strokeOpacity: 0.9,
      strokeWeight: 2,
      fillColor: color,
      fillOpacity: 0.18,
      editable: editable && !this.esView,
      draggable: false,
      clickable: false,
    };
  }

  /** Cada vez que se mueve una esquina hay que volver a contar. */
  private escucharCambios(): void {
    if (!this.figura || this.esView) { return; }

    if (this.tipo === 'POLIGONO') {
      const camino = this.figura.getPath();
      ['set_at', 'insert_at', 'remove_at'].forEach(evento =>
        camino.addListener(evento, () => this.zone.run(() => this.contarVertices())));
      this.contarVertices();
    } else {
      // El radio se refleja en el formulario para poder afinarlo escribiéndolo
      this.figura.addListener('radius_changed',
        () => this.zone.run(() => this.radioCirculo = Math.round(this.figura.getRadius())));
    }
  }

  private contarVertices(): void {
    this.numVertices = this.figura?.getPath ? this.figura.getPath().getLength() : 0;
    this.prueba = null;      // el perímetro cambió: lo probado ya no vale
  }

  private encuadrar(): void {
    if (!this.figura || !this.mapa) { return; }

    if (this.tipo === 'CIRCULO') {
      this.mapa.fitBounds(this.figura.getBounds());
      return;
    }
    const caja = new this.gm.LatLngBounds();
    this.figura.getPath().forEach((p: any) => caja.extend(p));
    this.mapa.fitBounds(caja, 40);
  }

  // ================================================================
  // BUSCAR LA DIRECCIÓN EN GOOGLE
  // ================================================================
  //
  // Se escribe en DIRECCIÓN, Google ofrece direcciones de verdad y, al elegir
  // una, el mapa se va allí y queda un alfiler. El alfiler NO es el perímetro:
  // sólo dice dónde está la puerta, para dibujar la figura alrededor.
  //
  // El campo se queda con la dirección tal como la escribe Google. Eso no es
  // cosmética: es la dirección que después sale en el listado y en los
  // reportes, y escrita así se puede volver a buscar.

  get ctrlDireccion(): FormControl { return this.form.controls['direccion'] as FormControl; }

  /** Cada tecla en DIRECCIÓN. Pregunta a Google cuando deja de escribir. */
  onDireccionCambia(texto: string): void {
    clearTimeout(this.timerBusqueda);
    const q = (texto ?? '').trim();

    if (this.esView || q.length < 3 || !this._lugares.listo) {
      this.sugerencias = [];
      this.sugerenciaActiva = -1;
      return;
    }
    // Se espera a que deje de teclear: Google cobra el autocompletado
    this.timerBusqueda = setTimeout(() => this.buscarLugar(q), 350);
  }

  private async buscarLugar(q: string): Promise<void> {
    if (!this._lugares.listo) { return; }
    const marca = ++this.ultimaBusqueda;
    this.buscandoLugar = true;
    try {
      // SIN filtro de tipos, al revés que el mapa de zonas: allí se ubican
      // ciudades y aquí se busca el portal de un local.
      const lista = await this._lugares.sugerencias(q, this.mapa);
      if (marca !== this.ultimaBusqueda) { return; }   // llegó una más nueva
      this.zone.run(() => {
        this.sugerencias = lista;
        this.sugerenciaActiva = lista.length ? 0 : -1;
      });
    } catch (e) {
      console.error('Error al buscar la dirección:', e);
      this.zone.run(() => {
        this.sugerencias = [];
        this._toastr.error('No se pudo buscar. ¿Está habilitada la Places API (New) para la clave?', 'Google Maps');
      });
    } finally {
      if (marca === this.ultimaBusqueda) { this.zone.run(() => this.buscandoLugar = false); }
    }
  }

  /** Flechas, Enter y Escape sobre el campo de la dirección. */
  onDireccionTecla(ev: KeyboardEvent): void {
    if (!this.sugerencias.length) {
      // Sin lista desplegada, Enter busca lo escrito tal cual
      if (ev.key === 'Enter') { ev.preventDefault(); this.buscarDireccionEnElMapa(); }
      return;
    }

    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      this.sugerenciaActiva = (this.sugerenciaActiva + 1) % this.sugerencias.length;
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      this.sugerenciaActiva = (this.sugerenciaActiva - 1 + this.sugerencias.length) % this.sugerencias.length;
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      if (this.sugerenciaActiva >= 0) { this.irALaDireccion(this.sugerencias[this.sugerenciaActiva]); }
    } else if (ev.key === 'Escape') {
      this.cerrarSugerencias();
    }
  }

  cerrarSugerencias(): void {
    clearTimeout(this.timerBusqueda);
    this.sugerencias = [];
    this.sugerenciaActiva = -1;
  }

  /** Dirección elegida de la lista: al mapa, y el campo con lo que dice Google. */
  async irALaDireccion(s: SugerenciaLugar): Promise<void> {
    this.cerrarSugerencias();
    try {
      this.buscandoLugar = true;
      await s.place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location', 'viewport'] });
      const p = s.place;
      this.zone.run(() => {
        const texto = this.limpiarDireccion(
          p.formattedAddress ?? `${s.principal}${s.secundario ? ', ' + s.secundario : ''}`);
        this.escribirDireccion(texto);
        if (p.location) { this.ponerAlfiler(p.location.lat(), p.location.lng(), texto, p.viewport); }
      });
    } catch (e) {
      console.error('Error al ir a la dirección:', e);
      this._toastr.error('No se pudo ubicar esa dirección', 'Google Maps');
    } finally {
      this.zone.run(() => this.buscandoLugar = false);
      // Pedir los campos CIERRA la sesión de autocompletado: la siguiente
      // búsqueda tiene que empezar una nueva o se factura mal.
      this._lugares.nuevaSesion();
    }
  }

  /** El botón de la lupa: lo marcado en la lista o, si no hay, lo escrito. */
  buscarDireccionEnElMapa(): void {
    if (this.esView) { return; }

    if (this.sugerenciaActiva >= 0 && this.sugerencias[this.sugerenciaActiva]) {
      this.irALaDireccion(this.sugerencias[this.sugerenciaActiva]);
      return;
    }
    this.geocodificarDireccion(String(this.ctrlDireccion.value ?? '').trim());
  }

  /**
   * Lo escrito, tal cual, sin pasar por la lista.
   *
   * Hace falta porque mucha dirección de aquí no está en Places («Panamericana
   * Norte km 7 1/2»), y el geocodificador sí la coloca aunque sea a media
   * cuadra. Acotado a Ecuador para que «Cuenca» no se vaya a España.
   */
  private geocodificarDireccion(texto: string): void {
    if (!texto) { this._toastr.info('Escriba la dirección para buscarla en el mapa', 'Sucursales'); return; }
    if (!this.geocoder) { this._toastr.warning('El mapa todavía no está listo', 'Sucursales'); return; }

    this.buscandoLugar = true;
    this.geocoder.geocode(
      { address: texto, region: 'ec', componentRestrictions: { country: 'EC' } },
      (res: any[], estado: string) => this.zone.run(() => {
        this.buscandoLugar = false;
        if (estado !== 'OK' || !res?.length) {
          this._toastr.info(`Sin resultados para «${texto}»`, 'Google Maps');
          return;
        }
        const r = res[0];
        const direccion = this.limpiarDireccion(r.formatted_address);
        this.escribirDireccion(direccion);
        this.ponerAlfiler(r.geometry.location.lat(), r.geometry.location.lng(),
                          direccion, r.geometry.viewport);
      }));
  }

  /** La dirección que da Google en el campo, respetando el límite de la columna. */
  private escribirDireccion(texto: string): void {
    if (!texto) { return; }

    // GOOGLE A VECES CONTESTA CON UN «PLUS CODE» («4X3W+26J, Mariscal Sucre,
    // Cuenca»): es una referencia de malla, no una dirección, y en el listado
    // no le dice nada a nadie. Pasa con parques y sitios sin portal. En ese
    // caso se respeta lo que escribió la persona y sólo se mueve el mapa.
    if (this.esPlusCode(texto)) { return; }

    this.ctrlDireccion.setValue(texto.slice(0, 250));
    this.ctrlDireccion.markAsDirty();
  }

  /** «Calles: X y , Quito, Ecuador» -> «X, Quito». */
  private limpiarDireccion(texto?: string): string {
    return (texto ?? '')
      .replace(/^\s*calles:\s*/i, '')
      .replace(/\s+(?:y|&)\s*(?=,|$)/gi, '')
      .replace(/^\s*(?:y|&)\s+/i, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/,\s*Ecuador\s*$/i, '')
      .trim();
  }

  /**
   * El alfiler: dónde está la puerta de la sucursal.
   *
   * Es lo que se guarda en latitud/longitud, y va ARRASTRABLE: la dirección
   * que da Google cae en el número de la calle, y la puerta del local puede
   * estar a media cuadra. Moverlo con el ratón es más rápido que escribir
   * coordenadas, y el enlace de Google sale de aquí.
   */
  private ponerPunto(lat: number, lng: number, titulo?: string): void {
    if (!this.mapa) { return; }

    this.punto = { lat, lng };
    this.prueba = null;             // el punto cambió: lo probado ya no vale

    if (this.marcaDireccion) {
      this.marcaDireccion.setPosition({ lat, lng });
      if (titulo) { this.marcaDireccion.setTitle(titulo); }
      return;
    }

    this.marcaDireccion = new this.gm.Marker({
      position: { lat, lng },
      map: this.mapa,
      title: titulo ?? 'La puerta de la sucursal',
      draggable: !this.esView,
      zIndex: 5,
    });

    if (!this.esView) {
      // Al soltarlo se vuelve a preguntar la dirección: mover la puerta media
      // cuadra puede cambiar la calle, y dejar la de antes sería mentir.
      this.marcaDireccion.addListener('dragend', (e: any) => this.zone.run(() => {
        this.punto = { lat: e.latLng.lat(), lng: e.latLng.lng() };
        this.prueba = null;
        this.resolverDireccion(this.punto.lat, this.punto.lng);
      }));
    }
  }

  /**
   * Pulsar el mapa pone la puerta ahí y trae su dirección.
   *
   * MIENTRAS SE DIBUJA, EL CLIC NO ES PARA ESTO: pone una esquina del área o
   * el centro del círculo, y de eso se encarga el oyente del dibujo. Se
   * reconoce por `oyenteMapa`, que sólo existe mientras se dibuja.
   */
  private alPulsarElMapa(e: any): void {
    // Sin esto, pulsar un negocio abre el globo de Google encima del mapa.
    // `stop` sólo viene cuando se pulsó un sitio con ficha (IconMouseEvent).
    e?.stop?.();

    if (this.esView || this.oyenteMapa) { return; }
    if (!e?.latLng) { return; }

    // Al pulsar un negocio, Google NO da el píxel sino las coordenadas de ese
    // sitio: pulsar la tienda deja la puerta en la tienda, que es lo que se
    // quiere.
    const lat = e.latLng.lat();
    const lng = e.latLng.lng();

    this.ponerPunto(lat, lng, 'La puerta de la sucursal');
    this.resolverDireccion(lat, lng, e.placeId);
  }

  /**
   * Qué hay en ese punto, para escribirlo en DIRECCIÓN.
   *
   * Si se pulsó un negocio con ficha, se le piden sus datos a Places —así sale
   * «Supermaxi Don Bosco» y no «Av. de las Américas 123»—. Si se pulsó un
   * punto cualquiera, se geocodifica al revés.
   */
  private async resolverDireccion(lat: number, lng: number, placeId?: string): Promise<void> {
    this.resolviendoPunto = true;
    try {
      let nombre = '';        // el negocio que se pulsó, si se pulsó uno
      let calle = '';         // la dirección de verdad

      if (placeId && this.places?.Place) {
        const p = new this.places.Place({ id: placeId });
        await p.fetchFields({ fields: ['displayName', 'formattedAddress'] });
        nombre = String(p.displayName ?? '').trim();

        // OJO: la dirección de un sitio sin portal —un parque, una cancha—
        // viene como «plus code» («32Q6+C63, Cuenca»). Eso no es una
        // dirección, así que se deja para que la rellene el geocodificador.
        const suya = this.limpiarDireccion(p.formattedAddress ?? '');
        if (suya && !this.esPlusCode(suya)) { calle = suya; }
      }

      // Sin calle todavía (no se pulsó un negocio, o el suyo era un plus
      // code): se pregunta al revés por las coordenadas.
      if (!calle && this.geocoder) {
        const { results } = await this.geocoder.geocode({ location: { lat, lng } });
        calle = this.primeraDireccionUtil(results ?? []);
      }

      const texto = this.componerDireccion(nombre, calle);
      this.zone.run(() => {
        if (texto) { this.escribirDireccion(texto); } else { this.avisarSinDireccion(); }
      });

    } catch (e) {
      // Que no se sepa la dirección no invalida el punto: las coordenadas y
      // el enlace ya están puestos, que es lo que se guarda. Pasa en descampado
      // y en vías sin nombre, donde Google sólo devuelve «plus codes».
      console.error('No se pudo resolver la dirección del punto:', e);
      this.zone.run(() => this.avisarSinDireccion());
    } finally {
      this.zone.run(() => this.resolviendoPunto = false);
    }
  }

  /**
   * La primera respuesta del geocodificador que sea una dirección de verdad.
   *
   * Vienen de la más concreta a la más general, y las primeras suelen ser
   * «plus codes» (4X3W+26J) cuando se pulsa en medio de una manzana. Se salta
   * esas y se coge la primera con nombre de calle; si no hay ninguna, se
   * devuelve vacío y el campo se queda como estaba.
   */
  private primeraDireccionUtil(resultados: any[]): string {
    for (const r of resultados) {
      const texto = this.limpiarDireccion(r?.formatted_address);
      if (texto.length > 3 && !this.esPlusCode(texto)) { return texto; }
    }
    return '';
  }

  /** «4X3W+26J, Cuenca»: una referencia de malla, no una dirección. */
  private esPlusCode(texto: string): boolean {
    return /^[A-Z0-9]{4,8}\+[A-Z0-9]{2,3}\b/i.test(texto);
  }

  /**
   * «Supermaxi Don Bosco, Av. de las Américas 12-34».
   *
   * El nombre del sitio delante de la calle: quien después lea la ficha
   * reconoce antes el local que el portal. Si la calle ya empieza por ese
   * nombre no se repite.
   */
  private componerDireccion(nombre: string, calle: string): string {
    const n = (nombre || '').trim();
    const c = (calle || '').trim();
    if (!n) { return c; }
    if (!c) { return n; }
    return c.toLowerCase().startsWith(n.toLowerCase()) ? c : `${n}, ${c}`;
  }

  /**
   * Google no supo decir qué hay en ese punto.
   *
   * SE AVISA en lugar de callar: el alfiler ya se movió y el campo se quedó
   * con la dirección del punto ANTERIOR, así que sin este aviso se guardaría
   * una dirección que no corresponde a las coordenadas.
   */
  private avisarSinDireccion(): void {
    this._toastr.info(
      this.ctrlDireccion.value
        ? 'No hay dirección para ese punto: la de arriba es la de antes, corríjala a mano'
        : 'No hay dirección para ese punto: escríbala a mano',
      'Sucursales', { timeOut: 6000 });
  }

  /** El alfiler de la dirección encontrada, y el mapa encuadrado en ella. */
  private ponerAlfiler(lat: number, lng: number, titulo: string, viewport?: any): void {
    if (!this.mapa) { return; }

    this.ponerPunto(lat, lng, titulo);

    if (viewport) {
      this.mapa.fitBounds(viewport, 32);
      // Un portal trae una caja de metros y el mapa se metería tanto que no se
      // vería la manzana donde hay que dibujar. El tope se pone cuando el mapa
      // ya se movió: `getZoom()` justo después de `fitBounds` aún no cambió.
      const quitar = this.mapa.addListener('idle', () => {
        quitar?.remove?.();
        if ((this.mapa?.getZoom() ?? 0) > 18) { this.mapa.setZoom(18); }
      });
    } else {
      this.mapa.setCenter({ lat, lng });
      this.mapa.setZoom(17);
    }
  }

  /**
   * Quita el alfiler y, con él, las coordenadas (el perímetro no se toca).
   *
   * Sin punto propio, el servidor guarda el del perímetro: el centro del
   * círculo o el promedio de las esquinas del área.
   */
  quitarAlfiler(): void {
    this.marcaDireccion?.setMap(null);
    this.marcaDireccion = null;
    this.punto = null;
    this.prueba = null;
  }

  get hayAlfiler(): boolean { return !!this.marcaDireccion; }

  /** Las coordenadas como se enseñan y como se guardan. */
  get textoCoordenadas(): string {
    if (!this.punto) { return ''; }
    return `${this.punto.lat.toFixed(6)}, ${this.punto.lng.toFixed(6)}`;
  }

  /** El enlace de Google al punto. El de la base es el mismo, armado allí. */
  get linkDelPunto(): string {
    if (!this.punto) { return ''; }
    return `https://www.google.com/maps/search/?api=1&query=${this.punto.lat.toFixed(6)},${this.punto.lng.toFixed(6)}`;
  }

  abrirEnGoogleMaps(): void {
    if (!this.punto) { return; }
    // `noopener` es obligatorio: sin él la página que se abre puede tocar
    // ésta a través de window.opener.
    window.open(this.linkDelPunto, '_blank', 'noopener');
  }

  copiarCoordenadas(): void {
    if (!this.punto) { return; }
    navigator.clipboard?.writeText(this.textoCoordenadas)
      .then(() => this._toastr.success('Coordenadas copiadas', 'Sucursales', { timeOut: 2000 }))
      .catch(() => this._toastr.warning('No se pudieron copiar', 'Sucursales'));
  }

  /** La puerta, donde esté ahora quien edita. */
  ponerPuntoEnMiUbicacion(): void {
    if (this.esView) { return; }
    if (!navigator.geolocation) { this._toastr.warning('Este navegador no da la ubicación', 'Sucursales'); return; }

    navigator.geolocation.getCurrentPosition(
      pos => this.zone.run(() => {
        this.ponerPunto(pos.coords.latitude, pos.coords.longitude, 'Mi ubicación');
        this.mapa?.setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        if ((this.mapa?.getZoom() ?? 0) < 16) { this.mapa?.setZoom(17); }
      }),
      () => this.zone.run(() => this._toastr.warning('No se pudo obtener su ubicación', 'Sucursales')),
      { enableHighAccuracy: true, timeout: 10000 });
  }

  // ---------- Dibujar ----------

  /** Empieza un polígono: a partir de aquí cada clic es una esquina. */
  dibujarArea(): void {
    if (this.esView) { return; }
    this.borrarPerimetro(false);
    this.tipo = 'POLIGONO';
    this.dibujando = 'POLIGONO';
    this.puntos = [];

    this.oyenteMapa = this.mapa.addListener('click', (e: any) =>
      this.zone.run(() => this.ponerEsquina(e.latLng.lat(), e.latLng.lng())));

    this._toastr.info('Pulse en el mapa las esquinas del perímetro y después «Cerrar área»', 'Sucursales', { timeOut: 5000 });
  }

  /** Empieza un círculo: el siguiente clic pone el centro. */
  dibujarCirculo(): void {
    if (this.esView) { return; }
    this.borrarPerimetro(false);
    this.tipo = 'CIRCULO';
    this.dibujando = null;

    this.oyenteMapa = this.mapa.addListener('click', (e: any) =>
      this.zone.run(() => this.ponerCirculo(e.latLng.lat(), e.latLng.lng())));

    this._toastr.info('Pulse en el mapa el centro de la sucursal', 'Sucursales', { timeOut: 4000 });
  }

  private ponerEsquina(lat: number, lng: number): void {
    this.puntos.push({ lat, lng });
    const color = this.ctrlColor.value || this.colores[0];
    const camino = this.puntos.map(p => ({ lat: p.lat, lng: p.lng }));

    if (!this.trazo) {
      this.trazo = new this.gm.Polyline({
        path: camino, map: this.mapa, strokeColor: color, strokeOpacity: 0.9, strokeWeight: 2,
      });
    } else {
      this.trazo.setPath(camino);
    }

    // Un puntito por esquina: sin esto no se ve dónde se ha pulsado
    this.marcasTrazo.push(new this.gm.Marker({
      position: { lat, lng }, map: this.mapa, clickable: false,
      icon: { path: this.gm.SymbolPath.CIRCLE, scale: 4, fillColor: color, fillOpacity: 1,
              strokeColor: '#fff', strokeWeight: 1.5 },
    }));
  }

  deshacerPunto(): void {
    if (!this.puntos.length) { return; }
    this.puntos.pop();
    this.marcasTrazo.pop()?.setMap(null);
    this.trazo?.setPath(this.puntos.map(p => ({ lat: p.lat, lng: p.lng })));
  }

  /** Cierra el área y la deja editable para corregirla antes de guardar. */
  cerrarArea(): void {
    if (this.puntos.length < 3) {
      this._toastr.warning('Un perímetro necesita al menos tres esquinas', 'Sucursales');
      return;
    }

    const camino = this.puntos.map(p => ({ lat: p.lat, lng: p.lng }));
    this.soltarOyente();
    this.limpiarTrazo();
    this.dibujando = null;

    this.figura = new this.gm.Polygon({ ...this.estilo(true), paths: camino, map: this.mapa });
    this.escucharCambios();
    this._toastr.success('Perímetro dibujado. Arrastre las esquinas para corregirlo.', 'Sucursales', { timeOut: 4000 });
  }

  private ponerCirculo(lat: number, lng: number): void {
    this.soltarOyente();
    this.figura?.setMap(null);

    this.figura = new this.gm.Circle({
      ...this.estilo(true),
      center: { lat, lng },
      radius: this.radioCirculo || 150,
      map: this.mapa,
    });
    this.escucharCambios();
    this.encuadrar();
  }

  /** Quita el perímetro. Con aviso, salvo cuando se va a dibujar otro. */
  borrarPerimetro(avisar = true): void {
    if (this.esView) { return; }
    this.soltarOyente();
    this.limpiarTrazo();
    this.figura?.setMap(null);
    this.figura = null;
    this.numVertices = 0;
    this.dibujando = null;
    this.prueba = null;
    if (avisar) { this._toastr.info('Sucursal sin perímetro: su gente podrá marcar desde cualquier sitio', 'Sucursales', { timeOut: 5000 }); }
  }

  cancelarDibujo(): void {
    this.soltarOyente();
    this.limpiarTrazo();
    this.dibujando = null;
  }

  private soltarOyente(): void {
    this.oyenteMapa?.remove?.();
    this.oyenteMapa = null;
  }

  private limpiarTrazo(): void {
    this.trazo?.setMap(null);
    this.trazo = null;
    this.marcasTrazo.forEach(m => m.setMap(null));
    this.marcasTrazo = [];
    this.puntos = [];
  }

  /** El color del perímetro se cambia en caliente. */
  cambiarColor(color: string): void {
    if (this.esView) { return; }
    this.ctrlColor.setValue(color);
    this.figura?.setOptions({ strokeColor: color, fillColor: color });
    this.trazo?.setOptions({ strokeColor: color });
  }

  /** El radio del círculo, desde el formulario. */
  cambiarRadio(): void {
    if (this.tipo !== 'CIRCULO' || !this.figura) { return; }
    this.figura.setRadius(Number(this.radioCirculo) || 150);
    this.prueba = null;
  }

  /** Centra el mapa donde esté quien está dibujando. */
  irAMiUbicacion(): void {
    if (!navigator.geolocation) { this._toastr.warning('Este navegador no da la ubicación', 'Sucursales'); return; }

    navigator.geolocation.getCurrentPosition(
      pos => this.zone.run(() => {
        this.mapa?.setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        this.mapa?.setZoom(17);
      }),
      () => this.zone.run(() => this._toastr.warning('No se pudo obtener su ubicación', 'Sucursales')),
      { enableHighAccuracy: true, timeout: 8000 });
  }

  /**
   * «¿Desde aquí se podría marcar?»: pregunta al SERVIDOR con la ubicación
   * del aparato. Es el mismo cálculo que atajará las marcaciones, así que
   * sirve para comprobar el dibujo sin ir hasta la puerta.
   *
   * Sólo tiene sentido con la sucursal ya guardada: lo que se prueba es lo
   * que hay en la base.
   */
  probarAqui(): void {
    const id = Number(this.registro_selected?.id ?? 0);
    if (!id) { this._toastr.info('Guarde la sucursal y vuelva a abrirla para probar el perímetro', 'Sucursales'); return; }
    if (!navigator.geolocation) { this._toastr.warning('Este navegador no da la ubicación', 'Sucursales'); return; }

    this.probando = true;
    navigator.geolocation.getCurrentPosition(
      async pos => {
        try {
          const res: any = await firstValueFrom(
            this._sucursalService.probarPunto(id, pos.coords.latitude, pos.coords.longitude));
          const d = res?.data ?? {};
          this.zone.run(() => {
            this.prueba = {
              dentro: !!d.dentro,
              distancia: d.distancia_m != null ? Number(d.distancia_m) : null,
              texto: d.exige === false
                ? 'Esta sucursal no tiene perímetro: su gente puede marcar desde cualquier sitio'
                : (d.dentro ? 'Desde aquí SÍ se puede marcar'
                            : `Desde aquí NO se puede marcar: está a ${Math.round(Number(d.distancia_m ?? 0))} m del perímetro`),
            };
          });
        } finally {
          this.zone.run(() => this.probando = false);
        }
      },
      () => this.zone.run(() => {
        this.probando = false;
        this._toastr.warning('No se pudo obtener su ubicación', 'Sucursales');
      }),
      { enableHighAccuracy: true, timeout: 10000 });
  }

  // ================================================================
  // LAS IMÁGENES
  // ================================================================
  //
  // Dos: la CAPTURA DEL MAPA con el perímetro y una FOTO DEL LOCAL de la
  // galería. Las dos se suben DESPUÉS de guardar, porque el fichero necesita
  // el id de la sucursal y al crear todavía no existe; es lo mismo que hace
  // el logo en saveMarca.

  /** El tamaño máximo que acepta el servidor. */
  private readonly MAX_IMAGEN = 10 * 1024 * 1024;

  /**
   * Foto de lo que se ve, con el perímetro dibujado.
   *
   * NO se vuelca el mapa a un canvas: Google lo pinta con imágenes de otro
   * dominio y el navegador no deja leerlas. La imagen la da la Maps Static
   * API con el mismo perímetro y el mismo alfiler, igual que en el selector
   * de ubicación de los clientes. Hay que tener habilitada la «Maps Static
   * API» para la clave.
   */
  async capturarMapa(): Promise<void> {
    if (this.esView || this.capturandoMapa) { return; }

    const url = this.urlMapaEstatico();
    if (!url) {
      this._toastr.warning('El mapa todavía no está listo', 'Sucursales');
      return;
    }

    this.capturandoMapa = true;
    try {
      const r = await fetch(url);
      if (!r.ok) { throw new Error('HTTP ' + r.status); }
      const blob = await r.blob();
      if (!blob.type.startsWith('image/')) { throw new Error('la respuesta no es una imagen'); }

      this.ponerVista('mapa', new File([blob], 'mapa.png', { type: blob.type || 'image/png' }));
      this._toastr.success('Captura lista: se guarda con la sucursal', 'Mapa', { timeOut: 3000 });

    } catch (e) {
      console.error('No se pudo capturar el mapa:', e);
      this._toastr.warning(
        'Habilite la «Maps Static API» para la clave en Google Cloud y vuelva a intentarlo.',
        'No se pudo capturar el mapa', { timeOut: 9000, closeButton: true });
    } finally {
      this.capturandoMapa = false;
    }
  }

  /** La url de la Maps Static API con el perímetro y el alfiler. */
  private urlMapaEstatico(): string | null {
    const clave = (environment as any).GOOGLE_MAPS_API_KEY;
    if (!clave || !this.mapa) { return null; }

    const p = new URLSearchParams();
    p.set('size', '640x400');
    p.set('scale', '2');                       // el doble de píxeles: se ve bien al imprimir
    p.set('maptype', 'roadmap');
    p.set('language', 'es');
    p.set('region', 'ec');

    // 0x…: la Static API quiere los colores en hexadecimal con 0x, no con #
    const color = String(this.ctrlColor.value || this.colores[0]).replace('#', '0x');
    const borde = this.puntosDelPerimetro();
    if (borde.length >= 3) {
      p.set('path', `color:${color}|weight:2|fillcolor:${color}40|`
        + borde.map(v => `${v.lat.toFixed(6)},${v.lng.toFixed(6)}`).join('|'));
    }
    if (this.punto) {
      p.set('markers', `color:red|${this.punto.lat.toFixed(6)},${this.punto.lng.toFixed(6)}`);
    }

    // Sin perímetro ni alfiler no hay nada que encuadrar: se retrata lo que se
    // está viendo. Con cualquiera de los dos, la Static API encuadra sola.
    if (borde.length < 3 && !this.punto) {
      const c = this.mapa.getCenter?.();
      if (!c) { return null; }
      p.set('center', `${c.lat().toFixed(6)},${c.lng().toFixed(6)}`);
      p.set('zoom', String(this.mapa.getZoom() ?? 16));
    }

    p.set('key', clave);
    return 'https://maps.googleapis.com/maps/api/staticmap?' + p.toString();
  }

  /**
   * El borde del perímetro como lista de puntos.
   *
   * El círculo se convierte en un polígono de 36 lados: la Static API no sabe
   * dibujar círculos, y con 36 puntos el borde ya no se ve como un polígono.
   */
  private puntosDelPerimetro(): PuntoSucursal[] {
    if (this.tipo === 'POLIGONO') {
      return this.verticesDeLaFigura() ?? [];
    }
    if (!this.figura?.getCenter) { return []; }

    const c = this.figura.getCenter();
    const radio = Number(this.figura.getRadius?.() ?? this.radioCirculo);
    const lat = c.lat();
    const lng = c.lng();
    const dLat = radio / 111320;
    const dLng = radio / (111320 * Math.max(Math.cos(lat * Math.PI / 180), 0.000001));

    const puntos: PuntoSucursal[] = [];
    for (let i = 0; i <= 36; i++) {
      const a = (i / 36) * 2 * Math.PI;
      puntos.push({ lat: lat + dLat * Math.sin(a), lng: lng + dLng * Math.cos(a) });
    }
    return puntos;
  }

  /** La foto del local, elegida de la galería o hecha con la cámara. */
  onFotoElegida(evento: Event): void {
    const input = evento.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    // El input se vacía SIEMPRE: si no, elegir el mismo fichero dos veces
    // seguidas no dispara el evento y parece que no pasó nada.
    input.value = '';
    if (!file) { return; }

    if (!file.type.startsWith('image/')) {
      this._toastr.error('El archivo debe ser una imagen', 'Foto de la sucursal');
      return;
    }
    if (file.size > this.MAX_IMAGEN) {
      this._toastr.error('La imagen no puede superar los 10 MB', 'Foto de la sucursal');
      return;
    }

    this.ponerVista('foto', file);
  }

  /** Deja la imagen a la vista y apunta el fichero para subirlo al guardar. */
  private ponerVista(campo: 'foto' | 'mapa', file: File): void {
    const url = URL.createObjectURL(file);
    this.urlsTemporales.push(url);

    if (campo === 'foto') {
      this.fotoFile = file;
      this.fotoVista = url;
      this.quitarGuardada.foto = false;
    } else {
      this.mapaFile = file;
      this.mapaVista = url;
      this.quitarGuardada.mapa = false;
    }
  }

  /**
   * Quita la imagen.
   *
   * Si estaba guardada, se marca para borrarla EN EL SERVIDOR al guardar: no
   * se borra en el momento porque quien cierra el modal con «Salir» espera no
   * haber cambiado nada.
   */
  quitarImagen(campo: 'foto' | 'mapa'): void {
    if (this.esView) { return; }

    const estabaGuardada = campo === 'foto'
      ? (!this.fotoFile && !!this.fotoVista)
      : (!this.mapaFile && !!this.mapaVista);

    if (campo === 'foto') {
      this.fotoFile = null;
      this.fotoVista = null;
    } else {
      this.mapaFile = null;
      this.mapaVista = null;
    }
    if (estabaGuardada) { this.quitarGuardada[campo] = true; }
  }

  get hayImagenes(): boolean { return !!this.fotoVista || !!this.mapaVista; }

  /**
   * Ver las imágenes en grande: ampliar, girar y arrastrar.
   *
   * El mismo visor de saveCliente (components/visorImagenes), y no una
   * pestaña nueva: una captura del mapa a tamaño de sello no sirve para
   * comprobar si el perímetro cubre el local.
   *
   * Se le pasan LAS DOS, así que desde una se llega a la otra con las flechas.
   */
  verImagen(cual: 'foto' | 'mapa'): void {
    const imagenes: ImagenVisor[] = [];
    if (this.fotoVista) {
      imagenes.push({ url: this.fotoVista, titulo: 'Foto del local', nombre: 'sucursal-local.jpg' });
    }
    if (this.mapaVista) {
      imagenes.push({ url: this.mapaVista, titulo: 'Mapa con el perímetro', nombre: 'sucursal-mapa.png' });
    }
    if (!imagenes.length) { return; }

    const ref = this.modalService.open(VisorImagenesComponent, {
      size: 'xl', centered: true, backdrop: true, keyboard: true, windowClass: 'visor-modal',
    });
    ref.componentInstance.imagenes = imagenes;
    // Si sólo hay una, la que toca es la 0
    ref.componentInstance.indice = cual === 'mapa' && imagenes.length > 1 ? 1 : 0;
  }

  /**
   * Sube lo que esté esperando y quita lo que se haya marcado.
   *
   * Devuelve la ficha como quede, para que la rejilla pinte la fila con sus
   * imágenes sin volver a preguntar.
   */
  private async guardarImagenes(id: number, ficha: any): Promise<any> {
    let ultima = ficha;

    const pendientes: Array<{ campo: 'foto' | 'mapa'; file: File | null }> = [
      { campo: 'foto', file: this.fotoFile },
      { campo: 'mapa', file: this.mapaFile },
    ];

    for (const { campo, file } of pendientes) {
      try {
        if (file) {
          const datos = new FormData();
          datos.append('SucursalId', String(id));
          datos.append('campo', campo);
          datos.append('imagen_file', file, file.name);
          const res: any = await firstValueFrom(this._sucursalService.addFoto(datos));
          if (res?.status === 'success' && res.data?.sucursal) { ultima = res.data.sucursal; }

        } else if (this.quitarGuardada[campo]) {
          const res: any = await firstValueFrom(this._sucursalService.quitarFoto(id, campo));
          if (res?.status === 'success' && res.data) { ultima = res.data; }
        }
      } catch (e) {
        // La sucursal YA está guardada: que falle una imagen no puede tirar
        // abajo lo demás, así que se avisa y se sigue.
        console.error(`Error al guardar la imagen «${campo}»:`, e);
        this._toastr.warning(
          campo === 'foto' ? 'La sucursal se guardó, pero la foto no se pudo subir'
                           : 'La sucursal se guardó, pero la captura del mapa no se pudo subir',
          'Imágenes', { timeOut: 7000 });
      }
    }

    return ultima;
  }

  // ================================================================
  // GUARDAR
  // ================================================================

  /** Los vértices tal como estén AHORA en la figura (se pudieron arrastrar). */
  private verticesDeLaFigura(): PuntoSucursal[] | null {
    if (this.tipo !== 'POLIGONO' || !this.figura?.getPath) { return null; }

    const puntos: PuntoSucursal[] = [];
    this.figura.getPath().forEach((p: any) => puntos.push({ lat: p.lat(), lng: p.lng() }));
    return puntos.length >= 3 ? puntos : null;
  }

  async onSubmitForm(): Promise<void> {
    if (this.esView) { this.modal.dismiss(); return; }
    if (this.guardando) { return; }

    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this._toastr.error('Revise los campos del formulario.', 'No se puede Guardar',
                         { timeOut: 8000, closeButton: true });
      return;
    }

    const payload: any = this.form.getRawValue();
    payload.tipo = this.tipo;

    // El punto de la sucursal. Si no hay alfiler se manda vacío y el servidor
    // lo deduce del perímetro; el enlace de Google lo arma él, no la pantalla.
    payload.latitud  = this.punto ? this.punto.lat : null;
    payload.longitud = this.punto ? this.punto.lng : null;

    if (this.tipo === 'POLIGONO') {
      payload.vertices = this.verticesDeLaFigura();
      payload.centro_lat = null; payload.centro_lng = null; payload.radio_metros = null;
    } else if (this.figura) {
      const c = this.figura.getCenter();
      payload.vertices = null;
      payload.centro_lat = c.lat();
      payload.centro_lng = c.lng();
      payload.radio_metros = Math.round(this.figura.getRadius());
    }

    // Sin perímetro se guarda igual, pero diciéndolo: es lo que decide si su
    // gente puede marcar desde cualquier sitio.
    if (!this.hayPerimetro && !confirm('Esta sucursal se va a guardar SIN perímetro.\n\n'
        + 'Su gente podrá marcar asistencia desde cualquier lugar. ¿Continuar?')) {
      return;
    }

    try {
      this._loadingService.setLoading(true);
      this.guardando = true;

      const res: any = this.accion === 'edit'
        ? await firstValueFrom(this._sucursalService.editSucursal(this.registro_selected.id, payload))
        : await firstValueFrom(this._sucursalService.addSucursal(payload));

      if (res?.status !== 'success') { this.guardando = false; return; }

      // Las imágenes van DESPUÉS: necesitan el id, que al crear nace aquí
      const ficha = await this.guardarImagenes(res.data.id, res.data);

      this.registrosE.emit(ficha);
      this._toastr.success(res.message, 'Éxito', { closeButton: true });
      this.modal.close(ficha);

    } catch (error) {
      // El AuthInterceptor ya notificó el error HTTP (409 con el motivo)
      console.error('Error al guardar la sucursal:', error);
      this.guardando = false;
    } finally {
      this._loadingService.setLoading(false);
    }
  }
}
