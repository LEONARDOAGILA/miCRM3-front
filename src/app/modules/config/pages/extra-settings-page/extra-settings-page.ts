import { Component, OnInit, AfterViewInit, OnDestroy } from '@angular/core';
import { AppSettings } from '../../../../service/app-settings.service';

@Component({
  selector: 'extra-settings-page',
  templateUrl: './extra-settings-page.html',
  standalone: false
})

export class ExtraSettingsPage implements OnInit, AfterViewInit, OnDestroy {
  private scrollContainer: HTMLElement | null = null;
  private scrollHandler: (() => void) | null = null;

  constructor(public appSettings: AppSettings) {
  }
  
  ngOnInit() {
    // Inicialización básica si es necesaria
  }

  ngAfterViewInit() {
    // Obtener el contenedor de scroll (div con clase settings-scroll-container)
    this.scrollContainer = document.querySelector('.settings-scroll-container') as HTMLElement;
    
    if (!this.scrollContainer) return;

    // Configurar el contenedor para scroll
    this.scrollContainer.style.maxHeight = 'calc(100vh - 150px)';
    this.scrollContainer.style.overflowY = 'auto';
    this.scrollContainer.style.position = 'relative';

    // Obtener las secciones y links
    const sections = document.querySelectorAll('#bsSpyContent > div');
    const navLinks = document.querySelectorAll('#bsSpyTarget > a');

    // Función para activar el link de navegación
    const activateNavLink = (id: string) => {
      navLinks.forEach((link) => {
        if (link && link.classList) {
          link.classList.remove('active');
        }
      });
      const target = document.querySelector(`#bsSpyTarget a[href*='${id}']`);
      if (target) {
        target.classList.add('active');
      }
    };

    // Función para verificar si un elemento está en el viewport del contenedor
    const isElementInViewport = (el: Element, container: HTMLElement) => {
      const rect = el.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      
      return (
        rect.top >= containerRect.top &&
        rect.bottom <= containerRect.bottom
      );
    };

    // Función para manejar el scroll
    const handleViewport = () => {
      if (!this.scrollContainer) return;
      
      let activeSection: string | null = null;
      
      for (let i = sections.length - 1; i >= 0; i--) {
        if (isElementInViewport(sections[i], this.scrollContainer)) {
          activeSection = sections[i].getAttribute('id');
          if (activeSection) {
            activateNavLink(activeSection);
          }
          break;
        }
      }

      // Si hay una sección activa, verificar el scroll final
      if (activeSection) {
        let combinedHeight = 0;
        const sectionIndex = Array.from(sections).findIndex(
          (section) => section.getAttribute('id') === activeSection
        );
        
        for (let i = sectionIndex; i < sections.length; i++) {
          combinedHeight += (sections[i] as HTMLElement).offsetHeight;
        }
        
        if (combinedHeight <= this.scrollContainer.clientHeight) {
          activateNavLink(activeSection);
        }
      }
    };

    // Agregar event listener de scroll al contenedor
    this.scrollHandler = handleViewport;
    this.scrollContainer.addEventListener('scroll', this.scrollHandler);

    // Configurar los links para scroll suave dentro del contenedor
    const elmTriggerList = [].slice.call(document.querySelectorAll('[data-toggle="scroll-to"]'));
    elmTriggerList.forEach((elm: any) => {
      elm.onclick = (e: Event) => {
        e.preventDefault();
        
        if (!this.scrollContainer) return;
        
        const targetAttr = elm.getAttribute('data-target') || elm.getAttribute('href');
        const targetElm = this.scrollContainer.querySelector(targetAttr) as HTMLElement;
        
        if (targetElm) {
          // Calcular la posición relativa al contenedor
          const targetTop = targetElm.offsetTop - 20;
          
          // Scroll suave dentro del contenedor
          this.scrollContainer.scrollTo({
            top: targetTop,
            behavior: 'smooth'
          });
        }
      };
    });

    // Llamar al handleViewport inicial después de un pequeño delay
    setTimeout(() => handleViewport(), 100);
  }

  ngOnDestroy() {
    // Limpiar el event listener cuando el componente se destruya
    if (this.scrollContainer && this.scrollHandler) {
      this.scrollContainer.removeEventListener('scroll', this.scrollHandler);
    }
  }
}