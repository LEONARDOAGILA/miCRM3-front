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

  // ============================================================
  // SELECTOR DE ICONOS
  // Catálogo de Font Awesome 6 (la librería que carga la app) con
  // nombre en español para poder buscarlos sin saber la clase.
  // ============================================================
  private readonly ICONOS_POR_GRUPO: { [grupo: string]: string } = {
    'General': 'house:Inicio|gauge-high:Panel de control|table-columns:Tablero|bars:Menú|list:Lista|list-check:Tareas|compass:Navegar|sitemap:Estructura|diagram-project:Organigrama|folder:Carpeta|folder-open:Carpeta abierta|folder-tree:Árbol de carpetas|star:Favorito|bookmark:Marcador|flag:Bandera|bell:Notificaciones|magnifying-glass:Buscar|filter:Filtro|thumbtack:Fijar|heart:Preferidos|lightbulb:Idea|rocket:Lanzamiento',
    'Configuración': 'gear:Configuración|gears:Ajustes|sliders:Parámetros|wrench:Herramienta|screwdriver-wrench:Mantenimiento|toolbox:Caja de herramientas|plug:Conexión|power-off:Encendido|arrows-rotate:Actualizar|code:Código|terminal:Consola|bug:Errores|server:Servidor|database:Base de datos|hard-drive:Disco|cloud:Nube|cloud-arrow-up:Respaldo',
    'Seguridad': 'lock:Bloqueo|unlock:Desbloqueo|key:Llave|shield:Escudo|shield-halved:Seguridad|user-shield:Permisos|user-lock:Bloquear usuario|fingerprint:Huella|id-badge:Credencial|id-card:Identificación|user-secret:Auditoría|eye:Ver|eye-slash:Ocultar',
    'Usuarios': 'user:Usuario|users:Usuarios|user-plus:Nuevo usuario|user-gear:Perfil|user-tie:Empleado|user-group:Grupos|people-group:Equipo|user-check:Aprobación|address-book:Agenda|address-card:Contacto|headset:Soporte',
    'Documentos': 'file:Archivo|file-lines:Documento|file-invoice:Factura|file-invoice-dollar:Factura con importe|file-pdf:PDF|file-excel:Excel|file-csv:CSV|clipboard:Portapapeles|clipboard-list:Checklist|clipboard-check:Revisado|book:Libro|book-open:Manual|newspaper:Noticias|print:Imprimir|paperclip:Adjunto|download:Descargar|upload:Subir|image:Imagen|camera:Cámara|video:Vídeo|microphone:Audio|palette:Diseño|brush:Estilos',
    'Comercial': 'cart-shopping:Carrito|basket-shopping:Compras|bag-shopping:Ventas|store:Tienda|shop:Local|box:Producto|boxes-stacked:Inventario|warehouse:Bodega|truck:Despacho|truck-fast:Envío|tags:Categorías|tag:Etiqueta|receipt:Recibo|barcode:Código de barras|qrcode:Código QR|cash-register:Caja',
    'Finanzas': 'dollar-sign:Precio|money-bill:Dinero|money-bill-wave:Pagos|money-check-dollar:Cobros|credit-card:Tarjeta|wallet:Billetera|piggy-bank:Ahorros|coins:Monedas|calculator:Calculadora|percent:Descuentos|scale-balanced:Balance|landmark:Banco',
    'Informes': 'chart-line:Tendencia|chart-bar:Barras|chart-pie:Circular|chart-column:Columnas|chart-area:Área|table:Tabla|table-list:Listado',
    'Comunicación': 'envelope:Correo|envelope-open:Mensaje abierto|paper-plane:Enviar|comments:Chat|comment-dots:Comentario|phone:Teléfono|mobile-screen:Móvil|share-nodes:Compartir|rss:Novedades|at:Arroba',
    'Tiempo y lugar': 'calendar:Calendario|calendar-days:Agenda|calendar-check:Cita|clock:Horario|hourglass-half:Tiempo|business-time:Jornada|map:Mapa|map-location-dot:Ubicaciones|location-dot:Dirección|globe:Global|earth-americas:Región|route:Rutas|building:Empresa|industry:Planta|city:Sucursales',
    'Acciones': 'plus:Agregar|pen:Editar|pen-to-square:Modificar|trash:Eliminar|check:Confirmar|circle-check:Aprobado|xmark:Cancelar|circle-xmark:Rechazado|triangle-exclamation:Alerta|circle-info:Información|circle-question:Ayuda|right-from-bracket:Salir',
  };

  public readonly catalogoIconos: { clase: string; nombre: string; grupo: string }[] =
    Object.keys(this.ICONOS_POR_GRUPO).reduce((acc, grupo) => {
      this.ICONOS_POR_GRUPO[grupo].split('|').forEach(par => {
        const [icono, nombre] = par.split(':');
        acc.push({ clase: `fa-solid fa-${icono}`, nombre, grupo });
      });
      return acc;
    }, [] as { clase: string; nombre: string; grupo: string }[]);

  public mostrarSelectorIconos = false;
  public filtroIcono = '';
  public grupoIcono = 'Todos';

  public get gruposIconos(): string[] {
    return ['Todos', ...Object.keys(this.ICONOS_POR_GRUPO)];
  }

  public get iconosFiltrados(): { clase: string; nombre: string; grupo: string }[] {
    const texto = (this.filtroIcono || '').trim().toLowerCase();
    return this.catalogoIconos.filter(i =>
      (this.grupoIcono === 'Todos' || i.grupo === this.grupoIcono) &&
      (!texto || i.nombre.toLowerCase().includes(texto) || i.clase.toLowerCase().includes(texto))
    );
  }

  public get iconoActual(): string {
    return (this.form?.controls['icono']?.value || '').toString().trim();
  }

  /** La app no carga la hoja de estilos de Bootstrap Icons: esas clases no se ven */
  public get iconoNoDisponible(): boolean {
    return /^bi(\s|-)/.test(this.iconoActual);
  }

  public seleccionarIcono(clase: string): void {
    this.form.controls['icono'].setValue(clase);
    this.form.controls['icono'].markAsDirty();
    this.mostrarSelectorIconos = false;
    this.filtroIcono = '';
  }

  public limpiarIcono(): void {
    this.form.controls['icono'].setValue('');
    this.form.controls['icono'].markAsDirty();
  }

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