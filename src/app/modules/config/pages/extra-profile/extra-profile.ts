import { Component, OnDestroy, ViewEncapsulation, AfterViewInit, HostListener } from '@angular/core';
import { AppSettings } from '../../../../service/app-settings.service';

@Component({
  selector: 'extra-profile',
  templateUrl: './extra-profile.html',
  encapsulation: ViewEncapsulation.None,
  styleUrls: [ './extra-profile.css' ],
  standalone: false
})

export class ExtraProfilePage implements OnDestroy, AfterViewInit {
  private lityInstance: any = null;
  private initialized = false;
  private currentItems: string[] = [];
  private currentIndex: number = 0;
  public isZoomed: boolean = false;
  private currentGalleryType: string = 'image';
  private zoomButton: HTMLElement | null = null;
  private currentScale: number = 1;
  private readonly MIN_SCALE = 1;
  private readonly MAX_SCALE = 6;
  private readonly ZOOM_STEP = 0.5;
  
  // Variables para panning (mover la imagen)
  private isPanning: boolean = false;
  private panStartX: number = 0;
  private panStartY: number = 0;
  private panScrollLeft: number = 0;
  private panScrollTop: number = 0;
  private containerElement: HTMLElement | null = null;

  constructor(public appSettings: AppSettings) {
    this.appSettings.appContentClass = 'p-0';
  }

  @HostListener('document:keydown.escape', ['$event'])
  handleEscapeKey(event: KeyboardEvent) {
    if (this.lityInstance) {
      event.preventDefault();
      this.closeLightbox();
    }
  }

  @HostListener('document:keydown.arrowleft', ['$event'])
  handleLeftArrow(event: KeyboardEvent) {
    if (this.lityInstance && this.currentItems.length > 1) {
      event.preventDefault();
      this.navigateGallery(-1);
    }
  }

  @HostListener('document:keydown.arrowright', ['$event'])
  handleRightArrow(event: KeyboardEvent) {
    if (this.lityInstance && this.currentItems.length > 1) {
      event.preventDefault();
      this.navigateGallery(1);
    }
  }

  async ngAfterViewInit() {
    if (this.initialized) return;
    
    setTimeout(async () => {
      try {
        const lityModule = await import('lity');
        const lity = lityModule.default || lityModule;
        
        (window as any).lity = lity;
        
        if (lity && lity.options) {
          lity.options = {
            ...lity.options,
            esc: true,
            click: false
          };
        }
        
        const elements = document.querySelectorAll('[data-lity]');
        
        elements.forEach((element) => {
          element.removeEventListener('click', this.handleLityClick);
          element.addEventListener('click', this.handleLityClick);
        });
        
        this.initialized = true;
      } catch (error) {
        console.error('Error loading lity:', error);
      }
    }, 100);
  }

  private isVideoUrl(url: string): boolean {
    return url.includes('youtube.com') || url.includes('youtu.be') || url.includes('vimeo.com');
  }

  private handleLityClick = async (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    
    const target = event.currentTarget as HTMLAnchorElement;
    const href = target.getAttribute('href');
    
    if (!href) return;
    
    try {
      if (this.lityInstance) {
        this.closeLightbox();
      }
      
      this.destroyControls();
      
      const galleryName = target.getAttribute('data-gallery') || 'default';
      const allItems = Array.from(document.querySelectorAll(`[data-lity][data-gallery="${galleryName}"]`))
        .map(el => el.getAttribute('href'))
        .filter(href => href !== null) as string[];
      
      this.currentItems = allItems;
      this.currentIndex = this.currentItems.indexOf(href);
      this.currentScale = 1;
      this.isZoomed = false;
      this.currentGalleryType = this.isVideoUrl(href) ? 'video' : 'image';
      
      let lity = (window as any).lity;
      if (!lity) {
        const lityModule = await import('lity');
        lity = lityModule.default || lityModule;
        (window as any).lity = lity;
      }
      
      this.lityInstance = lity(href);
      
      setTimeout(() => {
        if (this.lityInstance) {
          this.createControls();
          this.captureCloseButtonClick();
        }
      }, 300);
      
    } catch (error) {
      console.error('Error opening lity:', error);
      this.lityInstance = null;
    }
  }

private createControls() {
  this.destroyControls();
  
  if (this.currentGalleryType === 'image') {
    this.createZoomButton();
    this.addImageClickHandler();
    this.addWheelListenerToImage(); // Agregar wheel listener a la imagen
  }
  
  if (this.currentItems.length > 1) {
    this.createNavigationButtons();
  }
}


