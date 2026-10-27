import { Routes } from '@angular/router';

import { AuthGuard } from '../../core/guards/auth.guard';
import { AccessResolver } from '../../core/resolvers/access.resolver';
import { ErrorPage } from '../../pages/error/error';

import { AllSucursalesComponent } from './pages/sucursales/allSucursales/allSucursales.component';
import { AllPuntosVentaComponent } from './pages/puntos-venta/allPuntosVenta/allPuntosVenta.component';

/**
 * MÓDULO CORE: la estructura de la empresa.
 *
 * Aquí viven las pantallas de lo que no es de un módulo sino de todos: las
 * sucursales y las cajas de cada una. De una sucursal cuelgan los empleados
 * (rh), las bodegas (inventarios) y sus cuentas contables, así que tenerlas
 * en ventas obligaba a que los demás dependieran de ventas.
 *
 * SIN NgModule A PROPÓSITO: los componentes son standalone, así que un
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
      { path: '', redirectTo: 'allSucursales', pathMatch: 'full' },

      { path: 'allSucursales', component: AllSucursalesComponent,
        canActivate: [AuthGuard], resolve: { access: AccessResolver } },

      // Las cajas las crean los contadores: sus accesos se copiaron de los
      // del plan de cuentas, no de los de la pantalla de clientes.
      { path: 'allPuntosVenta', component: AllPuntosVentaComponent,
        canActivate: [AuthGuard], resolve: { access: AccessResolver } },

      { path: '**', component: ErrorPage },
    ],
  },
];
