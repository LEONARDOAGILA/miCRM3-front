import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { firstValueFrom, } from 'rxjs';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';

import { MenuService } from "../../../services/menu.service";
import { SeguridadService } from '../../../../seguridad/services/seguridad.service';
import { LoadingService } from '../../../../../service/loading.service';

import { MenuModel } from "../../../../seguridad/interfaces/menuModel";


@Component({
  selector: 'app-saveMenu',
  templateUrl: './saveMenu.component.html',
  styleUrls: ['./saveMenu.component.css'],
  standalone: false,
})
export class SaveMenuComponent implements OnInit {

  @Input() registro_selected: any = {};
  @Input() accion: any = {};
  @Input() maxOrder2: number;
  @Input() tieneHijos: boolean;
  
  @Output() registrosE: EventEmitter<any> = new EventEmitter();

  public isLoading$ = this._loadingService.isLoading$;
  public title: string;
  public menu: MenuModel;
  public response: any;
  
  public form: FormGroup;
  public perfiles: any = [];
  public disableLabel = true;

  constructor(
      private fb: FormBuilder,
      public  modal: NgbActiveModal,
      private _menuService: MenuService,
      private _seguridadService: SeguridadService,       
      private _toastr: ToastrService,
      private _loadingService: LoadingService
  ) {
   }



    



  async ngOnInit(): Promise<void> {


    if (this.accion === 'addNuevaRaiz') {  
      this.disableLabel = false;
    } 


    if (this.accion === 'edit') {  
        if(this.registro_selected.level === 0){
          this.disableLabel = false;
        }      
    } 



    this.form = this.fb.group({
        padre_id: [{value :null, disabled: true}, [Validators.required]],
        nivel: [{value :0, disabled: true}, [Validators.required]],
        orden: [{value :0, disabled: false}, [Validators.required]],
        nombre: [{ value: '', disabled: false }, [Validators.required, Validators.maxLength(100)]],
        url: [{ value: '', disabled: false }, [Validators.required, Validators.maxLength(100)]],
        descripcion: [{ value: '', disabled: false }, [Validators.maxLength(100)]],
        etiqueta: [{ value: '', disabled: this.disableLabel }, [Validators.maxLength(15)]],
        icono: ['']
    });


      if ( this._seguridadService.isexpired() ){
          this.modal.close();
      }else{

          if (this.accion === 'addNuevaRaiz') {  
            this.title = "Nueva Raiz"; 
            this.form.patchValue({ 
                padre_id: null,
                orden: this.maxOrder2,
                nombre: '',
                descripcion: '' ,
                etiqueta: '' ,
                url: '' ,
                icono: '' ,
            });
          }

          if (this.accion === 'add') {  
              this.title = "Nuevo Menu"; 
              this.form.patchValue({ 
                  padre_id: this.registro_selected.id,
                  nivel: this.registro_selected.nivel + 1,
                  orden: this.maxOrder2,
                  nombre: 'Nuevo Menu',
                  descripcion: '' ,
                  etiqueta: '' ,
                  url: '' ,
                  icono: '' ,
              });
          }
          if (this.accion === 'edit'){  
            this.title = "Modificar Menu";              
            this.form.patchValue(this.registro_selected);            
          }
    
      }



  }


    private async saveRecord(data: MenuModel) {    
    try {

      this._loadingService.setLoading(true);

      if (this.accion === 'addNuevaRaiz') {  
        this.response = await firstValueFrom(this._menuService.addMenu(data));  
      }
      if (this.accion === 'add') {  
          this.response = await firstValueFrom(this._menuService.addMenu(data));  
      }
      if (this.accion === 'edit') {  
        let formData = new FormData();
        formData.append('json', JSON.stringify(data));
        this.response = await firstValueFrom(this._menuService.editMenu(this.registro_selected.id, formData));
      }
      this.registrosE.emit(this.response.data);
      //console.log('Respuesta del servidor:', this.response);
      
      this._toastr.success(this.response.status, this.response.message,{ closeButton: true });
      this._loadingService.setLoading(false);
      this.modal.close();
      
  } catch (error: any) {
    this._loadingService.setLoading(false);
  }


  }

  public async onSubmitForm($ev: any) {
    $ev.preventDefault();
    Object.values(this.form.controls).forEach(control => control.markAsTouched());

    if (this.form.valid) {
        let formData = this.form.getRawValue();
        this.saveRecord(formData);
    } else {
        this._toastr.error('Revise los campos del formulario.', 'No se puede Guardar', {
            timeOut: 20000,
            closeButton: true
        });
    }
}


}