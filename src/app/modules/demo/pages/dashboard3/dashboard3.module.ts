import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { NgApexchartsModule } from 'ng-apexcharts';
import { NgxDaterangepickerMd } from 'ngx-daterangepicker-material';

import { Dashboard3Component } from './dashboard3.component';

/**
 * Modulo propio de Dashboard3, con lo justo que pide su plantilla:
 * <apx-chart>, la directiva ngxDaterangepickerMd y ngModel.
 *
 * Antes el componente se declaraba en DemoModule, asi que para pintarlo habia
 * que cargar DemoModule entero: face-api/tensorflow, el escaner zxing, leaflet,
 * exceljs, fullcalendar, ag-grid, ngx-editor, highlight.js... mas de 5 MB de
 * codigo para un panel que no usa nada de eso.
 *
 * DemoModule importa este modulo, de modo que la ruta /demo/dashboard3 sigue
 * funcionando igual que antes.
 */
@NgModule({
  declarations: [
    Dashboard3Component
  ],
  imports: [
    CommonModule,
    FormsModule,
    NgApexchartsModule,
    NgxDaterangepickerMd.forRoot()
  ],
  exports: [
    Dashboard3Component
  ]
})
export class Dashboard3Module { }