  private createNavigationButtons() {
    const prevBtn = document.createElement('button');
    prevBtn.id = 'lity-custom-prev';
    prevBtn.innerHTML = '‹';
    prevBtn.className = 'lity-custom-nav';
    prevBtn.style.cssText = `
      position: fixed;
      left: 20px;
      top: 50%;
      transform: translateY(-50%);
      width: 50px;
      height: 50px;
      background: rgba(0,0,0,0.6);
      color: white;
      border: none;
      border-radius: 50%;
      font-size: 40px;
      cursor: pointer;
      z-index: 10001;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    `;
    prevBtn.onclick = () => {
      this.navigateGallery(-1);
      return false;
    };
    
    const nextBtn = document.createElement('button');
    nextBtn.id = 'lity-custom-next';
    nextBtn.innerHTML = '›';
    nextBtn.className = 'lity-custom-nav';
    nextBtn.style.cssText = `
      position: fixed;
      right: 20px;
      top: 50%;
      transform: translateY(-50%);
      width: 50px;
      height: 50px;
      background: rgba(0,0,0,0.6);
      color: white;
      border: none;
      border-radius: 50%;
      font-size: 40px;
      cursor: pointer;
      z-index: 10001;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    `;
    nextBtn.onclick = () => {
      this.navigateGallery(1);
      return false;
    };
    
    document.body.appendChild(prevBtn);
    document.body.appendChild(nextBtn);
    
    this.updateNavButtonsVisibility();
  }

  private addImageClickHandler() {
    setTimeout(() => {
      const activeImage = document.querySelector('.lity-img, .lity-image img, .lity-content img');
      
      if (activeImage) {
        console.log('Imagen encontrada:', activeImage);
        
        const clickHandler = (e: Event) => {
          e.preventDefault();
          e.stopPropagation();
          console.log('Click en imagen - ejecutando toggleZoom');
          this.toggleZoom();
        };
        
        activeImage.addEventListener('click', clickHandler);
        (activeImage as any).__zoomClickHandler = clickHandler;
        (activeImage as HTMLElement).style.cursor = 'pointer';
      } else {
        console.warn('No se encontró la imagen, reintentando...');
        setTimeout(() => this.addImageClickHandler(), 200);
      }
    }, 200);
  }

private enablePanning() {
  const zoomTarget = this.getZoomTarget();
  if (!zoomTarget) return;
  
  let container = zoomTarget.parentElement;
  
  while (container && !container.classList?.contains('lity-content')) {
    container = container.parentElement;
  }
  
  if (container) {
    container.style.overflow = 'auto';
    container.style.maxWidth = '90vw';
    container.style.maxHeight = '90vh';
    container.style.cursor = 'grab';
    this.containerElement = container;
    
    // Agregar wheel listener al contenedor también
    this.addWheelListenerToContainer();
  }
  
  zoomTarget.style.transformOrigin = 'top left';
}


