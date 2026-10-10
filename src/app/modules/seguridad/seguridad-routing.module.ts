import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

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




const routes: Routes = [
{
  path: '',
  children: [
        { path: '', redirectTo: 'home-seguridad', pathMatch: 'full' },

        {path: 'register',component: RegisterComponent},
        {path: 'login',component: LoginComponent},


        { path: 'allProfiles',component:AllProfilesComponent, canActivate: [AuthGuard], resolve: { access: AccessResolver }},
        { path: 'allMenus',component:AllMenusComponent, canActivate: [AuthGuard], resolve: { access: AccessResolver }},                  
        { path: 'allUsuarios',component:AllUsersComponent, canActivate: [AuthGuard], resolve: { access: AccessResolver }},
        { path: 'usuariosGrupos',component:UsuariosGruposComponent, canActivate: [AuthGuard], resolve: { access: AccessResolver }},
        { path: 'allHorarios',component:AllHorariosComponent, canActivate: [AuthGuard], resolve: { access: AccessResolver }},
        // El menú/programa 'allTiposUsuario' hay que crearlo en la base o esta
        // ruta da 404 aunque el componente esté bien (los accesos se leen de
        // seguridad.accesos; lo crea Leonardo desde Menús)
        { path: 'allTiposUsuario',component:AllTiposUsuarioComponent, canActivate: [AuthGuard], resolve: { access: AccessResolver }},

        
        { path: 'home-seguridad', component: HomeComponent, data: { title: 'Home page'}, canActivate: [AuthGuard], resolve: { access: AccessResolver } },
        { path: '**', component: ErrorPage},
  ]
},

  
  
];


@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class SeguridadRoutingModule { }
