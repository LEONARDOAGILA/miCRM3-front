/**
 * Lo que necesita el selector de iconos y no viene en la metadata de Font
 * Awesome: cómo se escribe cada icono en la base, y cómo encontrarlo
 * buscando en castellano.
 */

/** Un icono del catálogo, tal y como lo deja scripts/generar-iconos-fa.js. */
export interface IconoFa {
  /** El nombre de Font Awesome, sin prefijo: «phone», «person-walking». */
  nombre: string;
  /** s = sólido, r = línea, b = marca. */
  estilo: 's' | 'r' | 'b';
  /** Palabras por las que se encuentra, en inglés y tal cual las da FA. */
  terminos: string;
}

/**
 * Cómo se guarda un icono en la base.
 *
 * El formato NO es cosa de este componente: es el que ya entiende
 * `iconoDelTipo` y el que hay escrito en ventas.gestiones_tipos —«fa-phone»,
 * «fab fa-whatsapp»—. Los sólidos van sin familia porque quien los pinta
 * antepone «fa», que en Font Awesome 6 es la sólida.
 */
export function claseDeIcono(icono: IconoFa): string {
  if (icono.estilo === 'b') { return `fab fa-${icono.nombre}`; }
  if (icono.estilo === 'r') { return `far fa-${icono.nombre}`; }
  return `fa-${icono.nombre}`;
}

/** Lo que hay que ponerle a un <i> para verlo, incluida la familia. */
export function claseParaPintar(clase: string | null | undefined): string {
  const i = (clase ?? '').trim();
  if (!i) { return ''; }
  // Los de marca y los de línea traen su familia; el resto es sólida
  return i.startsWith('fa-') ? `fa ${i}` : i;
}

/** De lo guardado al icono del catálogo, para dejarlo marcado al abrir. */
export function partesDeIcono(clase: string | null | undefined): { nombre: string; estilo: 's' | 'r' | 'b' } | null {
  const i = (clase ?? '').trim();
  if (!i) { return null; }

  const trozos = i.split(/\s+/);
  const nombre = (trozos.find(t => t.startsWith('fa-') && t.length > 3) ?? '').slice(3);
  if (!nombre) { return null; }

  const estilo: 's' | 'r' | 'b' =
    trozos.includes('fab') || trozos.includes('fa-brands')  ? 'b' :
    trozos.includes('far') || trozos.includes('fa-regular') ? 'r' : 's';

  return { nombre, estilo };
}

/** Cómo se llama cada estilo en la pantalla. */
export const NOMBRE_ESTILO: { [k in 's' | 'r' | 'b']: string } = {
  s: 'Sólidos',
  r: 'Línea',
  b: 'Marcas',
};

/**
 * Los que valen para un tipo de gestión, de primeras.
 *
 * El catálogo tiene dos mil iconos y esta pantalla sirve para una cosa:
 * ponerle cara a «Llamada», «Correo», «Visita». Con estos a la vista, lo
 * normal se resuelve de un clic y sin escribir nada; el buscador queda para
 * lo demás.
 */
export const ICONOS_SUGERIDOS: { nombre: string; estilo: 's' | 'r' | 'b' }[] = [
  { nombre: 'phone',            estilo: 's' },
  { nombre: 'phone-volume',     estilo: 's' },
  { nombre: 'mobile-screen',    estilo: 's' },
  { nombre: 'whatsapp',         estilo: 'b' },
  { nombre: 'envelope',         estilo: 's' },
  { nombre: 'envelope-open-text', estilo: 's' },
  { nombre: 'comment-dots',     estilo: 's' },
  { nombre: 'comments',         estilo: 's' },
  { nombre: 'handshake',        estilo: 's' },
  { nombre: 'users',            estilo: 's' },
  { nombre: 'user-tie',         estilo: 's' },
  { nombre: 'person-walking',   estilo: 's' },
  { nombre: 'truck',            estilo: 's' },
  { nombre: 'calendar-check',   estilo: 's' },
  { nombre: 'clock',            estilo: 's' },
  { nombre: 'file-invoice-dollar', estilo: 's' },
  { nombre: 'file-contract',    estilo: 's' },
  { nombre: 'cart-shopping',    estilo: 's' },
  { nombre: 'money-bill',       estilo: 's' },
  { nombre: 'triangle-exclamation', estilo: 's' },
  { nombre: 'headset',          estilo: 's' },
  { nombre: 'wrench',           estilo: 's' },
  { nombre: 'star',             estilo: 's' },
  { nombre: 'thumbs-up',        estilo: 's' },
];

