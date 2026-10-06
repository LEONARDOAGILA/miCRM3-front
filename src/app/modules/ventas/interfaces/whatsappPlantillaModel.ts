/**
 * Plantilla de WhatsApp (ventas.whatsapp_plantillas).
 *
 * Es lo que antes estaba escrito en plantillasWhatsapp.ts: los mensajes que
 * se ofrecen al escribirle a un cliente. Ahora vive en la base para poder
 * cambiarlo desde la pantalla, y aquel archivo se queda sólo con lo que sigue
 * siendo código: rellenar los huecos, armar el enlace y decidir qué número
 * puede tener WhatsApp.
 */
export interface WhatsappPlantillaModel {
  id: number;
  /** Nombre corto y estable; si no se indica, el servidor lo saca del nombre */
  codigo: string;
  /** Lo que se lee en el menú */
  nombre: string;
  /** Clase de Font Awesome: fa-hand, fa-heart… */
  icono?: string | null;
  /** Lo que se escribe en la gestión que queda registrada */
  asunto: string;
  /** El mensaje, con sus huecos entre llaves */
  texto: string;
  orden: number;
  activo: boolean;

  created_by?: string | null;
  updated_by?: string | null;
  updated_at?: string | null;
}

/**
 * Los huecos que la pantalla sabe rellenar.
 *
 * Se enseñan en el formulario para que quien escribe una plantilla no tenga
 * que acordarse de cómo se llaman: se pulsa y se inserta.
 */
export const HUECOS_PLANTILLA: { clave: string; ayuda: string }[] = [
  { clave: '{nombre}',   ayuda: 'Sólo el primer nombre del cliente' },
  { clave: '{cliente}',  ayuda: 'Nombre completo o razón social' },
  { clave: '{vendedor}', ayuda: 'Quien está usando el CRM' },
  { clave: '{empresa}',  ayuda: 'La nuestra' },
];

/** Los iconos que se ofrecen, para no tener que saberse Font Awesome. */
export const ICONOS_PLANTILLA: { id: string; name: string }[] = [
  { id: 'fa-hand',                  name: 'Saludo' },
  { id: 'fa-rotate-right',          name: 'Seguimiento' },
  { id: 'fa-file-invoice-dollar',   name: 'Cotización' },
  { id: 'fa-money-bill',            name: 'Pago' },
  { id: 'fa-person-walking',        name: 'Visita' },
  { id: 'fa-heart',                 name: 'Agradecimiento' },
  { id: 'fa-bullhorn',              name: 'Aviso' },
  { id: 'fa-gift',                  name: 'Promoción' },
  { id: 'fa-screwdriver-wrench',    name: 'Postventa' },
  { id: 'fa-comment',               name: 'Mensaje' },
];
