import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { CommonModule } from '@angular/common';

// Home
import { HomePage } from './pages/home/home';

// Error
import { ErrorPage } from './pages/error/error';
import { AuthGuard } from './core/guards/auth.guard';
import { AccessResolver } from "./core/resolvers/access.resolver";
import { MiobservableComponent } from './modules/demo/pages/observables/observable/miobservable.component';




const routes: Routes = [

  //{ path: 'auth', loadChildren: () => import('./modules/auth222/auth.module').then( m => m.AuthModule)},
  { path: 'demo', loadChildren: () => import('./modules/demo/demo.module').then( m => m.DemoModule)},
  { path: 'config', loadChildren: () => import('./modules/config/config.module').then( m => m.ConfigModule)},
  { path: 'seguridad', loadChildren: () => import('./modules/seguridad/seguridad.module').then( m => m.SeguridadModule)},
  { path: 'rh', loadChildren: () => import('./modules/rh/rh.module').then( m => m.RhModule)},
  { path: 'ventas', loadChildren: () => import('./modules/ventas/ventas.module').then( m => m.VentasModule)},
  // La estructura de la empresa: sucursales y puntos de venta. No está en
  // ventas porque de ella cuelgan también rh, inventarios y contabilidad.
  // Sin NgModule: sus pantallas son standalone y loadChildren carga el array
  // de rutas tal cual, igual de perezoso y sin un módulo que no declara nada.
  { path: 'core', loadChildren: () => import('./modules/core/core.routes').then( m => m.CORE_ROUTES)},
  { path: 'inventarios', loadChildren: () => import('./modules/inventarios/inventario.module').then( m => m.InventarioModule)},
  { path: 'contabilidad', loadChildren: () => import('./modules/contabilidad/contabilidad.module').then( m => m.ContabilidadModule)},
  { path: 'reportes', loadChildren: () => import('./modules/reportes/reportes.module').then( m => m.ReportesModule)},
  
  //{ path: '', redirectTo: '/home', pathMatch: 'full' },  
  { path: '', component: HomePage, canActivate: [AuthGuard], resolve: { profile: AccessResolver }  },  
  { path: 'home', component: HomePage, data: { title: 'Home page'}, canActivate: [AuthGuard], resolve: { profile: AccessResolver } },
  { path: 'listo', component: MiobservableComponent, data: { title: 'Home page'}},

  { path: '**', component: ErrorPage, data: { title: '404 Error'} },


];

@NgModule({
  imports: [ CommonModule, RouterModule.forRoot(routes) ],
  exports: [ RouterModule ],
  declarations: []
})


export class AppRoutingModule { }
