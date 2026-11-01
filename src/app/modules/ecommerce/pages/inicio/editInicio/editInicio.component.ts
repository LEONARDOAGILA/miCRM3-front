import { Component, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';
import {
  CdkDrag, CdkDragDrop, CdkDragHandle, CdkDragPlaceholder, CdkDropList, moveItemInArray,
} from '@angular/cdk/drag-drop';

import { SeguridadService } from '../../../../seguridad/services/seguridad.service';
import { AccesoModel } from '../../../../seguridad/interfaces/accesoModel';
import { InicioService } from '../../../services/inicio.service';
import {
  SeccionInicioModel, VistaSeccion, ESTADOS_SECCION, VISTA_SECCIONES, VISTA_POR_DEFECTO,
} from '../../../interfaces/inicioModel';

import { PanelComponent } from '../../../../../components/panel/panel.component';
import { CampoTextoComponent } from '../../../../../components/campos/campoTexto/campoTexto.component';
import { GaleriaImagenesComponent } from '../../galerias/galeriaImagenes/galeriaImagenes.component';

/**
 * LA PORTADA DE LA TIENDA.
 *
 * La portada no es una página con un formulario: es una LISTA DE SECCIONES en
 * el orden en que se ven. Por eso la pantalla es esa misma lista y se arrastra
 * para moverlas, en vez de un campo «orden» por sección, que obliga a
 * imaginarse el resultado.
 *
 * AQUÍ NO SE CREAN NI SE BORRAN SECCIONES: cada una existe porque la tienda
 * sabe pintarla. Lo que se administra es cuáles se ven, en qué orden, qué se
 * lee encima y entre qué fechas.
 *
 * CADA SECCIÓN DICE DE DÓNDE COME, y hoy sólo los dos banners tienen fuente
 * —sus galerías—. Las demás esperan a que se traslade la suya, y la pantalla
 * lo dice con todas las letras en vez de enseñar campos que no hacen nada. La
 * tienda, por su parte, ya se salta la sección que no tenga qué enseñar: una
 * encendida y vacía no deja un hueco con su título y nada debajo.
 *
 * EL INTERRUPTOR GUARDA SOLO y el orden también, porque cada uno es una sola
 * decisión. El rótulo y las fechas llevan botón: son varios campos a la vez y
 * guardar a cada tecla sería guardar lo que se está escribiendo a medias.
 */
@Component({
  selector: 'app-editInicio',
  templateUrl: './editInicio.component.html',
  styleUrls: ['./editInicio.component.css'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    CommonModule, RouterLink, ReactiveFormsModule,
    PanelComponent, CampoTextoComponent, GaleriaImagenesComponent,
    CdkDropList, CdkDrag, CdkDragHandle, CdkDragPlaceholder,
  ],
})
export class EditInicioComponent implements OnInit {

  public titulo = 'Inicio de la tienda';
  public accesoModel!: AccesoModel;

  public secciones: SeccionInicioModel[] = [];
  public cargando = true;
  public trabajando = false;
  public guardando: string | null = null;

  /** La abierta, por clave. Sólo una: el acordeón es la lista de la tienda. */
  public abierta: string | null = null;

  /**
   * Las que ya se abrieron alguna vez.
   *
   * El cuerpo de una sección se PINTA UNA VEZ Y SE ESCONDE, no se destruye:
   * dentro va una galería que se carga sola, y destruirla al cerrar la haría
   * pedir sus imágenes otra vez a cada clic. Pero sólo se monta la que se
   * abre: montar las ocho de entrada pediría galerías que nadie va a mirar.
   */
  public vistas = new Set<string>();

  public formularios: Record<string, FormGroup> = {};

  public readonly estados = ESTADOS_SECCION;

  private _inicioService = inject(InicioService);
  private _seguridadService = inject(SeguridadService);
  private _toastr = inject(ToastrService);
  private fb = inject(FormBuilder);
  private activeRoute = inject(ActivatedRoute);

  get puedeEditar(): boolean { return this.accesoModel?.editar === true; }
  get puedeCrear(): boolean { return this.accesoModel?.crear === true; }
  get puedeEliminar(): boolean { return this.accesoModel?.eliminar === true; }

  /** Cuántas se ven hoy de verdad: encendidas, en fecha y con algo que enseñar. */
  get enLaPortada(): number {
    return this.secciones.filter(s => s.estado === 'visible' && s.con_contenido).length;
  }

  async ngOnInit(): Promise<void> {
    this.accesoModel = this.activeRoute.snapshot.data['access'];
    await this.cargar();
  }

  async cargar(): Promise<void> {
    this.cargando = true;
    try {
      const res: any = await firstValueFrom(this._inicioService.allInicio());
      this.pintar(res?.data, true);
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo cargar la portada', 'Error',
                         { timeOut: 15000, closeButton: true });
    } finally {
      this.cargando = false;
    }
  }

  /**
   * Pinta la lista que devolvió el servidor.
   *
   * LOS FORMULARIOS NO SE REHACEN a cada respuesta: guardar una sección
   * devuelve las ocho, y rehacerlas todas borraría lo que se esté escribiendo
   * en otra. Se crea el que falte, y el de la sección guardada se pone al día
   * aparte.
   */
  private pintar(data: SeccionInicioModel[] | null | undefined, rehacer = false): void {
    if (!data) { return; }
    this.secciones = data;

    for (const s of data) {
      if (rehacer || !this.formularios[s.clave]) {
        this.formularios[s.clave] = this.formularioDe(s);
      }
    }

    if (!this.puedeEditar) {
      Object.values(this.formularios).forEach(f => f.disable());
    }
  }

  private formularioDe(s: SeccionInicioModel): FormGroup {
    return this.fb.group({
      titulo:    [s.titulo ?? '', [Validators.maxLength(80)]],
      subtitulo: [s.subtitulo ?? '', [Validators.maxLength(80)]],
      desde:     [s.desde ?? ''],
      hasta:     [s.hasta ?? ''],
    });
  }

  // ================================================================
  // LA CARA DE CADA SECCIÓN
  // ================================================================

  vista(s: SeccionInicioModel): VistaSeccion {
    return VISTA_SECCIONES[s.clave] ?? VISTA_POR_DEFECTO;
  }

  /** Lo que se lee en la cabecera sin abrirla. */
  resumen(s: SeccionInicioModel): string {
    if (s.fuente.tipo === 'galeria') {
      if (!s.cuantas) { return 'Sin imágenes'; }
      return s.cuantas + (s.cuantas === 1 ? ' imagen' : ' imágenes');
    }
    if (s.fuente.tipo === 'promocion' || s.fuente.tipo === 'destacadas') {
      if (!s.cuantas) {
        return s.fuente.tipo === 'destacadas' ? 'Ninguna destacada' : 'Ninguna en promoción';
      }
      return s.cuantas + (s.cuantas === 1 ? ' categoría' : ' categorías');
    }
    if (s.fuente.tipo === 'marcas') {
      if (!s.cuantas) { return 'Ninguna marca en la tienda'; }
      return s.cuantas + (s.cuantas === 1 ? ' marca' : ' marcas');
    }
    return 'Falta ' + (s.fuente.falta ?? 'su fuente');
  }

  /** Si esta sección se llena en otra pantalla, cuál y con qué regla. */
  seLlenaEn(s: SeccionInicioModel): { ruta: string; pantalla: string; regla: string } | null {
    if (s.fuente.tipo === 'promocion') {
      return {
        ruta: '/ecommerce/' + (s.fuente.pantalla ?? 'allCategoriasWeb'),
        pantalla: 'Categorías de la tienda',
        regla: 'Salen aquí las categorías que marques como «En promoción», con su '
             + 'imagen programada. Sin imagen, la tarjeta sale igual con su nombre.',
      };
    }
    if (s.fuente.tipo === 'destacadas') {
      return {
        ruta: '/ecommerce/' + (s.fuente.pantalla ?? 'allCategoriasWeb'),
        pantalla: 'Categorías de la tienda',
        regla: 'Salen aquí sólo las categorías que marques como «destacada», '
             + 'con su imagen programada. Sin imagen, la tienda pinta su inicial.',
      };
    }
    if (s.fuente.tipo === 'marcas') {
      return {
        ruta: '/ecommerce/' + (s.fuente.pantalla ?? 'allMarcasWeb'),
        pantalla: 'Marcas de la tienda',
        regla: 'Salen aquí las marcas encendidas para la tienda, en su orden, con su '
             + 'imagen programada o, si no tienen, con el logo del catálogo. La tienda '
             + 'sólo enseña las que tienen una de las dos.',
      };
    }
    return null;
  }

  /**
   * Si la sección está encendida, se puede llenar, y está vacía.
   *
   * Es el aviso que más tiempo ahorra: la tienda se la salta, así que el
   * cambio «no sale» y no hay nada roto que buscar.
   *
   * SÓLO SE AVISA DE LAS QUE SE PUEDEN LLENAR. Una sección cuya fuente
   * todavía no está trasladada ya lo dice en su propia etiqueta, y repetirlo
   * con un aviso de peligro sería gritar por algo que nadie puede arreglar
   * hoy.
   */
  sinContenido(s: SeccionInicioModel): boolean {
    return s.fuente.tipo !== 'pendiente' && s.estado === 'visible' && !s.con_contenido;
  }

  alternarSeccion(clave: string): void {
    this.abierta = this.abierta === clave ? null : clave;
    if (this.abierta) { this.vistas.add(this.abierta); }
  }

  // ================================================================
  // GUARDAR
  // ================================================================

  async alternarActivo(s: SeccionInicioModel, evento: Event): Promise<void> {
    evento.stopPropagation();
    if (!this.puedeEditar || this.trabajando) { return; }
    if (this._seguridadService.isexpired()) { return; }

    await this.accion(() => this._inicioService.activarSeccion(s.clave));
  }

  async guardarSeccion(s: SeccionInicioModel): Promise<void> {
    if (!this.puedeEditar || this.guardando) { return; }
    if (this._seguridadService.isexpired()) { return; }

    const f = this.formularios[s.clave];
    f.markAllAsTouched();
    if (f.invalid) {
      this._toastr.error('Revise los campos.', 'No se puede guardar',
                         { timeOut: 15000, closeButton: true });
      return;
    }

    const v = f.getRawValue();
    const limpio = (x: any) => (x ?? '').toString().trim() || null;

    const desde = limpio(v.desde);
    const hasta = limpio(v.hasta);
    if (desde && hasta && hasta < desde) {
      this._toastr.error('La fecha «hasta» es anterior a la de «desde».', 'Las fechas van al revés',
                         { timeOut: 15000, closeButton: true });
      return;
    }

    this.guardando = s.clave;
    try {
      const res: any = await firstValueFrom(this._inicioService.editSeccion(s.clave, {
        // El rótulo sólo se manda donde la tienda lo pinta: así no se queda
        // guardado a escondidas en una sección que no lo enseña.
        titulo:    this.vista(s).rotulo === 'ninguno' ? null : limpio(v.titulo),
        subtitulo: this.vista(s).rotulo === 'titulo_subtitulo' ? limpio(v.subtitulo) : null,
        activo:    s.activo,
        desde,
        hasta,
      }));

      this._toastr.success(res?.message ?? 'Guardado', 'Listo');
      this.pintar(res?.data);
      this.ponerAlDia(s.clave, res?.data);

    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo guardar', 'Error',
                         { timeOut: 20000, closeButton: true });
    } finally {
      this.guardando = null;
    }
  }

  /** El formulario de la sección que se acaba de guardar, con lo que quedó. */
  private ponerAlDia(clave: string, data: SeccionInicioModel[] | null | undefined): void {
    const s = (data ?? []).find(x => x.clave === clave);
    if (!s) { return; }

    this.formularios[clave].patchValue({
      titulo:    s.titulo ?? '',
      subtitulo: s.subtitulo ?? '',
      desde:     s.desde ?? '',
      hasta:     s.hasta ?? '',
    });
  }

  async soltar(evento: CdkDragDrop<SeccionInicioModel[]>): Promise<void> {
    if (!this.puedeEditar || evento.previousIndex === evento.currentIndex) { return; }

    moveItemInArray(this.secciones, evento.previousIndex, evento.currentIndex);
    await this.accion(() => this._inicioService.ordenarSecciones(this.secciones.map(s => s.clave)), false);
  }

  /** Una galería de dentro cambió: la cuenta de su sección ya no vale. */
  async galeriaCambiada(): Promise<void> {
    try {
      const res: any = await firstValueFrom(this._inicioService.allInicio());
      this.pintar(res?.data);
    } catch { /* la galería ya avisó de lo suyo */ }
  }

  private async accion(llamada: () => any, avisar = true): Promise<void> {
    this.trabajando = true;
    try {
      const res: any = await firstValueFrom(llamada());
      if (avisar) { this._toastr.success(res?.message ?? 'Listo', 'Listo'); }
      this.pintar(res?.data);
    } catch (e: any) {
      this._toastr.error(e?.error?.message ?? 'No se pudo completar la acción', 'Error',
                         { timeOut: 15000, closeButton: true });
      await this.cargar();
    } finally {
      this.trabajando = false;
    }
  }
}
