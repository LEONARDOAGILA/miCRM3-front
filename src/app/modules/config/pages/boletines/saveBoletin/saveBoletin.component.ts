import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NgbActiveModal, NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { Observable, Subject, firstValueFrom, from, merge, of } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';
import moment from 'moment';
import { LOCALE_CONFIG, LocaleService, DefaultLocaleConfig } from 'ngx-daterangepicker-material';

import { BoletinService } from '../../../services/boletin.service';
import { LoadingService } from '../../../../../service/loading.service';
import { SeguridadService } from '../../../../seguridad/services/seguridad.service';
import { UserService } from '../../../../seguridad/services/user.service';
import { GrupoModel } from '../../../../seguridad/interfaces/grupoModel';
import { BoletinDestinatario, BoletinGrupo, BoletinModel, BoletinUsuario, TipoLamina } from '../../../interfaces/boletinModel';
import { ListUsersComponent } from '../../../../seguridad/pages/users/listUsers/listUsers.component';
import { ListGruposComponent } from '../../../../seguridad/pages/grupos/listGrupos/listGrupos.component';
import { VerBoletinesComponent } from '../verBoletines/verBoletines.component';

/** Lámina en el editor: ya guardada (tiene id) o recién subida. */
interface ImagenEditor {
  id?: number | string | null;
  archivo: string;
  /** Lo decide la extensión: una imagen, un video mp4 o un audio mp3 */
  tipo: TipoLamina;
  titulo: string;
  descripcion: string;
  /** Segundos en pantalla dentro del carrusel */
  segundos: number;
  /** Object URL para la miniatura (sólo imágenes) */
  url?: string;
  /** Object URL del video o del audio recién elegido, para la vista previa */
  urlMedio?: string;
  subiendo?: boolean;
}

/**
 * Alta, edición o vista de un boletín.
 *
 * Tres bloques: los datos y la vigencia, las imágenes del carrusel (se suben
 * al servidor en cuanto se eligen y se ordenan aquí) y los destinatarios,
 * que se añaden uno a uno con el selector de usuarios o por grupo con el
 * selector de grupos, igual que los permisos del administrador de archivos.
 *
 * Las miniaturas se piden con el token (las imágenes no tienen URL pública),
 * así que se guardan como object URL y se sueltan al cerrar.
 */
@Component({
  selector: 'app-saveBoletin',
  templateUrl: './saveBoletin.component.html',
  styleUrls: ['./saveBoletin.component.css'],
  standalone: false,
  providers: [
    // Igual que en historialAcciones y auditoria-modal: abierto por NgbModal,
    // el picker no alcanza los providers de NgxDaterangepickerMd.forRoot().
    { provide: LOCALE_CONFIG, useValue: DefaultLocaleConfig },
    { provide: LocaleService, useClass: LocaleService, deps: [LOCALE_CONFIG] },
  ],
})
export class SaveBoletinComponent implements OnInit, OnDestroy {

  @Input() registro_selected: any = {};
  @Input() accion: 'add' | 'edit' | 'view' = 'add';
  @Output() registrosE: EventEmitter<BoletinModel> = new EventEmitter();

  public titulo = '';
  public form!: FormGroup;
  public isdisabled = false;
  public esView = false;
  public esNuevo = false;
  public isLoading$ = this._loadingService.isLoading$;

  /** Imágenes del carrusel, en el orden en que se mostrarán. */
  public imagenes: ImagenEditor[] = [];
  // ---------- pestañas ----------
  /**
   * Dos pestañas: los datos (en tres columnas) y el carrusel, que es lo
   * único que necesita el ancho entero.
   */
  public pestana: 'datos' | 'contenido' = 'datos';
  public readonly pestanas = [
    // Rótulos cortos, como los del mapa: en celular no se cortan
    { id: 'datos' as const,     texto: 'Datos',     icono: 'fa-circle-info' },
    { id: 'contenido' as const, texto: 'Contenido', icono: 'fa-images' },
  ];

  /** Lo que se queda cada imagen si no se toca el campo. */
  public readonly SEGUNDOS_POR_DEFECTO = 6;

  // ---------- vigencia: el mismo rango de fechas del tablero ----------
  public selected: { startDate: moment.Moment | null; endDate: moment.Moment | null } = { startDate: null, endDate: null };

