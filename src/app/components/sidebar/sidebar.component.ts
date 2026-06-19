import { Component, Input, Output, EventEmitter, ElementRef, HostListener, ViewChild, OnInit, AfterViewChecked, AfterViewInit } 		 from '@angular/core';
import { firstValueFrom, Subject} from "rxjs";
import { slideUp } from '../../composables/slideUp.js';
import { slideToggle } from '../../composables/slideToggle.js';

import { AppMenuService } from '../../service/app-menus.service';
import { AppSettings } from '../../service/app-settings.service';

import { SeguridadService }    from "../../modules/seguridad/services/seguridad.service";
import { StorageService } from '../../modules/seguridad/services/storage.service';
import { UserService } 	  from '../../modules/seguridad/services/user.service';
import { ProfileService } from '../../modules/seguridad/services/profile.service';
import { AppStateService } from './../../service/app-state.service';



@Component({
  selector: 'sidebar',
  templateUrl: './sidebar.component.html',
  standalone: false,
})

export class SidebarComponent implements AfterViewChecked, OnInit {
	menus: any[] = [];
	menus1: any[] = [];
	private unsubscribe$ = new Subject<void>();

  @ViewChild('sidebarScrollbar', { static: false }) private sidebarScrollbar: ElementRef;
	@Output() appSidebarMinifiedToggled = new EventEmitter<boolean>();
	@Output() hideMobileSidebar = new EventEmitter<boolean>();
	@Output() setPageFloatSubMenu = new EventEmitter();

	@Output() appSidebarMobileToggled = new EventEmitter<boolean>();
	@Input() appSidebarTransparent;
	@Input() appSidebarGrid;
	@Input() appSidebarFixed;
	@Input() appSidebarMinified;

	appSidebarFloatSubMenu;
	appSidebarFloatSubMenuHide;
	appSidebarFloatSubMenuHideTime = 250;
	appSidebarFloatSubMenuTop;
	appSidebarFloatSubMenuLeft = '60px';
	appSidebarFloatSubMenuRight;
  appSidebarFloatSubMenuBottom;
  appSidebarFloatSubMenuArrowTop;
  appSidebarFloatSubMenuArrowBottom;
  appSidebarFloatSubMenuLineTop;
  appSidebarFloatSubMenuLineBottom;
  appSidebarFloatSubMenuOffset;

	mobileMode;
	desktopMode;
	scrollTop;

	usuarioLogeado: any;
	imagenUsuario: any = null;


  toggleNavProfile(e) {
		e.preventDefault();

		var targetSidebar = <HTMLElement>document.querySelector('.app-sidebar:not(.app-sidebar-end)');
		var targetMenu = e.target.closest('.menu-profile');
		var targetProfile = <HTMLElement>document.querySelector('#appSidebarProfileMenu');
		var expandTime = (targetSidebar && targetSidebar.getAttribute('data-disable-slide-animation')) ? 0 : 250;

		if (targetProfile && targetProfile.style) {
			if (targetProfile.style.display == 'block') {
				targetMenu.classList.remove('active');
			} else {
				targetMenu.classList.add('active');
			}
			slideToggle(targetProfile, expandTime);
			targetProfile.classList.toggle('expand');
		}
  }

	toggleAppSidebarMinified() {
		this.appSidebarMinifiedToggled.emit(true);
		this.scrollTop = 40;
	}

	toggleAppSidebarMobile() {
		this.appSidebarMobileToggled.emit(true);
	}

