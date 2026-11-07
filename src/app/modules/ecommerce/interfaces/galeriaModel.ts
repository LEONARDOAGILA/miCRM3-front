/**
 * Una GALERÍA de la tienda: un sitio del diseño con su clave fija
 * —`inicio_banner`, `pagos_tarjetas`, `espana_motos_tarjetas`— y las imágenes
 * que van ahí.
 *
 * Las galerías no se crean ni se borran desde el CRM: cada una existe porque
 * la tienda sabe pintarla. Lo que se administra es su contenido.
 */
export interface GaleriaModel {
  id: number;
  clave: string;
  nombre: string;
  descripcion: string | null;
  /** 'banner' | 'imagenes' | 'tarjetas': cómo la pinta la tienda. */
  tipo: string | null;
  /** Cuántas enseña la tienda de las que hay; null = todas. */
  mostrar: number | null;
  /** Cuántas caben. */
  maximo: number | null;
  en_papelera: number;
  imagenes: ImagenGaleriaModel[];
}

export interface ImagenGaleriaModel {
  id: number;
  /** SÓLO EL NOMBRE del fichero: es lo que se guarda. */
  imagen: string;
  /** La dirección, armada por el servidor al leer. No se guarda en ninguna parte. */
  imagen_url: string | null;
  imagen_movil: string | null;
  imagen_movil_url: string | null;
  nombre: string | null;
  enlace: string | null;
  nueva_pestana: boolean;
  /** 'todos' | 'computadora' | 'celular'. */
  mostrar_en: string;
  titulo: string | null;
  subtitulo: string | null;
  /** '#1a73e8', para el texto encima de la imagen. */
  color: string | null;
  boton: string | null;
  /** 'YYYY-MM-DDTHH:mm', como lo quiere un <input type="datetime-local">. */
  desde: string | null;
  hasta: string | null;
  orden: number;
  activo: boolean;
  estado: EstadoImagen;
}

export type EstadoImagen = 'visible' | 'oculta' | 'programada' | 'terminada';

export interface ImagenEnPapelera {
  id: number;
  imagen: string;
  imagen_url: string | null;
  nombre: string | null;
  titulo: string | null;
  enlace: string | null;
  deleted_at: string;
  deleted_by: string | null;
}

/**
 * Cómo se enseña cada estado. En un sitio y no repartido por las plantillas,
 * que es como acaban diciendo cosas distintas.
 */
export const ESTADOS_IMAGEN: Record<EstadoImagen, { texto: string; clase: string; icono: string }> = {
  visible:    { texto: 'Se ve',      clase: 'chip-ok',    icono: 'fa-eye' },
  oculta:     { texto: 'Apagada',    clase: 'chip-muted', icono: 'fa-eye-slash' },
  programada: { texto: 'Programada', clase: 'chip-info',  icono: 'fa-clock' },
  terminada:  { texto: 'Terminada',  clase: 'chip-warn',  icono: 'fa-hourglass-end' },
};

/** Dónde se ve cada imagen. Lo que la tienda entiende, ni más ni menos. */
export const DONDE_SE_VE = [
  { id: 'todos',       name: 'En todas las pantallas' },
  { id: 'computadora', name: 'Sólo en computadora' },
  { id: 'celular',     name: 'Sólo en celular' },
];
