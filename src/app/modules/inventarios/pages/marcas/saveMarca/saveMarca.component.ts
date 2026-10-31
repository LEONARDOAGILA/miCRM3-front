import { Component, EventEmitter, Input, OnDestroy, OnInit, Output, ChangeDetectionStrategy } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { Subject, firstValueFrom } from 'rxjs';

import { SeguridadService } from '../../../../seguridad/services/seguridad.service';
import { LoadingService } from '../../../../../service/loading.service';
import { MarcaService } from '../../../services/marca.service';
import { MarcaModel, PAISES_MARCA } from '../../../interfaces/marcaModel';
import { CommonModule } from '@angular/common';
import { PanelComponent } from '../../../../../components/panel/panel.component';
import { ModalHeaderComponent } from '../../../../../components/modal/modal-header/modal-header.component';
import { ModalFooterComponent } from '../../../../../components/modal/modal-footer/modal-footer.component';
import { ComboComponent } from '../../../../../components/campos/combo/combo.component';
import { CampoTextoComponent } from '../../../../../components/campos/campoTexto/campoTexto.component';
import { CampoTextoAreaComponent } from '../../../../../components/campos/campoTextoArea/campoTextoArea.component';
import { CheckboxComponent } from '../../../../../components/campos/checkbox/checkbox.component';

/** Acciones con las que se abre el modal desde allMarcas. */
type AccionMarca = 'add' | 'edit' | 'clon' | 'view';

/**
 * Alta, modificación, clonación y vista de una marca (inventarios.marcas).
 *
 * Mismo esquema que saveCargo: formulario reactivo, paneles del tema, campos
 * app-campo* y el pie con Guardar. En 'view' el formulario va deshabilitado y
 * no hay botón de guardar.
 *
 * EL LOGO SE SUBE DESPUÉS DE GUARDAR, igual que la foto en saveEmpleado: la
 * ruta addLogo necesita el id de la marca, y al crear todavía no existe. El
 * fichero se queda esperando en memoria y se manda en cuanto hay id.
 */
@Component({
  selector: 'app-saveMarca',
  templateUrl: './saveMarca.component.html',
  styleUrls: ['./saveMarca.component.css'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    CommonModule, ReactiveFormsModule, PanelComponent, ModalHeaderComponent,
    ModalFooterComponent, ComboComponent, CampoTextoComponent,
    CampoTextoAreaComponent, CheckboxComponent,
  ],
})
export class SaveMarcaComponent implements OnInit, OnDestroy {

  /** Registro a editar / clonar / ver, o 0 al crear. */
  @Input() registro_selected: any = {};
  @Input() accion: AccionMarca = 'add';
  @Output() registrosE: EventEmitter<any> = new EventEmitter();

  public form: FormGroup;
  public isLoading$ = this._loadingService.isLoading$;
  public response: any;
  public isdisabled = false;
  public titulo = '';
  public textoClon = '';
  public marcaModel: MarcaModel | null = null;

  /** Opciones del combo País de origen. */
  public paises = PAISES_MARCA;

  // ---------- El logo ----------
  /** El fichero elegido, esperando a que haya id para subirse. */
  public logoFile: File | null = null;
  /** Lo que se enseña: la url del logo guardado o el `data:` del recién elegido. */
  public logoVista: string | null = null;
  /** Para marcar el id de la marca al clonar/crear y poder subir el logo. */
  private marcaId: number | null = null;

  private readonly destroy$ = new Subject<void>();
  /** Los FileReader abiertos, para cortarlos si se cierra el modal a medias. */
  private readonly lectores = new Set<FileReader>();
  private destruido = false;

  constructor(
    private fb: FormBuilder,
    public modal: NgbActiveModal,
    private _toastr: ToastrService,
    private _loadingService: LoadingService,
    private _seguridadService: SeguridadService,
    private _marcaService: MarcaService,
  ) {}

  // ================================================================
  // ESTADO DERIVADO
  // ================================================================

