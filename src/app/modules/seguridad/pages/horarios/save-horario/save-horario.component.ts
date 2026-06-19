import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormGroup, FormBuilder, AbstractControl, ValidationErrors, FormArray, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';
import { SeguridadService } from '../../../../seguridad/services/seguridad.service';
import { LoadingService } from '../../../../../service/loading.service';
import { HorarioService } from '../../../services/horario.service';
import { ChorarioModel } from '../../../interfaces/chorarioModel';
import { DhorarioModel } from '../../../interfaces/dhorarioModel';

@Component({
  selector: 'app-save-horario',
  templateUrl: './save-horario.component.html',
  styleUrls: ['./save-horario.component.css'],
  standalone: false,
})
export class SaveHorarioComponent implements OnInit {
  
  @Input() registro_selected: any = {};
  @Input() accion: any = {};
  @Output() registrosE: EventEmitter<any> = new EventEmitter();

  public form: FormGroup;
  public isLoading$ = this._loadingService.isLoading$;
  public response: any;
  public isdisabled: boolean;
  public titulo: string;
  public textoClon: string;
  public chorarioModel: ChorarioModel;

  public diasSemana = [
    { id: 1, nombre: 'Lunes' },
    { id: 2, nombre: 'Martes' },
    { id: 3, nombre: 'Miércoles' },
    { id: 4, nombre: 'Jueves' },
    { id: 5, nombre: 'Viernes' },
    { id: 6, nombre: 'Sábado' },
    { id: 7, nombre: 'Domingo' }
  ];

  constructor(
    private _fb: FormBuilder,
    private _toastr: ToastrService,
    public modal: NgbActiveModal,
    private _loadingService: LoadingService,
    private _seguridadService: SeguridadService,
    private _horarioService: HorarioService,
  ) {
    this.textoClon = "";
    this.isdisabled = false;
  }

  async ngOnInit(): Promise<void> {
    if (this._seguridadService.isexpired()) {
      this.modal.close();
      return;
    }

    switch (this.accion) {
      case 'add':
        this.titulo = "Nuevo Horario";
        this.initializeForm();
        break;
      case 'edit':
        this.titulo = "Modificar Horario";
        this.initializeForm();
        await this.getHorarioById(this.registro_selected.id);
        break;
      case 'clon':
        this.titulo = "Clonar Horario";
        this.textoClon = '_CLON';
        this.initializeForm();
        await this.getHorarioById(this.registro_selected.id);
        break;
      case 'view':
        this.titulo = "Ver Horario";
        this.isdisabled = true;
        this.initializeForm();
        await this.getHorarioById(this.registro_selected.id);
        break;
    }
  }

  initializeForm(): void {
    this.form = this._fb.group({
      nombre: [{ value: '', disabled: this.isdisabled }, [Validators.required, Validators.maxLength(100)]],
      activo: [{ value: true, disabled: this.isdisabled }],
      dhorario: this._fb.array([], this.validarDiasUnicos)
    });
  }

  async getHorarioById(id: number) {
    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._horarioService.getHorario(id));
      
