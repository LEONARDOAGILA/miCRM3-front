import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { firstValueFrom, } from 'rxjs';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';

import { ArchivoService } from "../../../services/archivo.service";
import { SeguridadService } from '../../../../seguridad/services/seguridad.service';
import { LoadingService } from '../../../../../service/loading.service';

import { ArchivoModel } from "../../../interfaces/archivoModel";

import { trigger, transition, style, animate } from '@angular/animations';

// Agrega esto al decorador @Component


@Component({
  selector: 'app-saveFile',
  templateUrl: './saveFile.component.html',
  styleUrls: ['./saveFile.component.css'],
  standalone: false,
  
})
export class SaveFileComponent implements OnInit {

  @Input() registro_selected: any = {};
  @Input() accion: any = {};
  @Input() maxOrder2: number;
  @Input() tieneHijos: boolean;
  
  @Output() registrosE: EventEmitter<any> = new EventEmitter();

  public isLoading$ = this._loadingService.isLoading$;
  public title: string;
  public archivo: ArchivoModel;
  public response: any;
  
  public form: FormGroup;
  public perfiles: any = [];
  public disableLabel = true;

availableIcons = [
  {icon: 'fas fa-address-book', name: 'Libreta de direcciones'},
  {icon: 'fas fa-address-card', name: 'Tarjeta de contacto'},
  {icon: 'fas fa-angry', name: 'Enojado'},
  {icon: 'fas fa-arrow-alt-circle-down', name: 'Círculo flecha abajo'},
  {icon: 'fas fa-arrow-alt-circle-up', name: 'Círculo flecha arriba'},
  {icon: 'fas fa-bell', name: 'Campana'},
  {icon: 'fas fa-bell-slash', name: 'Campana tachada'},
  {icon: 'fas fa-bookmark', name: 'Marcador'},
  {icon: 'fas fa-building', name: 'Edificio'},
  {icon: 'fas fa-calendar', name: 'Calendario'},
  {icon: 'fas fa-calendar-alt', name: 'Calendario alterno'},
  {icon: 'fas fa-calendar-check', name: 'Calendario con check'},
  {icon: 'fas fa-chart-bar', name: 'Gráfico de barras'},
  {icon: 'fas fa-check', name: 'Check'},
  {icon: 'fas fa-check-circle', name: 'Círculo con check'},
  {icon: 'fas fa-chevron-down', name: 'Chevron abajo'},
  {icon: 'fas fa-chevron-up', name: 'Chevron arriba'},
  {icon: 'fas fa-circle', name: 'Círculo'},
  {icon: 'fas fa-clipboard', name: 'Portapapeles'},
  {icon: 'fas fa-clock', name: 'Reloj'},
  {icon: 'fas fa-clone', name: 'Clonar'},
  {icon: 'fas fa-cloud', name: 'Nube'},
  {icon: 'fas fa-cloud-download-alt', name: 'Descargar de nube'},
  {icon: 'fas fa-code', name: 'Código'},
  {icon: 'fas fa-cog', name: 'Engranaje'},
  {icon: 'fas fa-cogs', name: 'Engranajes'},
  {icon: 'fas fa-comment', name: 'Comentario'},
  {icon: 'fas fa-comment-alt', name: 'Comentario alterno'},
  {icon: 'fas fa-comments', name: 'Comentarios'},
  {icon: 'fas fa-copy', name: 'Copiar'},
  {icon: 'fas fa-credit-card', name: 'Tarjeta de crédito'},
  {icon: 'fas fa-database', name: 'Base de datos'},
  {icon: 'fas fa-desktop', name: 'Escritorio'},
  {icon: 'fas fa-download', name: 'Descargar'},
  {icon: 'fas fa-edit', name: 'Editar'},
  {icon: 'fas fa-envelope', name: 'Correo'},
  {icon: 'fas fa-envelope-open', name: 'Correo abierto'},
  {icon: 'fas fa-exclamation', name: 'Exclamación'},
  {icon: 'fas fa-exclamation-circle', name: 'Círculo exclamación'},
  {icon: 'fas fa-exclamation-triangle', name: 'Triángulo exclamación'},
  {icon: 'fas fa-external-link-alt', name: 'Enlace externo'},
  {icon: 'fas fa-eye', name: 'Ojo'},
  {icon: 'fas fa-eye-slash', name: 'Ojo tachado'},
  {icon: 'fas fa-file', name: 'Archivo'},
  {icon: 'fas fa-file-alt', name: 'Archivo alterno'},
  {icon: 'fas fa-file-archive', name: 'Archivo comprimido'},
  {icon: 'fas fa-file-download', name: 'Descargar archivo'},
  {icon: 'fas fa-file-export', name: 'Exportar archivo'},
  {icon: 'fas fa-file-import', name: 'Importar archivo'},
  {icon: 'fas fa-file-pdf', name: 'Archivo PDF'},
  {icon: 'fas fa-file-upload', name: 'Subir archivo'},
  {icon: 'fas fa-filter', name: 'Filtro'},
  {icon: 'fas fa-flag', name: 'Bandera'},
  {icon: 'fas fa-folder', name: 'Carpeta'},
  {icon: 'fas fa-folder-open', name: 'Carpeta abierta'},
  {icon: 'fas fa-globe', name: 'Globo'},
  {icon: 'fas fa-hdd', name: 'Disco duro'},
  {icon: 'fas fa-heart', name: 'Corazón'},
  {icon: 'fas fa-history', name: 'Historial'},
  {icon: 'fas fa-home', name: 'Inicio'},
  {icon: 'fas fa-image', name: 'Imagen'},
  {icon: 'fas fa-info', name: 'Información'},
  {icon: 'fas fa-info-circle', name: 'Círculo información'},
  {icon: 'fas fa-key', name: 'Llave'},
  {icon: 'fas fa-keyboard', name: 'Teclado'},
  {icon: 'fas fa-language', name: 'Idioma'},
  {icon: 'fas fa-laptop', name: 'Laptop'},
  {icon: 'fas fa-lightbulb', name: 'Bombillo'},
  {icon: 'fas fa-link', name: 'Enlace'},
  {icon: 'fas fa-list', name: 'Lista'},
  {icon: 'fas fa-list-alt', name: 'Lista alterna'},
  {icon: 'fas fa-list-ol', name: 'Lista ordenada'},
  {icon: 'fas fa-list-ul', name: 'Lista no ordenada'},
  {icon: 'fas fa-lock', name: 'Candado'},
  {icon: 'fas fa-lock-open', name: 'Candado abierto'},
  {icon: 'fas fa-map-marker', name: 'Marcador de mapa'},
  {icon: 'fas fa-microphone', name: 'Micrófono'},
  {icon: 'fas fa-mobile', name: 'Móvil'},
  {icon: 'fas fa-moon', name: 'Luna'},
  {icon: 'fas fa-paperclip', name: 'Clip'},
  {icon: 'fas fa-paste', name: 'Pegar'},
  {icon: 'fas fa-pause', name: 'Pausa'},
  {icon: 'fas fa-pen', name: 'Pluma'},
  {icon: 'fas fa-phone', name: 'Teléfono'},
  {icon: 'fas fa-play', name: 'Reproducir'},
  {icon: 'fas fa-plus', name: 'Más'},
  {icon: 'fas fa-plus-circle', name: 'Círculo más'},
  {icon: 'fas fa-print', name: 'Imprimir'},
  {icon: 'fas fa-qrcode', name: 'Código QR'},
  {icon: 'fas fa-question', name: 'Pregunta'},
  {icon: 'fas fa-question-circle', name: 'Círculo pregunta'},
  {icon: 'fas fa-redo', name: 'Rehacer'},
  {icon: 'fas fa-save', name: 'Guardar'},
  {icon: 'fas fa-search', name: 'Buscar'},
  {icon: 'fas fa-search-minus', name: 'Buscar menos'},
  {icon: 'fas fa-search-plus', name: 'Buscar más'},
  {icon: 'fas fa-share', name: 'Compartir'},
  {icon: 'fas fa-share-alt', name: 'Compartir alterno'},
  {icon: 'fas fa-shield-alt', name: 'Escudo'},
  {icon: 'fas fa-sign-in-alt', name: 'Ingresar'},
  {icon: 'fas fa-sign-out-alt', name: 'Salir'},
  {icon: 'fas fa-sliders-h', name: 'Controles deslizantes'},
  {icon: 'fas fa-star', name: 'Estrella'},
  {icon: 'fas fa-sun', name: 'Sol'},
  {icon: 'fas fa-sync', name: 'Sincronizar'},
  {icon: 'fas fa-table', name: 'Tabla'},
  {icon: 'fas fa-tag', name: 'Etiqueta'},
  {icon: 'fas fa-tags', name: 'Etiquetas'},
  {icon: 'fas fa-thumbs-down', name: 'Pulgar abajo'},
  {icon: 'fas fa-thumbs-up', name: 'Pulgar arriba'},
  {icon: 'fas fa-times', name: 'Cerrar'},
  {icon: 'fas fa-times-circle', name: 'Círculo cerrar'},
  {icon: 'fas fa-trash', name: 'Basura'},
  {icon: 'fas fa-trash-alt', name: 'Basura alterna'},
  {icon: 'fas fa-undo', name: 'Deshacer'},
  {icon: 'fas fa-unlock', name: 'Desbloquear'},
  {icon: 'fas fa-upload', name: 'Subir'},
  {icon: 'fas fa-user', name: 'Usuario'},
  {icon: 'fas fa-user-circle', name: 'Círculo usuario'},
  {icon: 'fas fa-users', name: 'Usuarios'},
  {icon: 'fas fa-video', name: 'Video'},
  {icon: 'fas fa-volume-down', name: 'Volumen bajo'},
  {icon: 'fas fa-volume-mute', name: 'Silenciar'},
  {icon: 'fas fa-volume-up', name: 'Volumen alto'},
  {icon: 'fas fa-wifi', name: 'WiFi'},
  {icon: 'fas fa-window-close', name: 'Cerrar ventana'},
  {icon: 'fas fa-window-maximize', name: 'Maximizar ventana'},
  {icon: 'fas fa-window-minimize', name: 'Minimizar ventana'},
  {icon: 'fas fa-window-restore', name: 'Restaurar ventana'},
  {icon: 'fab fa-facebook', name: 'Facebook'},
  {icon: 'fab fa-twitter', name: 'Twitter'},
  {icon: 'fab fa-linkedin', name: 'LinkedIn'},
  {icon: 'fab fa-instagram', name: 'Instagram'},
  {icon: 'fab fa-youtube', name: 'YouTube'},
  {icon: 'fab fa-whatsapp', name: 'WhatsApp'},
  {icon: 'fab fa-google', name: 'Google'},
  {icon: 'fab fa-github', name: 'GitHub'}
];

filteredIcons = [...this.availableIcons];



