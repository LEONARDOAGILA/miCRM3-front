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
  // Font Awesome 6 (la librería que carga la app) con nombre en
  // español para poder buscarlos sin saberse la clase.
  // ============================================================
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
  };

  public readonly catalogoIconos: { clase: string; nombre: string; grupo: string }[] =
    Object.keys(this.ICONOS_POR_GRUPO).reduce((acc, grupo) => {
      this.ICONOS_POR_GRUPO[grupo].split('|').forEach(par => {
        const [icono, nombre] = par.split(':');
        acc.push({ clase: `fa-solid fa-${icono}`, nombre, grupo });
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
