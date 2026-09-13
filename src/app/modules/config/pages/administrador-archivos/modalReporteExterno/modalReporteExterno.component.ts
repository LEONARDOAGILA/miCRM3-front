import { Component, HostListener, Input, OnDestroy, OnInit } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';

import { ArchivoService } from '../../../services/archivo.service';
import { DefTipoArchivo, defTipo, formatoTamano, tipoPorExtension } from '../../../interfaces/tipoArchivo';

/** Cómo se pinta el cuerpo del visor (ver resolverVisor). */
type Visor = 'iframe' | 'imagen' | 'video' | 'audio' | 'descarga';

/**
 * Visor a pantalla completa de un "archivo" del administrador.
 *
 * Abre cada tipo como corresponde (ver tipoArchivo.ts):
 *   - enlace y pdf → iframe (el navegador ya sabe pintar un pdf)
 *   - imagen       → <img>
 *   - video        → <video controls autoplay>
 *   - audio        → <audio controls autoplay> en una tarjeta con el icono
 *   - excel / word / otro → no se pueden ver en el navegador: se ofrece
 *                    descargar, con el nombre y el peso
 *
 * Los enlaces se miran un poco más: una url de YouTube o Vimeo se abre con
 * su reproductor embebido (la página normal no deja meterse en un iframe),
 * y un enlace directo a un .mp4 / .mp3 se reproduce como un fichero subido.
 *
 * Los ficheros subidos tienen la url relativa al back; urlPublica() la
 * completa. Los enlaces van tal cual.
 */
@Component({
  selector: 'app-modalReporteExterno',
  templateUrl: './modalReporteExterno.component.html',
  styleUrls: ['./modalReporteExterno.component.css'],
  standalone: false,
})
export class ModalReporteExternoComponent implements OnInit, OnDestroy {
  @Input() registro_selected: any;

  /** Para el iframe (sanitizada). */
  url_: SafeResourceUrl;
  /** La misma url en texto, para <img>, <video>, <audio> y el botón de descarga. */
  urlTexto = '';
  tipo: DefTipoArchivo;
  /** Qué se pinta: sale del tipo, salvo en enlaces a YouTube/Vimeo o a medios. */
  visor: Visor = 'iframe';
  /** true si el enlace es un video de YouTube / Vimeo embebido. */
  esEmbebido = false;
  /** El navegador no pudo reproducir el video/audio (formato no soportado, p. ej. .mkv o .wma). */
  errorMedio = false;
  /** proteger_url del registro: sin "abrir en pestaña" ni descarga (el back también lo rechaza). */
  get protegido(): boolean { return !!this.registro_selected?.proteger_url; }
  /** true mientras se descarga el fichero (botón con spinner). */
  descargando = false;
  private readonly destroy$ = new Subject<void>();
  isFullscreen = false;

  constructor(
    public modal: NgbActiveModal,
    private sanitizer: DomSanitizer,
    private _archivoService: ArchivoService,
    private _toastr: ToastrService
  ) {}

  ngOnInit(): void {
    this.isFullscreen = true;
    this.tipo = defTipo(this.registro_selected?.tipo, this.registro_selected?.url);
    this.urlTexto = this._archivoService.urlPublica(this.registro_selected?.url);
    this.resolverVisor();
    this.url_ = this.sanitizer.bypassSecurityTrustResourceUrl(this.urlTexto);
  }

