import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { AuthGuard } from '../../core/guards/auth.guard';
import { AccessResolver } from "../../core/resolvers/access.resolver";
import { ErrorPage } from '../../pages/error/error';

import { HomeComponent } from './pages/home/home.component';
import { AllCargosComponent } from './pages/cargos/allCargos/allCargos.component';
import { AllDepartamentosComponent } from './pages/departamentos/allDepartamentos/allDepartamentos.component';
import { AllEmpleadosComponent } from './pages/empleados/allEmpleados/allEmpleados.component';

const routes: Routes = [
{
  path: '',
  children: [
        { path: '', redirectTo: 'home-rh', pathMatch: 'full' },

        { path: 'allCargos', component: AllCargosComponent, canActivate: [AuthGuard], resolve: { access: AccessResolver }},
        { path: 'allDepartamentos', component: AllDepartamentosComponent, canActivate: [AuthGuard], resolve: { access: AccessResolver }},
        { path: 'allEmpleados', component: AllEmpleadosComponent, canActivate: [AuthGuard], resolve: { access: AccessResolver }},

        { path: 'home-rh', component: HomeComponent, data: { title: 'Recursos Humanos' }, canActivate: [AuthGuard], resolve: { access: AccessResolver } },
        { path: '**', component: ErrorPage },
  ]
},
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class RhRoutingModule { }
