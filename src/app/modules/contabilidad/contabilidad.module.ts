import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';

import { HttpClientModule } from '@angular/common/http';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ContabilidadRoutingModule } from './contabilidad-routing.module';
import { LoadingBarModule } from '@ngx-loading-bar/core';
import { AgGridModule } from 'ag-grid-angular';

import { DirectiveModule } from '../../core/directives/directive.module';
import { PanelModule } from '../../components/panel/panel.module';
import { HomeComponent } from './pages/home/home.component';

import { ModalFooterComponent } from '../../components/modal/modal-footer/modal-footer.component';
import { ModalHeaderComponent } from '../../components/modal/modal-header/modal-header.component';
import { ActionButtonsModule } from '../../components/botones/action-buttons/action-buttons.module';
import { NgScrollbarModule } from 'ngx-scrollbar';

import { CampoTextoComponent } from '../../components/campos/campoTexto/campoTexto.component';
import { CampoTextoAreaComponent } from '../../components/campos/campoTextoArea/campoTextoArea.component';
import { CheckboxComponent } from '../../components/campos/checkbox/checkbox.component';
import { CampoBusquedaComponent } from '../../components/campos/campoBusqueda/campoBusqueda.component';
import { CampoBusquedaPaginacionComponent } from '../../components/campos/campoBusquedaPaginacion/campoBusquedaPaginacion.component';
import { ComboComponent } from '../../components/campos/combo/combo.component';
import { MenuContextualComponent } from '../../components/menuContextual/menuContextual.component';

//   ******   PLAN DE CUENTAS (árbol, sin tope de niveles)   ******  //
import { AllPlanCuentasComponent, ButtonAccionPlanCuenta } from './pages/plan-de-cuentas/allPlanCuentas/allPlanCuentas.component';
import { SavePlanCuentaComponent } from './pages/plan-de-cuentas/savePlanCuenta/savePlanCuenta.component';
import { DeletePlanCuentaComponent } from './pages/plan-de-cuentas/deletePlanCuenta/deletePlanCuenta.component';
import { PapeleraPlanCuentasComponent } from './pages/plan-de-cuentas/papeleraPlanCuentas/papeleraPlanCuentas.component';
import { ListPlanCuentaComponent } from './pages/plan-de-cuentas/listPlanCuenta/listPlanCuenta.component';

@NgModule({
  declarations: [
    HomeComponent,

    AllPlanCuentasComponent,
    ButtonAccionPlanCuenta,
    SavePlanCuentaComponent,
    DeletePlanCuentaComponent,
    PapeleraPlanCuentasComponent,
    ListPlanCuentaComponent,
  ],
  imports: [
    CommonModule,
    HttpClientModule,
    ContabilidadRoutingModule,
    ReactiveFormsModule,
    LoadingBarModule,
    FormsModule,
    PanelModule,
    AgGridModule,
    DirectiveModule,
    NgScrollbarModule,
    // Standalone: van en imports, no en declarations
    CampoTextoComponent,
    CampoTextoAreaComponent,
    CheckboxComponent,
    CampoBusquedaComponent,
    CampoBusquedaPaginacionComponent,
    ComboComponent,
    ActionButtonsModule,
    MenuContextualComponent,
    ModalFooterComponent,
    ModalHeaderComponent,
  ]
})
export class ContabilidadModule { }
