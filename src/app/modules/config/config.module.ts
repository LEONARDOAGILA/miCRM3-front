import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';

import { HttpClientModule } from '@angular/common/http';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ConfigRoutingModule } from './config-routing.module';
import { LoadingBarModule } from '@ngx-loading-bar/core';
import { AgGridModule } from 'ag-grid-angular';

import { DirectiveModule } from "../../core/directives/directive.module";
import { PanelModule } from '../../components/panel/panel.module';
import { HomeComponent } from './pages/home/home.component';






import { AllDepartamentosComponent } from './pages/departamentos/allDepartamentos/allDepartamentos.component';
import { SaveDepartamentoComponent } from './pages/departamentos/saveDepartamento/saveDepartamento.component';
import { DeleteDepartamentoComponent } from './pages/departamentos/deleteDepartamento/deleteDepartamento.component';
import { ButtonAccionDepartamento } from './pages/departamentos/allDepartamentos/allDepartamentos.component';



import { ModalFooterComponent } from '../../components/modal/modal-footer/modal-footer.component';
import { ModalHeaderComponent } from '../../components/modal/modal-header/modal-header.component';
import { ActionButtonsModule } from '../../components/botones/action-buttons/action-buttons.module';
import { NgScrollbarModule } from 'ngx-scrollbar';

import { FileManagerComponent } from './pages/administrador-archivos/file-manager/file-manager.component';
import { SaveFileComponent } from './pages/administrador-archivos/save-file/saveFile.component';


import { CampoTextoComponent } from '../../components/campos/campoTexto/campoTexto.component';
import { CampoNumeroEnteroComponent } from '../../components/campos/campoNumeroEntero/campoNumeroEntero.component';
import { CheckboxComponent } from '../../components/campos/checkbox/checkbox.component';
import { CampoBusquedaComponent } from '../../components/campos/campoBusqueda/campoBusqueda.component';
import { CampoBusquedaPaginacionComponent } from "../../components/campos/campoBusquedaPaginacion/campoBusquedaPaginacion.component";
import { ComboComponent } from '../../components/campos/combo/combo.component';
import { FileTreeNodeComponent } from '../../components/file-tree-node/file-tree-node.component';

import { ModalReporteExternoComponent } from './pages/administrador-archivos/modalReporteExterno/modalReporteExterno.component';
import { ExtraSettingsPage } from './pages/extra-settings-page/extra-settings-page';
import { ExtraSearchResultsPage } from './pages/extra-search-results/extra-search-results';
import { ExtraProfilePage } from './pages/extra-profile/extra-profile';




@NgModule({
  declarations: [
    HomeComponent,

    ExtraSettingsPage,
    ExtraSearchResultsPage,
    ExtraProfilePage,

    AllDepartamentosComponent,
    SaveDepartamentoComponent,
    DeleteDepartamentoComponent,
    ButtonAccionDepartamento,

    FileManagerComponent,
    SaveFileComponent,
    ModalReporteExternoComponent,


  ],
  imports: [
    CommonModule,
    HttpClientModule,
    ConfigRoutingModule,
    ReactiveFormsModule,
    LoadingBarModule,
    FormsModule,
    PanelModule,
    AgGridModule,
    DirectiveModule,
    NgScrollbarModule,

    CampoTextoComponent,
    CampoNumeroEnteroComponent,
    CheckboxComponent,
    CampoBusquedaComponent,
    CampoBusquedaPaginacionComponent,
    ComboComponent,
    ActionButtonsModule,
    FileTreeNodeComponent,
    ModalFooterComponent,
    ModalHeaderComponent,
]
})
export class ConfigModule { }

