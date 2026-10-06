import { Component, ElementRef, EventEmitter, Input, OnInit, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';

import { PanelModule } from '../../../../../components/panel/panel.module';
import { ModalHeaderComponent } from '../../../../../components/modal/modal-header/modal-header.component';
import { ModalFooterComponent } from '../../../../../components/modal/modal-footer/modal-footer.component';
import { CampoTextoComponent } from '../../../../../components/campos/campoTexto/campoTexto.component';
import { CheckboxComponent } from '../../../../../components/campos/checkbox/checkbox.component';
import { ComboComponent } from '../../../../../components/campos/combo/combo.component';
import { SeguridadService } from '../../../../seguridad/services/seguridad.service';
import { LoadingService } from '../../../../../service/loading.service';
import { WhatsappPlantillaService } from '../../../services/whatsappPlantilla.service';
import {
  HUECOS_PLANTILLA, ICONOS_PLANTILLA, WhatsappPlantillaModel,
} from '../../../interfaces/whatsappPlantillaModel';
import { aplicarPlantilla } from '../../../interfaces/plantillasWhatsapp';

/** Acciones con las que se abre el modal desde la lista. */
type AccionPlantilla = 'add' | 'edit' | 'clon' | 'view';

/**
 * Alta, modificación, clonación y vista de una plantilla de WhatsApp.
 *
 * Mismo esquema que saveCargo: formulario reactivo, paneles del tema, campos
 * app-campo* y el pie con Guardar. En 'view' va deshabilitado y sin guardar.
 *
 * Lo propio de esta pantalla son dos cosas:
 *   · los huecos ({nombre}, {vendedor}…) se insertan con un botón, para no
 *     tener que acordarse de cómo se llaman ni escribirlos mal;
 *   · debajo se ve el mensaje ya resuelto con datos de ejemplo, que es la
 *     única forma de saber cómo va a quedar antes de mandárselo a un cliente.
 */
@Component({
  selector: 'app-savePlantillaWhatsapp',
  templateUrl: './savePlantillaWhatsapp.component.html',
  styleUrls: ['./savePlantillaWhatsapp.component.css'],
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, PanelModule,
    ModalHeaderComponent, ModalFooterComponent,
    CampoTextoComponent, CheckboxComponent, ComboComponent,
  ],
})
export class SavePlantillaWhatsappComponent implements OnInit {

  /** Registro a editar / clonar / ver, o {} al crear. */
  @Input() registro_selected: any = {};
  @Input() accion: AccionPlantilla = 'add';
  @Output() registrosE: EventEmitter<any> = new EventEmitter();

  @ViewChild('areaTexto') areaTexto?: ElementRef<HTMLTextAreaElement>;

  public form!: FormGroup;
  public isLoading$ = this._loadingService.isLoading$;
  public response: any;
  public isdisabled = false;
  public titulo = '';
  public textoClon = '';

  public readonly huecos = HUECOS_PLANTILLA;
  public readonly iconos = ICONOS_PLANTILLA;

  constructor(
    private fb: FormBuilder,
    public modal: NgbActiveModal,
    private _toastr: ToastrService,
    private _loadingService: LoadingService,
    private _seguridadService: SeguridadService,
    private _plantillaService: WhatsappPlantillaService,
  ) {}

  // ================================================================
  // ESTADO DERIVADO
  // ================================================================

  get esView(): boolean { return this.accion === 'view'; }
  get esNuevo(): boolean { return this.accion === 'add' || this.accion === 'clon'; }
  get ctrlActivo(): FormControl { return this.form.controls['activo'] as FormControl; }
  get ctrlTexto(): FormControl { return this.form.controls['texto'] as FormControl; }

  /**
   * El mensaje como lo va a recibir el cliente.
   *
   * Con datos de ejemplo, no con los del cliente que haya abierto: esta
   * pantalla se usa sin ninguno seleccionado.
   */
  get vistaPrevia(): string {
    return aplicarPlantilla(this.ctrlTexto?.value ?? '', {
      cliente:  'María Fernanda Pérez',
      nombre:   'María',
      vendedor: this.nombreDeQuienEdita,
      empresa:  'la empresa',
    });
  }

  private get nombreDeQuienEdita(): string {
    const u = this._seguridadService.getUserLogin();
    return [u?.name, u?.surname].filter(Boolean).join(' ').trim() || u?.login_user || 'el vendedor';
  }

  // ================================================================
  // CICLO DE VIDA
  // ================================================================

