/**
 * LEER UNA CONVERSACIÓN EXPORTADA DE WHATSAPP
 *
 * WhatsApp sabe sacar un chat entero a un .txt —«Exportar chat» > «Sin
 * archivos adjuntos»—, y eso es lo que se importa aquí. No se lee la ventana
 * de WhatsApp ni su base de datos: lo primero no se puede (Windows no expone
 * el texto de los mensajes, que vive dentro del WebView2 y sólo sale si un
 * lector de pantalla lo pide al arrancar) y lo segundo sería meterse en el
 * almacén cifrado de la aplicación, que se rompe en cada actualización.
 *
 * EL FORMATO NO ES UNO SOLO. WhatsApp escribe la cabecera de cada mensaje de
 * dos maneras según de dónde salga la exportación:
 *
 *   [6/10/2026, 21:14:03] Leonardo: Buenas tardes      (iPhone y versiones nuevas)
 *   6/10/26, 21:14 - Leonardo: Buenas tardes           (Android)
 *
 * y entre la hora y el «a. m.» mete a veces un espacio fino que no es el
 * espacio de siempre (U+202F / U+00A0). Las dos formas y los dos espacios se
 * contemplan aquí, porque el vendedor no tiene por qué saber cuál le tocó.
 *
 * LO QUE NO LLEVA CABECERA ES CONTINUACIÓN. Un mensaje de varias líneas sólo
 * trae fecha en la primera; las demás vienen sueltas. Pegarlas al anterior es
 * la diferencia entre leer la conversación y leer una lista de trozos.
 */

/**
 * El asunto bajo el que entran TODAS las importaciones.
 *
 * Siempre el mismo y no se pregunta: siempre es lo mismo —traer al historial lo
 * que ya se habló—. Preguntarlo sólo conseguía que cada importación acabara
 * bajo un asunto distinto («Cobranza», «Enviar cotización») y que después no
 * hubiera forma de contarlas ni de encontrarlas.
 *
 * Existe en el catálogo porque una gestión exige un asunto del catálogo; lo
 * crea la migración 2026-10-07_ventas_asunto_importacion_whatsapp.sql. Se busca
 * por el nombre porque los asuntos no tienen código, y por eso se compara sin
 * tildes ni mayúsculas: así sobrevive a que alguien lo reescriba a mano.
 */
export const ASUNTO_IMPORTACION = 'Importación de mensajes de WhatsApp';

/** ¿Es el asunto de las importaciones? Sin tildes ni mayúsculas. */
export function esAsuntoDeImportacion(nombre?: string | null): boolean {
  const limpiar = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  return limpiar(String(nombre ?? '')) === limpiar(ASUNTO_IMPORTACION);
}

/** Un mensaje ya leído del fichero. */
export interface MensajeImportado {
  /** 'AAAA-MM-DD HH:mm'; null si la línea no traía fecha legible */
  fecha: string | null;
  autor: string;
  texto: string;
  /**
   * Avisos de WhatsApp, no de una persona: el del cifrado de extremo a
   * extremo, los cambios de número, «se añadió al grupo». Se marcan para
   * poder dejarlos fuera: no son parte de lo que se habló.
   */
  sistema: boolean;
}

export interface ConversacionLeida {
  mensajes: MensajeImportado[];
  /** Quiénes escriben, por orden de aparición */
  autores: string[];
  /** 'AAAA-MM-DD HH:mm' del primero y del último con fecha */
  desde: string | null;
  hasta: string | null;
  /** Mensajes que eran una foto, un audio o un adjunto */
  multimedia: number;
  /** Avisos del sistema */
  avisos: number;
}

/** Los dos espacios finos que WhatsApp cuela antes del «a. m.». */
const ESPACIOS_RAROS = /[  ]/g;

/**
 * La cabecera de un mensaje, en sus dos formas.
 *
 * Grupos: 1 fecha, 2 hora, 3 autor. El autor puede llevar espacios y acentos,
 * y se corta en el primer «: » porque un mensaje puede contener dos puntos.
 */
const CABECERAS = [
  // [6/10/2026, 21:14:03] Leonardo: texto
  /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),\s*([\d:]{4,8}(?:\s*[ap]\.?\s*m\.?)?)\]\s*([^:]{1,80}):\s?([\s\S]*)$/i,
  // 6/10/26, 21:14 - Leonardo: texto
  /^(\d{1,2}\/\d{1,2}\/\d{2,4}),\s*([\d:]{4,8}(?:\s*[ap]\.?\s*m\.?)?)\s*-\s*([^:]{1,80}):\s?([\s\S]*)$/i,
];

/** Lo mismo pero sin autor: son los avisos de WhatsApp. */
const CABECERAS_AVISO = [
  /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),\s*([\d:]{4,8}(?:\s*[ap]\.?\s*m\.?)?)\]\s*([\s\S]*)$/i,
  /^(\d{1,2}\/\d{1,2}\/\d{2,4}),\s*([\d:]{4,8}(?:\s*[ap]\.?\s*m\.?)?)\s*-\s*([\s\S]*)$/i,
];

