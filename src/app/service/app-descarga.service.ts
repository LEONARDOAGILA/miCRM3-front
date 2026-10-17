import { Injectable, inject } from '@angular/core';
import { GridApi } from 'ag-grid-community';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';

import { AppAgGridService } from './app-agGrid.service';
import {
  AlcanceDescargaComponent, AlcanceDescarga, AccionDescarga,
} from '../components/alcanceDescarga/alcanceDescarga.component';

// Se reexportan para que las pantallas no tengan que importar del componente
export type { AlcanceDescarga, AccionDescarga };

/** Lo que necesita saber el servicio para preguntar y traer las filas. */
export interface PeticionDescarga<T = any> {
  /** Qué botón se pulsó; sólo cambia cómo se llaman las cosas en la ventana. */
  accion: AccionDescarga;

  /** En plural y en minúsculas: «marcas», «usuarios», «clientes». */
  nombrePlural: string;

  /** Encabezado del reporte: «Listado de Marcas». */
  tituloBase: string;

  /** La rejilla, para saber qué filas tiene delante el usuario. */
  gridApi?: GridApi;

  /** Por si la rejilla aún no está lista: las filas de la página. */
  filasDePagina?: T[];

  /** Cuántas hay en total (las que cumplen el filtro). */
  total: number;

  /** Para el título, cuando la pantalla pagina. */
  pagina?: number;
  ultimaPagina?: number;

  /** Lo escrito en el buscador de arriba. */
  busqueda?: string;

  /** El modelo de filtros de columna (gridApi.getFilterModel()). */
  filtrosColumna?: any;

  /** Las definiciones, para sacar el nombre de cada columna filtrada. */
  columnDefs?: any[];

  /**
   * Filtros propios de la pantalla, ya en castellano: el combo de marca,
   * el rango de fechas… El servicio sabe de la búsqueda y de los filtros
   * de columna; lo demás sólo lo sabe la pantalla.
   */
  filtrosExtra?: string[];

  /**
   * Cómo se pide TODO. Lo sabe la pantalla: unas lo tienen ya en memoria
   * (los árboles) y otras tienen que pedírselo al servidor.
   */
  traerTodo: () => Promise<T[]> | T[];
}

/** Lo que devuelve: qué se eligió, las filas y el título del reporte. */
export interface ResultadoDescarga<T = any> {
  alcance: AlcanceDescarga;
  filas: T[];
  titulo: string;
}

/**
 * Qué se lleva el usuario cuando imprime o exporta: la página o todo.
 *
 * POR QUÉ UN SERVICIO. Las dos respuestas son razonables y ninguna es la
 * correcta siempre —quien está mirando una página quiere ESA, y quien acaba
 * de filtrar quiere todo lo que cumple el filtro—, así que hay que
 * preguntar. Y preguntar bien son cinco cosas: contar lo que se ve, contar
 * lo que hay, enseñar los filtros puestos en castellano, no preguntar cuando
 * las dos respuestas dan lo mismo y recordar lo último que se eligió.
 * Escribir eso en las trece pantallas que tienen los botones es escribirlo
 * mal en la segunda.
 *
 *     const salida = await this._descargas.preparar({
 *       accion: 'excel', nombrePlural: 'marcas', tituloBase: 'Listado de Marcas',
 *       gridApi: this.gridApi, total: this.totalRegistros,
 *       pagina: this.paginaActual, ultimaPagina: this.ultimaPagina,
 *       busqueda: this.searchTerm, filtrosColumna: this.filtrosColumna,
 *       columnDefs: this.columnDefs,
 *       traerTodo: () => this.obtenerTodosParaExportar(),
 *     });
 *     if (!salida) { return; }            // no hay nada, o canceló
 *     …generar el fichero con salida.filas y salida.titulo…
 *
 * NO GENERA NINGÚN FICHERO: eso es de los servicios de pdf, excel y csv.
 */
@Injectable({ providedIn: 'root' })
export class AppDescargaService {

  private readonly modal = inject(NgbModal);
  private readonly _appAgGridService = inject(AppAgGridService);
  private readonly _toastr = inject(ToastrService);

  /**
   * Lo último que eligió en cualquier pantalla.
   *
   * Quien exporta una vez suele exportar tres seguidas (pdf, excel, csv) y
   * casi siempre quiere lo mismo. No se guarda entre sesiones a propósito:
   * mañana puede querer lo otro, y una preferencia escondida que no recuerda
   * haber puesto es peor que preguntar.
   */
  private ultimoAlcance: AlcanceDescarga = 'pagina';

