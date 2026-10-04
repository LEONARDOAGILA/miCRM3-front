import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';
import Swal from 'sweetalert2';

import { PanelModule } from '../../../../components/panel/panel.module';
import { AccesoModel } from '../../../seguridad/interfaces/accesoModel';
import { CatalogoGestionService } from '../../services/catalogoGestion.service';
import { TipoGestion, AsuntoGestion, iconoDelTipo } from '../../interfaces/catalogoGestion';

/**
 * Mantenimiento de los tipos de gestión y de sus asuntos.
 *
 * Desde que el asunto de una gestión se elige en vez de escribirse, esta
 * pantalla es la que decide qué se puede elegir. Va en dos columnas —tipos a la
 * izquierda, los asuntos del tipo elegido a la derecha— porque un asunto no
 * significa nada sin su tipo: «Cobranza» de LLAMADA y «Cobranza» de VISITA son
 * dos cosas distintas y conviene verlas juntas.
 *
 * Se edita en la propia fila, sin modales: son dos campos cortos y abrir una
 * ventana para escribir un nombre cansa cuando hay que dar de alta diez.
 *
 * Nada se borra si está en uso. El servidor lo desactiva y lo dice en el
 * mensaje: un asunto borrado dejaría gestiones del historial apuntando al
 * vacío, y los informes del mes pasado cambiarían solos.
 */
@Component({
  selector: 'app-catalogoGestion',
  standalone: true,
  imports: [CommonModule, FormsModule, PanelModule],
  templateUrl: './catalogoGestion.component.html',
  styleUrls: ['./catalogoGestion.component.css'],
})
export class CatalogoGestionComponent implements OnInit {

  public accesoModel: AccesoModel;

  public tipos: TipoGestion[] = [];
  public asuntos: AsuntoGestion[] = [];

  public tipoElegido: TipoGestion | null = null;
  public cargandoTipos = false;
  public cargandoAsuntos = false;
  public guardando = false;

  /** Lo que se está escribiendo en la fila nueva de cada lado. */
  public nuevoTipo: { codigo: string; nombre: string; icono: string } = { codigo: '', nombre: '', icono: '' };
  public nuevoAsunto = '';

  /** El id que está en edición en cada lista, o null. */
  public editandoTipo: number | null = null;
  public editandoAsunto: number | null = null;

  /** Copia de lo que se está editando, para poder cancelar sin tocar la lista. */
  public borrador: any = {};

  /** Los desactivados se ven, con el nombre tachado, salvo que se pidan ocultar. */
  public verInactivos = true;

  public readonly icono = iconoDelTipo;

  constructor(
    private route: Router,
    private activeRoute: ActivatedRoute,
    private _toastr: ToastrService,
    private _catalogoService: CatalogoGestionService,
  ) {
    this.accesoModel = this.activeRoute.snapshot.data['access'];
  }

  ngOnInit(): void {
    this.cargarTipos();
  }

  fun_home(): void { this.route.navigate(['/ventas']); }

  // ================================================================
  // CARGA
  // ================================================================

  async cargarTipos(elegirId: number | null = null): Promise<void> {
    try {
      this.cargandoTipos = true;
      const res: any = await firstValueFrom(this._catalogoService.allTipos(true));
      this.tipos = res?.status === 'success' ? (res.data ?? []) : [];

      // Se mantiene el tipo que estaba abierto; si se acaba de crear uno, ése
      const id = elegirId ?? this.tipoElegido?.id ?? this.tipos[0]?.id ?? null;
      const t = this.tipos.find(x => x.id === id) ?? this.tipos[0] ?? null;
      await this.elegirTipo(t);
    } catch (error) {
      // El AuthInterceptor ya muestra el toast del error HTTP
      console.error('Error al cargar los tipos de gestión:', error);
      this.tipos = [];
    } finally {
      this.cargandoTipos = false;
    }
  }

  async elegirTipo(t: TipoGestion | null): Promise<void> {
    this.tipoElegido = t;
    this.cancelarAsunto();
    this.nuevoAsunto = '';
    this.asuntos = [];
    if (!t) { return; }

    try {
      this.cargandoAsuntos = true;
      const res: any = await firstValueFrom(this._catalogoService.allAsuntos(t.id, true));
      this.asuntos = res?.status === 'success' ? (res.data ?? []) : [];
    } catch (error) {
      console.error('Error al cargar los asuntos:', error);
      this.asuntos = [];
    } finally {
      this.cargandoAsuntos = false;
    }
  }

