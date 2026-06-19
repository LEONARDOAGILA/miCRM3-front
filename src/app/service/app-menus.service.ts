import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})

export class AppMenuService {
	getAppMenus() {
		return [
			
		{
			'icon': 'fa fa-sitemap',
			'title': 'Demo',
			'url': 'demo/home',
			'label': 'prueba',
			'caret': 'true',
			'submenu': [
				{
					'icon': null,
					'title': 'Dashboard v1',
					'url': 'demo/dashboard1',
				},
				{
					'icon': null,
					'title': 'Dashboard v2',
					'url': 'demo/dashboard2',
				},
				{
					'icon': null,
					'title': 'Dashboard v4',
					'url': 'demo/dashboard4',
				}
			]
		},

		{
			icon: "fa fa-cog",
			title: "Configuración",
			url: "",
			caret: "true",
			submenu: [
			  {
				// url: "/ae/crm/lista-usuarios",
				url: "ae/configuracion/USUARIOS",
				title: "Usuarios",
			  },
			  {
				// 'url': 'ae/usuario/PROFILES',
				url: "ae/configuracion/MENUS",
				title: "Menús",
			  },
			  {
				url: "config/allProfiles",
				title: "Perfiles",
			  },
			  {
				url: "ae/configuracion/EMPRESAS",
				title: "Empresas",
			  },
			],
		  },

	
		  {
			'icon': 'fa fa-sitemap',
			'title': 'Home',
			'url': '/home'
		},


	
	];
	}
}