  /**
   * Las filas que el usuario tiene delante, EN EL ORDEN EN QUE LAS VE.
   *
   * No vale el array de la pantalla: ése es el orden en que llegaron del
   * servidor, y si ha pulsado una cabecera para ordenar, lo que ve es otra
   * cosa. `forEachNodeAfterFilterAndSort` da justo lo que está pintado.
   */
  filasVisibles<T = any>(gridApi?: GridApi, respaldo: T[] = []): T[] {
    if (!gridApi) { return [...respaldo]; }
    const filas: T[] = [];
    gridApi.forEachNodeAfterFilterAndSort((n: any) => { if (n.data) { filas.push(n.data); } });
    if (!filas.length) { return [...respaldo]; }

    // HAY DOS FORMAS DE PAGINAR EN LA CASA. Casi todas las pantallas piden
    // una página al servidor, y entonces la rejilla sólo tiene esa página y
    // esto ya es «lo que se ve». Pero alguna (allMenus) se trae todo y deja
    // paginar a ag-Grid: ahí `forEachNodeAfterFilterAndSort` recorre TODO lo
    // filtrado, no la página, y hay que quedarse con el trozo que se ve.
    const porPagina = (gridApi as any).paginationGetPageSize?.() ?? 0;
    const paginas   = (gridApi as any).paginationGetTotalPages?.() ?? 1;
    if (porPagina > 0 && paginas > 1) {
      const actual = (gridApi as any).paginationGetCurrentPage?.() ?? 0;
      return filas.slice(actual * porPagina, (actual + 1) * porPagina);
    }

    return filas;
  }

  /** Los filtros puestos, en castellano, para enseñárselos al usuario. */
  filtrosEnCastellano(busqueda?: string, filtrosColumna?: any, columnDefs?: any[]): string[] {
    return [
      ...(busqueda ? [`Búsqueda: «${busqueda}»`] : []),
      ...this._appAgGridService.descripcionDeFiltros(filtrosColumna, columnDefs ?? []),
    ];
  }

  /**
   * Pregunta, trae las filas y arma el título.
   *
   * Devuelve null si no hay nada que descargar o si se canceló; entonces
   * quien llama no hace nada: del aviso se encarga este servicio.
   */
  async preparar<T = any>(p: PeticionDescarga<T>): Promise<ResultadoDescarga<T> | null> {
    const columnas = p.columnDefs ?? (p.gridApi as any)?.getColumnDefs?.() ?? [];
    const visibles = this.filasVisibles<T>(p.gridApi, p.filasDePagina ?? []);
    const total = Math.max(p.total ?? 0, visibles.length);

    if (total === 0) {
      this._toastr.info(`No hay ${p.nombrePlural} para exportar`);
      return null;
    }

    const filtros = [
      ...(p.filtrosExtra ?? []),
      ...this.filtrosEnCastellano(p.busqueda, p.filtrosColumna, columnas),
    ];

    // NO SE PREGUNTA CUANDO NO HAY NADA QUE PREGUNTAR: si lo que se ve ya es
    // todo, las dos respuestas dan el mismo fichero y el diálogo sería un
    // clic de peaje. Se queda en «página» para no pedirle al servidor otra
    // vez lo que ya está en pantalla.
    let alcance: AlcanceDescarga = 'pagina';

    if (visibles.length < total) {
      const modalRef = this.modal.open(AlcanceDescargaComponent, {
        centered: true, size: 'sm', backdrop: 'static', keyboard: true
      });
      modalRef.componentInstance.datos = {
        accion: p.accion,
        nombrePlural: p.nombrePlural,
        enLaPagina: visibles.length,
        enTotal: total,
        filtros,
        porOmision: this.ultimoAlcance,
      };

      try {
        alcance = await modalRef.result as AlcanceDescarga;
        this.ultimoAlcance = alcance;
      } catch {
        return null;                   // Cancelar, la × o Escape
      }
    }

    const filas = alcance === 'pagina' ? visibles : await p.traerTodo();
    if (!filas || filas.length === 0) {
      // Se pidió todo y no vino nada: del fallo HTTP ya avisa el
      // interceptor, pero sin esto el botón no haría nada visible.
      this._toastr.info(`No hay ${p.nombrePlural} para exportar`);
      return null;
    }

    return { alcance, filas, titulo: this.titulo(p, filtros, alcance, visibles.length, total) };
  }

  /**
   * El título dice QUÉ trae el fichero.
   *
   * Un reporte sin esto no se puede comprobar: dos exportaciones del mismo
   * listado con distinto filtro salen con la misma cabecera y luego no hay
   * forma de saber cuál era cuál.
   */
  private titulo<T>(p: PeticionDescarga<T>, filtros: string[],
                    alcance: AlcanceDescarga, visibles: number, total: number): string {
    const partes = [...filtros];

    if (alcance === 'pagina') {
      const ultima = p.ultimaPagina ?? 1;
      partes.push(ultima > 1
        ? `página ${p.pagina ?? 1} de ${ultima}`
        // Sin paginación (los árboles): lo que se ve es lo desplegado
        : `sólo lo que se ve: ${visibles} de ${total}`);
    }

    return partes.length ? `${p.tituloBase} (${partes.join('; ')})` : p.tituloBase;
  }
}
