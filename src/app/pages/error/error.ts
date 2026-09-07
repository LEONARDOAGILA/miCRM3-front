import { Component, OnDestroy } from '@angular/core';
import Swal from 'sweetalert2';

import { AppSettings } from '../../service/app-settings.service';
import { SeguridadService } from '../../modules/seguridad/services/seguridad.service';
import { InactivityService } from '../../modules/seguridad/services/InactivityService';

@Component({
	selector: 'error',
  templateUrl: './error.html',
  standalone: false
})

export class ErrorPage implements OnDestroy {
	constructor(
		public appSettings: AppSettings,
		private _seguridadService: SeguridadService,
		private _inactivityService: InactivityService,
	) {
    this.appSettings.appEmpty = true;
	}

  ngOnDestroy() {
    this.appSettings.appEmpty = false;
  }

	/** ¿Hay sesión iniciada? Si no, el botón de salir no tiene sentido. */
	get haySesion(): boolean {
		return this._seguridadService.isLoggin();
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
