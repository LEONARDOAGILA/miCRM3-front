import { Component, Input } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';

import { PanelModule } from '../panel/panel.module';
import { CampoTextoComponent } from '../campos/campoTexto/campoTexto.component';
import { CampoEmailComponent } from '../campos/campoEmail/campoEmail.component';
import { CampoTelefonoComponent } from '../campos/campoTelefono/campoTelefono.component';
import { CampoTextoAreaComponent } from '../campos/campoTextoArea/campoTextoArea.component';
import { ComboComponent } from '../campos/combo/combo.component';

/** Un canal de contacto de la columna izquierda: icono, etiqueta y valor. */
export interface CanalContacto {
  icono: string;        // clase Font Awesome, p. ej. 'fa-solid fa-phone'
  color: string;        // clase de fondo del tema: bg-primary, bg-success…
  etiqueta: string;
  valor: string;
  /** Si viene, el valor se pinta como enlace (tel:, mailto:, https:) */
  href?: string;
  /** Texto pequeño bajo el valor: horario, extensión… */
  detalle?: string;
}

/**
 * Bloque "Contáctanos": datos de la empresa a la izquierda y formulario de
 * mensaje a la derecha. Standalone para que la pantalla de inicio lo cargue
 * con @defer al pulsar su pestaña.
 *
 * Los datos de contacto entran por @Input para que el mismo bloque sirva en
 * cualquier pantalla y no haya que tocar el componente para cambiarlos. Los
 * valores por defecto son de relleno: sustituirlos por los reales.
 *
 * El envío no pasa por el back porque todavía no hay endpoint para ello: el
 * botón abre el cliente de correo con el mensaje ya redactado (mailto:).
 * Cuando exista el endpoint, sustituir el cuerpo de enviar().
 */
@Component({
  selector: 'app-contactanos',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    PanelModule,
    CampoTextoComponent,
    CampoEmailComponent,
    CampoTelefonoComponent,
    CampoTextoAreaComponent,
    ComboComponent
  ],
  templateUrl: './contactanos.component.html',
  styleUrls: ['./contactanos.component.scss']
})
export class ContactanosComponent {

  /** Nombre que encabeza la columna de datos. */
  @Input() empresa = 'IUNIX CRM/ERP';

  /** Frase corta bajo el nombre. */
  @Input() lema = 'Estamos para ayudarte. Escríbenos y te respondemos lo antes posible.';

  /** Buzón al que va el mensaje del formulario. */
  @Input() correoDestino = 'soporte@tu-empresa.com';

  @Input() canales: CanalContacto[] = [
    {
      icono: 'fa-solid fa-location-dot',
      color: 'bg-primary',
      etiqueta: 'Dirección',
      valor: 'Av. Principal 123 y Calle Secundaria',
      detalle: 'Quito, Ecuador'
    },
    {
      icono: 'fa-solid fa-phone',
      color: 'bg-success',
      etiqueta: 'Teléfono',
      valor: '+593 2 000 0000',
      href: 'tel:+59320000000',
      detalle: 'Lunes a viernes, 08:00 – 17:00'
    },
    {
      icono: 'fa-solid fa-envelope',
      color: 'bg-info',
      etiqueta: 'Correo',
      valor: 'soporte@tu-empresa.com',
      href: 'mailto:soporte@tu-empresa.com',
      detalle: 'Respondemos en menos de 24 h'
    },
    {
      icono: 'fa-brands fa-whatsapp',
      color: 'bg-teal',
      etiqueta: 'WhatsApp',
      valor: '+593 99 000 0000',
      href: 'https://wa.me/593990000000',
      detalle: 'Soporte inmediato en horario laboral'
    }
  ];

  form: FormGroup;

  /** Motivos del desplegable de asunto (forma que espera app-combo). */
  readonly asuntos = [
    { id: 'Soporte técnico',   name: 'Soporte técnico' },
    { id: 'Consulta comercial', name: 'Consulta comercial' },
    { id: 'Facturación',       name: 'Facturación' },
    { id: 'Sugerencia',        name: 'Sugerencia' },
    { id: 'Otro',              name: 'Otro' }
  ];

  readonly MAX_MENSAJE = 1000;

  constructor(
    private fb: FormBuilder,
    private toastr: ToastrService
  ) {
    // Los validadores de correo y teléfono los ponen los propios campos;
    // aquí sólo van los que ellos no cubren.
    this.form = this.fb.group({
      nombre:   ['', [Validators.required, Validators.maxLength(100)]],
      email:    [''],
      telefono: [''],
      asunto:   [this.asuntos[0].id, [Validators.required]],
      mensaje:  ['', [Validators.required, Validators.minLength(10), Validators.maxLength(this.MAX_MENSAJE)]]
    });
  }

  get caracteresRestantes(): number {
    const texto: string = this.form.controls['mensaje'].value ?? '';
    return this.MAX_MENSAJE - texto.length;
  }

  enviar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toastr.warning('Revisa los campos marcados antes de enviar.', 'Faltan datos');
      return;
    }

    const v = this.form.getRawValue();

    const cuerpo = [
      `Nombre: ${v.nombre}`,
      `Correo: ${v.email}`,
      v.telefono ? `Teléfono: ${v.telefono}` : null,
      '',
      v.mensaje
    ].filter(linea => linea !== null).join('\n');

    const mailto =
      `mailto:${encodeURIComponent(this.correoDestino)}` +
      `?subject=${encodeURIComponent(`[${v.asunto}] ${this.empresa}`)}` +
      `&body=${encodeURIComponent(cuerpo)}`;

    window.location.href = mailto;

    this.toastr.info('Se abrió tu cliente de correo con el mensaje redactado.', 'Listo para enviar');
  }

  limpiar(): void {
    this.form.reset({ asunto: this.asuntos[0].id });
  }
}
