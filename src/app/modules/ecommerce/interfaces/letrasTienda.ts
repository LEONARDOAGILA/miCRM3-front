/**
 * LAS LETRAS DE LA TIENDA, PARA QUE LAS MUESTRAS DEL CRM ENSEÑEN LA DE VERDAD.
 *
 * El CRM no las trae de serie —no las usa para nada suyo—, así que una muestra
 * que diga «Poppins» sin haberlas pedido sale con la letra del sistema, y las
 * tres primeras se ven exactamente iguales. Quien elige, elige a ciegas.
 *
 * NO VAN EN EL index.html DEL CRM: son cien kilobytes de letras que sólo hacen
 * falta en tres pantallas —encabezado, portada y pie— y el CRM lo abre todo el
 * mundo todo el día. Se piden al entrar en ellas, una vez.
 *
 * ESTO ESTABA REPETIDO TRES VECES (21/11/2026) y con el mismo id de <link>:
 * el pie pedía unas letras, la portada otras más ligeras y el encabezado
 * ninguna. Como el id era el mismo, la primera pantalla que se abriera dejaba
 * a las otras con sus letras: entrar por la portada y pasar al pie daba una
 * muestra en negrita siempre, porque los demás grosores no se habían pedido.
 */

/**
 * De dónde se piden.
 *
 * ES LA MISMA LÍNEA QUE TIENE LA TIENDA en su `index.html`, y tiene que
 * seguir siéndolo: lo que se enseña aquí es lo que va a ver el cliente, con
 * los mismos grosores. Si allá se añade una letra, aquí también.
 */
export const URL_LETRAS_TIENDA =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700'
  + '&family=Poppins:wght@500;600;700;800'
  + '&family=Barlow+Condensed:ital,wght@1,600;1,700'
  + '&family=Bebas+Neue'
  + '&family=Pacifico'
  + '&family=Playfair+Display:wght@400;600;700'
  + '&family=Montserrat:wght@400;600;700'
  + '&display=swap';

/**
 * Las pide una vez. Si el <link> ya está puesto —otra pantalla de éstas ya
 * pasó por aquí—, no hace nada.
 */
export function cargarLetrasDeLaTienda(): void {
  const ID = 'letras-de-la-tienda';
  if (document.getElementById(ID)) { return; }

  const link = document.createElement('link');
  link.id = ID;
  link.rel = 'stylesheet';
  link.href = URL_LETRAS_TIENDA;
  document.head.appendChild(link);
}
