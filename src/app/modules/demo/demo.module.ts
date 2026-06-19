import { NgModule} from '@angular/core';
import { AsyncPipe, CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';


import { PanelModule } from '../../components/panel/panel.module';
import { HomeComponent } from './pages/home/home.component';

import { DemoRoutingModule } from './demo-routing.module';
import { Dashboard1Component } from './pages/dashboard1/dashboard1.component';
import { Dashboard2Component } from './pages/dashboard2/dashboard2.component';
import { Dashboard3Component } from './pages/dashboard3/dashboard3.component';
import { FormFloatingLabelComponent } from './pages/formFloatingLabel/formFloatingLabel.component';
import { SpinnerComponentimplements } from './pages/spinner/spinner.component';
import { WindowsExplorerComponent } from './pages/windows-explorer/windows-explorer.component';



// Plugins
import { NgbDatepickerModule, NgbTimepickerModule } from '@ng-bootstrap/ng-bootstrap';
import { NgxDaterangepickerMd }            from 'ngx-daterangepicker-material';
import { NgxEditorModule }                 from 'ngx-editor';
import { ColorSketchModule }               from 'ngx-color/sketch';
import { NgxDatatableModule }              from '@swimlane/ngx-datatable';
import { FullCalendarModule }              from '@fullcalendar/angular';
import { CountdownModule }                 from 'ngx-countdown';
import { NgxChartsModule }                 from '@swimlane/ngx-charts';
import { NgApexchartsModule }              from 'ng-apexcharts';
import { NgChartsModule }                  from 'ng2-charts';
import { CalendarModule, DateAdapter }     from 'angular-calendar';
import { adapterFactory }                  from 'angular-calendar/date-adapters/date-fns';
import { TrendModule }                     from 'ngx-trend';
import { HighlightAuto }                   from 'ngx-highlightjs';
import { MiobservableComponent }           from './pages/observables/observable/miobservable.component';
import { SubObservableComponent }          from './pages/observables/sub-observable/sub-observable.component';
import { ListObservableComponent }         from './pages/observables/list-observable/list-observable.component';
import { ErrorMessageComponent }           from './pages/error-message/error-message.component';
import { ExportexcelComponent }            from './pages/exportexcel/exportexcel.component';
import { PrintpdfComponent }               from './pages/printpdf/printpdf.component';
import { PrintPdfChartComponent } from './pages/printPdfChart/printPdfChart.component';
import { NgScrollbarModule } from 'ngx-scrollbar';

import { NgSelectModule } from "@ng-select/ng-select";
import { ComboComponent } from '../../components/campos/combo/combo.component';
import { ReactiveFormsModule } from '@angular/forms';

import { ModalFooterComponent } from '../../components/modal/modal-footer/modal-footer.component';
import { ModalHeaderComponent } from '../../components/modal/modal-header/modal-header.component';
import { FileComponent } from '../../components/campos/file/file.component';
import { ImportExcelComponent } from './pages/import-excel/import-excel.component';

import { ZXingScannerModule } from '@zxing/ngx-scanner';
import { ScannerComponent } from './pages/scanner/scanner.component';
import { FacturaComponent } from './pages/facturas/factura/factura.component';
import { AllClientesComponent } from './pages/facturas/all-clientes/all-clientes.component';

import { AgGridModule } from 'ag-grid-angular';
import { CampoTextoComponent } from '../../components/campos/campoTexto/campoTexto.component';
import { CampoBusquedaComponent } from '../../components/campos/campoBusqueda/campoBusqueda.component';
import { AllProductosComponent } from './pages/facturas/all-productos/all-productos.component';

import { UbicacionGpsComponent } from './pages/ubicacion-gps/ubicacion-gps.component';
import { DetectaRostroComponent } from './pages/detecta-rostro/detecta-rostro.component';
import { DetectaIPComponent } from './pages/detecta-ip/detecta-ip.component';
import { WebsocketSendComponent } from './pages/websocket-send/websocket-send.component';
import { WebsocketRecivedComponent } from './pages/websocket-recived/websocket-recived.component';


@NgModule({
  declarations: [
    Dashboard1Component,
    Dashboard2Component,
    Dashboard3Component,
    HomeComponent,
    MiobservableComponent,
    SubObservableComponent,
    ListObservableComponent,
    ErrorMessageComponent,
    ExportexcelComponent,
    PrintpdfComponent,
    PrintPdfChartComponent,
    FormFloatingLabelComponent,
    SpinnerComponentimplements,
    WindowsExplorerComponent,
    ScannerComponent,
    FacturaComponent,
    AllClientesComponent,
    AllProductosComponent,
    UbicacionGpsComponent,
    DetectaRostroComponent,
    DetectaIPComponent,
    WebsocketSendComponent,
    WebsocketRecivedComponent,
    FileComponent,
    ImportExcelComponent

  ],
  imports: [
    AsyncPipe,
    CommonModule,
    DemoRoutingModule,
    PanelModule,
    FormsModule,
    NgScrollbarModule,
    NgSelectModule,
    CampoTextoComponent,
    CampoBusquedaComponent,

    ComboComponent,
    ReactiveFormsModule,      
    
    ModalFooterComponent,
    ModalHeaderComponent,
    ZXingScannerModule,
    AgGridModule,
    
// plugins
    HighlightAuto,
    ColorSketchModule,
    NgbDatepickerModule,
    NgbTimepickerModule,
    NgxEditorModule,
    NgxDaterangepickerMd.forRoot(),

    NgxDatatableModule,
    FullCalendarModule,
    CountdownModule,
    NgxChartsModule,
    NgApexchartsModule,
    NgChartsModule,
    TrendModule,
    CalendarModule.forRoot({
      provide: DateAdapter,
      useFactory: adapterFactory
    })

    
  ]
})
export class DemoModule { 

}

