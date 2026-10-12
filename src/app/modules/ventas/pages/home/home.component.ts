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
 * Home del módulo Ventas: tarjetas con las opciones a las que el perfil tiene
 * acceso (mismo esquema que rh/pages/home). Las opciones se filtran contra los
 * accesos guardados en el login (localStorage.accesos, por url).
 */
@Component({
  selector: 'app-home-ventas',
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
      url: 'ventas/allClientes',
      label: 'CLIENTES',
      icon: 'fa-address-book',
      color: 'bg-primary',
      descripcion: 'Ficha del cliente: identificación, contactos, dirección en el mapa y condiciones de crédito'
    },
    {
      url: 'ventas/gestionClientes',
      label: 'GESTIÓN DE CLIENTES',
      icon: 'fa-headset',
      color: 'bg-success',
      descripcion: 'Llamadas hechas y programadas, seguimiento de la cartera y reasignación de vendedor'
    },
    {
      url: 'ventas/catalogoGestion',
      label: 'CATÁLOGO DE GESTIONES',
      icon: 'fa-list-check',
      color: 'bg-info',
      descripcion: 'Tipos de gestión, asuntos y los mensajes que se proponen al registrarlas'
    },
    {
      // Sólo le sale a quien tenga el menú: el reparto está restringido por
      // perfil, papel a papel, y la pantalla lo vuelve a comprobar
      url: 'ventas/asignacionClienteMasiva',
      label: 'REPARTO DE CLIENTES',
      icon: 'fa-people-arrows',
      color: 'bg-warning',
      descripcion: 'Asignar vendedor, cobrador, asistente o postventa a muchos clientes de una vez'
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
        this.cargarModulosPermitidos();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** Tarjeta fija de salida, como en el home de RH. */
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
