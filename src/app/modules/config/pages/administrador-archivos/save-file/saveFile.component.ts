import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { firstValueFrom, from, merge, of, Subject } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';

import { ArchivoService } from '../../../services/archivo.service';
import { SeguridadService } from '../../../../seguridad/services/seguridad.service';
import { LoadingService } from '../../../../../service/loading.service';
import { SelectorIconosComponent } from '../../../../../components/selector-iconos/selector-iconos.component';

import { ArchivoModel } from '../../../interfaces/archivoModel';

/** Acciones con las que se abre el modal desde el administrador de archivos. */
type AccionArchivo = 'addNuevaRaiz' | 'addCarpeta' | 'addArchivo' | 'edit';

/**
 * Alta y modificación de carpetas y archivos del administrador.
 *
 * Un "archivo" es un reporte externo: una url que se abre en un visor. Una
 * carpeta sólo agrupa. Por eso la url es obligatoria en archivos y no
 * existe en carpetas.
 *
 * Mismo esquema que saveMenu: chips con la ubicación en el árbol, dos
 * paneles (datos / apariencia) y el selector de iconos en su propio modal.
 * El catálogo de iconos que antes vivía aquí duplicado se fue con él.
 */
@Component({
  selector: 'app-saveFile',
  templateUrl: './saveFile.component.html',
  styleUrls: ['./saveFile.component.css'],
  standalone: false,
})
export class SaveFileComponent implements OnInit, OnDestroy {

  /** Carpeta padre (al crear dentro), el registro a editar, o 0 para una raíz. */
  @Input() registro_selected: any = {};
  @Input() accion: AccionArchivo;
  /** Siguiente número de orden entre los hermanos, calculado por quien abre el modal. */
  @Input() maxOrder2: number;
  @Input() tieneHijos: boolean;

  @Output() registrosE: EventEmitter<any> = new EventEmitter();

  public isLoading$ = this._loadingService.isLoading$;
  public title = '';
  public form: FormGroup;
  private response: any;

  /** Colores de acceso rápido para carpetas y archivos (los del tema). */
  public readonly coloresRapidos = [
    '#F0B13B', '#348fe2', '#00acac', '#727cb6', '#ff5b57', '#f59c1a', '#A6A09B', '#2d353c'
  ];

