import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

import { ModalHeaderComponent } from '../modal/modal-header/modal-header.component';
import { ModalFooterComponent } from '../modal/modal-footer/modal-footer.component';

/**
 * Selector de iconos en modal.
 *
 * Estaba dentro de saveMenu y se desplegaba en línea, lo que hacía crecer el
 * formulario de golpe y empujaba el resto de los campos. Sacarlo a su propio
 * modal deja el formulario quieto y, de paso, permite reutilizarlo desde
 * cualquier pantalla que necesite elegir un icono.
 *
 * Uso:
 *   const ref = this.modalService.open(SelectorIconosComponent, { size: 'lg' });
 *   ref.componentInstance.iconoSeleccionado = <clase actual>;
 *   ref.componentInstance.seleccionado.subscribe(clase => ...);
 */
@Component({
  selector: 'app-selector-iconos',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalHeaderComponent, ModalFooterComponent],
  templateUrl: './selector-iconos.component.html',
  styleUrls: ['./selector-iconos.component.css'],
})
export class SelectorIconosComponent {

  /** Clase del icono ya asignado, para marcarlo como actual en la rejilla. */
  @Input() iconoSeleccionado = '';

  @Output() seleccionado = new EventEmitter<string>();

  // ============================================================
  // CATÁLOGO
  // Font Awesome 6 (la librería que carga la app, all.css: sólidos y
  // marcas) con nombre en español para poder buscarlos sin saberse la
  // clase. Formato: "icono:Nombre|icono:Nombre|…". Los grupos listados
  // en GRUPOS_DE_MARCAS usan el estilo fa-brands; el resto, fa-solid.
  // ============================================================
  private readonly GRUPOS_DE_MARCAS = ['Redes y video', 'Marcas y apps', 'Tecnología (marcas)'];

