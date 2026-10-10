import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom, from, merge, of, Subject } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';

import { GestionService } from '../../../services/gestion.service';
import { NotaClienteService } from '../../../services/notaCliente.service';
import { CatalogoGestionService } from '../../../services/catalogoGestion.service';
import { AlmacenDeImagenes } from '../../../interfaces/pegarEnEditor';
import { TipoGestion, AsuntoGestion, asuntosDe } from '../../../interfaces/catalogoGestion';
import { soloTexto } from '../../../interfaces/plantillasWhatsapp';
import { LoadingService } from '../../../../../service/loading.service';
// El mismo selector de usuarios con su árbol de grupos que usan «Reasignar
// cliente» y la ficha de la gestión
import { ListUsuariosGruposComponent } from '../../../../seguridad/pages/grupos/listUsuariosGrupos/listUsuariosGrupos.component';
import { nombreDeUsuario } from '../../../../seguridad/services/user.service';
import { SeguridadService } from '../../../../seguridad/services/seguridad.service';
import {
  GestionModel, PRIORIDADES_GESTION, RESULTADOS_GESTION, nombreDe,
} from '../../../interfaces/gestionModel';

/**
 * Cerrar una gestión programada: se marca realizada con su resultado y, en la
 * misma pantalla, se puede dejar agendado el seguimiento.
 *
 * Es el paso que mantiene viva la cartera: casi ninguna llamada termina en sí
 * misma, y obligar a abrir otro formulario para agendar la siguiente hace que
 * no se agende nunca. Por eso «Volver a llamar» marca el seguimiento solo.
 *
 * Va en dos columnas y con los mismos campos que «Registrar gestión», porque
 * es la otra mitad de lo mismo: lo que se escribe aquí acaba en la misma
 * gestión y lo que se agenda es una gestión como cualquier otra. Lo que antes
 * se quedaba corto: la nota era un editor pelado sin cinta ni pegar imágenes,
 * el asunto del seguimiento se teclaba a mano —y así no se puede agrupar— y su
 * responsable se heredaba a la fuerza.
 */
@Component({
  selector: 'app-cerrarGestion',
  templateUrl: './cerrarGestion.component.html',
  styleUrls: ['./cerrarGestion.component.css'],
  standalone: false,
})
export class CerrarGestionComponent implements OnInit, OnDestroy {

  @Input() gestion: GestionModel | null = null;

  @Output() cerrada = new EventEmitter<any>();

  public form!: FormGroup;
  public isLoading$ = this._loadingService.isLoading$;
  public guardando = false;

  public prioridades = PRIORIDADES_GESTION;
  public resultados = RESULTADOS_GESTION;

  // ---------- El catálogo (igual que al registrar) ----------
  /** Tipos del catálogo (ventas.gestiones_tipos), no una lista escrita aquí. */
  public tipos: TipoGestion[] = [];
  /**
   * Los asuntos del tipo elegido para el seguimiento.
   *
   * Getter y no una copia guardada, igual que en la ficha de la gestión: la
   * lista cuelga del tipo, y una copia es una cosa más que mantener al día.
   */
  get asuntos(): AsuntoGestion[] {
    const codigo = this.form?.get('sig_tipo')?.value;
    return asuntosDe(this.tipos.find(t => t.codigo === codigo));
  }

  public cargandoCatalogo = true;

  /** El tipo elegido no tiene asuntos: hay que avisarlo, no fallar al guardar. */
  public get sinAsuntos(): boolean {
    return !this.cargandoCatalogo && this.quiereSeguimiento && this.asuntos.length === 0;
  }