  public locale: any = {
    format: 'DD/MM/YYYY',
    displayFormat: 'DD/MM/YYYY',
    separator: ' - ',
    applyLabel: 'Aplicar',
    cancelLabel: 'Cancelar',
    clearLabel: 'Limpiar',
    customRangeLabel: 'Personalizado',
    daysOfWeek: ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'],
    monthNames: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
    firstDay: 1,
  };

  /** Atajos: lo que se suele poner en un boletín. */
  public ranges: any = {
    'Hoy': [moment(), moment()],
    'Esta semana': [moment(), moment().add(6, 'days')],
    'Quince días': [moment(), moment().add(14, 'days')],
    'Este mes': [moment(), moment().endOf('month')],
    'Un mes': [moment(), moment().add(1, 'month')],
    'Tres meses': [moment(), moment().add(3, 'month')],
  };

  /** Lo que admite el servidor, en MB, para cada tipo de archivo. */
  private readonly TOPES_MB: Record<TipoLamina, number> = { IMAGEN: 8, AUDIO: 20, VIDEO: 64 };
  /** Extensiones que valen; el resto se rechaza antes de subirlo. */
  private readonly EXTENSIONES: Record<TipoLamina, string[]> = {
    IMAGEN: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
    VIDEO:  ['mp4'],
    AUDIO:  ['mp3'],
  };
  public subiendo = false;

