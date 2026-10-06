import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';

import { HttpClientModule } from '@angular/common/http';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { VentasRoutingModule } from './ventas-routing.module';
import { LoadingBarModule } from '@ngx-loading-bar/core';
import { AgGridModule } from 'ag-grid-angular';
import { NgxDaterangepickerMd } from 'ngx-daterangepicker-material';

import { DirectiveModule } from "../../core/directives/directive.module";
import { PanelModule } from '../../components/panel/panel.module';

import { ModalFooterComponent } from '../../components/modal/modal-footer/modal-footer.component';
import { ModalHeaderComponent } from '../../components/modal/modal-header/modal-header.component';
import { ModalArrastrableDirective } from '../../components/modal/modal-arrastrable.directive';
import { ActionButtonsModule } from '../../components/botones/action-buttons/action-buttons.module';
import { NgScrollbarModule } from 'ngx-scrollbar';

import { CampoTextoComponent } from '../../components/campos/campoTexto/campoTexto.component';
import { CampoIdentificacionComponent } from '../../components/campos/campoIdentificacion/campoIdentificacion.component';
import { CampoTextoAreaComponent } from '../../components/campos/campoTextoArea/campoTextoArea.component';
import { CampoTelefonoComponent } from '../../components/campos/campoTelefono/campoTelefono.component';
import { CampoEmailComponent } from '../../components/campos/campoEmail/campoEmail.component';
import { CampoNumeroEnteroComponent } from '../../components/campos/campoNumeroEntero/campoNumeroEntero.component';
import { CheckboxComponent } from '../../components/campos/checkbox/checkbox.component';
import { CampoBusquedaComponent } from '../../components/campos/campoBusqueda/campoBusqueda.component';
import { CampoBusquedaPaginacionComponent } from "../../components/campos/campoBusquedaPaginacion/campoBusquedaPaginacion.component";
import { ComboComponent } from '../../components/campos/combo/combo.component';

import { HomeComponent } from './pages/home/home.component';

import { AllClientesComponent, ButtonAccionCliente } from './pages/clientes/allClientes/allClientes.component';
import { SaveClienteComponent } from './pages/clientes/saveCliente/saveCliente.component';
import { DeleteClienteComponent } from './pages/clientes/deleteCliente/deleteCliente.component';
import { ListClientesComponent } from './pages/clientes/listClientes/listClientes.component';
import { PapeleraClientesComponent } from './pages/clientes/papeleraClientes/papeleraClientes.component';

// Gestión de clientes: llamadas hechas, programadas y reasignación de cartera
import { GestionClientesComponent } from './pages/gestion-clientes/gestionClientes.component';
import { ResumenVentasComponent } from './pages/gestion-clientes/resumenVentas/resumenVentas.component';
import { SaveGestionComponent } from './pages/gestion-clientes/saveGestion/saveGestion.component';
import { CerrarGestionComponent } from './pages/gestion-clientes/cerrarGestion/cerrarGestion.component';
import { ReasignarClienteComponent } from './pages/gestion-clientes/reasignarCliente/reasignarCliente.component';

// Las pantallas de «Respuestas de WhatsApp» no se declaran aquí: son
// standalone y se traen solas lo que usan, igual que el catálogo de gestiones.

/**
 * Módulo Ventas. Mismo esquema que RhModule y SeguridadModule: un home con
 * tarjetas por opción y, por cada entidad, all* (grilla) + save* (modal alta /
 * edición / clon / vista) + delete* (confirmación) + list* (selector para
 * otros formularios).
 */
@NgModule({
  declarations: [
    HomeComponent,

    AllClientesComponent,
    SaveClienteComponent,
    DeleteClienteComponent,
    ListClientesComponent,
    PapeleraClientesComponent,
    ButtonAccionCliente,

    GestionClientesComponent,
    SaveGestionComponent,
    CerrarGestionComponent,
    ReasignarClienteComponent,
  ],

  imports: [
    CommonModule,
    VentasRoutingModule,
    HttpClientModule,
    DirectiveModule,
    LoadingBarModule,

    FormsModule,
    PanelModule,
    ReactiveFormsModule,

    AgGridModule,
    NgxDaterangepickerMd,   // el selector de rango de fechas de la agenda
    NgScrollbarModule,

    CampoTextoComponent,
    CampoIdentificacionComponent,
    CampoTextoAreaComponent,
    CampoTelefonoComponent,
    CampoEmailComponent,
    CampoNumeroEnteroComponent,
    CheckboxComponent,
    CampoBusquedaComponent,
    CampoBusquedaPaginacionComponent,
    ModalArrastrableDirective,
    ComboComponent,
    ActionButtonsModule,
    ModalFooterComponent,
    ModalHeaderComponent,

    // El tablero que se ve mientras no hay cliente elegido (standalone)
    ResumenVentasComponent,
  ]
})
export class VentasModule { }
