import { Component, OnDestroy } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import Swal from 'sweetalert2';

import { AppSettings } from '../../service/app-settings.service';
import { SeguridadService } from '../../modules/seguridad/services/seguridad.service';
import { InactivityService } from '../../modules/seguridad/services/InactivityService';

/**
 * STANDALONE: la usan las rutas de los módulos que ya no tienen NgModule
 * (modules/core/core.routes.ts). Cuando `loadChildren` devuelve un array de
 * rutas en vez de un módulo, Angular exige que TODOS los componentes de esas
 * rutas sean standalone (NG04014), y ésta es la del `**` de cada módulo.
 */
@Component({
	selector: 'error',
  templateUrl: './error.html',
  // La hoja es común con pages/access-deny: las dos pantallas de estado tienen
  // que verse iguales. Al ir por styleUrls queda con el ámbito del componente.
  styleUrls: ['../pagina-estado.scss'],
  standalone: true,
  // La plantilla sólo usa @if (sintaxis del compilador, no CommonModule) y
  // [routerLink]; nada más hace falta.
  imports: [RouterLink],
})

export class ErrorPage implements OnDestroy {
	/** La dirección que no se pudo abrir, para enseñarla y poder copiarla. */
	readonly rutaPedida: string;

	constructor(
		public appSettings: AppSettings,
		private _router: Router,
		private _seguridadService: SeguridadService,
		private _inactivityService: InactivityService,
	) {
    this.appSettings.appEmpty = true;
		this.rutaPedida = this._router.url;
	}

  ngOnDestroy() {
    this.appSettings.appEmpty = false;
  }

	/** ¿Hay sesión iniciada? Si no, el botón de salir no tiene sentido. */
	get haySesion(): boolean {
		return this._seguridadService.isLoggin();
	}

	/**
	 * Vuelve a la pantalla anterior. Se usa el historial del navegador y no el
	 * router porque aquí se llega desde cualquier sitio —un enlace viejo, una
	 * dirección escrita a mano, el `**` de un módulo— y lo único que se sabe
	 * seguro es de dónde venía.
	 */
	volver() {
		window.history.back();
	}

	/**
	 * Mismo cierre de sesión que el del header (header.component.ts): confirma
	 * con SweetAlert, desactiva el temporizador de inactividad y delega en
	 * SeguridadService.logout(), que llama al backend, limpia el storage y
	 * redirige al login.
	 *
	 * Hace falta aquí porque la página de error se muestra con appEmpty = true,
	 * es decir, sin header ni menú: si el usuario cae en un 404 se quedaba sin
	 * ninguna forma de cerrar sesión.
	 */
	fun_salir() {
		Swal.fire({
			title: "Seguro desea salir?",
			text: "Se terminara la sesion actual.",
			icon: "warning",
			showCancelButton: true,
			confirmButtonColor: "#3085d6",
			cancelButtonColor: "#d33",
			confirmButtonText: "Si, Salir!",
			cancelButtonText: "Cancelar",
		}).then((result) => {
			if (result.isConfirmed) {
				this._inactivityService.deactivate();
				this._seguridadService.logout();
			}
		});
	}
}
