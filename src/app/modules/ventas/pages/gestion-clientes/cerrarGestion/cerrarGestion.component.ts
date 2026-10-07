import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';

import { GestionService } from '../../../services/gestion.service';
import { soloTexto } from '../../../interfaces/plantillasWhatsapp';
import { LoadingService } from '../../../../../service/loading.service';
import {
  GestionModel, PRIORIDADES_GESTION, RESULTADOS_GESTION, TIPOS_GESTION, nombreDe,
} from '../../../interfaces/gestionModel';

/**
 * Cerrar una gestión programada: se marca realizada con su resultado y, en la
 * misma pantalla, se puede dejar agendado el seguimiento.
 *
 * Es el paso que mantiene viva la cartera: casi ninguna llamada termina en sí
 * misma, y obligar a abrir otro formulario para agendar la siguiente hace que
 * no se agende nunca. Por eso «Volver a llamar» marca el seguimiento solo.
 */
@Component({
  selector: 'app-cerrarGestion',
  templateUrl: './cerrarGestion.component.html',
  styleUrls: ['./cerrarGestion.component.css'],
  standalone: false,
})
export class CerrarGestionComponent implements OnInit {

  @Input() gestion: GestionModel | null = null;

  @Output() cerrada = new EventEmitter<any>();

  public form!: FormGroup;
  public isLoading$ = this._loadingService.isLoading$;
  public guardando = false;

  public tipos = TIPOS_GESTION;
  public prioridades = PRIORIDADES_GESTION;
  public resultados = RESULTADOS_GESTION;

  constructor(
    private fb: FormBuilder,
    public modal: NgbActiveModal,
    private _toastr: ToastrService,
    private _loadingService: LoadingService,
    private _gestionService: GestionService,
  ) {}

  get ctrlNota(): FormControl { return this.form.controls['nota'] as FormControl; }

  ngOnInit(): void {
    this.form = this.fb.group({
      resultado:        ['CONTACTADO', [Validators.required]],
      duracion_minutos: [this.gestion?.duracion_minutos ?? null, [Validators.min(0), Validators.max(1440)]],
      nota:             [this.gestion?.nota ?? '', [Validators.maxLength(4000)]],

      // El seguimiento
      programar:        [false],
      sig_fecha:        [this.enUnosDias(2)],
      sig_asunto:       [`Seguimiento: ${this.gestion?.asunto ?? ''}`.substring(0, 200)],
      sig_tipo:         [this.gestion?.tipo ?? 'LLAMADA'],
      sig_prioridad:    [this.gestion?.prioridad ?? 'MEDIA'],
      sig_nota:         [''],
    });

    // Los resultados que piden continuar dejan marcado el seguimiento
    this.form.get('resultado')?.valueChanges.subscribe((r: string) => {
      if (['VOLVER_A_LLAMAR', 'NO_CONTESTA', 'BUZON', 'COTIZACION'].includes(r)) {
        this.form.get('programar')?.setValue(true);
      }
    });
  }

  get ctrlProgramar(): FormControl { return this.form.controls['programar'] as FormControl; }

  get quiereSeguimiento(): boolean { return this.form?.get('programar')?.value === true; }

  get textoResultado(): string { return nombreDe(this.resultados, this.form?.get('resultado')?.value); }

  private aTexto(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  private enUnosDias(dias: number): string {
    const d = new Date();
    d.setDate(d.getDate() + dias);
    d.setHours(9, 0, 0, 0);
    return this.aTexto(d);
  }

  public async onSubmitForm($ev?: any): Promise<void> {
    $ev?.preventDefault?.();
    this._toastr.clear();
    this.form.markAllAsTouched();

    if (!this.gestion?.id) { return; }
    if (this.form.invalid) {
      this._toastr.error('Revise los campos del formulario.', 'No se puede cerrar', { timeOut: 8000, closeButton: true });
      return;
    }
    const v = this.form.getRawValue();
    if (v.programar && !v.sig_fecha) {
      this._toastr.error('El seguimiento necesita fecha y hora.', 'No se puede cerrar', { timeOut: 8000, closeButton: true });
      return;
    }

    const payload: any = {
      resultado: v.resultado,
      // «<p></p>» es el editor vacio, no una nota
      nota: soloTexto(v.nota) ? (v.nota ?? '').trim() : null,
      duracion_minutos: v.duracion_minutos === '' || v.duracion_minutos === null ? null : Number(v.duracion_minutos),
    };
    if (v.programar) {
      payload.siguiente = {
        fecha: v.sig_fecha,
        asunto: (v.sig_asunto ?? '').trim() || null,
        tipo: v.sig_tipo,
        prioridad: v.sig_prioridad,
        nota: (v.sig_nota ?? '').trim() || null,
      };
    }

    try {
      this.guardando = true;
      this._loadingService.setLoading(true);

      const res: any = await firstValueFrom(this._gestionService.cerrarGestion(this.gestion.id, payload));
      if (res?.status !== 'success') {
        this._toastr.error(res?.message || 'No se pudo cerrar la gestión', 'Error');
        return;
      }

      this.cerrada.emit(res.data);
      this._toastr.success(res.message, 'Éxito', { closeButton: true });
      this.modal.close(res.data);
    } catch (error) {
      // El AuthInterceptor ya muestra el toast del error HTTP
      console.error('Error al cerrar la gestión:', error);
    } finally {
      this.guardando = false;
      this._loadingService.setLoading(false);
    }
  }
}
