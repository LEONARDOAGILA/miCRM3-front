import { Component, HostListener, Input, OnInit } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

@Component({
  selector: 'app-modalReporteExterno',
  templateUrl: './modalReporteExterno.component.html',
  styleUrls: ['./modalReporteExterno.component.css'],
  standalone: false,
})
export class ModalReporteExternoComponent implements OnInit {
    @Input() registro_selected: any;
    url_: any;
    isFullscreen = false;

    constructor(
        public modal: NgbActiveModal, 
        private sanitizer: DomSanitizer    
    ) { }

    ngOnInit(): void {
        this.isFullscreen = true;
        this.url_ = this.sanitizer.bypassSecurityTrustResourceUrl(this.registro_selected.url);
    }

    toggleFullscreen() {
        const elem = document.documentElement;
        if (!document.fullscreenElement) {
            elem.requestFullscreen().catch(err => {
                console.error(`Error al intentar pantalla completa: ${err.message}`);
            });
        } else {
            document.exitFullscreen();
        }
    }

    // Opcional: Manejar la tecla F11
    @HostListener('document:keydown', ['$event'])
    handleKeyboardEvent(event: KeyboardEvent) {
        if (event.key === 'F11') {
            event.preventDefault();
            this.toggleFullscreen();
        }
    }
}