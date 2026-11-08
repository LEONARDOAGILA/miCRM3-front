/**
 * Trae al CRM el catálogo de iconos de la tienda.
 *
 * POR QUÉ UNA COPIA Y NO UN IMPORT. Son dos proyectos distintos —miCRM3-front
 * y miEcommerce— sin nada compartido entre ellos, así que no hay de dónde
 * importarlo. Y hace falta aquí: el pie de la tienda deja elegir el dibujo de
 * cada enlace, y un selector que sólo listara nombres («mazo», «apreton»)
 * obligaría a adivinar cuál es cuál.
 *
 * SE REHACE A MANO, cuando la tienda añada o cambie un icono:
 *
 *     npm run iconos:tienda
 *
 * y se sube el resultado al repositorio, como el de Font Awesome. Lo que pasa
 * si se olvida: el icono nuevo no sale en el selector (se puede escribir su
 * nombre igual) o se elige uno que la tienda ya no tiene y ahí no se pinta
 * nada. Ninguna de las dos avisa.
 *
 * EL FICHERO QUE SALE NO SE EDITA A MANO: el siguiente «npm run iconos:tienda»
 * se lleva por delante lo que se le haya escrito.
 */
const fs = require('fs');
const path = require('path');

// La tienda, al lado del CRM. Si alguien mueve una de las dos, esto lo dice.
const ORIGEN = path.resolve(__dirname,
  '../../miEcommerce/src/app/components/ui/icono/iconos.ts');
const DESTINO = path.resolve(__dirname,
  '../src/app/components/campos/campoIconoTienda/iconos-tienda.ts');

const CABECERA = `// ============================================================
// CATÁLOGO DE ICONOS DE LA TIENDA  —  COPIA GENERADA, NO ORIGINAL
// ============================================================
//
// El original vive en la tienda:
//   miEcommerce/src/app/components/ui/icono/iconos.ts
//
// Esta copia la hace scripts/copiar-iconos-tienda.js. Para rehacerla:
//
//   npm run iconos:tienda
//
// NO SE EDITA A MANO: la próxima copia se lleva los cambios por delante.
// ============================================================
`;

if (!fs.existsSync(ORIGEN)) {
  console.error('No encuentro el catálogo de la tienda en:\n  ' + ORIGEN
    + '\n¿Está miEcommerce al lado de miCRM3-front?');
  process.exit(1);
}

const original = fs.readFileSync(ORIGEN, 'utf8');

// El fin de línea del original, para no cambiar medio fichero sin querer
const eol = original.indexOf('\r\n') >= 0 ? '\r\n' : '\n';

fs.mkdirSync(path.dirname(DESTINO), { recursive: true });
fs.writeFileSync(DESTINO, CABECERA.split('\n').join(eol) + eol + original);

const cuantos = (original.match(/^ {2}'[a-z0-9-]+':/gm) || []).length;
console.log(`Copiados ${cuantos} iconos de la tienda (${eol === '\r\n' ? 'CRLF' : 'LF'}).`);
console.log('  ' + DESTINO);
