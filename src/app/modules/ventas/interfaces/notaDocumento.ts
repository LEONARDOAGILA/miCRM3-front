import { ColorNota, nombreDeColor } from './notaCliente';

/**
 * Una nota convertida en documento: para el papel y para Word.
 *
 * Vive aquí y no dentro de un componente porque lo necesitan los dos: el visor
 * (que imprime la nota guardada) y el editor (que imprime lo que se está
 * escribiendo, sin guardar). Tenerlo en un sitio evita que la hoja impresa y la
 * exportada se vayan pareciendo cada vez menos según quién toque cuál.
 *
 * La misma hoja sirve para las dos salidas: lo que se ve en la vista previa de
 * impresión es lo que sale en el .docx, salvo lo que Word decida reinterpretar.
 */

export interface DatosDocumentoNota {
  titulo?: string | null;
  /** El HTML de la nota, ya saneado por el servidor. */
  contenido?: string | null;
  color?: ColorNota | null;
  autor?: string | null;
  fecha?: string | null;
  cliente?: string | null;
  /**
   * Lo que va arriba a la izquierda del membrete.
   *
   * Sin esto, la etiqueta de color de la nota. Lo usa quien imprime algo que
   * no es una nota —el mensaje de un asunto, por ejemplo— y ahí «Sin
   * etiqueta» no significaría nada.
   */
  rotulo?: string | null;
}

