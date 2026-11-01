import { Routes } from '@angular/router';

import { AuthGuard } from '../../core/guards/auth.guard';
import { AccessResolver } from '../../core/resolvers/access.resolver';

import { EcommerceHomeComponent } from './pages/home/home.component';
import { AllPaginasInformativasComponent } from './pages/paginasInformativas/allPaginasInformativas/allPaginasInformativas.component';
import { EditEncabezadoComponent } from './pages/encabezado/editEncabezado/editEncabezado.component';
import { EditPieComponent } from './pages/pie/editPie/editPie.component';
import { AllCategoriasWebComponent } from './pages/categorias/allCategoriasWeb/allCategoriasWeb.component';
import { AllMarcasWebComponent } from './pages/marcas/allMarcasWeb/allMarcasWeb.component';
import { EditEspanaMotosComponent } from './pages/espanaMotos/editEspanaMotos/editEspanaMotos.component';
import { EditInicioComponent } from './pages/inicio/editInicio/editInicio.component';
import { ModeladoComponent } from './pages/modelado/modelado.component';

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
      { path: '', redirectTo: 'home', pathMatch: 'full' },

      // La portada del módulo: las once áreas con lo que hay en cada una
      {
        path: 'home',
        component: EcommerceHomeComponent,
        canActivate: [AuthGuard],
        resolve: { access: AccessResolver },
      },

      {
        path: 'allPaginasInformativas',
        component: AllPaginasInformativasComponent,
        canActivate: [AuthGuard],
        resolve: { access: AccessResolver },
      },

      // El encabezado es UNA sola configuración, no un listado: por eso la
      // ruta es «edit…» y no «all…», y por eso no lleva id.
      {
        path: 'editEncabezado',
        component: EditEncabezadoComponent,
        canActivate: [AuthGuard],
        resolve: { access: AccessResolver },
      },

      // El pie tambien es una sola configuracion: «edit...» y sin id
      {
        path: 'editPie',
        component: EditPieComponent,
        canActivate: [AuthGuard],
        resolve: { access: AccessResolver },
      },

      // Las categorias de la tienda: el arbol es de Inventarios, aqui solo
      // se decide que sale y con que nombre.
      {
        path: 'allCategoriasWeb',
        component: AllCategoriasWebComponent,
        canActivate: [AuthGuard],
        resolve: { access: AccessResolver },
      },

      // Espana Motos: un micro-sitio con su propia publicacion
      {
        path: 'editEspanaMotos',
        component: EditEspanaMotosComponent,
        canActivate: [AuthGuard],
        resolve: { access: AccessResolver },
      },

      // La portada de la tienda: la lista de secciones en su orden
      {
        path: 'editInicio',
        component: EditInicioComponent,
        canActivate: [AuthGuard],
        resolve: { access: AccessResolver },
      },

      // La misma portada, vista por fuera: dibujada a escala, para arrastrar
      // las secciones y estirarlas
      {
        path: 'modelado',
        component: ModeladoComponent,
        canActivate: [AuthGuard],
        resolve: { access: AccessResolver },
      },

      // Las marcas de la tienda: igual que las categorías, con lista en vez de árbol
      {
        path: 'allMarcasWeb',
        component: AllMarcasWebComponent,
        canActivate: [AuthGuard],
        resolve: { access: AccessResolver },
      },

      { path: '**', redirectTo: 'home' },
    ],
  },
];