  get esView(): boolean { return this.accion === 'view'; }
  get esNuevo(): boolean { return this.accion === 'add' || this.accion === 'clon'; }
  get ctrlActivo(): FormControl { return this.form.controls['activo'] as FormControl; }

  /** Productos de esta marca (sólo informativo, viene del back). */
  get numProductos(): number {
    return Number(this.marcaModel?.num_productos ?? this.registro_selected?.num_productos ?? 0);
  }

  // ================================================================
  // CICLO DE VIDA
  // ================================================================

  async ngOnInit(): Promise<void> {
    if (this._seguridadService.isexpired()) {
      this.modal.close();
      return;
    }

    this.isdisabled = this.esView;
    this.initializeForm();

    switch (this.accion) {
      case 'add':
        this.titulo = 'Nueva Marca';
        break;
      case 'edit':
        this.titulo = 'Modificar Marca';
        await this.findByIdMarca(this.registro_selected.id);
        break;
      case 'clon':
        this.titulo = 'Clonar Marca';
        this.textoClon = '_CLON';
        await this.findByIdMarca(this.registro_selected.id);
        break;
      case 'view':
        this.titulo = 'Ver Marca';
        await this.findByIdMarca(this.registro_selected.id);
        break;
    }
  }

  ngOnDestroy(): void {
    this.destruido = true;
    this.lectores.forEach(l => l.abort());
    this.lectores.clear();
    this.destroy$.next();
    this.destroy$.complete();
  }

