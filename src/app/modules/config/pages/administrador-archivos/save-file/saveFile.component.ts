import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { firstValueFrom, from, merge, of, Subject } from 'rxjs';
import { HttpEventType } from '@angular/common/http';
import { catchError, takeUntil } from 'rxjs/operators';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';

import { ArchivoService } from '../../../services/archivo.service';
import { SeguridadService } from '../../../../seguridad/services/seguridad.service';
import { LoadingService } from '../../../../../service/loading.service';
import { SelectorIconosComponent } from '../../../../../components/selector-iconos/selector-iconos.component';
import { DropzoneComponent } from '../../../../../components/campos/dropzone/dropzone.component';

import { ArchivoModel } from '../../../interfaces/archivoModel';
import { DefTipoArchivo, MAX_MB_ARCHIVO, TipoArchivo, defTipo, extensionDe, formatoTamano, tipoPorExtension } from '../../../interfaces/tipoArchivo';

/** Acciones con las que se abre el modal desde el administrador de archivos. */
type AccionArchivo = 'addNuevaRaiz' | 'addCarpeta' | 'addArchivo' | 'edit';

/** Lo que el usuario elige: un enlace externo o un fichero que se sube. */
type ModoArchivo = 'link' | 'archivo';

/**
 * Alta y modificación de carpetas y archivos del administrador.
 *
 * Un "archivo" es un enlace (una url que se abre en el visor) o un fichero
 * subido al servidor. Una carpeta sólo agrupa. Por eso la url es obligatoria
 * en enlaces, la pone la subida en ficheros y no existe en carpetas.
 *
 * El usuario sólo elige Enlace o Archivo. El tipo concreto del fichero
 * (imagen, pdf, excel, word, video, otro) se deduce de la extensión: aquí
 * para el icono, el color y el chip "detectado"; en el back al subir, y ese
 * es el que se graba en la columna `tipo`.
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

  // ---------- Enlace / fichero ----------
  /** Las dos opciones del selector. */
  readonly modos: { id: ModoArchivo; etiqueta: string; icono: string; color: string; descripcion: string }[] = [
    { id: 'link',    etiqueta: 'Enlace',  icono: 'fa fa-link',           color: '#348fe2',
      descripcion: 'Una dirección web (reporte externo, página…)' },
    { id: 'archivo', etiqueta: 'Archivo', icono: 'fa fa-cloud-arrow-up', color: '#00acac',
      descripcion: 'Un fichero que se sube al servidor: imagen, PDF, Excel, Word, video, audio…' },
  ];
  /** Enlace o fichero. En ficheros el tipo concreto lo decide la extensión. */
  modo: ModoArchivo = 'link';
  /** 0 = sin límite propio (manda php.ini). */
  readonly maxMb = MAX_MB_ARCHIVO;

  /** Fichero elegido en el dropzone, pendiente de subir al guardar. */
  ficheroNuevo: File | null = null;
  /** 0-100 mientras sube; null si no hay subida. */
  progreso: number | null = null;

  /** Tipo del registro (control `tipo`): link, o el detectado del fichero. */
  get tipoActual(): DefTipoArchivo {
    return defTipo(this.form?.controls['tipo']?.value);
  }

  get esEnlace(): boolean {
    return this.modo === 'link';
  }

  /** Extensión del fichero pendiente, para el chip "detectado". */
  get extensionFichero(): string {
    return extensionDe(this.ficheroNuevo?.name);
  }

  /** En edición: nombre del fichero ya guardado (último tramo de la url). */
  get nombreArchivoActual(): string | null {
    if (!this.esEdicion || this.esEnlace) { return null; }
    const url: string = this.registro_selected?.url ?? '';
    return url ? (url.split('/').pop() ?? url) : null;
  }

  /** Control del switch "abrir en ventana nueva" (tipado para [formControl]). */
  get ctrlNuevaVentana(): FormControl {
    return this.form.controls['nueva_ventana'] as FormControl;
  }

  get tamanoActual(): string {
    return formatoTamano(this.registro_selected?.tamano);
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
      // La url es obligatoria sólo en enlaces; en ficheros subidos la pone la subida
      url:         ['', esCarpeta ? [Validators.maxLength(500)] : [Validators.required, Validators.maxLength(500)]],
      descripcion: ['', [Validators.maxLength(100)]],
      modulo:      ['', [Validators.maxLength(15)]],
      tipo:        ['link'],
      tamano:      [null],
      icono:       [''],
      color:       [esCarpeta ? '#F0B13B' : '#A6A09B'],
      escarpeta:   [{ value: esCarpeta, disabled: true }],
      activo:      [true],
      // Ejecutar abre en otra pestaña del navegador en vez del visor
      nueva_ventana: [false],
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
          nombre: '', escarpeta: false,
          tipo: 'link', icono: defTipo('link').icono, color: defTipo('link').color
        });
        break;

      case 'edit':
        this.title = this.esCarpeta ? 'Modificar carpeta' : 'Modificar archivo';
        this.form.patchValue(this.registro_selected);
        // Registros antiguos traen NULL: el switch trabaja con booleanos
        this.form.controls['nueva_ventana'].setValue(!!this.registro_selected?.nueva_ventana);
        // Registros antiguos sin tipo: eran todos enlaces
        this.form.controls['tipo'].setValue(defTipo(this.registro_selected?.tipo, this.registro_selected?.url).id);
        this.modo = this.tipoActual.id === 'link' ? 'link' : 'archivo';
        this.ajustarValidacionUrl();
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
  // TIPO DE ARCHIVO Y FICHERO
  // ================================================================

  /**
   * Cambio entre Enlace y Archivo. Ajusta qué es obligatorio (la url sólo en
   * enlaces). En enlace el tipo es 'link'; en archivo el tipo lo pondrá el
   * fichero que se elija (o se conserva el guardado, en edición).
   */
  cambiarModo(modo: ModoArchivo): void {
    if (this.modo === modo) { return; }
    this.modo = modo;
    this.ajustarValidacionUrl();

    if (modo === 'link') {
      // Un fichero pendiente ya no aplica
      this.ficheroNuevo = null;
      this.aplicarTipo('link');
    } else {
      // Sin fichero todavía: tipo genérico hasta que se elija uno (o el que
      // ya tenía guardado, si se está editando un fichero)
      const guardado = defTipo(this.registro_selected?.tipo, this.registro_selected?.url).id;
      this.aplicarTipo(this.esEdicion && guardado !== 'link' ? guardado : 'otro');
    }
  }

  /**
   * Fija el control `tipo` y pone el icono y color por defecto de ese tipo,
   * salvo que el usuario ya hubiera elegido otros a mano.
   */
  private aplicarTipo(tipo: TipoArchivo): void {
    const anterior = this.tipoActual;
    if (anterior.id === tipo) { return; }
    this.form.controls['tipo'].setValue(tipo);
    this.form.controls['tipo'].markAsDirty();

    const nuevo = defTipo(tipo);
    const iconoEsDefecto = !this.iconoActual || this.iconoActual === anterior.icono || this.iconoActual === 'fa fa-file';
    const colorEsDefecto = !this.colorActual || this.colorActual === anterior.color || this.colorActual === '#A6A09B';
    if (iconoEsDefecto) { this.form.controls['icono'].setValue(nuevo.icono); }
    if (colorEsDefecto) { this.form.controls['color'].setValue(nuevo.color); }
  }

  /** La url es obligatoria en enlaces; en ficheros la escribe la subida. */
  private ajustarValidacionUrl(): void {
    const url = this.form.controls['url'];
    if (this.esCarpeta) { return; }
    url.setValidators(this.esEnlace
      ? [Validators.required, Validators.maxLength(500)]
      : [Validators.maxLength(500)]);
    url.updateValueAndValidity();
  }

  /**
   * Fichero elegido (o quitado) en el dropzone. Se clasifica por la
   * extensión para el icono, el color y el chip; el back repite la misma
   * clasificación al subirlo y ésa es la que se graba.
   */
  onFicheroSeleccionado(f: File | null): void {
    this.ficheroNuevo = f;
    if (!f) {
      // Sin fichero: vuelve al tipo guardado (edición) o al genérico
      const guardado = defTipo(this.registro_selected?.tipo, this.registro_selected?.url).id;
      this.aplicarTipo(this.esEdicion && guardado !== 'link' ? guardado : 'otro');
      return;
    }
    this.aplicarTipo(tipoPorExtension(f.name));
    // Sin nombre todavía: se propone el del fichero (sin extensión)
    if (!this.form.controls['nombre'].value) {
      this.form.controls['nombre'].setValue(f.name.replace(/\.[^.]+$/, ''));
    }
  }

  /**
   * Sube el fichero pendiente y devuelve la url relativa, el tamaño y el
   * tipo que le asignó el servidor. Va antes de guardar el registro, para
   * que éste ya nazca con su url.
   */
  private subirFichero(): Promise<{ url: string; tamano: number; tipo: TipoArchivo }> {
    this.progreso = 0;
    return new Promise<{ url: string; tamano: number; tipo: TipoArchivo }>((resolve, reject) => {
      this._archivoService.subirArchivo(this.ficheroNuevo!)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: ev => {
            if (ev.type === HttpEventType.UploadProgress && ev.total) {
              this.progreso = Math.round(100 * ev.loaded / ev.total);
            } else if (ev.type === HttpEventType.Response) {
              const cuerpo: any = ev.body;
              if (cuerpo?.status !== 'success') {
                reject(new Error(cuerpo?.message || 'No se pudo subir el archivo'));
                return;
              }
              resolve({
                url:    cuerpo.data.url,
                tamano: cuerpo.data.tamano,
                tipo:   defTipo(cuerpo.data.tipo).id,
              });
            }
          },
          error: err => reject(err),
        });
    }).finally(() => { this.progreso = null; });
  }

  // ================================================================
  // GUARDAR
  // ================================================================

  async onSubmitForm($ev?: Event): Promise<void> {
    // app-modal-footer emite sin evento: la llamada es opcional. Con
    // $ev.preventDefault() a secas reventaba aquí y no guardaba nada.
    $ev?.preventDefault?.();
    Object.values(this.form.controls).forEach(c => c.markAsTouched());

    if (this.form.invalid) {
      this._toastr.error('Revise los campos del formulario.', 'No se puede guardar', {
        timeOut: 20000, closeButton: true
      });
      return;
    }

    // Un archivo que no es enlace necesita fichero: al crear siempre; al
    // editar, sólo si no había uno guardado.
    if (!this.esCarpeta && !this.esEnlace && !this.ficheroNuevo && !this.registro_selected?.url) {
      this._toastr.error('Elija el archivo que quiere subir.', 'Falta el archivo', {
        timeOut: 20000, closeButton: true
      });
      return;
    }

    await this.saveRecord(this.form.getRawValue());
  }

  private async saveRecord(data: ArchivoModel): Promise<void> {
    try {
      this._loadingService.setLoading(true);

      // 1) Fichero físico, si hay uno nuevo: la url, el tamaño y el tipo
      //    (clasificado por el servidor) salen de ahí
      if (!this.esCarpeta && !this.esEnlace && this.ficheroNuevo) {
        const subida = await this.subirFichero();
        data.url = subida.url;
        data.tamano = subida.tamano;
        data.tipo = subida.tipo;
      }
      // Un enlace nunca lleva tamaño
      if (!this.esCarpeta && this.esEnlace) {
        data.tipo = 'link';
        data.tamano = null;
      }
      // Las carpetas no tienen tipo ni tamaño
      if (this.esCarpeta) {
        data.tipo = null;
        data.nueva_ventana = false;
        data.tamano = null;
      }

      // 2) Registro
      if (this.esEdicion) {
        this.response = await firstValueFrom(this._archivoService.editArchivo(this.registro_selected.id, data));
      } else {
        this.response = await firstValueFrom(this._archivoService.addArchivo(data));
      }

      this.registrosE.emit(this.response.data);
      this._toastr.success(this.response.message, 'Éxito', { closeButton: true });
      this.modal.close(this.response.data);
    } catch (error: any) {
      // Los errores HTTP ya los muestra el AuthInterceptor; los de la subida
      // (tipo o tamaño rechazados por el back) llegan como Error propio.
      if (error instanceof Error && !('status' in error)) {
        this._toastr.error(error.message, 'No se pudo subir', { closeButton: true });
      }
      console.error('Error al guardar el archivo:', error);
    } finally {
      this._loadingService.setLoading(false);
    }
  }
}