/** «6/10/2026» + «21:14» → «2026-10-06 21:14». Día primero, que es lo de aquí. */
function aFechaOrdenable(fecha: string, hora: string): string | null {
  const f = fecha.split('/').map(n => parseInt(n, 10));
  if (f.length !== 3 || f.some(isNaN)) { return null; }

  const [dia, mes] = f;
  let anio = f[2];
  if (anio < 100) { anio += 2000; }
  if (dia < 1 || dia > 31 || mes < 1 || mes > 12) { return null; }

  const t = hora.replace(ESPACIOS_RAROS, ' ').trim().toLowerCase();
  const p = t.match(/^(\d{1,2}):(\d{2})/);
  if (!p) { return null; }

  let h = parseInt(p[1], 10);
  const min = p[2];
  // 12 horas: «12:30 a. m.» es la medianoche y «12:30 p. m.» el mediodía
  if (/p\.?\s*m\.?/.test(t) && h < 12) { h += 12; }
  if (/a\.?\s*m\.?/.test(t) && h === 12) { h = 0; }

  const dd = (n: number) => String(n).padStart(2, '0');
  return `${anio}-${dd(mes)}-${dd(dia)} ${dd(h)}:${min}`;
}

/** ¿El texto es una foto, un audio o un adjunto que no se exportó? */
function esMultimedia(texto: string): boolean {
  return /<multimedia omitid[oa]>|\bomitid[oa]\b.*\b(imagen|audio|v[íi]deo|video|documento|sticker|gif)\b|\b(imagen|audio|v[íi]deo|video|documento|sticker|gif)\b.*\bomitid[oa]\b/i
    .test(texto);
}

/** ¿La línea es un aviso de WhatsApp y no algo que dijo alguien? */
function esAviso(texto: string): boolean {
  return /cifrad[oa]s? de extremo a extremo|end-to-end encrypted|cambi[óo] (de|su) n[úu]mero|se uni[óo] (al|usando)|cre[óo] (el|este) grupo|a[ñn]adi[óo] a|elimin[óo] a|sali[óo] del grupo|cambi[óo] el (asunto|icono)|son seguros\.?$/i
    .test(texto);
}

/**
 * Lee el .txt y devuelve los mensajes.
 *
 * Nunca falla: lo que no entiende se queda como continuación del mensaje
 * anterior, que es preferible a tirar texto o a parar la importación entera
 * por una línea rara en medio de mil.
 */
export function leerExportacion(contenido: string): ConversacionLeida {
  const mensajes: MensajeImportado[] = [];
  const autores: string[] = [];
  let multimedia = 0;
  let avisos = 0;

  // El carácter invisible que WhatsApp mete al principio de algunas líneas
  const lineas = (contenido ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/‎|‏|﻿/g, '')
    .split('\n');

  for (const cruda of lineas) {
    const linea = cruda.replace(ESPACIOS_RAROS, ' ');
    if (!linea.trim() && !mensajes.length) { continue; }

    let puesto = false;

    for (const re of CABECERAS) {
      const m = linea.match(re);
      if (!m) { continue; }

      const autor = m[3].trim();
      const texto = (m[4] ?? '').trim();
      const sistema = esAviso(texto);

      if (!sistema && autor && !autores.includes(autor)) { autores.push(autor); }
      if (esMultimedia(texto)) { multimedia++; }
      if (sistema) { avisos++; }

      mensajes.push({ fecha: aFechaOrdenable(m[1], m[2]), autor, texto, sistema });
      puesto = true;
      break;
    }
    if (puesto) { continue; }

    // Con fecha pero sin autor: aviso de WhatsApp
    for (const re of CABECERAS_AVISO) {
      const m = linea.match(re);
      if (!m) { continue; }
      avisos++;
      mensajes.push({ fecha: aFechaOrdenable(m[1], m[2]), autor: '', texto: (m[3] ?? '').trim(), sistema: true });
      puesto = true;
      break;
    }
    if (puesto) { continue; }

    // Sin cabecera: es la segunda línea del mensaje anterior
    const ultimo = mensajes[mensajes.length - 1];
    if (ultimo) { ultimo.texto = (ultimo.texto + '\n' + linea).trim(); }
  }

  const conFecha = mensajes.map(m => m.fecha).filter(Boolean) as string[];
  conFecha.sort();

  return {
    mensajes,
    autores,
    desde: conFecha[0] ?? null,
    hasta: conFecha[conFecha.length - 1] ?? null,
    multimedia,
    avisos,
  };
}

/** Que un mensaje con «<» no rompa el HTML que se guarda. */
function escapar(texto: string): string {
  return String(texto ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Los mensajes, como HTML para «Qué se habló».
 *
 * Un párrafo por mensaje, con la hora y el autor en negrita delante: es lo que
 * se lee igual en el editor, en la grilla del historial y en el papel. Las
 * líneas de dentro de un mensaje van con <br>, que es lo que las separa sin
 * convertir cada una en un mensaje aparte.
 *
 * El día se repite sólo cuando cambia, como en el propio WhatsApp: con la
 * fecha completa en cada línea no se distingue la conversación del ruido.
 */
export function comoHtmlConversacion(mensajes: MensajeImportado[], conAvisos = false): string {
  const partes: string[] = [];
  let diaAnterior = '';

  for (const m of mensajes) {
    if (m.sistema && !conAvisos) { continue; }

    const dia = (m.fecha ?? '').slice(0, 10);
    if (dia && dia !== diaAnterior) {
      diaAnterior = dia;
      partes.push(`<p><b>— ${escapar(dia)} —</b></p>`);
    }

    const hora = (m.fecha ?? '').slice(11, 16);
    const quien = m.autor ? escapar(m.autor) + ':' : '';
    const cabeza = [hora ? `[${hora}]` : '', quien].filter(Boolean).join(' ');
    const cuerpo = escapar(m.texto).replace(/\n/g, '<br>');

    partes.push(cabeza ? `<p><b>${cabeza}</b> ${cuerpo}</p>` : `<p>${cuerpo}</p>`);
  }

  return partes.join('');
}