  // ---------- Pegar imágenes en la nota ----------
  // Lo mismo que en la ficha de la gestión: una captura pegada en «Qué se
  // habló» se sube y se queda como archivo del cliente, en vez de engordar la
  // nota con un data URI de dos megas.
  public almacenDeImagenes: AlmacenDeImagenes = {
    subir: async (f: File) => {
      try {
        const res: any = await firstValueFrom(this._notaService.subirImagen(this.clienteId!, f));
        return res?.status === 'success' ? this._notaService.urlDeImagen(res.data.url) : null;
      } catch { return null; }
    },
    traerDeFuera: async (u: string) => {
      try {
        const res: any = await firstValueFrom(this._notaService.traerImagen(this.clienteId!, u));
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

  /** De qué cliente es la gestión que se cierra (para subir las imágenes). */
  private get clienteId(): number | null {
    return this.gestion?.cliente_id ?? null;
  }

  // ---------- El responsable del seguimiento ----------
  /**
   * A quién se le puede dejar el seguimiento: su equipo, los responsables del
   * cliente y él mismo. Lo decide el servidor, que es el que también lo valida
   * al guardar.
   */
  public asignables: any[] = [];
  public responsableNombreControl = new FormControl({ value: '', disabled: true });
  private yo: number | null = null;

  private destruir$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    public modal: NgbActiveModal,
    private modalService: NgbModal,
    private _toastr: ToastrService,
    private _loadingService: LoadingService,
    private _gestionService: GestionService,
    private _notaService: NotaClienteService,
    private _catalogoService: CatalogoGestionService,
    private _seguridadService: SeguridadService,
  ) {}

  get ctrlNota(): FormControl { return this.form.controls['nota'] as FormControl; }
  get ctrlProgramar(): FormControl { return this.form.controls['programar'] as FormControl; }
  get quiereSeguimiento(): boolean { return this.form?.get('programar')?.value === true; }
  get textoResultado(): string { return nombreDe(this.resultados, this.form?.get('resultado')?.value); }

  ngOnInit(): void {
    this.form = this.fb.group({
      resultado:        ['CONTACTADO', [Validators.required]],
      duracion_minutos: [this.gestion?.duracion_minutos ?? null, [Validators.min(0), Validators.max(1440)]],
      nota:             [this.gestion?.nota ?? '', [Validators.maxLength(100000)]],

      // El seguimiento
      programar:        [false],
      sig_fecha:        [this.enUnosDias(2)],
      sig_tipo:         [this.gestion?.tipo ?? 'LLAMADA'],
      // Del catálogo, como al registrar; el texto se sigue mandando para que
      // el historial viejo no se quede sin asunto
      sig_asunto_id:    [this.gestion?.asunto_id ?? null],
      sig_asunto:       [`Seguimiento: ${this.gestion?.asunto ?? ''}`.substring(0, 200)],
      sig_prioridad:    [this.gestion?.prioridad ?? 'MEDIA'],
      sig_nota:         [''],
      // A quién le toca; arranca en el responsable de la gestión que se cierra
      sig_usuario_id:   [this.gestion?.usuario_id ?? null],
    });

    // Los resultados que piden continuar dejan marcado el seguimiento
    this.form.get('resultado')?.valueChanges.subscribe((r: string) => {
      if (['VOLVER_A_LLAMAR', 'NO_CONTESTA', 'BUZON', 'COTIZACION'].includes(r)) {
        this.form.get('programar')?.setValue(true);
      }
    });

    this.cargarCatalogo();
    this.cargarAsignables();
  }

  ngOnDestroy(): void {
    this.destruir$.next();
    this.destruir$.complete();
  }

  // ================================================================
  // EL CATÁLOGO
  // ================================================================

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
    // para que el combo no aparezca vacío
    const codigo = this.form?.get('sig_tipo')?.value;
    if (codigo && !this.tipos.some(t => t.codigo === codigo)) {
      this.tipos = [...this.tipos, { id: 0, codigo, nombre: codigo, icono: null, asuntos: [] }];
    }

    this.ajustarAsunto();
    this.form?.get('sig_tipo')?.valueChanges.subscribe(() => this.ajustarAsunto(true));
  }

  /**
   * Los asuntos son los del tipo elegido.
   *
   * Al cambiar de tipo el asunto heredado deja de valer —es de otra lista—,
   * así que se suelta. Es la misma regla que aplica la función de base al
   * crear el seguimiento.
   */
  private ajustarAsunto(cambioElTipo = false): void {
    const lista = this.asuntos;
    const ctrl = this.form?.get('sig_asunto_id');
    const elegido = ctrl?.value;

    if (cambioElTipo || (elegido && !lista.some(a => a.id === Number(elegido)))) {
      // Con un solo asunto no hay nada que elegir: se pone
      ctrl?.setValue(lista.length === 1 ? lista[0].id : null, { emitEvent: false });
    }
  }

  // ================================================================
  // EL RESPONSABLE DEL SEGUIMIENTO
  // ================================================================

  private async cargarAsignables(): Promise<void> {
    try {
      const res: any = await firstValueFrom(this._gestionService.asignables(this.clienteId));
      this.asignables = res?.data ?? [];
      this.yo = this.asignables.find((u: any) => u.es_yo)?.id
             ?? Number(this._seguridadService.getUserLogin()?.id) ?? null;
    } catch (error: any) {
      console.error('No se pudo leer a quién se le puede asignar', error);
      this.asignables = [];
    }
    this.ponerNombreDelResponsable();
  }

  public get idsAsignables(): number[] {
    return this.asignables.map((u: any) => Number(u.id));
  }

  private rotulo(u: any): string {
    if (!u) { return ''; }
    if (u.es_yo) { return `${u.nombre} (yo)`; }
    if (u.rol_cliente) { return `${u.nombre} (${String(u.rol_cliente).toLowerCase()} del cliente)`; }
    return u.nombre;
  }

  /**
   * El nombre de quien está elegido, al lado de su id.
   *
   * Si el responsable que hereda la gestión no está en la lista —se lo asignó
   * un administrador— se enseña el que trae la gestión: el campo no puede
   * quedarse en blanco enseñando un número suelto.
   */
  private ponerNombreDelResponsable(): void {
    const id = this.form?.get('sig_usuario_id')?.value;
    if (!id) { this.responsableNombreControl.setValue(''); return; }

    const u = this.asignables.find((x: any) => Number(x.id) === Number(id));
    if (u) { this.responsableNombreControl.setValue(this.rotulo(u)); return; }

    this.responsableNombreControl.setValue(this.gestion?.responsable_nombre ?? 'Usuario ' + id);
  }

  /** Escribir el ID y salir del campo también resuelve el responsable. */
  public async cargarResponsablePorId(): Promise<void> {
    const id = Number(this.form.get('sig_usuario_id')?.value ?? 0);
    if (!id) { this.responsableNombreControl.setValue(''); return; }

    const u = this.asignables.find((x: any) => Number(x.id) === id);
    if (u) { this.responsableNombreControl.setValue(this.rotulo(u)); return; }

    this.form.patchValue({ sig_usuario_id: null }, { emitEvent: false });
    this.responsableNombreControl.setValue('');
    this._toastr.warning(
      'Ese usuario no está entre los que puede elegir: su equipo o un responsable del cliente.',
      'Responsable', { timeOut: 7000, closeButton: true });
  }

  /** El selector de siempre: usuarios con su árbol de grupos. */
  public async abrirSelectorResponsable(): Promise<void> {
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
    modalRef.componentInstance.usuarioSeleccionadoId = this.form.get('sig_usuario_id')?.value || undefined;
    modalRef.componentInstance.usuariosPermitidos = this.idsAsignables;
    modalRef.componentInstance.ayuda =
      'Haz clic sobre quien se hará cargo del seguimiento. Sólo puedes elegir a alguien de tu equipo o a un responsable del cliente.';

    modalRef.componentInstance.seleccionado
      .pipe(takeUntil(merge(this.destruir$, from(modalRef.result).pipe(catchError(() => of(null))))))
      .subscribe((usuario: any) => {
        this.form.patchValue({ sig_usuario_id: usuario.id });
        const u = this.asignables.find((x: any) => Number(x.id) === Number(usuario.id));
        this.responsableNombreControl.setValue(u ? this.rotulo(u) : nombreDeUsuario(usuario));
      });
  }

  /** El aviso de debajo: el seguimiento no queda para uno mismo. */
  public get avisoResponsable(): string {
    const elegido = this.form?.get('sig_usuario_id')?.value;
    if (!elegido || !this.yo || Number(elegido) === Number(this.yo)) { return ''; }

    const quien = this.responsableNombreControl.value || 'otro usuario';
    return `El seguimiento entrará en la agenda de ${quien}, no en la suya.`;
  }

  // ================================================================
  // FECHAS
  // ================================================================

  private aTexto(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  private enUnosDias(dias: number): string {
    const d = new Date();
    d.setDate(d.getDate() + dias);
    d.setHours(9, 0, 0, 0);
    return this.aTexto(d);
  }

  // ================================================================
  // GUARDAR
  // ================================================================

  public async onSubmitForm($ev?: any): Promise<void> {
    $ev?.preventDefault?.();
    this._toastr.clear();
    this.form.markAllAsTouched();

    if (!this.gestion?.id) { return; }
    if (this.form.invalid) {
      this._toastr.error('Revise los campos del formulario.', 'No se puede cerrar', { timeOut: 8000, closeButton: true });
      return;
    }
    const v = this.form.getRawValue();
    if (v.programar && !v.sig_fecha) {
      this._toastr.error('El seguimiento necesita fecha y hora.', 'No se puede cerrar', { timeOut: 8000, closeButton: true });
      return;
    }
    if (v.programar && !v.sig_asunto_id) {
      this._toastr.error('Elija el asunto del seguimiento.', 'No se puede cerrar', { timeOut: 8000, closeButton: true });
      return;
    }

    const payload: any = {
      resultado: v.resultado,
      // «<p></p>» es el editor vacio, no una nota
      nota: soloTexto(v.nota) ? (v.nota ?? '').trim() : null,
      duracion_minutos: v.duracion_minutos === '' || v.duracion_minutos === null ? null : Number(v.duracion_minutos),
    };
    if (v.programar) {
      payload.siguiente = {
        fecha: v.sig_fecha,
        asunto: (v.sig_asunto ?? '').trim() || null,
        asunto_id: v.sig_asunto_id ? Number(v.sig_asunto_id) : null,
        tipo: v.sig_tipo,
        prioridad: v.sig_prioridad,
        nota: (v.sig_nota ?? '').trim() || null,
        usuario_id: v.sig_usuario_id ? Number(v.sig_usuario_id) : null,
      };
    }

    try {
      this.guardando = true;
      this._loadingService.setLoading(true);

      const res: any = await firstValueFrom(this._gestionService.cerrarGestion(this.gestion.id, payload));
      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo cerrar la gestión', 'Error');
        return;
      }

      this.cerrada.emit(res.data);
      this._toastr.success(res.message, 'Éxito', { closeButton: true });
      this.modal.close(res.data);
    } catch (error) {
      // El AuthInterceptor ya muestra el toast del error HTTP
      console.error('Error al cerrar la gestión:', error);
    } finally {
      this.guardando = false;
      this._loadingService.setLoading(false);
    }
  }
}
