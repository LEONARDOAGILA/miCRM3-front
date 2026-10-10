import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { HttpEvent, HttpEventType } from '@angular/common/http';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom, from, merge, of, Subject } from 'rxjs';
import { catchError, filter, map, takeUntil } from 'rxjs/operators';

import Swal from 'sweetalert2';

import { GestionService } from '../../../services/gestion.service';
import { ArchivoClienteService } from '../../../services/archivoCliente.service';
import { NotaClienteService } from '../../../services/notaCliente.service';
import { AlmacenDeImagenes } from '../../../interfaces/pegarEnEditor';
import {
  ArchivoCliente, extensionDe, formatoTamano, pintaDeTipo, tipoPorExtension,
} from '../../../interfaces/archivoCliente';
import { abrirWhatsapp, soloTexto } from '../../../interfaces/plantillasWhatsapp';
import { lanzarProtocolo } from '../../../../../service/lanzarProtocolo';
import { CatalogoGestionService } from '../../../services/catalogoGestion.service';
import { TipoGestion, AsuntoGestion, asuntosDe } from '../../../interfaces/catalogoGestion';
import { LoadingService } from '../../../../../service/loading.service';
// El mismo selector de usuarios con su árbol de grupos que abre «Reasignar
// cliente»: es standalone, así que se abre sin declararlo en el módulo
import { ListUsuariosGruposComponent } from '../../../../seguridad/pages/grupos/listUsuariosGrupos/listUsuariosGrupos.component';
import { nombreDeUsuario } from '../../../../seguridad/services/user.service';
import { SeguridadService } from '../../../../seguridad/services/seguridad.service';
import { ClienteModel, ContactoCliente } from '../../../interfaces/clienteModel';
import {
  GestionModel, PRIORIDADES_GESTION, RESULTADOS_GESTION,
} from '../../../interfaces/gestionModel';

/** Para qué se abre el modal. */
export type ModoGestion = 'registrar' | 'programar' | 'editar' | 'ver';

/**
 * Registrar una gestión ya hecha, programar la siguiente o corregir una
 * existente (ventas.gestiones).
 *
 * Es el mismo formulario en los tres casos: lo que cambia es el estado con el
 * que nace (REALIZADA o PENDIENTE) y, con él, si se pide la fecha en que se
 * hizo o la fecha para la que se agenda.
 */
@Component({
  selector: 'app-saveGestion',
  templateUrl: './saveGestion.component.html',
  styleUrls: ['./saveGestion.component.css'],
  standalone: false,
})
export class SaveGestionComponent implements OnInit, OnDestroy {

  @Input() modo: ModoGestion = 'registrar';
  @Input() cliente: ClienteModel | null = null;
  /** Personas de contacto del cliente, para decir con quién se habló */
  @Input() contactos: ContactoCliente[] = [];
  /** Sólo en 'editar' */
  @Input() gestion: GestionModel | null = null;
  /**
   * Con qué número se está hablando, cuando se abre después de marcar.
   *
   * Sin esto el formulario propone el celular del cliente, que es lo correcto
   * casi siempre; pero si se llamó a una persona de contacto, el número bueno
   * es el suyo y no el de la empresa.
   */
  @Input() telefonoInicial: string | null = null;

  /**
   * Con qué tipo, asunto y nota nace el formulario.
   *
   * Los usa la ficha cuando el vendedor elige una respuesta de WhatsApp: la
   * gestión se abre con el mensaje ya escrito en «Qué se habló» y el tipo
   * puesto en WHATSAPP, que es de lo que va.
   *
   * `asuntoInicial` es el id del asunto del catálogo. Antes era su nombre y
   * había que buscarlo por texto, porque los mensajes vivían en otra tabla que
   * guardaba el asunto como una cadena; desde que el mensaje es un campo del
   * propio asunto, la respuesta ES el asunto y aquí llega su id.
   */
  @Input() tipoInicial: string | null = null;
  @Input() notaInicial: string | null = null;
  @Input() asuntoInicial: number | null = null;
  @Input() contactoInicial: number | null = null;

  /**
   * El WhatsApp que se manda DESPUÉS de guardar.
   *
   * Antes el chat se abría al elegir la respuesta y la gestión se registraba
   * por detrás; si eso fallaba, el mensaje ya había salido y el CRM no se
   * enteraba. Ahora es al revés: primero se guarda y, con el guardado hecho,
   * se abre el chat. Mientras esté puesto, el botón del pie dice «Guardar y
   * enviar», que es exactamente lo que va a pasar.
   */
  @Input() whatsappPendiente: { numero: string; texto: string } | null = null;

  /**
   * El correo que sale DESPUÉS de guardar, por lo mismo que el WhatsApp.
   *
   * El cuerpo va en HTML porque lo manda Outlook, que sí entiende formato; en
   * «Qué se habló» quedó la misma cosa en texto llano, que es el historial.
   */
  @Input() correoPendiente: { para: string; asunto: string; cuerpoHtml: string } | null = null;

  @Output() guardado = new EventEmitter<GestionModel>();

  public form!: FormGroup;
  public titulo = '';
  public isLoading$ = this._loadingService.isLoading$;
  public guardando = false;

  /**
   * Los tipos salen de la tabla, no de una lista escrita en el código.
   *
   * Mientras llegan, el combo queda vacío y el formulario sin poder
   * guardarse: es un segundo y evita el caso feo de elegir un tipo que luego
   * resulta que no está en el catálogo.
   */
  public tipos: TipoGestion[] = [];
  public cargandoCatalogo = true;
  public prioridades = PRIORIDADES_GESTION;
  public resultados = RESULTADOS_GESTION;
  public contactosCombo: { id: number; name: string }[] = [];

  // ---------- Adjuntos ----------
  //
  // Lo que se le manda al cliente en esa conversación: la cotización, la
  // factura, la foto. Se suben AL GUARDAR y no al elegirlos, porque hasta
  // entonces la gestión no existe y no habría a qué colgarlos; si se subieran
  // antes y luego se cerrara el formulario, quedarían ficheros sueltos en el
  // disco del servidor sin fila que los nombre.

  /** Los que se acaban de elegir y todavía no están en el servidor. */
  public adjuntos: {
    clave: number; fichero: File; nombre: string;
    extension: string; tipo: string; tamano: number; vistaPrevia: string | null;
  }[] = [];

  /** Los que ya estaban (al modificar una gestión). */
  public adjuntosGuardados: ArchivoCliente[] = [];

  private claveAdjunto = 0;

  /**
   * El editor de «Qué se habló».
   *
   * Es el mismo de la pestaña Notas. Hace falta porque el mensaje de un asunto
   * de correo viene con formato: en un campo de texto llano se leerían las
   * etiquetas, y lo que se guarda es justamente lo que se le mandó al cliente.
   *
   * Barra corta a propósito: esto es el historial de una conversación, no un
   * documento. Lo que se escribe aquí son tres líneas y, de vez en cuando, un
   * correo pegado.
   */
  get ctrlNota(): FormControl { return this.form.controls['nota'] as FormControl; }

  /**
   * Dónde van a parar las imágenes que se peguen en «Qué se habló».
   *
   * Van a los archivos del cliente, como las de una nota: al pegar un correo
   * las imágenes vienen en base64, y dejarlas ahí haría la fila de la gestión
   * más grande que todas las demás juntas.
   */
  public almacenDeImagenes: AlmacenDeImagenes = {
    subir: async (f: File) => {
      try {
        const res: any = await firstValueFrom(this._notaService.subirImagen(this.cliente!.id!, f));
        return res?.status === 'success' ? this._notaService.urlDeImagen(res.data.url) : null;
      } catch { return null; }
    },
    traerDeFuera: async (u: string) => {
      try {
        const res: any = await firstValueFrom(this._notaService.traerImagen(this.cliente!.id!, u));
        return res?.status === 'success' ? this._notaService.urlDeImagen(res.data.url) : null;
      } catch {
        // Es normal que alguna no se deje traer; no merece un toast por cada una
        return null;
      }
    },
  };

  public avisarDelPegado = (mensaje: string, titulo: string): void => {
    this._toastr.warning(mensaje, titulo, { timeOut: 9000, closeButton: true });
  };
  public formatoTamano = formatoTamano;
  public pintaDeTipo = pintaDeTipo;

  /** Se cierra al destruir el modal: corta la escucha del selector. */
  private destruir$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    public modal: NgbActiveModal,
    private modalService: NgbModal,
    private _toastr: ToastrService,
    private _loadingService: LoadingService,
    private _gestionService: GestionService,
    private _seguridadService: SeguridadService,
    private _catalogoService: CatalogoGestionService,
    private _archivoService: ArchivoClienteService,
    private _notaService: NotaClienteService,
  ) {}

  // ================================================================
  // ADJUNTOS
  // ================================================================

  /** Los que hay ahora mismo, de los dos tipos: para enseñar u ocultar el bloque. */
  get hayAdjuntos(): boolean {
    return this.adjuntos.length > 0 || this.adjuntosGuardados.length > 0;
  }

  elegirAdjuntos(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    this.encolarAdjuntos(Array.from(input.files ?? []));
    // Para poder volver a elegir el mismo fichero si se quitó de la lista
    input.value = '';
  }

  alSoltarAdjuntos(ev: DragEvent): void {
    ev.preventDefault();
    this.arrastrando = false;
    this.encolarAdjuntos(Array.from(ev.dataTransfer?.files ?? []));
  }

  alArrastrarAdjuntos(ev: DragEvent, entra: boolean): void {
    ev.preventDefault();
    this.arrastrando = entra;
  }

  public arrastrando = false;

  private encolarAdjuntos(ficheros: File[]): void {
    for (const f of ficheros) {
      const extension = extensionDe(f.name);
      if (!extension) {
        this._toastr.warning(`«${f.name}» no tiene extensión, no se puede clasificar`, 'Archivo descartado');
        continue;
      }
      const tipo = tipoPorExtension(extension);
      this.adjuntos = [...this.adjuntos, {
        clave: ++this.claveAdjunto,
        fichero: f,
        nombre: f.name.replace(/\.[^.]+$/, '').substring(0, 150),
        extension,
        tipo,
        tamano: f.size,
        // La miniatura sólo para imágenes; para un vídeo haría falta un
        // <video> oculto por cada uno y no compensa
        vistaPrevia: tipo === 'imagen' ? URL.createObjectURL(f) : null,
      }];
    }
  }

  quitarAdjunto(clave: number): void {
    const f = this.adjuntos.find(a => a.clave === clave);
    if (f?.vistaPrevia) { URL.revokeObjectURL(f.vistaPrevia); }
    this.adjuntos = this.adjuntos.filter(a => a.clave !== clave);
  }

  /** El enlace con el que se ve uno ya guardado. */
  urlDelAdjunto(a: ArchivoCliente): string {
    return this._archivoService.urlDe(a.id);
  }

  /**
   * Quitar uno que ya estaba.
   *
   * Se borra de verdad y en el acto, no al guardar: estos adjuntos no salen en
   * la pestaña de Archivos del cliente —son de esta conversación—, así que si
   * no se pudieran quitar desde aquí no se podrían quitar desde ningún sitio.
   */
  async borrarAdjuntoGuardado(a: ArchivoCliente): Promise<void> {
    const confirmar = await Swal.fire({
      title: '¿Quitar el adjunto?',
      html: `Se va a borrar <b>${a.nombre}</b> de esta gestión.<br>`
          + '<span class="text-muted">El archivo se elimina del servidor.</span>',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, quitar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc3545',
    });
    if (!confirmar.isConfirmed) { return; }

    try {
      const res: any = await firstValueFrom(this._archivoService.deleteArchivo(a.id));
      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo quitar el adjunto', 'Error');
        return;
      }
      this.adjuntosGuardados = this.adjuntosGuardados.filter(x => x.id !== a.id);
      this._toastr.success(res.message, '', { timeOut: 2000 });
    } catch (error) {
      console.error('Error al quitar el adjunto:', error);
    }
  }

  /** Los que ya tiene la gestión que se está modificando. */
  private async cargarAdjuntos(): Promise<void> {
    if (!this.gestion?.id) { return; }
    try {
      const res: any = await firstValueFrom(this._archivoService.archivosDeGestion(this.gestion.id));
      this.adjuntosGuardados = res?.status === 'success' ? (res.data ?? []) : [];
    } catch (error) {
      console.error('Error al cargar los adjuntos de la gestión:', error);
      this.adjuntosGuardados = [];
    }
  }

  /**
   * Sube los elegidos y los cuelga de la gestión que acaba de guardarse.
   *
   * Si uno falla se avisa y se sigue con los demás: la gestión ya está
   * guardada y perderla por un fichero sería el peor cambio posible.
   *
   * Devuelve los ids que sí quedaron, que son los que se van al portapapeles.
   */
  private async subirAdjuntos(gestionId: number): Promise<number[]> {
    const ids: number[] = [];
    if (!this.adjuntos.length || !this.cliente?.id) { return ids; }

    for (const a of this.adjuntos) {
      try {
        const subida: any = await firstValueFrom(
          this._archivoService.subirArchivo(this.cliente.id, a.fichero, 'gestion').pipe(
            filter((e: HttpEvent<any>) => e.type === HttpEventType.Response),
            map((e: any) => e.body),
          ));
        if (subida?.status !== 'success') { throw new Error(subida?.message || 'No se pudo subir'); }

        const d = subida.data;
        const res: any = await firstValueFrom(this._archivoService.addArchivo({
          cliente_id: this.cliente.id,
          gestion_id: gestionId,
          origen: 'gestion',
          nombre: (a.nombre ?? '').trim() || d.nombre_original,
          archivo: d.archivo,
          tipo: d.tipo,
          extension: d.extension,
          mime: d.mime,
          tamano: d.tamano,
        }));
        if (res?.status !== 'success') { throw new Error(res?.message || 'No se pudo guardar el registro'); }

        if (res.data?.id) { ids.push(res.data.id); }
      } catch (error: any) {
        console.error('Error al adjuntar un archivo a la gestión:', error);
        this._toastr.warning(
          `«${a.nombre}» no se pudo adjuntar. La gestión sí quedó guardada.`,
          'Adjunto', { timeOut: 7000, closeButton: true },
        );
      }
    }
    return ids;
  }

  /** ¿Hay un WhatsApp esperando a que se guarde? Lo dice el botón del pie. */
  get hayWhatsappPendiente(): boolean {
    return !!this.whatsappPendiente?.numero;
  }

  /** ¿Y un correo? */
  get hayCorreoPendiente(): boolean {
    return !!this.correoPendiente?.para;
  }

  /** Cualquiera de los dos: es lo que convierte Guardar en «Guardar y enviar». */
  get hayEnvioPendiente(): boolean {
    return this.hayWhatsappPendiente || this.hayCorreoPendiente;
  }

  /** Por dónde sale, para decirlo en el aviso de debajo de la nota. */
  get destinoDelEnvio(): string {
    return this.correoPendiente?.para ?? this.whatsappPendiente?.numero ?? '';
  }

  /** Deja la gestión pero no manda el correo. */
  cancelarCorreoPendiente(): void {
    this.correoPendiente = null;
  }

  /**
   * Abre Outlook con el correo escrito, ya con la gestión guardada.
   *
   * No es un enlace mailto: ése sólo admite texto llano y el formato del
   * mensaje se perdería, y además no puede llevar adjuntos. Lo abre el
   * ayudante del puesto, que habla con el Outlook instalado.
   */
  private enviarCorreoPendiente(idsAdjuntos: number[] = []): void {
    const pendiente = this.correoPendiente;
    if (!pendiente?.para) { return; }
    this.correoPendiente = null;

    lanzarProtocolo('micrm3://correo'
      + '?para=' + encodeURIComponent(pendiente.para)
      + '&asunto=' + encodeURIComponent(pendiente.asunto ?? '')
      + '&cuerpo=' + encodeURIComponent(pendiente.cuerpoHtml ?? '')
      + (idsAdjuntos.length ? '&ids=' + idsAdjuntos.join(',') : ''));

    this._toastr.info(
      'Outlook abre el correo ya escrito'
        + (idsAdjuntos.length ? ' con sus adjuntos' : '')
        + '; repásalo y envíalo desde ahí.',
      'Correo', { timeOut: 7000, closeButton: true },
    );
  }

  /**
   * Deja la gestión pero no manda el mensaje.
   *
   * Hace falta porque el texto se escribe en la nota: puede que se haya
   * elegido una respuesta para apuntar de qué se habló y el mensaje ya se
   * mandara por otro lado. El botón vuelve a decir «Guardar».
   */
  cancelarWhatsappPendiente(): void {
    this.whatsappPendiente = null;
  }

  /**
   * Abre el chat con el mensaje, ya con la gestión guardada.
   *
   * CON ADJUNTOS cambia quién abre el chat. Se avisa UNA sola vez al ayudante
   * del puesto y él hace todo en orden: copia los archivos, abre la
   * conversación y pega. No es un capricho: Chrome sólo deja abrir una
   * aplicación externa durante unos segundos después del clic, y entre guardar
   * la gestión y subir los archivos ese permiso se agota, así que el primer
   * aviso sale y el segundo se pierde en silencio. Con uno solo no hay segundo
   * que perder.
   *
   * Si el puesto no tiene el ayudante instalado, Windows no reconoce micrm3:
   * y no pasa nada; por eso ahí se abre el chat por las bravas, sin adjuntos,
   * que es mejor que no abrir nada.
   */
  private enviarWhatsappPendiente(idsAdjuntos: number[] = []): void {
    const pendiente = this.whatsappPendiente;
    if (!pendiente?.numero) { return; }
    this.whatsappPendiente = null;

    if (idsAdjuntos.length) {
      // La dirección del servidor NO va aquí a propósito: la graba el
      // instalador dentro del comando del protocolo. Si viajara en el enlace,
      // cualquier página que alguien abriera podría mandar al ayudante a
      // descargar de donde fuera.
      // El token también para el ayudante: baja los adjuntos por ver/{id}, que
      // desde que no es pública le devolvería un 401.
      lanzarProtocolo('micrm3://enviar'
        + '?ids=' + idsAdjuntos.join(',')
        + '&token=' + encodeURIComponent(localStorage.getItem('token') ?? '')
        + '&tel=' + encodeURIComponent(pendiente.numero)
        + '&via=' + this.destinoWhatsapp
        + '&texto=' + encodeURIComponent(pendiente.texto));

      this._toastr.info(
        (idsAdjuntos.length === 1 ? 'El adjunto se copia' : `Los ${idsAdjuntos.length} adjuntos se copian`)
          + ' y se pegan en la conversación. Si no se pegan solos, Ctrl+V en WhatsApp.',
        'Adjuntos', { timeOut: 7000, closeButton: true },
      );
      return;
    }

    const comoFue = abrirWhatsapp(pendiente.numero, pendiente.texto);
    if (comoFue === 'bloqueado') {
      this._toastr.warning(
        'La gestión quedó guardada, pero el navegador no dejó abrir WhatsApp. Permita las ventanas emergentes de esta página.',
        'WhatsApp', { timeOut: 8000, closeButton: true },
      );
    }
  }

  /** De WhatsApp Web a la aplicación instalada: lo elige la ficha, aquí se lee. */
  private get destinoWhatsapp(): 'web' | 'app' {
    try { return localStorage.getItem('miCRM3.whatsapp') === 'app' ? 'app' : 'web'; } catch { return 'web'; }
  }

  /**
   * Los asuntos que se ofrecen ahora mismo: los del tipo elegido.
   *
   * El usuario no escribe el asunto, lo elige. Es lo que permite después
   * agrupar por asunto sin que «Cobranza» y «cobranzas» cuenten como dos
   * cosas distintas, que es justo lo que pasaba antes.
   */
  get asuntos(): AsuntoGestion[] {
    const codigo = this.form?.get('tipo')?.value;
    return asuntosDe(this.tipos.find(t => t.codigo === codigo));
  }

  /** Un tipo sin asuntos no deja registrar nada: hay que avisarlo, no callar. */
  get sinAsuntos(): boolean {
    return !this.cargandoCatalogo && !!this.form?.get('tipo')?.value && this.asuntos.length === 0;
  }

  /**
   * Trae el catálogo y deja el asunto coherente con el tipo.
   *
   * Al cambiar de tipo el asunto anterior deja de valer —es de otro tipo y el
   * servidor lo rechazaría—, así que se limpia. Al abrir para modificar una
   * gestión vieja se respeta el que ya tenía si sigue en la lista.
   */
  private async cargarCatalogo(): Promise<void> {
    try {
      const res: any = await firstValueFrom(this._catalogoService.catalogo());
      this.tipos = res?.status === 'success' ? (res.data ?? []) : [];
    } catch (error) {
      // El AuthInterceptor ya muestra el toast del error HTTP
      console.error('Error al cargar el catálogo de gestión:', error);
      this.tipos = [];
    } finally {
      this.cargandoCatalogo = false;
    }

    // El tipo que trae la gestión puede estar desactivado: se añade a la lista
    // para que el combo no aparezca vacío al abrir una del historial.
    const codigo = this.form?.get('tipo')?.value;
    if (codigo && !this.tipos.some(t => t.codigo === codigo)) {
      this.tipos = [...this.tipos, { id: 0, codigo, nombre: codigo, icono: null, asuntos: [] }];
    }

    this.ajustarAsunto();
    this.preseleccionarAsunto();
    this.form?.get('tipo')?.valueChanges.subscribe(() => this.ajustarAsunto(true));
  }

  /**
   * Deja elegido el asunto con el que se abrió el formulario.
   *
   * Se comprueba que esté entre los del tipo: si el asunto se desactivó entre
   * que se cargó el menú y se pulsó, el combo lo rechazaría igualmente y es
   * mejor dejarlo vacío que enseñar una opción que no está en la lista.
   */
  private preseleccionarAsunto(): void {
    if (!this.asuntoInicial) { return; }

    const ctrl = this.form?.get('asunto_id');
    if (!ctrl || ctrl.value) { return; }

    if (this.asuntos.some(a => a.id === this.asuntoInicial)) {
      ctrl.setValue(this.asuntoInicial);
    }
  }

  /** El asunto tiene que ser de los del tipo; si no lo es, se queda vacío. */
  private ajustarAsunto(cambioElTipo = false): void {
    const ctrl = this.form?.get('asunto_id');
    if (!ctrl) { return; }

    const actual = Number(ctrl.value) || null;
    const sigue = this.asuntos.some(a => a.id === actual);

    if (cambioElTipo || !sigue) {
      ctrl.setValue(sigue && !cambioElTipo ? actual : null);
    }
  }

  /**
   * Sólo mirar: el mismo formulario, con todo bloqueado.
   *
   * Es como se hace en el resto de los CRUD (saveCliente tiene su «esView»):
   * una pantalla distinta para leer lo mismo acaba enseñando otros campos u
   * otro orden, y entonces hay que mantener las dos.
   */
  get esVista(): boolean {
    return this.modo === 'ver';
  }

  ngOnInit(): void {
    this.titulo = this.modo === 'ver'       ? 'Ver gestión'
                : this.modo === 'programar' ? 'Programar gestión'
                : this.modo === 'editar'    ? 'Modificar gestión'
                : 'Registrar gestión';

    this.contactosCombo = (this.contactos ?? [])
      .filter(c => c.id)
      .map(c => ({ id: c.id as number, name: c.cargo ? `${c.nombres} (${c.cargo})` : c.nombres }));

    // Con el esquema de las notas: es el que trae las marcas de letra y
    // tamaño, que ngx-editor no tiene, y los nodos de tabla, que hacen
    // falta para que una tabla pegada de un correo no se pierda.
    this.initializeForm();
    // El responsable arranca en quien está dentro, con lo que hay en la
    // sesión; la lista del servidor llega después y sólo confirma
    this.elegirmeDeEntrada();
    this.cargarCatalogo();
    this.cargarAdjuntos();
    this.cargarAsignables();

    // Bloquear TODO el formulario de una vez y no campo a campo: así no hay
    // forma de que al añadir un campo nuevo alguien se olvide de bloquearlo.
    // El editor también se entera: campoNgxEditor es un ControlValueAccessor y
    // su setDisabledState lo pone en sólo lectura.
    if (this.esVista) {
      this.form.disable({ emitEvent: false });
      this.ctrlNota.disable({ emitEvent: false });
    }
  }


  ngOnDestroy(): void {
    // Las miniaturas son URLs de objeto: si no se sueltan, el navegador se las
    // queda. Y el editor igual: abrir el modal veinte veces deja veinte.
    for (const a of this.adjuntos) {
      if (a.vistaPrevia) { URL.revokeObjectURL(a.vistaPrevia); }
    }
    this.destruir$.next();
    this.destruir$.complete();
  }

  /** Programada mientras esté PENDIENTE; el resto, realizada. */
  get esProgramada(): boolean {
    return this.form?.get('estado')?.value === 'PENDIENTE';
  }

  /**
   * «En este momento»: realizada, pero la hora se pone al guardar.
   *
   * Es distinto de «Ya la hice»: ahí la hora que se propone es la de abrir el
   * formulario, y entre abrirlo y guardarlo pueden pasar diez minutos de
   * conversación. Para una llamada que se está atendiendo ahora, la hora buena
   * es la de cuando se termina de escribir.
   *
   * No es un estado distinto para la base: sigue siendo REALIZADA.
   */
  public ahoraMismo = false;

  get esAhora(): boolean { return this.ahoraMismo && !this.esProgramada; }

  /** Las tres opciones del interruptor de arriba. */
  elegirMomento(cual: 'ahora' | 'hecha' | 'programada'): void {
    // No basta con el css: estos son <button>, no campos, así que el
    // form.disable() no los alcanza, y setValue() funciona igual sobre un
    // control deshabilitado.
    if (this.esVista) { return; }

    this.ahoraMismo = cual === 'ahora';
    this.ctrlEstado.setValue(cual === 'programada' ? 'PENDIENTE' : 'REALIZADA');
  }

  // ---------- Anchos de la rejilla ----------
  //
  // Van aquí y no en la plantilla porque dependen de qué campos estén a la
  // vista —la fecha desaparece con «En este momento», el resultado con
  // «Programarla», y la persona de contacto sólo sale si el cliente tiene—.
  // Calculados, las filas quedan siempre completas; a mano, cada combinación
  // dejaba un hueco distinto.

  /**
   * A quién se le puede dejar la gestión a cargo: su equipo, los responsables
   * de este cliente y él mismo (todos, si es administrador). Lo decide el
   * servidor —ventas.fn_gestiones_asignables—, que es el que también lo valida
   * al guardar.
   */
  public asignables: any[] = [];

  /** El nombre del responsable elegido, al lado de su id (como en reasignar). */
  public responsableNombreControl = new FormControl({ value: '', disabled: true });

  /** Quién soy, para poder arrancar en «yo» sin preguntar. */
  private yo: number | null = null;

  /**
   * Pone de entrada al usuario que está dentro, con lo que ya hay en la
   * sesión, sin esperar a la lista del servidor.
   *
   * Es lo que hace que el campo salga relleno desde que se abre el modal: la
   * lista de asignables es una petición, y mientras llega el campo se vería
   * «Sin elegir» —y se quedaría así si la petición falla—. Cuando la lista
   * llega, confirma este valor o lo deja como está.
   */
  private elegirmeDeEntrada(): void {
    const sesion = this._seguridadService.getUserLogin();
    if (!sesion?.id) { return; }

    this.yo = Number(sesion.id);

    const ctrl = this.form?.controls['usuario_id'];
    if (!ctrl || ctrl.value) { return; }   // al editar ya trae el suyo

    ctrl.setValue(this.yo, { emitEvent: false });
    this.responsableNombreControl.setValue(nombreDeUsuario(sesion) + ' (yo)');
  }

  private async cargarAsignables(): Promise<void> {
    try {
      const res: any = await firstValueFrom(
        this._gestionService.asignables(this.cliente?.id ?? null));

      this.asignables = res?.data ?? [];
      // `?? this.yo`: si la lista no me trajera, no se pierde el que ya salió
      // de la sesión (ver elegirmeDeEntrada)
      this.yo = this.asignables.find((u: any) => u.es_yo)?.id ?? this.yo;

      this.elegirResponsablePorOmision();
      this.ponerNombreDelResponsable();
    } catch (error: any) {
      // Sin lista no se bloquea el guardado: el servidor pone a quien la crea
      console.error('No se pudo leer a quién se le puede asignar', error);
      this.asignables = [];
      this.ponerNombreDelResponsable();
    }
  }

  /** Ids que el servidor acepta como responsable, para el selector. */
  public get idsAsignables(): number[] {
    return this.asignables.map((u: any) => Number(u.id));
  }

  /**
   * El rótulo de un usuario de la lista.
   *
   * Dice de dónde sale cada uno —«(yo)», «cobrador del cliente»—, porque en
   * una lista de cincuenta nombres eso es lo único que permite saber a quién
   * le toca este cliente.
   */
  private rotulo(u: any): string {
    if (!u) { return ''; }
    // El papel va entre paréntesis y no tras una raya: el nombre ya trae el
    // guion que separa el login, y dos rayas en la misma línea no se leen
    if (u.es_yo) { return `${u.nombre} (yo)`; }
    if (u.rol_cliente) { return `${u.nombre} (${String(u.rol_cliente).toLowerCase()} del cliente)`; }
    return u.nombre;
  }

  /**
   * Escribe en el campo de al lado el nombre de quien está elegido.
   *
   * Si el responsable que ya tiene la gestión no está en la lista —se le
   * asignó cuando sí se podía, o lo puso un administrador— se enseña el nombre
   * que trae la gestión: el campo no puede quedarse en blanco enseñando un id
   * a secas.
   */
  private ponerNombreDelResponsable(): void {
    const id = this.form?.controls['usuario_id']?.value;
    if (!id) { this.responsableNombreControl.setValue(''); return; }

    const u = this.asignables.find((x: any) => Number(x.id) === Number(id));
    if (u) { this.responsableNombreControl.setValue(this.rotulo(u)); return; }

    // Soy yo pero la lista no llegó: el nombre sale de la sesión
    if (Number(id) === Number(this.yo)) {
      this.responsableNombreControl.setValue(
        nombreDeUsuario(this._seguridadService.getUserLogin()) + ' (yo)');
      return;
    }

    this.responsableNombreControl.setValue(this.gestion?.responsable_nombre ?? 'Usuario ' + id);
  }

  /** Escribir el ID y salir del campo también resuelve el responsable. */
  public async cargarResponsablePorId(): Promise<void> {
    const id = Number(this.form.controls['usuario_id']?.value ?? 0);
    if (!id) { this.responsableNombreControl.setValue(''); return; }

    const u = this.asignables.find((x: any) => Number(x.id) === id);
    if (u) { this.responsableNombreControl.setValue(this.rotulo(u)); return; }

    // Se mira contra la lista y no contra el API de usuarios: el id puede
    // existir y no ser de los que se le permiten, y es mejor decirlo ahora que
    // al guardar
    this.form.patchValue({ usuario_id: null }, { emitEvent: false });
    this.responsableNombreControl.setValue('');
    this._toastr.warning(
      'Ese usuario no está entre los que puede elegir: su equipo o un responsable del cliente.',
      'Responsable', { timeOut: 7000, closeButton: true });
  }

  /**
   * El selector de siempre: la lista de usuarios con su árbol de grupos, la
   * misma que abre «Reasignar cliente».
   *
   * Los que no se le permiten se ven pero quedan bloqueados
   * (`usuariosPermitidos`), para que la lista siga siendo la que ya conoce y
   * no una recortada que parezca que falta gente.
   */
  public async abrirSelectorResponsable(): Promise<void> {
    if (this.esVista) { return; }

    // Si la lista no llegó —se cayó la petición al abrir el modal—, se vuelve
    // a pedir antes de abrir: con la lista vacía, `usuariosPermitidos` no
    // restringe nada y el selector dejaría elegir a cualquiera para que el
    // servidor lo rechazara después. Mejor no llegar ahí.
    if (!this.asignables.length) { await this.cargarAsignables(); }

    if (!this.asignables.length) {
      this._toastr.error(
        'No se pudo leer la lista de usuarios a los que puede asignar. Inténtelo de nuevo.',
        'Responsable', { closeButton: true });
      return;
    }

    const modalRef = this.modalService.open(ListUsuariosGruposComponent, {
      size: 'xl', centered: true, backdrop: 'static'
    });
    modalRef.componentInstance.usuarioSeleccionadoId = this.form.controls['usuario_id']?.value || undefined;
    modalRef.componentInstance.usuariosPermitidos = this.idsAsignables;
    modalRef.componentInstance.ayuda =
      'Haz clic sobre quien se hará cargo de esta gestión. Sólo puedes elegir a alguien de tu equipo o a un responsable del cliente.';

    modalRef.componentInstance.seleccionado
      .pipe(takeUntil(merge(this.destruir$, from(modalRef.result).pipe(catchError(() => of(null))))))
      .subscribe((usuario: any) => {
        this.form.patchValue({ usuario_id: usuario.id });
        const u = this.asignables.find((x: any) => Number(x.id) === Number(usuario.id));
        this.responsableNombreControl.setValue(u ? this.rotulo(u) : nombreDeUsuario(usuario));
      });
  }

  /**
   * Al registrar o programar algo nuevo, el responsable arranca en el USUARIO
   * QUE ESTÁ DENTRO: lo normal es que la gestión la haga quien la registra, y
   * dejarla a otro es la excepción, que se elige a mano.
   *
   * Antes arrancaba en el vendedor del cliente —como se comportaba cuando el
   * campo no se podía elegir—, y eso hacía que al registrar una llamada que
   * acabas de hacer tú la gestión apareciera en la agenda de otro.
   *
   * Al modificar o ver no se toca: la gestión ya trae el suyo (este método
   * sale en cuanto el campo tiene valor).
   *
   * Nunca se queda vacío: una gestión sin responsable no entra en ninguna
   * agenda, y era justo lo que pasaba con los clientes sin vendedor.
   */
  private elegirResponsablePorOmision(): void {
    const ctrl = this.form?.controls['usuario_id'];
    if (!ctrl || ctrl.value) { return; }

    const hay = (id: any) => id && this.asignables.some((u: any) => Number(u.id) === Number(id));
    // El vendedor del cliente queda como respaldo, por si el servidor no
    // devolviera al propio usuario en la lista
    const elegido = hay(this.yo) ? this.yo
                  : hay(this.cliente?.vendedor_id) ? Number(this.cliente.vendedor_id)
                  : null;

    if (elegido) { ctrl.setValue(elegido, { emitEvent: false }); }
  }

  /**
   * El responsable comparte su fila con la persona de contacto, cuando la hay:
   * las dos dicen «con quién», y así la fila de abajo queda libre para el
   * asunto, la duración y el resultado.
   *
   * Necesita sitio: es un buscador de tres piezas (id, nombre y lupa) y el
   * nombre viene largo —«VCUENCA1  -  Cuenca Uno Vendedor (yo)»—.
   */
  get colResponsable(): string {
    return this.contactosCombo.length ? 'col-12 col-md-8' : 'col-12';
  }

  /**
   * El aviso de debajo del campo, sólo cuando la gestión NO queda para uno
   * mismo.
   *
   * Importa decirlo: desde que la visibilidad filtra por responsable, dejar
   * una gestión a cargo de otro puede significar dejar de verla uno mismo.
   */
  get avisoResponsable(): string {
    const elegido = this.form?.controls['usuario_id']?.value;
    if (!elegido || !this.yo || Number(elegido) === Number(this.yo)) { return ''; }

    const quien = this.responsableNombreControl.value || 'otro usuario';
    return `Entrará en la agenda de ${quien}, no en la suya.`;
  }

  // ---------- Los anchos de las tres filas ----------
  // Fila 1: tipo + prioridad + fecha          Fila 2: responsable + contacto
  // Fila 3: asunto + duración + resultado
  //
  // Calculados y no a mano porque hay dos cosas que aparecen y desaparecen —la
  // fecha (no en «En este momento») y el resultado (sólo si ya se hizo)—, y a
  // mano cada combinación dejaba un hueco distinto al final de la fila.
  //
  // EN EL TELÉFONO los pares de campos cortos comparten línea (col-6): tipo
  // con prioridad y duración con resultado. Los anchos —la fecha, el asunto,
  // el responsable— se quedan a 12, que es donde peor entran.

  get colTipo(): string      { return this.esAhora ? 'col-6' : 'col-6 col-md-4'; }
  get colPrioridad(): string { return this.esAhora ? 'col-6' : 'col-6 col-md-4'; }

  /** Estrecha: son cuatro dígitos como mucho. */
  get colDuracion(): string  { return 'col-6 col-md-2'; }

  get colResultado(): string { return 'col-6 col-md-3'; }

  /** Lo que sobra en su fila: 12 menos la duración y el resultado. */
  get colAsunto(): string {
    const resto = 12 - 2 - (this.esProgramada ? 0 : 3);
    return 'col-12 col-md-' + resto;
  }

  get ctrlEstado(): FormControl { return this.form.controls['estado'] as FormControl; }

  private initializeForm(): void {
    const g = this.gestion;
    const estadoInicial = this.modo === 'programar' ? 'PENDIENTE'
                        : (this.modo === 'editar' || this.modo === 'ver') ? (g?.estado ?? 'REALIZADA')
                        : 'REALIZADA';

    this.form = this.fb.group({
      tipo:             [g?.tipo ?? this.tipoInicial ?? 'LLAMADA', [Validators.required]],
      estado:           [estadoInicial, [Validators.required]],
      // El texto se conserva para poder enseñar el de una gestión vieja, pero
      // ya no se teclea: lo que se guarda y lo que valida es el asunto_id.
      asunto:           [g?.asunto ?? ''],
      asunto_id:        [g?.asunto_id ?? this.asuntoInicial ?? null, [Validators.required]],
      contacto_id:      [g?.contacto_id ?? this.contactoInicial ?? null],
      telefono:         [g?.telefono ?? this.telefonoInicial ?? this.cliente?.celular ?? this.cliente?.telefono ?? '', [Validators.maxLength(20)]],
      prioridad:        [g?.prioridad ?? 'MEDIA', [Validators.required]],
      fecha_programada: [this.paraInput(g?.fecha_programada) || (estadoInicial === 'PENDIENTE' ? this.enUnaHora() : '')],
      fecha_realizada:  [this.paraInput(g?.fecha_realizada) || (estadoInicial === 'REALIZADA' ? this.ahora() : '')],
      duracion_minutos: [g?.duracion_minutos ?? null, [Validators.min(0), Validators.max(1440)]],
      resultado:        [g?.resultado ?? (estadoInicial === 'REALIZADA' ? 'CONTACTADO' : null)],
      nota:             [g?.nota ?? this.notaInicial ?? '', [Validators.maxLength(100000)]],
      // A quién le TOCA la gestión, que no es lo mismo que quién la registra:
      // es lo que decide en qué agenda aparece. Al editar se respeta el que
      // tenga; al crear lo pone cargarAsignables (vendedor del cliente, o yo).
      usuario_id:       [g?.usuario_id ?? null],
    });

    // Una gestión nueva que se registra es, casi siempre, la que se acaba de
    // hacer: se arranca en «En este momento» y la hora la pone el guardado.
    // Al corregir una existente se respeta lo que ya tenía.
    this.ahoraMismo = this.modo === 'registrar';

    // Lo programado pide fecha futura; lo realizado, resultado
    this.aplicarReglasDelEstado(estadoInicial);
    this.form.get('estado')?.valueChanges.subscribe(v => this.aplicarReglasDelEstado(v));
  }

  /**
   * Cambia qué campos son obligatorios según el estado.
   *
   * La base tiene el mismo control (ck_gestiones_pendiente / _realizada), así
   * que sin esto el error llegaría del servidor en vez de verse en el campo.
   */
  private aplicarReglasDelEstado(estado: string): void {
    const programada = estado === 'PENDIENTE';
    const fp = this.form.get('fecha_programada');
    const res = this.form.get('resultado');

    fp?.setValidators(programada ? [Validators.required] : []);
    res?.setValidators(estado === 'REALIZADA' ? [Validators.required] : []);

    if (programada && !fp?.value) { fp?.setValue(this.enUnaHora(), { emitEvent: false }); }
    if (estado === 'REALIZADA' && !this.form.get('fecha_realizada')?.value) {
      this.form.get('fecha_realizada')?.setValue(this.ahora(), { emitEvent: false });
    }

    // Programar es lo contrario de «en este momento»: no pueden convivir
    if (programada) { this.ahoraMismo = false; }

    fp?.updateValueAndValidity({ emitEvent: false });
    res?.updateValueAndValidity({ emitEvent: false });
  }

  // ================================================================
  // FECHAS (el input datetime-local trabaja con «AAAA-MM-DDTHH:mm»)
  // ================================================================

  private aTexto(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  private ahora(): string { return this.aTexto(new Date()); }

  private enUnaHora(): string {
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return this.aTexto(d);
  }

  /** «AAAA-MM-DD HH:mm» (lo que devuelve la base) → lo que espera el input. */
  private paraInput(valor: string | null | undefined): string {
    return valor ? valor.replace(' ', 'T').substring(0, 16) : '';
  }

  // ================================================================
  // GUARDAR
  // ================================================================

  public async onSubmitForm($ev?: any): Promise<void> {
    $ev?.preventDefault?.();
    // Aquí no se llega desde la pantalla —en modo ver no hay botón de guardar—,
    // pero el pie es compartido y un Enter en un campo dispara el submit.
    if (this.esVista) { return; }

    this._toastr.clear();
    this.form.markAllAsTouched();

    if (!this.cliente?.id) {
      this._toastr.error('No hay cliente seleccionado', 'Error');
      return;
    }
    if (this.form.invalid) {
      const falta = !this.form.get('asunto_id')?.value
        ? 'Elija el asunto de la lista: ya no se escribe a mano.'
        : this.esProgramada && !this.form.get('fecha_programada')?.value
        ? 'Indique la fecha y la hora de la gestión programada.'
        : !this.esProgramada && !this.form.get('resultado')?.value
        ? 'Indique cómo terminó la gestión.'
        : 'Revise los campos del formulario.';
      this._toastr.error(falta, 'No se puede guardar', { timeOut: 8000, closeButton: true });
      return;
    }

    const v = this.form.getRawValue();

    // «En este momento»: la hora es la de ahora, no la de cuando se abrió el
    // formulario. Se calcula aquí, con el guardado ya en marcha.
    if (this.esAhora) { v.fecha_realizada = this.ahora(); }

    const payload: any = {
      cliente_id:       this.cliente.id,
      // Cuál de las tres eligió el vendedor. No lo sabe nadie más: a la base
      // llegan iguales «en este momento» y «ya la hice» (REALIZADA con su
      // fecha), y sin esto no habría forma de separarlas en un reporte.
      modo_registro:    this.esProgramada ? 'PROGRAMADA' : (this.esAhora ? 'AHORA' : 'YA_HECHA'),
      tipo:             v.tipo,
      estado:           v.estado,
      // El texto lo pone el catálogo en el servidor a partir del id; se manda
      // igualmente para que el historial viejo no se quede sin asunto si algún
      // día se abre una gestión anterior al catálogo y se vuelve a guardar.
      asunto:           (v.asunto ?? '').trim() || null,
      asunto_id:        v.asunto_id ? Number(v.asunto_id) : null,
      // El editor devuelve «<p></p>» cuando no se escribio nada: eso no es
      // una nota, es el envoltorio vacio. Se mira el texto para decidir.
      nota:             soloTexto(v.nota) ? (v.nota ?? '').trim() : null,
      // El RESPONSABLE: a quién le toca hacerla, y por tanto en qué agenda
      // aparece. Antes se ponía siempre el vendedor del cliente y no se podía
      // elegir —y si el cliente no tenía vendedor, la gestión se quedaba sin
      // responsable—. Ahora sale del campo; si viniera vacío, el servidor pone
      // a quien la crea.
      usuario_id:       v.usuario_id ? Number(v.usuario_id) : null,
      contacto_id:      v.contacto_id || null,
      telefono:         (v.telefono ?? '').trim() || null,
      prioridad:        v.prioridad,
      fecha_programada: v.estado === 'PENDIENTE' ? v.fecha_programada : (v.fecha_programada || null),
      fecha_realizada:  v.estado === 'REALIZADA' ? (v.fecha_realizada || null) : null,
      duracion_minutos: v.duracion_minutos === '' || v.duracion_minutos === null ? null : Number(v.duracion_minutos),
      resultado:        v.estado === 'REALIZADA' ? v.resultado : null,
    };

    try {
      this.guardando = true;
      this._loadingService.setLoading(true);

      const res: any = this.gestion?.id
        ? await firstValueFrom(this._gestionService.editGestion(this.gestion.id, payload))
        : await firstValueFrom(this._gestionService.addGestion(payload));

      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo guardar la gestión', 'Error');
        return;
      }

      // Los adjuntos van ahora, que ya hay gestión a la que colgarlos. Antes
      // de avisar de que todo fue bien: si alguno falla, el aviso sale junto
      // al éxito y no después de haberse cerrado el modal.
      const idsAdjuntos = await this.subirAdjuntos(res.data?.id ?? this.gestion?.id);

      this.guardado.emit(res.data);
      this._toastr.success(res.message, 'Éxito', { closeButton: true });

      // Ya está guardada: ahora sí se abre el chat. Va antes de cerrar el
      // modal porque window.open cuelga del gesto que empezó todo esto, y
      // cerrando primero algunos navegadores lo toman por una ventana
      // emergente y la bloquean.
      this.enviarWhatsappPendiente(idsAdjuntos);
      this.enviarCorreoPendiente(idsAdjuntos);

      this.modal.close(res.data);
    } catch (error) {
      // El AuthInterceptor ya muestra el toast del error HTTP
      console.error('Error al guardar la gestión:', error);
    } finally {
      this.guardando = false;
      this._loadingService.setLoading(false);
    }
  }
}
