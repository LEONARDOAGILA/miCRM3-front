/**
 * Dibuja códigos de barras como SVG.
 *
 * @zxing/library —la que lee— sólo trae escritores de códigos en dos
 * dimensiones (QR, DataMatrix, Aztec); para los de barras de toda la vida no
 * hay nada, y en vez de añadir otra dependencia al proyecto se generan aquí.
 *
 * Dos formatos, que cubren lo que se usa:
 *   · EAN-13, el de los productos de tienda (13 cifras, la última de control)
 *   · Code 39, que admite letras y es el habitual en números de serie
 *
 * Son los mismos que el lector acepta, así que lo dibujado aquí se lee allí.
 */

// ---------------------------------------------------------------------------
// EAN-13
// ---------------------------------------------------------------------------

/** Cada cifra son 7 módulos; hay tres alfabetos y el de la izquierda alterna. */
const EAN_L = ['0001101', '0011001', '0010011', '0111101', '0100011',
               '0110001', '0101111', '0111011', '0110111', '0001011'];
const EAN_G = ['0100111', '0110011', '0011011', '0100001', '0011101',
               '0111001', '0000101', '0010001', '0001001', '0010111'];
const EAN_R = ['1110010', '1100110', '1101100', '1000010', '1011100',
               '1001110', '1010000', '1000100', '1001000', '1110100'];

/**
 * La primera cifra no se dibuja: se codifica en el orden en que se alternan
 * los alfabetos L y G de las seis siguientes. Por eso caben 13 cifras en un
 * símbolo que sólo tiene sitio para 12.
 */
const EAN_PARIDAD = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG',
                     'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

