import { Component, EventEmitter, HostListener, Input, OnInit, Output, OnDestroy } from '@angular/core';
import { firstValueFrom, Subject } from 'rxjs';
import { FormBuilder, FormGroup, Validators, FormControl } from '@angular/forms';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';

// Servicios
import { UserService } from "../../../../seguridad/services/user.service";
import { SeguridadService } from '../../../../seguridad/services/seguridad.service';


import { LoadingService } from '../../../../../service/loading.service';
import { ProfileService } from '../../../../seguridad/services/profile.service';
import { ComprimirImagen } from '../../../../../service/comprimirImagen';
import { HorarioService } from '../../../../seguridad/services/horario.service';

// Modelos
import { UserModel } from "../../../interfaces/userModel";
import { ListProfileComponent } from '../../profiles/listProfile/listProfile.component';
import { ListHorariosComponent } from '../../horarios/listHorarios/listHorarios.component';

@Component({
  selector: 'app-saveUser',
  templateUrl: './saveUser.component.html',
  styleUrls: ['./saveUser.component.css'],
  standalone: false,
})
export class SaveUserComponent implements OnInit, OnDestroy {
  @Input() registro_selected: any = {};
  @Input() accion: any = {};
  @Output() registrosE: EventEmitter<any> = new EventEmitter();

  public form: FormGroup;
  public isLoading$ = this._loadingService.isLoading$;
  public response: any;
  public isdisabled: boolean;
  public titulo: string;
  public textoClon: string;
  public userId: any;
  public esNuevo: boolean = false;
  public esClon: boolean = false;

  public userModel: UserModel;
  
  // Controles independientes para Perfil y Horario
  public perfilNombreControl = new FormControl({ value: '', disabled: true });
  public horarioNombreControl = new FormControl({ value: '', disabled: true });
  public perfilIdInvalido: boolean = false;
  public horarioIdInvalido: boolean = false;

  public tipoUsuario = [
    { id: 1, name: 'SUPER USUARIO' },
    { id: 2, name: 'ADMINISTRADOR' },
    { id: 3, name: 'USUARIO SISTEMA' },
    { id: 4, name: 'USUARIO WEB' },
  ];

  /** Nombre del tipo de usuario seleccionado (para el resumen del avatar) */
  public get tipoUsuarioNombre(): string {
    const id = this.form?.controls['type_user']?.value;
    return this.tipoUsuario.find(t => t.id === id)?.name ?? '';
  }

  public imagen_file: any = null;
  public imagen_paste: any = null;
  public imagen_previzualiza: any = null;
  public imagen: any = null;
  public comprimirImagen: ComprimirImagen = new ComprimirImagen();
  public formDataImg = new FormData();
  public cambioImagen: boolean = false;
  public esView: boolean = true;
  public nuevoAvatar: string = '';
  public isDragOver = false;

  // Variables para la cámara
  public showCameraModal: boolean = false;
  public cameraError: string = '';
  public isUsingFrontCamera: boolean = true;
  private mediaStream: MediaStream | null = null;
  
  // Para cancelar suscripciones
  private destroy$ = new Subject<void>();
  paisSeleccionado: string;

  constructor(
    private fb: FormBuilder,
    private _toastr: ToastrService,
  public activeModal: NgbActiveModal,  // ← renombrado a activeModal
    private modalService: NgbModal,  // ← para abrir nuevos modales

    private _loadingService: LoadingService,
    private _seguridadService: SeguridadService,
    private _userService: UserService,
    private _profileService: ProfileService,
    private _horarioService: HorarioService,
  ) {
    this.textoClon = "";
    this.isdisabled = false;
    this.cambioImagen = false;
    this.esNuevo = false;
    this.esClon = false;
  }

