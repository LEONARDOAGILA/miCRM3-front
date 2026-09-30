// Core Module
import { Router, NavigationEnd, ActivatedRoute } from '@angular/router';
import { BrowserAnimationsModule }               from '@angular/platform-browser/animations';
import { BrowserModule, Title }                  from '@angular/platform-browser';
import { HttpClientModule, HTTP_INTERCEPTORS }    from '@angular/common/http';
import { AppRoutingModule }                      from './app-routing.module';
import { NgModule, LOCALE_ID }                   from '@angular/core';

// Importar para localización en español
import { registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es';

// Main Component
import { AppComponent }                    from './app.component';
import { HeaderComponent }                 from './components/header/header.component';
import { SidebarComponent }                from './components/sidebar/sidebar.component';
import { SidebarRightComponent }           from './components/sidebar-right/sidebar-right.component';
import { TopMenuComponent }                from './components/top-menu/top-menu.component';
import { FloatSubMenuComponent }           from './components/float-sub-menu/float-sub-menu.component';
import { ThemePanelComponent }             from './components/theme-panel/theme-panel.component';

// Component Module
import { NgScrollbarModule, provideScrollbarOptions } from 'ngx-scrollbar';
import { PanelModule } from './components/panel/panel.module';
import { ToastrModule } from 'ngx-toastr';
import { LoadingBarModule } from '@ngx-loading-bar/core';
import { provideHighlightOptions, HighlightAuto }  from 'ngx-highlightjs';

// Pages
import { HomePage }          from './pages/home/home';

// Error
import { ErrorPage }          from './pages/error/error';

// Interceptor
import { AuthInterceptor } from './core/interceptors/auth.interceptor';

// Registrar el locale español
registerLocaleData(localeEs, 'es');

@NgModule({
  declarations: [
    AppComponent,
    HeaderComponent,
    SidebarComponent,
    SidebarRightComponent,
    TopMenuComponent,
    FloatSubMenuComponent,
    ThemePanelComponent,

    ErrorPage
  ],
  imports: [
    AppRoutingModule,
    BrowserAnimationsModule,
    BrowserModule,
    HttpClientModule,
    NgScrollbarModule,

    // HomePage es standalone: va en imports, no en declarations
    HomePage,

    PanelModule,
    ToastrModule.forRoot(), // ToastrModule added
    LoadingBarModule,
    HighlightAuto,
  ],
  providers: [ 
    Title, 
    {
      provide: LOCALE_ID,
      useValue: 'es' // Configurar idioma español por defecto
    },
    // provideScrollbarOptions MEZCLA con los valores por defecto de la librería.
    // Antes se daba NG_SCROLLBAR_OPTIONS con useValue: { visibility } a secas, y
    // eso SUSTITUÍA todos los defaults: sin `orientation` ngx-scrollbar no
    // pintaba ninguna barra (ni vertical ni horizontal) en toda la aplicación.
    provideScrollbarOptions({
      orientation: 'auto',     // vertical y horizontal según haga falta
      appearance: 'compact',   // la barra flota sobre el contenido, no le quita sitio
      visibility: 'hover',     // se ve al pasar el ratón (y siempre en táctil)
    }),
    provideHighlightOptions({
      fullLibraryLoader: () => import('highlight.js'),
      lineNumbersLoader: () => import('ngx-highlightjs/line-numbers'),
    }),  
    
    // Interceptor
    {
      provide: HTTP_INTERCEPTORS,
      useClass: AuthInterceptor,
      multi: true,
    },
  ],
  bootstrap: [ AppComponent ]
})

export class AppModule {
  constructor(private router: Router, private titleService: Title, private route: ActivatedRoute) {
    router.events.subscribe((e) => {
      if (e instanceof NavigationEnd) {
        var title = 'LPAA | ' + 'listo';
        this.titleService.setTitle(title);
      }
    });
  }
}