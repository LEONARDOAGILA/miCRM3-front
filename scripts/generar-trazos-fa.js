/**
 * Arma la tabla de DIBUJOS de Font Awesome que usa la tienda.
 *
 * POR QUÉ. En el CRM, cada categoría elige su icono de Font Awesome y se
 * guarda la clase («fa-laptop», «fab fa-atlassian»). El CRM tiene la fuente de
 * iconos cargada y con eso le basta; LA TIENDA NO LA TIENE y no la va a tener:
 * son 160 KB de fuente (270 con las marcas) para pintar diez iconos en un
 * desplegable, en una tienda donde se ha peleado cada kilobyte.
 *
 * ASÍ QUE VIAJA EL DIBUJO, NO LA FUENTE: la base guarda el trazo de cada icono
 * y el menú público lo manda ya resuelto junto al nombre de la categoría. La
 * tienda pinta un <svg> con ese trazo. Son unos 300 bytes por icono dentro de
 * una respuesta que además está cacheada diez minutos.
 *
 * SE REGENERA A MANO, sólo al subir de versión Font Awesome:
 *
 *     npm run iconos:trazos
 *
 * y se aplica el fichero que sale, como cualquier otro de database/sql. No va
 * en el build: compilar no puede depender de que node_modules esté completo.
 *
 * EL FICHERO QUE SALE NO SE EDITA A MANO: el siguiente «npm run iconos:trazos»
 * se lleva por delante lo que se le haya escrito.
 */
const fs = require('fs');
const path = require('path');

// Font Awesome trae un .svg por icono: dentro están el viewBox y el trazo
const ORIGEN = path.resolve(__dirname, '../node_modules/@fortawesome/fontawesome-free/svgs');
const DESTINO = path.resolve(__dirname, '../../miCRM3-back/database/sql/2026-11-13_ecommerce_iconos_fa.sql');

// s = sólido, r = línea, b = marca. Es la letra con la que se guardan y la
// misma que usa el selector de iconos del CRM (iconos-fa.ts)
const ESTILOS = [['s', 'solid'], ['r', 'regular'], ['b', 'brands']];

if (!fs.existsSync(ORIGEN)) {
  console.error('No encuentro los iconos de Font Awesome en node_modules. ¿npm install?');
  process.exit(1);
}

const filas = [];
for (const [estilo, carpeta] of ESTILOS) {
  const dir = path.join(ORIGEN, carpeta);
  for (const fichero of fs.readdirSync(dir).sort()) {
    if (!fichero.endsWith('.svg')) { continue; }

    const svg = fs.readFileSync(path.join(dir, fichero), 'utf8');
    const caja = (svg.match(/viewBox="([^"]+)"/) || [])[1];
    // El atributo `d` del <path>. Los iconos de Font Awesome son un solo path
    const trazo = (svg.match(/ d="([^"]+)"/) || [])[1];
    if (!caja || !trazo) { continue; }

    filas.push([estilo, fichero.replace(/\.svg$/, ''), caja, trazo]);
  }
}

if (filas.length < 1000) {
  console.error('Sólo salieron ' + filas.length + ' iconos: algo va mal, no se escribe nada.');
  process.exit(1);
}

