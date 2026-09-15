import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { Subject, firstValueFrom } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, takeUntil } from 'rxjs/operators';
import Swal from 'sweetalert2';

import { ArchivoService } from '../../../services/archivo.service';
import { ModalHeaderComponent } from '../../../../../components/modal/modal-header/modal-header.component';

/** Banderas que se conceden; mismo orden que en el back (PermisoArchivo::BANDERAS). */
export const BANDERAS_PERMISO = [
  { id: 'ver',         etiqueta: 'Ver',        icono: 'fa-eye',            ayuda: 'Lo ve en su árbol y su lista' },
  { id: 'ejecutar',    etiqueta: 'Abrir',      icono: 'fa-play',           ayuda: 'Lo abre en el visor' },
  { id: 'descargar',   etiqueta: 'Descargar',  icono: 'fa-download',       ayuda: 'Puede descargarlo o abrirlo en otra pestaña (si la URL no está protegida)' },
  { id: 'crear',       etiqueta: 'Crear',      icono: 'fa-folder-plus',    ayuda: 'Puede crear dentro (sólo carpetas)' },
  { id: 'editar',      etiqueta: 'Editar',     icono: 'fa-pen-to-square',  ayuda: 'Puede modificarlo' },
  { id: 'eliminar',    etiqueta: 'Eliminar',   icono: 'fa-trash',          ayuda: 'Puede enviarlo a la papelera' },
  { id: 'administrar', etiqueta: 'Administrar', icono: 'fa-user-shield',   ayuda: 'Puede dar permisos a otros sobre este elemento' },
  { id: 'restaurar',   etiqueta: 'Restaurar',  icono: 'fa-trash-arrow-up', ayuda: 'Puede ver la papelera y restaurar lo que se eliminó de aquí (borrar definitivamente sigue siendo de administrador)' },
] as const;

export type BanderaPermiso = typeof BANDERAS_PERMISO[number]['id'];

/** Fila de la tabla: permiso de un usuario (directo o heredado). */
export interface FilaPermiso {
  user_id: number;
  login_user: string;
  name: string;
  surname: string;
  type_user: number;
  isactive: boolean;
  ver: boolean; ejecutar: boolean; descargar: boolean; crear: boolean;
  editar: boolean; eliminar: boolean; administrar: boolean; restaurar: boolean;
  hereda: boolean;
  denegar: boolean;
  vigente_hasta: string | null;
  caducado: boolean;
  origen: 'DIRECTO' | 'HEREDADO';
  desde: { id: number; nombre: string } | null;
  /** true mientras se guarda esta fila. */
  guardando?: boolean;
  /** Fila nueva aún no guardada. */
  nueva?: boolean;
  /** Copia para saber si cambió algo. */
  _original?: string;
}

interface UsuarioSelector {
  id: number; login_user: string; name: string; surname: string; type_user: number; avatar?: string;
}

interface Acceso {
  id: number; accion: 'EJECUTAR' | 'DESCARGAR'; usuario_login: string; name?: string; surname?: string;
  ip_address?: string; fecha: string;
}

/**
 * Modal "Permisos" de un archivo o carpeta: la pestaña Seguridad de Windows.
 *
 * Arriba, qué elemento es, su propietario y el interruptor "Público".
 * Debajo, la tabla usuario × banderas:
 *   - filas DIRECTAS (de este nodo): editables, se guardan fila a fila
 *   - filas HEREDADAS (de una carpeta de arriba con `hereda`): en gris, con
 *     "desde: carpeta"; el botón "Ajustar aquí" las copia como fila directa
 *     para sobrescribirlas en este nodo
 * Buscador de usuarios para añadir filas. Pestaña "Accesos": quién lo abrió
 * o descargó. El back es quien manda: aquí sólo se pinta lo que devuelve y
 * se oculta lo que el que consulta no puede tocar (puedeAdministrar).
 */
@Component({
  selector: 'app-permisos-archivo',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalHeaderComponent],
  templateUrl: './permisosArchivo.component.html',
  styleUrls: ['./permisosArchivo.component.css'],
})
export class PermisosArchivoComponent implements OnInit, OnDestroy {

  /** Nodo (id y nombre bastan; el resto se pide al back). */
  @Input() elemento!: { id: number; nombre: string; escarpeta: boolean; icono?: string; color?: string };
  /** Algo cambió (público o filas): el administrador puede refrescar. */
  @Output() cambio = new EventEmitter<void>();

  readonly banderas = BANDERAS_PERMISO;

  cargando = false;
  puedeAdministrar = false;
  archivo: { id: number; nombre: string; escarpeta: boolean; publico: boolean; padre: number | null;
             propietario: { id: number; login_user: string; name: string; surname: string } | null } | null = null;
  directos: FilaPermiso[] = [];
  heredados: FilaPermiso[] = [];
  guardandoPublico = false;

  pestana: 'permisos' | 'accesos' = 'permisos';
  accesos: Acceso[] = [];
  accesosCargados = false;

