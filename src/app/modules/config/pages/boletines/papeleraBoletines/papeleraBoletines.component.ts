import { Component, ElementRef, EventEmitter, HostListener, NgZone, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { CellClickedEvent, ColDef, GridApi, GridReadyEvent } from 'ag-grid-community';
import { ToastrService } from 'ngx-toastr';
import Swal from 'sweetalert2';

import { BoletinService } from '../../../services/boletin.service';
import { BoletinModel } from '../../../interfaces/boletinModel';
import { AppAgGridService } from '../../../../../service/app-agGrid.service';
import { LoadingService } from '../../../../../service/loading.service';
import { VerBoletinesComponent } from '../verBoletines/verBoletines.component';

/**
 * Papelera de reciclaje de boletines (modal), calcada de la de usuarios.
 *
 * "Eliminar" un boletín es un borrado lógico (deleted_at / deleted_by): deja
 * de mostrarse a nadie y acaba aquí. Desde aquí se restaura tal como estaba o
 * se borra de verdad —uno, varios (casillas) o vaciando la papelera—, y en ese
 * caso se borran también sus imágenes, videos y audios del servidor.
 *
 * Emite `cambio` cada vez que algo sale de la papelera, para que el listado
 * que la abrió recargue. Sin suscripciones vivas: firstValueFrom.
 */
@Component({
  selector: 'app-papeleraBoletines',
  templateUrl: './papeleraBoletines.component.html',
  styleUrls: ['./papeleraBoletines.component.css'],
  standalone: false,
})
export class PapeleraBoletinesComponent implements OnInit, OnDestroy {

  /** Algo se restauró o se borró: el listado ya no es fiel. */
  @Output() cambio = new EventEmitter<void>();

  public isLoading$ = this._loadingService.isLoading$;
  public items: BoletinModel[] = [];
  public seleccionado: BoletinModel | null = null;

  public gridApi!: GridApi;
  public columnDefs: ColDef[] = [];

  // ---------- Menú contextual (clic derecho) ----------
  menuCtx = { visible: false, x: 0, y: 0, elemento: null as BoletinModel | null, lote: [] as BoletinModel[] };
  @ViewChild('menuCtxEl') menuCtxEl?: ElementRef<HTMLElement>;
  private readonly cerrarMenuPorScroll = () => {
    if (this.menuCtx.visible) { this.ngZone.run(() => this.cerrarMenu()); }
  };

  constructor(
    public modal: NgbActiveModal,
    private modalService: NgbModal,
    private _boletinService: BoletinService,
    private _toastr: ToastrService,
    private _loadingService: LoadingService,
    public _appAgGridService: AppAgGridService,
    private ngZone: NgZone,
  ) {}

  ngOnInit(): void {
    this.initializeGrid();
    this.cargar();
    this.ngZone.runOutsideAngular(() => document.addEventListener('scroll', this.cerrarMenuPorScroll, true));
  }

  ngOnDestroy(): void {
    document.removeEventListener('scroll', this.cerrarMenuPorScroll, true);
  }

  // ================================================================
  // SELECCIÓN
  // ================================================================

  /** Sobre qué actúan los botones: las filas marcadas, o la fila pulsada. */
  get lote(): BoletinModel[] {
    const sel = (this.gridApi?.getSelectedRows() ?? []) as BoletinModel[];
    return sel.length ? sel : (this.seleccionado ? [this.seleccionado] : []);
  }

  private loteDe(b: BoletinModel): BoletinModel[] {
    const sel = (this.gridApi?.getSelectedRows() ?? []) as BoletinModel[];
    return sel.some(s => s.id === b.id) ? sel : [b];
  }

  private escapeHtml(s: string): string {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ================================================================
  // MENÚ CONTEXTUAL
  // ================================================================

  onContextMenuGrilla(e: MouseEvent): void {
    if ((e.target as HTMLElement).closest('.ag-header')) { return; }
    e.preventDefault();
    const fila = (e.target as HTMLElement).closest('.ag-row') as HTMLElement | null;
    let elemento: BoletinModel | null = null;
    if (fila) {
      const nodo = this.gridApi?.getDisplayedRowAtIndex(Number(fila.getAttribute('row-index')));
      elemento = (nodo?.data as BoletinModel) ?? null;
      if (nodo && !nodo.isSelected()) { nodo.setSelected(true, true); }
      this.seleccionado = elemento;
    }
    this.menuCtx = { visible: true, x: e.clientX, y: e.clientY, elemento, lote: elemento ? this.loteDe(elemento) : [] };
    setTimeout(() => {
      const el = this.menuCtxEl?.nativeElement;
      if (!el) { return; }
      const r = el.getBoundingClientRect();
      if (r.right > window.innerWidth)   { this.menuCtx.x = Math.max(0, window.innerWidth - r.width - 8); }
      if (r.bottom > window.innerHeight) { this.menuCtx.y = Math.max(0, window.innerHeight - r.height - 8); }
    });
  }

  cerrarMenu(): void {
    if (this.menuCtx.visible) { this.menuCtx.visible = false; }
  }

  @HostListener('document:click')
  @HostListener('document:keydown.escape')
  @HostListener('window:resize')
  onCerrarMenuGlobal(): void { this.cerrarMenu(); }

  // ================================================================
  // GRILLA
  // ================================================================

  initializeGrid(): void {
    this.columnDefs = [
      {
        headerName: 'Boletín', field: 'titulo', flex: 1, minWidth: 220, cellStyle: { textAlign: 'left' },
        checkboxSelection: true, headerCheckboxSelection: true,
        cellRenderer: (p: any) => {
          const obligatorio = p.data?.obligatorio
            ? '<i class="fa fa-circle-exclamation pb-obligatorio" title="Lectura obligatoria"></i>'
            : '';
          return `<span class="pb-titulo">${obligatorio}<span class="text-truncate">${this.escapeHtml(p.value ?? '')}</span></span>`;
        },
      },
      {
        headerName: 'Contenido', width: 150, cellStyle: { textAlign: 'left' },
        headerTooltip: 'Imágenes, videos y audios del carrusel',
        valueGetter: p => this.resumenContenido(p.data),
      },
      { headerName: 'Rige desde', field: 'desde', width: 115, maxWidth: 130, cellStyle: { textAlign: 'center' } },
      { headerName: 'Hasta', field: 'hasta', width: 115, maxWidth: 130, cellStyle: { textAlign: 'center' } },
      {
        headerName: 'Eliminado', field: 'deleted_at', width: 160, maxWidth: 175, cellStyle: { textAlign: 'center' },
        headerTooltip: 'Cuándo se envió a la papelera',
      },
      {
        headerName: 'Eliminado por', width: 130, maxWidth: 160, cellStyle: { textAlign: 'left' },
        headerTooltip: 'Usuario que lo envió a la papelera',
        valueGetter: p => (p.data as any)?.deleted_by || '—',
      },
    ];
  }

  /** «3 imágenes · 1 video» para la columna de contenido. */
  resumenContenido(b: any): string {
    const laminas = b?.imagenes ?? [];
    if (!laminas.length) { return 'Sin contenido'; }
    const cuenta = { IMAGEN: 0, VIDEO: 0, AUDIO: 0 } as Record<string, number>;
    laminas.forEach((i: any) => cuenta[i.tipo ?? 'IMAGEN']++);
    const partes: string[] = [];
    if (cuenta['IMAGEN']) { partes.push(cuenta['IMAGEN'] === 1 ? '1 imagen' : `${cuenta['IMAGEN']} imágenes`); }
    if (cuenta['VIDEO'])  { partes.push(cuenta['VIDEO'] === 1 ? '1 video' : `${cuenta['VIDEO']} videos`); }
    if (cuenta['AUDIO'])  { partes.push(cuenta['AUDIO'] === 1 ? '1 audio' : `${cuenta['AUDIO']} audios`); }
    return partes.join(' · ');
  }

  onGridReady(params: GridReadyEvent): void {
    this.gridApi = params.api;
    this.gridApi.setRowData(this.items);
  }

  navegarConTeclado = this._appAgGridService.navegacionConFlechas(fila => this.seleccionado = fila);

  onCellClicked(e: CellClickedEvent): void {
    this.seleccionado = e.data as BoletinModel;
  }

  // ================================================================
  // DATOS
  // ================================================================

  async cargar(): Promise<void> {
    try {
      this._loadingService.setLoading(true);
      const res = await firstValueFrom(this._boletinService.papelera()) as any;
      this.items = res?.status === 'success' ? (res.data ?? []) : [];
      this.seleccionado = null;
      this.gridApi?.setRowData(this.items);
    } catch (error) {
      console.error('Error al cargar la papelera:', error);
      this.items = [];
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  // ================================================================
  // ACCIONES
  // ================================================================

  private nombres(lote: BoletinModel[]): string {
    return lote.length === 1 ? `«${lote[0].titulo}»` : `${lote.length} boletines`;
  }

  /** Ver cómo era antes de decidir si se restaura o se borra. */
  previsualizar(b?: BoletinModel | null): void {
    const boletin = b ?? this.lote[0];
    if (!boletin) { return; }
    if (!(boletin.imagenes ?? []).length) {
      this._toastr.info('Este boletín no tiene contenido que mostrar', 'Papelera');
      return;
    }
    const modalRef = this.modalService.open(VerBoletinesComponent, {
      size: 'xl', centered: true, backdrop: 'static', windowClass: 'bol-modal', backdropClass: 'bol-backdrop',
    });
    modalRef.componentInstance.boletines = [boletin];
    modalRef.componentInstance.vistaPrevia = true;
  }

  async restaurar(boletines?: BoletinModel[]): Promise<void> {
    const lote = boletines?.length ? boletines : this.lote;
    if (!lote.length) { return; }
    try {
      this._loadingService.setLoading(true);
      let bien = 0;
      for (const b of lote) {
        const res = await firstValueFrom(this._boletinService.restaurarBoletin(b.id)) as any;
        if (res?.status === 'success') { bien++; }
        else { this._toastr.error(res?.message || `No se pudo restaurar «${b.titulo}»`, 'Error'); }
      }
      if (bien) {
        this._toastr.success(bien === 1 ? 'Boletín restaurado' : `${bien} boletines restaurados`, 'Restaurado', { closeButton: true });
        this.cambio.emit();
        await this.cargar();
      }
    } catch (error) {
      console.error('Error al restaurar:', error);
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  /** Borrado real: pide confirmación porque no hay vuelta atrás. */
  async eliminarDefinitivo(boletines?: BoletinModel[]): Promise<void> {
    const lote = boletines?.length ? boletines : this.lote;
    if (!lote.length) { return; }

    const confirmado = await this.confirmar(
      `¿Eliminar definitivamente ${this.nombres(lote)}?`,
      'Se borrará de forma permanente, con sus imágenes, videos y audios. Su historial de auditoría se conserva. Esta acción no se puede deshacer.'
    );
    if (!confirmado) { return; }

    try {
      this._loadingService.setLoading(true);
      let bien = 0;
      for (const b of lote) {
        const res = await firstValueFrom(this._boletinService.eliminarDefinitivo(b.id)) as any;
        if (res?.status === 'success') { bien++; }
        else { this._toastr.error(res?.message || `No se pudo eliminar «${b.titulo}»`, 'Error'); }
      }
      if (bien) {
        this._toastr.success(bien === 1 ? 'Boletín eliminado' : `${bien} boletines eliminados`, 'Eliminado', { closeButton: true });
        this.cambio.emit();
        await this.cargar();
      }
    } catch (error) {
      console.error('Error al eliminar definitivamente:', error);
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  async vaciar(): Promise<void> {
    if (!this.items.length) { return; }

    const confirmado = await this.confirmar(
      '¿Vaciar la papelera?',
      `Se borrarán de forma permanente ${this.items.length} ${this.items.length === 1 ? 'boletín' : 'boletines'}, con todo su contenido. Esta acción no se puede deshacer.`
    );
    if (!confirmado) { return; }

    try {
      this._loadingService.setLoading(true);
      const res = await firstValueFrom(this._boletinService.vaciarPapelera()) as any;
      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo vaciar la papelera', 'Error');
        return;
      }
      this._toastr.success(res.message, 'Papelera vacía', { closeButton: true });
      this.cambio.emit();
      await this.cargar();
    } catch (error) {
      console.error('Error al vaciar la papelera:', error);
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  /** Confirmación destructiva con SweetAlert2, la misma que la papelera de usuarios. */
  private async confirmar(titulo: string, texto: string): Promise<boolean> {
    const r = await Swal.fire({
      title: titulo,
      text: texto,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      reverseButtons: true,
    });
    return r.isConfirmed;
  }
}
