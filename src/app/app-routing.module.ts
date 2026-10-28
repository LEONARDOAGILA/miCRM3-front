import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { CommonModule } from '@angular/common';

// Home
import { HomePage } from './pages/home/home';

// Error
import { ErrorPage } from './pages/error/error';
import { AccessDenyComponent } from './pages/access-deny/access-deny.component';
import { AuthGuard } from './core/guards/auth.guard';
import { AccessResolver } from "./core/resolvers/access.resolver";
import { MiobservableComponent } from './modules/demo/pages/observables/observable/miobservable.component';




const routes: Routes = [

  //{ path: 'auth', loadChildren: () => import('./modules/auth222/auth.module').then( m => m.AuthModule)},
  { path: 'demo', loadChildren: () => import('./modules/demo/demo.module').then( m => m.DemoModule)},
  // Sin NgModule: sus pantallas son standalone y loadChildren carga el array
  { path: 'seguridad', loadChildren: () => import('./modules/seguridad/seguridad.routes').then( m => m.SEGURIDAD_ROUTES)},
  // Sin NgModule: sus pantallas son standalone y loadChildren carga el array
  { path: 'rh', loadChildren: () => import('./modules/rh/rh.routes').then( m => m.RH_ROUTES)},
  // Sin NgModule: sus pantallas son standalone y loadChildren carga el array
  { path: 'ventas', loadChildren: () => import('./modules/ventas/ventas.routes').then( m => m.VENTAS_ROUTES)},
  // La estructura de la empresa: sucursales y puntos de venta. No está en
  // ventas porque de ella cuelgan también rh, inventarios y contabilidad.
  // Sin NgModule: sus pantallas son standalone y loadChildren carga el array
  // de rutas tal cual, igual de perezoso y sin un módulo que no declara nada.
  { path: 'core', loadChildren: () => import('./modules/core/core.routes').then( m => m.CORE_ROUTES)},
  // Sin NgModule: sus pantallas son standalone y loadChildren carga el array
  { path: 'inventarios', loadChildren: () => import('./modules/inventarios/inventario.routes').then( m => m.INVENTARIO_ROUTES)},
  // Sin NgModule: sus pantallas son standalone y loadChildren carga el array
  { path: 'contabilidad', loadChildren: () => import('./modules/contabilidad/contabilidad.routes').then( m => m.CONTABILIDAD_ROUTES)},
  // Sin NgModule: su pantalla es standalone y loadChildren carga el array
  { path: 'reportes', loadChildren: () => import('./modules/reportes/reportes.routes').then( m => m.REPORTES_ROUTES)},
  
  //{ path: '', redirectTo: '/home', pathMatch: 'full' },  
  { path: '', component: HomePage, canActivate: [AuthGuard], resolve: { profile: AccessResolver }  },  
  { path: 'home', component: HomePage, data: { title: 'Home page'}, canActivate: [AuthGuard], resolve: { profile: AccessResolver } },
  { path: 'listo', component: MiobservableComponent, data: { title: 'Home page'}},

  // AccessResolver (core/resolvers/access.resolver.ts) manda aquí cuando el
  // perfil no tiene el acceso a la pantalla. La ruta no existía: /access-deny
  // caía en el '**' de abajo y se enseñaba el 404, o sea «no existe» cuando lo
  // que pasaba de verdad era «no tienes permiso».
  { path: 'access-deny', component: AccessDenyComponent, data: { title: 'Acceso denegado'} },

  { path: '**', component: ErrorPage, data: { title: '404 Error'} },


];

@NgModule({
  imports: [ CommonModule, RouterModule.forRoot(routes) ],
  exports: [ RouterModule ],
  declarations: []
})


export class AppRoutingModule { }
