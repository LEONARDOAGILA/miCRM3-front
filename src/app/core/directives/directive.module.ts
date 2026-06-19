import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MayusculasDirective } from './mayusculas.directive';
import { NoEspaciosDirective } from './noEspacios.directive';
import { TrimEspaciosDirective } from './trimEspacios.directive';
import { SoloLetrasDirective } from './soloLetras.directive';
import { SoloNumerosEnterosDirective } from './soloNumerosEnteros.directive';

@NgModule({
  imports: [
    CommonModule
  ],
  declarations: [
    MayusculasDirective,
    NoEspaciosDirective,
    TrimEspaciosDirective,
    SoloLetrasDirective,
    SoloNumerosEnterosDirective
  ],
  exports: [
    MayusculasDirective,
    NoEspaciosDirective,
    TrimEspaciosDirective,
    SoloLetrasDirective,
    SoloNumerosEnterosDirective
  ]  
})
export class DirectiveModule { }