  private readonly ICONOS_POR_GRUPO: { [grupo: string]: string } = {
    'General': 'house:Inicio|gauge-high:Panel de control|table-columns:Tablero|bars:Menú|list:Lista|list-check:Tareas|compass:Navegar|sitemap:Estructura|diagram-project:Organigrama|folder:Carpeta|folder-open:Carpeta abierta|folder-tree:Árbol de carpetas|star:Favorito|bookmark:Marcador|flag:Bandera|bell:Notificaciones|magnifying-glass:Buscar|filter:Filtro|thumbtack:Fijar|heart:Preferidos|lightbulb:Idea|rocket:Lanzamiento',
    'Configuración': 'gear:Configuración|gears:Ajustes|sliders:Parámetros|wrench:Herramienta|screwdriver-wrench:Mantenimiento|toolbox:Caja de herramientas|plug:Conexión|power-off:Encendido|arrows-rotate:Actualizar|code:Código|terminal:Consola|bug:Errores|server:Servidor|database:Base de datos|hard-drive:Disco|cloud:Nube|cloud-arrow-up:Respaldo',
    'Seguridad': 'lock:Bloqueo|unlock:Desbloqueo|key:Llave|shield:Escudo|shield-halved:Seguridad|user-shield:Permisos|user-lock:Bloquear usuario|fingerprint:Huella|id-badge:Credencial|id-card:Identificación|user-secret:Auditoría|eye:Ver|eye-slash:Ocultar',
    'Usuarios': 'user:Usuario|users:Usuarios|user-plus:Nuevo usuario|user-gear:Perfil|user-tie:Empleado|user-group:Grupos|people-group:Equipo|user-check:Aprobación|address-book:Agenda|address-card:Contacto|headset:Soporte',
    'Documentos': 'file:Archivo|file-lines:Documento|file-invoice:Factura|file-invoice-dollar:Factura con importe|file-pdf:PDF|file-excel:Excel|file-csv:CSV|clipboard:Portapapeles|clipboard-list:Checklist|clipboard-check:Revisado|book:Libro|book-open:Manual|newspaper:Noticias|print:Imprimir|paperclip:Adjunto|download:Descargar|upload:Subir|image:Imagen|camera:Cámara|video:Vídeo|microphone:Audio|palette:Diseño|brush:Estilos',
    'Comercial': 'cart-shopping:Carrito|basket-shopping:Compras|bag-shopping:Ventas|store:Tienda|shop:Local|box:Producto|boxes-stacked:Inventario|warehouse:Bodega|truck:Despacho|truck-fast:Envío|tags:Categorías|tag:Etiqueta|receipt:Recibo|barcode:Código de barras|qrcode:Código QR|cash-register:Caja',
    'Finanzas': 'dollar-sign:Precio|money-bill:Dinero|money-bill-wave:Pagos|money-check-dollar:Cobros|credit-card:Tarjeta|wallet:Billetera|piggy-bank:Ahorros|coins:Monedas|calculator:Calculadora|percent:Descuentos|scale-balanced:Balance|landmark:Banco',
    'Informes': 'chart-line:Tendencia|chart-bar:Barras|chart-pie:Circular|chart-column:Columnas|chart-area:Área|table:Tabla|table-list:Listado',
    'Comunicación': 'envelope:Correo|envelope-open:Mensaje abierto|paper-plane:Enviar|comments:Chat|comment-dots:Comentario|phone:Teléfono|mobile-screen:Móvil|share-nodes:Compartir|rss:Novedades|at:Arroba',
    'Tiempo y lugar': 'calendar:Calendario|calendar-days:Agenda|calendar-check:Cita|clock:Horario|hourglass-half:Tiempo|business-time:Jornada|map:Mapa|map-location-dot:Ubicaciones|location-dot:Dirección|globe:Global|earth-americas:Región|route:Rutas|building:Empresa|industry:Planta|city:Sucursales',
    'Acciones': 'plus:Agregar|pen:Editar|pen-to-square:Modificar|trash:Eliminar|check:Confirmar|circle-check:Aprobado|xmark:Cancelar|circle-xmark:Rechazado|triangle-exclamation:Alerta|circle-info:Información|circle-question:Ayuda|right-from-bracket:Salir',
    // ---- Añadidos para el administrador de archivos (tipos de fichero, medios, enlaces) ----
    'Archivos': 'file-word:Word|file-excel:Excel|file-powerpoint:PowerPoint|file-pdf:PDF|file-csv:CSV|file-zipper:Comprimido|file-image:Imagen|file-audio:Audio|file-video:Video|file-code:Código|file-lines:Texto|file-arrow-down:Descarga|file-arrow-up:Subida|file-circle-check:Aprobado|file-signature:Firmado|file-contract:Contrato|file-shield:Protegido|link:Enlace|arrow-up-right-from-square:Abrir fuera|folder-plus:Nueva carpeta|box-archive:Archivado|copy:Copiar|paste:Pegar',
    'Multimedia': 'play:Reproducir|circle-play:Ver video|pause:Pausa|stop:Detener|film:Película|clapperboard:Grabación|video:Cámara de video|photo-film:Galería|images:Imágenes|music:Música|headphones:Auriculares|microphone:Micrófono|volume-high:Volumen|compact-disc:Disco|radio:Radio|podcast:Podcast|tv:Televisión|camera:Cámara|circle-dot:En vivo|closed-captioning:Subtítulos',
    'Redes y video': 'youtube:YouTube|vimeo:Vimeo|twitch:Twitch|tiktok:TikTok|facebook:Facebook|instagram:Instagram|x-twitter:X (Twitter)|linkedin:LinkedIn|whatsapp:WhatsApp|telegram:Telegram|facebook-messenger:Messenger|discord:Discord|snapchat:Snapchat|pinterest:Pinterest|reddit:Reddit|threads:Threads|spotify:Spotify|soundcloud:SoundCloud|skype:Skype|viber:Viber',
    'Marcas y apps': 'google:Google|google-drive:Google Drive|google-play:Google Play|microsoft:Microsoft|windows:Windows|apple:Apple|app-store-ios:App Store|android:Android|dropbox:Dropbox|slack:Slack|trello:Trello|jira:Jira|figma:Figma|wordpress:WordPress|shopify:Shopify|paypal:PayPal|stripe:Stripe|cc-visa:Visa|cc-mastercard:Mastercard|amazon:Amazon|ebay:eBay|uber:Uber|waze:Waze|airbnb:Airbnb|chrome:Chrome|firefox-browser:Firefox|edge:Edge|safari:Safari',
    'Tecnología (marcas)': 'github:GitHub|gitlab:GitLab|bitbucket:Bitbucket|git-alt:Git|docker:Docker|aws:AWS|linux:Linux|ubuntu:Ubuntu|php:PHP|laravel:Laravel|angular:Angular|js:JavaScript|node-js:Node.js|npm:npm|python:Python|java:Java|html5:HTML|css3-alt:CSS|sass:Sass|bootstrap:Bootstrap|stack-overflow:Stack Overflow|bluetooth:Bluetooth|usb:USB',
    'Tecnología': 'laptop:Portátil|desktop:Escritorio|mobile-screen-button:Móvil|tablet-screen-button:Tableta|keyboard:Teclado|computer-mouse:Ratón|microchip:Chip|robot:Robot|wifi:Wi-Fi|satellite-dish:Antena|network-wired:Red|ethernet:Ethernet|print:Impresora|gamepad:Juegos|puzzle-piece:Complemento|memory:Memoria|sd-card:Tarjeta SD|battery-full:Batería|qrcode:QR',
    'Negocio y otros': 'briefcase:Maletín|handshake:Acuerdo|building-columns:Institución|graduation-cap:Formación|school:Escuela|chalkboard-user:Capacitación|hospital:Hospital|stethoscope:Salud|award:Reconocimiento|trophy:Trofeo|medal:Medalla|certificate:Certificado|gift:Regalo|ticket:Ticket|utensils:Restaurante|mug-hot:Café|car:Vehículo|plane:Viaje|ship:Barco|bicycle:Bicicleta|tree:Ambiente|seedling:Crecimiento|sun:Día|moon:Noche|bolt:Energía|fire:Urgente|droplet:Agua|leaf:Ecología|recycle:Reciclaje|paw:Mascotas|hammer:Obra|helmet-safety:Seguridad industrial',
  };