/** La cifra de control de un EAN-13: impares por 1, pares por 3. */
export function digitoControlEan13(doceCifras: string): number {
  let suma = 0;
  for (let i = 0; i < 12; i++) {
    suma += Number(doceCifras[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return (10 - (suma % 10)) % 10;
}

/** ¿Trece cifras y la última cuadra? Si no, ningún lector lo aceptará. */
export function esEan13Valido(codigo: string): boolean {
  const c = (codigo ?? '').trim();
  return /^\d{13}$/.test(c) && digitoControlEan13(c.slice(0, 12)) === Number(c[12]);
}

/** Los unos y ceros de un EAN-13, de izquierda a derecha. */
function modulosEan13(codigo: string): string {
  const paridad = EAN_PARIDAD[Number(codigo[0])];

  let izquierda = '';
  for (let i = 1; i <= 6; i++) {
    const cifra = Number(codigo[i]);
    izquierda += paridad[i - 1] === 'L' ? EAN_L[cifra] : EAN_G[cifra];
  }

  let derecha = '';
  for (let i = 7; i <= 12; i++) {
    derecha += EAN_R[Number(codigo[i])];
  }

  // guarda + izquierda + separador central + derecha + guarda
  return '101' + izquierda + '01010' + derecha + '101';
}

// ---------------------------------------------------------------------------
// Code 39
// ---------------------------------------------------------------------------

/**
 * Cada carácter son 9 elementos que alternan barra y espacio, empezando por
 * barra: seis estrechos (n) y tres anchos (w). Se guardan como anchos y no
 * como unos y ceros porque es la forma en que está publicada la norma, y
 * copiar cadenas de quince dígitos a mano sale mal.
 */
const CODE39_ANCHOS: Record<string, string> = {
  '0': 'nnnwwnwnn', '1': 'wnnwnnnnw', '2': 'nnwwnnnnw', '3': 'wnwwnnnnn',
  '4': 'nnnwwnnnw', '5': 'wnnwwnnnn', '6': 'nnwwwnnnn', '7': 'nnnwnnwnw',
  '8': 'wnnwnnwnn', '9': 'nnwwnnwnn', 'A': 'wnnnnwnnw', 'B': 'nnwnnwnnw',
  'C': 'wnwnnwnnn', 'D': 'nnnnwwnnw', 'E': 'wnnnwwnnn', 'F': 'nnwnwwnnn',
  'G': 'nnnnnwwnw', 'H': 'wnnnnwwnn', 'I': 'nnwnnwwnn', 'J': 'nnnnwwwnn',
  'K': 'wnnnnnnww', 'L': 'nnwnnnnww', 'M': 'wnwnnnnwn', 'N': 'nnnnwnnww',
  'O': 'wnnnwnnwn', 'P': 'nnwnwnnwn', 'Q': 'nnnnnnwww', 'R': 'wnnnnnwwn',
  'S': 'nnwnnnwwn', 'T': 'nnnnwnwwn', 'U': 'wwnnnnnnw', 'V': 'nwwnnnnnw',
  'W': 'wwwnnnnnn', 'X': 'nwnnwnnnw', 'Y': 'wwnnwnnnn', 'Z': 'nwwnwnnnn',
  '-': 'nwnnnnwnw', '.': 'wwnnnnwnn', ' ': 'nwwnnnwnn', '$': 'nwnwnwnnn',
  '/': 'nwnwnnnwn', '+': 'nwnnnwnwn', '%': 'nnnwnwnwn', '*': 'nwnnwnwnn',
};

/** De los anchos a los módulos: el ancho vale 3, el estrecho 1. */
function modulosDeCaracter(anchos: string): string {
  let salida = '';
  for (let i = 0; i < anchos.length; i++) {
    // Se empieza por barra y se va alternando
    const tinta = i % 2 === 0 ? '1' : '0';
    salida += tinta.repeat(anchos[i] === 'w' ? 3 : 1);
  }
  return salida;
}

const CODE39: Record<string, string> = Object.fromEntries(
  Object.entries(CODE39_ANCHOS).map(([c, anchos]) => [c, modulosDeCaracter(anchos)]),
);

/** Lo que Code 39 sabe escribir; el resto no se puede representar. */
export function admiteCode39(texto: string): boolean {
  const t = (texto ?? '').toUpperCase();
  return t.length > 0 && [...t].every(c => c !== '*' && CODE39[c] !== undefined);
}

function modulosCode39(texto: string): string {
  // El asterisco abre y cierra; no forma parte del contenido
  const completo = '*' + texto.toUpperCase() + '*';
  // Un módulo de papel separa un carácter del siguiente
  return [...completo].map(c => CODE39[c]).join('0');
}

// ---------------------------------------------------------------------------
// El dibujo
// ---------------------------------------------------------------------------

export interface OpcionesCodigo {
  /** Ancho de cada módulo en píxeles; 2 se lee bien en pantalla. */
  modulo?: number;
  /** Alto de las barras. */
  alto?: number;
  /** Escribe el código debajo, como en las etiquetas de verdad. */
  conTexto?: boolean;
}

/**
 * El SVG de un código de barras.
 *
 * Devuelve null si el contenido no se puede representar en ese formato —un
 * EAN-13 con la cifra de control mal, por ejemplo—, en vez de dibujar algo
 * que luego ningún lector reconoce.
 */
export function svgCodigoDeBarras(
  codigo: string,
  formato: 'EAN_13' | 'CODE_39',
  opciones: OpcionesCodigo = {},
): string | null {
  const texto = (codigo ?? '').trim();
  const modulo = opciones.modulo ?? 2;
  const alto = opciones.alto ?? 60;
  const conTexto = opciones.conTexto !== false;

  let barras: string;
  if (formato === 'EAN_13') {
    if (!esEan13Valido(texto)) { return null; }
    barras = modulosEan13(texto);
  } else {
    if (!admiteCode39(texto)) { return null; }
    barras = modulosCode39(texto);
  }

  // Sin margen blanco a los lados, el lector no encuentra dónde empieza
  const margen = 10 * modulo;
  const altoTexto = conTexto ? 14 : 0;
  const ancho = barras.length * modulo + margen * 2;
  const altoTotal = alto + altoTexto + 6;

  // Las barras seguidas se juntan en un solo rectángulo: menos nodos y se ve igual
  const trozos: string[] = [];
  let i = 0;
  while (i < barras.length) {
    if (barras[i] === '1') {
      let j = i;
      while (j < barras.length && barras[j] === '1') { j++; }
      trozos.push(`<rect x="${margen + i * modulo}" y="0" width="${(j - i) * modulo}" height="${alto}" />`);
      i = j;
    } else {
      i++;
    }
  }

  const etiqueta = conTexto
    ? `<text x="${ancho / 2}" y="${alto + altoTexto}" text-anchor="middle"
             font-family="monospace" font-size="${altoTexto}" fill="#000"
             letter-spacing="1">${texto.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ancho} ${altoTotal}" width="${ancho}" height="${altoTotal}" role="img" aria-label="Código ${texto}">
  <rect width="${ancho}" height="${altoTotal}" fill="#fff" />
  <g fill="#000" transform="translate(0,3)">${trozos.join('')}</g>
  ${etiqueta}
</svg>`;
}
