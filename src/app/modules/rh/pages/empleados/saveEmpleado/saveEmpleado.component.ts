import { Component, ElementRef, EventEmitter, HostListener, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { firstValueFrom, from, merge, of, Observable, Subject } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { NgbActiveModal, NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';

// Servicios
import { EmpleadoService } from '../../../services/empleado.service';
import { CargoService } from '../../../services/cargo.service';
import { DepartamentoService } from '../../../services/departamento.service';
import { SeguridadService } from '../../../../seguridad/services/seguridad.service';
import { LoadingService } from '../../../../../service/loading.service';
import { ComprimirImagen } from '../../../../../service/comprimirImagen';

// Modelos y selectores
import { EmpleadoModel, ESTADOS_EMPLEADO, GENEROS, TIPOS_CONTRATO, TIPOS_IDENTIFICACION } from '../../../interfaces/empleadoModel';
import { ListCargosComponent } from '../../cargos/listCargos/listCargos.component';
import { ListDepartamentosComponent } from '../../departamentos/listDepartamentos/listDepartamentos.component';
import { ListEmpleadosComponent } from '../listEmpleados/listEmpleados.component';

type AccionEmpleado = 'add' | 'edit' | 'clon' | 'view';

/**
 * Alta, modificación, clonación y vista de un empleado (rh.empleados), con
 * foto. Mismo esquema que saveUser:
 *   - columna izquierda: la foto (arrastrar, galería, cámara, pegar, ampliar);
 *   - derecha: paneles de datos personales, laborales y de contacto.
 * El cargo, el departamento y el jefe se eligen como el perfil y el horario
 * en saveUser: campo ID + nombre de sólo lectura + lupa que abre el selector
 * (listCargos / listDepartamentos / listEmpleados); escribir el ID y salir
 * del campo también lo resuelve.
 * La foto se sube DESPUÉS de guardar el registro (necesita el id), igual
 * que el avatar del usuario.
 */
@Component({
  selector: 'app-saveEmpleado',
  templateUrl: './saveEmpleado.component.html',
  styleUrls: ['./saveEmpleado.component.css'],
  standalone: false,
})
export class SaveEmpleadoComponent implements OnInit, OnDestroy {
  @Input() registro_selected: any = {};
  @Input() accion: AccionEmpleado = 'add';
  @Output() registrosE: EventEmitter<any> = new EventEmitter();

  public form: FormGroup;
  public isLoading$ = this._loadingService.isLoading$;
  public response: any;
  public isdisabled = false;
  public titulo = '';
  public textoClon = '';
  public empleadoId: any;
  public esNuevo = false;
  public esClon = false;
  public esView = false;

  public empleadoModel: EmpleadoModel | null = null;

  // Controles independientes (sólo lectura) con el nombre de lo elegido
  public cargoNombreControl = new FormControl({ value: '', disabled: true });
  public departamentoNombreControl = new FormControl({ value: '', disabled: true });
  public jefeNombreControl = new FormControl({ value: '', disabled: true });

  public tiposIdentificacion = TIPOS_IDENTIFICACION;
  public generos = GENEROS;
  public tiposContrato = TIPOS_CONTRATO;
  public estados = ESTADOS_EMPLEADO;

  // ---------- Foto (mismo mecanismo que el avatar de saveUser) ----------
  public imagen_file: any = null;
  public imagen_paste: any = null;
  public imagen_previzualiza: any = null;
  public comprimirImagen: ComprimirImagen = new ComprimirImagen();
  public cambioImagen = false;
  public nuevaFoto = '';
  public isDragOver = false;
  public showFullscreenImage = false;

  // Cámara
  public showCameraModal = false;
  public cameraError = '';
  public isUsingFrontCamera = true;
  private mediaStream: MediaStream | null = null;

  private destroy$ = new Subject<void>();
  /** true en cuanto corre ngOnDestroy: ningún callback pendiente debe escribir. */
  private destruido = false;
  private readonly lectores = new Set<FileReader>();
  private readonly imagenesEnVuelo = new Set<HTMLImageElement>();

  @ViewChild('galleryInput') private galleryInput?: ElementRef<HTMLInputElement>;
  @ViewChild('pasteInput') private pasteInput?: ElementRef<HTMLInputElement>;

  private videoCamara: HTMLVideoElement | null = null;
  @ViewChild('cameraPreview')
  set cameraPreviewRef(ref: ElementRef<HTMLVideoElement> | undefined) {
    this.videoCamara = ref?.nativeElement ?? null;
    if (this.videoCamara) { this.videoCamara.srcObject = this.mediaStream; }
  }

  constructor(
    private fb: FormBuilder,
    private _toastr: ToastrService,
    public activeModal: NgbActiveModal,
    private modalService: NgbModal,
    private _loadingService: LoadingService,
    private _seguridadService: SeguridadService,
    private _empleadoService: EmpleadoService,
    private _cargoService: CargoService,
    private _departamentoService: DepartamentoService,
  ) {}

  // ================================================================
  // CICLO DE VIDA
  // ================================================================

  async ngOnInit(): Promise<void> {
    if (this._seguridadService.isexpired()) {
      this.activeModal.close();
      return;
    }

    this.esView = this.accion === 'view';
    this.esNuevo = this.accion === 'add';
    this.esClon = this.accion === 'clon';
    this.isdisabled = this.esView;
    this.initializeForm();

    switch (this.accion) {
      case 'add':
        this.titulo = 'Nuevo Empleado';
        break;
      case 'edit':
        this.titulo = 'Modificar Empleado';
        this.empleadoId = this.registro_selected.id;
        await this.findByIdEmpleado(this.registro_selected.id);
        break;
      case 'clon':
        this.titulo = 'Clonar Empleado';
        this.textoClon = '_CLON';
        this.esNuevo = true;
        this.empleadoId = this.registro_selected.id;
        await this.findByIdEmpleado(this.registro_selected.id);
        break;
      case 'view':
        this.titulo = 'Ver Empleado';
        this.empleadoId = this.registro_selected.id;
        await this.findByIdEmpleado(this.registro_selected.id);
        break;
    }
  }

  ngOnDestroy(): void {
    this.destruido = true;
    this.destroy$.next();
    this.destroy$.complete();
    this.closeCamera();
    this.lectores.forEach(l => l.abort());
    this.lectores.clear();
    this.imagenesEnVuelo.forEach(img => { img.onload = null; img.onerror = null; img.src = ''; });
    this.imagenesEnVuelo.clear();
    document.body.style.overflow = '';
    this.imagen_previzualiza = null;
    this.imagen_paste = null;
    this.imagen_file = null;
  }

  //   ******   INICIALIZA FORMULARIO   ******  //
  initializeForm(): void {
    const d = this.isdisabled;
    this.form = this.fb.group({
      numero_identificacion: [{ value: '', disabled: d }, [Validators.required, Validators.maxLength(20)]],
      tipo_identificacion:   [{ value: 'CC', disabled: d }, [Validators.required]],
      nombres:               [{ value: '', disabled: d }, [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
      apellidos:             [{ value: '', disabled: d }, [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
      email:                 [{ value: '', disabled: d }, [Validators.required, Validators.maxLength(150)]],
      email_personal:        [{ value: '', disabled: d }, [Validators.maxLength(150)]],
      telefono:              [{ value: '', disabled: d }, [Validators.maxLength(20)]],
      celular:               [{ value: '', disabled: d }, [Validators.maxLength(20)]],
      fecha_nacimiento:      [{ value: '', disabled: d }],
      genero:                [{ value: null, disabled: d }],
      direccion:             [{ value: '', disabled: d }, [Validators.maxLength(1000)]],
      cargo_id:              [{ value: null, disabled: d }, [Validators.required]],
      departamento_id:       [{ value: null, disabled: d }, [Validators.required]],
      jefe_id:               [{ value: null, disabled: d }],
      fecha_ingreso:         [{ value: this.hoyIso(), disabled: d }, [Validators.required]],
      fecha_salida:          [{ value: '', disabled: d }],
      estado:                [{ value: 'ACTIVO', disabled: d }, [Validators.required]],
      tipo_contrato:         [{ value: 'INDEFINIDO', disabled: d }, [Validators.required]],
      salario:               [{ value: null, disabled: d }, [Validators.min(0), Validators.max(999999999)]],
      activo:                [{ value: true, disabled: d }],
      foto:                  [{ value: '', disabled: true }],
    });
  }

  private hoyIso(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  get ctrlActivo(): FormControl { return this.form.controls['activo'] as FormControl; }

  /** Nombre para el resumen bajo la foto. */
  get nombreCompleto(): string {
    return `${this.form?.controls['nombres']?.value ?? ''} ${this.form?.controls['apellidos']?.value ?? ''}`.trim();
  }

  /** Emite cuando el modal hijo se cierra o cuando este componente muere. */
  private hastaQueCierre(modalRef: NgbModalRef): Observable<unknown> {
    return merge(this.destroy$, from(modalRef.result).pipe(catchError(() => of(null))));
  }

  // ================================================================
  // CARGO / DEPARTAMENTO / JEFE (como perfil y horario en saveUser)
  // ================================================================

  async cargarCargoPorId() {
    const id = this.form.get('cargo_id')?.value;
    if (!id) { this.cargoNombreControl.setValue(''); return; }
    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._cargoService.findByIdCargo(id));
      if (res?.status === 'success') {
        this.cargoNombreControl.setValue(res.data.nombre);
      } else {
        this.cargoNombreControl.setValue('');
        this.form.patchValue({ cargo_id: null });
        this._toastr.warning('Cargo no encontrado');
      }
    } catch (error) {
      this.form.patchValue({ cargo_id: null });
      this.cargoNombreControl.setValue('');
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  abrirModalCargos() {
    if (this.isdisabled) return;
    const modalRef = this.modalService.open(ListCargosComponent, { size: 'lg', centered: true, backdrop: 'static' });
    modalRef.componentInstance.cargoSeleccionadoId = this.form.get('cargo_id')?.value;
    modalRef.componentInstance.ayuda = 'Haz clic sobre el cargo del empleado.';
    modalRef.componentInstance.seleccionado
      .pipe(takeUntil(this.hastaQueCierre(modalRef)))
      .subscribe((cargo: any) => {
        this.form.patchValue({ cargo_id: cargo.id });
        this.cargoNombreControl.setValue(cargo.nombre);
      });
  }

  async cargarDepartamentoPorId() {
    const id = this.form.get('departamento_id')?.value;
    if (!id) { this.departamentoNombreControl.setValue(''); return; }
    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._departamentoService.findByIdDepartamento(id));
      if (res?.status === 'success') {
        this.departamentoNombreControl.setValue(res.data.nombre);
      } else {
        this.departamentoNombreControl.setValue('');
        this.form.patchValue({ departamento_id: null });
        this._toastr.warning('Departamento no encontrado');
      }
    } catch (error) {
      this.form.patchValue({ departamento_id: null });
      this.departamentoNombreControl.setValue('');
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  abrirModalDepartamentos() {
    if (this.isdisabled) return;
    const modalRef = this.modalService.open(ListDepartamentosComponent, { size: 'lg', centered: true, backdrop: 'static' });
    modalRef.componentInstance.departamentoSeleccionadoId = this.form.get('departamento_id')?.value;
    modalRef.componentInstance.ayuda = 'Haz clic sobre el departamento del empleado.';
    modalRef.componentInstance.seleccionado
      .pipe(takeUntil(this.hastaQueCierre(modalRef)))
      .subscribe((dep: any) => {
        this.form.patchValue({ departamento_id: dep.id });
        this.departamentoNombreControl.setValue(dep.nombre);
      });
  }

  async cargarJefePorId() {
    const id = this.form.get('jefe_id')?.value;
    if (!id) { this.jefeNombreControl.setValue(''); return; }
    if (this.empleadoId && Number(id) === Number(this.empleadoId) && this.accion !== 'clon') {
      this._toastr.warning('Un empleado no puede ser su propio jefe');
      this.form.patchValue({ jefe_id: null });
      this.jefeNombreControl.setValue('');
      return;
    }
    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._empleadoService.findByIdEmpleado(id));
      if (res?.status === 'success') {
        this.jefeNombreControl.setValue(res.data.nombre_completo);
      } else {
        this.jefeNombreControl.setValue('');
        this.form.patchValue({ jefe_id: null });
        this._toastr.warning('Empleado no encontrado');
      }
    } catch (error) {
      this.form.patchValue({ jefe_id: null });
      this.jefeNombreControl.setValue('');
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  abrirModalJefes() {
    if (this.isdisabled) return;
    const modalRef = this.modalService.open(ListEmpleadosComponent, { size: 'lg', centered: true, backdrop: 'static' });
    modalRef.componentInstance.empleadoSeleccionadoId = this.form.get('jefe_id')?.value;
    modalRef.componentInstance.ayuda = 'Haz clic sobre el jefe directo del empleado.';
    modalRef.componentInstance.seleccionado
      .pipe(takeUntil(this.hastaQueCierre(modalRef)))
      .subscribe((jefe: any) => {
        if (this.empleadoId && jefe.id === this.empleadoId && this.accion !== 'clon') {
          this._toastr.warning('Un empleado no puede ser su propio jefe');
          return;
        }
        this.form.patchValue({ jefe_id: jefe.id });
        this.jefeNombreControl.setValue(jefe.nombre_completo);
      });
  }

  limpiarJefe() {
    if (this.isdisabled) return;
    this.form.patchValue({ jefe_id: null });
    this.jefeNombreControl.setValue('');
  }

  // ================================================================
  // CARGA DEL REGISTRO
  // ================================================================

  private async findByIdEmpleado(id: number) {
    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._empleadoService.findByIdEmpleado(id));

      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo obtener el empleado', 'Error');
        this.imagen_previzualiza = null;
        return;
      }
      this.empleadoModel = res.data;
      const m = this.empleadoModel!;

      this.form.patchValue({
        // Al clonar, identificación y correo son únicos: se dejan vacíos
        numero_identificacion: this.esClon ? '' : m.numero_identificacion,
        tipo_identificacion:   m.tipo_identificacion || 'CC',
        nombres:               m.nombres,
        apellidos:             m.apellidos + (this.esClon ? this.textoClon : ''),
        email:                 this.esClon ? '' : m.email,
        email_personal:        m.email_personal ?? '',
        telefono:              m.telefono ?? '',
        celular:               m.celular ?? '',
        fecha_nacimiento:      m.fecha_nacimiento ?? '',
        genero:                m.genero ?? null,
        direccion:             m.direccion ?? '',
        cargo_id:              m.cargo_id,
        departamento_id:       m.departamento_id,
        jefe_id:               m.jefe_id ?? null,
        fecha_ingreso:         m.fecha_ingreso ?? this.hoyIso(),
        fecha_salida:          m.fecha_salida ?? '',
        estado:                m.estado || 'ACTIVO',
        tipo_contrato:         m.tipo_contrato || 'INDEFINIDO',
        salario:               m.salario != null ? Number(m.salario) : null,
        activo:                m.activo !== false,
        foto:                  m.foto ?? '',
      });
      this.cargoNombreControl.setValue(m.cargo_nombre || '');
      this.departamentoNombreControl.setValue(m.departamento_nombre || '');
      this.jefeNombreControl.setValue(m.jefe_nombre || '');

      if (m.foto) {
        this.imagen_previzualiza = this._empleadoService.getEmpleadoImage(id, true);
        if (this.esClon) {
          await this.convertImageUrlToFile(this._empleadoService.getEmpleadoImage(id, true));
          this.form.patchValue({ foto: null });
        }
        if (!(await this.checkImageExists(this.imagen_previzualiza))) {
          this.imagen_previzualiza = null;
        }
      } else {
        this.imagen_previzualiza = null;
      }
    } catch (error: any) {
      console.error('Error al cargar el empleado:', error);
      this.imagen_previzualiza = null;
      this.activeModal.close();
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  // ================================================================
  // GUARDAR
  // ================================================================

  public async onSubmitForm($ev?: any) {
    $ev?.preventDefault?.();
    this._toastr.clear();
    Object.values(this.form.controls).forEach(control => control.markAsTouched());

    if (!this.form.get('cargo_id')?.value) {
      this._toastr.error('Debe seleccionar un Cargo', 'Error');
      return;
    }
    if (!this.form.get('departamento_id')?.value) {
      this._toastr.error('Debe seleccionar un Departamento', 'Error');
      return;
    }
    if (this.form.invalid) {
      this._toastr.error('Revise los campos del formulario.', 'No se puede Guardar', { timeOut: 20000, closeButton: true });
      return;
    }

    const payload = this.form.getRawValue();
    delete payload.foto;   // la foto va aparte (addImagen)
    payload.salario = (payload.salario === '' || payload.salario === null || payload.salario === undefined) ? null : Number(payload.salario);
    for (const k of ['email_personal', 'telefono', 'celular', 'fecha_nacimiento', 'fecha_salida', 'direccion', 'genero', 'jefe_id']) {
      if (payload[k] === '' || payload[k] === undefined) { payload[k] = null; }
    }
    await this.saveRecord(payload);
  }

  private async saveRecord(data: Partial<EmpleadoModel>) {
    try {
      this._loadingService.setLoading(true);
      this.isdisabled = true;

      if (this.accion === 'edit') {
        this.response = await firstValueFrom(this._empleadoService.editEmpleado(this.registro_selected.id, data));
      } else {
        this.response = await firstValueFrom(
          this.accion === 'clon' ? this._empleadoService.clonEmpleado(data) : this._empleadoService.addEmpleado(data)
        );
      }

      if (this.response?.status !== 'success') {
        this.isdisabled = false;
        return;
      }

      if (this.accion !== 'edit') {
        this.empleadoId = this.response.data.id;
      }

      // 2) La foto, ya con id
      if (this.cambioImagen && this.imagen_file) {
        await this.grabarImagen();
        this.response.data.foto = this.nuevaFoto || this.response.data.foto;
      }

      this.registrosE.emit(this.response.data);
      this._toastr.success(this.response.message, 'Éxito', { closeButton: true });
      this.activeModal.close(this.response.data);
    } catch (error: any) {
      // El AuthInterceptor ya notificó el error HTTP (422 / 409 con el motivo)
      console.error('Error al guardar el empleado:', error);
      this.isdisabled = false;
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  // ================================================================
  // FOTO (calcado del avatar de saveUser)
  // ================================================================

  async grabarImagen() {
    try {
      if (!this.imagen_file || !this.empleadoId) { return null; }
      const formData = new FormData();
      formData.append('EmpleadoId', this.empleadoId.toString());
      formData.append('imagen_file', this.imagen_file);

      const response = await firstValueFrom(this._empleadoService.addImagen(formData));
      if (response.status === 'success') {
        this.nuevaFoto = response.data.foto;
        return response;
      }
      this._toastr.error('No se pudo subir la foto');
      return null;
    } catch (error: any) {
      console.error('Error al subir la foto:', error);
      return null;
    }
  }

  private leerComoDataUrl(blob: Blob): Promise<string | null> {
    return new Promise((resolve) => {
      if (this.destruido) { resolve(null); return; }
      const lector = new FileReader();
      this.lectores.add(lector);
      const terminar = (valor: string | null) => {
        this.lectores.delete(lector);
        lector.onloadend = null; lector.onerror = null; lector.onabort = null;
        resolve(this.destruido ? null : valor);
      };
      lector.onloadend = () => terminar(typeof lector.result === 'string' ? lector.result : null);
      lector.onerror = () => terminar(null);
      lector.onabort = () => terminar(null);
      lector.readAsDataURL(blob);
    });
  }

  /** Punto único de entrada tras seleccionar / pegar / capturar una imagen. */
  private async mostrarImagenSeleccionada(archivo: File): Promise<boolean> {
    this.imagen_file = archivo;
    this.cambioImagen = true;
    const dataUrl = await this.leerComoDataUrl(archivo);
    if (dataUrl === null) { return false; }
    this.imagen_previzualiza = dataUrl;
    this.prepara_imagen_antes_grabar();
    return true;
  }

  async processFile($event: any) {
    const inputElement: HTMLInputElement = $event.target;
    const archivo: File | undefined = inputElement.files?.[0];
    if (!archivo || archivo.type.indexOf('image') < 0) { inputElement.value = ''; return; }
    this.imagen_paste = null;
    await this.mostrarImagenSeleccionada(archivo);
    inputElement.value = '';
  }

  @HostListener('paste', ['$event'])
  onPaste(event: ClipboardEvent): void {
    if (this.esView) return;
    const items = Array.from(event.clipboardData?.items || []);
    const item = items.find(i => i.type.indexOf('image') !== -1);
    if (!item) { return; }   // texto: que el input lo reciba con normalidad
    event.preventDefault();
    const blob = item.getAsFile();
    if (blob) { this.handleImagePaste(blob); }
  }

  async handleImagePaste(imageBlob: Blob): Promise<void> {
    const file = new File([imageBlob], `pasted-image-${Date.now()}.png`, { type: imageBlob.type });
    const ok = await this.mostrarImagenSeleccionada(file);
    if (ok) { this.imagen_paste = this.imagen_previzualiza; }
  }

  clearImage() {
    this.imagen_previzualiza = null;
    this.imagen_paste = '';
    this.imagen_file = null;
    this.form.get('foto')?.setValue(null);
    this.cambioImagen = false;
  }

  @HostListener('document:dragover', ['$event'])
  onDocumentDragOver(event: DragEvent) {
    if (!this.imagen_previzualiza) { event.preventDefault(); }
  }

  onDragOver(event: DragEvent): void { event.preventDefault(); event.stopPropagation(); this.isDragOver = true; }
  onDragLeave(event: DragEvent): void { event.preventDefault(); event.stopPropagation(); this.isDragOver = false; }

  onDrop(event: DragEvent): void {
    if (this.esView) { return; }
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) { this.handleDroppedFile(files[0]); }
  }

  private async handleDroppedFile(file: File): Promise<void> {
    if (!file.type.match('image.*')) {
      this._toastr.error('El archivo debe ser una imagen', 'Error');
      return;
    }
    this.imagen_paste = null;
    await this.mostrarImagenSeleccionada(file);
  }

  async triggerPaste(): Promise<void> {
    try {
      const clipboardItems = await navigator.clipboard.read();
      for (const clipboardItem of clipboardItems) {
        for (const type of clipboardItem.types) {
          if (type.startsWith('image/')) {
            const blob = await clipboardItem.getType(type);
            this.handleImagePaste(blob);
            return;
          }
        }
      }
      this._toastr.info('No se encontró una imagen en el portapapeles', 'Información', { timeOut: 3000 });
    } catch (error) {
      this._toastr.info('No se pudo acceder al portapapeles, use la opción de galería', 'Información', { timeOut: 4000, closeButton: true });
      this.pasteInput?.nativeElement.focus();
    }
  }

  prepara_imagen_antes_grabar() {
    this.cambioImagen = true;
    if (!this.imagen_file) { return; }
    this.comprimirImagen.comprimirImagen(this.imagen_file)
      .then((compressedFile: File) => { if (!this.destruido) { this.imagen_file = compressedFile; } })
      .catch((error: any) => console.error('Error en comprimir la imagen, se usará la original', error));
  }

  handleImageError(_event: any) { this.imagen_previzualiza = null; }

  private async convertImageUrlToFile(imageUrl: string): Promise<void> {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      if (this.destruido) { return; }
      const file = new File([blob], `cloned_photo_${Date.now()}.png`, { type: blob.type });
      await this.mostrarImagenSeleccionada(file);
    } catch (error) {
      if (this.destruido) { return; }
      this.imagen_previzualiza = null;
    }
  }

  private checkImageExists(url: string, timeoutMs = 8000): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.destruido) { resolve(false); return; }
      const img = new Image();
      let resuelto = false;
      const terminar = (existe: boolean) => {
        if (resuelto) { return; }
        resuelto = true;
        clearTimeout(temporizador);
        this.imagenesEnVuelo.delete(img);
        img.onload = null; img.onerror = null; img.src = '';
        resolve(existe);
      };
      const temporizador = setTimeout(() => terminar(false), timeoutMs);
      this.imagenesEnVuelo.add(img);
      img.onload = () => terminar(true);
      img.onerror = () => terminar(false);
      img.src = url;
    });
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.showCameraModal) { this.closeCamera(); return; }
    if (this.showFullscreenImage) { this.closeFullscreen(); }
  }

  openFullscreen(): void {
    if (this.imagen_previzualiza) {
      this.showFullscreenImage = true;
      document.body.style.overflow = 'hidden';
    }
  }

  closeFullscreen(): void {
    this.showFullscreenImage = false;
    document.body.style.overflow = '';
  }

  openGallery(): void {
    if (this.esView) return;
    this.galleryInput?.nativeElement.click();
  }

  async openCamera(): Promise<void> {
    if (this.esView) return;
    this.showCameraModal = true;
    this.cameraError = '';
    this.isUsingFrontCamera = true;
    try {
      await this.startCamera('user');
    } catch (error: any) {
      this.cameraError = 'No se pudo acceder a la cámara. Asegúrate de dar los permisos necesarios.';
      this._toastr.error(this.cameraError);
      this.closeCamera();
    }
  }

  async startCamera(facingMode: 'user' | 'environment'): Promise<void> {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    if (this.destruido || !this.showCameraModal) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
      return;
    }
    this.isUsingFrontCamera = facingMode === 'user';
    if (this.videoCamara) { this.videoCamara.srcObject = this.mediaStream; }
  }

  async switchCamera(): Promise<void> {
    try {
      await this.startCamera(this.isUsingFrontCamera ? 'environment' : 'user');
    } catch (error: any) {
      this.cameraError = 'No se pudo cambiar a la otra cámara.';
      this._toastr.error(this.cameraError);
    }
  }

  capturePhoto(): void {
    const videoElement = this.videoCamara;
    if (!videoElement) return;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return;
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    if (this.isUsingFrontCamera) { context.translate(canvas.width, 0); context.scale(-1, 1); }
    context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    if (this.isUsingFrontCamera) { context.setTransform(1, 0, 0, 1, 0, 0); }
    canvas.toBlob(async (blob) => {
      if (!blob || this.destruido) { return; }
      const file = new File([blob], `camera-capture-${Date.now()}.jpg`, { type: 'image/jpeg' });
      this.imagen_paste = null;
      const ok = await this.mostrarImagenSeleccionada(file);
      if (!ok) { return; }
      this.closeCamera();
      this._toastr.success('Foto capturada correctamente');
    }, 'image/jpeg', 0.8);
  }

  closeCamera(): void {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    if (this.videoCamara) { this.videoCamara.srcObject = null; }
    this.showCameraModal = false;
    this.cameraError = '';
  }
}
