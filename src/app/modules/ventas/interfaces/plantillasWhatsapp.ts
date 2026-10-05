/**
 * Mensajes de WhatsApp que se ofrecen al escribirle a un cliente.
 *
 * El enlace de WhatsApp admite el texto ya escrito (?text=), así que el
 * vendedor elige de qué va el mensaje y el chat se abre con todo puesto: no
 * hay que teclear lo mismo cincuenta veces al día ni copiar y pegar.
 *
 * Los huecos entre llaves los rellena la pantalla:
 *   {cliente}   nombre completo o razón social
 *   {nombre}    sólo el primer nombre, para tutear sin sonar a circular
 *   {vendedor}  quien está usando el CRM
 *   {empresa}   la nuestra
 *
 * Es un catálogo en código a propósito: son pocos y estables. Si algún día
 * hay que editarlos desde la pantalla, se mueven a una tabla sin tocar lo
 * demás, porque todo lo que los usa pasa por aquí.
 */
export interface PlantillaWhatsapp {
  id: string;
  /** Lo que se lee en el menú */
  nombre: string;
  icono: string;
  /** Lo que se escribe en la gestión que queda registrada */
  asunto: string;
  texto: string;
}

export const PLANTILLAS_WHATSAPP: PlantillaWhatsapp[] = [
  {
    id: 'saludo',
    nombre: 'Presentación',
    icono: 'fa-hand',
    asunto: 'Presentación por WhatsApp',
    texto: 'Hola {nombre}, le saluda {vendedor} de {empresa}. Le escribo para ponerme a sus órdenes; cualquier consulta que tenga, con gusto le ayudo.',
  },
  {
    id: 'seguimiento',
    nombre: 'Seguimiento',
    icono: 'fa-rotate-right',
    asunto: 'Seguimiento por WhatsApp',
    texto: 'Hola {nombre}, le saluda {vendedor} de {empresa}. Le escribo para dar seguimiento a lo que conversamos. ¿Cómo va el tema?',
  },
  {
    id: 'cotizacion',
    nombre: 'Envío de cotización',
    icono: 'fa-file-invoice-dollar',
    asunto: 'Envío de cotización por WhatsApp',
    texto: 'Hola {nombre}, le saluda {vendedor} de {empresa}. Le hago llegar la cotización que me solicitó. Quedo atento a sus comentarios.',
  },
  {
    id: 'pago',
    nombre: 'Recordatorio de pago',
    icono: 'fa-money-bill',
    asunto: 'Recordatorio de pago por WhatsApp',
    texto: 'Estimado/a {nombre}, le saluda {vendedor} de {empresa}. Le recuerdo con respeto que tiene un saldo pendiente con nosotros. ¿Me confirma cuándo podríamos coordinar el pago?',
  },
  {
    id: 'visita',
    nombre: 'Confirmar visita',
    icono: 'fa-person-walking',
    asunto: 'Confirmación de visita por WhatsApp',
    texto: 'Hola {nombre}, le saluda {vendedor} de {empresa}. Le escribo para confirmar nuestra visita. ¿Le queda bien la fecha y hora que acordamos?',
  },
  {
    id: 'gracias',
    nombre: 'Agradecimiento',
    icono: 'fa-heart',
    asunto: 'Agradecimiento por WhatsApp',
    texto: '{nombre}, gracias por su compra. Le saluda {vendedor} de {empresa}; cualquier cosa que necesite, quedo a sus órdenes.',
  },
];

/**
 * Rellena los huecos de una plantilla.
 *
 * Lo que no se sepa se deja en blanco y se limpian los espacios dobles que
 * quedan, para que no salga «Hola , le saluda».
 */
export function aplicarPlantilla(
  texto: string,
  datos: { cliente?: string | null; nombre?: string | null; vendedor?: string | null; empresa?: string | null },
): string {
  // Sin empresa configurada, el mensaje no la nombra: «le saluda Leonardo»
  // queda bien; «le saluda Leonardo de la empresa», no.
  const base = (datos.empresa ?? '').trim()
    ? texto
    : texto.replace(/\s*de \{empresa\}/g, '');

  return base
    .replace(/\{cliente\}/g, datos.cliente ?? '')
    .replace(/\{nombre\}/g, datos.nombre ?? datos.cliente ?? '')
    .replace(/\{vendedor\}/g, datos.vendedor ?? '')
    .replace(/\{empresa\}/g, datos.empresa ?? '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.])/g, '$1')
    .trim();
}

/**
 * El primer nombre, para que el saludo suene a persona.
 *
 * Con una empresa no hay «primer nombre» que valga: se devuelve la razón
 * social entera.
 */
export function primerNombre(nombreCompleto?: string | null, esEmpresa = false): string {
  const n = (nombreCompleto ?? '').trim();
  if (!n) { return ''; }
  if (esEmpresa) { return n; }
  return n.split(/\s+/)[0];
}

/**
 * «0991234567» → «593991234567», que es lo que pide WhatsApp.
 *
 * Devuelve '' si no hay nada que convertir, para que quien llame decida.
 */
export function numeroInternacional(numero?: string | null): string {
  const limpio = (numero ?? '').replace(/\D/g, '');
  if (!limpio) { return ''; }
  // Ecuador: el 0 inicial se cambia por el código de país
  return limpio.startsWith('0') ? '593' + limpio.substring(1) : limpio;
}

/**
 * ¿Ese número puede tener WhatsApp?
 *
 * En Ecuador los celulares son 09xxxxxxxx (y 5939xxxxxxxx escritos con el
 * código de país). A un fijo no se le ofrece el botón porque el enlace
 * saldría inservible: «4074589» no lleva el 0 que dispara el prefijo, así
 * que acabaría en wa.me/4074589, que no es nadie. Un número a medio
 * teclear tampoco pasa, que es lo que hay en la grilla de contactos
 * mientras se escribe.
 */
export function puedeTenerWhatsapp(numero?: string | null): boolean {
  const n = (numero ?? '').replace(/\D/g, '');
  return (n.startsWith('09') && n.length === 10) || (n.startsWith('593') && n.length === 12);
}

/**
 * El enlace que abre la conversación con ese número.
 *
 * «app» abre el WhatsApp instalado; «web» pasa por el navegador y deja que el
 * sistema decida. Se elige por navegador y vale para toda la aplicación:
 *
 *   localStorage.setItem('miCRM3.whatsapp', 'app');
 */
export function enlaceDeWhatsapp(numero?: string | null, texto?: string | null): string {
  const internacional = numeroInternacional(numero);
  if (!internacional) { return ''; }

  let destino: 'web' | 'app' = 'web';
  try { destino = localStorage.getItem('miCRM3.whatsapp') === 'app' ? 'app' : 'web'; } catch { /* sin storage */ }

  if (destino === 'app') {
    return `whatsapp://send?phone=${internacional}` + (texto ? '&text=' + encodeURIComponent(texto) : '');
  }
  return `https://wa.me/${internacional}` + (texto ? '?text=' + encodeURIComponent(texto) : '');
}
