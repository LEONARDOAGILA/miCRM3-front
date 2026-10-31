import { Component, OnDestroy, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { AppStateService } from '../../../../service/app-state.service';

/** Una fila de `accesos` en localStorage: lo que el perfil puede abrir. */
interface Acceso {
  user_id: number;
  nombre: string;
  url: string;
  perfil_nombre: string;
  icono: string;
  padre_id: number | null;
  orden: number;
}

interface ModuloCard {
  url: string;
  label: string;
  icon: string;
  color: string;
  descripcion: string;
}

/**
 * Portada del módulo de Contabilidad: las pantallas que el perfil puede
 * abrir, en tarjetas.
 *
 * Mismo esquema que la portada de Inventarios. Las tarjetas NO son una lista
 * fija: se cruzan con los `accesos` que el login dejó en localStorage, así
 * que quien no tenga una pantalla no la ve aquí tampoco. La URL se compara
 * letra a letra con la del menú, de modo que una mal escrita no da error: la
 * tarjeta simplemente no sale.
 */
@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [RouterModule],
})
export class HomeComponent implements OnInit, OnDestroy {

  public modulosPermitidos: ModuloCard[] = [];

  private destroy$ = new Subject<void>();

  /** Las pantallas del módulo, en el orden en que se usan. */
  private readonly MODULOS_CONFIG: ModuloCard[] = [
    {
      url: 'contabilidad/allPlanCuentas',
      label: 'PLAN DE CUENTAS',
      icon: 'fa-sitemap',
      color: 'bg-indigo',
      descripcion: 'El árbol de cuentas contables, sin tope de niveles: código, tipo, naturaleza y qué cuentas reciben asientos',
    },
    {
      url: 'contabilidad/allCuentasCategorias',
      label: 'CUENTAS POR CATEGORÍA',
      icon: 'fa-sliders',
      color: 'bg-teal',
      descripcion: 'Con qué cuentas se asienta cada categoría de productos: inventario, ingreso, costo, devoluciones y descuentos',
    },
    {
      url: 'contabilidad/allCuentasClientes',
      label: 'CUENTAS POR CLIENTE',
      icon: 'fa-file-invoice-dollar',
      color: 'bg-blue',
      descripcion: 'Con qué cuentas se asienta cada grupo de clientes: cuenta por cobrar, anticipos, intereses por mora e incobrables',
    },
  ];

  constructor(
    private router: Router,
    private appStateService: AppStateService,
  ) {}

  ngOnInit(): void {
    this.cargarModulosPermitidos();

    // Si cambian los accesos sin recargar la página (otro perfil, permisos
    // retocados), las tarjetas se rehacen solas.
    this.appStateService.accesosActualizados$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.cargarModulosPermitidos());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** Deja sólo las pantallas que el perfil tiene concedidas. */
  cargarModulosPermitidos(): void {
    const guardado = localStorage.getItem('accesos');

    if (!guardado) { this.cargarModulosPorDefecto(); return; }

    try {
      const accesos: Acceso[] = JSON.parse(guardado);
      this.modulosPermitidos = this.MODULOS_CONFIG.filter(
        modulo => accesos.some(acceso => acceso.url === modulo.url));
    } catch (error) {
      // Si eso no se puede leer, mejor enseñarlo todo que una pantalla vacía:
      // el guardia de cada ruta sigue estando, así que nadie entra donde no debe
      console.error('Error al leer los accesos:', error);
      this.cargarModulosPorDefecto();
    }
  }

  private cargarModulosPorDefecto(): void {
    this.modulosPermitidos = [...this.MODULOS_CONFIG];
  }

  fun_home(): void {
    this.router.navigate(['/home']);
  }
}