  //   ******   DESTROY   ******  //
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
  }

  //   ******   INIT   ******  //
  async ngOnInit(): Promise<void> {
    if (this._seguridadService.isexpired()) {
      this.activeModal.close();
      return;
    }

    this.esView = this.accion === 'view';
    this.esNuevo = this.accion === 'add';
    this.esClon = this.accion === 'clon';
    //console.log('esView',this.esView)
    this.isdisabled = this.accion === 'view';    
    this.perfilNombreControl.disable();
    this.horarioNombreControl.disable();

    // Inicializar formulario
    this.initializeForm();

    switch (this.accion) {
      case 'add':
        this.esNuevo = true;
        this.titulo = "Nuevo Usuario";
        break;

      case 'edit':
        this.esNuevo = false;
        this.titulo = "Modificar Usuario";
        this.userId = this.registro_selected.id;
        await this.findByIdUser(this.registro_selected.id);
        break;

      case 'clon':
        this.esNuevo = true;
        this.titulo = "Clonar Usuario";
        this.textoClon = '_CLON';
        this.userId = this.registro_selected.id;
        await this.findByIdUser(this.registro_selected.id);
        break;

      case 'view':
        this.esNuevo = false;
        this.titulo = "Ver Usuario";      
        this.userId = this.registro_selected.id;
        await this.findByIdUser(this.registro_selected.id);
        break;
    }
  }

  onPaisChange(codigoPais: string) {
  console.log('País seleccionado:', codigoPais);
  // Puedes guardar el país en otra variable si lo necesitas
  this.paisSeleccionado = codigoPais;
}

  //   ******   INICIALIZA FORMULARIO   ******  //
  initializeForm(): void {
    const baseFields = {
      login_user: [{ value: '', disabled: this.isdisabled }, [Validators.required, Validators.maxLength(20)]],
      name: [{ value: '', disabled: this.isdisabled }, [Validators.required, Validators.maxLength(100)]],
      surname: [{ value: '', disabled: this.isdisabled }, [Validators.required, Validators.maxLength(100)]],
      email: [{ value: '', disabled: this.isdisabled }, [Validators.required, Validators.maxLength(100)]],
      phone: [{ value: '', disabled: this.isdisabled }, [Validators.required, Validators.maxLength(100)]],
      avatar: [{ value: '', disabled: true }],
      isactive: [{ value: true, disabled: this.isdisabled }],
      type_user: [{ value: null, disabled: this.isdisabled }, [Validators.required]],
      perfil_id: [{ value: null, disabled: this.isdisabled }, [Validators.required]],
      chorario_id: [{ value: null, disabled: this.isdisabled }, [Validators.required]],
    };

    const specificFields = this.esNuevo || this.esClon
      ? {
          password: [{ value: '', disabled: this.isdisabled }, [Validators.required, Validators.maxLength(20)]]
        }
      : {
          password: [{ value: '', disabled: this.isdisabled }]
        };

    this.form = this.fb.group({
      ...baseFields,
      ...specificFields
    });
  }