  /** Lo que se ve en cada lista, según se pidan o no los desactivados. */
  get tiposVisibles(): TipoGestion[] {
    return this.verInactivos ? this.tipos : this.tipos.filter(t => t.activo !== false);
  }

  get asuntosVisibles(): AsuntoGestion[] {
    return this.verInactivos ? this.asuntos : this.asuntos.filter(a => a.activo !== false);
  }

  /** Cuántos asuntos tiene un tipo, que al listarlos viene como número. */
  cuantosAsuntos(t: TipoGestion): number {
    return typeof t.asuntos === 'number' ? t.asuntos : 0;
  }

  // ================================================================
  // TIPOS
  // ================================================================

  private puede(concedido: boolean | undefined, queHacer: string): boolean {
    if (concedido !== false) { return true; }
    this._toastr.info(`Tu perfil no permite ${queHacer}.`, 'Sin permiso');
    return false;
  }

  async crearTipo(): Promise<void> {
    if (!this.puede(this.accesoModel?.crear, 'crear tipos de gestión')) { return; }

    const codigo = (this.nuevoTipo.codigo ?? '').trim().toUpperCase();
    const nombre = (this.nuevoTipo.nombre ?? '').trim();
    if (codigo.length < 3 || nombre.length < 3) {
      this._toastr.warning('El código y el nombre necesitan al menos 3 caracteres', 'Falta información');
      return;
    }

    await this.guardarTipo(null, {
      codigo,
      nombre,
      icono: (this.nuevoTipo.icono ?? '').trim() || null,
      orden: (this.tipos.length + 1) * 10,
      activo: true,
    });
    this.nuevoTipo = { codigo: '', nombre: '', icono: '' };
  }

  editarTipo(t: TipoGestion): void {
    if (!this.puede(this.accesoModel?.editar, 'modificar tipos de gestión')) { return; }
    this.editandoTipo = t.id;
    this.borrador = { codigo: t.codigo, nombre: t.nombre, icono: t.icono ?? '', orden: t.orden, activo: t.activo };
  }

  cancelarTipo(): void { this.editandoTipo = null; this.borrador = {}; }

  async guardarTipoEditado(t: TipoGestion): Promise<void> {
    await this.guardarTipo(t.id, {
      codigo: (this.borrador.codigo ?? '').trim().toUpperCase(),
      nombre: (this.borrador.nombre ?? '').trim(),
      icono: (this.borrador.icono ?? '').trim() || null,
      orden: this.borrador.orden,
      activo: this.borrador.activo,
    });
    this.cancelarTipo();
  }

  /** Activar o desactivar sin entrar a editar: es el gesto más frecuente. */
  async alternarTipo(t: TipoGestion): Promise<void> {
    if (!this.puede(this.accesoModel?.editar, 'modificar tipos de gestión')) { return; }
    await this.guardarTipo(t.id, {
      codigo: t.codigo, nombre: t.nombre, icono: t.icono ?? null,
      orden: t.orden, activo: t.activo === false,
    });
  }

