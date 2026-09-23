import { CommonModule } from '@angular/common';
import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, HostListener, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';

import { BoletinService } from '../../../services/boletin.service';
import { BoletinImagen, BoletinModel, TipoLamina } from '../../../interfaces/boletinModel';

/** Una lámina del carrusel: una imagen, un video o un audio del boletín. */
interface Lamina {
  boletin: BoletinModel;
  imagen: BoletinImagen;
  tipo: TipoLamina;
  /** Object URL del archivo ya descargado (o la vista previa local) */
  url?: string;
  /** El lienzo con la marca de agua ya pintada */
  listo: boolean;
  fallo: boolean;
}

/**
 * Boletines del usuario: un carrusel de imágenes que se abre al entrar al
 * sistema.
 *
 * La imagen no se pinta con un <img> apuntando al servidor: se descarga con el
 * token (el servidor no la publica en ninguna URL abierta), se dibuja en un
 * lienzo y encima se estampa el usuario que la está viendo. Así cualquier
 * copia —captura de pantalla, foto o "guardar imagen"— sale con su nombre.
 *
 * Si el PHP tiene GD activado, el servidor ya la entrega marcada; la marca de
 * este lienzo se suma a esa, no la sustituye.
 *
 * El video y el audio se tratan igual: el <video> va oculto y cada cuadro se
 * copia al lienzo con la marca encima, así que tampoco hay nada que guardar
 * con el botón derecho. El audio no tiene imagen, así que se le dibuja una
 * carátula con el título y la misma marca.
 */
@Component({
  selector: 'app-verBoletines',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './verBoletines.component.html',
  styleUrls: ['./verBoletines.component.css'],
})
export class VerBoletinesComponent implements OnInit, AfterViewInit, OnDestroy {

  /** Boletines a mostrar, en el orden en que llegan del servidor. */
  @Input() boletines: BoletinModel[] = [];
  /** Vista previa desde el editor: no registra la lectura ni pide nada al servidor. */
  @Input() vistaPrevia = false;
  /** Texto de la marca de agua; por defecto, el usuario de la sesión. */
  @Input() marcaTexto = '';

  @ViewChild('lienzo') lienzo?: ElementRef<HTMLCanvasElement>;
  @ViewChild('escena') escena?: ElementRef<HTMLElement>;
  /** Un <video> oculto sirve para las dos cosas: el mp4 y el mp3. */
  @ViewChild('medio') medio?: ElementRef<HTMLVideoElement>;

  /** Todas las imágenes de todos los boletines, una detrás de otra. */
  laminas: Lamina[] = [];
  indice = 0;
  cargando = true;
  /** El usuario marcó "no volver a mostrar" en el boletín que se ve. */
  noMostrar = new Set<number>();

  // ---------- pase automático ----------
  /** Lo que se queda una imagen que no trae su tiempo. */
  private readonly SEGUNDOS_POR_DEFECTO = 6;
  /** El carrusel avanza solo; el usuario puede pararlo. */
  reproduciendo = true;
  private temporizadorPase: any;

  // ---------- video y audio ----------
  /** El medio está sonando (no es lo mismo que el pase del carrusel). */
  sonando = false;
  silenciado = false;
  /** El navegador no dejó arrancar con sonido: hay que pulsar para oírlo. */
  sonidoBloqueado = false;
  posicion = 0;
  duracion = 0;
  /** Trayendo un video de varios MB: conviene decirlo. */
  trayendo = false;
  private cuadro = 0;
  private marcaCache?: { ancho: number; alto: number; capa: HTMLCanvasElement };

  // ---------- ver la imagen: zoom, giro y arrastre ----------
  /** Mismos límites que la galería de fotos del perfil. */
  private readonly ZOOM_MIN = 0.5;
  private readonly ZOOM_MAX = 6;
  private readonly ZOOM_PASO = 0.25;

