import { Routes } from '@angular/router';

import { AuthGuard } from '../../core/guards/auth.guard';
import { AccessResolver } from "../../core/resolvers/access.resolver";
import { ErrorPage } from '../../pages/error/error';

import { HomeComponent } from './pages/home/home.component';
import { AllClientesComponent } from './pages/clientes/allClientes/allClientes.component';
import { AllGruposClientesComponent } from './pages/clientes/grupos/allGruposClientes/allGruposClientes.component';
import { GestionClientesComponent } from './pages/gestion-clientes/gestionClientes.component';
import { CatalogoGestionComponent } from './pages/catalogo-gestion/catalogoGestion.component';
import { AsignacionClienteMasivaComponent } from './pages/gestion-clientes/asignacionClienteMasiva/asignacionClienteMasiva.component';
import { AllZonasComponent } from './pages/zonas/allZonas/allZonas.component';
import { RutaCobradorComponent } from './pages/ruta-cobrador/rutaCobrador.component';
import { AllProformasComponent } from './pages/proformas/allProformas/allProformas.component';

// ============================================================================
// SIN NgModule A PROPÓSITO: las 42 clases del módulo son standalone, así que un
// módulo aquí sólo serviría para envolver estas rutas y declarar una lista
// vacía. `loadChildren` carga este array tal cual y el trozo sigue siendo
// perezoso igual. Sustituye a `ventas.module.ts` + `ventas-routing.module.ts`
// (27/10/2026), como ya se hizo en core, contabilidad, inventarios, reportes y rh.
//
// Con el módulo se fueron sus imports de sólo-proveedores, que el build no
// mira: `HttpClient` lo da el `HttpClientModule` de app.module y
// `LoadingBarService` es providedIn: 'root'. También se fueron tres que no
// usaba ninguna plantilla: `NgScrollbarModule`, `CampoBusquedaComponent` y
// `DirectiveModule`.
//
// OJO: TODO componente de estas rutas tiene que ser standalone, incluido el
// del `**`. Si uno no lo es, revienta con NG04014 al navegar —no al compilar—
// y la url se queda quieta sin decir por qué.
// ============================================================================
export const VENTAS_ROUTES: Routes = [
  {
    path: '',
    children: [
      { path: '', redirectTo: 'home-ventas', pathMatch: 'full' },

      { path: 'allClientes', component: AllClientesComponent, canActivate: [AuthGuard], resolve: { access: AccessResolver }},

      // El programa/menú 'allGruposClientes' está en seguridad.menus con la
      // url 'ventas/allGruposClientes': el acceso sale del segundo tramo
      // (-> ALLGRUPOSCLIENTES), así que el path tiene que llamarse igual.
      { path: 'allGruposClientes', component: AllGruposClientesComponent, canActivate: [AuthGuard], resolve: { access: AccessResolver }},
      { path: 'gestionClientes', component: GestionClientesComponent, canActivate: [AuthGuard], resolve: { access: AccessResolver }},
      { path: 'catalogoGestion', component: CatalogoGestionComponent, canActivate: [AuthGuard], resolve: { access: AccessResolver }},

      // El programa/menú 'asignacionClienteMasiva' hay que crearlo en la base
      // o esta ruta cae en el 404 aunque el componente esté bien: los accesos
      // se leen de seguridad.accesos y el programa sale del segundo tramo de
      // la url del menú (ventas/asignacionClienteMasiva -> ASIGNACIONCLIENTEMASIVA)
      { path: 'asignacionClienteMasiva', component: AsignacionClienteMasivaComponent, canActivate: [AuthGuard], resolve: { access: AccessResolver }},
      { path: 'allZonas', component: AllZonasComponent, canActivate: [AuthGuard], resolve: { access: AccessResolver }},

      // El programa/menú 'rutaCobrador' hay que crearlo en seguridad.accesos
      // o esta ruta cae en el 404 aunque el componente esté bien: el programa
      // sale del segundo tramo de la url (ventas/rutaCobrador -> RUTACOBRADOR).
      { path: 'rutaCobrador', component: RutaCobradorComponent, canActivate: [AuthGuard], resolve: { access: AccessResolver }},

      // El programa/menú «allProformas» está en seguridad.menus con la url
      // «ventas/allProformas»: el acceso sale del segundo tramo
      // (-> ALLPROFORMAS), así que el path tiene que llamarse igual.
      { path: 'allProformas', component: AllProformasComponent, canActivate: [AuthGuard], resolve: { access: AccessResolver }},

      { path: 'home-ventas', component: HomeComponent, data: { title: 'Ventas' }, canActivate: [AuthGuard], resolve: { access: AccessResolver } },
      { path: '**', component: ErrorPage },
    ]
  },
];