  private async guardarTipo(id: number | null, datos: any): Promise<void> {
    if (this.guardando) { return; }
    try {
      this.guardando = true;
      const res: any = await firstValueFrom(
        id ? this._catalogoService.editTipo(id, datos) : this._catalogoService.addTipo(datos));

      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo guardar el tipo', 'Error');
        return;
      }
      this._toastr.success(res.message, 'Catálogo', { closeButton: true });
      // El formulario de gestión tiene el catálogo guardado: que lo vuelva a pedir
      this._catalogoService.olvidar();
      await this.cargarTipos(res.data?.id ?? id);
    } catch (error) {
      console.error('Error al guardar el tipo:', error);
    } finally {
      this.guardando = false;
    }
  }

  async eliminarTipo(t: TipoGestion): Promise<void> {
    if (!this.puede(this.accesoModel?.eliminar, 'eliminar tipos de gestión')) { return; }

    const enUso = t.en_uso ?? 0;
    const r = await Swal.fire({
      title: enUso ? '¿Desactivar este tipo?' : '¿Eliminar este tipo?',
      text: enUso
        ? `«${t.nombre}» se usa en ${enUso} gestión(es), así que no se borra: deja de ofrecerse y el historial se conserva.`
        : `«${t.nombre}» no se usa en ninguna gestión, así que se borra junto con sus asuntos.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#6c757d',
      confirmButtonText: enUso ? 'Sí, desactivar' : 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
    });
    if (!r.isConfirmed) { return; }

    try {
      const res: any = await firstValueFrom(this._catalogoService.deleteTipo(t.id));
      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo eliminar el tipo', 'Error');
        return;
      }
      this._toastr.success(res.message, 'Catálogo', { closeButton: true, timeOut: 7000 });
      this._catalogoService.olvidar();
      if (this.tipoElegido?.id === t.id) { this.tipoElegido = null; }
      await this.cargarTipos();
    } catch (error) {
      console.error('Error al eliminar el tipo:', error);
    }
  }

  // ================================================================
  // ASUNTOS
  // ================================================================

  async crearAsunto(): Promise<void> {
    if (!this.puede(this.accesoModel?.crear, 'crear asuntos')) { return; }
    if (!this.tipoElegido) {
      this._toastr.warning('Elige primero un tipo', 'Catálogo');
      return;
    }

    const nombre = (this.nuevoAsunto ?? '').trim();
    if (nombre.length < 3) {
      this._toastr.warning('El asunto necesita al menos 3 caracteres', 'Falta información');
      return;
    }

    await this.guardarAsunto(null, {
      tipo_id: this.tipoElegido.id,
      nombre,
      orden: (this.asuntos.length + 1) * 10,
      activo: true,
    });
    this.nuevoAsunto = '';
  }

  editarAsunto(a: AsuntoGestion): void {
    if (!this.puede(this.accesoModel?.editar, 'modificar asuntos')) { return; }
    this.editandoAsunto = a.id;
    this.borrador = { nombre: a.nombre, orden: a.orden, activo: a.activo };
  }

  cancelarAsunto(): void { this.editandoAsunto = null; this.borrador = {}; }

  async guardarAsuntoEditado(a: AsuntoGestion): Promise<void> {
    await this.guardarAsunto(a.id, {
      tipo_id: this.tipoElegido?.id,
      nombre: (this.borrador.nombre ?? '').trim(),
      orden: this.borrador.orden,
      activo: this.borrador.activo,
    });
    this.cancelarAsunto();
  }

  async alternarAsunto(a: AsuntoGestion): Promise<void> {
    if (!this.puede(this.accesoModel?.editar, 'modificar asuntos')) { return; }
    await this.guardarAsunto(a.id, {
      tipo_id: this.tipoElegido?.id, nombre: a.nombre, orden: a.orden, activo: a.activo === false,
    });
  }

  private async guardarAsunto(id: number | null, datos: any): Promise<void> {
    if (this.guardando) { return; }
    try {
      this.guardando = true;
      const res: any = await firstValueFrom(
        id ? this._catalogoService.editAsunto(id, datos) : this._catalogoService.addAsunto(datos));

      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo guardar el asunto', 'Error');
        return;
      }
      this._toastr.success(res.message, 'Catálogo', { closeButton: true });
      this._catalogoService.olvidar();
      await this.elegirTipo(this.tipoElegido);
      // El contador de asuntos del tipo cambió
      await this.refrescarContadores();
    } catch (error) {
      console.error('Error al guardar el asunto:', error);
    } finally {
      this.guardando = false;
    }
  }

  async eliminarAsunto(a: AsuntoGestion): Promise<void> {
    if (!this.puede(this.accesoModel?.eliminar, 'eliminar asuntos')) { return; }

    const enUso = a.en_uso ?? 0;
    const r = await Swal.fire({
      title: enUso ? '¿Desactivar este asunto?' : '¿Eliminar este asunto?',
      text: enUso
        ? `«${a.nombre}» se usa en ${enUso} gestión(es), así que no se borra: deja de ofrecerse y los informes siguen cuadrando.`
        : `«${a.nombre}» no se usa en ninguna gestión.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#6c757d',
      confirmButtonText: enUso ? 'Sí, desactivar' : 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
    });
    if (!r.isConfirmed) { return; }

    try {
      const res: any = await firstValueFrom(this._catalogoService.deleteAsunto(a.id));
      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo eliminar el asunto', 'Error');
        return;
      }
      this._toastr.success(res.message, 'Catálogo', { closeButton: true, timeOut: 7000 });
      this._catalogoService.olvidar();
      await this.elegirTipo(this.tipoElegido);
      await this.refrescarContadores();
    } catch (error) {
      console.error('Error al eliminar el asunto:', error);
    }
  }

  /** Vuelve a pedir los tipos sólo por los contadores, sin mover la selección. */
  private async refrescarContadores(): Promise<void> {
    try {
      const res: any = await firstValueFrom(this._catalogoService.allTipos(true));
      if (res?.status === 'success') {
        this.tipos = res.data ?? [];
        const id = this.tipoElegido?.id;
        this.tipoElegido = this.tipos.find(x => x.id === id) ?? this.tipoElegido;
      }
    } catch { /* los contadores no valen un toast */ }
  }
}