   selectedColor:string = '#c32af3';


  constructor(
      private fb: FormBuilder,
      public  modal: NgbActiveModal,
      private _archivoService: ArchivoService,
      private _seguridadService: SeguridadService,       
      private _toastr: ToastrService,
      private _loadingService: LoadingService
  ) {
   }



    



  async ngOnInit(): Promise<void> {
// En ngOnInit
this.searchControl.valueChanges.subscribe(value => {
  this.filterIcons(value || '');
});

    if (this.accion === 'addNuevaRaiz' || this.accion === 'addCarpeta') {  
      //this.disableLabel = false;
      this.form = this.fb.group({
          padre: [{value :0, disabled: true}, [Validators.required]],
          nivel: [{value :0, disabled: true}, [Validators.required]],
          orden: [{value :0, disabled: false}, [Validators.required]],
          nombre: [{ value: '', disabled: false }, [Validators.required, Validators.maxLength(100)]],
          url: [{ value: '', disabled: false }],
          descripcion: [{ value: '', disabled: false }, [Validators.maxLength(100)]],
          modulo: [{ value: '', disabled: false }, [Validators.maxLength(15)]],
          icono: [''],
          tipo: [{ value: '', disabled: false }, [Validators.maxLength(15)]],
          color: [this.selectedColor],
          escarpeta: [{value:true}],
          activo: [{value:true}],
      });

    } 

    if (this.accion === 'addArchivo') {  
      this.disableLabel = false;
      this.form = this.fb.group({
          padre: [{value :0, disabled: true}, [Validators.required]],
          nivel: [{value :0, disabled: true}, [Validators.required]],
          orden: [{value :0, disabled: false}, [Validators.required]],
          nombre: [{ value: '', disabled: false }, [Validators.required, Validators.maxLength(100)]],
          url: [{ value: '', disabled: false }, [Validators.required, Validators.maxLength(500)]],
          descripcion: [{ value: '', disabled: false }, [Validators.maxLength(100)]],
          modulo: [{ value: '', disabled: this.disableLabel }, [Validators.maxLength(15)]],
          icono: [''],
          tipo: [{ value: '', disabled: this.disableLabel }, [Validators.maxLength(15)]],
          color: [this.selectedColor],
          escarpeta: [{value:false}],
          activo: [{value:true}],
      });

    } 

    if (this.accion === 'edit') {  
        if(this.registro_selected.level === 0){
          this.disableLabel = false;
        }      
    } 





      if ( this._seguridadService.isexpired() ){
          this.modal.close();
      }else{

          if (this.accion === 'addNuevaRaiz') {  
            this.title = "Nueva Raiz"; 
            this.form.patchValue({ 
                orden: this.maxOrder2,
                nombre: 'Nueva Raiz',
                descripcion: '' ,
                modulo: '' ,
                url: '' ,
                icono: 'fa fa-folder' ,
                escarpeta:true,
                color: '#F0B13B'
            });
          }

          if (this.accion === 'addArchivo') {  
              this.title = "Nuevo Archivo"; 
              this.form.patchValue({ 
                  padre: this.registro_selected.id,
                  nivel: this.registro_selected.nivel + 1,
                  orden: this.maxOrder2,
                  nombre: 'Nuevo Archivo',
                  descripcion: '' ,
                  modulo: '' ,
                  url: '' ,
                  icono: 'fa fa-file' ,
                  escarpeta:false,
                  color:  '#A6A09B',
              });
          }

          if (this.accion === 'addCarpeta') {  
              this.title = "Nuevo Carpeta"; 
              this.form.patchValue({ 
                  padre: this.registro_selected.id,
                  nivel: this.registro_selected.nivel + 1,
                  orden: this.maxOrder2,
                  nombre: 'Nuevo Carpeta',
                  descripcion: '' ,
                  modulo: '' ,
                  url: '' ,
                  icono: 'fa fa-folder' ,
                  escarpeta:true,
                  color: '#F0B13B'
              });
          }


          if (this.accion === 'edit'){  
            this.title = "Modificar Archivo";              
            this.form.patchValue(this.registro_selected);            
          }
    
      }



  }