	calculateAppSidebarFloatSubMenuPosition() {
		var targetTop = this.appSidebarFloatSubMenuOffset.top;
    var direction = document.body.style.direction;
    var windowHeight = window.innerHeight;

    setTimeout(() => {
      let targetElm = <HTMLElement> document.querySelector('.app-sidebar-float-submenu-container');
      let targetSidebar = <HTMLElement> document.getElementById('sidebar');
      var targetHeight = targetElm.offsetHeight;
      this.appSidebarFloatSubMenuRight = 'auto';
      this.appSidebarFloatSubMenuLeft = (this.appSidebarFloatSubMenuOffset.width + targetSidebar.offsetLeft) + 'px';

      if ((windowHeight - targetTop) > targetHeight) {
        this.appSidebarFloatSubMenuTop = this.appSidebarFloatSubMenuOffset.top + 'px';
        this.appSidebarFloatSubMenuBottom = 'auto';
        this.appSidebarFloatSubMenuArrowTop = '20px';
        this.appSidebarFloatSubMenuArrowBottom = 'auto';
        this.appSidebarFloatSubMenuLineTop = '20px';
        this.appSidebarFloatSubMenuLineBottom = 'auto';
      } else {
        this.appSidebarFloatSubMenuTop = 'auto';
        this.appSidebarFloatSubMenuBottom = '0';

        var arrowBottom = (windowHeight - targetTop) - 21;
        this.appSidebarFloatSubMenuArrowTop = 'auto';
        this.appSidebarFloatSubMenuArrowBottom = arrowBottom + 'px';
        this.appSidebarFloatSubMenuLineTop = '20px';
        this.appSidebarFloatSubMenuLineBottom = arrowBottom + 'px';
      }
    }, 0);
	}

	showAppSidebarFloatSubMenu(menu, e) {
	  if (this.appSettings.appSidebarMinified) {
      clearTimeout(this.appSidebarFloatSubMenuHide);

      this.appSidebarFloatSubMenu = menu;
      this.appSidebarFloatSubMenuOffset = e.target.getBoundingClientRect();
      this.calculateAppSidebarFloatSubMenuPosition();
    }
	}

	hideAppSidebarFloatSubMenu() {
	  this.appSidebarFloatSubMenuHide = setTimeout(() => {
	    this.appSidebarFloatSubMenu = '';
	  }, this.appSidebarFloatSubMenuHideTime);
	}

	remainAppSidebarFloatSubMenu() {
		clearTimeout(this.appSidebarFloatSubMenuHide);
	}

appSidebarSearch(e: any) {
  const targetValue = e.target.value.toLowerCase().trim();
  
  if (targetValue) {
    // Ocultar todos los items del menú primero
    const allMenuItems = document.querySelectorAll('.app-sidebar:not(.app-sidebar-end) .menu-item:not(.menu-profile):not(.menu-header):not(.menu-search)');
    allMenuItems.forEach((elm) => {
      (elm as HTMLElement).classList.add('d-none');
    });
    
    // Ocultar todos los submenús
    const allSubmenus = document.querySelectorAll('.app-sidebar:not(.app-sidebar-end) .menu-submenu');
    allSubmenus.forEach((elm) => {
      (elm as HTMLElement).style.display = 'none';
    });
    
    // Limpiar clases anteriores
    const hasTextElements = document.querySelectorAll('.app-sidebar:not(.app-sidebar-end) .has-text');
    hasTextElements.forEach((elm) => {
      elm.classList.remove('has-text');
    });
    
    const expandElements = document.querySelectorAll('.app-sidebar:not(.app-sidebar-end) .expand');
    expandElements.forEach((elm) => {
      elm.classList.remove('expand');
    });
    
    // Buscar en todos los enlaces del menú
    const menuLinks = document.querySelectorAll('.app-sidebar:not(.app-sidebar-end) .menu-link');
    
    menuLinks.forEach((menuLink) => {
      const menuText = menuLink.textContent?.toLowerCase() || '';
      
      if (menuText.includes(targetValue)) {
        // Encontrar el menu-item padre
        let menuItem = menuLink.closest('.menu-item');
        
        while (menuItem) {
          // Mostrar este item
          menuItem.classList.remove('d-none');
          menuItem.classList.add('has-text');
          
          // Si tiene submenú, expandirlo
          if (menuItem.classList.contains('has-sub')) {
            menuItem.classList.add('expand');
            
            // Mostrar el submenú
            const submenu = menuItem.querySelector('.menu-submenu');
            if (submenu) {
              (submenu as HTMLElement).style.display = 'block';
              
              // Mostrar todos los items dentro del submenú que coincidan
              const submenuItems = submenu.querySelectorAll('.menu-item');
              submenuItems.forEach((item) => {
                const itemText = item.textContent?.toLowerCase() || '';
                if (itemText.includes(targetValue)) {
                  (item as HTMLElement).classList.remove('d-none');
                }
              });
            }
          }
          
          // Subir al padre para mostrar la jerarquía
          menuItem = menuItem.parentElement?.closest('.menu-item') || null;
        }
      }
    });
    
    // También buscar en los ítems de submenú directamente
    const submenuItems = document.querySelectorAll('.app-sidebar:not(.app-sidebar-end) .menu-submenu .menu-item');
    submenuItems.forEach((item) => {
      const itemText = item.textContent?.toLowerCase() || '';
      if (itemText.includes(targetValue)) {
        (item as HTMLElement).classList.remove('d-none');
        
        // Mostrar el submenú padre
        const submenu = item.closest('.menu-submenu');
        if (submenu) {
          (submenu as HTMLElement).style.display = 'block';
          
          // Expandir el padre que contiene el submenú
          const parentMenuItem = submenu.closest('.menu-item');
          if (parentMenuItem) {
            parentMenuItem.classList.remove('d-none');
            parentMenuItem.classList.add('expand', 'has-text');
          }
        }
      }
    });
    
  } else {
    // Restaurar todo cuando el input está vacío
    const allMenuItems = document.querySelectorAll('.app-sidebar:not(.app-sidebar-end) .menu-item:not(.menu-profile):not(.menu-header):not(.menu-search)');
    allMenuItems.forEach((elm) => {
      elm.classList.remove('d-none');
    });
    
    const allSubmenus = document.querySelectorAll('.app-sidebar:not(.app-sidebar-end) .menu-submenu');
    allSubmenus.forEach((elm) => {
      (elm as HTMLElement).style.display = '';
    });
    
    const hasTextElements = document.querySelectorAll('.app-sidebar:not(.app-sidebar-end) .has-text');
    hasTextElements.forEach((elm) => {
      elm.classList.remove('has-text');
    });
    
    const expandElements = document.querySelectorAll('.app-sidebar:not(.app-sidebar-end) .expand');
    expandElements.forEach((elm) => {
      elm.classList.remove('expand');
    });
  }
}

