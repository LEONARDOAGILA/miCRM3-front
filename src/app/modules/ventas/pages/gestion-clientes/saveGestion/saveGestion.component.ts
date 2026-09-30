import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';

import { GestionService } from '../../../services/gestion.service';
import { LoadingService } from '../../../../../service/loading.service';
import { ClienteModel, ContactoCliente } from '../../../interfaces/clienteModel';
import {
  GestionModel, PRIORIDADES_GESTION, RESULTADOS_GESTION, TIPOS_GESTION,
} from '../../../interfaces/gestionModel';

/** Para qué se abre el modal. */
export type ModoGestion = 'registrar' | 'programar' | 'editar';

/**
 * Registrar una gestión ya hecha, programar la siguiente o corregir una
 * existente (ventas.gestiones).
 *
 * Es el mismo formulario en los tres casos: lo que cambia es el estado con el
 * que nace (REALIZADA o PENDIENTE) y, con él, si se pide la fecha en que se
 * hizo o la fecha para la que se agenda.
 */
@Component({
  selector: 'app-saveGestion',
  templateUrl: './saveGestion.component.html',
  styleUrls: ['./saveGestion.component.css'],
  standalone: false,
})
export class SaveGestionComponent implements OnInit {

  @Input() modo: ModoGestion = 'registrar';
  @Input() cliente: ClienteModel | null = null;
  /** Personas de contacto del cliente, para decir con quién se habló */
  @Input() contactos: ContactoCliente[] = [];
  /** Sólo en 'editar' */
  @Input() gestion: GestionModel | null = null;

  @Output() guardado = new EventEmitter<GestionModel>();

  public form!: FormGroup;
  public titulo = '';
  public isLoading$ = this._loadingService.isLoading$;
  public guardando = false;

  public tipos = TIPOS_GESTION;
  public prioridades = PRIORIDADES_GESTION;
  public resultados = RESULTADOS_GESTION;
  /** Los teléfonos del cliente, para no tener que escribirlos */
  public telefonos: { id: string; name: string }[] = [];
  public contactosCombo: { id: number; name: string }[] = [];

  constructor(
    private fb: FormBuilder,
    public modal: NgbActiveModal,
    private _toastr: ToastrService,
    private _loadingService: LoadingService,
    private _gestionService: GestionService,
  ) {}

  ngOnInit(): void {
    this.titulo = this.modo === 'programar' ? 'Programar gestión'
                : this.modo === 'editar'    ? 'Modificar gestión'
                : 'Registrar gestión';

    this.telefonos = [this.cliente?.celular, this.cliente?.telefono]
      .filter(Boolean)
      .map(t => ({ id: String(t), name: String(t) }));
    this.contactosCombo = (this.contactos ?? [])
      .filter(c => c.id)
      .map(c => ({ id: c.id as number, name: c.cargo ? `${c.nombres} (${c.cargo})` : c.nombres }));

    this.initializeForm();
  }

  /** Programada mientras esté PENDIENTE; el resto, realizada. */
  get esProgramada(): boolean {
    return this.form?.get('estado')?.value === 'PENDIENTE';
  }

  get ctrlEstado(): FormControl { return this.form.controls['estado'] as FormControl; }

  private initializeForm(): void {
    const g = this.gestion;
    const estadoInicial = this.modo === 'programar' ? 'PENDIENTE'
                        : this.modo === 'editar'    ? (g?.estado ?? 'REALIZADA')
                        : 'REALIZADA';

    this.form = this.fb.group({
      tipo:             [g?.tipo ?? 'LLAMADA', [Validators.required]],
      estado:           [estadoInicial, [Validators.required]],
      asunto:           [g?.asunto ?? '', [Validators.required, Validators.minLength(3), Validators.maxLength(200)]],
      contacto_id:      [g?.contacto_id ?? null],
      telefono:         [g?.telefono ?? this.cliente?.celular ?? this.cliente?.telefono ?? '', [Validators.maxLength(20)]],
      prioridad:        [g?.prioridad ?? 'MEDIA', [Validators.required]],
      fecha_programada: [this.paraInput(g?.fecha_programada) || (estadoInicial === 'PENDIENTE' ? this.enUnaHora() : '')],
      fecha_realizada:  [this.paraInput(g?.fecha_realizada) || (estadoInicial === 'REALIZADA' ? this.ahora() : '')],
      duracion_minutos: [g?.duracion_minutos ?? null, [Validators.min(0), Validators.max(1440)]],
      resultado:        [g?.resultado ?? (estadoInicial === 'REALIZADA' ? 'CONTACTADO' : null)],
      nota:             [g?.nota ?? '', [Validators.maxLength(4000)]],
    });

    // Lo programado pide fecha futura; lo realizado, resultado
    this.aplicarReglasDelEstado(estadoInicial);
    this.form.get('estado')?.valueChanges.subscribe(v => this.aplicarReglasDelEstado(v));
  }

