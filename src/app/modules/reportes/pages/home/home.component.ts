import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';

interface MenuItem {
  icon: string;
  label: string;
  link: string;
  color: string;  // Nueva propiedad para el color
  iconColor?: string; // Opcional: color específico para el icono
}


@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
  standalone: false,
})
export class HomeComponent implements OnInit, OnDestroy{

  constructor(
    private toastr: ToastrService,
    private route: Router,
  ) {

  }

fun_home(){
  this.route.navigate(['/home']);
}

  ngOnInit(): void {
    //this.toastr.success("Exito",'Bienvenido al Home del Config');
  }

  ngOnDestroy(): void {
  }

  @Input() title: string = 'Mi Aplicación';
  @Input() subtitle: string = 'Selecciona una opción';
  
  menuItems: MenuItem[] = [
    { icon: 'fas fa-user', label: 'Reportes Externos', link: '/reportes/allReportesExternos', color: '#FF6B6B', iconColor: '#FFFFFF' },
    { icon: 'fas fa-calendar-alt', label: 'Calendario', link: '/calendar', color: '#4ECDC4', iconColor: '#FFFFFF' },
    { icon: 'fas fa-map-marker-alt', label: 'Ubicación', link: '/location', color: '#45B7D1', iconColor: '#FFFFFF' },
    { icon: 'fas fa-cog', label: 'Ajustes', link: '/settings', color: '#FFBE0B', iconColor: '#000000' },
    { icon: 'fas fa-envelope', label: 'Mensajes', link: '/messages', color: '#A5DD9B', iconColor: '#000000' },
    
  ];


}
