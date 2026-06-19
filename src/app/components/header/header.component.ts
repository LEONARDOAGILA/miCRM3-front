import { Component, Input, Output, EventEmitter, Renderer2, OnDestroy } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import Swal from 'sweetalert2';

import { AppSettings } from '../../service/app-settings.service';
import { StorageService } from '../../modules/seguridad/services/storage.service';
import { UserService } from '../../modules/seguridad/services/user.service';
import { SeguridadService } from '../../modules/seguridad/services/seguridad.service';
import { Notificaciones } from '../../core/shared/notificaciones';
import { InactivityService } from '../../modules/seguridad/services/InactivityService';
import { WebsocketNotificationService } from '../../service/websocket-notification.service';

declare var slideToggle: any;

@Component({
	selector: 'header',
	templateUrl: './header.component.html',
	styleUrls: ['./header.component.css'],
	standalone: false,
})
export class HeaderComponent implements OnDestroy {
	@Input() appSidebarTwo;
	@Output() appSidebarEndToggled = new EventEmitter<boolean>();
	@Output() appSidebarMobileToggled = new EventEmitter<boolean>();
	@Output() appSidebarEndMobileToggled = new EventEmitter<boolean>();
	
	today: Date = new Date();


	// inicio lpaa
	msgNotificacion: Notificaciones = new Notificaciones();
	private unsubscribe$ = new Subject<void>();
	usuarioLogeado: boolean = false;
	ban: any = false;
	activoInactivo: any = true;
	iconoActivoInactivo: any = true;
	imagenUsuario: any = null;
	contadorWebsockets: number = 0;
	animarCampana: boolean = false;

	// fin lpaa

	constructor(
		private renderer: Renderer2,
		public appSettings: AppSettings,
		// inicio lpaa
		private _storeService: StorageService,
		private _userService: UserService,
		private _seguridadService: SeguridadService,
		private _toastr: ToastrService,
		private _inactivityService: InactivityService,
	    private _wsNotifService: WebsocketNotificationService


		// inicio lpaa

	) {


	}

	// inicio lpaa

  resetearContador() {
    this._wsNotifService.reiniciarContador();
  }

	async ngOnInit(): Promise<void> {

	    // Actualizar la hora cada minuto
		setInterval(() => {
		this.today = new Date();
		}, 60000);


		// 🔔 Escuchar contador global de WebSockets
		this._wsNotifService.contadorMensajes$
		.pipe(takeUntil(this.unsubscribe$))
		.subscribe((count) => {
			this.contadorWebsockets = count;
			this.animarCampana = count > 0; // 🔔 activar animación solo si hay mensajes
		});



	  	// 🔐 Usuario logeado
		const userLogin: any = this._storeService.getStorageItem("user");
		this.usuarioLogeado = userLogin;
		if (!userLogin) {
			this.usuarioLogeado = false;
			return
		}



		if (userLogin.avatar) {
			const imageUrl = this._userService.getUserImage(userLogin.id, true);
			if (imageUrl) {
				await this.checkImageExists(imageUrl)
					.then(exists => {
						if (exists) {
							this.imagenUsuario = imageUrl;
						} else {
							this.imagenUsuario = '/assets/img/user/default.png';
						}
					})
					.catch(() => {
						this.imagenUsuario = '/assets/img/user/default.png';
					});
			} else {
				this.imagenUsuario = '/assets/img/user/default.png';
			}
		}else{
				this.imagenUsuario = '/assets/img/user/default.png';
		}
		
	}

	private checkImageExists(url: string): Promise<boolean> {
		return new Promise((resolve) => {
			const img = new Image();
			img.onload = () => resolve(true);
			img.onerror = () => resolve(false);
			img.src = url;
		});
	}

	// fin lpaa

	ngOnDestroy() {
		// inicio lpaa
		this.unsubscribe$.next();
		this.unsubscribe$.complete();
		// fin lpaa

		//this.appSettings.appHeaderMegaMenuMobileToggled = false;
	}



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
				//window.location.reload();
			}
		});
	}

	editEnLineaUser(user_id: any) {
		const data = {
			en_linea: false,
		};

		this._userService.editEnLineaUser(user_id, data).pipe(takeUntil(this.unsubscribe$)).subscribe({
			next: (response: any) => {
				if (response.status == "success") {
					this.ban = true;

					if (this.ban === true) {
						this._inactivityService.deactivate();
						this._seguridadService.logout();
						//window.location.reload();
					}

				} else {
					this.msgNotificacion.error(response.message);
					this.ban = false;
				}
			},
			error: (error: any) => {
				this.msgNotificacion.error(error.message);
				this.ban = false;
			},
		});
	}


	editActivoInactivo(user_id: any, boolean: boolean) {
		const data = {
			en_linea: boolean,
		};

		this._userService.editEnLineaUser(user_id, data).pipe(takeUntil(this.unsubscribe$)).subscribe({
			next: (response: any) => {
				if (response.status == "success") {

					//this.msgNotificacion.info('Usuario ' + (data.en_linea ? 'En linea' : 'Fuera de linea'));
					this._toastr.success('Usuario ' + (data.en_linea ? 'En línea' : 'Fuera de línea'), '', { closeButton: true } // ✅ Opciones van en el tercer argumento
					);


					this.activoInactivo = data.en_linea;
					this.iconoActivoInactivo = data.en_linea;

				} else {
					this.msgNotificacion.error(response.message);
				}
			},
			error: (error: any) => {
				this.msgNotificacion.error(error.message);
			},
		});
	}






	toggleAppSidebarMobile() {
		this.appSidebarMobileToggled.emit(true);
	}

	toggleAppSidebarEnd() {
		this.appSidebarEndToggled.emit(true);
	}

	toggleAppSidebarEndMobile() {
		this.appSidebarEndMobileToggled.emit(true);
	}

	toggleAppTopMenuMobile() {
		var target = document.querySelector('.app-top-menu');
		if (target) {
			slideToggle(target);
		}
	}

	toggleAppHeaderMegaMenuMobile() {
		this.appSettings.appHeaderMegaMenuMobileToggled = !this.appSettings.appHeaderMegaMenuMobileToggled;
	}




}
