import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { ErrorPage } from '../../pages/error/error';
import { HomeComponent } from './pages/home/home.component';




const routes: Routes = [
{
  path: '',
  children: [
        { path: '', redirectTo: 'home', pathMatch: 'full' },
        // { path: 'allProfiles',component:AllProfilesComponent, canActivate: [AuthGuard], resolve: { access: AccessResolver }},
        
        { path: 'home', component: HomeComponent, data: { title: 'Home page'} },
        { path: '**', component: ErrorPage},
  ]
},

];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ClienteRoutingModule { }