  // Buscador de usuarios
  busqueda = '';
  sugerencias: UsuarioSelector[] = [];
  buscando = false;
  private readonly busqueda$ = new Subject<string>();
  private readonly destroy$ = new Subject<void>();

  constructor(
    public modal: NgbActiveModal,
    private _archivoService: ArchivoService,
    private _toastr: ToastrService
  ) {}

  ngOnInit(): void {
    this.cargar();
    // Buscador con debounce: una petición por pausa de escritura, no por tecla
    this.busqueda$.pipe(
      debounceTime(250),
      distinctUntilChanged(),
      switchMap(q => this._archivoService.usuariosParaPermisos(q)),
      takeUntil(this.destroy$)
    ).subscribe({
      next: res => {
        this.buscando = false;
        const yaEstan = new Set([...this.directos, ...this.heredados].map(f => f.user_id));
        this.sugerencias = (res?.status === 'success' ? res.data : []).filter((u: UsuarioSelector) => !yaEstan.has(u.id));
      },
      error: () => { this.buscando = false; this.sugerencias = []; }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ---------- Carga ----------

  async cargar(): Promise<void> {
    this.cargando = true;
    try {
      const res = await firstValueFrom(this._archivoService.permisosArchivo(this.elemento.id));
      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudieron cargar los permisos', 'Permisos');
        return;
      }
      this.archivo = res.data.archivo;
      this.puedeAdministrar = !!res.data.puedeAdministrar;
      this.directos = (res.data.directos ?? []).map((f: FilaPermiso) => this.conOriginal(f));
      this.heredados = res.data.heredados ?? [];
    } catch (e) {
      console.error('Error al cargar permisos:', e);
    } finally {
      this.cargando = false;
    }
  }

  private conOriginal(f: FilaPermiso): FilaPermiso {
    f._original = this.firma(f);
    return f;
  }

  /** Lo que se compara para saber si una fila cambió. */
  private firma(f: FilaPermiso): string {
    return JSON.stringify([
      ...this.banderas.map(b => !!f[b.id]), !!f.hereda, !!f.denegar, f.vigente_hasta ?? null,
    ]);
  }

  cambiada(f: FilaPermiso): boolean {
    return !!f.nueva || this.firma(f) !== f._original;
  }

  get hayCambios(): boolean {
    return this.directos.some(f => this.cambiada(f));
  }

  // ---------- Público ----------

  async cambiarPublico(valor: boolean): Promise<void> {
    if (!this.archivo || this.guardandoPublico) { return; }
    this.guardandoPublico = true;
    const anterior = this.archivo.publico;
    this.archivo.publico = valor;
    try {
      const res = await firstValueFrom(this._archivoService.editArchivo(this.archivo.id, { nombre: this.archivo.nombre, publico: valor })) as any;
      if (res?.status !== 'success') { throw new Error(res?.message); }
      this._toastr.success(valor ? 'Ahora lo ven todos los usuarios' : 'Ya no es público', 'Permisos');
      this.cambio.emit();
    } catch (e) {
      this.archivo.publico = anterior;
      console.error('Error al cambiar público:', e);
    } finally {
      this.guardandoPublico = false;
    }
  }

  // ---------- Buscador / añadir usuario ----------

  onBuscar(texto: string): void {
    this.busqueda = texto;
    if (!texto.trim()) { this.sugerencias = []; return; }
    this.buscando = true;
    this.busqueda$.next(texto.trim());
  }

  /** Añade una fila nueva (aún no guardada) con "Ver + Abrir", como el default de la tabla. */
  agregarUsuario(u: UsuarioSelector): void {
    this.sugerencias = [];
    this.busqueda = '';
    const fila: FilaPermiso = {
      user_id: u.id, login_user: u.login_user, name: u.name, surname: u.surname, type_user: u.type_user, isactive: true,
      ver: true, ejecutar: true, descargar: false, crear: false, editar: false, eliminar: false, administrar: false, restaurar: false,
      hereda: true, denegar: false, vigente_hasta: null, caducado: false,
      origen: 'DIRECTO', desde: null, nueva: true,
    };
    this.directos = [fila, ...this.directos];
  }

  /** Una fila heredada se "baja" a este nodo para ajustarla aquí. */
  ajustarAqui(h: FilaPermiso): void {
    const fila: FilaPermiso = { ...h, origen: 'DIRECTO', desde: null, nueva: true };
    this.heredados = this.heredados.filter(x => x.user_id !== h.user_id);
    this.directos = [fila, ...this.directos];
  }

  // ---------- Edición de una fila ----------

  alternar(f: FilaPermiso, b: BanderaPermiso): void {
    if (!this.puedeAdministrar || f.denegar) { return; }
    f[b] = !f[b];
    // Cualquier permiso implica verlo; y quitar "ver" quita todo
    if (b !== 'ver' && f[b]) { f.ver = true; }
    if (b === 'ver' && !f.ver) { this.banderas.forEach(x => f[x.id] = false); }
  }

  alternarDenegar(f: FilaPermiso): void {
    if (!this.puedeAdministrar) { return; }
    f.denegar = !f.denegar;
    if (f.denegar) { this.banderas.forEach(x => f[x.id] = false); }
    else { f.ver = true; f.ejecutar = true; }
  }

  /** Marca "todo" o "nada" de golpe. */
  todo(f: FilaPermiso, valor: boolean): void {
    if (!this.puedeAdministrar || f.denegar) { return; }
    this.banderas.forEach(x => f[x.id] = valor);
  }

  async guardar(f: FilaPermiso): Promise<void> {
    if (!this.puedeAdministrar || f.guardando) { return; }
    f.guardando = true;
    try {
      const datos: any = { user_id: f.user_id, hereda: f.hereda, denegar: f.denegar, vigente_hasta: f.vigente_hasta || null };
      this.banderas.forEach(b => datos[b.id] = !!f[b.id]);
      const res = await firstValueFrom(this._archivoService.guardarPermisoArchivo(this.elemento.id, datos));
      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo guardar', 'Permisos');
        return;
      }
      f.nueva = false;
      f.caducado = !!f.vigente_hasta && new Date(f.vigente_hasta) < new Date(new Date().toDateString());
      f._original = this.firma(f);
      this._toastr.success(`Permisos de ${f.name} ${f.surname} guardados`, 'Permisos', { timeOut: 2500 });
      this.cambio.emit();
    } catch (e) {
      console.error('Error al guardar permiso:', e);
    } finally {
      f.guardando = false;
    }
  }

  /** Guarda todas las filas con cambios, una a una. */
  async guardarTodo(): Promise<void> {
    for (const f of this.directos.filter(x => this.cambiada(x))) {
      await this.guardar(f);
    }
  }

  async quitar(f: FilaPermiso): Promise<void> {
    if (!this.puedeAdministrar) { return; }
    if (f.nueva) {
      this.directos = this.directos.filter(x => x !== f);
      return;
    }
    const { isConfirmed } = await Swal.fire({
      title: `¿Quitar el permiso de ${f.name} ${f.surname}?`,
      text: this.archivo?.escarpeta && f.hereda
        ? 'Dejará de verlo, y también todo lo que hay dentro (salvo que tenga otro permiso más abajo).'
        : 'Dejará de ver este elemento (salvo que lo herede de una carpeta de arriba o sea público).',
      icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí, quitar', cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc3545', reverseButtons: true,
    });
    if (!isConfirmed) { return; }
    try {
      const res = await firstValueFrom(this._archivoService.quitarPermisoArchivo(this.elemento.id, f.user_id));
      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo quitar', 'Permisos');
        return;
      }
      this._toastr.success(res.message, 'Permisos', { timeOut: 2500 });
      await this.cargar();   // puede reaparecer como heredado
      this.cambio.emit();
    } catch (e) {
      console.error('Error al quitar permiso:', e);
    }
  }

