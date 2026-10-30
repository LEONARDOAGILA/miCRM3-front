import { Directive, ElementRef, Input, NgZone, OnDestroy, OnInit } from '@angular/core';
import { AgGridAngular } from 'ag-grid-angular';
import { GridApi } from 'ag-grid-community';

/**
 * ESTIRAR LAS FILAS DE UN ag-Grid, COMO EN EXCEL.
 *
 * ag-Grid redimensiona COLUMNAS de serie, filas NO —ni en la edición
 * Community ni en la de pago—, así que el agarre se monta aquí: se escucha el
 * ratón sobre la rejilla y, cuando está a menos de cuatro píxeles del borde de
 * abajo de una fila, se arrastra. Doble clic en ese borde devuelve la fila a
 * su alto, igual que en Excel.
 *
 * Lo que SÍ da la librería es la mitad importante y está en Community:
 * `nodo.setRowHeight(px)` + `api.onRowHeightChanged()`.
 *
 * EL SELECTOR ES EL ELEMENTO, no un atributo: a la pantalla le basta con
 * importar la directiva y la tienen TODAS sus rejillas, sin tocar plantillas.
 * Para quitarla de una en concreto, `[filasEstirables]="false"`.
 *
 * LO QUE HACE QUE SIRVA DE ALGO: una fila estirada parte el texto en varias
 * líneas (clase `fila-estirada`, en styles.css). Sin eso, estirar sólo
 * enseñaría más hueco en blanco, porque ag-Grid corta el texto con puntos
 * suspensivos.
 *
 * El alto se recuerda por `node.id`, que es lo que ag-Grid usa para
 * identificar la fila: con `getRowId` puesto es el id del dato y el alto
 * sigue a la fila; sin él es la POSICIÓN, así que al ordenar o filtrar el
 * alto se queda en el sitio, no en el dato. Es lo mismo que hace Excel, donde
 * lo alto es la fila 7, no lo que haya escrito en ella.
 */
@Directive({
  selector: 'ag-grid-angular',
  standalone: true,
})
export class FilasEstirablesDirective implements OnInit, OnDestroy {

  /** Para apagarlo en una rejilla concreta: `[filasEstirables]="false"`. */
  @Input() filasEstirables: boolean | string = true;

  /** Cuánto tiempo (ms) cuentan dos agarres seguidos como uno doble. */
  private static readonly DOBLE_AGARRE = 450;
  /** A cuántos píxeles del borde de abajo se agarra. */
  private static readonly ZONA_AGARRE = 4;
  private static readonly ALTO_MIN = 24;
  private static readonly ALTO_MAX = 400;
  /** Si la rejilla no dice su alto de fila, el de ag-Grid. */
  private static readonly ALTO_POR_DEFECTO = 42;

  private api: GridApi | null = null;
  private raiz: HTMLElement;

  /** El alto que se le ha puesto a cada fila, por `node.id`. */
  private readonly altos = new Map<string, number>();

  private estirando: { id: string; nodo: any; yInicial: number; altoInicial: number } | null = null;
  /** El agarre anterior, para reconocer el doble. */
  private ultimoAgarre: { cuando: number; y: number; id: string } | null = null;
  /** Para no reaccionar al cambio de altos que provoca uno mismo. */
  private aplicando = false;
  private repintado = 0;
  private suscripcion: any = null;

  constructor(
    private grid: AgGridAngular,
    host: ElementRef<HTMLElement>,
    private zone: NgZone,
  ) {
    this.raiz = host.nativeElement;
  }

  private get activo(): boolean {
    return this.filasEstirables !== false && String(this.filasEstirables) !== 'false';
  }

  ngOnInit(): void {
    if (!this.activo) { return; }

    // `gridReady` es un @Output del componente: aquí llega la api sin tener
    // que pedirle nada a la pantalla.
    this.suscripcion = this.grid.gridReady.subscribe((e: any) => this.alEstarLista(e.api));
  }

  ngOnDestroy(): void {
    this.suscripcion?.unsubscribe?.();
    this.raiz.removeEventListener('pointermove', this.alMover, true);
    this.raiz.removeEventListener('pointerdown', this.alPulsar, true);
    this.raiz.removeEventListener('pointerup', this.alSoltar, true);
    this.raiz.removeEventListener('pointercancel', this.alSoltar, true);
    if (this.repintado) { cancelAnimationFrame(this.repintado); }
    this.api = null;
  }

