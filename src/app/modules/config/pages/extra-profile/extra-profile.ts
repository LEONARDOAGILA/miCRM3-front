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
  
  // Variables de zoom y pan (nuevo sistema)
  private currentScale: number = 1;
  private readonly MIN_SCALE: number = 0.5;
  private readonly MAX_SCALE: number = 6;
  private readonly ZOOM_STEP: number = 0.25;
  private rotation: number = 0;
  private panX: number = 0;
  private panY: number = 0;
  private zoomBase: number = 1;
  
  // Variables para arrastre
  private isDragging: boolean = false;
  private dragStartX: number = 0;
  private dragStartY: number = 0;
  private panStartX: number = 0;
  private panStartY: number = 0;
  private huboArrastre: boolean = false;
  
  // Variables para pinch (móvil)
  private isPinching: boolean = false;
  private distanciaInicialDedos: number = 0;
  private zoomInicialPinza: number = 1;
  private medioInicialX: number = 0;
  private medioInicialY: number = 0;
  
  // Referencias a elementos DOM
  private containerElement: HTMLElement | null = null;
  private imageElement: HTMLElement | null = null;
  private stageElement: HTMLElement | null = null;
  
  // Variables para controlar el estado
  private isClosing: boolean = false;
  private isNavigating: boolean = false; // ← NUEVO: evitar navegación múltiple

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
    if (this.lityInstance && this.currentItems.length > 1 && !this.isNavigating) {
      event.preventDefault();
      this.navigateGallery(-1);
    }
  }

  @HostListener('document:keydown.arrowright', ['$event'])
  handleRightArrow(event: KeyboardEvent) {
    if (this.lityInstance && this.currentItems.length > 1 && !this.isNavigating) {
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
      console.log('Abriendo lightbox para:', href);
      this.isClosing = false;
      this.isNavigating = false;
      
      // Cerrar instancia anterior si existe
      if (this.lityInstance) {
        this.closeLightbox();
      }
      
      // Limpiar controles anteriores
      this.removeAllControls();
      
      const galleryName = target.getAttribute('data-gallery') || 'default';
      const allItems = Array.from(document.querySelectorAll(`[data-lity][data-gallery="${galleryName}"]`))
        .map(el => el.getAttribute('href'))
        .filter(href => href !== null) as string[];
      
      this.currentItems = allItems;
      this.currentIndex = this.currentItems.indexOf(href);
      this.currentScale = 1;
      this.rotation = 0;
      this.panX = 0;
      this.panY = 0;
      this.zoomBase = 1;
      this.isZoomed = false;
      this.currentGalleryType = this.isVideoUrl(href) ? 'video' : 'image';
      
      let lity = (window as any).lity;
      if (!lity) {
        const lityModule = await import('lity');
        lity = lityModule.default || lityModule;
        (window as any).lity = lity;
      }
      
      // Crear nueva instancia
      this.lityInstance = lity(href);
      
      // Configurar después de que lity cargue
      setTimeout(() => {
        if (this.lityInstance && !this.isClosing) {
          this.updateCloseButtonVisibility();
          this.createControls();
          this.setupStageAndImage();
          this.captureCloseButtonClick();
        }
      }, 300);
      
    } catch (error) {
      console.error('Error opening lity:', error);
      this.lityInstance = null;
    }
  }

  private setupStageAndImage() {
    if (this.currentGalleryType === 'video') return;
    
    setTimeout(() => {
      if (this.isClosing) return;
      
      const container = document.querySelector('.lity-content');
      if (!container) return;
      
      const img = container.querySelector('.lity-img, .lity-image img, img');
      if (!img) return;
      
      this.containerElement = container as HTMLElement;
      this.imageElement = img as HTMLElement;
      
      container.setAttribute('style', `
        overflow: hidden !important;
        max-width: 90vw;
        max-height: 90vh;
        cursor: default;
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
      `);
      
      this.imageElement.style.transformOrigin = 'center center';
      this.imageElement.style.transition = 'transform 0.12s ease-out';
      this.imageElement.style.cursor = 'default';
      this.imageElement.style.maxWidth = '100%';
      this.imageElement.style.maxHeight = '95vh';
      this.imageElement.style.objectFit = 'contain';
      this.imageElement.style.userSelect = 'none';
      this.imageElement.setAttribute('draggable', 'false');
      this.imageElement.style.setProperty('webkit-user-drag', 'none');
      this.imageElement.style.setProperty('webkit-user-select', 'none');
      
      this.zoomBase = 1;
      this.applyTransform();
      this.addImageEvents();
    }, 100);
  }

  private addImageEvents() {
    if (!this.imageElement) return;
    
    const wheelHandler = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.onWheelZoom(e);
    };
    
    const mouseDownHandler = (e: MouseEvent) => {
      this.startDrag(e);
    };
    
    const mouseMoveHandler = (e: MouseEvent) => {
      this.onDrag(e);
    };
    
    const mouseUpHandler = () => {
      this.endDrag();
    };
    
    const mouseLeaveHandler = () => {
      this.endDrag();
    };
    
    const touchStartHandler = (e: TouchEvent) => {
      this.onTouchStart(e);
    };
    
    const touchMoveHandler = (e: TouchEvent) => {
      this.onTouchMove(e);
    };
    
    const touchEndHandler = () => {
      this.onTouchEnd();
    };
    
    this.imageElement.addEventListener('wheel', wheelHandler, { passive: false });
    this.imageElement.addEventListener('mousedown', mouseDownHandler);
    this.imageElement.addEventListener('mousemove', mouseMoveHandler);
    this.imageElement.addEventListener('mouseup', mouseUpHandler);
    this.imageElement.addEventListener('mouseleave', mouseLeaveHandler);
    this.imageElement.addEventListener('touchstart', touchStartHandler, { passive: false });
    this.imageElement.addEventListener('touchmove', touchMoveHandler, { passive: false });
    this.imageElement.addEventListener('touchend', touchEndHandler);
    this.imageElement.addEventListener('touchcancel', touchEndHandler);
    
    (this.imageElement as any).__wheelHandler = wheelHandler;
    (this.imageElement as any).__mouseDownHandler = mouseDownHandler;
    (this.imageElement as any).__mouseMoveHandler = mouseMoveHandler;
    (this.imageElement as any).__mouseUpHandler = mouseUpHandler;
    (this.imageElement as any).__mouseLeaveHandler = mouseLeaveHandler;
    (this.imageElement as any).__touchStartHandler = touchStartHandler;
    (this.imageElement as any).__touchMoveHandler = touchMoveHandler;
    (this.imageElement as any).__touchEndHandler = touchEndHandler;
  }

  private applyTransform() {
    if (!this.imageElement) return;
    this.imageElement.style.transform = `translate(${this.panX}px, ${this.panY}px) rotate(${this.rotation}deg) scale(${this.currentScale})`;
    this.updateZoomButtonContent();
  }

  private getTransform(): string {
    return `translate(${this.panX}px, ${this.panY}px) rotate(${this.rotation}deg) scale(${this.currentScale})`;
  }

  private get puedeArrastrar(): boolean {
    return this.currentScale > this.zoomBase;
  }

  private get zoomPorcentaje(): number {
    return Math.round(this.currentScale * 100);
  }

  private onWheelZoom(event: WheelEvent) {
    event.preventDefault();
    const zoomAnterior = this.currentScale;
    const direccion = event.deltaY < 0 ? 1 : -1;
    const nuevoZoom = this.limitarZoom(zoomAnterior + direccion * this.ZOOM_STEP);
    
    if (nuevoZoom === zoomAnterior) return;
    
    const rect = this.containerElement?.getBoundingClientRect();
    if (rect) {
      const punteroX = event.clientX - rect.left - rect.width / 2;
      const punteroY = event.clientY - rect.top - rect.height / 2;
      this.panX = punteroX - ((punteroX - this.panX) / zoomAnterior) * nuevoZoom;
      this.panY = punteroY - ((punteroY - this.panY) / zoomAnterior) * nuevoZoom;
    }
    
    this.currentScale = nuevoZoom;
    this.centrarSiEstaSinZoom();
    this.applyTransform();
    this.updateZoomButtonContent();
  }

  private zoomConBoton(nuevoZoom: number) {
    const zoomAnterior = this.currentScale;
    this.currentScale = this.limitarZoom(nuevoZoom);
    if (this.currentScale === zoomAnterior) return;
    
    const factor = this.currentScale / zoomAnterior;
    this.panX *= factor;
    this.panY *= factor;
    this.centrarSiEstaSinZoom();
    this.applyTransform();
    this.updateZoomButtonContent();
  }

  private limitarZoom(valor: number): number {
    const redondeado = Math.round(valor * 100) / 100;
    return Math.min(this.MAX_SCALE, Math.max(this.MIN_SCALE, redondeado));
  }

  private centrarSiEstaSinZoom() {
    if (this.currentScale <= this.zoomBase) {
      this.panX = 0;
      this.panY = 0;
    }
  }

  private rotar(grados: number) {
    this.rotation += grados;
    this.panX = 0;
    this.panY = 0;
    this.zoomBase = this.zoomQueEntraAlGirar();
    this.currentScale = this.zoomBase;
    this.applyTransform();
    this.updateZoomButtonContent();
  }

  private zoomQueEntraAlGirar(): number {
    const deLado = this.rotation % 180 !== 0;
    if (!deLado || !this.imageElement || !this.containerElement) {
      return 1;
    }
    
    const img = this.imageElement as HTMLImageElement;
    if (!img.offsetWidth || !img.offsetHeight) return 1;
    
    const factor = Math.min(
      1,
      this.containerElement.clientWidth / img.offsetHeight,
      this.containerElement.clientHeight / img.offsetWidth
    );
    return Math.max(0.1, Math.floor(factor * 100) / 100);
  }

  private startDrag(event: MouseEvent) {
    this.huboArrastre = false;
    if (!this.puedeArrastrar) return;
    
    event.preventDefault();
    this.isDragging = true;
    this.dragStartX = event.clientX;
    this.dragStartY = event.clientY;
    this.panStartX = this.panX;
    this.panStartY = this.panY;
    
    if (this.imageElement) {
      this.imageElement.style.cursor = 'grabbing';
    }
  }

  private onDrag(event: MouseEvent) {
    if (!this.isDragging) return;
    
    event.preventDefault();
    const deltaX = event.clientX - this.dragStartX;
    const deltaY = event.clientY - this.dragStartY;
    
    if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
      this.huboArrastre = true;
    }
    
    this.panX = this.panStartX + deltaX;
    this.panY = this.panStartY + deltaY;
    this.applyTransform();
  }

  private endDrag() {
    this.isDragging = false;
    if (this.imageElement) {
      this.imageElement.style.cursor = this.puedeArrastrar ? 'grab' : 'default';
    }
  }

  private onTouchStart(event: TouchEvent) {
    event.preventDefault();
    
    if (event.touches.length === 2) {
      this.isPinching = true;
      this.isDragging = false;
      this.huboArrastre = true;
      this.distanciaInicialDedos = this.distanciaEntreDedos(event.touches);
      this.zoomInicialPinza = this.currentScale;
      
      const medio = this.puntoMedioDedos(event.touches);
      this.medioInicialX = medio.x;
      this.medioInicialY = medio.y;
      this.panStartX = this.panX;
      this.panStartY = this.panY;
      return;
    }
    
    if (event.touches.length === 1) {
      this.huboArrastre = false;
      if (this.puedeArrastrar) {
        this.isDragging = true;
        this.dragStartX = event.touches[0].clientX;
        this.dragStartY = event.touches[0].clientY;
        this.panStartX = this.panX;
        this.panStartY = this.panY;
      }
    }
  }

  private onTouchMove(event: TouchEvent) {
    if (this.isPinching && event.touches.length === 2) {
      event.preventDefault();
      this.moverPinza(event);
      return;
    }
    
    if (!this.isDragging || event.touches.length !== 1) return;
    
    event.preventDefault();
    const deltaX = event.touches[0].clientX - this.dragStartX;
    const deltaY = event.touches[0].clientY - this.dragStartY;
    
    if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
      this.huboArrastre = true;
    }
    
    this.panX = this.panStartX + deltaX;
    this.panY = this.panStartY + deltaY;
    this.applyTransform();
  }

  private onTouchEnd() {
    if (this.isPinching) {
      this.isPinching = false;
      this.centrarSiEstaSinZoom();
      this.applyTransform();
    }
    this.isDragging = false;
  }

  private moverPinza(event: TouchEvent) {
    if (!this.distanciaInicialDedos) return;
    
    const distancia = this.distanciaEntreDedos(event.touches);
    const nuevoZoom = this.limitarZoomPinza(
      this.zoomInicialPinza * (distancia / this.distanciaInicialDedos)
    );
    
    const medio = this.puntoMedioDedos(event.touches);
    const puntoX = (this.medioInicialX - this.panStartX) / this.zoomInicialPinza;
    const puntoY = (this.medioInicialY - this.panStartY) / this.zoomInicialPinza;
    
    this.panX = medio.x - puntoX * nuevoZoom;
    this.panY = medio.y - puntoY * nuevoZoom;
    this.currentScale = nuevoZoom;
    this.applyTransform();
    this.updateZoomButtonContent();
  }

  private distanciaEntreDedos(touches: TouchList): number {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private puntoMedioDedos(touches: TouchList): { x: number; y: number } {
    const rect = this.containerElement?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2 - rect.left - rect.width / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2 - rect.top - rect.height / 2,
    };
  }

  private limitarZoomPinza(valor: number): number {
    const minimo = Math.min(this.MIN_SCALE, this.zoomBase);
    const redondeado = Math.round(valor * 100) / 100;
    return Math.min(this.MAX_SCALE, Math.max(minimo, redondeado));
  }

  // ============================================
  // CONTROLES - VERSIÓN SIMPLIFICADA
  // ============================================
  
  private createControls() {
    if (this.isClosing) return;
    
    // Eliminar controles anteriores
    this.removeAllControls();
    
    this.updateCloseButtonVisibility();
    
    if (this.currentGalleryType === 'image') {
      this.createZoomToolbar();
    }
    
    if (this.currentItems.length > 1) {
      this.createNavigationButtons();
    }
  }

  private removeAllControls() {
    // Eliminar botones de navegación
    const prevBtn = document.getElementById('lity-custom-prev');
    const nextBtn = document.getElementById('lity-custom-next');
    const toolbar = document.getElementById('lity-custom-toolbar');
    
    if (prevBtn) prevBtn.remove();
    if (nextBtn) nextBtn.remove();
    if (toolbar) toolbar.remove();
    
    // Eliminar cualquier otro control
    document.querySelectorAll('.lity-custom-nav, .btn-zoom').forEach(el => el.remove());
  }

  private createZoomToolbar() {
    if (this.isClosing) return;
    
    const toolbar = document.createElement('div');
    toolbar.id = 'lity-custom-toolbar';
    toolbar.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      display: flex;
      align-items: center;
      gap: 8px;
      z-index: 10001;
      cursor: default;
    `;
    
    // Botón zoom out
    const zoomOutBtn = document.createElement('button');
    zoomOutBtn.className = 'btn-zoom';
    zoomOutBtn.innerHTML = '<i class="fa fa-search-minus"></i>';
    zoomOutBtn.title = 'Alejar (Zoom -)';
    zoomOutBtn.style.cssText = `
      width: 40px;
      height: 40px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      background-color: rgba(0,0,0,0.45);
      border: none;
      color: white;
      font-size: 1.1rem;
      cursor: pointer;
      transition: all 0.3s ease;
    `;
    zoomOutBtn.onclick = (e) => {
      e.stopPropagation();
      this.zoomConBoton(this.currentScale - this.ZOOM_STEP);
    };
    
    // Nivel de zoom
    const zoomLevel = document.createElement('span');
    zoomLevel.id = 'lity-zoom-level';
    zoomLevel.title = 'Nivel de zoom actual';
    zoomLevel.style.cssText = `
      min-width: 56px;
      text-align: center;
      color: #fff;
      font-size: 0.9rem;
      font-weight: 600;
      background-color: rgba(0,0,0,0.45);
      border-radius: 12px;
      padding: 4px 8px;
      user-select: none;
    `;
    zoomLevel.textContent = '100%';
    
    // Botón zoom in
    const zoomInBtn = document.createElement('button');
    zoomInBtn.className = 'btn-zoom';
    zoomInBtn.innerHTML = '<i class="fa fa-search-plus"></i>';
    zoomInBtn.title = 'Acercar (Zoom +)';
    zoomInBtn.style.cssText = `
      width: 40px;
      height: 40px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      background-color: rgba(0,0,0,0.45);
      border: none;
      color: white;
      font-size: 1.1rem;
      cursor: pointer;
      transition: all 0.3s ease;
    `;
    zoomInBtn.onclick = (e) => {
      e.stopPropagation();
      this.zoomConBoton(this.currentScale + this.ZOOM_STEP);
    };
    
    const separator1 = document.createElement('span');
    separator1.style.cssText = `width: 1px; height: 24px; background-color: rgba(255,255,255,0.25);`;
    
    // Botón rotar izquierda
    const rotateLeftBtn = document.createElement('button');
    rotateLeftBtn.className = 'btn-zoom';
    rotateLeftBtn.innerHTML = '<i class="fa fa-undo"></i>';
    rotateLeftBtn.title = 'Girar 90° a la izquierda';
    rotateLeftBtn.style.cssText = `
      width: 40px;
      height: 40px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      background-color: rgba(0,0,0,0.45);
      border: none;
      color: white;
      font-size: 1.1rem;
      cursor: pointer;
      transition: all 0.3s ease;
    `;
    rotateLeftBtn.onclick = (e) => {
      e.stopPropagation();
      this.rotar(-90);
    };
    
    // Botón rotar derecha
    const rotateRightBtn = document.createElement('button');
    rotateRightBtn.className = 'btn-zoom';
    rotateRightBtn.innerHTML = '<i class="fa fa-rotate-right"></i>';
    rotateRightBtn.title = 'Girar 90° a la derecha';
    rotateRightBtn.style.cssText = `
      width: 40px;
      height: 40px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      background-color: rgba(0,0,0,0.45);
      border: none;
      color: white;
      font-size: 1.1rem;
      cursor: pointer;
      transition: all 0.3s ease;
    `;
    rotateRightBtn.onclick = (e) => {
      e.stopPropagation();
      this.rotar(90);
    };
    
    const separator2 = document.createElement('span');
    separator2.style.cssText = `width: 1px; height: 24px; background-color: rgba(255,255,255,0.25);`;
    
    // Botón reiniciar
    const resetBtn = document.createElement('button');
    resetBtn.className = 'btn-zoom';
    resetBtn.innerHTML = '<i class="fa fa-refresh"></i>';
    resetBtn.title = 'Restablecer vista';
    resetBtn.style.cssText = `
      width: 40px;
      height: 40px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      background-color: rgba(0,0,0,0.45);
      border: none;
      color: white;
      font-size: 1.1rem;
      cursor: pointer;
      transition: all 0.3s ease;
    `;
    resetBtn.onclick = (e) => {
      e.stopPropagation();
      this.currentScale = 1;
      this.rotation = 0;
      this.panX = 0;
      this.panY = 0;
      this.zoomBase = 1;
      this.applyTransform();
      this.updateZoomButtonContent();
    };
    
    // Botón cerrar
    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn-zoom';
    closeBtn.innerHTML = '<i class="fa fa-times"></i>';
    closeBtn.title = 'Cerrar (Esc)';
    closeBtn.style.cssText = `
      width: 40px;
      height: 40px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      background-color: rgba(0,0,0,0.45);
      border: none;
      color: white;
      font-size: 1.1rem;
      cursor: pointer;
      transition: all 0.3s ease;
    `;
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      this.closeLightbox();
    };
    
    toolbar.appendChild(zoomOutBtn);
    toolbar.appendChild(zoomLevel);
    toolbar.appendChild(zoomInBtn);
    toolbar.appendChild(separator1);
    toolbar.appendChild(rotateLeftBtn);
    toolbar.appendChild(rotateRightBtn);
    toolbar.appendChild(separator2);
    toolbar.appendChild(resetBtn);
    toolbar.appendChild(closeBtn);
    
    document.body.appendChild(toolbar);
    this.zoomButton = toolbar;
    (toolbar as any).__zoomLevel = zoomLevel;
    this.updateZoomButtonContent();
  }

  private updateZoomButtonContent() {
    if (!this.zoomButton) return;
    const zoomLevel = (this.zoomButton as any).__zoomLevel;
    if (zoomLevel) {
      zoomLevel.textContent = `${this.zoomPorcentaje}%`;
    }
  }

  private createNavigationButtons() {
    if (this.isClosing) return;
    
    // Verificar si ya existen
    let prevBtn = document.getElementById('lity-custom-prev');
    let nextBtn = document.getElementById('lity-custom-next');
    
    if (prevBtn && nextBtn) {
      this.updateNavButtonsVisibility();
      return;
    }
    
    if (prevBtn) prevBtn.remove();
    if (nextBtn) nextBtn.remove();
    
    // Crear botón anterior
    prevBtn = document.createElement('button');
    prevBtn.id = 'lity-custom-prev';
    prevBtn.innerHTML = '‹';
    prevBtn.className = 'lity-custom-nav';
    prevBtn.title = 'Anterior (←)';
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
      box-shadow: 0 2px 10px rgba(0,0,0,0.3);
    `;
    prevBtn.onclick = (e) => {
      e.stopPropagation();
      this.navigateGallery(-1);
      return false;
    };
    
    // Crear botón siguiente
    nextBtn = document.createElement('button');
    nextBtn.id = 'lity-custom-next';
    nextBtn.innerHTML = '›';
    nextBtn.className = 'lity-custom-nav';
    nextBtn.title = 'Siguiente (→)';
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
      box-shadow: 0 2px 10px rgba(0,0,0,0.3);
    `;
    nextBtn.onclick = (e) => {
      e.stopPropagation();
      this.navigateGallery(1);
      return false;
    };
    
    // Hover effects
    prevBtn.addEventListener('mouseenter', () => {
      prevBtn.style.transform = 'translateY(-50%) scale(1.15)';
      prevBtn.style.background = 'rgba(255,255,255,0.2)';
    });
    prevBtn.addEventListener('mouseleave', () => {
      prevBtn.style.transform = 'translateY(-50%) scale(1)';
      prevBtn.style.background = 'rgba(0,0,0,0.6)';
    });
    
    nextBtn.addEventListener('mouseenter', () => {
      nextBtn.style.transform = 'translateY(-50%) scale(1.15)';
      nextBtn.style.background = 'rgba(255,255,255,0.2)';
    });
    nextBtn.addEventListener('mouseleave', () => {
      nextBtn.style.transform = 'translateY(-50%) scale(1)';
      nextBtn.style.background = 'rgba(0,0,0,0.6)';
    });
    
    document.body.appendChild(prevBtn);
    document.body.appendChild(nextBtn);
    
    this.updateNavButtonsVisibility();
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

  // ============================================
  // NAVEGACIÓN - VERSIÓN MEJORADA
  // ============================================
  
  private navigateGallery(direction: number) {
    if (this.isClosing || this.isNavigating) return;
    
    this.isNavigating = true;
    
    const newIndex = this.currentIndex + direction;
    
    if (newIndex < 0 || newIndex >= this.currentItems.length) {
      this.isNavigating = false;
      return;
    }
    
    this.currentIndex = newIndex;
    const newHref = this.currentItems[this.currentIndex];
    
    const isNewVideo = this.isVideoUrl(newHref);
    this.currentGalleryType = isNewVideo ? 'video' : 'image';
    this.currentScale = 1;
    this.rotation = 0;
    this.panX = 0;
    this.panY = 0;
    this.zoomBase = 1;
    this.isZoomed = false;
    
    // Limpiar controles anteriores (pero NO el handler de X)
    this.removeAllControls();
    
    // Limpiar eventos de la imagen
    if (this.imageElement) {
      const handlers = (this.imageElement as any);
      if (handlers.__wheelHandler) {
        this.imageElement.removeEventListener('wheel', handlers.__wheelHandler);
      }
      if (handlers.__mouseDownHandler) {
        this.imageElement.removeEventListener('mousedown', handlers.__mouseDownHandler);
      }
      if (handlers.__mouseMoveHandler) {
        this.imageElement.removeEventListener('mousemove', handlers.__mouseMoveHandler);
      }
      if (handlers.__mouseUpHandler) {
        this.imageElement.removeEventListener('mouseup', handlers.__mouseUpHandler);
      }
      if (handlers.__mouseLeaveHandler) {
        this.imageElement.removeEventListener('mouseleave', handlers.__mouseLeaveHandler);
      }
      if (handlers.__touchStartHandler) {
        this.imageElement.removeEventListener('touchstart', handlers.__touchStartHandler);
      }
      if (handlers.__touchMoveHandler) {
        this.imageElement.removeEventListener('touchmove', handlers.__touchMoveHandler);
      }
      if (handlers.__touchEndHandler) {
        this.imageElement.removeEventListener('touchend', handlers.__touchEndHandler);
      }
      if (handlers.__touchCancelHandler) {
        this.imageElement.removeEventListener('touchcancel', handlers.__touchCancelHandler);
      }
      
      delete (this.imageElement as any).__wheelHandler;
      delete (this.imageElement as any).__mouseDownHandler;
      delete (this.imageElement as any).__mouseMoveHandler;
      delete (this.imageElement as any).__mouseUpHandler;
      delete (this.imageElement as any).__mouseLeaveHandler;
      delete (this.imageElement as any).__touchStartHandler;
      delete (this.imageElement as any).__touchMoveHandler;
      delete (this.imageElement as any).__touchEndHandler;
      delete (this.imageElement as any).__touchCancelHandler;
    }
    
    this.imageElement = null;
    this.containerElement = null;
    this.zoomButton = null;
    this.isDragging = false;
    this.isPinching = false;
    
    const lity = (window as any).lity;
    if (lity && newHref && this.lityInstance) {
      const currentInstance = this.lityInstance;
      this.lityInstance = null;
      
      try {
        if (currentInstance && currentInstance.close) {
          currentInstance.close();
        }
        
        // Crear nueva instancia
        this.lityInstance = lity(newHref);
        
        setTimeout(() => {
          if (this.lityInstance && !this.isClosing) {
            this.updateCloseButtonVisibility();
            this.createControls();
            this.setupStageAndImage();
            this.captureCloseButtonClick();
          }
          this.isNavigating = false;
        }, 300);
      } catch (error) {
        console.error('Error navegando:', error);
        this.lityInstance = null;
        this.isNavigating = false;
      }
    } else {
      this.isNavigating = false;
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
    console.log('Intentando capturar clic en X');
    setTimeout(() => {
      const closeButton = document.querySelector('.lity-close') as HTMLElement;
      if (closeButton) {
        closeButton.title = 'Cerrar (Esc)';
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
    console.log('Destruyendo controles y limpiando eventos');
    this.removeAllControls();
    
    // Limpiar eventos de la imagen
    if (this.imageElement) {
      const handlers = (this.imageElement as any);
      if (handlers.__wheelHandler) {
        this.imageElement.removeEventListener('wheel', handlers.__wheelHandler);
      }
      if (handlers.__mouseDownHandler) {
        this.imageElement.removeEventListener('mousedown', handlers.__mouseDownHandler);
      }
      if (handlers.__mouseMoveHandler) {
        this.imageElement.removeEventListener('mousemove', handlers.__mouseMoveHandler);
      }
      if (handlers.__mouseUpHandler) {
        this.imageElement.removeEventListener('mouseup', handlers.__mouseUpHandler);
      }
      if (handlers.__mouseLeaveHandler) {
        this.imageElement.removeEventListener('mouseleave', handlers.__mouseLeaveHandler);
      }
      if (handlers.__touchStartHandler) {
        this.imageElement.removeEventListener('touchstart', handlers.__touchStartHandler);
      }
      if (handlers.__touchMoveHandler) {
        this.imageElement.removeEventListener('touchmove', handlers.__touchMoveHandler);
      }
      if (handlers.__touchEndHandler) {
        this.imageElement.removeEventListener('touchend', handlers.__touchEndHandler);
      }
      if (handlers.__touchCancelHandler) {
        this.imageElement.removeEventListener('touchcancel', handlers.__touchCancelHandler);
      }
      
      delete (this.imageElement as any).__wheelHandler;
      delete (this.imageElement as any).__mouseDownHandler;
      delete (this.imageElement as any).__mouseMoveHandler;
      delete (this.imageElement as any).__mouseUpHandler;
      delete (this.imageElement as any).__mouseLeaveHandler;
      delete (this.imageElement as any).__touchStartHandler;
      delete (this.imageElement as any).__touchMoveHandler;
      delete (this.imageElement as any).__touchEndHandler;
      delete (this.imageElement as any).__touchCancelHandler;
    }
    
    this.imageElement = null;
    this.containerElement = null;
    this.zoomButton = null;
    this.isDragging = false;
    this.isPinching = false;
  }

  private closeLightbox = () => {
    if (this.isClosing) return;
    
    this.isClosing = true;
    console.log('Cerrando lightbox...');
    
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
    this.rotation = 0;
    this.panX = 0;
    this.panY = 0;
    this.zoomBase = 1;
    this.isZoomed = false;
    this.currentGalleryType = 'image';
    this.isNavigating = false;
    
    setTimeout(() => {
      this.isClosing = false;
    }, 500);
  }

  ngOnDestroy() {
    this.isClosing = true;
    this.closeLightbox();
    
    const elements = document.querySelectorAll('[data-lity]');
    elements.forEach((element) => {
      element.removeEventListener('click', this.handleLityClick);
    });
    
    this.appSettings.appContentClass = '';
    this.initialized = false;
  }

  // ============================================
  // MÉTODO PARA CONTROLAR EL BOTÓN X
  // ============================================
  private updateCloseButtonVisibility() {
    setTimeout(() => {
      if (this.isClosing) return;
      
      const closeButton = document.querySelector('.lity-close') as HTMLElement;
      if (!closeButton) {
        setTimeout(() => this.updateCloseButtonVisibility(), 100);
        return;
      }
      
      if (this.currentGalleryType === 'image') {
        closeButton.classList.add('lity-close-hidden');
      } else {
        closeButton.classList.remove('lity-close-hidden');
      }
    }, 50);
  }
}
