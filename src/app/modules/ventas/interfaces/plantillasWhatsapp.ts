/**
 * Lo que hace falta para escribirle a un cliente por WhatsApp: rellenar los
 * huecos de un mensaje, armar el enlace y decidir qué número puede tener
 * WhatsApp.
 *
 * El enlace admite el texto ya escrito (?text=), así que el vendedor elige de
 * qué va el mensaje y el chat se abre con todo puesto: no hay que teclear lo
 * mismo cincuenta veces al día ni copiar y pegar.
 *
 * Los huecos entre llaves los rellena la pantalla:
 *   {cliente}   nombre completo o razón social
 *   {nombre}    sólo el primer nombre, para tutear sin sonar a circular
 *   {vendedor}  quien está usando el CRM
 *   {empresa}   la nuestra
 *
 * LOS MENSAJES YA NO ESTÁN AQUÍ. Estaban, y este archivo decía que «si algún
 * día hay que editarlos desde la pantalla, se mueven a una tabla sin tocar lo
 * demás». Eso es lo que se hizo: viven en ventas.whatsapp_plantillas y se
 * mantienen desde Ventas > Respuestas de WhatsApp
 * (ver interfaces/whatsappPlantillaModel.ts). Aquí se queda lo que sigue
 * siendo código, que es lo de abajo.
 */

import { lanzarProtocolo } from '../../../service/lanzarProtocolo';

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

/**
 * Abre la conversación. Úsese esto y no window.open a pelo.
 *
 * Los dos enlaces no se abren igual, y ésa es toda la razón de que esta
 * función exista:
 *
 *   · `https://wa.me/…` es una página: va en una pestaña nueva, como
 *     cualquier enlace externo.
 *   · `whatsapp://send?…` NO es una página, es una orden para el sistema, y
 *     lanzarla tiene sus trampas: window.open deja una pestaña en blanco con
 *     la dirección cruda a la vista, y location.href saca el cartel de
 *     «¿salir de esta página?». Las dos las sortea lanzarProtocolo(), que
 *     está documentado en su archivo.
 *
 * Devuelve qué pasó, para que quien llame avise sólo cuando hay algo que
 * avisar: del protocolo no se puede saber si hubo quien lo atendiera, pero
 * de la pestaña sí se sabe si el navegador la bloqueó.
 */
export function abrirWhatsapp(numero?: string | null, texto?: string | null): 'ok' | 'bloqueado' | 'sin-numero' {
  const enlace = enlaceDeWhatsapp(numero, texto);
  if (!enlace) { return 'sin-numero'; }

  if (enlace.startsWith('whatsapp://')) {
    lanzarProtocolo(enlace);
    return 'ok';
  }

  return window.open(enlace, '_blank', 'noopener') ? 'ok' : 'bloqueado';
}
