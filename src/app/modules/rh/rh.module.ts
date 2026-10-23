import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';

import { HttpClientModule } from '@angular/common/http';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RhRoutingModule } from './rh-routing.module';
import { LoadingBarModule } from '@ngx-loading-bar/core';
import { AgGridModule } from 'ag-grid-angular';

import { DirectiveModule } from "../../core/directives/directive.module";
import { PanelModule } from '../../components/panel/panel.module';

import { ModalFooterComponent } from '../../components/modal/modal-footer/modal-footer.component';
import { ModalHeaderComponent } from '../../components/modal/modal-header/modal-header.component';
import { MenuContextualComponent } from '../../components/menuContextual/menuContextual.component';
import { ModalArrastrableDirective } from '../../components/modal/modal-arrastrable.directive';
import { ActionButtonsModule } from '../../components/botones/action-buttons/action-buttons.module';
import { NgScrollbarModule } from 'ngx-scrollbar';

import { CampoTextoComponent } from '../../components/campos/campoTexto/campoTexto.component';
import { CampoIdentificacionComponent } from '../../components/campos/campoIdentificacion/campoIdentificacion.component';
import { CampoTextoAreaComponent } from '../../components/campos/campoTextoArea/campoTextoArea.component';
import { CampoNumeroEnteroComponent } from '../../components/campos/campoNumeroEntero/campoNumeroEntero.component';
import { CheckboxComponent } from '../../components/campos/checkbox/checkbox.component';
import { CampoBusquedaComponent } from '../../components/campos/campoBusqueda/campoBusqueda.component';
import { CampoBusquedaPaginacionComponent } from "../../components/campos/campoBusquedaPaginacion/campoBusquedaPaginacion.component";
import { ComboComponent } from '../../components/campos/combo/combo.component';

import { HomeComponent } from './pages/home/home.component';

// Marcaciones (control de asistencia)
import { KioscoMarcacionComponent } from './pages/marcaciones/kiosco/kioscoMarcacion.component';
import { AllMarcacionesComponent, ButtonAccionMarcacion } from './pages/marcaciones/allMarcaciones/allMarcaciones.component';
import { SaveMarcacionComponent } from './pages/marcaciones/saveMarcacion/saveMarcacion.component';
import { DeleteMarcacionComponent } from './pages/marcaciones/deleteMarcacion/deleteMarcacion.component';

import { AllCargosComponent, ButtonAccionCargo } from './pages/cargos/allCargos/allCargos.component';
import { SaveCargoComponent } from './pages/cargos/saveCargo/saveCargo.component';
import { DeleteCargoComponent } from './pages/cargos/deleteCargo/deleteCargo.component';
import { ListCargosComponent } from './pages/cargos/listCargos/listCargos.component';
import { PapeleraCargosComponent } from './pages/cargos/papeleraCargos/papeleraCargos.component';

// Horarios de trabajo del personal (hasta 4 jornadas por día)
import { AllHorariosEmpleadosComponent, ButtonAccionHorarioEmpleado } from './pages/horarios-empleados/allHorariosEmpleados/allHorariosEmpleados.component';
import { SaveHorarioEmpleadoComponent } from './pages/horarios-empleados/saveHorarioEmpleado/saveHorarioEmpleado.component';
import { DeleteHorarioEmpleadoComponent } from './pages/horarios-empleados/deleteHorarioEmpleado/deleteHorarioEmpleado.component';
import { ListHorariosEmpleadosComponent } from './pages/horarios-empleados/listHorariosEmpleados/listHorariosEmpleados.component';
import { PapeleraHorariosEmpleadosComponent } from './pages/horarios-empleados/papeleraHorariosEmpleados/papeleraHorariosEmpleados.component';
import { AllDepartamentosComponent, ButtonAccionDepartamento } from './pages/departamentos/allDepartamentos/allDepartamentos.component';
import { SaveDepartamentoComponent } from './pages/departamentos/saveDepartamento/saveDepartamento.component';
import { DeleteDepartamentoComponent } from './pages/departamentos/deleteDepartamento/deleteDepartamento.component';
import { ListDepartamentosComponent } from './pages/departamentos/listDepartamentos/listDepartamentos.component';
import { PapeleraDepartamentosComponent } from './pages/departamentos/papeleraDepartamentos/papeleraDepartamentos.component';
import { AllEmpleadosComponent, ButtonAccionEmpleado } from './pages/empleados/allEmpleados/allEmpleados.component';
import { SaveEmpleadoComponent } from './pages/empleados/saveEmpleado/saveEmpleado.component';
import { DeleteEmpleadoComponent } from './pages/empleados/deleteEmpleado/deleteEmpleado.component';
import { ListEmpleadosComponent } from './pages/empleados/listEmpleados/listEmpleados.component';
import { CampoTelefonoComponent } from '../../components/campos/campoTelefono/campoTelefono.component';
import { CampoEmailComponent } from '../../components/campos/campoEmail/campoEmail.component';

/**
 * Módulo RH (recursos humanos). Mismo esquema que SeguridadModule: un
 * home con tarjetas por opción y, por cada entidad, all* (grilla) + save*
 * (modal alta / edición / clon / vista) + delete* (confirmación) + list*
 * (selector para otros formularios).
 */
@NgModule({
  declarations: [
    HomeComponent,

    AllCargosComponent,
    SaveCargoComponent,
    DeleteCargoComponent,
    ListCargosComponent,
    PapeleraCargosComponent,
    ButtonAccionCargo,

    AllHorariosEmpleadosComponent,
    SaveHorarioEmpleadoComponent,
    DeleteHorarioEmpleadoComponent,
    ListHorariosEmpleadosComponent,
    PapeleraHorariosEmpleadosComponent,
    ButtonAccionHorarioEmpleado,

    AllDepartamentosComponent,
    SaveDepartamentoComponent,
    DeleteDepartamentoComponent,
    ListDepartamentosComponent,
    ButtonAccionDepartamento,
    PapeleraDepartamentosComponent,

    AllEmpleadosComponent,
    SaveEmpleadoComponent,
    DeleteEmpleadoComponent,
    ListEmpleadosComponent,
    ButtonAccionEmpleado,

    KioscoMarcacionComponent,
    AllMarcacionesComponent,
    SaveMarcacionComponent,
    DeleteMarcacionComponent,
    ButtonAccionMarcacion,
  ],

  imports: [
    CommonModule,
    RhRoutingModule,
    HttpClientModule,
    DirectiveModule,
    LoadingBarModule,

    FormsModule,
    PanelModule,
    ReactiveFormsModule,

    AgGridModule,
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
    MenuContextualComponent,
  ]
})
export class RhModule { }