  private readonly destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    public  modal: NgbActiveModal,
    private modalService: NgbModal,
    private _archivoService: ArchivoService,
    private _seguridadService: SeguridadService,
    private _toastr: ToastrService,
    private _loadingService: LoadingService
  ) {}

  // ================================================================
  // ESTADO DERIVADO (para la plantilla)
  // ================================================================

  get esEdicion(): boolean { return this.accion === 'edit'; }

  /** true si lo que se crea/edita es una carpeta. */
  get esCarpeta(): boolean {
    if (this.esEdicion) { return !!this.registro_selected?.escarpeta; }
    return this.accion !== 'addArchivo';
  }

  /** Nombre de la carpeta padre, para el chip de ubicación. */
  get nombrePadre(): string {
    if (this.esEdicion) { return ''; }
    return this.accion === 'addNuevaRaiz' ? '' : (this.registro_selected?.nombre ?? '');
  }

  get iconoActual(): string {
    return (this.form?.controls['icono']?.value ?? '').trim();
  }

  get colorActual(): string {
    return this.form?.controls['color']?.value || '';
  }

  // ================================================================
  // CICLO DE VIDA
  // ================================================================

  ngOnInit(): void {
    if (this._seguridadService.isexpired()) {
      this.modal.close();
      return;
    }

    this.form = this.construirFormulario();
    this.cargarValoresIniciales();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Un único formulario para las cuatro acciones. Lo que cambia es la
   * validación de la url (obligatoria sólo en archivos) y el valor de
   * padre / nivel / escarpeta, que se fijan al crear y no se editan.
   */
  private construirFormulario(): FormGroup {
    const esCarpeta = this.esCarpeta;
    return this.fb.group({
      padre:       [{ value: 0, disabled: true }],
      nivel:       [{ value: 0, disabled: true }],
      orden:       [0, [Validators.required]],
      nombre:      ['', [Validators.required, Validators.maxLength(100)]],
      url:         ['', esCarpeta ? [Validators.maxLength(500)] : [Validators.required, Validators.maxLength(500)]],
      descripcion: ['', [Validators.maxLength(100)]],
      modulo:      ['', [Validators.maxLength(15)]],
      tipo:        ['', [Validators.maxLength(15)]],
      icono:       [''],
      color:       [esCarpeta ? '#F0B13B' : '#A6A09B'],
      escarpeta:   [{ value: esCarpeta, disabled: true }],
      activo:      [true],
    });
  }

  private cargarValoresIniciales(): void {
    switch (this.accion) {
      case 'addNuevaRaiz':
        this.title = 'Nueva carpeta raíz';
        this.form.patchValue({
          padre: 0, nivel: 0, orden: this.maxOrder2,
          nombre: '', icono: 'fa fa-folder', escarpeta: true
        });
        break;

      case 'addCarpeta':
        this.title = 'Nueva carpeta';
        this.form.patchValue({
          padre: this.registro_selected.id,
          nivel: (this.registro_selected.nivel ?? 0) + 1,
          orden: this.maxOrder2,
          nombre: '', icono: 'fa fa-folder', escarpeta: true
        });
        break;

      case 'addArchivo':
        this.title = 'Nuevo archivo';
        this.form.patchValue({
          padre: this.registro_selected.id,
          nivel: (this.registro_selected.nivel ?? 0) + 1,
          orden: this.maxOrder2,
          nombre: '', icono: 'fa fa-file', escarpeta: false
        });
        break;

      case 'edit':
        this.title = this.esCarpeta ? 'Modificar carpeta' : 'Modificar archivo';
        this.form.patchValue(this.registro_selected);
        break;
    }
  }

  // ================================================================
  // ICONO Y COLOR
  // ================================================================

  abrirSelectorIconos(): void {
    const modalRef = this.modalService.open(SelectorIconosComponent, {
      size: 'lg',
      centered: true,
      scrollable: true,
      backdrop: 'static',
    });
    modalRef.componentInstance.iconoSeleccionado = this.iconoActual;

    // takeUntil con el cierre del modal: 'seleccionado' no completa nunca, así
    // que sin esto la suscripción seguiría viva si el usuario cancela.
    modalRef.componentInstance.seleccionado
      .pipe(takeUntil(merge(
        this.destroy$,
        from(modalRef.result).pipe(catchError(() => of(null)))
      )))
      .subscribe((clase: string) => {
        this.form.controls['icono'].setValue(clase);
        this.form.controls['icono'].markAsDirty();
      });
  }

  limpiarIcono(): void {
    this.form.controls['icono'].setValue('');
    this.form.controls['icono'].markAsDirty();
  }

  elegirColor(color: string): void {
    this.form.controls['color'].setValue(color);
    this.form.controls['color'].markAsDirty();
  }

  // ================================================================
  // GUARDAR
  // ================================================================

  async onSubmitForm($ev: Event): Promise<void> {
    $ev.preventDefault();
    Object.values(this.form.controls).forEach(c => c.markAsTouched());

    if (this.form.invalid) {
      this._toastr.error('Revise los campos del formulario.', 'No se puede guardar', {
        timeOut: 20000, closeButton: true
      });
      return;
    }
    await this.saveRecord(this.form.getRawValue());
  }

  private async saveRecord(data: ArchivoModel): Promise<void> {
    try {
      this._loadingService.setLoading(true);

      if (this.esEdicion) {
        this.response = await firstValueFrom(this._archivoService.editArchivo(this.registro_selected.id, data));
      } else {
        this.response = await firstValueFrom(this._archivoService.addArchivo(data));
      }

      this.registrosE.emit(this.response.data);
      this._toastr.success(this.response.message, 'Éxito', { closeButton: true });
      this.modal.close(this.response.data);
    } catch (error) {
      // El AuthInterceptor ya muestra el toast del error HTTP
      console.error('Error al guardar el archivo:', error);
    } finally {
      this._loadingService.setLoading(false);
    }
  }
}
