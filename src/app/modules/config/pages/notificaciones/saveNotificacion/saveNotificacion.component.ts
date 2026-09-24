import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NgbActiveModal, NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { Observable, Subject, firstValueFrom, from, merge, of } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';
import Swal from 'sweetalert2';

import { NotificacionService } from '../../../services/notificacion.service';
import { LoadingService } from '../../../../../service/loading.service';
import { GrupoModel } from '../../../../seguridad/interfaces/grupoModel';
import {
  DestinatarioNotificacion, ESTILOS_NOTIFICACION, NotificacionEnviar, NotificacionModel, TipoNotificacion,
} from '../../../interfaces/notificacionModel';
import { ListUsersComponent } from '../../../../seguridad/pages/users/listUsers/listUsers.component';
import { ListGruposComponent } from '../../../../seguridad/pages/grupos/listGrupos/listGrupos.component';

/** Usuario elegido a mano como destinatario. */
interface UsuarioElegido {
  user_id: number;
  login_user: string;
  name: string;
  surname: string;
  isactive: boolean;
}

/** Grupo elegido como destinatario. */
interface GrupoElegido {
  grupo_id: number;
  nombre: string;
  incluir_subgrupos: boolean;
}

/**
 * Enviar una notificación (o ver una ya enviada).
 *
 * Mismo esquema que el modal del boletín: cabecera y pie comunes, y tres
 * columnas — el mensaje, a quién va y cómo lo verá el usuario.
 *
 * Una notificación enviada NO se modifica: ya está en la campana de la gente.
 * Por eso sólo hay dos modos, «add» y «view», y desde el listado se puede
 * volver a enviar la misma (llega como plantilla y se envía de nuevo).
 */
@Component({
  selector: 'app-saveNotificacion',
  templateUrl: './saveNotificacion.component.html',
  styleUrls: ['./saveNotificacion.component.css'],
  standalone: false,
})
export class SaveNotificacionComponent implements OnInit, OnDestroy {

  @Input() registro_selected: any = {};
  @Input() accion: 'add' | 'view' = 'add';
  /** Al reenviar: una notificación anterior que sirve de punto de partida. */
  @Input() plantilla: NotificacionModel | null = null;
  @Output() registrosE: EventEmitter<any> = new EventEmitter();

  public titulo = '';
  public form!: FormGroup;
  public esView = false;
  public enviando = false;
  public isLoading$ = this._loadingService.isLoading$;

  /** Tipos: el color y el icono que tendrá en la campana. */
  public readonly tipos: { id: TipoNotificacion; nombre: string; icono: string; clase: string }[] =
    (Object.keys(ESTILOS_NOTIFICACION) as TipoNotificacion[])
      .map(id => ({ id, ...ESTILOS_NOTIFICACION[id] }));

  /** Destinatarios elegidos. */
  public usuarios: UsuarioElegido[] = [];
  public grupos: GrupoElegido[] = [];
  /** A todo el mundo: se resuelve en el servidor con los usuarios activos. */
  public todos = false;

  /** Al ver una ya enviada: quién la recibió (se pide al servidor). */
  public destinatarios: DestinatarioNotificacion[] = [];
  public cargandoDestinatarios = false;

  /** Caducidad rápida: lo que se usa casi siempre. */
  public readonly atajosCaducidad = [
    { texto: 'Sin caducidad', dias: 0 },
    { texto: '1 día', dias: 1 },
    { texto: '1 semana', dias: 7 },
    { texto: '1 mes', dias: 30 },
  ];

  private readonly destroy$ = new Subject<void>();

  constructor(
    public activeModal: NgbActiveModal,
    private modalService: NgbModal,
    private formBuilder: FormBuilder,
    private _toastr: ToastrService,
    private _loadingService: LoadingService,
    private _notificacionService: NotificacionService,
  ) {}

