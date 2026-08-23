    
import { Component, ViewChild, AfterViewInit, EventEmitter, Output, Input } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'panel',
  inputs: [
    'title', 'variant', 'noBody', 'noButton', 'headerClass', 
    'bodyClass', 'footerClass', 'panelClass', 'noButtonExpand', 
    'noButtonReload', 'noButtonCollapse', 'noButtonRemove', 
    'ButtonPrint','ButtonExportExcel','ButtonExportCsv','ButtonRemoveModal',
    'icono',
    'fondoGris'
  ],
  templateUrl: './panel.component.html',
  styleUrls: ['./panel.component.css'],
  standalone: false
})

export class PanelComponent implements AfterViewInit {  
  @Input() closeRoute: string = 'home';
  @Input() icono: string = '';
  @Input() fondoGris: boolean = false;

  @ViewChild('panelFooter', { static: false }) panelFooter;
  expand = false; 
  reload = false;
  collapse = false;
  remove = false;
  print = false;
  exportExcel = false;
  exportCsv = false;
  showFooter = false;
  
  constructor(private _router: Router) {}

  ngAfterViewInit() {
    setTimeout(() => {
      this.showFooter = (this.panelFooter) ? this.panelFooter.nativeElement && this.panelFooter.nativeElement.children.length > 0 : false;
    });
  }

  @Output() panelExpanded: EventEmitter<boolean> = new EventEmitter<boolean>();
  @Output() panelReloaded: EventEmitter<void> = new EventEmitter<void>();
  @Output() panelPrinted: EventEmitter<void> = new EventEmitter<void>();
  @Output() panelExportExceled: EventEmitter<void> = new EventEmitter<void>();
  @Output() panelExportCsved: EventEmitter<void> = new EventEmitter<void>();
  @Output() panelRemoved: EventEmitter<void> = new EventEmitter<void>();
  @Output() panelRemovedModal: EventEmitter<void> = new EventEmitter<void>();

  panelPrint() {
    this.panelPrinted.emit();
  }

  panelExportExcel() {
    this.panelExportExceled.emit();
  }

  panelExportCsv() {
    this.panelExportCsved.emit();
  }

  panelExpand() {
    this.expand = !this.expand;
    this.panelExpanded.emit(this.expand);
  }

  panelReload() {
    this.panelReloaded.emit();
  }

  panelCollapse() {
    this.collapse = !this.collapse;
  }

  panelRemove() {
    this.panelRemoved.emit();
    this._router.navigate([this.closeRoute]);
  }

  panelRemoveModal() {
    this.panelRemovedModal.emit();
  }
}