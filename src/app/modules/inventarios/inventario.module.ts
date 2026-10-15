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
import { CampoTextoAreaComponent } from '../../components/campos/campoTextoArea/campoTextoArea.component';
import { CampoNumeroEnteroComponent } from '../../components/campos/campoNumeroEntero/campoNumeroEntero.component';
import { CheckboxComponent } from '../../components/campos/checkbox/checkbox.component';
import { CampoBusquedaComponent } from '../../components/campos/campoBusqueda/campoBusqueda.component';
import { CampoBusquedaPaginacionComponent } from '../../components/campos/campoBusquedaPaginacion/campoBusquedaPaginacion.component';
import { ComboComponent } from '../../components/campos/combo/combo.component';
import { CampoIconoComponent } from '../../components/campos/campoIcono/campoIcono.component';
import { FileTreeNodeComponent } from '../../components/file-tree-node/file-tree-node.component';
import { MenuContextualComponent } from '../../components/menuContextual/menuContextual.component';

//   ******   MARCAS   ******  //
import { AllMarcasComponent, ButtonAccionMarca } from './pages/marcas/allMarcas/allMarcas.component';
import { SaveMarcaComponent } from './pages/marcas/saveMarca/saveMarca.component';
import { DeleteMarcaComponent } from './pages/marcas/deleteMarca/deleteMarca.component';

//   ******   CATEGORÍAS (árbol)   ******  //
import { AllCategoriasComponent, ButtonAccionCategoria } from './pages/categorias/allCategorias/allCategorias.component';
import { SaveCategoriaComponent } from './pages/categorias/saveCategoria/saveCategoria.component';
import { DeleteCategoriaComponent } from './pages/categorias/deleteCategoria/deleteCategoria.component';

//   ******   PRODUCTOS   ******  //
import { AllProductosComponent, ButtonAccionProducto } from './pages/productos/allProductos/allProductos.component';
import { SaveProductoComponent } from './pages/productos/saveProducto/saveProducto.component';
import { DeleteProductoComponent } from './pages/productos/deleteProducto/deleteProducto.component';

@NgModule({
  declarations: [
    HomeComponent,

    AllMarcasComponent,
    ButtonAccionMarca,
    SaveMarcaComponent,
    DeleteMarcaComponent,

    AllCategoriasComponent,
    ButtonAccionCategoria,
    SaveCategoriaComponent,
    DeleteCategoriaComponent,

    AllProductosComponent,
    ButtonAccionProducto,
    SaveProductoComponent,
    DeleteProductoComponent,
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
    CampoTextoAreaComponent,
    CampoNumeroEnteroComponent,
    CheckboxComponent,
    CampoBusquedaComponent,
    CampoBusquedaPaginacionComponent,
    ComboComponent,
    CampoIconoComponent,
    ActionButtonsModule,
    FileTreeNodeComponent,
    MenuContextualComponent,
    ModalFooterComponent,
    ModalHeaderComponent,
  ]
})
export class InventarioModule { }
