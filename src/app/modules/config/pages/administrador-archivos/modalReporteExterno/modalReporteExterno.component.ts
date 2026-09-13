import { Component, HostListener, Input, OnInit } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

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
export class ModalReporteExternoComponent implements OnInit {
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
  isFullscreen = false;

  constructor(
    public modal: NgbActiveModal,
    private sanitizer: DomSanitizer,
    private _archivoService: ArchivoService
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
