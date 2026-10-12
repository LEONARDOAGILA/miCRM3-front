import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgxChartsModule } from '@swimlane/ngx-charts';
import { firstValueFrom } from 'rxjs';

///   SERVICIOS    ///
import { GestionService } from '../../../services/gestion.service';
import { AppVariablesService } from '../../../../../service/app-variables.service';

///   MODELOS    ///
import { EstadisticasVentas } from '../../../interfaces/estadisticasModel';
import { TIPOS_GESTION, RESULTADOS_GESTION, nombreDe, iconoDeTipo } from '../../../interfaces/gestionModel';

/**
 * El tablero de ventas.
 *
 * Ocupa el sitio que antes tenía la frase «elige un cliente de la lista»:
 * mientras no hay ninguno elegido, en vez de media pantalla en blanco se ve
 * cómo va la cartera y cómo va el día.
 *
 * Standalone, y el lenguaje visual es el del tablero de la plantilla
 * (components/dashboards/dashboard1): widgets `widget-stats` para los números
 * gordos y ngx-charts para las series. Todo sale de una sola llamada.
 */
@Component({
  selector: 'app-resumen-ventas',
  templateUrl: './resumenVentas.component.html',
  styleUrls: ['./resumenVentas.component.css'],
  standalone: true,
  imports: [
    CommonModule,      // @if/@for no hacen falta, pero sí los pipes number y date
    NgxChartsModule,   // <ngx-charts-line-chart>, <ngx-charts-pie-chart>
  ],
})
export class ResumenVentasComponent implements OnInit {

  /** Cuántos días trae la serie del gráfico. */
  @Input() dias = 14;

  /** «Ver mi agenda»: lo recoge la pantalla para cambiar de pestaña. */
  @Output() irALaAgenda = new EventEmitter<void>();

  public datos: EstadisticasVentas | null = null;
  public cargando = true;
  public error = '';

  /** Los colores del tema, para que los gráficos no desentonen. */
  private appVariables = this._appVariables.getAppVariables();
  public colorLinea = {
    domain: [this.appVariables.color.primary, this.appVariables.color.warning],
  };
  public colorTarta = {
    domain: [
      this.appVariables.color.teal, this.appVariables.color.success, this.appVariables.color.info,
      this.appVariables.color.warning, this.appVariables.color.purple, this.appVariables.color.gray500,
    ],
  };

  /** Lo que comen los gráficos de ngx-charts. */
  public serieDias: { name: string; series: { name: string; value: number }[] }[] = [];
  public serieTipos: { name: string; value: number }[] = [];

  constructor(
    private _gestionService: GestionService,
    private _appVariables: AppVariablesService,
  ) {}

  ngOnInit(): void {
    this.cargar();
  }

  async cargar(): Promise<void> {
    try {
      this.cargando = true;
      this.error = '';

      const res: any = await firstValueFrom(this._gestionService.estadisticas(this.dias));
      if (res?.status !== 'success') {
        this.error = res?.message || 'No se pudieron cargar las estadísticas';
        return;
      }

      this.datos = res.data;
      this.armarSeries();
    } catch (error) {
      // El AuthInterceptor ya avisa del error HTTP; aquí sólo queda el hueco
      console.error('Error al cargar las estadísticas:', error);
      this.error = 'No se pudieron cargar las estadísticas';
    } finally {
      this.cargando = false;
    }
  }

  /** Del jsonb del back a lo que esperan los gráficos. */
  private armarSeries(): void {
    const dias = this.datos?.por_dia ?? [];

    this.serieDias = [
      { name: 'Realizadas',  series: dias.map(d => ({ name: this.diaCorto(d.dia), value: d.realizadas })) },
      { name: 'Programadas', series: dias.map(d => ({ name: this.diaCorto(d.dia), value: d.programadas })) },
    ];

    this.serieTipos = (this.datos?.por_tipo ?? [])
      .map(t => ({ name: nombreDe(TIPOS_GESTION, t.tipo), value: t.cuantas }));
  }

