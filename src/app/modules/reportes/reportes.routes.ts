import { Routes } from '@angular/router';

import { ErrorPage } from '../../pages/error/error';

import { HomeComponent } from './pages/home/home.component';

// ============================================================================
// SIN NgModule A PROPÓSITO: su única pantalla es standalone, así que un módulo
// aquí sólo serviría para envolver estas rutas y declarar una lista vacía.
// `loadChildren` carga este array tal cual y el trozo sigue siendo perezoso
// igual. Sustituye a `reportes.module.ts` + `reportes-routing.module.ts`
// (27/10/2026), como ya se hizo en core, contabilidad e inventarios.
//
// El `reportes.module.ts` importaba 19 cosas —ag-Grid, los dos de formularios,
// los campos, las cabeceras de modal, el DirectiveModule— para un home que
// sólo pinta cuatro botones. De todo eso la plantilla usaba dos: *ngFor y
// [routerLink].
//
// OJO: TODO componente de estas rutas tiene que ser standalone, incluido el
// del `**`. Si uno no lo es, revienta con NG04014 al navegar —no al compilar—
// y la url se queda quieta sin decir por qué.
// ============================================================================
export const REPORTES_ROUTES: Routes = [
  {
    path: '',
    children: [
      { path: '', redirectTo: 'home', pathMatch: 'full' },

      { path: 'home', component: HomeComponent, data: { title: 'Home page' } },
      { path: '**', component: ErrorPage },
    ]
  },
];
