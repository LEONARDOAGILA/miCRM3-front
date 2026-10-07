import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { AuthGuard } from '../../core/guards/auth.guard';
import { AccessResolver } from "../../core/resolvers/access.resolver";
import { ErrorPage } from '../../pages/error/error';

import { HomeComponent } from './pages/home/home.component';
import { AllClientesComponent } from './pages/clientes/allClientes/allClientes.component';
import { GestionClientesComponent } from './pages/gestion-clientes/gestionClientes.component';
import { CatalogoGestionComponent } from './pages/catalogo-gestion/catalogoGestion.component';

const routes: Routes = [
{
  path: '',
  children: [
        { path: '', redirectTo: 'home-ventas', pathMatch: 'full' },

        { path: 'allClientes', component: AllClientesComponent, canActivate: [AuthGuard], resolve: { access: AccessResolver }},
        { path: 'gestionClientes', component: GestionClientesComponent, canActivate: [AuthGuard], resolve: { access: AccessResolver }},
        { path: 'catalogoGestion', component: CatalogoGestionComponent, canActivate: [AuthGuard], resolve: { access: AccessResolver }},

        { path: 'home-ventas', component: HomeComponent, data: { title: 'Ventas' }, canActivate: [AuthGuard], resolve: { access: AccessResolver } },
        { path: '**', component: ErrorPage },
  ]
},
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class VentasRoutingModule { }
