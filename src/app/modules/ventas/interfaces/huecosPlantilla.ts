/**
 * LOS HUECOS DE UNA PLANTILLA
 *
 * Un hueco es un {nombre} escrito dentro del texto que, al mandarlo o al
 * leerlo, se cambia por el dato de verdad. Con eso un mensaje —o una nota— se
 * escribe una vez y sirve para todos los clientes.
 *
 * Están aquí, y no en cada pantalla, porque los rellena aplicarHuecos() que
 * está debajo: escribir la lista en un sitio y la sustitución en otro era
 * pedir que un día dejaran de decir lo mismo.
 *
 * Van en grupos porque son quince: una tira de quince botones se lee peor que
 * cuatro desplegables con su nombre, y además el que busca el teléfono del
 * cliente ya sabe que está en «Cliente».
 *
 * Lo que no se sepa se deja en blanco. Es a propósito: más vale «le saluda
 * Leonardo» que «le saluda Leonardo de », y desde luego mejor que dejar un
 * {empresa} escrito en un correo que ya se envió.
 */

import { ClienteModel } from './clienteModel';
import { primerNombre } from './plantillasWhatsapp';

export interface Hueco {
  clave: string;
  ayuda: string;
}

export interface GrupoHuecos {
  nombre: string;
  huecos: Hueco[];
}

export const GRUPOS_HUECOS: GrupoHuecos[] = [
  {
    nombre: 'Cliente',
    huecos: [
      { clave: '{nombre}',         ayuda: 'El primer nombre del cliente; con una empresa, su razón social' },
      { clave: '{cliente}',        ayuda: 'El nombre completo o la razón social' },
      { clave: '{identificacion}', ayuda: 'Su cédula, RUC o pasaporte' },
      { clave: '{email}',          ayuda: 'Su correo' },
      { clave: '{telefono}',       ayuda: 'Su teléfono fijo' },
      { clave: '{celular}',        ayuda: 'Su celular' },
      { clave: '{direccion}',      ayuda: 'La dirección de la ficha' },
      { clave: '{ciudad}',         ayuda: 'El cantón, y si no la provincia' },
    ],
  },
  {
    nombre: 'Quien escribe',
    huecos: [
      { clave: '{vendedor}',    ayuda: 'Tu nombre, el de quien está usando el CRM' },
      { clave: '{mi_email}',    ayuda: 'Tu correo' },
      { clave: '{mi_telefono}', ayuda: 'Tu teléfono' },
    ],
  },
  {
    nombre: 'Vendedor del cliente',
    huecos: [
      { clave: '{vendedor_cliente}', ayuda: 'El empleado asignado a esa ficha, que no siempre es quien escribe' },
    ],
  },
  {
    nombre: 'Fecha y empresa',
    huecos: [
      { clave: '{fecha}',   ayuda: 'La de hoy' },
      { clave: '{hora}',    ayuda: 'La de ahora' },
      { clave: '{empresa}', ayuda: 'La nuestra (se configura en el navegador: miCRM3.empresa)' },
    ],
  },
];

/** Todos seguidos, para quien necesite la lista sin los grupos. */
export const HUECOS_TODOS: Hueco[] = GRUPOS_HUECOS.reduce<Hueco[]>(
  (acumulado, g) => acumulado.concat(g.huecos), []);

/** Con qué se rellena cada hueco. Lo que falte se deja en blanco. */
export interface DatosHuecos {
  nombre?: string | null;
  cliente?: string | null;
  identificacion?: string | null;
  email?: string | null;
  telefono?: string | null;
  celular?: string | null;
  direccion?: string | null;
  ciudad?: string | null;

  vendedor?: string | null;
  mi_email?: string | null;
  mi_telefono?: string | null;

  vendedor_cliente?: string | null;

  fecha?: string | null;
  hora?: string | null;
  empresa?: string | null;
}

/** Quien está usando el CRM, de lo que guardó el login. */
function usuarioConectado(): { nombre: string; email: string; telefono: string } {
  try {
    const u = JSON.parse(localStorage.getItem('user') ?? '{}');
    return {
      nombre:   u?.name || u?.login_user || '',
      email:    u?.email || '',
      telefono: u?.phone || '',
    };
  } catch {
    return { nombre: '', email: '', telefono: '' };
  }
}

/**
 * Cómo se llama la empresa en los mensajes.
 *
 * Hoy el sistema no guarda ese dato en ningún lado (en la cabecera está
 * escrito a mano), así que se lee de una clave del navegador:
 *
 *   localStorage.setItem('miCRM3.empresa', 'Almespaña');
 *
 * Si no está, las plantillas se escriben sin nombrarla.
 */
export function nombreDeLaEmpresa(): string {
  try { return localStorage.getItem('miCRM3.empresa') ?? ''; } catch { return ''; }
}

/**
 * Los datos de un cliente y de quien escribe, listos para rellenar huecos.
 *
 * Una sola función para todas las pantallas: si cada una armara su objeto,
 * {telefono} acabaría siendo el fijo en una y el celular en otra.
 */
export function datosDeHuecos(cliente?: ClienteModel | null): DatosHuecos {
  const yo = usuarioConectado();
  const ahora = new Date();
  const esEmpresa = cliente?.tipo_cliente === 'EMPRESA';

  return {
    nombre:         primerNombre(cliente?.nombre_completo, esEmpresa),
    cliente:        cliente?.nombre_completo,
    identificacion: cliente?.numero_identificacion,
    email:          cliente?.email || cliente?.email_alterno,
    telefono:       cliente?.telefono,
    celular:        cliente?.celular,
    // La escrita manda sobre la de Google: es la que alguien repasó
    direccion:      cliente?.direccion || cliente?.ubicacion,
    ciudad:         cliente?.canton || cliente?.provincia,

    vendedor:    yo.nombre,
    mi_email:    yo.email,
    mi_telefono: yo.telefono,

    vendedor_cliente: cliente?.vendedor_nombre,

    fecha:   ahora.toLocaleDateString('es-EC'),
    hora:    ahora.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' }),
    empresa: nombreDeLaEmpresa(),
  };
}

/**
 * Rellena los huecos de un texto.
 *
 * Sirve igual para texto corrido —el mensaje de WhatsApp— y para HTML —el
 * cuerpo de un correo o una nota—: un hueco es {algo} y no hay forma de que
 * eso aparezca por casualidad dentro de una etiqueta.
 *
 * Los espacios dobles que deja un hueco vacío se limpian, para que no salga
 * «Hola , le saluda».
 */
export function aplicarHuecos(texto: string, datos: DatosHuecos): string {
  // Sin empresa configurada el mensaje no la nombra: «le saluda Leonardo»
  // queda bien; «le saluda Leonardo de la empresa», no.
  let base = (datos.empresa ?? '').trim()
    ? texto
    : texto.replace(/\s*de \{empresa\}/g, '');

  for (const h of HUECOS_TODOS) {
    const clave = h.clave.slice(1, -1) as keyof DatosHuecos;
    base = base.split(h.clave).join(datos[clave] ?? '');
  }

  return base
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+([,.])/g, '$1')
    .trim();
}
