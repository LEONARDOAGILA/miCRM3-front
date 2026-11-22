import { Component, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbModal, NgbDropdownModule } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';
import {
  CdkDrag, CdkDragDrop, CdkDragHandle, CdkDragPlaceholder, CdkDropList, moveItemInArray,
} from '@angular/cdk/drag-drop';

import { SeguridadService } from '../../../../seguridad/services/seguridad.service';
import { AccesoModel } from '../../../../seguridad/interfaces/accesoModel';
import { PieService } from '../../../services/pie.service';
import {
  ColumnaPieModel, EnlacePieModel, PieModel, REDES_SUGERIDAS, ZonaPie,
  FUENTES_TIENDA, FuenteTienda,
} from '../../../interfaces/pieModel';
import { cargarLetrasDeLaTienda } from '../../../interfaces/letrasTienda';

import { PanelComponent } from '../../../../../components/panel/panel.component';
import { TabPanelComponent, PestanaTab } from '../../../../../components/campos/tabPanel/tabPanel.component';
import { CampoTextoComponent } from '../../../../../components/campos/campoTexto/campoTexto.component';
import { CheckboxComponent } from '../../../../../components/campos/checkbox/checkbox.component';
import { CampoNumeroEnteroComponent } from '../../../../../components/campos/campoNumeroEntero/campoNumeroEntero.component';
import { CampoColorComponent } from '../../../../../components/campos/campoColor/campoColor.component';
import { CampoIconoTiendaComponent } from '../../../../../components/campos/campoIconoTienda/campoIconoTienda.component';
import { IconoTiendaComponent } from '../../../../../components/campos/campoIconoTienda/iconoTienda.component';
import { SavePiePiezaComponent } from '../savePiePieza/savePiePieza.component';
import { PapeleraPieComponent } from '../papeleraPie/papeleraPie.component';

