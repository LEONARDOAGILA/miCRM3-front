import { Component, OnInit, OnDestroy, ElementRef } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { NgScrollbarModule } from 'ngx-scrollbar';
import { Subject, takeUntil, interval } from 'rxjs';
import { Dashboard1Component } from '../../components/dashboards/dashboard1/dashboard1.component';
import { Dashboard2Component } from '../../components/dashboards/dashboard2/dashboard2.component';
import { Dashboard3Component } from '../../components/dashboards/dashboard3/dashboard3.component';
import { ContactanosComponent } from '../../components/contactanos/contactanos.component';
import { AppSettings } from '../../service/app-settings.service';
import { ECHO_PUSHER } from "../../config/config";
import { SeguridadService } from "../../modules/seguridad/services/seguridad.service";
import { WebsocketNotificationService } from '../../service/websocket-notification.service';
import { AppStateService } from '../../service/app-state.service';

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
  action?: string;
}

interface ActivityItem {
  icon: string;
  title: string;
  time: string;
  color: string;
}

/**
 * Standalone para que los @defer de la plantilla generen trozos de verdad.
 *
 * Un @defer sólo separa el código de un componente si puede quitar la
 * referencia estática a él. Cuando el anfitrión está declarado en un NgModule,
 * esa referencia vive en el array imports del módulo y el empaquetador no
 * puede quitarla: el componente se pinta tarde, pero se descarga con main.js.
 * Con el anfitrión standalone la referencia está en este fichero y sólo se
 * usa dentro de los @defer, así que el compilador la convierte en import().
 */
@Component({
  selector: 'home',
  templateUrl: './home.html',
  styleUrls: ['./home.scss'],
  standalone: true,
  imports: [
    DatePipe,            // | date del pie
    RouterLink,          // [routerLink] de las tarjetas y los accesos directos
    NgScrollbarModule,   // <ng-scrollbar>
    // Sólo se usan dentro de bloques @defer: se descargan al pulsar su pestaña
    Dashboard1Component,
    Dashboard2Component,
    Dashboard3Component,
    ContactanosComponent
  ]
})
export class HomePage implements OnInit, OnDestroy {
  today: Date = new Date();
  public horaActual: string = '';
  public fechaActual: string = '';
  public mensajes: string[] = [];
  public modulosPermitidos: ModuloCard[] = [];

  // ---------- Pestañas MÉTRICAS ----------
  // Cada bandera dispara el @defer (when ...) de su pestaña. Se ponen a true
  // al pulsar la pestaña y no vuelven a false: @defer carga una vez y el
  // componente se queda creado, que es lo que se quiere al cambiar de pestaña.
  public metricas1Activa = false;
  public metricas2Activa = false;
  public metricas3Activa = false;
  public contactanosActivo = false;

  private destroy$ = new Subject<void>();

  recentActivities: ActivityItem[] = [
    { icon: 'fa fa-user-edit', title: 'Perfil actualizado', time: 'Hace 5 min', color: '#348fe2' },
    { icon: 'fa fa-calendar-plus', title: 'Evento creado', time: 'Hace 15 min', color: '#00acac' },
    { icon: 'fa fa-cog', title: 'Ajustes modificados', time: 'Hace 1 hora', color: '#f59c1a' },
    { icon: 'fa fa-envelope', title: 'Mensaje enviado', time: 'Hace 2 horas', color: '#ff5b57' },
    { icon: 'fa fa-database', title: 'Backup realizado', time: 'Hace 3 horas', color: '#727cb6' }
  ];

