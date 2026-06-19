import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';


import { AuthGuard } from '../../core/guards/auth.guard';
import { AccessResolver } from "../../core/resolvers/access.resolver";


import { HomeComponent } from './pages/home/home.component';
import { ErrorPage } from '../../pages/error/error';
import { Dashboard1Component } from './pages/dashboard1/dashboard1.component';
import { Dashboard2Component } from './pages/dashboard2/dashboard2.component';
import { Dashboard3Component } from './pages/dashboard3/dashboard3.component';
import { ExportexcelComponent } from './pages/exportexcel/exportexcel.component';
import { PrintpdfComponent } from './pages/printpdf/printpdf.component';
import { PrintPdfChartComponent } from './pages/printPdfChart/printPdfChart.component';
import { FormFloatingLabelComponent } from './pages/formFloatingLabel/formFloatingLabel.component';
import { SpinnerComponentimplements } from './pages/spinner/spinner.component';
import { WindowsExplorerComponent } from './pages/windows-explorer/windows-explorer.component';



import { MiobservableComponent } from './pages/observables/observable/miobservable.component';
import { SubObservableComponent } from './pages/observables/sub-observable/sub-observable.component';
import { ListObservableComponent } from './pages/observables/list-observable/list-observable.component';

import { ScannerComponent } from './pages/scanner/scanner.component';
import { FacturaComponent } from './pages/facturas/factura/factura.component';
import { UbicacionGpsComponent } from './pages/ubicacion-gps/ubicacion-gps.component';
import { DetectaRostroComponent } from './pages/detecta-rostro/detecta-rostro.component';
import { DetectaIPComponent } from './pages/detecta-ip/detecta-ip.component';
import { WebsocketSendComponent } from './pages/websocket-send/websocket-send.component';
import { WebsocketRecivedComponent } from './pages/websocket-recived/websocket-recived.component';
import { ImportExcelComponent } from './pages/import-excel/import-excel.component';


const routes: Routes = [
  {
    path: '',
    children: [
        { path: '', redirectTo: 'home-demo', pathMatch: 'full' },


        { path: 'dashboard1',component:Dashboard1Component},
        { path: 'dashboard2',component:Dashboard2Component},
        { path: 'dashboard3',component:Dashboard3Component},
        { path: 'FormFloatingLabel',component:FormFloatingLabelComponent},
        { path: 'spinner',component:SpinnerComponentimplements},
        { path: 'WindowsExplorer',component:WindowsExplorerComponent},
        
        { path: 'qr',component:ScannerComponent},
        { path: 'factura',component:FacturaComponent},
        { path: 'ubicaciongps',component:UbicacionGpsComponent},
        { path: 'detectarostro',component:DetectaRostroComponent},
        { path: 'detectaip',component:DetectaIPComponent},
        { path: 'importarexcel',component:ImportExcelComponent},

        { path: 'websocketsend',component:WebsocketSendComponent},
        { path: 'websocketrecived',component:WebsocketRecivedComponent},

        


        { path: 'miobservable',component:MiobservableComponent},
        { path: 'misubobservable',component:SubObservableComponent},
        { path: 'listobservable',component:ListObservableComponent},
        { path: 'exportexcel',component: ExportexcelComponent},
        { path: 'printpdf',component: PrintpdfComponent},
        { path: 'printpdfchart',component: PrintPdfChartComponent},
        


        { path: 'home-demo', component: HomeComponent, data: { title: 'Home pagessss'} },
        { path: '**', component: ErrorPage},
    ]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class DemoRoutingModule { }