  private alEstarLista(api: GridApi): void {
    this.api = api;
    // Marca de que la rejilla ya tiene el agarre: sirve para verlo de un
    // vistazo al depurar y para que una prueba pueda distinguir «no se
    // enganchó» de «no se agarró».
    this.raiz.classList.add('filas-estirables');

    // FUERA DE LA ZONA de Angular: son eventos de ratón que se disparan en
    // cada píxel del movimiento y ninguno cambia nada del formulario. Dentro,
    // cada uno lanzaría una ronda de detección de cambios de la pantalla
    // entera.
    this.zone.runOutsideAngular(() => {
      // EN CAPTURA: así el `pointerdown` se ve ANTES que ag-Grid y se le
      // puede parar. Sin eso, agarrar el borde abre además el editor en las
      // rejillas que editan con un solo clic.
      this.raiz.addEventListener('pointermove', this.alMover, true);
      this.raiz.addEventListener('pointerdown', this.alPulsar, true);
    });

    // Al rehacerse el modelo (setRowData, filtros, orden) los nodos son
    // otros: hay que volver a ponerles el alto que tenían.
    api.addEventListener('modelUpdated', this.alCambiarElModelo);
    // Y al desplazarse, ag-Grid destruye y rehace las filas que salen y
    // entran de la pantalla, sin la clase: se repintan.
    api.addEventListener('viewportChanged', this.pedirRepintado);
    api.addEventListener('bodyScroll', this.pedirRepintado);
  }

  /** El alto que tendría una fila sin tocar. */
  private altoBase(): number {
    const delTema = (this.api as any)?.getSizesForCurrentTheme?.()?.rowHeight;
    return Number(this.grid.rowHeight) || Number(delTema) || FilasEstirablesDirective.ALTO_POR_DEFECTO;
  }

  /**
   * ¿Está el ratón en el borde de abajo de una fila? Devuelve CUÁL.
   *
   * LA ZONA CRUZA LA LÍNEA, a propósito: las filas de ag-Grid se tocan sin
   * hueco, así que un punto a un píxel del borde cae ya DENTRO DE LA FILA
   * SIGUIENTE —medido: en `bottom - 1` el navegador devuelve la de abajo—. Si
   * sólo se mirara hacia arriba, agarrar la línea sería cuestión de suerte.
   * Por eso, si el ratón está pegado al borde de ARRIBA de una fila, lo que
   * se agarra es la de encima, que es la dueña de esa línea. Es lo mismo que
   * hacen Excel y el redimensionado de columnas de la propia ag-Grid.
   *
   * Sobre el asa de arrastrar filas no cuenta: ahí el gesto es mover la fila
   * de sitio, y las dos cosas se pelearían por el mismo arrastre.
   */
  private bordeBajoElRaton(e: { clientY: number; target: EventTarget | null }):
      { id: string; nodo: any; alto: number } | null {
    if (!this.api) { return null; }

    const origen = e.target as HTMLElement | null;
    if (!origen || origen.closest('.ag-row-drag, .ag-drag-handle')) { return null; }

    const filaEl = origen.closest('.ag-row') as HTMLElement | null;
    if (!filaEl) { return null; }

    const caja = filaEl.getBoundingClientRect();
    const zona = FilasEstirablesDirective.ZONA_AGARRE;
    let indice = Number(filaEl.getAttribute('row-index'));

    // El medio píxel de tolerancia NO es por si acaso: las filas caen en
    // coordenadas con decimales (502.6, 532.6…) y el navegador decide a qué
    // fila pertenece un punto redondeando a su manera. Medido: en y = 532,
    // con la fila 1 acabando en 532.6, el `target` ya era la fila 2 — y sin
    // tolerancia ahí quedaba UN PÍXEL MUERTO en cada costura, justo encima de
    // la línea que se quiere agarrar.
    const margen = 1;
    const dAbajo = caja.bottom - e.clientY;
    const dArriba = e.clientY - caja.top;

    if (dAbajo >= -margen && dAbajo <= zona) {
      // Pegado a su borde de abajo: es esta fila
    } else if (dArriba >= -margen && dArriba <= zona && indice > 0) {
      // Pegado a su borde de arriba: la línea es de la fila de encima
      indice -= 1;
    } else {
      return null;
    }

    const nodo = this.api.getDisplayedRowAtIndex(indice);
    if (!nodo || nodo.id == null) { return null; }

    // El alto de la fila que se va a estirar, no el de la que tiene el ratón
    const alto = Number(nodo.rowHeight) || caja.height;
    return { id: String(nodo.id), nodo, alto };
  }