    private async saveRecord(data: ArchivoModel) {    
    try {

      this._loadingService.setLoading(true);

      if (this.accion === 'addNuevaRaiz') {  
        this.response = await firstValueFrom(this._archivoService.addArchivo(data));  
      }
      if (this.accion === 'addArchivo' || this.accion === 'addCarpeta') {  
          this.response = await firstValueFrom(this._archivoService.addArchivo(data));  
      }
      if (this.accion === 'edit') {  
        let formData = new FormData();
        formData.append('json', JSON.stringify(data));
        this.response = await firstValueFrom(this._archivoService.editArchivo(this.registro_selected.id, formData));
      }
      this.registrosE.emit(this.response.data);
      
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
        console.log('formData',formData)
        this.saveRecord(formData);
    } else {
        this._toastr.error('Revise los campos del formulario.', 'No se puede Guardar', {
            timeOut: 20000,
            closeButton: true
        });
    }
}

isDropdownOpen = false;
searchControl = new FormControl('');

toggleDropdown() {
  this.isDropdownOpen = !this.isDropdownOpen;
  if (this.isDropdownOpen) {
    this.filteredIcons = [...this.availableIcons];
  }
}

selectIcon(icon: any) {
  this.form.controls['icono'].setValue(icon.icon);
  this.isDropdownOpen = false;
}

getIconName(iconValue: string): string {
  const icon = this.availableIcons.find(i => i.icon === iconValue);
  return icon ? icon.name : '';
}



filterIcons(searchTerm: string) {
  this.filteredIcons = this.availableIcons.filter(icon => 
    icon.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    icon.icon.toLowerCase().includes(searchTerm.toLowerCase())
  );
}


}