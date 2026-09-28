import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';

import { WhatsappService } from '../../../services/whatsapp.service';
import { ListClientesComponent } from '../../clientes/listClientes/listClientes.component';
import { ModalHeaderComponent } from '../../../../../components/modal/modal-header/modal-header.component';

/** Una conversación que todavía no pertenece a ningún cliente. */
interface ConversacionSuelta {
  numero: string;
  autor: string | null;
  mensajes: number;
  ultimo: string | null;
  ultimo_at: string;
}

/**
 * Conversaciones de WhatsApp que no casan con ningún cliente.
 *
 * Pasa por dos motivos: o el número no está en ninguna ficha, o WhatsApp no
 * entregó el teléfono y mandó un identificador oculto (LID). En los dos casos
 * el mensaje se guarda igual —perderlo sería peor— y desde aquí se ata al
 * cliente que corresponda; a partir de ese momento la conversación se ve en
 * su pestaña de WhatsApp.
 */
@Component({
  selector: 'app-conversaciones-whatsapp',
  templateUrl: './conversacionesWhatsapp.component.html',
  styleUrls: ['./conversacionesWhatsapp.component.css'],
  standalone: true,
  imports: [CommonModule, ModalHeaderComponent],
})
export class ConversacionesWhatsappComponent implements OnInit {

  /** Se asignó algo: quien abrió el modal recarga lo suyo. */
  @Output() asignado = new EventEmitter<void>();

  public conversaciones: ConversacionSuelta[] = [];
  public cargando = false;
  /** El número que se está asignando, para deshabilitar sólo esa fila. */
  public asignando: string | null = null;

  constructor(
    public modal: NgbActiveModal,
    private otroModal: NgbModal,
    private _toastr: ToastrService,
    private _whatsappService: WhatsappService,
  ) {}

  ngOnInit(): void {
    this.cargar();
  }

  async cargar(): Promise<void> {
    try {
      this.cargando = true;
      const res: any = await firstValueFrom(this._whatsappService.sinAsignar(100));
      this.conversaciones = res?.status === 'success' ? (res.data ?? []) : [];
    } catch (error) {
      console.error('Error al cargar las conversaciones sin asignar:', error);
      this.conversaciones = [];
    } finally {
      this.cargando = false;
    }
  }

  /**
   * ¿Es un identificador oculto en vez de un teléfono?
   *
   * Un teléfono tiene como mucho 13 dígitos; los LID de WhatsApp son más
   * largos. Se avisa en la lista porque con uno de esos no se puede buscar
   * al cliente por su celular: hay que reconocerlo por el nombre.
   */
  esOculto(c: ConversacionSuelta): boolean {
    return (c.numero ?? '').length > 13;
  }

  /** Abre el selector de clientes y ata la conversación al elegido. */
  asignar(c: ConversacionSuelta): void {
    const ref = this.otroModal.open(ListClientesComponent, { size: 'lg', centered: true, backdrop: 'static' });
    ref.componentInstance.ayuda = 'Elige a quién pertenece esta conversación de WhatsApp.';

    ref.componentInstance.seleccionado.subscribe(async (cliente: any) => {
      if (!cliente?.id) { return; }
      try {
        this.asignando = c.numero;
        const res: any = await firstValueFrom(this._whatsappService.asignar(c.numero, cliente.id));

        if (res?.status === 'success') {
          this._toastr.success(res.message, cliente.nombre_completo ?? 'Conversación asignada');
          this.conversaciones = this.conversaciones.filter(x => x.numero !== c.numero);
          this.asignado.emit();
        } else {
          this._toastr.error(res?.message || 'No se pudo asignar', 'WhatsApp');
        }
      } catch (error) {
        console.error('Error al asignar la conversación:', error);
      } finally {
        this.asignando = null;
      }
    });
  }
}