  // Configuración de todos los módulos disponibles
  private readonly TODOS_LOS_MODULOS: ModuloCard[] = [
    { url: '/crm', label: 'CRM', icon: 'fa-users', color: 'bg-primary', descripcion: 'Clientes, contactos, oportunidades' },
    { url: '/ventas', label: 'Ventas', icon: 'fa-chart-line', color: 'bg-success', descripcion: 'Cotizaciones, pedidos, facturación' },
    { url: '/inventarios', label: 'Inventario', icon: 'fa-cubes', color: 'bg-info', descripcion: 'Stock, productos, almacenes' },
    { url: '/finanzas', label: 'Finanzas', icon: 'fa-file-invoice-dollar', color: 'bg-warning', descripcion: 'Cuentas por cobrar/pagar, reportes' },
    { url: '/contabilidad', label: 'Contabilidad', icon: 'fa-coins', color: 'bg-danger', descripcion: 'Libro diario, mayor, balances' },
    { url: '/compras', label: 'Compras', icon: 'fa-box-open', color: 'bg-purple', descripcion: 'Órdenes de compra, proveedores' },
    { url: '/tesoreria', label: 'Tesorería', icon: 'fa-money-bill-wave', color: 'bg-pink', descripcion: 'Flujo de caja, bancos, conciliación' },
    { url: '/activos-fijos', label: 'Activos Fijos', icon: 'fa-building', color: 'bg-secondary', descripcion: 'Depreciaciones, bajas, control' },
    { url: '/logistica', label: 'Logística', icon: 'fa-truck', color: 'bg-teal', descripcion: 'Transporte, rutas, entregas' },
    { url: '/rrhh', label: 'RRHH', icon: 'fa-users-gear', color: 'bg-orange', descripcion: 'Empleados, nómina, reclutamiento' },
    { url: '/reportes', label: 'Reportes', icon: 'fa-chart-pie', color: 'bg-indigo', descripcion: 'Dashboards, BI, análisis' },
    { url: '', label: 'Seguridad', icon: 'fa-shield-alt', color: 'bg-dark', descripcion: 'Roles, permisos, auditoría', action: 'seguridad' }
  ];

  constructor(
    private router: Router,
    private elRef: ElementRef,
    public appSettings: AppSettings,
    private _seguridadService: SeguridadService,
    private _wsNotifService: WebsocketNotificationService,
    private appStateService: AppStateService
  ) {
    this.appSettings.appContentFullHeight = true;
    this.appSettings.appContentClass = 'p-0 ';

    // Marca #app para poder ajustar desde styles.css el hueco que deja la
    // cabecera fija en móvil. appClass está enlazado a [class] de #app en
    // app.component.html y no lo usaba nadie.
    this.appSettings.appClass = 'home-page';
    this.elRef.nativeElement.classList.add('d-flex', 'flex-column', 'h-100');
  }

  ngOnInit() {
    this.appSettings.appThemePanelNone = false;
    
    // Cargar módulos permitidos
    this.cargarModulosPermitidos();
    
    // Reloj en tiempo real
    this.actualizarHora();
    interval(1000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.actualizarHora();
      });
    
    // Escuchar cambios en accesos
    this.appStateService.accesosActualizados$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        console.log('Accesos actualizados, recargando módulos...');
        this.cargarModulosPermitidos();
      });

    // WebSocket
    console.log('🟢 Websocket escuchando canal "trades"...');
    ECHO_PUSHER(this._seguridadService.token)
      .channel('trades')
      .listen('NewTrade', (data: any) => {
        console.log('📩 Mensaje recibido:', data);
        const mensaje = data.trade || 'Mensaje vacío';
        this.mensajes.unshift(mensaje);
        this._wsNotifService.incrementarContador();
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.appSettings.appContentFullHeight = false;
    this.appSettings.appContentClass = '';
    this.appSettings.appClass = '';
  }

  actualizarHora(): void {
    const ahora = new Date();
    this.fechaActual = ahora.toLocaleDateString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    this.horaActual = ahora.toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  cargarModulosPermitidos(): void {
    const accesosString = localStorage.getItem('accesos');
    
    if (accesosString) {
      try {
        const accesos: Acceso[] = JSON.parse(accesosString);
        const urlsPermitidas = accesos.map(a => a.url);
        
        // Filtrar módulos según accesos
        this.modulosPermitidos = this.TODOS_LOS_MODULOS.filter(modulo => {
          if (modulo.action === 'seguridad') return true; // Seguridad siempre visible
          if (!modulo.url) return false;
          // Verificar si la URL está en los accesos
          return urlsPermitidas.some(url => modulo.url.includes(url) || url.includes(modulo.url.replace('/', '')));
        });
        
      } catch (error) {
        console.error('Error al parsear accesos:', error);
        this.cargarModulosPorDefecto();
      }
    } else {
      this.cargarModulosPorDefecto();
    }
  }

  cargarModulosPorDefecto(): void {
    this.modulosPermitidos = [...this.TODOS_LOS_MODULOS];
  }

  navegarA(url: string): void {
    if (url) {
      this.router.navigate([url]);
    }
  }

  fun_seguridad(): void {
    this.router.navigate(['/seguridad']);
  }
}