      if (res?.status === 'success') {
        this.chorarioModel = res.data;
        
        // Si es clonación, modificar el nombre
        if (this.textoClon) {
          this.chorarioModel.nombre = this.chorarioModel.nombre + this.textoClon;
        }
        
        // Actualizar cabecera del formulario
        this.form.patchValue({
          nombre: this.chorarioModel.nombre,
          activo: this.chorarioModel.activo
        });
        
        // Limpiar el form array antes de llenarlo
        this.dhorario.clear();
        
        // Cargar detalles - los detalles están en dhorario
        const detalles = this.chorarioModel.dhorario || [];
        
        if (detalles.length > 0) {
          detalles.forEach((item: DhorarioModel) => {
            this.dhorario.push(this._fb.group({
              id: [item.id],
              chorario_id: [item.chorario_id],
              dia: [item.dia, Validators.required],
              hora_inicio: [item.hora_inicio, Validators.required],
              hora_fin: [item.hora_fin, Validators.required],
              activo: [item.activo !== undefined ? item.activo : true]
            }, { validators: this.validarHoras }));
          });
        } else {
          // Si no hay detalles, agregar un item por defecto
          this.addHorarioItem();
        }
        
        // Si es modo vista, deshabilitar todo el formulario
        if (this.isdisabled) {
          this.form.disable();
        }
      } else {
        console.error('Error: Respuesta sin status success', res);
        this._toastr.error(res?.message || 'Error al cargar el horario', 'Error');
      }
      this._loadingService.setLoading(false);
    } catch (error: any) {
      console.error('Error en getHorarioById:', error);
      this._toastr.error(error.message || 'Error al cargar el horario', 'Error');
      this.modal.close();
      this._loadingService.setLoading(false);
    }
  }

  // async saveRecord(data: any) {
  //   try {
  //     this._loadingService.setLoading(true);
  //     this.isdisabled = true;
      
  //     // Preparar los datos para enviar
  //     const datosEnvio = {
  //       nombre: data.nombre,
  //       activo: data.activo,
  //       dhorario: data.dhorario.map((item: any) => ({
  //         dia: item.dia,
  //         hora_inicio: item.hora_inicio,
  //         hora_fin: item.hora_fin,
  //         activo: item.activo
  //       }))
  //     };
      
  //     if (this.accion === 'add') {
  //       this.response = await firstValueFrom(this._horarioService.addHorario(datosEnvio));
  //     } else if (this.accion === 'edit') {
  //       this.response = await firstValueFrom(this._horarioService.editHorario(this.registro_selected.id, datosEnvio));
  //     } else if (this.accion === 'clon') {
  //       this.response = await firstValueFrom(this._horarioService.addHorario(datosEnvio));
  //     }
      
  //     console.log('Respuesta del servidor:', this.response);
  //     if (this.response?.body.status === 'success') {
  //       this.registrosE.emit(this.response.data);
  //       this._toastr.success(this.response.message, 'Éxito', { closeButton: true });
  //     } else {
  //       this._toastr.error(this.response?.message || 'Error al guardar', 'Error');
  //     }
      
  //     this._loadingService.setLoading(false);
  //     this.modal.close();
  //   } catch (error: any) {
  //     console.error('Error en saveRecord:', error);
  //     this.isdisabled = false;
  //     this._loadingService.setLoading(false);
  //     this._toastr.error(error.message || 'Error al guardar el horario', 'Error');
  //   }
  // }

  async saveRecord(data: any) {
  try {
    this._loadingService.setLoading(true);
    this.isdisabled = true;
    
    const datosEnvio = {
      nombre: data.nombre,
      activo: data.activo,
      dhorario: data.dhorario.map((item: any) => ({
        dia: item.dia,
        hora_inicio: item.hora_inicio,
        hora_fin: item.hora_fin,
        activo: item.activo
      }))
    };
    
    if (this.accion === 'add') {
      this.response = await firstValueFrom(this._horarioService.addHorario(datosEnvio));
    } else if (this.accion === 'edit') {
      this.response = await firstValueFrom(this._horarioService.editHorario(this.registro_selected.id, datosEnvio));
    } else if (this.accion === 'clon') {
      this.response = await firstValueFrom(this._horarioService.addHorario(datosEnvio));
    }
    
    // Verificar que la respuesta es exitosa y tiene datos
    if (this.response?.status === 'success' && this.response?.data) {
      this.registrosE.emit(this.response.data);  // Emitir solo si hay datos
      this._toastr.success(this.response.message, 'Éxito', { closeButton: true });
      this.modal.close();
    } else {
      // Si hay error, mostrar mensaje pero NO emitir
      this._toastr.error(this.response?.message || 'Error al guardar', 'Error');
    }
    
    this._loadingService.setLoading(false);
    this.isdisabled = false;
  } catch (error: any) {
    console.error('Error en saveRecord:', error);
    this.isdisabled = false;
    this._loadingService.setLoading(false);
    this._toastr.error(error.message || 'Error al guardar el horario', 'Error');
    // NO emitir registrosE en caso de error
  }
}
  async onSubmitForm($event: any) {
    Object.values(this.form.controls).forEach(control => {
      if (control instanceof FormArray) {
        control.controls.forEach(c => c.markAsTouched());
      } else {
        control.markAsTouched();
      }
    });
    
    if (this.form.valid) {
      const formData = this.form.getRawValue();
      this.saveRecord(formData);
    } else {
      this._toastr.error('Revise los campos del formulario.', 'No se puede Guardar', { timeOut: 20000, closeButton: true });
    }
  }

  // ****** GETTERS ****** //
  get dhorario(): FormArray {
    return this.form.get('dhorario') as FormArray;
  }

  // ****** VALIDADORES ****** //
  validarDiasUnicos(formArray: AbstractControl): ValidationErrors | null {
    const diasSeleccionados = (formArray as FormArray).controls
      .map(control => control.get('dia')?.value)
      .filter(dia => dia !== null && dia !== undefined);
    
    const tieneDuplicados = diasSeleccionados.some((dia, index) => diasSeleccionados.indexOf(dia) !== index);
    
    return tieneDuplicados ? { diasDuplicados: true } : null;
  }

  validarHoras(group: AbstractControl): ValidationErrors | null {
    const inicio = group.get('hora_inicio')?.value;
    const fin = group.get('hora_fin')?.value;
    
    if (!inicio || !fin) return null;
    
    return inicio >= fin ? { horaInvalida: true } : null;
  }

  // ****** MANEJO DE DHORARIO ****** //
  newHorarioItem(): FormGroup {
    return this._fb.group({
      id: [null],
      chorario_id: [null],
      dia: [1, Validators.required],
      hora_inicio: ['', Validators.required],
      hora_fin: ['', Validators.required],
      activo: [true]
    }, { validators: this.validarHoras });
  }

  addHorarioItem(): void {
    this.dhorario.push(this.newHorarioItem());
  }

  removeHorarioItem(index: number): void {
    if (this.dhorario.length > 1) {
      this.dhorario.removeAt(index);
    } else {
      this._toastr.warning('Debe tener al menos un día asignado al horario', 'Advertencia');
    }
  }
}