  /** Destinatarios elegidos. */
  public usuarios: BoletinUsuario[] = [];
  public grupos: BoletinGrupo[] = [];
  /** Quién lo verá en total (se pide al servidor al editar). */
  public destinatarios: BoletinDestinatario[] = [];
  public cargandoDestinatarios = false;

  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private _toastr: ToastrService,
    public activeModal: NgbActiveModal,
    private modalService: NgbModal,
    private _loadingService: LoadingService,
    private _seguridadService: SeguridadService,
    private _userService: UserService,
    private _boletinService: BoletinService,
  ) {}

  ngOnInit(): void {
    if (this._seguridadService.isexpired()) { this.activeModal.close(); return; }

    this.esView = this.accion === 'view';
    this.esNuevo = this.accion === 'add';
    this.isdisabled = this.esView;
    this.initializeForm();

    switch (this.accion) {
      case 'add':
        this.titulo = 'Nuevo boletín';
        this.form.patchValue({ desde: this.hoyIso(), hasta: this.enDiasIso(15) });
        this.sincronizarRango();
        break;
      case 'edit':
      case 'view':
        this.titulo = this.esView ? 'Ver boletín' : 'Modificar boletín';
        this.cargar(this.registro_selected?.id);
        break;
    }
  }

  ngOnDestroy(): void {
    this.imagenes.forEach(i => {
      if (i.url?.startsWith('blob:')) { URL.revokeObjectURL(i.url); }
      if (i.urlMedio?.startsWith('blob:')) { URL.revokeObjectURL(i.urlMedio); }
    });
    this.destroy$.next();
    this.destroy$.complete();
  }

  private hastaQueCierre(modalRef: NgbModalRef): Observable<unknown> {
    return merge(this.destroy$, from(modalRef.result).pipe(catchError(() => of(null))));
  }

  private hoyIso(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private enDiasIso(dias: number): string {
    const d = new Date();
    d.setDate(d.getDate() + dias);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  initializeForm(): void {
    this.form = this.fb.group({
      titulo:      [{ value: '', disabled: this.isdisabled }, [Validators.required, Validators.maxLength(200)]],
      descripcion: [{ value: '', disabled: this.isdisabled }, [Validators.maxLength(2000)]],
      desde:       [{ value: '', disabled: this.isdisabled }, [Validators.required]],
      hasta:       [{ value: '', disabled: this.isdisabled }, [Validators.required]],
      prioridad:   [{ value: 0, disabled: this.isdisabled }, [Validators.min(0), Validators.max(100)]],
      obligatorio: [{ value: false, disabled: this.isdisabled }],
      activo:      [{ value: true, disabled: this.isdisabled }],
    });
  }

  // ================================================================
  // CARGAR
  // ================================================================

  private async cargar(id: number): Promise<void> {
    if (!id) { return; }
    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._boletinService.findByIdBoletin(id));
      if (res?.status !== 'success') { return; }

      const b: BoletinModel = res.data;
      this.form.patchValue({
        titulo: b.titulo,
        descripcion: b.descripcion ?? '',
        desde: b.desde,
        hasta: b.hasta,
        prioridad: b.prioridad,
        obligatorio: b.obligatorio,
        activo: b.activo,
      });
      this.sincronizarRango();

      this.imagenes = (b.imagenes ?? []).map(i => ({
        id: i.id,
        archivo: i.archivo ?? '',
        tipo: i.tipo ?? 'IMAGEN',
        titulo: i.titulo ?? '',
        descripcion: i.descripcion ?? '',
        segundos: Number(i.segundos) || this.SEGUNDOS_POR_DEFECTO,
      }));
      this.usuarios = [...(b.usuarios ?? [])];
      this.grupos = [...(b.grupos ?? [])];

      this.imagenes.forEach(i => this.traerMiniatura(i));
      this.cargarDestinatarios(id);
    } catch (e) {
      console.error('Error al cargar el boletín:', e);
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  private async traerMiniatura(i: ImagenEditor): Promise<void> {
    // El video y el audio se representan con su icono: traerlos aquí sería
    // bajarse decenas de MB para pintar un recuadro de 90 px.
    if (!i.id || i.url || i.tipo !== 'IMAGEN') { return; }
    try {
      const blob = await firstValueFrom(this._boletinService.imagen(i.id));
      i.url = URL.createObjectURL(blob);
    } catch (e) {
      console.error('No se pudo traer la miniatura:', e);
    }
  }

  private async cargarDestinatarios(id: number): Promise<void> {
    this.cargandoDestinatarios = true;
    try {
      const res: any = await firstValueFrom(this._boletinService.destinatarios(id));
      this.destinatarios = res?.status === 'success' ? (res.data ?? []) : [];
    } catch {
      this.destinatarios = [];
    } finally {
      this.cargandoDestinatarios = false;
    }
  }

  // ================================================================
  // IMÁGENES
  // ================================================================

  /** Las imágenes se suben en cuanto se eligen: así el guardado es sólo datos. */
  async alElegirArchivos(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const archivos = Array.from(input.files ?? []);
    input.value = '';
    if (!archivos.length) { return; }

    this.subiendo = true;
    for (const archivo of archivos) {
      const tipo = this.tipoDe(archivo.name);
      if (!tipo) {
        this._toastr.warning(`«${archivo.name}» no es una imagen, ni un video mp4, ni un audio mp3`, 'Boletín');
        continue;
      }
      if (archivo.size > this.TOPES_MB[tipo] * 1024 * 1024) {
        this._toastr.warning(`«${archivo.name}» pasa de ${this.TOPES_MB[tipo]} MB`, 'Boletín');
        continue;
      }

      const fila: ImagenEditor = {
        archivo: '', tipo, titulo: '', descripcion: '', segundos: this.SEGUNDOS_POR_DEFECTO,
        // Sólo la imagen se ve de miniatura; el resto va con su icono
        url: tipo === 'IMAGEN' ? URL.createObjectURL(archivo) : undefined,
        urlMedio: tipo === 'IMAGEN' ? undefined : URL.createObjectURL(archivo),
        subiendo: true,
      };
      this.imagenes.push(fila);
      try {
        const res: any = await firstValueFrom(this._boletinService.subirImagen(archivo));
        if (res?.status === 'success') {
          fila.archivo = res.data.archivo;
        } else {
          this._toastr.error(res?.message ?? 'No se pudo subir la imagen', 'Boletín');
          this.quitarImagen(this.imagenes.indexOf(fila));
        }
      } catch (e) {
        console.error('Error al subir la imagen:', e);
        this.quitarImagen(this.imagenes.indexOf(fila));
      } finally {
        fila.subiendo = false;
      }
    }
    this.subiendo = false;
  }

  /** El tipo sale de la extensión, igual que en el servidor. */
  private tipoDe(nombre: string): TipoLamina | null {
    const ext = (nombre.split('.').pop() ?? '').toLowerCase();
    for (const tipo of ['IMAGEN', 'VIDEO', 'AUDIO'] as TipoLamina[]) {
      if (this.EXTENSIONES[tipo].includes(ext)) { return tipo; }
    }
    return null;
  }

  /** Lo que se admite en el selector de archivos. */
  get tiposAceptados(): string {
    return '.jpg,.jpeg,.png,.webp,.gif,.mp4,.mp3';
  }

  iconoDe(i: ImagenEditor): string {
    return i.tipo === 'VIDEO' ? 'fa-film' : i.tipo === 'AUDIO' ? 'fa-music' : 'fa-image';
  }

  nombreDe(i: ImagenEditor): string {
    return i.tipo === 'VIDEO' ? 'Video' : i.tipo === 'AUDIO' ? 'Audio' : 'Imagen';
  }

  // ================================================================
  // PESTAÑAS
  // ================================================================

  /** El número que va en la pestaña (0 = sin globo). */
  contadorDe(id: string): number {
    if (id === 'contenido') { return this.imagenes.length; }
    if (id === 'datos') { return this.usuarios.length + this.grupos.length; }
    return 0;
  }

  /** Avisa en la pestaña que esconde un campo obligatorio sin llenar. */
  faltaAlgoEn(id: string): boolean {
    const malo = (campo: string) => {
      const c = this.form.get(campo);
      return !!c && c.invalid && c.touched;
    };
    if (id === 'datos') {
      return malo('titulo') || malo('descripcion') || malo('prioridad') || malo('desde') || malo('hasta');
    }
    return false;
  }

  /** Al fallar el guardado, se abre la pestaña donde está el problema. */
  private irAlProblema(): void {
    for (const p of this.pestanas) {
      if (this.faltaAlgoEn(p.id)) { this.pestana = p.id; return; }
    }
    if (!this.imagenes.length) {
      this.pestana = 'contenido'; this.pestana = 'contenido'; }
  }

  // ================================================================
  // VIGENCIA
  // El picker manda sobre los dos controles del formulario, que son los
  // que se guardan; así el resto del componente no se entera del cambio.
  // ================================================================

  /** El usuario eligió un rango (o lo limpió). */
  onRangoChange(rango: { startDate: any; endDate: any } | null): void {
    if (!rango?.startDate || !rango?.endDate) {
      this.form.patchValue({ desde: '', hasta: '' });
      return;
    }
    // .format() del propio objeto (dayjs o moment), nunca moment(obj)
    this.form.patchValue({
      desde: rango.startDate.format('YYYY-MM-DD'),
      hasta: rango.endDate.format('YYYY-MM-DD'),
    });
  }

  /** Deja el picker con lo que tenga el formulario. */
  private sincronizarRango(): void {
    const v = this.form.getRawValue();
    this.selected = {
      startDate: v.desde ? moment(v.desde, 'YYYY-MM-DD') : null,
      endDate: v.hasta ? moment(v.hasta, 'YYYY-MM-DD') : null,
    };
  }

  private enTexto(iso: string): string {
    return iso ? moment(iso, 'YYYY-MM-DD').format('DD/MM/YYYY') : '—';
  }

  get rangoDesdeTexto(): string { return this.enTexto(this.form.getRawValue().desde); }
  get rangoHastaTexto(): string { return this.enTexto(this.form.getRawValue().hasta); }

  /** Lo que se muestra en modo consulta, donde no hay picker. */
  get rangoTexto(): string {
    const v = this.form.getRawValue();
    return v.desde && v.hasta ? `${this.enTexto(v.desde)} - ${this.enTexto(v.hasta)}` : 'Sin vigencia';
  }

  get diasDeVigencia(): string {
    const v = this.form.getRawValue();
    if (!v.desde || !v.hasta) { return '—'; }
    const dias = moment(v.hasta, 'YYYY-MM-DD').diff(moment(v.desde, 'YYYY-MM-DD'), 'days') + 1;
    if (dias < 1) { return 'El rango está al revés'; }
    return dias === 1 ? '1 día' : `${dias} días`;
  }

  /** El mismo estado que calcula la base de datos, para verlo antes de guardar. */
  get estadoVigencia(): { clase: string; icono: string; texto: string } {
    const v = this.form.getRawValue();
    if (!v.activo) { return { clase: 'inactivo', icono: 'fa-power-off', texto: 'Inactivo: no se muestra a nadie' }; }
    if (!v.desde || !v.hasta) { return { clase: 'inactivo', icono: 'fa-calendar', texto: 'Falta elegir la vigencia' }; }

    const hoy = moment().startOf('day');
    if (hoy.isBefore(moment(v.desde, 'YYYY-MM-DD'), 'day')) {
      return { clase: 'programado', icono: 'fa-clock', texto: 'Programado: empezará a mostrarse el ' + this.enTexto(v.desde) };
    }
    if (hoy.isAfter(moment(v.hasta, 'YYYY-MM-DD'), 'day')) {
      return { clase: 'caducado', icono: 'fa-hourglass-end', texto: 'Caducado: dejó de mostrarse el ' + this.enTexto(v.hasta) };
    }
    return { clase: 'vigente', icono: 'fa-circle-check', texto: 'Vigente: se está mostrando' };
  }

  /** Cuántas láminas hay y de qué tipo. */
  get resumenContenido(): string {
    if (!this.imagenes.length) { return 'Sin contenido'; }
    const cuenta = { IMAGEN: 0, VIDEO: 0, AUDIO: 0 } as Record<TipoLamina, number>;
    this.imagenes.forEach(i => cuenta[i.tipo]++);
    const partes: string[] = [];
    if (cuenta.IMAGEN) { partes.push(cuenta.IMAGEN === 1 ? '1 imagen' : `${cuenta.IMAGEN} imágenes`); }
    if (cuenta.VIDEO) { partes.push(cuenta.VIDEO === 1 ? '1 video' : `${cuenta.VIDEO} videos`); }
    if (cuenta.AUDIO) { partes.push(cuenta.AUDIO === 1 ? '1 audio' : `${cuenta.AUDIO} audios`); }
    return partes.join(' · ');
  }

  quitarImagen(i: number): void {
    if (i < 0 || i >= this.imagenes.length) { return; }
    const fila = this.imagenes[i];
    if (fila.url?.startsWith('blob:')) { URL.revokeObjectURL(fila.url); }
    if (fila.urlMedio?.startsWith('blob:')) { URL.revokeObjectURL(fila.urlMedio); }
    this.imagenes.splice(i, 1);
  }

  mover(i: number, paso: number): void {
    const j = i + paso;
    if (i < 0 || j < 0 || i >= this.imagenes.length || j >= this.imagenes.length) { return; }
    [this.imagenes[i], this.imagenes[j]] = [this.imagenes[j], this.imagenes[i]];
  }

  /** El campo es libre: se admite de 1 a 120 s y, vacío, el valor por defecto. */
  segundosValidos(valor: any): number {
    const n = Math.round(Number(valor));
    if (!n || isNaN(n)) { return this.SEGUNDOS_POR_DEFECTO; }
    return Math.min(120, Math.max(1, n));
  }

  /** Al salir del campo se deja ya corregido, para que se vea lo que se guarda. */
  ajustarSegundos(imagen: ImagenEditor): void {
    imagen.segundos = this.segundosValidos(imagen.segundos);
  }

  /** Abre el visor tal como lo verá el usuario, con la marca de agua. */
  verPrevia(): void {
    const listas = this.imagenes.filter(i => i.url || i.urlMedio);
    if (!listas.length) {
      this._toastr.info('Agregue al menos una imagen para ver la vista previa', 'Boletín');
      return;
    }

    const v = this.form.getRawValue();
    const boletin: any = {
      id: this.registro_selected?.id ?? 0,
      titulo: v.titulo || 'Boletín sin título',
      descripcion: v.descripcion,
      desde: v.desde,
      hasta: v.hasta,
      prioridad: v.prioridad,
      obligatorio: v.obligatorio,
      activo: v.activo,
      imagenes: listas.map((i, n) => ({
        id: i.id, tipo: i.tipo, titulo: i.titulo, descripcion: i.descripcion,
        segundos: i.segundos, orden: n, urlLocal: i.url ?? i.urlMedio,
      })),
    };

    const modalRef = this.modalService.open(VerBoletinesComponent, { size: 'xl', centered: true, backdrop: 'static', windowClass: 'bol-modal', backdropClass: 'bol-backdrop' });
    modalRef.componentInstance.boletines = [boletin];
    modalRef.componentInstance.vistaPrevia = true;
  }

  // ================================================================
  // DESTINATARIOS
  // ================================================================

  agregarUsuario(): void {
    if (this.isdisabled) { return; }
    const modalRef = this.modalService.open(ListUsersComponent, { size: 'lg', centered: true, backdrop: 'static' });
    modalRef.componentInstance.usuariosExcluidos = this.usuarios.map(u => u.user_id);
    modalRef.componentInstance.ayuda = 'Haz clic sobre el usuario que debe ver este boletín.';

    modalRef.componentInstance.seleccionado
      .pipe(takeUntil(this.hastaQueCierre(modalRef)))
      .subscribe((u: any) => {
        if (this.usuarios.some(x => x.user_id === u.id)) { return; }
        this.usuarios.push({
          user_id: u.id,
          login_user: u.login_user,
          name: u.name,
          surname: u.surname,
          isactive: u.isactive !== false,
        });
      });
  }

  quitarUsuario(u: BoletinUsuario): void {
    if (this.isdisabled) { return; }
    this.usuarios = this.usuarios.filter(x => x.user_id !== u.user_id);
  }

  agregarGrupo(): void {
    if (this.isdisabled) { return; }
    const modalRef = this.modalService.open(ListGruposComponent, { size: 'md', centered: true, backdrop: 'static' });
    modalRef.componentInstance.titulo = 'Agregar un grupo de destinatarios';
    modalRef.componentInstance.opcionSubgrupos = true;

    modalRef.componentInstance.seleccionado
      .pipe(takeUntil(this.hastaQueCierre(modalRef)))
      .subscribe((g: GrupoModel | null) => {
        if (!g) { return; }
        if (this.grupos.some(x => x.grupo_id === g.id)) {
          this._toastr.info(`El grupo «${g.nombre}» ya está`, 'Boletín');
          return;
        }
        this.grupos.push({
          grupo_id: g.id,
          nombre: g.nombre,
          incluir_subgrupos: modalRef.componentInstance.incluirSubgrupos !== false,
        });
      });
  }

  quitarGrupo(g: BoletinGrupo): void {
    if (this.isdisabled) { return; }
    this.grupos = this.grupos.filter(x => x.grupo_id !== g.grupo_id);
  }

  alternarSubgrupos(g: BoletinGrupo): void {
    if (this.isdisabled) { return; }
    g.incluir_subgrupos = !g.incluir_subgrupos;
  }

  /** Cuenta de destinatarios ya resueltos (sólo al editar). */
  get resumenDestinatarios(): string {
    if (this.esNuevo) { return 'Se calculará al guardar'; }
    if (this.cargandoDestinatarios) { return 'Calculando…'; }
    if (!this.destinatarios.length) { return 'Nadie lo verá todavía'; }
    const vistos = this.destinatarios.filter(d => d.visto_at).length;
    return `${this.destinatarios.length} usuario(s) · ${vistos} ya lo vieron`;
  }

  // ================================================================
  // GUARDAR
  // ================================================================

  async onSubmitForm(_ev: any): Promise<void> {
    this._toastr.clear();
    Object.values(this.form.controls).forEach(c => c.markAsTouched());

    if (this.form.invalid) {
      this.irAlProblema();
      this._toastr.error('Revise los campos del formulario.', 'No se puede Guardar', { timeOut: 20000, closeButton: true });
      return;
    }

    const v = this.form.getRawValue();
    if (v.hasta < v.desde) {
      this._toastr.error('La vigencia termina antes de empezar', 'No se puede Guardar');
      return;
    }
    if (this.imagenes.some(i => i.subiendo)) {
      this._toastr.info('Espere a que terminen de subir las imágenes', 'Boletín');
      return;
    }
    if (!this.imagenes.length) {
      this._toastr.warning('Un boletín sin imágenes no se mostrará a nadie', 'Boletín', { timeOut: 6000 });
    }
    if (!this.usuarios.length && !this.grupos.length) {
      this._toastr.error('Agregue al menos un usuario o un grupo que lo reciba', 'No se puede Guardar');
      return;
    }

    const datos = {
      titulo: v.titulo,
      descripcion: v.descripcion || null,
      desde: v.desde,
      hasta: v.hasta,
      prioridad: Number(v.prioridad) || 0,
      obligatorio: !!v.obligatorio,
      activo: !!v.activo,
      imagenes: this.imagenes.map((i, n) => ({
        id: i.id ?? null,
        archivo: i.archivo,
        titulo: i.titulo || null,
        descripcion: i.descripcion || null,
        segundos: this.segundosValidos(i.segundos),
        orden: n,
      })),
      usuarios: this.usuarios.map(u => u.user_id),
      grupos: this.grupos.map(g => ({ grupo_id: g.grupo_id, incluir_subgrupos: g.incluir_subgrupos })),
    };

    try {
      this._loadingService.setLoading(true);
      this.isdisabled = true;
      const res: any = this.esNuevo
        ? await firstValueFrom(this._boletinService.addBoletin(datos))
        : await firstValueFrom(this._boletinService.editBoletin(this.registro_selected.id, datos));

      if (res?.status !== 'success') { this.isdisabled = false; return; }

      this.registrosE.emit(res.data);
      this._toastr.success(res.message, 'Éxito', { closeButton: true });
      this.activeModal.close(res.data);
    } catch (e) {
      this.isdisabled = false;   // el interceptor ya avisó
    } finally {
      this._loadingService.setLoading(false);
    }
  }
}
