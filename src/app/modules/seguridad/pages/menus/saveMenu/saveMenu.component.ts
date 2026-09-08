import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { firstValueFrom, from, merge, of, Subject } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';

import { MenuService } from "../../../services/menu.service";
import { SeguridadService } from '../../../../seguridad/services/seguridad.service';
import { LoadingService } from '../../../../../service/loading.service';
import { SelectorIconosComponent } from '../../../../../components/selector-iconos/selector-iconos.component';

import { MenuModel } from "../../../../seguridad/interfaces/menuModel";


@Component({
  selector: 'app-saveMenu',
  templateUrl: './saveMenu.component.html',
  styleUrls: ['./saveMenu.component.css'],
  standalone: false,
})
export class SaveMenuComponent implements OnInit, OnDestroy {

  /** Corta la suscripción al selector de iconos si el modal se cierra antes. */
  private readonly destroy$ = new Subject<void>();

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

  // ============================================================
  // ICONO
  // El catálogo y la rejilla viven en SelectorIconosComponent, que se abre
  // en su propio modal: desplegarlo aquí dentro hacía crecer el formulario
  // de golpe y empujaba hacia abajo el resto de los campos.
  // ============================================================

  public get iconoActual(): string {
    return (this.form?.controls['icono']?.value || '').toString().trim();
  }

  /** La app no carga la hoja de estilos de Bootstrap Icons: esas clases no se ven */
  public get iconoNoDisponible(): boolean {
    return /^bi(\s|-)/.test(this.iconoActual);
  }

  /** Abre el selector y escribe en el campo el icono que devuelva. */
  public abrirSelectorIconos(): void {
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
        from(modalRef.result).pipe(catchError(() => of(null)))   // dismiss() rechaza
      )))
      .subscribe((clase: string) => this.seleccionarIcono(clase));
  }

  public seleccionarIcono(clase: string): void {
    this.form.controls['icono'].setValue(clase);
    this.form.controls['icono'].markAsDirty();
  }

  public limpiarIcono(): void {
    this.form.controls['icono'].setValue('');
    this.form.controls['icono'].markAsDirty();
  }


  constructor(
      private fb: FormBuilder,
      public  modal: NgbActiveModal,
      private modalService: NgbModal,
      private _menuService: MenuService,
      private _seguridadService: SeguridadService,       
      private _toastr: ToastrService,
      private _loadingService: LoadingService
  ) {
   }



    



  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  async ngOnInit(): Promise<void> {


    if (this.accion === 'addNuevaRaiz') {  
      this.disableLabel = false;
    } 


    if (this.accion === 'edit') {
        // El modelo del menú expone 'nivel'; antes se leía 'level', que no
        // existe, por lo que la etiqueta quedaba bloqueada incluso en raíces.
        const nivel = this.registro_selected?.nivel ?? this.registro_selected?.level;
        if (nivel === 0) {
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

  public async onSubmitForm($ev?: any) {
    // app-modal-footer emite sin evento, por eso la llamada es opcional
    $ev?.preventDefault?.();
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