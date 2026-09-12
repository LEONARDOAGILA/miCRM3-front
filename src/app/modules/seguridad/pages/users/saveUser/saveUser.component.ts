import { Component, ElementRef, EventEmitter, HostListener, Input, OnInit, Output, OnDestroy, ViewChild } from '@angular/core';
import { firstValueFrom, from, merge, of, Observable, Subject } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';
import { FormBuilder, FormGroup, Validators, FormControl } from '@angular/forms';
import { NgbActiveModal, NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';

// Servicios
import { UserService } from "../../../../seguridad/services/user.service";
import { SeguridadService } from '../../../../seguridad/services/seguridad.service';


import { LoadingService } from '../../../../../service/loading.service';
import { ProfileService } from '../../../../seguridad/services/profile.service';
import { ComprimirImagen } from '../../../../../service/comprimirImagen';
import { GeneradorClaveService } from '../../../../../service/generador-clave.service';
import { HorarioService } from '../../../../seguridad/services/horario.service';

// ModelosSSS
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
  public comprimirImagen: ComprimirImagen = new ComprimirImagen();
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

  /**
   * true en cuanto corre ngOnDestroy. Los callbacks nativos (FileReader,
   * Image, promesas de compresión) no se cancelan solos: sin esta bandera
   * seguían escribiendo sobre el componente muerto y resucitaban el data URL
   * del avatar que la propia limpieza acababa de soltar.
   */
  private destruido = false;

  /** Lecturas de fichero en curso, para abortarlas al destruir. */
  private readonly lectores = new Set<FileReader>();

  /** Descargas de imagen en curso (checkImageExists), para cancelarlas. */
  private readonly imagenesEnVuelo = new Set<HTMLImageElement>();

  /** Input de fichero oculto de la galería. */
  @ViewChild('galleryInput') private galleryInput?: ElementRef<HTMLInputElement>;

  /** Input oculto que recibe el pegado de imagen. */
  @ViewChild('pasteInput') private pasteInput?: ElementRef<HTMLInputElement>;

  /** <video> de la cámara. Vive dentro de un *ngIf, así que llega por el setter. */
  private videoCamara: HTMLVideoElement | null = null;

  @ViewChild('cameraPreview')
  set cameraPreviewRef(ref: ElementRef<HTMLVideoElement> | undefined) {
    this.videoCamara = ref?.nativeElement ?? null;
    // El <video> aparece después de que showCameraModal pase a true, así que
    // el stream puede estar listo antes que el elemento (y al revés).
    if (this.videoCamara) {
      this.videoCamara.srcObject = this.mediaStream;
    }
  }

  constructor(
    private fb: FormBuilder,
    private _toastr: ToastrService,
    public activeModal: NgbActiveModal,
    private modalService: NgbModal,
    private _loadingService: LoadingService,
    private _seguridadService: SeguridadService,
    private _userService: UserService,
    private _profileService: ProfileService,
    private _generadorClave: GeneradorClaveService,
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
    // Antes que nada: a partir de aquí ningún callback pendiente debe escribir.
    this.destruido = true;

    this.destroy$.next();
    this.destroy$.complete();

    this.closeCamera();                   // libera el MediaStream si seguía abierto

    // Aborta las lecturas de fichero en vuelo. Sin esto, onloadend corría
    // después de este método y volvía a asignar imagen_previzualiza.
    this.lectores.forEach(lector => lector.abort());
    this.lectores.clear();

    // Corta las descargas de imagen pendientes (src = '' aborta la petición).
    this.imagenesEnVuelo.forEach(img => {
      img.onload = null;
      img.onerror = null;
      img.src = '';
    });
    this.imagenesEnVuelo.clear();

    // El modal puede cerrarse con la imagen en pantalla completa y dejar
    // el <body> sin scroll para toda la app.
    document.body.style.overflow = '';

    // Suelta el data URL del avatar: puede pesar varios MB.
    this.imagen_previzualiza = null;
    this.imagen_paste = null;
    this.imagen_file = null;
  }

  /**
   * Lee un Blob como data URL cancelando bien la operación.
   *
   * Devuelve null si la lectura falla o si el componente se destruyó mientras
   * tanto, para que quien llame no reasigne nada sobre un componente muerto.
   * Sustituye a los cinco bloques `new FileReader()` que había repetidos.
   */
  private leerComoDataUrl(blob: Blob): Promise<string | null> {
    return new Promise((resolve) => {
      if (this.destruido) { resolve(null); return; }

      const lector = new FileReader();
      this.lectores.add(lector);

      const terminar = (valor: string | null) => {
        this.lectores.delete(lector);
        lector.onloadend = null;
        lector.onerror = null;
        lector.onabort = null;
        resolve(this.destruido ? null : valor);
      };

      lector.onloadend = () => terminar(typeof lector.result === 'string' ? lector.result : null);
      lector.onerror = () => terminar(null);
      lector.onabort = () => terminar(null);

      lector.readAsDataURL(blob);
    });
  }

  /**
   * Deja la imagen leída en la vista previa y la prepara para subirla.
   * Punto único de entrada tras seleccionar/pegar/capturar una imagen.
   */
  private async mostrarImagenSeleccionada(archivo: File): Promise<boolean> {
    this.imagen_file = archivo;
    this.cambioImagen = true;

    const dataUrl = await this.leerComoDataUrl(archivo);
    if (dataUrl === null) { return false; }   // lectura abortada o componente destruido

    this.imagen_previzualiza = dataUrl;
    if (this.userId) {
      this.prepara_imagen_antes_grabar();
    }
    return true;
  }

  /** Emite cuando el modal hijo se cierra o cuando este componente muere. */
  private hastaQueCierre(modalRef: NgbModalRef): Observable<unknown> {
    return merge(
      this.destroy$,
      // dismiss() rechaza la promesa; para nosotros es un cierre normal.
      from(modalRef.result).pipe(catchError(() => of(null)))
    );
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
    this.isdisabled = this.accion === 'view';    
    this.perfilNombreControl.disable();
    this.horarioNombreControl.disable();

    // Inicializar formulario
    this.initializeForm();

    // Si la clave se edita a mano, deja de mostrarse la sugerida
    this.form.get('password')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(valor => {
        if (this.claveGenerada && valor !== this.claveGenerada) {
          this.claveGenerada = null;
        }
      });

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
    const perfilId = this.form.get('perfil_id')?.value;

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

    // Para que el selector marque como «Actual» el perfil ya asignado
    modalRef.componentInstance.perfilSeleccionadoId = this.form.get('perfil_id')?.value;

    modalRef.componentInstance.seleccionado
      .pipe(takeUntil(this.hastaQueCierre(modalRef)))
      .subscribe((perfil: any) => {
        this.form.patchValue({ perfil_id: perfil.id });
        this.perfilNombreControl.setValue(perfil.nombre);
      });
  }

  async buscarPerfil(busqueda: string) {
    try {
      this._loadingService.setLoading(true);
      
      const isNumber = /^\d+$/.test(busqueda);
      let perfil = null;
      
      if (isNumber) {
        const res = await firstValueFrom(this._profileService.findByIdProfile(parseInt(busqueda))) as any;
        if (res?.status === 'success') {
          perfil = res.data;
        }
      } else {
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
        const res = await firstValueFrom(this._horarioService.getHorario(parseInt(busqueda))) as any;
        if (res?.status === 'success') {
          horario = res.data;
        }
      } else {
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

    // Para que el selector marque como «Actual» el horario ya asignado
    modalRef.componentInstance.horarioSeleccionadoId = this.form.get('chorario_id')?.value;

    modalRef.componentInstance.seleccionado
      .pipe(takeUntil(this.hastaQueCierre(modalRef)))
      .subscribe((horario: any) => {
        this.form.patchValue({ chorario_id: horario.id });
        this.horarioNombreControl.setValue(horario.nombre);
      });
  }

  //   ******   BUSQUEDA DE USUARIO   ******  //
  private async findByIdUser(id: number) {
    try {
      this._loadingService.setLoading(true);
      let res: any = await firstValueFrom(this._userService.findByIdUser(id));

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
        
        this.perfilNombreControl.setValue(this.userModel.perfil_nombre || '');
        this.horarioNombreControl.setValue(this.userModel.chorario_nombre || '');

        if (this.userModel.avatar) {
          this.imagen_previzualiza = this._userService.getUserImage(id, true);
          
          if (this.accion === 'clon') {
            await this.convertImageUrlToFile(this._userService.getUserImage(id, true));
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
      // ✅ Verificar que haya imagen
      if (!this.imagen_file) {
        console.warn('No hay imagen para guardar');
        return null;
      }
      
      // ✅ Verificar que haya userId
      if (!this.userId) {
        console.warn('No hay userId para guardar la imagen');
        return null;
      }
      
      // ✅ Crear un FormData nuevo siempre
      const formData = new FormData();
      formData.append("UserId", this.userId.toString());
      formData.append("imagen_file", this.imagen_file);
    
      //console.log('Guardando imagen para userId:', this.userId);
      //console.log('Nombre del archivo:', this.imagen_file.name);
      //console.log('Tamaño del archivo:', this.imagen_file.size);
    
      const response = await firstValueFrom(this._userService.addImagen(formData));
      if (response.status === 'success') {
        this.nuevoAvatar = response.data.avatar;
        //console.log('Imagen guardada exitosamente:', this.nuevoAvatar);
        return response;
      } else {
        this._toastr.error('No se pudo subir la imagen');
        return null;
      }
    } catch (error: any) {
      // El AuthInterceptor ya muestra el toast del error HTTP: no lo duplicamos.
      console.error('Error al subir imagen:', error);
      return null;
    }
  }

  //   ******   GRABAR DATA  ******  //
  private async saveRecord(data: UserModel) {
    try {
      this._loadingService.setLoading(true);
      this.isdisabled = true;
      
      if (this.accion === 'edit') {
        // editUser espera el payload dentro de un campo 'json' (FormData).
        const formData = new FormData();
        formData.append('json', JSON.stringify(data));
        this.response = await firstValueFrom(this._userService.editUser(this.registro_selected.id, formData));
      } else {
        // add y clon usan el mismo endpoint y mandan el objeto plano.
        this.response = await firstValueFrom(
          this.accion === 'clon' ? this._userService.clonUser(data) : this._userService.addUser(data)
        );
      }

      // Una respuesta sin éxito no debe emitirse como si lo fuera: antes se
      // emitía this.response.data (undefined) y salía un toast verde.
      if (this.response?.status !== 'success') {
        this.isdisabled = false;
        this._loadingService.setLoading(false);
        return;
      }

      if (this.accion !== 'edit') {
        this.userId = this.response.data.id;
      }

      if (this.cambioImagen && this.imagen_file) {
        await this.grabarImagen();
        this.response.data.avatar = this.nuevoAvatar;
      }

      this.registrosE.emit(this.response.data);
      this._toastr.success(this.response.message, 'Éxito', { closeButton: true });
      this._loadingService.setLoading(false);
      this.activeModal.close();

    } catch (error: any) {
      // El AuthInterceptor ya notificó el error HTTP: aquí solo reactivamos el form.
      console.error('Error en la petición', error);
      this.isdisabled = false;
      this._loadingService.setLoading(false);
    }
  }

  // ****** GENERACIÓN DE CLAVE ****** //

  /**
   * Clave sugerida, mostrada en claro para poder entregársela al nuevo usuario.
   * Se oculta en cuanto la clave se edita a mano.
   */
  public claveGenerada: string | null = null;

  /** Entra en el maxLength(20) que valida el formulario. */
  private readonly LONGITUD_CLAVE = 16;

  /**
   * Misma generación que la pantalla de cambio de contraseña: 16 caracteres
   * sobre un alfabeto de 64 con el CSPRNG del navegador (~95,6 bits).
   * El algoritmo vive en GeneradorClaveService para no tener dos copias.
   */
  public generarClaveRecomendada(): void {
    if (this.isdisabled) { return; }

    const nuevaClave = this._generadorClave.generar(this.LONGITUD_CLAVE);
    const control = this.form.get('password');

    control?.setValue(nuevaClave);
    control?.markAsDirty();
    control?.markAsTouched();
    control?.updateValueAndValidity();

    this.claveGenerada = nuevaClave;
  }

  /** Copia la clave sugerida para poder dictarla o entregarla. */
  public async copiarClave(): Promise<void> {
    const clave = this.form.get('password')?.value;
    if (!clave) { return; }

    if (await this._generadorClave.copiar(clave)) {
      this._toastr.success('Contraseña copiada al portapapeles');
    } else {
      this._toastr.info('No se pudo copiar automáticamente, cópiela manualmente');
    }
  }

  //   ******   VALIDA FORMULARIO   ******  //
  public async onSubmitForm($ev: any) {
    this._toastr.clear();
    Object.values(this.form.controls).forEach(control => control.markAsTouched());
    
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
    
    if (this.form.valid) {
      const payload = this.form.getRawValue();

      // En edición el backend ignora la contraseña (fn_usuarios_modificar no la
      // recibe). Enviar un password vacío solo es ruido y un riesgo latente.
      if (this.accion === 'edit') {
        delete payload.password;
      }

      this.saveRecord(payload);
    } else {
      this._toastr.error('Revise los campos del formulario.', 'No se puede Guardar', { timeOut: 20000, closeButton: true });
    }
  }

  ////   INICIO DE IMAGEN  ///////////////////////////////////////////////////////////////////////////////////////////
  async processFile($event: any) {
    const inputElement: HTMLInputElement = $event.target;
    const archivo: File | undefined = inputElement.files?.[0];

    if (!archivo || archivo.type.indexOf('image') < 0) {
      inputElement.value = '';
      return;
    }

    this.imagen_paste = null;
    await this.mostrarImagenSeleccionada(archivo);

    // Permite volver a elegir el mismo fichero (change no dispara si no cambia).
    inputElement.value = '';
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
  
  async handleImagePaste(imageBlob: Blob): Promise<void> {
    const file = new File([imageBlob], `pasted-image-${Date.now()}.png`, { type: imageBlob.type });
    const ok = await this.mostrarImagenSeleccionada(file);
    if (ok) {
      this.imagen_paste = this.imagen_previzualiza;
    }
  }

  clearImage() {
    this.imagen_previzualiza = null;
    this.imagen_paste = '';
    this.imagen_file = null;
    this.form.get('avatar')?.setValue(null);
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
  
  private async handleDroppedFile(file: File): Promise<void> {
    if (!file.type.match('image.*')) {
      this._toastr.error('El archivo debe ser una imagen', 'Error');
      return;
    }

    this.imagen_paste = null;
    await this.mostrarImagenSeleccionada(file);
  }

  async triggerPaste(): Promise<void> {
    try {
      this.cambioImagen = true;
      
      const clipboardItems = await navigator.clipboard.read();

      for (const clipboardItem of clipboardItems) {
        for (const type of clipboardItem.types) {
          if (type.startsWith('image/')) {
            const blob = await clipboardItem.getType(type);
            this.handleImagePaste(blob);
            this.cambioImagen = true;
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

      this.pasteInput?.nativeElement.focus();
    }
  }

  prepara_imagen_antes_grabar() {
    this.cambioImagen = true;
    
    if (!this.imagen_file) {
      console.warn('No hay imagen para preparar');
      return;
    }
    
    if (!this.userId) {
      console.warn('No hay userId para preparar la imagen');
      return;
    }
    
    // Comprimir la imagen
    this.comprimirImagen.comprimirImagen(this.imagen_file)
      .then((compressedFile: File) => {
        // El modal puede haberse cerrado mientras comprimía: no revivimos el File.
        if (this.destruido) { return; }
        // Reemplazar la imagen original con la comprimida
        this.imagen_file = compressedFile;
      })
      .catch((error: any) => {
        console.error('Error en comprimir la imagen, se usará la original', error);
      });
  }

  /**
   * La imagen del avatar no se pudo cargar (404 en el servidor, normalmente).
   * Antes se ocultaba el <img> con display:none, lo que dejaba el hueco vacío y
   * el elemento oculto para siempre; ahora se cae al estado "sin imagen".
   */
  handleImageError(_event: any) {
    this.imagen_previzualiza = null;
  }
  
  private async convertImageUrlToFile(imageUrl: string): Promise<void> {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      if (this.destruido) { return; }

      const file = new File([blob], `cloned_avatar_${Date.now()}.png`, { type: blob.type });
      await this.mostrarImagenSeleccionada(file);
    } catch (error) {
      console.error('Error al convertir imagen:', error);
      if (this.destruido) { return; }
      this._toastr.error('No se pudo cargar la imagen para clonación');
      this.imagen_previzualiza = null;
    }
  }

  /**
   * ¿Responde el servidor con una imagen en esa URL?
   *
   * Lleva timeout y cancelación: si el servidor no contestaba, ni onload ni
   * onerror llegaban a dispararse y la promesa quedaba pendiente para siempre,
   * reteniendo el componente entero a través del await de findByIdUser.
   */
  private checkImageExists(url: string, timeoutMs = 8000): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.destruido) { resolve(false); return; }

      const img = new Image();
      let resuelto = false;

      const terminar = (existe: boolean) => {
        if (resuelto) { return; }
        resuelto = true;
        clearTimeout(temporizador);
        this.imagenesEnVuelo.delete(img);
        img.onload = null;
        img.onerror = null;
        img.src = '';               // aborta la descarga si seguía en curso
        resolve(existe);
      };

      const temporizador = setTimeout(() => terminar(false), timeoutMs);

      this.imagenesEnVuelo.add(img);
      img.onload = () => terminar(true);
      img.onerror = () => terminar(false);
      img.src = url;
    });
  }

  public showFullscreenImage: boolean = false;

  /** Único manejador de Escape: la cámara va encima de la vista a pantalla completa. */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.showCameraModal) { this.closeCamera(); return; }
    if (this.showFullscreenImage) { this.closeFullscreen(); }
  }

  openFullscreen(): void {
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
    this.galleryInput?.nativeElement.click();
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
      
      // El modal pudo cerrarse mientras el usuario daba permisos: no dejamos
      // la cámara encendida contra un componente ya destruido.
      if (this.destruido || !this.showCameraModal) {
        this.mediaStream.getTracks().forEach(track => track.stop());
        this.mediaStream = null;
        return;
      }

      this.isUsingFrontCamera = facingMode === 'user';

      // Si el <video> ya está en el DOM lo enganchamos ahora; si aún no, lo hace
      // el setter de @ViewChild('cameraPreview') en cuanto aparezca.
      if (this.videoCamara) {
        this.videoCamara.srcObject = this.mediaStream;
      }

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
    const videoElement = this.videoCamara;
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
    
    canvas.toBlob(async (blob) => {
      if (!blob || this.destruido) { return; }

      const file = new File([blob], `camera-capture-${Date.now()}.jpg`, { type: 'image/jpeg' });
      this.imagen_paste = null;

      const ok = await this.mostrarImagenSeleccionada(file);
      if (!ok) { return; }   // el modal se cerró durante la lectura

      this.closeCamera();
      this._toastr.success('Foto capturada correctamente');
    }, 'image/jpeg', 0.8);
  }

  closeCamera(): void {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    if (this.videoCamara) {
      this.videoCamara.srcObject = null;   // suelta la referencia al stream
    }
    this.showCameraModal = false;
    this.cameraError = '';
  }
}
