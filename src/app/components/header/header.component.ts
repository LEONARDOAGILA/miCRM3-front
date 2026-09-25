import { Component, Input, Output, EventEmitter, Renderer2, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { Subject, takeUntil } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import Swal from 'sweetalert2';

import { AppSettings } from '../../service/app-settings.service';
import { StorageService } from '../../modules/seguridad/services/storage.service';
import { UserService } from '../../modules/seguridad/services/user.service';
import { SeguridadService } from '../../modules/seguridad/services/seguridad.service';
import { Notificaciones } from '../../core/shared/notificaciones';
import { InactivityService } from '../../modules/seguridad/services/InactivityService';
import { BoletinPushService } from '../../modules/config/services/boletinPush.service';
import { CampanaService } from '../../modules/config/services/campana.service';
import { AvisoCampanaService } from '../../modules/config/services/avisoCampana.service';
import { MisNotificacionesComponent } from '../../modules/config/pages/notificaciones/misNotificaciones/misNotificaciones.component';
import { destinoDeNotificacion, ESTILOS_NOTIFICACION, NotificacionModel, TipoNotificacion } from '../../modules/config/interfaces/notificacionModel';
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
	usuarioLogeado: any = false;   // el usuario de localStorage (false si no hay sesión)
	ban: any = false;
	activoInactivo: any = true;
	iconoActivoInactivo: any = true;
	imagenUsuario: any = null;
	contadorWebsockets: number = 0;
	animarCampana: boolean = false;

	/** Campana: las últimas notificaciones y cuántas van sin leer. */
	notificaciones: NotificacionModel[] = [];
	noLeidas = 0;

	/** Avisos al entrar una: el «ding» y el globo del navegador. */
	avisoSonido = false;
	avisoEscritorio = false;

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
	    private _wsNotifService: WebsocketNotificationService,
		private _boletinPush: BoletinPushService,
		private _campana: CampanaService,
		private _aviso: AvisoCampanaService,
		private _modal: NgbModal,
		private _router: Router


		// inicio lpaa

	) {


	}

	// inicio lpaa

  resetearContador() {
    this._wsNotifService.reiniciarContador();
  }

	async ngOnInit(): Promise<void> {

		// Boletines lanzados con la sesión ya abierta: la cabecera está en
		// todas las pantallas, así que es el sitio para quedarse a la escucha.
		this._boletinPush.escuchar();

		// La campana: lo que ya tiene y lo que vaya entrando
		this._campana.escuchar();
		this._campana.noLeidas$.pipe(takeUntil(this.unsubscribe$)).subscribe(n => {
			this.noLeidas = n;
			// Sin nada pendiente la campana se queda quieta, aunque no se haya abierto
			if (!n) { this.animarCampana = false; }
		});
		this._campana.lista$.pipe(takeUntil(this.unsubscribe$)).subscribe(l => this.notificaciones = l);
		this._campana.entrante$.pipe(takeUntil(this.unsubscribe$)).subscribe(n => {
			if (n) { this.sacudirCampana(); }
		});

		// Cómo quiere que le avisen: el sonido y el globo del navegador
		this._aviso.preferencias$.pipe(takeUntil(this.unsubscribe$)).subscribe(p => {
			this.avisoSonido = p.sonido;
			this.avisoEscritorio = p.escritorio;
		});


	    // Actualizar la hora cada minuto
		setInterval(() => {
		this.today = new Date();
		}, 60000);


		// 🔔 Escuchar contador global de WebSockets
		this._wsNotifService.contadorMensajes$
		.pipe(takeUntil(this.unsubscribe$))
		.subscribe((count) => {
			this.contadorWebsockets = count;
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


	// ================================================================
	// CAMPANA DE NOTIFICACIONES
	// ================================================================

	/**
	 * La campana se queda latiendo desde que entra una notificación.
	 *
	 * No se para sola: igual que el sonido, insiste hasta que el usuario la
	 * abre. Así un aviso no se pierde por no estar mirando en ese momento.
	 */
	private sacudirCampana(): void {
		this.animarCampana = true;
	}

	/**
	 * Abrir la campana la deja quieta y calla el sonido: ya se ha enterado.
	 *
	 * No se toca el evento, que es el que abre y cierra el desplegable.
	 */
	alAbrirCampana(): void {
		this.animarCampana = false;
		this._aviso.callar();
	}

	/**
	 * Pulsar una: queda leída y, si lleva enlace, lleva allí.
	 *
	 * Un enlace de internet abre otra pestaña y deja el CRM donde estaba;
	 * una ruta del sistema navega aquí mismo.
	 */
	async abrirNotificacion(n: NotificacionModel, ev: Event): Promise<void> {
		ev.preventDefault();
		if (!n.leida) { await this._campana.marcarLeidas([n.id]); }

		const a = destinoDeNotificacion(n.url);
		if (!a) { return; }
		if (a.tipo === 'externa') {
			window.open(a.destino, '_blank', 'noopener,noreferrer');
		} else {
			this._router.navigateByUrl(a.destino).catch(() => { /* ruta que ya no existe */ });
		}
	}

	/** Para pintar el icono: si el enlace se va fuera del sistema. */
	enlaceFuera(n: NotificacionModel): boolean {
		return destinoDeNotificacion(n.url)?.tipo === 'externa';
	}

	async marcarTodasLeidas(ev: Event): Promise<void> {
		ev.preventDefault();
		ev.stopPropagation();
		await this._campana.marcarLeidas();
	}

	/** «Ver más»: la lista completa, con su filtro y sus acciones. */
	verNotificaciones(ev: Event): void {
		ev.preventDefault();
		const modalRef = this._modal.open(MisNotificacionesComponent, {
			size: 'lg', centered: true, backdrop: 'static', keyboard: true, scrollable: true,
		});
		modalRef.result.then(() => this._campana.refrescar(), () => this._campana.refrescar());
	}

	claseTipo(n: NotificacionModel): string {
		return (ESTILOS_NOTIFICACION[(n.tipo ?? 'INFO') as TipoNotificacion] ?? ESTILOS_NOTIFICACION.INFO).clase;
	}

	/**
	 * El icono propio de la notificación, o el que le toca por su tipo.
	 *
	 * Sólo se acepta si parece una clase de Font Awesome: si alguien escribió
	 * cualquier cosa en «icono propio», el círculo salía vacío.
	 */
	iconoDe(n: NotificacionModel): string {
		const porTipo = (ESTILOS_NOTIFICACION[(n.tipo ?? 'INFO') as TipoNotificacion] ?? ESTILOS_NOTIFICACION.INFO).icono;
		const propio = (n.icono ?? '').trim();
		return /^fa[bsrl]?-[a-z0-9-]+$/i.test(propio) ? propio : porTipo;
	}

	hace(n: NotificacionModel): string {
		return this._campana.hace(n.created_at);
	}

	// ---------- Cómo avisa la campana ----------

	/** En iOS y en las páginas http:// el navegador no sabe mostrar globos. */
	get soportaAvisoEscritorio(): boolean {
		return this._aviso.soportaEscritorio;
	}

	/**
	 * Enciende o apaga el «ding». Se para el clic para que el desplegable no
	 * se cierre: aquí se está ajustando, no eligiendo una notificación.
	 */
	alternarSonido(ev: Event): void {
		ev.preventDefault();
		ev.stopPropagation();
		const activo = this._aviso.alternarSonido();
		this._toastr.info(activo ? 'Sonará al llegar una notificación' : 'Las notificaciones llegarán en silencio', '', { timeOut: 2000 });
	}

	/**
	 * Enciende o apaga el globo del navegador. El permiso hay que pedirlo desde
	 * este clic: si se pide solo al cargar, el navegador lo descarta.
	 */
	async alternarAvisoEscritorio(ev: Event): Promise<void> {
		ev.preventDefault();
		ev.stopPropagation();

		const { activo, permiso } = await this._aviso.alternarEscritorio();

		if (permiso === 'denied') {
			this._toastr.warning(
				'Este navegador tiene bloqueados los avisos para el CRM. Se permiten desde el candado de la barra de direcciones.',
				'Avisos del navegador', { timeOut: 7000, closeButton: true });
			return;
		}

		this._toastr.info(
			activo
				? 'El navegador te avisará aunque el CRM no esté a la vista'
				: 'El navegador ya no mostrará avisos',
			'', { timeOut: 2500 });
	}

	ngOnDestroy() {
		// inicio lpaa
		this._boletinPush.parar();
		this._campana.parar();
		this.unsubscribe$.next();
		this.unsubscribe$.complete();
		// fin lpaa

		//this.appSettings.appHeaderMegaMenuMobileToggled = false;
	}



	fun_salir() {
		Swal.fire({
			title: "¿Seguro que desea salir?",
			text: "Se cerrará la sesión actual.",
			icon: "warning",
			showCancelButton: true,
			confirmButtonColor: "#3085d6",
			cancelButtonColor: "#d33",
			confirmButtonText: "Sí, salir",
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