//   ******   PERFILES   ******  //
  async cargarPerfilPorId() {
    //console.log('cargar perfil id')
    const perfilId = this.form.get('perfil_id')?.value;

    this.perfilIdInvalido = true;


    if (!perfilId) {
      this.perfilNombreControl.setValue('');
      return;
    }
    
    try {
      this._loadingService.setLoading(true);
      const res = await firstValueFrom(this._profileService.findByIdProfile(perfilId));
      if (res?.status === 'success') {
        this.perfilNombreControl.setValue(res.data.nombre);
      } else {
        this.perfilNombreControl.setValue('');
        this.form.patchValue({ perfil_id: null });
        this._toastr.warning('Perfil no encontrado');
      }
    } catch (error) {
      this.form.patchValue({ perfil_id: null });
      console.error('Error al cargar perfil:', error);
      this.perfilNombreControl.setValue('');
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  async abrirModalPerfiles() {
    if (this.isdisabled) return;
    
    const modalRef = this.modalService.open(ListProfileComponent, {
      size: 'md',
      centered: true,
      backdrop: 'static'
    });
    
    modalRef.componentInstance.seleccionado.subscribe((perfil: any) => {
      this.form.patchValue({ perfil_id: perfil.id });
      this.perfilNombreControl.setValue(perfil.nombre);
      //this._toastr.success(`Perfil seleccionado: ${perfil.nombre}`);
    });
  }

  async buscarPerfil(busqueda: string) {
    try {
      this._loadingService.setLoading(true);
      
      const isNumber = /^\d+$/.test(busqueda);
      let perfil = null;
      
      if (isNumber) {
        // Buscar por ID
        const res = await firstValueFrom(this._profileService.findByIdProfile(parseInt(busqueda))) as any;
        if (res?.status === 'success') {
          perfil = res.data;
        }
      } else {
        // Buscar por nombre
        const res = await firstValueFrom(this._profileService.listProfiles()) as any;
        if (res?.status === 'success') {
          perfil = res.data.find((p: any) => 
            p.nombre.toLowerCase().includes(busqueda.toLowerCase())
          );
        }
      }
      
      if (perfil) {
        this.form.patchValue({ perfil_id: perfil.id });
        this.perfilNombreControl.setValue(perfil.nombre);
        this._toastr.success(`Perfil seleccionado: ${perfil.nombre}`);
      } else {
        this._toastr.error('Perfil no encontrado');
      }
    } catch (error) {
      console.error('Error al buscar perfil:', error);
      this._toastr.error('Error al buscar el perfil');
    } finally {
      this._loadingService.setLoading(false);
    }
  }




//   ******   HORARIOS   ******  //
  async buscarHorario(busqueda: string) {
    try {
      this._loadingService.setLoading(true);
      
      const isNumber = /^\d+$/.test(busqueda);
      let horario = null;
      
      if (isNumber) {
        // Buscar por ID
        const res = await firstValueFrom(this._horarioService.getHorario(parseInt(busqueda))) as any;
        if (res?.status === 'success') {
          horario = res.data;
        }
      } else {
        // Buscar por nombre
        const res = await firstValueFrom(this._horarioService.listHorarios()) as any;
        if (res?.status === 'success') {
          horario = res.data.find((h: any) => 
            h.nombre.toLowerCase().includes(busqueda.toLowerCase())
          );
        }
      }
      
      if (horario) {
        this.form.patchValue({ chorario_id: horario.id });
        this.horarioNombreControl.setValue(horario.nombre);
        this._toastr.success(`Horario seleccionado: ${horario.nombre}`);
      } else {
        this._toastr.error('Horario no encontrado');
      }
    } catch (error) {
      console.error('Error al buscar horario:', error);
      this._toastr.error('Error al buscar el horario');
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  async cargarHorarioPorId() {
    const horarioId = this.form.get('chorario_id')?.value;
    this.horarioIdInvalido = false;

    if (!horarioId) {
      this.horarioNombreControl.setValue('');
      return;
    }
    
    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._horarioService.getHorario(horarioId));
      if (res?.status === 'success') {
        this.horarioNombreControl.setValue(res.data.nombre);
      } else {

        this.horarioNombreControl.setValue('');
        this._toastr.warning('Horario no encontrado');
        this.form.patchValue({ chorario_id: null });
      }
    } catch (error) {
      this.form.patchValue({ chorario_id: null });
      console.error('Error al cargar horario:', error);
      this.horarioNombreControl.setValue('');
    } finally {
      this._loadingService.setLoading(false);
    }
  }
  
  async abrirModalHorarios() {
    if (this.isdisabled) return;
    
    const modalRef = this.modalService.open(ListHorariosComponent, {
      size: 'md',
      centered: true,
      backdrop: 'static'
    });
    
    modalRef.componentInstance.seleccionado.subscribe((horario: any) => {
      this.form.patchValue({ chorario_id: horario.id });
      this.horarioNombreControl.setValue(horario.nombre);
    });
  }




  //   ******   BUSQUEDA DE USUARIO   ******  //
  private async findByIdUser(id: number) {
    try {
      this._loadingService.setLoading(true);
      let res: any = await firstValueFrom(this._userService.findByIdUser(id));
      //console.log('Respuesta de findByIdUser:', res);

      if (res?.status === 'success') {
        this.userModel = res.data;
        
        if (this.textoClon) {
          this.userModel.login_user = this.userModel.login_user + this.textoClon;
        }
        
        this.form.patchValue({
          id: this.userModel.id,
          name: this.userModel.name,
          surname: this.userModel.surname,
          email: this.userModel.email,
          phone: this.userModel.phone,
          avatar: this.userModel.avatar,
          login_user: this.userModel.login_user,
          type_user: this.userModel.type_user,
          isactive: this.userModel.isactive,
          perfil_id: this.userModel.perfil_id,
          chorario_id: this.userModel.chorario_id
        });
        
        // Actualizar nombres visibles
        this.perfilNombreControl.setValue(this.userModel.perfil_nombre || '');
        this.horarioNombreControl.setValue(this.userModel.chorario_nombre || '');

if (this.userModel.avatar) {
  this.imagen_previzualiza = this._userService.getUserImage(id, true);
  
  if (this.accion === 'clon') {
    await this.convertImageUrlToFile(this._userService.getUserImage(id, true));
    // ✅ IMPORTANTE: Limpiar el avatar del formulario para que se genere uno nuevo
    this.form.patchValue({ avatar: null });
    this.userModel.avatar = null;
  }
  
  const imageExists = await this.checkImageExists(this.imagen_previzualiza);
  if (!imageExists) {
    this.imagen_previzualiza = null;
  }
} else {
  this.imagen_previzualiza = null;
}


      } else {
        console.error('Error: Respuesta sin status success', res);
        this.imagen_previzualiza = null;
      }

      this._loadingService.setLoading(false);
    } catch (error: any) {
      console.error('Error en la petición', error);
      this.imagen_previzualiza = null;
      this.activeModal.close();
      this._loadingService.setLoading(false);
    }
  }

  //   ******   GRABAR IMAGEN   ******  // 
  async grabarImagen() {
    try {
      const formData = new FormData();
      formData.append("UserId", this.userId?.toString() || '');
      formData.append("imagen_file", this.imagen_file);
    
      const response = await firstValueFrom(this._userService.addImagen(formData));
      if (response.status === 'success') {
        this.nuevoAvatar = response.data.avatar;
      } else {
        this._toastr.error('No se pudo subir la imagen');
      }
    } catch (error: any) {
      console.error('Error al subir imagen:', error);
      this._toastr.error(error.message || 'Error al subir la imagen');
    }
  }

  //   ******   GRABAR DATA  ******  //
  private async saveRecord(data: UserModel) {
    try {
      this._loadingService.setLoading(true);
      this.isdisabled = true;
      
      if (this.accion === 'add') {
        this.response = await firstValueFrom(this._userService.addUser(data));
        if (this.response.status === 'success') {
          this.userId = this.response.data.id;

          if (this.cambioImagen) {
            this.formDataImg.delete('UserId');
            this.formDataImg.append('UserId', this.userId.toString());
            await this.grabarImagen();
            this.response.data.avatar = this.nuevoAvatar
          }


        }
      } else {
        let formData = new FormData();
        formData.append('json', JSON.stringify(data));

        if (this.accion === 'edit') {
          //console.log('formData',formData)
          this.response = await firstValueFrom(this._userService.editUser(this.registro_selected.id, formData));
          if (this.response.status === 'success') {
            if (this.cambioImagen) {
              console.log('grabando imagen')
              await this.grabarImagen();
              this.response.data.avatar = this.nuevoAvatar
            }

          }
        }

        if (this.accion === 'clon') {
          this.response = await firstValueFrom(this._userService.clonUser(data));
          if (this.response.status === 'success') {
            this.userId = this.response.data.id;
            if (this.cambioImagen) {
              await this.grabarImagen();
              this.response.data.avatar = this.nuevoAvatar;
            }
          }
        }
      }

      this.registrosE.emit(this.response.data);
      this._toastr.success(this.response.message, 'Éxito', { closeButton: true });
      this._loadingService.setLoading(false);
      this.activeModal.close();

    } catch (error: any) {
      console.error('Error en la petición', error);
      this.isdisabled = false;
      this._loadingService.setLoading(false);
    }
  }

  //   ******   VALIDA FORMULARIO   ******  //
  public async onSubmitForm($ev: any) {
    this._toastr.clear();
    Object.values(this.form.controls).forEach(control => control.markAsTouched());
    
    // Validar que el perfil y horario tengan valor
    const perfilId = this.form.get('perfil_id')?.value;
    const chorarioId = this.form.get('chorario_id')?.value;
    
    if (!perfilId) {
      this._toastr.error('Debe seleccionar un Perfil', 'Error');
      return;
    }
    if (!chorarioId) {
      this._toastr.error('Debe seleccionar un Horario', 'Error');
      return;
    }
    //console.log('this.form.getRawValue()',this.form.getRawValue())

    
    if (this.form.valid) {
      let formData = this.form.getRawValue();
      this.saveRecord(formData);
    } else {
      this._toastr.error('Revise los campos del formulario.', 'No se puede Guardar', { timeOut: 20000, closeButton: true });
    }
  }




  ////   INICIO DE IMAGEN  ///////////////////////////////////////////////////////////////////////////////////////////
  processFile($event: any) {
    if ($event.target.files[0].type.indexOf("image") < 0) {
      const inputElement: HTMLInputElement = $event.target;
      inputElement.value = '';
      return;
    }
    this.imagen_file = $event.target.files[0];
    let reader = new FileReader();
    reader.readAsDataURL(this.imagen_file);
    reader.onloadend = () => this.imagen_previzualiza = reader.result;

    this.cambioImagen = true;
    this.prepara_imagen_antes_grabar();
    this.imagen_paste = null;
  }

  @HostListener('paste', ['$event'])
  onPaste(event: ClipboardEvent): void {
    if (this.esView) return;

    event.preventDefault();

    const items = Array.from(event.clipboardData?.items || []);
    const hasImage = items.some(item => item.type.indexOf('image') !== -1);

    if (hasImage) {
      this.cambioImagen = true;
      for (const item of items) {
        if (item.type.indexOf('image') !== -1) {
          const blob = item.getAsFile();
          if (blob) {
            this.imagen_paste = blob;
            this.handleImagePaste(blob);
            break;
          }
        }
      }
    } else {
      const pastedText = event.clipboardData?.getData('text');
      if (pastedText) {
        const activeElement = document.activeElement as HTMLInputElement | HTMLTextAreaElement;
        if (activeElement && ['INPUT', 'TEXTAREA'].includes(activeElement.tagName)) {
          const startPos = activeElement.selectionStart || 0;
          const endPos = activeElement.selectionEnd || 0;
          const currentValue = activeElement.value;

          activeElement.value = currentValue.substring(0, startPos) +
            pastedText +
            currentValue.substring(endPos);

          const newCursorPos = startPos + pastedText.length;
          activeElement.setSelectionRange(newCursorPos, newCursorPos);
          activeElement.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    }
  }
  
  handleImagePaste(imageBlob: Blob): void {
    const reader = new FileReader();
    reader.onload = (e: any) => {
      this.imagen_paste = e.target.result;
      this.imagen_previzualiza = this.imagen_paste;
      this.imagen_file = null;
      const file = new File([imageBlob], 'pasted-image.png', { type: imageBlob.type });
      this.imagen_file = file;
      this.prepara_imagen_antes_grabar();
    };
    reader.readAsDataURL(imageBlob);
  }
  
  base64toFile(base64: string, filename: string): File {
    const arr = base64.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    const blob = new Blob([u8arr], { type: mime });
    return new File([blob], filename, { type: mime });
  }
  
  isBase64String(text: string): boolean {
    const base64Regex = /^(data:image\/[a-zA-Z]+;base64,)/;
    return base64Regex.test(text);
  }
  
  clearImage() {
    this.imagen_previzualiza = null;
    this.imagen_paste = '';
    this.form.get('avatar')?.setValue(null);
    const input = document.getElementById('image-input') as HTMLInputElement;
    if (input) {
      input.value = '';
    }
    this.cambioImagen = false;
  }

  @HostListener('document:dragover', ['$event'])
  onDocumentDragOver(event: DragEvent) {
    if (!this.imagen_previzualiza) {
      event.preventDefault();
    }
  }
  
  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = true;
  }
  
  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;
  }
  
  onDrop(event: DragEvent): void {
    if (!this.esView) {
      event.preventDefault();
      event.stopPropagation();
      this.isDragOver = false;

      const files = event.dataTransfer?.files;
      if (files && files.length > 0) {
        this.handleDroppedFile(files[0]);
      }
    }
  }
  
  private handleDroppedFile(file: File): void {
    if (!file.type.match('image.*')) {
      this._toastr.error('El archivo debe ser una imagen', 'Error');
      return;
    }

    this.imagen_file = file;
    const reader = new FileReader();
    reader.readAsDataURL(this.imagen_file);
    reader.onloadend = () => this.imagen_previzualiza = reader.result;
    this.cambioImagen = true;
    this.prepara_imagen_antes_grabar();
    this.imagen_paste = null;
  }

  async triggerPaste(): Promise<void> {
    try {
      this.cambioImagen = true;
      this.prepara_imagen_antes_grabar();
      
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
      console.error('Error al acceder al portapapeles:', error);
      this._toastr.info('No se pudo acceder al portapapeles, use la opción de galería', 'Información', { 
        timeOut: 4000,
        closeButton: true
      });      

      const pasteInput = document.getElementById('paste-input') as HTMLInputElement;
      if (pasteInput) {
        pasteInput.focus();
      }
    }
  }

  prepara_imagen_antes_grabar() {
    if (this.imagen_file && this.userId) {
      this.imagen = this.imagen_file;
      this.formDataImg = new FormData();
      this.formDataImg.append("UserId", this.userId.toString());
      this.formDataImg.append("imagen_file", this.imagen);
      
      this.comprimirImagen.comprimirImagen(this.imagen)
        .then((compressedFile: File) => {
          this.formDataImg = new FormData();
          this.formDataImg.append("UserId", this.userId.toString());
          this.formDataImg.append("imagen_file", compressedFile);
        })
        .catch((error: any) => {
          console.error('error en comprimir la imagen', error);
        });
    }
  }
  
  handleImageError(event: any) {
    event.target.style.display = 'none';
  }
  
  private async convertImageUrlToFile(imageUrl: string): Promise<void> {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();

      this.imagen_file = new File([blob], 'cloned_avatar.png', { type: blob.type });

      const reader = new FileReader();
      reader.onload = (e) => this.imagen_previzualiza = e.target?.result;
      reader.readAsDataURL(this.imagen_file);
      this.cambioImagen = true;
      this.prepara_imagen_antes_grabar();
    } catch (error) {
      console.error('Error al convertir imagen:', error);
      this._toastr.error('No se pudo cargar la imagen para clonación');
      this.imagen_previzualiza = null;
    }
  }
  
  private checkImageExists(url: string): Promise<boolean> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = url;
    });
  }

  public showFullscreenImage: boolean = false;
  
  @HostListener('document:keydown.escape', ['$event'])
  onKeydownHandler(event: KeyboardEvent) {
    if (this.showFullscreenImage) {
      this.closeFullscreen();
    }
  }
  
  openFullscreen(): void {
    // También se permite ampliar la imagen en modo consulta (view)
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
    
    const galleryInput = document.getElementById('gallery-input') as HTMLInputElement;
    if (galleryInput) {
      galleryInput.click();
    }
  }

  async openCamera(): Promise<void> {
    if (this.esView) return;
    
    this.showCameraModal = true;
    this.cameraError = '';
    this.isUsingFrontCamera = true;
    
    try {
      await this.startCamera('user');
    } catch (error: any) {
      console.error('Error al acceder a la cámara:', error);
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
    
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }, 
        audio: false 
      });
      
      this.isUsingFrontCamera = facingMode === 'user';
      
      setTimeout(() => {
        const videoElement = document.getElementById('cameraPreview') as HTMLVideoElement;
        if (videoElement && this.mediaStream) {
          videoElement.srcObject = this.mediaStream;
        }
      }, 100);
      
    } catch (error: any) {
      console.error('Error al acceder a la cámara:', error);
      throw error;
    }
  }

  async switchCamera(): Promise<void> {
    try {
      const newFacingMode = this.isUsingFrontCamera ? 'environment' : 'user';
      await this.startCamera(newFacingMode);
    } catch (error: any) {
      console.error('Error al cambiar de cámara:', error);
      this.cameraError = 'No se pudo cambiar a la otra cámara.';
      this._toastr.error(this.cameraError);
    }
  }

  capturePhoto(): void {
    const videoElement = document.getElementById('cameraPreview') as HTMLVideoElement;
    if (!videoElement) return;
    
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    if (!context) return;
    
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    
    if (this.isUsingFrontCamera) {
      context.translate(canvas.width, 0);
      context.scale(-1, 1);
    }
    
    context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    
    if (this.isUsingFrontCamera) {
      context.setTransform(1, 0, 0, 1, 0, 0);
    }
    
    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], 'camera-capture.jpg', { type: 'image/jpeg' });
        
        this.imagen_file = file;
        const reader = new FileReader();
        reader.readAsDataURL(this.imagen_file);
        reader.onloadend = () => {
          this.imagen_previzualiza = reader.result;
          this.cambioImagen = true;
          this.prepara_imagen_antes_grabar();
          this.imagen_paste = null;
          this.closeCamera();
          this._toastr.success('Foto capturada correctamente');
        };
      }
    }, 'image/jpeg', 0.8);
  }

  closeCamera(): void {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    this.showCameraModal = false;
    this.cameraError = '';
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(event: KeyboardEvent) {
    if (this.showCameraModal) {
      this.closeCamera();
    }
  }
}