  /**
   * Decide el visor. Para ficheros subidos manda el tipo. Para enlaces:
   * YouTube / Vimeo → iframe con la url de embed; url que termina en una
   * extensión de video/audio/imagen/pdf → ese visor; el resto → iframe.
   */
  private resolverVisor(): void {
    if (this.tipo.id !== 'link') {
      this.visor = this.tipo.visor;
      return;
    }

    const embed = this.urlEmbed(this.urlTexto);
    if (embed) {
      this.urlTexto = embed;
      this.esEmbebido = true;
      this.visor = 'iframe';
      return;
    }

    // Enlace directo a un medio: se reproduce, no se "navega"
    const sinQuery = this.urlTexto.split(/[?#]/)[0];
    const tipoPorUrl = defTipo(tipoPorExtension(sinQuery));
    if (['video', 'audio', 'imagen'].includes(tipoPorUrl.id)) {
      this.visor = tipoPorUrl.visor;
      return;
    }
    this.visor = 'iframe';
  }

  /**
   * Url de reproductor embebido para YouTube (watch, youtu.be, shorts) y
   * Vimeo; null si no es ninguno de los dos.
   */
  private urlEmbed(url: string): string | null {
    let u: URL;
    try { u = new URL(url); } catch { return null; }
    const host = u.hostname.replace(/^www\.|^m\./, '');

    if (host === 'youtu.be') {
      const id = u.pathname.slice(1).split('/')[0];
      return id ? `https://www.youtube.com/embed/${id}?autoplay=1&rel=0` : null;
    }
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (u.pathname.startsWith('/embed/')) { return url; }
      const shorts = u.pathname.match(/^\/shorts\/([^/]+)/);
      const id = shorts?.[1] ?? u.searchParams.get('v');
      return id ? `https://www.youtube.com/embed/${id}?autoplay=1&rel=0` : null;
    }
    if (host === 'vimeo.com') {
      const id = u.pathname.match(/\/(\d+)/)?.[1];
      return id ? `https://player.vimeo.com/video/${id}?autoplay=1` : null;
    }
    if (host === 'player.vimeo.com') { return url; }
    return null;
  }

  get nombre(): string {
    return this.registro_selected?.nombre ?? '';
  }

  /** Nombre del fichero en el servidor (último tramo de la url). */
  get nombreFichero(): string {
    const url: string = this.registro_selected?.url ?? '';
    return url.split('/').pop() ?? url;
  }

  get tamano(): string {
    return formatoTamano(this.registro_selected?.tamano);
  }

  /** Extensión en mayúsculas, para el aviso de formato no soportado. */
  get extension(): string {
    return (this.nombreFichero.split('.').pop() ?? '').toUpperCase();
  }

  /** El <video> / <audio> no pudo cargar la fuente. */
  onErrorMedio(): void {
    this.errorMedio = true;
  }

  /**
   * Descarga el fichero subido. Se pide al back con el token (responseType
   * blob) y se guarda desde memoria con un <a download> temporal: un enlace
   * directo a storage está en otra origen y el navegador, en vez de
   * descargarlo, lo abría en otra pestaña.
   */
  descargar(): void {
    const id = this.registro_selected?.id;
    if (!id || this.descargando || this.protegido) { return; }

    this.descargando = true;
    this._archivoService.descargarArchivo(id)
      .pipe(takeUntil(this.destroy$), finalize(() => { this.descargando = false; }))
      .subscribe({
        next: resp => {
          if (!resp.body) { return; }
          const enlace = document.createElement('a');
          const urlBlob = URL.createObjectURL(resp.body);
          enlace.href = urlBlob;
          enlace.download = this.nombreDescarga(resp.headers.get('Content-Disposition'));
          document.body.appendChild(enlace);
          enlace.click();
          enlace.remove();
          // El blob se libera cuando el navegador ya lo ha leído
          setTimeout(() => URL.revokeObjectURL(urlBlob), 1000);
        },
        // El interceptor ya muestra el error HTTP; aquí sólo se cubre un blob vacío o similar
        error: () => this._toastr.error('No se pudo descargar el archivo', 'Descarga'),
      });
  }

  /**
   * Nombre con el que se guarda: el que manda el back en Content-Disposition
   * (nombre del registro + extensión); si no llega (CORS sin expose_headers),
   * el nombre del registro con la extensión del fichero.
   */
  private nombreDescarga(disposition: string | null): string {
    const utf8 = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
    if (utf8) { try { return decodeURIComponent(utf8); } catch { /* cae al siguiente */ } }
    const plano = disposition?.match(/filename="?([^";]+)"?/i)?.[1];
    if (plano) { return plano; }
    const ext = this.nombreFichero.split('.').pop() ?? '';
    return `${this.nombre || 'archivo'}${ext ? '.' + ext : ''}`;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  toggleFullscreen(): void {
    const elem = document.documentElement;
    if (!document.fullscreenElement) {
      elem.requestFullscreen().catch(err => {
        console.error(`Error al intentar pantalla completa: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  }

  @HostListener('document:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent): void {
    if (event.key === 'F11') {
      event.preventDefault();
      this.toggleFullscreen();
    }
  }
}
