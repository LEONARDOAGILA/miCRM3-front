import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { ErrorPage } from '../../pages/error/error';
import { AuthGuard } from '../../core/guards/auth.guard';
import { AccessResolver } from '../../core/resolvers/access.resolver';

import { HomeComponent } from './pages/home/home.component';
import { AllMarcasComponent } from './pages/marcas/allMarcas/allMarcas.component';
import { AllCategoriasComponent } from './pages/categorias/allCategorias/allCategorias.component';
import { AllProductosComponent } from './pages/productos/allProductos/allProductos.component';
import { AllCaracteristicasComponent } from './pages/caracteristicas/allCaracteristicas/allCaracteristicas.component';

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
      // La plantilla de caracteristicas de cada categoria
      { path: 'allCaracteristicas', component: AllCaracteristicasComponent, canActivate: [AuthGuard], resolve: { access: AccessResolver } },

      // El menu apunta a 'inventarios/home-inventarios' (asi esta en
      // seguridad.menus) y esa ruta no existia: el modulo entero caia en el
      // 404 al pulsar su entrada. Se deja tambien 'home', que es a donde
      // redirige la ruta vacia y lo que usan los 'volver' de las pantallas.
      { path: 'home-inventarios', component: HomeComponent, data: { title: 'Home page' }, canActivate: [AuthGuard] },
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