  escala = 1;
  giro = 0;
  private panX = 0;
  private panY = 0;
  /** Zoom al que la imagen entra en la caja; baja al ponerla de lado. */
  private escalaBase = 1;
  arrastrando = false;
  private arranqueX = 0;
  private arranqueY = 0;
  private panInicialX = 0;
  private panInicialY = 0;
  /** Pinza de dos dedos */
  private pinzando = false;
  private dedosInicial = 0;
  private escalaInicialPinza = 1;
  private medioInicialX = 0;
  private medioInicialY = 0;
  /** Boletines cuya lectura ya se registró en esta sesión del modal. */
  private registrados = new Set<number>();
  /** Láminas por las que ya pasó el usuario (para los obligatorios). */
  private vistas = new Set<number>();
  private pintando = false;
  /** Para no repintar el lienzo en cada píxel al redimensionar. */
  private temporizadorTamano: any;

  constructor(
    public modal: NgbActiveModal,
    private _toastr: ToastrService,
    private _boletinService: BoletinService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    // Sólo datos: la vista todavía no está pintada
    this.laminas = this.boletines.flatMap(b =>
      (b.imagenes ?? []).map(i => ({
        boletin: b, imagen: i, tipo: (i.tipo ?? 'IMAGEN') as TipoLamina, listo: false, fallo: false,
      }))
    );
    this.cargando = this.laminas.length > 0;
  }

  ngAfterViewInit(): void {
    if (!this.laminas.length) { return; }

    // En el siguiente turno: el lienzo ya existe y no se toca el estado
    // mientras Angular está comprobando la vista (NG0100).
    setTimeout(async () => {
      await this.mostrar(0);
      this.cargando = false;
      this.cdr.markForCheck();
      // El resto se va trayendo por detrás, para que pasar de lámina sea
      // inmediato. Los videos no: pesan demasiado para bajarlos todos de golpe.
      this.laminas.slice(1).filter(l => l.tipo !== 'VIDEO').forEach(l => this.descargar(l));
    });
  }

  ngOnDestroy(): void {
    clearTimeout(this.temporizadorTamano);
    clearTimeout(this.temporizadorPase);
    this.pararMedio();
    this.laminas.forEach(l => { if (l.url?.startsWith('blob:')) { URL.revokeObjectURL(l.url); } });
  }

  // ================================================================
  // NAVEGACIÓN
  // ================================================================

  get lamina(): Lamina | null {
    return this.laminas[this.indice] ?? null;
  }

  get boletin(): BoletinModel | null {
    return this.lamina?.boletin ?? null;
  }

  /** Cuántas láminas tiene el boletín que se está viendo y en cuál va. */
  get posicionEnBoletin(): { actual: number; total: number } {
    const b = this.boletin;
    if (!b) { return { actual: 0, total: 0 }; }
    const suyas = this.laminas.filter(l => l.boletin.id === b.id);
    const actual = suyas.findIndex(l => l === this.lamina) + 1;
    return { actual, total: suyas.length };
  }

  get hayVarios(): boolean {
    return this.boletines.length > 1;
  }

  get esUltima(): boolean {
    return this.indice >= this.laminas.length - 1;
  }

  async siguiente(): Promise<void> {
    if (this.esUltima) { return; }
    await this.mostrar(this.indice + 1);
  }

  async anterior(): Promise<void> {
    if (this.indice <= 0) { return; }
    await this.mostrar(this.indice - 1);
  }

  async irA(i: number): Promise<void> {
    if (i < 0 || i >= this.laminas.length || i === this.indice) { return; }
    await this.mostrar(i);
  }

  // ---------- pase automático ----------

  /** Hay más de una imagen: tiene sentido pasarlas solas. */
  get hayPase(): boolean {
    return this.laminas.length > 1;
  }

  /**
   * El pase se detiene mientras el usuario está mirando de cerca: con la
   * imagen ampliada o girada no se le puede cambiar debajo.
   */
  get paseEnMarcha(): boolean {
    return this.reproduciendo && this.hayPase && !this.esUltima && this.vistaIntacta && !this.esMedio;
  }

  /** La lámina que se ve es un video o un audio. */
  get esMedio(): boolean {
    return (this.lamina?.tipo ?? 'IMAGEN') !== 'IMAGEN';
  }

  /** Lo que se queda en pantalla la imagen que se está viendo. */
  get segundosDeLamina(): number {
    const n = Math.round(Number(this.lamina?.imagen?.segundos));
    if (!n || isNaN(n)) { return this.SEGUNDOS_POR_DEFECTO; }
    return Math.min(120, Math.max(1, n));
  }