  // ---------- Accesos ----------

  async verAccesos(): Promise<void> {
    this.pestana = 'accesos';
    if (this.accesosCargados) { return; }
    try {
      const res = await firstValueFrom(this._archivoService.accesosArchivo(this.elemento.id));
      this.accesos = res?.status === 'success' ? res.data : [];
      this.accesosCargados = true;
    } catch (e) {
      console.error('Error al cargar accesos:', e);
    }
  }

  // ---------- Utilidades de plantilla ----------

  nombreCompleto(f: { name?: string; surname?: string; login_user?: string }): string {
    const n = `${f.name ?? ''} ${f.surname ?? ''}`.trim();
    return n || f.login_user || '';
  }

  iniciales(f: { name?: string; surname?: string; login_user?: string }): string {
    const a = (f.name ?? '').trim().charAt(0), b = (f.surname ?? '').trim().charAt(0);
    return ((a + b) || (f.login_user ?? '?').slice(0, 2)).toUpperCase();
  }

  readonly tiposUsuario: { [k: number]: string } = { 1: 'Super usuario', 2: 'Administrador', 3: 'Usuario sistema', 4: 'Usuario web' };

  /** Los admin (tipo 1 y 2) ya lo ven todo: no tiene sentido darles filas. */
  esAdmin(f: { type_user?: number }): boolean {
    return f.type_user === 1 || f.type_user === 2;
  }

  get hoy(): string { return new Date().toISOString().slice(0, 10); }

  cerrar(): void {
    if (this.hayCambios) {
      Swal.fire({
        title: 'Hay cambios sin guardar', text: '¿Salir y perderlos?', icon: 'warning',
        showCancelButton: true, confirmButtonText: 'Salir sin guardar', cancelButtonText: 'Seguir editando', reverseButtons: true,
      }).then(r => { if (r.isConfirmed) { this.modal.dismiss('Close click'); } });
      return;
    }
    this.modal.dismiss('Close click');
  }
}
