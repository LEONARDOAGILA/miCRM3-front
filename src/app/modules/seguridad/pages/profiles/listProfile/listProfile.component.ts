import { Component, ElementRef, EventEmitter, Input, OnInit, Output, QueryList, ViewChild, ViewChildren } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

import { ProfileService } from '../../../../seguridad/services/profile.service';
import { LoadingService } from '../../../../../service/loading.service';
import { CampoBusquedaPaginacionComponent } from '../../../../../components/campos/campoBusquedaPaginacion/campoBusquedaPaginacion.component';

/**
 * Selector de perfil.
 *
 * Antes montaba un ag-Grid completo para listar 5 filas de {id, nombre,
 * inactividad}, y la selección sólo funcionaba pulsando la flecha de la última
 * columna: hacer clic en el nombre del perfil no hacía nada. Ahora cada fila es
 * un <button>, así que se selecciona haciendo clic en cualquier punto y el
 * teclado funciona de forma nativa.
 */
@Component({
  selector: 'app-listProfile',
  templateUrl: './listProfile.component.html',
  styleUrls: ['./listProfile.component.css'],
  standalone: false,
})
export class ListProfileComponent implements OnInit {

  /** Perfil ya asignado, para marcarlo como «Actual» en la lista. */
  @Input() perfilSeleccionadoId?: number;

  @Output() seleccionado = new EventEmitter<any>();

  @ViewChild(CampoBusquedaPaginacionComponent) campoBusquedaPaginacion!: CampoBusquedaPaginacionComponent;
  @ViewChildren('filaPerfil') filas!: QueryList<ElementRef<HTMLButtonElement>>;

  public rowData: any[] = [];
  public searchTerm: string = '';

  /** Fila con el foco del teclado (patrón roving tabindex). */
  public indiceActivo = 0;

  // Paginación
  public paginaActual: number = 1;
  public totalRegistros: number = 0;
  public registrosPorPagina: number = 5;
  public ultimaPagina: number = 1;

  public isLoading$ = this._loadingService.isLoading$;

  constructor(
    public modal: NgbActiveModal,
    private _profileService: ProfileService,
    private _loadingService: LoadingService
  ) {}

  ngOnInit(): void {
    this.cargarPerfiles();
  }

  /** Primer registro mostrado; 0 cuando no hay resultados. */
  public get desde(): number {
    return this.totalRegistros === 0 ? 0 : (this.paginaActual - 1) * this.registrosPorPagina + 1;
  }

  /** Último registro mostrado, sin pasarse del total. */
  public get hasta(): number {
    return Math.min(this.paginaActual * this.registrosPorPagina, this.totalRegistros);
  }

  public seleccionar(perfil: any): void {
    this.seleccionado.emit(perfil);
    this.modal.close();
  }

  /**
   * Flechas para recorrer la lista, Inicio/Fin para saltar a los extremos.
   * Enter y Espacio los gestiona el propio <button>.
   */
  public onListaKeydown(event: KeyboardEvent): void {
    const ultimo = this.rowData.length - 1;
    if (ultimo < 0) { return; }

    let destino: number | null = null;

    switch (event.key) {
      case 'ArrowDown': destino = Math.min(this.indiceActivo + 1, ultimo); break;
      case 'ArrowUp':   destino = Math.max(this.indiceActivo - 1, 0); break;
      case 'Home':      destino = 0; break;
      case 'End':       destino = ultimo; break;
      default: return;
    }

    event.preventDefault();
    this.indiceActivo = destino;
    this.filas?.get(destino)?.nativeElement.focus();
  }

  async cargarPerfiles(page: number = 1) {
    try {
      this._loadingService.setLoading(true);
      const res = await firstValueFrom(
        this._profileService.listProfiles(page, this.registrosPorPagina, this.searchTerm)
      );

      this.rowData = res.body?.data?.data || [];
      this.indiceActivo = 0;

      if (res.body?.data?.meta) {
        this.totalRegistros = res.body.data.meta.total;
        this.registrosPorPagina = res.body.data.meta.per_page;
        this.paginaActual = res.body.data.meta.current_page;
        this.ultimaPagina = res.body.data.meta.last_page;
      }
    } catch (error) {
      // El AuthInterceptor ya muestra el toast del error HTTP
      console.error('Error al cargar perfiles:', error);
      this.rowData = [];
      this.totalRegistros = 0;
      this.ultimaPagina = 1;
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  async onSearch(term?: string) {
    if (term !== undefined) this.searchTerm = term;
    this.paginaActual = 1;
    await this.cargarPerfiles(1);
  }

  limpiarBusqueda() {
    this.searchTerm = '';
    this.paginaActual = 1;
    this.campoBusquedaPaginacion?.reset();
    this.cargarPerfiles(1);
  }

  // Paginación
  firstPage(): void {
    if (this.paginaActual !== 1) { this.goToPage(1); }
  }

  lastPage(): void {
    if (this.paginaActual !== this.ultimaPagina) { this.goToPage(this.ultimaPagina); }
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.ultimaPagina) return;
    this.paginaActual = page;
    this.cargarPerfiles(page);
  }

  nextPage(): void {
    this.goToPage(this.paginaActual + 1);
  }

  prevPage(): void {
    this.goToPage(this.paginaActual - 1);
  }
}
