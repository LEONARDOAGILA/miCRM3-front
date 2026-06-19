import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { firstValueFrom, } from 'rxjs';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';


//   ******   SERVICIOS   ******  //
import { ReporteExternoService } from "../../../services/reporteExterno.service";
import { SeguridadService } from '../../../../seguridad/services/seguridad.service';
import { LoadingService } from '../../../../../service/loading.service';


//   ******   MODELOS   ******  //
import { ReporteExternoModel } from "../../../interfaces/reporteExternoModel";
import { DepartamentoModel } from '../../../../config/interfaces/departamentoModel';
import { DepartamentoService } from '../../../../config/services/departamento.service';



@Component({
  selector: 'app-saveReporteExterno',
  templateUrl: './saveReporteExterno.component.html',
  standalone: false,
})
export class SaveReporteExternoComponent implements OnInit {


  @Input() registro_selected: any = {};
  @Input() accion: any = {}; 
  @Output() registrosE: EventEmitter<any> = new EventEmitter();

  public departamentoModel: DepartamentoModel[] = [];  
  

  public form: FormGroup;
  public isLoading$ = this._loadingService.isLoading$;
  public response: any;
  public isdisabled: boolean;
  public titulo: string;
  public textoClon: string; 

  public reporteExternoModel: ReporteExternoModel;

    
  constructor(
    private fb: FormBuilder,
    private _toastr: ToastrService,
    public  modal: NgbActiveModal,

    private _loadingService: LoadingService,
    private _seguridadService: SeguridadService,  
    private _departamento: DepartamentoService,     

    private _reporteExternoService: ReporteExternoService,
  ){

    this.textoClon = "";
    this.isdisabled = false;
    this.listDepartamentos();
    
  }


//   ******   INIT   ******  //
  async ngOnInit(): Promise<void> {
    if (this._seguridadService.isexpired()) {
      this.modal.close();
      return;
    }
    switch (this.accion) {
      case 'add':
        this.titulo = "Nuevo ReporteExterno";
        this.initializeForm();
        break;
  
      case 'edit':
        this.titulo = "Modificar ReporteExterno";
        this.initializeForm();
        await this.findByIdReporteExterno(this.registro_selected.id);
        break;
  
      case 'clon':
        this.titulo = "Clonar ReporteExterno";
        this.textoClon = '_CLON';
        this.initializeForm();
        await this.findByIdReporteExterno(this.registro_selected.id);
        break;
  
      case 'view':
        this.titulo = "Ver ReporteExterno";
        this.isdisabled = true;
        this.initializeForm();
        await this.findByIdReporteExterno(this.registro_selected.id);
        break;
    }
  }


  //   ******   INICIALIZA FORMULARIO   ******  //
  initializeForm():void{
    this.form = this.fb.group({
      nombre: [{ value: '', disabled: this.isdisabled  }, [Validators.required, Validators.maxLength(100)]],
      descripcion: [{ value: '', disabled: this.isdisabled  }, [Validators.required, Validators.maxLength(500)]],
      url: [{ value: '', disabled: this.isdisabled  }, [Validators.required, Validators.maxLength(500)]],
      activo: [{ value: true, disabled: this.isdisabled }],
      departamento_id: [{ value: 0, disabled: this.isdisabled }, [Validators.required]],
    });
  }

  //   ******   LISTADO DE DEPARTAMENTOS   ******  //
  async listDepartamentos() {
    try {
        this._loadingService.setLoading(true); 
        let res: any = await firstValueFrom(this._departamento.listDepartamentos());
        if (res?.status === 'success') {
            this._loadingService.setLoading(false); 
            this.departamentoModel = res.data;
            //console.log('DepartamentoModel', this.departamentoModel);
        }else{
          this._loadingService.setLoading(false); 
          console.error('response -> Error: Respuesta sin status success', res);
        }
    } catch (error: any) {
      this._loadingService.setLoading(false); 
      console.error('response -> Error en la petición', error);
    }
  }


  
  //   ******   BUSQUEDA    ******  //
  private async findByIdReporteExterno(id: number) {
    try {
      this._loadingService.setLoading(true);
      let res: any = await firstValueFrom(this._reporteExternoService.findByIdReporteExterno(id));
      if (res?.status === 'success') {
        this.reporteExternoModel = res.data;
        this.reporteExternoModel.nombre = this.reporteExternoModel.nombre + this.textoClon;          
        this.form.patchValue(this.reporteExternoModel);
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
  private async saveRecord(data: ReporteExternoModel) { 
    try {
        this._loadingService.setLoading(true);
        this.isdisabled = true;
        if (this.accion === 'add') {  this.response = await firstValueFrom(this._reporteExternoService.addReporteExterno(data));  }
        else{
            let formData = new FormData();
            formData.append('json', JSON.stringify(data));
            if (this.accion === 'edit'){  this.response = await firstValueFrom(this._reporteExternoService.editReporteExterno(this.registro_selected.id, formData));  }
            if (this.accion === 'clon'){  this.response = await firstValueFrom(this._reporteExternoService.clonReporteExterno(formData));  }
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