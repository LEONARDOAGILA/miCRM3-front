import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { ErrorPage } from '../../pages/error/error';
import { AuthGuard } from '../../core/guards/auth.guard';
import { AccessResolver } from '../../core/resolvers/access.resolver';

import { HomeComponent } from './pages/home/home.component';
import { AllMarcasComponent } from './pages/marcas/allMarcas/allMarcas.component';
import { AllCategoriasComponent } from './pages/categorias/allCategorias/allCategorias.component';
import { AllProductosComponent } from './pages/productos/allProductos/allProductos.component';

// ============================================================================
// EL `path` TIENE QUE COINCIDIR CON LA URL DEL MENÚ (seguridad.menus.url).
// El programa sale del segundo tramo —inventarios/allMarcas da ALLMARCAS— y
// así lo busca findByProgramProfile: si no coinciden, el resolver manda a
// /access-deny y parece un fallo del componente.
// ============================================================================
const routes: Routes = [
  {
    path: '',
    children: [
      { path: '', redirectTo: 'home', pathMatch: 'full' },

      { path: 'allCategorias', component: AllCategoriasComponent, canActivate: [AuthGuard], resolve: { access: AccessResolver } },
      { path: 'allMarcas',     component: AllMarcasComponent,     canActivate: [AuthGuard], resolve: { access: AccessResolver } },
      { path: 'allProductos',  component: AllProductosComponent,  canActivate: [AuthGuard], resolve: { access: AccessResolver } },

      { path: 'home', component: HomeComponent, data: { title: 'Home page' } },
      { path: '**', component: ErrorPage },
    ]
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class InventarioRoutingModule { }