/**
 * Buscar en castellano.
 *
 * Los términos que trae Font Awesome son todos en inglés: escribir «teléfono»
 * no encontraba el teléfono. Esto no traduce el catálogo —serían dos mil
 * entradas—, sino las palabras con las que de verdad se busca aquí.
 *
 * Va sin tildes a propósito: la búsqueda las quita antes de mirar, así
 * «telefono» y «teléfono» llegan igual.
 */
export const SINONIMOS: { [es: string]: string } = {
  // Comunicación
  telefono: 'phone phone-volume', movil: 'mobile-screen-button mobile', celular: 'mobile-screen-button mobile',
  llamada: 'phone phone-volume', llamar: 'phone phone-volume', auricular: 'headset headphones',
  correo: 'envelope envelope-open-text', email: 'envelope at', mensaje: 'comment-dots envelope',
  chat: 'comments comment-dots', comentario: 'comment comment-dots',
  // Gente
  usuario: 'user', persona: 'user user-large', gente: 'users people-group',
  cliente: 'user-tie user', empleado: 'user-tie id-badge', equipo: 'users people-group',
  candidato: 'user-plus',
  reunion: 'handshake users people-group', junta: 'users people-group',
  visita: 'person-walking house-user door-open',
  // Sitios
  casa: 'house house-chimney', oficina: 'building', edificio: 'building',
  tienda: 'shop store', almacen: 'warehouse boxes-stacked', fabrica: 'industry',
  banco: 'building-columns', mapa: 'map map-location-dot',
  ubicacion: 'location-dot map-location-dot', direccion: 'location-dot map-pin',
  ruta: 'route road', coche: 'car', moto: 'motorcycle',
  // Tiempo
  cita: 'calendar-check calendar-day', agenda: 'calendar-days calendar',
  calendario: 'calendar-days calendar', fecha: 'calendar-day calendar',
  reloj: 'clock', hora: 'clock', pendiente: 'hourglass-half clock',
  vencido: 'clock triangle-exclamation',
  // Dinero y papeles
  dinero: 'money-bill dollar-sign coins', pago: 'credit-card money-bill',
  cobro: 'hand-holding-dollar money-bill', factura: 'file-invoice file-invoice-dollar receipt',
  recibo: 'receipt', contrato: 'file-contract file-signature',
  cotizacion: 'file-invoice-dollar calculator', descuento: 'tag percent',
  tarjeta: 'credit-card', carrito: 'cart-shopping', paquete: 'box', caja: 'box',
  camion: 'truck', entrega: 'truck truck-fast', envio: 'paper-plane truck-fast',
  documento: 'file-lines file', archivo: 'file folder', carpeta: 'folder',
  nota: 'note-sticky pen', escribir: 'pen pencil', firma: 'file-signature signature',
  imprimir: 'print', descargar: 'download', subir: 'upload',
  // Avisos y estados
  aviso: 'bell triangle-exclamation', alerta: 'bell triangle-exclamation',
  error: 'circle-xmark triangle-exclamation', problema: 'triangle-exclamation bug',
  reclamo: 'triangle-exclamation comment-dots thumbs-down',
  queja: 'comment-dots thumbs-down', correcto: 'circle-check check', hecho: 'check circle-check',
  listo: 'check circle-check',
  ayuda: 'circle-question headset life-ring', soporte: 'headset life-ring',
  estrella: 'star', favorito: 'star heart', megusta: 'thumbs-up',
  // Herramientas y sistema
  buscar: 'magnifying-glass', filtro: 'filter',
  grafico: 'chart-line chart-simple chart-pie', informe: 'chart-line file-lines',
  estadistica: 'chart-simple chart-line',
  candado: 'lock', llave: 'key', seguridad: 'shield-halved lock',
  configuracion: 'gear sliders', ajustes: 'gear sliders',
  basura: 'trash', borrar: 'trash xmark', editar: 'pen-to-square pen',
  herramienta: 'wrench screwdriver-wrench', servicio: 'wrench screwdriver-wrench gear',
  // Varios
  foto: 'image camera', camara: 'camera', video: 'video film',
  mundo: 'globe earth-americas', idioma: 'language globe', web: 'globe link',
  enlace: 'link', regalo: 'gift', fiesta: 'cake-candles', comida: 'utensils burger',
  salud: 'heart-pulse stethoscope', medico: 'user-doctor stethoscope',
};