  /**
   * Cambia qué campos son obligatorios según el estado.
   *
   * La base tiene el mismo control (ck_gestiones_pendiente / _realizada), así
   * que sin esto el error llegaría del servidor en vez de verse en el campo.
   */
  private aplicarReglasDelEstado(estado: string): void {
    const programada = estado === 'PENDIENTE';
    const fp = this.form.get('fecha_programada');
    const res = this.form.get('resultado');

    fp?.setValidators(programada ? [Validators.required] : []);
    res?.setValidators(estado === 'REALIZADA' ? [Validators.required] : []);

    if (programada && !fp?.value) { fp?.setValue(this.enUnaHora(), { emitEvent: false }); }
    if (estado === 'REALIZADA' && !this.form.get('fecha_realizada')?.value) {
      this.form.get('fecha_realizada')?.setValue(this.ahora(), { emitEvent: false });
    }

    fp?.updateValueAndValidity({ emitEvent: false });
    res?.updateValueAndValidity({ emitEvent: false });
  }

  // ================================================================
  // FECHAS (el input datetime-local trabaja con «AAAA-MM-DDTHH:mm»)
  // ================================================================

  private aTexto(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  private ahora(): string { return this.aTexto(new Date()); }

  private enUnaHora(): string {
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return this.aTexto(d);
  }

  /** «AAAA-MM-DD HH:mm» (lo que devuelve la base) → lo que espera el input. */
  private paraInput(valor: string | null | undefined): string {
    return valor ? valor.replace(' ', 'T').substring(0, 16) : '';
  }

  // ================================================================
  // GUARDAR
  // ================================================================

  public async onSubmitForm($ev?: any): Promise<void> {
    $ev?.preventDefault?.();
    this._toastr.clear();
    this.form.markAllAsTouched();

    if (!this.cliente?.id) {
      this._toastr.error('No hay cliente seleccionado', 'Error');
      return;
    }
    if (this.form.invalid) {
      const falta = this.esProgramada && !this.form.get('fecha_programada')?.value
        ? 'Indique la fecha y la hora de la gestión programada.'
        : (!this.esProgramada && !this.form.get('resultado')?.value
            ? 'Indique cómo terminó la gestión.'
            : 'Revise los campos del formulario.');
      this._toastr.error(falta, 'No se puede guardar', { timeOut: 8000, closeButton: true });
      return;
    }

    const v = this.form.getRawValue();
    const payload: any = {
      cliente_id:       this.cliente.id,
      tipo:             v.tipo,
      estado:           v.estado,
      asunto:           (v.asunto ?? '').trim(),
      nota:             (v.nota ?? '').trim() || null,
      // Quien atiende al cliente; si no tiene vendedor va sin dueño
      empleado_id:      this.cliente.vendedor_id ?? null,
      contacto_id:      v.contacto_id || null,
      telefono:         (v.telefono ?? '').trim() || null,
      prioridad:        v.prioridad,
      fecha_programada: v.estado === 'PENDIENTE' ? v.fecha_programada : (v.fecha_programada || null),
      fecha_realizada:  v.estado === 'REALIZADA' ? (v.fecha_realizada || null) : null,
      duracion_minutos: v.duracion_minutos === '' || v.duracion_minutos === null ? null : Number(v.duracion_minutos),
      resultado:        v.estado === 'REALIZADA' ? v.resultado : null,
    };

    try {
      this.guardando = true;
      this._loadingService.setLoading(true);

      const res: any = this.gestion?.id
        ? await firstValueFrom(this._gestionService.editGestion(this.gestion.id, payload))
        : await firstValueFrom(this._gestionService.addGestion(payload));

      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo guardar la gestión', 'Error');
        return;
      }

      this.guardado.emit(res.data);
      this._toastr.success(res.message, 'Éxito', { closeButton: true });
      this.modal.close(res.data);
    } catch (error) {
      // El AuthInterceptor ya muestra el toast del error HTTP
      console.error('Error al guardar la gestión:', error);
    } finally {
      this.guardando = false;
      this._loadingService.setLoading(false);
    }
  }
}