const comilla = texto => "'" + texto.replace(/'/g, "''") + "'";
const valores = filas
  .map(([estilo, nombre, caja, trazo]) =>
    '    (' + comilla(estilo) + ', ' + comilla(nombre) + ', ' + comilla(caja) + ', ' + comilla(trazo) + ')')
  .join(',\n');

const sql = `-- ============================================================================
-- LOS DIBUJOS DE FONT AWESOME, PARA LA TIENDA
-- ============================================================================
-- FICHERO GENERADO: no se edita a mano. Lo hace
-- miCRM3-front/scripts/generar-trazos-fa.js («npm run iconos:trazos» en el
-- CRM) a partir de node_modules/@fortawesome/fontawesome-free, y se vuelve a
-- hacer sólo al subir de versión Font Awesome.
--
-- PARA QUÉ. Cada categoría de inventarios elige su icono en el CRM y se guarda
-- la clase: «fa-laptop», «fab fa-atlassian». El CRM tiene la fuente de iconos
-- cargada; LA TIENDA NO, y no la va a tener: son 160 KB de fuente (270 con las
-- marcas) para pintar diez iconos en un desplegable.
--
-- Así que la tienda recibe EL DIBUJO y no la clase: el menú público manda el
-- trazo ya resuelto —unos 300 bytes— junto al nombre de la categoría, y la
-- tienda pinta un <svg> con él. La respuesta ya estaba cacheada diez minutos.
--
-- Font Awesome Free 6.x — iconos CC BY 4.0 (https://fontawesome.com/license/free)
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS ecommerce.iconos_fa (
    estilo char(1)    NOT NULL,          -- s sólido, r línea, b marca
    nombre varchar(60) NOT NULL,         -- «laptop», «mug-hot»
    caja   varchar(40) NOT NULL,         -- el viewBox del <svg>
    trazo  text        NOT NULL,         -- el atributo d del <path>
    PRIMARY KEY (estilo, nombre)
);

COMMENT ON TABLE ecommerce.iconos_fa IS
    'Los dibujos de Font Awesome, para que la tienda no tenga que cargar la fuente. Fichero generado: ver generar-trazos-fa.js';

-- ---------- El icono de una clase guardada («fab fa-whatsapp») ----------
CREATE OR REPLACE FUNCTION ecommerce.fn_icono_fa(p_clase text)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$
    -- La clase llega como la guarda el CRM: «fa-laptop» (sólido, sin familia),
    -- «far fa-envelope» (línea) o «fab fa-whatsapp» (marca). Sin icono, sin
    -- dibujo y sin ruido: NULL, y quien pinte que no pinte nada.
    SELECT jsonb_build_object('caja', i.caja, 'trazo', i.trazo)
      FROM ecommerce.iconos_fa i
     WHERE i.estilo = CASE
               WHEN btrim(p_clase) LIKE 'fab %' THEN 'b'
               WHEN btrim(p_clase) LIKE 'far %' THEN 'r'
               ELSE 's'
           END
       AND i.nombre = regexp_replace(btrim(COALESCE(p_clase, '')), '^(fa[brs]?\\s+)?fa-', '')
       AND COALESCE(btrim(p_clase), '') <> '';
$function$;

COMMENT ON FUNCTION ecommerce.fn_icono_fa(text) IS
    'El dibujo de un icono de Font Awesome a partir de la clase guardada en el CRM, o NULL si no existe.';

-- ---------- Los dibujos ----------
-- Se vuelven a escribir enteros: así actualizar Font Awesome es correr esto y ya.
INSERT INTO ecommerce.iconos_fa (estilo, nombre, caja, trazo) VALUES
${valores}
ON CONFLICT (estilo, nombre) DO UPDATE
   SET caja = EXCLUDED.caja, trazo = EXCLUDED.trazo;

COMMIT;


-- ============================================================================
-- COMPROBACIÓN — no escribe nada
-- ============================================================================
DO $comprobar$
DECLARE
    v_falta  text[] := '{}';
    v_cuantos int;
BEGIN
    SELECT count(*) INTO v_cuantos FROM ecommerce.iconos_fa;
    IF v_cuantos < 1000 THEN
        v_falta := array_append(v_falta, format('sólo hay %s iconos', v_cuantos));
    END IF;

    -- Los tres estilos y las tres formas de escribir la clase
    IF ecommerce.fn_icono_fa('fa-laptop') ->> 'trazo' IS NULL THEN
        v_falta := array_append(v_falta, 'no resuelve un sólido (fa-laptop)');
    END IF;
    IF ecommerce.fn_icono_fa('fab fa-whatsapp') ->> 'trazo' IS NULL THEN
        v_falta := array_append(v_falta, 'no resuelve una marca (fab fa-whatsapp)');
    END IF;
    IF ecommerce.fn_icono_fa('far fa-envelope') ->> 'trazo' IS NULL THEN
        v_falta := array_append(v_falta, 'no resuelve uno de línea (far fa-envelope)');
    END IF;

    -- Y lo que no existe no inventa nada
    IF ecommerce.fn_icono_fa('fa-esto-no-existe') IS NOT NULL THEN
        v_falta := array_append(v_falta, 'un icono inventado devolvió algo');
    END IF;
    IF ecommerce.fn_icono_fa(NULL) IS NOT NULL OR ecommerce.fn_icono_fa('') IS NOT NULL THEN
        v_falta := array_append(v_falta, 'sin clase tendría que ser NULL');
    END IF;

    -- Un sólido y una marca no se pisan: «fa-whatsapp» no es «fab fa-whatsapp»
    IF ecommerce.fn_icono_fa('fab fa-whatsapp') ->> 'trazo'
       IS NOT DISTINCT FROM COALESCE(ecommerce.fn_icono_fa('fa-whatsapp') ->> 'trazo', '-') THEN
        v_falta := array_append(v_falta, 'la familia del icono no se está mirando');
    END IF;

    IF array_length(v_falta, 1) > 0 THEN
        RAISE EXCEPTION 'Los iconos de Font Awesome no quedaron bien: %', array_to_string(v_falta, '; ');
    END IF;

    RAISE NOTICE 'Iconos de Font Awesome: % en la base', v_cuantos;
END;
$comprobar$;
`;

fs.writeFileSync(DESTINO, sql, 'utf8');
console.log('Escritos ' + filas.length + ' iconos en ' + DESTINO
            + ' (' + (sql.length / 1024 / 1024).toFixed(2) + ' MB)');
