import { Component, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';
import {
  CdkDrag, CdkDragDrop, CdkDragHandle, CdkDragPlaceholder, CdkDropList, moveItemInArray,
} from '@angular/cdk/drag-drop';

import { SeguridadService } from '../../../../seguridad/services/seguridad.service';
import { AccesoModel } from '../../../../seguridad/interfaces/accesoModel';
import { PieService } from '../../../services/pie.service';
import {
  ColumnaPieModel, EnlacePieModel, PieModel, REDES_TIENDA,
} from '../../../interfaces/pieModel';

import { PanelComponent } from '../../../../../components/panel/panel.component';
import { TabPanelComponent, PestanaTab } from '../../../../../components/campos/tabPanel/tabPanel.component';
import { CampoTextoComponent } from '../../../../../components/campos/campoTexto/campoTexto.component';
import { CheckboxComponent } from '../../../../../components/campos/checkbox/checkbox.component';
import { SavePiePiezaComponent } from '../savePiePieza/savePiePieza.component';
import { PapeleraPieComponent } from '../papeleraPie/papeleraPie.component';

/**
 * EL PIE DE LA TIENDA (ecommerce.pie + pie_columnas + pie_enlaces).
 *
 * DOS PESTAÑAS, por lo mismo que el encabezado: las REDES son un formulario
 * que se revisa junto y se guarda con un botón; las COLUMNAS se arrastran y se
 * guardan al momento.
 *
 * LAS REDES SON UNA LISTA FIJA y no una tabla: la tienda tiene el dibujo de
 * cada una, así que no se pueden añadir las que ella no sabe pintar. Lo que se
 * hace es encenderlas y ponerles su dirección. Una red APAGADA puede quedarse
 * sin dirección —así se deja a medias y se termina otro día—; encendida, la
 * dirección es obligatoria, y de eso se encarga el servidor.
 *
 * SE PARECE AL ENCABEZADO PERO NO ES IGUAL: allí el segundo nivel es un
 * desplegable y un principal puede no llevar dirección. Aquí la columna es un
 * TÍTULO, nunca un enlace, y todo lo de dentro necesita dirección.
 */
@Component({
  selector: 'app-editPie',
  templateUrl: './editPie.component.html',
  styleUrls: ['./editPie.component.css'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    CommonModule, RouterLink, ReactiveFormsModule,
    PanelComponent, TabPanelComponent, CampoTextoComponent, CheckboxComponent,
    CdkDropList, CdkDrag, CdkDragHandle, CdkDragPlaceholder,
  ],
})
export class EditPieComponent implements OnInit {

  public titulo = 'Pie de página';
  public accesoModel!: AccesoModel;

  public modelo: PieModel | null = null;
  public form!: FormGroup;

  public cargando = true;
  public guardando = false;
  public trabajando = false;

  public readonly pestanas: PestanaTab[] = [
    { id: 'redes',    texto: 'Redes sociales', icono: 'fa-solid fa-share-nodes' },
    { id: 'columnas', texto: 'Columnas',       icono: 'fa-solid fa-table-columns' },
  ];
  public pestana: 'redes' | 'columnas' = 'redes';

  private _pieService = inject(PieService);
  private _seguridadService = inject(SeguridadService);
  private _toastr = inject(ToastrService);
  private modal = inject(NgbModal);
  private fb = inject(FormBuilder);
  private activeRoute = inject(ActivatedRoute);

  get puedeEditar(): boolean { return this.accesoModel?.editar === true; }
  get puedeCrear(): boolean { return this.accesoModel?.crear === true; }
  get puedeEliminar(): boolean { return this.accesoModel?.eliminar === true; }
  get puedeVaciar(): boolean { return this.accesoModel?.vaciar === true; }

  get columnas(): ColumnaPieModel[] { return this.modelo?.columnas ?? []; }
  get redes(): FormArray { return this.form.controls['redes'] as FormArray; }

  ngOnInit(): void {
    this.accesoModel = this.activeRoute.snapshot.data['access'];
    this.form = this.fb.group({ redes: this.fb.array([]) });
    this.cargar();
  }

  // ================================================================
  // CARGA
  // ================================================================

  async cargar(): Promise<void> {
    this.cargando = true;
    try {
      const res: any = await firstValueFrom(this._pieService.getPie());
      this.pintar(res?.data);
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo cargar el pie', 'Error',
                         { timeOut: 15000, closeButton: true });
    } finally {
      this.cargando = false;
    }
  }

  private pintar(data: PieModel | null | undefined): void {
    if (!data) { return; }
    this.modelo = data;

    // La lista de redes la manda la tienda, no la base: se recorren TODAS las
    // que sabe pintar y se rellena la que ya esté configurada. Así aparece
    // siempre la fila para encender una que aún no se usa.
    const guardadas = new Map((data.config?.redes ?? []).map(r => [r.tipo, r]));

    this.redes.clear();
    for (const red of REDES_TIENDA) {
      const g = guardadas.get(red.id);
      this.redes.push(this.fb.group({
        tipo:   [red.id],
        nombre: [red.name],
        enlace: [g?.enlace ?? '', [Validators.maxLength(250)]],
        activo: [g?.activo === true],
      }));
    }

    if (!this.puedeEditar) { this.form.disable(); }
  }

  controlRed(indice: number): FormGroup { return this.redes.at(indice) as FormGroup; }
  ctrlRedActivo(indice: number): FormControl {
    return this.controlRed(indice).controls['activo'] as FormControl;
  }

  // ================================================================
  // REDES
  // ================================================================

  async guardarRedes(): Promise<void> {
    if (!this.puedeEditar || this.guardando) { return; }

    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.pestana = 'redes';
      this._toastr.error('Revise las direcciones.', 'No se puede guardar',
                         { timeOut: 20000, closeButton: true });
      return;
    }

    // Sólo van las que tienen algo: una red apagada y sin dirección no hace
    // falta guardarla, y así la configuración no se llena de huecos.
    const redes = this.redes.getRawValue()
      .filter((r: any) => r.activo || (r.enlace ?? '').trim())
      .map((r: any) => ({ tipo: r.tipo, enlace: (r.enlace ?? '').trim() || null, activo: r.activo === true }));

    this.guardando = true;
    try {
      const res: any = await firstValueFrom(this._pieService.editPie({ redes }));
      this._toastr.success(res?.message ?? 'Pie guardado', 'Listo');
      this.pintar(res?.data);
    } catch (e: any) {
      // El servidor exige dirección a la red ENCENDIDA; aquí no se repite
      this._toastr.error(e?.error?.message ?? 'No se pudo guardar el pie', 'Error',
                         { timeOut: 20000, closeButton: true });
    } finally {
      this.guardando = false;
    }
  }

  // ================================================================
  // COLUMNAS Y ENLACES
  // ================================================================

  nuevaColumna(): void { this.abrirPieza('columna', null, null, ''); }

  editarColumna(columna: ColumnaPieModel): void { this.abrirPieza('columna', columna, null, ''); }

  nuevoEnlace(columna: ColumnaPieModel): void {
    this.abrirPieza('enlace', null, columna.id, columna.titulo);
  }

  editarEnlace(enlace: EnlacePieModel): void { this.abrirPieza('enlace', enlace, null, ''); }

  private abrirPieza(tipo: 'columna' | 'enlace', pieza: any,
                     columnaId: number | null, columnaTitulo: string): void {
    if (this._seguridadService.isexpired()) { return; }
    if (!(pieza ? this.puedeEditar : this.puedeCrear)) { return; }

    const ref = this.modal.open(SavePiePiezaComponent, { size: 'md', backdrop: 'static', centered: true });
    ref.componentInstance.tipo = tipo;
    ref.componentInstance.pieza = pieza;
    ref.componentInstance.columnaId = columnaId;
    ref.componentInstance.columnaTitulo = columnaTitulo;

    ref.result.then((data: any) => this.pintar(data), () => { /* se cerró sin guardar */ });
  }

  async borrarColumna(columna: ColumnaPieModel): Promise<void> {
    if (this._seguridadService.isexpired() || !this.puedeEliminar || this.trabajando) { return; }

    const n = columna.enlaces?.length ?? 0;
    const aviso = n === 0
      ? `¿Enviar la columna «${columna.titulo}» a la papelera?`
      : `La columna «${columna.titulo}» tiene ${n === 1 ? '1 enlace' : n + ' enlaces'} dentro, y se van `
        + 'con ella.\n\nRestaurar la columna los devuelve. ¿Seguir?';

    if (!confirm(aviso)) { return; }
    await this.accion(() => this._pieService.deleteColumna(columna.id));
  }

  async borrarEnlace(enlace: EnlacePieModel): Promise<void> {
    if (this._seguridadService.isexpired() || !this.puedeEliminar || this.trabajando) { return; }
    if (!confirm(`¿Enviar «${enlace.texto}» a la papelera?`)) { return; }
    await this.accion(() => this._pieService.deleteEnlace(enlace.id));
  }

  private async accion(llamada: () => any): Promise<void> {
    this.trabajando = true;
    try {
      const res: any = await firstValueFrom(llamada());
      this._toastr.success(res?.message ?? 'Listo', 'Listo');
      this.pintar(res?.data);
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo completar la acción', 'Error',
                         { timeOut: 15000, closeButton: true });
    } finally {
      this.trabajando = false;
    }
  }

  // ---------- Orden ----------

  async soltarColumna(evento: CdkDragDrop<ColumnaPieModel[]>): Promise<void> {
    if (!this.puedeEditar || evento.previousIndex === evento.currentIndex || !this.modelo) { return; }

    moveItemInArray(this.modelo.columnas, evento.previousIndex, evento.currentIndex);
    await this.guardarOrden(() => this._pieService.ordenarColumnas(this.modelo!.columnas.map(c => c.id)));
  }

  async soltarEnlace(columna: ColumnaPieModel, evento: CdkDragDrop<EnlacePieModel[]>): Promise<void> {
    if (!this.puedeEditar || evento.previousIndex === evento.currentIndex) { return; }

    moveItemInArray(columna.enlaces, evento.previousIndex, evento.currentIndex);
    // Sólo los de ESTA columna: el orden es por columna
    await this.guardarOrden(() => this._pieService.ordenarEnlaces(columna.enlaces.map(e => e.id)));
  }

  private async guardarOrden(llamada: () => any): Promise<void> {
    this.trabajando = true;
    try {
      // Sin aviso: ver que se queda donde se soltó ya lo confirma
      const res: any = await firstValueFrom(llamada());
      this.pintar(res?.data);
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo guardar el orden', 'Error',
                         { timeOut: 15000, closeButton: true });
      await this.cargar();
    } finally {
      this.trabajando = false;
    }
  }

  // ================================================================
  // PAPELERA
  // ================================================================

  abrirPapelera(): void {
    if (this._seguridadService.isexpired()) { return; }

    const ref = this.modal.open(PapeleraPieComponent, { size: 'lg', backdrop: 'static', centered: true });
    ref.componentInstance.puedeVaciar = this.puedeVaciar;
    ref.result.then((hubo: boolean) => { if (hubo) { this.cargar(); } }, () => { /* cerrada */ });
  }
}
