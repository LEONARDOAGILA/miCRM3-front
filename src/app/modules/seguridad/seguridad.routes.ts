import { Routes } from '@angular/router';

import { AuthGuard } from '../../core/guards/auth.guard';
import { AccessResolver } from "../../core/resolvers/access.resolver";
import { ErrorPage } from '../../pages/error/error';

import { HomeComponent } from './pages/home/home.component';
import { LoginComponent } from './pages/login/login.component';
import { RegisterComponent } from './pages/register/register.component';

import { AllProfilesComponent } from './pages/profiles/allProfiles/allProfiles.component';
import { AllMenusComponent } from './pages/menus/allMenus/allMenus.component';
import { AllUsersComponent } from './pages/users/allUsers/allUsers.component';
import { AllHorariosComponent } from './pages/horarios/allHorarios/allHorarios.component';
import { UsuariosGruposComponent } from './pages/grupos/usuariosGrupos/usuariosGrupos.component';
import { AllTiposUsuarioComponent } from './pages/tiposUsuario/allTiposUsuario/allTiposUsuario.component';

// ============================================================================
// SIN NgModule A PROPÓSITO: las 37 clases del módulo son standalone, así que un
// módulo aquí sólo serviría para envolver estas rutas y declarar una lista
// vacía. `loadChildren` carga este array tal cual y el trozo sigue siendo
// perezoso igual. Sustituye a `seguridad.module.ts` +
// `seguridad-routing.module.ts` (27/10/2026): con éste, ya no queda ningún
// NgModule de pantallas en el proyecto salvo el de `demo`.
//
// Con el módulo se fueron sus imports de sólo-proveedores, que el build no
// mira: `HttpClient` lo da el `HttpClientModule` de app.module y
// `LoadingBarService` es providedIn: 'root'. Aquí, a diferencia del resto de
// módulos, el `DirectiveModule` NO sobraba: lo usa el login
// (appMayusculas / appNoEspacios / appTrimEspacios), igual que
// `CampoBusquedaComponent`, que usan allMenus y save2Profile.
//
// OJO: TODO componente de estas rutas tiene que ser standalone, incluido el
// del `**`. Si uno no lo es, revienta con NG04014 al navegar —no al compilar—
// y la url se queda quieta sin decir por qué.
// ============================================================================
export const SEGURIDAD_ROUTES: Routes = [
  {
    path: '',
    children: [
      { path: '', redirectTo: 'home-seguridad', pathMatch: 'full' },

      { path: 'register', component: RegisterComponent },
      { path: 'login', component: LoginComponent },

      { path: 'allProfiles', component: AllProfilesComponent, canActivate: [AuthGuard], resolve: { access: AccessResolver }},
      { path: 'allMenus', component: AllMenusComponent, canActivate: [AuthGuard], resolve: { access: AccessResolver }},
      { path: 'allUsuarios', component: AllUsersComponent, canActivate: [AuthGuard], resolve: { access: AccessResolver }},
      { path: 'usuariosGrupos', component: UsuariosGruposComponent, canActivate: [AuthGuard], resolve: { access: AccessResolver }},
      { path: 'allHorarios', component: AllHorariosComponent, canActivate: [AuthGuard], resolve: { access: AccessResolver }},
      // El menú/programa 'allTiposUsuario' hay que crearlo en la base o esta
      // ruta da 404 aunque el componente esté bien (los accesos se leen de
      // seguridad.accesos; lo crea Leonardo desde Menús)
      { path: 'allTiposUsuario', component: AllTiposUsuarioComponent, canActivate: [AuthGuard], resolve: { access: AccessResolver }},

      { path: 'home-seguridad', component: HomeComponent, data: { title: 'Home page' }, canActivate: [AuthGuard], resolve: { access: AccessResolver } },
      { path: '**', component: ErrorPage },
    ]
  },
];
