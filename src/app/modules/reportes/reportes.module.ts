import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';

import { HttpClientModule } from '@angular/common/http';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ReportesRoutingModule } from './reportes-routing.module';
import { LoadingBarModule } from '@ngx-loading-bar/core';
import { AgGridModule } from 'ag-grid-angular';


import { DirectiveModule } from "../../core/directives/directive.module";
import { PanelModule } from '../../components/panel/panel.module';
import { HomeComponent } from './pages/home/home.component';



import { AllReportesExternosComponent } from './pages/reportesExternos/allReportesExternos/allReportesExternos.component';
import { SaveReporteExternoComponent } from './pages/reportesExternos/saveReporteExterno/saveReporteExterno.component';
import { DeleteReporteExternoComponent } from './pages/reportesExternos/deleteReporteExterno/deleteReporteExterno.component';
import { ModalReporteExternoComponent } from './pages/reportesExternos/modalReporteExterno/modalReporteExterno.component';
import { UsuariosReportesExternosComponent } from './pages/reportesExternos/usuariosReportesExternos/usuariosReportesExternos.component';
import { ListUsuariosReportesExternosComponent } from './pages/reportesExternos/listUsuariosReportesExternos/listUsuariosReportesExternos.component';

import { ButtonAccionReporteExterno } from './pages/reportesExternos/allReportesExternos/allReportesExternos.component';



import { ModalFooterComponent } from '../../components/modal/modal-footer/modal-footer.component';
import { ModalHeaderComponent } from '../../components/modal/modal-header/modal-header.component';
import { ActionButtonsModule } from '../../components/botones/action-buttons/action-buttons.module';

import { CampoTextoComponent } from '../../components/campos/campoTexto/campoTexto.component';
import { CampoTextoAreaComponent } from '../../components/campos/campoTextoArea/campoTextoArea.component';
import { CampoNumeroEnteroComponent } from '../../components/campos/campoNumeroEntero/campoNumeroEntero.component';
import { CheckboxComponent } from '../../components/campos/checkbox/checkbox.component';
import { CampoBusquedaComponent } from '../../components/campos/campoBusqueda/campoBusqueda.component';
import { ComboComponent } from '../../components/campos/combo/combo.component';


@NgModule({
  declarations: [
     HomeComponent,
     

     AllReportesExternosComponent,
     SaveReporteExternoComponent,
     DeleteReporteExternoComponent,
     ButtonAccionReporteExterno,
     ModalReporteExternoComponent,
     UsuariosReportesExternosComponent,
     ListUsuariosReportesExternosComponent,

    
     
  ],
  imports: [
    CommonModule,
    HttpClientModule,
    ReportesRoutingModule,
    ReactiveFormsModule,
    LoadingBarModule,
    FormsModule,
    PanelModule,
    AgGridModule,
    DirectiveModule,
    CampoTextoComponent,
    CampoTextoAreaComponent,
    CampoNumeroEnteroComponent,
    CheckboxComponent,
    CampoBusquedaComponent,
    ComboComponent,
    ActionButtonsModule,
    ModalFooterComponent,
    ModalHeaderComponent,
    
]
})
export class ReportesModule { }