  ngOnInit(): void {
    if (this._seguridadService.isexpired()) {
      this.modal.close();
      return;
    }

    this.isdisabled = this.esView;
    this.initializeForm();

    switch (this.accion) {
      case 'add':
        this.titulo = 'Nueva plantilla de WhatsApp';
        break;
      case 'edit':
        this.titulo = 'Modificar plantilla';
        this.cargar();
        break;
      case 'clon':
        this.titulo = 'Clonar plantilla';
        this.textoClon = ' (copia)';
        this.cargar();
        break;
      case 'view':
        this.titulo = 'Ver plantilla';
        this.cargar();
        break;
    }
  }

  //   ******   INICIALIZA FORMULARIO   ******  //
  initializeForm(): void {
    this.form = this.fb.group({
      nombre: [{ value: '', disabled: this.isdisabled }, [Validators.required, Validators.minLength(3), Validators.maxLength(60)]],
      icono:  [{ value: 'fa-comment', disabled: this.isdisabled }],
      asunto: [{ value: '', disabled: this.isdisabled }, [Validators.required, Validators.minLength(3), Validators.maxLength(200)]],
      texto:  [{ value: '', disabled: this.isdisabled }, [Validators.required, Validators.minLength(10), Validators.maxLength(4000)]],
      orden:  [{ value: 100, disabled: this.isdisabled }, [Validators.min(0), Validators.max(9999)]],
      activo: [{ value: true, disabled: this.isdisabled }],
    });
  }

  /**
   * No hay findById: la lista ya trae la plantilla entera y son pocas. Pedir
   * otra vez al servidor lo mismo que ya está en la grilla sería un viaje de
   * más por cada doble clic.
   */
  private cargar(): void {
    const p: WhatsappPlantillaModel = this.registro_selected ?? {};
    this.form.patchValue({
      nombre: (p.nombre ?? '') + this.textoClon,
      icono:  p.icono || 'fa-comment',
      asunto: p.asunto ?? '',
      texto:  p.texto ?? '',
      orden:  p.orden ?? 100,
      activo: p.activo !== false,
    });
  }

  // ================================================================
  // LOS HUECOS
  // ================================================================

  /**
   * Mete el hueco donde está el cursor, no al final: quien escribe «Hola ,
   * le saluda» quiere el {nombre} entre la coma y el «Hola».
   */
  insertarHueco(clave: string): void {
    if (this.esView) { return; }

    const el = this.areaTexto?.nativeElement;
    const actual = this.ctrlTexto.value ?? '';

    if (!el) {
      this.ctrlTexto.setValue((actual + ' ' + clave).trim());
      return;
    }

    const i = el.selectionStart ?? actual.length;
    const f = el.selectionEnd ?? i;
    this.ctrlTexto.setValue(actual.slice(0, i) + clave + actual.slice(f));

    // Devolver el foco y dejar el cursor detrás de lo insertado
    setTimeout(() => {
      el.focus();
      const pos = i + clave.length;
      el.setSelectionRange(pos, pos);
    });
  }

  // ================================================================
  // GUARDAR
  // ================================================================

  public async onSubmitForm($ev?: any): Promise<void> {
    $ev?.preventDefault?.();
    this._toastr.clear();
    Object.values(this.form.controls).forEach(c => c.markAsTouched());

    if (this.form.invalid) {
      this._toastr.error('Revise los campos del formulario.', 'No se puede Guardar', { timeOut: 20000, closeButton: true });
      return;
    }

    const payload = this.form.getRawValue();
    payload.nombre = (payload.nombre ?? '').trim();
    payload.asunto = (payload.asunto ?? '').trim();
    payload.texto  = (payload.texto ?? '').trim();
    payload.icono  = payload.icono || null;
    payload.orden  = Number(payload.orden ?? 100);
    // El código no se manda nunca: al crear y al clonar lo inventa el
    // servidor a partir del nombre, y al modificar conserva el que ya tiene
    // (renombrar una plantilla no es cambiarla de identidad). Mandar el de la
    // original al clonar sería, además, pedir un choque con el índice único.
    delete payload.codigo;

    await this.saveRecord(payload);
  }

  private async saveRecord(data: Partial<WhatsappPlantillaModel>): Promise<void> {
    try {
      this._loadingService.setLoading(true);
      this.isdisabled = true;

      this.response = this.accion === 'edit'
        ? await firstValueFrom(this._plantillaService.editPlantilla(this.registro_selected.id, data))
        : await firstValueFrom(this._plantillaService.addPlantilla(data));

      if (this.response?.status !== 'success') {
        this.isdisabled = false;
        return;
      }

      this.registrosE.emit(this.response.data);
      this._toastr.success(this.response.message, 'Éxito', { closeButton: true });
      this.modal.close(this.response.data);
    } catch (error) {
      // El AuthInterceptor ya notificó el error HTTP (422 / 409 con el motivo)
      console.error('Error al guardar la plantilla:', error);
      this.isdisabled = false;
    } finally {
      this._loadingService.setLoading(false);
    }
  }
}