  /** Parar o reanudar el pase; al final del todo, vuelve a empezar. */
  reproducir(): void {
    this.reproduciendo = !this.reproduciendo;
    if (!this.reproduciendo) {
      clearTimeout(this.temporizadorPase);
      if (this.esMedio) { this.medio?.nativeElement.pause(); }
      return;
    }
    if (this.esMedio) { this.reproducirMedio(); return; }
    if (this.esUltima) { this.irA(0); return; }
    this.programarPase();
  }

  /** Deja lista la siguiente imagen, o no hace nada si el pase está parado. */
  private programarPase(): void {
    clearTimeout(this.temporizadorPase);
    if (!this.paseEnMarcha) { return; }
    this.temporizadorPase = setTimeout(() => {
      // Puede haber cambiado algo mientras esperaba (zoom, giro, una pausa)
      if (this.paseEnMarcha) { this.siguiente(); }
    }, this.segundosDeLamina * 1000);
  }

  /**
   * El lienzo se dibuja al ancho que había cuando se pintó: si la pantalla
   * cambia (girar el teléfono, ajustar la ventana) hay que repintarlo para que
   * no se vea borroso ni recortado.
   */
  @HostListener('window:resize')
  alCambiarTamano(): void {
    clearTimeout(this.temporizadorTamano);
    this.temporizadorTamano = setTimeout(() => {
      const l = this.lamina;
      if (!l || l.fallo) { return; }
      this.pintar(l).then(() => {
        // Girada, la imagen que entraba antes puede que ya no entre
        const enElTope = this.escala === this.escalaBase;
        this.escalaBase = this.escalaQueEntraAlGirar();
        if (enElTope) { this.escala = this.escalaBase; }
        this.cdr.markForCheck();
      });
    }, 250);
  }

  @HostListener('document:keydown', ['$event'])
  onTecla(ev: KeyboardEvent): void {
    if (ev.key === 'ArrowRight') { ev.preventDefault(); this.siguiente(); }
    else if (ev.key === 'ArrowLeft') { ev.preventDefault(); this.anterior(); }
    else if (ev.key === 'Escape' && !this.debeConfirmar) { ev.preventDefault(); this.cerrar(); }
    else if (ev.key === '+' || ev.key === '=') { ev.preventDefault(); this.acercar(); }
    else if (ev.key === '-') { ev.preventDefault(); this.alejar(); }
    else if (ev.key === 'r' || ev.key === 'R') { ev.preventDefault(); this.girar(ev.shiftKey ? -90 : 90); }
    else if (ev.key === '0') { ev.preventDefault(); this.restablecer(); }
  }

  /** Muestra la lámina i: la descarga si hace falta y la pinta con la marca. */
  private async mostrar(i: number): Promise<void> {
    this.indice = i;
    // Cada imagen empieza sin zoom ni giro
    this.restablecer();
    const l = this.laminas[i];
    if (!l) { return; }

    this.pararMedio();
    this.vistas.add(i);

    // Un video puede tardar: el aviso evita que parezca colgado
    this.trayendo = !l.url && !l.fallo && l.tipo !== 'IMAGEN';
    this.cdr.markForCheck();
    await this.descargar(l);
    this.trayendo = false;

    if (l.tipo === 'IMAGEN') {
      await this.pintar(l);
    } else {
      this.arrancarMedio(l);
    }
    this.cdr.markForCheck();

    // La lectura se registra al ver el boletín, no al cerrarlo
    if (!this.vistaPrevia && !this.registrados.has(l.boletin.id)) {
      this.registrados.add(l.boletin.id);
      this._boletinService.marcarVisto(l.boletin.id, false).subscribe({ error: () => {} });
    }

    this.programarPase();
  }

  /** Trae la imagen con el token y guarda su object URL. */
  private async descargar(l: Lamina): Promise<void> {
    if (l.url || l.fallo) { return; }

    // Vista previa del editor: la imagen ya viene como URL local
    const local = (l.imagen as any).urlLocal as string | undefined;
    if (local) { l.url = local; return; }

    if (!l.imagen.id) { l.fallo = true; return; }

    try {
      const blob = await firstValueFrom(this._boletinService.imagen(l.imagen.id));
      l.url = URL.createObjectURL(blob);
    } catch (e) {
      console.error('No se pudo traer el archivo del boletín:', e);
      l.fallo = true;
    }
  }

