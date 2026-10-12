import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormGroup, FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';

//   ******   SERVICIOS   ******  //
import { SeguridadService } from '../../../services/seguridad.service';
import { LoadingService } from '../../../../../service/loading.service';
import { TipoUsuarioService } from '../../../services/tipoUsuario.service';

//   ******   MODELOS   ******  //
import { TipoUsuarioModel } from '../../../interfaces/tipoUsuarioModel';

//   ******   COMPONENTES   ******  //
import { PanelModule } from '../../../../../components/panel/panel.module';
import { ModalHeaderComponent } from '../../../../../components/modal/modal-header/modal-header.component';
import { ModalFooterComponent } from '../../../../../components/modal/modal-footer/modal-footer.component';
import { CampoTextoComponent } from '../../../../../components/campos/campoTexto/campoTexto.component';
import { CampoTextoAreaComponent } from '../../../../../components/campos/campoTextoArea/campoTextoArea.component';
import { CampoNumeroEnteroComponent } from '../../../../../components/campos/campoNumeroEntero/campoNumeroEntero.component';
import { CheckboxComponent } from '../../../../../components/campos/checkbox/checkbox.component';

/**
 * Ficha de un tipo de usuario, en los cuatro modos de la casa: add, edit, view
 * y clon.
 *
 * LAS FECHAS SON LO DELICADO de esta pantalla: si un tipo tiene fecha de fin,
 * sus usuarios dejan de entrar al sistema ese día. Por eso el bloque de
 * vigencia va aparte, con su aviso, y la ficha dice en todo momento si lo que
 * se está guardando deja el tipo vigente o no.
 */
@Component({
  selector: 'app-saveTipoUsuario',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, PanelModule,
    ModalHeaderComponent, ModalFooterComponent,
    CampoTextoComponent, CampoTextoAreaComponent, CampoNumeroEnteroComponent, CheckboxComponent,
  ],
  templateUrl: './saveTipoUsuario.component.html',
  styleUrls: ['./saveTipoUsuario.component.css'],
})
export class SaveTipoUsuarioComponent implements OnInit {

  @Input() registro_selected: any = {};
  @Input() accion: any = {};
  @Output() registrosE: EventEmitter<any> = new EventEmitter();

  public form: FormGroup;
  public isLoading$ = this._loadingService.isLoading$;
  public response: any;
  public isdisabled: boolean;
  public titulo: string;
  public textoClon: string;
  public tipoUsuarioModel: TipoUsuarioModel | null = null;

  /** Los colores del tema, para la etiqueta del tipo. */
  public readonly colores = [
    { valor: 'bg-primary',   nombre: 'Azul' },
    { valor: 'bg-success',   nombre: 'Verde' },
    { valor: 'bg-info',      nombre: 'Celeste' },
    { valor: 'bg-warning',   nombre: 'Amarillo' },
    { valor: 'bg-danger',    nombre: 'Rojo' },
    { valor: 'bg-secondary', nombre: 'Gris' },
    { valor: 'bg-dark',      nombre: 'Negro' },
  ];

  constructor(
    private _fb: FormBuilder,
    private _toastr: ToastrService,
    public modal: NgbActiveModal,
    private _loadingService: LoadingService,
    private _seguridadService: SeguridadService,
    private _tipoUsuarioService: TipoUsuarioService,
  ) {
    this.textoClon = '';
    this.isdisabled = false;
  }

  async ngOnInit(): Promise<void> {
    if (this._seguridadService.isexpired()) {
      this.modal.close();
      return;
    }

    switch (this.accion) {
      case 'add':
        this.titulo = 'Nuevo Tipo de Usuario';
        this.initializeForm();
        break;
      case 'edit':
        this.titulo = 'Modificar Tipo de Usuario';
        this.initializeForm();
        await this.getTipoUsuarioById(this.registro_selected.id);
        break;
      case 'clon':
        this.titulo = 'Clonar Tipo de Usuario';
        this.textoClon = '_CLON';
        this.initializeForm();
        await this.getTipoUsuarioById(this.registro_selected.id);
        break;
      case 'view':
        this.titulo = 'Ver Tipo de Usuario';
        this.isdisabled = true;
        this.initializeForm();
        await this.getTipoUsuarioById(this.registro_selected.id);
        break;
    }
  }

