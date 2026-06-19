import { Component } from '@angular/core';
import { Router } from '@angular/router';

interface MenuItem {
  icon: string;
  label: string;
  description: string;
  link: string;
  color: string;
}

interface ShortcutItem {
  icon: string;
  label: string;
  link: string;
  color: string;
}

interface ActivityItem {
  icon: string;
  title: string;
  time: string;
  color: string;
}

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
  standalone: false,
})
export class HomeComponent {
  constructor(private router: Router) {}

  menuItems: MenuItem[] = [
    { 
      icon: 'fa fa-user', 
      label: 'Perfil', 
      description: 'Gestiona tu información',
      link: '/config/allProfiles', 
      color: '#348fe2' // azul
    },
    { 
      icon: 'fa fa-calendar', 
      label: 'Calendario', 
      description: 'Eventos y tareas',
      link: '/calendar', 
      color: '#00acac' // verde
    },
    { 
      icon: 'fa fa-map-marker', 
      label: 'Ubicación', 
      description: 'Zonas y rutas',
      link: '/location', 
      color: '#f59c1a' // naranja
    },
    { 
      icon: 'fa fa-cog', 
      label: 'Ajustes', 
      description: 'Preferencias',
      link: '/settings', 
      color: '#ff5b57' // rojo
    }
  ];

  shortcuts: ShortcutItem[] = [
    { icon: 'fa fa-bell', label: 'Notificaciones', link: '/notifications', color: '#348fe2' },
    { icon: 'fa fa-lock', label: 'Seguridad', link: '/security', color: '#00acac' },
    { icon: 'fa fa-paint-brush', label: 'Apariencia', link: '/theme', color: '#f59c1a' },
    { icon: 'fa fa-download', label: 'Respaldos', link: '/backups', color: '#ff5b57' },
    { icon: 'fa fa-users', label: 'Usuarios', link: '/users', color: '#727cb6' },
    { icon: 'fa fa-shield-alt', label: 'Privacidad', link: '/privacy', color: '#6d5eac' }
  ];

  recentActivities: ActivityItem[] = [
    { icon: 'fa fa-user-edit', title: 'Perfil actualizado', time: 'Hace 5 min', color: '#348fe2' },
    { icon: 'fa fa-calendar-plus', title: 'Evento creado', time: 'Hace 15 min', color: '#00acac' },
    { icon: 'fa fa-cog', title: 'Ajustes modificados', time: 'Hace 1 hora', color: '#f59c1a' },
    { icon: 'fa fa-envelope', title: 'Mensaje enviado', time: 'Hace 2 horas', color: '#ff5b57' },
    { icon: 'fa fa-database', title: 'Backup realizado', time: 'Hace 3 horas', color: '#727cb6' }
  ];

  fun_home(): void {
    this.router.navigate(['/home']);
  }
}