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
import { NgScrollbarModule, NG_SCROLLBAR_OPTIONS } from 'ngx-scrollbar';
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
    
    HomePage,
    
    ErrorPage
  ],
  imports: [
    AppRoutingModule,
    BrowserAnimationsModule,
    BrowserModule,
    HttpClientModule,
    NgScrollbarModule,
    
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
    {
      provide: NG_SCROLLBAR_OPTIONS,
      useValue: {
        visibility: 'hover'
      }
    },
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