  /** «2026-09-27» → «sáb 27», que es lo que cabe en el eje. */
  private diaCorto(iso: string): string {
    const d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
    if (isNaN(d.getTime())) { return iso; }
    const dia = d.toLocaleDateString('es-EC', { weekday: 'short' }).replace('.', '');
    return `${dia} ${d.getDate()}`;
  }

  // ---------- Ayudas de la plantilla ----------

  nombreResultado = (r: string) => nombreDe(RESULTADOS_GESTION, r);
  iconoTipo = (t: string) => iconoDeTipo(t);

  /** Las horas que se han hablado este mes, para no leer 3.701 minutos. */
  public get horasDelMes(): string {
    const m = this.datos?.gestiones.minutos_mes ?? 0;
    if (m < 60) { return `${m} min`; }
    return `${Math.floor(m / 60)} h ${m % 60} min`;
  }

  /**
   * Qué abarcan las cifras, en una línea.
   *
   * El mismo tablero lo mira un vendedor y lo mira gerencia, y las cifras ya
   * no son las mismas para los dos: sin decir cuáles son, «1001 clientes» y
   * «3 clientes» se leen igual de bien y significan cosas distintas.
   */
  public get alcance(): { icono: string; texto: string } {
    switch (this.datos?.alcance) {
      case 'TODO':   return { icono: 'fa-building', texto: 'Cifras de toda la empresa' };
      case 'EQUIPO': return { icono: 'fa-users',    texto: 'Cifras de tu equipo' };
      default:       return { icono: 'fa-user',     texto: 'Tus cifras' };
    }
  }

  /** Qué parte de la cartera está al día, en porcentaje entero. */
  public get porcentajeActivos(): number {
    const c = this.datos?.clientes;
    if (!c?.total) { return 0; }
    return Math.round((c.activos / c.total) * 100);
  }

  /** De lo que tocaba hoy, cuánto se ha hecho ya. */
  public get avanceDelDia(): number {
    const m = this.datos?.mias;
    if (!m) { return 0; }
    const total = m.hoy + m.realizadas_hoy;
    return total ? Math.round((m.realizadas_hoy / total) * 100) : 0;
  }

  /** La barra de cada vendedor se mide contra el que más cartera tiene. */
  /** Qué parte de la cartera activa tiene un próximo paso agendado. */
  public get porcentajeConProxima(): number {
    const c = this.datos?.cobertura;
    if (!c?.activos) { return 0; }
    return Math.round((c.con_proxima / c.activos) * 100);
  }

  /** Lo mismo al revés, que es la cifra que preocupa. */
  public get porcentajeDormidos(): number {
    const c = this.datos?.cobertura;
    if (!c?.activos) { return 0; }
    return Math.round((c.dormidos / c.activos) * 100);
  }

  /**
   * El color de la tasa de contacto.
   *
   * Los cortes son los de la casa al hablar de llamadas: por debajo de la
   * mitad algo va mal con los horarios o con los números; por encima de tres
   * cuartos se está contactando bien.
   */
  public get tonoTasa(): string {
    const t = this.datos?.efectividad?.tasa_contacto ?? 0;
    if (t >= 75) { return 'text-success'; }
    if (t >= 50) { return 'text-warning'; }
    return 'text-danger';
  }

  /** Minutos a «1 h 20 min», para no enseñar 80 min. */
  public enHoras(minutos: number): string {
    const m = minutos ?? 0;
    if (m < 60) { return `${m} min`; }
    return `${Math.floor(m / 60)} h ${m % 60} min`;
  }

  /** Barra del trabajo por persona, contra quien más hizo. */
  anchoBarraUsuario(realizadas: number): string {
    const mayor = this.datos?.usuarios?.[0]?.realizadas || 1;
    return Math.max(4, Math.round((realizadas / mayor) * 100)) + '%';
  }

  anchoBarra(clientes: number): string {
    const mayor = this.datos?.vendedores?.[0]?.clientes || 1;
    return Math.max(4, Math.round((clientes / mayor) * 100)) + '%';
  }

  anchoBarraCiudad(clientes: number): string {
    const mayor = this.datos?.ciudades?.[0]?.clientes || 1;
    return Math.max(4, Math.round((clientes / mayor) * 100)) + '%';
  }
}
