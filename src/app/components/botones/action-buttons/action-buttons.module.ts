import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActionButtonsComponent } from './action-buttons.component';

@NgModule({
    declarations: [ActionButtonsComponent],
    imports: [ CommonModule ],
    exports: [ActionButtonsComponent],
    providers: [],
})
export class ActionButtonsModule {}