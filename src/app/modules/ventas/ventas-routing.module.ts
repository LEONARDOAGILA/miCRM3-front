import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { AuthGuard } from '../../core/guards/auth.guard';
import { AccessResolver } from "../../core/resolvers/access.resolver";
import { ErrorPage } from '../../pages/error/error';

import { HomeComponent } from './pages/home/home.component';
import { AllClientesComponent } from './pages/clientes/allClientes/allClientes.component';
import { AllGruposClientesComponent } from './pages/clientes/grupos/allGruposClientes/allGruposClientes.component';
import { GestionClientesComponent } from './pages/gestion-clientes/gestionClientes.component';
import { CatalogoGestionComponent } from './pages/catalogo-gestion/catalogoGestion.component';
import { AsignacionClienteMasivaComponent } from './pages/gestion-clientes/asignacionClienteMasiva/asignacionClienteMasiva.component';
import { AllZonasComponent } from './pages/zonas/allZonas/allZonas.component';
import { AllSucursalesComponent } from './pages/sucursales/allSucursales/allSucursales.component';
import { RutaCobradorComponent } from './pages/ruta-cobrador/rutaCobrador.component';

const routes: Routes = [
{
  path: '',
  children: [
        { path: '', redirectTo: 'home-ventas', pathMatch: 'full' },

        { path: 'allClientes', component: AllClientesComponent, canActivate: [AuthGuard], resolve: { access: AccessResolver }},

        // El programa/menú 'allGruposClientes' está en seguridad.menus con la
        // url 'ventas/allGruposClientes': el acceso sale del segundo tramo
        // (-> ALLGRUPOSCLIENTES), así que el path tiene que llamarse igual.
        { path: 'allGruposClientes', component: AllGruposClientesComponent, canActivate: [AuthGuard], resolve: { access: AccessResolver }},
        { path: 'gestionClientes', component: GestionClientesComponent, canActivate: [AuthGuard], resolve: { access: AccessResolver }},
        { path: 'catalogoGestion', component: CatalogoGestionComponent, canActivate: [AuthGuard], resolve: { access: AccessResolver }},

        // El programa/menú 'asignacionClienteMasiva' hay que crearlo en la base
        // o esta ruta cae en el 404 aunque el componente esté bien: los accesos
        // se leen de seguridad.accesos y el programa sale del segundo tramo de
        // la url del menú (ventas/asignacionClienteMasiva -> ASIGNACIONCLIENTEMASIVA)
        { path: 'asignacionClienteMasiva', component: AsignacionClienteMasivaComponent, canActivate: [AuthGuard], resolve: { access: AccessResolver }},
        { path: 'allZonas', component: AllZonasComponent, canActivate: [AuthGuard], resolve: { access: AccessResolver }},

        // El programa/menú 'allSucursales' hay que crearlo en seguridad.accesos
        // o esta ruta cae en el 404 aunque el componente esté bien: el programa
        // sale del segundo tramo de la url (ventas/allSucursales -> ALLSUCURSALES).
        { path: 'allSucursales', component: AllSucursalesComponent, canActivate: [AuthGuard], resolve: { access: AccessResolver }},

        // El programa/menú 'rutaCobrador' hay que crearlo en seguridad.accesos
        // o esta ruta cae en el 404 aunque el componente esté bien: el programa
        // sale del segundo tramo de la url (ventas/rutaCobrador -> RUTACOBRADOR).
        { path: 'rutaCobrador', component: RutaCobradorComponent, canActivate: [AuthGuard], resolve: { access: AccessResolver }},

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