/** Que un título con «<» no rompa el documento que se escribe. */
export function escaparHtml(texto?: string | null): string {
  return String(texto ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** El membrete de abajo: quién, cuándo y de qué cliente. */
function pieDe(d: DatosDocumentoNota): string {
  return [
    escaparHtml(d.autor),
    escaparHtml(d.fecha),
    d.cliente ? 'Cliente: ' + escaparHtml(d.cliente) : '',
  ].filter(Boolean).join(' · ');
}

/**
 * La hoja, sola, con lo justo para que salga bien en papel.
 *
 * Todo en puntos y milímetros, que son las unidades del papel; los píxeles aquí
 * no significan nada.
 */
export function documentoNota(d: DatosDocumentoNota): string {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>${escaparHtml(d.titulo)}</title>
<style>
  @page { margin: 18mm 16mm; }
  body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
         font-size: 11.5pt; line-height: 1.6; color: #212529; }
  .cab { display: flex; justify-content: space-between; align-items: baseline;
         padding-bottom: 6pt; margin-bottom: 14pt; border-bottom: 1px solid #ccc;
         font-size: 8.5pt; color: #666; }
  /* El título del documento lleva clase propia: dentro de la nota ya se puede
     poner un h1, y sin distinguirlos los dos saldrían iguales y no se sabría
     dónde acaba el encabezado y empieza el texto */
  .doc-titulo { margin: 0 0 12pt; font-size: 17pt; line-height: 1.25; }
  p, ul, ol { margin: 0 0 9pt; }
  ul, ol { padding-left: 16pt; }
  ul { list-style: disc outside; } ol { list-style: decimal outside; }
  h1, h2, h3, h4, h5, h6 { margin: 12pt 0 5pt; line-height: 1.3; }
  h1 { font-size: 14pt; } h2 { font-size: 13pt; } h3 { font-size: 12.5pt; }
  h4 { font-size: 12pt; } h5 { font-size: 11.5pt; }
  h6 { font-size: 11pt; color: #555; text-transform: uppercase; letter-spacing: .02em; }
  blockquote { margin: 9pt 0; padding-left: 10pt; border-left: 2pt solid #ddd; color: #666; }
  /* Que una imagen no se parta entre dos hojas */
  img { max-width: 100%; height: auto; margin: 9pt 0; page-break-inside: avoid; }
  pre, code { font-size: 9.5pt; background: #f5f5f5; }
  pre { padding: 6pt; white-space: pre-wrap; }
  /* Tablas: que la cabecera se repita si la tabla parte en dos hojas */
  table { width: 100%; margin: 9pt 0; border-collapse: collapse; table-layout: fixed; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  td, th { padding: 4pt 5pt; border: 0.5pt solid #999; vertical-align: top; }
  th { background: #f0f0f0; font-weight: 700; text-align: left; }
  td > p, th > p { margin: 0; }
</style></head><body>
  <div class="cab"><span>${escaparHtml(d.rotulo ?? nombreDeColor(d.color))}</span><span>${pieDe(d)}</span></div>
  <h1 class="doc-titulo">${escaparHtml(d.titulo)}</h1>
  ${d.contenido ?? ''}
</body></html>`;
}

/**
 * Imprime la nota en una ventana aparte.
 *
 * En una ventana con sólo la hoja, no con un @media print sobre la pantalla:
 * detrás hay un modal encima de la ficha del cliente encima de la grilla, y
 * esconder todo eso con css es una lista de excepciones que se rompe en cuanto
 * alguien toca una pantalla. Con el documento aparte, lo que se ve en la vista
 * previa es exactamente lo que va al papel, y el «Guardar como PDF» del
 * navegador da el PDF sin añadir nada al proyecto.
 *
 * Se espera a que cargue antes de llamar a imprimir: si no, las imágenes salen
 * en blanco porque el diálogo se abre antes de que lleguen.
 *
 * Devuelve false si el navegador bloqueó la ventana emergente, para que quien
 * llame avise con su propio toast.
 */
export function imprimirNota(d: DatosDocumentoNota): boolean {
  const ventana = window.open('', '_blank', 'width=920,height=1000');
  if (!ventana) { return false; }

  ventana.document.write(documentoNota(d));
  ventana.document.close();

  const alCargar = () => { ventana.focus(); ventana.print(); };
  if (ventana.document.readyState === 'complete') { alCargar(); }
  else { ventana.onload = alCargar; }

  return true;
}

// ================================================================
// EXPORTAR A WORD
// ================================================================

/** Un título convertido en nombre de fichero que Windows acepte. */
export function nombreDeFichero(titulo?: string | null, extension = 'docx'): string {
  const limpio = String(titulo ?? 'nota')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // sin tildes
    .replace(/[^a-zA-Z0-9 _-]/g, ' ')                   // sin lo que Windows prohíbe
    .replace(/\s+/g, ' ').trim().slice(0, 60);
  return (limpio || 'nota') + '.' + extension;
}

/**
 * Cambia las imágenes del servidor por su contenido, en base64.
 *
 * Hace falta para Word: el .docx tiene que llevar las fotos dentro, porque se
 * abre en un computador que a lo mejor no tiene acceso al CRM —que es
 * justamente para lo que uno exporta a Word—. Si una no se puede traer se
 * quita, antes que dejar un recuadro roto en el documento.
 */
async function incrustarImagenes(html: string): Promise<{ html: string; perdidas: number }> {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const imagenes = Array.from(doc.querySelectorAll('img'));
  let perdidas = 0;

  for (const img of imagenes) {
    const src = img.getAttribute('src') ?? '';
    if (!src || src.startsWith('data:')) { continue; }

    try {
      const res = await fetch(src, { credentials: 'omit' });
      if (!res.ok) { throw new Error(String(res.status)); }
      const blob = await res.blob();
      img.setAttribute('src', await aBase64(blob));
    } catch {
      img.remove();
      perdidas++;
    }
  }

  return { html: '<!doctype html><html><head><meta charset="utf-8"></head><body>'
    + doc.body.innerHTML + '</body></html>', perdidas };
}

function aBase64(blob: Blob): Promise<string> {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onload = () => resolver(String(lector.result));
    lector.onerror = () => rechazar(lector.error);
    lector.readAsDataURL(blob);
  });
}

/**
 * Le da a la librería los dos globales de Node que da por supuestos.
 *
 * El bundle de @turbodocx/html-to-docx es «de navegador», pero por dentro sigue
 * usando `global` y `Buffer`, que en un navegador no existen:
 *
 *   · sin `global` revienta nada más pedirle el documento;
 *   · sin `Buffer` revienta SÓLO si la nota lleva alguna imagen, que es donde
 *     los usa —y por eso una nota de puro texto se exportaba bien y una con
 *     una foto no—.
 *
 * Van aquí y no en los polyfills de toda la aplicación por dos razones: el
 * apaño se queda al lado de lo que lo necesita, y `Buffer` sólo se descarga
 * cuando alguien exporta, en vez de viajar en el arranque de un teléfono.
 *
 * `buffer` está declarado en package.json a propósito aunque alguna otra
 * dependencia ya lo arrastre: lo que entra de prestado se va sin avisar en el
 * siguiente npm install.
 */
async function prepararEntornoDeNode(): Promise<void> {
  const w = window as any;

  if (typeof w.global === 'undefined') { w.global = w; }

  if (typeof w.Buffer === 'undefined') {
    const { Buffer } = await import('buffer');
    w.Buffer = Buffer;
  }
}

/**
 * Baja la nota como documento de Word.
 *
 * La librería se carga con import() y no arriba del todo a propósito: son unos
 * cuantos cientos de kilobytes que no tienen por qué viajar al abrir la ficha
 * de un cliente en un teléfono. Sólo se descargan la primera vez que alguien
 * pulsa el botón.
 *
 * Devuelve cuántas imágenes se quedaron fuera, para poder avisar.
 */
export async function descargarNotaWord(d: DatosDocumentoNota): Promise<number> {
  const { html: cuerpo, perdidas } = await incrustarImagenes(documentoNota(d));

  await prepararEntornoDeNode();

  const modulo: any = await import('@turbodocx/html-to-docx');
  const aDocx = modulo.default ?? modulo;

  const salida = await aDocx(cuerpo, null, {
    title: d.titulo ?? 'Nota',
    creator: d.autor ?? 'miCRM',
    orientation: 'portrait',
    // En TWIP (1/20 de punto): los mismos márgenes que la hoja impresa
    margins: { top: 1020, right: 907, bottom: 1020, left: 907 },
    // Que una fila no se parta entre dos páginas, como en el papel
    table: { row: { cantSplit: true } },
  });

  const blob = salida instanceof Blob
    ? salida
    : new Blob([salida], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });

  bajarFichero(blob, nombreDeFichero(d.titulo));
  return perdidas;
}

/** El truco de siempre: un enlace que se pulsa solo y se tira. */
function bajarFichero(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Sin esto el blob se queda en memoria hasta recargar la página
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// ================================================================
// IMPORTAR DE WORD
// ================================================================

/**
 * Convierte un .docx en el HTML de una nota.
 *
 * Lo hace mammoth, que no copia el formato de Word tal cual sino que lo traduce
 * a etiquetas con sentido: lo que en Word es el estilo «Título 1» sale como
 * <h1>, no como un párrafo en negrita de 16 puntos. Eso es justo lo que
 * conviene aquí, porque la nota tiene su propia hoja de estilos y porque así el
 * texto se puede buscar y tabular después.
 *
 * Las imágenes vienen en base64 dentro del HTML; quien llame las sube al
 * servidor (el editor ya sabe hacerlo al pegar).
 */
export async function wordAHtml(fichero: File): Promise<{ html: string; avisos: string[] }> {
  const mammoth: any = await import('mammoth/mammoth.browser.js' as any);
  const lib = mammoth.default ?? mammoth;

  const buffer = await fichero.arrayBuffer();
  const res = await lib.convertToHtml({ arrayBuffer: buffer });

  return {
    html: res.value ?? '',
    avisos: (res.messages ?? []).map((m: any) => m.message ?? String(m)),
  };
}