  public readonly catalogoIconos: { clase: string; nombre: string; grupo: string }[] =
    Object.keys(this.ICONOS_POR_GRUPO).reduce((acc, grupo) => {
      const estilo = this.GRUPOS_DE_MARCAS.includes(grupo) ? 'fa-brands' : 'fa-solid';
      this.ICONOS_POR_GRUPO[grupo].split('|').forEach(par => {
        const [icono, nombre] = par.split(':');
        acc.push({ clase: `${estilo} fa-${icono}`, nombre, grupo });
      });
      return acc;
    }, [] as { clase: string; nombre: string; grupo: string }[]);

  public filtroIcono = '';
  public grupoIcono = 'Todos';

  constructor(public modal: NgbActiveModal) {}

  public get gruposIconos(): string[] {
    return ['Todos', ...Object.keys(this.ICONOS_POR_GRUPO)];
  }

  public get iconosFiltrados(): { clase: string; nombre: string; grupo: string }[] {
    const texto = (this.filtroIcono || '').trim().toLowerCase();
    return this.catalogoIconos.filter(i =>
      (this.grupoIcono === 'Todos' || i.grupo === this.grupoIcono) &&
      (!texto || i.nombre.toLowerCase().includes(texto) || i.clase.toLowerCase().includes(texto))
    );
  }

  /** Total del catálogo, para el resumen de la cabecera. */
  public get totalIconos(): number {
    return this.catalogoIconos.length;
  }

  public seleccionar(clase: string): void {
    this.seleccionado.emit(clase);
    this.modal.close(clase);
  }

  public limpiarBusqueda(): void {
    this.filtroIcono = '';
    this.grupoIcono = 'Todos';
  }
}
