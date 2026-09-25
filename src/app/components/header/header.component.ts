import { Component, Input, Output, EventEmitter, NgZone, OnDestroy, OnInit } from '@angular/core';
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
import { PresenciaService } from '../../modules/seguridad/services/presencia.service';
import {
	ESTADOS_ELEGIBLES, EstadoElegido, estiloDePresencia, PresenciaModel,
} from '../../modules/seguridad/interfaces/presenciaModel';

declare var slideToggle: any;

/** Lo que se muestra cuando el usuario no tiene foto o la suya no carga. */
const AVATAR_POR_DEFECTO = '/assets/img/user/default.png';

@Component({
	selector: 'header',
	templateUrl: './header.component.html',
	styleUrls: ['./header.component.css'],
	standalone: false,
})
export class HeaderComponent implements OnInit, OnDestroy {
	@Input() appSidebarTwo;
	@Output() appSidebarEndToggled = new EventEmitter<boolean>();
	@Output() appSidebarMobileToggled = new EventEmitter<boolean>();
	@Output() appSidebarEndMobileToggled = new EventEmitter<boolean>();
	
	today: Date = new Date();


	// inicio lpaa
	msgNotificacion: Notificaciones = new Notificaciones();
	private unsubscribe$ = new Subject<void>();
	usuarioLogeado: any = false;   // el usuario de localStorage (false si no hay sesión)
	imagenUsuario: string | null = null;

	/** Presencia: el estado que publico y los que puedo elegir. */
	presencia: PresenciaModel | null = null;
	readonly estadosElegibles = ESTADOS_ELEGIBLES;
	readonly estiloDe = estiloDePresencia;
	/** Se está guardando un cambio de estado: evita dobles clics. */
	cambiandoEstado = false;
	animarCampana: boolean = false;

	/** Los dos temporizadores del reloj, para poder pararlos al salir. */
	private relojAlMinuto: any = null;
	private relojCadaMinuto: any = null;

	/** Campana: las últimas notificaciones y cuántas van sin leer. */
	notificaciones: NotificacionModel[] = [];
	noLeidas = 0;

	/** Avisos al entrar una: el «ding» y el globo del navegador. */
	avisoSonido = false;
	avisoEscritorio = false;

	// fin lpaa

	constructor(
		public appSettings: AppSettings,
		// inicio lpaa
		private _storeService: StorageService,
		private _userService: UserService,
		private _seguridadService: SeguridadService,
		private _toastr: ToastrService,
		private _inactivityService: InactivityService,
		private _boletinPush: BoletinPushService,
		private _campana: CampanaService,
		private _aviso: AvisoCampanaService,
		private _modal: NgbModal,
		private _router: Router,
		private _presencia: PresenciaService,
		private _ngZone: NgZone
		// fin lpaa
	) {}

	// inicio lpaa

	ngOnInit(): void {

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


		// Mi estado, y el latido que dice que sigo aquí
		this._presencia.mia$.pipe(takeUntil(this.unsubscribe$)).subscribe(p => this.presencia = p);
		this._presencia.empezar();

		this.arrancarReloj();

	  	// 🔐 Usuario logeado
		const userLogin: any = this._storeService.getStorageItem("user");
		this.usuarioLogeado = userLogin || false;
		if (!userLogin) { return; }

		// Se pide directamente: si la imagen no existe, el propio <img> avisa
		// con (error) y se cambia por la de por defecto. Antes se descargaba
		// dos veces, una para comprobar que estaba y otra para mostrarla.
		this.imagenUsuario = userLogin.avatar
			? this._userService.getUserImage(userLogin.id, true)
			: AVATAR_POR_DEFECTO;
	}

	/** La foto no se pudo cargar (borrada, sin permiso, sin red). */
	alFallarLaFoto(): void {
		this.imagenUsuario = AVATAR_POR_DEFECTO;
	}

	/**
	 * El reloj de la barra.
	 *
	 * Se engancha al cambio de minuto real en vez de contar 60 segundos desde
	 * que se abrió la pantalla: así el minuto cambia cuando toca y no hasta
	 * 59 segundos tarde. Los temporizadores se guardan porque hay que pararlos
	 * al destruir la cabecera; el setInterval de antes seguía corriendo para
	 * siempre y disparando una detección de cambios cada minuto.
	 */
	private arrancarReloj(): void {
		this.today = new Date();

		const faltanParaElMinuto = 60000 - (Date.now() % 60000);
		this.relojAlMinuto = setTimeout(() => {
			this.today = new Date();
			this.relojCadaMinuto = setInterval(() => this.today = new Date(), 60000);
		}, faltanParaElMinuto);
	}

	private pararReloj(): void {
		if (this.relojAlMinuto)   { clearTimeout(this.relojAlMinuto);   this.relojAlMinuto = null; }
		if (this.relojCadaMinuto) { clearInterval(this.relojCadaMinuto); this.relojCadaMinuto = null; }
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
		this.pararReloj();
		this._presencia.parar();
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
		}).then(async (result) => {
			if (result.isConfirmed) {
				// Antes de irse: que deje de figurar conectado en el acto
				await this._presencia.desconectar();
				this._presencia.parar();
				this._inactivityService.deactivate();
				this._seguridadService.logout();
				//window.location.reload();
			}
		});
	}

	// ================================================================
	// PRESENCIA: «En línea / Fuera de línea»
	// ================================================================

	/** El que se pinta en la barra: ya cruzado con el latido. */
	get estadoActual() {
		return this.estiloDe(this.presencia?.efectivo);
	}

	/** El que el usuario eligió, para marcar la opción del menú. */
	get estadoElegido(): EstadoElegido {
		return this.presencia?.estado ?? 'DISPONIBLE';
	}

	/**
	 * Cambia el estado que se publica.
	 *
	 * El menú se deja abierto a propósito (stopPropagation): así se ve cómo
	 * queda marcado el que se acaba de elegir.
	 */
	async elegirEstado(estado: EstadoElegido, ev: Event): Promise<void> {
		ev.preventDefault();
		ev.stopPropagation();
		if (this.cambiandoEstado || estado === this.estadoElegido) { return; }

		this.cambiandoEstado = true;
		try {
			const listo = await this._presencia.cambiar(estado, this.presencia?.mensaje ?? null);
			const e = this.estiloDe(estado);
			if (listo) {
				this._toastr.success(e.nombre, 'Tu estado', { timeOut: 2000 });
			} else {
				this._toastr.error('No se pudo cambiar tu estado', 'Tu estado');
			}
		} finally {
			this.cambiandoEstado = false;
		}
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
