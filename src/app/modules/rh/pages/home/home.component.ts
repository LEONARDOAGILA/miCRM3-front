import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { AppStateService } from '../../../../service/app-state.service';

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
 * Home del módulo RH: tarjetas con las opciones a las que el perfil tiene
 * acceso (mismo esquema que seguridad/pages/home). Las opciones se filtran
 * contra los accesos guardados en el login (localStorage.accesos, por url).
 */
@Component({
  selector: 'app-home-rh',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
  standalone: false,
})
export class HomeComponent implements OnInit, OnDestroy {

  today: Date = new Date();
  public modulosPermitidos: ModuloCard[] = [];

  private destroy$ = new Subject<void>();

  // Opciones del módulo. La url debe coincidir con la del menú (seguridad.menus)
  // para que el acceso del perfil la habilite.
  private readonly MODULOS_CONFIG: ModuloCard[] = [
    {
      url: 'rh/allCargos',
      label: 'CARGOS',
      icon: 'fa-id-badge',
      color: 'bg-primary',
      descripcion: 'Cargos de la empresa: nivel jerárquico, salario base y estado'
    },
    {
      url: 'rh/allDepartamentos',
      label: 'DEPARTAMENTOS',
      icon: 'fa-briefcase',
      color: 'bg-success',
      descripcion: 'Departamentos de la empresa: código, responsable y estado'
    },
    {
      url: 'rh/allEmpleados',
      label: 'EMPLEADOS',
      icon: 'fa-users',
      color: 'bg-warning',
      descripcion: 'Ficha del empleado con foto, cargo, departamento, jefe y contacto'
    },
    {
      url: 'rh/allMarcaciones',
      label: 'MARCACIONES',
      icon: 'fa-clipboard-list',
      color: 'bg-info',
      descripcion: 'Entradas y salidas: listado con filtros, correcciones y horas trabajadas'
    },
    {
      url: 'rh/kioscoMarcacion',
      label: 'KIOSCO DE MARCACIÓN',
      icon: 'fa-camera',
      color: 'bg-danger',
      descripcion: 'Reconocimiento facial para que el empleado marque su entrada o salida'
    },
  ];

  constructor(
    private router: Router,
    private appStateService: AppStateService
  ) {}

  ngOnInit(): void {
    this.cargarModulosPermitidos();

    this.appStateService.accesosActualizados$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        console.log('Accesos actualizados, recargando...');
        this.cargarModulosPermitidos();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** Tarjeta fija de salida, como en el home de seguridad. */
  private readonly SALIR: ModuloCard = {
    url: '/home',
    label: 'SALIR',
    icon: 'fa-circle-left',
    color: 'bg-danger',
    descripcion: 'Regresar al menú principal'
  };

  cargarModulosPermitidos(): void {
    const accesosString = localStorage.getItem('accesos');

    if (accesosString) {
      try {
        const accesos: Acceso[] = JSON.parse(accesosString);

        // Filtrar los módulos que el usuario tiene permitidos (por url del menú)
        this.modulosPermitidos = this.MODULOS_CONFIG.filter(modulo =>
          accesos.some(acceso => acceso.url === modulo.url)
        );

        // Botón de salir siempre visible (solo si no está ya agregado)
        if (!this.modulosPermitidos.some(m => m.label === 'SALIR')) {
          this.modulosPermitidos.push({ ...this.SALIR });
        }
      } catch (error) {
        console.error('Error al parsear accesos:', error);
        this.cargarModulosPorDefecto();
      }
    } else {
      this.cargarModulosPorDefecto();
    }
  }

  cargarModulosPorDefecto(): void {
    this.modulosPermitidos = [...this.MODULOS_CONFIG, { ...this.SALIR }];
  }

  fun_home(): void {
    this.router.navigate(['/home']);
  }
}