  ngOnInit(): void {
    this.esView = this.accion === 'view';
    this.titulo = this.esView ? 'Notificación enviada' : 'Enviar una notificación';

    this.armarFormulario();

    if (this.esView) {
      this.rellenarCon(this.registro_selected);
      this.form.disable();
      this.cargarDestinatarios();
    } else if (this.plantilla) {
      // Reenvío: los mismos textos, pero los destinatarios se vuelven a elegir
      this.rellenarCon(this.plantilla);
      this.titulo = 'Volver a enviar la notificación';
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** Para desuscribirse cuando el modal hijo se cierre, sin dejar nada colgando. */
  private hastaQueCierre(modalRef: NgbModalRef): Observable<unknown> {
    return merge(this.destroy$, from(modalRef.result).pipe(catchError(() => of(null))));
  }

  // ================================================================
  // FORMULARIO
  // ================================================================

  private armarFormulario(): void {
    this.form = this.formBuilder.group({
      titulo:    ['', [Validators.required, Validators.maxLength(200)]],
      mensaje:   ['', [Validators.maxLength(1000)]],
      tipo:      ['INFO' as TipoNotificacion, [Validators.required]],
      icono:     ['', [Validators.maxLength(60)]],
      url:       ['', [Validators.maxLength(300)]],
      url_texto: ['', [Validators.maxLength(60)]],
      caduca_at: [''],
      modulo:    ['', [Validators.maxLength(60)]],
    });
  }

  private rellenarCon(n: NotificacionModel): void {
    this.form.patchValue({
      titulo:    n?.titulo ?? '',
      mensaje:   n?.mensaje ?? '',
      tipo:      n?.tipo ?? 'INFO',
      icono:     n?.icono ?? '',
      url:       n?.url ?? '',
      url_texto: n?.url_texto ?? '',
      // El input datetime-local quiere «YYYY-MM-DDTHH:mm»
      caduca_at: n?.caduca_at ? String(n.caduca_at).replace(' ', 'T') : '',
      modulo:    n?.modulo ?? '',
    });
  }

  elegirTipo(t: TipoNotificacion): void {
    if (this.esView) { return; }
    this.form.controls['tipo'].setValue(t);
  }

  /** Atajo de caducidad: pone la fecha, o la quita si son 0 días. */
  caducarEn(dias: number): void {
    if (this.esView) { return; }
    if (!dias) { this.form.controls['caduca_at'].setValue(''); return; }
    const d = new Date();
    d.setDate(d.getDate() + dias);
    const p = (n: number) => String(n).padStart(2, '0');
    this.form.controls['caduca_at']
      .setValue(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`);
  }

  // ================================================================
  // DESTINATARIOS
  // ================================================================

  agregarUsuario(): void {
    if (this.esView) { return; }
    const modalRef = this.modalService.open(ListUsersComponent, { size: 'lg', centered: true, backdrop: 'static' });
    modalRef.componentInstance.usuariosExcluidos = this.usuarios.map(u => u.user_id);
    modalRef.componentInstance.ayuda = 'Haz clic sobre el usuario que debe recibir esta notificación.';

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

  quitarUsuario(u: UsuarioElegido): void {
    if (this.esView) { return; }
    this.usuarios = this.usuarios.filter(x => x.user_id !== u.user_id);
  }

  agregarGrupo(): void {
    if (this.esView) { return; }
    const modalRef = this.modalService.open(ListGruposComponent, { size: 'md', centered: true, backdrop: 'static' });
    modalRef.componentInstance.titulo = 'Agregar un grupo de destinatarios';
    modalRef.componentInstance.opcionSubgrupos = true;

    modalRef.componentInstance.seleccionado
      .pipe(takeUntil(this.hastaQueCierre(modalRef)))
      .subscribe((g: GrupoModel | null) => {
        if (!g) { return; }
        if (this.grupos.some(x => x.grupo_id === g.id)) {
          this._toastr.info(`El grupo «${g.nombre}» ya está`, 'Notificación');
          return;
        }
        this.grupos.push({
          grupo_id: g.id,
          nombre: g.nombre,
          incluir_subgrupos: modalRef.componentInstance.incluirSubgrupos !== false,
        });
      });
  }

  quitarGrupo(g: GrupoElegido): void {
    if (this.esView) { return; }
    this.grupos = this.grupos.filter(x => x.grupo_id !== g.grupo_id);
  }

  alternarSubgrupos(g: GrupoElegido): void {
    if (this.esView) { return; }
    g.incluir_subgrupos = !g.incluir_subgrupos;
  }

  alternarTodos(): void {
    if (this.esView) { return; }
    this.todos = !this.todos;
  }

  get hayDestinatarios(): boolean {
    return this.todos || this.usuarios.length > 0 || this.grupos.length > 0;
  }

  get resumenDestinatarios(): string {
    if (this.esView) {
      if (this.cargandoDestinatarios) { return 'Calculando…'; }
      const leidas = this.destinatarios.filter(d => d.leida_at).length;
      return `${this.destinatarios.length} usuario(s) · ${leidas} la han leído`;
    }
    if (this.todos) { return 'A todos los usuarios activos'; }
    if (!this.hayDestinatarios) { return 'Falta indicar a quién'; }
    return `${this.usuarios.length} usuario(s) y ${this.grupos.length} grupo(s)`;
  }

  private async cargarDestinatarios(): Promise<void> {
    if (!this.registro_selected?.id) { return; }
    try {
      this.cargandoDestinatarios = true;
      const res: any = await firstValueFrom(this._notificacionService.destinatarios(this.registro_selected.id));
      if (res?.status === 'success') { this.destinatarios = res.data ?? []; }
    } catch (e) {
      console.error('Error al traer los destinatarios:', e);
    } finally {
      this.cargandoDestinatarios = false;
    }
  }

  // ================================================================
  // VISTA PREVIA
  // ================================================================

  /** Cómo se verá en la campana: el mismo icono y el mismo color. */
  get estiloElegido() {
    const t = (this.form?.controls['tipo']?.value ?? 'INFO') as TipoNotificacion;
    return ESTILOS_NOTIFICACION[t] ?? ESTILOS_NOTIFICACION.INFO;
  }

  get iconoElegido(): string {
    return (this.form?.controls['icono']?.value || '').trim() || this.estiloElegido.icono;
  }

  // ================================================================
  // ENVIAR
  // ================================================================

  async onSubmitForm(_ev?: any): Promise<void> {
    if (this.esView) { return; }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this._toastr.warning('Revise los campos marcados', 'Notificación');
      return;
    }

    if (!this.hayDestinatarios) {
      this._toastr.warning('Indique a quién va la notificación', 'Notificación');
      return;
    }

    // A todo el mundo se pregunta: no se deshace y llega a la campana de todos
    if (this.todos) {
      const r = await Swal.fire({
        title: '¿Enviar a todos los usuarios?',
        html: `<p class="mb-0">La recibirán <b>todos los usuarios activos</b>. No se puede deshacer, sólo eliminarla después.</p>`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#00acac',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Sí, enviar',
        cancelButtonText: 'Cancelar',
        reverseButtons: true,
      });
      if (!r.isConfirmed) { return; }
    }

    const v = this.form.getRawValue();
    const datos: NotificacionEnviar = {
      titulo: (v.titulo ?? '').trim(),
      mensaje: (v.mensaje ?? '').trim() || null,
      tipo: v.tipo,
      icono: (v.icono ?? '').trim() || null,
      url: (v.url ?? '').trim() || null,
      url_texto: (v.url_texto ?? '').trim() || null,
      // Del input datetime-local sale «YYYY-MM-DDTHH:mm»
      caduca_at: v.caduca_at ? String(v.caduca_at).replace('T', ' ') : null,
      modulo: (v.modulo ?? '').trim() || null,
      usuarios: this.usuarios.map(u => u.user_id),
      grupos: this.grupos.map(g => ({ grupo_id: g.grupo_id, incluir_subgrupos: g.incluir_subgrupos })),
      todos: this.todos,
    };

    try {
      this.enviando = true;
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._notificacionService.enviarNotificacion(datos));

      if (res?.status !== 'success') {
        this._toastr.error(res?.message ?? 'No se pudo enviar la notificación', 'Notificaciones');
        return;
      }

      this._toastr.success(res.message, 'Notificaciones', { closeButton: true });
      this.registrosE.emit(res.data);
      this.activeModal.close(res.data);
    } catch (e: any) {
      console.error('Error al enviar la notificación:', e);
      this._toastr.error(e?.error?.message ?? 'No se pudo enviar la notificación', 'Notificaciones');
    } finally {
      this.enviando = false;
      this._loadingService.setLoading(false);
    }
  }
}
