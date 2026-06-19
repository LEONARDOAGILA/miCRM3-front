import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { AuthGuard } from '../../core/guards/auth.guard';
import { AccessResolver } from "../../core/resolvers/access.resolver";
import { ErrorPage } from '../../pages/error/error';

import { HomeComponent } from './pages/home/home.component';


import { AllDepartamentosComponent } from './pages/departamentos/allDepartamentos/allDepartamentos.component';
import { FileManagerComponent } from './pages/administrador-archivos/file-manager/file-manager.component';
import { ExtraSettingsPage } from './pages/extra-settings-page/extra-settings-page';
import { ExtraSearchResultsPage } from './pages/extra-search-results/extra-search-results';
import { ExtraProfilePage } from './pages/extra-profile/extra-profile';




const routes: Routes = [
{
  path: '',
  children: [
        { path: '', redirectTo: 'home-config', pathMatch: 'full' },


        { path: 'allDepartamentos',component:AllDepartamentosComponent, canActivate: [AuthGuard], resolve: { access: AccessResolver }},
        { path: 'filemanager',component:FileManagerComponent, canActivate: [AuthGuard], resolve: { access: AccessResolver }},

        { path: 'extra-settings', component: ExtraSettingsPage},
        { path: 'extra-search-results', component: ExtraSearchResultsPage },
        { path: 'extra-profile', component: ExtraProfilePage },

        { path: 'home-config', component: HomeComponent, data: { title: 'Home page'}, canActivate: [AuthGuard], resolve: { access: AccessResolver } },
        { path: '**', component: ErrorPage},
  ]
},

  
  
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ConfigRoutingModule { }
