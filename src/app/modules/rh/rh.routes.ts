import { Routes } from '@angular/router';

import { AuthGuard } from '../../core/guards/auth.guard';
import { AccessResolver } from "../../core/resolvers/access.resolver";
import { ErrorPage } from '../../pages/error/error';

import { HomeComponent } from './pages/home/home.component';
import { AllCargosComponent } from './pages/cargos/allCargos/allCargos.component';
import { AllDepartamentosComponent } from './pages/departamentos/allDepartamentos/allDepartamentos.component';
import { AllEmpleadosComponent } from './pages/empleados/allEmpleados/allEmpleados.component';
import { AllMarcacionesComponent } from './pages/marcaciones/allMarcaciones/allMarcaciones.component';
import { KioscoMarcacionComponent } from './pages/marcaciones/kiosco/kioscoMarcacion.component';
import { RegistroMarcacionesComponent } from './pages/marcaciones/registro-marcaciones/registroMarcaciones.component';
import { AllHorariosEmpleadosComponent } from './pages/horarios-empleados/allHorariosEmpleados/allHorariosEmpleados.component';

// ============================================================================
// SIN NgModule A PROPÓSITO: las 34 clases del módulo son standalone, así que un
// módulo aquí sólo serviría para envolver estas rutas y declarar una lista
// vacía. `loadChildren` carga este array tal cual y el trozo sigue siendo
// perezoso igual. Sustituye a `rh.module.ts` + `rh-routing.module.ts`
// (27/10/2026), como ya se hizo en core, contabilidad, inventarios y reportes.
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
//
// EL `path` TIENE QUE COINCIDIR CON LA URL DEL MENÚ (seguridad.menus.url).
// El programa sale del segundo tramo —rh/allCargos da ALLCARGOS— y así lo
// busca findByProgramProfile: si no coinciden, el resolver manda a
// /access-deny y parece un fallo del componente.
// ============================================================================
export const RH_ROUTES: Routes = [
  {
    path: '',
    children: [
      { path: '', redirectTo: 'home-rh', pathMatch: 'full' },

      { path: 'allCargos', component: AllCargosComponent, canActivate: [AuthGuard], resolve: { access: AccessResolver }},
      { path: 'allDepartamentos', component: AllDepartamentosComponent, canActivate: [AuthGuard], resolve: { access: AccessResolver }},
      { path: 'allEmpleados', component: AllEmpleadosComponent, canActivate: [AuthGuard], resolve: { access: AccessResolver }},
      { path: 'allMarcaciones', component: AllMarcacionesComponent, canActivate: [AuthGuard], resolve: { access: AccessResolver }},
      // Los horarios de trabajo del personal: con ellos se miden los
      // atrasos de las marcaciones.
      { path: 'allHorariosEmpleados', component: AllHorariosEmpleadosComponent, canActivate: [AuthGuard], resolve: { access: AccessResolver }},
      { path: 'kioscoMarcacion', component: KioscoMarcacionComponent, canActivate: [AuthGuard], resolve: { access: AccessResolver }},
      // El empleado marca desde su propio celular. El programa/menú
      // 'registroMarcaciones' hay que crearlo en seguridad.accesos o la
      // ruta cae en el 404: el programa sale del segundo tramo de la url.
      { path: 'registroMarcaciones', component: RegistroMarcacionesComponent, canActivate: [AuthGuard], resolve: { access: AccessResolver }},

      { path: 'home-rh', component: HomeComponent, data: { title: 'Recursos Humanos' }, canActivate: [AuthGuard], resolve: { access: AccessResolver } },
      { path: '**', component: ErrorPage },
    ]
  },
];
