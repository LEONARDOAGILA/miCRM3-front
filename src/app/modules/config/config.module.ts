import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';

import { HttpClientModule } from '@angular/common/http';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ConfigRoutingModule } from './config-routing.module';
import { LoadingBarModule } from '@ngx-loading-bar/core';
import { AgGridModule } from 'ag-grid-angular';
import { NgxDaterangepickerMd } from 'ngx-daterangepicker-material';

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
import { CampoTextoAreaComponent } from '../../components/campos/campoTextoArea/campoTextoArea.component';
import { CampoNumeroEnteroComponent } from '../../components/campos/campoNumeroEntero/campoNumeroEntero.component';
import { CheckboxComponent } from '../../components/campos/checkbox/checkbox.component';
import { CampoBusquedaComponent } from '../../components/campos/campoBusqueda/campoBusqueda.component';
import { CampoBusquedaPaginacionComponent } from "../../components/campos/campoBusquedaPaginacion/campoBusquedaPaginacion.component";
import { ComboComponent } from '../../components/campos/combo/combo.component';
import { FileTreeNodeComponent } from '../../components/file-tree-node/file-tree-node.component';

import { ModalReporteExternoComponent } from './pages/administrador-archivos/modalReporteExterno/modalReporteExterno.component';
import { DeleteFileComponent } from './pages/administrador-archivos/delete-file/deleteFile.component';
import { PapeleraComponent } from './pages/administrador-archivos/papelera/papelera.component';
import { ModalArrastrableDirective } from '../../components/modal/modal-arrastrable.directive';
import { DropzoneComponent } from '../../components/campos/dropzone/dropzone.component';
import { MoverArchivoComponent } from './pages/administrador-archivos/mover-archivo/moverArchivo.component';
import { PermisosArchivoComponent } from './pages/administrador-archivos/permisos-archivo/permisosArchivo.component';
import { ExtraSettingsPage } from './pages/extra-settings-page/extra-settings-page';
import { ExtraSearchResultsPage } from './pages/extra-search-results/extra-search-results';
import { ExtraProfilePage } from './pages/extra-profile/extra-profile';

// Boletines: avisos con imágenes que se muestran al entrar al sistema
import { AllBoletinesComponent, ButtonAccionBoletin } from './pages/boletines/allBoletines/allBoletines.component';
import { SaveBoletinComponent } from './pages/boletines/saveBoletin/saveBoletin.component';
import { DeleteBoletinComponent } from './pages/boletines/deleteBoletin/deleteBoletin.component';
import { VerBoletinesComponent } from './pages/boletines/verBoletines/verBoletines.component';
import { PapeleraBoletinesComponent } from './pages/boletines/papeleraBoletines/papeleraBoletines.component';




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
    DeleteFileComponent,
    PapeleraComponent,

    AllBoletinesComponent,
    ButtonAccionBoletin,
    SaveBoletinComponent,
    DeleteBoletinComponent,
    PapeleraBoletinesComponent,


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
    CampoTextoAreaComponent,
    CampoNumeroEnteroComponent,
    CheckboxComponent,
    CampoBusquedaComponent,
    CampoBusquedaPaginacionComponent,
    ModalArrastrableDirective,
    DropzoneComponent,
    MoverArchivoComponent,
    PermisosArchivoComponent,
    ComboComponent,
    ActionButtonsModule,
    FileTreeNodeComponent,
    ModalFooterComponent,
    ModalHeaderComponent,
    VerBoletinesComponent,
    NgxDaterangepickerMd,
]
})
export class ConfigModule { }

