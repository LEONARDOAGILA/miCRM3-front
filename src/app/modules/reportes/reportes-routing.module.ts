import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { AuthGuard } from '../../core/guards/auth.guard';
import { AccessResolver } from "../../core/resolvers/access.resolver";
import { ErrorPage } from '../../pages/error/error';

import { HomeComponent } from './pages/home/home.component';

import { AllReportesExternosComponent } from './pages/reportesExternos/allReportesExternos/allReportesExternos.component';
import { ListUsuariosReportesExternosComponent } from './pages/reportesExternos/listUsuariosReportesExternos/listUsuariosReportesExternos.component';




const routes: Routes = [
{
  path: '',
  children: [
        { path: '', redirectTo: 'home', pathMatch: 'full' },

        { path: 'allReportesExternos',component:AllReportesExternosComponent, canActivate: [AuthGuard], resolve: { access: AccessResolver }},
        { path: 'listUsuariosReportesExternos',component:ListUsuariosReportesExternosComponent, canActivate: [AuthGuard], resolve: { access: AccessResolver }},

        { path: 'home', component: HomeComponent, data: { title: 'Home page'} },
        { path: '**', component: ErrorPage},
  ]
},

  
  
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ReportesRoutingModule { }