  initializeForm(): void {
    this.form = this._fb.group({
      codigo:       [{ value: '', disabled: this.isdisabled }, [Validators.required, Validators.minLength(3), Validators.maxLength(20)]],
      nombre:       [{ value: '', disabled: this.isdisabled }, [Validators.required, Validators.maxLength(60)]],
      descripcion:  [{ value: '', disabled: this.isdisabled }, [Validators.maxLength(500)]],
      icono:        [{ value: '', disabled: this.isdisabled }, [Validators.maxLength(40)]],
      color:        [{ value: 'bg-secondary', disabled: this.isdisabled }],
      orden:        [{ value: 100, disabled: this.isdisabled }],
      activo:       [{ value: true, disabled: this.isdisabled }],
      // Vacío = sin límite por ese lado; es lo que vale un tipo normal
      fecha_inicio: [{ value: '', disabled: this.isdisabled }],
      fecha_fin:    [{ value: '', disabled: this.isdisabled }],
    });
  }

  // Los campos compartidos piden un FormControl, no un AbstractControl
  public c(nombre: string): FormControl {
    return this.form.controls[nombre] as FormControl;
  }

  async getTipoUsuarioById(id: number) {
    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._tipoUsuarioService.getTipoUsuario(id));

      if (res?.status === 'success') {
        this.tipoUsuarioModel = res.data;

        this.form.patchValue({
          // Al clonar hay que cambiar el código: es único
          codigo:       (this.tipoUsuarioModel?.codigo ?? '') + this.textoClon,
          nombre:       (this.tipoUsuarioModel?.nombre ?? '') + (this.textoClon ? ' (copia)' : ''),
          descripcion:  this.tipoUsuarioModel?.descripcion ?? '',
          icono:        this.tipoUsuarioModel?.icono ?? '',
          color:        this.tipoUsuarioModel?.color ?? 'bg-secondary',
          orden:        this.tipoUsuarioModel?.orden ?? 100,
          activo:       this.tipoUsuarioModel?.activo ?? true,
          fecha_inicio: this.tipoUsuarioModel?.fecha_inicio ?? '',
          fecha_fin:    this.tipoUsuarioModel?.fecha_fin ?? '',
        });
      }
      this._loadingService.setLoading(false);
    } catch (error: any) {
      console.error('Error al leer el tipo de usuario', error);
      this._loadingService.setLoading(false);
      this.modal.close();
    }
  }

  // ****** VIGENCIA ****** //
  /** Cuántos usuarios tiene puestos (sólo al ver o modificar). */
  public get enUso(): number {
    return this.tipoUsuarioModel?.en_uso ?? 0;
  }

  /**
   * Si lo que hay escrito ahora mismo deja el tipo vigente HOY.
   *
   * Se calcula en la pantalla para poder avisar antes de guardar; la que manda
   * es seguridad.fn_tipo_usuario_vigente, que es la que mira el middleware en
   * cada petición.
   */
  public get vigenteAhora(): boolean {
    if (!this.form) { return true; }
    if (this.form.getRawValue().activo === false) { return false; }

    const hoy = new Date().toISOString().slice(0, 10);
    const desde = this.form.getRawValue().fecha_inicio;
    const hasta = this.form.getRawValue().fecha_fin;

    if (desde && desde > hoy) { return false; }
    if (hasta && hasta < hoy) { return false; }
    return true;
  }

  /** El aviso de debajo de las fechas, en palabras. */
  public get avisoVigencia(): string {
    const v = this.form?.getRawValue() ?? {};

    if (v.activo === false) {
      return 'Dado de baja: no se puede asignar y sus usuarios no entran al sistema.';
    }
    if (!v.fecha_inicio && !v.fecha_fin) {
      return 'Sin fechas: vale desde siempre y no caduca.';
    }
    if (!this.vigenteAhora) {
      return v.fecha_inicio && v.fecha_inicio > new Date().toISOString().slice(0, 10)
        ? 'Hoy NO está vigente: todavía no empieza, y sus usuarios no podrán entrar hasta esa fecha.'
        : 'Hoy NO está vigente: ya caducó, y sus usuarios no pueden entrar.';
    }
    return v.fecha_fin
      ? 'Vigente hoy. El último día de acceso es el ' + v.fecha_fin.split('-').reverse().join('/') + ', incluido.'
      : 'Vigente hoy, sin fecha de caducidad.';
  }

  /** Quita las dos fechas de un golpe: es lo que se quiere casi siempre. */
  public quitarVigencia(): void {
    if (this.isdisabled) { return; }
    this.form.patchValue({ fecha_inicio: '', fecha_fin: '' });
  }

  // ****** GUARDAR ****** //
  private async saveRecord(data: any) {
    try {
      this._loadingService.setLoading(true);
      this.isdisabled = true;

      // Las fechas vacías viajan como null: en la base NULL es «sin límite»,
      // y una cadena vacía no es una fecha
      const datosEnvio = {
        codigo:       (data.codigo ?? '').toString().trim().toUpperCase(),
        nombre:       (data.nombre ?? '').toString().trim(),
        descripcion:  (data.descripcion ?? '').toString().trim() || null,
        icono:        (data.icono ?? '').toString().trim() || null,
        color:        data.color || null,
        orden:        data.orden ?? 100,
        activo:       data.activo === true,
        fecha_inicio: data.fecha_inicio || null,
        fecha_fin:    data.fecha_fin || null,
      };

      if (this.accion === 'edit') {
        this.response = await firstValueFrom(
          this._tipoUsuarioService.editTipoUsuario(this.registro_selected.id, datosEnvio));
      } else {
        this.response = await firstValueFrom(this._tipoUsuarioService.addTipoUsuario(datosEnvio));
      }

      if (this.response?.status === 'success') {
        this.registrosE.emit(this.response.data);
        this._toastr.success(this.response.message, 'Éxito', { closeButton: true });
        this.modal.close();
      } else {
        this.isdisabled = false;
        this._toastr.error(this.response?.message || 'No se pudo guardar', 'Error', { closeButton: true });
      }

      this._loadingService.setLoading(false);
    } catch (error: any) {
      // El interceptor ya enseña el mensaje del servidor; aquí sólo se
      // devuelve el formulario al usuario para que pueda corregir
      this.isdisabled = false;
      this._loadingService.setLoading(false);
      console.error('Error al guardar el tipo de usuario:', error);
    }
  }

  public async onSubmitForm($event: any) {
    (<any>Object).values(this.form.controls).forEach((control: any) => { control.markAsTouched(); });

    if (!this.form.valid) {
      this._toastr.error('Revise los campos del formulario.', 'No se puede Guardar', { timeOut: 20000, closeButton: true });
      return;
    }

    const v = this.form.getRawValue();

    if (v.fecha_inicio && v.fecha_fin && v.fecha_fin < v.fecha_inicio) {
      this._toastr.error('La fecha de fin no puede ser anterior a la de inicio.', 'Vigencia', { closeButton: true });
      return;
    }

    // Avisar, no impedir: puede ser a propósito —dejar preparado un tipo que
    // empieza el mes que viene—, pero no debería pasar por descuido
    if (!this.vigenteAhora && this.enUso > 0) {
      this._toastr.warning(
        `Este tipo lo tienen ${this.enUso} usuario(s) y queda fuera de vigencia: no podrán entrar al sistema.`,
        'Atención', { timeOut: 8000, closeButton: true });
    }

    await this.saveRecord(v);
  }
}
