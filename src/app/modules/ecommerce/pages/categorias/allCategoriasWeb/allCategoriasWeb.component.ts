import { Component, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { firstValueFrom } from 'rxjs';

import { SeguridadService } from '../../../../seguridad/services/seguridad.service';
import { AccesoModel } from '../../../../seguridad/interfaces/accesoModel';
import { CategoriaWebService } from '../../../services/categoriaWeb.service';
import { CategoriaWebModel, ESTADOS_CATEGORIA } from '../../../interfaces/categoriaWebModel';

import { PanelComponent } from '../../../../../components/panel/panel.component';
import { SaveCategoriaWebComponent } from '../saveCategoriaWeb/saveCategoriaWeb.component';

/**
 * LAS CATEGORÍAS DE LA TIENDA (ecommerce.categorias_web).
 *
 * El árbol es el del catálogo. Aquí sólo se decide DOS COSAS: qué ramas salen
 * en la tienda y con qué nombre se enseñan. Crear, borrar y reordenar es de
 * Inventarios → Categorías, y la pantalla lo dice para que nadie lo busque.
 *
 * LO QUE LA HACE ÚTIL ES EL PORQUÉ. Una categoría puede no salir por cuatro
 * motivos distintos y cada uno se arregla en otro sitio: la apagaste tú, la
 * apagó un padre, está inactiva en el catálogo, o no tiene ninguna categoría
 * de producto debajo. Una palanca a secas dejaría al que mira preguntándose
 * por qué su categoría encendida no aparece en la tienda.
 *
 * SE PINTA PLANO CON SANGRÍA, no con nodos que se abren y cierran. Son
 * treinta y tres en tres niveles: plegarlas escondería justamente lo que se
 * viene a mirar, que es el conjunto.
 */
@Component({
  selector: 'app-allCategoriasWeb',
  templateUrl: './allCategoriasWeb.component.html',
  styleUrls: ['./allCategoriasWeb.component.css'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [CommonModule, RouterLink, PanelComponent],
})
export class AllCategoriasWebComponent implements OnInit {

  public titulo = 'Categorías de la tienda';
  public accesoModel!: AccesoModel;

  public categorias: CategoriaWebModel[] = [];
  public cargando = true;
  public trabajando = false;

  /** Para no pintar cuatro veces la misma rama apagada. */
  public readonly estados = ESTADOS_CATEGORIA;

  private _categoriaService = inject(CategoriaWebService);
  private _seguridadService = inject(SeguridadService);
  private _toastr = inject(ToastrService);
  private modal = inject(NgbModal);
  private activeRoute = inject(ActivatedRoute);

  get puedeEditar(): boolean { return this.accesoModel?.editar === true; }

  get visibles(): number {
    return this.categorias.filter(c => c.estado === 'visible').length;
  }

  /** Las que no salen por algo que NO se arregla aquí: conviene destacarlo. */
  get conProblema(): number {
    return this.categorias.filter(c => c.estado === 'inactiva'
                                    || c.estado === 'sin_categorias_de_producto').length;
  }

  ngOnInit(): void {
    this.accesoModel = this.activeRoute.snapshot.data['access'];
    this.cargar();
  }

  async cargar(): Promise<void> {
    this.cargando = true;
    try {
      const res: any = await firstValueFrom(this._categoriaService.allCategoriasWeb());
      this.categorias = res?.data ?? [];
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudieron cargar las categorías', 'Error',
                         { timeOut: 15000, closeButton: true });
    } finally {
      this.cargando = false;
    }
  }

  // ---------- Lo que se enseña de cada fila ----------

  etiqueta(c: CategoriaWebModel) { return this.estados[c.estado] ?? this.estados['visible']; }

  /** La sangría del árbol: nivel 0 son los departamentos. */
  sangria(c: CategoriaWebModel): string { return (c.nivel ?? 0) * 1.5 + 'rem'; }

  /** Tiene nombre propio para la tienda, distinto del catálogo. */
  renombrada(c: CategoriaWebModel): boolean {
    return !!c.nombre_web && c.nombre_web !== c.nombre_catalogo;
  }

  /**
   * La palanca sólo sirve donde arregla algo. Si está oculta por su padre, o
   * inactiva, o no tiene productos debajo, encenderla aquí no la haría
   * aparecer: el aviso dice dónde ir.
   */
  palancaUtil(c: CategoriaWebModel): boolean {
    return this.puedeEditar && (c.estado === 'visible' || c.estado === 'oculta');
  }

  // ---------- Acciones ----------

  async alternar(c: CategoriaWebModel): Promise<void> {
    if (this._seguridadService.isexpired() || !this.palancaUtil(c) || this.trabajando) { return; }

    // Apagar una rama apaga todo lo que cuelga: conviene decirlo antes
    const hijas = this.categorias.filter(x => x.padre_id === c.id).length;
    if (!c.oculta && hijas > 0) {
      if (!confirm(`«${c.nombre}» tiene ${hijas === 1 ? '1 categoría' : hijas + ' categorías'} debajo, `
                   + 'y dejarán de salir en la tienda también.\n\n¿Seguir?')) {
        return;
      }
    }

    await this.guardar(c, { oculta: !c.oculta, nombre_web: c.nombre_web ?? null });
  }

  editarNombre(c: CategoriaWebModel): void {
    if (this._seguridadService.isexpired() || !this.puedeEditar) { return; }

    const ref = this.modal.open(SaveCategoriaWebComponent,
                                { size: 'md', backdrop: 'static', centered: true });
    ref.componentInstance.categoria = c;
    ref.result.then((data: any) => { if (data) { this.categorias = data; } },
                    () => { /* se cerró sin guardar */ });
  }

  private async guardar(c: CategoriaWebModel, datos: any): Promise<void> {
    this.trabajando = true;
    try {
      const res: any = await firstValueFrom(this._categoriaService.editCategoriaWeb(c.id, datos));
      this._toastr.success(res?.message ?? 'Listo', 'Listo');
      // Vuelve el árbol entero: apagar una rama cambia el estado de otras
      this.categorias = res?.data ?? this.categorias;
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo guardar', 'Error',
                         { timeOut: 15000, closeButton: true });
    } finally {
      this.trabajando = false;
    }
  }
}
