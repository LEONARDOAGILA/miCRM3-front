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
  { path: 'clientes', loadChildren: () => import('./modules/clientes/cliente.module').then( m => m.ClienteModule)},
  { path: 'inventarios', loadChildren: () => import('./modules/inventarios/inventario.module').then( m => m.InventarioModule)},
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
