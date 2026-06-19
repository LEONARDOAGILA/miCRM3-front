import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { firstValueFrom, } from 'rxjs';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';


//   ******   SERVICIOS   ******  //
import { DepartamentoService } from "../../../services/departamento.service";
import { SeguridadService } from '../../../../seguridad/services/seguridad.service';
import { LoadingService } from '../../../../../service/loading.service';


//   ******   MODELOS   ******  //
import { DepartamentoModel } from "../../../interfaces/departamentoModel";



@Component({
  selector: 'app-saveDepartamento',
  templateUrl: './saveDepartamento.component.html',
  standalone: false,
})
export class SaveDepartamentoComponent implements OnInit {


  @Input() registro_selected: any = {};
  @Input() accion: any = {}; 
  @Output() registrosE: EventEmitter<any> = new EventEmitter();


  public form: FormGroup;
  public isLoading$ = this._loadingService.isLoading$;
  public response: any;
  public isdisabled: boolean;
  public titulo: string;
  public textoClon: string; 

  public departamentoModel: DepartamentoModel;

    
  constructor(
    private fb: FormBuilder,
    private _toastr: ToastrService,
    public  modal: NgbActiveModal,

    private _loadingService: LoadingService,
    private _seguridadService: SeguridadService,       

    private _departamentoService: DepartamentoService,
  ){

    this.textoClon = "";
    this.isdisabled = false;
    
  }


//   ******   INIT   ******  //
  async ngOnInit(): Promise<void> {
    if (this._seguridadService.isexpired()) {
      this.modal.close();
      return;
    }
    switch (this.accion) {
      case 'add':
        this.titulo = "Nuevo Departamento";
        this.initializeForm();
        break;
  
      case 'edit':
        this.titulo = "Modificar Departamento";
        this.initializeForm();
        await this.findByIdDepartamento(this.registro_selected.id);
        break;
  
      case 'clon':
        this.titulo = "Clonar Departamento";
        this.textoClon = '_CLON';
        this.initializeForm();
        await this.findByIdDepartamento(this.registro_selected.id);
        break;
  
      case 'view':
        this.titulo = "Ver Departamento";
        this.isdisabled = true;
        this.initializeForm();
        await this.findByIdDepartamento(this.registro_selected.id);
        break;
    }
  }


  //   ******   INICIALIZA FORMULARIO   ******  //
  initializeForm():void{
    this.form = this.fb.group({
      nombre: [{ value: '', disabled: this.isdisabled  }, [Validators.required, Validators.maxLength(100)]],
      activo: [{ value: true, disabled: this.isdisabled }]
    });
  }


  //   ******   BUSQUEDA    ******  //
  private async findByIdDepartamento(id: number) {
    try {
      this._loadingService.setLoading(true);
      let res: any = await firstValueFrom(this._departamentoService.findByIdDepartamento(id));
      if (res?.status === 'success') {
        this.departamentoModel = res.data;
        this.departamentoModel.nombre = this.departamentoModel.nombre + this.textoClon;          
        this.form.patchValue(this.departamentoModel);
      } else {
        console.error('Error: Respuesta sin status success', res);
      }
      this._loadingService.setLoading(false);
    } catch (error: any) {
      console.error('Error en la petición', error);
      this.modal.close();         
      this._loadingService.setLoading(false);
    }
  }


  //   ******   GRABAR   ******  //
  private async saveRecord(data: DepartamentoModel) { 
    try {
        this._loadingService.setLoading(true);
        this.isdisabled = true;
        if (this.accion === 'add') {  this.response = await firstValueFrom(this._departamentoService.addDepartamento(data));  }
        else{
            let formData = new FormData();
            formData.append('json', JSON.stringify(data));
            if (this.accion === 'edit'){  this.response = await firstValueFrom(this._departamentoService.editDepartamento(this.registro_selected.id, formData));  }
            if (this.accion === 'clon'){  this.response = await firstValueFrom(this._departamentoService.clonDepartamento(formData));  }
        }
        this.registrosE.emit(this.response.data);
        this._toastr.success(this.response.status, this.response.message,{ closeButton: true });
        this._loadingService.setLoading(false);
        this.modal.close();
    } catch (error: any) {
        console.error('Error en la petición', error);      
        this.isdisabled = false;
        this._loadingService.setLoading(false);
    }
  }


  //   ******   VALIDA FORMULARIO   ******  //
  public async onSubmitForm($ev: any) {
    Object.values(this.form.controls).forEach(control => control.markAsTouched());
    if (this.form.valid) {
        let formData = this.form.getRawValue();
        this.saveRecord(formData);
    } else {
        this._toastr.error('Revise los campos del formulario.', 'No se puede Guardar', { timeOut: 20000,closeButton: true  });
    }
  }




  

}