import { Routes } from '@angular/router';

import { AuthGuard } from '../../core/guards/auth.guard';
import { AccessResolver } from '../../core/resolvers/access.resolver';

import { AllPaginasInformativasComponent } from './pages/paginasInformativas/allPaginasInformativas/allPaginasInformativas.component';

// ============================================================================
// MÓDULO ECOMMERCE: la administración de la página web.
//
// SIN NgModule, como core, contabilidad e inventarios: todas las clases son
// standalone, así que un módulo aquí sólo serviría para envolver estas rutas.
// `loadChildren` carga el array tal cual y el trozo sigue siendo perezoso.
//
// OJO: TODO componente de estas rutas tiene que ser standalone. Si uno no lo
// es, revienta con NG04014 al navegar —no al compilar— y la url se queda
// quieta sin decir por qué.
//
// EL `path` TIENE QUE COINCIDIR CON LA URL DEL MENÚ (seguridad.menus.url).
// El programa sale del segundo tramo —ecommerce/allPaginasInformativas da
// ALLPAGINASINFORMATIVAS— y así lo busca findByProgramProfile: si no
// coinciden, el resolver manda a /access-deny y parece un fallo del
// componente. Esta pantalla necesita su menú creado o no se abre.
//
// Este módulo se traslada por pantallas desde el CRM viejo
// (crm-front/src/app/pagina_web). De las quince, aquí están las páginas
// informativas; las demás se van añadiendo a este mismo array.
// ============================================================================
export const ECOMMERCE_ROUTES: Routes = [
  {
    path: '',
    children: [
      { path: '', redirectTo: 'allPaginasInformativas', pathMatch: 'full' },

      {
        path: 'allPaginasInformativas',
        component: AllPaginasInformativasComponent,
        canActivate: [AuthGuard],
        resolve: { access: AccessResolver },
      },

      { path: '**', redirectTo: 'allPaginasInformativas' },
    ],
  },
];