  private readonly alMover = (e: PointerEvent): void => {
    if (this.estirando) {
      this.ponerAlto(this.estirando.nodo, this.estirando.id,
                     this.estirando.altoInicial + (e.clientY - this.estirando.yInicial));
      return;
    }
    // Sólo el cursor: que se vea que ahí se puede agarrar, como en las columnas
    this.raiz.classList.toggle('filas-en-el-borde', !!this.bordeBajoElRaton(e));
  };

  private readonly alPulsar = (e: PointerEvent): void => {
    if (e.button !== 0) { return; }
    const borde = this.bordeBajoElRaton(e);
    if (!borde) { return; }

    e.preventDefault();
    e.stopPropagation();

    // DOBLE AGARRE = a su sitio, como el doble clic de Excel.
    //
    // Se cuenta a mano y no con el evento `dblclick` porque el
    // `preventDefault()` de aquí arriba —el que evita que al arrastrar se
    // seleccione el texto de las celdas— CANCELA los eventos de ratón
    // derivados del puntero, y `dblclick` es uno de ellos: comprobado, no
    // llegaba nunca.
    const ahora = Date.now();
    const anterior = this.ultimoAgarre;
    this.ultimoAgarre = { cuando: ahora, y: e.clientY, id: borde.id };

    if (anterior && anterior.id === borde.id
        && ahora - anterior.cuando < FilasEstirablesDirective.DOBLE_AGARRE
        && Math.abs(e.clientY - anterior.y) <= 3) {
      this.ultimoAgarre = null;
      this.altos.delete(borde.id);
      this.ponerAlto(borde.nodo, borde.id, this.altoBase());
      return;                      // no se empieza a arrastrar
    }

    this.estirando = { id: borde.id, nodo: borde.nodo, yInicial: e.clientY, altoInicial: borde.alto };
    this.raiz.classList.add('filas-estirando');
    // Con captura del puntero los movimientos siguen llegando aunque el ratón
    // se salga de la rejilla, que es lo que pasa al estirar deprisa.
    try { this.raiz.setPointerCapture(e.pointerId); } catch { /* ratón ya soltado */ }
    this.raiz.addEventListener('pointerup', this.alSoltar, true);
    this.raiz.addEventListener('pointercancel', this.alSoltar, true);
  };

  private readonly alSoltar = (e: PointerEvent): void => {
    if (!this.estirando) { return; }
    this.estirando = null;
    this.raiz.classList.remove('filas-estirando');
    try { this.raiz.releasePointerCapture(e.pointerId); } catch { /* ya liberado */ }
    this.raiz.removeEventListener('pointerup', this.alSoltar, true);
    this.raiz.removeEventListener('pointercancel', this.alSoltar, true);
  };

  private ponerAlto(nodo: any, id: string, alto: number): void {
    if (!this.api || !nodo) { return; }

    const limitado = Math.round(Math.min(FilasEstirablesDirective.ALTO_MAX,
                                Math.max(FilasEstirablesDirective.ALTO_MIN, alto)));
    if (nodo.rowHeight === limitado) { return; }

    const base = this.altoBase();
    if (limitado === base) { this.altos.delete(id); } else { this.altos.set(id, limitado); }

    this.aplicando = true;
    nodo.setRowHeight(limitado);
    this.api.onRowHeightChanged();
    this.aplicando = false;

    this.pedirRepintado();
  }

  /** Vuelve a ponerle a cada fila el alto que se le dio. */
  private readonly alCambiarElModelo = (): void => {
    if (this.aplicando || !this.api || !this.altos.size) { return; }

    this.aplicando = true;
    let alguno = false;
    this.api.forEachNode((n: any) => {
      const alto = n?.id == null ? null : this.altos.get(String(n.id));
      if (alto && n.rowHeight !== alto) { n.setRowHeight(alto); alguno = true; }
    });
    if (alguno) { this.api.onRowHeightChanged(); }
    this.aplicando = false;

    this.pedirRepintado();
  };

  /**
   * Marca las filas estiradas en el DOM.
   *
   * No se usa `rowClassRules` porque eso es de cada pantalla y esta directiva
   * no toca su configuración; y tampoco `redrawRows`, que en ag-Grid 28 no
   * vuelve a llamar al cellRenderer y deja las celdas vacías.
   */
  private readonly pedirRepintado = (): void => {
    if (this.repintado) { return; }
    this.repintado = requestAnimationFrame(() => {
      this.repintado = 0;
      const base = this.altoBase();
      this.raiz.querySelectorAll('.ag-row').forEach((fila: Element) => {
        const id = fila.getAttribute('row-id');
        const alto = id == null ? 0 : (this.altos.get(id) ?? 0);
        fila.classList.toggle('fila-estirada', alto > base);
      });
    });
  };
}
