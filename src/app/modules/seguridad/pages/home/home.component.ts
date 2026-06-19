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

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
  standalone: false,
})
export class HomeComponent implements OnInit, OnDestroy {
  
  today: Date = new Date();
  public mensajes: string[] = [];
  public modulosPermitidos: ModuloCard[] = [];

  // Para manejar la destrucción del componente
  private destroy$ = new Subject<void>();

  // Configuración de los módulos disponibles
  private readonly MODULOS_CONFIG: ModuloCard[] = [
    {
      url: 'seguridad/allUsuarios',
      label: 'USUARIOS',
      icon: 'fa-users',
      color: 'bg-primary',
      descripcion: 'Creación, edición, eliminación, cambio de contraseñas'
    },
    {
      url: 'seguridad/allHorarios',
      label: 'HORARIOS',
      icon: 'fa-chart-line',
      color: 'bg-success',
      descripcion: 'Creación, edición, eliminación de horarios'
    },
    {
      url: 'seguridad/allProfiles',
      label: 'PERFILES',
      icon: 'fa-cubes',
      color: 'bg-info',
      descripcion: 'Creación, edición, eliminación de perfiles y asignación de permisos'
    }
  ];

  constructor(
    private router: Router,
    private appStateService: AppStateService
  ) {}

  ngOnInit(): void {
    this.cargarModulosPermitidos();
    
    // 👇 ESCUCHAR CAMBIOS EN ACCESOS - CON takeUntil PARA EVITAR FUGAS
    this.appStateService.accesosActualizados$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        console.log('Accesos actualizados, recargando...');
        this.cargarModulosPermitidos();
      });
  }

  ngOnDestroy(): void {
    // 👇 LIMPIAR SUSCRIPCIONES
    this.destroy$.next();
    this.destroy$.complete();
  }

  cargarModulosPermitidos(): void {
    const accesosString = localStorage.getItem('accesos');
    
    if (accesosString) {
      try {
        const accesos: Acceso[] = JSON.parse(accesosString);
        
        // Filtrar los módulos que el usuario tiene permitidos
        this.modulosPermitidos = this.MODULOS_CONFIG.filter(modulo => {
          return accesos.some(acceso => acceso.url === modulo.url);
        });
        
        // Agregar botón de salir siempre visible (solo si no está ya agregado)
        const yaTieneSalir = this.modulosPermitidos.some(m => m.label === 'SALIR');
        if (!yaTieneSalir) {
          this.modulosPermitidos.push({
            url: '/home',
            label: 'SALIR',
            icon: 'fa-circle-left',
            color: 'bg-danger',
            descripcion: 'Regresar al menú principal'
          });
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
    this.modulosPermitidos = [...this.MODULOS_CONFIG];
    this.modulosPermitidos.push({
      url: '/home',
      label: 'SALIR',
      icon: 'fa-circle-left',
      color: 'bg-danger',
      descripcion: 'Regresar al menú principal'
    });
  }

  fun_home(): void {
    this.router.navigate(['/home']);
  }
}