  // ================================================================
  // LIENZO CON MARCA DE AGUA
  // ================================================================

  /** Dibuja la lámina en el lienzo y le estampa el nombre del usuario. */
  private async pintar(l: Lamina): Promise<void> {
    const canvas = this.lienzo?.nativeElement;
    if (!canvas || !l.url || this.pintando) { return; }

    this.pintando = true;
    try {
      const img = await this.cargarImagen(l.url);
      const maxAncho = Math.min(1600, Math.max(480, canvas.parentElement?.clientWidth ?? 900));
      const escala = Math.min(1, maxAncho / (img.width || maxAncho));
      canvas.width = Math.round((img.width || maxAncho) * escala);
      canvas.height = Math.round((img.height || maxAncho * 0.6) * escala);

      const ctx = canvas.getContext('2d');
      if (!ctx) { return; }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      ctx.drawImage(this.capaDeMarca(canvas.width, canvas.height), 0, 0);
      l.listo = true;
    } catch (e) {
      console.error('No se pudo pintar la imagen del boletín:', e);
      l.fallo = true;
    } finally {
      this.pintando = false;
    }
  }

  /** createImageBitmap no está en todos los navegadores: se usa <img> de respaldo. */
  private cargarImagen(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('imagen no válida'));
      img.src = url;
    });
  }

  /** El nombre del usuario, repetido en diagonal sobre toda la imagen. */
  private estampar(ctx: CanvasRenderingContext2D, ancho: number, alto: number): void {
    const texto = (this.marcaTexto || this.textoDeSesion()).toUpperCase();
    if (!texto) { return; }

    const tamano = Math.max(13, Math.round(ancho / 42));
    ctx.save();
    ctx.font = `600 ${tamano}px "Segoe UI", Roboto, sans-serif`;
    ctx.textBaseline = 'middle';

    const ancholTexto = ctx.measureText(texto).width;
    const pasoX = ancholTexto + tamano * 5;
    const pasoY = tamano * 6;

    ctx.translate(ancho / 2, alto / 2);
    ctx.rotate(-28 * Math.PI / 180);
    const diagonal = Math.sqrt(ancho * ancho + alto * alto);

    for (let y = -diagonal / 2; y < diagonal / 2; y += pasoY) {
      const desfase = (Math.round(y / pasoY) % 2) * (pasoX / 2);
      for (let x = -diagonal / 2 - desfase; x < diagonal / 2; x += pasoX) {
        ctx.fillStyle = 'rgba(0, 0, 0, .18)';
        ctx.fillText(texto, x + 1, y + 1);
        ctx.fillStyle = 'rgba(255, 255, 255, .34)';
        ctx.fillText(texto, x, y);
      }
    }
    ctx.restore();
  }

  /** Usuario de la sesión: login y nombre, con la fecha y la hora. */
  private textoDeSesion(): string {
    try {
      const u = JSON.parse(localStorage.getItem('user') ?? '{}');
      const nombre = [u?.name, u?.surname].filter(Boolean).join(' ');
      const login = u?.login_user ?? '';
      const ahora = new Date().toLocaleString('es-EC', { dateStyle: 'short', timeStyle: 'short' });
      return [login, nombre, ahora].filter(Boolean).join(' · ');
    } catch {
      return new Date().toLocaleString('es-EC');
    }
  }

  // ================================================================
  // VIDEO Y AUDIO
  // El <video> nunca se ve: lo que se ve es el lienzo, con el cuadro ya
  // marcado. Así el mp4 tiene el mismo trato que una imagen.
  // ================================================================

  /** Pone en marcha el video o el audio de esta lámina. */
  private arrancarMedio(l: Lamina): void {
    const v = this.medio?.nativeElement;
    if (!v || !l.url) { return; }

    this.posicion = 0;
    this.duracion = 0;
    this.sonidoBloqueado = false;
    v.src = l.url;
    v.muted = this.silenciado;
    v.load();
    this.reproducirMedio();
    this.dibujarMedio();
  }

  /** Intenta sonar; si el navegador no deja, arranca en silencio y avisa. */
  private reproducirMedio(): void {
    const v = this.medio?.nativeElement;
    if (!v) { return; }

    v.play().then(() => {
      this.sonando = true;
      this.cdr.markForCheck();
    }).catch(() => {
      // Chrome no deja sonar solo hasta que el usuario toque algo
      v.muted = true;
      this.silenciado = true;
      this.sonidoBloqueado = true;
      v.play().then(() => { this.sonando = true; this.cdr.markForCheck(); }).catch(() => {});
    });
  }

  /** Parar y soltar: al cambiar de lámina y al cerrar. */
  private pararMedio(): void {
    cancelAnimationFrame(this.cuadro);
    this.cuadro = 0;
    this.sonando = false;
    this.posicion = 0;
    this.duracion = 0;

    const v = this.medio?.nativeElement;
    if (!v) { return; }
    v.pause();
    v.removeAttribute('src');
    v.load();
  }

  /** El botón de sonido: también sirve para desbloquearlo. */
  alternarSonido(): void {
    const v = this.medio?.nativeElement;
    this.silenciado = !this.silenciado;
    this.sonidoBloqueado = false;
    if (!v) { return; }
    v.muted = this.silenciado;
    if (!this.silenciado && v.paused) { this.reproducirMedio(); }
  }

  /** Play/pausa del medio, sin tocar el pase del carrusel. */
  alternarMedio(): void {
    const v = this.medio?.nativeElement;
    if (!v) { return; }
    if (v.paused) { this.reproducirMedio(); } else { v.pause(); this.sonando = false; }
  }

  /** Mover la reproducción con la barra. */
  irASegundo(valor: any): void {
    const v = this.medio?.nativeElement;
    if (!v || !this.duracion) { return; }
    v.currentTime = Math.min(this.duracion, Math.max(0, Number(valor) || 0));
    this.posicion = v.currentTime;
  }

  alCargarMedio(): void {
    const v = this.medio?.nativeElement;
    this.duracion = v && isFinite(v.duration) ? v.duration : 0;
    this.cdr.markForCheck();
  }

  alAvanzarMedio(): void {
    const v = this.medio?.nativeElement;
    if (!v) { return; }
    this.posicion = v.currentTime;
    if (!this.duracion && isFinite(v.duration)) { this.duracion = v.duration; }
  }

  /** Al acabar, el carrusel sigue si el pase está activo. */
  alTerminarMedio(): void {
    this.sonando = false;
    this.posicion = this.duracion;
    if (this.reproduciendo && !this.esUltima && this.vistaIntacta) { this.siguiente(); }
    else { this.cdr.markForCheck(); }
  }

  alFallarMedio(): void {
    const l = this.lamina;
    if (l) { l.fallo = true; }
    this.sonando = false;
    this.cdr.markForCheck();
  }

  /** mm:ss para la barra de tiempo. */
  reloj(segundos: number): string {
    const s = Math.max(0, Math.floor(segundos || 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  /** Copia el cuadro al lienzo y le pone la marca; se repite mientras dure. */
  private dibujarMedio(): void {
    const canvas = this.lienzo?.nativeElement;
    const v = this.medio?.nativeElement;
    const l = this.lamina;
    if (!canvas || !v || !l || l.tipo === 'IMAGEN') { return; }

    const ctx = canvas.getContext('2d');
    if (ctx) {
      if (l.tipo === 'VIDEO' && v.videoWidth) {
        const ancho = Math.min(1280, v.videoWidth);
        const alto = Math.round(ancho * (v.videoHeight / v.videoWidth));
        if (canvas.width !== ancho || canvas.height !== alto) { canvas.width = ancho; canvas.height = alto; }
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        ctx.drawImage(this.capaDeMarca(canvas.width, canvas.height), 0, 0);
        l.listo = true;
      } else if (l.tipo === 'AUDIO') {
        this.dibujarCaratula(ctx, canvas, l);
        l.listo = true;
      }
    }

    this.cuadro = requestAnimationFrame(() => this.dibujarMedio());
  }

  /** El audio no tiene imagen: se le dibuja una carátula con su título. */
  private dibujarCaratula(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, l: Lamina): void {
    if (canvas.width !== 960 || canvas.height !== 540) { canvas.width = 960; canvas.height = 540; }
    const { width: w, height: h } = canvas;

    const fondo = ctx.createLinearGradient(0, 0, w, h);
    fondo.addColorStop(0, '#14263a');
    fondo.addColorStop(1, '#0b1520');
    ctx.fillStyle = fondo;
    ctx.fillRect(0, 0, w, h);

    // Unas barras que suben y bajan con la reproducción: sólo decoración
    const barras = 28;
    const base = h * 0.62;
    for (let i = 0; i < barras; i++) {
      const x = w * 0.5 - (barras * 14) / 2 + i * 14;
      const onda = Math.abs(Math.sin(this.posicion * 2 + i * 0.7));
      const alto = this.sonando ? 12 + onda * 70 : 12;
      ctx.fillStyle = 'rgba(0, 172, 172, ' + (0.35 + onda * 0.45) + ')';
      ctx.fillRect(x, base - alto / 2, 8, alto);
    }

    ctx.fillStyle = 'rgba(255, 255, 255, .92)';
    ctx.textAlign = 'center';
    ctx.font = '600 34px "Segoe UI", Roboto, sans-serif';
    ctx.fillText(l.imagen.titulo || l.boletin.titulo || 'Audio', w / 2, h * 0.33, w * 0.85);
    ctx.fillStyle = 'rgba(255, 255, 255, .55)';
    ctx.font = '20px "Segoe UI", Roboto, sans-serif';
    ctx.fillText(l.imagen.descripcion || 'Audio del boletín', w / 2, h * 0.33 + 38, w * 0.85);
    ctx.textAlign = 'start';

    ctx.drawImage(this.capaDeMarca(w, h), 0, 0);
  }

  /**
   * La marca, ya dibujada en una capa aparte: en el video se pega en cada
   * cuadro y medirla treinta veces por segundo sería tirar el tiempo.
   */
  private capaDeMarca(ancho: number, alto: number): HTMLCanvasElement {
    if (this.marcaCache && this.marcaCache.ancho === ancho && this.marcaCache.alto === alto) {
      return this.marcaCache.capa;
    }
    const capa = document.createElement('canvas');
    capa.width = ancho;
    capa.height = alto;
    const ctx = capa.getContext('2d');
    if (ctx) { this.estampar(ctx, ancho, alto); }
    this.marcaCache = { ancho, alto, capa };
    return capa;
  }

  // ================================================================
  // ZOOM, GIRO Y ARRASTRE
  // Lo mismo que en la galería de fotos del perfil: la imagen no se
  // vuelve a dibujar, sólo se transforma con CSS, así que la marca de
  // agua se amplía y gira con ella.
  // ================================================================

  get transformacion(): string {
    return `translate(${this.panX}px, ${this.panY}px) rotate(${this.giro}deg) scale(${this.escala})`;
  }

  get zoomPorcentaje(): number {
    return Math.round(this.escala * 100);
  }

  /** Sólo se puede mover la imagen cuando sobresale de la caja. */
  get puedeArrastrar(): boolean {
    return this.escala > this.escalaBase;
  }

  /** Nada que restablecer si está tal como llegó. */
  get vistaIntacta(): boolean {
    return this.escala === 1 && this.giro === 0 && this.panX === 0 && this.panY === 0;
  }

  get noSePuedeAcercar(): boolean {
    return this.escala >= this.ZOOM_MAX;
  }

  get noSePuedeAlejar(): boolean {
    return this.escala <= this.ZOOM_MIN;
  }

  acercar(): void {
    this.zoomConBoton(this.escala + this.ZOOM_PASO);
  }

  alejar(): void {
    this.zoomConBoton(this.escala - this.ZOOM_PASO);
  }

  /** Gira 90°; si queda de lado, se reduce para que entre en la caja. */
  girar(grados: number): void {
    this.giro += grados;
    this.panX = 0;
    this.panY = 0;
    this.escalaBase = this.escalaQueEntraAlGirar();
    this.escala = this.escalaBase;
    this.programarPase();
  }

  /** Deja la imagen como estaba al abrirla. */
  restablecer(): void {
    this.escala = 1;
    this.giro = 0;
    this.panX = 0;
    this.panY = 0;
    this.escalaBase = 1;
    this.programarPase();
  }

  /** Doble clic: acerca al 200 % o vuelve a lo normal. */
  alternarZoom(): void {
    if (this.escala > this.escalaBase) { this.escala = this.escalaBase; this.panX = 0; this.panY = 0; }
    else { this.zoomConBoton(2); }
  }

  /** La rueda acerca y aleja hacia donde está el puntero. */
  alRueda(ev: WheelEvent): void {
    ev.preventDefault();
    const anterior = this.escala;
    const nueva = this.limitarZoom(anterior + (ev.deltaY < 0 ? 1 : -1) * this.ZOOM_PASO);
    if (nueva === anterior) { return; }

    const caja = this.escena?.nativeElement.getBoundingClientRect();
    if (caja) {
      const x = ev.clientX - caja.left - caja.width / 2;
      const y = ev.clientY - caja.top - caja.height / 2;
      this.panX = x - ((x - this.panX) / anterior) * nueva;
      this.panY = y - ((y - this.panY) / anterior) * nueva;
    }
    this.escala = nueva;
    this.centrarSiNoHayZoom();
    this.programarPase();
  }

  private zoomConBoton(valor: number): void {
    const anterior = this.escala;
    this.escala = this.limitarZoom(valor);
    if (this.escala === anterior) { return; }

    const factor = this.escala / anterior;
    this.panX *= factor;
    this.panY *= factor;
    this.centrarSiNoHayZoom();
    this.programarPase();
  }

  private limitarZoom(valor: number): number {
    const redondeado = Math.round(valor * 100) / 100;
    return Math.min(this.ZOOM_MAX, Math.max(this.ZOOM_MIN, redondeado));
  }

  private centrarSiNoHayZoom(): void {
    if (this.escala <= this.escalaBase) { this.panX = 0; this.panY = 0; }
  }

  /** Puesta de lado, la imagen es más alta que ancha: cuánto hay que reducirla. */
  private escalaQueEntraAlGirar(): number {
    const deLado = this.giro % 180 !== 0;
    const img = this.lienzo?.nativeElement;
    const caja = this.escena?.nativeElement;
    if (!deLado || !img || !caja || !img.offsetWidth || !img.offsetHeight) { return 1; }

    // Sin el relleno de la caja: ahí están la barra y el pie flotantes, y la
    // imagen de lado no debe meterse debajo de ellos.
    const r = getComputedStyle(caja);
    const ancho = caja.clientWidth - parseFloat(r.paddingLeft) - parseFloat(r.paddingRight);
    const alto = caja.clientHeight - parseFloat(r.paddingTop) - parseFloat(r.paddingBottom);

    const factor = Math.min(1, ancho / img.offsetHeight, alto / img.offsetWidth);
    return Math.max(0.1, Math.floor(factor * 100) / 100);
  }

  // ---------- arrastrar con el ratón ----------

  empezarArrastre(ev: MouseEvent): void {
    if (!this.puedeArrastrar) { return; }
    ev.preventDefault();
    this.arrastrando = true;
    this.arranqueX = ev.clientX;
    this.arranqueY = ev.clientY;
    this.panInicialX = this.panX;
    this.panInicialY = this.panY;
  }

  arrastrar(ev: MouseEvent): void {
    if (!this.arrastrando) { return; }
    ev.preventDefault();
    this.panX = this.panInicialX + (ev.clientX - this.arranqueX);
    this.panY = this.panInicialY + (ev.clientY - this.arranqueY);
  }

  terminarArrastre(): void {
    this.arrastrando = false;
  }

  // ---------- dedos: arrastrar y pinza ----------

  alTocar(ev: TouchEvent): void {
    if (ev.touches.length === 2) {
      this.pinzando = true;
      this.arrastrando = false;
      this.dedosInicial = this.distanciaDedos(ev.touches);
      this.escalaInicialPinza = this.escala;
      const medio = this.medioDedos(ev.touches);
      this.medioInicialX = medio.x;
      this.medioInicialY = medio.y;
      this.panInicialX = this.panX;
      this.panInicialY = this.panY;
      return;
    }
    if (ev.touches.length === 1 && this.puedeArrastrar) {
      this.arrastrando = true;
      this.arranqueX = ev.touches[0].clientX;
      this.arranqueY = ev.touches[0].clientY;
      this.panInicialX = this.panX;
      this.panInicialY = this.panY;
    }
  }

  alMoverDedos(ev: TouchEvent): void {
    if (this.pinzando && ev.touches.length === 2) {
      ev.preventDefault();
      this.moverPinza(ev);
      return;
    }
    if (!this.arrastrando || ev.touches.length !== 1) { return; }
    ev.preventDefault();
    this.panX = this.panInicialX + (ev.touches[0].clientX - this.arranqueX);
    this.panY = this.panInicialY + (ev.touches[0].clientY - this.arranqueY);
  }

  alSoltarDedos(): void {
    if (this.pinzando) { this.pinzando = false; this.centrarSiNoHayZoom(); }
    this.arrastrando = false;
    this.programarPase();
  }

  private moverPinza(ev: TouchEvent): void {
    if (!this.dedosInicial) { return; }

    const proporcion = this.distanciaDedos(ev.touches) / this.dedosInicial;
    const minimo = Math.min(this.ZOOM_MIN, this.escalaBase);
    const nueva = Math.min(this.ZOOM_MAX, Math.max(minimo, Math.round(this.escalaInicialPinza * proporcion * 100) / 100));

    const medio = this.medioDedos(ev.touches);
    const x = (this.medioInicialX - this.panInicialX) / this.escalaInicialPinza;
    const y = (this.medioInicialY - this.panInicialY) / this.escalaInicialPinza;
    this.panX = medio.x - x * nueva;
    this.panY = medio.y - y * nueva;
    this.escala = nueva;
  }

  private distanciaDedos(dedos: TouchList): number {
    const dx = dedos[0].clientX - dedos[1].clientX;
    const dy = dedos[0].clientY - dedos[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private medioDedos(dedos: TouchList): { x: number; y: number } {
    const caja = this.escena?.nativeElement.getBoundingClientRect();
    if (!caja) { return { x: 0, y: 0 }; }
    return {
      x: (dedos[0].clientX + dedos[1].clientX) / 2 - caja.left - caja.width / 2,
      y: (dedos[0].clientY + dedos[1].clientY) / 2 - caja.top - caja.height / 2,
    };
  }

  // ================================================================
  // CERRAR
  // ================================================================

  /**
   * Un boletín obligatorio hay que verlo entero: mientras quede una lámina
   * suya sin pasar, no se puede cerrar (y la X ni siquiera se muestra).
   */
  get debeConfirmar(): boolean {
    if (this.vistaPrevia) { return false; }
    return this.faltanPorVer > 0;
  }

  /** Cuántas láminas de boletines obligatorios quedan por ver. */
  get faltanPorVer(): number {
    if (this.vistaPrevia) { return 0; }
    return this.laminas.reduce(
      (n, l, i) => n + (l.boletin.obligatorio && !this.vistas.has(i) ? 1 : 0),
      0
    );
  }

  /** Hay algún boletín de lectura obligatoria en el carrusel. */
  get hayObligatorio(): boolean {
    return !this.vistaPrevia && this.boletines.some(b => b.obligatorio);
  }

  alternarNoMostrar(b: BoletinModel): void {
    if (this.noMostrar.has(b.id)) { this.noMostrar.delete(b.id); } else { this.noMostrar.add(b.id); }
  }

  /** Cierra y guarda los "no volver a mostrar" que haya marcado. */
  cerrar(): void {
    // Se puede llegar aquí por teclado o saltando con los puntos
    if (this.debeConfirmar) {
      const n = this.faltanPorVer;
      this._toastr.warning(
        n === 1 ? 'Queda 1 lámina por ver' : `Quedan ${n} láminas por ver`,
        'Lectura obligatoria',
        { timeOut: 3000 }
      );
      return;
    }

    if (!this.vistaPrevia) {
      for (const id of this.noMostrar) {
        this._boletinService.marcarVisto(id, true).subscribe({ error: () => {} });
      }
      if (this.noMostrar.size) {
        this._toastr.info(this.noMostrar.size > 1 ? 'No se volverán a mostrar' : 'No se volverá a mostrar', 'Boletines', { timeOut: 2500 });
      }
    }
    this.modal.close(true);
  }

  /** Evita el menú del botón derecho sobre el lienzo. */
  sinMenu(ev: Event): void {
    ev.preventDefault();
  }
}