/**
 * EL PIE DE LA TIENDA (ecommerce.pie + pie_columnas + pie_enlaces).
 *
 * DOS PESTAÑAS, por lo mismo que el encabezado: las REDES son un formulario
 * que se revisa junto y se guarda con un botón; las COLUMNAS se arrastran y se
 * guardan al momento.
 *
 * LAS REDES SON UNA LISTA LIBRE desde el 07/11/2026: se añaden, se quitan y
 * se arrastran, y cada fila elige su dibujo. Antes eran siete filas fijas
 * porque el `tipo` («facebook») hacía de red, de nombre y de dibujo a la vez.
 * Encima de todas va el TÍTULO de la sección, que la tienda pinta donde hasta
 * entonces iba el logotipo.
 *
 * Una fila APAGADA puede quedarse a medias —así se deja y se termina otro
 * día—; encendida se le exige icono, nombre y dirección, y de eso se encarga
 * el servidor.
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
    CommonModule, RouterLink, ReactiveFormsModule, NgbDropdownModule,
    PanelComponent, TabPanelComponent, CampoTextoComponent, CheckboxComponent,
    CampoNumeroEnteroComponent, CampoColorComponent,
    CampoIconoTiendaComponent, IconoTiendaComponent,
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
    { id: 'abajo',    texto: 'Franja de abajo', icono: 'fa-solid fa-copyright' },
  ];
  public pestana: 'redes' | 'columnas' | 'abajo' = 'redes';

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

  /**
   * Las columnas, repartidas por franja.
   *
   * SON LOS MISMOS OBJETOS que los de modelo.columnas, no copias: moverlos al
   * arrastrar tiene que cambiar el orden de verdad. Se rehacen en pintar(),
   * que es cuando llega el pie del servidor.
   */
  public columnasArriba: ColumnaPieModel[] = [];
  public columnasAbajo: ColumnaPieModel[] = [];

  /** Las de arriba. Se llama así porque es como la pantalla las ha llamado siempre. */
  get columnas(): ColumnaPieModel[] { return this.columnasArriba; }
  get redes(): FormArray { return this.form.controls['redes'] as FormArray; }

  /** El de la línea de los derechos reservados, de la franja de abajo. */
  public formDerechos!: FormGroup;

  /** Las de un clic del menú «Añadir»; no es una lista cerrada. */
  public readonly sugeridas = REDES_SUGERIDAS;

  /** Las tres letras de la tienda, para los botones y para la muestra. */
  public readonly fuentes = FUENTES_TIENDA;

  /**
   * El blanco del pie y cuatro que se leen encima del rojo. No es una lista
   * cerrada —el cuentagotas sigue estando—, son los que se usan.
   */
  public readonly paletaTitulo = ['#ffffff', '#f8f9fa', '#ffe066', '#ffd23f', '#212529'];

  get ctrlEstilo(): FormGroup { return this.form.controls['titulo_redes_estilo'] as FormGroup; }
  get ctrlTamano(): FormControl { return this.ctrlEstilo.controls['tamano'] as FormControl; }
  get ctrlFuente(): FormControl { return this.ctrlEstilo.controls['fuente'] as FormControl; }

  /** El color elegido, o el blanco del pie para que la muestra se vea. */
  get colorTitulo(): string {
    return (this.ctrlEstilo.controls['color'].value ?? '') || '#ffffff';
  }

  /** Si hay uno elegido: con nulo manda la tienda, y eso se dice en el campo. */
  get hayColorTitulo(): boolean {
    return !!this.ctrlEstilo.controls['color'].value;
  }

  /** La letra de la muestra. Sin elegir, la de los títulos de la tienda. */
  get cssFuente(): string {
    const elegida = this.fuentes.find(f => f.id === this.ctrlFuente.value);
    return elegida?.css ?? this.fuentes[0].css;
  }

  ngOnInit(): void {
    this.accesoModel = this.activeRoute.snapshot.data['access'];
    this.form = this.fb.group({
      titulo_redes: ['', [Validators.maxLength(60)]],
      // Los tres en nulo = «el que la tienda le dé». Los topes son los
      // mismos que comprueba el servidor; aquí sólo evitan el viaje.
      titulo_redes_estilo: this.fb.group({
        tamano: [null as number | null, [Validators.min(10), Validators.max(60)]],
        color:  [null as string | null],
        fuente: [null as FuenteTienda | null],
      }),
      redes: this.fb.array([]),
    });

    // Los derechos van en SU PROPIO formulario, aparte del de las redes: se
    // guardan con su botón y guardar uno no tiene por qué arrastrar al otro.
    // La configuración del pie acepta que llegue sólo un trozo.
    this.formDerechos = this.fb.group({
      texto:        ['', [Validators.maxLength(200)]],
      enlace_texto: ['', [Validators.maxLength(60)]],
      enlace:       ['', [Validators.maxLength(250)]],
    });
    cargarLetrasDeLaTienda();
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

    this.form.controls['titulo_redes'].setValue(data.config?.titulo_redes ?? '');

    const estilo = data.config?.titulo_redes_estilo ?? {};
    this.ctrlEstilo.setValue({
      tamano: estilo.tamano ?? null,
      color:  estilo.color ?? null,
      fuente: estilo.fuente ?? null,
    });

    // Lo guardado y nada más: la lista es la que hay, en su orden. Antes se
    // recorrían las siete que la tienda sabía pintar y se rellenaba la que
    // estuviera configurada, porque no se podían añadir filas.
    this.redes.clear();
    for (const red of data.config?.redes ?? []) {
      this.redes.push(this.filaRed(red.icono, red.nombre, red.enlace, red.activo));
    }

    // Una columna sin zona es de las de antes del 08/11/2026: va arriba
    const columnas = data.columnas ?? [];
    this.columnasArriba = columnas.filter(c => (c.zona ?? 'arriba') === 'arriba');
    this.columnasAbajo  = columnas.filter(c => c.zona === 'abajo');

    const barra = data.config?.barra_inferior ?? {};
    this.formDerechos.setValue({
      texto:        barra.texto ?? '',
      enlace_texto: barra.enlace_texto ?? '',
      enlace:       barra.enlace ?? '',
    });

    if (!this.puedeEditar) { this.form.disable(); }
  }


  /**
   * El color del título.
   *
   * CADENA VACÍA ES «EL DE LA TIENDA», y se guarda como nulo: es lo que
   * manda app-campoColor cuando se pulsa «El blanco del pie».
   */
  ponerColorTitulo(color: string): void {
    if (!this.puedeEditar) { return; }
    this.ctrlEstilo.controls['color'].setValue((color ?? '').trim() || null);
    this.form.markAsDirty();
  }

  ponerFuente(fuente: FuenteTienda | null): void {
    if (!this.puedeEditar) { return; }
    this.ctrlFuente.setValue(fuente);
    this.form.markAsDirty();
  }

  /** Una fila del formulario de redes. Los avisos los da el servidor. */
  private filaRed(icono?: string | null, nombre?: string | null,
                  enlace?: string | null, activo?: boolean): FormGroup {
    return this.fb.group({
      icono:  [icono ?? ''],
      nombre: [nombre ?? '', [Validators.maxLength(40)]],
      enlace: [enlace ?? '', [Validators.maxLength(250)]],
      activo: [activo === true],
    });
  }

  controlRed(indice: number): FormGroup { return this.redes.at(indice) as FormGroup; }
  ctrlRedActivo(indice: number): FormControl {
    return this.controlRed(indice).controls['activo'] as FormControl;
  }

  // ================================================================
  // REDES
  // ================================================================

  /**
   * Una fila nueva, abajo del todo.
   *
   * NACE ENCENDIDA cuando viene de las sugeridas: se eligió «Facebook» para
   * ponerlo, no para dejarlo apagado. La de «Otro…» nace en blanco y apagada,
   * porque todavía no hay nada que enseñar.
   */
  anadirRed(sugerida?: { icono: string; nombre: string }): void {
    if (!this.puedeEditar) { return; }
    this.redes.push(this.filaRed(sugerida?.icono, sugerida?.nombre, '', false));
  }

  /**
   * Quita la fila de la pantalla.
   *
   * NO BORRA NADA TODAVÍA: hasta que no se pulse «Guardar redes» la de la base
   * sigue donde estaba, así que una quitada por error se recupera volviendo a
   * cargar la pantalla. Por eso no pregunta.
   */
  quitarRed(indice: number): void {
    if (!this.puedeEditar) { return; }
    this.redes.removeAt(indice);
  }

  /**
   * Reordenar arrastrando.
   *
   * moveItemInArray NO VALE AQUÍ: lo de dentro no es un arreglo sino los
   * controles del FormArray, y moverlos es sacar y volver a meter. Como el
   * `@for` sigue al control y no a la posición, la fila se lleva lo escrito.
   */
  soltarRed(evento: CdkDragDrop<unknown>): void {
    if (!this.puedeEditar || evento.previousIndex === evento.currentIndex) { return; }
    const fila = this.redes.at(evento.previousIndex);
    this.redes.removeAt(evento.previousIndex);
    this.redes.insert(evento.currentIndex, fila);
    this.form.markAsDirty();
  }

  /**
   * Guarda la línea de los derechos.
   *
   * VA SOLA, sin las redes: la configuración del pie acepta que llegue sólo
   * un trozo y deja lo demás como estaba (ecommerce.fn_pie_validar_config
   * devuelve únicamente las claves que recibe). Así guardar aquí no puede
   * tocar las redes de la otra pestaña.
   */
  async guardarDerechos(): Promise<void> {
    if (!this.puedeEditar || this.guardando) { return; }

    this.formDerechos.markAllAsTouched();
    if (this.formDerechos.invalid) {
      this._toastr.error('Revise el texto y el enlace.', 'No se puede guardar',
                         { timeOut: 20000, closeButton: true });
      return;
    }

    const v = this.formDerechos.getRawValue();
    const barra_inferior = {
      texto:        (v.texto ?? '').trim() || null,
      enlace_texto: (v.enlace_texto ?? '').trim() || null,
      enlace:       (v.enlace ?? '').trim() || null,
    };

    this.guardando = true;
    try {
      const res: any = await firstValueFrom(this._pieService.editPie({ barra_inferior }));
      this._toastr.success(res?.message ?? 'Pie guardado', 'Listo');
      this.pintar(res?.data);
      this.formDerechos.markAsPristine();
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo guardar el pie', 'Error',
                         { timeOut: 20000, closeButton: true });
    } finally {
      this.guardando = false;
    }
  }

  async guardarRedes(): Promise<void> {
    if (!this.puedeEditar || this.guardando) { return; }

    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.pestana = 'redes';
      this._toastr.error('Revise las direcciones.', 'No se puede guardar',
                         { timeOut: 20000, closeButton: true });
      return;
    }

    // Sólo van las que tienen algo: una fila en blanco y apagada no hace
    // falta guardarla, y así la configuración no se llena de huecos.
    const redes = this.redes.getRawValue()
      .filter((r: any) => r.activo || (r.icono ?? '').trim()
                                   || (r.nombre ?? '').trim() || (r.enlace ?? '').trim())
      .map((r: any) => ({
        icono:  (r.icono ?? '').trim() || null,
        nombre: (r.nombre ?? '').trim() || null,
        enlace: (r.enlace ?? '').trim() || null,
        activo: r.activo === true,
      }));

    const titulo_redes = (this.form.controls['titulo_redes'].value ?? '').trim() || null;

    // El tamaño viene del campo como texto: vacío es nulo, no cero
    const estilo = this.ctrlEstilo.getRawValue();
    const titulo_redes_estilo = {
      tamano: Number(estilo.tamano) || null,
      color:  (estilo.color ?? '') || null,
      fuente: estilo.fuente ?? null,
    };

    this.guardando = true;
    try {
      const res: any = await firstValueFrom(
        this._pieService.editPie({ titulo_redes, titulo_redes_estilo, redes }));
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

  nuevaColumna(zona: ZonaPie = 'arriba'): void { this.abrirPieza('columna', null, null, '', zona); }

  editarColumna(columna: ColumnaPieModel): void { this.abrirPieza('columna', columna, null, ''); }

  nuevoEnlace(columna: ColumnaPieModel): void {
    this.abrirPieza('enlace', null, columna.id, columna.titulo);
  }

  editarEnlace(enlace: EnlacePieModel): void { this.abrirPieza('enlace', enlace, null, ''); }

  private abrirPieza(tipo: 'columna' | 'enlace', pieza: any,
                     columnaId: number | null, columnaTitulo: string,
                     zona: ZonaPie | null = null): void {
    if (this._seguridadService.isexpired()) { return; }
    if (!(pieza ? this.puedeEditar : this.puedeCrear)) { return; }

    const ref = this.modal.open(SavePiePiezaComponent, { size: 'md', backdrop: 'static', centered: true });
    ref.componentInstance.tipo = tipo;
    ref.componentInstance.pieza = pieza;
    ref.componentInstance.columnaId = columnaId;
    ref.componentInstance.columnaTitulo = columnaTitulo;
    ref.componentInstance.zona = zona;

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

  /**
   * Se movió una columna.
   *
   * CADA FRANJA SE ORDENA SOLA: se manda únicamente la lista de la suya, y el
   * servidor numera por el sitio que ocupa cada una en lo que recibe. Mandar
   * las de las dos mezclaría dos numeraciones que no tienen nada que ver.
   */
  async soltarColumna(evento: CdkDragDrop<ColumnaPieModel[]>, zona: ZonaPie = 'arriba'): Promise<void> {
    if (!this.puedeEditar || evento.previousIndex === evento.currentIndex) { return; }

    const lista = zona === 'abajo' ? this.columnasAbajo : this.columnasArriba;
    moveItemInArray(lista, evento.previousIndex, evento.currentIndex);
    await this.guardarOrden(() => this._pieService.ordenarColumnas(lista.map(c => c.id)));
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
