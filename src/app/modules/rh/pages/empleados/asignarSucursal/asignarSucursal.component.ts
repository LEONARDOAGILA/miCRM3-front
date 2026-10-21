import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';

import { ModalHeaderComponent } from '../../../../../components/modal/modal-header/modal-header.component';
import { ModalFooterComponent } from '../../../../../components/modal/modal-footer/modal-footer.component';
import { ComboComponent } from '../../../../../components/campos/combo/combo.component';
import { AvisoComponent } from '../../../../../components/campos/aviso/aviso.component';
import { SucursalService, SucursalModel } from '../../../../ventas/services/sucursal.service';
import { EmpleadoService } from '../../../services/empleado.service';

/**
 * DÓNDE TRABAJA: la sucursal de un empleado.
 *
 * Se abre desde la columna ACCIONES de allEmpleados. Es un extremo propio y
 * no un campo de la ficha porque esto se cambia solo —alguien pasa de un
 * local a otro— y la ficha tiene treinta campos que no vienen al caso.
 *
 * LO QUE DE VERDAD SE ESTÁ DECIDIENDO AQUÍ es desde dónde puede marcar
 * asistencia esta persona: con sucursal, sólo dentro de su perímetro; sin
 * sucursal, desde cualquier lugar. El modal lo dice en cada caso, porque es
 * lo único que no se ve en el nombre de la sucursal.
 */
@Component({
  selector: 'app-asignar-sucursal',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalHeaderComponent, ModalFooterComponent,
            ComboComponent, AvisoComponent],
  templateUrl: './asignarSucursal.component.html',
  styleUrls: ['./asignarSucursal.component.css'],
})
export class AsignarSucursalComponent implements OnInit {

  /** La fila de la rejilla: hacen falta el id, el nombre y su sucursal actual. */
  @Input() empleado: any = null;

  /** El empleado como lo devuelve el servidor, para repintar la fila. */
  @Output() registrosE: EventEmitter<any> = new EventEmitter();

  public cargando = true;
  public guardando = false;

  /** Las sucursales activas, para el desplegable. */
  public sucursales: SucursalModel[] = [];
  /**
   * Lo elegido. 0 = sin sucursal.
   *
   * Es 0 y no null porque el desplegable necesita un valor con el que
   * enseñar marcada la opción «sin sucursal»; con null no marcaría nada y
   * parecería que falta elegir.
   */
  public sucursalId: number = 0;

  constructor(
    public modal: NgbActiveModal,
    private _toastr: ToastrService,
    private _sucursalService: SucursalService,
    private _empleadoService: EmpleadoService,
  ) {}

  async ngOnInit(): Promise<void> {
    this.sucursalId = this.empleado?.sucursal_id ? Number(this.empleado.sucursal_id) : 0;
    await this.cargarSucursales();
  }

  /**
   * Lo que ofrece el desplegable, con «sin sucursal» de primera.
   *
   * Cada línea lleva el código y el perímetro: elegir entre «Matriz» y
   * «Matriz Norte» sin saber si tienen perímetro es elegir a ciegas.
   *
   * ES UN CAMPO Y NO UN GETTER, y eso no es estilo: ng-select vuelve a
   * construir su lista cada vez que cambia la IDENTIDAD del array, y un
   * getter devuelve uno nuevo en cada ciclo de detección. Medido contra la
   * librería: al pulsar una opción se perdía la selección y el formulario
   * seguía creyendo que no se había elegido nada.
   */
  public opciones: { id: number; name: string }[] = [];

  private armarOpciones(): void {
    this.opciones = [
      { id: 0, name: '— Sin sucursal (puede marcar desde cualquier lugar) —' },
      ...this.sucursales.map(s => ({
        id: s.id,
        name: `${s.codigo} · ${s.nombre} (${this.textoPerimetro(s)})`
              + (s.activo ? '' : ' [inactiva]'),
      })),
    ];
  }

  get nombreEmpleado(): string {
    const e = this.empleado;
    return [e?.nombres, e?.apellidos].filter(Boolean).join(' ') || e?.nombre_completo || 'el empleado';
  }

  /** La sucursal elegida, con su perímetro, para el aviso. */
  get elegida(): SucursalModel | null {
    return this.sucursales.find(s => s.id === Number(this.sucursalId)) ?? null;
  }

  /** Lo que ya tenía, para no guardar por guardar. */
  get sinCambios(): boolean {
    const antes = this.empleado?.sucursal_id ?? null;
    return Number(antes ?? 0) === Number(this.sucursalId ?? 0);
  }

  /**
   * Las sucursales activas.
   *
   * Se incluye la que el empleado tiene hoy aunque esté desactivada: si no,
   * el desplegable aparecería vacío y abrir el modal para mirar acabaría
   * quitándole la sucursal sin querer.
   */
  private async cargarSucursales(): Promise<void> {
    try {
      const res: any = await firstValueFrom(this._sucursalService.listSucursales(false));
      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo obtener las sucursales', 'Error');
        return;
      }
      const todas: SucursalModel[] = res.data ?? [];
      this.sucursales = todas.filter(s => s.activo || s.id === Number(this.sucursalId));
      this.armarOpciones();
    } catch (error) {
      console.error('Error al cargar las sucursales:', error);
    } finally {
      this.cargando = false;
    }
  }

  /** El perímetro en una línea. */
  public textoPerimetro(s: SucursalModel | null): string {
    if (!s) { return ''; }
    if (!s.tiene_perimetro) { return 'sin perímetro'; }
    return s.tipo === 'CIRCULO'
      ? `círculo de ${Math.round(Number(s.radio_metros ?? 0))} m`
      : `área de ${s.num_vertices} esquinas`;
  }

  async onSubmitForm(): Promise<void> {
    if (this.guardando) { return; }

    if (this.sinCambios) {
      this._toastr.info('Esa es la sucursal que ya tenía', 'Sin cambios');
      return;
    }

    try {
      this.guardando = true;
      const res: any = await firstValueFrom(
        this._empleadoService.asignarSucursal(this.empleado.id,
                                              this.sucursalId ? Number(this.sucursalId) : null));

      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo cambiar la sucursal', 'Error');
        this.guardando = false;
        return;
      }

      this.registrosE.emit(res.data);
      this._toastr.success(res.message, 'Éxito', { closeButton: true });
      this.modal.close(res.data);

    } catch (error) {
      // El AuthInterceptor ya muestra el toast del error HTTP
      console.error('Error al asignar la sucursal:', error);
      this.guardando = false;
    }
  }
}