  //   ******   INICIALIZA FORMULARIO   ******  //
  initializeForm(): void {
    this.form = this.fb.group({
      nombre:      [{ value: '', disabled: this.isdisabled }, [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
      pais_origen: [{ value: null, disabled: this.isdisabled }, [Validators.maxLength(60)]],
      sitio_web:   [{ value: '', disabled: this.isdisabled }, [Validators.maxLength(200)]],
      descripcion: [{ value: '', disabled: this.isdisabled }, [Validators.maxLength(2000)]],
      activo:      [{ value: true, disabled: this.isdisabled }],
    });
  }

  //   ******   CARGA EL REGISTRO   ******  //
  async findByIdMarca(id: number): Promise<void> {
    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._marcaService.findByIdMarca(id));
      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo obtener la marca', 'Error');
        return;
      }
      this.marcaModel = res.data;
      this.form.patchValue({
        nombre:      (this.marcaModel!.nombre ?? '') + this.textoClon,
        pais_origen: this.marcaModel!.pais_origen ?? null,
        sitio_web:   this.marcaModel!.sitio_web ?? '',
        descripcion: this.marcaModel!.descripcion ?? '',
        activo:      this.marcaModel!.activo !== false,
      });

      // El logo de la marca que se está viendo o editando. Al CLONAR no se
      // arrastra: la copia empieza sin logo, que es más claro que heredar
      // una imagen que luego nadie recuerda de dónde salió.
      if (this.marcaModel!.logo && this.accion !== 'clon') {
        this.logoVista = this._marcaService.urlLogo(id, true);
      }
    } catch (error) {
      // El AuthInterceptor ya muestra el toast del error HTTP
      console.error('Error al cargar la marca:', error);
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  // ================================================================
  // EL LOGO
  // ================================================================

  /**
   * Eligieron un fichero.
   *
   * Se valida aquí lo que se puede —que sea imagen y no pase de 10 MB— para
   * no hacer subir diez megas y que el servidor conteste que no. La
   * validación del servidor sigue estando: ésta es por comodidad, no por
   * seguridad.
   */
  onLogoElegido(evento: Event): void {
    const input = evento.target as HTMLInputElement;
    const file = input.files?.[0];
    // El input se limpia siempre: si no, elegir dos veces el MISMO fichero
    // no dispara el evento la segunda vez
    input.value = '';
    if (!file) { return; }

    if (!file.type.startsWith('image/')) {
      this._toastr.warning('El archivo debe ser una imagen', 'Logo');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      this._toastr.warning('La imagen no puede superar los 10 MB', 'Logo');
      return;
    }

    this.logoFile = file;

    const lector = new FileReader();
    this.lectores.add(lector);
    lector.onloadend = () => {
      this.lectores.delete(lector);
      if (!this.destruido) { this.logoVista = lector.result as string; }
    };
    lector.onerror = () => {
      this.lectores.delete(lector);
      if (!this.destruido) { this._toastr.error('No se pudo leer la imagen', 'Logo'); }
    };
    lector.readAsDataURL(file);
  }

  /** Quita el logo de la vista. El que ya estuviera guardado se cambia al subir otro. */
  quitarLogo(): void {
    this.logoFile = null;
    this.logoVista = null;
  }

  /**
   * Sube el logo, ya con el id.
   *
   * Si falla NO se deshace el guardado: la marca ya está bien creada y lo
   * único que falta es la imagen, que se puede volver a intentar entrando a
   * modificarla. Avisar y seguir es menos malo que perder el registro.
   */
  private async subirLogo(id: number): Promise<void> {
    if (!this.logoFile) { return; }
    try {
      const datos = new FormData();
      datos.append('MarcaId', String(id));
      datos.append('imagen_file', this.logoFile);
      const res: any = await firstValueFrom(this._marcaService.addLogo(datos));
      if (res?.status !== 'success') {
        this._toastr.warning('La marca se guardó, pero el logo no se pudo subir', 'Logo');
      }
    } catch (error) {
      console.error('Error al subir el logo:', error);
      this._toastr.warning('La marca se guardó, pero el logo no se pudo subir', 'Logo');
    }
  }

  // ================================================================
  // GUARDAR
  // ================================================================

  //   ******   VALIDA FORMULARIO   ******  //
  public async onSubmitForm($ev?: any): Promise<void> {
    $ev?.preventDefault?.();
    this._toastr.clear();
    Object.values(this.form.controls).forEach(control => control.markAsTouched());

    if (this.form.invalid) {
      this._toastr.error('Revise los campos del formulario.', 'No se puede Guardar', { timeOut: 20000, closeButton: true });
      return;
    }

    const payload = this.form.getRawValue();
    payload.pais_origen = payload.pais_origen || null;
    payload.sitio_web   = (payload.sitio_web ?? '').trim() || null;
    payload.descripcion = (payload.descripcion ?? '').trim() || null;

    await this.saveRecord(payload);
  }

  //   ******   GRABAR DATA  ******  //
  private async saveRecord(data: Partial<MarcaModel>): Promise<void> {
    try {
      this._loadingService.setLoading(true);
      this.isdisabled = true;

      if (this.accion === 'edit') {
        this.response = await firstValueFrom(this._marcaService.editMarca(this.registro_selected.id, data));
      } else {
        this.response = await firstValueFrom(
          this.accion === 'clon' ? this._marcaService.clonMarca(data) : this._marcaService.addMarca(data)
        );
      }

      if (this.response?.status !== 'success') {
        this.isdisabled = false;
        return;
      }

      // El logo, ya con id (al crear sale del registro recién hecho)
      this.marcaId = this.accion === 'edit' ? this.registro_selected.id : this.response.data.id;
      if (this.logoFile && this.marcaId) {
        await this.subirLogo(this.marcaId);
        // El listado necesita saber que ahora hay logo para pintarlo
        this.response.data.logo = this.response.data.logo ?? 'nuevo';
      }

      this.registrosE.emit(this.response.data);
      this._toastr.success(this.response.message, 'Éxito', { closeButton: true });
      this.modal.close(this.response.data);
    } catch (error: any) {
      // El AuthInterceptor ya notificó el error HTTP (422 / 409 con el motivo)
      console.error('Error al guardar la marca:', error);
      this.isdisabled = false;
    } finally {
      this._loadingService.setLoading(false);
    }
  }
}
