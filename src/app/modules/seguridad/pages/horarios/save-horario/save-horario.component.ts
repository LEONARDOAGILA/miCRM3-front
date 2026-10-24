import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { AbstractControl, FormArray, FormBuilder, FormGroup, ValidationErrors, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';

import { SeguridadService } from '../../../../seguridad/services/seguridad.service';
import { LoadingService } from '../../../../../service/loading.service';
import { HorarioService } from '../../../services/horario.service';
import { ChorarioModel } from '../../../interfaces/chorarioModel';
// Los días y el tope de franjas viven con el detalle, que es a quien
// describen; ChorarioModel es sólo la cabecera.
import { DhorarioModel, DIAS_SEMANA, MAX_JORNADAS_POR_DIA } from '../../../interfaces/dhorarioModel';

/**
 * Alta / edición de un horario de ACCESO AL CRM (seguridad.chorarios).
 *
 * Es el mismo formulario que el de horarios de trabajo, y a propósito: lo que
 * se escribe —los días y sus franjas— es igual en los dos, y que se manejen
 * distinto sólo obliga a aprenderlos dos veces.
 *
 *     form
 *       ├── nombre, descripcion, activo
 *       └── dias: FormArray
 *             └── { dia, activo, jornadas: FormArray de { hora_inicio, hora_fin } }
 *
 * CADA DÍA ADMITE HASTA CUATRO JORNADAS. Antes sólo cabía una, así que para
 * cerrar la hora del almuerzo había que dejarla abierta igual; ahora se abre
 * de 08:00 a 12:00 y de 14:00 a 18:00 y a las 13:00 no entra nadie.
 *
 * El número de jornada no es un campo: es la posición dentro del FormArray del
 * día, y se calcula al guardar. Así quitar la del medio no deja huecos.
 *
 * UNA JORNADA PUEDE CRUZAR LA MEDIANOCHE: si la hora de fin es menor que la de
 * inicio se entiende que termina al día siguiente (22:00 → 06:00), y quien
 * entre a la 01:00 sigue dentro de la franja que empezó ayer.
 *
 * LO QUE NO TIENE, y el de trabajo sí: la tolerancia. Allí son los minutos de
 * gracia antes de contar un atraso; aquí la puerta se abre o no se abre.
 */
@Component({
  selector: 'app-save-horario',
  templateUrl: './save-horario.component.html',
  styleUrls: ['./save-horario.component.css'],
  standalone: false,
})
export class SaveHorarioComponent implements OnInit {

  @Input() registro_selected: any = {};
  @Input() accion: any = {};
  @Output() registrosE: EventEmitter<any> = new EventEmitter();

  public form!: FormGroup;
  public isLoading$ = this._loadingService.isLoading$;
  public isdisabled = false;
  public titulo = '';
  public textoClon = '';
  public horario?: ChorarioModel;

  public readonly diasSemana = DIAS_SEMANA;
  public readonly maxJornadas = MAX_JORNADAS_POR_DIA;

  constructor(
    private _fb: FormBuilder,
    private _toastr: ToastrService,
    public modal: NgbActiveModal,
    private _loadingService: LoadingService,
    private _seguridadService: SeguridadService,
    private _horarioService: HorarioService,
  ) {}

  async ngOnInit(): Promise<void> {
    if (this._seguridadService.isexpired()) {
      this.modal.close();
      return;
    }

    switch (this.accion) {
      case 'add':
        this.titulo = 'Nuevo horario de acceso';
        this.initializeForm();
        // Se arranca con el lunes puesto: un horario vacío no sirve de nada
        this.agregarDia();
        break;
      case 'edit':
        this.titulo = 'Modificar horario de acceso';
        this.initializeForm();
        await this.cargar(this.registro_selected.id);
        break;
      case 'clon':
        this.titulo = 'Clonar horario de acceso';
        this.textoClon = '_CLON';
        this.initializeForm();
        await this.cargar(this.registro_selected.id);
        break;
      case 'view':
        this.titulo = 'Ver horario de acceso';
        this.isdisabled = true;
        this.initializeForm();
        await this.cargar(this.registro_selected.id);
        break;
    }
  }

  // ================================================================
  // EL FORMULARIO
  // ================================================================

  initializeForm(): void {
    this.form = this._fb.group({
      nombre:      [{ value: '', disabled: this.isdisabled }, [Validators.required, Validators.minLength(3), Validators.maxLength(100)]],
      descripcion: [{ value: '', disabled: this.isdisabled }, [Validators.maxLength(250)]],
      activo:      [{ value: true, disabled: this.isdisabled }],
      dias: this._fb.array([], this.validarDiasUnicos),
    });
  }

  get dias(): FormArray {
    return this.form.get('dias') as FormArray;
  }

  /** Las jornadas de la fila indicada. */
  jornadasDe(i: number): FormArray {
    return this.dias.at(i).get('jornadas') as FormArray;
  }

  private nuevaJornada(inicio = '08:00', fin = '17:00'): FormGroup {
    return this._fb.group({
      hora_inicio: [{ value: inicio, disabled: this.isdisabled }, Validators.required],
      hora_fin:    [{ value: fin,    disabled: this.isdisabled }, Validators.required],
    }, { validators: this.validarHoras });
  }

  private nuevoDia(dia: number, jornadas: FormGroup[] = []): FormGroup {
    return this._fb.group({
      dia:    [{ value: dia, disabled: this.isdisabled }, Validators.required],
      activo: [{ value: true, disabled: this.isdisabled }],
      jornadas: this._fb.array(jornadas.length ? jornadas : [this.nuevaJornada()],
                               [Validators.required, this.validarSolapes]),
    });
  }

  // ================================================================
  // CARGAR
  // ================================================================

  async cargar(id: number): Promise<void> {
    try {
      this._loadingService.setLoading(true);
      const res: any = await firstValueFrom(this._horarioService.getHorario(id));

      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo cargar el horario', 'Error');
        this.modal.close();
        return;
      }

      this.horario = res.data;
      const nombre = (this.horario!.nombre ?? '') + this.textoClon;

      this.form.patchValue({
        nombre,
        descripcion: this.horario!.descripcion ?? '',
        activo:      this.horario!.activo,
      });

      // Las jornadas llegan en una lista plana ordenada por día y jornada;
      // aquí se agrupan por día, que es como se editan.
      this.dias.clear();
      const porDia = new Map<number, DhorarioModel[]>();
      for (const j of (this.horario!.jornadas ?? [])) {
        if (!porDia.has(j.dia)) { porDia.set(j.dia, []); }
        porDia.get(j.dia)!.push(j);
      }

      [...porDia.keys()].sort((a, b) => a - b).forEach(dia => {
        const delDia = porDia.get(dia)!.sort((a, b) => (a.jornada ?? 0) - (b.jornada ?? 0));
        this.dias.push(this.nuevoDia(dia, delDia.map(j => this.nuevaJornada(j.hora_inicio, j.hora_fin))));
        // El «activo» del día es el de sus jornadas (todas van juntas)
        this.dias.at(this.dias.length - 1).get('activo')!
            .setValue(delDia.every(j => j.activo !== false), { emitEvent: false });
      });

      if (!this.dias.length) { this.agregarDia(); }

      if (this.isdisabled) { this.form.disable(); }

    } catch (error: any) {
      console.error('Error al cargar el horario:', error);
      this._toastr.error('No se pudo cargar el horario', 'Error');
      this.modal.close();
    } finally {
      this._loadingService.setLoading(false);
    }
  }

  // ================================================================
  // DÍAS Y JORNADAS
  // ================================================================

  /** El primer día de la semana que todavía no está; null si ya están los 7. */
  private primerDiaLibre(): number | null {
    const usados = new Set(this.dias.controls.map(c => c.get('dia')?.value));
    return this.diasSemana.find(d => !usados.has(d.id))?.id ?? null;
  }

  /**
   * Reordena las filas por día (lunes → domingo).
   *
   * Se reutilizan los mismos FormGroup en lugar de recrearlos: así se
   * conservan los valores ya escritos y el estado touched/dirty de cada
   * control, que es lo que decide qué mensajes de error se ven.
   */
  private ordenarPorDia(): void {
    const ordenados = [...this.dias.controls].sort(
      (a, b) => (a.get('dia')?.value ?? 0) - (b.get('dia')?.value ?? 0)
    );
    // emitEvent:false para no disparar la validación en cada paso intermedio
    while (this.dias.length > 0) { this.dias.removeAt(0, { emitEvent: false }); }
    ordenados.forEach(c => this.dias.push(c, { emitEvent: false }));
    this.dias.updateValueAndValidity();
  }

  agregarDia(): void {
    const dia = this.primerDiaLibre();
    if (dia === null) {
      this._toastr.warning('Ya están los siete días de la semana', 'Advertencia');
      return;
    }
    this.dias.push(this.nuevoDia(dia));
    this.ordenarPorDia();
  }

  quitarDia(i: number): void {
    if (this.dias.length <= 1) {
      this._toastr.warning('El horario necesita al menos un día', 'Advertencia');
      return;
    }
    this.dias.removeAt(i);
  }

  agregarJornada(i: number): void {
    const jornadas = this.jornadasDe(i);
    if (jornadas.length >= this.maxJornadas) {
      this._toastr.warning(`Cada día admite hasta ${this.maxJornadas} jornadas`, 'Advertencia');
      return;
    }
    // La nueva empieza donde acabó la anterior, que es lo más común en un
    // turno partido; con eso casi siempre sólo hay que tocar la hora de fin.
    const ultima = jornadas.at(jornadas.length - 1);
    const desde = ultima?.get('hora_fin')?.value || '14:00';
    jornadas.push(this.nuevaJornada(desde, this.masUnaHora(desde)));
  }

  quitarJornada(i: number, j: number): void {
    const jornadas = this.jornadasDe(i);
    if (jornadas.length <= 1) {
      this._toastr.warning('El día necesita al menos una jornada; si no trabaja, quite el día', 'Advertencia');
      return;
    }
    jornadas.removeAt(j);
  }

  /** «14:00» → «15:00», para proponer algo razonable al agregar. */
  private masUnaHora(hora: string): string {
    const [h, m] = (hora || '08:00').split(':').map(n => parseInt(n, 10));
    const siguiente = ((isNaN(h) ? 8 : h) + 1) % 24;
    return `${String(siguiente).padStart(2, '0')}:${String(isNaN(m) ? 0 : m).padStart(2, '0')}`;
  }

  /**
   * Copia las jornadas de este día a todos los demás que ya están puestos.
   *
   * Es el caso de siempre: se escribe el lunes y de lunes a viernes es igual.
   * Sólo toca los días que YA están en la lista; no agrega ninguno.
   */
  copiarADemasDias(i: number): void {
    if (this.isdisabled) { return; }
    if (this.dias.length <= 1) {
      this._toastr.info('No hay otros días a los que copiar', 'Copiar jornadas');
      return;
    }

    const origen = this.jornadasDe(i).getRawValue() as { hora_inicio: string; hora_fin: string }[];

    this.dias.controls.forEach((control, k) => {
      if (k === i) { return; }
      const destino = control.get('jornadas') as FormArray;
      destino.clear();
      origen.forEach(j => destino.push(this.nuevaJornada(j.hora_inicio, j.hora_fin)));
      destino.updateValueAndValidity();
    });

    this._toastr.success(`Copiado a los otros ${this.dias.length - 1} días`, 'Jornadas copiadas',
                         { closeButton: true });
  }

  // ================================================================
  // VALIDADORES
  // ================================================================

  /** No se puede poner dos veces el mismo día de la semana. */
  private validarDiasUnicos(formArray: AbstractControl): ValidationErrors | null {
    const dias = (formArray as FormArray).controls
      .map(c => c.get('dia')?.value)
      .filter(d => d !== null && d !== undefined);
    const repetido = dias.some((d, i) => dias.indexOf(d) !== i);
    return repetido ? { diasDuplicados: true } : null;
  }

  /** Una jornada no puede empezar y terminar a la misma hora. */
  private validarHoras(group: AbstractControl): ValidationErrors | null {
    const inicio = group.get('hora_inicio')?.value;
    const fin = group.get('hora_fin')?.value;
    if (!inicio || !fin) { return null; }
    return inicio === fin ? { horaIgual: true } : null;
  }

  /**
   * Las jornadas de un mismo día no se pueden pisar.
   *
   * Es la MISMA regla que aplica la base; se comprueba también aquí para no
   * tener que ir al servidor a enterarse. Cada jornada se mide en minutos
   * desde las 00:00, y la que cruza la medianoche se extiende más allá de
   * 1440 en lugar de dar la vuelta.
   */
  private validarSolapes(formArray: AbstractControl): ValidationErrors | null {
    const tramos: { a: number; b: number }[] = [];

    for (const control of (formArray as FormArray).controls) {
      const ini = control.get('hora_inicio')?.value;
      const fin = control.get('hora_fin')?.value;
      if (!ini || !fin || ini === fin) { return null; }   // ya lo dice otro validador

      const minutos = (h: string) => {
        const [hh, mm] = h.split(':').map(n => parseInt(n, 10));
        return (hh || 0) * 60 + (mm || 0);
      };
      const a = minutos(ini);
      const bCrudo = minutos(fin);
      tramos.push({ a, b: bCrudo > a ? bCrudo : bCrudo + 1440 });
    }

    for (let i = 0; i < tramos.length; i++) {
      for (let j = i + 1; j < tramos.length; j++) {
        if (tramos[i].a < tramos[j].b && tramos[j].a < tramos[i].b) {
          return { jornadasSolapadas: true };
        }
      }
    }
    return null;
  }

  /** Si la fila indicada tiene el día repetido (para marcarla en la tabla). */
  esDiaDuplicado(i: number): boolean {
    const dia = this.dias.at(i)?.get('dia')?.value;
    if (dia === null || dia === undefined) { return false; }
    return this.dias.controls.some((c, k) => k !== i && c.get('dia')?.value === dia);
  }

  /** Si esa jornada termina al día siguiente, para avisarlo sin dar error. */
  cruzaMedianoche(i: number, j: number): boolean {
    const g = this.jornadasDe(i).at(j);
    const ini = g?.get('hora_inicio')?.value;
    const fin = g?.get('hora_fin')?.value;
    return !!ini && !!fin && fin < ini;
  }

  /** Lo que dura una jornada, ya contando el cruce de medianoche. */
  duracion(i: number, j: number): string {
    const g = this.jornadasDe(i).at(j);
    const ini = g?.get('hora_inicio')?.value;
    const fin = g?.get('hora_fin')?.value;
    if (!ini || !fin || ini === fin) { return ''; }

    const min = (h: string) => {
      const [hh, mm] = h.split(':').map(n => parseInt(n, 10));
      return (hh || 0) * 60 + (mm || 0);
    };
    let total = min(fin) - min(ini);
    if (total < 0) { total += 1440; }

    const horas = Math.floor(total / 60);
    const resto = total % 60;
    return resto ? `${horas}h ${resto}m` : `${horas}h`;
  }

  /** Las horas de trabajo a la semana, con lo que hay escrito ahora mismo. */
  get horasSemana(): number {
    let total = 0;
    this.dias.controls.forEach((dia, i) => {
      if (dia.get('activo')?.value === false) { return; }
      this.jornadasDe(i).controls.forEach((_, j) => {
        const texto = this.duracion(i, j);
        if (!texto) { return; }
        const horas = /(\d+)h/.exec(texto);
        const minutos = /(\d+)m/.exec(texto);
        total += (horas ? parseInt(horas[1], 10) * 60 : 0) + (minutos ? parseInt(minutos[1], 10) : 0);
      });
    });
    return Math.round((total / 60) * 100) / 100;
  }

  /** Cuántas jornadas hay en total, para el contador de la cabecera. */
  get totalJornadas(): number {
    return this.dias.controls.reduce((n, _, i) => n + this.jornadasDe(i).length, 0);
  }

  // ================================================================
  // PROBAR EL ACCESO
  // ================================================================
  //
  // Para lo que existe este horario: ver, antes de ponérselo a nadie, si a tal
  // día y hora se podría entrar al sistema. Se evalúa SOBRE LO GUARDADO, así
  // que sólo aparece si el horario ya existe.

  public pruebaFecha = '';
  public prueba?: { permitido: boolean; mensaje?: string; jornada?: number; desde?: string; hasta?: string; franjas?: string };
  public probando = false;

  get puedeProbar(): boolean {
    return this.accion !== 'add' && this.accion !== 'clon' && !!this.registro_selected?.id;
  }

  async probar(): Promise<void> {
    if (!this.puedeProbar || !this.pruebaFecha) {
      this._toastr.info('Indique una fecha y una hora', 'Probar el acceso');
      return;
    }
    try {
      this.probando = true;
      // El <input type="datetime-local"> da «2026-10-26T08:20»
      const cuando = this.pruebaFecha.replace('T', ' ');
      const res: any = await firstValueFrom(this._horarioService.puedeEntrar(this.registro_selected.id, cuando));
      this.prueba = res?.status === 'success' ? res.data : undefined;
      if (!this.prueba) {
        this._toastr.error(res?.message || 'No se pudo comprobar', 'Error');
      }
    } catch (error) {
      console.error('Error al comprobar el acceso:', error);
    } finally {
      this.probando = false;
    }
  }

  /** El color del resultado de la prueba. */
  get colorPrueba(): string {
    return this.prueba?.permitido ? 'prueba--bien' : 'prueba--mal';
  }

  // ================================================================
  // GUARDAR
  // ================================================================

  /**
   * El formulario, en la forma que espera el servidor: una lista plana de
   * franjas con su día y su número, bajo la clave `dhorario`.
   *
   * El número sale de la POSICIÓN dentro del día, no de un campo: así quitar
   * la jornada del medio no deja un hueco (1, 3) que la base rechazaría.
   */
  private datosParaGuardar(): any {
    const crudo = this.form.getRawValue();
    const dhorario: any[] = [];

    crudo.dias.forEach((dia: any) => {
      dia.jornadas.forEach((j: any, k: number) => {
        dhorario.push({
          dia:         dia.dia,
          jornada:     k + 1,
          hora_inicio: j.hora_inicio,
          hora_fin:    j.hora_fin,
          activo:      dia.activo !== false,
        });
      });
    });

    return {
      nombre:      crudo.nombre,
      descripcion: crudo.descripcion || null,
      activo:      crudo.activo,
      dhorario,
    };
  }

  async onSubmitForm(_evento?: any): Promise<void> {
    this.form.markAllAsTouched();

    if (this.form.invalid) {
      this._toastr.error('Revise los campos del formulario.', 'No se puede guardar',
                         { timeOut: 20000, closeButton: true });
      return;
    }

    const datos = this.datosParaGuardar();
    if (!datos.dhorario.length) {
      this._toastr.error('El horario necesita al menos una jornada', 'No se puede guardar');
      return;
    }

    try {
      this._loadingService.setLoading(true);
      this.isdisabled = true;

      const peticion = this.accion === 'edit'
        ? this._horarioService.editHorario(this.registro_selected.id, datos)
        : this._horarioService.addHorario(datos);

      const res: any = await firstValueFrom(peticion);

      if (res?.status === 'success' && res?.data) {
        this.registrosE.emit(res.data);
        this._toastr.success(res.message, 'Éxito', { closeButton: true });
        this.modal.close();
      } else {
        this._toastr.error(res?.message || 'No se pudo guardar', 'Error');
      }

    } catch (error) {
      // El AuthInterceptor ya muestra el toast del error HTTP
      console.error('Error al guardar el horario:', error);
    } finally {
      this.isdisabled = false;
      this._loadingService.setLoading(false);
    }
  }
}
