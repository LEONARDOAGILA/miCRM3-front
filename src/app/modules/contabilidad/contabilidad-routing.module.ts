import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { ErrorPage } from '../../pages/error/error';
import { AuthGuard } from '../../core/guards/auth.guard';
import { AccessResolver } from '../../core/resolvers/access.resolver';

import { HomeComponent } from './pages/home/home.component';
import { AllPlanCuentasComponent } from './pages/plan-de-cuentas/allPlanCuentas/allPlanCuentas.component';
import { AllCuentasCategoriasComponent } from './pages/cuentas-categorias/allCuentasCategorias/allCuentasCategorias.component';
import { AllCuentasClientesComponent } from './pages/cuentas-clientes/allCuentasClientes/allCuentasClientes.component';

// ============================================================================
// EL `path` TIENE QUE COINCIDIR CON LA URL DEL MENÚ (seguridad.menus.url).
// El programa sale del segundo tramo —contabilidad/allPlanCuentas da
// ALLPLANCUENTAS— y así lo busca findByProgramProfile: si no coinciden, el
// resolver manda a /access-deny y parece un fallo del componente.
// ============================================================================
const routes: Routes = [
  {
    path: '',
    children: [
      { path: '', redirectTo: 'home', pathMatch: 'full' },

      { path: 'allPlanCuentas', component: AllPlanCuentasComponent, canActivate: [AuthGuard], resolve: { access: AccessResolver } },
      // Qué cuenta usa cada categoría de productos. El componente es
      // standalone: no hace falta declararlo en el módulo.
      { path: 'allCuentasCategorias', component: AllCuentasCategoriasComponent, canActivate: [AuthGuard], resolve: { access: AccessResolver } },

      // El programa/menú 'allCuentasClientes' está en seguridad.menus con la
      // url 'contabilidad/allCuentasClientes': el acceso sale del segundo
      // tramo (-> ALLCUENTASCLIENTES), así que el path se llama igual.
      { path: 'allCuentasClientes', component: AllCuentasClientesComponent, canActivate: [AuthGuard], resolve: { access: AccessResolver } },

      // El menú apunta a 'contabilidad/home-contabilidad' (así está en
      // seguridad.menus): sin esta ruta el módulo entero caería en el 404 al
      // pulsar su entrada. Se deja también 'home', que es a donde redirige la
      // ruta vacía y lo que usan los 'volver' de las pantallas.
      { path: 'home-contabilidad', component: HomeComponent, data: { title: 'Home page' }, canActivate: [AuthGuard] },
      { path: 'home', component: HomeComponent, data: { title: 'Home page' } },
      { path: '**', component: ErrorPage },
    ]
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ContabilidadRoutingModule { }
