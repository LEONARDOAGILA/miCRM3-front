import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';

import { HttpClientModule } from '@angular/common/http';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { SeguridadRoutingModule } from './seguridad-routing.module';
import { LoadingBarModule } from '@ngx-loading-bar/core';
import { AgGridModule } from 'ag-grid-angular';

import { DirectiveModule } from "../../core/directives/directive.module";
import { PanelModule } from '../../components/panel/panel.module';


import { ModalFooterComponent } from '../../components/modal/modal-footer/modal-footer.component';
import { ModalHeaderComponent } from '../../components/modal/modal-header/modal-header.component';
import { ModalArrastrableDirective } from '../../components/modal/modal-arrastrable.directive';
import { ActionButtonsModule } from '../../components/botones/action-buttons/action-buttons.module';
import { NgScrollbarModule } from 'ngx-scrollbar';


import { CampoTextoComponent } from '../../components/campos/campoTexto/campoTexto.component';
import { CampoNumeroEnteroComponent } from '../../components/campos/campoNumeroEntero/campoNumeroEntero.component';
import { CheckboxComponent } from '../../components/campos/checkbox/checkbox.component';
import { CampoBusquedaComponent } from '../../components/campos/campoBusqueda/campoBusqueda.component';
import { CampoBusquedaPaginacionComponent } from "../../components/campos/campoBusquedaPaginacion/campoBusquedaPaginacion.component";
import { ComboComponent } from '../../components/campos/combo/combo.component';


import { HomeComponent } from './pages/home/home.component';
import { LoginComponent } from './pages/login/login.component';
import { RegisterComponent } from './pages/register/register.component';

import { AllMenusComponent, ButtonAccionMenu } from './pages/menus/allMenus/allMenus.component';
import { SaveMenuComponent } from './pages/menus/saveMenu/saveMenu.component';
import { DeleteMenuComponent } from './pages/menus/deleteMenu/deleteMenu.component';
import { ChangePasswordComponent } from './pages/users/change-password/change-password.component';
import { ChangePasswordLoginComponent } from './pages/login/change-password-login/change-password-login.component';
import { OlvideContrasenaComponent } from './pages/login/olvide-contrasena/olvide-contrasena.component';
import { AllUsersComponent, ButtonAccionUser } from './pages/users/allUsers/allUsers.component';
import { SaveUserComponent } from './pages/users/saveUser/saveUser.component';
import { DeleteUserComponent } from './pages/users/deleteUser/deleteUser.component';
import { CampoTelefonoComponent } from '../../components/campos/campoTelefono/campoTelefono.component';
import { CampoEmailComponent } from '../../components/campos/campoEmail/campoEmail.component';
import { CampoClaveComponent } from '../../components/campos/campoClave/campoClave.component';
import { AllHorariosComponent, ButtonAccionHorario } from './pages/horarios/allHorarios/allHorarios.component';
import { DeleteHorarioComponent } from './pages/horarios/delete-horario/delete-horario.component';
import { ListHorariosComponent } from './pages/horarios/listHorarios/listHorarios.component';
import { ListUsersComponent } from './pages/users/listUsers/listUsers.component';
import { SaveHorarioComponent } from './pages/horarios/save-horario/save-horario.component';
import { AllProfilesComponent, ButtonAccionProfile } from './pages/profiles/allProfiles/allProfiles.component';
import { DeleteProfileComponent } from './pages/profiles/deleteProfile/deleteProfile.component';
import { ListProfileComponent } from './pages/profiles/listProfile/listProfile.component';
import { Save2ProfileComponent } from './pages/profiles/save2Profile/save2Profile.component';

// Usuarios y grupos (árbol estilo Active Directory)
import { UsuariosGruposComponent, ButtonAccionUsuarioGrupo } from './pages/grupos/usuariosGrupos/usuariosGrupos.component';
import { SaveGrupoComponent } from './pages/grupos/saveGrupo/saveGrupo.component';
import { DeleteGrupoComponent } from './pages/grupos/deleteGrupo/deleteGrupo.component';
import { ListGruposComponent } from './pages/grupos/listGrupos/listGrupos.component';
import { PapeleraUsuariosComponent } from './pages/grupos/papeleraUsuarios/papeleraUsuarios.component';
import { FileTreeNodeComponent } from '../../components/file-tree-node/file-tree-node.component';
import { CampoTextoAreaComponent } from '../../components/campos/campoTextoArea/campoTextoArea.component';






@NgModule({
  declarations: [
    HomeComponent,
    LoginComponent,
    RegisterComponent,

    AllMenusComponent,   
    SaveMenuComponent,
    DeleteMenuComponent,
    ButtonAccionMenu,

    ChangePasswordComponent,
    ChangePasswordLoginComponent,
    OlvideContrasenaComponent,
    
    AllUsersComponent,
    SaveUserComponent,
    DeleteUserComponent,
    ButtonAccionUser,

    AllHorariosComponent,
    ListHorariosComponent,
    ListUsersComponent,
    SaveHorarioComponent,
    DeleteHorarioComponent,
    ButtonAccionHorario,
    
    AllProfilesComponent,
    ListProfileComponent,
    DeleteProfileComponent,
    Save2ProfileComponent,
    ButtonAccionProfile,

    UsuariosGruposComponent,
    ButtonAccionUsuarioGrupo,
    SaveGrupoComponent,
    DeleteGrupoComponent,
    ListGruposComponent,
    PapeleraUsuariosComponent,

    

  ],

  imports: [
    CommonModule,
    SeguridadRoutingModule,
    HttpClientModule,
    DirectiveModule,
    LoadingBarModule,
    
    FormsModule,
    PanelModule,
    ReactiveFormsModule,
    
    AgGridModule,
    NgScrollbarModule,
   
    
    AgGridModule,
    NgScrollbarModule,
    
    CampoTelefonoComponent,
    CampoEmailComponent,
    CampoClaveComponent,
    CampoTextoComponent,
    CampoNumeroEnteroComponent,
    CheckboxComponent,
    CampoBusquedaComponent,
    CampoBusquedaPaginacionComponent,
    ModalArrastrableDirective,
    ComboComponent,
    ActionButtonsModule,
    ModalFooterComponent,
    ModalHeaderComponent,
    FileTreeNodeComponent,
    CampoTextoAreaComponent,

    
]
})
export class SeguridadModule { }

