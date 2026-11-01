import { Component, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';
import {
  CdkDrag, CdkDragDrop, CdkDragHandle, CdkDragPlaceholder, CdkDropList, moveItemInArray,
} from '@angular/cdk/drag-drop';

import { SeguridadService } from '../../../../seguridad/services/seguridad.service';
import { AccesoModel } from '../../../../seguridad/interfaces/accesoModel';
import { PaginaInformativaService } from '../../../services/paginaInformativa.service';
import {
  CarpetaEnPantalla, GrupoPaginaModel, PaginaInformativaModel,
} from '../../../interfaces/paginaInformativaModel';

import { PanelComponent } from '../../../../../components/panel/panel.component';
import { SavePaginaInformativaComponent } from '../savePaginaInformativa/savePaginaInformativa.component';
import { GrupoPaginaComponent } from '../grupoPagina/grupoPagina.component';
import { PapeleraPaginasInformativasComponent } from '../papeleraPaginasInformativas/papeleraPaginasInformativas.component';

/**
 * LAS PÁGINAS DE TEXTO DE LA TIENDA (ecommerce.paginas_informativas).
 *
 * Términos y condiciones, políticas de datos, garantías, «Conócenos». Se
 * administran desde aquí porque las escribe legal, no sistemas, y porque
 * cambiarlas no puede exigir publicar la tienda otra vez.
 *
 * NO ES UNA REJILLA, a diferencia de casi todas las pantallas de la casa, y es
 * a propósito: lo que importa de estas páginas no es buscarlas entre muchas
 * —son diez— sino VERLAS COMO SE AGRUPAN Y EN QUÉ ORDEN SALEN, porque eso es
 * exactamente lo que verá el visitante en «Documentos». Una tabla ordenable
 * por columnas enseñaría justo lo que no hace falta y escondería lo único que
 * sí. Por eso: carpetas, páginas dentro, y se arrastran.
 *
 * ARRIBA DEL TODO van las páginas FIJAS, las que la tienda tiene en una
 * dirección propia (/politicas-de-garantia, /conocenos). No están en ninguna
 * carpeta, no se pueden borrar y su orden no se toca: ahí no hay nada que
 * ordenar porque cada una va por su cuenta.
 *
 * EL ARRASTRE NO CAMBIA DE CARPETA. Dentro de una carpeta, arrastrar cambia el
 * orden; para mover una página a otra carpeta se abre y se cambia ahí. Es lo
 * que ya hacía el CRM viejo, y tiene su razón: el orden se guarda solo al
 * soltar, mientras que cambiar de carpeta es un cambio de la página que se
 * guarda con el resto.
 */
@Component({
  selector: 'app-allPaginasInformativas',
  templateUrl: './allPaginasInformativas.component.html',
  styleUrls: ['./allPaginasInformativas.component.css'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    CommonModule, PanelComponent,
    CdkDropList, CdkDrag, CdkDragHandle, CdkDragPlaceholder,
  ],
})
export class AllPaginasInformativasComponent implements OnInit {

  public titulo = 'Páginas informativas';
  public accesoModel!: AccesoModel;

  public paginas: PaginaInformativaModel[] = [];
  public grupos: GrupoPaginaModel[] = [];

  /** Las fijas arriba, y después una entrada por carpeta. */
  public bloques: CarpetaEnPantalla[] = [];
  public fijas: PaginaInformativaModel[] = [];

  public cargando = true;
  public trabajando = false;

  private _paginaService = inject(PaginaInformativaService);
  private _seguridadService = inject(SeguridadService);
  private _toastr = inject(ToastrService);
  private modal = inject(NgbModal);
  private router = inject(Router);
  private activeRoute = inject(ActivatedRoute);

  get puedeCrear(): boolean { return this.accesoModel?.crear === true; }
  get puedeEditar(): boolean { return this.accesoModel?.editar === true; }
  get puedeEliminar(): boolean { return this.accesoModel?.eliminar === true; }
  get puedeVaciar(): boolean { return this.accesoModel?.vaciar === true; }

  /** Sin carpetas no hay dónde poner una página nueva que no sea fija. */
  get hayCarpetas(): boolean { return this.grupos.length > 0; }

  ngOnInit(): void {
    this.accesoModel = this.activeRoute.snapshot.data['access'];
    this.cargar();
  }

  // ================================================================
  // CARGA
  // ================================================================

  async cargar(): Promise<void> {
    this.cargando = true;
    try {
      const res: any = await firstValueFrom(this._paginaService.allPaginasInformativas());
      this.paginas = res?.data?.paginas ?? [];
      this.grupos  = res?.data?.grupos ?? [];
      this.armarBloques();
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudieron cargar las páginas', 'Error',
                         { timeOut: 15000, closeButton: true });
    } finally {
      this.cargando = false;
    }
  }

  /** Las fijas por un lado y, por otro, cada carpeta con lo que cuelga de ella. */
  private armarBloques(): void {
    this.fijas = this.paginas
      .filter(p => p.fija)
      .sort((a, b) => a.titulo.localeCompare(b.titulo));

    this.bloques = this.grupos
      .slice()
      .sort((a, b) => a.orden - b.orden || a.id - b.id)
      .map(grupo => ({
        grupo,
        paginas: this.paginas
          .filter(p => !p.fija && p.grupo_id === grupo.id)
          .sort((a, b) => a.orden - b.orden || a.id - b.id),
      }));

    // Las que no son fijas y se quedaron sin carpeta (al restaurar una página
    // cuya carpeta seguía en la papelera). Si no se pintaran, desaparecerían
    // de la pantalla sin estar borradas.
    const huerfanas = this.paginas
      .filter(p => !p.fija && !p.grupo_id)
      .sort((a, b) => a.orden - b.orden || a.id - b.id);

    if (huerfanas.length) {
      this.bloques.push({ grupo: null, paginas: huerfanas });
    }
  }

  // ================================================================
  // ORDEN
  // ================================================================

  async soltarCarpeta(evento: CdkDragDrop<CarpetaEnPantalla[]>): Promise<void> {
    if (!this.puedeEditar || evento.previousIndex === evento.currentIndex) { return; }

    // Se mueve en pantalla primero: esperar al servidor para repintar hace
    // que la fila "salte" de vuelta y parezca que no se movió.
    moveItemInArray(this.bloques, evento.previousIndex, evento.currentIndex);

    const ids = this.bloques.map(b => b.grupo?.id).filter((id): id is number => !!id);
    await this.guardarOrden(() => this._paginaService.ordenarGrupos(ids));
  }

  async soltarPagina(bloque: CarpetaEnPantalla, evento: CdkDragDrop<PaginaInformativaModel[]>): Promise<void> {
    if (!this.puedeEditar || evento.previousIndex === evento.currentIndex) { return; }

    moveItemInArray(bloque.paginas, evento.previousIndex, evento.currentIndex);

    // Sólo las de ESTA carpeta: el orden es por carpeta, y mandar las de
    // todas haría que la última ganase sobre las demás.
    const ids = bloque.paginas.map(p => p.id);
    await this.guardarOrden(() => this._paginaService.ordenarPaginasInformativas(ids));
  }

  private async guardarOrden(llamada: () => any): Promise<void> {
    this.trabajando = true;
    try {
      await firstValueFrom(llamada());
      // Sin aviso de éxito: arrastrar y ver que se queda donde se soltó ya es
      // la confirmación, y un toast por cada movimiento es ruido.
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo guardar el orden', 'Error',
                         { timeOut: 15000, closeButton: true });
      // Lo de la pantalla ya no es lo que hay guardado: se vuelve a leer
      await this.cargar();
    } finally {
      this.trabajando = false;
    }
  }

  // ================================================================
  // PÁGINAS
  // ================================================================

  nuevaPagina(): void {
    if (this._seguridadService.isexpired() || !this.puedeCrear) { return; }
    this.abrirEditor({}, 'add');
  }

  editarPagina(pagina: PaginaInformativaModel): void {
    if (this._seguridadService.isexpired()) { return; }
    this.abrirEditor(pagina, this.puedeEditar ? 'edit' : 'view');
  }

  verPagina(pagina: PaginaInformativaModel): void {
    if (this._seguridadService.isexpired()) { return; }
    this.abrirEditor(pagina, 'view');
  }

  private abrirEditor(registro: any, accion: 'add' | 'edit' | 'view'): void {
    const ref = this.modal.open(SavePaginaInformativaComponent, {
      size: 'xl', backdrop: 'static', keyboard: accion === 'view', centered: true,
    });
    ref.componentInstance.registro_selected = registro;
    ref.componentInstance.accion = accion;
    ref.componentInstance.grupos = this.grupos;

    ref.result.then(() => this.cargar(), () => { /* se cerró sin guardar */ });
  }

  /** La palanca: sin valor, el servidor alterna. */
  async alternarPagina(pagina: PaginaInformativaModel): Promise<void> {
    if (this._seguridadService.isexpired() || !this.puedeEditar || this.trabajando) { return; }

    this.trabajando = true;
    try {
      const res: any = await firstValueFrom(this._paginaService.activarPaginaInformativa(pagina.id));
      pagina.activo = res?.data?.activo !== false;
      this._toastr.success(res?.message ?? 'Listo', 'Listo');
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo cambiar el estado', 'Error',
                         { timeOut: 15000, closeButton: true });
    } finally {
      this.trabajando = false;
    }
  }

  async borrarPagina(pagina: PaginaInformativaModel): Promise<void> {
    if (this._seguridadService.isexpired() || !this.puedeEliminar || this.trabajando) { return; }

    // Una fija ni siquiera enseña el botón, pero el servidor se niega igual
    if (!confirm(`¿Enviar «${pagina.titulo}» a la papelera?\n\n`
                 + 'Dejará de verse en la tienda. Se puede restaurar desde la papelera.')) {
      return;
    }

    this.trabajando = true;
    try {
      const res: any = await firstValueFrom(this._paginaService.deletePaginaInformativa(pagina.id));
      this._toastr.success(res?.message ?? 'Enviada a la papelera', 'Listo');
      await this.cargar();
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo eliminar la página', 'Error',
                         { timeOut: 15000, closeButton: true });
    } finally {
      this.trabajando = false;
    }
  }

  // ================================================================
  // CARPETAS
  // ================================================================

  nuevaCarpeta(): void {
    if (this._seguridadService.isexpired() || !this.puedeCrear) { return; }
    this.abrirCarpeta(null);
  }

  renombrarCarpeta(grupo: GrupoPaginaModel): void {
    if (this._seguridadService.isexpired() || !this.puedeEditar) { return; }
    this.abrirCarpeta(grupo);
  }

  private abrirCarpeta(grupo: GrupoPaginaModel | null): void {
    const ref = this.modal.open(GrupoPaginaComponent, { size: 'md', backdrop: 'static', centered: true });
    ref.componentInstance.grupo = grupo;
    ref.result.then(() => this.cargar(), () => { /* se cerró sin guardar */ });
  }

  /**
   * Borrar una carpeta SE LLEVA SUS PÁGINAS, y hay que decirlo antes.
   *
   * El CRM viejo lo prohibía mientras tuviera documentos dentro y obligaba a
   * vaciarla a mano una por una. Aquí se permite porque es reversible:
   * restaurar la carpeta devuelve exactamente las que se fueron con ella.
   */
  async borrarCarpeta(bloque: CarpetaEnPantalla): Promise<void> {
    if (this._seguridadService.isexpired() || !this.puedeEliminar || this.trabajando) { return; }
    if (!bloque.grupo) { return; }

    const cuantas = bloque.paginas.length;
    const aviso = cuantas === 0
      ? `¿Enviar la carpeta «${bloque.grupo.nombre}» a la papelera?`
      : `La carpeta «${bloque.grupo.nombre}» tiene ${cuantas === 1 ? '1 página' : cuantas + ' páginas'} dentro, `
        + 'y se van con ella: dejarán de verse en la tienda.\n\n'
        + 'Restaurar la carpeta las devuelve todas. ¿Seguir?';

    if (!confirm(aviso)) { return; }

    this.trabajando = true;
    try {
      const res: any = await firstValueFrom(this._paginaService.deleteGrupo(bloque.grupo.id));
      this._toastr.success(res?.message ?? 'Enviada a la papelera', 'Listo');
      await this.cargar();
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo eliminar la carpeta', 'Error',
                         { timeOut: 15000, closeButton: true });
    } finally {
      this.trabajando = false;
    }
  }

  // ================================================================
  // PAPELERA
  // ================================================================

  abrirPapelera(): void {
    if (this._seguridadService.isexpired()) { return; }

    const ref = this.modal.open(PapeleraPaginasInformativasComponent, {
      size: 'lg', backdrop: 'static', centered: true,
    });
    ref.componentInstance.puedeVaciar = this.puedeVaciar;

    // Sólo se recarga si de verdad se restauró o se vació algo
    ref.result.then((hubo: boolean) => { if (hubo) { this.cargar(); } }, () => { /* cerrada */ });
  }

  /** La dirección con la que se abre en la tienda, para el enlace de «ver». */
  urlEnLaTienda(pagina: PaginaInformativaModel): string {
    return '/paginas/' + pagina.clave;
  }
}
