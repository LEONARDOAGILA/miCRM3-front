import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';

import { CapturaMapa, LugarGm, UbicacionGoogleMapsComponent } from './ubicacion-google-maps.component';

/** Lo que devuelve el modal: la dirección desmenuzada y sus dos fotos. */
export interface UbicacionElegida {
  provincia: string | null;
  canton: string | null;
  parroquia: string | null;
  calle_principal: string | null;
  calle_secundaria: string | null;
  numeracion: string | null;
  /** La dirección completa tal como la devuelve Google */
  ubicacion: string | null;
  codigo_postal: string | null;
  /** «-2.170900, -79.922400» */
  coordenadas: string | null;
  link_coordenadas: string | null;

  /** Las dos capturas, listas para subir. Pueden faltar. */
  fotoMapa: Blob | null;
  fotoCasa: Blob | null;

  /** Por si quien lo abre necesita algo más del lugar */
  lugar: LugarGm;
}

/**
 * Elegir una dirección en el mapa, en un modal.
 *
 * Envuelve al mapa y devuelve la dirección ya desmenuzada —provincia, cantón,
 * parroquia, calles…— junto con la vista del mapa y la de la calle. Sirve
 * para cualquier pantalla que necesite una dirección:
 *
 *   const ref = this.modal.open(SeleccionarUbicacionComponent, { size: 'xl' });
 *   const elegida: UbicacionElegida = await ref.result;
 */
@Component({
  selector: 'app-seleccionar-ubicacion',
  standalone: true,
  imports: [CommonModule, UbicacionGoogleMapsComponent],
  templateUrl: './seleccionarUbicacion.component.html',
  styleUrls: ['./seleccionarUbicacion.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SeleccionarUbicacionComponent {

  /** Dónde abrir el mapa: la dirección que ya tuviera el registro. */
  @Input() lugarInicial: { lat: number; lng: number; nombre?: string } | null = null;
  /** Para la cabecera: «Dirección de Juan Pérez». */
  @Input() titulo = 'Elegir la dirección en el mapa';

  @ViewChild(UbicacionGoogleMapsComponent) mapa?: UbicacionGoogleMapsComponent;

  lugar: LugarGm | null = null;
  /** Mientras se completan las dos fotos del lugar. */
  guardando = false;

  constructor(
    public activeModal: NgbActiveModal,
    private _toastr: ToastrService,
    private _cd: ChangeDetectorRef,
  ) {}

  alElegirEnElMapa(l: LugarGm): void {
    this.lugar = l;
    this._cd.markForCheck();
  }

  /** Lo que se ve en el resumen de abajo. */
  get coordenadas(): string {
    return this.lugar ? `${this.lugar.lat.toFixed(6)}, ${this.lugar.lng.toFixed(6)}` : '';
  }

  /**
   * Cierra devolviendo la dirección.
   *
   * Las fotos se toman del propio mapa, que las va capturando al encuadrar:
   * la de tipo «mapa» es la vista de arriba y la de «calle» la fachada.
   */
  async usarEstaDireccion(): Promise<void> {
    if (!this.lugar) {
      this._toastr.info('Busca un sitio o pulsa en el mapa para elegir la dirección', 'Todavía no hay dirección', { timeOut: 3500 });
      return;
    }

    // Las dos fotos se completan aquí: la del mapa puede no haberse disparado
    // y la de la calle sólo existe si alguien abrió Street View
    this.guardando = true;
    this._cd.markForCheck();
    try {
      await this.mapa?.asegurarCapturas();
    } catch (e) {
      console.warn('No se pudieron completar las fotos del lugar:', e);
    } finally {
      this.guardando = false;
      this._cd.markForCheck();
    }

    const capturas: CapturaMapa[] = this.mapa?.capturas ?? [];
    const dePantalla = (tipo: 'mapa' | 'calle') => capturas.find(c => c.tipo === tipo && !!c.blob)?.blob ?? null;

    const elegida: UbicacionElegida = {
      provincia:        this.lugar.provincia ?? null,
      canton:           this.lugar.canton ?? null,
      parroquia:        this.lugar.parroquia ?? null,
      calle_principal:  this.lugar.callePrincipal ?? null,
      calle_secundaria: this.lugar.calleSecundaria ?? null,
      numeracion:       this.lugar.numero ?? null,
      ubicacion:        this.lugar.direccion ?? this.lugar.nombre ?? null,
      codigo_postal:    this.lugar.postal ?? null,
      coordenadas:      `${this.lugar.lat.toFixed(6)}, ${this.lugar.lng.toFixed(6)}`,
      // El enlace que abre el punto en Google Maps
      link_coordenadas: this.lugar.placeId
        ? `https://www.google.com/maps/search/?api=1&query=${this.lugar.lat},${this.lugar.lng}&query_place_id=${this.lugar.placeId}`
        : `https://www.google.com/maps/search/?api=1&query=${this.lugar.lat},${this.lugar.lng}`,
      fotoMapa: dePantalla('mapa'),
      fotoCasa: dePantalla('calle'),
      lugar: this.lugar,
    };

    this.activeModal.close(elegida);
  }
}