  private addPanningEvents() {
    const container = this.containerElement;
    if (!container) return;
    
    const onMouseDown = (e: MouseEvent) => {
      if (this.currentScale <= this.MIN_SCALE) return;
      
      e.preventDefault();
      this.isPanning = true;
      this.panStartX = e.clientX;
      this.panStartY = e.clientY;
      this.panScrollLeft = container.scrollLeft;
      this.panScrollTop = container.scrollTop;
      container.style.cursor = 'grabbing';
    };
    
    const onMouseMove = (e: MouseEvent) => {
      if (!this.isPanning) return;
      
      e.preventDefault();
      const dx = e.clientX - this.panStartX;
      const dy = e.clientY - this.panStartY;
      container.scrollLeft = this.panScrollLeft - dx;
      container.scrollTop = this.panScrollTop - dy;
    };
    
    const onMouseUp = () => {
      this.isPanning = false;
      if (container) {
        container.style.cursor = 'grab';
      }
    };
    
    container.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    
    (container as any).__panningEvents = { onMouseDown, onMouseMove, onMouseUp };
  }

private removePanningEvents() {
  if (this.containerElement && (this.containerElement as any).__panningEvents) {
    const events = (this.containerElement as any).__panningEvents;
    this.containerElement.removeEventListener('mousedown', events.onMouseDown);
    window.removeEventListener('mousemove', events.onMouseMove);
    window.removeEventListener('mouseup', events.onMouseUp);
    (this.containerElement as any).__panningEvents = null;
    this.containerElement.style.cursor = '';
    this.containerElement.style.overflow = '';
  }
  
  // Limpiar wheel listener del contenedor
  if (this.containerElement && (this.containerElement as any).__wheelHandler) {
    this.containerElement.removeEventListener('wheel', (this.containerElement as any).__wheelHandler);
    (this.containerElement as any).__wheelHandler = null;
  }
  
  this.containerElement = null;
  this.isPanning = false;
}


