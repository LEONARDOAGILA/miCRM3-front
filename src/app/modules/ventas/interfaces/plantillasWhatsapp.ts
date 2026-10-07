/**
 * Lo que hace falta para escribirle a un cliente por WhatsApp: rellenar los
 * huecos de un mensaje, armar el enlace y decidir qué número puede tener
 * WhatsApp.
 *
 * El enlace admite el texto ya escrito (?text=), así que el vendedor elige de
 * qué va el mensaje y el chat se abre con todo puesto: no hay que teclear lo
 * mismo cincuenta veces al día ni copiar y pegar.
 *
 * Los huecos entre llaves —{cliente}, {telefono}…— y la sustitución viven
 * en huecosPlantilla.ts: los usan también las notas y los correos, y aquí
 * dentro quedaban escondidos.
 *
 * LOS MENSAJES YA NO ESTÁN AQUÍ. Estaban escritos a mano en este archivo;
 * ahora son un campo del asunto del catálogo (ventas.gestiones_asuntos.mensaje)
 * y se mantienen desde Ventas > Catálogo de gestiones, en el bocadillo de cada
 * asunto. Aquí se queda lo que sigue siendo código, que es lo de abajo.
 */

import { lanzarProtocolo } from '../../../service/lanzarProtocolo';

/**
 * El mismo mensaje, pero sin formato.
 *
 * Los asuntos de correo guardan HTML, y hay sitios donde ese HTML no pinta
 * nada: «Qué se habló» es el historial de la gestión, un campo de texto, y
 * unas etiquetas <p> ahí sólo se leerían como basura. Se convierte lo que
 * separa párrafos en saltos de línea y se tira el resto.
 *
 * No es un saneador de seguridad: para eso está no meter HTML ajeno en el
 * DOM. Esto sólo quita el formato de algo que nosotros mismos escribimos.
 */
export function soloTexto(html?: string | null): string {
  const bruto = (html ?? '').trim();
  if (!bruto) { return ''; }
  if (!/<[a-z!/]/i.test(bruto)) { return bruto; }

  return bruto
    // Lo que en la pantalla se ve como un salto, salto se queda
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*\/\s*(p|div|li|tr|h[1-6])\s*>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    // Las entidades más comunes; el resto se queda como está, que inventar un
    // decodificador entero para esto sobra
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Al revés: texto llano envuelto para un editor de HTML.
 *
 * Sin esto, un mensaje de WhatsApp con dos párrafos entra en el editor de
 * «Qué se habló» como un churro seguido: el HTML no sabe de saltos de línea,
 * y los que traía el texto se los come el navegador.
 *
 * Lo que ya viene con etiquetas se devuelve tal cual: es lo que pasa con el
 * mensaje de un asunto de correo, que ya es HTML.
 */
export function comoHtml(texto?: string | null): string {
  const bruto = (texto ?? '').trim();
  if (!bruto) { return ''; }
  if (/<[a-z!/]/i.test(bruto)) { return bruto; }

  return bruto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .split(/\n{2,}/)
    .map(p => '<p>' + p.replace(/\n/g, '<br>') + '</p>')
    .join('');
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
