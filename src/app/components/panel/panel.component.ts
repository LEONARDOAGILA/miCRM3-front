import { Component, ViewChild, AfterViewInit, EventEmitter, Output, Input } from '@angular/core';
import { Router } from '@angular/router';



@Component({
  selector: 'panel',
  inputs: ['title', 'variant', 'noBody', 'noButton', 'headerClass', 'bodyClass', 'footerClass', 'panelClass', 'noButtonExpand', 'noButtonReload', 'noButtonCollapse', 'noButtonRemove', 'ButtonPrint','ButtonExportExcel','ButtonExportCsv','ButtonRemoveModal'],
  templateUrl: './panel.component.html',
  standalone: false
})

export class PanelComponent implements AfterViewInit {  
    @Input() closeRoute: string = 'home'; // Ruta por defecto

  @ViewChild('panelFooter', { static: false }) panelFooter;
  expand = false; 
  reload = false;
  collapse = false;
  remove = false;
  print = false;
  exportExcel = false;
  exportCsv = false;
  showFooter = false;
  constructor(
      private _router: Router
  ){}

  
  ngAfterViewInit() {
    setTimeout(() => {
      this.showFooter = (this.panelFooter) ? this.panelFooter.nativeElement && this.panelFooter.nativeElement.children.length > 0 : false;
    });
  }

  // variable boolean para enviar cada vez que se expande el panel
  @Output() panelExpanded: EventEmitter<boolean> = new EventEmitter<boolean>();
  // Evento para emitir cuando se recarga el panel
  @Output() panelReloaded: EventEmitter<void> = new EventEmitter<void>();
  @Output() panelPrinted: EventEmitter<void> = new EventEmitter<void>();
  @Output() panelExportExceled: EventEmitter<void> = new EventEmitter<void>();
  @Output() panelExportCsved: EventEmitter<void> = new EventEmitter<void>();
  @Output() panelRemoved: EventEmitter<void> = new EventEmitter<void>();
  @Output() panelRemovedModal: EventEmitter<void> = new EventEmitter<void>();


  panelPrint() {
    this.panelPrinted.emit(); // Emitir evento cuando se recarga el panel      
  }

  panelExportExcel() {
    this.panelExportExceled.emit(); // Emitir evento cuando se recarga el panel      
  }

  panelExportCsv() {
    this.panelExportCsved.emit(); // Emitir evento cuando se recarga el panel      
  }

  panelExpand() {
    this.expand = !this.expand;
    this.panelExpanded.emit(this.expand); // Emitir evento cuando se expande el panel
  }
  panelReload() {
    this.panelReloaded.emit(); // Emitir evento cuando se recarga el panel      

    //this.reload = true;
    // setTimeout(() => {
    //   this.reload = false;
    // }, 1500);
  }
  panelCollapse() {
    this.collapse = !this.collapse;
  }
  panelRemove() {
    this.panelRemoved.emit(); // Emitir evento
    this._router.navigate([this.closeRoute]); // Usar la ruta personalizada
  }

  panelRemoveModal() {
    this.panelRemovedModal.emit(); // Emitir evento cuando se recarga el panel
  }


}

