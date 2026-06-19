import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';

import { HttpClientModule } from '@angular/common/http';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { InventarioRoutingModule } from './inventario-routing.module';
import { LoadingBarModule } from '@ngx-loading-bar/core';
import { AgGridModule } from 'ag-grid-angular';

import { DirectiveModule } from "../../core/directives/directive.module";
import { PanelModule } from '../../components/panel/panel.module';
import { HomeComponent } from './pages/home/home.component';

import { ModalFooterComponent } from '../../components/modal/modal-footer/modal-footer.component';
import { ModalHeaderComponent } from '../../components/modal/modal-header/modal-header.component';
import { ActionButtonsModule } from '../../components/botones/action-buttons/action-buttons.module';
import { NgScrollbarModule } from 'ngx-scrollbar';

import { CampoTextoComponent } from '../../components/campos/campoTexto/campoTexto.component';
import { CampoNumeroEnteroComponent } from '../../components/campos/campoNumeroEntero/campoNumeroEntero.component';
import { CheckboxComponent } from '../../components/campos/checkbox/checkbox.component';
import { CampoBusquedaComponent } from '../../components/campos/campoBusqueda/campoBusqueda.component';
import { ComboComponent } from '../../components/campos/combo/combo.component';
import { FileTreeNodeComponent } from '../../components/file-tree-node/file-tree-node.component';

@NgModule({
  declarations: [
    HomeComponent,

    // AllProfilesComponent,

  ],
  imports: [
    CommonModule,
    HttpClientModule,
    InventarioRoutingModule,
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
    ComboComponent,
    ActionButtonsModule,
    FileTreeNodeComponent,
    ModalFooterComponent,
    ModalHeaderComponent,

  ]
})
export class InventarioModule { }

