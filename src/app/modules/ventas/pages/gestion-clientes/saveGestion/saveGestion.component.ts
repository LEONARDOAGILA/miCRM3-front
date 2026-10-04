import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';

import { GestionService } from '../../../services/gestion.service';
import { SoftphoneService } from '../../../services/softphone.service';
import { enlaceDeWhatsapp, puedeTenerWhatsapp } from '../../../interfaces/plantillasWhatsapp';
import { CatalogoGestionService } from '../../../services/catalogoGestion.service';
import { TipoGestion, AsuntoGestion, asuntosDe } from '../../../interfaces/catalogoGestion';
import { LoadingService } from '../../../../../service/loading.service';
import { ClienteModel, ContactoCliente } from '../../../interfaces/clienteModel';
import {
  GestionModel, PRIORIDADES_GESTION, RESULTADOS_GESTION,
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
  /**
   * Con qué número se está hablando, cuando se abre después de marcar.
   *
   * Sin esto el formulario propone el celular del cliente, que es lo correcto
   * casi siempre; pero si se llamó a una persona de contacto, el número bueno
   * es el suyo y no el de la empresa.
   */
  @Input() telefonoInicial: string | null = null;

  @Output() guardado = new EventEmitter<GestionModel>();

  public form!: FormGroup;
  public titulo = '';
  public isLoading$ = this._loadingService.isLoading$;
  public guardando = false;

  /**
   * Los tipos salen de la tabla, no de una lista escrita en el código.
   *
   * Mientras llegan, el combo queda vacío y el formulario sin poder
   * guardarse: es un segundo y evita el caso feo de elegir un tipo que luego
   * resulta que no está en el catálogo.
   */
  public tipos: TipoGestion[] = [];
  public cargandoCatalogo = true;
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
    private _catalogoService: CatalogoGestionService,
    private _softphone: SoftphoneService,
  ) {}

  // ================================================================
  // LOS TELÉFONOS DEL CLIENTE
  // ================================================================
  //
  // Las mismas tres acciones que en la ficha —llamar, WhatsApp y copiar—,
  // para no tener que cerrar el formulario a mitad para buscarlas.

  /**
   * ¿Ese número puede tener WhatsApp? La regla está en plantillasWhatsapp.ts,
   * compartida con la pantalla de detrás: tenerla escrita dos veces era pedir
   * que un día dejaran de decir lo mismo.
   */
  public tieneWhatsapp = puedeTenerWhatsapp;

  /** Lo pone en el campo, que es el número que se guarda con la gestión. */
  usarNumero(numero: string): void {
    this.form.controls['telefono'].setValue(numero);
    this.form.controls['telefono'].markAsDirty();
  }

  /**
   * Marca con el softphone.
   *
   * Aquí no se abre otra gestión al marcar, como sí hace la pantalla de
   * detrás: ya se está escribiendo una.
   */
  llamar(numero: string): void {
    const marcado = this._softphone.marcar(numero);
    if (!marcado) { return; }

    this.usarNumero(numero);
    this._toastr.info('Marcando ' + marcado + '…', this.cliente?.nombre_completo || 'Zoiper', { timeOut: 2500 });
  }

  /**
   * Abre la conversación de WhatsApp con ese número.
   *
   * Sin menú de plantillas: ese vive en la ficha, y aquí dentro un menú
   * flotante sobre un modal se corta contra sus bordes.
   */
  porWhatsapp(numero: string): void {
    const enlace = enlaceDeWhatsapp(numero);
    if (!enlace) { return; }

    this.usarNumero(numero);
    window.open(enlace, '_blank', 'noopener');
  }

  /** Al portapapeles, para pegarlo donde haga falta. */
  async copiar(numero: string): Promise<void> {
    this.usarNumero(numero);
    try {
      await navigator.clipboard.writeText(numero);
      this._toastr.success('El teléfono se copió al portapapeles', '', { timeOut: 1500 });
    } catch {
      // Sin permiso o sin https: no es grave, no se avisa con un error
      console.warn('No se pudo copiar al portapapeles');
    }
  }

  /**
   * Los asuntos que se ofrecen ahora mismo: los del tipo elegido.
   *
   * El usuario no escribe el asunto, lo elige. Es lo que permite después
   * agrupar por asunto sin que «Cobranza» y «cobranzas» cuenten como dos
   * cosas distintas, que es justo lo que pasaba antes.
   */
  get asuntos(): AsuntoGestion[] {
    const codigo = this.form?.get('tipo')?.value;
    return asuntosDe(this.tipos.find(t => t.codigo === codigo));
  }

  /** Un tipo sin asuntos no deja registrar nada: hay que avisarlo, no callar. */
  get sinAsuntos(): boolean {
    return !this.cargandoCatalogo && !!this.form?.get('tipo')?.value && this.asuntos.length === 0;
  }

  /**
   * Trae el catálogo y deja el asunto coherente con el tipo.
   *
   * Al cambiar de tipo el asunto anterior deja de valer —es de otro tipo y el
   * servidor lo rechazaría—, así que se limpia. Al abrir para modificar una
   * gestión vieja se respeta el que ya tenía si sigue en la lista.
   */
  private async cargarCatalogo(): Promise<void> {
    try {
      const res: any = await firstValueFrom(this._catalogoService.catalogo());
      this.tipos = res?.status === 'success' ? (res.data ?? []) : [];
    } catch (error) {
      // El AuthInterceptor ya muestra el toast del error HTTP
      console.error('Error al cargar el catálogo de gestión:', error);
      this.tipos = [];
    } finally {
      this.cargandoCatalogo = false;
    }

    // El tipo que trae la gestión puede estar desactivado: se añade a la lista
    // para que el combo no aparezca vacío al abrir una del historial.
    const codigo = this.form?.get('tipo')?.value;
    if (codigo && !this.tipos.some(t => t.codigo === codigo)) {
      this.tipos = [...this.tipos, { id: 0, codigo, nombre: codigo, icono: null, asuntos: [] }];
    }

    this.ajustarAsunto();
    this.form?.get('tipo')?.valueChanges.subscribe(() => this.ajustarAsunto(true));
  }

  /** El asunto tiene que ser de los del tipo; si no lo es, se queda vacío. */
  private ajustarAsunto(cambioElTipo = false): void {
    const ctrl = this.form?.get('asunto_id');
    if (!ctrl) { return; }

    const actual = Number(ctrl.value) || null;
    const sigue = this.asuntos.some(a => a.id === actual);

    if (cambioElTipo || !sigue) {
      ctrl.setValue(sigue && !cambioElTipo ? actual : null);
    }
  }

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
    this.cargarCatalogo();
  }

  /** Programada mientras esté PENDIENTE; el resto, realizada. */
  get esProgramada(): boolean {
    return this.form?.get('estado')?.value === 'PENDIENTE';
  }

  /**
   * «En este momento»: realizada, pero la hora se pone al guardar.
   *
   * Es distinto de «Ya la hice»: ahí la hora que se propone es la de abrir el
   * formulario, y entre abrirlo y guardarlo pueden pasar diez minutos de
   * conversación. Para una llamada que se está atendiendo ahora, la hora buena
   * es la de cuando se termina de escribir.
   *
   * No es un estado distinto para la base: sigue siendo REALIZADA.
   */
  public ahoraMismo = false;

  get esAhora(): boolean { return this.ahoraMismo && !this.esProgramada; }

  /** Las tres opciones del interruptor de arriba. */
  elegirMomento(cual: 'ahora' | 'hecha' | 'programada'): void {
    this.ahoraMismo = cual === 'ahora';
    this.ctrlEstado.setValue(cual === 'programada' ? 'PENDIENTE' : 'REALIZADA');
  }

  // ---------- Anchos de la rejilla ----------
  //
  // Van aquí y no en la plantilla porque dependen de qué campos estén a la
  // vista —la fecha desaparece con «En este momento», el resultado con
  // «Programarla», y la persona de contacto sólo sale si el cliente tiene—.
  // Calculados, las filas quedan siempre completas; a mano, cada combinación
  // dejaba un hueco distinto.

  get colTipo(): string      { return this.esAhora ? 'col-12 col-md-4' : 'col-12 col-md-3'; }
  get colPrioridad(): string { return this.esAhora ? 'col-6 col-md-4'  : 'col-6 col-md-3'; }
  get colDuracion(): string  { return this.esAhora ? 'col-6 col-md-4'  : 'col-6 col-md-2'; }

  /** Lo que sobra en su fila: 12 menos el resultado y la persona de contacto. */
  get colAsunto(): string {
    const resto = 12 - (this.esProgramada ? 0 : 3) - (this.contactosCombo.length ? 4 : 0);
    return 'col-12 col-md-' + resto;
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
      // El texto se conserva para poder enseñar el de una gestión vieja, pero
      // ya no se teclea: lo que se guarda y lo que valida es el asunto_id.
      asunto:           [g?.asunto ?? ''],
      asunto_id:        [g?.asunto_id ?? null, [Validators.required]],
      contacto_id:      [g?.contacto_id ?? null],
      telefono:         [g?.telefono ?? this.telefonoInicial ?? this.cliente?.celular ?? this.cliente?.telefono ?? '', [Validators.maxLength(20)]],
      prioridad:        [g?.prioridad ?? 'MEDIA', [Validators.required]],
      fecha_programada: [this.paraInput(g?.fecha_programada) || (estadoInicial === 'PENDIENTE' ? this.enUnaHora() : '')],
      fecha_realizada:  [this.paraInput(g?.fecha_realizada) || (estadoInicial === 'REALIZADA' ? this.ahora() : '')],
      duracion_minutos: [g?.duracion_minutos ?? null, [Validators.min(0), Validators.max(1440)]],
      resultado:        [g?.resultado ?? (estadoInicial === 'REALIZADA' ? 'CONTACTADO' : null)],
      nota:             [g?.nota ?? '', [Validators.maxLength(4000)]],
    });

    // Una gestión nueva que se registra es, casi siempre, la que se acaba de
    // hacer: se arranca en «En este momento» y la hora la pone el guardado.
    // Al corregir una existente se respeta lo que ya tenía.
    this.ahoraMismo = this.modo === 'registrar';

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

    // Programar es lo contrario de «en este momento»: no pueden convivir
    if (programada) { this.ahoraMismo = false; }

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
      const falta = !this.form.get('asunto_id')?.value
        ? 'Elija el asunto de la lista: ya no se escribe a mano.'
        : this.esProgramada && !this.form.get('fecha_programada')?.value
        ? 'Indique la fecha y la hora de la gestión programada.'
        : !this.esProgramada && !this.form.get('resultado')?.value
        ? 'Indique cómo terminó la gestión.'
        : 'Revise los campos del formulario.';
      this._toastr.error(falta, 'No se puede guardar', { timeOut: 8000, closeButton: true });
      return;
    }

    const v = this.form.getRawValue();

    // «En este momento»: la hora es la de ahora, no la de cuando se abrió el
    // formulario. Se calcula aquí, con el guardado ya en marcha.
    if (this.esAhora) { v.fecha_realizada = this.ahora(); }

    const payload: any = {
      cliente_id:       this.cliente.id,
      // Cuál de las tres eligió el vendedor. No lo sabe nadie más: a la base
      // llegan iguales «en este momento» y «ya la hice» (REALIZADA con su
      // fecha), y sin esto no habría forma de separarlas en un reporte.
      modo_registro:    this.esProgramada ? 'PROGRAMADA' : (this.esAhora ? 'AHORA' : 'YA_HECHA'),
      tipo:             v.tipo,
      estado:           v.estado,
      // El texto lo pone el catálogo en el servidor a partir del id; se manda
      // igualmente para que el historial viejo no se quede sin asunto si algún
      // día se abre una gestión anterior al catálogo y se vuelve a guardar.
      asunto:           (v.asunto ?? '').trim() || null,
      asunto_id:        v.asunto_id ? Number(v.asunto_id) : null,
      nota:             (v.nota ?? '').trim() || null,
      // Quien atiende al cliente; si no tiene vendedor va sin dueño
      // El responsable de la gestión es el vendedor del cliente, que desde el
      // cambio de responsables es un USUARIO: así le aparece en su agenda
      usuario_id:       this.cliente.vendedor_id ?? null,
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