  @HostListener('scroll', ['$event'])
  onScroll(event) {
    this.scrollTop = (this.appSettings.appSidebarMinified) ? event.srcElement.scrollTop + 40 : 0;
    if (typeof(Storage) !== 'undefined') {
      localStorage.setItem('sidebarScroll', event.srcElement.scrollTop);
    }
  }

  @HostListener('window:resize', ['$event'])
  onResize(event) {
    if (window.innerWidth <= 767) {
      this.mobileMode = true;
      this.desktopMode = false;
    } else {
      this.mobileMode = false;
      this.desktopMode = true;
    }
  }

  ngAfterViewChecked() {
    if (typeof(Storage) !== 'undefined' && localStorage.sidebarScroll) {
      if (this.sidebarScrollbar && this.sidebarScrollbar.nativeElement) {
        this.sidebarScrollbar.nativeElement.scrollTop = localStorage.sidebarScroll;
      }
    }
  }


	async ngOnInit() {
		const userLogin: any = this._storeService.getStorageItem("user");	
		this.usuarioLogeado = userLogin;
		if(!userLogin){
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


		this.menus = [];
		this.obtenerMenu();
	}

	private checkImageExists(url: string): Promise<boolean> {
		return new Promise((resolve) => {
			const img = new Image();
			img.onload = () => resolve(true);
			img.onerror = () => resolve(false);
			img.src = url;
		});
	}

	

	private setupMenuToggleListeners() {
		const handleSidebarMenuToggle = (menus, expandTime) => {
		  menus.map((menu) => {
			menu.onclick = (e) => {
			  e.preventDefault();
			  const target = menu.nextElementSibling;

			  menus.map((m) => {
				const otherTarget = m.nextElementSibling;
				if (otherTarget !== target) {
				  slideUp(otherTarget, expandTime);
				  otherTarget.closest('.menu-item').classList.remove('expand');
				  otherTarget.closest('.menu-item').classList.add('closed');
				}
			  });

			  const targetItemElm = target.closest('.menu-item');

			  if (targetItemElm.classList.contains('expand') || (targetItemElm.classList.contains('active') && !target.style.display)) {
				targetItemElm.classList.remove('expand');
				targetItemElm.classList.add('closed');
				slideToggle(target, expandTime);
			  } else {
				targetItemElm.classList.add('expand');
				targetItemElm.classList.remove('closed');
				slideToggle(target, expandTime);
			  }
			};
		  });
		};

		const targetSidebar = document.querySelector('.app-sidebar:not(.app-sidebar-end)');
		const expandTime = (targetSidebar && targetSidebar.getAttribute('data-disable-slide-animation')) ? 0 : 300;

		// Menu
		const menuLinkSelector = '.app-sidebar .menu > .menu-item.has-sub > .menu-link';
		const menus = [].slice.call(document.querySelectorAll(menuLinkSelector));
		handleSidebarMenuToggle(menus, expandTime);

		// Submenu Lvl 1
		const submenuLvl1Selector = '.app-sidebar .menu > .menu-item.has-sub > .menu-submenu > .menu-item.has-sub > .menu-link';
		const submenusLvl1 = [].slice.call(document.querySelectorAll(submenuLvl1Selector));
		handleSidebarMenuToggle(submenusLvl1, expandTime);

		// Submenu Lvl 2
		const submenuLvl2Selector = '.app-sidebar .menu > .menu-item.has-sub > .menu-submenu > .menu-item.has-sub > .menu-submenu > .menu-item.has-sub > .menu-link';
		const submenusLvl2 = [].slice.call(document.querySelectorAll(submenuLvl2Selector));
		handleSidebarMenuToggle(submenusLvl2, expandTime);
	  }



// lpaa -> MENU - asigna Menu lateral segun el perfil
async obtenerMenu() {
  const v_user = this._seguridadService.getUserLogin();
  
  if(v_user){
    try {
      let res: any = await firstValueFrom(this._profile.getAppMenus(v_user.perfil.id));
      if (res?.status === 'success') {
        this.menus = Array.isArray(res.data) ? res.data : [];
        
        // 👇 GUARDAR EN LOCALSTORAGE
        this.guardarMenusEnLocalStorage(this.menus);

        // 👇 NOTIFICAR CAMBIO
        this.appStateService.notificarAccesosActualizados();

        
        //console.log('response -> Menus obtenidos', this.menus);
        setTimeout(() => {
          this.setupMenuToggleListeners();
        }, 0);

      } else {
        console.error('response -> Error: Respuesta sin status success', res);
      }
    } catch (error: any) {
      console.error('response -> Error en la petición', error);
    }
  }
}

// Método para guardar menús en localStorage
private guardarMenusEnLocalStorage(menus: any[]): void {
  // Extraer solo los datos necesarios para las cards
  const accesosParaCards = this.extraerAccesosParaCards(menus);
  localStorage.setItem('accesos', JSON.stringify(accesosParaCards));
}

// Extraer los accesos que necesitas para las cards
private extraerAccesosParaCards(menus: any[]): any[] {
  const accesos: any[] = [];
  
  const recorrerMenu = (items: any[], padre_id: number | null = null) => {
    for (const item of items) {
      accesos.push({
        user_id: this._seguridadService.getUserLogin()?.id || 0,
        nombre: item.title,
        url: item.url,
        perfil_nombre: this._seguridadService.getUserLogin()?.perfil?.nombre || '',
        icono: item.icon,
        padre_id: padre_id,
        orden: item.orden || 0
      });
      
      if (item.submenu && item.submenu.length > 0) {
        recorrerMenu(item.submenu, item.id);
      }
    }
  };
  
  recorrerMenu(menus);
  return accesos;
}







  constructor(
		private eRef: ElementRef,
		public appSettings: AppSettings,
		private appMenuService: AppMenuService,
		private _profile: ProfileService,
		private _seguridadService: SeguridadService,
		private _storeService: StorageService,
		private _userService: UserService,
    private appStateService: AppStateService,

	) {
    if (window.innerWidth <= 767) {
      this.mobileMode = true;
      this.desktopMode = false;
    } else {
      this.mobileMode = false;
      this.desktopMode = true;
    }
  }
}
