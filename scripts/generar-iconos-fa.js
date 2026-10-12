/**
 * Arma el catálogo de iconos que usa el selector (app-campoIcono).
 *
 * POR QUÉ UN FICHERO GENERADO Y NO LA METADATA TAL CUAL. Font Awesome trae su
 * catálogo en node_modules, pero son 4,9 MB de JSON con los SVG de cada icono
 * dentro: mandarle eso al navegador para enseñar una rejilla sería absurdo.
 * Aquí se queda lo justo para pintarlos y buscarlos.
 *
 * SE REGENERA A MANO, sólo al subir de versión Font Awesome:
 *
 *     npm run iconos
 *
 * y se sube el resultado al repositorio. No va en el build para que compilar
 * no dependa de que node_modules esté completo.
 *
 * FORMATO. Una lista de ternas, que ocupa la mitad que una lista de objetos
 * con las claves repetidas dos mil veces:
 *
 *     ["phone", "s", "call earphone receiver support telephone voice"]
 *       nombre   estilo   palabras por las que se encuentra
 *
 * El estilo es s (sólido), r (línea) o b (marca), que es lo que decide el
 * prefijo con el que se guarda: «fa-phone», «far fa-envelope», «fab fa-whatsapp».
 *
 * UN ICONO PUEDE SALIR DOS VECES: «envelope» existe en sólido y en línea, y se
 * ven distintos, así que son dos opciones que elegir y no una.
 */
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const META = path.join(RAIZ, 'node_modules', '@fortawesome', 'fontawesome-free', 'metadata', 'icon-families.json');
const PAQUETE = path.join(RAIZ, 'node_modules', '@fortawesome', 'fontawesome-free', 'package.json');
const SALIDA = path.join(RAIZ, 'src', 'assets', 'iconos-fa.json');

if (!fs.existsSync(META)) {
  console.error('No está la metadata de Font Awesome. ¿Falta npm install --force?');
  process.exit(1);
}

const version = JSON.parse(fs.readFileSync(PAQUETE, 'utf8')).version;
const meta = JSON.parse(fs.readFileSync(META, 'utf8'));

const LETRA = { solid: 's', regular: 'r', brands: 'b' };

const iconos = [];
for (const [nombre, datos] of Object.entries(meta)) {
  const libres = (datos.familyStylesByLicense && datos.familyStylesByLicense.free) || [];

  // Sólo la familia clásica: las demás (sharp, duotone…) son de pago y sus
  // clases no existen en el CSS que trae el proyecto.
  const estilos = [...new Set(
    libres.filter(f => f.family === 'classic').map(f => LETRA[f.style]).filter(Boolean)
  )];
  if (!estilos.length) { continue; }

  // Las palabras del propio nombre ya se buscan aparte: aquí sólo lo que
  // añade algo. Así «phone» no repite «phone» y el fichero adelgaza.
  const delNombre = new Set(nombre.split('-'));
  const terminos = [...new Set(
    ((datos.search && datos.search.terms) || [])
      .map(t => String(t).toLowerCase())
      .flatMap(t => t.split(/\s+/))
      .filter(t => t.length > 1 && !delNombre.has(t))
  )].sort().join(' ');

  for (const e of estilos) { iconos.push([nombre, e, terminos]); }
}

// Por nombre, que es como se ven en la rejilla
iconos.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));

const salida = {
  _comentario: 'Generado por scripts/generar-iconos-fa.js — no editar a mano. Se rehace con: npm run iconos',
  fa: version,
  generado: new Date().toISOString().slice(0, 10),
  iconos,
};

fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
fs.writeFileSync(SALIDA, JSON.stringify(salida));

const kb = Math.round(fs.statSync(SALIDA).size / 1024);
const porEstilo = iconos.reduce((a, i) => ({ ...a, [i[1]]: (a[i[1]] || 0) + 1 }), {});
console.log(`Font Awesome ${version}: ${iconos.length} opciones (sólido ${porEstilo.s || 0}, línea ${porEstilo.r || 0}, marca ${porEstilo.b || 0})`);
console.log(`${path.relative(RAIZ, SALIDA)} — ${kb} KB`);