  private createZoomButton() {
    const zoomBtn = document.createElement('button');
    zoomBtn.id = 'lity-custom-zoom';
    zoomBtn.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 55px;
      height: 55px;
      background: rgba(0,0,0,0.6);
      color: white;
      border: none;
      border-radius: 50%;
      cursor: pointer;
      z-index: 10001;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
      font-size: 12px;
      gap: 2px;
    `;
    
    zoomBtn.innerHTML = `
      <i class="fa fa-search" style="font-size: 16px;"></i>
      <span style="font-size: 14px; font-weight: bold;">+</span>
    `;
    
    zoomBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleZoom();
      return false;
    };
    
    document.body.appendChild(zoomBtn);
    this.zoomButton = zoomBtn;
    
    setTimeout(() => {
      this.updateZoomButtonContent();
    }, 50);
  }

  private updateZoomButtonContent() {
    if (!this.zoomButton) return;
    
    if (this.currentScale > this.MIN_SCALE) {
      this.zoomButton.innerHTML = `
        <i class="fa fa-search" style="font-size: 12px;"></i>
        <span style="font-size: 12px; font-weight: bold;">${this.currentScale}x</span>
        <span style="font-size: 16px; font-weight: bold;">−</span>
      `;
      this.zoomButton.style.background = 'rgba(0,0,0,0.8)';
    } else {
      this.zoomButton.innerHTML = `
        <i class="fa fa-search" style="font-size: 16px;"></i>
        <span style="font-size: 16px; font-weight: bold;">+</span>
      `;
      this.zoomButton.style.background = 'rgba(0,0,0,0.6)';
    }
    
    if (this.currentScale > this.MIN_SCALE) {
      this.zoomButton.style.width = '55px';
      this.zoomButton.style.height = '55px';
    } else {
      this.zoomButton.style.width = '45px';
      this.zoomButton.style.height = '45px';
    }
  }

  private toggleZoom() {
    const zoomTarget = this.getZoomTarget();
    if (!zoomTarget) {
      console.warn('No se encontró elemento para hacer zoom');
      return;
    }
    
    const wasMinScale = this.currentScale === this.MIN_SCALE;
    
    if (this.currentScale === this.MIN_SCALE) {
      this.currentScale = this.MIN_SCALE + this.ZOOM_STEP;
      this.isZoomed = true;
    } else if (this.currentScale >= this.MAX_SCALE) {
      this.currentScale = this.MIN_SCALE;
      this.isZoomed = false;
    } else {
      this.currentScale = Math.min(this.currentScale + this.ZOOM_STEP, this.MAX_SCALE);
      this.isZoomed = this.currentScale > this.MIN_SCALE;
    }
    
    zoomTarget.style.transform = `scale(${this.currentScale})`;
    zoomTarget.style.transition = 'transform 0.3s ease';
    zoomTarget.style.cursor = this.currentScale > this.MIN_SCALE ? 'grab' : 'zoom-in';
    
    if (this.currentScale > this.MIN_SCALE && wasMinScale) {
      this.enablePanning();
      this.addPanningEvents();
    } else if (this.currentScale === this.MIN_SCALE && !wasMinScale) {
      this.removePanningEvents();
      if (this.containerElement) {
        this.containerElement.scrollLeft = 0;
        this.containerElement.scrollTop = 0;
      }
    }
    
    console.log(`Zoom aplicado: ${this.currentScale}x`);
    this.updateZoomButtonContent();
  }

@HostListener('wheel', ['$event'])
handleWheelZoom(event: WheelEvent) {
  // Verificar si el lightbox está abierto
  if (!this.lityInstance) return;
  
  const zoomTarget = this.getZoomTarget();
  if (!zoomTarget) return;
  
  // Detectar si el mouse está sobre la imagen o el contenedor
  const isOverImage = zoomTarget.contains(event.target as Node);
  const isOverContainer = this.containerElement?.contains(event.target as Node);
  
  if (!isOverImage && !isOverContainer) return;
  
  event.preventDefault();
  
  const wasMinScale = this.currentScale === this.MIN_SCALE;
  
  // Zoom in (rueda hacia arriba) o zoom out (rueda hacia abajo)
  if (event.deltaY < 0) {
    // Zoom in - Aumentar escala
    if (this.currentScale < this.MAX_SCALE) {
      this.currentScale = Math.min(this.currentScale + this.ZOOM_STEP, this.MAX_SCALE);
    }
  } else if (event.deltaY > 0) {
    // Zoom out - Disminuir escala
    if (this.currentScale > this.MIN_SCALE) {
      this.currentScale = Math.max(this.currentScale - this.ZOOM_STEP, this.MIN_SCALE);
    }
  }
  
  this.isZoomed = this.currentScale > this.MIN_SCALE;
  
  // Aplicar la escala
  zoomTarget.style.transform = `scale(${this.currentScale})`;
  zoomTarget.style.transition = 'transform 0.2s ease';
  zoomTarget.style.cursor = this.currentScale > this.MIN_SCALE ? 'grab' : 'zoom-in';
  
  // Habilitar o deshabilitar panning según la escala
  if (this.currentScale > this.MIN_SCALE && wasMinScale) {
    this.enablePanning();
    this.addPanningEvents();
  } else if (this.currentScale === this.MIN_SCALE && !wasMinScale) {
    this.removePanningEvents();
    if (this.containerElement) {
      this.containerElement.scrollLeft = 0;
      this.containerElement.scrollTop = 0;
    }
  }
  
  console.log(`Zoom con rueda: ${this.currentScale}x`);
  this.updateZoomButtonContent();
}


private addWheelListenerToImage() {
  setTimeout(() => {
    const zoomTarget = this.getZoomTarget();
    if (zoomTarget) {
      console.log('Agregando wheel listener a la imagen');
      
      const wheelHandler = (e: WheelEvent) => {
        e.preventDefault();
        e.stopPropagation();
        
        const wasMinScale = this.currentScale === this.MIN_SCALE;
        
        // Zoom in (rueda hacia arriba) o zoom out (rueda hacia abajo)
        if (e.deltaY < 0) {
          // Zoom in - Aumentar escala
          if (this.currentScale < this.MAX_SCALE) {
            this.currentScale = Math.min(this.currentScale + this.ZOOM_STEP, this.MAX_SCALE);
          }
        } else if (e.deltaY > 0) {
          // Zoom out - Disminuir escala
          if (this.currentScale > this.MIN_SCALE) {
            this.currentScale = Math.max(this.currentScale - this.ZOOM_STEP, this.MIN_SCALE);
          }
        }
        
        this.isZoomed = this.currentScale > this.MIN_SCALE;
        
        // Aplicar la escala
        zoomTarget.style.transform = `scale(${this.currentScale})`;
        zoomTarget.style.transition = 'transform 0.2s ease';
        zoomTarget.style.cursor = this.currentScale > this.MIN_SCALE ? 'grab' : 'zoom-in';
        
        // Habilitar o deshabilitar panning según la escala
        if (this.currentScale > this.MIN_SCALE && wasMinScale) {
          this.enablePanning();
          this.addPanningEvents();
        } else if (this.currentScale === this.MIN_SCALE && !wasMinScale) {
          this.removePanningEvents();
          if (this.containerElement) {
            this.containerElement.scrollLeft = 0;
            this.containerElement.scrollTop = 0;
          }
        }
        
        console.log(`Zoom con rueda: ${this.currentScale}x`);
        this.updateZoomButtonContent();
      };
      
      zoomTarget.addEventListener('wheel', wheelHandler, { passive: false });
      (zoomTarget as any).__wheelHandler = wheelHandler;
    } else {
      setTimeout(() => this.addWheelListenerToImage(), 200);
    }
  }, 200);
}

// También agrega wheel listener al contenedor
private addWheelListenerToContainer() {
  setTimeout(() => {
    if (this.containerElement) {
      const wheelHandler = (e: WheelEvent) => {
        e.preventDefault();
        e.stopPropagation();
        
        const wasMinScale = this.currentScale === this.MIN_SCALE;
        const zoomTarget = this.getZoomTarget();
        if (!zoomTarget) return;
        
        if (e.deltaY < 0) {
          if (this.currentScale < this.MAX_SCALE) {
            this.currentScale = Math.min(this.currentScale + this.ZOOM_STEP, this.MAX_SCALE);
          }
        } else if (e.deltaY > 0) {
          if (this.currentScale > this.MIN_SCALE) {
            this.currentScale = Math.max(this.currentScale - this.ZOOM_STEP, this.MIN_SCALE);
          }
        }
        
        this.isZoomed = this.currentScale > this.MIN_SCALE;
        
        zoomTarget.style.transform = `scale(${this.currentScale})`;
        zoomTarget.style.transition = 'transform 0.2s ease';
        zoomTarget.style.cursor = this.currentScale > this.MIN_SCALE ? 'grab' : 'zoom-in';
        
        if (this.currentScale > this.MIN_SCALE && wasMinScale) {
          this.enablePanning();
          this.addPanningEvents();
        } else if (this.currentScale === this.MIN_SCALE && !wasMinScale) {
          this.removePanningEvents();
          if (this.containerElement) {
            this.containerElement.scrollLeft = 0;
            this.containerElement.scrollTop = 0;
          }
        }
        
        this.updateZoomButtonContent();
      };
      
      this.containerElement.addEventListener('wheel', wheelHandler, { passive: false });
      (this.containerElement as any).__wheelHandler = wheelHandler;
    }
  }, 200);
}


  private getZoomTarget(): HTMLElement | null {
    const lityImg = document.querySelector('.lity-img') as HTMLElement;
    if (lityImg && lityImg.tagName === 'IMG') {
      return lityImg;
    }
    
    const lityContentImg = document.querySelector('.lity-content img') as HTMLElement;
    if (lityContentImg) {
      return lityContentImg;
    }
    
    const lityImageImg = document.querySelector('.lity-image img') as HTMLElement;
    if (lityImageImg) {
      return lityImageImg;
    }
    
    const lityImage = document.querySelector('.lity-image') as HTMLElement;
    if (lityImage) {
      return lityImage;
    }
    
    return null;
  }

  private updateNavButtonsVisibility() {
    const prevBtn = document.getElementById('lity-custom-prev');
    const nextBtn = document.getElementById('lity-custom-next');
    
    if (prevBtn) {
      prevBtn.style.display = this.currentIndex > 0 ? 'flex' : 'none';
    }
    if (nextBtn) {
      nextBtn.style.display = this.currentIndex < this.currentItems.length - 1 ? 'flex' : 'none';
    }
  }

  private navigateGallery(direction: number) {
    const newIndex = this.currentIndex + direction;
    
    if (newIndex < 0 || newIndex >= this.currentItems.length) return;
    
    this.currentIndex = newIndex;
    const newHref = this.currentItems[this.currentIndex];
    
    const isNewVideo = this.isVideoUrl(newHref);
    this.currentGalleryType = isNewVideo ? 'video' : 'image';
    this.currentScale = 1;
    this.isZoomed = false;
    
    this.removePanningEvents();
    this.destroyControls();
    
    const lity = (window as any).lity;
    if (lity && newHref && this.lityInstance) {
      const currentInstance = this.lityInstance;
      this.lityInstance = null;
      
      try {
        if (currentInstance && currentInstance.close) {
          currentInstance.close();
        }
        
        this.lityInstance = lity(newHref);
        
        setTimeout(() => {
          if (this.lityInstance) {
            this.createControls();
            this.captureCloseButtonClick();
            if (this.currentGalleryType === 'image') {
              this.addImageClickHandler();
            }
          }
        }, 300);
      } catch (error) {
        console.error('Error navegando:', error);
        this.lityInstance = null;
      }
    }
  }

  private forceDisableOverlayClose() {
    setTimeout(() => {
      const lityElement = document.querySelector('.lity');
      if (lityElement) {
        const overlay = document.querySelector('.lity-overlay');
        if (overlay) {
          overlay.removeAttribute('data-lity');
          overlay.removeAttribute('data-lity-close');
        }
        
        lityElement.addEventListener('click', (e) => {
          const target = e.target as HTMLElement;
          if (!target.classList.contains('lity-close')) {
            e.stopPropagation();
          }
        }, true);
      }
    }, 100);
  }

  private captureCloseButtonClick() {
    setTimeout(() => {
      const closeButton = document.querySelector('.lity-close') as HTMLElement;
      if (closeButton) {
        const closeHandler = () => {
          console.log('Clic en X detectado - cerrando');
          this.closeLightbox();
        };
        
        closeButton.removeEventListener('click', closeHandler);
        closeButton.addEventListener('click', closeHandler);
        this.forceDisableOverlayClose();
      } else {
        setTimeout(() => this.captureCloseButtonClick(), 100);
      }
    }, 100);
  }

private destroyControls() {
  const prevBtn = document.getElementById('lity-custom-prev');
  const nextBtn = document.getElementById('lity-custom-next');
  const zoomBtn = document.getElementById('lity-custom-zoom');
  
  if (prevBtn) prevBtn.remove();
  if (nextBtn) nextBtn.remove();
  if (zoomBtn) zoomBtn.remove();
  
  const zoomTarget = this.getZoomTarget();
  if (zoomTarget && (zoomTarget as any).__zoomClickHandler) {
    zoomTarget.removeEventListener('click', (zoomTarget as any).__zoomClickHandler);
    (zoomTarget as any).__zoomClickHandler = null;
    zoomTarget.style.cursor = '';
  }
  
  // Limpiar wheel handler de la imagen
  if (zoomTarget && (zoomTarget as any).__wheelHandler) {
    zoomTarget.removeEventListener('wheel', (zoomTarget as any).__wheelHandler);
    (zoomTarget as any).__wheelHandler = null;
  }
  
  this.removePanningEvents();
  this.zoomButton = null;
}

  private closeLightbox = () => {
    this.destroyControls();
    
    if (this.lityInstance) {
      try {
        if (typeof this.lityInstance.close === 'function') {
          this.lityInstance.close();
        }
      } catch (error) {
        console.warn('Error al cerrar lity:', error);
      }
      this.lityInstance = null;
    }
    
    document.body.style.overflow = '';
    document.body.classList.remove('lity-active');
    
    this.currentItems = [];
    this.currentIndex = 0;
    this.currentScale = 1;
    this.isZoomed = false;
    this.currentGalleryType = 'image';
  }

  ngOnDestroy() {
    this.closeLightbox();
    
    const elements = document.querySelectorAll('[data-lity]');
    elements.forEach((element) => {
      element.removeEventListener('click', this.handleLityClick);
    });
    
    this.appSettings.appContentClass = '';
    this.initialized = false;
  }
}