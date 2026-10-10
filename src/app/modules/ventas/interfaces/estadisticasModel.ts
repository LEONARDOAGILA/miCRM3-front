/**
 * El tablero de ventas: lo que devuelve ventas.fn_estadisticas_generales
 * (GET ventas/gestion/estadisticas).
 *
 * Se pinta en «Gestión de clientes» mientras no hay ningún cliente elegido,
 * en lugar de dejar media pantalla en blanco.
 */
export interface EstadisticasVentas {
  /** Cuándo se calculó (hora del servidor) */
  generado: string;
  /** Cuántos días trae la serie de `por_dia` */
  dias: number;

  /**
   * Hasta dónde llegan las cifras de abajo, según la jerarquía de grupos de
   * quien mira: toda la empresa si es administrador, su equipo si manda sobre
   * alguien, o sólo lo suyo. Lo decide el servidor, no la pantalla.
   *
   * `mias` queda fuera de esto: es siempre personal.
   */
  alcance: 'TODO' | 'EQUIPO' | 'PROPIO';

  clientes: {
    total: number;
    activos: number;
    inactivos: number;
    morosos: number;
    suspendidos: number;
    empresas: number;
    personas: number;
    sin_vendedor: number;
    /** Dados de alta desde el día 1 de este mes */
    nuevos_mes: number;
    en_papelera: number;
  };

  gestiones: {
    total: number;
    realizadas: number;
    pendientes: number;
    canceladas: number;
    /** Pendientes cuya hora ya pasó */
    vencidas: number;
    /** Pendientes programadas para hoy */
    hoy: number;
    realizadas_hoy: number;
    realizadas_mes: number;
    minutos_mes: number;
    /** Clientes distintos con al menos una gestión este mes */
    clientes_tocados: number;
    /** Pendientes de los próximos 7 días, sin contar lo ya vencido */
    proximos_7: number;
    /** Minutos de media por gestión realizada en el periodo */
    duracion_media: number;
  };

  /**
   * A quién no se está llamando.
   *
   * Sólo sobre clientes ACTIVOS: que un inactivo lleve meses sin contacto no
   * es un descuido, es lo normal.
   */
  cobertura: {
    activos: number;
    /** Cuántos días sin contacto cuentan como «dormido» (lo fija el servidor) */
    dias_dormido: number;
    /** Nunca se le hizo una gestión */
    sin_gestion: number;
    /** Sin contacto en los últimos `dias_dormido` días, o nunca */
    dormidos: number;
    /** Sin ninguna gestión pendiente: se caen del radar */
    sin_proxima: number;
    con_proxima: number;
  };

  /**
   * Si sirve de algo llamar, en el periodo.
   *
   * «No contesta» y «buzón» se separan de «no interesado»: la primera es un
   * problema de horario, la segunda de producto.
   */
  efectividad: {
    dias: number;
    realizadas: number;
    con_resultado: number;
    /** Se habló con alguien, diga lo que diga */
    contacto: number;
    /** No se le pudo hablar: no contesta, buzón, número errado */
    sin_contacto: number;
    interesados: number;
    ventas: number;
    cotizaciones: number;
    reclamos: number;
    /** Porcentaje de contacto sobre las que tienen resultado anotado */
    tasa_contacto: number;
  };

  /** Qué falta por repartir, papel a papel */
  papeles: {
    activos: number;
    sin_vendedor: number;
    sin_cobrador: number;
    sin_asistente: number;
    sin_postventa: number;
  };

  /** Lo del usuario que está mirando (se ata por created_by) */
  mias: {
    login: string | null;
    pendientes: number;
    vencidas: number;
    hoy: number;
    realizadas_hoy: number;
    clientes: number;
  };

  /** Un punto por día, con ceros incluidos: la línea no da saltos */
  por_dia: { dia: string; realizadas: number; programadas: number }[];

  por_tipo: { tipo: string; cuantas: number }[];
  resultados: { resultado: string; cuantas: number }[];
  /** Cartera por vendedor: cuántos clientes tiene cada uno */
  vendedores: { vendedor: string; clientes: number; pendientes: number }[];

  /**
   * Trabajo por persona, que no es lo mismo que cartera: lo que hizo en el
   * periodo y lo que le queda.
   */
  usuarios: {
    usuario: string;
    realizadas: number;
    pendientes: number;
    vencidas: number;
    minutos: number;
  }[];
  ciudades: { ciudad: string; clientes: number }[];
}
