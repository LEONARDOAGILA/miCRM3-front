import { Routes } from '@angular/router';

import { AuthGuard } from '../../core/guards/auth.guard';
import { AccessResolver } from '../../core/resolvers/access.resolver';
import { ErrorPage } from '../../pages/error/error';

import { AllSucursalesComponent } from './pages/sucursales/allSucursales/allSucursales.component';
import { AllPuntosVentaComponent } from './pages/puntos-venta/allPuntosVenta/allPuntosVenta.component';
import { FileManagerComponent } from './pages/administrador-archivos/file-manager/file-manager.component';
import { AllBoletinesComponent } from './pages/boletines/allBoletines/allBoletines.component';
import { AllNotificacionesComponent } from './pages/notificaciones/allNotificaciones/allNotificaciones.component';
import { HomeComponent } from './pages/home/home.component';
import { ExtraSettingsPage } from './pages/extra-settings-page/extra-settings-page';
import { ExtraSearchResultsPage } from './pages/extra-search-results/extra-search-results';
import { ExtraProfilePage } from './pages/extra-profile/extra-profile';

/**
 * MÓDULO CORE: lo que no es de un módulo sino de todos.
 *
 * Dos familias:
 *
 *   · LA ESTRUCTURA DE LA EMPRESA — sucursales y las cajas de cada una. De
 *     una sucursal cuelgan los empleados (rh), las bodegas (inventarios) y
 *     sus cuentas contables, así que tenerlas en ventas obligaba a que los
 *     demás dependieran de ventas.
 *
 *   · LO TRANSVERSAL — archivos, boletines y notificaciones, que en la base
 *     son `core.archivos`, `core.boletines` y `core.notificaciones`, y en el
 *     back están en `Controllers/core`.
 *
 * SIN NgModule A PROPÓSITO: todas las pantallas son standalone, así que un
 * módulo aquí sólo serviría para envolver estas rutas y declarar una lista
 * vacía. `loadChildren` carga este array tal cual y el trozo sigue siendo
 * perezoso igual.
 *
 * EL PATH DE CADA RUTA NO SE PUEDE CAMBIAR A LA LIGERA: el permiso sale del
 * SEGUNDO TRAMO de la url del menú (core/allSucursales -> ALLSUCURSALES), y
 * `seguridad.menus` tiene que decir exactamente lo mismo o la pantalla cae en
 * el 404 aunque el componente esté bien.
 */
export const CORE_ROUTES: Routes = [
  {
    path: '',
    children: [
      { path: '', redirectTo: 'home-config', pathMatch: 'full' },

      // ---------- La estructura de la empresa ----------
      { path: 'allSucursales', component: AllSucursalesComponent,
        canActivate: [AuthGuard], resolve: { access: AccessResolver } },

      // Las cajas las crean los contadores: sus accesos se copiaron de los
      // del plan de cuentas, no de los de la pantalla de clientes.
      { path: 'allPuntosVenta', component: AllPuntosVentaComponent,
        canActivate: [AuthGuard], resolve: { access: AccessResolver } },

      // ---------- Lo transversal ----------
      { path: 'filemanager', component: FileManagerComponent,
        canActivate: [AuthGuard], resolve: { access: AccessResolver } },

      // El mismo componente en modo usuario: sólo lo que puede ver, y las
      // acciones según su permiso
      { path: 'misArchivos', component: FileManagerComponent, data: { modo: 'mio' },
        canActivate: [AuthGuard], resolve: { access: AccessResolver } },

      { path: 'boletines', component: AllBoletinesComponent,
        canActivate: [AuthGuard], resolve: { access: AccessResolver } },

      { path: 'notificaciones', component: AllNotificacionesComponent,
        canActivate: [AuthGuard], resolve: { access: AccessResolver } },

      // ---------- Las de la plantilla ----------
      // No tienen menú: cuelgan del desplegable del encabezado y del pie del
      // menú lateral (Editar perfil, Ajustes, Ayuda).
      { path: 'extra-settings', component: ExtraSettingsPage },
      { path: 'extra-search-results', component: ExtraSearchResultsPage },
      { path: 'extra-profile', component: ExtraProfilePage },

      { path: 'home-config', component: HomeComponent, data: { title: 'Home page' },
        canActivate: [AuthGuard], resolve: { access: AccessResolver } },

      { path: '**', component: ErrorPage },
    ],
  },
];
