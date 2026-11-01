import { Component, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import {
  FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators,
} from '@angular/forms';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';
import {
  CdkDrag, CdkDragDrop, CdkDragHandle, CdkDragPlaceholder, CdkDropList, moveItemInArray,
} from '@angular/cdk/drag-drop';

import { SeguridadService } from '../../../../seguridad/services/seguridad.service';
import { AccesoModel } from '../../../../seguridad/interfaces/accesoModel';
import { EncabezadoService } from '../../../services/encabezado.service';
import { EncabezadoModel, EnlaceEncabezadoModel } from '../../../interfaces/encabezadoModel';

import { PanelComponent } from '../../../../../components/panel/panel.component';
import { TabPanelComponent, PestanaTab } from '../../../../../components/campos/tabPanel/tabPanel.component';
import { CampoTextoComponent } from '../../../../../components/campos/campoTexto/campoTexto.component';
import { CheckboxComponent } from '../../../../../components/campos/checkbox/checkbox.component';
import { SaveEnlaceEncabezadoComponent } from '../saveEnlaceEncabezado/saveEnlaceEncabezado.component';
import { PapeleraEncabezadoComponent } from '../papeleraEncabezado/papeleraEncabezado.component';

/**
 * EL ENCABEZADO DE LA TIENDA (ecommerce.encabezado + encabezado_enlaces).
 *
 * Es lo primero que ve cualquiera que entre, y lo que más se toca: la franja
 * de arriba cambia con cada promoción.
 *
 * DOS PESTAÑAS porque son dos cosas con ritmos distintos:
 *
 *  · CONTENIDO —la franja, el aviso de crédito y las frases del buscador— se
 *    edita como un formulario y se guarda con un botón: son textos que se
 *    revisan juntos antes de publicarlos.
 *  · MENÚ se guarda AL MOMENTO, acción por acción, porque es una lista que se
 *    arrastra: un botón de guardar encima de un arrastre obliga a recordar
 *    que había que darle, y se pierde el orden a la primera.
 *
 * EL ÁRBOL ES DE DOS NIVELES Y NO MÁS: un menú de tres no se puede usar en un
 * móvil y la tienda no sabría pintarlo. Se arrastra dentro de cada nivel; para
 * mover un enlace de un desplegable a otro hay que borrarlo y volver a
 * crearlo, que es lo que hacía el CRM viejo y pasa una vez al año.
 *
 * TODAS LAS LLAMADAS DEVUELVEN EL ENCABEZADO ENTERO y la pantalla lo pinta tal
 * cual. No se toca el array a mano después de guardar: cualquier cambio puede
 * mover el orden de otras ramas, y recomponerlo aquí es como se acaban viendo
 * dos cosas distintas en la pantalla y en la tienda.
 */
@Component({
  selector: 'app-editEncabezado',
  templateUrl: './editEncabezado.component.html',
  styleUrls: ['./editEncabezado.component.css'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    CommonModule, ReactiveFormsModule,
    PanelComponent, TabPanelComponent, CampoTextoComponent, CheckboxComponent,
    CdkDropList, CdkDrag, CdkDragHandle, CdkDragPlaceholder,
  ],
})
export class EditEncabezadoComponent implements OnInit {

  public titulo = 'Encabezado de la tienda';
  public accesoModel!: AccesoModel;

  public modelo: EncabezadoModel | null = null;
  public form!: FormGroup;

  public cargando = true;
  public guardando = false;
  public trabajando = false;

  public readonly pestanas: PestanaTab[] = [
    { id: 'contenido', texto: 'Contenido', icono: 'fa-solid fa-bullhorn' },
    { id: 'menu',      texto: 'Menú',      icono: 'fa-solid fa-bars' },
  ];
  public pestana: 'contenido' | 'menu' = 'contenido';

  private _encabezadoService = inject(EncabezadoService);
  private _seguridadService = inject(SeguridadService);
  private _toastr = inject(ToastrService);
  private modal = inject(NgbModal);
  private fb = inject(FormBuilder);
  private activeRoute = inject(ActivatedRoute);

  get puedeEditar(): boolean { return this.accesoModel?.editar === true; }
  get puedeCrear(): boolean { return this.accesoModel?.crear === true; }
  get puedeEliminar(): boolean { return this.accesoModel?.eliminar === true; }
  get puedeVaciar(): boolean { return this.accesoModel?.vaciar === true; }

  get enlaces(): EnlaceEncabezadoModel[] { return this.modelo?.enlaces ?? []; }

  get barra(): FormGroup { return this.form.controls['barra_superior'] as FormGroup; }
  get credito(): FormGroup { return this.form.controls['credito'] as FormGroup; }
  get frases(): FormArray { return this.form.controls['buscador_frases'] as FormArray; }

  get ctrlBarraActiva(): FormControl { return this.barra.controls['activo'] as FormControl; }
  get ctrlCreditoActivo(): FormControl { return this.credito.controls['activo'] as FormControl; }

  /** Entre una y cinco: con ninguna el buscador se queda mudo; más no se ven. */
  get puedeAnadirFrase(): boolean { return this.puedeEditar && this.frases.length < 5; }
  get puedeQuitarFrase(): boolean { return this.puedeEditar && this.frases.length > 1; }

  ngOnInit(): void {
    this.accesoModel = this.activeRoute.snapshot.data['access'];
    this.construirFormulario();
    this.cargar();
  }

  private construirFormulario(): void {
    this.form = this.fb.group({
      barra_superior: this.fb.group({
        activo:       [true],
        texto:        ['', [Validators.maxLength(80)]],
        destacado:    ['', [Validators.maxLength(60)]],
        boton_texto:  ['', [Validators.maxLength(40)]],
        boton_enlace: ['', [Validators.maxLength(250)]],
      }),
      buscador_frases: this.fb.array([]),
      credito: this.fb.group({
        activo:       [true],
        texto:        ['', [Validators.maxLength(60)]],
        boton_texto:  ['', [Validators.maxLength(30)]],
        boton_enlace: ['', [Validators.maxLength(250)]],
      }),
    });
  }

  // ================================================================
  // CARGA
  // ================================================================

  async cargar(): Promise<void> {
    this.cargando = true;
    try {
      const res: any = await firstValueFrom(this._encabezadoService.getEncabezado());
      this.pintar(res?.data);
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo cargar el encabezado', 'Error',
                         { timeOut: 15000, closeButton: true });
    } finally {
      this.cargando = false;
    }
  }

  /** Lo que llega del servidor, al formulario y al árbol. */
  private pintar(data: EncabezadoModel | null | undefined): void {
    if (!data) { return; }
    this.modelo = data;

    const c = data.config ?? ({} as any);
    this.form.patchValue({
      barra_superior: {
        activo:       c.barra_superior?.activo !== false,
        texto:        c.barra_superior?.texto ?? '',
        destacado:    c.barra_superior?.destacado ?? '',
        boton_texto:  c.barra_superior?.boton_texto ?? '',
        boton_enlace: c.barra_superior?.boton_enlace ?? '',
      },
      credito: {
        activo:       c.credito?.activo !== false,
        texto:        c.credito?.texto ?? '',
        boton_texto:  c.credito?.boton_texto ?? '',
        boton_enlace: c.credito?.boton_enlace ?? '',
      },
    });

    this.frases.clear();
    for (const f of (c.buscador_frases ?? [])) {
      this.frases.push(this.fb.control(f, [Validators.required, Validators.maxLength(60)]));
    }
    if (this.frases.length === 0) { this.anadirFrase(); }

    if (!this.puedeEditar) { this.form.disable(); }
  }

  // ================================================================
  // CONTENIDO
  // ================================================================

  anadirFrase(): void {
    if (this.frases.length >= 5) { return; }
    this.frases.push(this.fb.control('', [Validators.required, Validators.maxLength(60)]));
  }

  quitarFrase(indice: number): void {
    if (!this.puedeQuitarFrase) { return; }
    this.frases.removeAt(indice);
  }

  /** El control, no la posición: con track $index los campos enseñan el valor del vecino. */
  controlFrase(indice: number): FormControl { return this.frases.at(indice) as FormControl; }

  async guardarContenido(): Promise<void> {
    if (!this.puedeEditar || this.guardando) { return; }

    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.pestana = 'contenido';
      this._toastr.error('Revise los campos del formulario.', 'No se puede guardar',
                         { timeOut: 20000, closeButton: true });
      return;
    }

    const v = this.form.getRawValue();
    const limpio = (x: any) => (x ?? '').toString().trim() || null;

    const config = {
      barra_superior: {
        activo:       v.barra_superior.activo !== false,
        texto:        limpio(v.barra_superior.texto),
        destacado:    limpio(v.barra_superior.destacado),
        boton_texto:  limpio(v.barra_superior.boton_texto),
        boton_enlace: limpio(v.barra_superior.boton_enlace),
      },
      buscador_frases: (v.buscador_frases ?? []).map((f: string) => (f ?? '').trim()).filter(Boolean),
      credito: {
        activo:       v.credito.activo !== false,
        texto:        limpio(v.credito.texto),
        boton_texto:  limpio(v.credito.boton_texto),
        boton_enlace: limpio(v.credito.boton_enlace),
      },
    };

    this.guardando = true;
    try {
      const res: any = await firstValueFrom(this._encabezadoService.editEncabezado(config));
      this._toastr.success(res?.message ?? 'Encabezado guardado', 'Listo');
      this.pintar(res?.data);
    } catch (e: any) {
      // El servidor valida de verdad: que la franja encendida tenga texto, que
      // las direcciones sean direcciones. Aquí no se repite para que no divagen.
      this._toastr.error(e?.error?.message ?? 'No se pudo guardar el encabezado', 'Error',
                         { timeOut: 20000, closeButton: true });
    } finally {
      this.guardando = false;
    }
  }

  // ================================================================
  // EL MENÚ
  // ================================================================

  nuevoPrincipal(): void { this.abrirEnlace(null, null, ''); }

  nuevoHijo(padre: EnlaceEncabezadoModel): void { this.abrirEnlace(null, padre.id, padre.texto); }

  editarEnlace(enlace: EnlaceEncabezadoModel, esHijo: boolean): void {
    this.abrirEnlace(enlace, null, '', esHijo);
  }

  private abrirEnlace(enlace: EnlaceEncabezadoModel | null, padreId: number | null,
                      padreTexto: string, esHijo = false): void {
    if (this._seguridadService.isexpired()) { return; }
    if (!(enlace ? this.puedeEditar : this.puedeCrear)) { return; }

    const ref = this.modal.open(SaveEnlaceEncabezadoComponent,
                                { size: 'md', backdrop: 'static', centered: true });
    ref.componentInstance.enlace = enlace;
    ref.componentInstance.padreId = padreId;
    ref.componentInstance.padreTexto = padreTexto;
    ref.componentInstance.esHijo = esHijo;

    ref.result.then((data: any) => this.pintar(data), () => { /* se cerró sin guardar */ });
  }

  async alternarEnlace(enlace: EnlaceEncabezadoModel): Promise<void> {
    if (this._seguridadService.isexpired() || !this.puedeEditar || this.trabajando) { return; }

    this.trabajando = true;
    try {
      const res: any = await firstValueFrom(this._encabezadoService.activarEnlace(enlace.id));
      this._toastr.success(res?.message ?? 'Listo', 'Listo');
      this.pintar(res?.data);
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo cambiar el estado', 'Error',
                         { timeOut: 15000, closeButton: true });
    } finally {
      this.trabajando = false;
    }
  }

  async borrarEnlace(enlace: EnlaceEncabezadoModel): Promise<void> {
    if (this._seguridadService.isexpired() || !this.puedeEliminar || this.trabajando) { return; }

    const hijos = enlace.hijos?.length ?? 0;
    const aviso = hijos === 0
      ? `¿Enviar «${enlace.texto}» a la papelera?`
      : `«${enlace.texto}» tiene ${hijos === 1 ? '1 enlace' : hijos + ' enlaces'} en su desplegable, `
        + 'y se van con él.\n\nRestaurarlo los devuelve. ¿Seguir?';

    if (!confirm(aviso)) { return; }

    this.trabajando = true;
    try {
      const res: any = await firstValueFrom(this._encabezadoService.deleteEnlace(enlace.id));
      this._toastr.success(res?.message ?? 'Enviado a la papelera', 'Listo');
      this.pintar(res?.data);
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo eliminar el enlace', 'Error',
                         { timeOut: 15000, closeButton: true });
    } finally {
      this.trabajando = false;
    }
  }

  /** Los principales entre sí. */
  async soltarPrincipal(evento: CdkDragDrop<EnlaceEncabezadoModel[]>): Promise<void> {
    if (!this.puedeEditar || evento.previousIndex === evento.currentIndex || !this.modelo) { return; }

    // En pantalla primero: esperar al servidor hace que la fila salte de vuelta
    moveItemInArray(this.modelo.enlaces, evento.previousIndex, evento.currentIndex);
    await this.guardarOrden(this.modelo.enlaces.map(e => e.id));
  }

  /** Y los de un desplegable entre ellos. */
  async soltarHijo(padre: EnlaceEncabezadoModel, evento: CdkDragDrop<EnlaceEncabezadoModel[]>): Promise<void> {
    if (!this.puedeEditar || evento.previousIndex === evento.currentIndex || !padre.hijos) { return; }

    moveItemInArray(padre.hijos, evento.previousIndex, evento.currentIndex);
    // Sólo los de ESTE desplegable: el orden es por rama, y mandar los de
    // todas haría que la última pisara a las demás.
    await this.guardarOrden(padre.hijos.map(h => h.id));
  }

  private async guardarOrden(ids: number[]): Promise<void> {
    this.trabajando = true;
    try {
      // Sin aviso de éxito: ver que se queda donde se soltó ya lo confirma, y
      // un toast por cada arrastre es ruido.
      const res: any = await firstValueFrom(this._encabezadoService.ordenarEnlaces(ids));
      this.pintar(res?.data);
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo guardar el orden', 'Error',
                         { timeOut: 15000, closeButton: true });
      await this.cargar();   // lo de la pantalla ya no es lo que hay guardado
    } finally {
      this.trabajando = false;
    }
  }

  // ================================================================
  // PAPELERA
  // ================================================================

  abrirPapelera(): void {
    if (this._seguridadService.isexpired()) { return; }

    const ref = this.modal.open(PapeleraEncabezadoComponent,
                                { size: 'lg', backdrop: 'static', centered: true });
    ref.componentInstance.puedeVaciar = this.puedeVaciar;
    ref.result.then((hubo: boolean) => { if (hubo) { this.cargar(); } }, () => { /* cerrada */ });
  }

  /** Lo que va a hacer el enlace en la tienda, para la ayuda de la fila. */
  destinoDe(enlace: EnlaceEncabezadoModel): string {
    if (enlace.hijos?.length) { return 'Abre su desplegable'; }
    return enlace.enlace ?? 'Sin dirección: no se verá';
  }
}
